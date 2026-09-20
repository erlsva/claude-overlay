import { useState, useRef, useCallback, useEffect } from "react";
import { type Clip, type Job, type TtsStatus, type TtsState } from "./types";
import { shorten, api } from "./api";
import type { useTtsVolume } from "./useTtsVolume";
import type { useTtsServices } from "./useTtsServices";
import type { useTtsPreview } from "./useTtsPreview";

/** The server's TTS state (clips, jobs, status), kept fresh by polling. */
export function useTtsData(
  deps: Pick<ReturnType<typeof useTtsVolume>, "followServerVolume" | "setPlayback"> &
    Pick<ReturnType<typeof useTtsServices>, "toast"> &
    Pick<ReturnType<typeof useTtsPreview>, "setSelected">,
) {
  const { followServerVolume, setPlayback, toast, setSelected } = deps;
  const [clips, setClips] = useState<Clip[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const submittedJobs = useRef(new Set<string>());
  const notifiedJobs = useRef(new Set<string>());
  const refreshErrorShown = useRef(false);
  const applyState = useCallback(
    (next: TtsState, notify = true) => {
      setStatus(next.status);
      setPlayback(next.playback);
      followServerVolume(next.playback);
      setClips(next.clips);
      setJobs(next.jobs);
      setError("");
      refreshErrorShown.current = false;
      if (!notify) return;
      for (const job of next.jobs) {
        if (!submittedJobs.current.has(job.id) || notifiedJobs.current.has(job.id)) continue;
        if (job.status === "complete") {
          notifiedJobs.current.add(job.id);
          submittedJobs.current.delete(job.id);
          if (job.warning) toast.info(`TTS clip saved. ${shorten(job.warning)}`);
          else
            toast.success(
              job.message === "Playback finished"
                ? "TTS finished playing on the overlay"
                : "TTS clip saved",
            );
          if (job.clip && job.message === "Clip saved")
            setSelected({ clip: job.clip, origin: "job" });
        } else if (job.status === "failed") {
          notifiedJobs.current.add(job.id);
          submittedJobs.current.delete(job.id);
          toast.error(shorten(job.error || "TTS generation failed"));
        }
      }
    },
    [toast],
  );
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const update = async (initial = false) => {
      try {
        const next = await api<TtsState>("/state");
        if (stopped) return;
        applyState(next, !initial);
        const working = next.jobs.some(
          (job) => job.status === "queued" || job.status === "running",
        );
        timer = window.setTimeout(() => void update(), working ? 2_000 : 10_000);
      } catch (cause) {
        if (stopped) return;
        const message = cause instanceof Error ? cause.message : "Could not load TTS Studio";
        setError(message);
        if (!refreshErrorShown.current) {
          toast.error(message);
          refreshErrorShown.current = true;
        }
        timer = window.setTimeout(() => void update(), 15_000);
      }
    };
    void update(true);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [applyState, pollEpoch, toast]);
  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "TTS request failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return {
    clips,
    setClips,
    jobs,
    setJobs,
    status,
    setStatus,
    error,
    setError,
    busy,
    setBusy,
    pollEpoch,
    setPollEpoch,
    submittedJobs,
    notifiedJobs,
    refreshErrorShown,
    applyState,
    runAction,
  };
}
