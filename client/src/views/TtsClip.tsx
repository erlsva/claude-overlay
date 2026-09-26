import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, CalendarDays, MessageSquareText } from "lucide-react";
import { SERVER_URL } from "../config/server";
import { clipIdFor } from "./routes";
import { colorFor, dateLabel, type PublicClip } from "./tts-guide/clipInfo";
import { ClipPlayer } from "./tts-guide/ClipPlayer";
import { CopyButton } from "./tts-guide/CopyButton";
import { Emote } from "./tts-guide/Emote";
import { PublicShell } from "./tts-guide/PublicShell";
import { State } from "./tts-guide/State";

type Phase = "loading" | "ready" | "off" | "missing" | "error";

/** One clip's details, or why there are none. */
async function fetchClip(id: string, signal: AbortSignal): Promise<PublicClip | Phase> {
  const response = await fetch(`${SERVER_URL}/tts/public/clips/${id}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (response.status === 503 && body.disabled) return "off";
  if (response.status === 404) return "missing";
  if (!response.ok) throw new Error(body.error ?? "This clip could not be loaded.");
  return body;
}

/**
 * One saved TTS clip at /tts/clips/<id>: what was said, and a player to listen to it, scrub
 * through it, turn it down and download it. It is the address to share a clip by.
 */
export function TtsClip() {
  const [id] = useState(() => clipIdFor(window.location.pathname) ?? "");
  const [phase, setPhase] = useState<Phase>("loading");
  const [clip, setClip] = useState<PublicClip | null>(null);
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const token = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    setSlow(false);
    const slowTimer = window.setTimeout(() => setSlow(true), 4000);
    fetchClip(id, controller.signal)
      .then((result) => {
        if (typeof result === "string") return setPhase(result);
        setClip(result);
        setPhase("ready");
      })
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return;
        setError(problem instanceof Error ? problem.message : "This clip could not be loaded.");
        setPhase("error");
      })
      .finally(() => window.clearTimeout(slowTimer));
    return () => {
      controller.abort();
      window.clearTimeout(slowTimer);
    };
  }, [id, attempt]);

  return (
    <PublicShell
      active="clips"
      title="TTS clip"
      heading={
        <>
          Listen to this <span className="tts-public__gradient">TTS clip</span>
        </>
      }
      lead="Play it, jump around in it, turn it down if it is loud, or download it."
      hero={
        <>
          <Emote name="dance" size={132} eager className="tts-public__hero-main" />
          <Emote
            name="gainsane"
            size={62}
            eager
            className="tts-public__float tts-public__float--a"
          />
          <Emote name="bounce" size={58} eager className="tts-public__float tts-public__float--b" />
          <Emote name="bork" size={60} eager className="tts-public__float tts-public__float--c" />
        </>
      }
      note={
        <>
          Clips are shown only while the streamer has the clip list switched on, and who asked for
          one is never shown. Want to make your own? The <a href="/tts">cheat sheet</a> has examples
          to copy.
        </>
      }
    >
      <a className="tts-public__back" href="/tts/clips">
        <ArrowLeft size={18} aria-hidden="true" /> All clips
      </a>

      {phase === "loading" && (
        <State emote="spin">
          <strong>Fetching the clip…</strong>
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
          <strong>Clips are switched off right now.</strong>
          <p>
            The streamer has the clip list turned off for the moment. The{" "}
            <a href="/tts">cheat sheet</a> is still here.
          </p>
        </State>
      )}
      {phase === "missing" && (
        <State emote="peek">
          <strong>This clip does not exist any more.</strong>
          <p>
            It may have been deleted. <a href="/tts/clips">Browse the clips that are left.</a>
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

      {phase === "ready" && clip && (
        <article
          className="tts-public__clip-page"
          style={{ "--sec": colorFor(clip.id) } as CSSProperties}
        >
          <h2 className="tts-public__clip-label">
            <MessageSquareText size={18} aria-hidden="true" /> Message
          </h2>
          <p className="tts-public__clip-message">{clip.prompt}</p>
          <p className="tts-public__clip-when">
            <CalendarDays size={15} aria-hidden="true" /> {dateLabel(clip.createdAt)}
          </p>
          <ClipPlayer clip={clip} />
          <div className="tts-public__clip-links">
            <CopyButton
              text={`${window.location.origin}/tts/clips/${clip.id}`}
              label="Copy the link to this clip"
              idle="Copy link"
            />
            <CopyButton
              text={clip.token}
              label={`Copy token ${clip.token}`}
              target={token}
              idle="Copy token"
            />
            <code ref={token}>{clip.token}</code>
          </div>
        </article>
      )}
    </PublicShell>
  );
}
