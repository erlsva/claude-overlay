import { Maximize2, Expand, Disc, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import type { LayersContext } from "./context";
import type { ElementPanelProps } from "./types";

/** The panel title with the group, ungroup and delete buttons. */
export function LayersHeader({
  props,
  s,
}: {
  props: ElementPanelProps;
  s: Pick<
    LayersContext,
    | "anyGrouped"
    | "canFlipSelected"
    | "canGroup"
    | "fitSelectedToStream"
    | "flipSelected"
    | "selectedElement"
    | "toggleDvdMotion"
  >;
}) {
  const { onGroup, onUngroup } = props;
  const {
    anyGrouped,
    canFlipSelected,
    canGroup,
    fitSelectedToStream,
    flipSelected,
    selectedElement,
    toggleDvdMotion,
  } = s;
  return (
    <div className="layers-panel__header">
      <span>Layers</span>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
        {selectedElement && !selectedElement.locked && (
          <span style={{ display: "none" }}>
            <button
              className="ui-button ui-button--compact"
              onClick={() => fitSelectedToStream("fit")}
              title="Fit selected element inside the stream"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                background: "var(--bg-control)",
                border: "1px solid var(--line-strong)",
                borderRadius: 3,
                color: "var(--accent-text)",
                fontSize: 11,
                padding: "2px 5px",
                cursor: "pointer",
              }}
            >
              <Maximize2 size={11} /> Fit
            </button>
            <button
              className="ui-button ui-button--compact"
              onClick={() => fitSelectedToStream("fill")}
              title="Fill the stream with the selected element (edges may crop)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                background: "var(--bg-control)",
                border: "1px solid var(--line-strong)",
                borderRadius: 3,
                color: "var(--accent-text)",
                fontSize: 11,
                padding: "2px 5px",
                cursor: "pointer",
              }}
            >
              <Expand size={11} /> Fill
            </button>
            {selectedElement.type !== "audio" && (
              <button
                className="ui-button ui-button--compact"
                onClick={toggleDvdMotion}
                title={
                  selectedElement.dvdEnabled
                    ? "Stop DVD motion at its current position"
                    : "Bounce the selected element around inside the stream"
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  background: selectedElement.dvdEnabled
                    ? "var(--accent-surface-strong)"
                    : "var(--bg-control)",
                  border: selectedElement.dvdEnabled
                    ? "1px solid var(--accent-border)"
                    : "1px solid var(--line-strong)",
                  borderRadius: 3,
                  color: selectedElement.dvdEnabled ? "var(--accent-text)" : "#aaa",
                  fontSize: 11,
                  padding: "2px 5px",
                  cursor: "pointer",
                }}
              >
                <Disc size={11} /> DVD
              </button>
            )}
            {canFlipSelected && (
              <>
                <button
                  className="ui-icon-button ui-button--compact"
                  onClick={() => flipSelected("x")}
                  title="Flip selected media left to right"
                  style={{
                    background: "var(--bg-control)",
                    border: "1px solid var(--line-strong)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                  }}
                >
                  <FlipHorizontal2 size={12} />
                </button>
                <button
                  className="ui-icon-button ui-button--compact"
                  onClick={() => flipSelected("y")}
                  title="Flip selected media top to bottom"
                  style={{
                    background: "var(--bg-control)",
                    border: "1px solid var(--line-strong)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                  }}
                >
                  <FlipVertical2 size={12} />
                </button>
              </>
            )}
          </span>
        )}
        {canGroup && !anyGrouped && (
          <button
            className="ui-button ui-button--compact"
            onClick={onGroup}
            style={{
              background: "var(--bg-control)",
              border: "1px solid var(--line-strong)",
              borderRadius: 3,
              color: "var(--accent-text)",
              fontSize: 11,
              padding: "1px 4px",
              cursor: "pointer",
            }}
          >
            Group
          </button>
        )}
        {anyGrouped && (
          <button
            className="ui-button ui-button--compact ui-danger"
            onClick={onUngroup}
            title="Ungroup"
            style={{
              background: "var(--bg-control)",
              border: "1px solid var(--line-strong)",
              borderRadius: 3,
              color: "#f87171",
              fontSize: 11,
              padding: "1px 4px",
              cursor: "pointer",
            }}
          >
            Ungroup
          </button>
        )}
      </div>
    </div>
  );
}
