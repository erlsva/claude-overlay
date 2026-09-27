/**
 * Named bearer tokens for controlling TTS from outside the dashboard (a Stream Deck button, or
 * anything else that can send an HTTP request). Each token is shown once, when it is created;
 * only its hash is kept, so a leaked database cannot be turned back into a working token.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { postgres } from "../db/postgres.js";

export interface RemoteToken {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}
interface StoredRemoteToken extends RemoteToken {
  secretHash: string;
}

/** Marks a string as one of this app's tokens; not itself a secret. `.` never appears in base64url. */
const LABEL = "vkremote";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const withoutHash = ({ secretHash: _secretHash, ...token }: StoredRemoteToken): RemoteToken =>
  token;

const file = path.join(process.env.DATA_DIR || "data", "tts-remote-tokens.json");
let ready: Promise<void> | undefined;
async function init() {
  if (!ready) {
    ready = (async () => {
      if (postgres) {
        await postgres.query(`CREATE TABLE IF NOT EXISTS tts_remote_tokens (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          secret_hash TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ
        )`);
      } else {
        if (process.env.NODE_ENV === "production") {
          throw new Error("The Stream Deck remote requires DATABASE_URL in production.");
        }
        await mkdir(path.dirname(file), { recursive: true });
      }
    })();
  }
  await ready;
}

async function local(): Promise<StoredRemoteToken[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as StoredRemoteToken[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
async function writeLocal(tokens: StoredRemoteToken[]) {
  await writeFile(`${file}.tmp`, JSON.stringify(tokens, null, 2));
  await rename(`${file}.tmp`, file);
}
/**
 * Only used without Postgres (local dev, and tests). Reading the file, changing it and writing it
 * back is not one atomic step, so two of these running at once (a token used just as another is
 * created, say) could overwrite each other's change, or race on the same temporary file. This runs
 * them one at a time instead. `change` gets the current tokens and returns the ones to save, or
 * `undefined` to write nothing (id not found).
 */
let localChain: Promise<unknown> = Promise.resolve();
function withLocal<T>(
  change: (tokens: StoredRemoteToken[]) => { tokens?: StoredRemoteToken[]; result: T },
): Promise<T> {
  const done = localChain.then(async () => {
    const { tokens, result } = change(await local());
    if (tokens) await writeLocal(tokens);
    return result;
  });
  localChain = done.then(
    () => {},
    () => {},
  );
  return done;
}
const row = (r: {
  id: string;
  name: string;
  secret_hash: string;
  created_by: string;
  created_at: string | Date;
  last_used_at: string | Date | null;
}): StoredRemoteToken => ({
  id: r.id,
  name: r.name,
  secretHash: r.secret_hash,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at).toISOString(),
  ...(r.last_used_at ? { lastUsedAt: new Date(r.last_used_at).toISOString() } : {}),
});

/** Every named remote token, newest first. Never includes anything the raw token could be rebuilt from. */
export async function listRemoteTokens(): Promise<RemoteToken[]> {
  await init();
  if (postgres) {
    const { rows } = await postgres.query(
      "SELECT id, name, secret_hash, created_by, created_at, last_used_at FROM tts_remote_tokens ORDER BY created_at DESC",
    );
    return rows.map(row).map(withoutHash);
  }
  return (await local()).map(withoutHash).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Creates a named token. The full token is returned once, here, and is never stored or shown again. */
export async function createRemoteToken(
  name: string,
  createdBy: string,
): Promise<RemoteToken & { token: string }> {
  await init();
  const id = randomBytes(9).toString("base64url");
  const secret = randomBytes(24).toString("base64url");
  const createdAt = new Date().toISOString();
  const stored: StoredRemoteToken = { id, name, createdBy, createdAt, secretHash: sha256(secret) };
  if (postgres) {
    await postgres.query(
      "INSERT INTO tts_remote_tokens (id, name, secret_hash, created_by, created_at) VALUES ($1,$2,$3,$4,$5)",
      [id, name, stored.secretHash, createdBy, createdAt],
    );
  } else {
    await withLocal((tokens) => ({ tokens: [stored, ...tokens], result: undefined }));
  }
  return { ...withoutHash(stored), token: `${LABEL}.${id}.${secret}` };
}

/** Revokes a token so it stops working at once. False when it did not exist. */
export async function revokeRemoteToken(id: string): Promise<boolean> {
  await init();
  if (postgres) {
    const result = await postgres.query("DELETE FROM tts_remote_tokens WHERE id=$1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
  return withLocal((tokens) =>
    tokens.some((token) => token.id === id)
      ? { tokens: tokens.filter((token) => token.id !== id), result: true }
      : { result: false },
  );
}

/** Best-effort: records that a token was just used, without making the action it caused wait for it. */
function touch(id: string) {
  void (async () => {
    await init();
    const lastUsedAt = new Date().toISOString();
    if (postgres) {
      await postgres.query("UPDATE tts_remote_tokens SET last_used_at=$2 WHERE id=$1", [
        id,
        lastUsedAt,
      ]);
      return;
    }
    await withLocal((tokens) => {
      const found = tokens.find((token) => token.id === id);
      if (!found) return { result: undefined };
      found.lastUsedAt = lastUsedAt;
      return { tokens, result: undefined };
    });
  })().catch((error) =>
    console.error("Could not record when a TTS remote token was last used", error),
  );
}

/**
 * Checks a bearer token against the saved ones. Undefined when it is missing, malformed, unknown or
 * revoked. A valid token's `id` is split out of it up front, so this never has to hash and compare
 * against every saved token: it looks up the one row the token claims to be, then checks the secret.
 */
export async function checkRemoteToken(token: string): Promise<RemoteToken | undefined> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== LABEL) return undefined;
  const [, id, secret] = parts;
  await init();
  let stored: StoredRemoteToken | undefined;
  if (postgres) {
    const { rows } = await postgres.query(
      "SELECT id, name, secret_hash, created_by, created_at, last_used_at FROM tts_remote_tokens WHERE id=$1",
      [id],
    );
    stored = rows[0] && row(rows[0]);
  } else {
    stored = (await local()).find((candidate) => candidate.id === id);
  }
  if (!stored) return undefined;
  const given = Buffer.from(sha256(secret));
  const expected = Buffer.from(stored.secretHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  touch(id);
  return withoutHash(stored);
}
