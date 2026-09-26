import { useEffect, useRef, type CSSProperties } from "react";
import { CopyButton } from "./tts-guide/CopyButton";
import { Emote } from "./tts-guide/Emote";
import { PublicShell } from "./tts-guide/PublicShell";
import { FALLBACK_LOOK, SECTION_LOOKS } from "./tts-guide/sectionStyle";
import {
  TTS_GUIDE_FOOTER,
  TTS_GUIDE_LEAD,
  TTS_GUIDE_SECTIONS,
  TTS_GUIDE_TITLE,
  TTS_GUIDE_WARNING,
  type GuideExample,
} from "./tts-guide/content";

const lookOf = (id: string) => SECTION_LOOKS[id] ?? FALLBACK_LOOK;
const colorOf = (id: string) => ({ "--sec": lookOf(id).color }) as CSSProperties;

/**
 * The public TTS cheat sheet at /tts. It needs no login and nothing from the server to render,
 * so it shows at once even while the backend is asleep.
 */
export function TtsGuide() {
  useEffect(() => {
    // A link to one section (/tts#timing) is opened before the sections exist to jump to.
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
  }, []);

  return (
    <PublicShell
      active="guide"
      title={TTS_GUIDE_TITLE}
      heading={
        <>
          TTS <span className="tts-public__gradient">cheat sheet</span>
        </>
      }
      lead={TTS_GUIDE_LEAD}
      hero={
        <>
          <Emote name="dance" size={148} eager className="tts-public__hero-main" />
          <Emote name="boogie" size={64} eager className="tts-public__float tts-public__float--a" />
          <Emote name="bounce" size={58} eager className="tts-public__float tts-public__float--b" />
          <Emote
            name="gainsane"
            size={60}
            eager
            className="tts-public__float tts-public__float--c"
          />
        </>
      }
      actions={
        <>
          <a className="tts-public__button" href="#basics">
            Start with the basics
          </a>
          <a className="tts-public__button tts-public__button--ghost" href="/tts/clips">
            Browse every clip
          </a>
        </>
      }
      note={TTS_GUIDE_FOOTER}
    >
      <aside className="tts-public__warning" role="note">
        <span className="tts-public__warning-emote">
          <Emote name="peek" size={72} />
        </span>
        <div>
          <strong>Heads up: this is experimental.</strong>
          <p>{TTS_GUIDE_WARNING}</p>
        </div>
      </aside>

      <nav className="tts-public__toc" aria-label="Sections">
        {TTS_GUIDE_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} style={colorOf(section.id)}>
            <Emote name={lookOf(section.id).emote} size={26} />
            {section.title}
          </a>
        ))}
      </nav>

      {TTS_GUIDE_SECTIONS.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className="tts-public__section"
          style={colorOf(section.id)}
        >
          <header className="tts-public__section-head">
            <span className="tts-public__bubble">
              <Emote name={lookOf(section.id).emote} size={68} />
            </span>
            <div>
              <span className="tts-public__step">{String(index + 1).padStart(2, "0")}</span>
              <h2>{section.title}</h2>
            </div>
          </header>
          <p className="tts-public__intro">{section.intro}</p>
          {section.examples && (
            <ul className="tts-public__examples">
              {section.examples.map((example) => (
                <Example key={example.prompt} example={example} />
              ))}
            </ul>
          )}
          {section.chips && (
            <ul className="tts-public__chips" aria-label={`${section.title} that work`}>
              {section.chips.map((chip) => (
                <li key={chip}>{chip}</li>
              ))}
            </ul>
          )}
          {section.points && (
            <ul className="tts-public__points">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </PublicShell>
  );
}

function Example({ example }: { example: GuideExample }) {
  const code = useRef<HTMLElement>(null);
  return (
    <li className="tts-public__example">
      <div>
        <code ref={code}>{example.prompt}</code>
        <CopyButton text={example.prompt} label={`Copy example: ${example.prompt}`} target={code} />
      </div>
      {example.note && <p>{example.note}</p>}
    </li>
  );
}
