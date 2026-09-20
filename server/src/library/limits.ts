import { allowedMimeTypes } from "../uploads/signature.js";

/** The shared library is for a handful of defaults, not general storage. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Returns a short reason the file cannot be added, or null when it can. */
export function checkLibraryUpload(input: {
  mime: string;
  size: number;
  usedBytes: number;
}): string | null {
  if (!allowedMimeTypes.has(input.mime)) return "That file type is not supported.";
  if (input.size <= 0) return "That file is empty.";
  if (input.size > MAX_FILE_BYTES)
    return `Files in the library can be at most ${megabytes(MAX_FILE_BYTES)} MB.`;
  if (input.usedBytes + input.size > MAX_TOTAL_BYTES) {
    return `The shared library is full (${megabytes(MAX_TOTAL_BYTES)} MB). Delete something first.`;
  }
  return null;
}

/** Display name: the requested one, else the file name without its extension. */
export function libraryName(originalName: string, requested?: unknown): string {
  const fromRequest = typeof requested === "string" ? requested.trim() : "";
  const fromFile = originalName.replace(/\.[^./\\]+$/, "").trim();
  return (fromRequest || fromFile || "Untitled").slice(0, 80);
}
