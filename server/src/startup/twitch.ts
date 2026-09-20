import { spawnChatEmotes } from "../chat/emotes.js";
import { setTwitchConnected } from "../realtime/activity.js";
import { runMatchingTriggers } from "../triggers/dispatch.js";
import { configureTwitchEvents } from "../twitch/eventsub.js";

/** Every Twitch event, from chat or EventSub, ends up here: chat emotes first, then automations. */
export function startTwitchEvents() {
  configureTwitchEvents((eventType, event) => {
    if (eventType === "chat-command") spawnChatEmotes(event);
    runMatchingTriggers(eventType, event);
  }, setTwitchConnected);
}
