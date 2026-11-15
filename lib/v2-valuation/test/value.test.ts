/**
 * Value functions (owner decision 23, src/value.ts): bits at a score are −log2 of the mass of states at least as good.
 * What would break: a knot or a lookup that is not that survival (brute force on finite laws); the bracket between
 * knots that is not certified; the exact sums or the direct draws that disagree with the old rung values they replace.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareScores, q, rng, scoreToWire, type Q, type RuleFamily, type Score } from "@workspace/v2-core";
import { lineZ, primeLanding } from "@workspace/v2-linear";
import { findVariant, knotsFrom, layerMeasures, lineValueFunction, massOracle, sampledOracle, tailOf, TAIL_CEILING, TAIL_FLOOR, valueLookup, VALUE_CONFIG } from "../src/index.ts";
import { pairTail } from "../src/value-pair.ts";

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
    const look = valueLookup({ knots });
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
  const look = valueLookup({ knots });
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

test("a lookup beyond the best knot is extrapolated upward and never below the best knot's certified floor", () => {
  const { states } = finiteLaw("tail", 400);
  const { knots } = knotsFrom([massOracle("all", states, 0)], tight);
  const look = valueLookup({ knots, tail: { secondary: { form: "linear", slope: 0.5 }, primary: { form: "linear", slope: 0.5 } } });
  const best = knots[knots.length - 1]!;
  const beyond = look([parse(best.u![0]!), q(1000)]);
  assert.equal(beyond.at, "beyond");
  assert.ok(beyond.bits >= best.bits && beyond.lo === best.lo && beyond.hi === Infinity);
  // A sampled oracle with no draws above a score certifies nothing there.
  const so = sampledOracle("draws", [{ u: [q(0), q(1)], w: 1 }]);
  assert.equal(so.survival([q(0), q(2)]).support, 0);
});

test("no maximum (owner decision 26): past the best knot the value keeps rising without bound, on either form", () => {
  // A magnitude ramp: bits rise 0.8 per doubling of the secondary, measured up to 2^16.
  const knots = [{ u: null, bits: 0, lo: 0, hi: 0, source: "exact" as const },
    ...Array.from({ length: 8 }, (_, i) => { const s = 2 ** (9 + i); const bits = 20 + 0.8 * Math.log2(1 + s); return { u: ["0", String(s)], bits, lo: bits - 0.1, hi: bits + 0.1, source: "exact" as const }; })];
  const tail = tailOf(knots);
  assert.equal(tail.secondary.form, "log", "a magnitude takes a ramp, not a line that would over-value far scores");
  assert.ok(Math.abs(tail.secondary.slope - 0.8) < 1e-6);
  const look = valueLookup({ knots, tail });
  let prev = knots[knots.length - 1]!.bits;
  for (const s of [10n ** 6n, 10n ** 12n, 10n ** 30n, 10n ** 400n]) {
    const v = look([q(0), q(s)]);
    assert.equal(v.at, "beyond");
    assert.ok(v.bits > prev && Number.isFinite(v.bits), `${s}: ${v.bits} after ${prev}`);
    prev = v.bits;
  }
  // 10^30 is about 80 doublings past 2^16: about 64 bits more, not the 10^25 a straight line through the ramp would give.
  assert.ok(Math.abs(look([q(0), q(10n ** 30n)]).bits - (20 + 0.8 * Math.log2(1 + 1e30))) < 1e-6);
  // A flat run of knots (a fit of slope 0) still rises past the best knot: at the law's floor, never saturated.
  const flat = knots.map(k => ({ ...k, bits: k.u === null ? 0 : 20 }));
  const ft = tailOf(flat);
  assert.ok(ft.secondary.slope >= TAIL_FLOOR && ft.primary.slope >= TAIL_FLOOR);
  assert.ok(valueLookup({ knots: flat })([q(0), q(10n ** 9n)]).bits > 20 + TAIL_FLOOR * 10);
  // A count past the best primary rises too; a distance's tail reaches its top 0 at a finite, higher value.
  const best = knots[knots.length - 1]!.bits;
  assert.ok(look([q(3), q(0)]).bits > look([q(1), q(0)]).bits && look([q(1), q(0)]).bits > best);
  const dist = [{ u: null, bits: 0, lo: 0, hi: 0, source: "exact" as const },
    ...[-8, -4, -2, -1].map((d, i) => ({ u: ["0", String(d)], bits: 5 + i, lo: 5 + i, hi: 5 + i, source: "exact" as const }))];
  const dt = tailOf(dist);
  assert.equal(dt.secondary.form, "linear");
  assert.ok(valueLookup({ knots: dist })([q(0), q(0)]).bits > 8);
  // A magnitude primary (Sunken Intercept's −c: an unbounded hill as c goes down), measured to −c = 181500 at 15.6
  // bits with a straight-line slope of almost 0: past it the value keeps rising, along a ramp in the size.
  const sunk = [{ u: null, bits: 0, lo: 0, hi: 0, source: "sampled" as const },
    ...[-40, -3, 20000, 60000, 120000, 181500].map((c, i) => ({ u: [String(c)], bits: 2 * i, lo: 2 * i, hi: 2 * i, source: "sampled" as const }))];
  sunk[sunk.length - 1]!.bits = 15.6;
  const st = tailOf(sunk, TAIL_CEILING);
  assert.equal(st.primary.form, "log");
  const sl = valueLookup({ knots: sunk, tail: st });
  let last = 15.6;
  for (const c of [10n ** 6n, 10n ** 9n, 10n ** 30n]) {
    const v = sl([q(c)]);
    assert.ok(v.at === "beyond" && v.bits > last && Number.isFinite(v.bits), `−c = ${c}: ${v.bits} after ${last}`);
    last = v.bits;
  }
  // TAIL_FLOOR is the law's own: one coordinate's magnitude doubling from 1 to 2 under the mixed code.
  assert.ok(TAIL_FLOOR > 0.38 && TAIL_FLOOR < 0.39);
});

test("a sampled estimate never moves an exact knot's certified interval; no oracle still gives the worst knot", () => {
  const { states, truth } = finiteLaw("clamp", 300);
  // An exact oracle valid only for the better half of primaries, and a biased "sampled" oracle that is 1 bit too high.
  const exact = massOracle("upper", states, 0, u => u !== null && u[0]!.n >= -2n);
  const biased = sampledOracle("biased", states.map(s => ({ u: s.u, w: s.w })));
  const lying = { ...biased, survival: (u: Score) => { const s = biased.survival(u); return { ...s, lo: s.lo / 2.1, hi: s.hi / 1.9, estimate: s.estimate / 2 }; } };
  const { knots } = knotsFrom([exact, lying], tight);
  for (const k of knots) if (k.source === "exact" && k.u !== null) {
    const t = truth(scoreFromKnot(k.u));
    assert.ok(t >= k.lo - 2e-4 && t <= k.hi + 2e-4, `${JSON.stringify(k.u)}: ${t} outside [${k.lo}, ${k.hi}]`);
  }
  const none = knotsFrom([], tight).knots;
  assert.deepEqual(none.map(k => [k.u, k.bits]), [[null, 0]]);
  assert.equal(valueLookup({ knots: none })([q(0), q(1)]).at, "beyond");
});

test("committed value functions are intact: each content hash matches, knots rise, no sampled knot passes sampledMaxBits, and no tail saturates", async () => {
  const { canonicalJson, hashHex } = await import("@workspace/v2-core");
  const { readdirSync: ls, readFileSync: read } = await import("node:fs");
  const root = new URL("../values/", import.meta.url);
  let n = 0;
  for (const v of ls(root)) for (const f of ls(new URL(`${v}/`, root))) for (const x of ls(new URL(`${v}/${f}/`, root))) {
    const { contentHash, ...body } = JSON.parse(read(new URL(`${v}/${f}/${x}`, root), "utf8"));
    assert.equal(hashHex(canonicalJson(body)), contentHash, `${v}/${f}/${x}`);
    for (let i = 1; i < body.knots.length; i++) assert.ok(body.knots[i].bits >= body.knots[i - 1].bits, `${v}/${f}/${x}: knots rise`);
    for (const k of body.knots) if (k.source === "sampled") assert.ok(k.bits <= body.config.sampledMaxBits, `${v}/${f}/${x}: ${k.bits}`);
    assert.equal(body.schema, 7, `${v}/${f}/${x}: schema`);
    const family = (findVariant(v).type.families as RuleFamily<unknown, unknown>[]).find(y => y.id === body.family)!;
    const measures = layerMeasures(family, body.tieBreaker === "none" ? null : body.tieBreaker);
    const tb = body.tieBreaker === "none" ? null : body.tieBreaker;
    const tail = body.objectType === "pair" ? pairTail(family, tb, body.knots) : tailOf(body.knots, body.objectType === "line" ? TAIL_CEILING : Infinity, measures);
    assert.deepEqual(body.tail, tail, `${v}/${f}/${x}: the tail is the one its knots and layers imply`);
    for (const t of [body.tail.secondary, body.tail.primary]) assert.ok(t.slope > 0 && Number.isFinite(t.slope), `${v}/${f}/${x}: tail ${JSON.stringify(t)}`);
    n++;
  }
  assert.ok(n >= 60, `${n} value functions`);
});

test("the tail never over-pays the law: on lines it rises at most STEP bits per unit (a prime p costs p/2 bits)", async () => {
  // Knots rising 0.66 bits per prime unit (a fit the sampler's noise can give): held to 0.5, the fitted slope kept.
  const ps = [29, 31, 37, 41, 43, 47];
  const knots = [{ u: null, bits: 0, lo: 0, hi: 0, source: "exact" as const },
    ...ps.map(p => ({ u: ["0", String(p)], bits: 0.66 * p, lo: 0.66 * p, hi: 0.66 * p, source: "exact" as const }))];
  const t = tailOf(knots, TAIL_CEILING);
  assert.deepEqual([t.secondary.form, t.secondary.slope], ["linear", TAIL_CEILING]);
  assert.ok(Math.abs(t.secondary.unclamped! - 0.66) < 1e-9);
  assert.equal(tailOf(knots).secondary.slope, t.secondary.unclamped, "no ceiling off lines");
  // The case found in play: line-q Square Area + spf at spf 367, whose witness y = −2x + 734 has φ ≈ 197.8.
  const { readdirSync: ls, readFileSync: read } = await import("node:fs");
  const { evaluateObject } = await import("@workspace/v2-core");
  const { lineType, lineQ, squareArea, fromMC } = await import("@workspace/v2-linear");
  const dir = new URL("../values/line-q/square-area/", import.meta.url);
  const vf = JSON.parse(read(new URL(ls(dir).find(x => x.endsWith("-spf.json"))!, dir), "utf8"));
  const witness = { lines: [fromMC(q(-2), q(734))] };
  const score = evaluateObject(lineType, squareArea, {}, witness, lineQ, "spf").score;
  assert.deepEqual(score, [q(0), q(367)]);
  const bits = valueLookup(vf)(score).bits, phi = lineType.readLength(witness, lineQ);
  assert.ok(bits <= phi, `spf 367: ${bits} bits against the witness's φ ${phi}`);
  // spf is a prime: its tail is the code's own ½ bit per unit (Layer.measure), so 367 is worth nearly its witness's φ,
  // not the ~26 bits a magnitude ramp gave (owner decision 30: an unbounded hill to climb).
  assert.equal(vf.tail.secondary.measure, "prime");
  assert.ok(bits >= phi - 12, `spf 367: ${bits} bits, within a few bits of the witness's φ ${phi}`);
  const t2 = tailOf(knots, TAIL_CEILING, { secondary: "prime" });
  assert.deepEqual([t2.secondary.form, t2.secondary.slope], ["linear", TAIL_CEILING]);
  assert.equal(tailOf([{ u: null, bits: 0 }, { u: ["0", "5"], bits: 4 }], TAIL_CEILING, { secondary: "prime" }).secondary.slope, TAIL_CEILING,
    "one knot: the code's rate");
});
