import { Router } from "express";
import { logActivity } from "../realtime/activity.js";
import { requireAuth } from "../middleware/auth.js";
import { canvasStore } from "../state/canvasStore.js";
import { getTwitchChatChannel } from "../twitch/eventsub.js";
import { executeTriggerSteps } from "./execute.js";
import type { TriggerEventPayload } from "./message.js";

export const triggerRouter = Router();

/**
 * Runs a saved command or event action immediately with a simulated event. It ignores the
 * cooldown and permission rules so it can be tested at any time.
 */
triggerRouter.post("/:id/test", requireAuth, (req, res) => {
  const trigger = canvasStore.triggers.find((item) => item.id === req.params.id);
  if (!trigger) {
    res.status(404).json({ error: "That command no longer exists." });
    return;
  }
  const tester = req.authUser?.displayName || req.authUser?.login || "Tester";
  const channel = trigger.channel || getTwitchChatChannel();
  const amount = trigger.minimum;
  const event: TriggerEventPayload = {
    channel,
    broadcaster_user_login: channel,
    user_name: tester,
    chatter_user_name: tester,
    chatter_user_login: tester.toLowerCase(),
    message: { text: `${trigger.match ?? ""} test message`.trim() },
    reward: { title: trigger.match || "Test reward" },
    bits: amount ?? 100,
    viewers: amount ?? 10,
    total: amount ?? 5,
    cumulative_months: amount ?? 3,
  };
  logActivity(tester, `tested “${trigger.name}”`);
  void executeTriggerSteps(trigger.steps?.length ? trigger.steps : [trigger], event, (error) => {
    const message = (error instanceof Error ? error.message : "Unknown error")
      .replace(/\s+/g, " ")
      .slice(0, 180);
    logActivity(tester, `test of “${trigger.name}” failed: ${message}`);
  });
  res.status(202).json({ started: true });
});
