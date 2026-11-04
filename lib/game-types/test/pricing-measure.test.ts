/**
 * measureAgent, actCharge and the reference mixture (docs/energy-model.md §2, §5).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GRID, INT, STRING, actCharge, applyCalls, gridFromHex, isSkip, measureAgent, mixtureFromHexFixture, readBound,
  referenceMixture, withComponents, type ObjectValue,
} from "../src/index.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`./pricing-data/${f}`, import.meta.url), "utf8"));
const REF = read("reference_grids_5_base10_rgby.json");
const inst = GRID.instantiate({ size: 5, symbols: "base10", colours: "rgby" });
const close = (a: number, b: number, tol: number, what: string) =>
  assert.ok(a === b || Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// ------------------------------------------------------------------------------------------------
// the published reference grids
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

test("a constant agent that reads nothing pays only its change, and only where it changes something", async () => {
  const p = await measureAgent(() => PAINT_ROW_2, inst, small, { salt: "unit" });
  assert.equal(p.randomized, false);
  assert.equal(p.expectedRead, 0);
  const outs = small.values.map(v => applyCalls(GRID, inst, v, PAINT_ROW_2));
  const changed = outs.filter(o => o.ok).length / small.values.length;
  assert.ok(changed > 0.8);
  close(p.diagnostics.changeRate, changed, 1e-12, "change rate");
  close(p.expectedChange, outs.reduce((s, o) => s + (o.ok ? o.cost.total : 0), 0) / outs.length, 1e-9, "change");
  close(p.expectedActCost, p.expectedRead + p.expectedChange, 1e-12, "per act");
  assert.equal(p.diagnostics.skipRate, 0);
});

test("a skipper pays its reads only; skips are not failures", async () => {
  let k = 0;
  const p = await measureAgent(() => ({ calls: k++ % 2 ? "[]" : JSON.stringify(PAINT_ROW_2), readBits: 3 }), inst, small, { salt: "unit" });
  close(p.expectedRead, 3, 1e-12, "read");
  close(p.diagnostics.skipRate, 0.5, 1e-12, "skip rate");
  assert.ok(p.diagnostics.invalidRate < 0.2, String(p.diagnostics.invalidRate));
  const never = await measureAgent(() => ({ calls: "[]", readBits: 1.5 }), inst, small, { salt: "unit" });
  assert.deepEqual([never.expectedRead, never.expectedChange, never.expectedActCost, never.diagnostics.skipRate], [1.5, 0, 1.5, 1]);
  const none = await measureAgent(() => null, inst, small, { salt: "unit" });
  assert.equal(none.expectedActCost, 0);
});

test("a run that raises or errs does nothing but still pays what it read", async () => {
  let k = 0;
  const flaky = await measureAgent(() => { if (k++ % 2) throw new Error("boom"); return { calls: PAINT_ROW_2, readBits: 2, error: "ran out of steps" }; },
    inst, small, { salt: "unit" });
  assert.equal(flaky.diagnostics.invalidRate, 1);
  close(flaky.expectedRead, 1, 1e-12, "half the runs read 2 bits");
  assert.equal(flaky.expectedChange, 0);
  const junk = await measureAgent(() => "not json", inst, small, { salt: "unit" });
  assert.equal(junk.expectedActCost, 0);
  assert.equal(junk.diagnostics.invalidRate, 1);
});

test("measureAgent works for Int and string agents too", async () => {
  const ii = INT.instantiate({ min: 0, max: 9999 });
  const mix = referenceMixture(ii, "unit", { nUniform: 64, nStructured: 32 });
  const odd = await measureAgent(v => ({ calls: [["set_digit", { place: 0, digit: (v as number) % 2 ? 1 : 0 }]], readBits: Math.log2(10) }), ii, mix, { salt: "unit" });
  close(odd.expectedRead, Math.log2(10), 1e-12, "read");
  assert.ok(odd.expectedChange > 0);
  const si = STRING.instantiate({ maxLength: 16 });
  const smix = referenceMixture(si, "unit", { nUniform: 32, nStructured: 16 });
  const part = await measureAgent(() => [["reverse", { range: [0, 4] }]], si, smix, { salt: "unit" });
  assert.ok(part.diagnostics.invalidRate > 0 && part.diagnostics.changeRate > 0);
});

test("measureAgent refuses a missing salt or a mixture of another instantiation", async () => {
  await assert.rejects(measureAgent(() => [], inst, small, { salt: "" }));
  const other = referenceMixture(GRID.instantiate({ size: 4, symbols: "base10", colours: "rgby" }), "unit", { nUniform: 2, nStructured: 0 });
  await assert.rejects(measureAgent(() => [], inst, other, { salt: "unit" }));
});

test("actCharge has no fixed part: reads, plus the change only when it commits", () => {
  const g = small.values[0];
  const ok = applyCalls(GRID, inst, g, PAINT_ROW_2);
  assert.ok(ok.ok);
  const change = ok.cost.total;
  assert.deepEqual(actCharge(ok, 2.5), { read: 2.5, change, total: 2.5 + change });
  assert.deepEqual(actCharge(ok, 0), { read: 0, change, total: change });
  // a collision or the commit clause: the change does not commit, the reads are still paid
  assert.deepEqual(actCharge(ok, 2.5, { commits: false }), { read: 2.5, change: 0, total: 2.5 });
  const bad = applyCalls(GRID, inst, g, "[[\"nope\", {}]]");
  assert.deepEqual(actCharge(bad, 1), { read: 1, change: 0, total: 1 });
  // skipped (no outcome) after reading nothing costs nothing at all
  assert.deepEqual(actCharge(null, 0), { read: 0, change: 0, total: 0 });
  assert.equal(actCharge(null, Number.NaN).total, 0);
  assert.equal(actCharge(null, -3).total, 0);
});

test("isSkip: an empty call list, None/null, or a clause around no calls", () => {
  for (const x of ["[]", "null", []]) assert.equal(isSkip(x), true, JSON.stringify(x));
  assert.equal(isSkip('{"calls":[],"commit":"if-improves"}'), true);
  for (const x of ['[["add",{"k":1}]]', "not json", "{}"]) assert.equal(isSkip(x), false, x);
});

test("readBound: an unreadable meter is charged the whole object's information", () => {
  close(readBound(GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" })), 16 * (Math.log2(10) + Math.log2(3)), 1e-9, "4×4 grid");
  close(readBound(INT.instantiate({ min: -2147483648, max: 2147483647 })), 32, 1e-9, "Int32");
});
