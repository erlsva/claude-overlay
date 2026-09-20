import { Section } from "./shared";
import { ChatEmoteLayer } from "../chat-emotes/ChatEmoteLayer";
import { randomUUID } from "../../utils";
import previewEmote from "../../assets/vicksyW.png";
import { Square, Play } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

import { EmoteBehaviorCard } from "./EmoteBehaviorCard";
import { EmoteMotionCard } from "./EmoteMotionCard";
import { EmoteAdditionalCard } from "./EmoteAdditionalCard";
import { EmoteBlockedEmotesCard } from "./EmoteBlockedEmotesCard";
import { EmoteBlockedChattersCard } from "./EmoteBlockedChattersCard";
/** Chat emotes falling onto the overlay. */
export function EmotesTab({ props, s }: { props: StudioPanelProps; s: StudioContext }) {
  const {
    emoteClear,
    emotePreview,
    emoteRunning,
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
      <EmoteBehaviorCard props={props} s={s} />
      <EmoteMotionCard props={props} />
      <EmoteAdditionalCard props={props} s={s} />
      <EmoteBlockedEmotesCard props={props} s={s} />
      <EmoteBlockedChattersCard props={props} s={s} />
      <p className="chat-emote-note">
        Both channel 7TV sets follow the active preview. Native Vicksy and Wixels Twitch emotes are
        recognized from chat in either channel. Images remain on their providers’ CDNs.
      </p>
    </Section>
  );
}
