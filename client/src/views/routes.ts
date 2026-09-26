/** The pages this app has. Anything else is a 404, not a quiet fall-back to the dashboard. */
export type Page = "dashboard" | "overlay" | "tts" | "tts-clips" | "not-found";

const pages = new Map<string, Page>([
  ["/", "dashboard"],
  // Signing in sends people back here, with ?error= when it went wrong.
  ["/login", "dashboard"],
  ["/index.html", "dashboard"],
  ["/overlay", "overlay"],
  ["/tts", "tts"],
  ["/tts/clips", "tts-clips"],
]);

/** Which page an address shows. A trailing slash is ignored; case and anything extra are not. */
export function pageFor(pathname: string): Page {
  return pages.get(pathname.replace(/\/+$/, "") || "/") ?? "not-found";
}
