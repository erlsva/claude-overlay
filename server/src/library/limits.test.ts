import assert from "node:assert/strict";
import test from "node:test";
import { signatureMatches } from "../uploads/signature.js";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, checkLibraryUpload, libraryName } from "./limits.js";

test("accepts a normal supported file", () => {
  assert.equal(checkLibraryUpload({ mime: "video/mp4", size: 5_000_000, usedBytes: 0 }), null);
});

test("rejects unsupported, empty and oversized files", () => {
  assert.match(checkLibraryUpload({ mime: "application/zip", size: 10, usedBytes: 0 })!, /not supported/);
  assert.match(checkLibraryUpload({ mime: "image/png", size: 0, usedBytes: 0 })!, /empty/);
  assert.match(checkLibraryUpload({ mime: "image/png", size: MAX_FILE_BYTES + 1, usedBytes: 0 })!, /at most 25 MB/);
});

test("rejects a file that would overflow the total budget, but allows one that fits exactly", () => {
  const nearlyFull = MAX_TOTAL_BYTES - 1_000;
  assert.match(checkLibraryUpload({ mime: "image/png", size: 2_000, usedBytes: nearlyFull })!, /library is full/);
  assert.equal(checkLibraryUpload({ mime: "image/png", size: 1_000, usedBytes: nearlyFull }), null);
});

test("names default to the file name without its extension and are length-limited", () => {
  assert.equal(libraryName("Intro sting.mp4"), "Intro sting");
  assert.equal(libraryName("Intro sting.mp4", "  Big Intro  "), "Big Intro");
  // A file that is only an extension has no real name to show.
  assert.equal(libraryName(".mp4"), "Untitled");
  assert.equal(libraryName("", ""), "Untitled");
  assert.equal(libraryName("x".repeat(300) + ".png").length, 80);
});

test("file signatures must match the claimed type", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(signatureMatches(png, "image/png"), true);
  assert.equal(signatureMatches(png, "image/jpeg"), false);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(4)]);
  assert.equal(signatureMatches(mp4, "video/mp4"), true);
  assert.equal(signatureMatches(Buffer.from("<script>alert(1)</script>"), "image/png"), false);
});
