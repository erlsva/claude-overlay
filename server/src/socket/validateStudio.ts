/** Validation for what the Studio saves: labels, sound links, and automation triggers. */

export function validLabel(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/** A soundboard clip must be an upload from this server or a MyInstants clip; nothing else. */
export function validSoundUrl(value: unknown): value is string {
  if (!validUrl(value)) return false;
  const url = new URL(value);
  const serverOrigin = new URL(process.env.PUBLIC_SERVER_URL ?? "http://localhost:3001").origin;
  const uploadedHere = url.origin === serverOrigin && url.pathname.startsWith("/files/");
  const myInstants =
    url.protocol === "https:" &&
    url.hostname === "www.myinstants.com" &&
    /^\/media\/sounds\/[a-zA-Z0-9_.%-]+\.mp3$/i.test(url.pathname);
  return uploadedHere || myInstants;
}

const TRIGGER_ACTIONS = [
  "show-element",
  "show-temporary",
  "fly-across",
  "hide-element",
  "toggle-element",
  "play-media",
  "play-sound",
  "enable-dvd",
  "refresh-overlay",
  "send-chat",
  "tts",
];
const TRIGGER_PLACEMENTS = [
  "current",
  "random",
  "fit",
  "fill",
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
const FLY_DIRECTIONS = [
  "left-to-right-top",
  "left-to-right-center",
  "left-to-right-bottom",
  "right-to-left-top",
  "right-to-left-center",
  "right-to-left-bottom",
  "top-to-bottom-left",
  "top-to-bottom-center",
  "top-to-bottom-right",
  "bottom-to-top-left",
  "bottom-to-top-center",
  "bottom-to-top-right",
];
const TRIGGER_EVENTS = [
  "chat-command",
  "follow",
  "subscribe",
  "gift-subscribe",
  "raid",
  "bits",
  "channel-points",
  "ban",
  "timeout",
  "prediction",
];
const STEP_KEYS = new Set([
  "action",
  "targetId",
  "placement",
  "durationSeconds",
  "flyDirection",
  "timing",
  "delaySeconds",
  "chatMessage",
  "ttsErrorMessage",
]);
const TRIGGER_KEYS = new Set([
  "id",
  "name",
  "enabled",
  "event",
  "match",
  "minimum",
  "channel",
  "action",
  "targetId",
  "cooldownSeconds",
  "placement",
  "durationSeconds",
  "flyDirection",
  "timing",
  "delaySeconds",
  "chatMessage",
  "ttsErrorMessage",
  "permission",
  "steps",
]);

const inRange = (value: unknown, min: number, max: number) =>
  Number.isFinite(value) && (value as number) >= min && (value as number) <= max;

function validChatMessage(value: any): boolean {
  const limit = value?.action === "tts" ? 6000 : 500;
  const present =
    typeof value?.chatMessage === "string" &&
    value.chatMessage.trim().length > 0 &&
    value.chatMessage.length <= limit;
  return ["send-chat", "tts"].includes(value.action)
    ? present
    : value.chatMessage === undefined || present;
}

/** One action of a trigger: what to do, to which layer, when, and for how long. */
export function validTriggerStep(value: any): boolean {
  return (
    value &&
    typeof value === "object" &&
    Object.keys(value).every((key) => STEP_KEYS.has(key)) &&
    TRIGGER_ACTIONS.includes(value.action) &&
    (value.placement === undefined || TRIGGER_PLACEMENTS.includes(value.placement)) &&
    (value.durationSeconds === undefined || inRange(value.durationSeconds, 1, 3600)) &&
    (value.flyDirection === undefined || FLY_DIRECTIONS.includes(value.flyDirection)) &&
    (value.timing === undefined ||
      ["immediate", "delay", "after-previous"].includes(value.timing)) &&
    (value.delaySeconds === undefined || inRange(value.delaySeconds, 0, 3600)) &&
    validChatMessage(value) &&
    (["refresh-overlay", "send-chat", "tts"].includes(value.action)
      ? value.targetId === undefined
      : validLabel(value.targetId, 100)) &&
    (value.ttsErrorMessage === undefined ||
      (value.action === "tts" &&
        typeof value.ttsErrorMessage === "string" &&
        value.ttsErrorMessage.trim().length > 0 &&
        value.ttsErrorMessage.length <= 500))
  );
}

/** A saved automation: what starts it, its limits, and one action or a chain of two to ten. */
export function validTrigger(value: any): boolean {
  return (
    value &&
    typeof value === "object" &&
    Object.keys(value).every((key) => TRIGGER_KEYS.has(key)) &&
    validLabel(value.id, 100) &&
    validLabel(value.name, 60) &&
    TRIGGER_EVENTS.includes(value.event) &&
    validTriggerStep({
      action: value.action,
      targetId: value.targetId,
      placement: value.placement,
      durationSeconds: value.durationSeconds,
      flyDirection: value.flyDirection,
      timing: value.timing,
      delaySeconds: value.delaySeconds,
      chatMessage: value.chatMessage,
      ttsErrorMessage: value.ttsErrorMessage,
    }) &&
    typeof value.enabled === "boolean" &&
    inRange(value.cooldownSeconds, 0, 86400) &&
    (value.match === undefined || (typeof value.match === "string" && value.match.length <= 100)) &&
    (value.minimum === undefined || inRange(value.minimum, 0, 10_000_000)) &&
    (value.channel === undefined ||
      (typeof value.channel === "string" && /^[a-z0-9_]{3,25}$/.test(value.channel))) &&
    (value.permission === undefined ||
      ["everyone", "vip", "moderator", "streamer"].includes(value.permission)) &&
    (value.steps === undefined ||
      (Array.isArray(value.steps) &&
        value.steps.length >= 2 &&
        value.steps.length <= 10 &&
        value.steps.every(validTriggerStep)))
  );
}
