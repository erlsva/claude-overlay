import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { CopyButton } from "./tts-guide/CopyButton";
import { PublicShell } from "./tts-guide/PublicShell";
import {
  TTS_GUIDE_FOOTER,
  TTS_GUIDE_LEAD,
  TTS_GUIDE_SECTIONS,
  TTS_GUIDE_TITLE,
  TTS_GUIDE_WARNING,
  type GuideExample,
} from "./tts-guide/content";

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
    <PublicShell active="guide" title={TTS_GUIDE_TITLE} lead={TTS_GUIDE_LEAD}>
      <div className="tts-public__warning" role="note">
        <AlertTriangle size={18} aria-hidden="true" />
        <p>
          <strong>Experimental feature.</strong> {TTS_GUIDE_WARNING}
        </p>
      </div>

      <nav className="tts-public__toc" aria-label="Sections">
        {TTS_GUIDE_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>

      {TTS_GUIDE_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="tts-public__section">
          <h2>{section.title}</h2>
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

      <footer className="tts-public__footer">{TTS_GUIDE_FOOTER}</footer>
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
