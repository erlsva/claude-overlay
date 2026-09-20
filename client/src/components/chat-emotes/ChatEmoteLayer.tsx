import { useEffect, useRef, useState } from "react";
import { loadImageAspectRatio } from "./modes";
import { ParticleView } from "./ParticleView";
import { initialMotion } from "./spawnMotion";
import { stepParticle } from "./stepMotion";
import type { ChatEmoteLayerProps, FrameEnv, Particle } from "./types";

/** Chat emotes moving across the overlay (and, smaller, in the dashboard's local preview). */
export function ChatEmoteLayer({
  spawn,
  settings,
  preview = false,
  onActiveChange,
  clearSignal = 0,
}: ChatEmoteLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const settingsRef = useRef(settings);
  const spawnQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    particlesRef.current = particles;
  }, [particles]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (preview) onActiveChange?.(particles.length > 0);
  }, [preview, particles.length]);

  useEffect(() => {
    if (clearSignal) setParticles([]);
  }, [clearSignal]);

  useEffect(() => {
    if (!preview && !settings.enabled) setParticles([]);
  }, [preview, settings.enabled]);

  useEffect(() => {
    if (!spawn) return;
    // Resolve image dimensions serially so a slower CDN response cannot let a
    // later chat message jump ahead in parade mode.
    const queuedSpawn = spawn;
    spawnQueueRef.current = spawnQueueRef.current.then(async () => {
      const activeSettings = settingsRef.current;
      if (!activeSettings.enabled && !preview) return;
      const sequence = [
        { imageUrl: queuedSpawn.imageUrl, overlays: queuedSpawn.overlays },
        ...(queuedSpawn.additional ?? []),
      ];
      const [sequenceAspectRatios, overlayAspectRatios] = await Promise.all([
        Promise.all(sequence.map((item) => loadImageAspectRatio(item.imageUrl))),
        Promise.all(
          sequence.map((item) =>
            Promise.all(
              (item.overlays ?? []).map((overlay) => loadImageAspectRatio(overlay.imageUrl)),
            ),
          ),
        ),
      ]);
      // Zero-width emotes may use a much wider canvas than their base emote.
      // Include that canvas in the particle bounds. Every image is centered in
      // the shared stack below, matching 7TV's own grid-cell composition.
      const stackAspectRatios = sequenceAspectRatios.map((baseRatio, index) =>
        Math.max(baseRatio, ...(overlayAspectRatios[index] ?? [])),
      );
      const container = containerRef.current;
      const width = container?.clientWidth || 1920;
      const height = container?.clientHeight || 1080;
      const scale = preview ? 0.42 : 1;
      const size = activeSettings.size * scale;
      const sequenceAspectRatio = stackAspectRatios.reduce((sum, ratio) => sum + ratio, 0);
      const labelWidth = activeSettings.showNames
        ? (() => {
            const context = document.createElement("canvas").getContext("2d");
            if (!context) return 0;
            const family = getComputedStyle(document.body).fontFamily || "sans-serif";
            context.font = `800 ${activeSettings.nameFontSize * scale}px ${family}`;
            return context.measureText(queuedSpawn.sender).width + 12 * scale;
          })()
        : 0;
      // The collision box must include a username that is wider than its
      // emotes, otherwise the label can leave the viewport at either edge.
      const aspectRatio = Math.max(sequenceAspectRatio, labelWidth / size);
      const particleWidth = size * aspectRatio;
      const labelHeight = activeSettings.showNames ? (activeSettings.nameFontSize + 8) * scale : 0;
      const { x, y, vx, vy } = initialMotion({
        settings: activeSettings,
        existing: particlesRef.current,
        width,
        height,
        scale,
        size,
        labelHeight,
        particleWidth,
        speed: activeSettings.speed * scale,
      });
      const particle: Particle = {
        ...queuedSpawn,
        x,
        y,
        vx,
        vy,
        bornAt: performance.now(),
        aspectRatio,
        sequenceAspectRatios,
        overlayAspectRatios,
        stackAspectRatios,
        cornerWaypointIndex: activeSettings.motion === "corners" ? 0 : undefined,
        cornerDirection: activeSettings.motion === "corners" ? activeSettings.direction : undefined,
      };
      setParticles((current) => {
        // Parade and fireworks turn new emotes away when full; the rest drop the oldest.
        // Fireworks' small copies do not count towards the limit.
        const turnAway =
          activeSettings.motion === "parade" || activeSettings.motion === "fireworks";
        const counted = current.filter((item) => !item.spark).length;
        const next = turnAway
          ? counted >= activeSettings.maxVisible
            ? current
            : [...current, particle]
          : [...current, particle].slice(-activeSettings.maxVisible);
        particlesRef.current = next;
        return next;
      });
    });
  }, [preview, spawn]);

  useEffect(() => {
    const blocked = new Set(settings.blacklist);
    setParticles((current) =>
      current.filter((particle) => !particle.senderLogin || !blocked.has(particle.senderLogin)),
    );
  }, [settings.blacklist]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      const container = containerRef.current;
      const scale = preview ? 0.42 : 1;
      const env: FrameEnv = {
        settings,
        scale,
        width: container?.clientWidth || 1920,
        height: container?.clientHeight || 1080,
        size: settings.size * scale,
        labelHeight: settings.showNames ? (settings.nameFontSize + 8) * scale : 0,
        now,
        dt: Math.min(0.05, Math.max(0, (now - previous) / 1000)),
      };
      previous = now;
      const expired = new Set<string>();
      const born: Particle[] = [];
      for (const particle of particlesRef.current) {
        const result = stepParticle(particle, nodesRef.current.get(particle.id), env);
        if (result.expired) expired.add(particle.id);
        if (result.sparks) born.push(...result.sparks);
      }
      if (expired.size || born.length) {
        setParticles((current) => {
          const next = [...current.filter((particle) => !expired.has(particle.id)), ...born];
          particlesRef.current = next;
          return next;
        });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [
    preview,
    settings.direction,
    settings.gravity,
    settings.lifetimeSeconds,
    settings.motion,
    settings.nameFontSize,
    settings.showNames,
    settings.size,
    settings.speed,
  ]);

  const scale = preview ? 0.42 : 1;
  const register = (id: string, node: HTMLDivElement | null) => {
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  };
  return (
    <div
      ref={containerRef}
      className={`chat-emote-layer${preview ? " chat-emote-layer--preview" : ""}`}
    >
      {particles.map((particle) => (
        <ParticleView
          key={particle.id}
          particle={particle}
          settings={settings}
          scale={scale}
          register={register}
        />
      ))}
    </div>
  );
}
