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

test("every rule the beginner preset deals has a value function, and its lookups rise with the score", () => {
  const preset = presetOf("lines-beginner");
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

test("values in a game carry the uniqueness correction at the game's object count (decision 24)", async () => {
  const { worthOf, valueFnIn } = await import("../../convex/v2/values.ts");
  const { valueObjects } = await import("../../convex/v2/world.ts");
  const { uniquenessShift, withUniqueness } = await import("@workspace/v2-valuation");
  // The beginner game's N is 4 (3 objects plus half of its 2.5 births over 600 s: decisions 31, 34), whose shift (about
  // 0.04 bits) is too small to tell a correction from none: the check runs at v1's 10 objects and 0.05 births/s (N 18).
  const preset = presetOf("lines-beginner"), settings = { ...preset, startingObjects: 10, economy: { ...preset.economy, birthsPerSecond: 0.05 } };
  assert.equal(valueObjects(preset), 4, "the beginner game's N (decisions 31, 34)");
  const objects = valueObjects(settings);
  assert.equal(objects, Math.round(settings.startingObjects + settings.economy.birthsPerSecond * settings.worldSeconds / 2));
  const rec = valueRecord(dealablePool(preset)[0]!.ruleKey)!;
  const rare = rec.knots.at(-1)!, scope = { variant: rec.variant, objects };
  const one = worthOf(rec.ruleKey, scoreFrom(rare.u), { variant: rec.variant, objects: 1 }).bits;
  const many = worthOf(rec.ruleKey, scoreFrom(rare.u), scope).bits;
  assert.equal(one, rare.bits, "one object: no correction");
  const table = UNIQUENESS.find(t => t.variant === rec.variant)!, shift = uniquenessShift(table, objects);
  // Small on line-q since code C3 (a spread-out law, Σπ² ≈ 5e-4) and with a handful of objects, but there.
  assert.ok(shift > 0, `${rec.variant} at ${objects} objects: shift ${shift}`);
  assert.ok(Math.abs(one - many - shift) < 1e-9, `a rare score loses the full shift in a game of ${objects} lines: ${one} → ${many}, shift ${shift}`);
  // What the agents and the app are sent applies the same correction (host.ts gameLookup, sdk/rule.ts valueOf).
  const f = valueFnIn(rec.ruleKey, scope)!;
  assert.equal(withUniqueness(valueLookup(f), f.uniqueness!, f.uniqueness!.objects)(scoreFrom(rare.u)).bits, many);
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
