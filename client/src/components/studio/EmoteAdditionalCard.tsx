import { fieldStyle } from "./shared";
import { Plus, X } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Extra emotes from a message that are allowed to spawn too. */
export function EmoteAdditionalCard({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<StudioContext, "additionalEmoteName" | "setAdditionalEmoteName" | "toast">;
}) {
  const { additionalEmoteName, setAdditionalEmoteName, toast } = s;
  return (
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
              additionalEmotes: [...props.chatEmoteSettings.additionalEmotes, additionalEmoteName],
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
  );
}
