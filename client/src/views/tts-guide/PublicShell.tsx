import type { ReactNode } from "react";
import { TabIdentity } from "../../components/TabIdentity";
import { useNoIndex } from "../../hooks/useNoIndex";

/**
 * The frame the public TTS pages share: a header, and links between them. The pages are separate
 * addresses on purpose, so the cheat sheet shows at once and only the clip list has to wait for
 * the server. Both get the shared tab title and icon, and search engines are asked to skip them.
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
  useNoIndex();

  return (
    <div className="tts-public">
      <TabIdentity title={`${title} | Stream Overlay`} />
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
