import { useState, useMemo } from "react";
import { type Plan, type Job, type Clip } from "./types";
import { tokenPattern, api } from "./api";
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
          ? "TTS queued for the overlay"
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
    copyToken,
    removeClip,
  };
}
