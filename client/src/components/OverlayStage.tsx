/** The OBS overlay: renders the canvas elements with no editing, animating with requestAnimationFrame. */

import {
  type MediaControlPayload,
  type CanvasElement,
  type CursorPayload,
  type DvdCelebrationSettings,
  type DrawStroke,
} from "../types";
import { forwardRef, useState, useRef, useEffect, useImperativeHandle } from "react";
import { STREAM_OFFSET_X, STREAM_OFFSET_Y, STREAM_W, STREAM_H } from "../canvas/config";
import { getDvdPosition } from "../canvas/dvdMotion";
import { renderAction } from "./DrawingCanvas";
import { setScale, setRotation, applyNodeTransform } from "../canvas/elementTransforms";
import { LiveCursors } from "./LiveCursors";
import { createMediaElement } from "../canvas/mediaElement";
import { animationFrames, playRequestedEffect } from "../canvas/effects";
import { applyTextStyles } from "../canvas/textStyle";

// ---------------------------------------------------------------------------
// Overlay — rAF lerp, imperative media control
// ---------------------------------------------------------------------------
function lerpAngle(current: number, target: number, factor: number): number {
  let delta = (target - current) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return current + delta * factor;
}

export interface OverlayStageHandle {
  applyControl: (payload: MediaControlPayload) => void;
}

interface CornerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export const OverlayStage = forwardRef<
  OverlayStageHandle,
  {
    elements: CanvasElement[];
    cursors?: Map<string, CursorPayload>;
    dvdCelebrationSettings?: DvdCelebrationSettings;
    strokes?: DrawStroke[];
    liveStrokes?: Map<
      string,
      {
        userId: string;
        points: Array<[number, number]>;
        color: string;
        size: number;
        eraser: boolean;
      }
    >;
    onMediaEnded?: (id: string) => void;
  }
>(function OverlayStage(
  {
    elements,
    cursors = new Map(),
    dvdCelebrationSettings = {
      volume: 0.25,
      soundUrl: null,
      counterPosition: "top-right",
    },
    strokes = [],
    liveStrokes,
    onMediaEnded,
  },
  ref,
) {
  const [cornerHitCount, setCornerHitCount] = useState(0);
  const hasActiveDvd = elements.some(
    (element) => element.dvdEnabled && element.visible && element.type !== "audio",
  );
  const counterAtTop = dvdCelebrationSettings.counterPosition.startsWith("top");
  const counterAtCenter = dvdCelebrationSettings.counterPosition.endsWith("center");
  const counterAtLeft = dvdCelebrationSettings.counterPosition.endsWith("left");
  const counterLeft = counterAtCenter ? "50%" : counterAtLeft ? "28px" : "calc(100% - 28px)";
  const counterTop = counterAtTop ? "28px" : "calc(100% - 28px)";
  const counterTransform = `translate(${counterAtCenter ? "-50%" : counterAtLeft ? "0" : "-100%"}, ${counterAtTop ? "0" : "-100%"})`;
  const hadActiveDvdRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const posMapRef = useRef<Map<string, { x: number; y: number; rotation: number }>>(new Map());
  const targetMapRef = useRef<Map<string, { x: number; y: number; rotation: number }>>(new Map());
  const animatingRef = useRef<Set<string>>(new Set());
  const flyingRef = useRef<Set<string>>(new Set());
  // Stores the actual HTMLMediaElement for each element id (video or hidden audio)
  const mediaElMapRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  // Container for hidden audio elements
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawLiveCanvasRef = useRef<HTMLCanvasElement>(null);
  const cornerFxCanvasRef = useRef<HTMLCanvasElement>(null);
  const cornerParticlesRef = useRef<CornerParticle[]>([]);
  const cornerAudioContextRef = useRef<AudioContext | null>(null);
  const customCornerAudioRef = useRef<HTMLAudioElement | null>(null);
  const dvdCelebrationSettingsRef = useRef(dvdCelebrationSettings);
  const dvdBounceStateRef = useRef<
    Map<
      string,
      {
        x: number;
        y: number;
        dx: number;
        dy: number;
        lastXBounce: number;
        lastYBounce: number;
        lastXEdge: "left" | "right";
        lastYEdge: "top" | "bottom";
        lastCelebration: number;
      }
    >
  >(new Map());

  useEffect(() => {
    dvdCelebrationSettingsRef.current = dvdCelebrationSettings;
  }, [dvdCelebrationSettings]);

  useEffect(() => {
    if (!hasActiveDvd && hadActiveDvdRef.current) {
      setCornerHitCount(0);
    }
    hadActiveDvdRef.current = hasActiveDvd;
  }, [hasActiveDvd]);
  // Offscreen layer holding committed strokes/fills already baked in, so an
  // expensive flood fill is never re-run just because a live stroke updated.
  const drawBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawBakedCountRef = useRef(0);
  const overlayElementsRef = useRef(elements);
  useEffect(() => {
    overlayElementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    let frame = 0;
    const animateMovingElements = () => {
      const now = Date.now();
      for (const element of overlayElementsRef.current) {
        if (!element.visible || element.type === "audio") continue;
        const node = nodeMapRef.current.get(element.id);
        if (!node) continue;
        if (
          element.flyStartedAt &&
          element.flyDurationMs &&
          element.flyFromX !== undefined &&
          element.flyFromY !== undefined &&
          element.flyToX !== undefined &&
          element.flyToY !== undefined
        ) {
          const progress = Math.max(
            0,
            Math.min(1, (now - element.flyStartedAt) / element.flyDurationMs),
          );
          const x =
            element.flyFromX + (element.flyToX - element.flyFromX) * progress - STREAM_OFFSET_X;
          const y =
            element.flyFromY + (element.flyToY - element.flyFromY) * progress - STREAM_OFFSET_Y;
          node.style.left = `${x}px`;
          node.style.top = `${y}px`;
          const current = posMapRef.current.get(element.id);
          if (current) Object.assign(current, { x, y, rotation: 0 });
          targetMapRef.current.set(element.id, { x, y, rotation: 0 });
          flyingRef.current.add(element.id);
          continue;
        }
        if (!element.dvdEnabled) continue;
        const position = getDvdPosition(element, now);
        const x = position.x - STREAM_OFFSET_X;
        const y = position.y - STREAM_OFFSET_Y;
        const previous = dvdBounceStateRef.current.get(element.id);
        if (previous) {
          const dx = x - previous.x;
          const dy = y - previous.y;
          const bouncedX =
            previous.dx !== 0 && dx !== 0 && Math.sign(previous.dx) !== Math.sign(dx);
          const bouncedY =
            previous.dy !== 0 && dy !== 0 && Math.sign(previous.dy) !== Math.sign(dy);
          if (bouncedX) {
            previous.lastXBounce = now;
            previous.lastXEdge = previous.dx > 0 ? "right" : "left";
          }
          if (bouncedY) {
            previous.lastYBounce = now;
            previous.lastYEdge = previous.dy > 0 ? "bottom" : "top";
          }
          previous.x = x;
          previous.y = y;
          previous.dx = dx;
          previous.dy = dy;

          // Axis reflections can land on adjacent animation frames. Treat them
          // as one genuine corner collision only when they occur within 50 ms.
          if (
            (bouncedX || bouncedY) &&
            Math.abs(previous.lastXBounce - previous.lastYBounce) <= 50 &&
            now - previous.lastCelebration > 1500
          ) {
            previous.lastCelebration = now;
            const cornerX = previous.lastXEdge === "left" ? 0 : STREAM_W;
            const cornerY = previous.lastYEdge === "top" ? 0 : STREAM_H;
            spawnCornerCelebration(cornerX, cornerY);
          }
        } else {
          dvdBounceStateRef.current.set(element.id, {
            x,
            y,
            dx: 0,
            dy: 0,
            lastXBounce: -Infinity,
            lastYBounce: Infinity,
            lastXEdge: "left",
            lastYEdge: "top",
            lastCelebration: -Infinity,
          });
        }
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        const current = posMapRef.current.get(element.id);
        if (current) {
          current.x = x;
          current.y = y;
        }
      }
      const activeIds = new Set(
        overlayElementsRef.current
          .filter((element) => element.dvdEnabled && element.visible)
          .map((element) => element.id),
      );
      for (const id of dvdBounceStateRef.current.keys()) {
        if (!activeIds.has(id)) dvdBounceStateRef.current.delete(id);
      }
      frame = requestAnimationFrame(animateMovingElements);
    };
    frame = requestAnimationFrame(animateMovingElements);
    return () => cancelAnimationFrame(frame);
  }, []);

  const spawnCornerCelebration = (cornerX: number, cornerY: number) => {
    const settings = dvdCelebrationSettingsRef.current;
    setCornerHitCount((count) => count + 1);
    const colors = ["#fb923c", "#f97316", "#fdba74", "#facc15", "#ffffff"];
    const directionX = cornerX === 0 ? 1 : -1;
    const directionY = cornerY === 0 ? 1 : -1;
    for (let index = 0; index < 90; index += 1) {
      const life = 1.4 + Math.random() * 0.9;
      cornerParticlesRef.current.push({
        x: cornerX,
        y: cornerY,
        vx: directionX * (180 + Math.random() * 620),
        vy: directionY * (120 + Math.random() * 520) - directionY * Math.random() * 220,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 14,
        size: 8 + Math.random() * 14,
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life,
      });
    }

    if (settings.volume <= 0) return;
    if (settings.soundUrl) {
      const audio = customCornerAudioRef.current ?? new Audio(settings.soundUrl);
      if (audio.src !== settings.soundUrl) {
        audio.src = settings.soundUrl;
      }
      customCornerAudioRef.current = audio;
      audio.volume = settings.volume;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
      return;
    }

    try {
      const AudioContextClass = window.AudioContext;
      const audioContext = cornerAudioContextRef.current ?? new AudioContextClass();
      cornerAudioContextRef.current = audioContext;
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
  };

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

  useEffect(() => {
    let base = drawBaseCanvasRef.current;
    if (!base) {
      base = document.createElement("canvas");
      drawBaseCanvasRef.current = base;
    }
    const canvas = drawCanvasRef.current;
    if (canvas && (base.width !== canvas.width || base.height !== canvas.height)) {
      base.width = canvas.width;
      base.height = canvas.height;
      drawBakedCountRef.current = 0;
    }
    const baseCtx = base.getContext("2d")!;
    if (strokes.length < drawBakedCountRef.current) {
      baseCtx.clearRect(0, 0, base.width, base.height);
      drawBakedCountRef.current = 0;
    }
    for (let i = drawBakedCountRef.current; i < strokes.length; i++) {
      renderAction(baseCtx, strokes[i], STREAM_OFFSET_X, STREAM_OFFSET_Y);
    }
    drawBakedCountRef.current = strokes.length;

    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
  }, [strokes]);

  // Keep in-progress remote strokes on their own transparent layer. This
  // avoids copying the complete 1080p committed drawing for every live shape
  // position received from the dashboard.
  useEffect(() => {
    const canvas = drawLiveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (liveStrokes) {
      for (const live of liveStrokes.values()) {
        renderAction(
          ctx,
          {
            ...live,
            id: `live-${live.userId}`,
            points: live.points,
            eraser: live.eraser,
          } as any,
          STREAM_OFFSET_X,
          STREAM_OFFSET_Y,
        );
      }
    }
  }, [liveStrokes]);

  useImperativeHandle(ref, () => ({
    applyControl(payload: MediaControlPayload) {
      const media = mediaElMapRef.current.get(payload.id);
      if (!media) return;
      (media as any).__applyingRemote = true;
      if (payload.action !== "play") media.currentTime = payload.currentTime;
      if (payload.action === "play") {
        // Play muted first (always allowed by autoplay policy), then restore volume.
        // This lets the overlay work in browsers without a prior user gesture.
        const wasMuted = media.muted;
        media.muted = true;
        media.currentTime = payload.currentTime;
        media
          .play()
          .then(() => {
            media.muted = wasMuted;
          })
          .catch(() => {})
          .finally(() => {
            (media as any).__applyingRemote = false;
          });
      } else {
        if (payload.action === "pause") media.pause();
        (media as any).__applyingRemote = false;
      }
    },
  }));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nodeMap = nodeMapRef.current;
    const posMap = posMapRef.current;
    const targetMap = targetMapRef.current;
    const animating = animatingRef.current;
    const mediaElMap = mediaElMapRef.current;
    const audioContainer = audioContainerRef.current;
    const presentIds = new Set(elements.map((e) => e.id));

    // Remove deleted elements
    for (const [id, node] of nodeMap) {
      if (!presentIds.has(id)) {
        node.remove();
        nodeMap.delete(id);
        posMap.delete(id);
        targetMap.delete(id);
        animating.delete(id);
      }
    }
    // Remove deleted audio elements
    for (const [id, media] of mediaElMap) {
      if (!presentIds.has(id)) {
        media.pause();
        if (media.parentNode) media.parentNode.removeChild(media);
        mediaElMap.delete(id);
      }
    }

    for (const el of elements) {
      const sx = el.scaleX ?? 1,
        sy = el.scaleY ?? 1;

      // Audio: hidden element, no visual node
      if (el.type === "audio") {
        if (!mediaElMap.has(el.id)) {
          const audio = document.createElement("audio");
          audio.src = el.src;
          audio.volume = el.mediaVolume ?? 0.25;
          audio.preload = "auto";
          audio.addEventListener("ended", () => onMediaEnded?.(el.id));
          if (el.mediaCurrentTime && el.mediaCurrentTime > 0) {
            audio.addEventListener(
              "loadedmetadata",
              () => {
                audio.currentTime = el.mediaCurrentTime!;
              },
              { once: true },
            );
          }
          if (audioContainer) audioContainer.appendChild(audio);
          mediaElMap.set(el.id, audio);
        } else {
          const audio = mediaElMap.get(el.id)!;
          audio.volume = el.mediaVolume ?? 0.25;
        }
        continue;
      }

      let node = nodeMap.get(el.id);
      if (!node) {
        node = document.createElement("div");
        node.style.cssText = "position:absolute;transform-origin:center center;";

        const content = createMediaElement(el, {
          isOverlay: true,
          onMediaReady: (media) => mediaElMap.set(el.id, media),
          onVisibilityChange: (visible) => {
            if (!visible) onMediaEnded?.(el.id);
          },
        });
        content.classList.add("element-content");
        node.appendChild(content);

        viewport.appendChild(node);
        const ox = el.x - STREAM_OFFSET_X,
          oy = el.y - STREAM_OFFSET_Y;
        nodeMap.set(el.id, node);
        posMap.set(el.id, { x: ox, y: oy, rotation: el.rotation ?? 0 });
        targetMap.set(el.id, { x: ox, y: oy, rotation: el.rotation ?? 0 });
        node.style.left = ox + "px";
        node.style.top = oy + "px";
        node.style.width = el.width + "px";
        node.style.height = el.height + "px";
        setScale(node, sx, sy);
        setRotation(node, el.rotation ?? 0);
        applyNodeTransform(node);
        node.style.visibility = el.visible ? "visible" : "hidden";
        node.dataset.visible = String(el.visible);
      }

      node.style.width = el.width + "px";
      node.style.height = el.height + "px";
      const previousVisible = node.dataset.visible === "true";
      if (previousVisible !== el.visible) {
        node.dataset.visible = String(el.visible);
        const surface = node.firstElementChild as HTMLElement | null;
        surface?.getAnimations().forEach((animation) => animation.cancel());
        if (el.visible) {
          node.style.visibility = "visible";
          surface?.animate(animationFrames(el.enterAnimation), {
            duration: 320,
            easing: "cubic-bezier(.2,.8,.2,1)",
          });
        } else {
          const frames = animationFrames(el.exitAnimation).reverse();
          const animation = surface?.animate(frames, { duration: 260, easing: "ease-in" });
          if (animation) {
            animation.finished
              .then(() => {
                if (node?.dataset.visible === "false") node.style.visibility = "hidden";
              })
              .catch(() => {});
          } else node.style.visibility = "hidden";
        }
      } else if (!el.visible) {
        node.style.visibility = "hidden";
      }
      node.style.opacity = String(el.opacity ?? 1);
      node.style.zIndex = String(el.zIndex);
      setScale(node, sx, sy);
      applyNodeTransform(node);
      playRequestedEffect(node, el);

      // Sync volume whenever element state changes
      if (el.type === "video") {
        const media = mediaElMap.get(el.id);
        if (media) media.volume = el.mediaVolume ?? 0.25;
      }

      if (el.type === "text") {
        const span = node.querySelector<HTMLSpanElement>("span");
        if (span) applyTextStyles(span, el.src);
      }

      targetMap.set(el.id, {
        x: el.x - STREAM_OFFSET_X,
        y: el.y - STREAM_OFFSET_Y,
        rotation: el.rotation ?? 0,
      });

      const hasActiveFlight = Boolean(
        el.flyStartedAt &&
        el.flyDurationMs &&
        el.flyFromX !== undefined &&
        el.flyFromY !== undefined &&
        el.flyToX !== undefined &&
        el.flyToY !== undefined,
      );
      if (hasActiveFlight) {
        flyingRef.current.add(el.id);
        animating.delete(el.id);
        continue;
      }
      if (flyingRef.current.delete(el.id)) {
        const restored = targetMap.get(el.id)!;
        const current = posMap.get(el.id);
        if (current) Object.assign(current, restored);
        node.style.left = `${restored.x}px`;
        node.style.top = `${restored.y}px`;
        setRotation(node, restored.rotation);
        applyNodeTransform(node);
        animating.delete(el.id);
        continue;
      }

      // DVD motion already supplies a continuous position every animation
      // frame. Applying the remote-drag lerp as well makes the rendered node
      // lag behind the mathematical path and visually reverse before reaching
      // an edge.
      if (el.dvdEnabled) {
        const dvdPosition = getDvdPosition(el);
        const dvdX = dvdPosition.x - STREAM_OFFSET_X;
        const dvdY = dvdPosition.y - STREAM_OFFSET_Y;
        const current = posMap.get(el.id);
        if (current) {
          current.x = dvdX;
          current.y = dvdY;
          current.rotation = 0;
        }
        targetMap.set(el.id, { x: dvdX, y: dvdY, rotation: 0 });
        node.style.left = `${dvdX}px`;
        node.style.top = `${dvdY}px`;
        continue;
      }

      if (!animating.has(el.id)) {
        animating.add(el.id);
        const id = el.id;
        const FACTOR = 0.18;
        const animate = () => {
          const latestElement = overlayElementsRef.current.find((candidate) => candidate.id === id);
          if (latestElement?.dvdEnabled || latestElement?.flyStartedAt) {
            animating.delete(id);
            return;
          }
          const pos = posMap.get(id),
            target = targetMap.get(id),
            n = nodeMap.get(id);
          if (!pos || !target || !n) {
            animating.delete(id);
            return;
          }
          const curSx = latestElement?.scaleX ?? 1,
            curSy = latestElement?.scaleY ?? 1;
          pos.x += (target.x - pos.x) * FACTOR;
          pos.y += (target.y - pos.y) * FACTOR;
          pos.rotation = lerpAngle(pos.rotation, target.rotation, FACTOR);
          n.style.left = pos.x + "px";
          n.style.top = pos.y + "px";
          setScale(n, curSx, curSy);
          setRotation(n, pos.rotation);
          applyNodeTransform(n);
          const close =
            Math.abs(target.x - pos.x) < 0.3 &&
            Math.abs(target.y - pos.y) < 0.3 &&
            Math.abs(target.rotation - pos.rotation) < 0.3;
          if (close) {
            pos.x = target.x;
            pos.y = target.y;
            pos.rotation = target.rotation;
            n.style.left = target.x + "px";
            n.style.top = target.y + "px";
            setScale(n, curSx, curSy);
            setRotation(n, target.rotation);
            applyNodeTransform(n);
            animating.delete(id);
            return;
          }
          requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }
  }, [elements]);

  return (
    <div
      style={{
        width: STREAM_W,
        height: STREAM_H,
        overflow: "hidden",
        background: "transparent",
        position: "relative",
      }}
    >
      <div ref={viewportRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      <canvas
        ref={drawCanvasRef}
        width={STREAM_W}
        height={STREAM_H}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 999,
        }}
      />
      <canvas
        ref={drawLiveCanvasRef}
        width={STREAM_W}
        height={STREAM_H}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
      <LiveCursors
        cursors={cursors}
        pan={{ x: -STREAM_OFFSET_X, y: -STREAM_OFFSET_Y }}
        zoom={1}
        large
      />
      {hasActiveDvd && (
        <div
          style={{
            position: "absolute",
            top: counterTop,
            left: counterLeft,
            transform: counterTransform,
            transition:
              "top 480ms cubic-bezier(.22,1,.36,1), left 480ms cubic-bezier(.22,1,.36,1), transform 480ms cubic-bezier(.22,1,.36,1)",
            zIndex: 1900,
            display: "flex",
            alignItems: "center",
            width: "max-content",
            whiteSpace: "nowrap",
            gap: 10,
            padding: "10px 16px",
            borderRadius: 10,
            color: "#fff7ed",
            background: "rgba(24,18,15,.88)",
            border: "2px solid #f97316",
            boxShadow: "0 5px 18px rgba(0,0,0,.55), 0 0 16px rgba(249,115,22,.22)",
            font: "700 22px Inter,sans-serif",
            letterSpacing: "0.03em",
            pointerEvents: "none",
          }}
        >
          <span>CORNER HITS</span>
          <span
            style={{
              minWidth: 34,
              textAlign: "center",
              padding: "3px 8px",
              borderRadius: 7,
              background: "#f97316",
              color: "#fff",
              fontSize: 24,
            }}
          >
            {cornerHitCount}
          </span>
        </div>
      )}
      <canvas
        ref={cornerFxCanvasRef}
        width={STREAM_W}
        height={STREAM_H}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2000,
        }}
      />
      {/* Hidden audio container */}
      <div ref={audioContainerRef} style={{ display: "none" }} />
    </div>
  );
});
