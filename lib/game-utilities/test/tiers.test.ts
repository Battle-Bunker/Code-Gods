/**
 * Tiered rules (archive/engine-v1:docs/layered-rules-design.md): the guard tests.
 *  - A base draw is untouched: no `tiers` key, the same card, shape and table key as before tiers existed.
 *  - A tiered draw's ordinal is [...base, base[0] ≥ gate ? tier : 0]: its base part is the base draw's ordinal, and its
 *    table below the gate is the base's exact law.
 *  - Every dealt tier passes the liveness check on its shape, adds 6 to 20 bits, and the pool's tops stay within 2.5×.
 *  - Shipped tiered tables are fresh, and lookups put a tiered board at or above its base level.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, objectType, seededRng } from "@workspace/game-types";
import { FAMILIES, card, canonicalSupport, context, evaluator, paramsKey, tieredCanonicalSupport, TIER_COMPOSITIONS } from "../src/catalog.ts";
import { analyticFor, instantiateKey, surprisal, tableFor, tableKey, tableKeyParts } from "../src/calibration.ts";
import { shippedInstanceKeys, shippedManifest, shippedTables } from "../src/calibration-data.ts";
import { paramsInDomain } from "../src/params.ts";
import { explainer } from "../src/explain/index.ts";
import { baseParams, isTiered, tiersOf } from "../src/families/grid/tiers.ts";
import { hybridLawOf, tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { baseLaw, liveness, topTierOf, TIER_MAX_ADDED_BITS, TIER_MIN_ADDED_BITS } from "../src/tiers/hybrid.ts";
import { ninesTiers } from "../src/families/grid/beginner/opposite_nines.ts";
import { mirrorTiers } from "../src/families/grid/layered/mirror-tiers.ts";
import { courtTiers } from "../src/families/grid/layered/royal_court.ts";
import { pairTiers } from "../src/families/grid/layered/pair-tiers.ts";
import { threesTiers } from "../src/families/grid/beginner/crosswise_threes.ts";
import type { GridTiers } from "../src/families/grid/tiers.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import type { Ordinal, Params } from "../src/types.ts";

const TIERED = FAMILIES.filter(f => f.tiered);
/** The tier specs by family id (each family exports its own). */
const SPECS: Record<string, GridTiers<any>> = {
  opposite_nines: ninesTiers, mirrormancer: mirrorTiers, kings_and_subjects: courtTiers, two_pair: pairTiers, crosswise_threes: threesTiers,
};
/** Expert draws carry two tiers: together they may add up to 26 bits over the base's top (one tier: 20). */
const EXPERT_BAND = { min: TIER_MIN_ADDED_BITS, max: 26 };
const beginner = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const tup = (o: Ordinal) => (typeof o === "number" ? [o] : [...o]);
const spawn = (n: number, seed: string) => {
  const rng = seededRng(seed), T = objectType("Grid");
  return Array.from({ length: n }, () => String(T.codec(beginner).encode(T.spawn(beginner, rng))));
};

test("families with tiers exist, and every one has its spec listed here", () => {
  assert.ok(TIERED.length >= 1);
  for (const f of TIERED) assert.ok(SPECS[f.id], `${f.id}: add its tier spec to SPECS`);
});

test("base draws are untouched: no tiered draw in any support, and base keys match the shipped manifest", () => {
  const manifest = shippedManifest();
  for (const key of shippedInstanceKeys()) {
    const inst = instantiateKey(key), ctx = context(inst);
    for (const f of TIERED) {
      if (f.objectType !== inst.objectType) continue;
      for (const p of [...f.support(ctx), ...canonicalSupport(f, ctx)]) {
        assert.ok(!("tiers" in p), `${f.id}: a tiered draw is in the support on ${key}`);
        assert.deepEqual(f.shape(ctx, p), f.shape(ctx));
        assert.ok(!/★/.test(f.summary(p, ctx)) && !/★|GATE/.test(f.card.typescript(p, ctx)));
      }
      for (const p of canonicalSupport(f, ctx)) {
        const shipped = manifest.instances[key]?.tables[f.id]?.[paramsKey(p)];
        if (shipped !== undefined) assert.equal(tableKey(f.id, p, inst), shipped, `${f.id} ${paramsKey(p)} on ${key}: the base key changed`);
      }
    }
  }
});

test("tiered draws: in their declared domain, canonical is idempotent, the card names every tier", () => {
  const ctx = context(beginner);
  for (const f of TIERED) {
    const fields = f.params(ctx);
    let n = 0;
    for (const compose of TIER_COMPOSITIONS) for (const depth of [1, 2]) for (const p of f.tiered!(ctx, depth, compose)) {
      n++;
      assert.ok(isTiered(p) && tiersOf(p).length === depth);
      assert.ok(paramsInDomain(fields, p), `${f.id} ${paramsKey(p)} is outside its declared params`);
      const c = f.canonical(p, ctx);
      assert.deepEqual(f.canonical(c, ctx), c);
      const shape = f.shape(ctx, p), k = card({ familyId: f.id, params: p }, ctx);
      assert.equal(shape.kind, "tuple");
      assert.equal(k.tiers?.length, depth);
      assert.ok(k.summary.includes("★ To score even higher"), k.summary);
      assert.ok(k.source.typescript.includes("★") && k.source.python.includes("★"));
      for (const t of k.tiers!) assert.ok(t.index >= 1 && t.gate >= 0 && t.text.length > 20);
    }
    assert.ok(n > 0, `${f.id} deals no tiered draw on ${beginner.key}`);
    for (const p of f.support(ctx)) assert.ok(paramsInDomain(fields, p), `${f.id}: a base draw fell out of its params' domain`);
  }
});

test("params that have been through the engine (an object's keys sorted) are the same draw: in domain, labelled, explained", () => {
  // Convex sorts an object's keys when it encodes a value, so the `tiers` a player's card comes back with is written in
  // another order than the family wrote it. Everything that matches params by content must see one draw, not two.
  const ctx = context(beginner), sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
  for (const f of TIERED) for (const p of [f.tiered!(ctx, 1)[0], f.tiered!(ctx, 1).at(-1)!]) {
    const q = sortKeys(p) as typeof p;
    assert.notEqual(JSON.stringify(q), JSON.stringify(p), `${f.id}: the sorted form differs, so the test means something`);
    assert.ok(paramsInDomain(f.params(ctx), q), `${f.id}: a round-tripped draw is still in the family's domain`);
    assert.deepEqual(f.canonical(q, ctx), f.canonical(p, ctx));
    const shown = card({ familyId: f.id, params: q }, ctx).params.find(x => x.key === "tiers");
    assert.ok(shown && shown.text && !shown.text.includes("object Object"), `${f.id}: the ★ param reads as words, not [object Object]`);
    const e = explainer({ familyId: f.id, params: q }, beginner);
    assert.ok(e?.rich, `${f.id}: a round-tripped tiered draw is still annotated`);
    assert.ok(e!.explain(f.exemplar!(q, ctx))?.verified, `${f.id}: and its units still add up`);
  }
});

test("a tiered ordinal is [...base, base[0] ≥ gate ? tier : 0], and the plain draw gives the same tier without the gate", () => {
  const ctx = context(beginner), boards = spawn(300, "tiers");
  for (const f of TIERED) {
    const gated = f.tiered!(ctx, 1, "gated"), plain = f.tiered!(ctx, 1, "plain");
    for (const p of [gated[0], gated[gated.length - 1]]) {
      const base = evaluator({ familyId: f.id, params: baseParams(p) }, beginner), full = evaluator({ familyId: f.id, params: p }, beginner);
      const gate = tiersOf(p)[0].gate, ungated = evaluator({ familyId: f.id, params: { ...p, tiers: tiersOf(p).map(t => ({ ...t, gate: 0 })) } }, beginner);
      const top = f.exemplar!(baseParams(p), ctx);   // the base's best board: above the gate (a tiered exemplar is a 20 s search)
      let above = 0;
      for (const w of [...boards, top, f.exemplar!(baseParams(p), ctx)]) {
        const b = tup(base(w)), o = tup(full(w)), u = tup(ungated(w));
        assert.deepEqual(o.slice(0, b.length), b, `${f.id}: the base part of the ordinal changed`);
        assert.deepEqual(u.slice(0, b.length), b);
        if (b[0] >= gate) { above++; assert.deepEqual(o, u); } else assert.ok(o.slice(b.length).every(x => x === 0), `${f.id}: a tier point below the gate`);
      }
      assert.ok(above >= 2);
    }
    assert.ok(plain.every(p => tiersOf(p)[0].gate === 0));
  }
});

test("an expert draw's ordinal is [...base, gate ? tier1 : 0, gate ? tier2 : 0]: each tier scores what it scores alone", () => {
  const ctx = context(beginner), boards = spawn(200, "expert");
  let families = 0;
  for (const f of TIERED) {
    const pairs = f.tiered!(ctx, 2);
    if (!pairs.length) continue;
    families++;
    // Canonical pairs are dealt as they are: a pair's two values fold separately, which is only right when neither moves.
    for (const p of pairs) assert.deepEqual(f.canonical(p, ctx), { ...f.canonical(baseParams(p), ctx), tiers: tiersOf(p) }, `${f.id} ${paramsKey(p)}: deal the canonical pair`);
    for (const p of [pairs[0], pairs[pairs.length - 1]]) {
      const [t1, t2] = tiersOf(p), gate = t1.gate;
      assert.equal(t2.gate, gate);
      assert.notEqual(t1.id, t2.id, `${f.id}: an expert draw pairs two different interactions`);
      const base = evaluator({ familyId: f.id, params: baseParams(p) }, beginner), full = evaluator({ familyId: f.id, params: p }, beginner);
      const one = [t1, t2].map(t => evaluator({ familyId: f.id, params: { ...baseParams(p), tiers: [t] } }, beginner));
      let above = 0;
      for (const w of [...boards, f.exemplar!(baseParams(p), ctx), ...[t1, t2].map(t => f.exemplar!({ ...baseParams(p), tiers: [t] }, ctx))]) {
        const b = tup(base(w)), o = tup(full(w));
        assert.equal(o.length, b.length + 2);
        assert.deepEqual(o.slice(0, b.length), b);
        assert.deepEqual(o.slice(b.length), one.map(u => tup(u(w))[b.length]), `${f.id} ${paramsKey(p)} on ${w}`);
        if (b[0] >= gate) above++; else assert.deepEqual(o.slice(b.length), [0, 0]);
      }
      assert.ok(above >= 2);
    }
  }
  assert.ok(families >= 1, "no family deals an expert pair");
});

test("the disjoint units' scores add up to the card's base ordinal", () => {
  const ctx = context(beginner), g = gridSpec(ctx), T = objectType("Grid"), rng = seededRng("units");
  for (const f of TIERED) for (const p of f.support(ctx)) {
    const base = SPECS[f.id].base(p, g);
    if (!base) continue;
    const u = evaluator({ familyId: f.id, params: p }, beginner);
    for (let i = 0; i < 300; i++) {
      const value = T.spawn(beginner, rng) as { cells: { symbol: number }[] } | any;
      const wire = T.codec(beginner).encode(value), syms = String(wire).split("/").flatMap(row => row.split(",").map(cell => "0123456789ABCDEF".indexOf(cell[0])));
      const sum = base.units.map(unit => base.score(unit.map(c => syms[c]))).reduce((a, s) => a.map((x, k) => x + s[k]));
      assert.deepEqual(sum, tup(u(wire)), `${f.id}: units do not add up on ${wire}`);
    }
  }
});

test("below the gate a tiered table is the base's exact law, level for level", () => {
  const ctx = context(beginner), g = gridSpec(ctx);
  for (const f of TIERED) {
    const p = f.tiered!(ctx, 1)[0], law = hybridLawOf(f.id, SPECS[f.id], p, ctx)!, gate = tiersOf(p)[0].gate;
    const exact = baseLaw(SPECS[f.id].base(baseParams(p), g)!);
    let above = 0;
    const below = law.levels.filter(([o]) => o[0] < gate);
    const want = exact.filter(l => l.ordinal[0] < gate);
    assert.equal(below.length, want.length);
    for (let i = exact.length - 1; i >= 0; i--) {
      above += exact[i].p;
      if (exact[i].ordinal[0] >= gate) continue;
      const level = below.find(([o]) => o.slice(0, exact[i].ordinal.length).join() === exact[i].ordinal.join())!;
      assert.ok(Math.abs(level[1] - Math.log2(above)) < 1e-9, `${f.id}: level ${level[0].join(",")}`);
      assert.ok(level[0].slice(exact[i].ordinal.length).every(x => x === 0));
    }
    // And the analytic header: its own label and bound, never the exact or approx route.
    const a = analyticFor(f.id, f.canonical(p, ctx), beginner)!;
    assert.equal(a.kind, "hybrid");
    assert.match(a.id, /-hybrid@\d+$/);
    assert.equal(tableKeyParts(f.id, f.canonical(p, ctx), beginner).exact, a.id);
  }
});

test("liveness: every dealt tier varies at the base's top, adds 6 to 20 bits, and no uniform or two-digit board maxes it", () => {
  // Read off the shipped tables (the hybrid law's levels), so the check covers exactly what scores.
  const ctx = context(beginner), g = gridSpec(ctx), tables = shippedTables(beginner.key);
  const tops: number[] = [], letter = spawn(1, "letter")[0].split(",")[0].slice(1);   // the board's one colour, as the wire writes it
  const check = (f: (typeof TIERED)[number], c: Params, band?: { min: number; max: number }) => {
    const t = tableFor(tables, { familyId: f.id, params: c }, beginner);
    assert.ok(t, `${f.id} ${paramsKey(c)}: no shipped table`);
    const baseShape = f.shape(ctx), baseArity = baseShape.kind === "scalar" ? 1 : baseShape.arity;
    const score = evaluator({ familyId: f.id, params: c }, beginner);
    const wire = (b: Uint8Array) => Array.from({ length: g.N }, (_, r) => Array.from(b.slice(r * g.N, (r + 1) * g.N), x => "0123456789ABCDEF"[x] + letter).join(",")).join("/");
    const live = liveness(topTierOf(t.levels, baseArity), g.N, g.S, b => tup(score(wire(b))), band);
    assert.deepEqual(live.problems, [], `${f.id} ${paramsKey(c)}: ${live.problems.join("; ")}`);
    return t.meta.maxBits;
  };
  for (const f of TIERED) {
    const seen = new Set<string>();
    for (const p of f.tiered!(ctx, 1)) {
      const c = f.canonical(p, ctx);
      if (seen.has(paramsKey(c))) continue;
      seen.add(paramsKey(c));
      tops.push(check(f, c));
    }
    // Lab values are alive too; only the band is waived.
    for (const p of f.tiered!(ctx, 1, "uncapped")) {
      const c = f.canonical(p, ctx);
      if (seen.has(paramsKey(c))) continue;
      seen.add(paramsKey(c));
      check(f, c, { min: 0, max: 99 });
    }
    // Expert pairs: the two tiers together, against the wider band (their tops are not in the one-tier pool's spread).
    for (const p of f.tiered!(ctx, 2)) {
      const c = f.canonical(p, ctx);
      if (seen.has(paramsKey(c))) continue;
      seen.add(paramsKey(c));
      check(f, c, EXPERT_BAND);
    }
  }
  // The pool of tiered rules: tops within 2.5× of each other (archive/engine-v1:docs/layered-rules-design.md §8.3).
  assert.ok(Math.max(...tops) / Math.min(...tops) <= 2.5, `tops ${Math.min(...tops).toFixed(1)}..${Math.max(...tops).toFixed(1)}`);
});

test("the shipped table of a tiered draw is the hybrid law, rebuilt bit for bit (one draw per family)", { timeout: 300_000 }, () => {
  const ctx = context(beginner), tables = shippedTables(beginner.key);
  for (const f of TIERED) {
    const c = f.canonical(f.tiered!(ctx, 1)[0], ctx), t = tableFor(tables, { familyId: f.id, params: c }, beginner)!;
    const law = hybridLawOf(f.id, SPECS[f.id], c, ctx)!, live = tierLiveness(f.id, SPECS[f.id], c, ctx)!;
    assert.equal(t.levels.length, law.levels.length);
    t.levels.forEach(([o, bits], i) => { assert.deepEqual(tup(o), [...law.levels[i][0]]); // A table's clean-up keeps levels strictly increasing by at least MIN_STEP_BITS (1e-6) each, so level i may sit up to (i + 1) steps above the law.
      assert.ok(Math.abs(bits + law.levels[i][1]) < 2e-6 * (i + 1), `level ${i}`); });
    assert.ok(live.addedBits >= TIER_MIN_ADDED_BITS && live.addedBits <= TIER_MAX_ADDED_BITS && live.problems.length === 0);
  }
});

test("shipped tiered tables: fresh on every shape that deals them, labelled hybrid, and a tier point never scores below its base level", () => {
  const boards = spawn(200, "lookup");
  for (const key of shippedInstanceKeys()) {
    const inst = instantiateKey(key);
    if (inst.objectType !== "Grid") continue;
    const ctx = context(inst), tables = shippedTables(key);
    for (const f of TIERED) for (const p of tieredCanonicalSupport(f, ctx)) {
      const t = tableFor(tables, { familyId: f.id, params: p }, inst);
      assert.ok(t, `${f.id} ${paramsKey(p)} on ${key}: no fresh shipped table (pnpm --filter @workspace/game-utilities calibrate --families ${f.id})`);
      const unlock = tiersOf(p)[0].compose === "unlock";
      if (!unlock) assert.match(String(t.estimator.budget), /^hybrid:/);
      if (key !== beginner.key || unlock) continue;
      const base = tableFor(tables, { familyId: f.id, params: baseParams(p) }, inst);
      const full = evaluator({ familyId: f.id, params: p }, inst), plain = evaluator({ familyId: f.id, params: baseParams(p) }, inst);
      const gate = tiersOf(p)[0].gate;
      for (const w of [...boards, f.exemplar!(baseParams(p) as Params, ctx)]) {
        const bits = surprisal(t, full(w));
        assert.ok(bits >= 0 && Number.isFinite(bits));
        // Below the gate the tiered rule is its base: the two tables agree up to the base table's own sampling error.
        if (base && gate > 0 && tup(plain(w))[0] < gate) assert.ok(Math.abs(bits - surprisal(base, plain(w))) < 1.5, `${f.id} on ${w}: ${bits} vs base ${surprisal(base, plain(w))}`);
      }
    }
  }
});
