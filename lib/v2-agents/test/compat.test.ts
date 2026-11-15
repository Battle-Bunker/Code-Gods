/** The generated pair verdicts (scripts/gen-compat.ts) cover every pair of dealt rules of the beginner presets and of the arithmetic playtest pool. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridPresets, grid4 } from "@workspace/v2-grid";
import { lineQ, presets } from "@workspace/v2-linear";
import { pairVerdict, PAIR_VERDICTS } from "../src/pure.ts";

test("every pair of dealt rules of different families has a verdict, in either order", () => {
  const sets = [
    ...([["lines-beginner", lineQ.id]] as const).map(([id, variant]) => {
      const p = presets.find(x => x.id === id)!;
      assert.equal(p.variant, variant, `${id} plays on ${variant}`);
      return { variant, rules: p.rules.flatMap(r => (r.tieBreakers as string[]).map(tb => [r.family, `${r.family}/${tb}`] as const)) };
    }),
    ...["grids-beginner", "grids-arithmetic"].map(id => ({ variant: grid4.id, rules: gridPresets.find(p => p.id === id)!.rules.flatMap(r => r.tieBreakers.map(tb => [r.family, `${r.family}/${tb}`] as const)) })),
  ];
  for (const { variant, rules } of sets) for (const [fa, a] of rules) for (const [fb, b] of rules) {
    if (fa === fb) continue;
    assert.ok(pairVerdict(variant, a, b), `${variant}: no verdict for ${a} · ${b} (run pnpm --filter @workspace/v2-agents gen-compat)`);
    assert.equal(pairVerdict(variant, a, b), pairVerdict(variant, b, a));
  }
  assert.ok(PAIR_VERDICTS.every(r => r.a < r.b && r.shareA <= 1 && r.shareB <= 1));
});
