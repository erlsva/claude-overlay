import { triggerActionLabel, triggerTimingLabel } from "./triggerOptions";
import { Pencil, X, Save, Plus } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** The actions already in the chain, and the button that adds another. */
export function TriggerChain({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "addChainedStep"
    | "chainedSteps"
    | "chatMessage"
    | "editChainedStep"
    | "editingChainIndex"
    | "loadTriggerStep"
    | "pendingStepBeforeChainEdit"
    | "resetTriggerStep"
    | "setChainedSteps"
    | "setEditingChainIndex"
    | "targetId"
    | "toast"
    | "triggerAction"
  >;
}) {
  const {
    addChainedStep,
    chainedSteps,
    chatMessage,
    editChainedStep,
    editingChainIndex,
    loadTriggerStep,
    pendingStepBeforeChainEdit,
    resetTriggerStep,
    setChainedSteps,
    setEditingChainIndex,
    targetId,
    toast,
    triggerAction,
  } = s;
  return (
    <>
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
                    setChainedSteps((steps) => steps.filter((_, stepIndex) => stepIndex !== index));
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
    </>
  );
}
