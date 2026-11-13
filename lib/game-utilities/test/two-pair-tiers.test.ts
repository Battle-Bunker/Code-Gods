/**
 * ✌️ Two Pair's tiers (src/families/grid/layered/pair-tiers.ts; docs/layered-rules-measurements/two-pair.md): the
 * tiered ordinal on hand-checked boards, the gate, the base left exactly as shipped, the disjoint-unit base, the
 * symmetries the shared tables rely on, the Python card against the host, and the liveness of every dealt value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { instantiate, objectType } from "@workspace/game-types";
import { context, evaluator, family, paramsKey } from "../src/catalog.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { mulberry32 } from "../src/tiers/hybrid.ts";
import { PAIR_INTERACTIONS, pairTiers } from "../src/families/grid/layered/pair-tiers.ts";
import { readBoard } from "../src/explain/index.ts";
import { MORE_TIER_LENSES } from "../src/explain/tier-lenses-more.ts";
import type { Params } from "../src/types.ts";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), ctx = context(inst), g = gridSpec(ctx);
const ID = "two_pair", f = family(ID), GATE = pairTiers.gate(g);
const wire = (rows: string) => rows.split("/").map(r => [...r].map(d => `${d}R`).join(",")).join("/");
const tiered = (...tiers: Params[]): Params => ({ tiers: tiers.map(t => ({ ...t, gate: GATE })) });
const compiled = new Map<string, (w: string) => unknown>();
const score = (p: Params, rows: string) => {
  const key = paramsKey(p);
  if (!compiled.has(key)) compiled.set(key, evaluator({ familyId: ID, params: p }, inst) as (w: string) => unknown);
  return compiled.get(key)!(wire(rows));
};
const randomRows = (rng: () => number, digits = 10) => Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Math.floor(rng() * digits)).join("")).join("/");
/** A board at the base's top: every box two different pairs, in a random arrangement, from few digits so links happen. */
const topRows = (rng: () => number, digits = 5) => {
  const b = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  for (const [r, c] of [[0, 0], [0, 2], [2, 0], [2, 2]]) {
    const a = Math.floor(rng() * digits), other = (a + 1 + Math.floor(rng() * (digits - 1))) % digits;
    const layout = [[a, a, other, other], [a, other, a, other], [a, other, other, a]][Math.floor(rng() * 3)];
    [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([dr, dc], i) => { b[r + dr][c + dc] = layout[i]; });
  }
  return b.map(r => r.join("")).join("/");
};

// One link: the left boxes share the 3s. The other neighbours share nothing; 8 is shared only across the diagonal.
const ONE = "3355/8877/3311/9988";
// A ring: 8 links top, 4 links left, 2 links right and bottom. Box totals 24, 20 / 12, 6.
const RING = "8828/4428/4211/2422";

test("links: neighbouring boxes that share exactly one pair", () => {
  assert.equal(GATE, 4);
  assert.deepEqual(score(tiered({ id: "links" }), ONE), [4, 0, 1]);
  assert.deepEqual(score(tiered({ id: "links" }), RING), [4, 0, 4]);
  assert.deepEqual(score(tiered({ id: "links" }), "3388/8833/3388/8833"), [4, 0, 0], "a two-number board shares both pairs everywhere: no link");
  assert.deepEqual(score(tiered({ id: "links" }), "3838/3838/8383/8383"), [4, 0, 0]);
});

test("linkSums: links whose two boxes add up to x; linksVia: links whose shared number is y", () => {
  for (const [x, want] of [[44, 1], [26, 1], [18, 1], [36, 1], [20, 0]]) assert.deepEqual(score(tiered({ id: "linkSums", x }), RING), [4, 0, want], `x = ${x}`);
  assert.deepEqual(score(tiered({ id: "linkSums", x: 46 }), ONE), [4, 0, 1]);
  // Totals alone do not make a link: the top boxes of ONE add up to 46 too (22 + 24) but share no pair.
  assert.deepEqual(score(tiered({ id: "linkSums", x: 34 }), ONE), [4, 0, 0], "3 3 9 9 and 1 1 8 8 add up to 34 but share no pair");
  assert.deepEqual(score(tiered({ id: "linkSums", x: 14 }), "1055/0111/6000/6011"), [4, 0, 4]);
  assert.deepEqual(score(tiered({ id: "linksVia", y: 2 }), RING), [4, 0, 2]);
  assert.deepEqual(score(tiered({ id: "linksVia", y: 8 }), RING), [4, 0, 1]);
  assert.deepEqual(score(tiered({ id: "linksVia", y: 8 }), ONE), [4, 0, 0], "boxes that only touch at a corner are not neighbours");
  assert.deepEqual(score(tiered({ id: "linksVia", y: 3 }), ONE), [4, 0, 1]);
});

test("equalRoads: equal numbers side by side, counted by exact length", () => {
  assert.deepEqual(score(tiered({ id: "equalRoads", y: 2 }), ONE), [4, 0, 8]);
  // RING: 8 8 2 (3 cells: 8,8 then the 8 below the 2? no) is checked cell by cell below.
  //   8 8 2 8      roads: 88 (2), the 2s of column 2 (2), the 8s of column 3 (2), 44 + 4 below (3), 2 2 … (see the counts)
  //   4 4 2 8
  //   4 2 1 1
  //   2 4 2 2
  assert.deepEqual(score(tiered({ id: "equalRoads", y: 3 }), RING), [4, 0, 1], "4 4 over 4");
  assert.deepEqual(score(tiered({ id: "equalRoads", y: 1 }), RING), [4, 0, 3], "the lone 2s and 4 of the bottom-left box");
  assert.deepEqual(score(tiered({ id: "equalRoads", y: 4 }), "3333/8888/3333/8888"), [4, 0, 4]);
});

test("below the gate the tier is 0; ungated, the same links count", () => {
  const three = "3355/8877/3311/9981";   // the bottom-right box holds one pair
  assert.deepEqual(score({}, three), [3, 1]);
  for (const it of PAIR_INTERACTIONS) assert.deepEqual(score(tiered({ id: it.id, x: 46, y: 3 }), three), [3, 1, 0], it.id);
  assert.deepEqual(score({ tiers: [{ id: "links", gate: 0 }] }, three), [3, 1, 1]);
  // Three of a kind holds no pair: 3 3 / 3 8 beside 3 3 / 9 9 is no link.
  assert.deepEqual(score({ tiers: [{ id: "links", gate: 0 }] }, "3355/3877/3311/9988"), [3, 1, 0]);
});

test("the base is untouched: no tiers key, the same card, and its units add up to the card's ordinal", () => {
  assert.deepEqual(f.support(ctx), [{}]);
  const card = f.card.typescript({} as never, ctx);
  assert.ok(!/★|GATE|boxAt/.test(card));
  const base = pairTiers.base({} as never, g)!, u = evaluator({ familyId: ID, params: {} }, inst), rng = mulberry32(3);
  assert.equal(base.units.length, 4);
  for (let i = 0; i < 300; i++) {
    const rows = i % 2 ? randomRows(rng, 4) : topRows(rng), cells = rows.replace(/\//g, "").split("").map(Number);
    const sum = base.units.map(unit => base.score(unit.map(c => cells[c]))).reduce((a, s) => [a[0] + s[0], a[1] + s[1]]);
    assert.deepEqual(u(wire(rows)), sum, rows);
  }
});

test("the shared tables are exact: x folds with 72 − x (9 − digit), every y of linksVia is one class (relabel the digits)", () => {
  const rng = mulberry32(5), map = (b: string, to: (d: number) => number) => b.replace(/\d/g, d => String(to(Number(d))));
  assert.deepEqual(f.canonical(tiered({ id: "linkSums", x: 50 }) as never, ctx), f.canonical(tiered({ id: "linkSums", x: 22 }) as never, ctx));
  assert.deepEqual(f.canonical(tiered({ id: "linksVia", y: 7 }) as never, ctx), f.canonical(tiered({ id: "linksVia", y: 2 }) as never, ctx));
  for (let i = 0; i < 300; i++) {
    const b = i % 3 ? topRows(rng) : randomRows(rng, 4);
    assert.deepEqual(score(tiered({ id: "linkSums", x: 50 }), map(b, d => 9 - d)), score(tiered({ id: "linkSums", x: 22 }), b), b);
    assert.deepEqual(score(tiered({ id: "linksVia", y: 7 }), map(b, d => (d === 7 ? 2 : d === 2 ? 7 : d))), score(tiered({ id: "linksVia", y: 2 }), b), b);
  }
});

test("the card says the base first, then the ★ block with the gate", () => {
  const dealt = pairTiers.dealt(g);
  assert.ok(dealt.length >= 3, "tiers are dealt on 4×4 digits");
  const text = f.summary(tiered(dealt[0]) as never, ctx);
  assert.match(text, /^Try to fill each of the 4 corner boxes with two different pairs/);
  assert.match(text, /★ To score even higher: First get 4 boxes with two different pairs\. Two boxes that share a border are linked .* scores 1 tertiary point\./);
  for (const lang of ["python", "typescript"] as const) assert.match(f.card[lang](tiered(dealt[0]) as never, ctx), /GATE = 4/);
});

// The Python cards against the host (TypeScript) evaluator: the base and every interaction's nested function.
const PY = `
import json, sys
data = json.load(sys.stdin)
out = []
for case in data["cases"]:
    scope = {"__name__": "card"}
    exec(data["prelude"], scope)
    exec(case["source"], scope)
    got = [scope["utility"](scope["__decode"](w)) for w in data["wires"]]
    out.append([list(o) for o in got])
print(json.dumps(out))
`;
test("the Python cards score what the host scores (base and every interaction)", () => {
  const rng = mulberry32(9), boards = [ONE, RING, ...Array.from({ length: 60 }, (_, i) => (i % 3 ? topRows(rng) : randomRows(rng, 4)))];
  const draws: Params[] = [{}, ...PAIR_INTERACTIONS.map(it => tiered({ id: it.id, x: 14 + 2 * (it.id.length % 3), y: 2 })),
    { tiers: [{ id: "links", gate: 0 }] }, tiered({ id: "linkSums", x: 16 }, { id: "linksVia", y: 0 })];
  const cases = draws.map(p => ({ source: f.card.python(p as never, ctx) }));
  const run = spawnSync("python3", ["-c", PY], { input: JSON.stringify({ prelude: objectType("Grid").prelude(inst).python, cases, wires: boards.map(wire) }), encoding: "utf8", maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  const got = JSON.parse(run.stdout) as number[][][];
  draws.forEach((p, i) => boards.forEach((b, k) => assert.deepEqual(got[i][k], score(p, b), `${paramsKey(p)} on ${b}`)));
});

test("the link tiers' tops, exactly: a link depends only on which two numbers each box holds (45⁴ choices)", () => {
  const sets: number[][] = [];
  for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) sets.push([a, b]);
  const n = sets.length, shared = sets.map(s => sets.map(t => { const c = s.filter(x => t.includes(x)); return c.length === 1 ? c[0] : -1; }));
  const total = sets.map(([a, b]) => 2 * (a + b));
  const tops = new Map<string, number>(), bump = (k: string) => tops.set(k, (tops.get(k) ?? 0) + 1);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (shared[i][j] < 0) continue;
    for (let k = 0; k < n; k++) {
      if (shared[j][k] < 0) continue;
      for (let l = 0; l < n; l++) {
        if (shared[k][l] < 0 || shared[l][i] < 0) continue;      // four links: the tier's top
        bump("links");
        if (shared[i][j] === 0 && shared[j][k] === 0 && shared[k][l] === 0 && shared[l][i] === 0) bump("via");
        const x = total[i] + total[j];
        if (total[j] + total[k] === x && total[k] + total[l] === x && total[l] + total[i] === x) bump(`sum${x}`);
      }
    }
  }
  const bits = (k: string) => -Math.log2((tops.get(k) ?? 0) / n ** 4);
  assert.ok(Math.abs(bits("links") - 5.72) < 0.01, "plain links: under the band (Lab)");
  assert.ok(Math.abs(bits("via") - 9.96) < 0.01);
  for (const v of pairTiers.dealt(g)) {
    if (v.id !== "linkSums") continue;
    const added = bits(`sum${v.x}`);
    assert.ok(added >= 15.3 && added <= 17.1, `x = ${v.x}: ${added.toFixed(2)} bits`);
    assert.ok(Math.abs(added - bits(`sum${72 - (v.x as number)}`)) < 1e-9);
  }
  for (const x of [13, 21, 35]) assert.equal(tops.get(`sum${x}`), undefined, "odd totals are dead");
  assert.ok(bits("sum6") > 20 && bits("sum12") > 18, "the totals held back");
});

test("the tier lenses: each interaction's units add up to its tier on every board, with unique ids", () => {
  const rng = mulberry32(21), boards = [ONE, RING, "3388/8833/3388/8833", ...Array.from({ length: 80 }, (_, i) => (i % 4 ? topRows(rng) : randomRows(rng, 4)))];
  for (const v of [{ id: "links" }, { id: "linkSums", x: 12 }, { id: "linkSums", x: 36 }, { id: "linksVia", y: 2 }, { id: "equalRoads", y: 2 }, { id: "equalRoads", y: 3 }]) {
    const lens = MORE_TIER_LENSES[v.id], plain: Params = { tiers: [{ ...v, gate: 0 }] };
    assert.ok(lens, v.id);
    for (const rows of boards) {
      const b = readBoard(inst, wire(rows))!, parts = lens.parts(v, b);
      assert.equal(parts.reduce((s, part) => s + part.points[0], 0), (score(plain, rows) as number[])[2], `${JSON.stringify(v)} on ${rows}`);
      assert.equal(new Set(parts.map(part => part.id)).size, parts.length);
      for (const part of parts) assert.ok(lens.modes.some(m => m.groups.includes(part.group!)) && part.facts.length > 0 && part.points[0] === (part.facts.every(x => x.ok) ? 1 : 0));
    }
    assert.equal(lens.components(v, readBoard(inst, wire(ONE))!).length, 1);
  }
  const link = MORE_TIER_LENSES.linkSums.parts({ id: "linkSums", x: 46 }, readBoard(inst, wire(ONE))!);
  assert.deepEqual(link.map(p => [p.id, p.title, p.points[0]]), [
    ["link:0,0:across", "not linked", 0], ["link:0,0:down", "linked by the 3s", 1], ["link:0,2:down", "not linked", 0], ["link:2,0:across", "not linked", 0],
  ]);
});

test("liveness through the card: a sample of the dealt values (test/tiers.test.ts checks every shipped table)", { timeout: 1_200_000 }, () => {
  for (const v of [{ id: "linkSums", x: 36 }, { id: "linksVia", y: 0 }, { id: "equalRoads", y: 3 }, { id: "equalRoads", y: 5 }]) {
    const live = tierLiveness(ID, pairTiers, tiered(v) as never, ctx)!;
    assert.deepEqual(live.problems, [], `${JSON.stringify(v)}: ${live.problems.join("; ")}`);
  }
  // Refused: stripes top "roads of exactly 4".
  assert.match(tierLiveness(ID, pairTiers, tiered({ id: "equalRoads", y: 4 }) as never, ctx)!.problems.join(), /two-digit board/);
});
