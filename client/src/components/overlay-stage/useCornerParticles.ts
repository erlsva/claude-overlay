import { useEffect } from "react";
import { STREAM_W, STREAM_H } from "../../canvas/config";
import type { OverlayRefs } from "./useOverlayRefs";

/** Draws and ages the confetti on its own canvas every animation frame. */
export function useCornerParticles(
  refs: Pick<OverlayRefs, "cornerFxCanvasRef" | "cornerParticlesRef">,
) {
  const { cornerFxCanvasRef, cornerParticlesRef } = refs;
  useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();
    const renderParticles = (time: number) => {
      const canvas = cornerFxCanvasRef.current;
      const context = canvas?.getContext("2d");
      const dt = Math.min(0.033, (time - previousTime) / 1000);
      previousTime = time;
      context?.clearRect(0, 0, STREAM_W, STREAM_H);
      const particles = cornerParticlesRef.current;
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life -= dt;
        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 520 * dt;
        particle.rotation += particle.spin * dt;
        if (!context) continue;
        context.save();
        context.globalAlpha = Math.min(1, particle.life / 0.35);
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(
          -particle.size / 2,
          -particle.size / 3,
          particle.size,
          particle.size * 0.66,
        );
        context.restore();
      }
      frame = requestAnimationFrame(renderParticles);
    };
    frame = requestAnimationFrame(renderParticles);
    return () => cancelAnimationFrame(frame);
  }, []);
}
