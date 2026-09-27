import { setTimeout as sleep } from "node:timers/promises";
import { deleteUploadedClip, discordStorageConfigured } from "./discord.js";
import { deleteClip, type TtsClip } from "./store.js";

/** Discord allows only a few webhook requests every couple of seconds. */
const DISCORD_DELETE_SPACING_MS = 450;
let discardChain: Promise<unknown> = Promise.resolve();

/**
 * Deletes the clip that was made for a request that is no longer wanted, so it does not linger in
 * the saved clips or on the public clip page. Removing a whole queue at once queues the deletions
 * one after another, which keeps within Discord's rate limit (and the local file store, which cannot
 * delete two clips at the same moment).
 */
export function deleteMadeClip(clip: TtsClip): Promise<void> {
  const done = discardChain.then(async () => {
    try {
      if (discordStorageConfigured()) {
        await deleteUploadedClip(clip.discordMessageId);
        await sleep(DISCORD_DELETE_SPACING_MS);
      }
    } catch (error) {
      console.error("Could not delete the audio of a removed TTS request", error);
    }
    await deleteClip(clip.id).catch((error) =>
      console.error("Could not delete the record of a removed TTS request", error),
    );
  });
  discardChain = done;
  return done;
}
