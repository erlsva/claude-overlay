import { useEffect, useState } from "react";
import { SERVER_URL } from "../config/server";
import { summarizeLive } from "../support/liveStatus";

const POLL_MS = 60_000;

async function isLive(channel: string, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${SERVER_URL}/auth/live?channel=${encodeURIComponent(channel)}`, {
    signal,
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return Boolean((await response.json()).live);
}

/**
 * Whether any of the channels is live, checked in the background every minute. It never blocks a
 * page: until the first answer (a sleeping server can take a while) the stream simply counts as
 * not live. `failed` is true while none of the channels could be checked.
 */
export function useLiveStatus(channels: readonly string[]) {
  const [status, setStatus] = useState({ live: false, failed: false });
  const key = channels.join(",");

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      const results = await Promise.allSettled(
        key.split(",").map((channel) => isLive(channel, controller.signal)),
      );
      if (controller.signal.aborted) return;
      const { live, allFailed } = summarizeLive(results);
      setStatus({ live, failed: allFailed });
    };
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [key]);

  return status;
}
