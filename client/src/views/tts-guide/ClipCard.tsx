import { useRef, type CSSProperties } from "react";
import { CalendarDays, Clock, Play, Square } from "lucide-react";
import { CopyButton } from "./CopyButton";

/** What the server shares about a clip: never who asked for it. */
export interface PublicClip {
  id: string;
  token: string;
  prompt: string;
  createdAt: string;
  duration: number;
}

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

const length = (value: number) =>
  value >= 60
    ? `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`
    : `${Math.round(value)}s`;

/** One clip: what was said, how long, when, its token, and a play button. */
export function ClipCard({
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
