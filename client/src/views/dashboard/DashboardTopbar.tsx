import {
  Eye,
  EyeOff,
  MousePointerClick,
  Repeat2,
  MonitorPlay,
  RotateCcw,
  UserCog,
  PanelRightOpen,
} from "lucide-react";
import { CAN_SWITCH_TWITCH_CHANNEL, TWITCH_CHANNELS } from "../../config/twitchChannels";
import { ReadinessCheck } from "../../components/ReadinessCheck";
import type { DashboardContext } from "./context";

/** The bar along the top: Twitch preview, overlay controls, go-live check, whitelist and Studio buttons. */
export function DashboardTopbar({
  s,
}: {
  s: Pick<
    DashboardContext,
    | "chatEmoteSettings"
    | "connected"
    | "elements"
    | "isAdmin"
    | "overlayConnected"
    | "overlayCount"
    | "refreshOverlay"
    | "setShowStudio"
    | "setShowTwitchEmbed"
    | "setShowWhitelist"
    | "setTwitchChannel"
    | "setTwitchInteraction"
    | "showMirror"
    | "showStudio"
    | "showTwitchEmbed"
    | "studio"
    | "testOverlayAudio"
    | "toast"
    | "toggleMirror"
    | "twitchChannel"
    | "twitchInteraction"
  >;
}) {
  const {
    chatEmoteSettings,
    connected,
    elements,
    isAdmin,
    overlayConnected,
    overlayCount,
    refreshOverlay,
    setShowStudio,
    setShowTwitchEmbed,
    setShowWhitelist,
    setTwitchChannel,
    setTwitchInteraction,
    showMirror,
    showStudio,
    showTwitchEmbed,
    studio,
    testOverlayAudio,
    toast,
    toggleMirror,
    twitchChannel,
    twitchInteraction,
  } = s;
  return (
    <div className="dashboard-topbar">
      <div className="topbar-left">
        <span className="topbar-title">
          Stream Overlay <i aria-hidden="true">|</i>{" "}
          {twitchChannel.charAt(0).toUpperCase() + twitchChannel.slice(1)}
        </span>
      </div>
      <div className="topbar-right">
        <div className="topbar-group" role="group" aria-label="Twitch preview">
          <span className="topbar-group__label">
            Preview
            <strong>{twitchChannel.charAt(0).toUpperCase() + twitchChannel.slice(1)}</strong>
          </span>
          <button
            className={`ui-icon-button topbar-group__button${showTwitchEmbed ? " is-active" : ""}`}
            onClick={() => setShowTwitchEmbed((v) => !v)}
            aria-pressed={showTwitchEmbed}
            aria-label={
              showTwitchEmbed ? "Hide the Twitch stream preview" : "Show the Twitch stream preview"
            }
            title={
              showTwitchEmbed ? "Hide the Twitch stream preview" : "Show the Twitch stream preview"
            }
          >
            {showTwitchEmbed ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            className={`ui-icon-button topbar-group__button${twitchInteraction ? " is-active" : ""}`}
            onClick={() => setTwitchInteraction((value) => !value)}
            disabled={!showTwitchEmbed}
            aria-pressed={twitchInteraction}
            aria-label="Use the stream player controls"
            title={
              twitchInteraction
                ? "Done with the player. Turn canvas editing back on"
                : "Use the stream player (play, pause, mute). Canvas editing is paused while this is on"
            }
          >
            <MousePointerClick size={15} />
          </button>
          {CAN_SWITCH_TWITCH_CHANNEL && (
            <button
              className={`ui-icon-button topbar-group__button${twitchChannel === TWITCH_CHANNELS[1] ? " is-active" : ""}`}
              onClick={() => {
                const currentIndex = TWITCH_CHANNELS.indexOf(twitchChannel);
                const nextChannel = TWITCH_CHANNELS[(currentIndex + 1) % TWITCH_CHANNELS.length];
                setTwitchChannel(nextChannel);
                toast.info(`Switching preview and chat listener to ${nextChannel}`);
              }}
              aria-label="Switch Twitch preview channel"
              title={`Switch preview from ${twitchChannel} to ${TWITCH_CHANNELS[(TWITCH_CHANNELS.indexOf(twitchChannel) + 1) % TWITCH_CHANNELS.length]} (This will change the preview/layout for everyone)`}
            >
              <Repeat2 size={15} />
            </button>
          )}
        </div>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="topbar-group" role="group" aria-label="Overlay">
          <span className="topbar-group__label">Overlay</span>
          <button
            className={`ui-icon-button topbar-group__button${showMirror ? " is-active" : ""}`}
            onClick={toggleMirror}
            aria-pressed={showMirror}
            aria-label={
              showMirror ? "Hide the live overlay preview" : "Show the live overlay preview"
            }
            title={
              showMirror
                ? "Hide the live overlay preview"
                : "Show a live, silent copy of what the overlay is showing, including emotes"
            }
          >
            <MonitorPlay size={15} />
          </button>
          <button
            className="ui-icon-button topbar-group__button"
            onClick={() => {
              refreshOverlay();
              toast.success("Overlay refresh requested");
            }}
            aria-label="Refresh overlay"
            title="Refresh the overlay (reloads the browser source in the streamer's OBS)"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <ReadinessCheck
          connected={connected}
          overlayConnected={overlayConnected}
          overlayCount={overlayCount}
          twitchConnected={studio.twitchConnected}
          twitchChannel={twitchChannel}
          chatEmotesEnabled={chatEmoteSettings.enabled}
          elements={elements}
          studio={studio}
          onTestAudio={testOverlayAudio}
        />
        <span className="topbar-divider" aria-hidden="true" />
        {isAdmin && (
          <button
            className="ui-icon-button topbar-icon"
            onClick={() => setShowWhitelist(true)}
            aria-label="Manage who can use the dashboard"
            title="Manage who can use the dashboard"
          >
            <UserCog size={16} />
          </button>
        )}
        <button
          className={`ui-button topbar-studio${showStudio ? " is-active" : ""}`}
          onClick={() => setShowStudio((value) => !value)}
          aria-pressed={showStudio}
          title={
            showStudio
              ? "Close production tools"
              : "Open the Soundboard, chat commands, emotes, and overlay effects"
          }
        >
          <PanelRightOpen size={14} /> Studio
        </button>
      </div>
    </div>
  );
}
