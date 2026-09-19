import { Router } from "express";
import { z } from "zod";
import { getFeatureFlags, saveFeatureFlags } from "../db/index.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import type { FeatureFlags } from "../types.js";
import { setTtsPlaybackEnabled, stopTtsPlayback } from "../tts/service.js";

export function createFeatureRouter(onUpdated: (flags: FeatureFlags) => void) {
  const router = Router();

  router.get("/", requireAuth, (_req, res) => res.json(getFeatureFlags()));
  router.put("/", requireOwner, async (req, res) => {
    try {
      // Only the flags that were sent change, so flipping one never resets another.
      const changes = z
        .object({ tts: z.boolean().optional(), scenes: z.boolean().optional() })
        .strict()
        .parse(req.body);
      const previous = getFeatureFlags();
      const flags: FeatureFlags = {
        tts: changes.tts ?? previous.tts,
        scenes: changes.scenes ?? previous.scenes,
      };
      await saveFeatureFlags(flags);
      if (flags.tts !== previous.tts) {
        if (!flags.tts) stopTtsPlayback();
        setTtsPlaybackEnabled(flags.tts);
      }
      onUpdated(flags);
      res.json(flags);
    } catch (error) {
      res.status(400).json({
        error: error instanceof z.ZodError
          ? "Invalid feature flag settings."
          : error instanceof Error
            ? error.message
            : "Could not update feature flags.",
      });
    }
  });

  return router;
}
