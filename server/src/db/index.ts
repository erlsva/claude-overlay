import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { mkdirSync } from "fs";
import path from "path";
import type {
  ChatEmoteSettings,
  ElementPreset,
  FeatureFlags,
  OverlayTrigger,
  SavedScene,
  SoundboardItem,
} from "../types.js";
import { DEFAULT_GAP_SECONDS, MAX_GAP_SECONDS } from "../tts/queue.js";
import { postgres } from "./postgres.js";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

interface WhitelistEntry {
  username: string;
  added_by: string;
  added_at: string;
  isAdmin: boolean;
}

/** Whether TTS is paused, and the least silence between clips. Saved so a restart keeps them. */
export interface TtsQueueSettings {
  held: boolean;
  gapSeconds: number;
  /** Whether the overlay shows the TTS icon. On unless it was switched off. */
  showEmote: boolean;
  /** Whether the overlay shows the now-playing card. On unless it was switched off. */
  showPrompt: boolean;
}

interface DbSchema {
  whitelist: WhitelistEntry[];
  scenes: SavedScene[];
  presets: ElementPreset[];
  sounds: SoundboardItem[];
  triggers: OverlayTrigger[];
  chatEmoteSettings?: ChatEmoteSettings;
  featureFlags?: FeatureFlags;
  ttsQueue?: TtsQueueSettings;
}

const adapter = new JSONFile<DbSchema>(path.join(DATA_DIR, "db.json"));
const db = new Low<DbSchema>(adapter, {
  whitelist: [],
  scenes: [],
  presets: [],
  sounds: [],
  triggers: [],
});
await db.read();
db.data.whitelist ??= [];
db.data.scenes ??= [];
db.data.presets ??= [];
db.data.sounds ??= [];
db.data.triggers ??= [];

let whitelistCache: WhitelistEntry[] = [...db.data.whitelist];
const DEFAULT_FEATURE_FLAGS: FeatureFlags = { tts: true, scenes: false, publicClips: false };
let featureFlagsCache: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS, ...db.data.featureFlags };

interface StudioData {
  scenes: SavedScene[];
  presets: ElementPreset[];
  sounds: SoundboardItem[];
  triggers: OverlayTrigger[];
}

let studioDataCache: StudioData = {
  scenes: db.data.scenes,
  presets: db.data.presets,
  sounds: db.data.sounds,
  triggers: db.data.triggers,
};

async function ensureAppSettingsTable(): Promise<void> {
  if (!postgres) return;
  await postgres.query(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

export async function initializeWhitelistStore(): Promise<void> {
  if (!postgres) return;
  await postgres.query(`CREATE TABLE IF NOT EXISTS dashboard_whitelist (
    username TEXT PRIMARY KEY,
    added_by TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE
  )`);
  for (const entry of db.data.whitelist) {
    await postgres.query(
      `INSERT INTO dashboard_whitelist (username, added_by, added_at, is_admin)
      VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING`,
      [entry.username.toLowerCase(), entry.added_by, entry.added_at, entry.isAdmin],
    );
  }
  const result = await postgres.query(
    "SELECT username, added_by, added_at, is_admin FROM dashboard_whitelist ORDER BY added_at",
  );
  whitelistCache = result.rows.map((row) => ({
    username: row.username,
    added_by: row.added_by,
    added_at: new Date(row.added_at).toISOString(),
    isAdmin: row.is_admin,
  }));
  console.log(`Loaded ${whitelistCache.length} dashboard whitelist entries from Postgres`);
}

export function getWhitelist(): WhitelistEntry[] {
  return whitelistCache;
}

export function isWhitelisted(username: string): boolean {
  return whitelistCache.some((e) => e.username.toLowerCase() === username.toLowerCase());
}

export function getWhitelistEntry(username: string): WhitelistEntry | undefined {
  return whitelistCache.find((e) => e.username.toLowerCase() === username.toLowerCase());
}

export async function addToWhitelist(username: string, addedBy: string): Promise<void> {
  if (isWhitelisted(username)) return;
  const entry = {
    username: username.toLowerCase(),
    added_by: addedBy,
    added_at: new Date().toISOString(),
    isAdmin: false,
  };
  if (postgres)
    await postgres.query(
      "INSERT INTO dashboard_whitelist (username, added_by, added_at, is_admin) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING",
      [entry.username, entry.added_by, entry.added_at, false],
    );
  whitelistCache.push(entry);
  if (!postgres) {
    db.data.whitelist = whitelistCache;
    await db.write();
  }
}

export async function setAdmin(username: string, isAdmin: boolean): Promise<void> {
  const entry = whitelistCache.find((e) => e.username.toLowerCase() === username.toLowerCase());
  if (entry) {
    if (postgres)
      await postgres.query("UPDATE dashboard_whitelist SET is_admin=$2 WHERE username=$1", [
        entry.username,
        isAdmin,
      ]);
    entry.isAdmin = isAdmin;
    if (!postgres) {
      db.data.whitelist = whitelistCache;
      await db.write();
    }
  }
}

export async function removeFromWhitelist(username: string): Promise<void> {
  if (postgres)
    await postgres.query("DELETE FROM dashboard_whitelist WHERE username=$1", [
      username.toLowerCase(),
    ]);
  whitelistCache = whitelistCache.filter(
    (e) => e.username.toLowerCase() !== username.toLowerCase(),
  );
  if (!postgres) {
    db.data.whitelist = whitelistCache;
    await db.write();
  }
}

export function getStudioData(): StudioData {
  return studioDataCache;
}

/**
 * Loads scenes, presets, the soundboard and automations from Postgres when configured, same
 * pattern as feature flags and TTS queue settings. Without Postgres (or if it's unreachable at
 * startup), whatever the committed/local lowdb file already has (read at module load) is kept as
 * the starting point, same as before this existed.
 */
export async function initializeStudioDataStore(): Promise<StudioData> {
  if (!postgres) return studioDataCache;
  try {
    const stored = (await loadStoredSetting("studio_data", "Studio data")) as
      Partial<StudioData> | undefined;
    const list = <T>(value: T[] | undefined) => (Array.isArray(value) ? value : []);
    if (stored) {
      studioDataCache = {
        scenes: list(stored.scenes),
        presets: list(stored.presets),
        sounds: list(stored.sounds),
        triggers: list(stored.triggers),
      };
    } else {
      // First run with Postgres configured: seed it from whatever the lowdb file already has
      // (the committed baseline, or anything saved locally), so nothing is silently lost.
      await postgres.query(
        "INSERT INTO app_settings (key, value) VALUES ('studio_data', $1::jsonb) ON CONFLICT (key) DO NOTHING",
        [JSON.stringify(studioDataCache)],
      );
    }
  } catch (error) {
    console.error(
      "Studio data (scenes, presets, soundboard, automations) unavailable at startup",
      error,
    );
  }
  return studioDataCache;
}

export function getChatEmoteSettings(): ChatEmoteSettings | undefined {
  return db.data.chatEmoteSettings;
}

export async function initializeChatEmoteSettingsStore(): Promise<ChatEmoteSettings | undefined> {
  if (!postgres) return db.data.chatEmoteSettings;
  await ensureAppSettingsTable();
  const result = await postgres.query("SELECT value FROM app_settings WHERE key = 'chat_emotes'");
  if (result.rows[0]?.value) return result.rows[0].value as ChatEmoteSettings;
  if (db.data.chatEmoteSettings) {
    await postgres.query(
      "INSERT INTO app_settings (key, value) VALUES ('chat_emotes', $1::jsonb) ON CONFLICT (key) DO NOTHING",
      [JSON.stringify(db.data.chatEmoteSettings)],
    );
  }
  return db.data.chatEmoteSettings;
}

/**
 * Neon (Postgres) and Render both suspend after idling, so the first query after a
 * spin-down can fail while the database wakes back up. Retry a few times before
 * giving up, instead of treating one slow query as "nothing was ever saved".
 */
async function loadStoredSetting(key: string, label: string): Promise<unknown> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await ensureAppSettingsTable();
      const result = await postgres!.query("SELECT value FROM app_settings WHERE key = $1", [key]);
      return result.rows[0]?.value;
    } catch (error) {
      console.error(`Could not load ${label} (attempt ${attempt}/${attempts})`, error);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      else throw error;
    }
  }
  throw new Error("unreachable");
}

async function loadStoredFeatureFlags(): Promise<Partial<FeatureFlags> | undefined> {
  return (await loadStoredSetting("feature_flags", "feature flags")) as
    Partial<FeatureFlags> | undefined;
}

export async function initializeFeatureFlagsStore(): Promise<FeatureFlags> {
  if (!postgres) return featureFlagsCache;
  let stored: Partial<FeatureFlags> | undefined;
  try {
    stored = await loadStoredFeatureFlags();
  } catch (error) {
    // Could not confirm what was saved. Never guess TTS is on: a streamer who
    // turned it off does not want it switching back on just because the database
    // was still waking up. Other flags keep their normal (on-by-default) fallback.
    console.error("Feature flags unavailable at startup, forcing TTS off until confirmed", error);
    featureFlagsCache = { ...DEFAULT_FEATURE_FLAGS, tts: false };
    return featureFlagsCache;
  }
  featureFlagsCache = {
    ...DEFAULT_FEATURE_FLAGS,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
  if (!stored && db.data.featureFlags) {
    await postgres.query(
      "INSERT INTO app_settings (key, value) VALUES ('feature_flags', $1::jsonb) ON CONFLICT (key) DO NOTHING",
      [JSON.stringify(featureFlagsCache)],
    );
  }
  return featureFlagsCache;
}

/** Whatever was stored, made safe: anything odd falls back to running with the normal gap. */
export function cleanTtsQueueSettings(value: unknown): TtsQueueSettings {
  const stored = value && typeof value === "object" ? (value as Partial<TtsQueueSettings>) : {};
  const gap = Number(stored.gapSeconds);
  return {
    held: stored.held === true,
    gapSeconds:
      Number.isFinite(gap) && gap >= 0 && gap <= MAX_GAP_SECONDS ? gap : DEFAULT_GAP_SECONDS,
    showEmote: stored.showEmote !== false,
    showPrompt: stored.showPrompt !== false,
  };
}

/**
 * Loads whether TTS was paused. If that cannot be confirmed (the database is still waking up), TTS
 * starts paused: a streamer who paused it does not want it playing again just because a restart
 * could not read the setting. Resuming is one click.
 */
export async function initializeTtsQueueSettings(): Promise<TtsQueueSettings> {
  if (!postgres) return cleanTtsQueueSettings(db.data.ttsQueue);
  try {
    return cleanTtsQueueSettings(await loadStoredSetting("tts_queue", "TTS queue settings"));
  } catch (error) {
    console.error("TTS queue settings unavailable at startup, keeping TTS paused", error);
    return { held: true, gapSeconds: DEFAULT_GAP_SECONDS, showEmote: true, showPrompt: true };
  }
}

export async function saveTtsQueueSettings(settings: TtsQueueSettings): Promise<void> {
  const clean = cleanTtsQueueSettings(settings);
  if (postgres) {
    await ensureAppSettingsTable();
    await postgres.query(
      `INSERT INTO app_settings (key, value, updated_at)
      VALUES ('tts_queue', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(clean)],
    );
    return;
  }
  db.data.ttsQueue = clean;
  await db.write();
}

export function getFeatureFlags(): FeatureFlags {
  return { ...featureFlagsCache };
}

export async function saveFeatureFlags(flags: FeatureFlags): Promise<void> {
  featureFlagsCache = { ...DEFAULT_FEATURE_FLAGS, ...flags };
  if (postgres) {
    await ensureAppSettingsTable();
    await postgres.query(
      `INSERT INTO app_settings (key, value, updated_at)
      VALUES ('feature_flags', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(featureFlagsCache)],
    );
    return;
  }
  db.data.featureFlags = featureFlagsCache;
  await db.write();
}

export async function saveChatEmoteSettings(settings: ChatEmoteSettings): Promise<void> {
  if (postgres) {
    await postgres.query(
      `INSERT INTO app_settings (key, value, updated_at)
      VALUES ('chat_emotes', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(settings)],
    );
    return;
  }
  db.data.chatEmoteSettings = settings;
  await db.write();
}

export async function saveStudioData(data: Partial<StudioData>): Promise<void> {
  studioDataCache = {
    scenes: data.scenes ?? studioDataCache.scenes,
    presets: data.presets ?? studioDataCache.presets,
    sounds: data.sounds ?? studioDataCache.sounds,
    triggers: data.triggers ?? studioDataCache.triggers,
  };
  if (postgres) {
    await ensureAppSettingsTable();
    await postgres.query(
      `INSERT INTO app_settings (key, value, updated_at)
      VALUES ('studio_data', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(studioDataCache)],
    );
    return;
  }
  db.data.scenes = studioDataCache.scenes;
  db.data.presets = studioDataCache.presets;
  db.data.sounds = studioDataCache.sounds;
  db.data.triggers = studioDataCache.triggers;
  await db.write();
}
