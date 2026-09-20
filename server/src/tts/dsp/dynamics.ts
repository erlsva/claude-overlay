/** Following speech and keeping shouted lines comfortable to listen to. */

import { RATE } from "./wav.js";
import { integratedLoudness, kWeighting, normalizeLoudness } from "./loudness.js";

/** How loud the voice is moment to moment, 0..1. Fast to rise, slower to fall. */
export function speechEnvelope(speech: Float32Array, rate = RATE): Float32Array {
  const env = new Float32Array(speech.length);
  const attack = 1 - Math.exp(-1 / (0.005 * rate)),
    release = 1 - Math.exp(-1 / (0.12 * rate));
  let level = 0,
    peak = 0;
  for (let i = 0; i < speech.length; i++) {
    const x = Math.abs(speech[i]);
    level += (x > level ? attack : release) * (x - level);
    env[i] = level;
    if (level > peak) peak = level;
  }
  if (peak > 0) for (let i = 0; i < env.length; i++) env[i] /= peak;
  return env;
}

/**
 * Mixes a wordless layer under speech, only where the voice is speaking, at
 * about the voice's own loudness scaled by gain. The layer follows the words
 * instead of playing over them as a separate voice.
 */
export function layerUnderSpeech(
  speech: Float32Array,
  layer: Float32Array,
  gain: number,
): Float32Array {
  const speechLoudness = integratedLoudness(speech);
  if (!Number.isFinite(speechLoudness) || !layer.length) return speech;
  const matched = normalizeLoudness(
    layer.length > speech.length ? layer.subarray(0, speech.length) : layer,
    speechLoudness,
  );
  const env = speechEnvelope(speech);
  const out = new Float32Array(speech.length);
  for (let i = 0; i < out.length; i++)
    out[i] = speech[i] + (i < matched.length ? matched[i] * env[i] * gain : 0);
  return out;
}

/**
 * Comfort limiter. Pulls down any moment that is much louder than the rest of
 * the clip, measured the way ears hear it (K-weighting emphasises exactly the
 * sharp 2-5 kHz region that makes shrieks painful). Averages hide this: an
 * animal scream can sit at a fine average level and still stab for a few
 * milliseconds. maxOverLu is how far above the clip's typical loudness a moment
 * is allowed to rise. "Typical" is the 70th percentile of short moments, not the
 * average: the spikes would otherwise drag the average up and hide themselves.
 */
export function tameSpikes(samples: Float32Array, maxOverLu: number, rate = RATE): Float32Array {
  if (samples.length < rate * 0.2) return samples;
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
  const window = Math.round(0.1 * rate),
    hop = Math.round(0.025 * rate),
    frames = Math.ceil(samples.length / hop) + 1;
  const loudnessOf = new Float64Array(frames).fill(-Infinity);
  for (let k = 0; k < frames; k++) {
    const centre = k * hop,
      start = Math.max(0, centre - Math.round(window / 2)),
      end = Math.min(samples.length, centre + Math.round(window / 2));
    if (end <= start) continue;
    const power = (prefix[end] - prefix[start]) / (end - start);
    if (power > 0) loudnessOf[k] = -0.691 + 10 * Math.log10(power);
  }
  const audible = [...loudnessOf].filter((value) => value > -70).sort((a, b) => a - b);
  if (!audible.length) return samples;
  const reference = audible[Math.floor(audible.length * 0.7)];
  const reduction = new Float64Array(frames);
  let any = false;
  for (let k = 0; k < frames; k++) {
    reduction[k] = Math.max(0, loudnessOf[k] - (reference + maxOverLu));
    if (reduction[k] > 0) any = true;
  }
  if (!any) return samples;
  // Start turning down slightly before the spike and release slowly, so it never pumps.
  const held = new Float64Array(frames);
  for (let k = 0; k < frames; k++) {
    let m = 0;
    for (let j = Math.max(0, k - 4); j <= Math.min(frames - 1, k + 4); j++)
      m = Math.max(m, reduction[j]);
    held[k] = m;
  }
  const smooth = new Float64Array(frames);
  for (let k = 0; k < frames; k++) {
    let sum = 0,
      count = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(frames - 1, k + 2); j++) {
      sum += held[j];
      count++;
    }
    smooth[k] = sum / count;
  }
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const position = i / hop,
      k = Math.floor(position),
      fraction = position - k;
    const db = smooth[k] * (1 - fraction) + smooth[Math.min(frames - 1, k + 1)] * fraction;
    out[i] = samples[i] * Math.pow(10, -db / 20);
  }
  return out;
}
