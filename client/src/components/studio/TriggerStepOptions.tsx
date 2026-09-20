import { fieldStyle } from "./shared";
import { type TriggerPlacement, type FlyDirection } from "../../types";
import { Square, Play } from "lucide-react";
import { ActionScopeBadge } from "../ActionScopeBadge";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Placement, duration and direction options of an action. */
export function TriggerStepOptions({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "duration"
    | "flyDirection"
    | "flyRunning"
    | "flyStopRef"
    | "setDuration"
    | "setFlyDirection"
    | "setFlyRunning"
    | "setTriggerPlacement"
    | "targetId"
    | "toast"
    | "triggerAction"
    | "triggerPlacement"
  >;
}) {
  const {
    duration,
    flyDirection,
    flyRunning,
    flyStopRef,
    setDuration,
    setFlyDirection,
    setFlyRunning,
    setTriggerPlacement,
    targetId,
    toast,
    triggerAction,
    triggerPlacement,
  } = s;
  return (
    <>
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
    </>
  );
}
