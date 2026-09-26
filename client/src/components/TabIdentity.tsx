import { useTabIdentity } from "../hooks/useTabIdentity";
import { TWITCH_CHANNELS } from "../config/twitchChannels";

/**
 * Gives a page without a chosen channel (login, the TTS pages, the 404) the same tab title and
 * icon as the rest, live when either streamer is. Renders nothing.
 */
export function TabIdentity({ title }: { title: string }) {
  useTabIdentity(title, TWITCH_CHANNELS);
  return null;
}
