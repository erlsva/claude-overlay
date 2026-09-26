import assert from "node:assert/strict";
import test from "node:test";
import { pageFor } from "../src/views/routes.ts";

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
