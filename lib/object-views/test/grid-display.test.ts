import assert from "node:assert/strict";
import test from "node:test";
import { COLOUR_COMPONENTS, COLOUR_LETTERS } from "@workspace/game-types";
import {
  COLOUR_PATTERNS, changedCells, contrastRatio, gridModel, gridSummary, looksLikeGrid, patternStyle,
  getColourCue, setColourCue, subscribeColourCue, gridDigitsLines,
} from "../src/grid-display.ts";
import { createObjectTypeRegistry } from "../src/registry.ts";

test("every css/ink pair meets WCAG AA (4.5:1)", () => {
  const pairs = [
    ...Object.entries(COLOUR_LETTERS).map(([l, c]) => [l, c.css, c.ink] as const),
    ...Object.values(COLOUR_COMPONENTS).flatMap(set => set.css.map((css, i) => [set.letters[i], css, set.ink[i]] as const)),
  ];
  assert.ok(pairs.length >= 6);
  for (const [letter, css, ink] of pairs) {
    const ratio = contrastRatio(css, ink);
    assert.ok(ratio >= 4.5, `${letter}: ${css} on ${ink} is ${ratio.toFixed(2)}:1`);
  }
});

test("contrast ratio matches known WCAG values", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
});

test("every colour has a distinct non-colour cue (letter and pattern)", () => {
  const letters = Object.keys(COLOUR_LETTERS);
  assert.equal(new Set(letters).size, letters.length);
  const patterns = letters.map(l => COLOUR_PATTERNS[l]);
  assert.ok(patterns.every(Boolean), "every colour letter has a pattern");
  assert.equal(new Set(patterns).size, letters.length, "patterns are distinct");
  const images = letters.map(l => JSON.stringify(patternStyle(l, COLOUR_LETTERS[l].ink)));
  assert.equal(new Set(images).size, letters.length, "rendered patterns are distinct");
  for (const set of Object.values(COLOUR_COMPONENTS)) {
    assert.equal(new Set(set.letters.map(l => COLOUR_PATTERNS[l])).size, set.count, `${set.id} cues distinct`);
  }
});

test("grid model: glyphs, names, colours", () => {
  const m = gridModel("7R,3G,0B/1R,2R,9B/4G,4G,8R")!;
  assert.equal(m.size, 3);
  assert.equal(m.rows[0][0].glyph, "7");
  assert.equal(m.rows[0][0].name, "seven, red");
  assert.equal(m.rows[0][2].css, COLOUR_LETTERS.B.css);
  assert.equal(m.strict, false);
  const cards = gridModel("THB,ASR/KCV,2DO")!;
  assert.equal(cards.rows[0][0].glyph, "10♥");
  assert.equal(cards.rows[0][0].compactGlyph, "10");
  assert.equal(cards.rows[0][0].name, "ten of hearts, blue");
  assert.equal(cards.rows[1][1].name, "two of diamonds, orange");
});

test("grid model: strict when settings match, raw strings rejected", () => {
  const v = "7R,3G,0B/1R,2R,9B/4G,4G,8R";
  assert.equal(gridModel(v, { size: 3, symbols: "base10", colours: "rgb" })!.strict, true);
  assert.equal(gridModel(v, { size: 4, symbols: "base10", colours: "rgb" })!.strict, false);
  for (const s of ["hello", "", "a,b/c,d", "7R,3G"]) assert.equal(gridModel(s), null, s);
  assert.equal(gridModel(42), null);
});

test("summary and changed cells", () => {
  const a = gridModel("1R,2G/3B,4R")!, b = gridModel("1R,2B/3B,5R")!;
  const s = gridSummary(a);
  assert.match(s, /^Grid, 2 by 2 \(2 red, 1 green, 1 blue\)\./);
  assert.match(s, /Row 1: one, red; two, green\./);
  assert.deepEqual(changedCells(b, a), [[false, true], [false, true]]);
  assert.equal(changedCells(a, gridModel("1R,2R,3R/1R,2R,3R/1R,2R,3R")), null);
});

test("inference: grids of 2×2 or more only", () => {
  assert.equal(looksLikeGrid("7R,3G/1B,2R"), true);
  assert.equal(looksLikeGrid("AB"), false, "1×1 is treated as an ordinary string");
  assert.equal(looksLikeGrid("hello world"), false);
  assert.equal(looksLikeGrid(12), false);
});

test("registry: known type wins, otherwise latest matching infer", () => {
  const r = createObjectTypeRegistry<string>();
  r.register({ type: "string", component: "S", infer: v => typeof v === "string" });
  r.register({ type: "Int", component: "I", infer: v => typeof v === "number" });
  r.register({ type: "Grid", component: "G", infer: looksLikeGrid });
  const grid = "7R,3G/1B,2R";
  assert.equal(r.resolve(grid)?.component, "G");
  assert.equal(r.resolve(grid, { objectType: "string" })?.component, "S", "string games stay strings");
  assert.equal(r.resolve("hi")?.component, "S");
  assert.equal(r.resolve(5)?.component, "I");
  assert.equal(r.resolve("hi", { objectType: "Grid" })?.component, "G", "Grid component handles its own fallback");
  assert.equal(r.resolve(5, { objectType: "Unknown" })?.component, "I");
  r.register({ type: "Tree", component: "T", infer: v => v === "tree" });
  assert.equal(r.resolve("tree")?.component, "T");
  assert.deepEqual(r.types(), ["string", "Int", "Grid", "Tree"]);
});

test("colour cue: defaults to pattern, survives missing or throwing storage", () => {
  const g = globalThis as { localStorage?: unknown };
  const had = Object.getOwnPropertyDescriptor(g, "localStorage");
  try {
    Object.defineProperty(g, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(getColourCue(), "pattern");
    let calls = 0;
    const off = subscribeColourCue(() => calls++);
    setColourCue("letter");
    assert.equal(getColourCue(), "letter");
    assert.equal(calls, 1);
    off();
    setColourCue("pattern");
    assert.equal(calls, 1);
  } finally {
    if (had) Object.defineProperty(g, "localStorage", had); else delete g.localStorage;
  }
});

test("digits: one line per row, one glyph per cell, each tagged with its colour letter", () => {
  const m = gridModel("7R,3G,0B,1Y/1R,2R,9B,5O/4G,4G,8R,6V/0B,0B,0B,0B")!;
  const lines = gridDigitsLines(m);
  assert.deepEqual(lines.map(l => l.text), ["7 3 0 1", "1 2 9 5", "4 4 8 6", "0 0 0 0"], "a 4×4 reads as 4 lines of 4 digits");
  assert.deepEqual(lines[0].cells.map(c => c.letter), ["R", "G", "B", "Y"]);
  assert.deepEqual(lines[1].cells.map(c => c.glyph), ["1", "2", "9", "5"]);
  assert.ok(lines.flatMap(l => l.cells).every(c => c.pad === "" && !c.changed));
});

test("digits: cards show rank and suit, padded so columns line up", () => {
  const lines = gridDigitsLines(gridModel("THB,ASR/KCV,2DO")!);
  assert.deepEqual(lines.map(l => l.text), ["10♥  A♠", " K♣  2♦"]);
  assert.equal(lines[0].cells[1].pad, " ");
  assert.equal(lines[0].cells[1].glyph, "A♠", "the pad is not part of the glyph (an underline never spans it)");
});

test("digits: changed cells are flagged (drawn underlined and bold), and the letter cue appends the colour letter", () => {
  const a = gridModel("1R,2G/3B,4R")!, b = gridModel("1R,2B/3B,5R")!;
  const lines = gridDigitsLines(b, changedCells(b, a));
  assert.deepEqual(lines.map(l => l.cells.map(c => c.changed)), [[false, true], [false, true]]);
  assert.deepEqual(gridDigitsLines(b, null, { letters: true }).map(l => l.text), ["1R 2B", "3B 5R"]);
});
