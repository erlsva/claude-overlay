import { Segmented } from "../Segmented";
import { fieldStyle } from "./shared";
import { type TriggerEventType } from "../../types";
import type { StudioContext } from "./context";

/** Step 1 of the builder: what starts the automation. */
export function TriggerWhenCard({
  s,
}: {
  s: Pick<
    StudioContext,
    | "eventStatus"
    | "isEvent"
    | "kind"
    | "name"
    | "setKind"
    | "setName"
    | "setTriggerChannel"
    | "setTriggerEvent"
    | "setTriggerMatch"
    | "setTriggerMinimum"
    | "triggerChannel"
    | "triggerEvent"
    | "triggerMatch"
    | "triggerMinimum"
  >;
}) {
  const {
    eventStatus,
    isEvent,
    kind,
    name,
    setKind,
    setName,
    setTriggerChannel,
    setTriggerEvent,
    setTriggerMatch,
    setTriggerMinimum,
    triggerChannel,
    triggerEvent,
    triggerMatch,
    triggerMinimum,
  } = s;
  return (
    <div className="command-builder-card">
      <header>
        <b>1</b>
        <span>
          <strong>When this happens</strong>
          <small>
            {isEvent
              ? "Choose the Twitch event that starts the workflow."
              : "Choose the public chat command that starts the workflow."}
          </small>
        </span>
      </header>
      <Segmented
        label="What starts this automation"
        value={kind}
        onChange={setKind}
        options={[
          { value: "chat", label: "Chat command" },
          { value: "event", label: "Twitch event" },
        ]}
      />
      <input
        style={fieldStyle}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={isEvent ? "Event action name" : "Command name"}
        maxLength={60}
      />
      {isEvent && (
        <>
          <select
            style={fieldStyle}
            value={triggerEvent}
            onChange={(e) =>
              setTriggerEvent(e.target.value as Exclude<TriggerEventType, "chat-command">)
            }
          >
            <option value="follow">New follow</option>
            <option value="subscribe">Subscription or resubscription</option>
            <option value="gift-subscribe">Gift subscriptions</option>
            <option value="raid">Incoming raid</option>
            <option value="bits">Bits cheered</option>
            <option value="channel-points">Channel point redemption</option>
            <option value="ban">Permanent ban</option>
            <option value="timeout">Timeout</option>
            <option value="prediction">New prediction started</option>
          </select>
          <select
            style={fieldStyle}
            value={triggerChannel}
            onChange={(e) => setTriggerChannel(e.target.value)}
            title="Limit this trigger to one connected broadcaster"
          >
            <option value="">Any connected channel</option>
            {(eventStatus?.channels ?? []).map((item) => (
              <option key={item.channel} value={item.channel}>
                {item.displayName ?? item.channel}
              </option>
            ))}
          </select>
          {triggerEvent === "channel-points" && (
            <input
              style={fieldStyle}
              value={triggerMatch}
              onChange={(e) => setTriggerMatch(e.target.value)}
              placeholder="Reward title (leave empty for any reward)"
            />
          )}
          {["subscribe", "gift-subscribe", "raid", "bits"].includes(triggerEvent) && (
            <label className="command-timing">
              <span>
                {triggerEvent === "subscribe"
                  ? "Minimum months"
                  : triggerEvent === "gift-subscribe"
                    ? "Minimum gifts"
                    : triggerEvent === "raid"
                      ? "Minimum raiders"
                      : "Minimum Bits"}
              </span>
              <input
                style={fieldStyle}
                type="number"
                min="1"
                value={triggerMinimum}
                onChange={(e) => setTriggerMinimum(Math.max(1, Number(e.target.value)))}
              />
            </label>
          )}
        </>
      )}
      {!isEvent && (
        <input
          style={fieldStyle}
          value={triggerMatch}
          onChange={(e) => setTriggerMatch(e.target.value)}
          placeholder="Chat command, for example <fox"
        />
      )}
    </div>
  );
}
