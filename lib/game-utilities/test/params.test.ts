/**
 * Named, typed params (src/params.ts): every typed family declares each param by name and type, each type resolves to
 * an exact domain on every shape, every support value lies in it, colours are stored by name and symbols as the board
 * prints them (never an index), and params stored before a family was typed are upgraded (the widen step).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, instantiate } from "@workspace/game-types";
import {
  FAMILIES, card, context, family, paramOptions, paramsInDomain,
} from "../src/index.ts";
import { allGrids, familiesOf, intInsts, stringInsts } from "./support.ts";

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

test("every typed family × every shape: named params, exact domains, support inside them, no colour or symbol indices", () => {
  for (const inst of [...allGrids(), ...intInsts(), ...stringInsts()]) {
    const ctx = context(inst);
    for (const f of familiesOf(inst)) {
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
      }
    }
  }
});

test("goal cards carry the typed params with how each value reads", () => {
  const c = card({ familyId: "kingdom", params: { colour: "green" } }, context(rgb));
  assert.deepEqual(c.params, [{ key: "colour", label: "Your colour", kind: "colour", value: "green", text: "green" }]);
  assert.match(c.source.python, /MY_COLOUR = "green"/);
  const withGoal = card({ familyId: "kingdom", params: { colour: "green" }, penalty: { familyId: "hate_colour", params: { colour: "blue" } } }, context(rgb));
  assert.deepEqual(withGoal.penalty?.params, [{ key: "colour", label: "Hated colour", kind: "colour", value: "blue", text: "blue" }]);
});

test("a set param: Bingo Caller's called ranks, by name in rank order, no repeats", () => {
  const bingo = family("bingo_caller").params(context(b12))[0];
  assert.equal(bingo.kind, "set");
  assert.equal(bingo.size, 4);
  assert.equal(paramsInDomain([bingo], { called: ["0", "3", "A", "B"] }), true);
  assert.equal(paramsInDomain([bingo], { called: ["3", "0", "A", "B"] }), false, "out of order");
  assert.equal(paramsInDomain([bingo], { called: ["0", "0", "A", "B"] }), false, "repeated");
});
