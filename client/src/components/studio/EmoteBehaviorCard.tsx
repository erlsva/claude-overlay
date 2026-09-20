import { SliderField } from "../SliderField";
import { fieldStyle } from "./shared";
import { type ChatEmoteSettings } from "../../types";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Show names, name background and other emote behaviour. */
export function EmoteBehaviorCard({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<StudioContext, "toast">;
}) {
  const { toast } = s;
  return (
    <div className="chat-emote-card">
      <strong className="chat-emote-card__title">Behavior</strong>
      <label className="chat-emote-setting">
        <span>Show sender names</span>
        <input
          type="checkbox"
          checked={props.chatEmoteSettings.showNames}
          onChange={(event) => {
            props.onChatEmoteSettingsChange({
              ...props.chatEmoteSettings,
              showNames: event.target.checked,
            });
            toast.success(`Sender names ${event.target.checked ? "shown" : "hidden"}`);
          }}
        />
      </label>
      {props.chatEmoteSettings.showNames && (
        <label className="chat-emote-setting">
          <span>Name background</span>
          <input
            type="checkbox"
            checked={props.chatEmoteSettings.nameBackgroundEnabled}
            onChange={(event) => {
              props.onChatEmoteSettingsChange({
                ...props.chatEmoteSettings,
                nameBackgroundEnabled: event.target.checked,
              });
              toast.success(`Name backgrounds ${event.target.checked ? "shown" : "hidden"}`);
            }}
          />
        </label>
      )}
      {props.chatEmoteSettings.showNames && props.chatEmoteSettings.nameBackgroundEnabled && (
        <label className="chat-emote-setting">
          <span>Background color</span>
          <input
            type="color"
            value={props.chatEmoteSettings.nameBackgroundColor}
            onChange={(event) =>
              props.onChatEmoteSettingsChange({
                ...props.chatEmoteSettings,
                nameBackgroundColor: event.target.value,
              })
            }
          />
        </label>
      )}
      {props.chatEmoteSettings.showNames && (
        <SliderField
          label="Name text size"
          value={props.chatEmoteSettings.nameFontSize}
          min={9}
          max={32}
          step={1}
          unit="px"
          onChange={(nameFontSize) =>
            props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, nameFontSize })
          }
        />
      )}
      <label className="chat-emote-setting chat-emote-setting--motion">
        <span>Movement</span>
        <select
          style={{ ...fieldStyle, width: 132, maxWidth: "65%", minWidth: 0 }}
          value={props.chatEmoteSettings.motion}
          onChange={(event) => {
            const motion = event.target.value as ChatEmoteSettings["motion"];
            props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, motion });
            toast.success(
              motion === "parade"
                ? "Using the bottom parade"
                : motion === "corners"
                  ? "Emotes will travel around the corners"
                  : motion === "floor"
                    ? "Using floor bounce physics"
                    : "Using wall-to-wall bounce",
            );
          }}
        >
          <option value="parade">Bottom parade</option>
          <option value="corners">Corner route</option>
          <option value="floor">Floor bounce</option>
          <option value="walls">Wall bounce</option>
        </select>
      </label>
      {(props.chatEmoteSettings.motion === "parade" ||
        props.chatEmoteSettings.motion === "corners") && (
        <label className="chat-emote-setting chat-emote-setting--motion">
          <span>Direction</span>
          <select
            style={{ ...fieldStyle, width: 132, maxWidth: "65%", minWidth: 0 }}
            value={props.chatEmoteSettings.direction}
            onChange={(event) => {
              const direction = event.target.value as ChatEmoteSettings["direction"];
              props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, direction });
              toast.success(`Emotes will travel ${direction}`);
            }}
            title={
              props.chatEmoteSettings.motion === "parade"
                ? "Choose whether the parade travels left or right"
                : "Start left: bottom-left → top-left → top-right → bottom-right. Start right mirrors that route."
            }
          >
            <option value="left">
              {props.chatEmoteSettings.motion === "corners" ? "Start right" : "Right to left"}
            </option>
            <option value="right">
              {props.chatEmoteSettings.motion === "corners" ? "Start left" : "Left to right"}
            </option>
          </select>
        </label>
      )}
    </div>
  );
}
