/** Chat emotes that fall onto the overlay when a viewer uses them in chat. */

import { randomUUID } from "crypto";
import { io } from "../runtime.js";
import { resolveSevenTvEmotes, stackEmotes } from "../seventv/emotes.js";
import { canvasStore } from "../state/canvasStore.js";
import type { TriggerEventPayload } from "../triggers/message.js";

/** Until when each chatter is blocked from spawning another emote, so one person cannot flood the screen. */
const senderCooldowns = new Map<string, number>();

type ResolvedEmote = Awaited<ReturnType<typeof resolveSevenTvEmotes>>[number];
type Stacks = ReturnType<typeof stackEmotes<ResolvedEmote>>;
/** An emote Twitch itself found in the message, with where it starts. */
type NativeEmote = { id: string; name: string; imageUrl: string; position: number };

const lowerCase = (names: string[]) => new Set(names.map((name) => name.toLowerCase()));

/** Native (Twitch) and 7TV emotes of one message, in the order they were written. */
function orderedEmotes(nativeEmotes: NativeEmote[], sevenTv: ResolvedEmote[]): ResolvedEmote[] {
  const nativePositions = new Set(nativeEmotes.map((item) => item.position));
  return [
    ...nativeEmotes.map((item) => ({ ...item, isZeroWidth: false })),
    ...sevenTv.filter((item) => !nativePositions.has(item.position ?? -1)),
  ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/**
 * Removes emotes the streamer blocked. This runs after stacking so modifiers of a blocked base
 * cannot migrate onto a different emote in the message.
 */
function removeBlocked({ stacks, leadingOverlays }: Stacks, blockedNames: string[]) {
  const blocked = lowerCase(blockedNames);
  for (let index = stacks.length - 1; index >= 0; index--) {
    if (blocked.has(stacks[index].base.name.toLowerCase())) stacks.splice(index, 1);
    else
      stacks[index].overlays = stacks[index].overlays.filter(
        (item) => !blocked.has(item.name.toLowerCase()),
      );
  }
  for (let index = leadingOverlays.length - 1; index >= 0; index--) {
    if (blocked.has(leadingOverlays[index].name.toLowerCase())) leadingOverlays.splice(index, 1);
  }
}

const overlayPayload = (item: { id: string; name: string; imageUrl: string }) => ({
  emoteId: item.id,
  name: item.name,
  imageUrl: item.imageUrl,
});

/** Spawns the first emote of a message, plus later ones the streamer allow-listed. */
function spawn(
  event: TriggerEventPayload,
  { stacks, leadingOverlays }: Stacks,
  senderLogin: string,
) {
  const { chatEmoteSettings } = canvasStore;
  const emote = stacks[0]?.base ?? leadingOverlays[0];
  if (!emote) return false;
  const firstOverlays = stacks[0]?.overlays ?? leadingOverlays;
  const allowlist = lowerCase(chatEmoteSettings.additionalEmotes);
  const additional = stacks
    .filter((_stack, index) => index > 0)
    .filter((stack) => allowlist.has(stack.base.name.toLowerCase()))
    .map((stack) => ({
      id: randomUUID(),
      emoteId: stack.base.id,
      name: stack.base.name,
      imageUrl: stack.base.imageUrl,
      overlays: stack.overlays.map(overlayPayload),
    }));
  return () => {
    io.to("overlay").emit("chat-emote:spawn", {
      id: randomUUID(),
      emoteId: emote.id,
      name: emote.name,
      imageUrl: emote.imageUrl,
      overlays: firstOverlays.filter((item) => item.id !== emote.id).map(overlayPayload),
      additional,
      sender: event.chatter_user_name || event.chatter_user_login || "Viewer",
      senderLogin,
      senderColor: event.chatter_color,
    });
  };
}

/** Handles a chat message: shows its emotes on the overlay, if enabled and the sender is allowed. */
export function spawnChatEmotes(event: TriggerEventPayload) {
  const settings = canvasStore.chatEmoteSettings;
  const senderLogin = (event.chatter_user_login ?? "").toLowerCase();
  const senderKey = senderLogin || event.chatter_user_id || "unknown";
  const canSpawn = () => {
    const blockedUntil = senderCooldowns.get(senderKey) ?? 0;
    if (blockedUntil > Date.now()) return false;
    senderCooldowns.delete(senderKey);
    return true;
  };
  const markSpawned = () => {
    const lifetimeMs = canvasStore.chatEmoteSettings.lifetimeSeconds * 1000;
    const blockedUntil = Date.now() + lifetimeMs;
    senderCooldowns.set(senderKey, blockedUntil);
    setTimeout(() => {
      if (senderCooldowns.get(senderKey) === blockedUntil) senderCooldowns.delete(senderKey);
    }, lifetimeMs);
  };

  if (!settings.enabled || settings.blacklist.includes(senderLogin) || !canSpawn()) return;
  const nativeEmotes: NativeEmote[] = event.native_emotes ?? [];
  if (!nativeEmotes.length && !event.room_id) return;
  const sevenTv = event.room_id
    ? resolveSevenTvEmotes(event.room_id, event.message.text)
    : Promise.resolve([]);
  void sevenTv.then((emotes) => {
    const stacks = stackEmotes(orderedEmotes(nativeEmotes, emotes));
    removeBlocked(stacks, canvasStore.chatEmoteSettings.blockedEmotes);
    const emit = spawn(event, stacks, senderLogin);
    if (emit && canSpawn()) {
      markSpawned();
      emit();
    }
  });
}
