/**
 * The example object's value model (src/lib/object-editor-model.ts): what the goal card's editor can set, for every
 * object type. What would break: an edit producing a value the type's codec refuses (the card would explain an object
 * no game can hold), a random object that is not a legal value, a palette offering colours the board does not allow,
 * or an Int/string text box accepting out-of-range input.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { instantiate, objectType } from "@workspace/game-types";
import {
  editorKindOf, gridCellsOf, gridPalette, parseObjectText, randomObject, withGridCell,
} from "../src/lib/object-editor-model.ts";

const G = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const valid = (inst: ReturnType<typeof instantiate>, v: unknown) => objectType(inst.objectType).codec(inst).isValid(v);

test("random objects are legal values of their type, repeatable by seed and varied across seeds", () => {
  for (const inst of [G, instantiate("Grid", { size: 7, symbols: "cards", colours: "rainbow6" }), instantiate("Int", { min: 0, max: 9999 }), instantiate("string", { maxLength: 16 })]) {
    const a = randomObject(inst, 1), b = randomObject(inst, 1);
    assert.ok(valid(inst, a), `${inst.key}: ${a}`);
    assert.equal(a, b, `${inst.key}: same seed, same object`);
    assert.ok(new Set([1, 2, 3, 4, 5].map(s => randomObject(inst, s))).size > 1, `${inst.key}: seeds vary`);
  }
});

test("a grid's palette is exactly the board's symbols and colours", () => {
  const p = gridPalette(G);
  assert.deepEqual(p.symbols.map(s => s.glyph), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(p.colours.map(c => c.letter), ["R", "G", "B"]);
  assert.deepEqual(p.colours.map(c => c.name), ["red", "green", "blue"]);
  const cards = gridPalette(instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" }));
  assert.equal(cards.symbols.length, 52);
  assert.equal(cards.colours.length, 4);
});

test("editing one cell changes only that cell's symbol or colour, and stays a legal grid", () => {
  const v = "2R,5R,8R,1G/4G,4B,4R,7G/6B,3G,9R,0B/1R,7B,3B,5G";
  const cells = gridCellsOf(v, G)!;
  assert.deepEqual(cells[0][1], { sym: 5, col: 0 });
  const recoloured = withGridCell(v, G, 0, 1, { col: 2 });
  assert.equal(recoloured, "2R,5B,8R,1G/4G,4B,4R,7G/6B,3G,9R,0B/1R,7B,3B,5G");
  const resymbolled = withGridCell(recoloured, G, 3, 3, { sym: 0 });
  assert.equal(resymbolled, "2R,5B,8R,1G/4G,4B,4R,7G/6B,3G,9R,0B/1R,7B,3B,0G");
  assert.ok(valid(G, resymbolled));
  assert.equal(gridCellsOf("not a grid", G), null, "a value of another shape has no cells");
  assert.throws(() => withGridCell(v, G, 0, 0, { col: 3 }), /out of range/, "rgb has no fourth colour");
});

test("text input for Int and string objects is checked against the type's domain", () => {
  const I = instantiate("Int", { min: 0, max: 9999 });
  assert.deepEqual(parseObjectText("42", I), { ok: true, value: 42 });
  assert.deepEqual(parseObjectText(" -0 ", I), { ok: true, value: 0 });
  assert.equal(parseObjectText("10000", I).ok, false);
  assert.equal(parseObjectText("4.5", I).ok, false);
  assert.equal(parseObjectText("", I).ok, false);
  const S = instantiate("string", { maxLength: 4 });
  assert.deepEqual(parseObjectText("abcd", S), { ok: true, value: "abcd" });
  assert.deepEqual(parseObjectText("", S), { ok: true, value: "" }, "the empty string is a value");
  assert.equal(parseObjectText("abcde", S).ok, false);
  assert.equal(parseObjectText("é", S).ok, false, "ASCII only");
  assert.deepEqual(parseObjectText("1R,2G,3B,4R/1R,2G,3B,4R/1R,2G,3B,4R/1R,2G,3B,5R", G), { ok: true, value: "1R,2G,3B,4R/1R,2G,3B,4R/1R,2G,3B,4R/1R,2G,3B,5R" });
  assert.equal(parseObjectText("1R,2G", G).ok, false);
});

test("every object type the code supports has an editor kind", () => {
  assert.deepEqual(["Grid", "Int", "string"].map(editorKindOf), ["grid", "number", "text"]);
});
