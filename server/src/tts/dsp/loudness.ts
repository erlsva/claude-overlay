/** BS.1770 loudness measurement, normalisation and soft limiting. */

import { RATE } from "./wav.js";

// --- Loudness ---------------------------------------------------------------
// ITU-R BS.1770 K-weighted loudness, so every scene can be balanced by how loud
// it sounds rather than by its peak. Speech and generated effects arrive at very
// different levels, and a dense effect like animal screams is far louder than
// speech at the same peak.
type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

export function kWeighting(rate: number): Biquad[] {
  const shelfK = Math.tan((Math.PI * 1681.974450955533) / rate),
    Vh = Math.pow(10, 3.999843853973347 / 20),
    Vb = Math.pow(Vh, 0.4996667741545416),
    Q1 = 0.7071752369554196;
  const a0 = 1 + shelfK / Q1 + shelfK * shelfK;
  const shelf: Biquad = {
    b0: (Vh + (Vb * shelfK) / Q1 + shelfK * shelfK) / a0,
    b1: (2 * (shelfK * shelfK - Vh)) / a0,
    b2: (Vh - (Vb * shelfK) / Q1 + shelfK * shelfK) / a0,
    a1: (2 * (shelfK * shelfK - 1)) / a0,
    a2: (1 - shelfK / Q1 + shelfK * shelfK) / a0,
  };
  const hpK = Math.tan((Math.PI * 38.13547087602444) / rate),
    Q2 = 0.5003270373238773;
  const hpA0 = 1 + hpK / Q2 + hpK * hpK;
  const highpass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (hpK * hpK - 1)) / hpA0,
    a2: (1 - hpK / Q2 + hpK * hpK) / hpA0,
  };
  return [shelf, highpass];
}

/** Integrated loudness in LUFS (mono), or -Infinity for silence. */
export function integratedLoudness(samples: Float32Array, rate = RATE): number {
  if (!samples.length) return -Infinity;
  let signal = Float64Array.from(samples);
  for (const f of kWeighting(rate)) {
    const out = new Float64Array(signal.length);
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < signal.length; i++) {
      const x = signal[i];
      const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
      out[i] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
    signal = out;
  }
  const prefix = new Float64Array(signal.length + 1);
  for (let i = 0; i < signal.length; i++) prefix[i + 1] = prefix[i] + signal[i] * signal[i];
  const block = Math.round(0.4 * rate),
    step = Math.round(0.1 * rate);
  const powers: number[] = [];
  if (signal.length < block) powers.push(prefix[signal.length] / signal.length);
  else
    for (let start = 0; start + block <= signal.length; start += step)
      powers.push((prefix[start + block] - prefix[start]) / block);
  const toLufs = (power: number) => -0.691 + 10 * Math.log10(power);
  const absolute = powers.filter((power) => power > 0 && toLufs(power) > -70);
  if (!absolute.length) return -Infinity;
  const relativeGate =
    toLufs(absolute.reduce((sum, power) => sum + power, 0) / absolute.length) - 10;
  const gated = absolute.filter((power) => toLufs(power) > relativeGate);
  return toLufs(
    (gated.length ? gated : absolute).reduce((sum, power) => sum + power, 0) /
      (gated.length ? gated.length : absolute.length),
  );
}

/** Smoothly bends peaks over the knee toward the ceiling instead of hard clipping them. */
export function softLimit(samples: Float32Array, ceiling = 0.97, knee = 0.7): Float32Array {
  const out = new Float32Array(samples.length),
    room = ceiling - knee;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i],
      a = Math.abs(v);
    out[i] = a <= knee ? v : Math.sign(v) * (knee + room * Math.tanh((a - knee) / room));
  }
  return out;
}

/** Returns a copy at the target loudness. Silence and near-silence are left alone. */
export function normalizeLoudness(
  samples: Float32Array,
  targetLufs: number,
  maxBoostDb = 24,
  peakCeiling = 0.97,
): Float32Array {
  const loudness = integratedLoudness(samples);
  if (!Number.isFinite(loudness)) return samples;
  const gainDb = Math.min(maxBoostDb, targetLufs - loudness);
  const gain = Math.pow(10, gainDb / 20);
  const scaled = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) scaled[i] = samples[i] * gain;
  return softLimit(scaled, peakCeiling, peakCeiling * 0.72);
}
