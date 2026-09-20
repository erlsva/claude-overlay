import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { CanvasElement } from "../types.js";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-presentation-"));
const { io } = await import("../runtime.js");
const { canvasStore } = await import("../state/canvasStore.js");
const { presentElement, restorePresentation } = await import("./presentation.js");
const { flyElement } = await import("./fly.js");

const updates: Array<{ id: string; changes: Partial<CanvasElement> }> = [];
(io as any).emit = (event: string, payload: any) => {
  if (event === "element:updated") updates.push(payload);
};

// The stream is 1920x1080 and sits at (1040, 960) inside the workspace.
let counter = 0;
const element = (overrides: Partial<CanvasElement> = {}): CanvasElement => {
  const value: CanvasElement = {
    id: `el-${++counter}`,
    type: "image",
    src: "https://example.test/a.png",
    x: 100,
    y: 100,
    width: 400,
    height: 200,
    rotation: 15,
    scaleX: 1,
    scaleY: 1,
    visible: false,
    zIndex: 1,
    ...overrides,
  };
  canvasStore.canvasState.elements.push(value);
  return value;
};

test("presenting an element makes it visible where it already is", () => {
  const el = element();
  presentElement(el);
  assert.equal(el.visible, true);
  assert.equal(el.x, 100);
  assert.equal(el.rotation, 15, "the current placement leaves rotation alone");
});

test("fit scales the element to touch the stream edges and centres it", () => {
  const el = element();
  presentElement(el, "fit");
  assert.deepEqual([el.width, el.height, el.x, el.y, el.rotation], [1920, 960, 1040, 1020, 0]);
});

test("fill scales the element to cover the whole stream", () => {
  const el = element();
  presentElement(el, "fill");
  assert.deepEqual([el.width, el.height], [2160, 1080]);
  assert.equal(el.x, 1040 + (1920 - 2160) / 2);
  assert.equal(el.y, 960);
});

test("corners sit flush; edges keep a 40px margin; the middle is centred", () => {
  const at = (placement: any) => {
    const el = element();
    presentElement(el, placement);
    return [el.x, el.y];
  };
  assert.deepEqual(at("top-left"), [1040, 960]);
  assert.deepEqual(at("bottom-right"), [1040 + 1920 - 400, 960 + 1080 - 200]);
  assert.deepEqual(at("top-center"), [1040 + (1920 - 400) / 2, 960 + 40]);
  assert.deepEqual(at("center-left"), [1040 + 40, 960 + (1080 - 200) / 2]);
  assert.deepEqual(at("center"), [1040 + (1920 - 400) / 2, 960 + (1080 - 200) / 2]);
});

test("a random placement stays inside the stream and straightens the element", () => {
  for (let i = 0; i < 20; i++) {
    const el = element();
    presentElement(el, "random");
    assert.ok(el.x >= 1040 && el.x <= 1040 + 1920 - 400);
    assert.ok(el.y >= 960 && el.y <= 960 + 1080 - 200);
    assert.equal(el.rotation, 0);
  }
});

test("restoring puts the element back exactly as it was", () => {
  const el = element({ visible: false });
  presentElement(el, "fit");
  updates.length = 0;
  restorePresentation(el.id);
  assert.deepEqual(
    [el.visible, el.x, el.y, el.width, el.height, el.rotation],
    [false, 100, 100, 400, 200, 15],
  );
  assert.equal(updates.length, 1);
  restorePresentation(el.id);
  assert.equal(updates.length, 1, "restoring twice does nothing");
});

test("presenting twice remembers the original look, not the presented one", () => {
  const el = element();
  presentElement(el, "fit");
  presentElement(el, "top-left");
  restorePresentation(el.id);
  assert.deepEqual([el.width, el.height, el.x, el.y], [400, 200, 100, 100]);
});

test("a fly-across starts off-screen, moves across the stream and is put back afterwards", async () => {
  const el = element({ x: 10, y: 20 });
  updates.length = 0;
  flyElement(el, "left-to-right-bottom", 1);
  const start = updates[0].changes;
  assert.equal(start.flyFromX, 1040 - 400, "starts just off the left edge");
  assert.equal(start.flyToX, 1040 + 1920, "ends just off the right edge");
  assert.equal(start.flyFromY, 960 + 1080 - 200, "the bottom lane");
  assert.equal(start.flyDurationMs, 1000);
  assert.equal(el.visible, true);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual([el.visible, el.x, el.y], [false, 10, 20]);
});

test("a vertical fly-across uses the chosen column", () => {
  const el = element();
  updates.length = 0;
  flyElement(el, "top-to-bottom-right", 1);
  const start = updates[0].changes;
  assert.equal(start.flyFromX, 1040 + 1920 - 400);
  assert.equal(start.flyFromY, 960 - 200);
  assert.equal(start.flyToY, 960 + 1080);
});
