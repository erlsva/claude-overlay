import type { EmoteName } from "./emotes";

/**
 * How each cheat-sheet section looks: its colour and its mascot. This is presentation only; the
 * words live in the shared content file, which the server tests. A new section without an entry
 * here still shows, in the fallback style.
 */
export interface SectionLook {
  color: string;
  emote: EmoteName;
}

export const SECTION_LOOKS: Record<string, SectionLook> = {
  basics: { color: "var(--tp-orange)", emote: "dance" },
  characters: { color: "var(--tp-pink)", emote: "tomfoolery" },
  accents: { color: "var(--tp-sky)", emote: "ga" },
  delivery: { color: "var(--tp-coral)", emote: "bork" },
  sounds: { color: "var(--tp-yellow)", emote: "boogie" },
  places: { color: "var(--tp-mint)", emote: "binoculars" },
  devices: { color: "var(--tp-lavender)", emote: "gaCard" },
  silly: { color: "var(--tp-lime)", emote: "spin" },
  timing: { color: "var(--tp-teal)", emote: "gainsane" },
  tips: { color: "var(--tp-peach)", emote: "wixelsSit" },
};

export const FALLBACK_LOOK: SectionLook = { color: "var(--tp-orange)", emote: "ga" };
