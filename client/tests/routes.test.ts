import assert from "node:assert/strict";
import test from "node:test";
import { clipIdFor, pageFor } from "../src/views/routes.ts";

test("every page the app has is found, with or without a trailing slash", () => {
  const known = {
    "/": "dashboard",
    "/login": "dashboard",
    "/index.html": "dashboard",
    "/overlay": "overlay",
    "/tts": "tts",
    "/tts/clips": "tts-clips",
  } as const;
  for (const [path, page] of Object.entries(known)) {
    assert.equal(pageFor(path), page, path);
    if (path !== "/") assert.equal(pageFor(`${path}/`), page, `${path}/`);
  }
  assert.equal(pageFor("//"), "dashboard");
});

test("any other address is a 404 instead of quietly showing the dashboard", () => {
  for (const path of [
    "/anything",
    "/tts-guide",
    "/tts-guideaaasdasdasdad",
    "/tts/clips/extra",
    "/tts/clips/abc",
    `/tts/clips/${"A".repeat(32)}`,
    `/tts/clips/${"a".repeat(31)}g`,
    `/tts/clips/${"a".repeat(33)}`,
    `/tts/clips/${"a".repeat(32)}/extra`,
    "/tts/other",
    "/overlay/extra",
    "/overlays",
    "/Overlay",
    "/TTS",
    "/login/extra",
    "/dashboard",
    "/constructor",
    "/__proto__",
  ])
    assert.equal(pageFor(path), "not-found", path);
});

test("one clip has its own address, and only a real clip id fits it", () => {
  const id = "0123456789abcdef0123456789abcdef";
  assert.equal(pageFor(`/tts/clips/${id}`), "tts-clip");
  assert.equal(pageFor(`/tts/clips/${id}/`), "tts-clip");
  assert.equal(clipIdFor(`/tts/clips/${id}`), id);
  assert.equal(clipIdFor(`/tts/clips/${id}/`), id);
  for (const other of ["/tts/clips", "/tts", "/tts/clips/nope", `/tts/clips/${id}x`, "/"])
    assert.equal(clipIdFor(other), null, other);
});
