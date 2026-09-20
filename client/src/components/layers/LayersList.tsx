import { Group as GroupIcon, Pencil, Eye, EyeOff } from "lucide-react";
import type { LayersContext } from "./context";
import type { ElementPanelProps } from "./types";

/** The list of layers, with groups. */
export function LayersList({
  props,
  s,
}: {
  props: ElementPanelProps;
  s: Pick<
    LayersContext,
    "arrowBtn" | "layerSearch" | "moveSlot" | "renderRow" | "slots" | "visibleSlots"
  >;
}) {
  const { selectedIds, onElementChange } = props;
  const { arrowBtn, layerSearch, moveSlot, renderRow, slots, visibleSlots } = s;
  return (
    <div className="layers-list">
      {slots.length === 0 && (
        <div
          style={{
            padding: 16,
            fontSize: 11,
            color: "var(--text-muted)",
            textAlign: "center",
            fontFamily: "Inter,sans-serif",
          }}
        >
          No layers yet. Use Add media, Text, Draw, or drag a file onto the workspace.
        </div>
      )}
      {slots.length > 0 && visibleSlots.length === 0 && (
        <div style={{ padding: 16, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          No layers match “{layerSearch}”.
        </div>
      )}
      {visibleSlots.map(({ slot, originalIndex: slotIdx }) => {
        if (slot.kind === "element") {
          return renderRow(slot.el, slotIdx, false);
        }
        // Group block
        const groupSelected = slot.members.some((m) => selectedIds.has(m.id));
        const allVisible = slot.members.every((m) => m.visible);
        const isTop = slotIdx === 0;
        const isBottom = slotIdx === slots.length - 1;
        return (
          <div
            key={slot.groupId}
            className="layer-group"
            style={{
              border: "1px solid rgba(var(--accent-rgb),0.45)",
              borderRadius: 5,
              background: "rgba(var(--accent-rgb),0.04)",
              overflow: "hidden",
            }}
          >
            {/* Group header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                padding: "4px 6px",
                background: groupSelected
                  ? "rgba(var(--accent-rgb),0.14)"
                  : "rgba(var(--accent-rgb),0.07)",
                borderBottom: "1px solid rgba(var(--accent-rgb),0.2)",
              }}
            >
              <GroupIcon size={12} color="var(--accent-text)" />
              <span
                style={{
                  fontSize: 11,
                  flex: 1,
                  color: "var(--accent-text)",
                  fontFamily: "Inter,sans-serif",
                  fontWeight: 600,
                }}
              >
                {slot.members[0]?.groupName || "Group"}{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 11 }}>
                  ({slot.members.length})
                </span>
              </span>
              <button
                className="ui-icon-button ui-button--compact"
                title="Rename this group"
                aria-label="Rename group"
                onClick={(event) => {
                  event.stopPropagation();
                  const value = window
                    .prompt("Group name", slot.members[0]?.groupName || "Group")
                    ?.trim();
                  if (!value) return;
                  slot.members.forEach((member) =>
                    onElementChange(member.id, {
                      groupName: value.slice(0, 80),
                    }),
                  );
                }}
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: "var(--bg-raised)",
                  border: "1px solid var(--line)",
                  color: "var(--accent-text)",
                  cursor: "pointer",
                }}
              >
                <Pencil size={11} />
              </button>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexShrink: 0,
                }}
              >
                {arrowBtn(isTop, "up", () => moveSlot(slotIdx, "up"))}
                {arrowBtn(isBottom, "down", () => moveSlot(slotIdx, "down"))}
              </div>
              {/* Toggle visibility for all group members */}
              <button
                className="ui-icon-button ui-button--compact"
                onClick={(e) => {
                  e.stopPropagation();
                  const target = !allVisible;
                  slot.members.forEach((m) => onElementChange(m.id, { visible: target }));
                }}
                title={allVisible ? "Hide group" : "Show group"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 2px",
                  color: allVisible ? "var(--accent-text)" : "#555",
                  flexShrink: 0,
                  display: "flex",
                }}
              >
                {allVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            {/* Member rows */}
            {slot.members.map((m, mIdx) =>
              renderRow(m, slotIdx, true, mIdx, slot.groupId, slot.members.length),
            )}
          </div>
        );
      })}
    </div>
  );
}
