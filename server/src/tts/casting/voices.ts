/** Finding voices in the ElevenLabs account: by character name, and by the owner's settings. */

import { AccountVoice } from "./types.js";
import { normalizedVoiceName, words } from "./text.js";

// Words that describe a voice rather than name it.
const genericVoiceWords = new Set([
  "a",
  "an",
  "the",
  "voice",
  "man",
  "woman",
  "male",
  "female",
  "boy",
  "girl",
  "narrator",
  "character",
  "custom",
  "generated",
  "angry",
  "old",
  "young",
  "big",
  "small",
  "evil",
  "deep",
  "low",
  "loud",
  "of",
  "and",
  // How something is said is not who says it. "troll screaming" must not match a voice
  // called "Screaming man" just because of the verb.
  "screaming",
  "screamer",
  "shouting",
  "shouter",
  "yelling",
  "yeller",
  "roaring",
  "screams",
  "shouts",
  "yells",
]);

/**
 * Voices created in this ElevenLabs account are named after their character
 * ("Angry Pirate", "Troll / Ogre"). A request that mentions the character gets
 * that voice, deterministically, instead of a merely similar catalogue voice.
 * Anyone can add a character by creating a voice in ElevenLabs; no code change.
 */
export function pinnedCharacterVoice(
  character: string,
  voices: AccountVoice[],
): AccountVoice | undefined {
  const normalizedCharacter = normalizedVoiceName(character);
  const exact = voices.find((voice) => normalizedVoiceName(voice.name) === normalizedCharacter);
  if (exact) return exact;

  const characterWords = new Set(words(character));
  let best: { voice: AccountVoice; hits: number } | undefined;
  for (const voice of voices) {
    if (!isCharacterVoice(voice)) continue;
    const keywords = new Set(
      voice.name
        .split(/[/|&,]|\band\b|\bor\b/i)
        .flatMap((part) => words(part))
        .filter((word) => !genericVoiceWords.has(word)),
    );
    const hits = [...keywords].filter((word) => characterWords.has(word)).length;
    if (hits > (best?.hits ?? 0)) best = { voice, hits };
  }
  if (best) return best.voice;

  // Older accounts whose voices do not report a category keep the two known characters.
  const aliases: Array<{ requested: RegExp; voiceNames: string[] }> = [
    { requested: /\bpirate\b/, voiceNames: ["angry pirate"] },
    { requested: /\b(?:troll|ogre)\b/, voiceNames: ["troll ogre"] },
  ];
  const alias = aliases.find(({ requested }) => requested.test(normalizedCharacter));
  if (!alias) return undefined;
  return voices.find((voice) => alias.voiceNames.includes(normalizedVoiceName(voice.name)));
}

/** Finds voices by ID, exact name or partial name, from a comma-separated setting. */
export function voicesFromSetting(
  setting: string | undefined,
  voices: AccountVoice[],
): AccountVoice[] {
  const wanted = (setting || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const found: AccountVoice[] = [];
  for (const item of wanted) {
    const key = normalizedVoiceName(item);
    const voice =
      voices.find((candidate) => candidate.voice_id === item) ||
      voices.find((candidate) => normalizedVoiceName(candidate.name) === key) ||
      voices.find((candidate) => key && normalizedVoiceName(candidate.name).includes(key));
    if (voice && !found.includes(voice)) found.push(voice);
  }
  return found;
}

/**
 * Voices the owner wants for screaming and shouting, from TTS_SHOUT_VOICES.
 * ElevenLabs tags only work on voices that were trained for that range, so a
 * calm narrator cannot be talked into screaming.
 */
export const configuredShoutVoices = (voices: AccountVoice[]) =>
  voicesFromSetting(process.env.TTS_SHOUT_VOICES, voices);

/**
 * Voices made in this account for a specific character: designed from scratch (Voice Design,
 * category "generated") or cloned from a recording (category "cloned"). A voice merely added
 * to the account from ElevenLabs' Voice Library (category "professional", or any other
 * non-premade category) was not created for a character here and behaves like a premade voice:
 * it stays in the general pool and is never reserved or name-pinned by a stray descriptive word.
 */
export const isCharacterVoice = (voice: AccountVoice) =>
  voice.category === "generated" || voice.category === "cloned";
