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
  RESERVED_PARAMS, galleryFamilies, gallerySearch, paramFields, rawParamsOf, setupFields, paramsFromSearch, randomParams, setupFromSearch, withParam, DEFAULT_SETUP,
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

test("a tile's fields are the family's named, typed params with the values its support allows; changing one snaps to the support", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const fields = paramFields("parity_painter", inst);
  assert.deepEqual(fields.map(f => [f.key, f.kind]), [["even_or_red", "colour"], ["odd_or_black", "colour"], ["split", "choice"]]);
  const even = fields.find(f => f.key === "even_or_red")!;
  assert.equal(even.label, "Colour for even numbers");
  // A colour picker: the board's colours by name, each with its swatch (never "0/1/2").
  assert.deepEqual(even.options.map(o => o.value), ["red", "green", "blue"]);
  assert.ok(even.options.every(o => o.swatch && o.label === o.value));
  // even = odd is outside the support: setting even to the current odd colour keeps it and moves odd.
  const next = withParam("parity_painter", inst, { even_or_red: "red", odd_or_black: "green", split: "parity" }, "even_or_red", "green");
  assert.equal(next.even_or_red, "green");
  assert.notEqual(next.odd_or_black, "green");
  assert.ok(inSupport("parity_painter", inst, next));
  const magic = paramFields("magic_accountant", inst);
  assert.deepEqual(magic.map(f => [f.key, f.kind, f.label]), [["axis", "choice", "Lines that count"], ["target", "int", "Magic number"]]);
  assert.deepEqual(magic[0].options.map(o => o.label), ["rows", "columns", "rows and columns"]);
  assert.deepEqual(withParam("magic_accountant", inst, { axis: "rows", target: 18 }, "axis", "cols").axis, "cols");
  for (const id of galleryFamilies(inst)) assert.ok(inSupport(id, inst, randomParams(id, inst, 7)), `${id}: random params are in the support`);
  for (const id of galleryFamilies(inst)) for (const f of paramFields(id, inst)) assert.ok(f.label && f.options.length, `${id}.${f.key}`);
  // Picture Frame: a labelled colour picker and a labelled symbol picker (cards name the card), both dealt.
  const frame = paramFields("picture_frame", instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" }));
  assert.deepEqual(frame.map(f => [f.key, f.kind, f.label]), [["colour", "colour", "Your colour"], ["symbol", "symbol", "Your card"]]);
  assert.equal(frame[1].options.length, 52);
  assert.equal(frame[1].options.find(o => o.value === "10♥")!.label, "10♥ (ten of hearts)");
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
  assert.equal(gallerySearch(setup, { diag: true }, "typescript"), "?size=5&symbols=cards&colours=rgby&diag=true&lang=typescript");
  assert.equal(gallerySearch({ objectType: "Grid", typeArgs: setup.typeArgs }, {}), "?size=5&symbols=cards&colours=rgby", "Grid is the default type");
});

test("params missing or outside the support on a family page are completed from the support", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const p = paramsFromSearch("magic_accountant", inst, "?axis=cols");
  assert.equal(p.axis, "cols");
  assert.ok(inSupport("magic_accountant", inst, p));
  assert.ok(inSupport("magic_accountant", inst, paramsFromSearch("magic_accountant", inst, "?target=99999")));
  assert.deepEqual(paramsFromSearch("set_spotter", inst, "?diag=true"), {}, "a param the family no longer has is ignored");
});

test("no annotated family has a param named like a board arg or the language, so links never overwrite the board", () => {
  for (const args of [{ size: 4, symbols: "base10", colours: "rgb" }, { size: 7, symbols: "cards", colours: "rainbow6" }]) {
    const inst = instantiate("Grid", args);
    for (const id of galleryFamilies(inst)) for (const f of paramFields(id, inst)) assert.ok(!RESERVED_PARAMS.includes(f.key), `${id}.${f.key}`);
  }
  assert.ok(RESERVED_PARAMS.includes("size") && RESERVED_PARAMS.includes("max") && RESERVED_PARAMS.includes("lang"));
  assert.deepEqual(rawParamsOf("?size=4&X=1&lang=typescript&axis=rows"), { X: "1", axis: "rows" });
});

test("a valid board the presets do not list still shows its own values in the setup selects", () => {
  const fields = setupFields({ objectType: "Int", typeArgs: { min: 5, max: 100 } });
  assert.ok(fields.find(f => f.id === "min")!.options.some(o => o.value === 5));
  assert.ok(fields.find(f => f.id === "max")!.options.some(o => o.value === 100));
});
