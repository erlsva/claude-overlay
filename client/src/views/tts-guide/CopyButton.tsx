import { useState, type RefObject } from "react";
import { Check, Copy } from "lucide-react";

/** Copies text. If the browser blocks the clipboard it selects `target` instead, so Ctrl+C finishes the job. */
export function CopyButton({
  text,
  label,
  target,
}: {
  text: string;
  label: string;
  target: RefObject<HTMLElement>;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "selected">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      if (target.current) window.getSelection()?.selectAllChildren(target.current);
      setStatus("selected");
    }
    window.setTimeout(() => setStatus("idle"), 1800);
  };
  return (
    <button
      type="button"
      className={`tts-public__copy${status === "idle" ? "" : " is-done"}`}
      onClick={() => void copy()}
      aria-label={label}
    >
      {status === "idle" ? (
        <Copy size={15} aria-hidden="true" />
      ) : (
        <Check size={15} aria-hidden="true" />
      )}
      {status === "idle" ? "Copy" : status === "copied" ? "Copied!" : "Selected"}
    </button>
  );
}
