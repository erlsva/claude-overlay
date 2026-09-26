import type { ReactNode } from "react";
import { useNoIndex } from "../../hooks/useNoIndex";

/**
 * The frame the public TTS pages share: a header, and links between them. The pages are separate
 * addresses on purpose, so the cheat sheet never has to ask the server for anything and only
 * the clip list can wake it. Search engines are asked to skip both.
 */
export function PublicShell({
  active,
  title,
  lead,
  children,
}: {
  active: "guide" | "clips";
  title: string;
  lead: string;
  children: ReactNode;
}) {
  useNoIndex(title);

  return (
    <div className="tts-public">
      <main className="tts-public__page">
        <header className="tts-public__header">
          <span className="tts-public__eyebrow">Text-to-speech</span>
          <h1>{title}</h1>
          <p>{lead}</p>
        </header>
        <nav className="tts-public__tabs" aria-label="Text-to-speech pages">
          <a href="/tts" aria-current={active === "guide" ? "page" : undefined}>
            Cheat sheet
          </a>
          <a href="/tts/clips" aria-current={active === "clips" ? "page" : undefined}>
            All clips
          </a>
        </nav>
        {children}
      </main>
    </div>
  );
}
