import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { SERVER_URL } from "../config/server";
import { pageCount, parsePage } from "../support/pagination";
import { ClipCard, type PublicClip } from "./tts-guide/ClipCard";
import { Emote } from "./tts-guide/Emote";
import type { EmoteName } from "./tts-guide/emotes";
import { Pager } from "./tts-guide/Pager";
import { PublicShell } from "./tts-guide/PublicShell";

const PAGE_SIZE = 10;
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

/** Which clips are on this page: "11–20", or just "1" when there is only one. */
function shown(page: number, onPage: number): string {
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = first + onPage - 1;
  return first === last ? String(first) : `${first}–${last}`;
}

/** The address of a page of results, so a page or a search can be linked to. */
function addressOf(page: number, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return `/tts/clips${text ? `?${text}` : ""}`;
}

/** The page and search the address bar names. */
function readAddress() {
  const params = new URLSearchParams(window.location.search);
  return {
    page: parsePage(params.get("page")),
    query: (params.get("q") ?? "").trim().slice(0, 120),
  };
}

/**
 * Every saved TTS clip, searchable, at /tts/clips. Unlike the cheat sheet this asks the server,
 * so on a quiet day the first visit can wait while Render wakes up. It says so.
 */
export function TtsClips() {
  const [start] = useState(readAddress);
  const [typed, setTyped] = useState(start.query);
  const [query, setQuery] = useState(start.query);
  const [page, setPage] = useState(start.page);
  const [clips, setClips] = useState<PublicClip[]>([]);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "off" | "error">("loading");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const top = useRef<HTMLParagraphElement>(null);
  const pages = pageCount(total, PAGE_SIZE);

  // Typing searches after a short pause, and a new search starts again from the first page.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = typed.trim();
      if (next === query) return;
      setQuery(next);
      setPage(1);
      window.history.replaceState({}, "", addressOf(1, next));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [typed, query]);

  // The back and forward buttons move between pages and searches.
  useEffect(() => {
    const restore = () => {
      const address = readAddress();
      setPage(address.page);
      setTyped(address.query);
      setQuery(address.query);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setSlow(false);
    setPhase((current) => (current === "error" ? "loading" : current));
    audio.current?.pause();
    setPlaying(null);
    const slowTimer = window.setTimeout(() => setSlow(true), 4000);
    fetchClips(query, (page - 1) * PAGE_SIZE, controller.signal)
      .then((result) => {
        if (result === "off") return setPhase("off");
        // A page past the end (an old link, or clips deleted since) shows the last one instead.
        if (result.clips.length === 0 && result.total > 0 && page > 1) {
          const last = pageCount(result.total, PAGE_SIZE);
          window.history.replaceState({}, "", addressOf(last, query));
          return setPage(last);
        }
        setClips(result.clips);
        setTotal(result.total);
        setPhase("ready");
        setBusy(false);
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
  }, [query, page, attempt]);

  useEffect(() => () => audio.current?.pause(), []);

  const goTo = (next: number) => {
    if (next === page || next < 1 || next > pages) return;
    window.history.pushState({}, "", addressOf(next, query));
    setPage(next);
    top.current?.scrollIntoView({ behavior: "instant" });
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
          <p className="tts-public__count" aria-live="polite" ref={top}>
            {busy ? (
              <>
                <Emote name="spin" size={26} /> Loading…
              </>
            ) : total === 0 ? (
              query ? (
                `No clips match “${query}”.`
              ) : (
                "No clips yet."
              )
            ) : (
              `Showing ${shown(page, clips.length)} of ${total} ${total === 1 ? "clip" : "clips"}${query ? ` matching “${query}”` : ""}`
            )}
          </p>
          {!busy && total === 0 && (
            <State emote={query ? "binoculars" : "peek"}>
              <strong>{query ? "Nothing matches that." : "No clips yet."}</strong>
              <p>{query ? "Try fewer or different words." : "Check back after the next stream."}</p>
            </State>
          )}
          <Pager
            page={page}
            pages={pages}
            hrefFor={(target) => addressOf(target, query)}
            busy={busy}
            label="Pages, top of the list"
            onGo={goTo}
          />
          <ul className="tts-public__clips" aria-busy={busy}>
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                playing={playing === clip.id}
                failed={failed === clip.id}
                onToggle={() => toggle(clip)}
              />
            ))}
          </ul>
          <Pager
            page={page}
            pages={pages}
            hrefFor={(target) => addressOf(target, query)}
            busy={busy}
            label="Pages, bottom of the list"
            onGo={goTo}
          />
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
