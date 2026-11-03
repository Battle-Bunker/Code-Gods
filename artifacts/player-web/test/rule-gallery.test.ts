/**
 * The rule gallery's model (src/site/lib/rule-gallery.ts): which annotated families a setup offers, the param
 * fields a tile shows, and the GET-param round trip that carries a tile's choices to its family page.
 * What would break: a tile for a family its board cannot deal, a field offering a param combination outside the
 * family's support (a description of a rule no game can deal), or a link that opens the family page with other params
 * or another board than the tile showed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LENSES, family, context } from "@workspace/game-utilities";
import { instantiate } from "@workspace/game-types";
import {
  galleryFamilies, gallerySearch, paramFields, paramsFromSearch, randomParams, setupFromSearch, withParam, DEFAULT_SETUP,
} from "../src/site/lib/rule-gallery.ts";

const inSupport = (familyId: string, inst: ReturnType<typeof instantiate>, p: unknown) =>
  family(familyId).support(context(inst)).some(s => JSON.stringify(s) === JSON.stringify(p));

test("the setup comes from GET params, falling back to the beginner board for anything missing or invalid", () => {
  assert.deepEqual(setupFromSearch(""), DEFAULT_SETUP);
  assert.deepEqual(DEFAULT_SETUP, { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "rgb" } });
  assert.deepEqual(setupFromSearch("?size=6&symbols=cards&colours=rainbow6"), { objectType: "Grid", typeArgs: { size: 6, symbols: "cards", colours: "rainbow6" } });
  assert.deepEqual(setupFromSearch("?size=3"), DEFAULT_SETUP, "3×3 is retired");
  assert.deepEqual(setupFromSearch("?size=99&colours=rgby"), DEFAULT_SETUP, "an unplayable board falls back whole");
  assert.deepEqual(setupFromSearch("?objectType=Int&min=0&max=9999"), { objectType: "Int", typeArgs: { min: 0, max: 9999 } });
});

test("the gallery lists exactly the annotated families each board can deal, in the lens order", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  assert.deepEqual(galleryFamilies(inst), LENSES.map(l => l.familyId));
  assert.deepEqual(galleryFamilies(instantiate("Int", { min: 0, max: 9999 })), [], "no Int family is annotated yet");
});

test("a tile's fields are the family's params with the values its support allows; changing one snaps to the support", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const fields = paramFields("parity_painter", inst);
  assert.deepEqual(fields.map(f => f.key), ["P", "Q", "key"]);
  assert.deepEqual(fields.find(f => f.key === "P")!.options, [0, 1, 2]);
  // P = Q is outside the support: setting P to the current Q keeps P and moves Q.
  const next = withParam("parity_painter", inst, { P: 0, Q: 1, key: "parity" }, "P", 1);
  assert.equal(next.P, 1);
  assert.notEqual(next.Q, 1);
  assert.ok(inSupport("parity_painter", inst, next));
  assert.deepEqual(withParam("magic_accountant", inst, { axis: "rows", T: 14 }, "axis", "cols").axis, "cols");
  for (const id of galleryFamilies(inst)) assert.ok(inSupport(id, inst, randomParams(id, inst, 7)), `${id}: random params are in the support`);
});

test("a tile's link carries the board and every param, and the family page reads them back exactly", () => {
  const setup = { objectType: "Grid", typeArgs: { size: 5, symbols: "cards", colours: "rgby" } };
  const inst = instantiate(setup.objectType, setup.typeArgs);
  for (const id of galleryFamilies(inst)) {
    const p = randomParams(id, inst, 3);
    const search = gallerySearch(setup, p);
    assert.deepEqual(setupFromSearch(search), setup, id);
    assert.deepEqual(paramsFromSearch(id, inst, search), p, id);
  }
  assert.equal(gallerySearch(setup, { diag: true }), "?size=5&symbols=cards&colours=rgby&diag=true");
  assert.equal(gallerySearch({ objectType: "Grid", typeArgs: setup.typeArgs }, {}), "?size=5&symbols=cards&colours=rgby", "Grid is the default type");
});

test("params missing or outside the support on a family page are completed from the support", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const p = paramsFromSearch("magic_accountant", inst, "?axis=cols");
  assert.equal(p.axis, "cols");
  assert.ok(inSupport("magic_accountant", inst, p));
  assert.ok(inSupport("magic_accountant", inst, paramsFromSearch("magic_accountant", inst, "?T=99999")));
  assert.deepEqual(paramsFromSearch("set_spotter", inst, "?diag=true"), { diag: true });
});
