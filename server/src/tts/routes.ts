import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { postgresConfigured } from "../db/postgres.js";
import { getFeatureFlags } from "../db/index.js";
import { audioUrl, deleteUploadedClip, discordStorageConfigured } from "./discord.js";
import { publicClipsRouter } from "./publicClips.js";
import { ffmpegAvailable } from "./audio/index.js";
import { MAX_GAP_SECONDS } from "./queue.js";
import { persistTtsQueueSettings } from "./queueSettings.js";
import { remoteControlRouter, remoteTokensRouter } from "./remote.js";
import {
  clearWaitingJobs,
  getTtsPlaybackState,
  jobs,
  pauseTtsPlayback,
  playNextTts,
  preview,
  removeWaitingJob,
  restartTtsPlayback,
  resumeTtsPlayback,
  setTtsGapSeconds,
  setTtsHeld,
  setTtsPlaybackVolume,
  setTtsShowEmote,
  setTtsShowPrompt,
  stopTtsPlayback,
  submit,
  ttsQueue,
  waitingJobs,
} from "./service.js";
import { deleteClip, getClip, listClips, ttsMetadataStorageConfigured } from "./store.js";

export const ttsRouter = Router();
const audioAccess = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

async function status() {
  const services = {
    openai: !!process.env.OPENAI_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    ffmpeg: await ffmpegAvailable(),
    metadata: ttsMetadataStorageConfigured(),
    audioStorage: discordStorageConfigured(),
  };
  return {
    configured: Object.values(services).every(Boolean),
    canReplay: services.metadata && services.audioStorage,
    storageProvider: `Discord attachments + ${postgresConfigured() ? "Neon" : "local"} index`,
    services,
  };
}

// Audio URLs are unguessable clip capabilities, usable by the OBS browser source and by the
// public clip page's player and download link. This only redirects, so the audio itself is sent
// by the store and never counts against this server's bandwidth.
ttsRouter.get("/clips/:id/audio", audioAccess, async (req, res) => {
  try {
    if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
      res.sendStatus(400);
      return;
    }
    const clip = await getClip(req.params.id);
    if (!clip) {
      res.sendStatus(404);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.redirect(await audioUrl(clip));
  } catch {
    res.status(502).json({ error: "Saved audio could not be loaded from Discord." });
  }
});
// Public, and off until the owner switches it on; see publicClips.ts.
ttsRouter.use("/public", publicClipsRouter);
// A Stream Deck (or anything else) authenticates with its own bearer token, not a dashboard
// session, so this is mounted ahead of requireAuth. It checks the feature flag itself.
ttsRouter.use("/remote", remoteControlRouter);
ttsRouter.use(requireAuth);
// Managing remote tokens is an owner/admin action from a signed-in dashboard, kept ahead of the
// "TTS disabled" gate below: tokens can still be issued or revoked while TTS itself is switched off.
ttsRouter.use("/remote-tokens", requireAdmin, remoteTokensRouter);
ttsRouter.use((_req, res, next) => {
  if (!getFeatureFlags().tts) {
    res.status(503).json({ error: "TTS is currently disabled by the overlay owner." });
    return;
  }
  next();
});
ttsRouter.use(
  rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const expensive = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
ttsRouter.get("/status", async (_req, res) => res.json(await status()));
ttsRouter.get("/state", async (_req, res) => {
  try {
    const [readiness, clips] = await Promise.all([status(), listClips()]);
    res.json({
      status: readiness,
      playback: getTtsPlaybackState(),
      clips,
      jobs: [...jobs.values()].reverse().slice(0, 20),
      queue: waitingJobs(),
    });
  } catch {
    res.status(503).json({
      error: "TTS storage unavailable. Check DATABASE_URL and the server logs.",
    });
  }
});
ttsRouter.get("/clips", async (_req, res) => {
  try {
    res.json(await listClips());
  } catch {
    res.status(503).json({ error: "TTS storage unavailable. Check DATABASE_URL." });
  }
});
ttsRouter.get("/jobs", (_req, res) => res.json([...jobs.values()].reverse().slice(0, 20)));
ttsRouter.post("/preview", expensive, async (req, res) => {
  try {
    const { prompt } = z.object({ prompt: z.string().trim().min(1).max(6000) }).parse(req.body);
    res.json(await preview(prompt, req.authUser!.id));
  } catch (e) {
    res.status(400).json({
      error:
        e instanceof z.ZodError
          ? "Invalid prompt."
          : e instanceof Error
            ? e.message
            : "Preview failed.",
    });
  }
});
ttsRouter.post("/generate", expensive, async (req, res) => {
  try {
    const input = z
      .object({
        prompt: z.string().trim().min(1).max(6000),
        planId: z.string().uuid().optional(),
        play: z.boolean().default(true),
      })
      .parse(req.body);
    const { job } = submit({
      ...input,
      // Pressed by hand in the dashboard, so it plays now instead of waiting in the queue.
      direct: true,
      owner: req.authUser!.id,
      sender: req.authUser!.displayName || req.authUser!.login,
    });
    res.status(202).json(job);
  } catch (e) {
    res.status(400).json({
      error:
        e instanceof z.ZodError
          ? "Invalid TTS request."
          : e instanceof Error
            ? e.message
            : "Generation failed.",
    });
  }
});
// Skips the clip that is playing: it ends at once and the queue moves on to the next request.
ttsRouter.post("/stop", (_req, res) => res.json({ stopped: stopTtsPlayback() }));
ttsRouter.post("/playback", async (req, res) => {
  let input;
  try {
    input = z
      .discriminatedUnion("action", [
        // The clip that is playing.
        z.object({ action: z.literal("pause") }),
        z.object({ action: z.literal("resume") }),
        z.object({ action: z.literal("restart") }),
        z.object({ action: z.literal("volume"), volume: z.number().min(0).max(1) }),
        // TTS as a whole: paused requests wait in the queue instead of playing.
        z.object({ action: z.literal("hold") }),
        z.object({ action: z.literal("release") }),
        z.object({ action: z.literal("next") }),
        z.object({
          action: z.literal("gap"),
          seconds: z.number().int().min(0).max(MAX_GAP_SECONDS),
        }),
        // Whether the overlay shows the TTS icon.
        z.object({ action: z.literal("emote"), show: z.boolean() }),
        // Whether the overlay shows the now-playing card (who asked, and the prompt).
        z.object({ action: z.literal("prompt"), show: z.boolean() }),
      ])
      .parse(req.body);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid playback control.",
    });
    return;
  }
  let changed = false;
  let saveSettings = false;
  if (input.action === "pause") changed = pauseTtsPlayback();
  else if (input.action === "resume") changed = resumeTtsPlayback();
  else if (input.action === "restart") changed = restartTtsPlayback();
  else if (input.action === "volume") changed = setTtsPlaybackVolume(input.volume);
  else if (input.action === "next") changed = playNextTts();
  else if (input.action === "prompt") {
    changed = getTtsPlaybackState().showPrompt !== input.show;
    setTtsShowPrompt(input.show);
    saveSettings = true;
  } else if (input.action === "emote") {
    changed = getTtsPlaybackState().showEmote !== input.show;
    setTtsShowEmote(input.show);
    saveSettings = true;
  } else if (input.action === "gap") {
    changed = ttsQueue.gapSeconds() !== input.seconds;
    setTtsGapSeconds(input.seconds);
    saveSettings = true;
  } else {
    const held = input.action === "hold";
    changed = ttsQueue.isHeld() !== held;
    setTtsHeld(held);
    saveSettings = true;
  }
  if (saveSettings) {
    try {
      await persistTtsQueueSettings();
    } catch (error) {
      console.error("Could not save the TTS queue settings", error);
      res.status(503).json({
        error: "That was changed, but it could not be saved, so a restart may undo it.",
        state: getTtsPlaybackState(),
      });
      return;
    }
  }
  res.json({ changed, state: getTtsPlaybackState() });
});
// Takes one waiting request out of the queue, or empties it.
ttsRouter.delete("/jobs/:id", (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    res.status(400).json({ error: "Invalid request ID." });
    return;
  }
  if (!removeWaitingJob(req.params.id)) {
    res.status(409).json({ error: "That request is already playing, or has finished." });
    return;
  }
  res.json({ removed: true });
});
ttsRouter.post("/queue/clear", (_req, res) => res.json({ cleared: clearWaitingJobs() }));
ttsRouter.delete("/clips/:id", async (req, res) => {
  try {
    if (!/^[a-f0-9]{32}$/.test(req.params.id)) {
      res.status(400).json({ error: "Invalid TTS clip ID." });
      return;
    }
    const clip = await getClip(req.params.id);
    if (!clip) {
      res.status(404).json({ error: "That saved TTS clip no longer exists." });
      return;
    }
    await deleteUploadedClip(clip.discordMessageId);
    await deleteClip(clip.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Could not delete the saved clip.",
    });
  }
});
