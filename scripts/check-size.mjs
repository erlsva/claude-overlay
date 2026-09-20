#!/usr/bin/env node
/**
 * Fails when a source file grows past the size limit, so files stay easy to read.
 *   node ../scripts/check-size.mjs [dir] [--max=450]
 * Tests and generated copies of shared code are skipped.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const maxArg = args.find((arg) => arg.startsWith("--max="));
const max = maxArg ? Number(maxArg.slice("--max=".length)) : 450;
const root = join(process.cwd(), args.find((arg) => !arg.startsWith("--")) ?? "src");

const SKIP_DIRS = new Set(["node_modules", "dist", "__harness", "assets"]);
// Copies written by scripts/sync-shared.mjs; edit shared/ instead.
const GENERATED = new Set(["types.ts", "types/index.ts", "config/canvas.ts", "canvas/geometry.ts"]);

const tooBig = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(name) || /\.test\.ts$/.test(name)) continue;
    const rel = relative(root, path).replaceAll("\\", "/");
    if (GENERATED.has(rel)) continue;
    const lines = readFileSync(path, "utf8").split("\n").length;
    if (lines > max) tooBig.push({ rel, lines });
  }
}
walk(root);

if (tooBig.length) {
  console.error(`Files over ${max} lines (split them instead of raising the limit):`);
  for (const { rel, lines } of tooBig.sort((a, b) => b.lines - a.lines)) {
    console.error(`  ${String(lines).padStart(5)}  ${rel}`);
  }
  process.exit(1);
}
console.log(`All files in ${relative(process.cwd(), root) || "."} are within ${max} lines.`);
