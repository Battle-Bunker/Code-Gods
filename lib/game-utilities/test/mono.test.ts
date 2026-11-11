/**
 * Mono boards (Grid(_,_,mono): one colour, numbers only) and the families' declared needs (docs/rules-design.md §4.2).
 * A family whose rule reads a cell's colour at all must declare at least 2 colours, so the one checker locks it on a mono
 * board with the usual reason; every family it offers there must read numbers only and really vary with the board.
 *
 * What would break: a new or edited family that reads colour without declaring it (on mono it would be constant, have an
 * empty support or throw), or a declaration that locks a numbers-only family.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GRID, GRID_SIZES, GRID_SYMBOL_SETS, instantiate, seededRng } from "@workspace/game-types";
import { FAMILIES, available, canonicalSupport, card, context, evaluator, publicCatalog } from "../src/catalog.ts";

const MONO_SHAPES = GRID_SIZES.filter(n => n >= 4).flatMap(size => GRID_SYMBOL_SETS.map(symbols => instantiate("Grid", { size, symbols, colours: "mono" })));
const mono4 = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const grids = FAMILIES.filter(f => f.objectType === "Grid");

test("Grid(4,base10,mono) offers exactly the numbers-only families", () => {
  const offered = grids.filter(f => available(f, mono4).ok).map(f => f.id).sort();
  assert.deepEqual(offered, [
    "bingo_caller", "column_addition", "constellation", "divisibility_detective", "fillomino", "full_house", "hate_symbol_takeover",
    "hate_value", "ladder_of_numbers", "looking_glass", "magic_accountant", "mirrormancer", "mountain_climb", "number_bonds",
    "pinwheel", "round_numbers", "seesaw", "snap", "stepping_stones", "staircase_climber", "twenty_one", "young_tableau",
  ].sort());
});

test("on every mono shape, an offered family reads no colour, deals at least one rule, and scores vary with the board", () => {
  const rng = seededRng("mono-families");
  for (const inst of MONO_SHAPES) {
    const ctx = context(inst), codec = GRID.codec(inst);
    const boards = Array.from({ length: 120 }, () => codec.encode(GRID.spawn(inst, rng)));
    for (const f of grids.filter(f => available(f, inst).ok)) {
      const support = canonicalSupport(f, ctx);
      assert.ok(support.length > 0, `${inst.key} ${f.id}: nothing to deal`);
      for (const params of support) {
        const c = card({ familyId: f.id, params }, ctx);
        for (const src of [c.source.python, c.source.typescript, c.summary])
          assert.doesNotMatch(src, /\.colou?r\b|palette|plain/i, `${inst.key} ${f.id} ${JSON.stringify(params)} reads colour`);
        const score = evaluator({ familyId: f.id, params }, inst);
        const seen = new Set(boards.map(b => JSON.stringify(score(b))));
        assert.ok(seen.size > 1, `${inst.key} ${f.id} ${JSON.stringify(params)}: the same score on every board`);
      }
    }
  }
});

test("a family that needs colours is locked on a mono board with the usual reason and an unlock to a coloured board", () => {
  const locked = publicCatalog(mono4).filter(e => !e.available);
  const colour = locked.filter(e => /colou?r/i.test(e.locked!.reason));
  assert.ok(colour.length >= 70, `${colour.length} colour families locked`);
  for (const e of colour) {
    assert.match(e.locked!.reason, /^needs (at least \d+ colours|🌈 Colour order|🎡 Colour wheel|🎨 Paint mixing): pick /, e.id);
    assert.ok(e.locked!.unlock && e.locked!.unlock.colours !== "mono", `${e.id}: unlocks onto a coloured board`);
  }
  // Every family available on the coloured 4×4 that is locked on mono is locked for colour, never for anything else.
  const rgb4 = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  for (const f of grids.filter(f => available(f, rgb4).ok && !available(f, mono4).ok))
    assert.ok(colour.some(e => e.id === f.id), `${f.id} is locked on mono for something other than colour`);
});
