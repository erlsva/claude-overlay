import assert from "node:assert/strict";
import test from "node:test";
import { signToken } from "./jwt.js";

process.env.SESSION_SECRET = "authorization-test-secret";
process.env.OWNER_TWITCH_USERNAME = "vicksy";

const { getUserFromToken, roleFor, rolesFor } = await import("./routes.js");

test("derives owner privileges instead of trusting token role claims", () => {
  const token = signToken(
    {
      id: "1",
      login: "vicksy",
      displayName: "Vicksy",
      avatar: "",
      color: "#fff",
      isOwner: false,
      isAdmin: false,
    },
    process.env.SESSION_SECRET!,
  );
  const user = getUserFromToken(token);
  assert.equal(user?.isOwner, true);
  assert.equal(user?.isAdmin, true);
});

test("rejects a valid token when its user is not whitelisted", () => {
  const token = signToken(
    {
      id: "2",
      login: "definitely-not-whitelisted",
      displayName: "Removed User",
      avatar: "",
      color: "#fff",
      isOwner: false,
      isAdmin: true,
    },
    process.env.SESSION_SECRET!,
  );
  assert.equal(getUserFromToken(token), null);
});

test("a streamer is also a moderator, and can be a super moderator as well", () => {
  assert.deepEqual(rolesFor("vicksy", false, false), ["streamer", "moderator"]);
  assert.deepEqual(rolesFor("vicksy", false, true), ["streamer", "super-moderator"]);
  assert.deepEqual(rolesFor("helper", false, false), ["moderator"]);
  assert.deepEqual(rolesFor("helper", false, true), ["super-moderator"]);
});

test("labels roles: owner, streamer channel, super moderator, moderator", () => {
  assert.equal(roleFor("vicksy", true, true), "owner");
  // Development EVENT_CHANNELS is always eple7, so it counts as a streamer channel.
  assert.equal(roleFor("eple7", false, false), "streamer");
  // The real streamers are labelled even where EVENT_CHANNELS only lists eple7 (development).
  assert.equal(roleFor("vicksy", false, false), "streamer");
  assert.equal(roleFor("wixels", false, true), "streamer");
  assert.equal(roleFor("helper", false, true), "super-moderator");
  assert.equal(roleFor("helper", false, false), "moderator");
});
