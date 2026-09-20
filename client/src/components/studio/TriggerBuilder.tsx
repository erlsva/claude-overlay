import { Plus, X, ArrowRight, AudioLines, Play, Square, Pencil, Save } from "lucide-react";
import { triggerActionLabel, triggerActionOptions, triggerTimingLabel } from "./triggerOptions";
import { Segmented } from "../Segmented";
import { fieldStyle } from "./shared";
import {
  type TriggerEventType,
  type OverlayTrigger,
  type TriggerPlacement,
  type FlyDirection,
  type TriggerStep,
  type ChatPermission,
} from "../../types";
import { getFileLabel } from "../../canvas/config";
import { ActionScopeBadge } from "../ActionScopeBadge";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** The form for creating or editing a command or Twitch event automation. */
export function TriggerBuilder({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "ttsEnabled"
    | "addChainedStep"
    | "builderVisible"
    | "cancelTriggerEdit"
    | "chainedSteps"
    | "chatMessage"
    | "closeBuilder"
    | "cooldown"
    | "createTrigger"
    | "currentStepIsFirst"
    | "duration"
    | "editChainedStep"
    | "editingChainIndex"
    | "editingTriggerId"
    | "eventStatus"
    | "filter"
    | "flyDirection"
    | "flyRunning"
    | "flyStopRef"
    | "hasTriggersForTab"
    | "isEvent"
    | "kind"
    | "loadTriggerStep"
    | "name"
    | "pendingStepBeforeChainEdit"
    | "permission"
    | "resetTriggerStep"
    | "selectedTargetElement"
    | "selectedTargetSound"
    | "setBuilderOpen"
    | "setChainedSteps"
    | "setChatMessage"
    | "setCooldown"
    | "setDuration"
    | "setEditingChainIndex"
    | "setFlyDirection"
    | "setFlyRunning"
    | "setKind"
    | "setName"
    | "setPermission"
    | "setStepDelay"
    | "setStepTiming"
    | "setTargetId"
    | "setTriggerAction"
    | "setTriggerChannel"
    | "setTriggerEvent"
    | "setTriggerMatch"
    | "setTriggerMinimum"
    | "setTriggerPlacement"
    | "setTtsErrorMessage"
    | "stepDelay"
    | "stepTiming"
    | "targetId"
    | "toast"
    | "triggerAction"
    | "triggerChannel"
    | "triggerEvent"
    | "triggerMatch"
    | "triggerMinimum"
    | "triggerPlacement"
    | "ttsErrorMessage"
  >;
}) {
  const {
    ttsEnabled,
    addChainedStep,
    builderVisible,
    cancelTriggerEdit,
    chainedSteps,
    chatMessage,
    closeBuilder,
    cooldown,
    createTrigger,
    currentStepIsFirst,
    duration,
    editChainedStep,
    editingChainIndex,
    editingTriggerId,
    eventStatus,
    filter,
    flyDirection,
    flyRunning,
    flyStopRef,
    hasTriggersForTab,
    isEvent,
    kind,
    loadTriggerStep,
    name,
    pendingStepBeforeChainEdit,
    permission,
    resetTriggerStep,
    selectedTargetElement,
    selectedTargetSound,
    setBuilderOpen,
    setChainedSteps,
    setChatMessage,
    setCooldown,
    setDuration,
    setEditingChainIndex,
    setFlyDirection,
    setFlyRunning,
    setKind,
    setName,
    setPermission,
    setStepDelay,
    setStepTiming,
    setTargetId,
    setTriggerAction,
    setTriggerChannel,
    setTriggerEvent,
    setTriggerMatch,
    setTriggerMinimum,
    setTriggerPlacement,
    setTtsErrorMessage,
    stepDelay,
    stepTiming,
    targetId,
    toast,
    triggerAction,
    triggerChannel,
    triggerEvent,
    triggerMatch,
    triggerMinimum,
    triggerPlacement,
    ttsErrorMessage,
  } = s;
  return (
    <>
      {!builderVisible && (
        <button
          type="button"
          className="ui-button studio-new-button"
          onClick={() => {
            setKind(filter === "event" ? "event" : "chat");
            setBuilderOpen(true);
          }}
        >
          <Plus size={14} />
          New automation
        </button>
      )}
      {builderVisible && (
        <div className="command-builder">
          <div className="command-builder__bar">
            <strong>{editingTriggerId ? "Edit automation" : "New automation"}</strong>
            {hasTriggersForTab && (
              <button
                type="button"
                className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                onClick={closeBuilder}
                title="Close the builder and discard this draft"
                aria-label="Close builder"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="command-builder__summary" aria-label="Automation workflow">
            <b>When</b> {isEvent ? "a Twitch event" : triggerMatch.trim() || "a chat command"}{" "}
            <ArrowRight size={12} aria-hidden="true" /> <b>do</b>{" "}
            {triggerActionLabel(triggerAction).toLowerCase()}
            {chainedSteps.length > 0 && ` + ${chainedSteps.length} more`}
          </p>
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
          <div className="command-builder-connector" aria-hidden="true">
            <span />
            <ArrowRight size={12} />
          </div>
          <div className="command-builder-card">
            <header>
              <b>2</b>
              <span>
                <strong>Do this</strong>
                <small>Choose one action, then optionally chain more.</small>
              </span>
            </header>
            <select
              style={fieldStyle}
              value={triggerAction}
              onChange={(e) => {
                setTriggerAction(e.target.value as OverlayTrigger["action"]);
                setTargetId("");
              }}
            >
              {triggerActionOptions
                .filter((option) => ttsEnabled || option.value !== "tts" || triggerAction === "tts")
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
            {!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) && (
              <select
                style={fieldStyle}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Choose target…</option>
                {(triggerAction === "play-sound"
                  ? props.studio.sounds
                  : triggerAction === "play-media"
                    ? props.elements.filter(
                        (element) => element.type === "video" || element.type === "audio",
                      )
                    : ["show-temporary", "fly-across"].includes(triggerAction)
                      ? props.elements.filter((element) =>
                          ["image", "gif", "video"].includes(element.type),
                        )
                      : props.elements
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {"name" in item
                      ? item.name
                      : item.type === "text"
                        ? `Text · ${item.id.slice(0, 6)}`
                        : `${item.displayName || getFileLabel(item.src) || item.type} · ${item.type}`}
                  </option>
                ))}
              </select>
            )}
            {targetId && (selectedTargetElement || selectedTargetSound) && (
              <div className="trigger-target-summary">
                {selectedTargetElement && ["image", "gif"].includes(selectedTargetElement.type) ? (
                  <img src={selectedTargetElement.src} alt="" />
                ) : (
                  <span className="trigger-target-summary__icon">
                    {selectedTargetSound ? <AudioLines size={15} /> : <Play size={15} />}
                  </span>
                )}
                <div>
                  <strong>
                    {selectedTargetSound?.name ||
                      selectedTargetElement?.displayName ||
                      (selectedTargetElement
                        ? getFileLabel(selectedTargetElement.src)
                        : "Selected target")}
                  </strong>
                  <span>
                    {selectedTargetSound
                      ? "Soundboard clip"
                      : `${selectedTargetElement?.type} layer · ${selectedTargetElement?.visible ? "visible" : "hidden on overlay"}`}
                  </span>
                </div>
              </div>
            )}
            {["send-chat", "tts"].includes(triggerAction) && (
              <div className="chat-message-editor">
                <label>
                  <span>
                    {triggerAction === "tts"
                      ? "TTS prompt or token · {message} inserts viewer input"
                      : "Chat message"}
                  </span>
                  <textarea
                    style={{
                      ...fieldStyle,
                      height: 72,
                      paddingTop: 8,
                      resize: "vertical",
                    }}
                    maxLength={triggerAction === "tts" ? 6000 : 500}
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder={
                      triggerAction === "tts"
                        ? '((a warm voice says "{message}" with echo;6s))'
                        : "Thanks {user} for the {bits} Bits!"
                    }
                    title="Message sent by the connected chatbot account. Event variables in braces are replaced automatically."
                  />
                </label>
                <div className="chat-variable-guide" aria-label="Available chat message variables">
                  <strong>Variables</strong>
                  {triggerAction === "tts" && (
                    <code title="Viewer text after the chat command">{"{message}"}</code>
                  )}
                  <code title="Viewer or broadcaster who caused the event">{"{user}"}</code>
                  <code title="Total subscription months">{"{months}"}</code>
                  <code title="Number of incoming raid viewers">{"{viewers}"}</code>
                  <code title="Number of Bits cheered">{"{bits}"}</code>
                  <code title="Channel point reward title">{"{reward}"}</code>
                  <code title="Channel receiving the event">{"{channel}"}</code>
                  <code title="Moderator who issued the ban or timeout">{"{moderator}"}</code>
                  <code title="Moderation reason">{"{reason}"}</code>
                  <code title="Permanent or timeout duration">{"{duration}"}</code>
                  <code title="Either ban or timeout">{"{banType}"}</code>
                  <code title="Title of the prediction that started">{"{title}"}</code>
                </div>
                {triggerAction === "tts" && (
                  <>
                    <label>
                      <span>Chat message if TTS fails (optional)</span>
                      <textarea
                        style={{
                          ...fieldStyle,
                          height: 58,
                          paddingTop: 8,
                          resize: "vertical",
                        }}
                        maxLength={500}
                        value={ttsErrorMessage}
                        onChange={(event) => setTtsErrorMessage(event.target.value)}
                        placeholder="Sorry {user}, that TTS could not be played."
                      />
                    </label>
                    <p className="command-cost-warning">
                      New prompts spend OpenAI and ElevenLabs credits. Saved (TTS:…) tokens replay
                      without generation cost; restrict dynamic chat TTS to trusted roles and a
                      meaningful cooldown. Failed TTS can notify chat through the connected chatbot.
                    </p>
                  </>
                )}
              </div>
            )}
            {["play-media", "show-temporary"].includes(triggerAction) && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 190px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                Position while active
                <select
                  style={fieldStyle}
                  value={triggerPlacement}
                  onChange={(event) => setTriggerPlacement(event.target.value as TriggerPlacement)}
                >
                  <option value="current">Keep position</option>
                  <option value="random">Random position</option>
                  <option value="fit">Fit inside stream</option>
                  <option value="fill">Fill stream</option>
                  <option value="top-left">Top left</option>
                  <option value="top-center">Top center</option>
                  <option value="top-right">Top right</option>
                  <option value="center-left">Center left</option>
                  <option value="center">Center</option>
                  <option value="center-right">Center right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-center">Bottom center</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </label>
            )}
            {triggerAction === "fly-across" && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 190px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                Flight path
                <select
                  style={fieldStyle}
                  value={flyDirection}
                  onChange={(event) => setFlyDirection(event.target.value as FlyDirection)}
                >
                  <option value="left-to-right-top">Left → right · top</option>
                  <option value="left-to-right-center">Left → right · center</option>
                  <option value="left-to-right-bottom">Left → right · bottom</option>
                  <option value="right-to-left-top">Right → left · top</option>
                  <option value="right-to-left-center">Right → left · center</option>
                  <option value="right-to-left-bottom">Right → left · bottom</option>
                  <option value="top-to-bottom-left">Top → bottom · left</option>
                  <option value="top-to-bottom-center">Top → bottom · center</option>
                  <option value="top-to-bottom-right">Top → bottom · right</option>
                  <option value="bottom-to-top-left">Bottom → top · left</option>
                  <option value="bottom-to-top-center">Bottom → top · center</option>
                  <option value="bottom-to-top-right">Bottom → top · right</option>
                </select>
              </label>
            )}
            {["show-temporary", "fly-across"].includes(triggerAction) && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                {triggerAction === "fly-across"
                  ? "Flight duration (seconds)"
                  : "Visible duration (seconds)"}
                <input
                  style={fieldStyle}
                  type="number"
                  min="1"
                  max="3600"
                  value={duration}
                  onChange={(event) =>
                    setDuration(Math.min(3600, Math.max(1, Number(event.target.value))))
                  }
                />
              </label>
            )}
            {triggerAction === "fly-across" && (
              <button
                type="button"
                className="ui-button ui-button--compact"
                disabled={!targetId && !flyRunning}
                onClick={() => {
                  if (flyRunning) {
                    // Do not wait for the browser's cancel event; the button should flip right away.
                    const stopFlight = flyStopRef.current;
                    flyStopRef.current = null;
                    setFlyRunning(false);
                    stopFlight?.();
                    return;
                  }
                  const stop = targetId
                    ? props.onPreviewFly(targetId, flyDirection, duration, () => {
                        if (flyStopRef.current !== stop) return;
                        flyStopRef.current = null;
                        setFlyRunning(false);
                      })
                    : null;
                  if (!stop) {
                    toast.error("Choose an available media element to preview");
                    return;
                  }
                  flyStopRef.current = stop;
                  setFlyRunning(true);
                  toast.info("Playing dashboard-only flight preview");
                }}
                style={{
                  width: "100%",
                  border: "1px solid var(--line-strong)",
                  background: "var(--bg-control)",
                  color: "var(--text-primary)",
                  cursor: targetId ? "pointer" : "not-allowed",
                }}
              >
                {flyRunning ? <Square size={11} fill="currentColor" /> : <Play size={12} />}
                {flyRunning ? "Stop preview" : "Preview flight"}
                <ActionScopeBadge scope="dashboard" />
              </button>
            )}
            {!currentStepIsFirst && (
              <label className="command-timing">
                <span>Start this action</span>
                <select
                  style={fieldStyle}
                  value={stepTiming}
                  onChange={(event) =>
                    setStepTiming(event.target.value as NonNullable<TriggerStep["timing"]>)
                  }
                >
                  <option value="immediate">At the same time</option>
                  <option value="delay">After a delay</option>
                  <option value="after-previous">After previous finishes</option>
                </select>
              </label>
            )}
            {!currentStepIsFirst && stepTiming === "delay" && (
              <label className="command-timing">
                <span>Delay (seconds)</span>
                <input
                  style={fieldStyle}
                  type="number"
                  min="0"
                  max="3600"
                  step="0.5"
                  value={stepDelay}
                  onChange={(event) =>
                    setStepDelay(Math.min(3600, Math.max(0, Number(event.target.value))))
                  }
                />
              </label>
            )}
            {chainedSteps.length > 0 && (
              <div className="command-chain" aria-label="Command action chain">
                <strong>Action chain</strong>
                {chainedSteps.map((step, index) => (
                  <div className="command-chain__step" key={`${index}-${step.action}`}>
                    <span className="command-chain__description">
                      <b>{index + 1}</b>
                      <span>
                        <strong>{triggerActionLabel(step.action)}</strong>
                        <small>
                          {triggerTimingLabel(step, index)}
                          {step.targetId
                            ? ` · ${props.studio.sounds.find((sound) => sound.id === step.targetId)?.name || props.elements.find((element) => element.id === step.targetId)?.displayName || "media target"}`
                            : ""}
                        </small>
                      </span>
                    </span>
                    <div className="command-chain__actions">
                      <button
                        type="button"
                        className="ui-icon-button"
                        onClick={() => editChainedStep(step, index)}
                        title={`Edit action ${index + 1}`}
                        aria-label={`Edit action ${index + 1}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="ui-icon-button command-chain__delete"
                        onClick={() => {
                          setChainedSteps((steps) =>
                            steps.filter((_, stepIndex) => stepIndex !== index),
                          );
                          if (editingChainIndex === index) {
                            const pendingStep = pendingStepBeforeChainEdit.current;
                            pendingStepBeforeChainEdit.current = null;
                            if (pendingStep) loadTriggerStep(pendingStep);
                            else resetTriggerStep();
                            setEditingChainIndex(null);
                          } else if (editingChainIndex !== null && editingChainIndex > index)
                            setEditingChainIndex(editingChainIndex - 1);
                          toast.success("Action removed from command chain");
                        }}
                        title={`Remove action ${index + 1} from this command`}
                        aria-label={`Remove action ${index + 1}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <span className="command-chain__pending">
                  {editingChainIndex !== null
                    ? `Editing action ${editingChainIndex + 1}`
                    : `${chainedSteps.length + 1}. ${triggerActionLabel(triggerAction)} (current)`}
                </span>
              </div>
            )}
            <button
              type="button"
              className="ui-button ui-button--compact command-chain__add"
              onClick={addChainedStep}
              disabled={
                (chainedSteps.length >= 9 && editingChainIndex === null) ||
                (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) && !targetId) ||
                (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
              }
            >
              {editingChainIndex !== null ? <Save size={13} /> : <Plus size={13} />}
              {editingChainIndex !== null ? "Update action" : "Add another action"}
            </button>
          </div>
          <div className="command-builder-connector" aria-hidden="true">
            <span />
            <ArrowRight size={12} />
          </div>
          <div className="command-builder-card">
            <header>
              <b>3</b>
              <span>
                <strong>Control & save</strong>
                <small>Set access and cooldown, then make the workflow available.</small>
              </span>
            </header>
            {!isEvent && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 190px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                Who can use it
                <select
                  style={fieldStyle}
                  value={permission}
                  onChange={(event) => setPermission(event.target.value as ChatPermission)}
                >
                  <option value="everyone">Everyone</option>
                  <option value="vip">VIPs, moderators & streamer</option>
                  <option value="moderator">Moderators & streamer</option>
                  <option value="streamer">Streamer only</option>
                </select>
              </label>
            )}
            {!isEvent &&
              permission === "everyone" &&
              (triggerAction === "tts" || chainedSteps.some((step) => step.action === "tts")) && (
                <p className="command-cost-warning">
                  Everyone can run this paid TTS action. Prefer a saved (TTS:…) token, or restrict
                  access and add a cooldown before saving.
                </p>
              )}
            <label
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px",
                alignItems: "center",
                gap: 8,
                color: "var(--text-secondary)",
                fontSize: 11,
              }}
            >
              Cooldown (seconds)
              <input
                style={fieldStyle}
                type="number"
                min="0"
                max="86400"
                value={cooldown}
                onChange={(e) => setCooldown(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <button
              className="ui-button studio-primary"
              onClick={createTrigger}
              disabled={
                !name.trim() ||
                editingChainIndex !== null ||
                (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) && !targetId) ||
                (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
              }
            >
              {editingTriggerId ? <Save size={14} /> : <Plus size={14} />}{" "}
              {editingTriggerId ? "Save changes" : isEvent ? "Add event action" : "Add command"}
            </button>
            {editingTriggerId && (
              <button className="ui-button" onClick={cancelTriggerEdit}>
                <X size={14} /> Cancel editing
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
