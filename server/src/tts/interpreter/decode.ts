/**
 * Reading the planner model's answer. The model only suggests: what the user actually wrote
 * (durations, shouting, rooms, echo, muffling, which parts are speech) always overrides it.
 */

import { z } from "zod";
import type { AccountVoice } from "../casting/index.js";
import {
  detectChannel,
  detectEffect,
  detectIntensity,
  detectMuffled,
  detectRoom,
  detectVoiceEffect,
  isExtreme,
  parsePauseSeconds,
  parseSpeechRate,
  parseTrailingDuration,
  scenesSchema,
  splitPromptSegments,
  type PromptSegment,
} from "../scene/index.js";
import { sanitizeSoundPrompt } from "../sound.js";

type RawScene = Record<string, unknown>;
type RawPlan = { scenes: RawScene[]; warnings: string[] };

const DISTANT_WORDS = /\b(distant|far away|faraway)\b/i;
const HAS_QUOTED_SPEECH = /"(?:\\.|[^"\\])+"|“[^”]+”|‘[^’]+’/;
const QUOTED_SPEECH = /"(?:\\.|[^"\\])*"|“[^”]*”|‘[^’]*’/g;
const BACKGROUND_WORDS = /\b(?:while|background|underneath|alongside)\b/i;
const INVALID_PLAN = "OpenAI returned an invalid scene plan. Try simplifying the prompt.";

/** How many scenes a prompt with ((...)) blocks must produce, or undefined for plain text. */
export function blockCount(prompt: string): number | undefined {
  const segments = splitPromptSegments(prompt);
  for (const segment of segments) {
    if (!segment.explicitBlock) continue;
    const timing = parseTrailingDuration(segment.text);
    if (timing && (timing.seconds < 0.5 || timing.seconds > 30))
      throw new Error("Scene durations must be between 0.5 and 30 seconds.");
    parseSpeechRate(segment.text);
    parsePauseSeconds(segment.text);
  }
  return segments.some((segment) => segment.explicitBlock) ? segments.length : undefined;
}

/** The plan as JSON text out of an OpenAI Responses reply, or an error the user can act on. */
function planText(response: any): string {
  if (response.status !== "completed")
    throw new Error("OpenAI did not finish the scene plan. Try a shorter prompt.");
  const content = (response.output || []).flatMap((item: any) =>
    item.type === "message" ? item.content || [] : [],
  );
  if (content.some((item: any) => item.type === "refusal"))
    throw new Error("OpenAI could not interpret this prompt. Try rephrasing it.");
  return (
    content
      .filter((item: any) => item.type === "output_text")
      .map((item: any) => item.text)
      .join("") || String(response.output_text || "")
  );
}

function parsePlan(text: string): RawPlan {
  try {
    const json = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return z
      .object({
        scenes: z.array(z.record(z.unknown())).min(1).max(10),
        warnings: z.array(z.string().max(1000)).max(20).default([]),
      })
      .parse(JSON.parse(json));
  } catch {
    throw new Error(INVALID_PLAN);
  }
}

/** Gives every scene valid values for the fields the model tends to omit or get wrong. */
function fillDefaults(scene: RawScene) {
  scene.dialogue = typeof scene.dialogue === "string" ? scene.dialogue : "";
  scene.sound = typeof scene.sound === "string" ? scene.sound : "";
  scene.voice = scene.voice === "voice2" ? "voice2" : "voice1";
  scene.duration = typeof scene.duration === "number" ? scene.duration : null;
  scene.effect = ["echo", "reverb", "both"].includes(String(scene.effect)) ? scene.effect : "none";
  scene.intensity =
    scene.intensity === "shout" || scene.intensity === "scream" ? scene.intensity : "normal";
  scene.backgroundVolume =
    typeof scene.backgroundVolume === "number"
      ? Math.max(0, Math.min(1, scene.backgroundVolume))
      : 0.22;
}

/** Plain text outside ((...)) is dialogue, exactly as written. */
function applyPlainText(scene: RawScene, segment: PromptSegment) {
  scene.dialogue = segment.text;
  scene.sound = "";
  scene.duration = null;
  scene.effect = "none";
  scene.intensity = "normal";
}

/** ((pause 2s)) is deliberate digital silence, never narration or a generated sound. */
function applySilence(scene: RawScene, seconds: number) {
  scene.dialogue = "";
  scene.sound = "__silence__";
  scene.character = "";
  scene.preferredVoiceId = "";
  scene.delivery = "Intentional silence";
  scene.effect = "none";
  scene.duration = seconds;
}

/** A block with no quoted words is a sound effect; the model must not turn it into narration. */
function applySoundBlock(scene: RawScene, segment: PromptSegment, index: number, plan: RawPlan) {
  if (typeof scene.sound !== "string" || !scene.sound.trim()) {
    scene.sound = segment.text
      .replace(/;\s*\d+(?:\.\d+)?s\s*$/i, "")
      .replace(/\b(?:with\s+)?(?:extreme\s+)?(?:echo(?:ing)?|reverb)\b/gi, "")
      .replace(/\b(?:in|inside)\s+(?:a\s+)?(?:cave|church|cathedral)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    plan.warnings.push(`Scene ${index + 1} was corrected from narration to a sound effect.`);
  }
  scene.dialogue = "";
  scene.character = "";
  scene.preferredVoiceId = "";
  scene.delivery = "Sound effect only; no spoken narration.";
  // Length and room are applied locally; a model's wording of them, or a
  // harsh adjective the user never wrote, must not reach the sound model.
  scene.sound = sanitizeSoundPrompt(String(scene.sound), segment.text) || String(scene.sound);
  // A duration is only ever the user's. A planner-invented one used to
  // squeeze speech and cut effect tails.
  const timing = parseTrailingDuration(segment.text);
  scene.duration = timing ? timing.seconds : null;
  scene.effect = detectEffect(segment.text);
  scene.channel = detectChannel(segment.text);
  scene.distant = DISTANT_WORDS.test(segment.text);
  scene.effectStrength = isExtreme(segment.text) ? "extreme" : "normal";
  scene.room = detectRoom(segment.text);
  scene.muffled = detectMuffled(segment.text) || undefined;
  scene.voiceEffect = detectVoiceEffect(segment.text);
}

/** A block with quoted words is speech; its directions outside the quotes are the user's. */
function applyDialogueBlock(scene: RawScene, segment: PromptSegment) {
  const outsideQuotes = segment.text.replace(QUOTED_SPEECH, "");
  if (!BACKGROUND_WORDS.test(outsideQuotes)) scene.sound = "";
  else scene.sound = sanitizeSoundPrompt(String(scene.sound), segment.text);
  const timing = parseTrailingDuration(segment.text);
  scene.duration = timing ? timing.seconds : null;
  // How hard to deliver the line is the user's call, in their own words.
  // A model's description of the scene must not decide it.
  const authoredIntensity = detectIntensity(outsideQuotes);
  if (authoredIntensity !== "normal") scene.intensity = authoredIntensity;
  // User-authored room/channel directions are authoritative. A planner
  // omission must not silently turn "in a cave" into dry studio speech.
  const authoredEffect = detectEffect(outsideQuotes);
  if (authoredEffect !== "none") scene.effect = authoredEffect;
  const authoredChannel = detectChannel(outsideQuotes);
  if (authoredChannel !== "clean") scene.channel = authoredChannel;
  if (DISTANT_WORDS.test(outsideQuotes)) scene.distant = true;
  if (isExtreme(outsideQuotes)) scene.effectStrength = "extreme";
  scene.room = detectRoom(outsideQuotes);
  scene.muffled = detectMuffled(outsideQuotes) || undefined;
  const authoredVoiceEffect = detectVoiceEffect(outsideQuotes);
  if (authoredVoiceEffect) scene.voiceEffect = authoredVoiceEffect;
  const speechRate = parseSpeechRate(segment.text);
  if (speechRate !== undefined) scene.speechRate = speechRate;
}

/**
 * Normalizes user-authored boundaries before strict validation, so a model mistake cannot merge
 * a following sound effect into the preceding speech.
 */
function enforceAuthoredScenes(plan: RawPlan, prompt: string | undefined) {
  for (const scene of plan.scenes) fillDefaults(scene);
  const segments = prompt ? splitPromptSegments(prompt) : [];
  for (const [index, segment] of segments.entries()) {
    const scene = plan.scenes[index];
    if (!segment.explicitBlock) {
      applyPlainText(scene, segment);
      continue;
    }
    const silence = parsePauseSeconds(segment.text);
    if (silence !== undefined) applySilence(scene, silence);
    else if (!HAS_QUOTED_SPEECH.test(segment.text)) applySoundBlock(scene, segment, index, plan);
    else applyDialogueBlock(scene, segment);
  }
}

/** Checks the chosen voices exist, and keeps a recurring character on one voice. */
function settleVoices(scenes: z.infer<typeof scenesSchema>, voices: AccountVoice[]) {
  const identities = new Map<string, string>();
  for (const scene of scenes) {
    scene.prepared = true;
    if (scene.preferredVoiceId && !voices.some((v) => v.voice_id === scene.preferredVoiceId))
      throw new Error("OpenAI selected an unavailable voice. Preview the scene again.");
    const identity = (scene.character || scene.voice).trim().toLowerCase();
    if (identities.has(identity)) scene.preferredVoiceId = identities.get(identity);
    else if (scene.preferredVoiceId) identities.set(identity, scene.preferredVoiceId);
  }
}

export function decodePlan(
  response: any,
  voices: AccountVoice[],
  expectedCount?: number,
  prompt?: string,
) {
  const plan = parsePlan(planText(response));
  if (expectedCount !== undefined && plan.scenes.length !== expectedCount)
    throw new Error(
      `OpenAI returned ${plan.scenes.length} scenes for ${expectedCount} ordered prompt sections. Preview again; no audio was generated.`,
    );
  enforceAuthoredScenes(plan, prompt);
  let scenes;
  try {
    scenes = scenesSchema.parse(plan.scenes);
  } catch {
    throw new Error(INVALID_PLAN);
  }
  settleVoices(scenes, voices);
  return { scenes, warnings: plan.warnings };
}
