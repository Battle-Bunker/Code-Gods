/** CLAUDE.md "Engine v2": no v2 package imports the old rule/object/annotation/calibration libraries. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

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

/**
 * The v2 server (integration plan §4.1): `artifacts/engine/convex/v2/**` imports none of the old libraries and none of
 * the v1 engine's Convex modules. It may use the shared infrastructure (convex/_generated, convex/auth: users,
 * sessions, credentials) and anything under convex/v2.
 */
const CONVEX = join(LIB, "..", "artifacts", "engine", "convex");
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** Imports of one v2 server file that break the boundary. */
export function v2ServerViolations(file: string, text: string): string[] {
  const bad: string[] = [];
  const allowed = [join(CONVEX, "v2"), join(CONVEX, "_generated"), join(CONVEX, "auth")].map(d => d + sep);
  for (const m of text.matchAll(SPEC)) {
    const spec = m[1]!;
    if (FORBIDDEN.some(old => spec === `@workspace/${old}` || spec.startsWith(`@workspace/${old}/`))) bad.push(spec);
    else if (spec.startsWith(".") && !allowed.some(d => resolve(dirname(file), spec).startsWith(d))) bad.push(spec);
  }
  return bad;
}

test("the v2 server imports only v2 code and the shared infrastructure", () => {
  const root = join(CONVEX, "v2");
  const bad = files(root).flatMap(f => v2ServerViolations(f, readFileSync(f, "utf8")).map(s => `${f}: ${s}`));
  assert.deepEqual(bad, []);
});

test("the v2 server boundary catches escapes", () => {
  const f = join(CONVEX, "v2", "ops", "x.ts");
  const text = [
    'import { a } from "../../auth/access";', 'import { b } from "../tables";', 'import type { c } from "../../_generated/server";',
    'import { d } from "../../engine/loop";', 'import { e } from "../../auth/../game/tables";', 'import "../../../test/x";',
    'const f = require("../../lib/rooms");', 'import { g } from "@work' + 'space/game-core";' /* split: this file is scanned too */, 'import { h } from "@workspace/v2-core";',
  ].join("\n");
  assert.deepEqual(v2ServerViolations(f, text), ["../../engine/loop", "../../auth/../game/tables", "../../../test/x", "../../lib/rooms", "@workspace/game-core"]);
});
