import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// No DATABASE_URL and not production, so this runs against the local JSON fallback.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-remote-tokens-"));

const { checkRemoteToken, createRemoteToken, listRemoteTokens, revokeRemoteToken } =
  await import("./remoteTokens.js");

test("a created token can control TTS, and the full token is never seen again", async () => {
  const created = await createRemoteToken("Office Stream Deck", "vicksy");
  assert.match(created.token, /^vkremote\.[\w-]+\.[\w-]+$/);
  assert.equal(created.name, "Office Stream Deck");
  assert.equal(created.createdBy, "vicksy");
  assert.equal(created.lastUsedAt, undefined);

  const list = await listRemoteTokens();
  const listed = list.find((token) => token.id === created.id);
  assert.ok(listed, "the token appears in the list");
  assert.equal(
    (listed as unknown as Record<string, unknown>).token,
    undefined,
    "the token itself is not listed",
  );
  assert.equal(
    (listed as unknown as Record<string, unknown>).secretHash,
    undefined,
    "nor its hash",
  );

  const holder = await checkRemoteToken(created.token);
  assert.equal(holder?.id, created.id);
  assert.equal(holder?.name, "Office Stream Deck");
});

test("using a token records when it was last used", async () => {
  const created = await createRemoteToken("Booth", "vicksy");
  assert.equal((await listRemoteTokens()).find((t) => t.id === created.id)?.lastUsedAt, undefined);
  await checkRemoteToken(created.token);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const after = (await listRemoteTokens()).find((t) => t.id === created.id);
  assert.ok(after?.lastUsedAt, "recorded after a successful check");
});

test("a wrong secret, a wrong id, or a malformed token is refused", async () => {
  const created = await createRemoteToken("Guest booth", "vicksy");
  const [label, id] = created.token.split(".");
  assert.equal(await checkRemoteToken(`${label}.${id}.not-the-secret`), undefined);
  assert.equal(
    await checkRemoteToken(`${label}.not-an-id.${created.token.split(".")[2]}`),
    undefined,
  );
  assert.equal(await checkRemoteToken("garbage"), undefined);
  assert.equal(await checkRemoteToken(""), undefined);
  assert.equal(await checkRemoteToken(`wrong-label.${id}.secret`), undefined);
});

test("revoking a token stops it working at once, and again is a no-op", async () => {
  const created = await createRemoteToken("Retiring", "vicksy");
  assert.equal(await revokeRemoteToken(created.id), true);
  assert.equal(await checkRemoteToken(created.token), undefined);
  assert.equal(await revokeRemoteToken(created.id), false, "already gone");
  assert.equal(
    (await listRemoteTokens()).some((t) => t.id === created.id),
    false,
  );
});

test("two tokens for the same name are independent", async () => {
  const a = await createRemoteToken("Shared name", "vicksy");
  const b = await createRemoteToken("Shared name", "vicksy");
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.token, b.token);
  assert.equal((await checkRemoteToken(a.token))?.id, a.id);
  assert.equal(await revokeRemoteToken(a.id), true);
  assert.equal(await checkRemoteToken(a.token), undefined);
  assert.equal((await checkRemoteToken(b.token))?.id, b.id, "the other token is unaffected");
});
