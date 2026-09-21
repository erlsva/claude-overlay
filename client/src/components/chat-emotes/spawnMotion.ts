import { paradeStartX } from "./classicMotion";
import { launchRocket } from "./fireworks";
import { isPop } from "./modes";
import { MODES } from "./modeRegistry";
import type { SpawnEnv, Start } from "./modeTypes";

/** Where a new emote starts and how it is moving, for the chosen movement mode. */
export function initialMotion(env: SpawnEnv): Start {
  const { settings, width, height, scale, size, labelHeight, particleWidth, speed } = env;
  const custom = MODES[settings.motion]?.spawn;
  if (custom) return custom(env);
  const floorY = height - size - labelHeight;
  let x: number;
  let y: number;
  let vx: number;
  let vy: number;
  if (settings.motion === "parade") {
    x = paradeStartX(env);
    y = floorY;
    vx = settings.direction === "left" ? -speed : speed;
    vy = 0;
  } else if (settings.motion === "corners") {
    x = settings.direction === "right" ? -particleWidth : width;
    y = floorY;
    vx = 0;
    vy = 0;
  } else if (settings.motion === "fireworks") {
    ({ x, y, vx, vy } = launchRocket({
      width,
      height,
      size,
      labelHeight,
      particleWidth,
      speed,
      gravity: settings.gravity * scale,
    }));
  } else if (isPop(settings.motion)) {
    // Appears anywhere; the velocity is used once the fade-in is over.
    x = Math.random() * Math.max(1, width - particleWidth);
    y = Math.random() * Math.max(1, height - size - labelHeight);
    if (settings.motion === "pop-floor") {
      // Falls from where it appeared, drifting gently to one side. No upward kick.
      vx = (Math.random() < 0.5 ? -1 : 1) * speed * (0.15 + Math.random() * 0.3);
      vy = 0;
    } else {
      const angle = Math.random() * Math.PI * 2;
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    }
  } else if (settings.motion === "floor") {
    x = Math.random() * Math.max(1, width - particleWidth);
    y = height * (0.08 + Math.random() * 0.25);
    vx = (Math.random() < 0.5 ? -1 : 1) * speed * (0.45 + Math.random() * 0.55);
    vy = -speed * (0.25 + Math.random() * 0.55);
  } else {
    // Wall bounce: starts on a random edge, heading inward.
    const edge = Math.floor(Math.random() * 4);
    const alongX = Math.random() * Math.max(1, width - particleWidth);
    const alongY = Math.random() * Math.max(1, height - size - labelHeight);
    const angleOffset = (Math.random() - 0.5) * 0.9;
    x = alongX;
    y = alongY;
    let angle = angleOffset;
    if (edge === 0) {
      x = 0;
      angle = angleOffset;
    }
    if (edge === 1) {
      x = width - particleWidth;
      angle = Math.PI + angleOffset;
    }
    if (edge === 2) {
      y = 0;
      angle = Math.PI / 2 + angleOffset;
    }
    if (edge === 3) {
      y = floorY;
      angle = -Math.PI / 2 + angleOffset;
    }
    vx = Math.cos(angle) * speed;
    vy = Math.sin(angle) * speed;
  }
  return { x, y, vx, vy };
}
