import type { ChatEmoteSettings } from "../../types";
import { isPop } from "./modes";
import type { Particle } from "./types";

/** One emote on screen: the optional sender name and its emote images, with any zero-width overlays. */
export function ParticleView({
  particle,
  settings,
  scale,
  register,
}: {
  particle: Particle;
  settings: ChatEmoteSettings;
  scale: number;
  register: (id: string, node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={(node) => register(particle.id, node)}
      className="chat-emote-particle"
      style={{
        width: settings.size * scale * particle.aspectRatio,
        // Start invisible so a new emote never flashes before its first fade-in frame.
        opacity: isPop(settings.motion) || particle.spark ? 0 : undefined,
      }}
    >
      {settings.showNames && !particle.spark && (
        <span
          style={{
            color: particle.senderColor || "#fff",
            background: settings.nameBackgroundEnabled
              ? settings.nameBackgroundColor
              : "transparent",
            fontSize: Math.max(7, settings.nameFontSize * scale),
          }}
        >
          {particle.sender}
        </span>
      )}
      <div className="chat-emote-sequence">
        {[
          {
            emoteId: particle.emoteId,
            name: particle.name,
            imageUrl: particle.imageUrl,
            overlays: particle.overlays,
          },
          ...(particle.additional ?? []),
        ].map((item, sequenceIndex) => (
          <div
            key={`${item.emoteId}-${sequenceIndex}`}
            className="chat-emote-stack"
            style={{
              width: settings.size * scale * (particle.stackAspectRatios[sequenceIndex] ?? 1),
              height: settings.size * scale,
            }}
          >
            <img
              src={item.imageUrl}
              alt={item.name}
              draggable={false}
              style={{
                width: settings.size * scale * (particle.sequenceAspectRatios[sequenceIndex] ?? 1),
                height: settings.size * scale,
              }}
            />
            {item.overlays?.map((overlay, overlayIndex) => (
              <img
                key={`${overlay.emoteId}-${overlayIndex}`}
                className="chat-emote-stack__overlay"
                src={overlay.imageUrl}
                alt={overlay.name}
                draggable={false}
                style={{
                  width:
                    settings.size *
                    scale *
                    (particle.overlayAspectRatios[sequenceIndex]?.[overlayIndex] ?? 1),
                  height: settings.size * scale,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
