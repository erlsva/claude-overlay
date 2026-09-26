import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Search, Square } from "lucide-react";
import { SERVER_URL } from "../config/server";
import { CopyButton } from "./tts-guide/CopyButton";
import { PublicShell } from "./tts-guide/PublicShell";

/** What the server shares about a clip: never who asked for it. */
interface PublicClip {
  id: string;
  token: string;
  prompt: string;
  createdAt: string;
  duration: number;
}

const PAGE_SIZE = 20;
const PLAYBACK_VOLUME = 0.5;

/** One page of matches, or "off" when the owner has switched the public list off. */
async function fetchClips(
  query: string,
  offset: number,
  signal: AbortSignal,
): Promise<{ clips: PublicClip[]; total: number } | "off"> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (query) params.set("q", query);
  const response = await fetch(`${SERVER_URL}/tts/public/clips?${params}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (response.status === 503 && body.disabled) return "off";
  if (!response.ok) throw new Error(body.error ?? "The clip list could not be loaded.");
  return body;
}

const seconds = (value: number) =>
  value >= 60
    ? `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`
    : `${Math.round(value)}s`;

/**
 * Every saved TTS clip, searchable, at /tts/clips. Unlike the cheat sheet this asks the server,
 * so on a quiet day the first visit can wait while Render wakes up. It says so.
 */
export function TtsClips() {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [clips, setClips] = useState<PublicClip[]>([]);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "off" | "error">("loading");
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    setSlow(false);
    const slowTimer = window.setTimeout(() => setSlow(true), 4000);
    fetchClips(query, 0, controller.signal)
      .then((result) => {
        if (result === "off") return setPhase("off");
        setClips(result.clips);
        setTotal(result.total);
        setPhase("ready");
      })
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return;
        setError(problem instanceof Error ? problem.message : "The clip list could not be loaded.");
        setPhase("error");
      })
      .finally(() => window.clearTimeout(slowTimer));
    return () => {
      controller.abort();
      window.clearTimeout(slowTimer);
    };
  }, [query, attempt]);

  useEffect(() => () => audio.current?.pause(), []);

  const showMore = async () => {
    setLoadingMore(true);
    try {
      const result = await fetchClips(query, clips.length, new AbortController().signal);
      if (result === "off") return setPhase("off");
      setClips((current) => [
        ...current,
        ...result.clips.filter((clip) => !current.some((known) => known.id === clip.id)),
      ]);
      setTotal(result.total);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The clip list could not be loaded.");
      setPhase("error");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = useCallback(
    (clip: PublicClip) => {
      const player = (audio.current ??= new Audio());
      if (playing === clip.id) {
        player.pause();
        setPlaying(null);
        return;
      }
      player.pause();
      player.src = `${SERVER_URL}/tts/clips/${clip.id}/audio`;
      player.volume = PLAYBACK_VOLUME;
      player.onended = () => setPlaying(null);
      player.onerror = () => {
        setPlaying(null);
        setFailed(clip.id);
      };
      setFailed(null);
      setPlaying(clip.id);
      player.play().catch(() => {
        setPlaying(null);
        setFailed(clip.id);
      });
    },
    [playing],
  );

  return (
    <PublicShell
      active="clips"
      title="All TTS clips"
      lead="Every clip that has been made. Search what was said, listen to it, and copy its (TTS:…) token to replay it."
    >
      <label className="tts-clips__search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search what was said, or paste a token…"
          aria-label="Search clips"
          maxLength={120}
        />
      </label>

      {phase === "loading" && (
        <p className="tts-clips__notice" role="status">
          Loading clips…
          {slow &&
            " The server sleeps when nobody has used it for a while, so the first load can take up to a minute. Hang tight."}
        </p>
      )}
      {phase === "off" && (
        <p className="tts-clips__notice" role="status">
          The clip list is not available right now. The <a href="/tts">cheat sheet</a> still is.
        </p>
      )}
      {phase === "error" && (
        <p className="tts-clips__notice" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </p>
      )}

      {phase === "ready" && (
        <>
          <p className="tts-clips__count" aria-live="polite">
            {total === 0
              ? query
                ? `No clips match “${query}”.`
                : "No clips yet."
              : `${total} ${total === 1 ? "clip" : "clips"}${query ? ` matching “${query}”` : ""}`}
          </p>
          <ul className="tts-clips__list">
            {clips.map((clip) => (
              <Clip
                key={clip.id}
                clip={clip}
                playing={playing === clip.id}
                failed={failed === clip.id}
                onToggle={() => toggle(clip)}
              />
            ))}
          </ul>
          {clips.length < total && (
            <button
              type="button"
              className="tts-clips__more"
              onClick={() => void showMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}

      <footer className="tts-public__footer">
        Clips are listed only while the streamer has this page switched on, and who asked for each
        one is never shown. To make your own, see the <a href="/tts">cheat sheet</a>.
      </footer>
    </PublicShell>
  );
}

function Clip({
  clip,
  playing,
  failed,
  onToggle,
}: {
  clip: PublicClip;
  playing: boolean;
  failed: boolean;
  onToggle: () => void;
}) {
  const token = useRef<HTMLElement>(null);
  return (
    <li className="tts-clips__item">
      <p className="tts-clips__prompt">{clip.prompt}</p>
      <p className="tts-clips__meta">
        {seconds(clip.duration)} ·{" "}
        {new Date(clip.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
        {failed && <span className="tts-clips__failed"> · This clip could not be played.</span>}
      </p>
      <div className="tts-clips__actions">
        <code ref={token}>{clip.token}</code>
        <CopyButton text={clip.token} label={`Copy token ${clip.token}`} target={token} />
        <button
          type="button"
          className="tts-public__copy"
          onClick={onToggle}
          aria-label={playing ? "Stop this clip" : "Play this clip"}
        >
          {playing ? (
            <Square size={12} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={12} fill="currentColor" aria-hidden="true" />
          )}
          {playing ? "Stop" : "Play"}
        </button>
      </div>
    </li>
  );
}
