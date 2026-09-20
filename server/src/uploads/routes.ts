import { Router } from "express";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { mkdirSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { requireAuth } from "../middleware/auth.js";
import { uploadRateLimit } from "../middleware/rateLimits.js";
import { allowedMimeTypes, signatureMatches } from "./signature.js";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/tmp/obs-uploads";
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype)),
});

export const uploadRouter = Router();

const extensionContentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

export function setUploadedMediaHeaders(req: Request, res: Response, next: NextFunction) {
  const originalName = typeof req.query.name === "string" ? req.query.name : "";
  const extension = originalName.split(".").pop()?.toLowerCase() ?? "";
  const requestedType = typeof req.query.type === "string" ? req.query.type : "";
  const contentType = allowedMimeTypes.has(requestedType)
    ? requestedType
    : extensionContentTypes[extension];
  if (contentType) res.type(contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

uploadRouter.post(
  "/",
  requireAuth,
  uploadRateLimit,
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File is larger than the 50 MB upload limit" });
      }
      console.error("Media upload parsing failed", error);
      return res
        .status(400)
        .json({ error: error instanceof Error ? error.message : "Upload could not be processed" });
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No supported file uploaded" });
      return;
    }

    try {
      if (!(await matchesFileSignature(req.file.path, req.file.mimetype))) {
        await unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: "File contents do not match its media type" });
        return;
      }
      const url = `/files/${req.file.filename}?name=${encodeURIComponent(req.file.originalname)}&type=${encodeURIComponent(req.file.mimetype)}`;
      res.json({ url, mimetype: req.file.mimetype });
    } catch (error) {
      await unlink(req.file.path).catch(() => {});
      console.error("Media upload validation failed", error);
      res.status(500).json({ error: "Server could not validate the uploaded file" });
    }
  },
);

async function matchesFileSignature(filePath: string, mimeType: string): Promise<boolean> {
  const bytes = Buffer.alloc(16);
  const file = await open(filePath, "r");
  try {
    await file.read(bytes, 0, bytes.length, 0);
  } finally {
    await file.close();
  }
  return signatureMatches(bytes, mimeType);
}
