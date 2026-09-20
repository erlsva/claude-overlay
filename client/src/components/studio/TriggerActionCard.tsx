import { fieldStyle } from "./shared";
import { type OverlayTrigger } from "../../types";
import { triggerActionOptions } from "./triggerOptions";
import { getFileLabel } from "../../canvas/config";
import { AudioLines, Play } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

import { TriggerMessageEditor } from "./TriggerMessageEditor";
import { TriggerStepOptions } from "./TriggerStepOptions";
import { TriggerStepTiming } from "./TriggerStepTiming";
import { TriggerChain } from "./TriggerChain";
/** Step 2 of the builder: what the automation does, and the chain of further actions. */
export function TriggerActionCard({ props, s }: { props: StudioPanelProps; s: StudioContext }) {
  const {
    selectedTargetElement,
    selectedTargetSound,
    setTargetId,
    setTriggerAction,
    targetId,
    triggerAction,
    ttsEnabled,
  } = s;
  return (
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
        <select style={fieldStyle} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
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
      {["send-chat", "tts"].includes(triggerAction) && <TriggerMessageEditor s={s} />}
      <TriggerStepOptions props={props} s={s} />
      <TriggerStepTiming s={s} />
      <TriggerChain props={props} s={s} />
    </div>
  );
}
