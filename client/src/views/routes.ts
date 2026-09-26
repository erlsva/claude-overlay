/** The pages this app has. Anything else is a 404, not a quiet fall-back to the dashboard. */
export type Page = "dashboard" | "overlay" | "tts" | "tts-clips" | "tts-clip" | "not-found";

/** A saved clip's id: what its page address ends in. */
const CLIP_PAGE = /^\/tts\/clips\/([a-f0-9]{32})$/;

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
  const path = pathname.replace(/\/+$/, "") || "/";
  return pages.get(path) ?? (CLIP_PAGE.test(path) ? "tts-clip" : "not-found");
}

/** The clip a /tts/clips/<id> address names, or null for any other address. */
export function clipIdFor(pathname: string): string | null {
  return CLIP_PAGE.exec(pathname.replace(/\/+$/, ""))?.[1] ?? null;
}
