/**
 * The summon price is language-fair (docs/energy-model.md §5.1): ten programs written in both languages, priced by the
 * runtime's own inspection (scripts/language-price.ts), cost about the same once TypeScript's structure bits are
 * weighted (game-core LANGUAGE_SPECS.structureWeight). What would break: a change to either price function, to the
 * prelude's pricing vocabulary or to the weight that lets the two languages drift apart again (TypeScript once cost 1.5
 * to 2.1 times Python, which put every strategy past plain greedy over a god's store in TypeScript only).
 *
 * Needs the built Python runtime (lib/game-runtime/dist/python-runtime.bin.gz: `pnpm --filter @workspace/engine dev`
 * builds it); skipped, saying so, where it has not been built.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { LANGUAGE_SPECS } from "@workspace/game-core";

const bundle = new URL("../../../../lib/game-runtime/dist/python-runtime.bin.gz", import.meta.url);

test("the same program costs about the same to summon in Python and in TypeScript", { skip: existsSync(bundle) ? false : "the Python runtime bundle is not built" }, async () => {
  const { pricePairs } = await import("../../scripts/language-price.ts");
  const rows = await pricePairs();
  assert.equal(rows.length, 10);
  const sum = (pick: (r: typeof rows[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);
  // The weight IS the pooled ratio of the two structure codes (Python 3,810 bits ÷ TypeScript 8,664 on 13 Nov 2026).
  const pooled = sum(r => r.structure.python) / sum(r => r.structure.typescript);
  assert.ok(Math.abs(pooled - LANGUAGE_SPECS.typescript.structureWeight) < 0.02, `pooled structure ratio ${pooled.toFixed(3)} against the weight ${LANGUAGE_SPECS.typescript.structureWeight}: re-derive the weight`);
  for (const r of rows) {
    const before = r.typescript / r.python, now = r.typescriptWeighted / r.python;
    assert.ok(before > 1.4, `${r.name}: unweighted TypeScript was ${before.toFixed(2)}× Python`);
    // Small programs: within a third either way. 13 Nov 2026: 0.67 (skip always) to 1.25 (the random policy).
    assert.ok(now > 0.62 && now < 1.3, `${r.name}: TypeScript ${r.typescriptWeighted.toFixed(1)} against Python ${r.python.toFixed(1)} (${now.toFixed(2)}×)`);
  }
  // The larger strategy programs: within 8%. 13 Nov 2026: 1.01 to 1.05.
  for (const r of rows.filter(r => r.python > 500)) {
    const now = r.typescriptWeighted / r.python;
    assert.ok(now > 0.95 && now < 1.08, `${r.name}: ${now.toFixed(3)}×`);
  }
  // And every one of them fits a god's store on the default setup (64 bits/s × 30 s) in either language.
  for (const r of rows) assert.ok(r.python <= 1920 && r.typescriptWeighted <= 1920, `${r.name} fits 1,920 bits`);
});
