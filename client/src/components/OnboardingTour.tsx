import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  ImagePlus,
  Layers3,
  MonitorPlay,
  Radio,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import { ActionScopeBadge } from "./ActionScopeBadge";
import { usePresence } from "../hooks/usePresence";

const steps = [
  {
    eyebrow: "Your workspace",
    title: "Everything has a home",
    description:
      "Layers are on the left, the 1920×1080 stream area is in the middle, and Studio opens from the right.",
    Icon: Layers3,
    points: [
      "Select a layer to reveal its editing controls.",
      "Drag outside the stream area to stage media without showing it on the overlay.",
      "Middle-mouse pans and the mouse wheel zooms.",
    ],
  },
  {
    eyebrow: "Media",
    title: "Bring in media",
    description: "Use Add media or drop a file onto the canvas. Text and Draw sit right beside it.",
    Icon: ImagePlus,
    points: [
      "Ctrl/Cmd + V pastes an image, GIF or text straight onto the canvas.",
      "Library keeps shared default videos, images and sounds that survive restarts.",
      "Everyone with access can add to the Library or remove from it.",
    ],
  },
  {
    eyebrow: "Studio",
    title: "Sounds, automations and emotes",
    description: "Studio is where the overlay reacts to chat, Twitch events and your own buttons.",
    Icon: SlidersHorizontal,
    points: [
      "Sounds: Preview plays only in your browser, Play on overlay is heard on stream.",
      "Automations: chat commands and Twitch events live together. Press ▶ to run one as a test.",
      "Emotes: tune how chat emotes move, and block emotes or chatters.",
    ],
  },
  {
    eyebrow: "Know the audience",
    title: "See where things play",
    description:
      "Actions say where they run. Dashboard-only actions are private to you; overlay actions are seen or heard by viewers.",
    Icon: Radio,
    scopes: true,
    points: [
      "Try a sound or movement privately before it goes live.",
      "Canvas edits are shared with everyone on the dashboard in real time.",
    ],
  },
  {
    eyebrow: "Watch it live",
    title: "Keep an eye on the overlay",
    description:
      "The Overlay group in the top bar shows a silent live copy of what viewers see, and refreshes the overlay in OBS.",
    Icon: MonitorPlay,
    points: [
      "Overlay Online means OBS has loaded the page. If it says Offline, nothing you play reaches the stream.",
      "The Preview eye shows the Twitch stream behind the canvas. The pointer button next to it lets you use the player’s own play and mute controls.",
      "Go-live check catches missing connections and misplaced media.",
    ],
  },
  {
    eyebrow: "One last thing",
    title: "Finish with the setup guide",
    description:
      "It has the overlay URL and OBS settings, a sound test and what each role can do. Streamers should go through it once before going live.",
    Icon: Rocket,
    checklist: true,
    points: [],
  },
] as const;

export function OnboardingTour({
  open,
  userName,
  onClose,
  hasLayers,
  overlayConnected,
  onStartText,
  onOpenSetup,
}: {
  open: boolean;
  userName: string;
  onClose: () => void;
  hasLayers: boolean;
  overlayConnected: boolean;
  onStartText: () => void;
  onOpenSetup: () => void;
}) {
  const [step, setStep] = useState(0);
  const presence = usePresence(open);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!presence.mounted) return null;
  const current = steps[step];
  const CurrentIcon = current.Icon;
  const lastStep = step === steps.length - 1;

  return (
    <div
      className="onboarding-backdrop motion-backdrop"
      data-state={presence.state}
      role="presentation"
    >
      <section
        className="onboarding-dialog motion-dialog"
        data-state={presence.state}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <header>
          <div className="onboarding-brand">
            <Sparkles size={15} aria-hidden="true" />
            Stream Overlay
          </div>
          <button
            className="ui-icon-button"
            onClick={onClose}
            aria-label="Close welcome tour"
            title="Close welcome tour"
          >
            <X size={15} />
          </button>
        </header>

        <div className="onboarding-content" key={step}>
          <div className="onboarding-visual" aria-hidden="true">
            <CurrentIcon size={42} strokeWidth={1.6} />
            {"scopes" in current && current.scopes && (
              <div className="onboarding-scope-sample">
                <ActionScopeBadge scope="dashboard" />
                <ActionScopeBadge scope="obs" />
                <ActionScopeBadge scope="both" />
              </div>
            )}
          </div>
          <div className="onboarding-copy">
            <span className="onboarding-eyebrow">
              {step === 0 ? `Welcome, ${userName}` : current.eyebrow}
            </span>
            <h2 id="onboarding-title">{current.title}</h2>
            <p>{current.description}</p>
            {current.points.length > 0 && (
              <ul>
                {current.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
            {"checklist" in current && current.checklist && (
              <div className="onboarding-checklist">
                <ChecklistItem
                  done={hasLayers}
                  label="Add your first layer"
                  action="Add text"
                  Icon={Type}
                  onClick={onStartText}
                />
                <ChecklistItem
                  done={overlayConnected}
                  label="Overlay is online in OBS"
                  action="Set it up"
                  Icon={Radio}
                  onClick={onOpenSetup}
                />
              </div>
            )}
          </div>
        </div>

        <footer>
          <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((item, index) => (
              <button
                key={item.title}
                className={index === step ? "active" : ""}
                onClick={() => setStep(index)}
                aria-label={`Open step ${index + 1}: ${item.title}`}
                aria-current={index === step ? "step" : undefined}
              />
            ))}
          </div>
          <div className="onboarding-actions">
            {step > 0 && (
              <button className="ui-button" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={13} /> Back
              </button>
            )}
            {lastStep ? (
              <>
                <button className="ui-button" onClick={onClose}>
                  Skip for now
                </button>
                <button className="ui-button studio-primary" onClick={onOpenSetup}>
                  <Rocket size={14} /> Open setup guide
                </button>
              </>
            ) : (
              <button className="ui-button studio-primary" onClick={() => setStep(step + 1)}>
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  action,
  Icon,
  onClick,
}: {
  done: boolean;
  label: string;
  action: string;
  Icon: typeof Type;
  onClick: () => void;
}) {
  return (
    <div className={done ? "onboarding-checklist__item done" : "onboarding-checklist__item"}>
      {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      <span>
        <Icon size={13} /> {label}
      </span>
      <button className="ui-button ui-button--compact" onClick={onClick}>
        {done ? "Review" : action}
      </button>
    </div>
  );
}
