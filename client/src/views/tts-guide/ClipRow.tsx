import { memo, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { formatLength } from "../../support/waveform";
import { colorFor, dateLabel, type PublicClip } from "./clipInfo";

/**
 * One line of the clip list: what was said, when, and how long it is. The whole row is a link to
 * the clip's own page, where it can be played, so it can also be opened in a new tab or shared.
 */
export const ClipRow = memo(function ClipRow({ clip }: { clip: PublicClip }) {
  return (
    <li>
      <a
        className="tts-public__clip"
        href={`/tts/clips/${clip.id}`}
        style={{ "--sec": colorFor(clip.id) } as CSSProperties}
      >
        <span className="tts-public__clip-text">
          <span className="tts-public__clip-prompt">{clip.prompt}</span>
          <span className="tts-public__clip-date">{dateLabel(clip.createdAt)}</span>
        </span>
        <span className="tts-public__clip-length">{formatLength(clip.duration)}</span>
        <ChevronRight size={20} aria-hidden="true" />
      </a>
    </li>
  );
});
