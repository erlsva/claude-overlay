import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Check,
  BookOpen,
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
  speechRate?: number;
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
type PlaybackState = { enabled: boolean; active: boolean; paused: boolean; volume?: number; clipId?: string; prompt?: string; sender?: string };

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

/** One short line for the card; the full text stays in the tooltip and "Copy details". */
function shorten(text: string, max = 110) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const firstSentence = oneLine.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? oneLine;
  const chosen = firstSentence.length <= max ? firstSentence : oneLine;
  return chosen.length <= max ? chosen : `${chosen.slice(0, max - 1).trimEnd()}…`;
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
  const [selected, setSelected] = useState<{ clip: Clip; origin: "job" | "library"; autoPlay?: boolean } | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [volume, setVolume] = useState(0.25);
  const [pollEpoch, setPollEpoch] = useState(0);
  const submittedJobs = useRef(new Set<string>());
  const notifiedJobs = useRef(new Set<string>());
  const refreshErrorShown = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const volumeSyncTimer = useRef(0);
  // While the slider is being dragged, ignore volumes echoed back from the server.
  const volumeTouchedAt = useRef(0);
  const followServerVolume = (next: { volume?: number }) => {
    if (typeof next.volume !== "number") return;
    if (Date.now() - volumeTouchedAt.current < 1500) return;
    setVolume(next.volume);
  };
  const volumeSyncErrorShown = useRef(false);

  useEffect(() => {
    setPlayback(livePlayback);
    followServerVolume(livePlayback);
  }, [livePlayback]);
  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = volume;
    }
  }, [selected, volume]);
  useEffect(() => () => {
    window.clearTimeout(volumeSyncTimer.current);
  }, []);

  const previewKey = (clip: Clip, origin: "job" | "library") => `${origin}:${clip.id}`;
  // One button both starts and stops: it reads Stop while that clip is playing.
  const togglePreview = (clip: Clip, origin: "job" | "library") => {
    const audio = previewAudioRef.current;
    if (audio && selected?.clip.id === clip.id && selected.origin === origin) {
      if (audio.paused) {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }
    setPlayingKey(null);
    setSelected({ clip, origin, autoPlay: true });
  };
  const closePreview = () => {
    setPlayingKey(null);
    setSelected(null);
  };

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    volumeTouchedAt.current = Date.now();
    window.clearTimeout(volumeSyncTimer.current);
    volumeSyncTimer.current = window.setTimeout(() => {
      void api<{ changed: boolean; state: PlaybackState }>("/playback", {
        method: "POST",
        body: JSON.stringify({ action: "volume", volume: nextVolume }),
      })
        .then((result) => {
          volumeTouchedAt.current = Date.now();
          setPlayback(result.state);
          volumeSyncErrorShown.current = false;
        })
        .catch((cause) => {
          if (volumeSyncErrorShown.current) return;
          volumeSyncErrorShown.current = true;
          toast.error(cause instanceof Error ? cause.message : "Could not update the overlay's TTS volume");
        });
    }, 100);
  };

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
        if (
          !submittedJobs.current.has(job.id) ||
          notifiedJobs.current.has(job.id)
        )
          continue;
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
        }),
      });
      submittedJobs.current.add(job.id);
      setJobs((current) => [
        job,
        ...current.filter((item) => item.id !== job.id),
      ]);
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
      if (selected?.clip.id === clip.id) closePreview();
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
          <small>Create, play, and save reusable stream audio.</small>
        </span>
      </div>

      <details className="tts-guide">
        <summary><BookOpen size={13} /> How TTS prompts work</summary>
        <div>
          <p>Plain text is spoken. Use <code>((…))</code> for directed speech, generated effects, pauses, rooms, and timing.</p>
          <code>{'((pirate screaming: "Run!" in a cave;speed=0.9x;8s))'}</code>
          <code>{'((gigantic fart in a cathedral;5s))'}</code>
          <code>{'((silence;2s))'}</code>
          <p>Quoted words are spoken; unquoted blocks become sound effects. A duration is the whole scene, including its echo or reverb tail. Saved <code>(TTS:id)</code> tokens replay without spending generation credits.</p>
        </div>
      </details>

      <div className="tts-status-card">
        <div className="tts-status-row">
          <span className="tts-status-row__icon">
            {playback.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </span>
          <span className="tts-status-row__text">
            <strong>{playback.enabled ? "Overlay playback on" : "Overlay playback off"}</strong>
            <small>{playback.active ? playback.paused ? "Paused on overlay" : "Playing on overlay" : "No active playback"}</small>
          </span>
          <button
            type="button"
            className="ui-switch"
            role="switch"
            aria-checked={playback.enabled}
            disabled={busy}
            aria-label={playback.enabled ? "Turn TTS playback off" : "Turn TTS playback on"}
            title={playback.enabled ? "Turn TTS playback off" : "Turn TTS playback on"}
            onClick={() => void runAction(async () => {
              const result = await api<{ state: PlaybackState }>("/playback", { method: "POST", body: JSON.stringify({ action: "enable", enabled: !playback.enabled }) });
              setPlayback(result.state);
              toast.info(result.state.enabled ? "TTS playback turned on" : "TTS playback turned off");
            })}
          />
        </div>
        <div
          className={`tts-status-row ${status?.configured ? "tts-status-row--ok" : status ? "tts-status-row--warn" : ""}`}
        >
          <span className="tts-status-row__icon">
            {status?.configured ? <Check size={16} /> : <CircleAlert size={16} />}
          </span>
          <span className="tts-status-row__text">
            <strong>
              {status?.configured
                ? "Generation ready"
                : status
                  ? "Setup incomplete"
                  : "Checking TTS services…"}
            </strong>
            {status && !status.configured && (
              <small>{status.storageProvider}</small>
            )}
          </span>
        </div>
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
      </label>

      <label className="tts-volume">
        <span>
          <Volume2 size={13} /> Overlay volume
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
        <output>{Math.round(volume * 100)}%</output>
      </label>

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
          <Play size={13} fill="currentColor" /> Play on overlay
        </button>
        {playback.active && <>
          <button
            className="ui-button"
            disabled={busy}
            onClick={() => void runAction(async () => {
              const action = playback.paused ? "resume" : "pause";
              const result = await api<{ changed: boolean; state: PlaybackState }>("/playback", { method: "POST", body: JSON.stringify({ action }) });
              setPlayback(result.state);
              result.changed ? toast.info(playback.paused ? "Resumed TTS on the overlay" : "Paused TTS on the overlay") : toast.info("No active TTS playback to control");
            })}
          >
            {playback.paused ? <Play size={13} /> : <Pause size={13} />} {playback.paused ? "Resume" : "Pause"}
          </button>
          <button
            className="ui-button tts-stop"
            disabled={busy}
            onClick={() => void runAction(async () => {
              const result = await api<{ stopped: boolean }>("/stop", { method: "POST" });
              result.stopped ? toast.info("Stopped the active TTS on the overlay") : toast.info("No TTS clip is currently playing");
            })}
          >
            <Square size={11} fill="currentColor" /> Stop
          </button>
        </>}
      </div>
      {!overlayConnected && (
        <p className="tts-inline-note">
          <CircleAlert size={13} /> Open the overlay before using Play on overlay.
        </p>
      )}
      {error && (
        <p className="tts-error" role="alert">
          <CircleAlert size={14} /> <span title={error}>{shorten(error)}</span>
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
                    scene.effect !== "none" ? (scene.effect === "both" ? "echo + reverb" : scene.effect) : "",
                    scene.speechRate && scene.speechRate !== 1
                      ? `${scene.speechRate.toFixed(2)}× speech`
                      : "",
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
            <div className="tts-job-entry" key={job.id}>
            <div className={`tts-job tts-job--${job.status}${job.warning ? " tts-job--warning" : ""}`}>
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
                  {shorten(job.error || job.warning || job.message)}
                </small>
              </span>
              {(job.error || job.warning) && (
                <button
                  className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                  onClick={() => void navigator.clipboard
                    .writeText(`TTS job ${job.id}\n${job.error || job.warning}`)
                    .then(() => toast.success("TTS error copied"))
                    .catch(() => toast.error("Could not copy the TTS error"))}
                  title="Copy details (full text and job ID)"
                  aria-label="Copy details"
                >
                  <Clipboard size={12} />
                </button>
              )}
              {job.clip && (
                <button
                  className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                  onClick={() => togglePreview(job.clip!, "job")}
                  title={playingKey === previewKey(job.clip, "job") ? "Stop the preview" : "Preview this clip on the dashboard"}
                  aria-label={playingKey === previewKey(job.clip, "job") ? "Stop the preview" : "Preview this clip on the dashboard"}
                >
                  {playingKey === previewKey(job.clip, "job") ? <Square size={12} fill="currentColor" /> : <Headphones size={13} />}
                </button>
              )}
            </div>
            {selected?.origin === "job" && selected.clip.id === job.clip?.id && (
              <TtsPreview
                clip={selected.clip}
                audioRef={previewAudioRef}
                autoPlay={selected.autoPlay}
                onPlayingChange={(playing) => setPlayingKey(playing ? previewKey(selected.clip, selected.origin) : null)}
                onClose={closePreview}
              />
            )}
            </div>
          ))}
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
            <div className="tts-clip__meta">
              <strong>{clip.prompt}</strong>
              <small>
                {clip.sender} · {formatDuration(clip.duration)} ·{" "}
                {new Date(clip.createdAt).toLocaleString()}
              </small>
            </div>
            <div className="tts-clip__token">
              <code title={clip.token}>{clip.token}</code>
              <button
                className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                onClick={() => void copyToken(clip)}
                title="Copy reusable TTS token"
                aria-label="Copy reusable TTS token"
              >
                <Clipboard size={14} />
              </button>
            </div>
            <div className="tts-clip__actions">
              <button
                className="ui-button ui-button--compact"
                onClick={() => togglePreview(clip, "library")}
              >
                {playingKey === previewKey(clip, "library") ? (
                  <><Square size={11} fill="currentColor" /> Stop</>
                ) : (
                  <><Headphones size={13} /> Preview</>
                )}
              </button>
              <button
                className="ui-button ui-button--compact soundboard-action--obs"
                disabled={!overlayConnected || busy}
                onClick={() => void submit(true, clip.token)}
                title={overlayConnected ? "Play this clip on the overlay" : "Open the overlay to play this clip"}
              >
                <Play size={12} fill="currentColor" /> Play on overlay
              </button>
              <button
                className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
                disabled={busy}
                onClick={() => void removeClip(clip)}
                title="Permanently delete this saved clip"
                aria-label="Delete this saved clip"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {selected?.origin === "library" && selected.clip.id === clip.id && (
              <TtsPreview
                clip={selected.clip}
                audioRef={previewAudioRef}
                autoPlay={selected.autoPlay}
                onPlayingChange={(playing) => setPlayingKey(playing ? previewKey(selected.clip, selected.origin) : null)}
                onClose={closePreview}
              />
            )}
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

function TtsPreview({ clip, audioRef, autoPlay, onPlayingChange, onClose }: { clip: Clip; audioRef: RefObject<HTMLAudioElement>; autoPlay?: boolean; onPlayingChange: (playing: boolean) => void; onClose: () => void }) {
  return (
    <div className="tts-player">
      <div className="tts-player__header">
        <Headphones size={15} />
        <span><strong>Dashboard preview</strong><small>{clip.sender} · {formatDuration(clip.duration)}</small></span>
        <button className="ui-icon-button ui-button--compact" onClick={onClose} title="Close the preview" aria-label="Close dashboard TTS preview"><X size={18} /></button>
      </div>
      <p>{clip.prompt}</p>
      <audio
        ref={audioRef}
        key={clip.id}
        controls
        autoPlay={autoPlay}
        preload="metadata"
        src={`${base}/clips/${clip.id}/audio`}
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
        onEnded={() => onPlayingChange(false)}
      />
    </div>
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
