import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardCheck, Copy, Volume2, X } from "lucide-react";
import type { UserRole } from "../types";
import { ROLE_DESCRIPTIONS, ROLE_ORDER, RoleTag, RoleTags } from "./RoleTag";
import { Segmented } from "./Segmented";
import { useToast } from "./ToastProvider";
import { usePresence } from "../hooks/usePresence";

interface SetupGuideProps {
  open: boolean;
  onClose: () => void;
  role: UserRole;
  roles?: UserRole[];
  overlayConnected: boolean;
  onTestAudio: () => Promise<{ ok: boolean; message: string }>;
  onOpenReadiness: () => void;
}

type Audience = "streamer" | "moderator";

export function SetupGuide({ open, onClose, role, roles, overlayConnected, onTestAudio, onOpenReadiness }: SetupGuideProps) {
  const toast = useToast();
  const [audience, setAudience] = useState<Audience>(role === "streamer" || role === "owner" ? "streamer" : "moderator");
  const [audio, setAudio] = useState<{ running: boolean; ok?: boolean; message?: string }>({ running: false });
  const presence = usePresence(open);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!presence.mounted) return null;

  const overlayUrl = `${window.location.origin}/overlay`;
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };
  const runAudioTest = async () => {
    setAudio({ running: true });
    const result = await onTestAudio();
    setAudio({ running: false, ok: result.ok, message: result.message });
  };

  return (
    <div className="readiness-backdrop motion-backdrop" data-state={presence.state} onMouseDown={onClose}>
      <section
        className="readiness-dialog setup-dialog motion-dialog"
        data-state={presence.state}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="setup-title">Setup guide</h2>
            <p>Everything needed to get the overlay working, in order.</p>
          </div>
          <button className="ui-icon-button" onClick={onClose} title="Close setup guide" aria-label="Close setup guide">
            <X size={16} />
          </button>
        </header>

        <div className="setup-tabs">
          <Segmented
            label="Who is this guide for"
            value={audience}
            onChange={setAudience}
            options={[
              { value: "streamer", label: "I’m the streamer" },
              { value: "moderator", label: "I’m a moderator" },
            ]}
          />
        </div>

        <div className="setup-body">
          {audience === "streamer" ? (
            <>
              <Step n={1} title="Add the overlay to OBS" status={
                <span className={`status-pill ${overlayConnected ? "status-pill--ok" : "status-pill--bad"}`}>
                  <i aria-hidden="true" />
                  {overlayConnected ? "Overlay Online" : "Overlay Offline"}
                </span>
              }>
                <p>In OBS, add a <strong>Browser</strong> source (Sources → <strong>+</strong> → Browser) with these settings:</p>
                <CopyRow label="URL" value={overlayUrl} onCopy={() => void copy("URL", overlayUrl)} />
                <div className="setup-pair">
                  <CopyRow label="Width" value="1920" onCopy={() => void copy("Width", "1920")} />
                  <CopyRow label="Height" value="1080" onCopy={() => void copy("Height", "1080")} />
                </div>
                <ul>
                  <li>Turn <strong>Control audio via OBS</strong> on, so overlay sound reaches your mix.</li>
                  <li>Leave <strong>Shutdown source when not visible</strong> off, so the overlay stays loaded between scenes.</li>
                  <li>Custom CSS: leave it empty.</li>
                </ul>
                <p className="setup-note">The status above turns green as soon as OBS loads the page. The overlay is view-only, so it is safe to leave open.</p>
              </Step>

              <Step n={2} title="Check the sound">
                <p>Plays a short two-note chime on the overlay, so you know sound works before anyone depends on it.</p>
                <div className="setup-action">
                  <button className="ui-button" onClick={() => void runAudioTest()} disabled={audio.running}>
                    <Volume2 size={14} /> {audio.running ? "Listening…" : "Play test chime"}
                  </button>
                  {audio.message && (
                    <span className={`setup-result ${audio.ok ? "setup-result--ok" : "setup-result--bad"}`}>{audio.message}</span>
                  )}
                </div>
                <p className="setup-note">
                  This confirms the overlay page made sound. To confirm your <em>viewers</em> hear it, watch the audio meter for the source in OBS’s Audio Mixer while the chime plays.
                </p>
              </Step>

              <Step n={3} title="Connect your Twitch account">
                <p>Open <strong>Studio → Automations → Connections</strong> and connect each channel once. This lets follows, subscriptions, Bits and raids trigger actions.</p>
              </Step>

              <Step n={4} title="Try a command">
                <p>In <strong>Studio → Automations</strong>, press the ▶ next to any automation to run it as a test. Nothing waits on a real viewer.</p>
              </Step>

              <Step n={5} title="Before each stream">
                <p>The Go-live check confirms the overlay, Twitch connections, command targets and layer placement in one place.</p>
                <div className="setup-action">
                  <button className="ui-button" onClick={() => { onClose(); onOpenReadiness(); }}>
                    <ClipboardCheck size={14} /> Open Go-live check
                  </button>
                </div>
              </Step>
            </>
          ) : (
            <>
              <Block title="What you can do">
                <ul>
                  <li><strong>Layers:</strong> add, arrange and animate images, GIFs, video, text and drawings.</li>
                  <li><strong>Sounds:</strong> <em>Preview</em> plays only in your browser. <em>Play on overlay</em> is heard on stream.</li>
                  <li><strong>Automations:</strong> chat commands and Twitch event actions. The ▶ button runs one as a test.</li>
                  <li><strong>Library:</strong> shared default videos, images and sounds that stay available after restarts. Anyone can add or delete.</li>
                  <li><strong>Emotes:</strong> tune how chat emotes move, and block emotes or chatters.</li>
                </ul>
              </Block>
              <Block title="Good habits">
                <ul>
                  <li>Look at the <strong>Overlay Online</strong> light in the sidebar. If it says Offline, nothing you play will reach the stream.</li>
                  <li>Use <strong>Preview</strong> and <strong>Run test</strong> before something goes live.</li>
                  <li><strong>Ctrl/Cmd + Z</strong> undoes the last canvas change for everyone.</li>
                  <li>Actions marked <em>Plays on overlay</em> are seen or heard by viewers. Actions marked <em>Dashboard only</em> are private to you.</li>
                </ul>
              </Block>
              <Block title="Roles">
                <ul className="setup-roles">
                  {ROLE_ORDER.map((value) => (
                    <li key={value}>
                      <RoleTag role={value} />
                      <span>{ROLE_DESCRIPTIONS[value]}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            </>
          )}
        </div>

        <footer>
          <span className="setup-you">You are <RoleTags roles={roles} fallback={role} /></span>
          <button className="ui-button studio-primary" onClick={onClose} style={{ width: "auto" }}>
            <CheckCircle2 size={14} /> Done
          </button>
        </footer>
      </section>
    </div>
  );
}

function Step({ n, title, status, children }: { n: number; title: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section className="setup-step">
      <header>
        <b>{n}</b>
        <strong>{title}</strong>
        {status}
      </header>
      <div>{children}</div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="setup-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="setup-copy">
      <span>{label}</span>
      <code title={value}>{value}</code>
      <button className="ui-icon-button ui-button--compact ui-icon-button--ghost" onClick={onCopy} title={`Copy ${label.toLowerCase()}`} aria-label={`Copy ${label.toLowerCase()}`}>
        <Copy size={14} />
      </button>
    </div>
  );
}
