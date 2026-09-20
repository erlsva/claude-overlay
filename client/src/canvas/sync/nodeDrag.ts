import type { CanvasElement } from "../../types";
import { getDvdPosition } from "../dvdMotion";
import { makeDraggable } from "../dragging";
import { addRotationHandle } from "../handles";
import type { SyncContext } from "./context";

type DragContext = Pick<
  SyncContext,
  | "elementsRef"
  | "selectedIdsRef"
  | "draggingRef"
  | "groupBoxMapRef"
  | "nodeMapRef"
  | "snapXGuideRef"
  | "snapYGuideRef"
  | "getZoom"
  | "onElementChange"
  | "onEditText"
>;

const GROUP_DRAG_EMIT_MS = 50;

/** The rotation handle on the layer's own node. */
export function addNodeRotationHandle(node: HTMLElement, el: CanvasElement, ctx: DragContext) {
  const { elementsRef, draggingRef, onElementChange } = ctx;
  addRotationHandle(
    node,
    (changes) => onElementChange(el.id, changes),
    () => !elementsRef.current.find((element) => element.id === el.id)?.locked,
    () => draggingRef.current.add(el.id),
    () => draggingRef.current.delete(el.id),
  );
}

/**
 * Makes the node draggable. Dragging one layer of a selection or group moves the rest with it,
 * along with the dashed group boxes, and shows the snap guides.
 */
export function addNodeDragging(node: HTMLElement, el: CanvasElement, ctx: DragContext) {
  const {
    elementsRef,
    selectedIdsRef,
    draggingRef,
    groupBoxMapRef,
    nodeMapRef,
    snapXGuideRef,
    snapYGuideRef,
    getZoom,
    onElementChange,
    onEditText,
  } = ctx;

  // Capture the drag cohort once so selection or socket echoes cannot
  // change which elements move halfway through a gesture.
  let activeDragIds = new Set<string>();
  const onDragStart = () => {
    const thisEl = elementsRef.current.find((e) => e.id === el.id);
    const selected = selectedIdsRef.current;
    activeDragIds = new Set([el.id]);
    if (selected.has(el.id)) selected.forEach((id) => activeDragIds.add(id));
    if (thisEl?.groupId) {
      for (const member of elementsRef.current) {
        if (member.groupId === thisEl.groupId) activeDragIds.add(member.id);
      }
    }
    activeDragIds.forEach((id) => draggingRef.current.add(id));
    if (thisEl?.dvdEnabled) {
      const position = getDvdPosition(thisEl);
      onElementChange(el.id, {
        dvdEnabled: false,
        x: position.x,
        y: position.y,
      });
    }
  };
  const onDragEnd = () => {
    activeDragIds.clear();
    draggingRef.current.clear();
  };

  /** Moves the dashed box around each group being dragged. */
  const moveGroupBoxes = (dx: number, dy: number, final: boolean) => {
    const activeGroupIds = new Set(
      elementsRef.current
        .filter((item) => activeDragIds.has(item.id) && item.groupId)
        .map((item) => item.groupId!),
    );
    for (const groupId of activeGroupIds) {
      const groupBox = groupBoxMapRef.current.get(groupId);
      if (!groupBox) continue;
      if (!groupBox.dataset.dragStartLeft) {
        groupBox.dataset.dragStartLeft = String(parseFloat(groupBox.style.left) || 0);
        groupBox.dataset.dragStartTop = String(parseFloat(groupBox.style.top) || 0);
      }
      groupBox.style.left = `${Number(groupBox.dataset.dragStartLeft) + dx}px`;
      groupBox.style.top = `${Number(groupBox.dataset.dragStartTop) + dy}px`;
      if (final) {
        delete groupBox.dataset.dragStartLeft;
        delete groupBox.dataset.dragStartTop;
      }
    }
  };

  let groupDragLastEmit = 0;
  /** Moves every other layer in the drag by the same distance, telling the server at most every 50 ms. */
  const moveOtherLayers = (dx: number, dy: number, final: boolean) => {
    if (activeDragIds.size <= 1) return;
    moveGroupBoxes(dx, dy, final);
    for (const other of elementsRef.current) {
      if (other.id === el.id || !activeDragIds.has(other.id) || other.locked) continue;
      const otherNode = nodeMapRef.current.get(other.id);
      if (!otherNode) continue;
      const startLeft = parseFloat(otherNode.dataset.startLeft ?? String(other.x));
      const startTop = parseFloat(otherNode.dataset.startTop ?? String(other.y));
      if (!otherNode.dataset.startLeft) {
        otherNode.dataset.startLeft = String(other.x);
        otherNode.dataset.startTop = String(other.y);
      }
      const nx = startLeft + dx;
      const ny = startTop + dy;
      otherNode.style.left = nx + "px";
      otherNode.style.top = ny + "px";
      const now = Date.now();
      if (final || now - groupDragLastEmit >= GROUP_DRAG_EMIT_MS) {
        onElementChange(other.id, { x: nx, y: ny });
      }
      if (final) {
        delete otherNode.dataset.startLeft;
        delete otherNode.dataset.startTop;
      }
    }
    if (final || Date.now() - groupDragLastEmit >= GROUP_DRAG_EMIT_MS) {
      groupDragLastEmit = Date.now();
    }
  };

  makeDraggable(
    node,
    getZoom,
    (changes) => onElementChange(el.id, changes),
    moveOtherLayers,
    el.type === "text" ? () => onEditText?.(el.id) : null,
    {
      onDragStart,
      onDragEnd: () => {
        node.dataset.justDragged = "true";
        onDragEnd();
      },
      canInteract: () => !elementsRef.current.find((element) => element.id === el.id)?.locked,
      onSnapGuides: (guideX, guideY) => {
        const xGuide = snapXGuideRef.current;
        const yGuide = snapYGuideRef.current;
        if (xGuide) {
          xGuide.style.display = guideX === undefined ? "none" : "block";
          if (guideX !== undefined) xGuide.style.left = `${guideX}px`;
        }
        if (yGuide) {
          yGuide.style.display = guideY === undefined ? "none" : "block";
          if (guideY !== undefined) yGuide.style.top = `${guideY}px`;
        }
      },
    },
  );
}
