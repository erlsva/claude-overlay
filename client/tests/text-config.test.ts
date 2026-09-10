import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TEXT_CONFIG, encodeTextSrc, parseTextSrc } from "../src/canvas/config.ts";

test("structured text settings round trip arbitrary text safely", () => {
  const config = {
    ...DEFAULT_TEXT_CONFIG,
    text: "Vicksy ||| says: 🦊\nHello chat!",
    color: "#ff8844",
    fontWeight: 900,
    textAlign: "right" as const,
    strokeWidth: 3,
  };
  assert.deepEqual(parseTextSrc(encodeTextSrc(config)), config);
});

test("legacy text layers retain their original visual defaults", () => {
  const parsed = parseTextSrc("Old title|||#ffffff|||48|||Inter");
  assert.equal(parsed.text, "Old title");
  assert.equal(parsed.fontWeight, 400);
  assert.equal(parsed.textAlign, "left");
});

test("invalid structured settings fall back safely", () => {
  const parsed = parseTextSrc('text:v2:{"text":"hello","fontSize":9999,"color":"red"}');
  assert.equal(parsed.text, "hello");
  assert.equal(parsed.fontSize, 400);
  assert.equal(parsed.color, "#ffffff");
});
