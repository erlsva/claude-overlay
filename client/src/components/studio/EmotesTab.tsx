import { Section, fieldStyle } from "./shared";
import { ChatEmoteLayer } from "../ChatEmoteLayer";
import { randomUUID } from "../../utils";
import previewEmote from "../../assets/vicksyW.png";
import { Square, Play, Plus, X } from "lucide-react";
import { SliderField } from "../SliderField";
import { type ChatEmoteSettings } from "../../types";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Chat emotes falling onto the overlay. */
export function EmotesTab({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "additionalEmoteName"
    | "blacklistName"
    | "blockedEmoteName"
    | "emoteClear"
    | "emotePreview"
    | "emoteRunning"
    | "setAdditionalEmoteName"
    | "setBlacklistName"
    | "setBlockedEmoteName"
    | "setEmoteClear"
    | "setEmotePreview"
    | "setEmoteRunning"
    | "toast"
  >;
}) {
  const {
    additionalEmoteName,
    blacklistName,
    blockedEmoteName,
    emoteClear,
    emotePreview,
    emoteRunning,
    setAdditionalEmoteName,
    setBlacklistName,
    setBlockedEmoteName,
    setEmoteClear,
    setEmotePreview,
    setEmoteRunning,
    toast,
  } = s;
  return (
    <Section
      title="Chat emotes"
      description="Animate 7TV and Twitch emotes on the overlay without adding them to Layers or storing their images."
    >
      <div className="switch-card">
        <span>
          <strong>Chat emotes</strong>
          <small>
            {props.chatEmoteSettings.enabled
              ? "Emotes from chat are animating on the overlay."
              : "Turned off. No chat emotes appear on the overlay."}
          </small>
        </span>
        <button
          type="button"
          className="ui-switch"
          role="switch"
          aria-checked={props.chatEmoteSettings.enabled}
          aria-label="Chat emotes"
          onClick={() => {
            const enabled = !props.chatEmoteSettings.enabled;
            props.onChatEmoteSettingsChange({
              ...props.chatEmoteSettings,
              enabled,
            });
            toast.success(`Chat emotes ${enabled ? "enabled" : "disabled"}`);
          }}
          title="Enable or disable automatic 7TV and Twitch emotes from the currently monitored chat"
        />
      </div>
      <div className="chat-emote-preview">
        <ChatEmoteLayer
          preview
          spawn={emotePreview}
          settings={props.chatEmoteSettings}
          onActiveChange={setEmoteRunning}
          clearSignal={emoteClear}
        />
        <span>Dashboard-only preview</span>
      </div>
      <button
        type="button"
        className="ui-button"
        onClick={() => {
          if (emoteRunning) {
            setEmoteClear((count) => count + 1);
            setEmoteRunning(false);
            return;
          }
          setEmoteRunning(true);
          setEmotePreview({
            id: randomUUID(),
            emoteId: "preview",
            name: "Preview",
            imageUrl: previewEmote,
            sender: "Vicksy viewer",
            senderColor: "#fb923c",
          });
          toast.info("Playing a dashboard-only emote preview");
        }}
      >
        {emoteRunning ? <Square size={12} fill="currentColor" /> : <Play size={13} />}
        {emoteRunning ? "Stop preview" : "Preview movement (dashboard only)"}
      </button>
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
          .filter(([, key]) => key !== "gravity" || props.chatEmoteSettings.motion === "floor")
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
      <div className="chat-emote-card">
        <strong className="chat-emote-card__title">Additional emotes</strong>
        <span className="chat-emote-card__description">
          The first emote in a message always appears. Later emotes only appear when their exact 7TV
          name is listed here.
        </span>
        <div className="chat-emote-blacklist__add">
          <input
            style={fieldStyle}
            value={additionalEmoteName}
            onChange={(event) => setAdditionalEmoteName(event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.nextElementSibling instanceof HTMLButtonElement &&
                event.currentTarget.nextElementSibling.click();
            }}
            placeholder="PianoTime"
            maxLength={64}
            title="Enter the exact case-insensitive Twitch or 7TV emote name"
          />
          <button
            type="button"
            className="ui-button ui-button--compact"
            disabled={
              !/^[a-z0-9_]{1,64}$/i.test(additionalEmoteName) ||
              props.chatEmoteSettings.additionalEmotes.some(
                (name) => name.toLowerCase() === additionalEmoteName.toLowerCase(),
              )
            }
            onClick={() => {
              if (!/^[a-z0-9_]{1,64}$/i.test(additionalEmoteName)) {
                toast.error("Enter a valid 7TV emote name");
                return;
              }
              props.onChatEmoteSettingsChange({
                ...props.chatEmoteSettings,
                additionalEmotes: [
                  ...props.chatEmoteSettings.additionalEmotes,
                  additionalEmoteName,
                ],
              });
              toast.success(`${additionalEmoteName} can now appear after the first emote`);
              setAdditionalEmoteName("");
            }}
          >
            <Plus size={13} /> Allow
          </button>
        </div>
        {props.chatEmoteSettings.additionalEmotes.length ? (
          <div className="chat-emote-blacklist">
            {props.chatEmoteSettings.additionalEmotes.map((emoteName) => (
              <span key={emoteName.toLowerCase()}>
                {emoteName}
                <button
                  type="button"
                  onClick={() => {
                    props.onChatEmoteSettingsChange({
                      ...props.chatEmoteSettings,
                      additionalEmotes: props.chatEmoteSettings.additionalEmotes.filter(
                        (name) => name.toLowerCase() !== emoteName.toLowerCase(),
                      ),
                    });
                    toast.success(`${emoteName} removed from additional emotes`);
                  }}
                  title={`Stop allowing ${emoteName} after the first emote`}
                  aria-label={`Remove ${emoteName} from additional emotes`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="chat-emote-blacklist__empty">No additional emotes allowed</span>
        )}
      </div>
      <div className="chat-emote-card">
        <strong className="chat-emote-card__title">Blocked emotes</strong>
        <span className="chat-emote-card__description">
          Block Twitch subscriber/global or 7TV emotes by name. Case-insensitive; overrides
          additional emotes. Applies to new messages.
        </span>
        <form
          className="chat-emote-blacklist__add"
          onSubmit={(event) => {
            event.preventDefault();
            const name = blockedEmoteName.trim();
            const current = props.chatEmoteSettings.blockedEmotes ?? [];
            if (
              !/^\S{1,64}$/.test(name) ||
              current.length >= 100 ||
              current.some((item) => item.toLowerCase() === name.toLowerCase())
            )
              return;
            props.onChatEmoteSettingsChange({
              ...props.chatEmoteSettings,
              blockedEmotes: [...current, name],
            });
            setBlockedEmoteName("");
            toast.success(`${name} blocked from chat emotes`);
          }}
        >
          <input
            style={fieldStyle}
            value={blockedEmoteName}
            onChange={(event) => setBlockedEmoteName(event.target.value)}
            maxLength={64}
            placeholder="Exact emote name"
            aria-label="Emote name to block"
            title="Enter a Twitch or 7TV emote name, including its channel prefix if present"
          />
          <button
            type="submit"
            className="ui-button ui-button--compact"
            disabled={
              !/^\S{1,64}$/.test(blockedEmoteName.trim()) ||
              (props.chatEmoteSettings.blockedEmotes ?? []).length >= 100 ||
              (props.chatEmoteSettings.blockedEmotes ?? []).some(
                (name) => name.toLowerCase() === blockedEmoteName.trim().toLowerCase(),
              )
            }
          >
            <Plus size={13} /> Block
          </button>
        </form>
        <div className="chat-emote-blacklist">
          {(props.chatEmoteSettings.blockedEmotes ?? []).map((name) => (
            <span key={name}>
              {name}
              <button
                type="button"
                aria-label={`Unblock ${name}`}
                title={`Allow ${name} again`}
                onClick={() => {
                  props.onChatEmoteSettingsChange({
                    ...props.chatEmoteSettings,
                    blockedEmotes: props.chatEmoteSettings.blockedEmotes.filter(
                      (item) => item !== name,
                    ),
                  });
                  toast.success(`${name} unblocked`);
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {!(props.chatEmoteSettings.blockedEmotes ?? []).length && (
            <span className="chat-emote-blacklist__empty">No blocked emotes</span>
          )}
        </div>
      </div>
      <div className="chat-emote-card">
        <strong className="chat-emote-card__title">Blocked chatters</strong>
        <span className="chat-emote-card__description">
          These Twitch usernames cannot spawn chat emotes. Commands are unaffected.
        </span>
        <div className="chat-emote-blacklist__add">
          <input
            style={fieldStyle}
            value={blacklistName}
            onChange={(event) =>
              setBlacklistName(event.target.value.replace(/^@/, "").toLowerCase())
            }
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.nextElementSibling instanceof HTMLButtonElement &&
                event.currentTarget.nextElementSibling.click();
            }}
            placeholder="username"
            maxLength={25}
            title="Enter a Twitch username to prevent their emotes from appearing"
          />
          <button
            type="button"
            className="ui-button ui-button--compact"
            disabled={
              !/^[a-z0-9_]{1,25}$/.test(blacklistName) ||
              props.chatEmoteSettings.blacklist.includes(blacklistName)
            }
            onClick={() => {
              if (!/^[a-z0-9_]{1,25}$/.test(blacklistName)) {
                toast.error("Enter a valid Twitch username");
                return;
              }
              props.onChatEmoteSettingsChange({
                ...props.chatEmoteSettings,
                blacklist: [...props.chatEmoteSettings.blacklist, blacklistName],
              });
              toast.success(`@${blacklistName} blocked from chat emotes`);
              setBlacklistName("");
            }}
          >
            <Plus size={13} /> Block
          </button>
        </div>
        {props.chatEmoteSettings.blacklist.length ? (
          <div className="chat-emote-blacklist">
            {props.chatEmoteSettings.blacklist.map((username) => (
              <span key={username}>
                @{username}
                <button
                  type="button"
                  onClick={() => {
                    props.onChatEmoteSettingsChange({
                      ...props.chatEmoteSettings,
                      blacklist: props.chatEmoteSettings.blacklist.filter(
                        (item) => item !== username,
                      ),
                    });
                    toast.success(`@${username} removed from the blacklist`);
                  }}
                  title={`Allow @${username} to spawn chat emotes again`}
                  aria-label={`Remove ${username} from blacklist`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="chat-emote-blacklist__empty">No blocked chatters</span>
        )}
      </div>
      <p className="chat-emote-note">
        Both channel 7TV sets follow the active preview. Native Vicksy and Wixels Twitch emotes are
        recognized from chat in either channel. Images remain on their providers’ CDNs.
      </p>
    </Section>
  );
}
