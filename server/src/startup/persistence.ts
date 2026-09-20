import {
  initializeChatEmoteSettingsStore,
  initializeFeatureFlagsStore,
  initializeWhitelistStore,
} from "../db/index.js";
import { canvasStore } from "../state/canvasStore.js";
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
