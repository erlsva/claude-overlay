/** The one-shot effect animations (pop, pulse, shake...) an element can play. */

import { type CanvasElement } from "../types";

export function animationFrames(name: CanvasElement["enterAnimation"]): Keyframe[] {
  const end = { opacity: 1, transform: "translate(0, 0) scale(1) rotate(0deg)" };
  const starts: Record<string, Keyframe> = {
    fade: { opacity: 0 },
    pop: { opacity: 0, transform: "scale(.55)" },
    "slide-left": { opacity: 0, transform: "translateX(-80px)" },
    "slide-right": { opacity: 0, transform: "translateX(80px)" },
    "slide-up": { opacity: 0, transform: "translateY(-80px)" },
    "slide-down": { opacity: 0, transform: "translateY(80px)" },
    spin: { opacity: 0, transform: "scale(.65) rotate(-180deg)" },
    none: end,
  };
  return [starts[name ?? "fade"] ?? starts.fade, end];
}

function effectAnimationFrames(name: CanvasElement["effectAnimation"]): Keyframe[] {
  if (name === "bounce")
    return [
      { transform: "translateY(0) scaleY(1)" },
      { transform: "translateY(-28px) scaleY(1.02)", offset: 0.32 },
      { transform: "translateY(0) scaleY(.94)", offset: 0.55 },
      { transform: "translateY(-11px) scaleY(1)", offset: 0.72 },
      { transform: "translateY(0) scaleY(1)" },
    ];
  if (name === "float")
    return [
      { transform: "translateY(0)" },
      { transform: "translateY(-18px)", offset: 0.25 },
      { transform: "translateY(0)", offset: 0.5 },
      { transform: "translateY(-10px)", offset: 0.75 },
      { transform: "translateY(0)" },
    ];
  if (name === "sway")
    return [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-7deg)", offset: 0.22 },
      { transform: "rotate(6deg)", offset: 0.48 },
      { transform: "rotate(-3deg)", offset: 0.72 },
      { transform: "rotate(0deg)" },
    ];
  if (name === "heartbeat")
    return [
      { transform: "scale(1)" },
      { transform: "scale(1.16)", offset: 0.2 },
      { transform: "scale(1)", offset: 0.36 },
      { transform: "scale(1.1)", offset: 0.53 },
      { transform: "scale(1)" },
    ];
  if (name === "pulse")
    return [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }];
  if (name === "spin") return [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }];
  if (name === "shake")
    return [
      { transform: "translateX(0)" },
      { transform: "translateX(-16px) rotate(-2deg)" },
      { transform: "translateX(14px) rotate(2deg)" },
      { transform: "translateX(-10px) rotate(-1deg)" },
      { transform: "translateX(8px) rotate(1deg)" },
      { transform: "translateX(0)" },
    ];
  return [
    { opacity: 0, transform: "scale(.4)" },
    { opacity: 1, transform: "scale(1.12)", offset: 0.72 },
    { opacity: 1, transform: "scale(1)" },
  ];
}

export function playRequestedEffect(node: HTMLElement, element: CanvasElement) {
  if (!element.effectAnimation || !element.effectStartedAt) return;
  const key = element.effectId ?? `${element.effectAnimation}:${element.effectStartedAt}`;
  if (node.dataset.effectAnimation === key) return;
  node.dataset.effectAnimation = key;
  const duration = Math.max(150, Math.min(10_000, element.effectDurationMs ?? 700));
  if (Date.now() - element.effectStartedAt > duration + 1500) return;
  const surface =
    node.querySelector<HTMLElement>(".element-content") ??
    (node.firstElementChild as HTMLElement | null);
  surface?.animate(effectAnimationFrames(element.effectAnimation), {
    duration,
    easing: ["shake", "sway", "float"].includes(element.effectAnimation)
      ? "ease-in-out"
      : "cubic-bezier(.2,.8,.2,1)",
  });
}
