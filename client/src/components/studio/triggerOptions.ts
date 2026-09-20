/** The choices an automation offers: actions, event names and how a step's timing reads. */

import { type OverlayTrigger, type TriggerStep } from "../../types";

export const triggerActionOptions: Array<{
  value: OverlayTrigger["action"];
  label: string;
}> = [
  { value: "show-element", label: "Show element" },
  { value: "show-temporary", label: "Show image temporarily" },
  { value: "fly-across", label: "Fly across stream" },
  { value: "hide-element", label: "Hide element" },
  { value: "toggle-element", label: "Toggle element visibility" },
  { value: "play-media", label: "Play video/audio layer, then hide" },
  { value: "play-sound", label: "Play Soundboard clip" },
  { value: "enable-dvd", label: "Start DVD movement" },
  { value: "refresh-overlay", label: "Refresh overlay" },
  { value: "send-chat", label: "Send Twitch chat message" },
  { value: "tts", label: "Generate / replay TTS" },
];

export const TRIGGER_EVENT_LABELS: Partial<Record<OverlayTrigger["event"], string>> = {
  follow: "New follow",
  subscribe: "Subscription",
  "gift-subscribe": "Gift subs",
  raid: "Raid",
  bits: "Bits",
  "channel-points": "Channel points",
  ban: "Ban",
  timeout: "Timeout",
  prediction: "New prediction",
};

export const triggerActionLabel = (action: OverlayTrigger["action"]) =>
  triggerActionOptions.find((option) => option.value === action)?.label ?? action;

export const triggerTimingLabel = (step: TriggerStep, index: number) => {
  if (index === 0 || !step.timing || step.timing === "immediate") return "same time";
  if (step.timing === "after-previous") return "after previous";
  return `after ${step.delaySeconds ?? 1}s`;
};
