import { Plus, X, ArrowRight } from "lucide-react";
import { triggerActionLabel } from "./triggerOptions";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

import { TriggerWhenCard } from "./TriggerWhenCard";
import { TriggerActionCard } from "./TriggerActionCard";
import { TriggerLimitsCard } from "./TriggerLimitsCard";
/** The form for creating or editing a command or Twitch event automation. */
export function TriggerBuilder({ props, s }: { props: StudioPanelProps; s: StudioContext }) {
  const {
    builderVisible,
    chainedSteps,
    closeBuilder,
    editingTriggerId,
    filter,
    hasTriggersForTab,
    isEvent,
    setBuilderOpen,
    setKind,
    triggerAction,
    triggerMatch,
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
          <TriggerWhenCard s={s} />
          <div className="command-builder-connector" aria-hidden="true">
            <span />
            <ArrowRight size={12} />
          </div>
          <TriggerActionCard props={props} s={s} />
          <div className="command-builder-connector" aria-hidden="true">
            <span />
            <ArrowRight size={12} />
          </div>
          <TriggerLimitsCard s={s} />
        </div>
      )}
    </>
  );
}
