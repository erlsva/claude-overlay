import assert from "node:assert/strict";
import test from "node:test";
import { pageCount, pageWindow, parsePage } from "../src/support/pagination.ts";

test("the number of pages rounds up, and an empty list is one page", () => {
  assert.equal(pageCount(0, 10), 1);
  assert.equal(pageCount(1, 10), 1);
  assert.equal(pageCount(10, 10), 1);
  assert.equal(pageCount(11, 10), 2);
  assert.equal(pageCount(267, 10), 27);
});

test("a page from the address bar is a whole number of at least 1", () => {
  assert.equal(parsePage("3"), 3);
  for (const bad of [null, "", "0", "-2", "1.5", "abc", "NaN", "Infinity"])
    assert.equal(parsePage(bad), 1, String(bad));
});

test("a short list shows every page", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("a long list keeps the ends, the current page and its neighbours", () => {
  assert.deepEqual(pageWindow(1, 27), [1, 2, 3, 4, "…", 27]);
  assert.deepEqual(pageWindow(3, 27), [1, 2, 3, 4, "…", 27]);
  assert.deepEqual(pageWindow(4, 27), [1, 2, 3, 4, 5, "…", 27]);
  assert.deepEqual(pageWindow(5, 27), [1, "…", 4, 5, 6, "…", 27]);
  assert.deepEqual(pageWindow(14, 27), [1, "…", 13, 14, 15, "…", 27]);
  assert.deepEqual(pageWindow(24, 27), [1, "…", 23, 24, 25, 26, 27]);
  assert.deepEqual(pageWindow(27, 27), [1, "…", 24, 25, 26, 27]);
  assert.deepEqual(pageWindow(4, 8), [1, 2, 3, 4, 5, "…", 8]);
});

test("the current page is always in the window, and pages only go up", () => {
  for (const total of [8, 9, 12, 27, 100])
    for (let current = 1; current <= total; current++) {
      const numbers = pageWindow(current, total).filter((item) => typeof item === "number");
      assert.ok(numbers.includes(current), `${current} of ${total}`);
      assert.equal(numbers[0], 1);
      assert.equal(numbers.at(-1), total);
      assert.deepEqual(
        numbers,
        [...numbers].sort((a, b) => a - b),
      );
      assert.equal(new Set(numbers).size, numbers.length);
    }
});
