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

test("a pair's size tail never outruns the law: High Start at an intercept of 52,488 is worth less than the state's φ", async () => {
  // Found by the tension matrix (two-line-systems.md §8.3): stretching y = 9x + 8 by 3 eight times, beside x = −12, gave
  // High Start (high and rising) 8,238 bits through a linear tail. A pair's numbers cost log₂ of their size.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { highStart } = await import("@workspace/v2-pair");
  const dir = new URL("../values/pair-q/high-start/", import.meta.url);
  const s = pairType.decode("-59049,1,-52488;1,0,12");
  for (const file of readdirSync(dir).filter(x => x.endsWith("-high-and-rising.json"))) {
    const vf = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const bits = valueLookup(vf)(evaluateObject(pairType, highStart, vf.params, s, pairQ, "high-and-rising").score).bits;
    assert.ok(bits <= pairType.readLength(s, pairQ), `${file}: ${bits} bits against φ ${pairType.readLength(s, pairQ)}`);
  }
});
