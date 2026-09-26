import { useState, type RefObject } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copies text. If the browser blocks the clipboard it selects `target` instead, so Ctrl+C finishes
 * the job, or says so when there is nothing on the page to select.
 */
export function CopyButton({
  text,
  label,
  target,
  idle = "Copy",
}: {
  text: string;
  label: string;
  target?: RefObject<HTMLElement>;
  /** What the button says before it is pressed. */
  idle?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "selected" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      if (target?.current) {
        window.getSelection()?.selectAllChildren(target.current);
        setStatus("selected");
      } else {
        setStatus("failed");
      }
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  };
  const said = {
    idle,
    copied: "Copied!",
    selected: "Selected",
    failed: "Could not copy",
  }[status];
  return (
    <button
      type="button"
      className={`tts-public__copy${status === "idle" ? "" : " is-done"}`}
      onClick={() => void copy()}
      aria-label={label}
    >
      {status === "idle" || status === "failed" ? (
        <Copy size={15} aria-hidden="true" />
      ) : (
        <Check size={15} aria-hidden="true" />
      )}
      {said}
    </button>
  );
}
