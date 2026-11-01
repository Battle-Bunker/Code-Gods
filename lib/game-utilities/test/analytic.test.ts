/**
 * Analytic survival functions (src/analytic.ts): every family's `analytic` is well formed, agrees with fresh spawns,
 * is keyed by its formula id, matches exact enumeration where a domain is enumerable, and agrees with the archived
 * Monte Carlo reference tables (data/analytic-reference/) within the estimator's error. The toolkit itself is checked
 * against hand-derived laws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { instantiate, objectType, type Instantiation } from "@workspace/game-types";
import { FAMILIES, available, canonicalSupport, context, evaluator, family } from "../src/catalog.ts";
import type { Ordinal } from "../src/types.ts";
import { analyticFor, cmpOrdinal, instantiateKey, tableKey, tableKeyParts, type CalibrationBudget, type CalibrationTable } from "../src/calibration.ts";
import { shippedInstanceKeys, shippedManifest } from "../src/calibration-data.ts";
import {
  assertAnalytic, binomial, combine, distOf, exactSurvival, iidSum, lineChainCount, maxOfEqualMultinomial, multinomial, pairOrdinal,
  poissonTail, rowTransferCount, survivalLevels, totalMass, type AnalyticSurvival,
} from "../src/analytic.ts";
import {
  MAX_RMS_Z_BELOW_32, assertAnalyticAgainstSpawns, compareWithEnumeration, compareWithTable, nominalSe, keyOfOrdinal, tableViolations,
} from "../src/analytic-verify.ts";
import { DEFAULT_BUDGET, buildTable, mcTableKey } from "../scripts/estimator.ts";

export const REFERENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "analytic-reference");
export const REFERENCE_COMMAND = "node --experimental-strip-types lib/game-utilities/scripts/analytic-reference.ts <family>";
/** One archived family: the sampling estimator's tables (key = mcTableKey) for every shape it was run on. */
export interface ReferenceFile { readonly format: string; readonly family: string; readonly tables: readonly CalibrationTable[] }
export const REFERENCE_FORMAT = "analytic-reference/v1";

const MANIFEST = shippedManifest();
const instOf = (key: string): Instantiation => { const e = MANIFEST.instances[key]; return objectType(e.objectType).instantiate(e.args); };
const ANALYTIC_FAMILIES = FAMILIES.filter(f => f.analytic);

/** Shapes a formula declines (returns null) on purpose: the number of its 48 reference shapes it must cover. Default: all. */
const EXPECTED_COVERAGE: Record<string, number> = {
  best_friends: 24,   // C^N ≤ TRANSFER_STATES (1300): rgb up to 6×6, rgby up to 5×5, rainbow6 at 4×4
};

// ------------------------------------------------------------------------------------------------
// the toolkit, against hand-derived laws
// ------------------------------------------------------------------------------------------------

test("toolkit: binomial, multinomial, iid sums, chains, max of multinomial and transfer matrix match hand derivations", () => {
  const close = (a: number, b: number, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  const b = binomial(4, 0.25);
  close(totalMass(b), 1);
  close(b.get("2")!.p, 6 * 0.25 ** 2 * 0.75 ** 2);
  // survival levels: G(0) = 1, G(4) = 0.25^4
  const L = survivalLevels(b);
  assert.deepEqual(L.map(([o]) => o), [0, 1, 2, 3, 4]);
  assert.equal(L[0][1], 0);
  close(L[4][1], 4 * Math.log2(0.25));
  // the sum of two iid Bernoulli(p) is Binomial(2, p); 25 iid is Binomial(25, p)
  const bern = distOf([[0, 0.9], [1, 0.1]]);
  for (const [k, e] of iidSum(bern, 25)) close(e.p, binomial(25, 0.1).get(k)!.p, 1e-15);
  // trinomial: counts (a, b) over n cells with probabilities (p1, p2, rest)
  const tri = multinomial(3, [0.2, 0.3, 0.5], c => [c[0], c[1]]);
  close(totalMass(tri), 1);
  close(tri.get("1,1")!.p, 6 * 0.2 * 0.3 * 0.5);
  // a chain: steps of +1 along 3 iid uniform digits 0..9: P(2 steps) = P(x, x+1, x+2) = 8/1000
  const chain = lineChainCount(3, Array(10).fill(0.1), (prev, v) => (prev !== null && v === prev + 1 ? 1 : 0));
  close(chain.get("2")!.p, 8 / 1000);
  close(chain.get("1")!.p, 2 * (9 / 100) - 2 * 8 / 1000);
  // max of multinomial(2; 1/3 each): P(max ≥ 2) = 3 · (1/3)^2 = 1/3
  const mx = maxOfEqualMultinomial(2, 3);
  assert.deepEqual(mx.map(([o]) => o), [1, 2]);
  close(mx[1][1], Math.log2(1 / 3));
  // transfer matrix: 2 rows of 1 cell over 2 states, v = 1 iff equal: P(count = 1) = 1/2
  const tm = rowTransferCount(2, 2, () => 0, (a, c) => (a === c ? 1 : 0), 1);
  close(tm.get("1")!.p, 0.5);
  // lexicographic pairs: P((X, Y) ≥ (1, 1)) for X, Y iid Bernoulli(0.5) = P(X = 1, Y ≥ 1) = 1/4
  const pair = combine(distOf([[0, 0.5], [1, 0.5]]), distOf([[0, 0.5], [1, 0.5]]), pairOrdinal);
  const pl = survivalLevels(pair);
  close(pl.find(([o]) => keyOfOrdinal(o) === "1,1")![1], -2);
  // Poisson tail
  close(poissonTail(2, 0), 1);
  close(poissonTail(2, 1), 1 - Math.exp(-2), 1e-12);
  // lost mass is refused, as are out-of-range transfer-matrix terms and a negative Poisson rate
  assert.throws(() => survivalLevels(distOf([[0, 0.5]])), /total mass/);
  assert.throws(() => rowTransferCount(2, 2, r => r, () => 0, 0), /outside/);
  assert.equal(poissonTail(0, 0), 1);
  assert.equal(poissonTail(0, 1), 0);
  // validity checks
  assertAnalytic(exactSurvival("x@1", b), "ok");
  assert.throws(() => assertAnalytic({ id: "bad id", kind: "exact", levels: [[0, 0]] }, "t"), /must look like/);
  assert.throws(() => assertAnalytic({ id: "x@1", kind: "exact", levels: [[0, -1]] }, "t"), /first level/);
  assert.throws(() => assertAnalytic({ id: "x@1", kind: "exact", levels: [[0, 0], [0, -1]] }, "t"), /strictly increasing/);
  assert.throws(() => assertAnalytic({ id: "x@1", kind: "exact", levels: [[0, 0], [1, -1], [2, -0.5]] }, "t"), /increases/);
  assert.throws(() => assertAnalytic({ id: "x@1", kind: "approx", levels: [[0, 0]] }, "t"), /maxErrorBits/);
});

// ------------------------------------------------------------------------------------------------
// the harness itself
// ------------------------------------------------------------------------------------------------

const budget: CalibrationBudget = DEFAULT_BUDGET;
const synthetic = (levels: (readonly [number, number])[]): CalibrationTable => ({
  key: "k", family: "f", canonicalParams: {}, instance: "Grid(5,base10,rgby)", shape: { kind: "scalar" }, levels, slope: 1,
  estimator: { id: "mc-ams", version: 3, seed: "0", budget }, meta: { mcLevels: 2, splitLevels: 1, stoppedEarly: false, topReached: true, maxBits: levels[levels.length - 1][1] },
});

test("harness: compareWithTable reports Δ, z, unattainable levels and the top; nominal se grows with depth", () => {
  const table = synthetic([[0, 1e-6], [1, 1], [2, 3], [5, 20]]);
  const a: AnalyticSurvival = { id: "t@1", kind: "exact", levels: [[0, 0], [1, -1], [2, -3.5], [4, -10], [5, -20]] };
  const c = compareWithTable(a, table);
  assert.equal(c.levels, 4);
  assert.deepEqual(c.unattainable, []);
  assert.ok(Math.abs(c.maxAbsDelta - 0.5) < 1e-9);
  assert.equal(keyOfOrdinal(c.worst!.ordinal), "2");
  assert.ok(c.maxZ > 1 && Number.isFinite(c.maxZ));
  assert.deepEqual(c.topBits, { table: 20, analytic: 20 });
  // a level the analytic does not know
  const c2 = compareWithTable({ ...a, levels: a.levels.filter(([o]) => o !== 2) }, table);
  assert.deepEqual(c2.unattainable, [2]);
  assert.equal(c2.levels, 3);
  // nominal se: MC body ~ binomial, splitting tail grows like sqrt(depth) and is inflated
  const se8 = nominalSe(table, 8), se30 = nominalSe(table, 30), se60 = nominalSe(table, 60);
  assert.ok(nominalSe(table, 1) < se8 && se8 < se30 && se30 < se60, `${se8} ${se30} ${se60}`);
  assert.ok(se60 > 0.7 && se60 < 1, `se at 60 bits = ${se60}`);
  assert.equal(nominalSe({ ...table, estimator: { ...table.estimator, budget: "exact" } }, 10), 0);
});

test("harness: enumeration agrees with itself on Int(0,9999) and catches a wrong level; spawns catch a wrong formula", () => {
  const inst = instantiate("Int", { min: 0, max: 9999 }), draw = { familyId: "digit-devotee", params: { d: 7 } };
  const ev = evaluator(draw, inst), counts = new Map<number, number>();
  for (let x = 0; x <= 9999; x++) { const o = ev(x) as number; counts.set(o, (counts.get(o) ?? 0) + 1); }
  const d = distOf([...counts].map(([o, c]) => [o, c / 10000] as const));
  const a = exactSurvival("digits@1", d);
  const e = compareWithEnumeration(a, draw, inst)!;
  assert.equal(e.values, 10000);
  assert.ok(e.maxAbsDelta < 1e-9);
  assert.deepEqual(e.mismatchedOrdinals, []);
  const wrong = { ...a, levels: a.levels.map(([o, l]) => [o, o === 2 ? l + 1 : l] as const) };   // one bit too common at ≥ 2
  assert.ok(compareWithEnumeration(wrong, draw, inst)!.maxAbsDelta > 0.99);
  assert.equal(compareWithEnumeration(a, draw, instantiate("Int", {})), null, "the full Int range is not enumerable");
  assert.doesNotThrow(() => assertAnalyticAgainstSpawns(a, draw, inst, 2000));
  assert.throws(() => assertAnalyticAgainstSpawns(wrong, { ...draw }, inst, 4000), /spawns give|missing/);
  assert.throws(() => assertAnalyticAgainstSpawns({ ...a, levels: a.levels.slice(0, 2) }, draw, inst, 2000), /missing from the analytic levels/);
});

// ------------------------------------------------------------------------------------------------
// every family analytic
// ------------------------------------------------------------------------------------------------

test("every family analytic is well formed, lists every spawned ordinal, matches spawn frequencies and puts the exemplar on top", () => {
  assert.ok(ANALYTIC_FAMILIES.length >= 2, "picture_frame and lone_peak have analytics");
  let checked = 0;
  for (const f of ANALYTIC_FAMILIES) {
    for (const instKey of shippedInstanceKeys()) {
      const inst = instOf(instKey);
      if (!available(f, inst).ok) continue;
      const ctx = context(inst);
      for (const p of canonicalSupport(f, ctx)) {
        const a = analyticFor(f.id, p, inst);
        if (!a) continue;
        checked++;
        const draw = { familyId: f.id, params: p };
        assertAnalyticAgainstSpawns(a, draw, inst, 2000);
        if (f.exemplar) {
          const top = evaluator(draw, inst)(f.exemplar(p, ctx)), last = a.levels[a.levels.length - 1][0];
          assert.equal(cmpOrdinal(top, last), 0, `${f.id} on ${instKey}: exemplar ordinal ${JSON.stringify(top)} is not the top level ${JSON.stringify(last)}`);
        }
        const e = compareWithEnumeration(a, draw, inst);
        if (e) { assert.deepEqual(e.mismatchedOrdinals, [], `${f.id} on ${instKey}`); assert.ok(e.maxAbsDelta < 1e-9, `${f.id} on ${instKey}: enumeration differs by ${e.maxAbsDelta} bits`); }
      }
    }
  }
  assert.ok(checked >= 10, `only ${checked} analytic draws checked`);
});

test("hand-derived pins: exact tops and body values of the wired analytics", () => {
  const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  const last = (a: AnalyticSurvival) => a.levels[a.levels.length - 1];
  const at = (a: AnalyticSurvival, o: Ordinal) => a.levels.find(([l]) => cmpOrdinal(l, o) === 0)![1];
  const g4 = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), g5 = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgby" });
  // Best Friends: the maximum 2N(N−1) seams needs one of the two A/B checkerboards: G = 2 / C^n
  const bf = analyticFor("best_friends", { A: 0, B: 1 }, g4)!;
  assert.deepEqual(last(bf)[0], 24);
  close(last(bf)[1], 1 - 16 * Math.log2(3));
  // Hated colour: all cells my colour; Hated takeover: all cells one colour (C ways); first level ceil(n/C) has G = 1
  close(last(analyticFor("hate_colour", { colour: 0 }, g5)!)[1], -25 * 2);
  const tk = analyticFor("hate_takeover", {}, g5)!;
  assert.deepEqual(tk.levels[0], [7, 0]);
  close(last(tk)[1], 2 - 25 * 2);
  // Green Ones: every cell perfect, probability (1/(S·C))^n
  const go = analyticFor("seed3_green_ones", { colour: 0, value: 0 }, g5)!;
  assert.deepEqual(last(go)[0], [25, 0]);
  close(last(go)[1], 25 * Math.log2(1 / 40));
  // Rainbow Road: P(at least one whole row) = 1 − (1 − C^(1−N))^N, and the top is every row a whole rainbow line
  const rr = analyticFor("rainbow_road", { dir: "→" }, g5)!;
  close(at(rr, [1, 4]), Math.log2(1 - (1 - 4 ** -4) ** 5), 1e-12);
  close(last(rr)[1], 5 * 4 * Math.log2(1 / 4));
  // Staircase Climber: all N−1 steps in every row needs a run of N consecutive values from S−N+1 starts
  const sc = analyticFor("staircase_climber", { dir: "→" }, g4)!;
  assert.deepEqual(last(sc)[0], 12);
  close(last(sc)[1], 4 * Math.log2(7 / 10 ** 4), 1e-9);
});

test("tables built from an analytic carry its id in the key and the budget label; the estimator's key differs", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const r = buildTable("picture_frame", { X: 0 }, inst);
  assert.equal(r.table.estimator.budget, "exact:picture-frame@1");
  assert.equal(r.table.key, tableKey("picture_frame", { X: 0 }, inst));
  assert.equal(tableKeyParts("picture_frame", { X: 0 }, inst).exact, "picture-frame@1");
  assert.notEqual(mcTableKey("picture_frame", { X: 0 }, inst), r.table.key);
  assert.equal(tableKeyParts("snap", {}, inst).exact, undefined, "a family without an analytic has no id in its key");
  assert.deepEqual(r.table.levels, [[0, 1e-6], [1, 12 * Math.log2(3)]].map(([o, b]) => [o, Math.round(b * 1e9) / 1e9]));
  assert.equal(r.evaluations, 0, "no sampling");
});

test("archived reference tables: every Monte Carlo table of a family with an analytic agrees with it within the estimator's error", () => {
  const files = existsSync(REFERENCE_DIR) ? readdirSync(REFERENCE_DIR).filter(f => f.endsWith(".json")).sort() : [];
  const bad: string[] = [];
  for (const name of files) {
    const ref = JSON.parse(readFileSync(join(REFERENCE_DIR, name), "utf8")) as ReferenceFile;
    assert.equal(ref.format, REFERENCE_FORMAT, name);
    assert.equal(`${ref.family}.json`, name);
    const f = family(ref.family);
    assert.ok(f.analytic, `${ref.family} has reference tables but no analytic`);
    let sz2 = 0, nz = 0, notCovered = 0;
    for (const t of ref.tables) {
      const inst = instantiateKey(t.instance);
      const where = `${ref.family} ${JSON.stringify(t.canonicalParams)} on ${t.instance}`;
      assert.equal(t.key, mcTableKey(ref.family, t.canonicalParams, inst), `${where}: the reference table is stale (the card changed); rebuild it with ${REFERENCE_COMMAND}`);
      const a = analyticFor(ref.family, t.canonicalParams, inst);
      if (!a) { notCovered++; continue; }   // the formula declines this shape (e.g. a transfer matrix too large): sampling serves it
      const c = compareWithTable(a, t);
      bad.push(...tableViolations(a, t, c).map(v => `${where}: ${v}`));
      for (const b of c.bands) if (b.band[1] <= 32) { sz2 += b.rmsZ ** 2 * b.levels; nz += b.levels; }
    }
    if (nz && Math.sqrt(sz2 / nz) > MAX_RMS_Z_BELOW_32) bad.push(`${ref.family}: RMS z over levels below 32 bits is ${Math.sqrt(sz2 / nz).toFixed(2)} > 1.5`);
    const expected = EXPECTED_COVERAGE[ref.family] ?? ref.tables.length;
    assert.equal(ref.tables.length - notCovered, expected, `${ref.family}: the analytic covers ${ref.tables.length - notCovered} of ${ref.tables.length} reference shapes, expected ${expected}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
