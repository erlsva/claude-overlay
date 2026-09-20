/** The layer list order: groups move as one slot. */

import { type CanvasElement } from "../types";

// ---------------------------------------------------------------------------
// Layers panel
// ---------------------------------------------------------------------------
type LayerSlot =
  | { kind: "element"; el: CanvasElement }
  | { kind: "group"; groupId: string; members: CanvasElement[] };

export function buildSlots(elements: CanvasElement[]): LayerSlot[] {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  const slots: LayerSlot[] = [];
  const seen = new Set<string>();
  for (const el of sorted) {
    if (el.groupId) {
      if (!seen.has(el.groupId)) {
        seen.add(el.groupId);
        const members = elements
          .filter((e) => e.groupId === el.groupId)
          .sort((a, b) => b.zIndex - a.zIndex);
        slots.push({ kind: "group", groupId: el.groupId, members });
      }
    } else {
      slots.push({ kind: "element", el });
    }
  }
  return slots;
}

export function applySlotOrder(
  slots: LayerSlot[],
  onElementChange: (id: string, changes: Partial<CanvasElement>) => void,
) {
  const total = slots.reduce((n, s) => n + (s.kind === "element" ? 1 : s.members.length), 0);
  let z = total * 100;
  for (const slot of slots) {
    if (slot.kind === "element") {
      onElementChange(slot.el.id, { zIndex: z });
      z -= 100;
    } else {
      for (const m of slot.members) {
        onElementChange(m.id, { zIndex: z });
        z -= 100;
      }
    }
  }
}
