import { restorePresentation } from "./presentation.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

const mediaCompletionWaiters = new Map<string, Set<() => void>>();

/** Resolves when the overlay reports that video or audio layer `id` ended (or after an hour). */
export function waitForMediaEnd(id: string) {
  return new Promise<void>((resolve) => {
    const waiters = mediaCompletionWaiters.get(id) ?? new Set();
    const finish = () => {
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(finish, ONE_HOUR_MS);
    waiters.add(finish);
    mediaCompletionWaiters.set(id, waiters);
  });
}

/** A media layer ended on the overlay: release whoever waits for it and hide it again. */
export function finishMedia(id: string) {
  mediaCompletionWaiters.get(id)?.forEach((resolve) => resolve());
  mediaCompletionWaiters.delete(id);
  restorePresentation(id);
}
