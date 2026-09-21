import { between, draw, fadeOpacity, randomSign } from "./modes";
import type { ModeImpl } from "./modeTypes";

/** Calm modes: nothing bounces, emotes drift, fall, rise or circle. */

const TAU = Math.PI * 2;

/** Fades in, wanders on slow curves like a firefly, twinkles a little, then fades out. */
export const drift: ModeImpl = {
  spawn: ({ width, height, size, labelHeight, particleWidth }) => ({
    x: Math.random() * Math.max(1, width - particleWidth),
    y: Math.random() * Math.max(1, height - size - labelHeight),
    vx: 0,
    vy: 0,
    state: { phase: Math.random() * TAU, angle: Math.random() * TAU },
  }),
  step(p, node, env) {
    const { settings, scale, width, height, size, labelHeight, now, dt } = env;
    const state = p.state!;
    const age = now - p.bornAt;
    const remaining = settings.lifetimeSeconds * 1000 - age;
    if (remaining <= 0) return { expired: true };
    const heading = (state.angle ?? 0) + Math.sin(age * 0.0008 + state.phase) * 1.3;
    const speed = settings.speed * scale * 0.3;
    p.x += Math.cos(heading) * speed * dt;
    p.y += Math.sin(heading) * speed * dt;
    const particleWidth = size * p.aspectRatio;
    if (p.x < 0 || p.x > width - particleWidth) {
      p.x = Math.max(0, Math.min(width - particleWidth, p.x));
      state.angle = Math.PI - (state.angle ?? 0);
    }
    const bottom = height - size - labelHeight;
    if (p.y < 0 || p.y > bottom) {
      p.y = Math.max(0, Math.min(bottom, p.y));
      state.angle = -(state.angle ?? 0);
    }
    const twinkle = 0.82 + 0.18 * Math.sin(age * 0.005 + state.phase);
    draw(node, p, fadeOpacity(age, remaining, 1200, 800) * twinkle);
    return {};
  },
};

/** Falls straight down from above the screen, each at its own speed. */
export const rain: ModeImpl = {
  spawn: ({ width, size, labelHeight, particleWidth, speed }) => ({
    x: Math.random() * Math.max(1, width - particleWidth),
    y: -(size + labelHeight),
    vx: 0,
    vy: speed * between(1.4, 2.2),
  }),
  step(p, node, env) {
    const { settings, height, now, dt } = env;
    p.y += p.vy * dt;
    draw(node, p);
    const over = now - p.bornAt >= settings.lifetimeSeconds * 1000 || p.y > height;
    return over ? { expired: true } : {};
  },
};

/** Sways gently from side to side while it sinks: y and x from one clock, so the sway is smooth. */
function swayingStart(direction: 1 | -1) {
  return ({
    width,
    height,
    size,
    labelHeight,
    particleWidth,
    speed,
    scale,
  }: Parameters<NonNullable<ModeImpl["spawn"]>>[0]) => {
    const swayAmp = between(25, 60) * scale;
    const room = Math.max(1, width - particleWidth - swayAmp * 2);
    return {
      x: swayAmp + Math.random() * room,
      y: direction === 1 ? -(size + labelHeight) : height,
      vx: 0,
      vy: direction * speed * between(direction === 1 ? 0.45 : 0.7, direction === 1 ? 0.85 : 1.2),
      state: {
        phase: Math.random() * TAU,
        baseX: 0,
        swayAmp,
        swayRate: between(0.0008, 0.0018),
      },
    };
  };
}

function swayX(p: Parameters<ModeImpl["step"]>[0], width: number, age: number, size: number) {
  const state = p.state!;
  const particleWidth = size * p.aspectRatio;
  return Math.max(
    0,
    Math.min(
      width - particleWidth,
      (state.baseX ?? 0) +
        Math.sin(age * (state.swayRate ?? 0.001) + state.phase) * (state.swayAmp ?? 0),
    ),
  );
}

export const snow: ModeImpl = {
  spawn: (env) => {
    const start = swayingStart(1)(env);
    return { ...start, state: { ...start.state, baseX: start.x } };
  },
  step(p, node, env) {
    const { settings, width, height, size, now, dt } = env;
    const age = now - p.bornAt;
    p.y += p.vy * dt;
    p.x = swayX(p, width, age, size);
    draw(node, p);
    return age >= settings.lifetimeSeconds * 1000 || p.y > height ? { expired: true } : {};
  },
};

/** Balloons: float up from below with a wobble, and fade out over the top fifth of the screen. */
export const rise: ModeImpl = {
  spawn: (env) => {
    const start = swayingStart(-1)(env);
    return { ...start, state: { ...start.state, baseX: start.x } };
  },
  step(p, node, env) {
    const { settings, width, height, size, labelHeight, now, dt } = env;
    const age = now - p.bornAt;
    p.y += p.vy * dt;
    p.x = swayX(p, width, age, size);
    const fadeZone = height * 0.2;
    draw(node, p, Math.min(1, (p.y + size) / fadeZone));
    const gone = p.y < -(size + labelHeight) || age >= settings.lifetimeSeconds * 1000;
    return gone ? { expired: true } : {};
  },
};

/** Circles the middle of the screen on its own ellipse, at its own pace. */
export const orbit: ModeImpl = {
  spawn: ({ width, height, particleWidth, size, speed }) => {
    const radiusX = width * between(0.12, 0.4);
    const radiusY = height * between(0.1, 0.36);
    return {
      x: width / 2 - particleWidth / 2,
      y: height / 2 - size / 2,
      vx: 0,
      vy: 0,
      state: {
        phase: Math.random() * TAU,
        radiusX,
        radiusY,
        centerX: width / 2 + between(-0.06, 0.06) * width,
        centerY: height / 2 + between(-0.06, 0.06) * height,
        omega: (speed / Math.max(radiusX, radiusY)) * between(0.6, 1.2) * randomSign(),
      },
    };
  },
  step(p, node, env) {
    const { settings, size, labelHeight, now } = env;
    const state = p.state!;
    const age = now - p.bornAt;
    const remaining = settings.lifetimeSeconds * 1000 - age;
    if (remaining <= 0) return { expired: true };
    const angle = state.phase + (state.omega ?? 0) * (age / 1000);
    const particleWidth = size * p.aspectRatio;
    p.x = (state.centerX ?? 0) + Math.cos(angle) * (state.radiusX ?? 0) - particleWidth / 2;
    p.y = (state.centerY ?? 0) + Math.sin(angle) * (state.radiusY ?? 0) - (size + labelHeight) / 2;
    draw(node, p, fadeOpacity(age, remaining, 800, 800));
    return {};
  },
};
