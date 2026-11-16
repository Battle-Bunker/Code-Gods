/**
 * The old game's Mirrormancer, Magic Eighteen, Opposite Nines and Two Pair on the coloured boards: scores derived by
 * hand from v1's python cards, and the dealt parameters (v1's support and requirements).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type RuleFamily } from "@workspace/v2-core";
import { board4Type, board4rgb, board5rgby, board6hex, board7cards, decodeBoard, type BoardState } from "../src/index.ts";
import { originalMagicEighteen, originalMirrormancer, originalOppositeNines, originalTwoPair } from "../src/families/v1-numbers-a.ts";

const score = <P,>(f: RuleFamily<BoardState, P>, p: P, w: string, tb: string | null) =>
  evaluateSite(board4Type, f, p, decodeBoard(w), board4rgb, 0, tb).score?.map(x => x && Number(x.n) / Number(x.d ?? 1));

// Rows 7 3 0 1 / 2 9 4 4 / 8 0 0 0 / 1 1 1 1; colours are noise (these rules ignore them).
const A = "7R,3G,0B,1R/2R,9B,4G,4G/8R,0R,0R,0R/1B,1B,1B,1B";

test("Mirrormancer: the ids, the two dealt axes on every board, its tie-breaker", () => {
  const f = originalMirrormancer();
  assert.equal(f.id, "original-mirrormancer");
  assert.equal(f.title, "Mirrormancer");
  for (const v of [board4rgb, board5rgby, board6hex, board7cards]) assert.deepEqual(f.dealable(v), [{ axis: "rows" }, { axis: "columns" }]);
  assert.deepEqual(f.tieBreakers.map(t => t.id), ["matching-pairs"]);
});

test("Mirrormancer: rows of A: only 1 1 1 1 mirrors; its two pairs and 8 0 0 0's middle pair match", () => {
  assert.deepEqual(score(originalMirrormancer(), { axis: "rows" }, A, "matching-pairs"), [1, 3]);
  assert.deepEqual(score(originalMirrormancer(), { axis: "rows" }, A, null), [1]);
});

test("Mirrormancer: columns of A: no mirror; only the last column's outer pair (1, 1) matches", () => {
  assert.deepEqual(score(originalMirrormancer(), { axis: "columns" }, A, "matching-pairs"), [0, 1]);
});

test("Mirrormancer: a board of one number mirrors every row and matches every pair", () => {
  assert.deepEqual(score(originalMirrormancer(), { axis: "rows" }, "5R,5G,5B,5R/5R,5B,5G,5G/5R,5R,5R,5R/5B,5B,5B,5B", "matching-pairs"), [4, 8]);
});

test("Magic Eighteen: the middle total 4·9/2 = 18 on rows and on columns; nothing off the old beginner boards", () => {
  const f = originalMagicEighteen();
  assert.equal(f.id, "original-magic-eighteen");
  assert.deepEqual(f.dealable(board4rgb), [{ axis: "rows", target: 18 }, { axis: "columns", target: 18 }]);
  assert.deepEqual(f.dealable(board6hex), [{ axis: "rows", target: 45 }, { axis: "columns", target: 45 }]);
  assert.deepEqual(f.dealable(board5rgby), []);   // odd side
  assert.deepEqual(f.dealable(board7cards), []);  // cards and odd
});

test("Magic Eighteen: rows of A total 11, 19, 8, 4: none on 18, 7 + 1 + 10 + 14 = 32 away", () => {
  assert.deepEqual(score(originalMagicEighteen(), { axis: "rows", target: 18 }, A, "total-gap"), [0, -32]);
});

test("Magic Eighteen: columns of A total 18, 13, 5, 6: one on 18, 0 + 5 + 13 + 12 = 30 away", () => {
  assert.deepEqual(score(originalMagicEighteen(), { axis: "columns", target: 18 }, A, "total-gap"), [1, -30]);
});

test("Magic Eighteen: v1's exemplar, a chessboard of 0 and 9, makes every row and column 18", () => {
  const w = "0R,9G,0B,9R/9R,0B,9G,0G/0R,9R,0R,9R/9B,0B,9B,0B";
  for (const axis of ["rows", "columns"] as const) assert.deepEqual(score(originalMagicEighteen(), { axis, target: 18 }, w, "total-gap"), [4, 0]);
});

test("Opposite Nines: the biggest digit; nothing off the old beginner boards", () => {
  const f = originalOppositeNines();
  assert.equal(f.id, "original-opposite-nines");
  assert.deepEqual(f.dealable(board4rgb), [{ target: 9 }]);
  assert.deepEqual(f.dealable(board6hex), [{ target: 15 }]);
  assert.deepEqual(f.dealable(board5rgby), []);
  assert.deepEqual(f.dealable(board7cards), []);
});

test("Opposite Nines: A's pairs make 8, 4, 1, 2, 2, 9, 4, 12: one nine, 1 + 5 + 8 + 7 + 7 + 0 + 5 + 3 = 36 away", () => {
  assert.deepEqual(score(originalOppositeNines(), { target: 9 }, A, "opposite-gap"), [1, -36]);
});

test("Opposite Nines: v1's exemplar (4s then 5s) makes every pair 9", () => {
  assert.deepEqual(score(originalOppositeNines(), { target: 9 }, "4R,4G,4B,4R/4R,4B,4G,4G/5R,5R,5R,5R/5B,5B,5B,5B", "opposite-gap"), [8, 0]);
});

test("Two Pair: one rule on 4×4 digits; nothing off the old beginner boards", () => {
  const f = originalTwoPair();
  assert.equal(f.id, "original-two-pair");
  assert.deepEqual(f.dealable(board4rgb), [{}]);
  assert.deepEqual(f.dealable(board5rgby), []);
  assert.deepEqual(f.dealable(board7cards), []);
});

test("Two Pair: A's boxes 7 3 2 9 (nothing), 0 1 4 4 (a pair), 8 0 1 1 (a pair), 0 0 1 1 (two pairs)", () => {
  assert.deepEqual(score(originalTwoPair(), {}, A, "one-pairs"), [1, 2]);
});

test("Two Pair: four of a kind scores nothing, three of a kind a secondary point", () => {
  // Boxes: 3 8 8 3 (two pairs), 5 5 5 5 (nothing), 2 2 2 1 (three of a kind), 2 7 6 6 (a pair).
  assert.deepEqual(score(originalTwoPair(), {}, "3R,8G,5B,5B/8R,3R,5R,5R/2G,2G,2G,7B/2B,1B,6B,6B", "one-pairs"), [1, 2]);
});

test("the cards and layer titles never say 'line'", () => {
  for (const f of [originalMirrormancer(), originalMagicEighteen(), originalOppositeNines(), originalTwoPair()] as RuleFamily<BoardState, object>[]) {
    for (const p of f.dealable(board4rgb)) for (const tb of [null, ...f.tieBreakers.map(t => t.id)]) assert.doesNotMatch(f.card(p, tb), /\blines?\b/i, f.id);
    for (const l of [f.main, ...f.tieBreakers]) assert.doesNotMatch(l.title, /\blines?\b/i, f.id);
  }
});
