import { fieldStyle } from "./shared";
import { type TriggerStep } from "../../types";
import type { StudioContext } from "./context";

/** When a chained action starts relative to the one before it. */
export function TriggerStepTiming({
  s,
}: {
  s: Pick<
    StudioContext,
    "currentStepIsFirst" | "setStepDelay" | "setStepTiming" | "stepDelay" | "stepTiming"
  >;
}) {
  const { currentStepIsFirst, setStepDelay, setStepTiming, stepDelay, stepTiming } = s;
  return (
    <>
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
    </>
  );
}
