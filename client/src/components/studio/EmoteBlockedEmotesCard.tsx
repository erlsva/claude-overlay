import { fieldStyle } from "./shared";
import { Plus, X } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Emotes that never appear. */
export function EmoteBlockedEmotesCard({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<StudioContext, "blockedEmoteName" | "setBlockedEmoteName" | "toast">;
}) {
  const { blockedEmoteName, setBlockedEmoteName, toast } = s;
  return (
    <div className="chat-emote-card">
      <strong className="chat-emote-card__title">Blocked emotes</strong>
      <span className="chat-emote-card__description">
        Block Twitch subscriber/global or 7TV emotes by name. Case-insensitive; overrides additional
        emotes. Applies to new messages.
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
  );
}
