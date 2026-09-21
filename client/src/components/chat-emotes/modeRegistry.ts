import type { ChatEmoteMotion } from "../../types";
import { drift, orbit, rain, rise, snow } from "./ambientModes";
import type { ModeImpl } from "./modeTypes";
import { conga, pile, pinball, slide } from "./playfulModes";

/** The newer movement modes. The classic ones (parade, corners, bounces, fireworks) are in stepMotion. */
export const MODES: Partial<Record<ChatEmoteMotion, ModeImpl>> = {
  drift,
  rain,
  snow,
  rise,
  orbit,
  slide,
  pinball,
  pile,
  conga,
};
