import type { useTtsServices } from "./useTtsServices";
import type { useTtsVolume } from "./useTtsVolume";
import type { useTtsPreview } from "./useTtsPreview";
import type { useTtsData } from "./useTtsData";
import type { useTtsComposer } from "./useTtsComposer";

/** Everything the parts of the TtsPanel share: what each hook returns. */
export type TtsContext = ReturnType<typeof useTtsServices> &
  ReturnType<typeof useTtsVolume> &
  ReturnType<typeof useTtsPreview> &
  ReturnType<typeof useTtsData> &
  ReturnType<typeof useTtsComposer>;
