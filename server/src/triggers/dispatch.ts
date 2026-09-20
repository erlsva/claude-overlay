/** Deciding which saved automations run for a Twitch event, and running them. */

import { logActivity } from "../realtime/activity.js";
import { canvasStore } from "../state/canvasStore.js";
import type { ChatPermission, OverlayTrigger, TriggerEventType } from "../types.js";
import { executeTriggerSteps } from "./execute.js";
import type { TriggerEventPayload } from "./message.js";

/** When each trigger may next run, so a cooldown holds across events. */
const triggerCooldowns = new Map<string, number>();

const ROLE_RANK: Record<ChatPermission, number> = {
  everyone: 0,
  vip: 1,
  moderator: 2,
  streamer: 3,
};

/** The number a trigger's minimum is compared to: Bits, raiders, gifts or months. */
function eventAmount(eventType: TriggerEventType, event: TriggerEventPayload): number {
  switch (eventType) {
    case "bits":
      return Number(event.bits ?? 0);
    case "raid":
      return Number(event.viewers ?? 0);
    case "gift-subscribe":
      return Number(event.total ?? 0);
    case "subscribe":
      return Number(event.cumulative_months ?? event.duration_months ?? 1);
    default:
      return 0;
  }
}

/** Whether a saved trigger applies to this event: its type, command, reward, minimum and channel. */
function triggerApplies(
  trigger: OverlayTrigger,
  eventType: TriggerEventType,
  event: TriggerEventPayload,
): boolean {
  if (!trigger.enabled || trigger.event !== eventType) return false;
  if (eventType === "chat-command") {
    const command = String(event.message?.text ?? "")
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase();
    if (trigger.match?.toLowerCase() !== command) return false;
    const required = trigger.permission ?? "everyone";
    const chatter: ChatPermission = event.chatter_role ?? "everyone";
    if (ROLE_RANK[chatter] < ROLE_RANK[required]) return false;
  }
  if (eventType === "channel-points" && trigger.match) {
    const reward = String(event.reward?.title ?? "").toLowerCase();
    if (trigger.match.toLowerCase() !== reward) return false;
  }
  if (trigger.minimum !== undefined && eventAmount(eventType, event) < trigger.minimum)
    return false;
  if (trigger.channel) {
    const channel = String(event.channel ?? event.broadcaster_user_login ?? "").toLowerCase();
    if (trigger.channel !== channel) return false;
  }
  return true;
}

const errorSummary = (error: unknown) =>
  (error instanceof Error ? error.message : "Unknown error").replace(/\s+/g, " ").slice(0, 180);

/** Runs every enabled trigger that matches the event and is not cooling down. */
export function runMatchingTriggers(eventType: TriggerEventType, event: TriggerEventPayload) {
  const now = Date.now();
  for (const trigger of canvasStore.triggers) {
    if ((triggerCooldowns.get(trigger.id) ?? 0) > now) continue;
    if (!triggerApplies(trigger, eventType, event)) continue;
    triggerCooldowns.set(trigger.id, now + trigger.cooldownSeconds * 1000);
    logActivity("Twitch", `ran trigger “${trigger.name}”`);
    const steps = trigger.steps?.length ? trigger.steps : [trigger];
    void executeTriggerSteps(steps, event, (error) =>
      logActivity("Twitch", `trigger “${trigger.name}” failed: ${errorSummary(error)}`),
    );
  }
}
