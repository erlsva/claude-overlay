import { useEffect, useState } from "react";

/** How long exit animations run. Keep in sync with `--motion-exit` in App.css. */
export const EXIT_MS = 140;

/**
 * Keeps something mounted while its exit animation plays.
 *
 * Render it while `mounted` is true and put `state` on a `data-state`
 * attribute; the `.motion-*` classes in App.css animate both directions.
 */
export function usePresence(open: boolean, exitMs = EXIT_MS) {
  const [lingering, setLingering] = useState(open);

  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    const timer = window.setTimeout(() => setLingering(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || lingering, state: open ? ("open" as const) : ("closed" as const) };
}
