import { useState } from "react";
import { type TextConfig, estimateTextElementSize, encodeTextSrc } from "../TextDialog";
import { randomUUID } from "../../utils";
import { STREAM_OFFSET_X, STREAM_W, STREAM_OFFSET_Y, STREAM_H } from "../../canvas/config";
import type { ToolbarProps } from "./types";
import type { useToolbarServices } from "./useToolbarServices";

/** The text dialog and the media library. */
export function useToolbarDialogs(
  props: ToolbarProps,
  deps: Pick<ReturnType<typeof useToolbarServices>, "toast">,
) {
  const { onAdd } = props;
  const { toast } = deps;
  const [showTextDialog, setShowTextDialog] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const handleTextConfirm = (config: TextConfig) => {
    const { width, height } = estimateTextElementSize(config);
    onAdd({
      id: randomUUID(),
      type: "text",
      src: encodeTextSrc(config),
      x: STREAM_OFFSET_X + (STREAM_W - width) / 2,
      y: STREAM_OFFSET_Y + (STREAM_H - height) / 2,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      zIndex: Date.now(),
    });
    setShowTextDialog(false);
    toast.success("Text element added to the canvas");
  };

  return { showTextDialog, setShowTextDialog, showLibrary, setShowLibrary, handleTextConfirm };
}
