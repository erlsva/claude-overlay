import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getFeatureFlags } from "../db/index.js";
import { getClip, searchClips, type TtsClip } from "./store.js";

/**
 * The public clip list at /tts/public/clips, and one clip of it at /tts/public/clips/:id (what a
 * shared link opens, with the clip's waveform). They need no login, so they answer only when the owner has switched the
 * list on, and they hand out nothing but what a visitor needs to find a clip and replay it: never
 * who asked for it, and never where the audio is stored.
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

/**
 * A stored waveform, checked before it is handed out: a list of whole numbers from 0 to 100, or
 * null when the clip has none (or something else is stored there).
 */
export function sanitizePeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) return null;
  if (!value.every((peak) => typeof peak === "number" && Number.isFinite(peak))) return null;
  return value.map((peak) => Math.min(100, Math.max(0, Math.round(peak))));
}

export const publicClipsRouter = Router();

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again in a minute." },
});

/** Answers 503 and returns false while the owner has the public clips switched off. */
function listIsOn(res: Response): boolean {
  const flags = getFeatureFlags();
  if (flags.tts && flags.publicClips) return true;
  res.status(503).json({ error: "The public clip list is switched off.", disabled: true });
  return false;
}

publicClipsRouter.get("/clips", limiter, async (req, res) => {
  if (!listIsOn(res)) return;
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

publicClipsRouter.get("/clips/:id", limiter, async (req, res) => {
  if (!listIsOn(res)) return;
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
    res.status(400).json({ error: "That is not a clip address." });
    return;
  }
  try {
    const clip = await getClip(req.params.id);
    if (!clip) {
      res.status(404).json({ error: "That clip does not exist any more." });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=10");
    res.json({ ...toPublicClip(clip), peaks: sanitizePeaks(clip.peaks) });
  } catch (error) {
    console.error("Public clip lookup failed", error);
    res.status(503).json({ error: "That clip is unavailable right now." });
  }
});
