/**
 * Mirrormancer's tiers (src/families/grid/layered/mirror-tiers.ts; docs/layered-rules-measurements/mirror-tiers.md):
 * the tiered ordinal on hand-checked boards, the gate, the base left exactly as shipped (card, table key, ordinal), the
 * disjoint-unit base, the symmetries the shared tables rely on, and the liveness of every dealt value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { context, evaluator, family, paramsKey } from "../src/catalog.ts";
import { tableKey } from "../src/calibration.ts";
import { shippedManifest } from "../src/calibration-data.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { mulberry32 } from "../src/tiers/hybrid.ts";
import { MIRROR_GATE, mirrorTiers } from "../src/families/grid/layered/mirror-tiers.ts";
import type { Params } from "../src/types.ts";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), ctx = context(inst), g = gridSpec(ctx);
const f = family("mirrormancer");
/** "7337/7447/0770/7117" as a wire value (all cells red). */
const wire = (rows: string) => rows.split("/").map(r => [...r].map(d => `${d}R`).join(",")).join("/");
const transpose = (rows: string) => { const r = rows.split("/"); return r.map((_, c) => r.map(row => row[c]).join("")).join("/"); };
const tiered = (axis: "LR" | "TB", tier: Params): Params => ({ axis, tiers: [{ ...tier, gate: MIRROR_GATE }] });
const score = (p: Params, rows: string) => evaluator({ familyId: "mirrormancer", params: p }, inst)(wire(rows));
const randomRows = (rng: () => number) => Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Math.floor(rng() * 10)).join("")).join("/");
/** Boards near the top: every row a mirror, then `breaks` cells redrawn. */
const nearTop = (rng: () => number, breaks: number) => {
  const d = () => (Math.floor(rng() * 4) * 3) % 10;                     // few digits (0, 3, 6, 9), so repeats and totals happen
  const rows = Array.from({ length: 4 }, () => { const a = d(), b = d(); return [a, b, b, a]; });
  for (let i = 0; i < breaks; i++) rows[Math.floor(rng() * 4)][Math.floor(rng() * 4)] = d();
  return rows.map(r => r.join("")).join("/");
};

test("holding: each different mirror row holding exactly two ys, counted from the gate up", () => {
  const p = tiered("LR", { id: "holding", y: 7 });
  assert.deepEqual(score(p, "7337/7447/0770/7117"), [4, 8, 4], "four different mirrors, two 7s each");
  assert.deepEqual(score(p, "7337/7337/0770/1221"), [4, 8, 2], "7337 twice counts once; 1221 holds no 7");
  assert.deepEqual(score(p, "7777/7777/7777/7777"), [4, 8, 0], "four 7s are not two");
  assert.deepEqual(score(p, "7337/3773/3773/7337"), [4, 8, 2], "a two-digit board stops at 2");
  assert.deepEqual(score(p, "7337/7447/0770/7118"), [3, 7, 3], "at the gate (3 mirrors) the tier counts; 7118 is no mirror");
  assert.deepEqual(score(p, "7337/7447/0771/7118"), [2, 6, 0], "below the gate the tier is 0");
});

test("halves: each different mirror row whose half adds up to x with two different numbers", () => {
  const p = tiered("LR", { id: "halves", x: 10 });
  assert.deepEqual(score(p, "7337/7447/0770/7117"), [4, 8, 1], "only 7 + 3 makes 10");
  assert.deepEqual(score(p, "5555/7337/3773/1991"), [4, 8, 3], "5 + 5 is one number twice; 7337 and 3773 are different mirrors");
  assert.deepEqual(score(p, "7337/7337/7337/7337"), [4, 8, 1]);
  assert.deepEqual(score(p, "7337/3773/1991/9118"), [3, 7, 3]);
  assert.deepEqual(score(p, "7337/3773/1992/9118"), [2, 6, 0], "below the gate");
});

test("columns: the tier on TB is the transpose of the tier on LR, and both share one table", () => {
  const rng = mulberry32(11);
  for (const tier of [{ id: "holding", y: 3 }, { id: "halves", x: 9 }]) {
    const lr = tiered("LR", tier), tb = tiered("TB", tier);
    assert.deepEqual(f.canonical(tb, ctx), f.canonical(lr, ctx));
    assert.equal((f.canonical(tb, ctx) as Params).axis, "LR");
    for (let i = 0; i < 300; i++) {
      const b = i % 2 ? randomRows(rng) : nearTop(rng, i % 3);
      assert.deepEqual(score(tb, transpose(b)), score(lr, b), b);
    }
  }
  assert.deepEqual(score(tiered("TB", { id: "holding", y: 7 }), transpose("7337/7447/0770/7117")), [4, 8, 4]);
});

test("the shared tables are exact: every y is one class (relabel the digits), and x folds with 18 − x (9 − digit)", () => {
  const rng = mulberry32(5);
  const map = (b: string, to: (d: number) => number) => b.replace(/\d/g, d => String(to(Number(d))));
  assert.deepEqual(f.canonical(tiered("LR", { id: "holding", y: 7 }), ctx), f.canonical(tiered("TB", { id: "holding", y: 2 }), ctx));
  assert.deepEqual(f.canonical(tiered("LR", { id: "halves", x: 11 }), ctx), f.canonical(tiered("LR", { id: "halves", x: 7 }), ctx));
  assert.notDeepEqual(f.canonical(tiered("LR", { id: "halves", x: 8 }), ctx), f.canonical(tiered("LR", { id: "halves", x: 7 }), ctx));
  for (let i = 0; i < 400; i++) {
    const b = i % 2 ? randomRows(rng) : nearTop(rng, i % 3);
    // Swapping the digits 3 and 6 everywhere keeps every mirror and turns "two 3s" into "two 6s".
    const swapped = map(b, d => (d === 3 ? 6 : d === 6 ? 3 : d));
    assert.deepEqual(score(tiered("LR", { id: "holding", y: 6 }), swapped), score(tiered("LR", { id: "holding", y: 3 }), b), b);
    // 9 − digit keeps every mirror and turns a half adding up to x into one adding up to 18 − x.
    assert.deepEqual(score(tiered("LR", { id: "halves", x: 12 }), map(b, d => 9 - d)), score(tiered("LR", { id: "halves", x: 6 }), b), b);
  }
});

test("the base is untouched: its card, its table key, and the base part of every tiered ordinal", () => {
  const base = { axis: "LR" };
  assert.equal(tableKey("mirrormancer", base, inst), shippedManifest().instances[inst.key].tables.mirrormancer[paramsKey(base)]);
  for (const lang of ["typescript", "python"] as const) for (const axis of ["LR", "TB"]) {
    const card = f.card[lang]({ axis }, ctx);
    assert.ok(!/GATE|lines =/.test(card), "a base card carries nothing of the tiers");
    assert.match(card, axis === "LR" ? /(in|of) grid\.rows/ : /(in|of) grid\.columns/);
  }
  assert.deepEqual(f.support(ctx), [{ axis: "LR" }, { axis: "TB" }]);
  const rng = mulberry32(3), draws = f.tiered!(ctx, 1);
  assert.ok(draws.length > 0);
  for (let i = 0; i < 200; i++) {
    const b = i % 2 ? randomRows(rng) : nearTop(rng, i % 4), p = draws[i % draws.length];
    const whole = score(p, b) as number[], plain = score({ axis: p.axis }, b) as number[];
    assert.deepEqual(whole.slice(0, 2), plain, b);
    assert.equal(whole.length, 3);
    if (plain[0] < MIRROR_GATE) assert.equal(whole[2], 0, b);
  }
});

test("the disjoint base: the rows' (columns') unit scores add up to the base ordinal", () => {
  const rng = mulberry32(7);
  for (const axis of ["LR", "TB"] as const) {
    const base = mirrorTiers.base({ axis }, g)!;
    assert.equal(base.units.length, 4);
    for (let i = 0; i < 500; i++) {
      const b = i % 2 ? randomRows(rng) : nearTop(rng, i % 4), cells = b.replace(/\//g, "");
      const sum = [0, 0];
      for (const u of base.units) { const s = base.score(u.map(c => Number(cells[c]))); sum[0] += s[0]; sum[1] += s[1]; }
      assert.deepEqual(sum, score({ axis }, b), `${axis} ${b}`);
    }
  }
});

test("tiers are dealt only where they were measured (4×4 digits)", () => {
  assert.ok(mirrorTiers.dealt(g).length > 0);
  for (const args of [{ size: 5, symbols: "base10", colours: "rgb" }, { size: 4, symbols: "base12", colours: "rgb" }, { size: 6, symbols: "base10", colours: "rgb" }]) {
    const c = context(instantiate("Grid", args));
    assert.deepEqual(mirrorTiers.dealt(gridSpec(c)), [], JSON.stringify(args));
    assert.deepEqual(family("mirrormancer").tiered!(c, 1), []);
  }
});

test("every dealt value is alive: it varies at the base's top, adds 6 to 20 bits, and no two-digit board tops it", () => {
  const seen = new Set<string>();
  for (const p of f.tiered!(ctx, 1)) {
    const canon = f.canonical(p, ctx), key = paramsKey(canon);
    if (seen.has(key)) continue;
    seen.add(key);
    const live = tierLiveness("mirrormancer", mirrorTiers, canon, ctx)!;
    assert.deepEqual(live.problems, [], key);
    assert.equal(live.tierTop, 4, key);
    assert.ok(live.addedBits >= 6 && live.addedBits <= 20, `${key}: ${live.addedBits}`);
  }
  assert.equal(seen.size, 4, "one table for holding (every y), three for halves (x = 7, 8, 9, shared with 11, 10)");
});
