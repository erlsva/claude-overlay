import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { postgres } from "../db/postgres.js";

export type TtsClip = {
  id: string;
  token: string;
  prompt: string;
  sender: string;
  createdAt: string;
  duration: number;
  discordMessageId: string;
};

const file = path.join(process.env.DATA_DIR || "data", "tts-clips.json");
let ready: Promise<void> | undefined;

async function init() {
  if (!ready) {
    ready = (async () => {
      if (postgres) {
        await postgres.query(`CREATE TABLE IF NOT EXISTS tts_clips (
          id TEXT PRIMARY KEY,
          metadata JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      } else {
        if (process.env.NODE_ENV === "production") {
          throw new Error("TTS requires DATABASE_URL in production.");
        }
        await mkdir(path.dirname(file), { recursive: true });
      }
    })();
  }
  await ready;
}

async function local(): Promise<TtsClip[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as TtsClip[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocal(clips: TtsClip[]) {
  await writeFile(`${file}.tmp`, JSON.stringify(clips, null, 2));
  await rename(`${file}.tmp`, file);
}

export async function saveClip(clip: TtsClip) {
  await init();
  if (postgres) {
    await postgres.query("INSERT INTO tts_clips(id, metadata) VALUES($1, $2)", [clip.id, clip]);
    return;
  }
  const clips = await local();
  clips.unshift(clip);
  await writeLocal(clips);
}

export async function getClip(id: string): Promise<TtsClip | undefined> {
  await init();
  if (postgres) {
    return (await postgres.query("SELECT metadata FROM tts_clips WHERE id=$1", [id])).rows[0]?.metadata;
  }
  return (await local()).find((clip) => clip.id === id);
}

export async function listClips(): Promise<TtsClip[]> {
  await init();
  if (postgres) {
    return (await postgres.query("SELECT metadata FROM tts_clips ORDER BY created_at DESC LIMIT 100")).rows.map(
      (row) => row.metadata as TtsClip,
    );
  }
  return (await local()).slice(0, 100);
}

export async function deleteClip(id: string): Promise<TtsClip | undefined> {
  await init();
  if (postgres) {
    const result = await postgres.query("DELETE FROM tts_clips WHERE id=$1 RETURNING metadata", [id]);
    return result.rows[0]?.metadata;
  }
  const clips = await local();
  const clip = clips.find((item) => item.id === id);
  if (!clip) return undefined;
  await writeLocal(clips.filter((item) => item.id !== id));
  return clip;
}

export function ttsMetadataStorageConfigured() {
  return !!postgres || process.env.NODE_ENV !== "production";
}
