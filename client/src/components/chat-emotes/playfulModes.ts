import { stepBounce } from "./classicMotion";
import { paradeStartX } from "./classicMotion";
import { between, draw, fadeOpacity, randomSign } from "./modes";
import type { ModeImpl } from "./modeTypes";
import type { FrameEnv, Particle } from "./types";

const TAU = Math.PI * 2;

// --- Bouncy slide-in ---------------------------------------------------------------------

const SLIDE_MS = 900;
const POP_AWAY_MS = 450;

/** Overshoots its target a little and settles back, like a spring. */
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Slides in from a random edge with a rubber-band overshoot, idles with a wobble, then pops away. */
export const slide: ModeImpl = {
  spawn: ({ width, height, scale, size, labelHeight, particleWidth }) => {
    const margin = 40 * scale;
    const targetX = between(margin, Math.max(margin + 1, width - particleWidth - margin));
    const targetY = between(margin, Math.max(margin + 1, height - size - labelHeight - margin));
    const edge = Math.floor(Math.random() * 4);
    const startX = edge === 0 ? -particleWidth : edge === 1 ? width : targetX;
    const startY = edge === 2 ? -(size + labelHeight) : edge === 3 ? height : targetY;
    return {
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      state: { phase: Math.random() * TAU, startX, startY, targetX, targetY },
    };
  },
  step(p, node, env) {
    const { settings, scale, now } = env;
    const state = p.state!;
    const age = now - p.bornAt;
    const remaining = settings.lifetimeSeconds * 1000 - age;
    if (remaining <= 0) return { expired: true };
    const [startX, startY, targetX, targetY] = [
      state.startX ?? 0,
      state.startY ?? 0,
      state.targetX ?? 0,
      state.targetY ?? 0,
    ];
    if (age < SLIDE_MS) {
      const eased = easeOutBack(age / SLIDE_MS);
      p.x = startX + (targetX - startX) * eased;
      p.y = startY + (targetY - startY) * eased;
    } else {
      p.x = targetX + Math.sin(age * 0.0031 + state.phase) * 3 * scale;
      p.y = targetY + Math.sin(age * 0.004 + state.phase) * 5 * scale;
    }
    const poppingAway = remaining < POP_AWAY_MS;
    p.sizeFactor = poppingAway ? Math.max(0.01, remaining / POP_AWAY_MS) : undefined;
    draw(node, p, poppingAway ? remaining / POP_AWAY_MS : 1);
    return {};
  },
};

// --- Pinball -----------------------------------------------------------------------------

const SQUASH_MS = 260;

/** Wall bounce, but each hit squashes the emote against the wall and lets it spring back. */
export const pinball: ModeImpl = {
  step(p, node, env) {
    const state = (p.state ??= { phase: 0 });
    const [vx, vy] = [p.vx, p.vy];
    const result = stepBounce(p, node, env);
    if (vx !== 0 && Math.sign(p.vx) !== Math.sign(vx)) {
      state.squashAt = env.now;
      state.squashAxis = "x";
    }
    if (vy !== 0 && Math.sign(p.vy) !== Math.sign(vy)) {
      state.squashAt = env.now;
      state.squashAxis = "y";
    }
    const squash = Math.max(0, 1 - (env.now - (state.squashAt ?? -Infinity)) / SQUASH_MS);
    const flat = 1 - 0.28 * squash;
    const tall = 1 + 0.22 * squash;
    [p.scaleX, p.scaleY] = state.squashAxis === "y" ? [tall, flat] : [flat, tall];
    draw(node, p);
    return result;
  },
};

// --- Pile up -----------------------------------------------------------------------------

const PILE_FADE_IN_MS = 300;
const PILE_FADE_OUT_MS = 800;
const RESTITUTION = 0.2;

/** The circle an emote counts as when it bumps into others. */
const bodyOf = (p: Particle, size: number, labelHeight: number) => ({
  cx: p.x + (size * p.aspectRatio) / 2,
  cy: p.y + labelHeight + size / 2,
  r: size * 0.45,
});

/** Pushes `p` out of any emote it overlaps and bounces it off, so emotes stack into a heap. */
function collide(p: Particle, env: FrameEnv) {
  const { size, labelHeight, particles } = env;
  const mine = bodyOf(p, size, labelHeight);
  for (const other of particles) {
    if (other === p || other.spark || other.state === undefined || other.state.phase === undefined)
      continue;
    const theirs = bodyOf(other, size, labelHeight);
    const dx = mine.cx - theirs.cx;
    const dy = mine.cy - theirs.cy;
    const distance = Math.hypot(dx, dy) || 0.001;
    const gap = mine.r + theirs.r - distance;
    if (gap <= 0) continue;
    const [nx, ny] = [dx / distance, dy / distance];
    p.x += nx * gap;
    p.y += ny * gap;
    mine.cx += nx * gap;
    mine.cy += ny * gap;
    const into = p.vx * nx + p.vy * ny;
    if (into < 0) {
      p.vx -= (1 + RESTITUTION) * into * nx;
      p.vy -= (1 + RESTITUTION) * into * ny;
      p.vx *= 0.97;
    }
  }
}

/** Drops from the top and settles into a heap on the floor; each fades out at the end of its life. */
export const pile: ModeImpl = {
  spawn: ({ width, particleWidth, size, labelHeight, speed }) => ({
    x: Math.random() * Math.max(1, width - particleWidth),
    y: -(size + labelHeight),
    vx: randomSign() * speed * between(0, 0.2),
    vy: 0,
    state: { phase: 0 },
  }),
  step(p, node, env) {
    const { settings, scale, width, height, size, labelHeight, now, dt } = env;
    const age = now - p.bornAt;
    const remaining = settings.lifetimeSeconds * 1000 - age;
    if (remaining <= 0) return { expired: true };
    const particleWidth = size * p.aspectRatio;
    const floorY = height - size - labelHeight;
    p.vy += settings.gravity * scale * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < 0 || p.x > width - particleWidth) {
      p.x = Math.max(0, Math.min(width - particleWidth, p.x));
      p.vx *= -0.4;
    }
    collide(p, env);
    if (p.y >= floorY) {
      p.y = floorY;
      p.vy = Math.abs(p.vy) < 60 * scale ? 0 : -p.vy * 0.25;
      p.vx *= 0.9;
    }
    if (Math.abs(p.vx) < 3 * scale && p.vy === 0) p.vx = 0;
    draw(node, p, fadeOpacity(age, remaining, PILE_FADE_IN_MS, PILE_FADE_OUT_MS));
    return {};
  },
};

// --- Conga line --------------------------------------------------------------------------

/** The wavy path every emote in the line follows, as a height for a given x. */
const waveY = (x: number, width: number, height: number, floorY: number) =>
  Math.min(floorY, height * 0.5 + Math.sin((x * TAU) / (width * 0.35)) * height * 0.2);

/** Like the bottom parade, but the whole line rides a wave, so it snakes across the screen. */
export const conga: ModeImpl = {
  spawn: (env) => {
    const { settings, width, height, size, labelHeight, speed } = env;
    const x = paradeStartX(env);
    return {
      x,
      y: waveY(x, width, height, height - size - labelHeight),
      vx: settings.direction === "left" ? -speed : speed,
      vy: 0,
    };
  },
  step(p, node, env) {
    const { settings, scale, width, height, size, labelHeight, dt } = env;
    const particleWidth = size * p.aspectRatio;
    p.vx = settings.direction === "left" ? -settings.speed * scale : settings.speed * scale;
    p.x += p.vx * dt;
    p.y = waveY(p.x, width, height, height - size - labelHeight);
    draw(node, p);
    const gone =
      (settings.direction === "left" && p.x + particleWidth < 0) ||
      (settings.direction === "right" && p.x > width);
    return gone ? { expired: true } : {};
  },
};
