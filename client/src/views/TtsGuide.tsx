import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import {
  TTS_GUIDE_FOOTER,
  TTS_GUIDE_LEAD,
  TTS_GUIDE_SECTIONS,
  TTS_GUIDE_TITLE,
  TTS_GUIDE_WARNING,
  type GuideExample,
} from "./tts-guide/content";

/**
 * The public TTS cheat sheet at /tts-guide. It needs no login and makes no request to the
 * server, so opening it never wakes the backend. Search engines are asked to skip it.
 */
export function TtsGuide() {
  useEffect(() => {
    document.title = `${TTS_GUIDE_TITLE} | Stream Overlay`;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    // A link to one section (/tts-guide#timing) is opened before the sections exist to jump to.
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    return () => robots.remove();
  }, []);

  return (
    <div className="tts-guide">
      <main className="tts-guide__page">
        <header className="tts-guide__header">
          <span className="tts-guide__eyebrow">Text-to-speech</span>
          <h1>{TTS_GUIDE_TITLE}</h1>
          <p>{TTS_GUIDE_LEAD}</p>
        </header>

        <div className="tts-guide__warning" role="note">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>
            <strong>Experimental feature.</strong> {TTS_GUIDE_WARNING}
          </p>
        </div>

        <nav className="tts-guide__toc" aria-label="Sections">
          {TTS_GUIDE_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>

        {TTS_GUIDE_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="tts-guide__section">
            <h2>{section.title}</h2>
            <p className="tts-guide__intro">{section.intro}</p>
            {section.examples && (
              <ul className="tts-guide__examples">
                {section.examples.map((example) => (
                  <Example key={example.prompt} example={example} />
                ))}
              </ul>
            )}
            {section.chips && (
              <ul className="tts-guide__chips" aria-label={`${section.title} that work`}>
                {section.chips.map((chip) => (
                  <li key={chip}>{chip}</li>
                ))}
              </ul>
            )}
            {section.points && (
              <ul className="tts-guide__points">
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <footer className="tts-guide__footer">{TTS_GUIDE_FOOTER}</footer>
      </main>
    </div>
  );
}

function Example({ example }: { example: GuideExample }) {
  const [status, setStatus] = useState<"idle" | "copied" | "selected">("idle");
  const code = useRef<HTMLElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(example.prompt);
      setStatus("copied");
    } catch {
      // Clipboard access can be blocked. Select the text instead, so Ctrl+C finishes the job.
      if (code.current) window.getSelection()?.selectAllChildren(code.current);
      setStatus("selected");
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  };
  return (
    <li className="tts-guide__example">
      <div>
        <code ref={code}>{example.prompt}</code>
        <button
          type="button"
          className="tts-guide__copy"
          onClick={() => void copy()}
          aria-label={`Copy example: ${example.prompt}`}
        >
          {status === "idle" ? (
            <Copy size={13} aria-hidden="true" />
          ) : (
            <Check size={13} aria-hidden="true" />
          )}
          {status === "idle" ? "Copy" : status === "copied" ? "Copied" : "Selected"}
        </button>
      </div>
      {example.note && <p>{example.note}</p>}
    </li>
  );
}
