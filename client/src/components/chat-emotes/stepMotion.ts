import { stepRocket, stepSpark, type StepResult } from "./fireworks";
import { POP_FADE_IN_MS, POP_FADE_OUT_MS, isPop, transformFor, usesFloor } from "./modes";
import type { FrameEnv, Particle } from "./types";

/** The bottom parade: everything slides along the floor, and is done once it has left the screen. */
function stepParade(particle: Particle, node: HTMLElement | undefined, env: FrameEnv): StepResult {
  const { settings, scale, width, size, height, labelHeight, dt } = env;
  const particleWidth = size * particle.aspectRatio;
  particle.vx = settings.direction === "left" ? -settings.speed * scale : settings.speed * scale;
  particle.vy = 0;
  particle.x += particle.vx * dt;
  particle.y = height - size - labelHeight;
  if (node) node.style.transform = transformFor(particle);
  const gone =
    (settings.direction === "left" && particle.x + particleWidth < 0) ||
    (settings.direction === "right" && particle.x > width);
  return gone ? { expired: true } : {};
}

/** The corner route: bottom, up the side, across the top, down the other side, and off. */
function stepCorners(particle: Particle, node: HTMLElement | undefined, env: FrameEnv): StepResult {
  const { settings, scale, width, size, height, labelHeight, dt } = env;
  const particleWidth = size * particle.aspectRatio;
  const floorY = height - size - labelHeight;
  const direction = particle.cornerDirection ?? settings.direction;
  const waypoints =
    direction === "right"
      ? [
          [0, floorY],
          [0, 0],
          [width - particleWidth, 0],
          [width - particleWidth, floorY],
          [width + particleWidth, floorY],
        ]
      : [
          [width - particleWidth, floorY],
          [width - particleWidth, 0],
          [0, 0],
          [0, floorY],
          [-particleWidth * 2, floorY],
        ];
  const waypointIndex = particle.cornerWaypointIndex ?? 0;
  const target = waypoints[waypointIndex];
  if (!target) return { expired: true };
  const dx = target[0] - particle.x;
  const dy = target[1] - particle.y;
  const distance = Math.hypot(dx, dy);
  const travel = settings.speed * scale * dt;
  if (distance <= travel) {
    particle.x = target[0];
    particle.y = target[1];
    particle.cornerWaypointIndex = waypointIndex + 1;
  } else {
    particle.x += (dx / distance) * travel;
    particle.y += (dy / distance) * travel;
  }
  if (node) node.style.transform = transformFor(particle);
  return {};
}

/** Bouncing around: off the walls and ceiling, and with gravity and a floor in the floor modes. */
function stepBounce(particle: Particle, node: HTMLElement | undefined, env: FrameEnv): StepResult {
  const { settings, scale, width, size, height, labelHeight, dt, now } = env;
  const particleWidth = size * particle.aspectRatio;
  const floorY = height - size - labelHeight;
  const floor = usesFloor(settings.motion);
  const restingOnFloor = floor && particle.y >= floorY - 0.5 && particle.vy === 0;
  if (floor && !restingOnFloor) particle.vy += settings.gravity * scale * dt;
  if (restingOnFloor) particle.vx *= Math.pow(0.35, dt);
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  if (particle.x <= 0 || particle.x + particleWidth >= width) {
    particle.x = Math.max(0, Math.min(width - particleWidth, particle.x));
    particle.vx *= floor ? -0.84 : -1;
  }
  if (particle.y <= 0) {
    particle.y = 0;
    particle.vy = Math.abs(particle.vy) * (floor ? 0.7 : 1);
  }
  if (particle.y + size + labelHeight >= height) {
    particle.y = floorY;
    particle.vy =
      floor && Math.abs(particle.vy) < 80 * scale ? 0 : -Math.abs(particle.vy) * (floor ? 0.68 : 1);
    if (floor) particle.vx *= 0.92;
  }
  if (node) node.style.transform = transformFor(particle);
  return now - particle.bornAt >= settings.lifetimeSeconds * 1000 ? { expired: true } : {};
}

/** Advances one emote by one frame for the current movement mode. */
export function stepParticle(
  particle: Particle,
  node: HTMLElement | undefined,
  env: FrameEnv,
): StepResult {
  const { settings, now } = env;
  if (particle.spark) return stepSpark(particle, node, env);
  if (isPop(settings.motion)) {
    const age = now - particle.bornAt;
    const remaining = settings.lifetimeSeconds * 1000 - age;
    if (node)
      node.style.opacity = String(
        Math.max(0, Math.min(1, age / POP_FADE_IN_MS, remaining / POP_FADE_OUT_MS)),
      );
    if (age < POP_FADE_IN_MS) {
      // Hold still while fading in.
      if (node) node.style.transform = transformFor(particle);
      return {};
    }
  } else if (node?.style.opacity) {
    node.style.opacity = "";
  }
  if (settings.motion === "parade") return stepParade(particle, node, env);
  if (settings.motion === "corners") return stepCorners(particle, node, env);
  if (settings.motion === "fireworks") return stepRocket(particle, node, env);
  return stepBounce(particle, node, env);
}
