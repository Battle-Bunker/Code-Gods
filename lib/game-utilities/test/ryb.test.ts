/**
 * Red, yellow, blue (ryb) replaced red, green, blue (rgb) as the offered three-colour set. The two have the same
 * structure (three colours in spectral order, no paint mixing, no wheel), and every family reads colours by index, so
 * each deals the same rules on ryb as on rgb and scores a board index for index alike: only the colour words change.
 * This is what lets ryb rooms rely on the same calibration machinery (tables are computed or shipped per instantiation).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GRID_SIZES, GRID_SYMBOL_SETS, instantiate, objectType, seededRng } from "@workspace/game-types";
import { available, canonicalSupport, context, evaluator, familiesFor, paramsKey } from "../src/index.ts";

const pairs = GRID_SIZES.filter(n => n >= 4).flatMap(size => GRID_SYMBOL_SETS.map(symbols => ({
  rgb: instantiate("Grid", { size, symbols, colours: "rgb" }), ryb: instantiate("Grid", { size, symbols, colours: "ryb" }),
})));

test("ryb deals exactly the families and canonical params rgb deals", () => {
  for (const { rgb, ryb } of pairs) {
    const fam = (inst: typeof rgb) => familiesFor("Grid").filter(f => available(f, inst).ok)
      .map(f => `${f.id} ${canonicalSupport(f, context(inst)).map(paramsKey).sort().join("|")}`);
    assert.deepEqual(fam(ryb), fam(rgb), ryb.key);
  }
});

test("every family scores the same board alike on ryb and rgb (colours by index)", () => {
  const rng = seededRng("ryb≡rgb");
  for (const { rgb, ryb } of [pairs[0], pairs[pairs.length - 1]]) {
    const def = objectType("Grid"), boards = Array.from({ length: 24 }, () => def.spawn(rgb, rng));
    const ctx = context(rgb);
    for (const f of familiesFor("Grid").filter(f => available(f, rgb).ok)) {
      for (const params of f.support(ctx).slice(0, 4)) {
        const a = evaluator({ familyId: f.id, params }, rgb), b = evaluator({ familyId: f.id, params }, ryb);
        for (const g of boards) {
          assert.deepEqual(b(def.codec(ryb).encode(g)), a(def.codec(rgb).encode(g)), `${f.id} ${paramsKey(params)} on ${ryb.key}`);
        }
      }
    }
  }
});

test("Green Ones on a set without green deals any colour; it names the colour it counts", () => {
  const ryb = context(instantiate("Grid", { size: 4, symbols: "base10", colours: "ryb" }));
  const f = familiesFor("Grid").find(f => f.id === "seed3_green_ones")!;
  assert.deepEqual(f.support(ryb).map(p => p.colour), [0, 1, 2]);
  assert.match(f.summary({ colour: 1, value: 1 }, ryb), /^Count the yellow 1s/);
  const rgb = context(instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }));
  assert.deepEqual(f.support(rgb), [{ colour: 1, value: 1 }], "rgb still deals green");
});
