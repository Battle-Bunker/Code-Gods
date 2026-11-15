/** The parameterised families (param-families.ts): mains and tie-breakers on hand-computed boards, the dealt values, the cards, drift. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, gridType2, grid2, grid4, gridDriftNeighbours, gridPresets, paramGridFamilies, PARAM_DEALT, repeats, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const IDS = ["magic-totals", "spread", "number-lines", "pair-sums"];
const fam = (id: string) => gridType.families.find(f => f.id === id)!;
const terms = (id: string, s: GridState, params: unknown) => {
  const e = evaluateSite(gridType, fam(id), params, s, grid4, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, Number((t.value as Q).n)]));
};
// Rows 1234 / 5678 / 9012 / 3456: row totals 10 26 12 18, column totals 18 12 16 20, corner boxes 14 22 16 14;
// row numbers 1234 5678 9012 3456, column numbers 1593 2604 3715 4826.
const A = board("1234", "5678", "9012", "3456");

test("the four families are in the type, before the coupled rules, in no preset, each with three tie-breakers", () => {
  assert.deepEqual(paramGridFamilies(4).map(f => f.id), IDS);
  const ids = gridType.families.map(f => f.id);
  assert.deepEqual(ids.slice(ids.indexOf("magic-totals"), ids.indexOf("magic-totals") + 4), IDS);
  for (const p of gridPresets) for (const r of p.rules) assert.ok(!IDS.includes(r.family), `${p.id} deals ${r.family}`);
  const TIES: Record<string, string[]> = {
    "magic-totals": ["same-quotient", "small-totals", "different-totals"], spread: ["extremes-apart", "low-floor", "all-different"],
    "number-lines": ["same-last-digit", "big-leads", "shared-factors"], "pair-sums": ["differ-by-3s", "equal-pairs", "shared-factor"],
  };
  for (const id of IDS) {
    const f = fam(id);
    assert.deepEqual(f.tieBreakers.map(t => t.id), TIES[id]);
    for (const p of f.dealable(grid4)) assert.deepEqual(Object.keys(terms(id, A, p)).sort(), [f.main.id, ...TIES[id]!].sort(), `${id} ${JSON.stringify(p)}`);
  }
});

test("dealable values: named params from PARAM_DEALT, each with its own dealt tie-breakers, and one value on the 2×2 test board", () => {
  const counts: Record<string, [number, number]> = { "magic-totals": [98, 121], spread: [9, 15], "number-lines": [37, 46], "pair-sums": [55, 79] };
  for (const id of IDS) {
    const ps = fam(id).dealable(grid4) as object[];
    const dealt = (PARAM_DEALT as Record<string, { params: object; tieBreakers: readonly string[] }[]>)[id]!;
    assert.deepEqual([ps.length, dealt.reduce((t, d) => t + d.tieBreakers.length, 0)], counts[id], id);
    assert.deepEqual(ps, dealt.map(d => d.params), id);
    assert.equal(new Set(ps.map(p => JSON.stringify(p))).size, ps.length, `${id}: no repeats`);
    for (const d of dealt) { assert.ok(d.tieBreakers.length > 0); for (const t of d.tieBreakers) assert.ok(fam(id).tieBreakers.some(x => x.id === t), `${id}: ${t}`); }
    assert.equal(gridType2.families.find(f => f.id === id)!.dealable(grid2).length, 1, id);
  }
  assert.deepEqual(PARAM_DEALT["magic-totals"][0], { params: { units: "columns-boxes", q: 6, r: 0 }, tieBreakers: ["same-quotient", "small-totals"] });
  assert.deepEqual(PARAM_DEALT["spread"].map(d => `${d.params.windows} ${d.params.s}`).sort(), [...new Set(PARAM_DEALT["spread"].map(d => `${d.params.windows} ${d.params.s}`))].sort());
});

test("Magic Totals: distance to the nearest total leaving r, and its tie-breakers", () => {
  // mod 8, remainder 2: rows 10 26 12 18 are off 0 0 2 0; columns 18 12 16 20 are off 0 2 2 2.
  // Quotients by 8: 1 3 1 2 | 2 1 2 2 (2 four times); the totals add up to 132; six different totals.
  assert.deepEqual(terms("magic-totals", A, { units: "rows-columns", q: 8, r: 2 }), { totals: 8, "same-quotient": 4, "small-totals": 132, "different-totals": 6 });
  // mod 6, remainder 3: rows 10 26 12 18 off 1 1 3 3; boxes 14 22 16 14 off 1 1 1 1.
  assert.equal(terms("magic-totals", A, { units: "rows-boxes", q: 6, r: 3 }).totals, 12);
  // Columns and boxes: 18 12 16 20 off 3 3 1 1 (mod 6, remainder 3), boxes off 1 1 1 1.
  assert.equal(terms("magic-totals", A, { units: "columns-boxes", q: 6, r: 3 }).totals, 12);
  // Totals 2 0 0 0 | 2 0 0 0 are off 0 2 2 2 | 0 2 2 2 (12); rows 3 and 4 repeat row 2, columns 3 and 4 repeat column 2: 4 more.
  assert.equal(terms("magic-totals", board("2000", "0000", "0000", "0000"), { units: "rows-columns", q: 8, r: 2 }).totals, 16);
});

test("Spread: windows' distance from the spread, and its tie-breakers", () => {
  // Squares' spreads 5 5 5 / 9 7 7 / 9 5 5: off 4 + 2 + 2 + 4 = 12 from 5. Biggest and smallest across a diagonal in all but
  // the squares 5 6 / 9 0 and 9 0 / 3 4; smallest numbers 1 2 3 0 0 1 0 0 1; every square of four different numbers.
  assert.deepEqual(terms("spread", A, { windows: "squares", s: 5 }), { spread: 12, "extremes-apart": 7, "low-floor": 8, "all-different": 9 });
  // Three-in-a-rows: only 9 0 1 (spread 9) is off 2, by 7; it has its biggest and smallest side by side; smallest numbers add up to 21.
  assert.deepEqual(terms("spread", A, { windows: "row-triples", s: 2 }), { spread: 7, "extremes-apart": 7, "low-floor": 21, "all-different": 8 });
  // Squares and rows, s 4: squares off 1 1 1 5 3 3 5 1 1 = 21; whole rows (spreads 3 3 9 3) off 1 1 5 1 = 8.
  assert.equal(terms("spread", A, { windows: "squares-rows", s: 4 }).spread, 29);
  // Columns 1593 2604 3715 4826 have spreads 8 6 6 6: off 4 2 2 2 from 4.
  assert.equal(terms("spread", A, { windows: "squares-columns", s: 4 }).spread, 21 + 10);
});

test("Number Lines: each number's distance to one leaving r, and its tie-breakers", () => {
  // Rows 1234 5678 9012 3456 leave 2 2 3 2 when divided by 11: off 1 1 0 1 from 3. The nearest numbers leaving 3 are
  // 1235 5679 9012 3457 (last digits all different); first digits 1 5 9 3; every pair of neighbouring rows is even.
  assert.deepEqual(terms("number-lines", A, { axis: "rows", q: 11, r: 3 }), { numbers: 3, "same-last-digit": 1, "big-leads": 18, "shared-factors": 3 });
  // Columns 1593 2604 3715 4826 leave 7 4 10 3 when divided by 13: off 0 3 3 4 from 7. First digits 1 2 3 4; neighbours
  // 1593 and 2604 share 3, 2604 and 3715 share nothing, 3715 and 4826 share nothing.
  const c = terms("number-lines", A, { axis: "columns", q: 13, r: 7 });
  assert.deepEqual([c.numbers, c["big-leads"], c["shared-factors"]], [10, 10, 1]);
  // Both ways, mod 11 remainder 3: rows off 3 as above; columns 1593 2604 3715 4826 leave 9 8 8 8: off 5 5 5 5.
  const b = terms("number-lines", A, { axis: "rows-columns", q: 11, r: 3 });
  assert.deepEqual([b.numbers, b["big-leads"], b["shared-factors"]], [23, 28, 3 + 1]);
});

test("Pair Sums: each pair's distance from the target, and its tie-breakers", () => {
  // Half-turn pairs of A all add up to 7 except 8 + 9 = 17: off 5 × 7 + 15 = 50 from 2; 2 & 5 and 5 & 2 differ by 3.
  assert.deepEqual(terms("pair-sums", A, { pairing: "half-turn", total: 2 }), { "pair-sums": 50, "differ-by-3s": 2, "equal-pairs": 0, "shared-factor": 0 });
  // Box diagonals of 4806 / 3399 / 6612 / 0000: pairs 4+3, 8+3, 0+9, 6+9, 6+0, 6+0, 1+0, 2+0 against 0, 9 or 18:
  // off 2 2 0 3 3 3 1 2; differing by a multiple of 3: 0 & 9, 6 & 9, 6 & 0 twice; sharing a factor: 6 & 9.
  assert.deepEqual(terms("pair-sums", board("4806", "3399", "6612", "0000"), { pairing: "box-diagonal", total: 0, every: 9 }),
    { "pair-sums": 16, "differ-by-3s": 4, "equal-pairs": 0, "shared-factor": 1 });
  // Row mirrors of 1221 / 3003 / 4444 / 5005: every pair equal; totals 2 4 6 0 8 8 10 0 against 3.
  const m = terms("pair-sums", board("1221", "3003", "4444", "5005"), { pairing: "row-mirror", total: 3 });
  assert.deepEqual([m["pair-sums"], m["equal-pairs"]], [1 + 1 + 3 + 3 + 5 + 5 + 7 + 3 + 2, 8], "columns 3 and 4 repeat columns 2 and 1: 2 more");
});

test("the guard: each row equal to an earlier row, and each column equal to an earlier column, adds 1 to the main part", () => {
  assert.equal(repeats(4, A.cells), 0);
  // 0202 four times: rows 2–4 repeat row 1; columns 0 0 0 0, 2 2 2 2, then both again.
  assert.equal(repeats(4, board("0202", "0202", "0202", "0202").cells), 3 + 2);
  // Repeated row pairs: 6436 / 6346 / 6436 / 6346 repeats two rows; its columns 6666, 4343, 3434, 6666 repeat one.
  assert.equal(repeats(4, board("6436", "6346", "6436", "6346").cells), 2 + 1);
  // Rows 0202 / 0202 / … read 202, which leaves 4 when divided by 11; three-in-a-rows spread 2; side-by-side pairs add up to 2.
  // The period-2 board that met all three main parts at once now misses each by its 5 repeats.
  const P2 = board("0202", "0202", "0202", "0202");
  assert.equal(terms("number-lines", P2, { axis: "rows", q: 11, r: 4 }).numbers, 5);
  assert.equal(terms("spread", P2, { windows: "row-triples", s: 2 }).spread, 5);
  assert.equal(terms("pair-sums", P2, { pairing: "side-by-side", total: 2 })["pair-sums"], 5);
});

test("cards: one sentence each, filled in, no 'line', at most four numbers with any tie-breaker", () => {
  assert.equal(fam("magic-totals").card({ units: "rows-columns", q: 8, r: 2 }, null), "Every row's and every column's total should leave 2 when divided by 8, and no two rows or two columns may be the same.");
  assert.equal(fam("magic-totals").card({ units: "columns-boxes", q: 10, r: 9 }, null), "Every column's and every corner box's total should leave 9 when divided by 10, and no two rows or two columns may be the same.");
  assert.equal(fam("spread").card({ windows: "squares", s: 5 }, null), "Every 2×2 square should have a spread of exactly 5 (its biggest number minus its smallest), and no two rows or two columns may be the same.");
  assert.equal(fam("number-lines").card({ axis: "columns", q: 13, r: 7 }, null), "Read each column from top to bottom as one number: each should be as close as possible to a number that leaves 7 when divided by 13, and no two rows or two columns may be the same.");
  assert.equal(fam("pair-sums").card({ pairing: "half-turn", total: 0, every: 9 }, null), "Every cell and its opposite (where a half turn of the board takes it) should add up to 0, 9 or 18, and no two rows or two columns may be the same.");
  assert.equal(fam("pair-sums").card({ pairing: "row-leap", total: 3 }, null), "Every cell and the cell two along in its row should add up to 3, and no two rows or two columns may be the same.");
  for (const id of IDS) for (const p of fam(id).dealable(grid4)) for (const tb of [null, ...fam(id).tieBreakers.map(t => t.id)]) {
    const c = fam(id).card(p, tb);
    assert.doesNotMatch(c, /\bline\b/i, `${id}: ${c}`);
    assert.ok((c.replace(/2×2/g, "").match(/\d+/g) ?? []).length <= 4, `${id}: ${c}`);
  }
});

test("drift neighbourhoods: symmetric, never the value itself, every neighbour dealt with the same tie-breaker, never empty", () => {
  for (const id of IDS) {
    const dealt = (PARAM_DEALT as Record<string, { params: object; tieBreakers: readonly string[] }[]>)[id]!;
    for (const d of dealt) for (const tb of [undefined, ...d.tieBreakers]) {
      const pool = dealt.filter(x => tb === undefined || x.tieBreakers.includes(tb)).map(x => JSON.stringify(x.params));
      const ns = gridDriftNeighbours(id, d.params, tb);
      if (pool.length > 1) assert.ok(ns.length > 0, `${id} ${JSON.stringify(d.params)} ${tb}`);
      for (const x of ns) {
        assert.ok(pool.includes(JSON.stringify(x)), `${id}: ${JSON.stringify(x)} is not dealt with ${tb}`);
        assert.notEqual(JSON.stringify(x), JSON.stringify(d.params));
        assert.ok(gridDriftNeighbours(id, x, tb).some(y => JSON.stringify(y) === JSON.stringify(d.params)), `${id}: ${JSON.stringify(d.params)} ↔ ${JSON.stringify(x)}`);
      }
    }
  }
  // Magic Totals moves to the twin units first: columns with boxes, mod 7, remainder 1 ↔ rows with boxes, mod 7, remainder 1.
  assert.ok(gridDriftNeighbours("magic-totals", { units: "columns-boxes", q: 7, r: 1 }).some(x => JSON.stringify(x) === JSON.stringify({ units: "rows-boxes", q: 7, r: 1 })));
  assert.deepEqual(gridDriftNeighbours("mirrormancer", {}), []);
  assert.deepEqual(gridDriftNeighbours("pair-sums", { pairing: "half-turn", total: 9 }), [], "not a dealt value");
});
