import { fieldStyle } from "./shared";
import { Plus, X } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Chatters whose emotes never appear. */
export function EmoteBlockedChattersCard({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<StudioContext, "blacklistName" | "setBlacklistName" | "toast">;
}) {
  const { blacklistName, setBlacklistName, toast } = s;
  return (
    <div className="chat-emote-card">
      <strong className="chat-emote-card__title">Blocked chatters</strong>
      <span className="chat-emote-card__description">
        These Twitch usernames cannot spawn chat emotes. Commands are unaffected.
      </span>
      <div className="chat-emote-blacklist__add">
        <input
          style={fieldStyle}
          value={blacklistName}
          onChange={(event) => setBlacklistName(event.target.value.replace(/^@/, "").toLowerCase())}
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
  );
}
