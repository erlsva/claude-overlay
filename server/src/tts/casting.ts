import type { Scene } from "./shared/scene.js";
export type AccountVoice = {
  voice_id: string;
  name: string;
  description?: string | null;
  labels?: Record<string, string>;
};
export type Casting = {
  scene: number;
  character: string;
  voiceId: string;
  voiceName: string;
  fallback: boolean;
};
const words = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) || [];
const regexEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizedVoiceName = (value: string) => words(value).join(" ");

/**
 * Named studio characters must be deterministic. Fuzzy casting remains useful
 * for open-ended prompts, but it must never replace a deliberately created
 * character voice with a merely similar catalogue voice.
 */
function pinnedCharacterVoice(character: string, voices: AccountVoice[]): AccountVoice | undefined {
  const normalizedCharacter = normalizedVoiceName(character);
  const exact = voices.find((voice) => normalizedVoiceName(voice.name) === normalizedCharacter);
  if (exact) return exact;

  const aliases: Array<{ requested: RegExp; voiceNames: string[] }> = [
    { requested: /\bpirate\b/, voiceNames: ["angry pirate"] },
    { requested: /\b(?:troll|ogre)\b/, voiceNames: ["troll ogre"] },
  ];
  const alias = aliases.find(({ requested }) => requested.test(normalizedCharacter));
  if (!alias) return undefined;
  return voices.find((voice) => alias.voiceNames.includes(normalizedVoiceName(voice.name)));
}

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
  return cue.slice(0, 120).trim();
}
function sustainFinalWord(value: string): string {
  return value.replace(/(\p{L}+)(?=[^\p{L}]*$)/u, (word) => {
    const vowels = [...word.matchAll(/[aeiouy]/gi)];
    const last = vowels.at(-1);
    if (!last || last.index === undefined) return word;
    const vowel = last[0];
    return `${word.slice(0, last.index)}${vowel.repeat(4)}${word.slice(last.index + vowel.length)}`;
  });
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
    const directions=scenes.filter(s=>(s.character?.trim()||s.voice).toLowerCase().replace(/\s+/g,' ')===character).map(s=>s.delivery||'').join(' ').toLowerCase();
    const needsIntensity=/\b(scream|screams|screaming|shout|shouts|shouting)\b/.test(directions);
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
        const age = voice.labels?.age || '';
        const ageScore = wantsOld ? (age === 'old' ? 300 : age === 'young' ? -50 : 0) : wantsYoung ? (age === 'young' ? 60 : age === 'old' ? -50 : 0) : 0;
        const intensityWords:Record<string,number>={screaming:90,fierce:55,intense:50,rough:30,energetic:25,hyped:25,dominant:25,powerful:25};
        const descriptionWords=new Set(words(description));
        const intensity=Object.entries(intensityWords).reduce((score,[word,weight])=>score+(descriptionWords.has(word)?weight:0),0);
        const relaxed=/\b(relaxed|calm|soothing|gentle|chill)\b/.test(description);
        const performanceScore=needsIntensity?intensity+(voice.labels?.use_case==='characters_animation'?25:0)-(relaxed?80:0):0;
        const matches = expanded.filter((t) =>
          words(description).includes(t),
        ).length;
        return {
          voice,
          matches,
          performanceScore,
          score:
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
    const bestVoice = pinnedCharacterVoice(character, available);
    const best = ranked.find(r=>r.voice.voice_id===bestVoice?.voice_id)
      || ranked.find(r=>r.voice.voice_id===scene.preferredVoiceId)
      || ranked[0];
    const choice = {
      scene: index,
      character,
      voiceId: best.voice.voice_id,
      voiceName: best.voice.name,
      fallback: best.matches === 0 && best.performanceScore<=0 && !(wantsOld && best.voice.labels?.age === 'old') && !(wantsYoung && best.voice.labels?.age === 'young'),
    };
    cache.set(character, choice);
    used.add(choice.voiceId);
    result.push(choice);
  }
  return result;
}
export function speechRequest(scene: Scene) {
  const direction =
    `${scene.character || ""} ${scene.delivery || ""}`.toLowerCase();
  const existingTags = [...scene.dialogue.matchAll(/\[([^\]]+)]/g)]
    .map((match) => match[1].toLowerCase())
    .join(" ");
  const tags: string[] = [];
  const hasTag = (pattern: RegExp) => pattern.test(existingTags);
  const addTag = (tag: string, equivalents: RegExp) => {
    if (!hasTag(equivalents)) tags.push(tag);
  };
  const screaming = /\b(scream|screams|screaming|yell|yells|yelling|top of (?:his |her |their )?lungs)\b/.test(direction);
  const shouting = screaming || /\b(loud|loudly|shout|shouts|shouting)\b/.test(direction);
  const sobbing = /\b(sob|sobs|sobbing|through tears|voice breaking)\b/.test(direction);
  const crying = sobbing || /\b(sad|sadly|cry|cries|crying|tearful|upset|distressed)\b/.test(direction);
  const monstrous = /\b(troll|ogre|monster|demon)\b/.test(direction);

  if (/\b(sarcastic|sarcasm)\b/.test(direction)) addTag("sarcastic", /sarcast/);
  if (!shouting && /\b(crazy|insane|frantic|excited|goofy|unstable)\b/.test(direction))
    addTag("excited", /excited|frantic|manic/);
  if (/\b(whisper|whispers|whispering|quietly)\b/.test(direction)) addTag("whispers", /whisper/);
  // Prefer ElevenLabs' documented [shouts] direction even when a planner used
  // the less reliable [screaming] wording.
  else if (shouting) addTag("shouts", /shout|yell/);
  if (screaming) {
    addTag("screaming at the top of his lungs", /scream(?:ing)? at|top of (?:his |her |their )?lungs/);
    if (/\b(desperate|desperately|desperetaley|harsh|harshly)\b/.test(direction)) {
      addTag("inhales sharply", /inhale/);
      addTag("desperate", /desperat/);
    }
  }
  if (monstrous) addTag("deep gravelly monstrous voice", /troll|ogre|monster|demon|gravel|monstrous/);
  if (crying) addTag("crying", /cry|tear/);
  if (sobbing) {
    addTag("sobbing", /sob/);
    addTag("voice breaking", /voice break/);
  }
  // If the planner or local parser supplied an uncommon direction, pass that
  // natural-language cue through instead of silently flattening it to neutral.
  // Existing authored/model tags take precedence and are never duplicated.
  const generalCue = existingTags ? "" : generalPerformanceCue(scene);
  if (generalCue && !tags.some((tag) => tag.toLowerCase() === generalCue.toLowerCase())) tags.push(generalCue);

  const prefix = tags.map((tag) => `[${tag}]`).join(" ");
  const spokenText = screaming
    ? sustainFinalWord(scene.dialogue.toUpperCase())
    : shouting
      ? scene.dialogue.toUpperCase()
      : scene.dialogue;
  const expressiveText = crying && !/[.!?…]\s*(?:\[[^\]]+])?\s*$/.test(spokenText)
    ? `${spokenText}…`
    : shouting && !/[!?]\s*(?:\[[^\]]+])?\s*$/.test(spokenText)
      ? `${spokenText}!!!`
      : spokenText;
  return {
    text: `${prefix}${prefix ? " " : ""}${expressiveText}`,
    model_id: "eleven_v3",
    // Eleven v3's Creative setting is needed for extreme delivery. A model
    // plan cannot accidentally turn a requested scream back into neutral speech.
    voice_settings: { stability: shouting ? 0 : (scene.stability ?? 0.5) },
  };
}
