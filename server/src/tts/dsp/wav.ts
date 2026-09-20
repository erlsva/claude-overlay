/** Reading and writing the mono 16-bit WAV files the pipeline passes to and from ffmpeg. */

export const RATE = 44100;

export function readWav(bytes: Buffer): Float32Array {
  if (bytes.toString("ascii", 0, 4) !== "RIFF") throw new Error("Invalid decoded WAV.");
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(pos + 4);
    if (bytes.toString("ascii", pos, pos + 4) === "data") {
      const samples = new Float32Array(Math.floor(size / 2));
      for (let i = 0; i < samples.length; i++)
        samples[i] = bytes.readInt16LE(pos + 8 + i * 2) / 32768;
      return samples;
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error("Decoded WAV contains no audio.");
}

export function writeWav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    b.writeInt16LE(Math.round(Math.max(-0.98, Math.min(0.98, samples[i])) * 32767), 44 + i * 2);
  return b;
}

export function finish(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.95 ? 0.95 / peak : 1;
  const fade = Math.min(Math.round(RATE * 0.07), Math.floor(samples.length / 2));
  for (let i = 0; i < samples.length; i++) {
    const edge = Math.min(1, i / (RATE * 0.008), (samples.length - 1 - i) / fade);
    samples[i] *= gain * Math.max(0, edge);
  }
  return samples;
}
