import { TtsStatusCard } from "./TtsStatusCard";
import { TtsActions } from "./TtsActions";
import { TtsPlan } from "./TtsPlan";
import { TtsJobs } from "./TtsJobs";
import { TtsLibrary } from "./TtsLibrary";
import { Sparkles, BookOpen, Volume2, CircleAlert } from "lucide-react";
import { type TtsPanelProps } from "./types";
import { shorten } from "./api";
import { useTtsServices } from "./useTtsServices";
import { useTtsVolume } from "./useTtsVolume";
import { useTtsPreview } from "./useTtsPreview";
import { useTtsData } from "./useTtsData";
import { useTtsComposer } from "./useTtsComposer";
import type { TtsContext } from "./context";

export function TtsPanel(props: TtsPanelProps) {
  const ttsServices = useTtsServices();
  const ttsVolume = useTtsVolume(props, { ...ttsServices });
  const ttsPreview = useTtsPreview({ ...ttsVolume });
  const ttsData = useTtsData({ ...ttsVolume, ...ttsServices, ...ttsPreview });
  const ttsComposer = useTtsComposer({ ...ttsData, ...ttsServices, ...ttsPreview });
  const s: TtsContext = { ...ttsServices, ...ttsVolume, ...ttsPreview, ...ttsData, ...ttsComposer };
  const { overlayConnected } = props;
  const { busy, prompt, setPrompt, setPlan, volume, changeVolume, error, plan, jobs } = s;

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
        <summary>
          <BookOpen size={13} /> How TTS prompts work
        </summary>
        <div>
          <p>
            Plain text is spoken. Use <code>((…))</code> for directed speech, generated effects,
            pauses, rooms, and timing.
          </p>
          <code>{'((pirate screaming: "Run!" in a cave;speed=0.9x;8s))'}</code>
          <code>{"((gigantic fart in a cathedral;5s))"}</code>
          <code>{"((rumbling thunder;speed=0.5x;6s))"}</code>
          <code>{"((silence;2s))"}</code>
          <p>
            Quoted words are spoken; unquoted blocks become sound effects. A duration is the whole
            scene, including its echo or reverb tail. <code>speed=</code> runs from 0.5x to 2x on
            speech and sound effects alike, without changing pitch. Saved <code>(TTS:id)</code>{" "}
            tokens replay without spending generation credits.
          </p>
        </div>
      </details>

      <TtsStatusCard s={s} />

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
          placeholder={'((foxes barking while a warm voice says "Welcome, chat!" with echo;8s))'}
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

      <TtsActions props={props} s={s} />
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

      {plan && <TtsPlan s={s} />}

      {jobs.length > 0 && <TtsJobs s={s} />}

      <TtsLibrary props={props} s={s} />
    </section>
  );
}
