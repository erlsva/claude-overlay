/** What the server shares about a clip: never who asked for it. */
export interface PublicClip {
  id: string;
  token: string;
  prompt: string;
  createdAt: string;
  duration: number;
}

const CLIP_COLORS = [
  "var(--tp-orange)",
  "var(--tp-pink)",
  "var(--tp-sky)",
  "var(--tp-mint)",
  "var(--tp-yellow)",
  "var(--tp-lavender)",
  "var(--tp-coral)",
  "var(--tp-lime)",
];

/** The same clip always gets the same colour, in the list and on its own page. */
export function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CLIP_COLORS[hash % CLIP_COLORS.length];
}

export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
