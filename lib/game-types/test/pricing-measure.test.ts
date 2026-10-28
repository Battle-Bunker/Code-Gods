/**
 * measureAgent and the reference mixture, including an end-to-end check against Grid Lab's
 * measure.py on its published reference grids (fixture made by test/pricing_e2e_fixture.py).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GRID, INT, STRING, actCharge, applyCalls, deriveSeed, gridFromHex, measureAgent, mixtureFromHexFixture,
  referenceMixture, withComponents, type ObjectValue, type RunActs,
} from "../src/index.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`./pricing-data/${f}`, import.meta.url), "utf8"));
const REF = read("reference_grids_5_base10_rgby.json");
const E2E = read("e2e_measure_5_base10_rgby.json");
const SALT = E2E.salt as string;
const inst = GRID.instantiate({ size: 5, symbols: "base10", colours: "rgby" });
const close = (a: number, b: number, tol: number, what: string) =>
  assert.ok(a === b || Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// ------------------------------------------------------------------------------------------------
// end to end against measure.py
// ------------------------------------------------------------------------------------------------

test("the published reference grids load as wire values", () => {
  const mix = mixtureFromHexFixture(REF, inst);
  assert.equal(REF.gtype, inst.key);
  assert.equal(mix.values.length, 128 + 64 + 64);
  assert.deepEqual([...new Set(mix.components)], ["uniform", "structured", "game"]);
  for (const v of mix.values) assert.ok(GRID.codec(inst).isValid(v));
  const g = GRID.codec(inst).decode(gridFromHex(REF.uniform[0], inst));
  assert.deepEqual([g.sym[0], g.sym[1], g.sym[2], g.sym[3], g.col[0], g.col[1]], [1, 0, 3, 9, 2, 1]);   // "01000309…:0201…"
});

/**
 * Agents whose every move is a constant overwrite that changes something: pointwise erasure = measure.py's
 * prior erasure. (random_two_cells is out: a call that changes nothing pays no erasure in applyCalls.)
 */
const CONSTANT_ERASURE = new Set(["paint_one_row", "fill_grid", "paint_best_line", "reddest_row", "guarded_row",
  "recolour_by_hand", "copy_top_colour", "random_row", "hashed_row"]);
/**
 * One move whose target does not depend on the grid: our pointwise motion and measure.py's expected motion
 * agree to within Jensen's gap (E[d²] vs E[d]²). Agents that pick their line (paint_best_line, reddest_row, majority_star) move fewer
 * cells than average, which pointwise motion sees and measure.py's does not.
 */
const SAME_MOTION = new Set(["paint_one_row", "fill_grid", "recolour_tool", "random_row", "hashed_row"]);

for (const [name, lab] of Object.entries<any>(E2E.agents)) {
  test(`end to end: ${name} prices as measure.py does on the reference grids`, async () => {
    const mix = mixtureFromHexFixture(REF, inst);
    for (const [i, j, s] of lab.seeds) assert.equal(deriveSeed(SALT, ["measure", inst.key, i, j]), BigInt(s));
    let calls = 0;
    const run: RunActs = (value, seed, at) => {
      calls++;
      assert.equal(value, mix.values[at.index]);
      assert.equal(seed, deriveSeed(SALT, ["measure", inst.key, at.index, at.replicate]));
      const [moves, used] = lab.runs[at.index][at.replicate];
      return { calls: JSON.stringify(moves), usedRandom: used === 1 };
    };
    const p = await measureAgent(run, inst, mix, { salt: SALT, concurrency: 4 });
    assert.equal(p.randomized, lab.randomized);
    assert.equal(calls, mix.values.length * (lab.randomized ? 8 : 1));
    // the decision is measure.py's, to the last bit, on every estimate and every component
    close(p.decisionBits, lab.decision, 1e-9, "decision");
    assert.equal(p.binding, lab.binding);
    for (const [k, v] of Object.entries<number | null>(lab.estimates)) close(p.estimates[k as "joint"]!, v ?? Infinity, 1e-9, k);
    for (const [c, v] of Object.entries<any>(lab.by_component)) {
      close(p.diagnostics.byComponent[c].decision, v.decision, 1e-9, `${c} decision`);
      assert.equal(p.diagnostics.byComponent[c].binding, v.binding, c);
    }
    if (lab.randomized) {
      close(p.diagnostics.I_jackknife!, lab.I_jackknife, 1e-9, "I_jk");
      close(p.diagnostics.I_shuffle!, lab.I_shuffle, 1e-9, "I_shuffle");
      close(p.diagnostics.H_A!, lab.H_A, 1e-9, "H_A");
    }
    // destruction: measure.py charges every returned move; our acts that change nothing fail and pay none
    const runs = lab.runs as [unknown[], number, [number, number]][][];
    const ok = runs.map((row, i) => row.slice(0, p.diagnostics.replicates)
      .map(([moves]) => applyCalls(GRID, inst, mix.values[i], moves).ok));
    const meanOk = (f: (r: [unknown[], number, [number, number]]) => number) =>
      runs.reduce((s, row, i) => s + row.slice(0, p.diagnostics.replicates).reduce((t, r, j) => t + (ok[i][j] ? f(r) : 0), 0)
        / p.diagnostics.replicates, 0) / runs.length;
    if (CONSTANT_ERASURE.has(name)) close(p.expectedErasure, meanOk(r => r[2][0]), 1e-9, "erasure on the acts that change");
    // motion: both are the whole act's change squared (open-agents.md §4.1); ours is pointwise (E[d²] ≥ E[d]²)
    if (SAME_MOTION.has(name)) close(p.expectedMotion, meanOk(r => r[2][1]), Math.max(0.05, 0.1 * lab.motion), "motion");
    // painting cell by cell moves what the one recolour moves: no discount for splitting (measure.py
    // sums each cell paint's expected change, so it charges less than the tool here)
    if (name === "recolour_by_hand") {
      const tool = E2E.agents.recolour_tool.runs as [unknown[], number, unknown][][];
      runs.forEach((row, i) => row.slice(0, p.diagnostics.replicates).forEach(([moves], j) => {
        const a = applyCalls(GRID, inst, mix.values[i], moves), b = applyCalls(GRID, inst, mix.values[i], tool[i][j][0]);
        if (a.ok && b.ok && a.value === b.value) close(a.cost.motion, b.cost.motion, 1e-12, "split motion");
      }));
      assert.ok(p.expectedMotion >= lab.motion, `${p.expectedMotion} vs ${lab.motion}`);
    }
    close(p.perApplicationBits, p.decisionBits + p.expectedErasure + p.expectedMotion, 1e-12, "per application");
    assert.equal(p.ratchet, "off");
  });
}

// ------------------------------------------------------------------------------------------------
// the reference mixture
// ------------------------------------------------------------------------------------------------

for (const [label, typeDef, i] of [
  ["Grid(5,base10,rgby)", GRID, inst],
  ["Grid(7,cards,rainbow6)", GRID, GRID.instantiate({ size: 7, symbols: "cards", colours: "rainbow6" })],
  ["Int(0,9999)", INT, INT.instantiate({ min: 0, max: 9999 })],
  ["string(16)", STRING, STRING.instantiate({ maxLength: 16 })],
] as const) {
  test(`referenceMixture(${label}) is deterministic in the salt, valid, uniform then structured`, () => {
    const a = referenceMixture(i, "season-1 secret", { nUniform: 32, nStructured: 16 });
    const b = referenceMixture(i, "season-1 secret", { nUniform: 32, nStructured: 16 });
    const c = referenceMixture(i, "season-2 secret", { nUniform: 32, nStructured: 16 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.values, c.values);
    assert.equal(a.instKey, i.key);
    assert.equal(a.values.length, 48);
    assert.deepEqual(a.components, [...Array(32).fill("uniform"), ...Array(16).fill("structured")]);
    for (const v of a.values) assert.ok(typeDef.codec(i).isValid(v));
    // structured values are reachable by cheap calls from a spawn: never all identical to fresh spawns
    assert.ok(new Set(a.values).size > 40);
  });
}

test("structured grids carry visible structure (paints, writes, sorts) more often than spawns", () => {
  const m = referenceMixture(inst, "structure check", { nUniform: 128, nStructured: 128 });
  const codec = GRID.codec(inst);
  const longestRun = (v: ObjectValue) => {
    const g = codec.decode(v);
    let best = 0;
    for (let r = 0; r < 5; r++) for (const layer of [g.col, g.sym]) {
      const row = Array.from(layer.slice(r * 5, r * 5 + 5));
      best = Math.max(best, Math.max(...row.map(x => row.filter(y => y === x).length)));
    }
    return best;
  };
  const avg = (c: string) => {
    const xs = m.values.filter((_, k) => m.components[k] === c).map(longestRun);
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  assert.ok(avg("structured") > avg("uniform") + 0.2, `${avg("structured")} vs ${avg("uniform")}`);
});

test("extra components (game, self) are appended and validated", () => {
  const live = referenceMixture(inst, "x", { nUniform: 3, nStructured: 0 }).values;
  const m = referenceMixture(inst, "x", { nUniform: 4, nStructured: 2, extra: { game: live } });
  assert.deepEqual(m.components, ["uniform", "uniform", "uniform", "uniform", "structured", "structured", "game", "game", "game"]);
  assert.throws(() => referenceMixture(inst, "x", { nUniform: 1, nStructured: 0, extra: { game: ["not a grid"] } }));
  const w = withComponents(m, { self: [live[0]] });
  assert.equal(w.values.length, 10);
  assert.equal(w.components[9], "self");
});

// ------------------------------------------------------------------------------------------------
// measureAgent behaviour
// ------------------------------------------------------------------------------------------------

const small = referenceMixture(inst, "unit", { nUniform: 48, nStructured: 16 });
const PAINT_ROW_2 = [["paint", { kind: "line", region: [0, 2], colour: 0 }]];

test("a constant agent has I = 0 and pays its expected erasure and motion; the floor is added", async () => {
  const p = await measureAgent(() => PAINT_ROW_2, inst, small, { salt: "unit", perActFloorBits: 0.5 });
  assert.equal(p.decisionBits, 0);
  assert.equal(p.randomized, false);
  // 5 cells × log2 4 on every value where row 2 was not already red (those acts fail: "no change")
  const changed = small.values.filter(v => applyCalls(GRID, inst, v, PAINT_ROW_2).ok).length / small.values.length;
  assert.ok(changed > 0.8);
  close(p.expectedErasure, 10 * changed, 1e-12, "erasure");
  close(p.diagnostics.changeRate, changed, 1e-12, "change rate");
  assert.ok(p.expectedMotion > 0 && p.expectedMotion < 1);
  close(p.perApplicationBits, p.expectedErasure + p.expectedMotion + 0.5, 1e-12, "per application");
  assert.equal(p.expectedActCost, p.perApplicationBits);
  assert.equal(p.diagnostics.replicates, 1);
});

test("an agent that uses random is re-run with R seeds per value and charged I = H(A) − H(A|X)", async () => {
  const seen = new Map<number, Set<bigint>>();
  const p = await measureAgent((_v, seed, at) => {
    (seen.get(at.index) ?? seen.set(at.index, new Set()).get(at.index)!).add(seed);
    const row = Number(seed % 5n);                          // a random row, independent of the grid
    return { calls: [["paint", { kind: "line", region: [0, row], colour: 0 }]], usedRandom: true };
  }, inst, small, { salt: "unit", replicates: 8 });
  assert.equal(p.randomized, true);
  assert.equal(p.diagnostics.replicates, 8);
  for (const s of seen.values()) assert.equal(s.size, 8);
  assert.ok(p.decisionBits < 0.15, `pure noise is not information: ${p.decisionBits}`);
  assert.ok(p.diagnostics.I_plugin! > p.decisionBits);       // the plug-in is biased upwards
  assert.equal(p.binding, "mutual");
});

test("a deterministic function of the grid pays its entropy; a run that throws or errs does nothing", async () => {
  const codec = GRID.codec(inst);
  const reddest = (v: ObjectValue) => {
    const g = codec.decode(v);
    let best = 0, bc = -1;
    for (let r = 0; r < 5; r++) { const c = Array.from(g.col.slice(r * 5, r * 5 + 5)).filter(x => x === 0).length; if (c > bc) { bc = c; best = r; } }
    return [["paint", { kind: "line", region: [0, best], colour: 0 }]];
  };
  const p = await measureAgent(reddest, inst, small, { salt: "unit" });
  assert.ok(p.decisionBits > 1 && p.decisionBits < Math.log2(5) + 0.1, String(p.decisionBits));
  let k = 0;
  const flaky = await measureAgent(v => { if (k++ % 2) throw new Error("boom"); return { calls: reddest(v), error: k % 4 === 1 ? "ran out of steps" : undefined }; },
    inst, small, { salt: "unit" });
  assert.ok(flaky.diagnostics.invalidRate > 0.5);
  assert.ok(flaky.expectedErasure < 10 && flaky.expectedErasure > 0);
  assert.ok(flaky.diagnostics.errors.length > 0);
  // invalid acts are the empty action, and pay nothing but their (shared) decision
  const junk = await measureAgent(() => "not json", inst, small, { salt: "unit" });
  assert.equal(junk.decisionBits, 0);
  assert.equal(junk.expectedErasure, 0);
  assert.equal(junk.diagnostics.invalidRate, 1);
});

test("measureAgent works for Int and string agents too", async () => {
  const ii = INT.instantiate({ min: 0, max: 9999 });
  const mix = referenceMixture(ii, "unit", { nUniform: 64, nStructured: 32 });
  const odd = await measureAgent(v => [["set_digit", { place: 0, digit: (v as number) % 2 ? 1 : 0 }]], ii, mix, { salt: "unit" });
  assert.ok(odd.decisionBits > 0.8 && odd.decisionBits < 1.1, String(odd.decisionBits));
  assert.ok(odd.expectedErasure > 0);
  const si = STRING.instantiate({ maxLength: 16 });
  const smix = referenceMixture(si, "unit", { nUniform: 32, nStructured: 16 });
  const rev = await measureAgent(() => [["truncate", { n: 0 }]], si, smix, { salt: "unit" });
  assert.equal(rev.decisionBits, 0);
  // a constant act whose validity depends on the value carries that bit of information
  const part = await measureAgent(() => [["reverse", { range: [0, 4] }]], si, smix, { salt: "unit" });
  assert.ok(part.diagnostics.invalidRate > 0 && part.decisionBits > 0 && part.decisionBits <= 1.05);
});

test("measureAgent refuses a missing salt or a mixture of another instantiation", async () => {
  await assert.rejects(measureAgent(() => [], inst, small, { salt: "" }));
  const other = referenceMixture(GRID.instantiate({ size: 4, symbols: "base10", colours: "rgby" }), "unit", { nUniform: 2, nStructured: 0 });
  await assert.rejects(measureAgent(() => [], inst, other, { salt: "unit" }));
});

test("actCharge: a valid act pays decision + pointwise erasure + motion + floor; failed or duplicate, decision + floor", () => {
  const g = small.values[0];
  const ok = applyCalls(GRID, inst, g, PAINT_ROW_2);
  assert.ok(ok.ok);
  const price = { decisionBits: 2.5, perActFloorBits: 1 };
  const c = actCharge(price, ok);
  close(c.total, 2.5 + ok.cost.erasure + ok.cost.motion + 1, 1e-12, "valid");
  assert.equal(c.decision, 2.5);
  const bad = applyCalls(GRID, inst, g, "[[\"nope\", {}]]");
  assert.deepEqual(actCharge(price, bad), { decision: 2.5, erasure: 0, motion: 0, floor: 1, total: 3.5 });
  assert.equal(actCharge(price, ok, { duplicate: true }).total, 3.5);
  assert.equal(actCharge({ decisionBits: 0 }, bad).total, 0);
});
