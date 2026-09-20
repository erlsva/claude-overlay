import type { ChatEmoteSettings, DvdCelebrationSettings, LiveDrawStroke } from "../types.js";

const COUNTER_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;
const allStrings = (values: unknown[], pattern: RegExp) =>
  values.every((name) => typeof name === "string" && pattern.test(name));

export function validDvdSettings(settings: DvdCelebrationSettings): boolean {
  return (
    inRange(settings.volume, 0, 1) &&
    COUNTER_POSITIONS.includes(settings.counterPosition) &&
    (settings.soundUrl === null ||
      (typeof settings.soundUrl === "string" && settings.soundUrl.length <= 2048))
  );
}

export function validChatEmoteSettings(settings: ChatEmoteSettings): boolean {
  return (
    typeof settings.enabled === "boolean" &&
    typeof settings.showNames === "boolean" &&
    typeof settings.nameBackgroundEnabled === "boolean" &&
    typeof settings.nameBackgroundColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(settings.nameBackgroundColor) &&
    inRange(settings.nameFontSize, 9, 32) &&
    ["walls", "floor", "parade", "corners", "pop"].includes(settings.motion) &&
    ["left", "right"].includes(settings.direction) &&
    inRange(settings.gravity, 100, 2400) &&
    inRange(settings.size, 24, 100) &&
    inRange(settings.speed, 40, 600) &&
    inRange(settings.lifetimeSeconds, 2, 120) &&
    Number.isInteger(settings.maxVisible) &&
    settings.maxVisible >= 1 &&
    settings.maxVisible <= 100 &&
    Array.isArray(settings.blacklist) &&
    settings.blacklist.length <= 100 &&
    allStrings(settings.blacklist, /^[a-z0-9_]{1,25}$/i) &&
    Array.isArray(settings.additionalEmotes) &&
    settings.additionalEmotes.length <= 100 &&
    allStrings(settings.additionalEmotes, /^[a-z0-9_]{1,64}$/i) &&
    (settings.blockedEmotes === undefined ||
      (Array.isArray(settings.blockedEmotes) &&
        settings.blockedEmotes.length <= 100 &&
        allStrings(settings.blockedEmotes, /^\S{1,64}$/)))
  );
}

export function validLiveStroke(data: Omit<LiveDrawStroke, "userId">): boolean {
  return (
    Array.isArray(data.points) &&
    data.points.length <= 20_000 &&
    data.points.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    ) &&
    typeof data.color === "string" &&
    data.color.length <= 32 &&
    Number.isFinite(data.size) &&
    data.size >= 0 &&
    data.size <= 200 &&
    typeof data.eraser === "boolean" &&
    (data.tool === undefined ||
      ["pen", "eraser", "line", "arrow", "rectangle", "ellipse"].includes(data.tool)) &&
    (data.opacity === undefined ||
      (Number.isFinite(data.opacity) && data.opacity >= 0.05 && data.opacity <= 1))
  );
}
