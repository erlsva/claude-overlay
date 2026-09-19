import { detectIntensity, intensityRank, type Intensity, type Scene } from "./shared/scene.js";
export type AccountVoice = {
  voice_id: string;
  name: string;
  description?: string | null;
  /** premade voices ship with ElevenLabs; anything else was created in this account. */
  category?: string | null;
  labels?: Record<string, string>;
};
export type Casting = {
  scene: number;
  character: string;
  voiceId: string;
  voiceName: string;
  fallback: boolean;
  /** The voice was matched to the character by name, so it is already the right sound. */
  pinned: boolean;
};
const words = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) || [];
const regexEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizedVoiceName = (value: string) => words(value).join(" ");

/** The intensity of a scene. Planned scenes carry it explicitly; hand-written ones fall back to their short direction. */
export function sceneIntensity(scene: Scene): Intensity {
  if (scene.intensity) return scene.intensity;
  const direction = `${scene.character || ""} ${scene.delivery || ""}`;
  // A long delivery is a model's explanation, not the user's words.
  return (scene.delivery || "").length <= 160 ? detectIntensity(direction) : "normal";
}

// Words that describe a voice rather than name it.
const genericVoiceWords = new Set([
  "a", "an", "the", "voice", "man", "woman", "male", "female", "boy", "girl", "narrator", "character", "custom",
  "generated", "angry", "old", "young", "big", "small", "evil", "deep", "low", "loud", "of", "and",
]);

/**
 * Voices created in this ElevenLabs account are named after their character
 * ("Angry Pirate", "Troll / Ogre"). A request that mentions the character gets
 * that voice, deterministically, instead of a merely similar catalogue voice.
 * Anyone can add a character by creating a voice in ElevenLabs; no code change.
 */
function pinnedCharacterVoice(character: string, voices: AccountVoice[]): AccountVoice | undefined {
  const normalizedCharacter = normalizedVoiceName(character);
  const exact = voices.find((voice) => normalizedVoiceName(voice.name) === normalizedCharacter);
  if (exact) return exact;

  const characterWords = new Set(words(character));
  let best: { voice: AccountVoice; hits: number } | undefined;
  for (const voice of voices) {
    if (!voice.category || voice.category === "premade") continue;
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
function voicesFromSetting(setting: string | undefined, voices: AccountVoice[]): AccountVoice[] {
  const wanted = (setting || "").split(",").map((item) => item.trim()).filter(Boolean);
  const found: AccountVoice[] = [];
  for (const item of wanted) {
    const key = normalizedVoiceName(item);
    const voice = voices.find((candidate) => candidate.voice_id === item)
      || voices.find((candidate) => normalizedVoiceName(candidate.name) === key)
      || voices.find((candidate) => key && normalizedVoiceName(candidate.name).includes(key));
    if (voice && !found.includes(voice)) found.push(voice);
  }
  return found;
}

/**
 * Voices the owner wants for screaming and shouting, from TTS_SHOUT_VOICES.
 * ElevenLabs tags only work on voices that were trained for that range, so a
 * calm narrator cannot be talked into screaming.
 */
const configuredShoutVoices = (voices: AccountVoice[]) => voicesFromSetting(process.env.TTS_SHOUT_VOICES, voices);

/** Voices made in this account for a specific character, as opposed to ElevenLabs' general library. */
const isCharacterVoice = (voice: AccountVoice) => !!voice.category && voice.category !== "premade";

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
    .replace(/\b(?:in|inside|into|through|over)\s+(?:a\s+|an\s+|the\s+)?(?:cave|church|cathedral|mountain|mountains|void|intercom|megaphone|walkie[ -]?talkie|telephone)\b/gi, "")
    .replace(/\b(?:with\s+)?(?:extreme\s+)?(?:echo(?:ing)?|reverb)\b/gi, "")
    .replace(/\bdesperetaley\b/gi, "desperately")
    .replace(/[;,]?\s*\d+(?:[.,]\d+)?\s*(?:s|sec(?:ond)?s?)\b/gi, "")
    .replace(/[:;,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cue || /^(?:neutral|natural|normal|default)(?: speech| delivery| voice)?$/i.test(cue)) return "";
  // A long sentence is an explanation, and Eleven may read it aloud as speech.
  return cue.split(" ").length <= 4 ? cue : "";
}
function gender(text: string) {
  return /\b(woman|female|girl)\b/.test(text)
    ? "female"
    : /\b(man|male|boy)\b/.test(text)
      ? "male"
      : null;
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
    const character = (scene.character?.trim() || scene.voice)
      .toLowerCase()
      .replace(/\s+/g, " ");
    const previous = cache.get(character);
    if (previous) {
      result.push({ ...previous, scene: index });
      continue;
    }
    const requestedGender = gender(character);
    // Cast for the character's most demanding delivery across the whole script.
    // A neutral opening line must not lock a later scream to a relaxed narrator.
    const needsIntensity = scenes
      .filter((s) => (s.character?.trim() || s.voice).toLowerCase().replace(/\s+/g, " ") === character)
      .some((s) => intensityRank[sceneIntensity(s)] > 0);
    const wantsOld = /\b(elderly|old|senior|aged)\b/.test(character);
    const wantsYoung = /\b(young|youthful)\b/.test(character);
    const tokens = words(character).filter(
      (w) =>
        ![
          "a",
          "the",
          "voice",
          "man",
          "woman",
          "male",
          "female",
          "narrator",
        ].includes(w),
    );
    const related: Record<string, string[]> = {
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
    };
    const expanded = [
      ...new Set(tokens.flatMap((t) => [t, ...(related[t] || [])])),
    ];
    const intensityWords: Record<string, number> = {
      screaming: 90, shouting: 70, yelling: 70, fierce: 55, intense: 50, angry: 45, aggressive: 45, furious: 45,
      rough: 30, gruff: 25, growl: 25, energetic: 25, hyped: 25, dominant: 25, powerful: 25,
    };
    const ranked = available
      .map((voice) => {
        const description = [
          voice.name,
          voice.description,
          ...Object.values(voice.labels || {}),
        ]
          .join(" ")
          .toLowerCase();
        const voiceGender = voice.labels?.gender || gender(description);
        const age = voice.labels?.age || "";
        const ageScore = wantsOld ? (age === "old" ? 300 : age === "young" ? -50 : 0) : wantsYoung ? (age === "young" ? 60 : age === "old" ? -50 : 0) : 0;
        const descriptionWords = new Set(words(description));
        const intensity = Object.entries(intensityWords).reduce((score, [word, weight]) => score + (descriptionWords.has(word) ? weight : 0), 0);
        const relaxed = /\b(relaxed|calm|soothing|gentle|chill|laid-back|reassuring)\b/.test(description);
        const performanceScore = needsIntensity ? intensity + (voice.labels?.use_case === "characters_animation" ? 25 : 0) - (relaxed ? 80 : 0) : 0;
        const matches = expanded.filter((t) => words(description).includes(t)).length;
        return {
          voice,
          matches,
          performanceScore,
          intensityScore: intensity,
          score:
            (reserveCharacterVoices && isCharacterVoice(voice) ? -1000 : 0) +
            (requestedGender
              ? voiceGender === requestedGender
                ? 100
                : voiceGender
                  ? -100
                  : 0
              : 0) +
            matches * 10 + ageScore + performanceScore,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(used.has(a.voice.voice_id)) -
            Number(used.has(b.voice.voice_id)) ||
          a.voice.voice_id.localeCompare(b.voice.voice_id),
      );
    const pinnedVoice = pinnedCharacterVoice(character, available);
    let best = ranked.find((r) => r.voice.voice_id === pinnedVoice?.voice_id);
    if (!best && needsIntensity && shoutVoices.length) {
      // The owner named voices that can scream. Take the one that fits this character
      // best (a woman gets the woman's voice), and spread characters across the rest.
      best = ranked.find((r) => shoutVoices.some((voice) => voice.voice_id === r.voice.voice_id));
    }
    if (!best) {
      const preferred = ranked.find((r) => r.voice.voice_id === scene.preferredVoiceId);
      // The planner's pick is a suggestion. For a scream it must actually suit screaming,
      // otherwise a relaxed narrator is cast because a model liked its name.
      const preferredFits = preferred
        && !(reserveCharacterVoices && isCharacterVoice(preferred.voice))
        && (!needsIntensity || preferred.intensityScore > 0);
      best = preferredFits ? preferred : ranked[0];
      // A character with nothing to match on gets the owner's default voice, if set.
      if (!preferredFits && defaultVoice && !requestedGender && !needsIntensity && ranked[0].matches === 0)
        best = ranked.find((r) => r.voice.voice_id === defaultVoice.voice_id) || best;
    }
    const choice = {
      scene: index,
      character,
      voiceId: best.voice.voice_id,
      voiceName: best.voice.name,
      fallback: best.matches === 0 && best.performanceScore <= 0 && !(wantsOld && best.voice.labels?.age === "old") && !(wantsYoung && best.voice.labels?.age === "young"),
      pinned: !!pinnedVoice && best.voice.voice_id === pinnedVoice.voice_id,
    };
    cache.set(character, choice);
    used.add(choice.voiceId);
    result.push(choice);
  }
  return result;
}

// One short tag per intensity. ElevenLabs reads long, invented tags aloud or ignores them.
const intensityTag: Record<Intensity, string> = { normal: "", shout: "shouts", scream: "screaming" };
const roomAndMetaWords = /\b(?:echo(?:es|ing|ed)?|reverb(?:erat\w*)?|cave|cavern|church|cathedral|intercom|megaphone|telephone|stability|voice id|preferred|volume|seconds?)\b/g;

/** Splits a bracket's text into short, lowercase tags and drops room or engine wording. */
function cleanTags(raw: string): string[] {
  return raw
    .replace(/[[\]]/g, "")
    .split(/[,;]/)
    .map((part) => part.toLowerCase().replace(roomAndMetaWords, " ").replace(/[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((tag) => tag && tag.split(" ").length <= 4);
}

export function speechRequest(scene: Scene) {
  const intensity = sceneIntensity(scene);
  const intense = intensity !== "normal";
  const direction = `${scene.character || ""} ${scene.delivery || ""}`.toLowerCase();

  // Keep the planner's own tags, cleaned, and never touch them with the emphasis
  // rules below: upper-casing a tag turns it into something the model ignores.
  const parts = scene.dialogue.split(/(\[[^\]]*\])/).filter((part) => part.length);
  let cursor = 0;
  const lead: string[] = [];
  while (cursor < parts.length && (parts[cursor].startsWith("[") || !parts[cursor].trim())) {
    if (parts[cursor].startsWith("[")) lead.push(...cleanTags(parts[cursor]));
    cursor++;
  }
  const rest = parts
    .slice(cursor)
    .map((part) => (part.startsWith("[") ? cleanTags(part).map((tag) => `[${tag}]`).join(" ") : intense ? part.toUpperCase() : part))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
  const hasInlineTags = /\[[^\]]+]/.test(rest);

  const tags: string[] = [];
  const add = (tag: string) => {
    if (tag && !tags.includes(tag)) tags.push(tag);
  };
  // Exactly one canonical intensity tag, however many the planner wrote.
  if (intense) add(intensityTag[intensity]);
  for (const tag of lead) {
    if (intense && /^(?:shout|yell|scream|shriek|roar|bellow)\w*$/.test(tag)) continue;
    add(tag);
  }

  // A performance the planner forgot to tag still needs its emotion to be audible.
  // Only the user's own short direction is read; a model's explanation is not.
  const shortDirection = (scene.delivery || "").length <= 160 ? direction : "";
  const sobbing = /\b(sob|sobs|sobbing|through tears|voice breaking)\b/.test(shortDirection);
  const crying = sobbing || /\b(sad|sadly|cry|cries|crying|tearful|upset|distressed)\b/.test(shortDirection);
  if (!lead.length && !hasInlineTags) {
    if (/\b(sarcastic|sarcasm)\b/.test(shortDirection)) add("sarcastic");
    if (!intense && /\b(crazy|insane|frantic|excited|goofy|unstable)\b/.test(shortDirection)) add("excited");
    if (!intense && /\b(whisper|whispers|whispering|quietly)\b/.test(shortDirection)) add("whispers");
    if (crying) add("crying");
    if (sobbing) {
      add("sobbing");
      add("voice breaking");
    }
    if (/\b(desperate|desperately|desperetaley)\b/.test(shortDirection)) add("desperate");
    if (!tags.length || (intense && tags.length === 1)) {
      const cue = generalPerformanceCue({ ...scene, delivery: shortDirection ? scene.delivery : "" });
      if (cue && !/\b(?:scream|shout|yell)\w*/i.test(cue)) add(cue.toLowerCase());
    }
  }
  const prefix = tags.slice(0, 3).map((tag) => `[${tag}]`).join(" ");

  const closed = /[.!?…]\s*(?:\[[^\]]+])?\s*$/.test(rest);
  const expressiveText = crying && !closed
    ? `${rest}…`
    : intense && !/[!?]\s*(?:\[[^\]]+])?\s*$/.test(rest)
      ? `${rest.replace(/[.…]+\s*$/, "")}!`
      : rest;
  return {
    text: `${prefix}${prefix ? " " : ""}${expressiveText}`,
    model_id: "eleven_v3",
    // Eleven v3's Creative setting is needed for extreme delivery. A model
    // plan cannot accidentally turn a requested scream back into neutral speech.
    voice_settings: { stability: intense ? 0 : (scene.stability ?? 0.5) },
  };
}
