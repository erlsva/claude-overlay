import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { signToken } from "./jwt.js";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-whitelist-"));
process.env.SESSION_SECRET = "whitelist-test-secret";
process.env.OWNER_TWITCH_USERNAME = "boss";

const { addToWhitelist, setAdmin, getWhitelistEntry } = await import("../db/index.js");
const { createWhitelistRouter } = await import("./whitelist.js");

const sessionFor = (login: string) =>
  signToken(
    { id: login, login, displayName: login, avatar: "", color: "#fff" },
    process.env.SESSION_SECRET!,
  );

async function withServer(
  run: (call: (login: string, target: string) => Promise<number>) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  const io = { to: () => ({ emit: () => {} }), sockets: { sockets: new Map() } };
  app.use("/whitelist", createWhitelistRouter(io as never, new Map()));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    await run(async (login, target) => {
      const response = await fetch(`http://127.0.0.1:${port}/whitelist/${target}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionFor(login)}` },
      });
      return response.status;
    });
  } finally {
    server.close();
  }
}

test("only the owner can remove a super moderator from the whitelist", async () => {
  await addToWhitelist("mod-one", "boss");
  await addToWhitelist("super-one", "boss");
  await addToWhitelist("super-two", "boss");
  await setAdmin("super-one", true);
  await setAdmin("super-two", true);

  await withServer(async (remove) => {
    assert.equal(await remove("super-one", "super-two"), 403);
    assert.ok(getWhitelistEntry("super-two"), "the super moderator is still whitelisted");

    // An admin can still remove an ordinary moderator, and the owner can remove anyone.
    assert.equal(await remove("super-one", "mod-one"), 200);
    assert.equal(getWhitelistEntry("mod-one"), undefined);
    assert.equal(await remove("boss", "super-two"), 200);
    assert.equal(getWhitelistEntry("super-two"), undefined);
  });
});
