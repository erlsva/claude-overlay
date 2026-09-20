import type { CanvasElement } from "../../types";
import { setRotation, applyNodeTransform, getRotation } from "../elementTransforms";
import { addRotationHandle } from "../handles";
import type { SyncContext } from "./context";

const GROUP_BOX_PAD = 10;

/** The four corners of every member, rotated as drawn, so the box can be sized to fit them all. */
function memberCorners(members: CanvasElement[], nodeMap: Map<string, HTMLElement>) {
  return members.flatMap((member) => {
    const memberNode = nodeMap.get(member.id);
    const x = memberNode ? parseFloat(memberNode.style.left) || member.x : member.x;
    const y = memberNode ? parseFloat(memberNode.style.top) || member.y : member.y;
    const width = memberNode?.offsetWidth || member.width;
    const height = memberNode?.offsetHeight || member.height;
    const rotation = memberNode ? getRotation(memberNode) : (member.rotation ?? 0);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const angle = (rotation * Math.PI) / 180;
    const memberCos = Math.cos(angle);
    const memberSin = Math.sin(angle);
    return [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2],
    ].map(([cornerX, cornerY]) => ({
      x: centerX + cornerX * memberCos - cornerY * memberSin,
      y: centerY + cornerX * memberSin + cornerY * memberCos,
    }));
  });
}

interface GroupRotation {
  pivotX: number;
  pivotY: number;
  members: Array<{
    id: string;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    rotation: number;
  }>;
}

/** Creates the dashed box for a group, with a handle that rotates every unlocked member around the box centre. */
function createGroupBox(gid: string, ctx: SyncContext) {
  const { workspace, nodeMapRef, elementsRef, draggingRef, getZoom, onElementChange } = ctx;
  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;border:1.5px dashed rgba(var(--accent-rgb),0.45);background:rgba(var(--accent-rgb),0.04);pointer-events:none;border-radius:4px;";
  let rotationState: GroupRotation | null = null;
  const rotationHandle = addRotationHandle(
    box,
    () => {},
    () => elementsRef.current.filter((item) => item.groupId === gid).some((item) => !item.locked),
    () => {
      const currentMembers = elementsRef.current.filter(
        (item) => item.groupId === gid && !item.locked,
      );
      if (currentMembers.length < 2) return;
      const left = parseFloat(box.style.left) || 0;
      const top = parseFloat(box.style.top) || 0;
      const width = parseFloat(box.style.width) || 0;
      const height = parseFloat(box.style.height) || 0;
      rotationState = {
        pivotX: left + width / 2,
        pivotY: top + height / 2,
        members: currentMembers.map((member) => {
          draggingRef.current.add(member.id);
          return {
            id: member.id,
            centerX: member.x + member.width / 2,
            centerY: member.y + member.height / 2,
            width: member.width,
            height: member.height,
            rotation: member.rotation ?? 0,
          };
        }),
      };
    },
    () => {
      rotationState = null;
      draggingRef.current.clear();
    },
    () => {
      if (!rotationState) return null;
      const workspaceRect = workspace.getBoundingClientRect();
      const zoom = getZoom();
      return {
        x: workspaceRect.left + rotationState.pivotX * zoom,
        y: workspaceRect.top + rotationState.pivotY * zoom,
      };
    },
    (deltaDegrees) => {
      if (!rotationState) return;
      const angle = (deltaDegrees * Math.PI) / 180;
      const groupCos = Math.cos(angle);
      const groupSin = Math.sin(angle);
      for (const member of rotationState.members) {
        const offsetX = member.centerX - rotationState.pivotX;
        const offsetY = member.centerY - rotationState.pivotY;
        const centerX = rotationState.pivotX + offsetX * groupCos - offsetY * groupSin;
        const centerY = rotationState.pivotY + offsetX * groupSin + offsetY * groupCos;
        const changes = {
          x: centerX - member.width / 2,
          y: centerY - member.height / 2,
          rotation: member.rotation + deltaDegrees,
        };
        const memberNode = nodeMapRef.current.get(member.id);
        if (memberNode) {
          memberNode.style.left = `${changes.x}px`;
          memberNode.style.top = `${changes.y}px`;
          setRotation(memberNode, changes.rotation);
          applyNodeTransform(memberNode);
        }
        onElementChange(member.id, changes);
      }
    },
  );
  rotationHandle.classList.add("group-rotation-handle");
  rotationHandle.style.pointerEvents = "auto";
  rotationHandle.style.width = "22px";
  rotationHandle.style.height = "22px";
  rotationHandle.style.top = "-44px";
  rotationHandle.style.background = "var(--accent-solid)";
  rotationHandle.style.color = "var(--accent-contrast)";
  rotationHandle.style.zIndex = "100000";
  rotationHandle.setAttribute("aria-label", "Rotate group");
  workspace.insertBefore(box, workspace.firstChild);
  return box;
}

/** Draws the dashed box (and rotation handle) around each group of layers. */
export function syncGroupBoxes(ctx: SyncContext) {
  const { elements, selectedIds, nodeMap, groupBoxMapRef } = ctx;
  // Group bounding boxes
  const groupBoxMap = groupBoxMapRef.current;
  const activeGroups = new Map<string, CanvasElement[]>();
  for (const el of elements) {
    if (!el.groupId) continue;
    const arr = activeGroups.get(el.groupId) ?? [];
    arr.push(el);
    activeGroups.set(el.groupId, arr);
  }

  // Remove stale group boxes
  for (const [gid, box] of groupBoxMap) {
    if (!activeGroups.has(gid)) {
      box.remove();
      groupBoxMap.delete(gid);
    }
  }

  // Update/create group boxes
  for (const [gid, members] of activeGroups) {
    if (members.length < 2) continue;
    const corners = memberCorners(members, nodeMap);
    const minX = Math.min(...corners.map((corner) => corner.x)) - GROUP_BOX_PAD;
    const minY = Math.min(...corners.map((corner) => corner.y)) - GROUP_BOX_PAD;
    const maxX = Math.max(...corners.map((corner) => corner.x)) + GROUP_BOX_PAD;
    const maxY = Math.max(...corners.map((corner) => corner.y)) + GROUP_BOX_PAD;

    let box = groupBoxMap.get(gid);
    if (!box) {
      box = createGroupBox(gid, ctx);
      groupBoxMap.set(gid, box);
    }
    box.style.left = minX + "px";
    box.style.top = minY + "px";
    box.style.width = maxX - minX + "px";
    box.style.height = maxY - minY + "px";
    const groupSelected = members.some((member) => selectedIds.has(member.id));
    const groupRotationHandle = box.querySelector<HTMLElement>(".group-rotation-handle");
    if (groupRotationHandle) {
      groupRotationHandle.style.display = groupSelected ? "flex" : "none";
    }
  }
}
