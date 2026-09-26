/** Pure helpers for the "is the stream live" indicator in the browser tab. */

/** "vicksy" → "Vicksy". */
export const channelLabel = (channel: string) => channel.charAt(0).toUpperCase() + channel.slice(1);

/** A page's tab title, with "(LIVE)" in front while a stream is on. */
export const tabTitle = (title: string, live: boolean) => (live ? `(LIVE) ${title}` : title);

/**
 * Reads the answers for several channels: live if any of them is. A channel that could not be
 * checked counts as not live, and `allFailed` says nothing could be checked at all (the server is
 * down or asleep), which is different from "nobody is live".
 */
export function summarizeLive(results: PromiseSettledResult<boolean>[]): {
  live: boolean;
  allFailed: boolean;
} {
  return {
    live: results.some((result) => result.status === "fulfilled" && result.value),
    allFailed: results.length > 0 && results.every((result) => result.status === "rejected"),
  };
}
