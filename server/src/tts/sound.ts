/**
 * Turns a planned sound description into the text sent to ElevenLabs Sound Effects.
 *
 * The model follows its prompt literally, so anything that is not the sound
 * itself hurts: durations ("for 10 seconds"), rooms ("echoing") and stray
 * adjectives ("high-pitched") all change what is generated. Room and length are
 * handled locally, so they must never reach the provider.
 */

import { atempoFilters } from "./audio/ffmpeg.js";
import { channelBandpass, pitchTempoRatio, RATE } from "./dsp/index.js";
import type { Scene } from "./scene/index.js";

const durationPhrase =
  /\b(?:for|lasting|over|about|around)?\s*\d+(?:[.,]\d+)?\s*(?:seconds?|secs?|s)\b/gi;
const roomWords =
  /\b(?:(?:with\s+)?(?:extreme\s+)?(?:echo(?:es|ing|ed)?|reverb(?:erat\w*)?)|(?:from\s+)?(?:far\s+)?(?:down|in|inside)\s+(?:a|the)\s+(?:(?:deep|dark|old|dry|stone)\s+)*well|(?:in|inside|through|within|across|under)\s+(?:a|an|the)?\s*(?:(?:large|huge|vast|big|grand|empty|echoing|stone|ancient)\s+)*(?:cave|cavern|church|cathedral|chapel|basilica)(?:\s+(?:space|interior|hall|chamber))?|cavernous)\b/gi;
const muffleWords =
  /\b(?:muffled|(?:from\s+)?(?:behind|through)\s+(?:a|the)\s+(?:(?:closed|thick|locked|heavy)\s+)*(?:door|wall)|from\s+(?:the\s+)?(?:outside|other\s+side|another\s+room|next\s+door))\b/gi;
const harshWords =
  /\b(?:high[- ]pitched|ear[- ]?piercing|ear[- ]?splitting|piercing|shrill|deafening)\b/gi;

// Words that describe the place or the effect rather than the sound itself.
const placeToken =
  /\b(?:echo\w*|reverb\w*|indoors?|acoustic\w*|repetition|repeating|bouncing|reflect\w*|spacious|soundscape|room|hall|space|cavern\w*|cave|cathedral|church|chapel|basilica|tunnel|effects?)\b|\b(?:a|the)\s+(?:(?:deep|dark|old|dry|stone)\s+)*well\b/i;
const connector =
  /\b(?:as if|coming from|from|in|inside|through|within|across|down|with|under|creating|replicating|emphasi[sz]ing|giving|producing|resulting in)\b/gi;
const danglingEnd =
  /\s+(?:as if|coming|from|far|in|inside|through|within|across|down|with|under|creating|and|of|the|a|an)\s*$/i;
function cleanEnd(value: string): string {
  let out = value.trim();
  while (danglingEnd.test(out)) out = out.replace(danglingEnd, "").trim();
  return out;
}

/**
 * Drops the parts of a description that talk about the room or the echo, however
 * the planner phrased them ("indoor space with natural", "distant repetition
 * creating a hollow effect"), and tidies what is left. Rooms and echoes are
 * added locally; the sound model would otherwise bake them in and we would get
 * them twice.
 */
export function stripRoomPhrases(text: string): string {
  const kept: string[] = [];
  for (const clause of text.split(/[,;]/)) {
    const at = clause.search(placeToken);
    if (at < 0) {
      kept.push(cleanEnd(clause));
      continue;
    }
    // Cut from the last connector before the room word ("down a well", "with … indoor").
    let cut = at;
    for (const match of clause.matchAll(connector))
      if ((match.index ?? 0) <= at) cut = match.index ?? at;
    const head = cleanEnd(clause.slice(0, cut));
    if (head) kept.push(head);
  }
  return kept.filter(Boolean).join(", ");
}

function tidy(text: string): string {
  return text
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])\s*(?=[,;:.])/g, "")
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Removes length and room wording, and harsh adjectives the user did not write
 * themselves. `authored` is the user's own text for this scene, when known.
 */
export function sanitizeSoundPrompt(sound: string, authored = ""): string {
  let clean = stripRoomPhrases(
    sound.replace(durationPhrase, " ").replace(roomWords, " ").replace(muffleWords, " "),
  );
  clean = clean.replace(harshWords, (word) =>
    authored && new RegExp(`\\b${word.replace(/[-\s]/g, "[- ]?")}\\b`, "i").test(authored)
      ? word
      : " ",
  );
  return tidy(clean);
}

type AnimalNote = {
  /** Words that name the animal in a request. */
  animal: RegExp;
  /** Words that mean the description already explains the call, so nothing is added. */
  covered: RegExp;
  note: string;
};

/**
 * Short, concrete descriptions of animals that sound models routinely get wrong
 * (foxes come out as birds of prey). To fix another animal, add a row.
 */
const animalNotes: AnimalNote[] = [
  {
    animal: /\bfox(?:es)?\b/i,
    covered: /\b(?:raspy|hoarse|guttural|yowl\w*|yap\w*)\b/i,
    note: "several red foxes calling to each other in a dark forest at night; raspy, hoarse, throaty and guttural, with rough breathy texture, like a distressed person screaming mixed with sharp yapping barks; ground-dwelling mammals",
  },
  {
    animal: /\bwol(?:f|ves)\b/i,
    covered: /\b(?:mournful|deep|rise|rising)\b/i,
    note: "several wolves howling; long, deep, mournful howls that rise and fall, answering each other",
  },
  {
    animal: /\b(?:cat|cats|kitten|kittens)\b/i,
    covered: /\b(?:yowl\w*|hiss\w*|throaty)\b/i,
    note: "domestic cats; drawn-out yowls and hisses, close and throaty",
  },
  {
    animal: /\b(?:dog|dogs|puppy|puppies)\b/i,
    covered: /\b(?:chesty|whine\w*)\b/i,
    note: "dogs; chesty, barking, with overlapping barks and occasional whines",
  },
  {
    animal: /\b(?:goat|goats)\b/i,
    covered: /\b(?:nasal|cracking|human-sounding)\b/i,
    note: "goats bleating; nasal, cracking, almost human-sounding bleats",
  },
  {
    animal: /\b(?:crow|crows|raven|ravens)\b/i,
    covered: /\b(?:rasping|harsh)\b/i,
    note: "crows; harsh, rasping caws that overlap",
  },
  {
    animal: /\b(?:seagull|seagulls|gull|gulls)\b/i,
    covered: /\b(?:squawk\w*|windy)\b/i,
    note: "seagulls; squawking, laughing calls over a windy coast",
  },
  {
    animal: /\b(?:pig|pigs|boar|boars)\b/i,
    covered: /\b(?:grunt\w*|snort\w*)\b/i,
    note: "pigs; low grunts, snorts and squeals",
  },
  {
    animal: /\b(?:monkey|monkeys|ape|apes|chimp|chimps)\b/i,
    covered: /\b(?:chatter\w*|hoot\w*)\b/i,
    note: "monkeys; excited chattering, hoots and screeches in a jungle",
  },
  {
    animal: /\b(?:bear|bears)\b/i,
    covered: /\b(?:chesty|growl\w*)\b/i,
    note: "a bear; deep chesty growls and roars",
  },
  {
    animal: /\b(?:lion|lions|tiger|tigers)\b/i,
    covered: /\b(?:resonant|rumbl\w*)\b/i,
    note: "big cats; deep, resonant roars and rumbling growls",
  },
];

const hugeWords = /\b(?:gigantic|giant|enormous|huge|massive|colossal|titanic|monstrous)\b/i;
/** The description asks for something oversized. */
export const isHugeSound = (sound: string) => hugeWords.test(sound);

/** How an oversized version of a common sound is described; the plain name produces an ordinary one. */
const hugeNotes: Array<{ source: RegExp; note: string }> = [
  {
    source: /\bfarts?\b/i,
    note: "a comically colossal fart: very deep, bass-heavy, long and drawn-out, rumbling and wobbling in pitch like a giant trumpet",
  },
  {
    source: /\b(?:burps?|belch\w*)\b/i,
    note: "a colossal, deep, rumbling burp that goes on and on",
  },
];

/** Adds a species note when the description names an animal and does not already explain its call. */
export function enrichSoundPrompt(sound: string): string {
  let result = sound;
  const animal = animalNotes.find(({ animal: name }) => name.test(sound));
  // The planner may already have written a precise description. Do not bury it.
  if (animal && !animal.covered.test(sound)) result += `. ${animal.note}`;
  if (isHugeSound(sound)) {
    const big = hugeNotes.find(({ source }) => source.test(sound));
    if (big && !/\b(?:bass|rumbl\w*|colossal)\b/i.test(sound)) result += `. ${big.note}`;
  } else if (/\bextreme(?:ly)?\b/i.test(sound)) {
    const big = hugeNotes.find(({ source }) => source.test(sound));
    if (big && !/\b(?:bass|rumbl\w*|colossal)\b/i.test(sound)) result += `. ${big.note}`;
  }
  return result;
}

/** The final Sound Effects prompt. */
export function buildSoundPrompt(sound: string): string {
  const clean = sanitizeSoundPrompt(sound) || sound.trim();
  return `${enrichSoundPrompt(clean)}. Realistic natural recording, dry with no echo or reverberation, no music, no narration.`;
}

/** Sounds that are naturally sharp in the 3-8 kHz range, where they feel painful when loud. */
const sharpSounds =
  /\b(?:scream\w*|shriek\w*|screech\w*|squeal\w*|whistl\w*|siren|alarm|bird|eagle|hawk|fox(?:es)?|cats?|kettle|feedback|squeak\w*|yowl\w*)\b/i;
export const isSharpSound = (sound: string) => sharpSounds.test(sound);

/**
 * FFmpeg filters applied to a generated effect before it is mixed with speech.
 * - Everything is softened slightly at the top end.
 * - Sharp sounds (shrieks, animal screams) are compressed, so their spikes do not
 *   jump out, and taken down harder in the painful 3-8 kHz band.
 * - Oversized sounds are slowed down: lower and longer, like something bigger.
 * - channel/voiceEffect apply the same transmission bandpass and chipmunk/slowmo warp a
 *   sound effect gets as speech does, so "a gunshot through a walkie-talkie" actually sounds
 *   like one. Robot/underwater are applied afterward, in Float32Array form, by the caller.
 */
export function soundDecodeFilter(
  sound: string,
  options: {
    channel?: Scene["channel"];
    voiceEffect?: Scene["voiceEffect"];
    /** Written speed (0.5 = half, 2 = double). Changes the pace only, never the pitch. */
    speed?: number;
  } = {},
): string {
  const filters = ["aresample=44100"];
  if (isHugeSound(sound)) filters.push("asetrate=30870", "aresample=44100");
  const warpRatio = pitchTempoRatio(options.voiceEffect);
  if (warpRatio) filters.push(`asetrate=${Math.round(RATE * warpRatio)}`, "aresample=44100");
  if (options.speed) filters.push(...atempoFilters(options.speed));
  filters.push(...channelBandpass(options.channel));
  filters.push("treble=g=-3:f=4500");
  if (isSharpSound(sound)) {
    filters.push(
      "acompressor=threshold=0.06:ratio=6:attack=3:release=60:makeup=1",
      "equalizer=f=3200:t=q:w=1.2:g=-6",
      "treble=g=-5:f=5500",
      "lowpass=f=8000",
    );
  }
  if (isHugeSound(sound)) filters.push("equalizer=f=90:t=q:w=1:g=5");
  return filters.join(",");
}

/**
 * A wordless scream or roar mixed under a shouted line. The voice model cannot
 * make a real scream, but the sound model can, so the two are combined: the
 * words stay intelligible and the layer supplies the raw strain.
 */
export function screamLayerPrompt(
  character: string | undefined,
  intensity: "shout" | "scream",
): string {
  const text = (character || "").toLowerCase();
  if (/\b(?:troll|ogre|monster|demon|orc|beast)\b/.test(text))
    return "a monster roaring and screaming with rage, raw and guttural, wordless, close recording";
  const who = /\b(?:woman|female|girl|lady|witch|queen)\b/.test(text) ? "woman" : "man";
  return intensity === "scream"
    ? `${who} screaming in terror, raw full-throated scream, wordless, close recording`
    : `${who} shouting angrily, raw hoarse yelling, wordless, close recording`;
}
