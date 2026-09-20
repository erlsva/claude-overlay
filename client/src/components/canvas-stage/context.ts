import type { useStageRefs } from "./useStageRefs";
import type { useTwitchEmbed } from "./useTwitchEmbed";
import type { useStageViewport } from "./useStageViewport";
import type { useDvdMotion } from "./useDvdMotion";
import type { useElementSync } from "./useElementSync";

/** Everything the parts of the CanvasStage share: what each hook returns. */
export type CanvasStageContext = ReturnType<typeof useStageRefs> &
  ReturnType<typeof useTwitchEmbed> &
  ReturnType<typeof useStageViewport> &
  ReturnType<typeof useDvdMotion> &
  ReturnType<typeof useElementSync>;
