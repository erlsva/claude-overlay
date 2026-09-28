import { useEffect, useState, useMemo } from "react";
import { type Plan, type Job, type Clip } from "./types";
import { tokenPattern, api } from "./api";
import { pageCount } from "../../support/pagination";
import type { useTtsData } from "./useTtsData";
import type { useTtsServices } from "./useTtsServices";
import type { useTtsPreview } from "./useTtsPreview";

/** Writing a prompt, reviewing the plan, generating and playing it, and managing saved clips. */
export function useTtsComposer(
  deps: Pick<
    ReturnType<typeof useTtsData>,
    "clips" | "runAction" | "setClips" | "setJobs" | "setPollEpoch" | "status" | "submittedJobs"
  > &
    Pick<ReturnType<typeof useTtsServices>, "confirm" | "toast"> &
    Pick<ReturnType<typeof useTtsPreview>, "closePreview" | "selected">,
) {
  const {
    clips,
    runAction,
    setClips,
    setJobs,
    setPollEpoch,
    status,
    submittedJobs,
    confirm,
    toast,
    closePreview,
    selected,
  } = deps;
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [search, setSearch] = useState("");
  const [clipsPage, setClipsPage] = useState(0);
  const isToken = tokenPattern.test(prompt.trim());
  const canGenerate = isToken ? !!status?.canReplay : !!status?.configured;
  const submit = (play: boolean, text = prompt) =>
    runAction(async () => {
      const job = await api<Job>("/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: text,
          planId: text === prompt && !isToken ? plan?.planId : undefined,
          play,
        }),
      });
      submittedJobs.current.add(job.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      toast.info(
        play
          ? "TTS sent to the overlay"
          : isToken
            ? "Loading saved TTS clip"
            : "TTS generation queued",
      );
      setPollEpoch((current) => current + 1);
    });
  const filteredClips = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? clips.filter((clip) =>
          `${clip.sender} ${clip.prompt} ${clip.token}`.toLowerCase().includes(needle),
        )
      : clips;
  }, [clips, search]);
  const CLIPS_PER_PAGE = 10;
  const clipsPageCount = pageCount(filteredClips.length, CLIPS_PER_PAGE);
  // A new search starts back at the first page of its own results.
  useEffect(() => setClipsPage(0), [search]);
  // The list shrinks (a clip is deleted, or a search narrows further) out from under the current
  // page: land on the new last page instead of showing an empty one.
  useEffect(() => {
    setClipsPage((current) => Math.min(current, clipsPageCount - 1));
  }, [clipsPageCount]);
  const pagedClips = useMemo(
    () => filteredClips.slice(clipsPage * CLIPS_PER_PAGE, (clipsPage + 1) * CLIPS_PER_PAGE),
    [filteredClips, clipsPage],
  );
  const copyToken = (clip: Clip) =>
    runAction(async () => {
      await navigator.clipboard.writeText(clip.token);
      toast.success("Reusable TTS token copied");
    });
  const removeClip = (clip: Clip) =>
    runAction(async () => {
      if (
        !(await confirm({
          title: "Delete saved TTS clip?",
          message: `This permanently removes the audio for ${clip.token}. Commands using this token will stop working.`,
          confirmLabel: "Delete clip",
          danger: true,
        }))
      )
        return;
      await api(`/clips/${clip.id}`, { method: "DELETE" });
      setClips((current) => current.filter((item) => item.id !== clip.id));
      if (selected?.clip.id === clip.id) closePreview();
      toast.success("Saved TTS clip deleted");
    });

  return {
    prompt,
    setPrompt,
    plan,
    setPlan,
    search,
    setSearch,
    isToken,
    canGenerate,
    submit,
    filteredClips,
    clipsPage,
    setClipsPage,
    clipsPageCount,
    pagedClips,
    copyToken,
    removeClip,
  };
}
