/** The small directives at the end of a ((...)) block: `;6s` durations, speech speed, pauses. */

import { withoutQuotedDialogue } from "./prompt.js";

export const normalize = (input: string) =>
  input
    .replace(/&#(?:x20|32);|&nbsp;/gi, " ")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .trim();

const durationNumber = "(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)";

export function parseTrailingDuration(
  value: string,
): { seconds: number; index: number } | undefined {
  const match = value.match(
    new RegExp(`[;,]?\\s*(${durationNumber})\\s*(?:s|sec(?:ond)?s?)\\s*$`, "i"),
  );
  if (!match || match.index === undefined) return undefined;
  return { seconds: Number(match[1].replace(",", ".")), index: match.index };
}

const speechRateDirective =
  /(?:^|[;,])\s*(?:speed|rate)\s*[:=]?\s*(0(?:[.,]\d+)?|1(?:[.,]\d+)?|\.\d+)\s*x?\s*(?=$|[;,])/i;

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
  const suffix = value.match(
    new RegExp(
      `^(?:silence|pause|silent pause)(?:\\s+for)?\\s*(?:[:,;]?\\s*(${durationNumber})\\s*(?:s|sec(?:ond)?s?))?$`,
      "i",
    ),
  );
  const prefix = value.match(
    new RegExp(`^(${durationNumber})\\s*(?:s|sec(?:ond)?s?)\\s+(?:of\\s+)?(?:silence|pause)$`, "i"),
  );
  const match = suffix || prefix;
  if (!match) return undefined;
  const seconds = match[1] ? Number(match[1].replace(",", ".")) : 1;
  if (seconds < 0.5 || seconds > 30)
    throw new Error("Pause durations must be between 0.5 and 30 seconds.");
  return seconds;
}
