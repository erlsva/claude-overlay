import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { postgres } from "../db/postgres.js";

export interface LibraryItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  addedBy: string;
  createdAt: string;
}

export interface LibraryStore {
  /** "neon" is durable. "local" is a development fallback on disk. */
  kind: "neon" | "local";
  list(): Promise<LibraryItem[]>;
  get(id: string): Promise<LibraryItem | null>;
  readData(id: string): Promise<Buffer | null>;
  add(item: LibraryItem, data: Buffer): Promise<void>;
  remove(id: string): Promise<boolean>;
  usedBytes(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Neon / PostgreSQL
// ---------------------------------------------------------------------------
let tableReady: Promise<void> | undefined;
function ensureTable(): Promise<void> {
  tableReady ??= postgres!
    .query(
      `CREATE TABLE IF NOT EXISTS media_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      data BYTEA NOT NULL,
      added_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    )
    .then(() => undefined)
    .catch((error) => {
      tableReady = undefined;
      throw error;
    });
  return tableReady;
}

const rowToItem = (row: Record<string, unknown>): LibraryItem => ({
  id: String(row.id),
  name: String(row.name),
  mime: String(row.mime),
  size: Number(row.size),
  addedBy: String(row.added_by),
  createdAt: new Date(row.created_at as string | Date).toISOString(),
});

const neonStore: LibraryStore = {
  kind: "neon",
  async list() {
    await ensureTable();
    const result = await postgres!.query(
      "SELECT id, name, mime, size, added_by, created_at FROM media_library ORDER BY created_at DESC",
    );
    return result.rows.map(rowToItem);
  },
  async get(id) {
    await ensureTable();
    const result = await postgres!.query(
      "SELECT id, name, mime, size, added_by, created_at FROM media_library WHERE id = $1",
      [id],
    );
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  },
  async readData(id) {
    await ensureTable();
    const result = await postgres!.query("SELECT data FROM media_library WHERE id = $1", [id]);
    return (result.rows[0]?.data as Buffer | undefined) ?? null;
  },
  async add(item, data) {
    await ensureTable();
    await postgres!.query(
      "INSERT INTO media_library (id, name, mime, size, data, added_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [item.id, item.name, item.mime, item.size, data, item.addedBy, item.createdAt],
    );
  },
  async remove(id) {
    await ensureTable();
    const result = await postgres!.query("DELETE FROM media_library WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
  async usedBytes() {
    await ensureTable();
    const result = await postgres!.query(
      "SELECT COALESCE(SUM(size), 0)::bigint AS total FROM media_library",
    );
    return Number(result.rows[0]?.total ?? 0);
  },
};

// ---------------------------------------------------------------------------
// Local development fallback (no DATABASE_URL). Never used in production.
// ---------------------------------------------------------------------------
const localDir = () =>
  path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "media-library");
let localQueue: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const run = localQueue.then(task, task);
  localQueue = run.catch(() => undefined);
  return run;
};
async function readIndex(): Promise<LibraryItem[]> {
  try {
    return JSON.parse(await readFile(path.join(localDir(), "index.json"), "utf8")) as LibraryItem[];
  } catch {
    return [];
  }
}
const writeIndex = async (items: LibraryItem[]) => {
  await mkdir(localDir(), { recursive: true });
  await writeFile(path.join(localDir(), "index.json"), JSON.stringify(items));
};

const localStore: LibraryStore = {
  kind: "local",
  list: async () => (await readIndex()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: async (id) => (await readIndex()).find((item) => item.id === id) ?? null,
  readData: async (id) => {
    try {
      return await readFile(path.join(localDir(), `${id}.bin`));
    } catch {
      return null;
    }
  },
  add: (item, data) =>
    serial(async () => {
      await mkdir(localDir(), { recursive: true });
      await writeFile(path.join(localDir(), `${item.id}.bin`), data);
      await writeIndex([...(await readIndex()), item]);
    }),
  remove: (id) =>
    serial(async () => {
      const items = await readIndex();
      if (!items.some((item) => item.id === id)) return false;
      await writeIndex(items.filter((item) => item.id !== id));
      await rm(path.join(localDir(), `${id}.bin`), { force: true });
      return true;
    }),
  usedBytes: async () => (await readIndex()).reduce((total, item) => total + item.size, 0),
};

/** Neon when configured; a disk folder for local development; otherwise unavailable. */
export function getLibraryStore(): LibraryStore | null {
  if (postgres) return neonStore;
  return process.env.NODE_ENV === "production" ? null : localStore;
}
