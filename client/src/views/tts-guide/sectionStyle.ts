/**
 * The colour of each cheat-sheet section, shown on its card, its number and its shortcut chip.
 * This is presentation only; the words live in the shared content file, which the server tests.
 * A new section without an entry here still shows, in orange.
 */
const SECTION_COLORS: Record<string, string> = {
  basics: "var(--tp-orange)",
  characters: "var(--tp-pink)",
  accents: "var(--tp-sky)",
  delivery: "var(--tp-coral)",
  sounds: "var(--tp-yellow)",
  places: "var(--tp-mint)",
  devices: "var(--tp-lavender)",
  silly: "var(--tp-lime)",
  timing: "var(--tp-teal)",
  tips: "var(--tp-peach)",
};

export const colorOf = (id: string) => SECTION_COLORS[id] ?? "var(--tp-orange)";
