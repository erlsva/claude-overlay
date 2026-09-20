/** Splitting a prompt into ordered scenes: plain text, and ((...)) blocks. */

import {
  normalize,
  parsePauseSeconds,
  parseSpeechRate,
  parseTrailingDuration,
  stripSpeechRateDirective,
} from "./directives.js";
import { Scene, scenesSchema } from "./schema.js";
import { detectEffect, detectIntensity, detectMuffled, detectRoom, isExtreme } from "./detect.js";

export type PromptSegment = { text: string; explicitBlock: boolean };

const quotedDialogue = (value: string) =>
  [
    ...value.matchAll(/"((?:\\.|[^"\\])*)"/g),
    ...value.matchAll(/“([^”]*)”/g),
    ...value.matchAll(/‘([^’]*)’/g),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

export const withoutQuotedDialogue = (value: string) =>
  value
    .replace(/"(?:\\.|[^"\\])*"/g, "")
    .replace(/“[^”]*”/g, "")
    .replace(/‘[^’]*’/g, "");

/** Split mixed speech and ((directed scene)) blocks while retaining their order. */
export function splitPromptSegments(input: string): PromptSegment[] {
  const text = normalize(input);
  const segments: PromptSegment[] = [];
  let cursor = 0;
  let foundBlock = false;
  while (cursor < text.length) {
    const start = text.indexOf("((", cursor);
    const strayClose = text.indexOf("))", cursor);
    if (start < 0) {
      if (strayClose >= 0) throw new Error("Finish every TTS scene block with matching (( and )).");
      const remaining = text.slice(cursor).trim();
      if (remaining) segments.push({ text: remaining, explicitBlock: false });
      break;
    }
    if (strayClose >= 0 && strayClose < start)
      throw new Error("Finish every TTS scene block with matching (( and )).");
    foundBlock = true;
    const before = text.slice(cursor, start).trim();
    if (before) segments.push({ text: before, explicitBlock: false });
    let end = -1;
    let quote: '"' | "“" | "‘" | null = null;
    let escaped = false;
    for (let index = start + 2; index < text.length - 1; index++) {
      const character = text[index];
      if (quote === '"' && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }
      if (!escaped) {
        if (!quote && (character === '"' || character === "“" || character === "‘"))
          quote = character;
        else if (
          (quote === '"' && character === '"') ||
          (quote === "“" && character === "”") ||
          (quote === "‘" && character === "’")
        )
          quote = null;
        else if (!quote && text.startsWith("((", index))
          throw new Error("TTS scene blocks cannot be nested.");
        else if (!quote && text.startsWith("))", index)) {
          end = index;
          break;
        }
      }
      escaped = false;
    }
    if (end < 0) throw new Error("Finish every TTS scene block with matching (( and )).");
    const block = text.slice(start + 2, end).trim();
    if (!block) throw new Error("TTS scene blocks cannot be empty.");
    segments.push({ text: block, explicitBlock: true });
    cursor = end + 2;
  }
  if (!foundBlock) return text ? [{ text, explicitBlock: false }] : [];
  if (segments.length > 10) throw new Error("Use at most 10 speech and sound scenes.");
  return segments;
}

export function parsePrompt(input: string): { scenes: Scene[]; warnings: string[] } {
  const text = normalize(input);
  if (!text || text.length > 6000) {
    throw new Error("Enter a prompt between 1 and 6,000 characters.");
  }

  const warnings: string[] = [];
  const base = (
    dialogue = "",
    sound = "",
    voice: Scene["voice"] = "voice1",
    duration: number | null = null,
    effect: Scene["effect"] = "none",
  ): Scene => ({ dialogue, sound, voice, duration, effect, backgroundVolume: 0.22 });

  let scenes: Scene[] = [];
  const segments = splitPromptSegments(text);
  if (segments.some((segment) => segment.explicitBlock)) {
    for (const segment of segments) {
      if (!segment.explicitBlock) {
        scenes.push(base(segment.text));
        continue;
      }

      const pauseSeconds = parsePauseSeconds(segment.text);
      if (pauseSeconds !== undefined) {
        scenes.push(base("", "__silence__", "voice1", pauseSeconds));
        continue;
      }
      const timing = parseTrailingDuration(segment.text);
      const authoredDescription = timing
        ? segment.text.slice(0, timing.index).trim()
        : segment.text;
      const speechRate = parseSpeechRate(authoredDescription);
      const description = stripSpeechRateDirective(authoredDescription);
      const quotes = quotedDialogue(description);
      const dialogue = quotes.map((quote) => quote[1].replace(/\\"/g, '"')).join(" ");
      let sound = "";
      if (dialogue) {
        const background = description.match(/^(.+?)\s+(?:in the background\s+)?while\b/i);
        if (background) sound = background[1].replace(/\s+in the background$/i, "").trim();
      } else {
        sound = description;
      }

      const direction = withoutQuotedDialogue(description);
      const scene = base(
        dialogue,
        sound,
        /\bvoice2\b/i.test(direction) ? "voice2" : "voice1",
        timing?.seconds ?? null,
        detectEffect(direction),
      );
      scene.channel = /\b(intercom|megaphone|walkie[ -]?talkie|telephone)\b/i.test(direction)
        ? "intercom"
        : "clean";
      scene.distant = /\b(distant|far away|faraway)\b/i.test(direction);
      scene.effectStrength = isExtreme(direction) ? "extreme" : "normal";
      scene.room = detectRoom(direction);
      if (detectMuffled(direction)) scene.muffled = true;
      if (dialogue && speechRate !== undefined) scene.speechRate = speechRate;
      if (dialogue) scene.intensity = detectIntensity(direction);
      if (dialogue) {
        const before = description
          .slice(0, quotes[0].index)
          .split(/\bwhile\b/i)
          .pop()!;
        const describedCharacter = before
          .toLowerCase()
          .replace(
            /\b(?:says|saying|telling|speaking|speaks|screams|screaming|yells|yelling|shouts|shouting|whispers|whispering|cries|crying|sobs|sobbing)\b[\s\S]*$/i,
            "",
          )
          .replace(/\b(?:with|echoing|echo|reverb|distant)\b/g, "")
          .replace(/^\s*(?:a|an|the)\s+/, "")
          .replace(/[:;,]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Keep a recurring human role stable even when each scene describes a
        // different location or performance. Those details belong in delivery.
        scene.character =
          describedCharacter.match(
            /^(?:(?:young|old|elderly|middle[ -]?aged)\s+)?(?:man|woman|boy|girl)\b/i,
          )?.[0] ||
          describedCharacter ||
          "narrator";
        scene.delivery = direction
          .split(/\bwhile\b/i)
          .pop()!
          .trim();
      }
      scenes.push(scene);
    }
  } else if (/voice[12]\s*:|\([^()]*,\s*(?:echo,\s*|reverb,\s*)?\d+(?:\.\d+)?s\)/i.test(text)) {
    let voice: Scene["voice"] = "voice1";
    let end = 0;
    const tokens = /voice([12])\s*:|\(([^()]+)\)/gi;
    for (const match of text.matchAll(tokens)) {
      const speech = text.slice(end, match.index).trim();
      if (speech) scenes.push(base(speech, "", voice));
      if (match[1]) {
        voice = match[1] === "2" ? "voice2" : "voice1";
      } else {
        const parts = match[2].split(",").map((part) => part.trim());
        const duration = parts.find((part) => /^\d+(?:\.\d+)?s$/i.test(part));
        const sound = parts
          .filter((part) => !/^\d+(?:\.\d+)?s$|^(echo|reverb)$/i.test(part))
          .join(", ");
        scenes.push(
          base("", sound, voice, duration ? parseFloat(duration) : 5, detectEffect(match[2])),
        );
      }
      end = match.index! + match[0].length;
    }
    if (text.slice(end).trim()) scenes.push(base(text.slice(end).trim(), "", voice));
  } else {
    scenes = [base(text)];
  }

  const parsed = scenesSchema.safeParse(scenes);
  if (!parsed.success) {
    throw new Error(
      "Use 1–10 scenes, durations of 0.5–30 seconds, and nonempty dialogue or sound.",
    );
  }
  return { scenes: parsed.data, warnings: [...new Set(warnings)] };
}
