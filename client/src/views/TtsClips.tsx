import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CalendarDays, Clock, Play, Search, Square } from "lucide-react";
import { SERVER_URL } from "../config/server";
import { CopyButton } from "./tts-guide/CopyButton";
import { Emote } from "./tts-guide/Emote";
import type { EmoteName } from "./tts-guide/emotes";
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
const CLIP_COLORS = [
  "var(--tp-orange)",
  "var(--tp-pink)",
  "var(--tp-sky)",
  "var(--tp-mint)",
  "var(--tp-yellow)",
  "var(--tp-lavender)",
  "var(--tp-coral)",
  "var(--tp-lime)",
];

/** The same clip always gets the same colour, so the list looks familiar from one visit to the next. */
function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CLIP_COLORS[hash % CLIP_COLORS.length];
}

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

const length = (value: number) =>
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
      heading={
        <>
          Every <span className="tts-public__gradient">TTS clip</span>
        </>
      }
      lead="Everything that has ever been said. Search it, listen to it, and copy its (TTS:…) token to replay a good one."
      hero={
        <>
          <Emote name="binoculars" size={132} eager className="tts-public__hero-main" />
          <Emote name="peek" size={62} eager className="tts-public__float tts-public__float--a" />
          <Emote name="bork" size={58} eager className="tts-public__float tts-public__float--b" />
          <Emote name="insane" size={60} eager className="tts-public__float tts-public__float--c" />
        </>
      }
      actions={
        <a className="tts-public__button tts-public__button--ghost" href="/tts">
          How to make your own
        </a>
      }
      note={
        <>
          Clips are listed only while the streamer has this page switched on, and who asked for each
          one is never shown. Want to make your own? The <a href="/tts">cheat sheet</a> has examples
          to copy.
        </>
      }
    >
      <label className="tts-public__search">
        <Search size={20} aria-hidden="true" />
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
        <State emote="spin">
          <strong>Fetching clips…</strong>
          {slow && (
            <p>
              The server sleeps when nobody has used it for a while, so the first load can take up
              to a minute. Hang tight, the fox is warming it up.
            </p>
          )}
        </State>
      )}
      {phase === "off" && (
        <State emote="wixelsSit">
          <strong>The clip list is switched off right now.</strong>
          <p>
            The streamer has it turned off for the moment. The <a href="/tts">cheat sheet</a> is
            still here.
          </p>
        </State>
      )}
      {phase === "error" && (
        <State emote="bork">
          <strong>{error}</strong>
          <button
            type="button"
            className="tts-public__button tts-public__button--small"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Try again
          </button>
        </State>
      )}

      {phase === "ready" && (
        <>
          <p className="tts-public__count" aria-live="polite">
            {total === 0
              ? query
                ? `No clips match “${query}”.`
                : "No clips yet."
              : `${total} ${total === 1 ? "clip" : "clips"}${query ? ` matching “${query}”` : ""}`}
          </p>
          {total === 0 && (
            <State emote={query ? "binoculars" : "peek"}>
              <strong>{query ? "Nothing matches that." : "No clips yet."}</strong>
              <p>{query ? "Try fewer or different words." : "Check back after the next stream."}</p>
            </State>
          )}
          <ul className="tts-public__clips">
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
              className="tts-public__button tts-public__more"
              onClick={() => void showMore()}
              disabled={loadingMore}
            >
              <Emote name="pounce" size={30} />
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}
    </PublicShell>
  );
}

function State({ emote, children }: { emote: EmoteName; children: ReactNode }) {
  return (
    <div className="tts-public__state" role="status">
      <Emote name={emote} size={84} />
      <div>{children}</div>
    </div>
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
  const color = colorFor(clip.id);
  return (
    <li
      className={`tts-public__clip${playing ? " is-playing" : ""}`}
      style={{ "--sec": color } as CSSProperties}
    >
      {playing && (
        <span className="tts-public__eq" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <div className="tts-public__clip-body">
        <p className="tts-public__clip-prompt">{clip.prompt}</p>
        <p className="tts-public__clip-meta">
          <span>
            <Clock size={14} aria-hidden="true" /> {length(clip.duration)}
          </span>
          <span>
            <CalendarDays size={14} aria-hidden="true" />{" "}
            {new Date(clip.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          {failed && <span className="tts-public__clip-failed">Could not be played</span>}
        </p>
        <div className="tts-public__clip-actions">
          <button
            type="button"
            className="tts-public__play"
            onClick={onToggle}
            aria-label={playing ? "Stop this clip" : "Play this clip"}
          >
            {playing ? (
              <Square size={16} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={16} fill="currentColor" aria-hidden="true" />
            )}
            {playing ? "Stop" : "Play"}
          </button>
          <CopyButton text={clip.token} label={`Copy token ${clip.token}`} target={token} />
          <code ref={token}>{clip.token}</code>
        </div>
      </div>
    </li>
  );
}
