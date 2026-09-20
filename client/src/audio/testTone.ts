export interface ToneResult {
  ok: boolean;
  error?: string;
}

/**
 * Plays a short two-note chime through the page's own audio output. It reports
 * whether this browser actually produced sound. It cannot tell whether OBS then
 * routes that audio to the stream, so callers should also point people at the
 * source's meter in OBS.
 */
export async function playTestTone(): Promise<ToneResult> {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return { ok: false, error: "This browser cannot play audio." };

    const context = new AudioContextClass();
    await context.resume().catch(() => undefined);
    if (context.state !== "running") {
      void context.close().catch(() => undefined);
      return { ok: false, error: "The overlay browser blocked audio playback." };
    }

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = 0.25;
    master.connect(context.destination);
    // Two notes so it is easy to recognise on a stream mix.
    [
      [880, 0],
      [1175, 0.22],
    ].forEach(([frequency, offset]) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, now + offset);
      envelope.gain.exponentialRampToValueAtTime(1, now + offset + 0.03);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3);
      oscillator.connect(envelope).connect(master);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.32);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    void context.close().catch(() => undefined);
    return { ok: true };
  } catch {
    return { ok: false, error: "The overlay could not start audio." };
  }
}
