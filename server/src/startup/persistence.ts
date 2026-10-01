import {
  initializeChatEmoteSettingsStore,
  initializeFeatureFlagsStore,
  initializeStudioDataStore,
  initializeTtsQueueSettings,
  initializeWhitelistStore,
} from "../db/index.js";
import { canvasStore } from "../state/canvasStore.js";
import { setTtsShowEmote, setTtsShowPrompt, ttsQueue } from "../tts/service.js";
import { initializeEventAuthStore } from "../twitch/eventAuthStore.js";

const inProduction = () => process.env.NODE_ENV === "production";

/**
 * Opens the databases and loads what was saved. In production a whitelist or feature-flag store
 * that cannot open stops the server; anywhere else it carries on with defaults.
 */
export async function initializePersistence() {
  await initializeEventAuthStore().catch((error) =>
    console.error("Event database initialization failed", error),
  );
  await initializeWhitelistStore().catch((error) => {
    console.error("Whitelist database initialization failed", error);
    if (inProduction()) throw error;
  });
  await initializeFeatureFlagsStore().catch((error) => {
    console.error("Could not initialize feature flags", error);
    if (inProduction()) throw error;
  });
  // Whether TTS was paused survives a restart. It fails closed: if it cannot be read, TTS is paused.
  const queueSettings = await initializeTtsQueueSettings();
  ttsQueue.setHeld(queueSettings.held);
  ttsQueue.setGapSeconds(queueSettings.gapSeconds);
  setTtsShowEmote(queueSettings.showEmote);
  setTtsShowPrompt(queueSettings.showPrompt);
  // Scenes, presets, the soundboard and automations, loaded the same way; falls back to whatever
  // the committed/local lowdb file already had if Postgres is unreachable at startup.
  const studioData = await initializeStudioDataStore();
  canvasStore.scenes = studioData.scenes;
  canvasStore.presets = studioData.presets;
  canvasStore.sounds = studioData.sounds;
  canvasStore.triggers = studioData.triggers;
  const stored = await initializeChatEmoteSettingsStore().catch((error) => {
    console.error("Could not initialize persistent chat-emote settings", error);
    return undefined;
  });
  if (!stored) return;
  const list = <T>(value: T[] | undefined) => (Array.isArray(value) ? value : []);
  canvasStore.chatEmoteSettings = {
    ...canvasStore.chatEmoteSettings,
    ...stored,
    blacklist: list(stored.blacklist),
    additionalEmotes: list(stored.additionalEmotes),
    blockedEmotes: list(stored.blockedEmotes),
  };
}
