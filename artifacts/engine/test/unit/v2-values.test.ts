/** Value functions on the server (owner decision 23, spec §7.0): bundled, and one for every rule a one-line preset deals. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { q, scoreFromWire as scoreFrom } from "@workspace/v2-core";
import { valueLookup } from "@workspace/v2-valuation";
import { UNIQUENESS } from "../../convex/v2/valuesIndex.gen.ts";
import { valueRecord } from "../../convex/v2/values.ts";
import { dealablePool } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";

test("the bundled value functions are up to date with lib/v2-valuation/values", () => {
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "..", "scripts", "gen-v2-values.mjs"), "--check"]);
});

test("every rule a table-valued preset (grids) deals has a value function, and its lookups rise with the score", () => {
  const preset = presetOf("grids-beginner");
  for (const r of dealablePool(preset)) {
    const rec = valueRecord(r.ruleKey);
    assert.ok(rec, `${r.family}+${r.tieBreaker}: no value function`);
    const look = valueLookup(rec);
    assert.equal(look(null).bits, 0);
    const best = rec.knots[rec.knots.length - 1]!;
    assert.ok(best.bits > 4, `${r.family}+${r.tieBreaker}: the best knot is worth ${best.bits} bits`);
    assert.ok(look([q(-1000), null]).bits <= best.bits);
  }
});

test("the value files are current; the curves are one string, a rule's slice parsed on its first lookup (16 Nov: a 511-key object literal cost ~0.4 s per cold module)", async () => {
  const { readFileSync } = await import("node:fs");
  const { generate } = await import("../../scripts/gen-v2-values.mjs");
  const out = generate();
  assert.equal(readFileSync(new URL("../../convex/v2/valuesIndex.gen.ts", import.meta.url), "utf8"), out.index, "stale: run node scripts/gen-v2-values.mjs");
  assert.equal(readFileSync(new URL("../../convex/v2/valuesCurves.gen.ts", import.meta.url), "utf8"), out.curves, "stale: run node scripts/gen-v2-values.mjs");
  const { VALUE_INDEX } = await import("../../convex/v2/valuesIndex.gen.ts");
  const { CURVES } = await import("../../convex/v2/valuesCurves.gen.ts");
  assert.equal(typeof CURVES, "string");
  assert.ok(VALUE_INDEX.length > 0 && VALUE_INDEX.every(r => !("knots" in r)));
  const r = valueRecord(VALUE_INDEX[0]!.ruleKey)!;
  assert.ok(r.knots.length > 0 && valueRecord(r.ruleKey) === r, "parsed once, then cached");
});
