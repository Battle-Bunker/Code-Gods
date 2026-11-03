/**
 * Named, typed params (src/params.ts): every typed family declares each param by name and type, each type resolves to
 * an exact domain on every shape, every support value lies in it, colours are stored by name and symbols as the board
 * prints them (never an index), and params stored before a family was typed are upgraded (the widen step).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, instantiate } from "@workspace/game-types";
import {
  FAMILIES, LENSES, UNTYPED_FAMILIES, card, context, family, paramOptions, paramsInDomain, upgradeDescriptor, upgradeParams,
} from "../src/index.ts";
import { allGrids, familiesOf } from "./support.ts";

const rgb = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const b12 = instantiate("Grid", { size: 5, symbols: "base12", colours: "rainbow6" });
const cards = instantiate("Grid", { size: 5, symbols: "cards", colours: "rgby" });

test("colour and symbol types resolve to the shape's own colours and glyphs", () => {
  assert.deepEqual(paramOptions({ kind: "colour", label: "c" }, rgb).map(o => o.value), ["red", "green", "blue"]);
  assert.deepEqual(paramOptions({ kind: "colour", label: "c" }, b12).map(o => o.value), [...COLOUR_COMPONENTS.rainbow6.names]);
  const red = paramOptions({ kind: "colour", label: "c" }, rgb)[0];
  assert.equal(red.swatch, COLOUR_COMPONENTS.rgb.css[0]);
  assert.ok(red.ink);
  const digits = paramOptions({ kind: "symbol", label: "s" }, b12);
  assert.deepEqual(digits.map(o => o.value), [...SYMBOL_COMPONENTS.base12.glyphs]);
  assert.equal(digits[10].label, "A (10)");
  assert.equal(digits[7].label, "7");
  const deck = paramOptions({ kind: "symbol", label: "s" }, cards);
  assert.equal(deck.length, 52);
  assert.equal(deck[13 + 9].value, "10♥");
  assert.equal(deck[13 + 9].label, "10♥ (ten of hearts)");
  assert.deepEqual(paramOptions({ kind: "int", label: "n", min: 3, max: 5 }, rgb).map(o => o.value), [3, 4, 5]);
  assert.deepEqual(paramOptions({ kind: "bool", label: "b" }, rgb).map(o => o.value), [false, true]);
  assert.throws(() => paramOptions({ kind: "colour", label: "c" }, instantiate("Int", {})));
});

test("every typed family × every grid: named params, exact domains, support inside them, no colour or symbol indices", () => {
  for (const inst of allGrids()) {
    const ctx = context(inst);
    for (const f of familiesOf(inst)) {
      if (UNTYPED_FAMILIES.has(f.id)) { assert.equal(f.params, undefined, `${f.id} is listed untyped but declares params`); continue; }
      assert.ok(f.params, `${f.id}: declares no params (type them, or list it in UNTYPED_FAMILIES)`);
      const fields = f.params(ctx), where = `${f.id} ${inst.key}`;
      for (const field of fields) {
        // Names say what the param is: a word, never a letter (X, T, C).
        assert.match(field.key, /^[a-z][a-z_]{2,}$/, `${where}: param name ${field.key}`);
        assert.ok(field.label && field.options.length > 0, `${where}: ${field.key} has a label and a domain`);
        if (field.kind === "colour") assert.ok(field.options.every(o => typeof o.value === "string" && o.swatch), `${where}: ${field.key}`);
        if (field.kind === "symbol") assert.ok(field.options.every(o => typeof o.value === "string"), `${where}: ${field.key}`);
      }
      for (const p of f.support(ctx)) {
        assert.ok(paramsInDomain(fields, p), `${where}: support value ${JSON.stringify(p)} outside its declared domain`);
        // The canonical form (a calibration orbit's representative) has the same names, and its colours and symbols are the
        // shape's own; a number may be the orbit's mirror image outside the dealt range (Magic Accountant's T ↔ N·Σ − T).
        const canon = f.canonical(p, ctx) as Record<string, unknown>;
        assert.deepEqual(Object.keys(canon).sort(), fields.map(x => x.key).sort(), `${where}: canonical names`);
        for (const x of fields.filter(y => y.kind === "colour" || y.kind === "symbol")) {
          assert.ok(x.options.some(o => o.value === canon[x.key]), `${where}: canonical ${x.key} ${String(canon[x.key])} is not one of the shape's`);
        }
        assert.deepEqual(upgradeParams(f.id, p, inst), p, `${where}: today's params upgrade to themselves`);
      }
    }
  }
});

test("the annotated families (every lens) and the defence goals are typed", () => {
  for (const l of LENSES) assert.ok(!UNTYPED_FAMILIES.has(l.familyId) && family(l.familyId).params, l.familyId);
  for (const f of FAMILIES.filter(x => x.objectType === "Grid" && x.role === "penalty")) assert.ok(!UNTYPED_FAMILIES.has(f.id), f.id);
});

test("goal cards carry the typed params with how each value reads", () => {
  const c = card({ familyId: "kingdom", params: { colour: "green" } }, context(rgb));
  assert.deepEqual(c.params, [{ key: "colour", label: "Your colour", kind: "colour", value: "green", text: "green" }]);
  assert.match(c.source.python, /MY_COLOUR = "green"/);
  const withGoal = card({ familyId: "kingdom", params: { colour: "green" }, penalty: { familyId: "hate_colour", params: { colour: "blue" } } }, context(rgb));
  assert.deepEqual(withGoal.penalty?.params, [{ key: "colour", label: "Hated colour", kind: "colour", value: "blue", text: "blue" }]);
});

test("legacy params (stored before typing) upgrade to today's shape, idempotently", () => {
  const cases: [string, object, object][] = [
    ["picture_frame", { X: 1 }, { colour: "green" }],
    ["kingdom", { C: 2 }, { colour: "blue" }],
    ["honest_minesweeper", { X: 0 }, { mine: "red" }],
    ["chessmaster", { A: 2, B: 0 }, { colour_a: "blue", colour_b: "red" }],
    ["parity_painter", { P: 0, Q: 1, key: "parity" }, { even_or_red: "red", odd_or_black: "green", split: "parity" }],
    ["magic_accountant", { axis: "rows", T: 18 }, { axis: "rows", target: 18 }],
    ["hate_colour", { colour: 1 }, { colour: "green" }],
  ];
  for (const [id, old, now] of cases) {
    assert.deepEqual(upgradeParams(id, old as never, rgb), now, id);
    assert.deepEqual(upgradeParams(id, now as never, rgb), now, `${id}: idempotent`);
    // Every method reads either shape (the widen step): the old row's card is today's card.
    assert.deepEqual(card({ familyId: id === "hate_colour" ? "kingdom" : id, params: (id === "hate_colour" ? { C: 0 } : old) as never }, context(rgb)).summary,
      card({ familyId: id === "hate_colour" ? "kingdom" : id, params: (id === "hate_colour" ? { colour: "red" } : now) as never }, context(rgb)).summary, id);
  }
  assert.deepEqual(upgradeDescriptor({ familyId: "kingdom", params: { C: 0 }, penalty: { familyId: "hate_colour", params: { colour: 2 } } }, rgb),
    { familyId: "kingdom", params: { colour: "red" }, penalty: { familyId: "hate_colour", params: { colour: "blue" } } });
});
