import { test } from "node:test";
import assert from "node:assert/strict";
import { elementValue, evaluateSite, ref, rng, tieBreakersOn, type Q } from "@workspace/v2-core";
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
  assert.deepEqual(terms("mirrormancer", B, {}), { mirror: 1 + 2 + 0 + 9, middle: 3, primes: 2, zeros: 11,
    "mirror-columns": 12 + 1 + 2 + 1, "one-apart": 1 + 2 + 2 + 9, "small-middle": 3 });
  assert.deepEqual(terms("magic-eighteen", B, { T: 18 }), { rows: 15 + 14 + 18 + 9, "first-column": 12, primes: 2, odd: 4,
    columns: 6 + 17 + 16 + 17, diagonals: 18 + 9, "different-numbers": 0 });
  assert.deepEqual(terms("opposite-nines", B, { T: 9 }), { pairs: 9 + 8 + 7 + 0 + 6 + 9 + 9 + 8, "top-half": 7, primes: 2, odd: 4,
    "mirror-nines": 9 + 6 + 5 + 9 + 9 + 9 + 0 + 9, "different-splits": 1, "big-on-top": 4 });
  assert.deepEqual(terms("two-pair", B, {}), { "two-pair": 2 + 1 + 9 + 2, apart: 3 + 2 + 9 + 0, primes: 2, corners: 9, "diagonal-pairs": 0, "small-pairs": 0 });
  assert.deepEqual(terms("spread-of-three", B, {}), { spread: 0 + 1 + 1 + 0 + 3 + 2 + 6 + 3 + 3, primes: 2, zeros: 11, corners: 9,
    "spread-diagonal": 0, "spread-small": 0, "square-different": 0 });
  assert.deepEqual(terms("strangers", B, {}), { strangers: 0, ones: 0, primes: 2, corners: 9, "prime-strangers": 0, "across-strangers": 0 });
  assert.deepEqual(terms("leapfrog", B, {}), { leap: 1 + 0 + 2 + 0 + 1 + 1 + 8 + 1, "first-column": 12, primes: 2, zeros: 11,
    "same-way": 0, "columns-leap": 1 + 5 + 0 + 1 + 1 + 1 + 1 + 0, "middle-factors": 0 });
  assert.deepEqual(terms("crosswise-threes", B, {}), { crosswise: 3 + 2 + 2 + 0 + 3 + 3, "fold-line": 9, primes: 2, zeros: 11,
    "bigger-side": 3, "other-fold": 1 + 1 + 6 + 3 + 2 + 3, "fold-factors": 1 });   // 3 and 0 share the factor 3
  assert.deepEqual(terms("steady-steps", B, {}), { steady: 3 + 4 + 0 + 9, climb: 0 + 2 + 0 + 9, start: 12, primes: 2 });
  assert.deepEqual(terms("box-totals", B, { T: 12 }), { boxes: 8 + 9 + 3 + 12, corners: 9, primes: 2, zeros: 11 });
  assert.deepEqual(terms("prime-cells", B, {}), { "prime-count": 2, "prime-total": 5, sevens: 0, corners: 9 });
});

test("strangers and two pairs on boards made for them", () => {
  assert.equal(terms("strangers", board("2525", "5252", "2525", "5252"), {}).strangers, 16);
  assert.equal(terms("strangers", board("1200", "0000", "0000", "0000"), {}).ones, 1);
  assert.equal(terms("two-pair", board("3838", "3838", "1256", "1256"), {})["two-pair"], 0);
  assert.equal(terms("two-pair", board("3300", "3300", "0000", "0000"), {})["two-pair"], 2 + 2 + 2 + 2, "four of a kind is two steps off");
});

test("the tied tie-breakers on boards made for them", () => {
  const t = (id: string, s: GridState, p: unknown, ...ids: string[]) => { const x = terms(id, s, p); return ids.map(k => x[k]); };
  assert.deepEqual(t("mirrormancer", board("4554", "4554", "0000", "0000"), {}, "mirror-columns", "one-apart", "small-middle"), [8 + 10 + 10 + 8, 0 + 0 + 2 + 2, 20]);
  assert.deepEqual(t("magic-eighteen", board("9900", "0990", "4545", "3366"), { T: 18 }, "columns", "diagonals", "different-numbers"), [2 + 8 + 1 + 7, 10 + 1, 0]);
  assert.deepEqual(t("magic-eighteen", board("0981", "0000", "0000", "0000"), { T: 18 }, "different-numbers"), [1]);
  // Pairs 0+9, 1+8, 4+5 and 5+4 split 9 three ways (0, 1 and 4); only the 5 over the 4 has the bigger on top.
  assert.deepEqual(t("opposite-nines", board("0145", "0000", "0000", "4589"), { T: 9 }, "mirror-nines", "different-splits", "big-on-top"), [4 + 4 + 9 + 9 + 9 + 9 + 4 + 4, 3, 1]);
  assert.deepEqual(t("two-pair", board("3838", "8383", "1256", "1256"), {}, "diagonal-pairs", "small-pairs"), [2, 3 + 3 + 1 + 5]);
  assert.deepEqual(t("spread-of-three", board("1211", "3411", "1111", "1111"), {}, "spread-diagonal", "spread-small", "square-different"), [1, 9, 1]);
  assert.deepEqual(t("strangers", board("2525", "5252", "2525", "5252"), {}, "prime-strangers", "across-strangers"), [16, 8]);
  assert.deepEqual(t("strangers", board("3700", "4900", "0000", "0000"), {}, "prime-strangers", "across-strangers"), [1, 0], "3 and 7 only: 4 and 9, 7 and 9 are not both prime");
  assert.deepEqual(t("leapfrog", board("1324", "4231", "5555", "0000"), {}, "same-way", "middle-factors"), [2, 2], "flat leaps go no way; 0, 0 shares nothing");
  assert.deepEqual(t("leapfrog", board("4690", "0000", "0000", "0000"), {}, "same-way", "middle-factors"), [0, 2], "6 between 4 and 9; 9 between 6 and 0");
  assert.deepEqual(t("leapfrog", board("0000", "0000", "1000", "0000"), {}, "columns-leap"), [0 + 1 + 1 + 1 + 1 + 1 + 1 + 1]);
  assert.deepEqual(t("crosswise-threes", board("9630", "6300", "3000", "0000"), {}, "bigger-side", "other-fold", "fold-factors"), [6, 6 * 3, 6]);   // every folded partner is 0: 0 shares any factor of 9, 6 or 3
});

test("a perfect Magic Eighteen board scores 0 on the main layer, and its tie-breaker grades it", () => {
  const s = board("9090", "0909", "4545", "3366");
  const f = fam("magic-eighteen");
  const e = evaluateSite(gridType, f, { T: 18 }, s, grid4, 0, "first-column");
  assert.deepEqual(e.score!.map(x => x === null ? null : `${x.n}/${x.d}`), ["0/1", "16/1"]);   // distance 0; the first column adds to 16
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

test("cards read as sentences", () => {
  for (const f of gridType.families) for (const p of f.dealable(grid4)) {
    for (const tb of f.tieBreakers) assert.match(f.card(p, tb.id), /^[A-Z].*\. Secondary: [A-Z].*\.$/);
  }
});
