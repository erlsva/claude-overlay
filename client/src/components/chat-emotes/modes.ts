import type { ChatEmoteMotion } from "../../types";

type Motion = ChatEmoteMotion;

/** "Pop in" modes: how long an emote fades in where it appeared before it starts moving, and how long it fades out at the end. */
export const POP_FADE_IN_MS = 1000;
export const POP_FADE_OUT_MS = 600;

export const isPop = (motion: Motion) => motion === "pop-walls" || motion === "pop-floor";

/** Modes with gravity and a floor to land on. */
export const usesFloor = (motion: Motion) => motion === "floor" || motion === "pop-floor";

/** Modes where a new emote is invisible at first and fades in, so it never flashes at the corner. */
const FADES_IN = new Set<Motion>(["pop-walls", "pop-floor", "drift", "orbit", "slide", "pile"]);
export const startsHidden = (motion: Motion) => FADES_IN.has(motion);

/** Modes that turn new emotes away while full, instead of dropping the oldest. */
const TURNS_AWAY = new Set<Motion>(["parade", "fireworks", "rain", "snow", "rise", "conga"]);
export const turnsAwayWhenFull = (motion: Motion) => TURNS_AWAY.has(motion);

export function loadImageAspectRatio(imageUrl: string) {
  return new Promise<number>((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(Math.max(0.25, Math.min(12, image.naturalWidth / Math.max(1, image.naturalHeight))));
    image.onerror = () => resolve(1);
    image.src = imageUrl;
  });
}

interface Placed {
  x: number;
  y: number;
  sizeFactor?: number;
  scaleX?: number;
  scaleY?: number;
}

export function transformFor(particle: Placed) {
  const move = `translate3d(${particle.x}px, ${particle.y}px, 0)`;
  const sx = (particle.scaleX ?? 1) * (particle.sizeFactor ?? 1);
  const sy = (particle.scaleY ?? 1) * (particle.sizeFactor ?? 1);
  return sx === 1 && sy === 1 ? move : `${move} scale(${sx}, ${sy})`;
}

/** Puts an emote's node where the emote is, optionally setting how see-through it is (0 to 1). */
export function draw(node: HTMLElement | undefined, particle: Placed, opacity?: number) {
  if (!node) return;
  node.style.transform = transformFor(particle);
  if (opacity !== undefined) node.style.opacity = String(Math.max(0, Math.min(1, opacity)));
}

/** 0 to 1: fades in over `inMs` after birth and out over `outMs` before the end of life. */
export const fadeOpacity = (age: number, remaining: number, inMs: number, outMs: number) =>
  Math.max(0, Math.min(1, age / inMs, remaining / outMs));

export const between = (low: number, high: number) => low + Math.random() * (high - low);
export const randomSign = () => (Math.random() < 0.5 ? -1 : 1);
