import { z } from "zod";

export const sceneSchema = z.object({
  dialogue: z.string().max(2000),
  sound: z.string().max(1000),
  character: z.string().max(500).optional(),
  delivery: z.string().max(1000).optional(),
  channel: z.enum(["clean", "intercom"]).optional(),
  distant: z.boolean().optional(),
  effectStrength: z.enum(["normal", "extreme"]).optional(),
  /** Which kind of reverb. Unset is a general small-to-medium room. */
  room: z.enum(["cathedral", "indoor", "well"]).optional(),
  /** How hard the line is delivered. Drives voice choice, tags and settings. */
  intensity: z.enum(["normal", "shout", "scream"]).optional(),
  prepared: z.boolean().optional(),
  preferredVoiceId: z.string().max(100).optional(),
  soundDuration: z.number().min(0.5).max(30).optional(),
  stability: z.number().min(0).max(1).optional(),
  speechRate: z.number().min(0.75).max(1.25).optional(),
  voice: z.enum(["voice1", "voice2"]),
  duration: z.number().min(0.5).max(30).nullable(),
  /** "both" is an echo and a room together. */
  effect: z.enum(["none", "echo", "reverb", "both"]),
  backgroundVolume: z.number().min(0).max(1),
}).refine((scene) => scene.dialogue.trim() || scene.sound.trim(), "Each scene needs dialogue or a sound.");

export const scenesSchema = z.array(sceneSchema).min(1).max(10);
export type Scene = z.infer<typeof sceneSchema>;
export type Intensity = NonNullable<Scene["intensity"]>;

const screamWords = /\b(?:scream(?:s|ing|ed)?|shriek(?:s|ing|ed)?|screech(?:es|ing|ed)?|bloodcurdling|top of (?:his|her|their|my|your) lungs)\b/i;
const shoutWords = /\b(?:yell(?:s|ing|ed)?|shout(?:s|ing|ed)?|bellow(?:s|ing|ed)?|roar(?:s|ing|ed)?|holler(?:s|ing|ed)?|loudly)\b/i;
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
export const isExtreme = (text: string) => /\b(?:extreme|huge|massive|gigantic|enormous|colossal|titanic)\b/i.test(text);
const wellPhrase = /\b(?:a|the)\s+(?:(?:deep|dark|old|dry|stone)\s+)*well\b(?!-)/i;
const indoorPhrase = /\b(?:indoors?|(?:in|inside)\s+(?:a|an|the)\s+(?:(?:small|large|big|empty|tiled)\s+)?(?:room|hall|house|building|bathroom|garage|warehouse|tunnel))\b/i;
/**
 * The kind of room. A cathedral is long, wide and bright; a well is narrow and
 * hollow; indoors is a small, close room. Anything else keeps the general reverb.
 */
export const detectRoom = (text: string): Scene["room"] =>
  /\b(?:church|cathedral)\b/i.test(text) ? "cathedral" : wellPhrase.test(text) ? "well" : indoorPhrase.test(text) ? "indoor" : undefined;

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
export const intensityRank: Record<Intensity, number> = { normal: 0, shout: 1, scream: 2 };
export type PromptSegment = { text: string; explicitBlock: boolean };

const normalize = (input: string) => input
  .replace(/&#(?:x20|32);|&nbsp;/gi, " ")
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&apos;|&#39;/gi, "'")
  .trim();

const durationNumber = "(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)";
export function parseTrailingDuration(value: string): { seconds: number; index: number } | undefined {
  const match = value.match(new RegExp(`[;,]?\\s*(${durationNumber})\\s*(?:s|sec(?:ond)?s?)\\s*$`, "i"));
  if (!match || match.index === undefined) return undefined;
  return { seconds: Number(match[1].replace(",", ".")), index: match.index };
}
const speechRateDirective = /(?:^|[;,])\s*(?:speed|rate)\s*[:=]?\s*(0(?:[.,]\d+)?|1(?:[.,]\d+)?|\.\d+)\s*x?\s*(?=$|[;,])/i;
export function parseSpeechRate(value: string): number | undefined {
  const precise = value.match(speechRateDirective);
  if (precise) {
    const rate = Number(precise[1].replace(",", "."));
    if (rate < 0.75 || rate > 1.25)
      throw new Error("TTS speech speed must be between 0.75x and 1.25x.");
    return rate;
  }
  const direction = withoutQuotedDialogue(value);
  if (/\b(?:very|much)\s+(?:slowly|slower)\b/i.test(direction)) return 0.75;
  if (/\b(?:slowly|slower)\b/i.test(direction)) return 0.9;
  if (/\b(?:very|much)\s+(?:quickly|faster|fast)\b/i.test(direction)) return 1.25;
  if (/\b(?:quickly|faster|fast)\b/i.test(direction)) return 1.1;
  return undefined;
}
export function stripSpeechRateDirective(value: string): string {
  return value.replace(speechRateDirective, " ").replace(/\s+/g, " ").trim();
}
export function parsePauseSeconds(value: string): number | undefined {
  const suffix = value.match(new RegExp(`^(?:silence|pause|silent pause)(?:\\s+for)?\\s*(?:[:,;]?\\s*(${durationNumber})\\s*(?:s|sec(?:ond)?s?))?$`, "i"));
  const prefix = value.match(new RegExp(`^(${durationNumber})\\s*(?:s|sec(?:ond)?s?)\\s+(?:of\\s+)?(?:silence|pause)$`, "i"));
  const match = suffix || prefix;
  if (!match) return undefined;
  const seconds = match[1] ? Number(match[1].replace(",", ".")) : 1;
  if (seconds < 0.5 || seconds > 30) throw new Error("Pause durations must be between 0.5 and 30 seconds.");
  return seconds;
}
const quotedDialogue = (value: string) => [
  ...value.matchAll(/"((?:\\.|[^"\\])*)"/g),
  ...value.matchAll(/“([^”]*)”/g),
  ...value.matchAll(/‘([^’]*)’/g),
].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
const withoutQuotedDialogue = (value: string) => value
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
    if (strayClose >= 0 && strayClose < start) throw new Error("Finish every TTS scene block with matching (( and )).");
    foundBlock = true;
    const before = text.slice(cursor, start).trim();
    if (before) segments.push({ text: before, explicitBlock: false });
    let end = -1;
    let quote: '"' | '“' | '‘' | null = null;
    let escaped = false;
    for (let index = start + 2; index < text.length - 1; index++) {
      const character = text[index];
      if (quote === '"' && character === "\\" && !escaped) { escaped = true; continue; }
      if (!escaped) {
        if (!quote && (character === '"' || character === '“' || character === '‘')) quote = character;
        else if ((quote === '"' && character === '"') || (quote === '“' && character === '”') || (quote === '‘' && character === '’')) quote = null;
        else if (!quote && text.startsWith("((", index)) throw new Error("TTS scene blocks cannot be nested.");
        else if (!quote && text.startsWith("))", index)) { end = index; break; }
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
      if (dialogue && speechRate !== undefined) scene.speechRate = speechRate;
      if (dialogue) scene.intensity = detectIntensity(direction);
      if (dialogue) {
        const before = description.slice(0, quotes[0].index).split(/\bwhile\b/i).pop()!;
        const describedCharacter = before
          .toLowerCase()
          .replace(/\b(?:says|saying|telling|speaking|speaks|screams|screaming|yells|yelling|shouts|shouting|whispers|whispering|cries|crying|sobs|sobbing)\b[\s\S]*$/i, "")
          .replace(/\b(?:with|echoing|echo|reverb|distant)\b/g, "")
          .replace(/^\s*(?:a|an|the)\s+/, "")
          .replace(/[:;,]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Keep a recurring human role stable even when each scene describes a
        // different location or performance. Those details belong in delivery.
        scene.character = describedCharacter.match(/^(?:(?:young|old|elderly|middle[ -]?aged)\s+)?(?:man|woman|boy|girl)\b/i)?.[0]
          || describedCharacter
          || "narrator";
        scene.delivery = direction.split(/\bwhile\b/i).pop()!.trim();
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
        scenes.push(base("", sound, voice, duration ? parseFloat(duration) : 5, detectEffect(match[2])));
      }
      end = match.index! + match[0].length;
    }
    if (text.slice(end).trim()) scenes.push(base(text.slice(end).trim(), "", voice));
  } else {
    scenes = [base(text)];
  }

  const parsed = scenesSchema.safeParse(scenes);
  if (!parsed.success) {
    throw new Error("Use 1–10 scenes, durations of 0.5–30 seconds, and nonempty dialogue or sound.");
  }
  return { scenes: parsed.data, warnings: [...new Set(warnings)] };
}
