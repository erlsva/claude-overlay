import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";

process.env.SESSION_SECRET = "event-oauth-test-secret";
process.env.TWITCH_CLIENT_ID = "client";
process.env.TWITCH_CLIENT_SECRET = "secret";

const { EVENT_SCOPES, createState, parseState, needsEventAuthorization, eventsAuthUrlForLogin } =
  await import("./eventOAuth.js");
const { signToken } = await import("../auth/jwt.js");
const { PENDING_LOGIN_COOKIE, readCookie, takePendingLogin } =
  await import("../auth/pendingLogin.js");

test("a missing connection needs authorization", () => {
  assert.equal(needsEventAuthorization(null), true);
});

test("a connection with every permission does not", () => {
  assert.equal(needsEventAuthorization({ scopes: [...EVENT_SCOPES] }), false);
});

test("a connection made before a permission was added needs authorization again", () => {
  const older = EVENT_SCOPES.filter((scope) => scope !== "channel:read:predictions");
  assert.equal(needsEventAuthorization({ scopes: older }), true);
});

test("Events state round-trips for the channel it was made for and is tamper-proof", () => {
  const state = createState("eple7");
  assert.equal(parseState(state), "eple7");
  assert.equal(parseState(state.replace(/.$/, (c) => (c === "a" ? "b" : "a"))), null);
  assert.equal(parseState("nonsense"), null);
});

test("only a broadcaster channel is asked, and never without event storage", async () => {
  assert.equal(await eventsAuthUrlForLogin("some-moderator"), null);
  // eple7 is the development channel, but no database is configured in tests.
  assert.equal(await eventsAuthUrlForLogin("eple7"), null);
});

test("reads one cookie out of a header", () => {
  assert.equal(readCookie("a=1; pending_login=abc.def; b=2", "pending_login"), "abc.def");
  assert.equal(readCookie(undefined, "pending_login"), undefined);
});

function fakeResponse() {
  const cleared: string[] = [];
  return {
    cleared,
    res: { clearCookie: (name: string) => cleared.push(name) } as unknown as Response,
  };
}

test("the held session is handed back once, and only when it is valid", () => {
  const secret = process.env.SESSION_SECRET!;
  const token = signToken({ login: "eple7" }, secret);

  const good = fakeResponse();
  const request = { headers: { cookie: `${PENDING_LOGIN_COOKIE}=${token}` } } as Request;
  assert.equal(takePendingLogin(request, good.res, secret), token);
  assert.deepEqual(good.cleared, [PENDING_LOGIN_COOKIE]);

  const forged = fakeResponse();
  const forgedRequest = {
    headers: { cookie: `${PENDING_LOGIN_COOKIE}=${signToken({ login: "eple7" }, "other-secret")}` },
  } as Request;
  assert.equal(takePendingLogin(forgedRequest, forged.res, secret), null);
  assert.deepEqual(forged.cleared, [PENDING_LOGIN_COOKIE]);

  const none = fakeResponse();
  assert.equal(takePendingLogin({ headers: {} } as Request, none.res, secret), null);
  assert.deepEqual(none.cleared, []);
});
