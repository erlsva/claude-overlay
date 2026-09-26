import { useEffect, useState } from "react";
import { EMOTES, type EmoteName } from "./emotes";

/** Whether the visitor asked their system for less motion. Animated emotes then stand still. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * One emote at a given height (its width follows its own proportions). Decorative unless a
 * `label` is given. Emotes below the fold load lazily; the ones at the top pass `eager`.
 */
export function Emote({
  name,
  size = 56,
  label,
  eager = false,
  className = "",
}: {
  name: EmoteName;
  size?: number;
  label?: string;
  eager?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const wanted = EMOTES[name];
  const shown = reduced && wanted.still ? EMOTES[wanted.still] : wanted;
  return (
    <img
      className={`tts-public__emote ${className}`.trim()}
      src={shown.src}
      width={Math.round((size * shown.width) / shown.height)}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}
