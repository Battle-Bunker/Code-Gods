/**
 * The splits of the Games and Geometry families (docs/rules-design.md P10): ideas that used to be params of a family,
 * whose variants were not peers of equal opportunity, are now families of their own. What would break: a split scoring
 * like its parent (the layer, mode, piece or suit not applied), a split dealt where it cannot play, or a param left on a
 * family that should have none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { available, canonicalSupport, card, context, evaluator, family } from "../src/index.ts";

const rgb = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const deck = instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" });
const score = (id: string, params: object, inst: typeof rgb, board: string) =>
  evaluator({ familyId: id, params: params as never }, inst)(board as never);

test("Mirror Quilt matches colours across the fold, where Looking-Glass matches numbers", () => {
  // Left half the mirror of the right in colour (R G | G R), numbers all different: 4 rows × 2 pairs.
  const board = "0R,1G,2G,3R/4R,5G,6G,7R/8R,9G,0G,1R/2R,3G,4G,5R";
  assert.equal(score("mirror_quilt", { axis: "V" }, rgb, board), 8);
  assert.equal(score("looking_glass", { axis: "V" }, rgb, board), 0);
  assert.equal(score("mirror_quilt", { axis: "H" }, rgb, "0R,1G,2B,3R/4G,5G,6B,7R/8B,9G,0B,1G/2R,3G,4B,5R"), 6, "top onto bottom: rows 0 and 3 agree (4 cells), rows 1 and 2 agree in 2");
});

test("Colour Pinwheel needs one colour round a quarter turn, where Pinwheel needs one number", () => {
  const board = (digit: (i: number) => string) => Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => `${digit(r * 4 + c)}R`).join(",")).join("/");
  const allRed = board(i => String(i % 10));
  assert.deepEqual(score("colour_pinwheel", {}, rgb, allRed), [4, 16], "4 orbits of 4, all red");
  assert.notDeepEqual(score("pinwheel", {}, rgb, allRed), [4, 16]);
  assert.deepEqual(score("colour_pinwheel", {}, rgb, board(i => String(i % 10)).replace("0R", "0G")).slice(0, 1), [3]);
});

test("each piece tamer scores only its own Tetris piece, turned or flipped", () => {
  // Red islands: an I along the top row, a T, an L and an S, each kept apart by blue.
  const fit = (...rows: string[]) => rows.map(r => [...r].map(ch => `0${ch}`).join(",")).join("/");
  const pieces: Record<string, string> = {
    i_piece_tamer: fit("RRRRB", "BBBBB", "BBBBB", "BBBBB", "BBBBB"),
    t_piece_tamer: fit("RRRBB", "BRBBB", "BBBBB", "BBBBB", "BBBBB"),
    l_piece_tamer: fit("RBBBB", "RBBBB", "RRBBB", "BBBBB", "BBBBB"),
    s_piece_tamer: fit("BRRBB", "RRBBB", "BBBBB", "BBBBB", "BBBBB"),
  };
  const inst = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgb" });
  for (const [own, board] of Object.entries(pieces)) {
    for (const id of Object.keys(pieces)) {
      const [hits, fours] = score(id, { colour: "red" }, inst, board) as unknown as number[];
      assert.equal(fours, 1, `${id} on ${own}'s board: one 4-cell island`);
      assert.equal(hits, id === own ? 1 : 0, `${id} on ${own}'s board`);
    }
  }
});

test("the piece tamers: the I needs room for a straight four", () => {
  assert.equal(available(family("i_piece_tamer"), instantiate("Grid", { size: 3, symbols: "base10", colours: "rgb" })).ok, false);
  assert.equal(available(family("i_piece_tamer"), rgb).ok, true);
  assert.equal(available(family("t_piece_tamer"), instantiate("Grid", { size: 3, symbols: "base10", colours: "rgb" })).ok, true);
});

test("Treasure Castle scores shut-in treasure only; Castle Pockets scores 3 more per pocket", () => {
  // A red ring round a 2×2 middle: two blue and two green cells inside, 12 red walls on the edge.
  const ring = "0R,0R,0R,0R/0R,0B,0G,0R/0R,0B,0B,0R/0R,0R,0R,0R";
  assert.deepEqual(score("treasure_castle", { wall: "red", treasure: "blue" }, rgb, ring), [3, 12]);
  assert.deepEqual(score("treasure_castle", { wall: "red", treasure: "green" }, rgb, ring), [1, 12]);
  assert.deepEqual(score("castle_pockets", { wall: "red" }, rgb, ring), [4 + 3, 12], "one pocket of 4 cells");
  // Two pockets: 4 shut-in cells in two separate pairs, 3 each.
  const two = "0R,0R,0R,0R,0R/0R,0B,0R,0B,0R/0R,0B,0R,0B,0R/0R,0R,0R,0R,0R/0R,0R,0R,0R,0R";
  const five = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgb" });
  assert.deepEqual(score("castle_pockets", { wall: "red" }, five, two), [4 + 6, 16]);
  assert.deepEqual(score("castle_keeper", { wall: "red" }, five, two), [4, 16]);
});

test("Any-Suit Court takes picture cards of any suit; Royal Court only its suit", () => {
  // 5×5: the middle and its four neighbours are J/Q/K of mixed suits (rest are twos).
  const rows = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => "2S"));
  rows[2][2] = "KH"; rows[1][2] = "QS"; rows[3][2] = "JD"; rows[2][1] = "KC"; rows[2][3] = "QH";
  const board = rows.map(r => r.map(c => `${c}R`).join(",")).join("/");
  assert.deepEqual(score("any_suit_court", {}, deck, board), [10, 5], "five picture cards, none on the edge: doubled");
  assert.deepEqual(score("royal_court", { suit: "hearts" }, deck, board), [4, 2], "the middle K and the Q of hearts; both off the edge: doubled");
});

test("Any-Suit Parade: a J-Q-K of any one suit in one colour; Court Parade only its suit", () => {
  const rows = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => "2SR"));
  rows[0] = ["JHR", "QHR", "KHR", "2SR", "2SR"];
  const board = rows.map(r => r.join(",")).join("/");
  assert.deepEqual(score("any_suit_parade", {}, deck, board), [1, 2]);
  assert.deepEqual(score("court_parade", { suit: "hearts" }, deck, board), [1, 2]);
  assert.deepEqual(score("court_parade", { suit: "spades" }, deck, board), [0, 0]);
});

test("the splits have named params only where their peers vary, and cards that name them", () => {
  const params: Record<string, string[]> = {
    mirror_quilt: ["axis"], colour_pinwheel: [], i_piece_tamer: ["colour"], t_piece_tamer: ["colour"], l_piece_tamer: ["colour"],
    s_piece_tamer: ["colour"], treasure_castle: ["wall", "treasure"], castle_pockets: ["wall"], any_suit_court: [], any_suit_parade: [],
  };
  for (const [id, names] of Object.entries(params)) {
    const inst = ["any_suit_court", "any_suit_parade"].includes(id) ? deck : rgb, ctx = context(inst), f = family(id);
    assert.ok(available(f, inst).ok, `${id} is dealt on ${inst.key}`);
    assert.deepEqual(f.params!(ctx).map(x => x.key), names, id);
    for (const p of canonicalSupport(f, ctx)) {
      const c = card({ familyId: id, params: p as never }, ctx);
      assert.match(c.source.python, /def utility\(grid\)/, id);
      assert.match(c.source.typescript, /function utility\(grid\)/, id);
    }
  }
});
