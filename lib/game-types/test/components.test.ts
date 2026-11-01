import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CLASSES, COLOUR_COMPONENTS, GRID, GRID_COLOUR_SETS, GRID_SYMBOL_SETS, SYMBOL_COMPONENTS, closure, hueDistance,
  mixColours, stepSymbol,
} from "../src/index.ts";

test("component tables are frozen (golden)", () => {
  const lock = JSON.parse(readFileSync(new URL("./components.lock.json", import.meta.url), "utf8"));
  // Persisted objects, utility descriptors and calibration tables index these tables. Never edit the
  // lock to make this pass: add a new component id instead (e.g. "base16@2").
  assert.deepEqual(JSON.parse(JSON.stringify({ symbols: SYMBOL_COMPONENTS, colours: COLOUR_COMPONENTS })), lock);
  assert.ok(Object.isFrozen(SYMBOL_COMPONENTS.cards.codes) && Object.isFrozen(COLOUR_COMPONENTS.rgby.mixes[0]));
});

test("superclass closure", () => {
  assert.deepEqual(closure(["Numeral"]), ["Valued", "Ranked", "Numeral"]);
  assert.deepEqual(closure(["Faced"]), ["Ranked", "Faced"]);
  assert.deepEqual(closure(["Wheel"]), ["Spectral", "Wheel"]);
  for (const c of CLASSES) for (const s of c.superclasses) assert.ok(CLASSES.some(x => x.id === s), `${c.id} ⇒ ${s}`);
});

const unique = (xs: readonly unknown[]) => new Set(xs).size === xs.length;

for (const id of GRID_SYMBOL_SETS) {
  const s = SYMBOL_COMPONENTS[id], has = (c: string) => s.classes.includes(c);
  test(`symbol laws ${id}`, () => {
    assert.deepEqual(closure(s.classes), [...s.classes].sort((a, b) => CLASSES.findIndex(c => c.id === a) - CLASSES.findIndex(c => c.id === b)),
      "instances include their superclasses");
    // Finite
    assert.ok(unique(s.codes) && unique(s.glyphs) && unique(s.names));
    assert.ok(s.codes.every(c => /^[0-9A-Z]+$/.test(c) && c.length === s.codes[0].length));
    const S = [...Array(s.count).keys()];
    // Ranked
    for (const x of S) {
      assert.equal(stepSymbol(s, x, s.rankCount), x);
      assert.equal(s.ranks[stepSymbol(s, x)], (s.ranks[x] + 1) % s.rankCount);
      assert.equal(stepSymbol(s, stepSymbol(s, x, 1), -1), x);
      if (s.suits) assert.equal(s.suits[stepSymbol(s, x, 5)], s.suits[x]);
    }
    // Valued + Ranked: value non-decreasing in rank
    for (const x of S) for (const y of S) if (s.ranks[x] < s.ranks[y]) assert.ok(s.values[x] <= s.values[y]);
    if (has("Numeral")) {
      assert.equal(s.base, s.count);
      for (const x of S) assert.ok(s.values[x] === x && s.ranks[x] === x);
    }
    if (has("Suited")) {
      const pairs = S.map(x => `${s.ranks[x]},${s.suits![x]}`);
      assert.ok(unique(pairs) && S.every(x => s.suits![x] < s.suitNames!.length));
      for (const x of S) assert.equal(s.suits![x] * s.rankCount + s.ranks[x], x, "card(rank, suit) == s");
    }
    if (has("Faced")) {
      const faces = new Set(S.filter(x => s.faces![x]).map(x => s.ranks[x])).size;
      for (const x of S) if (s.faces![x]) assert.ok(s.ranks[x] >= s.rankCount - faces);
    }
  });
}

for (const id of GRID_COLOUR_SETS) {
  const c = COLOUR_COMPONENTS[id], C = [...Array(c.count).keys()];
  test(`colour laws ${id}`, () => {
    assert.ok(unique(c.letters) && unique(c.names) && unique(c.patterns) && c.letters.every(l => /^[A-Z]$/.test(l)));
    assert.deepEqual([...c.hues].sort((a, b) => a - b), C, "Spectral: hue is a bijection");
    if (c.classes.includes("Wheel")) for (const a of C) for (const b of C) {
      assert.equal(hueDistance(c, a, b), hueDistance(c, b, a));
      assert.ok(hueDistance(c, a, b) <= c.count / 2);
      for (const m of C) assert.ok(hueDistance(c, a, b) <= hueDistance(c, a, m) + hueDistance(c, m, b));
    }
    assert.equal(c.classes.includes("Mixable"), c.mixes.length > 0);
    for (const a of C) {
      assert.equal(mixColours(c, a, a), null);
      for (const b of C) {
        const m = mixColours(c, a, b);
        assert.equal(m, mixColours(c, b, a));
        if (m !== null) assert.ok(m !== a && m !== b);
      }
    }
  });
}

test("instantiation terms and classes", () => {
  const cards = GRID.instantiate({ size: 5, symbols: "cards", colours: "rainbow6" });
  assert.deepEqual(cards.classes, ["Valued", "Ranked", "Suited", "Faced", "Spectral", "Wheel", "Mixable"]);
  assert.equal(cards.terms["suits.count"], 4);
  assert.equal(cards.terms["faces.count"], 3);
  assert.equal(cards.terms["mixes.count"], 3);
  assert.equal(cards.terms["symbols.base"], undefined);
  const hex = GRID.instantiate({ size: 4, symbols: "base16", colours: "rgb" });
  assert.deepEqual(hex.classes, ["Valued", "Ranked", "Numeral", "Spectral"]);
  assert.equal(hex.terms["symbols.base"], 16);
  assert.equal(hex.key, "Grid(4,base16,rgb)");
  assert.equal(GRID.instantiate({}).key, "Grid(4,base10,ryb)"); // the beginner board
});

test("red, yellow, blue is the offered three-colour set; rgb stays valid for stored rooms but is not offered", () => {
  const ryb = COLOUR_COMPONENTS.ryb, rgb = COLOUR_COMPONENTS.rgb;
  assert.deepEqual(ryb.letters, ["R", "Y", "B"]);
  assert.deepEqual(ryb.names, ["red", "yellow", "blue"]);
  // Same structure as rgb (three colours in spectral order, no mixes, no wheel): the same rules and classes.
  assert.deepEqual([ryb.count, ryb.hues, ryb.mixes, ryb.classes], [rgb.count, rgb.hues, rgb.mixes, rgb.classes]);
  const colours = GRID.params.find(p => p.id === "colours")!;
  assert.equal(colours.kind, "component");
  if (colours.kind !== "component") return;
  assert.deepEqual(colours.options.map(o => o.id), ["ryb", "rgby", "rainbow6"], "ryb first; rgb not offered");
  assert.deepEqual(colours.legacy?.map(o => o.id), ["rgb"]);
  assert.equal(GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" }).key, "Grid(4,base10,rgb)", "stored rgb rooms still instantiate");
});
