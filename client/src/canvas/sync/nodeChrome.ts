import type { CanvasElement } from "../../types";
import { X } from "lucide-react";
import { getDvdPosition } from "../dvdMotion";
import { type HandlePos, addResizeHandle } from "../handles";
import { iconHTML } from "../icons";
import type { SyncContext } from "./context";

/** The selection border, resize handles, delete button and click-to-select of a layer's node. */

export function addSelectionBorder(node: HTMLElement) {
  const selBorder = document.createElement("div");
  selBorder.className = "sel-border";
  selBorder.style.cssText =
    "position:absolute;inset:-2px;pointer-events:none;border:2px solid var(--accent-border);display:none;border-radius:1px;";
  node.appendChild(selBorder);
}

/** Eight handles around the node; resizing a bouncing layer stops it where it is first. */
export function addResizeHandles(
  node: HTMLElement,
  el: CanvasElement,
  ctx: Pick<SyncContext, "elementsRef" | "getZoom" | "onElementChange">,
) {
  const { elementsRef, getZoom, onElementChange } = ctx;
  const handlePos: HandlePos[] = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
  for (const pos of handlePos) {
    addResizeHandle(
      node,
      pos,
      getZoom,
      (changes) => {
        const current = elementsRef.current.find((element) => element.id === el.id);
        if (current?.dvdEnabled) {
          const position = getDvdPosition(current);
          onElementChange(el.id, {
            ...changes,
            dvdEnabled: false,
            x: changes.x ?? position.x,
            y: changes.y ?? position.y,
          });
          return;
        }
        onElementChange(el.id, changes);
      },
      () => !elementsRef.current.find((element) => element.id === el.id)?.locked,
    );
  }
}

export function addDeleteButton(
  node: HTMLElement,
  el: CanvasElement,
  ctx: Pick<SyncContext, "elementsRef" | "onElementDelete">,
) {
  const { elementsRef, onElementDelete } = ctx;
  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = iconHTML(X, 11);
  deleteBtn.style.cssText =
    "position:absolute;top:-25px;right:-25px;background:#dc2626;color:white;border:1px solid #f87171;cursor:pointer;width:20px;height:20px;z-index:30;border-radius:50%;display:none;align-items:center;justify-content:center;padding:0;line-height:0;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.45);";
  deleteBtn.className = "delete-btn";
  deleteBtn.title = "Permanently delete this element";
  deleteBtn.setAttribute("aria-label", "Delete element");
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (elementsRef.current.find((element) => element.id === el.id)?.locked) return;
    onElementDelete(el.id);
  };
  node.appendChild(deleteBtn);
}

export function addClickToSelect(
  node: HTMLElement,
  el: CanvasElement,
  ctx: Pick<SyncContext, "onSelect">,
) {
  node.addEventListener(
    "click",
    (e) => {
      if (node.dataset.justDragged) {
        delete node.dataset.justDragged;
        return;
      }
      if ((e.target as HTMLElement).closest("button, input, audio, .rh")) return;
      ctx.onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey);
    },
    true,
  );
}
