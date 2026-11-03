/**
 * Typed params for the Games-kids-know and Geometry families (docs/rules-design.md §9): params stored before these
 * families were typed (`{ X: 0 }`, `{ dir: "rows" }`, `{ suit: null, match: false }`) upgrade to named, typed params
 * and every method reads either shape, so an old row's card is today's card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { card, context, upgradeParams } from "../src/index.ts";

const rgb = instantiate("Grid", { size: 5, symbols: "base16", colours: "rainbow6" });
const deck = instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" });

const CASES: [family: string, inst: typeof rgb, old: object, now: object][] = [
  ["rummy_melder", rgb, { dir: "cols" }, { axis: "cols" }],
  ["othello_sandwich", rgb, { X: 2, diag: true }, { colour: "yellow", diag: true }],
  ["sudoku_scholar", rgb, { dir: "both" }, { axis: "both" }],
  ["full_house", rgb, { dir: "rows" }, { axis: "rows" }],
  ["twenty_one", rgb, { T: 40 }, { target: 40 }],
  ["go_fish_books", rgb, { r: 11 }, { fish: "B" }],
  ["go_fish_books", deck, { r: 9 }, { fish: "10" }],
  ["knight_riders", rgb, { X: null }, { colour: "any" }],
  ["knight_riders", rgb, { X: 3 }, { colour: "green" }],
  ["court_parade", deck, { suit: null, match: true }, { suit: "any", one_colour: true }],
  ["court_parade", deck, { suit: 2, match: false }, { suit: "diamonds", one_colour: false }],
  ["kings_court", deck, { r: 12 }, { target: "K" }],
  ["connect_four", rgb, { X: 5 }, { colour: "violet" }],
  ["castle_keeper", rgb, { W: 1, mode: "treasure", T: 4 }, { wall: "orange", mode: "treasure", treasure: "blue" }],
  ["castle_keeper", rgb, { W: 0, mode: "plain", T: null }, { wall: "red", mode: "plain", treasure: "none" }],
  ["bridge_builder", rgb, { C: 2, D: "TB" }, { colour: "yellow", direction: "TB" }],
  ["royal_court", deck, { suit: null }, { suit: "any" }],
  ["royal_court", deck, { suit: 3 }, { suit: "clubs" }],
  ["archipelago", rgb, { C: 1 }, { colour: "orange" }],
  ["pinwheel", rgb, { attr: "symbol" }, { layer: "symbol" }],
  ["snake_charmer", rgb, { C: 4 }, { colour: "blue" }],
  ["tetromino_tamer", rgb, { C: 0, P: "L" }, { colour: "red", piece: "L" }],
  ["rainbow_bands", rgb, { K: "BR" }, { corner: "BR" }],
  ["constellation", rgb, { S: 15 }, { star: "F" }],
  ["colour_carousel", rgb, { dir: "ccw" }, { direction: "ccw" }],
  ["gravity", rgb, { X: 2 }, { colour: "yellow" }],
  ["swiss_cheese", rgb, { X: 3 }, { colour: "green" }],
  ["treasure_map", rgb, { X: 5 }, { colour: "violet" }],
];

test("legacy params of the Games and Geometry families upgrade to named, typed params, idempotently", () => {
  for (const [id, inst, old, now] of CASES) {
    assert.deepEqual(upgradeParams(id, old as never, inst), now, `${id} ${JSON.stringify(old)}`);
    assert.deepEqual(upgradeParams(id, now as never, inst), now, `${id}: today's params are left alone`);
    // The widen step: the old row's card is today's card, constants and programs included.
    const a = card({ familyId: id, params: old as never }, context(inst)), b = card({ familyId: id, params: now as never }, context(inst));
    assert.deepEqual(a.summary, b.summary, id);
    assert.deepEqual(a.source, b.source, id);
  }
});

test("the card constants of the retyped families still hold names and values, not indices", () => {
  const consts = (id: string, params: object, inst = rgb) => card({ familyId: id, params: params as never }, context(inst)).source.python;
  assert.match(consts("castle_keeper", { wall: "orange", mode: "treasure", treasure: "blue" }), /WALL = "orange"[\s\S]*TREASURE = "blue"/);
  assert.match(consts("twenty_one", { target: 40 }), /TARGET = 40/);
  assert.match(consts("court_parade", { suit: "hearts", one_colour: false }, deck), /MY_SUIT = "hearts"/);
  assert.match(consts("tetromino_tamer", { colour: "red", piece: "L" }), /MY_PIECE = "L"/);
  assert.match(consts("kings_court", { target: "K" }, deck), /MY_VALUE = 13/);
});
