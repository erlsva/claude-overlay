import { Pencil, Play, Unlock, Lock } from "lucide-react";
import { type CanvasElement } from "../../types";
import { ActionScopeBadge } from "../ActionScopeBadge";
import { type SelectedAnimation } from "./types";
import type { LayersContext } from "./context";
import type { ElementPanelProps } from "./types";

/** Fit, fill, flip, animations and lock for the selected layer. */
export function SelectedLayerControls({
  props,
  s,
}: {
  props: ElementPanelProps;
  s: Pick<
    LayersContext,
    | "animationDuration"
    | "playSelectedAnimation"
    | "selectedAnimation"
    | "selectedElement"
    | "setAnimationDuration"
    | "setSelectedAnimation"
  >;
}) {
  const { onElementChange, onEditText } = props;
  const {
    animationDuration,
    playSelectedAnimation,
    selectedAnimation,
    selectedElement,
    setAnimationDuration,
    setSelectedAnimation,
  } = s;
  if (!selectedElement) return null;
  return (
    <div className="selected-layer-controls">
      <section className="selected-control-section">
        <header>
          <strong>Appearance</strong>
          <span>How this layer looks and enters the stream</span>
        </header>
        {selectedElement.type === "text" && (
          <button
            type="button"
            className="ui-button selected-text-edit-button"
            onClick={() => onEditText(selectedElement.id)}
          >
            <Pencil size={13} /> Edit text and style
          </button>
        )}
        <label className="selected-opacity-control">
          <span>Opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={selectedElement.opacity ?? 1}
            onChange={(event) =>
              onElementChange(selectedElement.id, {
                opacity: Number(event.target.value),
              })
            }
          />
          <output>{Math.round((selectedElement.opacity ?? 1) * 100)}%</output>
        </label>
        <div className="selected-transition-controls">
          {(
            [
              ["Show effect", "enterAnimation"],
              ["Hide effect", "exitAnimation"],
            ] as const
          ).map(([label, property]) => (
            <label key={property}>
              <span>{label}</span>
              <select
                value={selectedElement[property] ?? "fade"}
                onChange={(event) =>
                  onElementChange(selectedElement.id, {
                    [property]: event.target.value as CanvasElement[typeof property],
                  })
                }
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="pop">Pop</option>
                <option value="slide-left">Slide from left</option>
                <option value="slide-right">Slide from right</option>
                <option value="slide-up">Slide from top</option>
                <option value="slide-down">Slide from bottom</option>
                <option value="spin">Spin</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      {["image", "gif", "video"].includes(selectedElement.type) && (
        <section className="selected-control-section selected-media-animation">
          <header className="selected-media-animation__header">
            <span className="selected-media-animation__heading">
              <strong>Motion</strong>
              <small>Play a one-time reaction or move across the stream</small>
            </span>
            <ActionScopeBadge scope="both" />
          </header>
          <label className="selected-animation-choice">
            <span>Animation</span>
            <select
              value={selectedAnimation}
              onChange={(event) => setSelectedAnimation(event.target.value as SelectedAnimation)}
            >
              <optgroup label="Reactions">
                <option value="bounce">Bounce</option>
                <option value="float">Gentle float</option>
                <option value="heartbeat">Heartbeat</option>
                <option value="sway">Sway</option>
                <option value="pulse">Spotlight pulse</option>
                <option value="shake">Energetic shake</option>
                <option value="spin">Full spin</option>
              </optgroup>
              <optgroup label="Travel across stream">
                <option value="slide-lr">Left → right</option>
                <option value="slide-rl">Right → left</option>
                <option value="slide-tb">Top → bottom</option>
                <option value="slide-bt">Bottom → top</option>
              </optgroup>
            </select>
          </label>
          <label className="selected-animation-duration">
            <span>Duration</span>
            <input
              type="range"
              min="0.3"
              max="10"
              step="0.1"
              value={animationDuration}
              onChange={(event) => setAnimationDuration(Number(event.target.value))}
            />
            <output>{animationDuration.toFixed(1)}s</output>
          </label>
          <div className="selected-animation-presets" aria-label="Animation duration presets">
            {[0.6, 1.2, 2.5, 5].map((seconds) => (
              <button
                type="button"
                key={seconds}
                className={Math.abs(animationDuration - seconds) < 0.01 ? "active" : ""}
                onClick={() => setAnimationDuration(seconds)}
                aria-label={`Set animation duration to ${seconds} seconds`}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <button
            className="ui-button selected-animation-play"
            onClick={playSelectedAnimation}
            title="Play this animation now on the dashboard and overlay"
          >
            <Play size={13} /> Play animation
          </button>
        </section>
      )}

      <section className="selected-control-section selected-layer-protection">
        <header>
          <strong>Protection</strong>
          <span>Prevent accidental canvas edits</span>
        </header>
        <button
          className={`ui-button${selectedElement.locked ? " active" : ""}`}
          onClick={() =>
            onElementChange(selectedElement.id, {
              locked: !selectedElement.locked,
            })
          }
        >
          {selectedElement.locked ? <Unlock size={13} /> : <Lock size={13} />}
          {selectedElement.locked ? "Unlock layer" : "Lock layer"}
        </button>
      </section>
    </div>
  );
}
