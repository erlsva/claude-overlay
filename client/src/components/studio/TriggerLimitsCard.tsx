import { fieldStyle } from "./shared";
import { type ChatPermission } from "../../types";
import { Save, Plus, X } from "lucide-react";
import type { StudioContext } from "./context";

/** Step 3 of the builder: cooldown and who may use the command. */
export function TriggerLimitsCard({
  s,
}: {
  s: Pick<
    StudioContext,
    | "cancelTriggerEdit"
    | "chainedSteps"
    | "chatMessage"
    | "cooldown"
    | "createTrigger"
    | "editingChainIndex"
    | "editingTriggerId"
    | "isEvent"
    | "name"
    | "permission"
    | "setCooldown"
    | "setPermission"
    | "targetId"
    | "triggerAction"
  >;
}) {
  const {
    cancelTriggerEdit,
    chainedSteps,
    chatMessage,
    cooldown,
    createTrigger,
    editingChainIndex,
    editingTriggerId,
    isEvent,
    name,
    permission,
    setCooldown,
    setPermission,
    targetId,
    triggerAction,
  } = s;
  return (
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
            Everyone can run this paid TTS action. Prefer a saved (TTS:…) token, or restrict access
            and add a cooldown before saving.
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
  );
}
