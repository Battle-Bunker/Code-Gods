/**
 * Calibration tables: determinism and keys, lookup semantics, statistical sanity on fresh spawns, and freshness of
 * every shipped table against the current code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, objectType, seededRng, type Instantiation } from "@workspace/game-types";
import { available, context, evaluator, family, familiesFor } from "../src/catalog.ts";
import { cardProgram } from "../src/families/card.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ESTIMATOR, REGENERATE_COMMAND, cmpOrdinal, coverage, hasTable, instanceTables, keyFromParts, manifestEntry, manifestOf,
  offeredInstantiations, penaltyMeanBits, priorMeanBits, softHinge, surprisal, tableFor, tableKey, tableKeyParts,
  type CalibrationFile, type CalibrationTable,
} from "../src/calibration.ts";
import { CALIBRATION_DIR, shippedFile, shippedInstanceKeys, shippedManifest, shippedTables } from "../src/calibration-data.ts";
import type { Ordinal } from "../src/types.ts";
import { SMOKE_BUDGET, buildTable, tableJson, thin, THIN_BITS } from "../scripts/estimator.ts";

const FILES: Record<string, CalibrationFile> = Object.fromEntries(shippedInstanceKeys().map(k => [k, shippedFile(k)!]));
const TABLES: CalibrationTable[] = Object.values(FILES).flatMap(f => f.tables);
const MANIFEST = shippedManifest();
const instOf = (key: string): Instantiation => {
  const e = MANIFEST.instances[key];
  return objectType(e.objectType).instantiate(e.args);
};

// ------------------------------------------------------------------------------------------------
// determinism and keys
// ------------------------------------------------------------------------------------------------

test("determinism: the same key gives a byte-identical table", () => {
  const cases: [string, Instantiation][] = [
    ["digit-devotee", instantiate("Int", {})],
    ["digit-devotee", instantiate("Int", { min: 0, max: 9999 })],
    ["echo", instantiate("string", { maxLength: 16 })],
    ["seed3_green_ones", instantiate("Grid", { size: 4, symbols: "base12", colours: "rgby" })],
  ];
  for (const [id, inst] of cases) {
    const p = family(id).support(context(inst))[0];
    const canon = family(id).canonical(p, context(inst));
    const a = tableJson(buildTable(id, canon, inst, SMOKE_BUDGET).table);
    const b = tableJson(buildTable(id, canon, inst, SMOKE_BUDGET).table);
    assert.equal(a, b, `${id} on ${inst.key}`);
    assert.equal(JSON.parse(a).key, tableKey(id, canon, inst));
  }
});

test("keys change with the card program, the prelude, the estimator, the params and the instance", () => {
  const inst = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgby" });
  const parts = tableKeyParts("seed3_green_ones", { colour: 0, value: 0 }, inst);
  const k = keyFromParts(parts);
  assert.equal(k, tableKey("seed3_green_ones", { colour: 0, value: 0 }, inst));
  assert.match(k, /^[0-9a-f]{64}$/);
  const variants = [
    { ...parts, card: parts.card.replace(/^./, c => (c === "0" ? "1" : "0")) },
    { ...parts, prelude: parts.prelude.replace(/^./, c => (c === "0" ? "1" : "0")) },
    { ...parts, estimator: { ...parts.estimator, version: ESTIMATOR.version + 1 } },
    { ...parts, estimator: { ...parts.estimator, id: "other" } },
    { ...parts, params: { colour: 1, value: 0 } },
    { ...parts, instance: "Grid(5,base10,rgb)" },
    { ...parts, entry: "penalty" },
  ];
  const keys = new Set([k, ...variants.map(keyFromParts)]);
  assert.equal(keys.size, variants.length + 1);
  // The card hash really is the evaluated body: different params render a different card.
  assert.notEqual(tableKeyParts("seed3_green_ones", { colour: 1, value: 0 }, inst).card, parts.card);
  // And the prelude hash differs between instantiations.
  assert.notEqual(tableKeyParts("seed3_green_ones", { colour: 0, value: 0 }, instantiate("Grid", { size: 4, symbols: "base12", colours: "rgby" })).prelude, parts.prelude);
});

test("cardProgram: prose and notes never reach the key; code, strings and constants do", () => {
  const card = [
    "// 🐟 Go Fish Books", "// Your fish is the number A (10 in base 12).", "const MY_FISH = 10;  // A",
    "", "function utility(grid) {", '  const s = "a // not a comment";  /* gone */', "  return MY_FISH;  // done", "}",
  ].join("\n");
  assert.equal(cardProgram(card), ['const MY_FISH = 10;', "function utility(grid) {", '  const s = "a // not a comment";', "  return MY_FISH;", "}"].join("\n"));
  const reworded = card.replace("number A (10 in base 12)", "symbol A").replace("// A", "// ten");
  assert.equal(cardProgram(reworded), cardProgram(card));
  assert.notEqual(cardProgram(card.replace("= 10", "= 11")), cardProgram(card));
  assert.notEqual(cardProgram(card.replace("not a comment", "not a coment")), cardProgram(card));
});

test("the host evaluates the program it keys: every card's program scores spawns exactly like its full source", () => {
  const shapes = [instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" }), instantiate("Grid", { size: 4, symbols: "base12", colours: "rgb" }),
    instantiate("Int", objectType("Int").defaults), instantiate("string", objectType("string").defaults)];
  for (const inst of shapes) {
    const ctx = context(inst), T = objectType(inst.objectType), rng = seededRng(`program:${inst.key}`), prelude = T.prelude(inst).js;
    const boards = Array.from({ length: 4 }, () => T.codec(inst).encode(T.spawn(inst, rng)));
    for (const f of familiesFor(inst.objectType)) {
      if (!available(f, inst).ok) continue;
      const p = f.support(ctx)[0], name = f.role === "penalty" ? "penalty" : "utility";
      const full = new Function(`"use strict";\n${prelude}\n;\n${f.card.typescript(p, ctx)}\n;\nreturn (w) => ${name}(__decode(w));`)();
      const u = evaluator({ familyId: f.id, params: p }, inst);
      for (const b of boards) assert.deepEqual(u(b), full(b), `${f.id} on ${inst.key}`);
    }
  }
});

// ------------------------------------------------------------------------------------------------
// lookup semantics
// ------------------------------------------------------------------------------------------------

/** Ordinals around every level: the levels, ±1 in each component, and far below / above. */
function probes(t: CalibrationTable): Ordinal[] {
  const out: Ordinal[] = [];
  for (const [o] of t.levels) {
    out.push(o);
    if (typeof o === "number") out.push(o - 1, o + 1, o + 0.5);
    else for (let i = 0; i < o.length; i++) for (const d of [-1, 1, 7]) out.push(o.map((x, j) => (j === i ? x + d : x)));
  }
  const first = t.levels[0][0], last = t.levels[t.levels.length - 1][0];
  if (typeof first === "number") out.push(first - 1000, (last as number) + 1000);
  else {
    out.push(first.map((x, j) => (j === 0 ? x - 1000 : x)), (last as readonly number[]).map((x, j) => (j === 0 ? x + 1000 : x)));
  }
  return out;
}

test("lookup: every shipped table is strictly increasing, interpolates between levels and extrapolates above the top", () => {
  assert.ok(TABLES.length > 0, `no shipped tables; run ${REGENERATE_COMMAND}`);
  for (const t of TABLES) {
    const where = `${t.family} ${JSON.stringify(t.canonicalParams)} on ${t.instance}`;
    for (let i = 1; i < t.levels.length; i++) {
      assert.ok(cmpOrdinal(t.levels[i - 1][0], t.levels[i][0]) < 0, `${where}: ordinals not increasing`);
      assert.ok(t.levels[i - 1][1] < t.levels[i][1], `${where}: bits not increasing`);
    }
    assert.ok(t.levels[0][1] > 0 && t.slope > 0, where);
    const ps = probes(t).sort(cmpOrdinal).filter((o, i, a) => i === 0 || cmpOrdinal(a[i - 1], o) !== 0);
    let prev = -1;
    for (const o of ps) {
      const s = surprisal(t, o);
      assert.ok(Number.isFinite(s) && s > 0 && s > prev, `${where}: s(${JSON.stringify(o)}) = ${s} after ${prev}`);
      prev = s;
    }
    // Exact at levels; interpolation stays between neighbours; extrapolation is uncapped.
    for (const [o, b] of t.levels) assert.equal(surprisal(t, o), b);
    const [top, tb] = t.levels[t.levels.length - 1];
    const far = typeof top === "number" ? top + 1e6 : top.map((x, j) => (j === 0 ? x + 1e6 : x));
    assert.ok(surprisal(t, far) > tb + 1e4 * 0.05, `${where}: extrapolation capped`);
  }
});

test("lookup: scalar interpolation is linear in ordinal distance", () => {
  const t = { levels: [[0, 1], [10, 11], [20, 31]], slope: 2 } as unknown as CalibrationTable;
  assert.equal(surprisal(t, 5), 6);
  assert.equal(surprisal(t, 15), 21);
  assert.equal(surprisal(t, 25), 41);
  assert.equal(surprisal(t, -1), 0.5);
  assert.equal(surprisal(t, 10), 11);
});

test("thinning keeps the first and last levels and never drops more than THIN_BITS between kept levels", () => {
  const levels = Array.from({ length: 1000 }, (_, i) => i), bits = levels.map(i => 1e-6 + i * 0.013);
  const t = thin(levels, bits);
  assert.equal(t.levels[0], 0);
  assert.equal(t.levels[t.levels.length - 1], 999);
  for (let i = 1; i < t.levels.length; i++) {
    if ((t.levels[i] as number) - (t.levels[i - 1] as number) > 1) assert.ok(t.bits[i] - t.bits[i - 1] <= THIN_BITS + 1e-12);
  }
  assert.ok(t.levels.length < 200);
});

test("penaltyMeanBits = E_μ[softHinge(s)] and matches the stored value; softHinge matches game-core's formula", () => {
  assert.equal(softHinge(0), 0);
  assert.ok(Math.abs(softHinge(1) - (1 - Math.log2(1.5))) < 1e-12);
  for (const s of [0.3, 2, 10, 40]) assert.ok(Math.abs(softHinge(s) - (Math.log2(1 + 2 ** (s - 1)) - Math.log2(1.5))) < 1e-9);
  let penalties = 0;
  for (const t of TABLES) {
    const role = family(t.family).role;
    if (role === "penalty") {
      penalties++;
      assert.ok(t.penaltyMeanBits !== undefined, `${t.family} on ${t.instance}: no penaltyMeanBits`);
      assert.ok(Math.abs(t.penaltyMeanBits! - penaltyMeanBits(t)) < 1e-6);
      assert.ok(t.penaltyMeanBits! > 0 && t.penaltyMeanBits! < 3, `${t.family}: E h = ${t.penaltyMeanBits}`);
    } else assert.equal(t.penaltyMeanBits, undefined);
    // E_μ[s] of a continuous-ish table is about 1/ln 2 = 1.44 bits; discrete ties make it smaller.
    const m = priorMeanBits(t);
    assert.ok(m >= 0 && m < 2.5, `${t.family} ${JSON.stringify(t.canonicalParams)} on ${t.instance}: E s = ${m}`);
  }
  assert.ok(penalties > 0);
});

// ------------------------------------------------------------------------------------------------
// statistics on fresh spawns
// ------------------------------------------------------------------------------------------------

const FRESH = 400;
/** Families whose exemplar is computed exactly, so no calibrated level can be above it. */
const EXACT_EXEMPLARS = new Set(["tetromino_tamer", "snake_charmer", "colour_mixer"]);

test("fresh spawns: median s⁺ ≤ 2 bits, P(s ≥ k) ≤ 2^-k within tolerance, exemplars reach high bits", () => {
  const pooled = new Array(9).fill(0);
  let pooledN = 0;
  const lowExemplars: string[] = [];
  for (const [instKey, file] of Object.entries(FILES)) {
    const inst = instOf(instKey), T = objectType(inst.objectType), codec = T.codec(inst), ctx = context(inst);
    const rng = seededRng(`fresh:${instKey}`);
    const wires = Array.from({ length: FRESH }, () => codec.encode(T.spawn(inst, rng)));
    for (const t of file.tables) {
      const where = `${t.family} ${JSON.stringify(t.canonicalParams)} on ${instKey}`;
      const ev = evaluator({ familyId: t.family, params: t.canonicalParams }, inst);
      const s = wires.map(w => surprisal(t, ev(w))).sort((a, b) => a - b);
      assert.ok(s[FRESH >> 1] <= 2, `${where}: median s⁺ = ${s[FRESH >> 1]}`);
      for (let k = 1; k <= 8; k++) {
        const hits = s.filter(x => x >= k).length, expect = FRESH * 2 ** -k;
        pooled[k] += hits;
        // Binomial upper tail at ~5 sd plus 3 (per table, so a few hundred tables do not trip it by chance).
        assert.ok(hits <= expect + 5 * Math.sqrt(expect) + 3, `${where}: P(s ≥ ${k}) = ${hits}/${FRESH} > 2^-${k}`);
      }
      const f = family(t.family);
      if (f.exemplar) {
        const best = ev(f.exemplar(t.canonicalParams, ctx)), ex = surprisal(t, best), top = t.levels[t.levels.length - 1][0];
        assert.ok(ex >= s[FRESH - 1], `${where}: exemplar ${ex} bits below a random spawn's ${s[FRESH - 1]}`);
        // The estimator records whether the exemplar's ordinal is among the levels; the key does not cover the
        // exemplar, so a changed exemplar can leave the flag stale without making the table stale. (Mixture tables
        // copy the uniform table's meta, so only uniform tables are checked.)
        if (!t.prior) assert.equal(t.meta.topReached, cmpOrdinal(best, top) <= 0, `${where}: stale meta.topReached`);
        if (EXACT_EXEMPLARS.has(t.family)) {
          assert.ok(cmpOrdinal(best, top) >= 0, `${where}: exact exemplar ${JSON.stringify(best)} below the level ${JSON.stringify(top)}`);
        }
        if (ex < 8) lowExemplars.push(`${where}: ${ex.toFixed(1)}`);
      }
    }
    pooledN += file.tables.length * FRESH;
  }
  // Pooled over every table: P(s ≥ k)·2^k ≤ 1.1 (ties make it < 1; the margin covers estimator noise).
  for (let k = 1; k <= 8; k++) {
    const ratio = pooled[k] / pooledN * 2 ** k;
    assert.ok(ratio <= 1.1, `pooled P(s ≥ ${k})·2^${k} = ${ratio.toFixed(3)}`);
  }
  // Exemplars are the family's best value: almost all reach high bits (the few exceptions are small domains or
  // families whose top is common, e.g. Int(0,9999) where 13.3 bits is the most any value can have).
  const allowed = TABLES.length * 0.15;
  assert.ok(lowExemplars.length <= allowed, `exemplars below 8 bits:\n${lowExemplars.join("\n")}`);
});

// ------------------------------------------------------------------------------------------------
// freshness and registry
// ------------------------------------------------------------------------------------------------

test("every shipped table's key matches the current code (else regenerate)", () => {
  const stale: string[] = [];
  for (const [instKey, file] of Object.entries(FILES)) {
    const inst = instOf(instKey);
    for (const t of file.tables) {
      if (t.key !== tableKey(t.family, t.canonicalParams, inst)) stale.push(`${t.family} ${JSON.stringify(t.canonicalParams)} on ${instKey}`);
    }
  }
  assert.deepEqual(stale, [], `${stale.length} calibration tables are stale (a family card, a prelude or the estimator changed). `
    + `Regenerate with: ${REGENERATE_COMMAND}`);
});

test("manifest.json describes exactly the shipped files (else regenerate)", () => {
  const onDisk = readFileSync(join(CALIBRATION_DIR, "manifest.json"), "utf8");
  assert.equal(onDisk, JSON.stringify(MANIFEST) + "\n", `manifest.json is out of date; regenerate with: ${REGENERATE_COMMAND}`);
});

test("every dealable draw of every shipped instantiation has a fresh table, so all are offered", () => {
  for (const instKey of Object.keys(MANIFEST.instances)) {
    const c = coverage(MANIFEST, instOf(instKey));
    assert.deepEqual(c.missing.map(m => `${m.familyId} ${JSON.stringify(m.params)}${m.stale ? " (stale)" : ""}`), [],
      `${instKey} lacks tables; regenerate with: ${REGENERATE_COMMAND}`);
  }
  const offered = ["Int", "string", "Grid"].flatMap(t => offeredInstantiations(MANIFEST, t)).map(i => i.key);
  assert.deepEqual(offered.sort(), Object.keys(MANIFEST.instances).sort());
  assert.ok(offered.includes("Grid(5,base10,rgby)") && offered.includes("Int(-2147483648,2147483647)") && offered.includes("string(128)"));
  assert.ok(!offeredInstantiations(MANIFEST, "Grid").some(i => i.terms.size === 3), "3×3 grids are retired from play");
});

test("offered follows the manifest it is given: an instance without an entry, or with a stale key, is not offered", () => {
  const key = "Grid(5,base10,rgby)", entry = MANIFEST.instances[key];
  const without = manifestOf(Object.entries(MANIFEST.instances).filter(([k]) => k !== key));
  assert.ok(offeredInstantiations(MANIFEST, "Grid").some(i => i.key === key));
  assert.ok(!offeredInstantiations(without, "Grid").some(i => i.key === key));
  // One table key off by a digit: that draw is stale, so the instantiation is not offered.
  const [familyId, byParams] = Object.entries(entry.tables)[0], [pk, k] = Object.entries(byParams)[0];
  const staleKey = k.replace(/^./, c => (c === "0" ? "1" : "0"));
  const stale = manifestOf(Object.entries(MANIFEST.instances).map(([ik, e]) => [ik, ik !== key ? e
    : { ...e, tables: { ...e.tables, [familyId]: { ...byParams, [pk]: staleKey } } }] as const));
  assert.ok(!offeredInstantiations(stale, "Grid").some(i => i.key === key));
  assert.ok(coverage(stale, instOf(key)).missing.some(m => m.familyId === familyId && m.stale));
  // …unless the room excludes that family.
  assert.ok(offeredInstantiations(stale, "Grid", { excludedFamilies: [familyId] }).some(i => i.key === key));
  // The order is the manifest's.
  assert.deepEqual(offeredInstantiations(MANIFEST, "Grid").map(i => i.key), Object.keys(MANIFEST.instances).filter(k => k.startsWith("Grid(")));
});

test("manifestEntry lists every table of a file by family and canonical params", () => {
  const file = FILES["Int(0,9999)"], e = manifestEntry(file);
  assert.equal(e.objectType, "Int");
  assert.deepEqual(e.args, { max: 9999, min: 0 });
  assert.equal(Object.values(e.tables).reduce((n, byParams) => n + Object.keys(byParams).length, 0), file.tables.length);
  assert.throws(() => manifestEntry({ ...file, instance: "Int(0,9998)" }), /is in the file of/);
  assert.throws(() => instanceTables("Int(0,9998)", file), /given as/);
});

test("offered ignores excluded families: excluded rules need no tables", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const ex = ["bridge_builder", "fair_weaver", "ladder_of_numbers", "lantern_lighter", "sudoku_scholar"];
  const all = coverage(MANIFEST, inst, []), dflt = coverage(MANIFEST, inst, ex);
  assert.ok(offeredInstantiations(MANIFEST, "Grid", { excludedFamilies: i => (i.key === inst.key ? ex : []) }).some(i => i.key === inst.key));
  assert.ok(dflt.missing.every(m => !ex.includes(m.familyId)));
  assert.ok(dflt.tables <= all.tables);
  // An exclusion can only shrink what is required.
  assert.ok(coverage(MANIFEST, inst, [...ex, "seed1_line_painter"]).missing.length <= dflt.missing.length);
});

test("tableFor canonicalises raw draws and serves fresh tables only", () => {
  const inst = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgby" }), ctx = context(inst), tables = shippedTables(inst.key);
  const f = family("seed3_green_ones");
  for (const p of f.support(ctx)) {
    const t = tableFor(tables, { familyId: f.id, params: p }, inst);
    assert.ok(t, JSON.stringify(p));
    assert.equal(t!.key, tableKey(f.id, f.canonical(p, ctx), inst));
    assert.ok(hasTable(tables, { familyId: f.id, params: p }, inst));
  }
  assert.equal(tableFor(tables, { familyId: "digit-devotee", params: { d: 3 } }, inst), undefined);
  // Nothing shipped for an instantiation: an empty set, every lookup misses.
  const none = instantiate("Grid", { size: 3, symbols: "cards", colours: "rgb" });
  assert.equal(hasTable(instanceTables(none.key, null), { familyId: "seed3_green_ones", params: { colour: 0, value: 0 } }, none), false);
  // A stale table (its key no longer the current code's) is never served.
  const p0 = f.canonical(f.support(ctx)[0], ctx), fresh = tableFor(tables, { familyId: f.id, params: p0 }, inst)!;
  const staleFile: CalibrationFile = { format: "v1", instance: inst.key, tables: [{ ...fresh, key: fresh.key.replace(/^./, c => (c === "0" ? "1" : "0")) }] };
  assert.equal(tableFor(instanceTables(inst.key, staleFile), { familyId: f.id, params: p0 }, inst), undefined);
  // Tables of one instantiation are never used for another.
  assert.throws(() => tableFor(tables, { familyId: f.id, params: p0 }, instantiate("Grid", { size: 5, symbols: "base10", colours: "rgb" })), /used for/);
});

test("families with analytics (picture_frame, lone_peak) are keyed by the formula id and reproduce the cards' spawn frequencies", async () => {
  const { analyticFor, tableKeyParts: parts } = await import("../src/calibration.ts");
  const { compareWithSpawns } = await import("../src/analytic-verify.ts");
  for (const familyId of ["picture_frame", "lone_peak"]) {
    for (const args of [{ size: 5, symbols: "base10", colours: "rgby" }, { size: 4, symbols: "cards", colours: "rgb" }, { size: 3, symbols: "base16", colours: "rgb" }]) {
      const inst = instantiate("Grid", args), ctx = context(inst), f = family(familyId);
      if (!(await import("../src/catalog.ts")).available(f, inst).ok) continue;
      const p = f.canonical(f.support(ctx)[0], ctx), a = analyticFor(familyId, p, inst);
      assert.ok(a && a.kind === "exact", `${familyId} on ${inst.key}`);
      assert.equal(parts(familyId, p, inst).exact, a!.id);
      const s = compareWithSpawns(a!, { familyId, params: p }, inst, 20000);
      assert.deepEqual(s.unlisted, [], `${familyId} on ${inst.key}: spawned ordinals missing from the analytic`);
      assert.deepEqual(s.disagreements, [], `${familyId} on ${inst.key}`);
    }
  }
});

test("mixture prior: G_ρ = ½·G_uniform + ½·(pool share) exactly at every level; keyed by the pool's content", async () => {
  const { mixtureTable, poolPrior, MIXTURE_DISPLAY_SCALE } = await import("../scripts/mixture.ts");
  const { UNIFORM_PRIOR, displayScale } = await import("../src/calibration.ts");
  const inst = instantiate("Int", { min: 0, max: 9999 });
  const uniform = buildTable("digit-devotee", { d: 7 }, inst).table; // exact enumeration: G_uniform is exact
  assert.match(String(uniform.estimator.budget), /^exact(:|$)/); // exact enumeration or digit-devotee's exact analytic
  const pool = { id: "synthetic", instance: inst.key, wires: [7777, 7770, 1234, 7, 0, 77] };
  const mix = mixtureTable(uniform, pool, inst);
  const count = (k: number) => pool.wires.filter(x => String(x).split("").filter(c => c === "7").length >= k).length;
  const Gu = (k: number) => {
    let c = 0;
    for (let x = 0; x <= 9999; x++) if (String(x).split("").filter(ch => ch === "7").length >= k) c++;
    return c / 10000;
  };
  for (const [o, bits] of uniform.levels) assert.ok(Math.abs(2 ** -bits - Gu(o as number)) < 1e-9 + 1e-6 * Gu(o as number));
  for (const [o, bits] of mix.levels) {
    const k = o as number, want = -Math.log2(0.5 * 2 ** -surprisal(uniform, k) + 0.5 * count(k) / pool.wires.length);
    assert.ok(Math.abs(bits - Math.max(want, 1e-6)) < 1e-6, `k=${k}: ${bits} vs ${want}`);
  }
  // Above the top: ½·G_uniform, i.e. exactly one bit more than uniform, at the uniform slope.
  assert.equal(mix.slope, uniform.slope);
  assert.ok(Math.abs(surprisal(mix, 9) - (surprisal(uniform, 9) + 1)) < 1e-6);
  assert.equal(displayScale(mix), MIXTURE_DISPLAY_SCALE);
  assert.equal(displayScale(uniform), 1);
  // Keys: the prior is part of the key, and the pool's content is part of the prior.
  const prior = poolPrior(pool);
  assert.notEqual(mix.key, uniform.key);
  assert.equal(mix.key, tableKey("digit-devotee", { d: 7 }, inst, prior));
  assert.equal(uniform.key, tableKey("digit-devotee", { d: 7 }, inst, UNIFORM_PRIOR));
  assert.notEqual(poolPrior({ ...pool, wires: [...pool.wires, 1] }).version, prior.version);
  assert.notEqual(tableKey("digit-devotee", { d: 7 }, inst, poolPrior({ ...pool, wires: [1] })), mix.key);
  // Byte-identical, and strictly increasing.
  assert.equal(tableJson(mixtureTable(uniform, pool, inst)), tableJson(mix));
  for (let i = 1; i < mix.levels.length; i++) assert.ok(mix.levels[i][1] > mix.levels[i - 1][1]);
  // Not shipped: the registry serves uniform tables only unless a mixture is shipped.
  assert.equal(tableFor(shippedTables(inst.key), { familyId: "digit-devotee", params: { d: 7 } }, inst, prior), undefined);
  assert.throws(() => mixtureTable(uniform, { ...pool, wires: [-5] }, inst));
});

test("shipped priors: uniform first, then every prior the manifest has tables for", async () => {
  const { shippedPriors, UNIFORM_PRIOR } = await import("../src/calibration.ts");
  const priors = shippedPriors(MANIFEST);
  assert.deepEqual(priors[0], UNIFORM_PRIOR);
  const listed = new Set(Object.values(MANIFEST.instances).flatMap(e => Object.keys(e.priors ?? {})));
  assert.deepEqual(priors.slice(1).map(p => `${p.id}@${p.version}`).sort(), [...listed].sort(), "no prior with tables is left out");
  assert.equal(new Set(priors.map(p => p.id)).size, priors.length, "one entry per prior id");
});

test("every shape the type can instantiate is playable, shipped tables or not; only retired shapes are not", async () => {
  const { playableInstantiations, isPlayableInstantiation, firstUseSeconds, offeredInstantiations } = await import("../src/calibration.ts");
  const { instantiate } = await import("@workspace/game-types");
  const grid = playableInstantiations("Grid");
  assert.equal(grid.length, 48, "sizes 4–7 × 4 symbol sets × 3 colour sets");
  assert.equal(grid[0]!.key, instantiate("Grid", {}).key, "the type's default first");
  assert.equal(grid[0]!.key, "Grid(4,base10,ryb)");
  assert.ok(!grid.some(i => i.args.colours === "rgb"), "red, green, blue is no longer offered (stored rooms keep it)");
  const { coverage } = await import("../src/calibration.ts");
  assert.equal(coverage(shippedManifest(), grid[0]!, []).missing.length, 0, "the default shape ships every table: its first game starts at once");
  const { legacyInstantiations } = await import("../src/calibration.ts");
  const legacy = legacyInstantiations("Grid");
  assert.equal(legacy.length, 16, "rgb × sizes 4–7 × 4 symbol sets: stored rooms' shapes");
  assert.ok(legacy.every(i => i.args.colours === "rgb") && legacy.every(i => coverage(shippedManifest(), i, []).missing.length === 0), "every rgb shape still ships its tables");
  assert.deepEqual(legacyInstantiations("Int"), []);
  assert.ok(!grid.some(i => i.terms.size === 3), "3×3 stays retired");
  assert.equal(isPlayableInstantiation(instantiate("Grid", { size: 3, symbols: "base10", colours: "rgb" })), false);
  assert.deepEqual(playableInstantiations("Int").map(i => i.key), ["Int(-2147483648,2147483647)", "Int(-2147483648,9999)", "Int(0,2147483647)", "Int(0,9999)"]);
  assert.deepEqual(playableInstantiations("string").map(i => i.key), ["string(128)", "string(16)"]);
  // Shipping is diagnostics now: an Int range nobody calibrated is still playable.
  const shipped = new Set(offeredInstantiations(shippedManifest(), "Int").map(i => i.key));
  assert.ok(!shipped.has("Int(0,2147483647)") && isPlayableInstantiation(instantiate("Int", { min: 0, max: 2147483647 })));
  // The first-use estimate is the measured cloud wall time (architecture.md §9): per Grid size, nearest size otherwise.
  assert.deepEqual([4, 5, 6, 7].map(size => firstUseSeconds(instantiate("Grid", { size, symbols: "base10", colours: "rgb" }))), [35, 30, 30, 95]);
  assert.equal(firstUseSeconds(instantiate("string", { maxLength: 20 })), 15);
});
