/** CLAUDE.md "Engine v2": no v2 package imports the old rule/object/annotation/calibration libraries. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LIB = join(import.meta.dirname, "..", "..");
const FORBIDDEN = ["game-types", "game-utilities", "game-core", "object-views", "grid-lab", "player-client", "ai-player", "game-runtime"];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|mts|js|mjs|json)$/.test(name)) out.push(p);
  }
  return out;
}

test("v2 packages do not import the old engine's libraries", () => {
  const pkgs = readdirSync(LIB).filter(n => n.startsWith("v2-"));
  assert.ok(pkgs.includes("v2-core"));
  const bad: string[] = [];
  for (const pkg of pkgs) {
    for (const f of files(join(LIB, pkg))) {
      const text = readFileSync(f, "utf8");
      for (const old of FORBIDDEN) {
        // Code imports only (import … from, import(), require, export … from, package.json dependencies). Reading a
        // data file (the pinned Python bundle under game-runtime/dist) is not an import.
        const spec = `["'](?:@workspace/${old}|(?:\\.\\./)+${old})(?:["'/])`;
        const imports = new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)${spec}`);
        const dependency = new RegExp(`"@workspace/${old}"\\s*:`);
        if (imports.test(text) || (f.endsWith("package.json") && dependency.test(text))) bad.push(`${f}: ${old}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
