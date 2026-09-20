/** Accents a speaker can be asked to have, and the Eleven v3 tag for each. */

/**
 * Accents a speaker can be asked to have. Eleven v3 understands "[strong French accent]"
 * as a tag, so a request like "angry welshman" becomes one. `labels` are the accent
 * names ElevenLabs uses on catalogue voices, so a voice that already has the accent wins.
 */
const accents: Array<{ pattern: RegExp; tag: string; labels: string[] }> = [
  { pattern: /french(?:man|woman)?|parisian/, tag: "strong French accent", labels: ["french"] },
  { pattern: /welsh(?:man|woman)?/, tag: "strong Welsh accent", labels: ["welsh", "british"] },
  {
    pattern: /scottish|scots(?:man|woman)?|scotch|scot|glaswegian/,
    tag: "strong Scottish accent",
    labels: ["scottish", "british"],
  },
  { pattern: /irish(?:man|woman)?/, tag: "strong Irish accent", labels: ["irish"] },
  { pattern: /cockney/, tag: "strong Cockney accent", labels: ["british"] },
  {
    pattern: /british|english(?:man|woman)?|posh|londoner/,
    tag: "British accent",
    labels: ["british"],
  },
  { pattern: /australian|aussie/, tag: "strong Australian accent", labels: ["australian"] },
  {
    pattern: /southern|texan|redneck|hillbilly/,
    tag: "strong Southern American accent",
    labels: ["american"],
  },
  { pattern: /new york(?:er)?|brooklyn/, tag: "strong New York accent", labels: ["american"] },
  { pattern: /canadian/, tag: "Canadian accent", labels: ["canadian", "american"] },
  { pattern: /russian|soviet/, tag: "strong Russian accent", labels: ["russian"] },
  { pattern: /german/, tag: "strong German accent", labels: ["german"] },
  { pattern: /italian/, tag: "strong Italian accent", labels: ["italian"] },
  { pattern: /spanish/, tag: "strong Spanish accent", labels: ["spanish"] },
  { pattern: /mexican/, tag: "strong Mexican accent", labels: ["mexican", "spanish"] },
  { pattern: /brazilian/, tag: "strong Brazilian accent", labels: ["brazilian", "portuguese"] },
  { pattern: /indian/, tag: "strong Indian accent", labels: ["indian"] },
  { pattern: /jamaican/, tag: "strong Jamaican accent", labels: ["jamaican"] },
  { pattern: /swedish/, tag: "strong Swedish accent", labels: ["swedish"] },
  { pattern: /norwegian/, tag: "strong Norwegian accent", labels: ["norwegian"] },
  { pattern: /dutch(?:man|woman)?/, tag: "strong Dutch accent", labels: ["dutch"] },
  { pattern: /polish/, tag: "strong Polish accent", labels: ["polish"] },
  { pattern: /greek/, tag: "strong Greek accent", labels: ["greek"] },
  { pattern: /turkish/, tag: "strong Turkish accent", labels: ["turkish"] },
  { pattern: /japanese/, tag: "strong Japanese accent", labels: ["japanese"] },
  { pattern: /chinese/, tag: "strong Chinese accent", labels: ["chinese"] },
  {
    pattern: /south african/,
    tag: "strong South African accent",
    labels: ["south african", "african"],
  },
  { pattern: /nigerian/, tag: "strong Nigerian accent", labels: ["nigerian", "african"] },
].map((entry) => ({ ...entry, pattern: new RegExp(`\\b(?:${entry.pattern.source})\\b`, "i") }));

/** The accent asked for in the user's own words, as the Eleven tag text plus catalogue labels. */
export function detectAccent(text: string): { tag: string; labels: string[] } | undefined {
  const found = accents.find((entry) => entry.pattern.test(text));
  return found && { tag: found.tag, labels: found.labels };
}

/** Removes accent and nationality words, so they are not repeated as a performance tag. */
export const stripAccentWords = (text: string) =>
  accents.reduce((rest, entry) => rest.replace(new RegExp(entry.pattern.source, "gi"), " "), text);
