/**
 * Applying and broadcasting chat emote overlay settings, from wherever a change comes from: the
 * dashboard's Emotes tab sends a full, already-validated settings object over a socket; a remote
 * control (Stream Deck) action changes one field at a time, always valid by construction since it
 * starts from the current (already valid) settings. Both end up here, so a change is saved and told
 * to every dashboard and overlay the same way regardless of where it came from. `io` is taken as a
 * parameter, not imported, so the socket handler's tests can keep injecting their own.
 */

import { saveChatEmoteSettings } from "../db/index.js";
import { validChatEmoteSettings } from "../socket/validateSettings.js";
import type { AppServer } from "../socket/types.js";
import { canvasStore } from "../state/canvasStore.js";
import { CHAT_EMOTE_MOTIONS, type ChatEmoteSettings } from "../types.js";

/** Settings changes are saved this long after the last one, so dragging a slider saves once. */
const SAVE_DEBOUNCE_MS = 300;
let saveTimer: NodeJS.Timeout | undefined;

/** Updates the shared store, tells every dashboard and overlay, and saves it (debounced). */
function apply(io: AppServer, next: ChatEmoteSettings) {
  canvasStore.chatEmoteSettings = next;
  io.emit("chat-emote:settings", next);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveChatEmoteSettings(next), SAVE_DEBOUNCE_MS);
}

/** Validates and applies a full settings object (what the dashboard's Emotes tab sends). False if invalid. */
export function setChatEmoteSettings(io: AppServer, settings: ChatEmoteSettings): boolean {
  if (!validChatEmoteSettings(settings)) return false;
  apply(io, {
    ...settings,
    blockedEmotes: settings.blockedEmotes ?? canvasStore.chatEmoteSettings.blockedEmotes,
  });
  return true;
}

/** What a remote-control response shows: the fields a button might actually control or key an icon off. */
export function chatEmoteRemoteState() {
  const { enabled, direction, size, motion } = canvasStore.chatEmoteSettings;
  return { enabled, direction, size, motion };
}

/** Turns the whole chat emote overlay on or off. Leave `next` out to flip it. */
export function setChatEmoteEnabled(io: AppServer, next?: boolean): boolean {
  const current = canvasStore.chatEmoteSettings;
  const enabled = next ?? !current.enabled;
  if (current.enabled === enabled) return false;
  apply(io, { ...current, enabled });
  return true;
}

/** Flips which side emotes fall in from. */
export function toggleChatEmoteDirection(io: AppServer): boolean {
  const current = canvasStore.chatEmoteSettings;
  apply(io, { ...current, direction: current.direction === "left" ? "right" : "left" });
  return true;
}

const SIZE_STEP = 5;
/** Steps the emote size within its 24-100 range. False once it is already at that end. */
export function stepChatEmoteSize(io: AppServer, delta: number): boolean {
  const current = canvasStore.chatEmoteSettings;
  const size = Math.min(100, Math.max(24, current.size + delta));
  if (size === current.size) return false;
  apply(io, { ...current, size });
  return true;
}
export const CHAT_EMOTE_SIZE_STEP = SIZE_STEP;

/** Cycles to the next (1) or previous (-1) motion style, wrapping around. */
export function stepChatEmoteMotion(io: AppServer, delta: 1 | -1): boolean {
  const current = canvasStore.chatEmoteSettings;
  const index = CHAT_EMOTE_MOTIONS.indexOf(current.motion);
  const motion =
    CHAT_EMOTE_MOTIONS[(index + delta + CHAT_EMOTE_MOTIONS.length) % CHAT_EMOTE_MOTIONS.length];
  apply(io, { ...current, motion });
  return true;
}
