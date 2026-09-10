import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Layers3,
  Radio,
  Sparkles,
  Type,
  WandSparkles,
  X,
} from "lucide-react";
import { ActionScopeBadge } from "./ActionScopeBadge";

const steps = [
  {
    eyebrow: "Your workspace",
    title: "Everything has a home",
    description:
      "Layers and activity live on the left, the 1920×1080 stream area is in the middle, and Studio opens from the right for automation and effects.",
    Icon: Layers3,
    points: [
      "Select a layer to reveal its editing controls.",
      "Drag outside the stream area to stage media without showing it on OBS.",
      "Use middle-mouse to pan and the mouse wheel to zoom.",
    ],
  },
  {
    eyebrow: "Know the audience",
    title: "Preview safely before going live",
    description:
      "Actions now say where they run. Dashboard previews are private to you; OBS actions are visible or audible to the stream.",
    Icon: Radio,
    scopes: true,
    points: [
      "Preview a sound or movement without affecting the stream.",
      "Use OBS actions only when you are ready for viewers to see or hear them.",
      "Canvas edits are shared with other dashboard users in real time.",
    ],
  },
  {
    eyebrow: "Automation",
    title: "Build commands like a sentence",
    description:
      "The command builder follows a simple flow: choose what starts it, choose what happens, then control who can use it and save.",
    Icon: WandSparkles,
    flow: true,
    points: [
      "Commands listen to public chat without broadcaster authentication.",
      "Events require Vicksy or Wixels to connect their Twitch account.",
      "DankChapBot needs its own connection to send automated chat messages.",
    ],
  },
  {
    eyebrow: "Ready for stream",
    title: "Check before viewers arrive",
    description:
      "Connection indicators show what is live. The go-live check catches missing OBS, Twitch permissions, broken command targets, and misplaced media.",
    Icon: CheckCircle2,
    points: [
      "Green status means the dashboard or OBS connection is online.",
      "Warnings explain what needs attention and where to fix it.",
      "Open the ? guide any time for every shortcut and control.",
    ],
    checklist: true,
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
  onOpenReadiness,
}: {
  open: boolean;
  userName: string;
  onClose: () => void;
  hasLayers: boolean;
  overlayConnected: boolean;
  onStartText: () => void;
  onOpenSetup: () => void;
  onOpenReadiness: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  const current = steps[step];
  const CurrentIcon = current.Icon;
  const lastStep = step === steps.length - 1;

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <header>
          <div className="onboarding-brand">
            <Sparkles size={15} aria-hidden="true" />
            Vicksy OBS Overlay
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

        <div className="onboarding-content">
          <div className="onboarding-visual" aria-hidden="true">
            <CurrentIcon size={42} strokeWidth={1.6} />
            {"scopes" in current && current.scopes && (
              <div className="onboarding-scope-sample">
                <ActionScopeBadge scope="dashboard" />
                <ActionScopeBadge scope="obs" />
                <ActionScopeBadge scope="both" />
              </div>
            )}
            {"flow" in current && current.flow && (
              <div className="onboarding-flow-sample">
                <span>WHEN</span><ArrowRight size={12} /><span>DO</span>
                <ArrowRight size={12} /><span>THEN</span>
              </div>
            )}
          </div>
          <div className="onboarding-copy">
            <span className="onboarding-eyebrow">
              {step === 0 ? `Welcome, ${userName}` : current.eyebrow}
            </span>
            <h2 id="onboarding-title">{current.title}</h2>
            <p>{current.description}</p>
            <ul>
              {current.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
            {"checklist" in current && current.checklist && (
              <div className="onboarding-checklist">
                <ChecklistItem done={hasLayers} label="Create your first layer" action="Add text" Icon={Type} onClick={onStartText} />
                <ChecklistItem done={overlayConnected} label="Connect the OBS browser source" action="View setup" Icon={Radio} onClick={onOpenSetup} />
                <ChecklistItem done={false} label="Run the pre-stream checks" action="Open check" Icon={ClipboardCheck} onClick={onOpenReadiness} />
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
            <button
              className="ui-button studio-primary"
              onClick={() => lastStep ? onClose() : setStep(step + 1)}
            >
              {lastStep ? "Start creating" : "Next"}
              {lastStep ? <CheckCircle2 size={14} /> : <ArrowRight size={14} />}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ChecklistItem({ done, label, action, Icon, onClick }: { done: boolean; label: string; action: string; Icon: typeof Type; onClick: () => void }) {
  return (
    <div className={done ? "onboarding-checklist__item done" : "onboarding-checklist__item"}>
      {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      <span><Icon size={13} /> {label}</span>
      <button className="ui-button ui-button--compact" onClick={onClick}>{done ? "Review" : action}</button>
    </div>
  );
}
