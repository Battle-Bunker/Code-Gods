/**
 * Two-line value functions (docs/engine-v2/two-line-systems.md §5): plain draws, the tilted mixture weighted back to π.
 * Checked against an independent estimate: the share of untilted draws whose answer has no fractions (|D| = 1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, rng, scoreFromWire } from "@workspace/v2-core";
import { noFractions, pairLaw, pairQ, pairType } from "@workspace/v2-pair";
import { pairValueFunction } from "../src/value-pair.ts";
import { valueLookup } from "../src/value.ts";

test("No Fractions' top (the number you divide by is ±1) is valued at its survival under π", () => {
  const vf = pairValueFunction(noFractions, { k: 1 }, pairQ, { tieBreaker: null, config: { drawsPerTilt: 40_000 } });
  const look = valueLookup(vf)(scoreFromWire(["0"]));
  const law = pairLaw(pairQ), r = rng("independent");
  let n = 0, top = 0;
  while (n < 6000) {
    const d = law.draw(r, 1);
    if (!d.state) continue;
    n++;
    const s = evaluateObject(pairType, noFractions, { k: 1 }, d.state, pairQ, null).score;
    if (s && s[0]!.n === 0n) top++;
  }
  const want = -Math.log2(top / n), sd = Math.sqrt((1 - top / n) / top) / Math.LN2;   // ± one σ in bits
  assert.ok(Math.abs(look.bits - want) < 3 * sd + (look.hi - look.lo), `${look.bits} [${look.lo}, ${look.hi}] against ${want} ± ${sd}`);
  assert.equal(vf.objectType, "pair");
});
