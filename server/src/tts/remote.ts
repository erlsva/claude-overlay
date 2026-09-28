/**
 * Controlling the dashboard from outside it: a Stream Deck button, or anything else that can send
 * an HTTP request with a bearer token. Started as TTS-only (hence still living under `/tts/remote`,
 * and still called `remoteControlRouter` where it began), it now also reaches the chat emote
 * overlay; the URL stays put so buttons already configured against it keep working.
 * `remoteTokensRouter` (owner/admin, a signed-in dashboard) issues and revokes named tokens;
 * `remoteControlRouter` (the token itself, no dashboard session) acts on one.
 */

import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  CHAT_EMOTE_SIZE_STEP,
  chatEmoteRemoteState,
  setChatEmoteEnabled,
  stepChatEmoteMotion,
  stepChatEmoteSize,
  toggleChatEmoteDirection,
} from "../chat-emotes/control.js";
import { getFeatureFlags } from "../db/index.js";
import { io } from "../runtime.js";
import { persistTtsQueueSettings } from "./queueSettings.js";
import { describeRemoteAction, recordRemoteActivity } from "./remoteActivity.js";
import {
  checkRemoteToken,
  createRemoteToken,
  listRemoteTokens,
  revokeRemoteToken,
  type RemoteToken,
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

/** Every action that touches TTS itself, as opposed to some other part of the dashboard. */
const TTS_ACTION_LIST = [
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
] as const;
const TTS_ACTIONS: ReadonlySet<string> = new Set(TTS_ACTION_LIST);
const ACTIONS = [
  ...TTS_ACTION_LIST,
  "status",
  "emotes-on",
  "emotes-off",
  "toggle-emotes",
  "toggle-emote-direction",
  "emote-size-up",
  "emote-size-down",
  "emote-style-next",
  "emote-style-previous",
] as const;

/** The full state a remote response shows: TTS playback plus the chat emote overlay's own controls. */
const remoteState = () => ({ ...getTtsPlaybackState(), emotes: chatEmoteRemoteState() });

/**
 * Checks the bearer token. On success, returns who it belongs to; on failure, it has already sent
 * the error response (and logged why, to the server console, so a rejected request is visible
 * without needing to reproduce it), and the caller should stop.
 */
async function authenticate(req: Request, res: Response): Promise<RemoteToken | undefined> {
  const auth = req.headers.authorization;
  const presented = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
  const holder = presented && (await checkRemoteToken(presented));
  if (!holder) {
    // The token's own id (never its secret) is safe to log: it is a lookup key, not a credential,
    // and seeing it helps tell which button sent a token that no longer works.
    const id = presented?.split(".")[1];
    console.log(`TTS remote: refused${id ? ` (unknown or revoked token ${id})` : " (no token)"}`);
    res.status(401).json({ error: "Invalid or revoked remote token." });
    return undefined;
  }
  return holder;
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
// Not logged on success: a poll fires every few seconds for as long as a button is configured to
// poll, so logging every one would drown out the button presses actually worth seeing. A failed
// poll is still logged, by authenticate() itself, since a poll that stops working is worth knowing.
remoteControlRouter.get("/", async (req, res) => {
  if (!(await authenticate(req, res))) return;
  res.json({ ok: true, action: "status", changed: false, ...remoteState() });
});
remoteControlRouter.post("/", async (req, res) => {
  const holder = await authenticate(req, res);
  if (!holder) return;
  const input = z
    .object({
      action: z.enum(ACTIONS),
      value: z.number().min(0).max(1).optional(),
    })
    .safeParse(req.body);
  if (!input.success) {
    console.log(`TTS remote: ${holder.name} sent an invalid request`);
    res.status(400).json({ error: "Invalid remote action." });
    return;
  }
  const { action } = input.data;
  if (action === "volume" && input.data.value === undefined) {
    console.log(`TTS remote: ${holder.name} -> volume, refused (no value given)`);
    res.status(400).json({ error: "The volume action needs a value from 0 to 1." });
    return;
  }
  if (TTS_ACTIONS.has(action) && !getFeatureFlags().tts) {
    console.log(`TTS remote: ${holder.name} -> ${action}, refused (TTS is switched off)`);
    res.status(503).json({ error: "TTS is currently disabled by the overlay owner." });
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
  else if (action === "emotes-on") changed = setChatEmoteEnabled(io, true);
  else if (action === "emotes-off") changed = setChatEmoteEnabled(io, false);
  else if (action === "toggle-emotes") changed = setChatEmoteEnabled(io);
  else if (action === "toggle-emote-direction") changed = toggleChatEmoteDirection(io);
  else if (action === "emote-size-up") changed = stepChatEmoteSize(io, CHAT_EMOTE_SIZE_STEP);
  else if (action === "emote-size-down") changed = stepChatEmoteSize(io, -CHAT_EMOTE_SIZE_STEP);
  else if (action === "emote-style-next") changed = stepChatEmoteMotion(io, 1);
  else if (action === "emote-style-previous") changed = stepChatEmoteMotion(io, -1);
  // "status" changes nothing; it only reads.
  const state = remoteState();
  const description = describeRemoteAction(action, changed, input.data.value, state);
  if (heldChanged) {
    try {
      await persistTtsQueueSettings();
    } catch (error) {
      console.error(
        `TTS remote: ${holder.name} -> ${action}, changed but could not be saved`,
        error,
      );
      if (description)
        recordRemoteActivity(io, holder.name, `${description} (not saved — a restart may undo it)`);
      res.status(503).json({
        error: "That was changed, but it could not be saved, so a restart may undo it.",
        action,
        changed,
        ...state,
      });
      return;
    }
  }
  console.log(
    `TTS remote: ${holder.name} -> ${action}${action === "volume" ? ` ${input.data.value}` : ""} (${changed ? "changed" : "no change"})`,
  );
  // Shown in the dashboard's own Activity feed, so the streamer can see a button actually reached
  // the server (and what it did) without needing server-log access. Skipped for "status": it never
  // changes anything, so describeRemoteAction() returns undefined for it.
  if (description) recordRemoteActivity(io, holder.name, description);
  res.json({ ok: true, action, changed, ...state });
});
