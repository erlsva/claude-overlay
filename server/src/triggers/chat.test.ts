import assert from "node:assert/strict";
import test from "node:test";
import { buildChatMessageRequest, chatSendMode } from "./chat.js";

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

test("the Bot badge needs both sides to have granted it; until then the chatbot's own token is used", () => {
  const all = ["user:write:chat", "user:bot"];
  assert.equal(chatSendMode(["channel:bot"], all), "bot");
  assert.equal(chatSendMode([], all), "user", "streamer has not reconnected yet");
  assert.equal(chatSendMode(["channel:bot"], ["user:write:chat"]), "user", "chatbot has not");
  assert.equal(chatSendMode(["channel:bot"], ["user:bot"]), null, "cannot send without write");
  assert.equal(chatSendMode([], []), null);
});
