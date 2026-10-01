import { spawnChatEmotes } from "../chat/emotes.js";
import { setTwitchConnected } from "../realtime/activity.js";
import { runMatchingTriggers } from "../triggers/dispatch.js";
import { configureTwitchEvents } from "../twitch/eventsub.js";

/** Every Twitch event, from chat or EventSub, ends up here: chat emotes first, then automations. */
export function startTwitchEvents() {
  configureTwitchEvents((eventType, event, options) => {
    if (eventType === "chat-command") spawnChatEmotes(event);
    return runMatchingTriggers(eventType, event, options);
  }, setTwitchConnected);
}
