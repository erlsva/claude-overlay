/** Media types the dashboard accepts as uploads. */
export const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/webm",
]);

/** Checks a file's first bytes against the type it claims to be. */
export function signatureMatches(bytes: Buffer, mimeType: string): boolean {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);

  if (mimeType === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mimeType === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mimeType === "image/gif") return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
  if (mimeType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mimeType === "video/mp4") return ascii(4, 8) === "ftyp";
  if (mimeType === "video/webm" || mimeType === "audio/webm") return starts(0x1a, 0x45, 0xdf, 0xa3);
  if (mimeType === "audio/wav") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  if (mimeType === "audio/ogg") return ascii(0, 4) === "OggS";
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
    return ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  return false;
}
