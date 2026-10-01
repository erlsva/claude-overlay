import assert from "node:assert/strict";
import test from "node:test";
import { buildChatMessageRequest } from "./chat.js";

test("an automation's chat message is always sent as the chatbot, never as the broadcaster", () => {
  const broadcaster = { twitchUserId: "broadcaster-id" };
  const chatbot = { twitchUserId: "chatbot-id" };
  const request = buildChatMessageRequest(broadcaster, chatbot, "hello chat");
  assert.equal(request.broadcaster_id, "broadcaster-id");
  assert.equal(request.sender_id, "chatbot-id");
  assert.equal(request.message, "hello chat");
  assert.notEqual(
    request.sender_id,
    request.broadcaster_id,
    "the broadcaster's own id must never end up as the sender",
  );
});
