/**
 * No straight hill (the coordinator's mechanical check, 15 Nov; lib/v2-core principles.ts straightHill): for every dealt
 * line rule of every line preset, every shortcut its variant offers (a stretch or zoom by a factor and by its inverse, a
 * turn about the origin) applied 30 times from typical lines (draws of the variant's law) must gain less per fee as the
 * chain goes on, and at most 30 bits in all. Breaks caught: Smooth Intercept scored by the y-intercept's size, where a
 * stretch by a dealt prime added the same 0.9 bits at every size (playtest round 21: 3⁸ by "multiply by −3", 59-bit
 * seats). A family that fails is not dealt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, evaluateSite, isInvalid, rng, variantMutators, type ObjectType } from "@workspace/v2-core";
import { straightHill } from "@workspace/v2-core";
import { lineLaw, type LineState } from "@workspace/v2-linear";
import { findVariant, valueLookup } from "@workspace/v2-valuation";
import { dealablePool, familyOf } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";
import { valueRecord } from "../../convex/v2/values.ts";

const FACTORS = ["2", "3", "5", "7", "11", "13", "17", "1/2", "1/3", "1/5"];
const SHORTCUTS: Record<string, readonly Record<string, string>[]> = {
  "mach.stretch": FACTORS.map(f => ({ f })),
  "basis.zoom": FACTORS.map(f => ({ f })),
  "rot.turn": [{ centre: "origin", turn: "left" }, { centre: "origin", turn: "3/4" }, { centre: "origin", turn: "-4/3" }],
};
const STARTS = 4, CHAIN = 30;

test("no dealt line rule is a straight hill along any shortcut its preset offers", () => {
  const failures: string[] = [];
  let chains = 0;
  for (const preset of PRESETS) {
    const { type, variant } = findVariant(preset.variant);
    if (type.id !== "line") continue;
    const offered = variantMutators(type, variant).filter(m => m.id in SHORTCUTS);
    const law = lineLaw(variant), r = rng("straight-hill", preset.id);
    const starts: LineState[] = [];
    while (starts.length < STARTS) { const d = law.draw(r, 1); if (d.state) starts.push(d.state as LineState); }
    for (const rule of dealablePool(preset)) {
      const rec = valueRecord(rule.ruleKey);
      if (!rec) continue;
      const look = valueLookup(rec), fam = familyOf(rule.family);
      const bitsOf = (s: LineState) => {
        const e = evaluateSite(type as ObjectType<LineState>, fam as never, rule.params, s, variant, 0, rule.tieBreaker);
        return e.score === null ? 0 : look(e.score).bits;
      };
      for (const m of offered) for (const args of SHORTCUTS[m.id]!) for (const [k, start] of starts.entries()) {
        const bits = [bitsOf(start)], fees: number[] = [];
        let s = start;
        for (let i = 0; i < CHAIN; i++) {
          const a = applyCall(type as ObjectType<LineState>, variant, s, { mutator: m.id, site: 0, args });
          if (isInvalid(a)) break;
          s = a.result;
          fees.push(a.price.total);
          bits.push(bitsOf(s));
        }
        chains++;
        const why = straightHill(bits, fees);
        if (why) failures.push(`${preset.id} ${rule.family}${JSON.stringify(rule.params)}/${rule.tieBreaker} by ${m.id} ${JSON.stringify(args)} from start ${k}: ${why}`);
      }
    }
  }
  assert.ok(chains > 100, `${chains} chains`);
  assert.deepEqual([...new Set(failures)], []);
});
