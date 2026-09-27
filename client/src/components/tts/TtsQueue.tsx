import { ListOrdered, Play, X } from "lucide-react";
import { api, shorten } from "./api";
import { type PlaybackState } from "./types";
import type { TtsContext } from "./context";

/** The requests waiting for their turn: play the next one, take one out, or empty the queue. */
export function TtsQueue({
  s,
}: {
  s: Pick<
    TtsContext,
    "busy" | "playback" | "queue" | "runAction" | "setPlayback" | "setQueue" | "toast"
  >;
}) {
  const { busy, playback, queue, runAction, setPlayback, setQueue, toast } = s;
  if (queue.length === 0) return null;
  return (
    <div className="tts-queue" aria-live="polite">
      <div className="tts-subheading">
        <span>
          <ListOrdered size={14} />
          <strong>Waiting</strong>
          <small>{queue.length}</small>
        </span>
        <span className="tts-queue__actions">
          {playback.held && (
            <button
              type="button"
              className="ui-button ui-button--compact studio-primary"
              disabled={busy}
              title="Play the request at the top of the queue, then hold again"
              onClick={() =>
                void runAction(async () => {
                  const result = await api<{ changed: boolean; state: PlaybackState }>(
                    "/playback",
                    { method: "POST", body: JSON.stringify({ action: "next" }) },
                  );
                  setPlayback(result.state);
                  if (!result.changed) toast.info("Nothing is waiting to play");
                })
              }
            >
              <Play size={12} fill="currentColor" /> Play next
            </button>
          )}
          <button
            type="button"
            className="ui-button ui-button--compact"
            disabled={busy}
            title="Remove every waiting request"
            onClick={() =>
              void runAction(async () => {
                const result = await api<{ cleared: number }>("/queue/clear", { method: "POST" });
                setQueue([]);
                toast.info(
                  result.cleared === 1 ? "Removed 1 request" : `Removed ${result.cleared} requests`,
                );
              })
            }
          >
            Clear all
          </button>
        </span>
      </div>
      <ol className="tts-queue__list">
        {queue.map((job, index) => (
          <li className="tts-queue-item" key={job.id}>
            <span className="tts-queue-item__number">{index + 1}</span>
            <span className="tts-queue-item__text">
              <strong>{job.sender || "Unknown"}</strong>
              <small title={job.prompt}>{shorten(job.prompt ?? "", 90)}</small>
            </span>
            <button
              type="button"
              className="ui-icon-button ui-button--compact ui-icon-button--ghost"
              disabled={busy}
              title="Remove from the queue"
              aria-label={`Remove the request from ${job.sender || "this viewer"} from the queue`}
              onClick={() =>
                void runAction(async () => {
                  try {
                    await api(`/jobs/${job.id}`, { method: "DELETE" });
                    setQueue((current) => current.filter((entry) => entry.id !== job.id));
                    toast.info("Removed from the queue");
                  } catch (error) {
                    // It may have started, or finished, while the list was on screen.
                    setQueue((current) => current.filter((entry) => entry.id !== job.id));
                    throw error;
                  }
                })
              }
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
