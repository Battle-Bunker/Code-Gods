/**
 * Value functions (owner decision 23, src/value.ts): bits at a score are −log2 of the mass of states at least as good.
 * What would break: a knot or a lookup that is not that survival (brute force on finite laws); the bracket between
 * knots that is not certified; the exact sums or the direct draws that disagree with the old rung values they replace.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { compareScores, q, rng, ruleLadder, scoreToWire, type Q, type Score } from "@workspace/v2-core";
import { lineZ, primeLanding, wholeCrossing } from "@workspace/v2-linear";
import { knotsFrom, lineValueFunction, massOracle, sampledOracle, valueLookup, VALUE_CONFIG } from "../src/index.ts";

/** A finite law over random scores (some components null), every state's true value by brute force. */
function finiteLaw(seed: string, n: number) {
  const r = rng("finite", seed);
  const states: { u: Score; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    const u: Score = r.below(20) === 0 ? null : [q(r.below(7) - 6, 1 + r.below(2)), r.below(5) === 0 ? null : q(r.below(40))];
    states.push({ u, w: 1 + r.below(1000) });
  }
  const W = states.reduce((a, s) => a + s.w, 0);
  for (const s of states) s.w /= W;
  const truth = (u: Score) => -Math.log2(states.filter(s => compareScores(s.u, u) >= 0).reduce((a, s) => a + s.w, 0));
  return { states, truth };
}

const tight = { ...VALUE_CONFIG, delta: 0, minSupport: 1 };

test("brute force: on a finite law, every state's bits are −log2 of the mass of states at least as good", () => {
  for (const seed of ["a", "b", "c"]) {
    const { states, truth } = finiteLaw(seed, 300);
    const { knots } = knotsFrom([massOracle("all", states, 0)], tight);
    const look = valueLookup({ knots, tail: { method: "flat", slope: 0 } });
    for (const s of states) {
      const v = look(s.u);
      assert.equal(v.at, "knot");
      assert.ok(Math.abs(v.bits - truth(s.u)) < 2e-4, `${JSON.stringify(scoreToWire(s.u))}: ${v.bits} against ${truth(s.u)}`);
    }
  }
});

test("thinned knots: a lookup between knots is bracketed by them and within delta/2 of the truth", () => {
  const { states, truth } = finiteLaw("thin", 2000);
  const delta = 0.3;
  const { knots } = knotsFrom([massOracle("all", states, 0)], { ...tight, delta });
  assert.ok(knots.length < 2000);
  const look = valueLookup({ knots, tail: { method: "flat", slope: 0 } });
  let prev = -1;
  for (const s of [...states].sort((a, b) => compareScores(a.u, b.u))) {
    const v = look(s.u), t = truth(s.u);
    assert.ok(t >= v.lo - 2e-4 && t <= v.hi + 2e-4, `${t} outside [${v.lo}, ${v.hi}]`);
    assert.ok(Math.abs(v.bits - t) <= delta / 2 + 2e-4 || v.at === "beyond");
    assert.ok(v.bits >= prev - 1e-9, "monotone in the score");
    prev = v.bits;
  }
});

test("mass outside an enumeration widens the interval: a knot is certified only where the outside mass is small", () => {
  const { states } = finiteLaw("out", 300);
  const { knots } = knotsFrom([massOracle("all", states, 1e-3)], { ...tight, delta: 0 });
  for (const k of knots) assert.ok(k.hi - k.lo <= Math.max(0.02 * k.bits, VALUE_CONFIG.absFloor) + 1e-9);
  assert.ok(knots.every(k => k.bits < 9), "nothing rarer than the outside mass is certified");
});

test("direct draws agree with the exact sums (Prime Landing + m-spf on line-z, separable as a product of two laws)", () => {
  const p = primeLanding.dealable(lineZ)[0]!;
  const exact = lineValueFunction(primeLanding, p, lineZ, { tieBreaker: "m-spf", config: { drawsPerTilt: 0 } });
  const draws = lineValueFunction(primeLanding, p, lineZ, { tieBreaker: "m-spf", exact: false, config: { drawsPerTilt: 30_000 } });
  const look = valueLookup(exact);
  let compared = 0;
  for (const k of draws.knots) {
    if (k.u === null) continue;
    const e = look(scoreFromKnot(k.u));
    if (e.at !== "knot") continue;
    const sigma = (k.hi - k.lo) / 4;
    assert.ok(Math.abs(k.bits - e.bits) <= 4 * sigma + 0.05, `${JSON.stringify(k.u)}: drawn ${k.bits} ± ${sigma.toFixed(3)}, exact ${e.bits}`);
    compared++;
  }
  assert.ok(compared >= 5, `compared ${compared} knots`);
});

const scoreFromKnot = (u: (string | null)[]): Score => u.map(x => (x === null ? null : parse(x)));
const parse = (w: string): Q => { const [n, d] = w.split("/"); return { n: BigInt(n!), d: BigInt(d ?? "1") }; };

/**
 * The continuous value at each old threshold is the old rung value (owner decision 23, check 7), where the old rung is a
 * set of the new order: a main rung "main ≥ t" is S(t, worst tie-breaker); a tie rung at the main layer's top, when that
 * top is the best a main utility can be (a distance's 0), is S(top, t).
 */
test("old rung values are the value function at the old thresholds (exact families on line-z)", () => {
  const cases = [{ family: primeLanding, tb: "big-prime" }, { family: wholeCrossing, tb: "k-spf" }];
  for (const { family, tb } of cases) {
    const p = family.dealable(lineZ)[0]!;
    const vf = lineValueFunction(family as never, p, lineZ, { tieBreaker: tb, config: { drawsPerTilt: 0, delta: 0 } });
    const look = valueLookup(vf);
    const dir = new URL(`../artefacts/line-z/${family.id}/`, import.meta.url);
    const old = JSON.parse(readFileSync(new URL(readdirSync(dir).find(f => f.endsWith(`-${tb}.json`))!, dir), "utf8"));
    const ladder = ruleLadder(family as never, p, lineZ, tb);
    const top = ladder.filter(r => r.layer === 0).at(-1)!.score![0]!;
    let checked = 0;
    ladder.forEach((r, i) => {
      const rung = old.rungs[i];
      if (!rung || rung.source !== "exact" || r.score === null || !Number.isFinite(rung.bits)) return;
      const atTop = r.layer === 1 && compareScores([r.score[0]!], [top]) === 0;
      if (r.layer === 0) {
        const v = look([r.score[0]!, null]);
        assert.ok(Math.abs(v.bits - rung.bits) <= Math.max(0.02 * rung.bits, 0.03), `${family.id} ${r.label}: ${v.bits} against ${rung.bits}`);
        checked++;
      } else if (atTop && family.main.sense === "min" && r.score[0]!.n === 0n) {
        const v = look(r.score);
        assert.ok(Math.abs(v.bits - rung.bits) <= Math.max(0.02 * rung.bits, 0.03), `${family.id} ${r.label}: ${v.bits} against ${rung.bits}`);
        checked++;
      }
    });
    assert.ok(checked >= 8, `${family.id}: ${checked} rungs compared`);
  }
});

test("a lookup beyond the best knot is extrapolated upward and never below the best knot's certified floor", () => {
  const { states } = finiteLaw("tail", 400);
  const { knots } = knotsFrom([massOracle("all", states, 0)], tight);
  const look = valueLookup({ knots, tail: { method: "secondary", slope: 0.5 } });
  const best = knots[knots.length - 1]!;
  const beyond = look([parse(best.u![0]!), q(1000)]);
  assert.equal(beyond.at, "beyond");
  assert.ok(beyond.bits >= best.bits && beyond.lo === best.lo && beyond.hi === Infinity);
  // A sampled oracle with no draws above a score certifies nothing there.
  const so = sampledOracle("draws", [{ u: [q(0), q(1)], w: 1 }]);
  assert.equal(so.survival([q(0), q(2)]).support, 0);
});
