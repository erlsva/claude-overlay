import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { OverlayTrigger, TriggerEventType } from "../types.js";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-dispatch-"));
const { io } = await import("../runtime.js");
const { canvasStore } = await import("../state/canvasStore.js");
const { runMatchingTriggers } = await import("./dispatch.js");

/** Every trigger here refreshes the overlay, so "it ran" is one observable emit. */
let refreshes = 0;
(io as any).emit = (event: string) => {
  if (event === "overlay:refresh") refreshes++;
};
(io as any).to = () => ({ emit: () => undefined });

let counter = 0;
const trigger = (event: TriggerEventType, extra: Partial<OverlayTrigger> = {}): OverlayTrigger =>
  ({
    id: `t-${++counter}`,
    name: `Trigger ${counter}`,
    enabled: true,
    event,
    cooldownSeconds: 0,
    action: "refresh-overlay",
    ...extra,
  }) as OverlayTrigger;

/** Runs an event against exactly these triggers and says how many of them ran. */
function ran(triggers: OverlayTrigger[], type: TriggerEventType, event: Record<string, unknown>) {
  canvasStore.triggers = triggers;
  canvasStore.activity = [];
  refreshes = 0;
  runMatchingTriggers(type, event);
  return refreshes;
}

test("only enabled triggers for the same event run", () => {
  assert.equal(ran([trigger("follow")], "follow", {}), 1);
  assert.equal(ran([trigger("follow", { enabled: false })], "follow", {}), 0);
  assert.equal(ran([trigger("raid")], "follow", {}), 0);
});

test("minimums compare against bits, raiders, gifts and months", () => {
  assert.equal(ran([trigger("bits", { minimum: 50 })], "bits", { bits: 49 }), 0);
  assert.equal(ran([trigger("bits", { minimum: 50 })], "bits", { bits: 50 }), 1);
  assert.equal(ran([trigger("raid", { minimum: 10 })], "raid", { viewers: 25 }), 1);
  assert.equal(ran([trigger("raid", { minimum: 30 })], "raid", { viewers: 25 }), 0);
  assert.equal(ran([trigger("gift-subscribe", { minimum: 5 })], "gift-subscribe", { total: 5 }), 1);
  assert.equal(
    ran([trigger("subscribe", { minimum: 6 })], "subscribe", { cumulative_months: 12 }),
    1,
  );
  assert.equal(ran([trigger("subscribe", { minimum: 6 })], "subscribe", { duration_months: 1 }), 0);
  assert.equal(
    ran([trigger("subscribe", { minimum: 2 })], "subscribe", {}),
    0,
    "no months counts as 1",
  );
  assert.equal(
    ran([trigger("follow", { minimum: 5 })], "follow", { bits: 999 }),
    0,
    "follows have no amount",
  );
});

test("a trigger limited to a channel ignores other channels", () => {
  const limited = () => trigger("follow", { channel: "wixels" });
  assert.equal(ran([limited()], "follow", { channel: "vicksy" }), 0);
  assert.equal(ran([limited()], "follow", { broadcaster_user_login: "Wixels" }), 1);
});

test("chat commands match the first word and respect the required role", () => {
  const command = (extra: Partial<OverlayTrigger> = {}) =>
    trigger("chat-command", { match: "!hello", ...extra });
  assert.equal(ran([command()], "chat-command", { message: { text: "!HELLO world" } }), 1);
  assert.equal(ran([command()], "chat-command", { message: { text: "hello" } }), 0);
  assert.equal(ran([command()], "chat-command", { message: { text: "  !hello  " } }), 1);
  const modOnly = () => command({ permission: "moderator" });
  assert.equal(ran([modOnly()], "chat-command", { message: { text: "!hello" } }), 0);
  assert.equal(
    ran([modOnly()], "chat-command", { message: { text: "!hello" }, chatter_role: "vip" }),
    0,
  );
  assert.equal(
    ran([modOnly()], "chat-command", { message: { text: "!hello" }, chatter_role: "moderator" }),
    1,
  );
  assert.equal(
    ran([modOnly()], "chat-command", { message: { text: "!hello" }, chatter_role: "streamer" }),
    1,
  );
});

test("a channel point trigger with a reward name only runs for that reward", () => {
  const forReward = () => trigger("channel-points", { match: "Hydrate" });
  assert.equal(ran([forReward()], "channel-points", { reward: { title: "hydrate" } }), 1);
  assert.equal(ran([forReward()], "channel-points", { reward: { title: "Stretch" } }), 0);
  assert.equal(
    ran([trigger("channel-points")], "channel-points", { reward: { title: "Anything" } }),
    1,
  );
});

test("a trigger's cooldown holds until it passes", () => {
  const cooling = trigger("follow", { cooldownSeconds: 60 });
  assert.equal(ran([cooling], "follow", {}), 1);
  assert.equal(ran([cooling], "follow", {}), 0);
  assert.equal(
    ran([trigger("follow", { cooldownSeconds: 60 })], "follow", {}),
    1,
    "another trigger is unaffected",
  );
});

test("every matching trigger runs, and the activity feed records it", () => {
  assert.equal(ran([trigger("follow"), trigger("follow"), trigger("raid")], "follow", {}), 2);
  assert.equal(canvasStore.activity.length, 2);
  assert.match(canvasStore.activity[0].action, /^ran trigger “Trigger \d+”$/);
  assert.equal(canvasStore.activity[0].user, "Twitch");
});

test("a step that fails is reported in the activity feed without stopping anything", async () => {
  const failing = trigger("follow", {
    action: "send-chat",
    chatMessage: "hi",
    targetId: undefined,
  });
  assert.equal(ran([failing, trigger("follow")], "follow", {}), 1, "the other trigger still ran");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(canvasStore.activity.some((item) => /failed:/.test(item.action)));
});
