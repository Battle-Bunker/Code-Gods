/**
 * What a query module costs to load. Every Convex module is bundled with what it imports, and a cold isolate evaluates
 * it before the function runs: the curves of every value function (about 9 MB) as a 511-key object literal took about
 * 0.4 s to evaluate, so under a game's load plain queries (rooms:get, games:standings, play:*) timed out at 1 s and a
 * page stopped hearing that its game had ended (16 Nov: "RUNNING 0:00", the breadcrumb stuck on "Room").
 *
 * What would break: a module that never values a score importing the curves again; the curves stored as an object
 * literal again (evaluated at load) instead of one string parsed on first use.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const V2 = path.join(import.meta.dirname, "..", "..", "convex", "v2");
const CURVES = path.join(V2, "values-curves.gen.ts");

/** Every local module a module imports, transitively (relative imports; packages are not followed). */
function closure(entry: string): Set<string> {
  const seen = new Set<string>(), queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, "utf8").matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
      const base = path.resolve(path.dirname(f), m[1]!);
      const hit = [base, `${base}.ts`, `${base}.tsx`].find(c => /\.tsx?$/.test(c) && existsSync(c));
      if (hit) queue.push(hit);
    }
  }
  return seen;
}

test("modules that never value a score do not load the value curves", () => {
  // The room page (rooms), the game header and standings (games), drift and the deal: none of them values a score.
  for (const m of ["rooms.ts", "games.ts", "drift.ts", "deal.ts", "room-deal.ts", "lock-settings.ts", "read-price.ts", "values-head.ts"]) {
    assert.ok(!closure(path.join(V2, m)).has(CURVES), `convex/v2/${m} imports values-curves.gen.ts (use values-head.ts)`);
  }
});

test("the value curves are one string, parsed on first use, not an object literal evaluated at load", () => {
  const text = readFileSync(CURVES, "utf8");
  const decl = text.split("\n").filter(l => l.startsWith("export const"));
  assert.equal(decl.length, 1, "one export");
  assert.match(decl[0]!, /^export const CURVES_JSON: string = "/);
});
