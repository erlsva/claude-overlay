import assert from "node:assert/strict";
import test from "node:test";
import { formatDiscordClipMessage } from "./discord.js";

test("Discord TTS messages show sender and prompt in one safe code block", () => {
  assert.equal(
    formatDiscordClipMessage(
      "(TTS:0123456789abcdef0123456789abcdef)",
      "RaeArx_",
      "Cheer200 Every time I come into chat",
    ),
    "(TTS:0123456789abcdef0123456789abcdef)\n```\nRaeArx_: Cheer200 Every time I come into chat\n```",
  );
  const escaped = formatDiscordClipMessage(
    "(TTS:0123456789abcdef0123456789abcdef)",
    "Viewer",
    "```unexpected fence```",
  );
  assert.equal(escaped.match(/```/g)?.length, 2);
  assert.ok(escaped.length < 2_000);
});
