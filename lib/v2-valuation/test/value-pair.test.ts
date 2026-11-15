/**
 * Two-line value functions (docs/engine-v2/two-line-systems.md §5): plain draws, the tilted mixture weighted back to π.
 * Checked against an independent estimate: the share of untilted draws whose number to divide by is a power of k.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, rng, scoreFromWire } from "@workspace/v2-core";
import { noFractions, pairLaw, pairQ, pairType } from "@workspace/v2-pair";
import { pairValueFunction } from "../src/value-pair.ts";
import { valueLookup } from "../src/value.ts";

test("Divide By's first rung (the number you divide by is ±3, ±27, ±729, …) is valued at its survival under π", () => {
  // The power ladder scores level 0 in (1, 2] and level L at 3^L × (1, 2], so "score at least 3" is "level at least 1":
  // the number you divide by on a rung 3^T(L), T(L) = L(L + 1)/2.
  const vf = pairValueFunction(noFractions, { k: 3 }, pairQ, { tieBreaker: null, config: { drawsPerTilt: 40_000 } });
  const look = valueLookup(vf)(scoreFromWire(["3"]));
  const law = pairLaw(pairQ), r = rng("independent");
  const power = (n: bigint) => { let t = 0; while (n > 1n && n % 3n === 0n) { n /= 3n; t++; } return n === 1n && t > 0 && Number.isInteger((Math.sqrt(8 * t + 1) - 1) / 2); };
  let n = 0, top = 0;
  while (n < 6000) {
    const d = law.draw(r, 1);
    if (!d.state) continue;
    n++;
    const s = evaluateObject(pairType, noFractions, { k: 3 }, d.state, pairQ, null).score;
    const [l1, l2] = d.state.lines, D = l1!.a * l2!.b - l2!.a * l1!.b;
    if (s && power(D < 0n ? -D : D)) top++;
  }
  const want = -Math.log2(top / n), sd = Math.sqrt((1 - top / n) / top) / Math.LN2;   // ± one σ in bits
  assert.ok(Math.abs(look.bits - want) < 3 * sd + (look.hi - look.lo), `${look.bits} [${look.lo}, ${look.hi}] against ${want} ± ${sd}`);
  assert.equal(vf.objectType, "pair");
});

test("a pair's size tail never outruns the law: High Start at an intercept of 52,488 is worth less than the state's φ", async () => {
  // Found by the tension matrix (two-line-systems.md §8.3): stretching y = 9x + 8 by 3 eight times, beside x = −12, gave
  // High Start (then with the tie-breaker "high and rising") 8,238 bits through a linear tail. A pair's numbers cost log₂ of their size.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { highStart } = await import("@workspace/v2-pair");
  const dir = new URL("../values/pair-q/high-start/", import.meta.url);
  const s = pairType.decode("-59049,1,-52488;1,0,12");
  const files = readdirSync(dir).filter(x => x.endsWith(".json"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const vf = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const bits = valueLookup(vf)(evaluateObject(pairType, highStart, vf.params, s, pairQ, vf.tieBreaker).score).bits;
    assert.ok(bits <= pairType.readLength(s, pairQ), `${file}: ${bits} bits against φ ${pairType.readLength(s, pairQ)}`);
  }
});
