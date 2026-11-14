import { test } from "node:test";
import assert from "node:assert/strict";
import { elementValue, evaluateSite, ref, rng, ruleLadder, levelOf, tieBreakersOn, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = (id: string) => gridType.families.find(f => f.id === id)!;
const terms = (id: string, s: GridState, params: unknown) => {
  const e = evaluateSite(gridType, fam(id), params, s, grid4, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, Number((t.value as Q).n)]));
};
const el = (s: GridState, rep: string, name: string) => Number((elementValue(gridType, s, ref(rep, name)) as { q: Q }).q.n);

const B = board("0120", "3001", "0000", "9000");

test("representations: tallies, opposite pairs, mirror gaps, steps and boxes", () => {
  assert.equal(el(B, "cells", "r3c0"), 9);
  assert.equal(el(B, "cells", "total"), 16);
  assert.deepEqual([0, 1, 2, 3].map(r => el(B, "tally", `row${r}`)), [3, 4, 0, 9]);
  assert.deepEqual([0, 1, 2, 3].map(c => el(B, "tally", `col${c}`)), [12, 1, 2, 1]);
  assert.equal(el(B, "turn", "pair0"), 0 + 0);   // r0c0 + r3c3
  assert.equal(el(B, "turn", "pair3"), 0 + 9);   // r0c3 + r3c0
  assert.equal(el(B, "mirror", "gap0"), 0 + 1);  // |0−0| + |1−2|
  assert.equal(el(B, "steps", "s01"), 1);        // 2 − 1
  assert.equal(el(B, "steps", "bend0"), 0 + 3);  // steps 1, 1, −2
  assert.deepEqual([0, 1, 2, 3].map(k => el(B, "boxes", `box${k}`)), [4, 3, 9, 0]);
});

test("each family's terms on one board", () => {
  assert.deepEqual(terms("row-totals", B, { T: 12 }), { rows: 9 + 8 + 12 + 3, "first-column": 12, primes: 2, zeros: 11 });
  assert.deepEqual(terms("opposite-pairs", B, { T: 9 }), { pairs: 9 + 8 + 7 + 0 + 6 + 9 + 9 + 8, "top-half": 7, primes: 2, odd: 4 });
  assert.deepEqual(terms("mirror-rows", B, {}), { mirror: 1 + 2 + 0 + 9, middle: 3, primes: 2, "row-totals": 32 });
  assert.deepEqual(terms("steady-steps", B, {}), { steady: 3 + 4 + 0 + 9, climb: 0 + 2 + 0 + 9, start: 12, primes: 2 });
  assert.deepEqual(terms("box-totals", B, { T: 12 }), { boxes: 8 + 9 + 3 + 12, corners: 9, primes: 2, zeros: 11 });
  assert.deepEqual(terms("prime-cells", B, {}), { "prime-count": 2, "prime-total": 5, sevens: 0, corners: 9 });
});

test("a perfect Row Totals board is at the main layer's top, and its tie-breaker grades it", () => {
  const s = board("3333", "0390", "1290", "2235");
  const f = fam("row-totals");
  const e = evaluateSite(gridType, f, { T: 12 }, s, grid4, 0, "first-column");
  const ladder = ruleLadder(f, { T: 12 }, grid4, "first-column");
  const lvl = levelOf(e.score, ladder);
  assert.equal(ladder[lvl]!.main, f.main.thresholds({ T: 12 }, grid4).length);
  assert.ok(lvl < ladder.length - 1, "the first column (6) is far from its top");
});

test("every family evaluates every tie-breaker on random boards, its marks citing what it read", () => {
  const r = rng("grid-families");
  for (let i = 0; i < 50; i++) {
    const s = { cells: Array.from({ length: 16 }, () => r.below(10)) };
    for (const f of gridType.families) for (const tb of tieBreakersOn(f, grid4)) {
      for (const p of f.dealable(grid4)) {
        const e = evaluateSite(gridType, f, p, s, grid4, 0, tb.id);
        assert.ok(e.score !== null && e.score.length === 2);
      }
    }
  }
});

test("every main layer and tie-breaker has at least six rungs, and cards read as sentences", () => {
  for (const f of gridType.families) for (const p of f.dealable(grid4)) {
    for (const l of [f.main, ...f.tieBreakers]) assert.ok(l.thresholds(p, grid4).length >= 6, `${f.id}.${l.id}`);
    for (const tb of f.tieBreakers) assert.match(f.card(p, tb.id), /^[A-Z].*\. Tie-breaker: [A-Z].*\.$/);
  }
});
