/** A small biquad filter used by the loudness meter and the EQ steps. */

import { RATE } from "./wav.js";

type BiquadKind = "peak" | "lowshelf" | "highshelf" | "lowpass" | "highpass";

export function biquad(
  kind: BiquadKind,
  hz: number,
  q: number,
  gainDb: number,
  x: Float32Array,
  rate = RATE,
): Float32Array {
  const A = Math.pow(10, gainDb / 40),
    w = (2 * Math.PI * hz) / rate,
    c = Math.cos(w),
    s = Math.sin(w),
    alpha = s / (2 * q);
  let b0 = 1,
    b1 = 0,
    b2 = 0,
    a0 = 1,
    a1 = 0,
    a2 = 0;
  if (kind === "peak") {
    b0 = 1 + alpha * A;
    b1 = -2 * c;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * c;
    a2 = 1 - alpha / A;
  } else if (kind === "lowshelf") {
    const t = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * c + t);
    b1 = 2 * A * (A - 1 - (A + 1) * c);
    b2 = A * (A + 1 - (A - 1) * c - t);
    a0 = A + 1 + (A - 1) * c + t;
    a1 = -2 * (A - 1 + (A + 1) * c);
    a2 = A + 1 + (A - 1) * c - t;
  } else if (kind === "highshelf") {
    const t = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * c + t);
    b1 = -2 * A * (A - 1 + (A + 1) * c);
    b2 = A * (A + 1 + (A - 1) * c - t);
    a0 = A + 1 - (A - 1) * c + t;
    a1 = 2 * (A - 1 - (A + 1) * c);
    a2 = A + 1 - (A - 1) * c - t;
  } else if (kind === "lowpass") {
    b0 = (1 - c) / 2;
    b1 = 1 - c;
    b2 = (1 - c) / 2;
    a0 = 1 + alpha;
    a1 = -2 * c;
    a2 = 1 - alpha;
  } else {
    b0 = (1 + c) / 2;
    b1 = -(1 + c);
    b2 = (1 + c) / 2;
    a0 = 1 + alpha;
    a1 = -2 * c;
    a2 = 1 - alpha;
  }
  const out = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}
