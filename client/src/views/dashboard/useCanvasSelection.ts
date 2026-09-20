import { useState, useRef, useCallback, useEffect } from "react";
import { type CanvasElement, type MediaControlPayload } from "../../types";
import { SPAWN_X, SPAWN_Y, DEFAULT_TEXT_CONFIG } from "../../canvas/config";
import { randomUUID } from "../../utils";
import { isEditingTarget, validClipboardElement } from "./clipboard";
import { OVERLAY_CLIPBOARD_TYPE } from "./constants";
import { encodeTextSrc } from "../../components/TextDialog";
import type { useDashboardSocket } from "./useDashboardSocket";
import type { useDashboardServices } from "./useDashboardServices";

/** Selecting, adding, deleting, copying and grouping elements, and the keyboard shortcuts for them. */
export function useCanvasSelection(
  deps: Pick<
    ReturnType<typeof useDashboardSocket>,
    | "addElement"
    | "elements"
    | "emitMediaControl"
    | "redo"
    | "removeElement"
    | "undo"
    | "updateElement"
  > &
    Pick<ReturnType<typeof useDashboardServices>, "toast">,
) {
  const {
    addElement,
    elements,
    emitMediaControl,
    redo,
    removeElement,
    undo,
    updateElement,
    toast,
  } = deps;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedElement =
    selectedIds.size === 1 ? elements.find((element) => selectedIds.has(element.id)) : undefined;
  const copiedElementsRef = useRef<CanvasElement[]>([]);
  const mediaUploadRef = useRef<((file: File) => Promise<void>) | null>(null);
  const handleSelect = useCallback(
    (id: string | null, multi = false) => {
      if (!id) {
        setSelectedIds(new Set());
        return;
      }

      const clickedEl = elements.find((e) => e.id === id);
      if (clickedEl?.groupId && !multi) {
        const groupMembers = elements
          .filter((e) => e.groupId === clickedEl.groupId)
          .map((e) => e.id);
        setSelectedIds(new Set(groupMembers));
        return;
      }

      setSelectedIds((prev) => {
        if (multi) {
          const n = new Set(prev);
          n.has(id) ? n.delete(id) : n.add(id);
          return n;
        }
        return new Set([id]);
      });
    },
    [elements],
  );
  const handleSelectMany = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);
  const handleDelete = useCallback(
    (id: string) => {
      removeElement(id);
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
    [removeElement],
  );
  const handleAdd = useCallback(
    (el: CanvasElement) => {
      addElement({ ...el, x: SPAWN_X, y: SPAWN_Y });
    },
    [addElement],
  );
  const pasteElementCopies = useCallback(
    (source: CanvasElement[]) => {
      if (!source.length) return;
      const groupIds = new Map<string, string>();
      const topZ = elements.reduce(
        (highest, element) => Math.max(highest, element.zIndex),
        Date.now(),
      );
      const copies = source.map((element, index) => {
        let groupId = element.groupId;
        if (groupId) {
          if (!groupIds.has(groupId)) groupIds.set(groupId, randomUUID());
          groupId = groupIds.get(groupId)!;
        }
        return {
          ...element,
          id: randomUUID(),
          x: element.x + 32,
          y: element.y + 32,
          zIndex: topZ + index + 1,
          groupId,
          dvdEnabled: false,
        } satisfies CanvasElement;
      });
      copies.forEach(addElement);
      copiedElementsRef.current = copies.map((element) => ({ ...element }));
      setSelectedIds(new Set(copies.map((element) => element.id)));
      toast.success(`Pasted ${copies.length} element${copies.length === 1 ? "" : "s"}`);
    },
    [addElement, elements, toast],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isEditingTarget(event.target)) return;

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
    };
    const onCopy = (event: ClipboardEvent) => {
      if (isEditingTarget(event.target)) return;
      const selected = elements.filter((element) => selectedIds.has(element.id));
      if (!selected.length || !event.clipboardData) return;
      copiedElementsRef.current = selected.map((element) => ({ ...element }));
      event.clipboardData.setData(
        OVERLAY_CLIPBOARD_TYPE,
        JSON.stringify(copiedElementsRef.current),
      );
      event.preventDefault();
      toast.success(`Copied ${selected.length} element${selected.length === 1 ? "" : "s"}`);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isEditingTarget(event.target) || !event.clipboardData) return;

      const internal = event.clipboardData.getData(OVERLAY_CLIPBOARD_TYPE);
      if (internal) {
        try {
          const parsed = JSON.parse(internal) as unknown;
          const source = Array.isArray(parsed) ? parsed.filter(validClipboardElement) : [];
          if (source.length) {
            event.preventDefault();
            pasteElementCopies(source);
            return;
          }
        } catch {
          toast.error("The copied overlay elements could not be read");
          return;
        }
      }

      const mediaItem = Array.from(event.clipboardData.items).find(
        (item) => item.kind === "file" && /^(image|video|audio)\//.test(item.type),
      );
      const file = mediaItem?.getAsFile();
      if (file) {
        event.preventDefault();
        if (!mediaUploadRef.current) {
          toast.error("The media uploader is not ready yet");
          return;
        }
        void mediaUploadRef.current(file);
        return;
      }

      const text = event.clipboardData.getData("text/plain");
      if (!text.trim()) return;
      event.preventDefault();
      const safeText = text.slice(0, 9_500);
      const estimatedLines = safeText
        .split("\n")
        .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 22)), 0);
      const element: CanvasElement = {
        id: randomUUID(),
        type: "text",
        src: encodeTextSrc({
          ...DEFAULT_TEXT_CONFIG,
          text: safeText,
          color: "#ffffff",
          fontSize: 48,
          fontFamily: "Inter",
        }),
        x: SPAWN_X,
        y: SPAWN_Y,
        width: 520,
        height: Math.min(700, Math.max(80, estimatedLines * 58)),
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        zIndex: Date.now(),
      };
      addElement(element);
      setSelectedIds(new Set([element.id]));
      toast.success(
        safeText.length < text.length
          ? "Text pasted and shortened to the layer limit"
          : "Clipboard text added to the canvas",
      );
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, [addElement, elements, pasteElementCopies, selectedIds, toast, undo, redo]);
  const handleGroup = useCallback(() => {
    const groupId = randomUUID();
    const groupCount = new Set(
      elements.flatMap((element) => (element.groupId ? [element.groupId] : [])),
    ).size;
    const groupName = `Group ${groupCount + 1}`;
    selectedIds.forEach((id) => updateElement(id, { groupId, groupName }));
  }, [elements, selectedIds, updateElement]);
  const handleUngroup = useCallback(() => {
    // Send null — server and clients both treat null groupId as "clear group"
    selectedIds.forEach((id) => updateElement(id, { groupId: null }));
  }, [selectedIds, updateElement]);
  const handleMediaControl = useCallback(
    (id: string, action: MediaControlPayload["action"], currentTime: number) => {
      emitMediaControl({ id, action, currentTime });
      // Persist playback position so refreshing users resume at the right spot
      const timeUpdate: Partial<import("../../types").CanvasElement> = {
        mediaCurrentTime: currentTime,
      };
      if (action === "play") timeUpdate.mediaPaused = false;
      else if (action === "pause") timeUpdate.mediaPaused = true;
      updateElement(id, timeUpdate);
    },
    [emitMediaControl, updateElement],
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedElement,
    copiedElementsRef,
    mediaUploadRef,
    handleSelect,
    handleSelectMany,
    handleDelete,
    handleAdd,
    pasteElementCopies,
    handleGroup,
    handleUngroup,
    handleMediaControl,
  };
}
