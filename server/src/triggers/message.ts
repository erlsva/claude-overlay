/** What a Twitch event carries. Its fields depend on the event type, so it is loosely typed. */
export type TriggerEventPayload = Record<string, any>;

const VARIABLES =
  /\{(user|months|viewers|bits|reward|channel|moderator|reason|duration|banType|message|title)\}/gi;

/** How many minutes a timeout lasts, from when it started to when it ends. */
function timeoutMinutes(event: TriggerEventPayload): number {
  if (!event.ends_at || !event.banned_at) return 0;
  return Math.max(1, Math.ceil((Date.parse(event.ends_at) - Date.parse(event.banned_at)) / 60_000));
}

/** Fills {user}, {bits}, {reward} and the other variables of a chat or TTS message for an event. */
export function renderEventMessage(template: string, event: TriggerEventPayload, maxLength = 500) {
  const minutes = timeoutMinutes(event);
  const values: Record<string, string> = {
    user: String(
      event.user_name ?? event.chatter_user_name ?? event.from_broadcaster_user_name ?? "Viewer",
    ),
    months: String(event.cumulative_months ?? event.duration_months ?? 0),
    viewers: String(event.viewers ?? 0),
    bits: String(event.bits ?? 0),
    reward: String(event.reward?.title ?? event.reward_title ?? ""),
    channel: String(event.channel ?? event.broadcaster_user_login ?? ""),
    moderator: String(event.moderator_user_name ?? event.moderator_user_login ?? "Moderator"),
    reason: String(event.reason ?? ""),
    duration: event.is_permanent ? "permanent" : `${minutes} minute${minutes === 1 ? "" : "s"}`,
    bantype: event.is_permanent ? "ban" : "timeout",
    message: String(event.user_input ?? event.message?.text?.replace(/^\S+\s*/, "") ?? ""),
    title: String(event.title ?? ""),
  };
  return template
    .replace(VARIABLES, (_, key: string) => values[key.toLowerCase()] ?? "")
    .slice(0, maxLength);
}
