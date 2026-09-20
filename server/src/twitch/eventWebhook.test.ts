import assert from "node:assert/strict";
import test from "node:test";

process.env.TWITCH_EVENTSUB_CALLBACK_URL = "https://example.test/twitch/events";
process.env.TWITCH_EVENTSUB_SECRET = "test-secret-0123456789";
process.env.TWITCH_CLIENT_ID = "client";
process.env.TWITCH_CLIENT_SECRET = "client-secret";

const auth = (scopes: string[]) => ({
  channel: "vicksy",
  twitchUserId: "42",
  displayName: "Vicksy",
  accessToken: "a",
  refreshToken: "r",
  expiresAt: Date.now() + 3_600_000,
  scopes,
});

async function register(scopes: string[]) {
  const { registerEventSubscriptions } = await import("./eventWebhook.js");
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("id.twitch.tv")) {
      return new Response(JSON.stringify({ access_token: "app", expires_in: 3600 }), {
        status: 200,
      });
    }
    requested.push(JSON.parse(String(init?.body)).type);
    return new Response("{}", { status: 202 });
  }) as typeof fetch;
  try {
    await registerEventSubscriptions(auth(scopes));
  } finally {
    globalThis.fetch = original;
  }
  return requested;
}

test("a connection with the prediction permission subscribes to new predictions", async () => {
  const requested = await register(["channel:read:predictions"]);
  assert.ok(requested.includes("channel.prediction.begin"));
  assert.ok(requested.includes("channel.follow"));
});

test("an older connection still registers everything except predictions", async () => {
  const requested = await register(["channel:moderate"]);
  assert.ok(!requested.includes("channel.prediction.begin"));
  assert.ok(requested.includes("channel.ban"), "later subscriptions are not blocked");
  assert.ok(requested.includes("channel.follow"));
});
