/**
 * Controlling TTS from outside the dashboard: a Stream Deck button, or anything else that can send
 * an HTTP request with a bearer token. `remoteTokensRouter` (owner/admin, a signed-in dashboard)
 * issues and revokes named tokens; `remoteControlRouter` (the token itself, no dashboard session)
 * acts on one.
 */

import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getFeatureFlags } from "../db/index.js";
import { persistTtsQueueSettings } from "./queueSettings.js";
import {
  checkRemoteToken,
  createRemoteToken,
  listRemoteTokens,
  revokeRemoteToken,
} from "./remoteTokens.js";
import {
  getTtsPlaybackState,
  pauseTtsPlayback,
  playNextTts,
  resumeTtsPlayback,
  restartTtsPlayback,
  setTtsHeld,
  setTtsPlaybackVolume,
  stopTtsPlayback,
  ttsQueue,
} from "./service.js";

export const remoteTokensRouter = Router();
remoteTokensRouter.get("/", async (_req, res) => {
  try {
    res.json(await listRemoteTokens());
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "Could not load the remote tokens.",
    });
  }
});
remoteTokensRouter.post("/", async (req, res) => {
  try {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    res.status(201).json(await createRemoteToken(name, req.authUser!.login));
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof z.ZodError
          ? "Give the token a short name."
          : error instanceof Error
            ? error.message
            : "Could not create the token.",
    });
  }
});
remoteTokensRouter.delete("/:id", async (req, res) => {
  res.json({ revoked: await revokeRemoteToken(req.params.id) });
});

const VOLUME_STEP = 0.1;
// Rounded to avoid floating-point noise (0.8 - 0.1 is 0.7000000000000001), which would look odd in
// a response and could make a Stream Deck's "field equals" check for an exact value never match.
const clampVolume = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
/** Pauses (true) or resumes (false) TTS, and says whether that changed anything. */
function setHeld(held: boolean): boolean {
  const changed = ttsQueue.isHeld() !== held;
  setTtsHeld(held);
  return changed;
}

/**
 * Checks the bearer token and the owner's TTS switch, the same way for every request. On success,
 * returns the token holder; on failure, it has already sent the error response, and the caller
 * should stop.
 */
async function authenticate(req: Request, res: Response): Promise<boolean> {
  const auth = req.headers.authorization;
  const presented = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
  const holder = presented && (await checkRemoteToken(presented));
  if (!holder) {
    res.status(401).json({ error: "Invalid or revoked TTS remote token." });
    return false;
  }
  if (!getFeatureFlags().tts) {
    res.status(503).json({ error: "TTS is currently disabled by the overlay owner." });
    return false;
  }
  return true;
}

export const remoteControlRouter = Router();
// A physical button may be pressed in quick succession, but this is still a control surface, not a
// way to generate TTS, so a fairly tight limit is plenty. A polling status check shares the same
// limit as button presses, since both hit this router.
remoteControlRouter.use(
  rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }),
);
// Read-only: for a Stream Deck's "poll a URL for status" (or anything else polling for the icon to
// follow), which only offers GET requests, not a JSON body.
remoteControlRouter.get("/", async (req, res) => {
  if (!(await authenticate(req, res))) return;
  res.json({ ok: true, action: "status", changed: false, ...getTtsPlaybackState() });
});
remoteControlRouter.post("/", async (req, res) => {
  if (!(await authenticate(req, res))) return;
  const input = z
    .object({
      action: z.enum([
        "pause-tts",
        "resume-tts",
        "toggle-tts",
        "play-next",
        "pause-clip",
        "resume-clip",
        "toggle-clip",
        "skip",
        "restart",
        "volume",
        "volume-up",
        "volume-down",
        "status",
      ]),
      value: z.number().min(0).max(1).optional(),
    })
    .safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Invalid remote action." });
    return;
  }
  const { action } = input.data;
  if (action === "volume" && input.data.value === undefined) {
    res.status(400).json({ error: "The volume action needs a value from 0 to 1." });
    return;
  }
  let changed = false;
  let heldChanged = false;
  if (action === "pause-tts") heldChanged = changed = setHeld(true);
  else if (action === "resume-tts") heldChanged = changed = setHeld(false);
  else if (action === "toggle-tts") heldChanged = changed = setHeld(!ttsQueue.isHeld());
  else if (action === "play-next") changed = playNextTts();
  else if (action === "pause-clip") changed = pauseTtsPlayback();
  else if (action === "resume-clip") changed = resumeTtsPlayback();
  else if (action === "toggle-clip")
    changed = getTtsPlaybackState().paused ? resumeTtsPlayback() : pauseTtsPlayback();
  else if (action === "skip") changed = stopTtsPlayback();
  else if (action === "restart") changed = restartTtsPlayback();
  else if (action === "volume") changed = setTtsPlaybackVolume(input.data.value!);
  else if (action === "volume-up")
    changed = setTtsPlaybackVolume(clampVolume((getTtsPlaybackState().volume ?? 0) + VOLUME_STEP));
  else if (action === "volume-down")
    changed = setTtsPlaybackVolume(clampVolume((getTtsPlaybackState().volume ?? 0) - VOLUME_STEP));
  // "status" changes nothing; it only reads.
  if (heldChanged) {
    try {
      await persistTtsQueueSettings();
    } catch (error) {
      console.error("Could not save the TTS queue settings from a remote", error);
      res.status(503).json({
        error: "That was changed, but it could not be saved, so a restart may undo it.",
        action,
        changed,
        ...getTtsPlaybackState(),
      });
      return;
    }
  }
  res.json({ ok: true, action, changed, ...getTtsPlaybackState() });
});
