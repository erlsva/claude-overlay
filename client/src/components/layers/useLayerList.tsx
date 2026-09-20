import { useState } from "react";
import { buildSlots, applySlotOrder } from "../../canvas/layerSlots";
import { parseTextSrc, getFileLabel } from "../../canvas/config";
import {
  Image as ImageIcon,
  Images,
  FileAudio,
  Film,
  Type as TypeIcon,
  ChevronUp,
  ChevronDown,
  Pencil,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { type CanvasElement } from "../../types";
import type { ElementPanelProps } from "./types";

/** The layer list: search, ordering, and rendering one row. */
export function useLayerList(props: ElementPanelProps) {
  const { elements, selectedIds, onSelect, onToggleVisible, onDelete, onElementChange } = props;
  const [layerSearch, setLayerSearch] = useState("");
  const slots = buildSlots(elements);
  const normalizedSearch = layerSearch.trim().toLowerCase();
  const visibleSlots = slots
    .map((slot, originalIndex) => ({ slot, originalIndex }))
    .filter(({ slot }) => {
      if (!normalizedSearch) return true;
      const members = slot.kind === "element" ? [slot.el] : slot.members;
      const groupName = slot.kind === "group" ? (slot.members[0]?.groupName ?? "group") : "";
      return [
        groupName,
        ...members.map((element) =>
          element.type === "text"
            ? parseTextSrc(element.src).text
            : element.displayName || getFileLabel(element.src) || element.type,
        ),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  const icon = (t: string) => {
    const Icon =
      t === "image"
        ? ImageIcon
        : t === "gif"
          ? Images
          : t === "audio"
            ? FileAudio
            : t === "video"
              ? Film
              : TypeIcon;
    return <Icon size={12} strokeWidth={2} />;
  };
  const moveSlot = (idx: number, dir: "up" | "down") => {
    const arr = [...slots];
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    applySlotOrder(arr, onElementChange);
  };
  const moveMember = (groupId: string, memberId: string, dir: "up" | "down") => {
    const newSlots = slots.map((slot) => {
      if (slot.kind !== "group" || slot.groupId !== groupId) return slot;
      const arr = [...slot.members];
      const idx = arr.findIndex((m) => m.id === memberId);
      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= arr.length) return slot;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return { ...slot, members: arr };
    });
    applySlotOrder(newSlots, onElementChange);
  };
  const arrowBtn = (disabled: boolean, label: string, onClick: () => void) => (
    <button
      className="ui-icon-button ui-button--compact ui-icon-button--ghost layer-row__arrow"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      title={`Move layer ${label}`}
      aria-label={`Move layer ${label}`}
    >
      {label === "up" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );
  const renderRow = (
    el: CanvasElement,
    slotIdx: number,
    inGroup: boolean,
    memberIdx?: number,
    groupId?: string,
    groupSize?: number,
  ) => {
    const sel = selectedIds.has(el.id);
    const label =
      el.type === "text"
        ? parseTextSrc(el.src).text.slice(0, 60) || "Text"
        : (el.displayName || getFileLabel(el.src)).slice(0, 80) || el.type;
    const isTop = inGroup ? memberIdx === 0 : slotIdx === 0;
    const isBottom = inGroup ? memberIdx === groupSize! - 1 : slotIdx === slots.length - 1;
    return (
      <div
        key={el.id}
        onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
        className={`layer-row${sel ? " is-selected" : ""}${inGroup ? " is-grouped" : ""}${el.visible ? "" : " is-hidden"}`}
      >
        <span className="layer-row__icon">{icon(el.type)}</span>
        <span className="layer-row__label" title={label}>
          {label}
        </span>
        <div className="layer-row__tools">
          {el.type !== "text" && (
            <button
              className="ui-icon-button ui-button--compact ui-icon-button--ghost"
              title="Rename this media in the dashboard"
              aria-label={`Rename ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                const value = window
                  .prompt("Media name", el.displayName || getFileLabel(el.src) || el.type)
                  ?.trim();
                if (value) onElementChange(el.id, { displayName: value.slice(0, 120) });
              }}
            >
              <Pencil size={13} />
            </button>
          )}
          {arrowBtn(isTop, "up", () =>
            inGroup ? moveMember(groupId!, el.id, "up") : moveSlot(slotIdx, "up"),
          )}
          {arrowBtn(isBottom, "down", () =>
            inGroup ? moveMember(groupId!, el.id, "down") : moveSlot(slotIdx, "down"),
          )}
          <button
            className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
            title="Delete this layer. Use Ctrl/Cmd + Z immediately afterward to undo"
            aria-label={`Delete ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(el.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
        <button
          className="ui-icon-button ui-button--compact ui-icon-button--ghost layer-row__eye"
          title={el.visible ? "Hide this layer from the overlay" : "Show this layer on the overlay"}
          aria-label={el.visible ? `Hide ${label}` : `Show ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible(el.id);
          }}
        >
          {el.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>
    );
  };

  return {
    layerSearch,
    setLayerSearch,
    slots,
    normalizedSearch,
    visibleSlots,
    icon,
    moveSlot,
    moveMember,
    arrowBtn,
    renderRow,
  };
}
