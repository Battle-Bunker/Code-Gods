import assert from "node:assert/strict";
import { test } from "node:test";
import {
  atLeast, badgesFor, explain, has, instantiate, lockedReason, minColours, minSize, not, odd, resolve, satisfied, unlock, type Constraint,
} from "../src/index.ts";

const grid = (size: number, symbols: string, colours: string) => instantiate("Grid", { size, symbols, colours });

test("satisfied", () => {
  const g = grid(5, "cards", "rgb");
  assert.ok(satisfied(has("Suited"), g) && satisfied(has("Ranked"), g) && !satisfied(has("Numeral"), g));
  assert.ok(satisfied(odd(), g) && satisfied(minSize(5), g) && !satisfied(minSize(6), g));
  assert.ok(satisfied(not(has("Mixable")), g));
  assert.ok(!satisfied(atLeast("symbols.base", 10), g), "missing terms never satisfy");
  assert.ok(satisfied({ term: "colours.count", op: "==", value: 3 }, g));
});

const cases: [string, Constraint[], ReturnType<typeof grid>, string, Record<string, unknown> | undefined][] = [
  ["suits", [has("Suited")], grid(5, "base10", "rgb"), "needs ♠ Suits: pick Playing cards", { symbols: "cards" }],
  ["place value", [has("Numeral")], grid(5, "cards", "rgb"), "needs 🔟 Place value: pick Digits 0–9, Base 12 (0–B) or Hex (0–F)", { symbols: "base10" }],
  ["middle", [odd()], grid(4, "base10", "rgb"), "needs a middle square: pick size 3, 5 or 7", { size: 3 }],
  ["bigger", [minSize(6)], grid(5, "base10", "rgb"), "needs a bigger board: size 6 or more", { size: 6 }],
  ["mixing", [has("Mixable")], grid(5, "base10", "rgb"), "needs 🎨 Paint mixing: pick Red, yellow, green, blue or Rainbow (6 colours)", { colours: "rgby" }],
  ["colours", [minColours(5)], grid(5, "base10", "rgb"), "needs at least 5 colours: pick Rainbow (6 colours)", { colours: "rainbow6" }],
  ["wheel", [has("Wheel")], grid(5, "base10", "rgby"), "needs 🎡 Colour wheel: pick Rainbow (6 colours)", { colours: "rainbow6" }],
  ["two params", [has("Suited"), odd()], grid(4, "base10", "rgb"), "needs ♠ Suits: pick Playing cards", { size: 3, symbols: "cards" }],
  ["without suits", [not(has("Suited"))], grid(5, "cards", "rgb"), "doesn't work with ♠ Suits: pick Digits 0–9, Base 12 (0–B) or Hex (0–F)", { symbols: "base10" }],
  ["impossible", [minSize(9)], grid(5, "base10", "rgb"), "needs a bigger board: size 9 or more", undefined],
  ["natural", [has("Natural")], instantiate("Int", {}), "needs 🔢 Counting numbers: pick smallest 0", { min: 0 }],
  ["bounds", [atLeast("bounds.max", 50000)], instantiate("Int", { min: 0, max: 9999 }), "needs the biggest number to be at least 50000: pick biggest 2147483647", { max: 50000 }],
  ["length", [atLeast("length.max", 64)], instantiate("string", { maxLength: 16 }), "needs the longest text to be at least 64: pick longest 128", { maxLength: 64 }],
];

for (const [name, cs, inst, reason, patch] of cases) {
  test(`locked: ${name}`, () => {
    const r = resolve(cs, inst);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, reason);
    assert.deepEqual(r.unlock, patch);
    assert.equal(lockedReason(cs, inst), reason);
    if (patch) assert.ok(resolve(cs, instantiate(inst.objectType, { ...inst.args, ...patch } as never)).ok, "unlock fixes it");
  });
}

test("available: badges are maximal", () => {
  const r = resolve([has("Numeral"), has("Valued"), minSize(5), odd()], grid(5, "base12", "rgb"));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.badges.map(b => b.label), ["Place value", "Big board", "Middle square"]);
  assert.deepEqual(unlock([has("Suited")], grid(5, "cards", "rgb")), {});
  assert.equal(lockedReason([], grid(3, "base10", "rgb")), null);
});

test("count parity reads as a count, and only a demand for 4+ colours earns the More colours badge", () => {
  const rgb = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgb" });
  assert.equal(explain({ term: "colours.count", parity: "even" }, rgb).split(":")[0], "needs an even number of colours");
  assert.deepEqual(badgesFor([{ term: "colours.count", op: ">=", value: 3 }]).map(b => b.id), []);
  assert.deepEqual(badgesFor([{ term: "colours.count", op: ">=", value: 4 }]).map(b => b.id), ["colours>=4"]);
});
