import { getAppAccessToken, twitchClientId } from "../auth/twitch.js";
import { getValidEventAuth, type StoredEventAuth } from "../twitch/eventAuthStore.js";
import { CHATBOT_AUTH_KEY } from "../twitch/eventOAuth.js";
import type { TriggerStep } from "../types.js";
import { renderEventMessage, type TriggerEventPayload } from "./message.js";

/**
 * The broadcaster is only ever named as the recipient (`broadcaster_id`); the chatbot is always
 * the one speaking (`sender_id`). Kept separate from `sendEventChatMessage` so this mapping — the
 * one thing that must never accidentally send as the streamer's own account — is covered by a
 * plain unit test, with no Twitch connection needed to exercise it.
 */
export function buildChatMessageRequest(
  broadcasterAuth: Pick<StoredEventAuth, "twitchUserId">,
  chatbotAuth: Pick<StoredEventAuth, "twitchUserId">,
  message: string,
) {
  return {
    broadcaster_id: broadcasterAuth.twitchUserId,
    sender_id: chatbotAuth.twitchUserId,
    message,
  };
}

/**
 * Posts an automation's chat message to the event's channel, as the chatbot account. Sent with an
 * app access token rather than the chatbot's own token: Twitch only shows its official Bot badge
 * next to messages sent that way, and only once the broadcaster has granted `channel:bot`.
 */
export async function sendEventChatMessage(step: TriggerStep, event: TriggerEventPayload) {
  const channel = String(event.channel ?? event.broadcaster_user_login ?? "").toLowerCase();
  const broadcasterAuth = channel ? await getValidEventAuth(channel) : null;
  const chatbotAuth = await getValidEventAuth(CHATBOT_AUTH_KEY);
  if (!broadcasterAuth)
    throw new Error(`No Twitch Events connection for ${channel || "this channel"}`);
  if (!chatbotAuth) throw new Error("The chatbot is not connected");
  if (!step.chatMessage) throw new Error("The chat message is empty");
  if (!broadcasterAuth.scopes.includes("channel:bot"))
    throw new Error(`${channel} must reconnect Events to grant the chat-bot permission`);
  const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      "Client-Id": twitchClientId,
      Authorization: `Bearer ${await getAppAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildChatMessageRequest(
        broadcasterAuth,
        chatbotAuth,
        renderEventMessage(step.chatMessage, event),
      ),
    ),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twitch chat message failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}
