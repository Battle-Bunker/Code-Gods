/**
 * Typed params for the Games-kids-know and Geometry families (docs/rules-design.md §9): their cards' constants hold
 * names and values (a colour name, a target, a suit), never carrier indices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { card, context } from "../src/index.ts";

const rgb = instantiate("Grid", { size: 5, symbols: "base16", colours: "rainbow6" });
const deck = instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" });

test("the card constants of the retyped families still hold names and values, not indices", () => {
  const consts = (id: string, params: object, inst = rgb) => card({ familyId: id, params: params as never }, context(inst)).source.python;
  assert.match(consts("castle_keeper", { wall: "orange" }), /WALL = "orange"/);
  assert.match(consts("twenty_one", { target: 38 }), /TARGET = 38/);
  assert.match(consts("court_parade", { suit: "hearts" }, deck), /MY_SUIT = "hearts"/);
  assert.match(consts("tetromino_tamer", { colour: "red" }), /MY_COLOUR = "red"/);
  assert.match(consts("kings_court", { target: "K" }, deck), /MY_VALUE = 13/);
});
