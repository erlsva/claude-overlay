import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getFeatureFlags } from "../db/index.js";
import { searchClips, type TtsClip } from "./store.js";

/**
 * The public clip list at /tts/public/clips. It needs no login, so it answers only when the owner
 * has switched it on, and it hands out nothing but what a visitor needs to find a clip and replay
 * it: never who asked for it, and never where the audio is stored.
 */
const PROMPT_LIMIT = 600;

const search = z.object({
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

/** Picks the public fields one at a time, so a field added to a saved clip later stays private. */
export function toPublicClip(clip: TtsClip) {
  return {
    id: clip.id,
    token: clip.token,
    prompt:
      clip.prompt.length > PROMPT_LIMIT
        ? `${clip.prompt.slice(0, PROMPT_LIMIT - 1)}…`
        : clip.prompt,
    createdAt: clip.createdAt,
    duration: clip.duration,
  };
}

export const publicClipsRouter = Router();

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again in a minute." },
});

publicClipsRouter.get("/clips", limiter, async (req, res) => {
  const flags = getFeatureFlags();
  if (!flags.tts || !flags.publicClips) {
    res.status(503).json({ error: "The public clip list is switched off.", disabled: true });
    return;
  }
  const parsed = search.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "That search is not valid." });
    return;
  }
  try {
    const { q, limit, offset } = parsed.data;
    const { clips, total } = await searchClips({ query: q, limit, offset });
    res.setHeader("Cache-Control", "public, max-age=10");
    res.json({ clips: clips.map(toPublicClip), total });
  } catch (error) {
    console.error("Public clip list failed", error);
    res.status(503).json({ error: "The clip list is unavailable right now." });
  }
});
