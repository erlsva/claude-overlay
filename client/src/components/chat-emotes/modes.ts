import type { ChatEmoteSettings } from "../../types";

type Motion = ChatEmoteSettings["motion"];

/** "Pop in" modes: how long an emote fades in where it appeared before it starts moving, and how long it fades out at the end. */
export const POP_FADE_IN_MS = 1000;
export const POP_FADE_OUT_MS = 600;

export const isPop = (motion: Motion) => motion === "pop-walls" || motion === "pop-floor";

/** Modes with gravity and a floor to land on. */
export const usesFloor = (motion: Motion) => motion === "floor" || motion === "pop-floor";

export function loadImageAspectRatio(imageUrl: string) {
  return new Promise<number>((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(Math.max(0.25, Math.min(12, image.naturalWidth / Math.max(1, image.naturalHeight))));
    image.onerror = () => resolve(1);
    image.src = imageUrl;
  });
}

export function transformFor(particle: { x: number; y: number; sizeFactor?: number }) {
  const move = `translate3d(${particle.x}px, ${particle.y}px, 0)`;
  return particle.sizeFactor ? `${move} scale(${particle.sizeFactor})` : move;
}
