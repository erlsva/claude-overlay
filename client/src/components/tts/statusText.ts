/** The words for TTS's state: one place, so the panel and the top bar always agree. */

interface QueueState {
  held: boolean;
  waiting: number;
  active: boolean;
  paused: boolean;
}

const requests = (count: number) => `${count} ${count === 1 ? "request" : "requests"}`;

/** The heading and the line under it in the TTS panel's first row. */
export function panelStatus(state: QueueState): { title: string; detail: string } {
  if (state.held)
    return {
      title: "TTS is paused",
      detail:
        state.waiting > 0
          ? `${requests(state.waiting)} waiting. They play when you resume.`
          : "New requests will wait until you resume.",
    };
  return {
    title: "TTS is running",
    detail: state.active
      ? state.paused
        ? "Clip paused on the overlay"
        : "Playing on the overlay"
      : state.waiting > 0
        ? `${requests(state.waiting)} waiting for their turn`
        : "No active playback",
  };
}

/** The short label for the dashboard's top bar. */
export function barLabel(state: Pick<QueueState, "held" | "waiting">): string {
  if (!state.held) return "TTS active";
  return state.waiting > 0 ? `TTS paused · ${state.waiting} waiting` : "TTS paused";
}

/** What a gap typed into the panel means: a whole number of seconds from 0 to `max`, or null. */
export function parseGap(text: string, max: number): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const seconds = Number(text);
  return seconds >= 0 && seconds <= max ? seconds : null;
}
