import type { StudioShell } from "./types";
import type { useEmotePreview } from "./useEmotePreview";
import type { useSoundForm } from "./useSoundForm";
import type { useTriggerBuilder } from "./useTriggerBuilder";

/** Everything a Studio tab can use: the shell's state plus the trigger, sound and emote hooks. */
export type StudioContext = StudioShell &
  ReturnType<typeof useTriggerBuilder> &
  ReturnType<typeof useSoundForm> &
  ReturnType<typeof useEmotePreview> & {
    createScene: () => void;
    createPreset: () => void;
  };
