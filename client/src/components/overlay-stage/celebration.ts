import type { DvdCelebrationSettings } from "../../types";
import type { CornerParticle } from "./types";

const CONFETTI_COLORS = ["#fb923c", "#f97316", "#fdba74", "#facc15", "#ffffff"];
const CONFETTI_COUNT = 90;

/** Bursts confetti out of the corner an element just hit. */
export function spawnConfetti(particles: CornerParticle[], cornerX: number, cornerY: number) {
  const directionX = cornerX === 0 ? 1 : -1;
  const directionY = cornerY === 0 ? 1 : -1;
  for (let index = 0; index < CONFETTI_COUNT; index += 1) {
    const life = 1.4 + Math.random() * 0.9;
    particles.push({
      x: cornerX,
      y: cornerY,
      vx: directionX * (180 + Math.random() * 620),
      vy: directionY * (120 + Math.random() * 520) - directionY * Math.random() * 220,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      size: 8 + Math.random() * 14,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life,
      maxLife: life,
    });
  }
}

interface CornerAudioRefs {
  cornerAudioContextRef: { current: AudioContext | null };
  customCornerAudioRef: { current: HTMLAudioElement | null };
}

/** Plays the custom corner sound if one is set, otherwise a short synthesized chime. */
export function playCornerSound(settings: DvdCelebrationSettings, refs: CornerAudioRefs) {
  if (settings.volume <= 0) return;
  if (settings.soundUrl) {
    const audio = refs.customCornerAudioRef.current ?? new Audio(settings.soundUrl);
    if (audio.src !== settings.soundUrl) {
      audio.src = settings.soundUrl;
    }
    refs.customCornerAudioRef.current = audio;
    audio.volume = settings.volume;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
    return;
  }

  try {
    const AudioContextClass = window.AudioContext;
    const audioContext = refs.cornerAudioContextRef.current ?? new AudioContextClass();
    refs.cornerAudioContextRef.current = audioContext;
    void audioContext.resume().then(() => {
      const start = audioContext.currentTime;
      [659.25, 783.99, 1046.5].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + index * 0.07);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, 0.24 * settings.volume),
          start + index * 0.07 + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.07 + 0.28);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start + index * 0.07);
        oscillator.stop(start + index * 0.07 + 0.3);
      });
    });
  } catch {
    // OBS/browser autoplay policy may suppress synthesized audio; confetti
    // still renders even when audio output is unavailable.
  }
}
