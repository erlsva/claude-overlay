/**
 * Reading the user's own words for how a line is delivered and where it is heard: shouting,
 * rooms, echo and reverb, and being behind a door. Only ever pass the user's wording, never a
 * model's explanation of it.
 */

import { Intensity, Scene } from "./schema.js";

const screamWords =
  /\b(?:scream(?:s|ing|ed)?|shriek(?:s|ing|ed)?|screech(?:es|ing|ed)?|bloodcurdling|top of (?:his|her|their|my|your) lungs)\b/i;

const shoutWords =
  /\b(?:yell(?:s|ing|ed)?|shout(?:s|ing|ed)?|bellow(?:s|ing|ed)?|roar(?:s|ing|ed)?|holler(?:s|ing|ed)?|loudly)\b/i;

/**
 * How hard the user asked for a line to be delivered. Only call this with the
 * user's own wording (never a model's explanation), so a planner that merely
 * describes a scene cannot accidentally turn speech into a scream.
 */
export function detectIntensity(text: string): Intensity {
  if (screamWords.test(text)) return "scream";
  if (shoutWords.test(text)) return "shout";
  return "normal";
}

/** "gigantic", "huge" and friends mean a stronger effect and a bigger sound. */
export const isExtreme = (text: string) =>
  /\b(?:extreme|huge|massive|gigantic|enormous|colossal|titanic)\b/i.test(text);

const wellPhrase = /\b(?:a|the)\s+(?:(?:deep|dark|old|dry|stone)\s+)*well\b(?!-)/i;

const indoorPhrase =
  /\b(?:indoors?|(?:in|inside)\s+(?:a|an|the)\s+(?:(?:small|large|big|empty|tiled)\s+)?(?:room|hall|house|building|bathroom|garage|warehouse|tunnel))\b/i;

/**
 * The kind of room. A cathedral is long, wide and bright; a well is narrow and
 * hollow; indoors is a small, close room. Anything else keeps the general reverb.
 */
export const detectRoom = (text: string): Scene["room"] =>
  /\b(?:church|cathedral)\b/i.test(text)
    ? "cathedral"
    : wellPhrase.test(text)
      ? "well"
      : indoorPhrase.test(text)
        ? "indoor"
        : undefined;

/**
 * What the voice or sound is transmitted through. Checked in this order so "walkie-talkie"
 * does not fall into the plainer "intercom" bucket. "radio" requires an "old"/"vintage" word
 * so it never fires for an unrelated character like "radio dj".
 */
export function detectChannel(text: string): Scene["channel"] {
  if (/\bwalkie[ -]?talkie\b/i.test(text)) return "walkie";
  if (/\btin can\b|\bstring phone\b|\btwo cans? and a string\b/i.test(text)) return "tincan";
  if (
    /\b(?:old|vintage|antique|1920s|1930s|old[- ]timey)\s+radio\b|\bradio broadcast\b/i.test(text)
  )
    return "radio";
  if (/\b(?:intercom|megaphone|telephone)\b/i.test(text)) return "intercom";
  return "clean";
}

// A funny, deliberate transformation of the voice or sound, distinct from where it is heard
// (room/channel/muffle) so they can combine: an underwater voice can still be in a cave.
const voiceEffects = (
  [
    { value: "chipmunk", pattern: /chipmunk|helium|sucked helium|munchkin/ },
    { value: "slowmo", pattern: /slow[ -]?mo(?:tion)?|slowed voice|wrong speed/ },
    { value: "robot", pattern: /robot(?:ic)?|vocoder|cyborg|android/ },
    { value: "reversed", pattern: /backwards?|reversed?|in reverse|played backward/ },
    { value: "underwater", pattern: /underwater|under water|drowning|submerged/ },
  ] satisfies Array<{ value: NonNullable<Scene["voiceEffect"]>; pattern: RegExp }>
).map((entry) => ({ ...entry, pattern: new RegExp(`\\b(?:${entry.pattern.source})\\b`, "i") }));

export function detectVoiceEffect(text: string): Scene["voiceEffect"] {
  return voiceEffects.find((entry) => entry.pattern.test(text))?.value;
}

/** Removes voice-effect trigger words, so a fallback performance tag never becomes "[underwater]". */
export const stripVoiceEffectWords = (text: string) =>
  voiceEffects.reduce(
    (rest, entry) => rest.replace(new RegExp(entry.pattern.source, "gi"), " "),
    text,
  );

/** "behind a door", "from outside", "muffled": heard through something, not in the room. */
export const detectMuffled = (text: string): boolean =>
  /\b(?:muffled|(?:behind|through)\s+(?:a|the)\s+(?:(?:closed|thick|locked|heavy)\s+)*(?:door|wall)|from\s+(?:the\s+)?(?:outside|other\s+side|another\s+room|next\s+door)|from\s+the\s+other\s+room|(?:on\s+)?the\s+other\s+side\s+of\s+(?:a|the)\s+(?:door|wall))\b/i.test(
    text,
  );

const echoWord = /\becho(?:es|ing|ed)?\b/i;

const roomWord = /\b(?:reverb(?:erat\w*)?|church|cathedral|cave|cavern)\b/i;

/**
 * Echo (repeats) and room (reverb) are separate things and can be asked for
 * together: "Reverb Echo", "a cave with echo", "down a well" (narrow and echoing).
 * Only pass the user's own wording, never a model's explanation.
 */
export function detectEffect(text: string): Scene["effect"] {
  const well = wellPhrase.test(text);
  const echo = echoWord.test(text) || well;
  const room = roomWord.test(text) || well || indoorPhrase.test(text);
  return echo && room ? "both" : echo ? "echo" : room ? "reverb" : "none";
}
