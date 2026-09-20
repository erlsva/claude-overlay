/** Where the last spoken word sits in a clip, from ElevenLabs' character timings. */

export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export function finalWordTiming(
  alignment: Alignment | null | undefined,
): { start: number; end: number } | null {
  if (!alignment) return null;
  const text = alignment.characters.join("");
  const last = [...text.matchAll(/[\p{L}\p{N}']+/gu)].pop();
  if (!last) return null;
  const start = alignment.character_start_times_seconds[last.index!];
  const end = alignment.character_end_times_seconds[last.index! + last[0].length - 1];
  return Number.isFinite(start) && Number.isFinite(end) && end > start && start >= 0
    ? { start, end }
    : null;
}
