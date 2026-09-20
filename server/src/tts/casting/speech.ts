/** The text and settings sent to Eleven v3 for one scene: audio tags, emphasis and stability. */

import { type Scene, stripAccentWords, detectAccent } from "../scene/index.js";
import { regexEscape } from "./text.js";
import { intensityTag, sceneIntensity } from "./intensity.js";

/**
 * Eleven v3 understands free-form auditory directions in square brackets. Keep
 * this fallback provider-agnostic enough that an uncommon emotion does not
 * require a new hard-coded keyword before it becomes audible.
 */
function generalPerformanceCue(scene: Scene): string {
  let cue = (scene.delivery || "").trim();
  if (!cue) return "";
  const character = scene.character?.trim();
  if (character) cue = cue.replace(new RegExp(`^${regexEscape(character)}\\b`, "i"), "");
  cue = cue
    .replace(/"(?:\\.|[^"\\])*"|“[^”]*”|‘[^’]*’/g, "")
    .replace(/\b(?:says?|saying|speaks?|speaking)\b/gi, "")
    .replace(
      /\b(?:in|inside|into|through|over)\s+(?:a\s+|an\s+|the\s+)?(?:cave|church|cathedral|mountain|mountains|void|intercom|megaphone|walkie[ -]?talkie|telephone)\b/gi,
      "",
    )
    .replace(/\b(?:with\s+)?(?:extreme\s+)?(?:echo(?:ing)?|reverb)\b/gi, "")
    .replace(
      /\b(?:muffled|(?:from|behind|through)\s+(?:the\s+)?(?:outside|(?:a\s+|the\s+)?(?:closed\s+)?(?:door|wall)|another room|the other room|next door))\b/gi,
      "",
    )
    .replace(/\bdesperetaley\b/gi, "desperately")
    .replace(/[;,]?\s*\d+(?:[.,]\d+)?\s*(?:s|sec(?:ond)?s?)\b/gi, "")
    .replace(/[:;,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // The accent becomes its own tag, so "angry welshman" keeps just "angry" here.
  cue = stripAccentWords(cue).replace(/\s+/g, " ").trim();
  if (!cue || /^(?:neutral|natural|normal|default)(?: speech| delivery| voice)?$/i.test(cue))
    return "";
  // A long sentence is an explanation, and Eleven may read it aloud as speech.
  return cue.split(" ").length <= 4 ? cue : "";
}

const roomAndMetaWords =
  /\b(?:echo(?:es|ing|ed)?|reverb(?:erat\w*)?|cave|cavern|church|cathedral|intercom|megaphone|telephone|stability|voice id|preferred|volume|seconds?)\b/g;

/** Splits a bracket's text into short, lowercase tags and drops room or engine wording. */
function cleanTags(raw: string): string[] {
  return (
    raw
      .replace(/[[\]]/g, "")
      .split(/[,;]/)
      // A tag that talks about the place would be read aloud or ignored; the muffling is applied later.
      .filter((part) => !/\b(?:muffled?|outside|door|wall|behind|through|room)\b/i.test(part))
      .map((part) =>
        part
          .toLowerCase()
          .replace(roomAndMetaWords, " ")
          .replace(/[^\p{L}\p{N}' -]/gu, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((tag) => tag && tag.split(" ").length <= 4)
  );
}

/** Adds a tag once; empty tags are ignored. */
function addTag(tags: string[], tag: string) {
  if (tag && !tags.includes(tag)) tags.push(tag);
}

const SHOUT_TAG_WORD = /^(?:shout|yell|scream|shriek|roar|bellow)\w*$/;
const SOBBING = /\b(sob|sobs|sobbing|through tears|voice breaking)\b/;
const CRYING = /\b(sad|sadly|cry|cries|crying|tearful|upset|distressed)\b/;

/**
 * The planner may open a line with its own tags. Keep them, cleaned, and return what follows;
 * they are never touched by the emphasis rules, because upper-casing a tag turns it into
 * something the model ignores.
 */
function splitLeadingTags(dialogue: string) {
  const parts = dialogue.split(/(\[[^\]]*\])/).filter((part) => part.length);
  let cursor = 0;
  const lead: string[] = [];
  while (cursor < parts.length && (parts[cursor].startsWith("[") || !parts[cursor].trim())) {
    if (parts[cursor].startsWith("[")) lead.push(...cleanTags(parts[cursor]));
    cursor++;
  }
  return { lead, rest: parts.slice(cursor) };
}

/** The spoken words: tags cleaned, and upper-cased when the line is shouted or screamed. */
function emphasise(parts: string[], intense: boolean): string {
  return parts
    .map((part) =>
      part.startsWith("[")
        ? cleanTags(part)
            .map((tag) => `[${tag}]`)
            .join(" ")
        : intense
          ? part.toUpperCase()
          : part,
    )
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * A performance the planner forgot to tag still needs its emotion to be audible. Only the user's
 * own short direction is read; a model's explanation is not.
 */
function addFallbackCues(
  tags: string[],
  scene: Scene,
  shortDirection: string,
  intense: boolean,
  crying: boolean,
  sobbing: boolean,
) {
  if (/\b(sarcastic|sarcasm)\b/.test(shortDirection)) addTag(tags, "sarcastic");
  if (!intense && /\b(crazy|insane|frantic|excited|goofy|unstable)\b/.test(shortDirection))
    addTag(tags, "excited");
  if (!intense && /\b(whisper|whispers|whispering|quietly)\b/.test(shortDirection))
    addTag(tags, "whispers");
  if (crying) addTag(tags, "crying");
  if (sobbing) {
    addTag(tags, "sobbing");
    addTag(tags, "voice breaking");
  }
  if (/\b(desperate|desperately|desperetaley)\b/.test(shortDirection)) addTag(tags, "desperate");
  if (!tags.length || (intense && tags.length === 1)) {
    const cue = generalPerformanceCue({ ...scene, delivery: shortDirection ? scene.delivery : "" });
    if (cue && !/\b(?:scream|shout|yell)\w*/i.test(cue)) addTag(tags, cue.toLowerCase());
  }
}

/** Sad lines trail off; shouted lines end on an exclamation. */
function finishLine(rest: string, crying: boolean, intense: boolean): string {
  const closed = /[.!?…]\s*(?:\[[^\]]+])?\s*$/.test(rest);
  if (crying && !closed) return `${rest}…`;
  if (intense && !/[!?]\s*(?:\[[^\]]+])?\s*$/.test(rest))
    return `${rest.replace(/[.…]+\s*$/, "")}!`;
  return rest;
}

/** The request body for Eleven v3: the line with up to three audio tags in front of it. */
export function speechRequest(scene: Scene) {
  const intensity = sceneIntensity(scene);
  const intense = intensity !== "normal";
  const direction = `${scene.character || ""} ${scene.delivery || ""}`.toLowerCase();
  // Only the user's own short direction counts; a model's long explanation is not their wording.
  const shortDelivery = (scene.delivery || "").length <= 160;
  const accent = detectAccent(shortDelivery ? direction : scene.character || "");
  const shortDirection = shortDelivery ? direction : "";

  const { lead, rest: restParts } = splitLeadingTags(scene.dialogue);
  const rest = emphasise(restParts, intense);
  const hasInlineTags = /\[[^\]]+]/.test(rest);

  const tags: string[] = [];
  // Exactly one canonical intensity tag, however many the planner wrote.
  if (intense) addTag(tags, intensityTag[intensity]);
  for (const tag of lead) {
    if (intense && SHOUT_TAG_WORD.test(tag)) continue;
    if (accent && /\baccent\b/.test(tag)) continue;
    addTag(tags, tag);
  }

  const sobbing = SOBBING.test(shortDirection);
  const crying = sobbing || CRYING.test(shortDirection);
  if (!lead.length && !hasInlineTags)
    addFallbackCues(tags, scene, shortDirection, intense, crying, sobbing);
  // The engine writes the accent tag itself, right after the intensity, from the user's words.
  if (accent) tags.splice(tags[0] && intense ? 1 : 0, 0, accent.tag);
  const prefix = tags
    .slice(0, 3)
    .map((tag) => `[${tag}]`)
    .join(" ");

  return {
    text: `${prefix}${prefix ? " " : ""}${finishLine(rest, crying, intense)}`,
    model_id: "eleven_v3",
    // Eleven v3's Creative setting is needed for extreme delivery. A model
    // plan cannot accidentally turn a requested scream back into neutral speech.
    voice_settings: { stability: intense ? 0 : (scene.stability ?? 0.5) },
  };
}
