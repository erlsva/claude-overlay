/** Choosing a voice for every character in a script. */

import { type Scene, detectAccent, intensityRank } from "../scene/index.js";
import { gender, impliedGender } from "./gender.js";
import { sceneIntensity } from "./intensity.js";
import { words } from "./text.js";
import type { AccountVoice, Casting } from "./types.js";
import {
  configuredShoutVoices,
  isCharacterVoice,
  pinnedCharacterVoice,
  voicesFromSetting,
} from "./voices.js";

/** Words that describe a character, and the words a catalogue voice would use for the same thing. */
const RELATED_WORDS: Record<string, string[]> = {
  crazy: ["energetic", "fierce", "quirky", "excited"],
  schizo: ["energetic", "quirky", "trickster", "intense"],
  unhinged: ["energetic", "fierce", "quirky", "intense"],
  deranged: ["energetic", "fierce", "intense", "rough"],
  paranoid: ["energetic", "quirky", "intense"],
  insane: ["energetic", "fierce", "intense", "rough"],
  frantic: ["energetic", "fierce"],
  sarcastic: ["dry", "trickster", "witty", "mischievous"],
  goofy: ["quirky", "playful", "trickster"],
  deep: ["resonant", "husky"],
  loud: ["dominant", "firm", "fierce"],
  giant: ["deep", "resonant", "powerful", "booming"],
  troll: ["deep", "rough", "gravelly", "monster", "creature"],
  ogre: ["deep", "rough", "gravelly", "monster", "creature"],
  monster: ["deep", "rough", "gravelly", "creature", "powerful"],
  demon: ["deep", "rough", "gravelly", "dark", "powerful"],
  // Common archetypes that are not screams or accents, mapped to the performance words a
  // catalogue voice actually describes itself with, so they land on more than one default voice.
  wizard: ["wise", "mature", "warm"],
  sage: ["wise", "mature"],
  king: ["classy", "formal", "confident", "dominant"],
  queen: ["classy", "formal", "confident"],
  villain: ["dominant", "smooth", "classy"],
  vampire: ["smooth", "classy", "velvety"],
  seductive: ["smooth", "velvety", "charming"],
  robot: ["neutral", "steady", "formal"],
  android: ["neutral", "steady", "formal"],
  teacher: ["clear", "engaging", "educator"],
  professor: ["clear", "engaging", "educator", "knowledgable"],
  dj: ["hyped", "energetic", "confident", "upbeat"],
  auctioneer: ["hyped", "energetic"],
  host: ["hyped", "energetic", "confident"],
};

/** How much a word in a voice's description says it can deliver a shout or scream. */
const INTENSITY_WORDS: Record<string, number> = {
  screaming: 90,
  shouting: 70,
  yelling: 70,
  fierce: 55,
  intense: 50,
  angry: 45,
  aggressive: 45,
  furious: 45,
  rough: 30,
  gruff: 25,
  growl: 25,
  energetic: 25,
  hyped: 25,
  dominant: 25,
  powerful: 25,
};

const RELAXED_VOICE = /\b(relaxed|calm|soothing|gentle|chill|laid-back|reassuring)\b/;
const NOT_A_TRAIT = ["a", "the", "voice", "man", "woman", "male", "female", "narrator"];

/** A character's name, normalised so "Angry  Pirate" and "angry pirate" are one character. */
const characterKey = (scene: Scene) =>
  (scene.character?.trim() || scene.voice).toLowerCase().replace(/\s+/g, " ");

/** What is known about the person a voice must suit. */
type Character = {
  key: string;
  requestedGender: string | null;
  /** Gender the request itself named ("woman", "man"...), as opposed to one only implied by a word like "demon". */
  explicitGender: string | null;
  accent: ReturnType<typeof detectAccent>;
  /** They shout or scream somewhere in the script, so a calm voice will not do. */
  needsIntensity: boolean;
  wantsOld: boolean;
  wantsYoung: boolean;
  /** The words to look for in voice descriptions, including their related words. */
  terms: string[];
};

function describeCharacter(key: string, scenes: Scene[]): Character {
  // Cast for the character's most demanding delivery across the whole script.
  // A neutral opening line must not lock a later scream to a relaxed narrator.
  const needsIntensity = scenes
    .filter((s) => characterKey(s) === key)
    .some((s) => intensityRank[sceneIntensity(s)] > 0);
  const tokens = words(key).filter((w) => !NOT_A_TRAIT.includes(w));
  return {
    key,
    requestedGender: gender(key) || impliedGender(key),
    explicitGender: gender(key),
    accent: detectAccent(key),
    needsIntensity,
    wantsOld:
      /\b(elderly|old|senior|aged|grandpa|grandma|granny|grandmother|granddad|gramps)\b/.test(key),
    wantsYoung: /\b(young|youthful)\b/.test(key),
    terms: [...new Set(tokens.flatMap((t) => [t, ...(RELATED_WORDS[t] || [])]))],
  };
}

type Ranked = {
  voice: AccountVoice;
  /** How many of the character's words appear in the voice's description. */
  matches: number;
  performanceScore: number;
  intensityScore: number;
  score: number;
};

function ageScore(character: Character, age: string): number {
  if (character.wantsOld) return age === "old" ? 300 : age === "young" ? -50 : 0;
  if (character.wantsYoung) return age === "young" ? 60 : age === "old" ? -50 : 0;
  return 0;
}

function genderScore(character: Character, voiceGender: string | null | undefined): number {
  if (!character.requestedGender) return 0;
  if (voiceGender === character.requestedGender) return 100;
  return voiceGender ? -100 : 0;
}

/** The gender a voice itself sounds like, from its label or its own name and description. */
function voiceGenderOf(voice: AccountVoice): string | null {
  if (voice.labels?.gender) return voice.labels.gender;
  const text = [voice.name, voice.description, ...Object.values(voice.labels || {})]
    .join(" ")
    .toLowerCase();
  return gender(text);
}

function scoreVoice(voice: AccountVoice, character: Character, reserveCharacterVoices: boolean) {
  const description = [voice.name, voice.description, ...Object.values(voice.labels || {})]
    .join(" ")
    .toLowerCase();
  const descriptionWords = new Set(words(description));
  const intensity = Object.entries(INTENSITY_WORDS).reduce(
    (score, [word, weight]) => score + (descriptionWords.has(word) ? weight : 0),
    0,
  );
  const performanceScore = character.needsIntensity
    ? intensity +
      (voice.labels?.use_case === "characters_animation" ? 25 : 0) -
      (RELAXED_VOICE.test(description) ? 80 : 0)
    : 0;
  const matches = character.terms.filter((t) => words(description).includes(t)).length;
  // A catalogue voice that already carries the accent is a better start than a neutral one.
  const accentScore = character.accent?.labels.some((label) =>
    (voice.labels?.accent || "").toLowerCase().includes(label),
  )
    ? 40
    : 0;
  const voiceGender = voiceGenderOf(voice);
  return {
    voice,
    matches,
    performanceScore,
    intensityScore: intensity,
    score:
      (reserveCharacterVoices && isCharacterVoice(voice) ? -1000 : 0) +
      genderScore(character, voiceGender) +
      matches * 10 +
      ageScore(character, voice.labels?.age || "") +
      performanceScore +
      accentScore,
  };
}

/** Every voice, best fit first. Ties go to a voice not yet used, so characters spread out. */
function rankVoices(
  available: AccountVoice[],
  character: Character,
  reserveCharacterVoices: boolean,
  used: Set<string>,
): Ranked[] {
  return available
    .map((voice) => scoreVoice(voice, character, reserveCharacterVoices))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(used.has(a.voice.voice_id)) - Number(used.has(b.voice.voice_id)) ||
        a.voice.voice_id.localeCompare(b.voice.voice_id),
    );
}

type Choice = {
  ranked: Ranked[];
  pinnedVoice: AccountVoice | undefined;
  shoutVoices: AccountVoice[];
  defaultVoice: AccountVoice | undefined;
  reserveCharacterVoices: boolean;
};

/**
 * In order of trust: the voice named after the character, then a voice the owner set aside for
 * screaming, then the planner's suggestion (if it suits), then simply the best fit.
 */
function chooseVoice(scene: Scene, character: Character, choice: Choice): Ranked {
  const { ranked, pinnedVoice, shoutVoices, defaultVoice, reserveCharacterVoices } = choice;
  const pinned = ranked.find((r) => r.voice.voice_id === pinnedVoice?.voice_id);
  // A pin, by exact or partial name match, is not allowed to override a gender the request
  // itself named: "demon woman" must not still get a voice whose own name and description say
  // male just because "demon" matched. An unknown or merely implied gender does not veto it.
  const pinnedFits =
    pinned &&
    (!character.explicitGender ||
      !voiceGenderOf(pinned.voice) ||
      voiceGenderOf(pinned.voice) === character.explicitGender);
  if (pinnedFits) return pinned;
  if (character.needsIntensity && shoutVoices.length) {
    // The owner named voices that can scream. Take the one that fits this character
    // best (a woman gets the woman's voice), and spread characters across the rest.
    const shouter = ranked.find((r) => shoutVoices.some((v) => v.voice_id === r.voice.voice_id));
    if (shouter) return shouter;
  }
  const preferred = ranked.find((r) => r.voice.voice_id === scene.preferredVoiceId);
  // The planner's pick is a suggestion. For a scream it must actually suit screaming,
  // otherwise a relaxed narrator is cast because a model liked its name. It must also not
  // contradict a gender the request itself named.
  const preferredFits =
    preferred &&
    !(reserveCharacterVoices && isCharacterVoice(preferred.voice)) &&
    (!character.needsIntensity || preferred.intensityScore > 0) &&
    (!character.explicitGender ||
      !voiceGenderOf(preferred.voice) ||
      voiceGenderOf(preferred.voice) === character.explicitGender);
  if (preferredFits) return preferred;
  // A character with nothing to match on gets the owner's default voice, if set.
  const nothingToMatch =
    defaultVoice &&
    !character.requestedGender &&
    !character.needsIntensity &&
    ranked[0].matches === 0;
  if (nothingToMatch)
    return ranked.find((r) => r.voice.voice_id === defaultVoice.voice_id) || ranked[0];
  return ranked[0];
}

export function castScenes(scenes: Scene[], voices: AccountVoice[]): Casting[] {
  const available = voices
    .filter((v) => v.voice_id)
    .sort((a, b) => a.voice_id.localeCompare(b.voice_id));
  const cache = new Map<string, Casting>();
  const result: Casting[] = [];
  const used = new Set<string>();
  const shoutVoices = configuredShoutVoices(available);
  const defaultVoice = voicesFromSetting(process.env.TTS_DEFAULT_VOICE, available)[0];
  // Character voices belong to their characters. Without this, plain speech or a
  // generic man could be voiced by the troll simply because nothing else matched.
  const reserveCharacterVoices = available.some((voice) => !isCharacterVoice(voice));

  for (const [index, scene] of scenes.entries()) {
    if (!scene.dialogue.trim()) continue;
    if (!available.length)
      throw new Error(
        "No voices are available in your ElevenLabs account. Add a voice to your account, then try again.",
      );
    const key = characterKey(scene);
    const previous = cache.get(key);
    if (previous) {
      result.push({ ...previous, scene: index });
      continue;
    }
    const character = describeCharacter(key, scenes);
    const pinnedVoice = pinnedCharacterVoice(key, available);
    const ranked = rankVoices(available, character, reserveCharacterVoices, used);
    const best = chooseVoice(scene, character, {
      ranked,
      pinnedVoice,
      shoutVoices,
      defaultVoice,
      reserveCharacterVoices,
    });
    const casting: Casting = {
      scene: index,
      character: key,
      voiceId: best.voice.voice_id,
      voiceName: best.voice.name,
      fallback:
        best.matches === 0 &&
        best.performanceScore <= 0 &&
        !(character.wantsOld && best.voice.labels?.age === "old") &&
        !(character.wantsYoung && best.voice.labels?.age === "young"),
      pinned: !!pinnedVoice && best.voice.voice_id === pinnedVoice.voice_id,
    };
    cache.set(key, casting);
    used.add(casting.voiceId);
    result.push(casting);
  }
  return result;
}
