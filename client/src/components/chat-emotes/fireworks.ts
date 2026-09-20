import { transformFor } from "./modes";
import type { FrameEnv, Particle } from "./types";

const SPARK_COUNT = 10;
const SPARK_LIFE_MS = 1500;
/** Sparks fall more gently than the rocket did. */
const SPARK_GRAVITY = 0.6;

/** Where a rocket starts and how fast it must go up to peak in the upper part of the screen. */
export function launchRocket(args: {
  width: number;
  height: number;
  size: number;
  labelHeight: number;
  particleWidth: number;
  speed: number;
  gravity: number;
}) {
  const { width, height, size, labelHeight, particleWidth, speed, gravity } = args;
  const floorY = height - size - labelHeight;
  const apexY = height * (0.12 + Math.random() * 0.28);
  const rise = Math.max(60, floorY - apexY);
  return {
    x: Math.random() * Math.max(1, width - particleWidth),
    y: floorY,
    // v = sqrt(2·g·h) is exactly the speed that reaches height h under gravity g.
    vy: -Math.sqrt(2 * gravity * rise),
    vx: (Math.random() < 0.5 ? -1 : 1) * speed * 0.1 * Math.random(),
  };
}

/** Replaces a rocket that reached its peak with copies of its first emote, flying outward. */
function burst(rocket: Particle, env: FrameEnv): Particle[] {
  const { settings, scale, size, labelHeight, now } = env;
  const ratio = rocket.stackAspectRatios[0] ?? 1;
  const rocketWidth = size * rocket.aspectRatio;
  const centerX = rocket.x + rocketWidth / 2;
  const centerY = rocket.y + labelHeight + size / 2;
  const speed = settings.speed * scale;
  const turn = Math.random() * Math.PI * 2;
  return Array.from({ length: SPARK_COUNT }, (_, index) => {
    const angle = turn + (index / SPARK_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const spread = speed * (1.1 + Math.random() * 0.7);
    return {
      ...rocket,
      id: `${rocket.id}-spark-${index}`,
      x: centerX - (size * ratio) / 2,
      y: centerY - size / 2,
      vx: Math.cos(angle) * spread,
      vy: Math.sin(angle) * spread,
      bornAt: now,
      aspectRatio: ratio,
      sequenceAspectRatios: [rocket.sequenceAspectRatios[0] ?? 1],
      overlayAspectRatios: [rocket.overlayAspectRatios[0] ?? []],
      stackAspectRatios: [ratio],
      additional: undefined,
      cornerWaypointIndex: undefined,
      spark: true,
      sizeFactor: 0.4 + Math.random() * 0.25,
    };
  });
}

export interface StepResult {
  expired?: boolean;
  sparks?: Particle[];
}

/** One frame of a rocket: it climbs and slows under gravity, and bursts when it starts to fall. */
export function stepRocket(
  rocket: Particle,
  node: HTMLElement | undefined,
  env: FrameEnv,
): StepResult {
  const { settings, scale, width, size, dt, now } = env;
  const particleWidth = size * rocket.aspectRatio;
  rocket.vy += settings.gravity * scale * dt;
  rocket.x = Math.max(0, Math.min(width - particleWidth, rocket.x + rocket.vx * dt));
  rocket.y += rocket.vy * dt;
  if (node) node.style.transform = transformFor(rocket);
  if (rocket.vy >= 0) return { expired: true, sparks: burst(rocket, env) };
  if (now - rocket.bornAt >= settings.lifetimeSeconds * 1000) return { expired: true };
  return {};
}

/** One frame of a spark: it arcs outward, falls a little and fades away. */
export function stepSpark(
  spark: Particle,
  node: HTMLElement | undefined,
  env: FrameEnv,
): StepResult {
  const { settings, scale, dt, now } = env;
  const age = now - spark.bornAt;
  if (age >= SPARK_LIFE_MS) return { expired: true };
  spark.vy += settings.gravity * SPARK_GRAVITY * scale * dt;
  spark.x += spark.vx * dt;
  spark.y += spark.vy * dt;
  if (node) {
    node.style.transform = transformFor(spark);
    node.style.opacity = String(Math.max(0, 1 - (age / SPARK_LIFE_MS) ** 2));
  }
  return {};
}
