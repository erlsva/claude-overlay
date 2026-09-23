/** What a scene is: the validated shape every part of the pipeline works with. */

import { z } from "zod";

export const sceneSchema = z
  .object({
    dialogue: z.string().max(2000),
    sound: z.string().max(1000),
    character: z.string().max(500).optional(),
    delivery: z.string().max(1000).optional(),
    channel: z.enum(["clean", "intercom", "walkie", "tincan", "radio"]).optional(),
    distant: z.boolean().optional(),
    /** A funny, request-only transformation. Independent of room/channel, so they can combine. */
    voiceEffect: z.enum(["chipmunk", "slowmo", "robot", "reversed", "underwater"]).optional(),
    effectStrength: z.enum(["normal", "extreme"]).optional(),
    /** Heard through a door or wall, or from another room. */
    muffled: z.boolean().optional(),
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
  })
  .refine(
    (scene) => scene.dialogue.trim() || scene.sound.trim(),
    "Each scene needs dialogue or a sound.",
  );

export const scenesSchema = z.array(sceneSchema).min(1).max(10);

export type Scene = z.infer<typeof sceneSchema>;

export type Intensity = NonNullable<Scene["intensity"]>;

export const intensityRank: Record<Intensity, number> = { normal: 0, shout: 1, scream: 2 };
