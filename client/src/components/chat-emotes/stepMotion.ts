import { stepBounce, stepCorners, stepParade } from "./classicMotion";
import { stepRocket, stepSpark, type StepResult } from "./fireworks";
import { POP_FADE_IN_MS, POP_FADE_OUT_MS, isPop, transformFor } from "./modes";
import { MODES } from "./modeRegistry";
import type { FrameEnv, Particle } from "./types";

/** Advances one emote by one frame for the current movement mode. */
export function stepParticle(
  particle: Particle,
  node: HTMLElement | undefined,
  env: FrameEnv,
): StepResult {
  const { settings, now } = env;
  if (particle.spark) return stepSpark(particle, node, env);
  const mode = MODES[settings.motion];
  if (mode) return mode.step(particle, node, env);
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
