import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getTwitchEventsAuthUrl } from "../auth/twitch.js";
import {
  eventDatabaseConfigured,
  getEventAuth,
  type EventChannel,
  type StoredEventAuth,
} from "./eventAuthStore.js";
import { getConfiguredTwitchChannels } from "./channels.js";

const sessionSecret = process.env.SESSION_SECRET ?? "development-only-secret";

// Broadcasters only authorize the read permissions needed by EventSub. Outgoing
// chat uses the independently-authorized chatbot account below.
export const EVENT_SCOPES = [
  "moderator:read:followers",
  "channel:read:subscriptions",
  "bits:read",
  "channel:read:redemptions",
  "channel:read:hype_train",
  "channel:moderate",
  "channel:read:predictions",
];
export const CHATBOT_AUTH_KEY = "__chatbot__";
export const CHATBOT_SCOPES = ["user:write:chat"];
export type AuthTarget = EventChannel | typeof CHATBOT_AUTH_KEY;

export function getEventChannels(): EventChannel[] {
  return getConfiguredTwitchChannels();
}
export function isEventChannel(channel: string): channel is EventChannel {
  return getEventChannels().includes(channel);
}

/** A signed, expiring value that ties an OAuth round trip to the channel it was started for. */
export function createState(channel: AuthTarget) {
  const payload = Buffer.from(
    JSON.stringify({
      channel,
      expires: Date.now() + 600_000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", sessionSecret).update(payload).digest("base64url")}`;
}
export function parseState(state: string): AuthTarget | null {
  try {
    const [payload, signature] = state.split(".");
    const expected = createHmac("sha256", sessionSecret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      channel: AuthTarget;
      expires: number;
    };
    return (value.channel === CHATBOT_AUTH_KEY || isEventChannel(value.channel)) &&
      value.expires > Date.now()
      ? value.channel
      : null;
  } catch {
    return null;
  }
}

/** True when the stored connection is missing, or was made before a permission we now need existed. */
export function needsEventAuthorization(
  stored: Pick<StoredEventAuth, "scopes"> | null,
  required: string[] = EVENT_SCOPES,
) {
  return !stored || required.some((scope) => !stored.scopes.includes(scope));
}

/**
 * Called right after a normal dashboard login. If the person who just signed in is one of the
 * broadcaster channels and has not granted every Events permission yet, returns the Twitch URL
 * that asks for them, so the streamer is only asked once, as part of logging in. Everyone else,
 * and any failure, returns null and login carries on as usual.
 */
export async function eventsAuthUrlForLogin(login: string): Promise<string | null> {
  try {
    if (!isEventChannel(login) || !eventDatabaseConfigured()) return null;
    if (!needsEventAuthorization(await getEventAuth(login))) return null;
    return getTwitchEventsAuthUrl(createState(login), EVENT_SCOPES);
  } catch (error) {
    console.error("Could not prepare the Events authorization after login", error);
    return null;
  }
}
