import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { signToken } from "../auth/jwt.js";

// Outside production, the configured Events channel is always exactly "eple7" (channels.ts), on
// purpose, so this never needs its own EVENT_CHANNELS setup.
process.env.SESSION_SECRET = "event-routes-test-secret";
process.env.OWNER_TWITCH_USERNAME = "boss";

const { createEventRoutes } = await import("./eventRoutes.js");

const ownerSession = signToken(
  { id: "boss", login: "boss", displayName: "boss", avatar: "", color: "#fff" },
  process.env.SESSION_SECRET,
);
const viewerSession = signToken(
  { id: "someone", login: "someone", displayName: "someone", avatar: "", color: "#fff" },
  process.env.SESSION_SECRET,
);

async function withServer(
  emitEvent: (type: string, event: any, options?: { ignoreCooldown?: boolean }) => number,
  run: (call: (route: string, body: unknown, auth?: string) => Promise<any>) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use(createEventRoutes(emitEvent as any));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const call = async (route: string, body: unknown, auth?: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  try {
    await run(call);
  } finally {
    server.close();
  }
}

test("a test event needs a signed-in owner (or that channel's own login), and a real channel", async () => {
  await withServer(
    () => 0,
    async (call) => {
      assert.equal(
        (await call("/events/eple7/test", { type: "follow" })).status,
        403,
        "not signed in",
      );
      assert.equal(
        (await call("/events/eple7/test", { type: "follow" }, viewerSession)).status,
        403,
        "signed in, but neither the owner nor eple7's own login",
      );
      assert.equal(
        (await call("/events/not-a-real-channel/test", { type: "follow" }, ownerSession)).status,
        403,
        "not a configured Events channel",
      );
    },
  );
});

test("only the simulatable event types are accepted", async () => {
  await withServer(
    () => 1,
    async (call) => {
      assert.equal(
        (await call("/events/eple7/test", { type: "chat-command" }, ownerSession)).status,
        400,
      );
      assert.equal(
        (await call("/events/eple7/test", { type: "not-a-real-event" }, ownerSession)).status,
        400,
      );
      assert.equal(
        (await call("/events/eple7/test", { type: "follow" }, ownerSession)).status,
        200,
      );
    },
  );
});

test("the response says how many automations actually ran, and asks for the cooldown to be ignored", async () => {
  const calls: Array<{ type: string; options?: { ignoreCooldown?: boolean } }> = [];
  await withServer(
    (type, _event, options) => {
      calls.push({ type, options });
      return type === "bits" ? 2 : 0;
    },
    async (call) => {
      const zero = await call("/events/eple7/test", { type: "follow" }, ownerSession);
      assert.equal(zero.body.ran, 0);

      const some = await call("/events/eple7/test", { type: "bits" }, ownerSession);
      assert.equal(some.body.ran, 2);

      assert.deepEqual(
        calls.map((c) => c.options),
        [{ ignoreCooldown: true }, { ignoreCooldown: true }],
        "a test run never waits out a trigger's real cooldown",
      );
    },
  );
});
