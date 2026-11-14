/** Value functions on the server (owner decision 23, spec §7.0): bundled, and one for every rule a one-line preset deals. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { q } from "@workspace/v2-core";
import { valueLookup } from "@workspace/v2-valuation";
import { VALUE_RECORDS } from "../../convex/v2/values.gen.ts";
import { dealablePool } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";

test("the bundled value functions are up to date with lib/v2-valuation/values", () => {
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "..", "scripts", "gen-v2-values.mjs"), "--check"]);
});

test("every rule the beginner preset deals has a value function, and its lookups rise with the score", () => {
  const preset = presetOf("lines-beginner");
  for (const r of dealablePool(preset)) {
    const rec = VALUE_RECORDS.find(x => x.ruleKey === r.ruleKey);
    assert.ok(rec, `${r.family}+${r.tieBreaker}: no value function`);
    const look = valueLookup(rec);
    assert.equal(look(null).bits, 0);
    const best = rec.knots[rec.knots.length - 1]!;
    assert.ok(best.bits > 4, `${r.family}+${r.tieBreaker}: the best knot is worth ${best.bits} bits`);
    assert.ok(look([q(-1000), null]).bits <= best.bits);
  }
});
