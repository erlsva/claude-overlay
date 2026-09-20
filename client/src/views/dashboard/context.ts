import type { useDashboardServices } from "./useDashboardServices";
import type { useDashboardSocket } from "./useDashboardSocket";
import type { useAppearance } from "./useAppearance";
import type { useDashboardPanels } from "./useDashboardPanels";
import type { useCanvasSelection } from "./useCanvasSelection";
import type { useDrawingTools } from "./useDrawingTools";
import type { useTextEditing } from "./useTextEditing";

/** Everything the parts of the Dashboard share: what each hook returns. */
export type DashboardContext = ReturnType<typeof useDashboardServices> &
  ReturnType<typeof useDashboardSocket> &
  ReturnType<typeof useAppearance> &
  ReturnType<typeof useDashboardPanels> &
  ReturnType<typeof useCanvasSelection> &
  ReturnType<typeof useDrawingTools> &
  ReturnType<typeof useTextEditing>;
