import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "../middleware/auth.js";
import { uploadRateLimit } from "../middleware/rateLimits.js";
import { UPLOAD_DIR } from "../uploads/routes.js";
import { allowedMimeTypes, signatureMatches } from "../uploads/signature.js";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, checkLibraryUpload, libraryName } from "./limits.js";
import { getLibraryStore, type LibraryItem } from "./store.js";

/**
 * Shared media library: a small set of files every moderator can put on the
 * canvas. Bytes live in the durable store (Neon); a disk cache under the upload
 * directory is only a speed-up and is rebuilt on demand after a restart.
 */
export const libraryRouter = Router();

const CACHE_DIR = path.join(UPLOAD_DIR, "library-cache");
const ID_PATTERN = /^[a-f0-9]{32}$/;
const metadataCache = new Map<string, LibraryItem>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype)),
});

const fileAccess = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false });

const publicItem = (item: LibraryItem) => ({ ...item, url: `/library/files/${item.id}` });

// File URLs are unguessable capabilities so the OBS browser source can load them
// without a login, exactly like the temporary /files uploads.
libraryRouter.get("/files/:id", fileAccess, async (req, res) => {
  const store = getLibraryStore();
  const id = req.params.id;
  if (!store || !ID_PATTERN.test(id)) {
    res.sendStatus(404);
    return;
  }
  try {
    let item = metadataCache.get(id) ?? null;
    if (!item) {
      item = await store.get(id);
      if (item) metadataCache.set(id, item);
    }
    if (!item) {
      res.sendStatus(404);
      return;
    }
    const cached = path.join(CACHE_DIR, id);
    const headers = {
      "Content-Type": item.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    const send = () => new Promise<boolean>((resolve) => res.sendFile(cached, { headers }, (error) => resolve(!error)));
    if (await send()) return;
    if (res.headersSent) return;
    // Cache miss (first request since a restart): rebuild it from the durable copy.
    const data = await store.readData(id);
    if (!data) {
      res.sendStatus(404);
      return;
    }
    await mkdir(CACHE_DIR, { recursive: true });
    const partial = `${cached}.${randomBytes(4).toString("hex")}.part`;
    await writeFile(partial, data);
    await rename(partial, cached);
    if (!(await send()) && !res.headersSent) res.sendStatus(500);
  } catch (error) {
    console.error("Library file could not be served", error);
    if (!res.headersSent) res.status(502).json({ error: "The library file could not be loaded." });
  }
});

libraryRouter.use(requireAuth);

libraryRouter.get("/", async (_req, res) => {
  const store = getLibraryStore();
  if (!store) {
    res.json({ configured: false, items: [], usedBytes: 0, limitBytes: MAX_TOTAL_BYTES, maxFileBytes: MAX_FILE_BYTES });
    return;
  }
  try {
    const [items, usedBytes] = await Promise.all([store.list(), store.usedBytes()]);
    res.json({
      configured: true,
      storage: store.kind,
      items: items.map(publicItem),
      usedBytes,
      limitBytes: MAX_TOTAL_BYTES,
      maxFileBytes: MAX_FILE_BYTES,
    });
  } catch (error) {
    console.error("Library list failed", error);
    res.status(503).json({ error: "The shared library is unavailable. Check DATABASE_URL and the server logs." });
  }
});

function parseUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `Files in the library can be at most ${MAX_FILE_BYTES / (1024 * 1024)} MB.` });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "Upload could not be processed." });
  });
}

libraryRouter.post("/", uploadRateLimit, parseUpload, async (req, res) => {
  const store = getLibraryStore();
  if (!store) {
    res.status(503).json({ error: "The shared library needs the Neon database (DATABASE_URL)." });
    return;
  }
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No supported file was uploaded." });
    return;
  }
  if (!signatureMatches(file.buffer.subarray(0, 16), file.mimetype)) {
    res.status(400).json({ error: "The file contents do not match its media type." });
    return;
  }
  try {
    const problem = checkLibraryUpload({ mime: file.mimetype, size: file.size, usedBytes: await store.usedBytes() });
    if (problem) {
      res.status(problem.includes("full") ? 507 : 400).json({ error: problem });
      return;
    }
    const item: LibraryItem = {
      id: randomBytes(16).toString("hex"),
      name: libraryName(file.originalname, req.body?.name),
      mime: file.mimetype,
      size: file.size,
      addedBy: (req.authUser?.displayName || req.authUser?.login || "Unknown").slice(0, 80),
      createdAt: new Date().toISOString(),
    };
    await store.add(item, file.buffer);
    res.status(201).json(publicItem(item));
  } catch (error) {
    console.error("Library upload failed", error);
    res.status(502).json({ error: "The file could not be saved to the library." });
  }
});

libraryRouter.delete("/:id", async (req, res) => {
  const store = getLibraryStore();
  const id = req.params.id;
  if (!store || !ID_PATTERN.test(id)) {
    res.status(404).json({ error: "That library file does not exist." });
    return;
  }
  try {
    const removed = await store.remove(id);
    metadataCache.delete(id);
    await rm(path.join(CACHE_DIR, id), { force: true });
    if (!removed) {
      res.status(404).json({ error: "That library file no longer exists." });
      return;
    }
    res.json({ deleted: true });
  } catch (error) {
    console.error("Library delete failed", error);
    res.status(502).json({ error: "The file could not be removed." });
  }
});
