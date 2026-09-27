/**
 * The waiting line for TTS. Requests are made one at a time; this decides when the next one may
 * start being made (so no credits are spent while TTS is paused) and when its finished clip may
 * start playing (so nothing plays while paused, and there is always some silence between clips).
 *
 * Pausing holds the line. Nothing here ever refuses a request.
 */

/** Thrown into a waiting request that was removed from the queue. */
export class QueueCancelled extends Error {
  constructor() {
    super("Removed from the queue.");
    this.name = "QueueCancelled";
  }
}

export interface QueueJob {
  cancelled: () => boolean;
}

export interface QueueClock {
  now: () => number;
  /** Runs `run` after `ms`; returns a function that cancels it. */
  after: (run: () => void, ms: number) => () => void;
}

const realClock: QueueClock = {
  now: () => Date.now(),
  after: (run, ms) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

export const MAX_GAP_SECONDS = 30;
export const DEFAULT_GAP_SECONDS = 7;

export function createQueueGate(
  clock: QueueClock = realClock,
  initial: { held?: boolean; gapSeconds?: number } = {},
) {
  let held = initial.held ?? false;
  let gapMs = (initial.gapSeconds ?? DEFAULT_GAP_SECONDS) * 1000;
  // One unused "Play next" pass at most, so pressing it twice cannot let two requests through.
  let pass = false;
  let lastEndedAt = -Infinity;
  const waiters = new Set<() => void>();
  const observers = new Set<() => void>();

  const changed = () => {
    for (const wake of [...waiters]) wake();
    for (const observer of [...observers]) observer();
  };
  /** Resolves when something a waiter depends on changes, or after `ms` when one is given. */
  const nextChange = (ms?: number) =>
    new Promise<void>((resolve) => {
      let cancelTimer = () => {};
      const done = () => {
        waiters.delete(done);
        cancelTimer();
        resolve();
      };
      waiters.add(done);
      if (ms !== undefined) cancelTimer = clock.after(done, ms);
    });
  const silenceLeft = () => lastEndedAt + gapMs - clock.now();

  return {
    isHeld: () => held,
    gapSeconds: () => gapMs / 1000,

    /** Pauses (true) or resumes (false). Either way an unused "Play next" pass is dropped. */
    setHeld(next: boolean) {
      if (held === next) return;
      held = next;
      pass = false;
      changed();
    },
    setGapSeconds(seconds: number) {
      gapMs = Math.min(MAX_GAP_SECONDS, Math.max(0, seconds)) * 1000;
      changed();
    },
    /** While paused, lets exactly one waiting request through. False when there is nothing to do. */
    playNext(): boolean {
      if (!held || pass) return false;
      pass = true;
      changed();
      return true;
    },

    /** Whether a request would have to wait before it may start being made. */
    turnWouldWait: () => held && !pass,
    /** Whether a finished clip would have to wait before it may play. */
    playWouldWait: () => (held && !pass) || silenceLeft() > 0,

    /**
     * Waits until the request may start being made. Resolves true when it got through on a
     * "Play next" pass, which also lets it play at once, ignoring the silence between clips.
     */
    async turn(job: QueueJob): Promise<boolean> {
      for (;;) {
        if (job.cancelled()) throw new QueueCancelled();
        if (!held) return false;
        if (pass) {
          pass = false;
          changed();
          return true;
        }
        await nextChange();
      }
    },

    /**
     * Waits until the finished clip may play: TTS is not paused, and enough silence has passed
     * since the last clip ended. Time spent making the clip counts as silence. A request that got
     * through on a "Play next" pass plays at once. Pausing while a clip was being made holds it
     * here, and a pass lets it out.
     */
    async beforePlay(job: QueueJob, manual: boolean): Promise<void> {
      if (manual) return;
      for (;;) {
        if (job.cancelled()) throw new QueueCancelled();
        if (held) {
          if (pass) {
            pass = false;
            changed();
            return;
          }
          await nextChange();
          continue;
        }
        const left = silenceLeft();
        if (left <= 0) return;
        await nextChange(left);
      }
    },

    /** A clip finished, or was skipped: the silence between clips is counted from now. */
    clipEnded() {
      lastEndedAt = clock.now();
    },
    /** Makes waiting requests look again, for example after one was removed. */
    wake: changed,
    /** Calls `listener` whenever pausing, the gap or a pass changes. Returns a way to stop. */
    subscribe(listener: () => void) {
      observers.add(listener);
      return () => observers.delete(listener);
    },
  };
}

export type QueueGate = ReturnType<typeof createQueueGate>;
