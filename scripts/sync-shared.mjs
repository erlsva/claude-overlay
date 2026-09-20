#!/usr/bin/env node
/**
 * The client and the server run in separate packages, so code they must agree on lives
 * once in /shared and is copied into both. Edit the file in /shared, then run
 *   node scripts/sync-shared.mjs
 * `--check` fails when a copy differs from its source (the test commands run it).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["shared/types.ts", "server/src/types.ts"],
  ["shared/types.ts", "client/src/types/index.ts"],
  ["shared/canvas.ts", "server/src/config/canvas.ts"],
  ["shared/canvas.ts", "client/src/canvas/geometry.ts"],
];
const header = (source) =>
  `// Generated from ${source}. Edit that file, then run: node scripts/sync-shared.mjs\n\n`;
const check = process.argv.includes("--check");
let stale = 0;

for (const [source, target] of copies) {
  const wanted = header(source) + readFileSync(join(root, source), "utf8").replace(/\r\n/g, "\n");
  const path = join(root, target);
  const current = existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : null;
  if (current === wanted) continue;
  if (check) {
    console.error(`${target} is out of date with ${source}`);
    stale++;
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, wanted);
    console.log(`wrote ${target}`);
  }
}
if (stale) {
  console.error("Run: node scripts/sync-shared.mjs");
  process.exit(1);
}
