import { SliderField } from "../SliderField";
import type { StudioPanelProps } from "./types";

/** How emotes move, how big they are and how long they stay. */
export function EmoteMotionCard({ props }: { props: StudioPanelProps }) {
  return (
    <div className="chat-emote-card">
      <strong className="chat-emote-card__title">Motion & limits</strong>
      {(
        [
          ["Emote size", "size", 24, 100, 2, "px"],
          ["Movement speed", "speed", 40, 600, 10, " px/s"],
          ["Gravity", "gravity", 100, 2400, 50, " px/s²"],
          ["Lifetime", "lifetimeSeconds", 2, 120, 1, "s"],
          ["Maximum visible", "maxVisible", 1, 100, 1, ""],
        ] as const
      )
        .filter(
          ([, key]) =>
            key !== "gravity" ||
            props.chatEmoteSettings.motion === "floor" ||
            props.chatEmoteSettings.motion === "pop-floor",
        )
        .map(([label, key, min, max, step, suffix]) => (
          <SliderField
            key={key}
            label={label}
            value={props.chatEmoteSettings[key]}
            min={min}
            max={max}
            step={step}
            unit={suffix.trim()}
            onChange={(next) =>
              props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, [key]: next })
            }
          />
        ))}
    </div>
  );
}
