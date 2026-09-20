import { twitchClientId } from "../auth/twitch.js";
import { getValidEventAuth } from "../twitch/eventAuthStore.js";
import { CHATBOT_AUTH_KEY } from "../twitch/eventRoutes.js";
import type { TriggerStep } from "../types.js";
import { renderEventMessage, type TriggerEventPayload } from "./message.js";

/** Posts an automation's chat message to the event's channel, as the chatbot account. */
export async function sendEventChatMessage(step: TriggerStep, event: TriggerEventPayload) {
  const channel = String(event.channel ?? event.broadcaster_user_login ?? "").toLowerCase();
  const broadcasterAuth = channel ? await getValidEventAuth(channel) : null;
  const chatbotAuth = await getValidEventAuth(CHATBOT_AUTH_KEY);
  if (!broadcasterAuth)
    throw new Error(`No Twitch Events connection for ${channel || "this channel"}`);
  if (!chatbotAuth) throw new Error("The chatbot is not connected");
  if (!step.chatMessage) throw new Error("The chat message is empty");
  if (!chatbotAuth.scopes.includes("user:write:chat"))
    throw new Error(`${chatbotAuth.displayName} must reconnect to grant chat-message permission`);
  const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      "Client-Id": twitchClientId,
      Authorization: `Bearer ${chatbotAuth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: broadcasterAuth.twitchUserId,
      sender_id: chatbotAuth.twitchUserId,
      message: renderEventMessage(step.chatMessage, event),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twitch chat message failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}
