import { Link2, AlertTriangle } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Which Twitch accounts are connected, and the buttons to connect them. */
export function ConnectionsSection({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "chatConnectionWarning"
    | "chatbotHasWriteAccess"
    | "connectionsOpen"
    | "eventStatus"
    | "setConnectionsOpen"
    | "twitchEvents"
  >;
}) {
  const {
    chatConnectionWarning,
    chatbotHasWriteAccess,
    connectionsOpen,
    eventStatus,
    setConnectionsOpen,
    twitchEvents,
  } = s;
  return (
    <>
      <div className="connection-strip">
        <div className="connection-strip__pills">
          <span
            className={`status-pill ${props.studio.twitchConnected ? "status-pill--ok" : "status-pill--bad"}`}
            title="Anonymous Twitch chat listener, used for chat commands and emotes"
          >
            <i aria-hidden="true" />
            Chat listener
          </span>
          {(eventStatus?.channels ?? []).map((item) => (
            <span
              key={item.channel}
              className={`status-pill ${item.connected ? "status-pill--ok" : "status-pill--bad"}`}
              title={
                item.connected
                  ? "Twitch events connected"
                  : "Not connected. Twitch events from this channel will not arrive."
              }
            >
              <i aria-hidden="true" />
              <span style={{ textTransform: "capitalize" }}>{item.channel}</span>
            </span>
          ))}
          {eventStatus?.chatbot && (
            <span
              className={`status-pill ${chatbotHasWriteAccess ? "status-pill--ok" : "status-pill--bad"}`}
              title="Sends automated chat messages"
            >
              <i aria-hidden="true" />
              Chatbot
            </span>
          )}
        </div>
        <button
          type="button"
          className="ui-button ui-button--compact"
          aria-expanded={connectionsOpen}
          onClick={() => setConnectionsOpen((open) => !open)}
        >
          <Link2 size={12} />{" "}
          {connectionsOpen ? "Hide" : chatConnectionWarning ? "Fix connections" : "Connections"}
        </button>
      </div>
      {chatConnectionWarning && !connectionsOpen && (
        <p className="connection-strip__hint">
          <AlertTriangle size={13} aria-hidden="true" /> Chat-message actions are not fully
          connected yet.
        </p>
      )}
      {connectionsOpen && (
        <div className="connection-panel">
          <p className="connection-panel__intro">
            Broadcasters provide event access; the separate chatbot account sends automated
            messages.
          </p>
          {!eventStatus?.configured && (
            <div className="connection-card connection-card--error">
              Event storage is unavailable. Check the server database configuration.
            </div>
          )}
          {eventStatus?.configured && (
            <div className="connection-card">
              <div className="connection-card__head">
                <span className="connection-card__name">
                  <strong>Chatbot</strong>
                  {eventStatus.chatbot?.connected && (
                    <small>as {eventStatus.chatbot.displayName}</small>
                  )}
                </span>
                <span
                  className={`status-pill ${eventStatus.chatbot?.connected ? "status-pill--ok" : "status-pill--bad"}`}
                >
                  <i aria-hidden="true" />
                  {eventStatus.chatbot?.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <p className="connection-card__hint">
                Outgoing automation messages are sent by this account. Broadcaster tokens are never
                used to write chat.
              </p>
              <div className="connection-card__actions">
                <button
                  className={`ui-button ui-button--compact${eventStatus.chatbot?.connected ? "" : " studio-primary"}`}
                  disabled={!props.isOwner}
                  onClick={() => void twitchEvents.connectChatbot()}
                  title={
                    props.isOwner
                      ? `Authorize ${eventStatus.chatbot?.login ?? "the chatbot"} to send automated messages`
                      : "Only the overlay owner can manage the chatbot connection"
                  }
                >
                  <Link2 size={13} />{" "}
                  {eventStatus.chatbot?.connected ? "Reconnect" : "Connect chatbot"}
                </button>
                {eventStatus.chatbot?.connected && props.isOwner && (
                  <button
                    className="ui-button ui-button--compact ui-button--quiet-danger"
                    onClick={() => void twitchEvents.disconnectChatbot()}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          )}
          {(eventStatus?.channels ?? []).map((status) => {
            const channel = status.channel;
            const hasLegacyChatAccess = status.scopes.includes("user:write:chat");
            const hasBanAccess = status.scopes.includes("channel:moderate");
            const hasPredictionAccess = status.scopes.includes("channel:read:predictions");
            return (
              <div key={channel} className="connection-card">
                <div className="connection-card__head">
                  <span className="connection-card__name">
                    <strong style={{ textTransform: "capitalize" }}>{channel}</strong>
                    {status?.connected &&
                      status.displayName &&
                      status.displayName.toLowerCase() !== channel.toLowerCase() && (
                        <small>as {status.displayName}</small>
                      )}
                  </span>
                  <span
                    className={`status-pill ${status?.connected ? "status-pill--ok" : "status-pill--bad"}`}
                  >
                    <i aria-hidden="true" />
                    {status?.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="connection-card__hint">
                  Event access for follows, subscriptions, Bits, channel points, Hype Trains, bans,
                  timeouts, and predictions.
                </p>
                {status.connected && hasLegacyChatAccess && (
                  <p className="connection-card__note">
                    This connection still has the old chat-writing permission. Reconnect it to
                    replace that token with event-only access.
                  </p>
                )}
                {status.connected && !hasBanAccess && (
                  <p className="connection-card__note">
                    Reconnect this broadcaster once to enable ban and timeout events.
                  </p>
                )}
                {status.connected && hasBanAccess && !hasPredictionAccess && (
                  <p className="connection-card__note">
                    Reconnect this broadcaster once to enable prediction events.
                  </p>
                )}
                <div className="connection-card__actions">
                  <button
                    className={`ui-button ui-button--compact${status?.connected ? "" : " studio-primary"}`}
                    onClick={() => void twitchEvents.connect(channel)}
                  >
                    <Link2 size={13} /> {status?.connected ? "Reconnect" : "Connect"}
                  </button>
                  {status?.connected && (
                    <button
                      className="ui-button ui-button--compact ui-button--quiet-danger"
                      onClick={() => void twitchEvents.disconnect(channel)}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
                <details className="connection-card__tests">
                  <summary>Send a test event</summary>
                  <div className="connection-card__chips">
                    {(
                      [
                        "follow",
                        "subscribe",
                        "gift-subscribe",
                        "bits",
                        "raid",
                        "channel-points",
                        "ban",
                        "timeout",
                        "prediction",
                      ] as const
                    ).map((type) => (
                      <button
                        key={type}
                        className="ui-button ui-button--compact"
                        disabled={!status?.connected}
                        title={`Run a local simulated ${type} event`}
                        onClick={() => void twitchEvents.test(channel, type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
