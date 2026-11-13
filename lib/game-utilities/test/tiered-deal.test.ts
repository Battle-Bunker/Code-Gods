/**
 * Dealing tiered rules (docs/layered-rules-design.md): `SelectOptions.tiers` deals only a family's tiered draws
 * (`UtilityFamily.tiered`), uniformly over the families that offer some and then over their draws; without the option a
 * deal is exactly what it was before tiers existed. What would break: a base draw in a tiered game, a tiered draw in an
 * ordinary one, one family's many tiered draws crowding out another family, or an existing pool's deals changing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng } from "@workspace/game-types";
import {
  availableFamilies, candidatesFor, context, coverage, dealableParams, family, familiesFor, paramsKey, selector, tieredCanonicalSupport,
  type CalibrationManifest,
} from "../src/index.ts";

const MONO4 = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const CLASSIC = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgby" });
const SELECTORS = ["fair-aligned", "divine-lottery"];
const tiersOf = (params: unknown) => (params as { tiers?: unknown }).tiers;

test("without the tiers option a deal is what it was before tiers existed (recorded deals, fixed seeds)", () => {
  // Recorded on the commit before `SelectOptions.tiers` existed.
  for (const sel of SELECTORS) {
    assert.deepEqual(selector(sel).select(MONO4, 4, seededRng(7), { exclude: ["snap"] }), [
      { familyId: "looking_glass", params: { axis: "H" } }, { familyId: "two_pair", params: {} },
      { familyId: "spread_three", params: {} }, { familyId: "staircase_climber", params: { direction: "↓" } },
    ], sel);
  }
  assert.deepEqual(selector("fair-aligned").select(CLASSIC, 3, seededRng(11), { defenceGoals: true }), [
    { familyId: "mirrormancer", params: { axis: "TB" }, penalty: { familyId: "hate_repeat_row", params: { row: 1 } } },
    { familyId: "full_house", params: { axis: "cols" }, penalty: { familyId: "hate_colour", params: { colour: "green" } } },
    { familyId: "bingo_caller", params: { called: ["1", "4", "6", "9"] }, penalty: { familyId: "hate_symbol_takeover", params: {} } },
  ]);
  // An ordinary deal never holds a tiered draw: tiered draws are outside every family's support.
  for (let seed = 1; seed <= 30; seed++) {
    for (const d of selector("divine-lottery").select(MONO4, 6, seededRng(seed))) assert.equal(tiersOf(d.params), undefined, d.familyId);
  }
});

test("with the tiers option every dealt rule is a tiered draw of a family that offers that depth and composition", () => {
  const ctx = context(MONO4);
  const offering = familiesFor("Grid", "reward").filter(f => f.tiered?.(ctx, 1).length);
  assert.ok(offering.some(f => f.id === "opposite_nines"), "opposite nines offers tiers on the 4×4 board of numbers");
  assert.deepEqual(availableFamilies(MONO4, "reward", [], { depth: 1 }).map(f => f.id), offering.map(f => f.id), "the tiered pool: the families with tiered draws");
  const nines = family("opposite_nines");
  assert.deepEqual(dealableParams(nines, ctx, { depth: 1 }), nines.tiered!(ctx, 1), "gated, by default");
  assert.deepEqual(dealableParams(nines, ctx, { depth: 1, compose: "plain" }), nines.tiered!(ctx, 1, "plain"));
  assert.ok(nines.tiered!(ctx, 1).length >= 10 && nines.tiered!(ctx, 1, "plain").length >= 1 && nines.tiered!(ctx, 1, "plain").every(p => (p as { tiers: { gate: number }[] }).tiers[0].gate === 0));
  assert.deepEqual(dealableParams(family("opposite_nines"), ctx), [{}], "no tiers: the support");
  for (const compose of [undefined, "plain", "unlock"] as const) {
    const tiers = { depth: 1, ...(compose ? { compose } : {}) };
    const allowed = new Map(offering.map(f => [f.id, new Set(f.tiered!(ctx, 1, compose).map(paramsKey))]));
    const count = Math.min(3, [...allowed.values()].reduce((n, s) => n + s.size, 0));
    for (const sel of SELECTORS) for (let seed = 1; seed <= 10; seed++) {
      const deal = selector(sel).select(MONO4, count, seededRng(seed), { tiers });
      assert.equal(deal.length, count);
      for (const d of deal) {
        assert.ok(Array.isArray(tiersOf(d.params)), `${sel} ${compose}: ${d.familyId} carries tiers`);
        assert.ok(allowed.get(d.familyId)?.has(paramsKey(d.params)), `${sel} ${compose}: ${paramsKey(d)} is one of the family's tiered draws`);
      }
    }
  }
  // An excluded family is not dealt, tiers or not; defence goals are dealt as ever (no tiers on them).
  const others = offering.filter(f => f.id !== "opposite_nines").map(f => f.id);
  const withDefence = selector("divine-lottery").select(CLASSIC.objectType === "Grid" ? MONO4 : MONO4, 2, seededRng(3), { tiers: { depth: 1 }, exclude: others, defenceGoals: true });
  for (const d of withDefence) {
    assert.equal(d.familyId, "opposite_nines");
    assert.ok(d.penalty && tiersOf(d.penalty.params) === undefined, "a defence goal has no tiers");
  }
});

test("a tiered draw is uniform over the families, then over the family's tiered draws", () => {
  // One seat, many deals: each offering family is drawn equally often, and within opposite nines each of its tiered
  // draws equally often.
  const ctx = context(MONO4);
  const offering = familiesFor("Grid", "reward").filter(f => f.tiered?.(ctx, 1).length);
  const N = 6000, byFamily = new Map<string, number>(), byDraw = new Map<string, number>();
  const rng = seededRng(2026);
  for (let i = 0; i < N; i++) {
    const [d] = selector("divine-lottery").select(MONO4, 1, rng, { tiers: { depth: 1 } });
    byFamily.set(d!.familyId, (byFamily.get(d!.familyId) ?? 0) + 1);
    if (d!.familyId === "opposite_nines") byDraw.set(paramsKey(d!.params), (byDraw.get(paramsKey(d!.params)) ?? 0) + 1);
  }
  const share = N / offering.length;
  for (const f of offering) assert.ok(Math.abs((byFamily.get(f.id) ?? 0) - share) <= 5 * Math.sqrt(share), `${f.id}: about 1/${offering.length} of deals (${byFamily.get(f.id)})`);
  const mine = byFamily.get("opposite_nines")!, draws = family("opposite_nines").tiered!(ctx, 1);
  assert.equal(byDraw.size, draws.length, "every tiered draw of the family is dealt");
  for (const [key, n] of byDraw) assert.ok(Math.abs(n - mine / draws.length) < 5 * Math.sqrt(mine / draws.length), `${key}: about 1/${draws.length} of the family's deals (${n})`);
});

test("no family offering tiers there: the deal fails like an empty pool", () => {
  // The beginner board offers both depths; no other shipped board offers either.
  for (const depth of [1, 2] as const) {
    assert.ok(availableFamilies(MONO4, "reward", [], { depth }).length > 0, `the beginner board offers ${depth}`);
    assert.deepEqual(availableFamilies(CLASSIC, "reward", [], { depth }), []);
    assert.throws(() => selector("divine-lottery").select(CLASSIC, 1, seededRng(1), { tiers: { depth } }), /No calibrated utility family is available for Grid\(5,base10,rgby\)/);
    assert.throws(() => selector("fair-aligned").select(CLASSIC, 1, seededRng(1), { tiers: { depth } }), /No calibrated utility family is available/);
  }
});

test("what a tiered game can deal: inference candidates and table coverage name the tiered draws, not the base ones", () => {
  const ctx = context(MONO4), nines = family("opposite_nines");
  const tiers = { depth: 1 } as const;
  const candidates = candidatesFor(MONO4, { tiers });
  assert.ok(candidates.length > 0 && candidates.every(c => c.role === "reward" && Array.isArray(tiersOf(c.params))));
  assert.deepEqual(candidates.filter(c => c.familyId === "opposite_nines").map(c => paramsKey(c.params)), nines.tiered!(ctx, 1).map(paramsKey));
  assert.ok(candidatesFor(MONO4, {}).every(c => tiersOf(c.params) === undefined), "an ordinary game's candidates are unchanged");
  // Coverage of an empty manifest: every dealable draw is missing. Tiered: the canonical tiered draws of that depth.
  const empty = { instances: {} } as unknown as CalibrationManifest;
  const tiered = coverage(empty, MONO4, [], undefined, tiers).missing;
  const canonical = [...new Set(nines.tiered!(ctx, 1).map(p => paramsKey(nines.canonical(p, ctx))))];
  assert.deepEqual(tiered.filter(m => m.familyId === "opposite_nines").map(m => paramsKey(m.params)), canonical);
  assert.ok(canonical.every(k => tieredCanonicalSupport(nines, ctx).some(p => paramsKey(p) === k)), "among the family's canonical tiered draws");
  assert.ok(tiered.every(m => family(m.familyId).role === "penalty" || Array.isArray(tiersOf(m.params))), "no base reward draw needs a table");
  assert.deepEqual(coverage(empty, MONO4).missing.filter(m => m.familyId === "opposite_nines").map(m => paramsKey(m.params)), ["{}"], "an ordinary game: the base draw");
});
