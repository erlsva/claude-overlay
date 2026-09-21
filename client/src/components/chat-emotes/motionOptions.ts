import type { ChatEmoteMotion } from "../../types";

interface MotionOption {
  value: ChatEmoteMotion;
  label: string;
  /** Shown as a toast when it is picked. */
  toast: string;
}

/** The Movement dropdown, in groups. */
export const MOTION_GROUPS: Array<{ label: string; options: MotionOption[] }> = [
  {
    label: "Classic",
    options: [
      { value: "parade", label: "Bottom parade", toast: "Using the bottom parade" },
      { value: "corners", label: "Corner route", toast: "Emotes will travel around the corners" },
      { value: "floor", label: "Floor bounce", toast: "Using floor bounce physics" },
      { value: "walls", label: "Wall bounce", toast: "Using wall-to-wall bounce" },
    ],
  },
  {
    label: "Pop in",
    options: [
      {
        value: "pop-walls",
        label: "Pop in & wall bounce",
        toast: "Emotes will fade in, then bounce wall to wall",
      },
      {
        value: "pop-floor",
        label: "Pop in & floor bounce",
        toast: "Emotes will fade in, then drop and bounce on the floor",
      },
    ],
  },
  {
    label: "Falling & floating",
    options: [
      { value: "rain", label: "Rain", toast: "Emotes will rain down" },
      { value: "snow", label: "Snowfall", toast: "Emotes will sway down like snow" },
      { value: "rise", label: "Rising balloons", toast: "Emotes will float up like balloons" },
      { value: "drift", label: "Drift & twinkle", toast: "Emotes will drift and twinkle" },
      { value: "orbit", label: "Orbit", toast: "Emotes will circle the screen" },
    ],
  },
  {
    label: "Playful",
    options: [
      {
        value: "fireworks",
        label: "Fireworks",
        toast: "Emotes will launch and burst like fireworks",
      },
      { value: "slide", label: "Bouncy slide-in", toast: "Emotes will bounce in from the edges" },
      { value: "pinball", label: "Pinball", toast: "Emotes will squash against the walls" },
      { value: "pile", label: "Pile up", toast: "Emotes will drop and pile up" },
      { value: "conga", label: "Conga line", toast: "Emotes will snake across the screen" },
    ],
  },
];

const ALL = MOTION_GROUPS.flatMap((group) => group.options);
export const motionToast = (motion: ChatEmoteMotion) =>
  ALL.find((option) => option.value === motion)?.toast ?? "Movement changed";

/** Modes that fall under gravity, so the Gravity slider applies. */
export const usesGravitySetting = (motion: ChatEmoteMotion) =>
  ["floor", "pop-floor", "fireworks", "pile"].includes(motion);

/** Modes that travel left or right, so the Direction choice applies. */
export const usesDirectionSetting = (motion: ChatEmoteMotion) =>
  ["parade", "corners", "conga"].includes(motion);
