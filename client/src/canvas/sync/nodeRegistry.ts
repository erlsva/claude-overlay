import type { CanvasElement } from "../../types";
import { setRotation, applyNodeTransform, getScale, setScale } from "../elementTransforms";
import type { SyncContext } from "./context";

/** Lets a change be applied straight to a layer's DOM node, for smooth live updates. */
export function installDirectUpdate(ctx: SyncContext) {
  const { nodeMap, draggingRef, directUpdateRef } = ctx;
  if (directUpdateRef) {
    directUpdateRef.current = (id: string, changes: Partial<CanvasElement>) => {
      const n = nodeMap.get(id);
      if (!n || draggingRef.current.has(id)) return;
      if (changes.x != null) n.style.left = changes.x + "px";
      if (changes.y != null) n.style.top = changes.y + "px";
      if (changes.width != null) n.style.width = changes.width + "px";
      if (changes.height != null) n.style.height = changes.height + "px";
      if (changes.rotation != null) {
        setRotation(n, changes.rotation);
        applyNodeTransform(n);
      }
      if (changes.scaleX != null || changes.scaleY != null) {
        const currentScale = getScale(n);
        setScale(n, changes.scaleX ?? currentScale.x, changes.scaleY ?? currentScale.y);
        applyNodeTransform(n);
      }
      // Mark node so the DOM sync effect skips geometry this frame
      (n as any).__directUpdatedAt = Date.now();
    };
  }
}

/** Removes the nodes (and media) of layers that no longer exist. */
export function removeDeletedNodes(ctx: SyncContext) {
  const { elements, nodeMap, mediaElMap } = ctx;
  const presentIds = new Set(elements.map((e) => e.id));
  // Remove deleted nodes
  for (const [id, node] of nodeMap) {
    if (!presentIds.has(id)) {
      const media = mediaElMap.get(id);
      if (media) {
        media.pause();
        if (media.parentNode) media.parentNode.removeChild(media);
        mediaElMap.delete(id);
      }
      node.remove();
      nodeMap.delete(id);
    }
  }
}
