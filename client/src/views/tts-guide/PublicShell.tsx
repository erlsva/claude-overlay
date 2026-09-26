import type { ReactNode } from "react";
import { TWITCH_CHANNELS } from "../../config/twitchChannels";
import { useNoIndex } from "../../hooks/useNoIndex";
import { useTabIdentity } from "../../hooks/useTabIdentity";
import { Emote } from "./Emote";
import "./fonts";

/**
 * The frame the public TTS pages share: a top bar with the two pages, a hero, and a campfire
 * footer. The pages are separate addresses on purpose, so the cheat sheet shows at once and only
 * the clip list has to wait for the server. Both get the shared tab title and icon, and search
 * engines are asked to skip them.
 */
export function PublicShell({
  active,
  title,
  heading,
  lead,
  hero,
  actions,
  note,
  children,
}: {
  active: "guide" | "clips";
  /** The tab title, without the site name. */
  title: string;
  heading: ReactNode;
  lead: string;
  /** Emotes for the hero, positioned by the page. */
  hero: ReactNode;
  actions?: ReactNode;
  /** The line under the campfire. */
  note: ReactNode;
  children: ReactNode;
}) {
  useNoIndex();
  const { live } = useTabIdentity(`${title} | Stream Overlay`, TWITCH_CHANNELS);

  return (
    <div className="tts-public">
      <div className="tts-public__glow" aria-hidden="true" />

      <header className="tts-public__nav">
        <a className="tts-public__brand" href="/tts">
          <span className="tts-public__brand-emotes">
            <Emote name="icon" size={34} eager />
            <Emote name="wixelsSit" size={34} eager />
          </span>
          <span>
            Vicksy &amp; Wixels <b>TTS</b>
          </span>
        </a>
        {live && (
          <span className="tts-public__live" role="status">
            <i aria-hidden="true" /> Live now
          </span>
        )}
        <nav className="tts-public__tabs" aria-label="Text-to-speech pages">
          <a href="/tts" aria-current={active === "guide" ? "page" : undefined}>
            Cheat sheet
          </a>
          <a href="/tts/clips" aria-current={active === "clips" ? "page" : undefined}>
            All clips
          </a>
        </nav>
      </header>

      <main className="tts-public__page">
        <section className="tts-public__hero">
          <div className="tts-public__hero-copy">
            <h1>{heading}</h1>
            <p className="tts-public__lead">{lead}</p>
            {actions && <div className="tts-public__actions">{actions}</div>}
          </div>
          <div className="tts-public__hero-art" aria-hidden="true">
            {hero}
          </div>
        </section>
        {children}
      </main>

      <footer className="tts-public__footer">
        <Emote name="campfire" size={96} />
        <p>{note}</p>
      </footer>
    </div>
  );
}
