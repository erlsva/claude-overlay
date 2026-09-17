import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Clipboard,
  Clock3,
  Database,
  FileAudio,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  Search,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { authHeaders } from "../hooks/useAuth";
import { ActionScopeBadge } from "./ActionScopeBadge";
import { useConfirm } from "./ConfirmProvider";
import { useToast } from "./ToastProvider";

const base =
  (import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001") + "/tts";
const tokenPattern = /^\(?TTS:([a-f0-9]{32})\)?$/i;

type Clip = {
  id: string;
  token: string;
  prompt: string;
  sender: string;
  createdAt: string;
  duration: number;
};

type Job = {
  id: string;
  createdAt?: string;
  status: "queued" | "running" | "complete" | "failed";
  message: string;
  error?: string;
  warning?: string;
  clip?: Clip;
};

type Scene = {
  dialogue?: string;
  sound?: string;
  character?: string;
  delivery?: string;
  effect?: string;
  duration?: number | null;
};

type Plan = { planId: string; scenes: Scene[]; warnings: string[] };

type TtsStatus = {
  configured: boolean;
  canReplay: boolean;
  storageProvider: string;
  services: {
    openai: boolean;
    elevenlabs: boolean;
    ffmpeg: boolean;
    metadata: boolean;
    audioStorage: boolean;
  };
};
type PlaybackState = { enabled: boolean; active: boolean; paused: boolean; clipId?: string; prompt?: string; sender?: string };

type TtsState = { status: TtsStatus; playback: PlaybackState; clips: Clip[]; jobs: Job[] };

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base + route, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok)
    throw new Error(data.error || `TTS request failed (${response.status})`);
  return data as T;
}

const formatDuration = (seconds: number) =>
  seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    : `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;

export function TtsPanel({ overlayConnected, livePlayback }: { overlayConnected: boolean; livePlayback: PlaybackState }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ enabled: true, active: false, paused: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Clip | null>(null);
  const [search, setSearch] = useState("");
  const [volume, setVolume] = useState(0.25);
  const [pollEpoch, setPollEpoch] = useState(0);
  const submittedJobs = useRef(new Set<string>());
  const notifiedJobs = useRef(new Set<string>());
  const refreshErrorShown = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => setPlayback(livePlayback), [livePlayback]);
  useEffect(() => {
    if (previewAudioRef.current) previewAudioRef.current.volume = volume;
  }, [selected, volume]);

  const applyState = useCallback(
    (next: TtsState, notify = true) => {
      setStatus(next.status);
      setPlayback(next.playback);
      setClips(next.clips);
      setJobs(next.jobs);
      setError("");
      refreshErrorShown.current = false;
      if (!notify) return;
      for (const job of next.jobs) {
        if (
          !submittedJobs.current.has(job.id) ||
          notifiedJobs.current.has(job.id)
        )
          continue;
        if (job.status === "complete") {
          notifiedJobs.current.add(job.id);
          submittedJobs.current.delete(job.id);
          if (job.warning) toast.info(`TTS clip saved, but ${job.warning}`);
          else
            toast.success(
              job.message === "Playback finished"
                ? "TTS finished playing on OBS"
                : "TTS clip saved",
            );
          if (job.clip && job.message === "Clip saved") setSelected(job.clip);
        } else if (job.status === "failed") {
          notifiedJobs.current.add(job.id);
          submittedJobs.current.delete(job.id);
          toast.error(job.error || "TTS generation failed");
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
        timer = window.setTimeout(
          () => void update(),
          working ? 2_000 : 10_000,
        );
      } catch (cause) {
        if (stopped) return;
        const message =
          cause instanceof Error ? cause.message : "Could not load TTS Studio";
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
      const message =
        cause instanceof Error ? cause.message : "TTS request failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

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
          volume,
        }),
      });
      submittedJobs.current.add(job.id);
      setJobs((current) => [
        job,
        ...current.filter((item) => item.id !== job.id),
      ]);
      toast.info(
        play
          ? "TTS queued for OBS"
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
          `${clip.sender} ${clip.prompt} ${clip.token}`
            .toLowerCase()
            .includes(needle),
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
      if (selected?.id === clip.id) setSelected(null);
      toast.success("Saved TTS clip deleted");
    });

  return (
    <section className="studio-section tts-panel">
      <div className="tts-heading">
        <span className="tts-heading__icon">
          <Sparkles size={17} />
        </span>
        <span>
          <h3>TTS Scene Studio</h3>
          <small>
            Build expressive speech and sound scenes, then replay favorites by
            token.
          </small>
        </span>
      </div>

      <div className="tts-playback-control">
        <span>
          {playback.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span>
            <strong>{playback.enabled ? "TTS is on" : "TTS is off"}</strong>
            <small>{playback.active ? playback.paused ? "Paused on OBS" : "Playing on OBS" : "No active playback"}</small>
          </span>
        </span>
        <button
          className={`ui-icon-button ${playback.enabled ? "is-active" : ""}`}
          disabled={busy}
          aria-label={playback.enabled ? "Turn TTS playback off" : "Turn TTS playback on"}
          onClick={() => void runAction(async () => {
            const result = await api<{ state: PlaybackState }>("/playback", { method: "POST", body: JSON.stringify({ action: "enable", enabled: !playback.enabled }) });
            setPlayback(result.state);
            toast.info(result.state.enabled ? "TTS playback turned on" : "TTS playback turned off");
          })}
        >
          {playback.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      </div>

      <div
        className={`tts-readiness ${status?.configured ? "tts-readiness--ready" : ""}`}
      >
        <div>
          {status?.configured ? <Check size={15} /> : <CircleAlert size={15} />}
          <strong>
            {status?.configured
              ? "Generation ready"
              : status
                ? "Setup incomplete"
                : "Checking TTS services…"}
          </strong>
        </div>
        {status && (
          <small>
            {status.storageProvider} · saved tokens survive Render restarts
          </small>
        )}
        {status && !status.configured && (
          <div className="tts-service-grid">
            <Service name="OpenAI" ready={status.services.openai} />
            <Service name="ElevenLabs" ready={status.services.elevenlabs} />
            <Service name="FFmpeg" ready={status.services.ffmpeg} />
            <Service name="Neon" ready={status.services.metadata} />
            <Service
              name="Audio archive"
              ready={status.services.audioStorage}
            />
          </div>
        )}
      </div>

      <label className="tts-composer">
        <span>
          <strong>Scene prompt or saved token</strong>
          <small>{prompt.length.toLocaleString()} / 6,000</small>
        </span>
        <textarea
          rows={7}
          maxLength={6000}
          disabled={busy}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setPlan(null);
          }}
          placeholder={
            '((foxes barking while a warm voice says "Welcome, chat!" with echo;8s))'
          }
        />
        <small>
          Plain text is spoken. Inside ((…)), unquoted descriptions generate
          sound. Use ((silence;2.5s)) for a custom 0.5–30 second pause.
        </small>
      </label>

      <label className="tts-volume">
        <span>
          <Volume2 size={13} /> OBS volume
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <output>{Math.round(volume * 100)}%</output>
      </label>
      <p className="tts-inline-note">
        Generated clips are normalized to a consistent loudness and true-peak limited before storage. This slider controls both OBS and dashboard preview playback.
      </p>

      <div className="tts-actions">
        <button
          className="ui-button"
          disabled={busy || !prompt.trim() || isToken || !status?.configured}
          onClick={() =>
            void runAction(async () => {
              const next = await api<Plan>("/preview", {
                method: "POST",
                body: JSON.stringify({ prompt }),
              });
              setPlan(next);
              toast.success(
                `Scene plan ready with ${next.scenes.length} ${next.scenes.length === 1 ? "scene" : "scenes"}`,
              );
            })
          }
          title="Use OpenAI to review the scene structure before spending ElevenLabs generation credits"
        >
          <WandSparkles size={13} /> Review plan
        </button>
        <button
          className="ui-button"
          disabled={busy || !prompt.trim() || !canGenerate}
          onClick={() => void submit(false)}
        >
          <FileAudio size={13} /> {isToken ? "Load saved" : "Generate & save"}
        </button>
        <button
          className="ui-button studio-primary"
          disabled={busy || !prompt.trim() || !canGenerate || !overlayConnected || !playback.enabled}
          onClick={() => void submit(true)}
        >
          <Play size={13} /> Play on OBS <ActionScopeBadge scope="obs" />
        </button>
        <button
          className="ui-button"
          disabled={busy || !playback.active}
          onClick={() => void runAction(async () => {
            const action = playback.paused ? "resume" : "pause";
            const result = await api<{ changed: boolean; state: PlaybackState }>("/playback", { method: "POST", body: JSON.stringify({ action }) });
            setPlayback(result.state);
            result.changed ? toast.info(playback.paused ? "Resumed TTS on OBS" : "Paused TTS on OBS") : toast.info("No active TTS playback to control");
          })}
        >
          {playback.paused ? <Play size={13} /> : <Pause size={13} />} {playback.paused ? "Resume OBS" : "Pause OBS"}
        </button>
        <button
          className="ui-button tts-stop"
          disabled={busy || !overlayConnected}
          onClick={() =>
            void runAction(async () => {
              const result = await api<{ stopped: boolean }>("/stop", {
                method: "POST",
              });
              result.stopped
                ? toast.info("Stopped the active TTS on OBS")
                : toast.info("No TTS clip is currently playing");
            })
          }
        >
          <Square size={11} fill="currentColor" /> Stop OBS
        </button>
      </div>
      {!overlayConnected && (
        <p className="tts-inline-note">
          <CircleAlert size={13} /> Open the OBS overlay before using Play on
          OBS.
        </p>
      )}
      {error && (
        <p className="tts-error" role="alert">
          <CircleAlert size={14} /> {error}
        </p>
      )}

      {plan && (
        <div className="tts-plan">
          <div className="tts-subheading">
            <span>
              <WandSparkles size={14} />
              <strong>Performance plan</strong>
            </span>
            <small>
              Generation will reuse this reviewed plan for 15 minutes.
            </small>
          </div>
          {plan.warnings.map((warning) => (
            <p className="tts-inline-note" key={warning}>
              {warning}
            </p>
          ))}
          {plan.scenes.map((scene, index) => (
            <article
              key={`${index}-${scene.dialogue}-${scene.sound}`}
              className="tts-scene"
            >
              <b>{index + 1}</b>
              <span>
                <strong>
                  {scene.sound === "__silence__"
                    ? "Pause"
                    : scene.character ||
                      (scene.dialogue ? "Voice" : "Sound effect")}
                </strong>
                <small>
                  {scene.sound === "__silence__"
                    ? "Intentional silence"
                    : scene.dialogue
                      ? `“${scene.dialogue}”`
                      : scene.sound}
                </small>
                <em>
                  {[
                    scene.sound && scene.dialogue
                      ? `Background: ${scene.sound}`
                      : "",
                    scene.effect !== "none" ? scene.effect : "",
                    scene.duration ? `${scene.duration}s` : "natural length",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </em>
              </span>
            </article>
          ))}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="tts-jobs" aria-live="polite">
          <div className="tts-subheading">
            <span>
              <Clock3 size={14} />
              <strong>Recent jobs</strong>
            </span>
          </div>
          {jobs.slice(0, 4).map((job) => (
            <div key={job.id} className={`tts-job tts-job--${job.status}${job.warning ? " tts-job--warning" : ""}`}>
              {job.status === "queued" || job.status === "running" ? (
                <LoaderCircle className="tts-spin" size={14} />
              ) : job.status === "complete" ? (
                <Check size={14} />
              ) : (
                <CircleAlert size={14} />
              )}
              <span>
                <strong>
                  {job.status}
                  {job.createdAt && ` · ${new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                </strong>
                <small title={job.error || job.warning || job.message}>
                  {job.error || job.warning || job.message}
                </small>
              </span>
              {job.status === "failed" && job.error && (
                <button
                  className="ui-icon-button ui-button--compact"
                  onClick={() => void navigator.clipboard
                    .writeText(`TTS job ${job.id}\n${job.error}`)
                    .then(() => toast.success("TTS error copied"))
                    .catch(() => toast.error("Could not copy the TTS error"))}
                  title="Copy the complete error and job ID"
                  aria-label="Copy complete TTS error"
                >
                  <Clipboard size={12} />
                </button>
              )}
              {job.clip && (
                <button
                  className="ui-icon-button ui-button--compact"
                  onClick={() => setSelected(job.clip!)}
                  title="Preview this clip on the dashboard"
                >
                  <Headphones size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="tts-player">
          <div className="tts-player__header">
            <Headphones size={15} />
            <span>
              <strong>Dashboard preview</strong>
              <small>
                {selected.sender} · {formatDuration(selected.duration)}
              </small>
            </span>
            <button
              className="ui-icon-button ui-button--compact"
              onClick={() => setSelected(null)}
              title="Close dashboard TTS preview"
              aria-label="Close dashboard TTS preview"
            >
              <X size={18} />
            </button>
          </div>
          <p>{selected.prompt}</p>
          <audio
            ref={previewAudioRef}
            key={selected.id}
            controls
            preload="metadata"
            src={`${base}/clips/${selected.id}/audio`}
          />
        </div>
      )}

      <div className="tts-library">
        <div className="tts-subheading">
          <span>
            <Database size={14} />
            <strong>Saved clips</strong>
          </span>
          <small>{clips.length} / latest 100</small>
        </div>
        {clips.length > 0 && (
          <label className="studio-search">
            <Search size={13} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search prompts, senders, or tokens…"
            />
          </label>
        )}
        {filteredClips.map((clip) => (
          <article className="tts-clip" key={clip.id}>
            <div>
              <strong>{clip.prompt}</strong>
              <small>
                {clip.sender} · {formatDuration(clip.duration)} ·{" "}
                {new Date(clip.createdAt).toLocaleString()}
              </small>
            </div>
            <code>{clip.token}</code>
            <div>
              <button
                className="ui-button ui-button--compact"
                onClick={() => setSelected(clip)}
              >
                <Headphones size={12} /> Preview
              </button>
              <button
                className="ui-button ui-button--compact"
                disabled={!overlayConnected || busy}
                onClick={() => void submit(true, clip.token)}
              >
                <Play size={12} /> OBS
              </button>
              <button
                className="ui-icon-button ui-button--compact"
                onClick={() => void copyToken(clip)}
                title="Copy reusable TTS token"
              >
                <Clipboard size={12} />
              </button>
              <button
                className="ui-icon-button ui-button--compact ui-danger"
                disabled={busy}
                onClick={() => void removeClip(clip)}
                title="Permanently delete this saved clip"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </article>
        ))}
        {!clips.length && (
          <div className="studio-empty-state">
            <strong>No saved TTS clips</strong>
            <span>
              Generate your first scene. Its replay token will appear here.
            </span>
          </div>
        )}
        {!!clips.length && !filteredClips.length && (
          <div className="studio-empty-state">
            <strong>No matching clips</strong>
            <span>Try a different search term.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Service({ name, ready }: { name: string; ready: boolean }) {
  return (
    <span className={ready ? "ready" : "missing"}>
      {ready ? <Check size={10} /> : <CircleAlert size={10} />}
      {name}
    </span>
  );
}
