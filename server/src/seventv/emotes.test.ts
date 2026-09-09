import assert from "node:assert/strict";
import test from "node:test";
import { resolveSevenTvEmotes, stackEmotes } from "./emotes.js";

test("stacks zero-width modifiers before and after their base emote", () => {
  const leading = { name: "HandsBefore", isZeroWidth: true };
  const base = { name: "Fox", isZeroWidth: false };
  const trailing = { name: "HatAfter", isZeroWidth: true };
  const secondBase = { name: "Dance", isZeroWidth: false };

  const result = stackEmotes([leading, base, trailing, secondBase]);

  assert.deepEqual(result.stacks, [
    { base, overlays: [leading, trailing] },
    { base: secondBase, overlays: [] },
  ]);
  assert.deepEqual(result.leadingOverlays, []);
});

test("resolves ordered 7TV emotes and identifies zero-width overlays", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => new Response(JSON.stringify(
    String(input).endsWith("/emote-sets/global")
      ? { emotes: [{ id: "global-piano", name: "PianoTime" }] }
      : { emote_set: { emotes: [
          { id: "emote-one", name: "FoxDance" },
          { id: "emote-overlay", name: "RainTime", flags: 1 },
          { id: "emote-overlay-legacy", name: "HandsTime", flags: 256 },
          {
            id: "emote-overlay-object",
            name: "HatTime",
            data: { flags: { zero_width: true } },
          },
          { id: "emote-two", name: "AINTNOWAY" },
        ] } },
  ));
  try {
    const matches = await resolveSevenTvEmotes(
      "test-room",
      "FoxDance RainTime HandsTime HatTime PianoTime AINTNOWAY",
    );
    assert.deepEqual(matches.map((item) => item.name), [
      "FoxDance",
      "RainTime",
      "HandsTime",
      "HatTime",
      "PianoTime",
      "AINTNOWAY",
    ]);
    assert.equal(matches[0]?.imageUrl, "https://cdn.7tv.app/emote/emote-one/2x.webp");
    assert.equal(matches[1]?.isZeroWidth, true);
    assert.equal(matches[2]?.isZeroWidth, true);
    assert.equal(matches[3]?.isZeroWidth, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
