import assert from "node:assert/strict";
import test from "node:test";
import { renderEventMessage } from "./message.js";

test("variables are filled from the event, and unknown ones are left alone", () => {
  const event = { user_name: "Ada", bits: 250, viewers: 12, reward: { title: "Hydrate" } };
  assert.equal(
    renderEventMessage("Thanks {user} for {bits} bits!", event),
    "Thanks Ada for 250 bits!",
  );
  assert.equal(
    renderEventMessage("{viewers} raiders, reward {reward}", event),
    "12 raiders, reward Hydrate",
  );
  assert.equal(renderEventMessage("{nonsense} stays", event), "{nonsense} stays");
});

test("variable names are not case sensitive", () => {
  assert.equal(renderEventMessage("{USER} {Bits}", { user_name: "Ada", bits: 5 }), "Ada 5");
});

test("the user falls back through the fields Twitch uses, then to Viewer", () => {
  assert.equal(renderEventMessage("{user}", { chatter_user_name: "Chatter" }), "Chatter");
  assert.equal(renderEventMessage("{user}", { from_broadcaster_user_name: "Raider" }), "Raider");
  assert.equal(renderEventMessage("{user}", {}), "Viewer");
});

test("months, channel and moderator use their fallbacks", () => {
  assert.equal(renderEventMessage("{months}", { cumulative_months: 12 }), "12");
  assert.equal(renderEventMessage("{months}", { duration_months: 3 }), "3");
  assert.equal(renderEventMessage("{months}", {}), "0");
  assert.equal(renderEventMessage("{channel}", { broadcaster_user_login: "vicksy" }), "vicksy");
  assert.equal(renderEventMessage("{moderator}", {}), "Moderator");
});

test("bans and timeouts describe their duration", () => {
  assert.equal(renderEventMessage("{duration} {banType}", { is_permanent: true }), "permanent ban");
  const started = "2026-01-01T00:00:00Z";
  const tenMinutes = { banned_at: started, ends_at: "2026-01-01T00:10:00Z" };
  assert.equal(renderEventMessage("{duration} {banType}", tenMinutes), "10 minutes timeout");
  const oneMinute = { banned_at: started, ends_at: "2026-01-01T00:00:20Z" };
  assert.equal(renderEventMessage("{duration}", oneMinute), "1 minute");
});

test("the message variable drops the command word, and the title is the prediction's", () => {
  assert.equal(
    renderEventMessage("{message}", { message: { text: "!tts hello there" } }),
    "hello there",
  );
  assert.equal(renderEventMessage("{message}", { user_input: "typed in" }), "typed in");
  assert.equal(renderEventMessage("New: {title}", { title: "Will we win?" }), "New: Will we win?");
});

test("the result is cut to the length limit", () => {
  assert.equal(renderEventMessage("x".repeat(600), {}).length, 500);
  assert.equal(renderEventMessage("x".repeat(600), {}, 50).length, 50);
});
