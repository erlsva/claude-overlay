import { useState, useCallback } from "react";
import { type TextConfig } from "../../canvas/config";
import { encodeTextSrc, decodeTextSrc } from "../../components/TextDialog";
import type { useDashboardSocket } from "./useDashboardSocket";
import type { useDashboardServices } from "./useDashboardServices";

/** Editing the text of a text layer in a dialog. */
export function useTextEditing(
  deps: Pick<ReturnType<typeof useDashboardSocket>, "elements" | "updateElement"> &
    Pick<ReturnType<typeof useDashboardServices>, "toast">,
) {
  const { elements, updateElement, toast } = deps;
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const handleEditText = useCallback((id: string) => {
    setEditingTextId(id);
  }, []);
  const handleTextUpdate = useCallback(
    (config: TextConfig) => {
      if (!editingTextId) return;
      updateElement(editingTextId, { src: encodeTextSrc(config) });
      setEditingTextId(null);
      toast.success("Text layer updated");
    },
    [editingTextId, toast, updateElement],
  );
  const editingTextEl = editingTextId ? elements.find((e) => e.id === editingTextId) : null;
  const editingTextConfig = editingTextEl ? decodeTextSrc(editingTextEl.src) : undefined;

  return {
    editingTextId,
    setEditingTextId,
    handleEditText,
    handleTextUpdate,
    editingTextEl,
    editingTextConfig,
  };
}
