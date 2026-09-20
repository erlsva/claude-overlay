import { saveChatEmoteSettings } from "../db/index.js";
import { getTwitchChatChannel, setTwitchChatChannel } from "../twitch/eventsub.js";
import type { HandlerContext } from "./types.js";
import { validChatEmoteSettings, validDvdSettings } from "./validateSettings.js";

/** Settings changes are saved this long after the last one, so dragging a slider saves once. */
const SAVE_DEBOUNCE_MS = 300;
let chatEmoteSettingsSaveTimer: NodeJS.Timeout | undefined;

/** Overlay settings (DVD corner counter, chat emotes), the Twitch chat channel, and overlay controls. */
export function registerSettings(ctx: HandlerContext) {
  const { io, socket, store, log, activeOverlays } = ctx;

  socket.on("overlay:refresh", () => io.emit("overlay:refresh"));

  socket.on("overlay:test-audio", ({ testId }) => {
    if (typeof testId !== "string" || testId.length > 64) return;
    if (!activeOverlays.size) {
      socket.emit("overlay:test-result", { testId, ok: false, error: "No overlay is connected." });
      return;
    }
    io.to("overlay").emit("overlay:test-audio", { testId });
  });

  socket.on("dvd:settings", (settings) => {
    if (!validDvdSettings(settings)) return;
    store.dvdCelebrationSettings = {
      volume: settings.volume,
      soundUrl: settings.soundUrl,
      counterPosition: settings.counterPosition,
    };
    io.emit("dvd:settings", store.dvdCelebrationSettings);
  });

  socket.on("chat-emote:settings", (settings) => {
    if (!validChatEmoteSettings(settings)) return;
    store.chatEmoteSettings = {
      ...settings,
      blockedEmotes: settings.blockedEmotes ?? store.chatEmoteSettings.blockedEmotes,
    };
    io.emit("chat-emote:settings", store.chatEmoteSettings);
    if (chatEmoteSettingsSaveTimer) clearTimeout(chatEmoteSettingsSaveTimer);
    chatEmoteSettingsSaveTimer = setTimeout(() => {
      void saveChatEmoteSettings(store.chatEmoteSettings);
    }, SAVE_DEBOUNCE_MS);
  });

  socket.on("chat:channel:set", async ({ channel }) => {
    if (typeof channel !== "string" || channel.length > 50) return;
    const previous = getTwitchChatChannel();
    if (!(await setTwitchChatChannel(channel))) return;
    const current = getTwitchChatChannel();
    io.to("dashboard").emit("chat:channel", { channel: current });
    if (current !== previous) log(`switched Twitch chat to ${current}`);
  });
}
