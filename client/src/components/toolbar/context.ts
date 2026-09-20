import type { useToolbarServices } from "./useToolbarServices";
import type { useMediaUpload } from "./useMediaUpload";
import type { useSelectionTools } from "./useSelectionTools";
import type { useToolbarDialogs } from "./useToolbarDialogs";
import type { useToolbarButtons } from "./useToolbarButtons";

/** Everything the parts of the Toolbar share: what each hook returns. */
export type ToolbarContext = ReturnType<typeof useToolbarServices> &
  ReturnType<typeof useMediaUpload> &
  ReturnType<typeof useSelectionTools> &
  ReturnType<typeof useToolbarDialogs> &
  ReturnType<typeof useToolbarButtons>;
