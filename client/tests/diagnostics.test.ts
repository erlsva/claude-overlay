import assert from "node:assert/strict";
import test from "node:test";
import { buildDiagnosticReport } from "../src/support/diagnostics.ts";

test("support reports include useful state and exclude credentials and content URLs", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/" } } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Test Browser" } });
  const report = buildDiagnosticReport({
    version: "abc12345",
    user: "Tester",
    channel: "vicksy",
    theme: "fox",
    dashboardConnected: true,
    overlayConnected: false,
    overlayCount: 0,
    chatConnected: true,
    elementCount: 2,
    soundCount: 1,
    commandCount: 3,
    notifications: [{ id: 1, kind: "error", message: "Upload failed", at: 1_700_000_000_000 }],
  }, new Date("2026-09-10T12:00:00.000Z"));
  assert.match(report, /App version: abc12345/);
  assert.match(report, /OBS overlay: offline/);
  assert.match(report, /Upload failed/);
  assert.doesNotMatch(report, /secret-value|https:\/\/.*\/files\//i);
});
