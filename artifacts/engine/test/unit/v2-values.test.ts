/** Value functions on the server (owner decision 23, spec §7.0): bundled, and one for every rule a one-line preset deals. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { q, scoreFromWire as scoreFrom } from "@workspace/v2-core";
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

test("values in a game carry the uniqueness correction at the game's object count (decision 24)", async () => {
  const { worthOf, valueFnIn } = await import("../../convex/v2/values.ts");
  const { valueObjects } = await import("../../convex/v2/world.ts");
  const { withUniqueness } = await import("@workspace/v2-valuation");
  const preset = presetOf("lines-beginner"), objects = valueObjects(preset);
  assert.equal(objects, Math.round(preset.startingObjects + preset.economy.birthsPerSecond * preset.worldSeconds / 2));
  const rec = VALUE_RECORDS.find(x => x.ruleKey === dealablePool(preset)[0]!.ruleKey)!;
  const rare = rec.knots.at(-1)!, scope = { variant: rec.variant, objects };
  const one = worthOf(rec.ruleKey, scoreFrom(rare.u), { variant: rec.variant, objects: 1 }).bits;
  const many = worthOf(rec.ruleKey, scoreFrom(rare.u), scope).bits;
  assert.equal(one, rare.bits, "one object: no correction");
  assert.ok(many < one - 0.3, `a rare score loses bits in a game of ${objects} lines: ${one} → ${many}`);
  // What the agents and the app are sent applies the same correction (host.ts gameLookup, sdk/rule.ts valueOf).
  const f = valueFnIn(rec.ruleKey, scope)!;
  assert.equal(withUniqueness(valueLookup(f), f.uniqueness!, f.uniqueness!.objects)(scoreFrom(rare.u)).bits, many);
});
