/**
 * A sound played on the overlay is finished when the overlay says so (or a timeout gives up).
 * This is how a command chain, or the TTS queue, knows it can move on.
 */

const waiters = new Map<string, (error?: string) => void>();

/** Registers what to do when playback `playbackId` ends. */
export function expectSoundEnd(playbackId: string, handler: (error?: string) => void) {
  waiters.set(playbackId, handler);
}

export function forgetSound(playbackId: string) {
  waiters.delete(playbackId);
}

/** Calls the handler for `playbackId` (if any) without unregistering it. */
export function endSound(playbackId: string, error?: string) {
  waiters.get(playbackId)?.(error);
}

/** The overlay reported that `playbackId` ended: run its handler once, then forget it. */
export function settleSound(playbackId: string, error?: string) {
  endSound(playbackId, error);
  forgetSound(playbackId);
}
