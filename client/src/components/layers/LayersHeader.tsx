import type { LayersContext } from "./context";
import type { ElementPanelProps } from "./types";

/** The panel title with the group and ungroup buttons. */
export function LayersHeader({
  props,
  s,
}: {
  props: ElementPanelProps;
  s: Pick<LayersContext, "anyGrouped" | "canGroup">;
}) {
  const { onGroup, onUngroup } = props;
  const { anyGrouped, canGroup } = s;
  const groupButtonStyle = {
    background: "var(--bg-control)",
    border: "1px solid var(--line-strong)",
    borderRadius: 3,
    color: "var(--accent-text)",
    fontSize: 11,
    padding: "1px 4px",
    cursor: "pointer",
  };
  return (
    <div className="layers-panel__header">
      <span>Layers</span>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
        {canGroup && !anyGrouped && (
          <button
            className="ui-button ui-button--compact"
            onClick={onGroup}
            style={groupButtonStyle}
          >
            Group
          </button>
        )}
        {anyGrouped && (
          <button
            className="ui-button ui-button--compact"
            onClick={onUngroup}
            style={groupButtonStyle}
          >
            Ungroup
          </button>
        )}
      </div>
    </div>
  );
}
