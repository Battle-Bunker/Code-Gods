import assert from "node:assert/strict";
import test from "node:test";
import {
  GRID_SIZES, GRID_SYMBOL_SETS, GRID_COLOUR_SETS, SYMBOL_COMPONENTS, COLOUR_COMPONENTS,
  encodeGrid, decodeGrid, isGridValue, gridMaxLength, spawnGrid, parseGridForDisplay, glyphForCode, gridTypeKey,
  type GridTypeArgs,
} from "../src/index.ts";

const below = (seed: number) => {
  let x = seed;
  return (b: bigint) => { x = (x * 1103515245 + 12345) % 2147483648; return BigInt(x) % b; };
};
const all: GridTypeArgs[] = GRID_SIZES.flatMap(size => GRID_SYMBOL_SETS.flatMap(symbols =>
  GRID_COLOUR_SETS.map(colours => ({ size, symbols, colours }))));

test("codes are unique, fixed width, ASCII; letters unique per colour set", () => {
  for (const s of Object.values(SYMBOL_COMPONENTS)) {
    assert.equal(new Set(s.codes).size, s.count);
    assert.equal(new Set(s.codes.map(c => c.length)).size, 1);
    assert.ok(s.codes.every(c => /^[0-9A-Z]+$/.test(c)));
  }
  for (const c of Object.values(COLOUR_COMPONENTS)) assert.equal(new Set(c.letters).size, c.count);
  assert.equal(SYMBOL_COMPONENTS.cards.codes[0], "AS");
  assert.equal(SYMBOL_COMPONENTS.cards.codes[13 + 9], "TH");
  assert.equal(SYMBOL_COMPONENTS.cards.glyphs[13 + 9], "10♥");
  assert.deepEqual(COLOUR_COMPONENTS.rgby.letters, ["R", "Y", "G", "B"]);
});

test("round trip and canonicality for all 60 GridTypes", () => {
  for (const t of all) {
    const text = spawnGrid(t, below(t.size * 7 + t.symbols.length));
    assert.ok(text.length <= gridMaxLength(t), gridTypeKey(t));
    assert.ok(/^[\x20-\x7e]+$/.test(text));
    assert.equal(encodeGrid(decodeGrid(text, t), t), text);
    assert.ok(isGridValue(text, t));
    assert.ok(!isGridValue(text + ",", t));
    assert.ok(!isGridValue(text.toLowerCase(), t));
  }
  assert.equal(gridMaxLength({ size: 7, symbols: "cards", colours: "rgb" }), 195);
});

test("strict decode rejects other GridTypes and malformed strings", () => {
  const t: GridTypeArgs = { size: 3, symbols: "base10", colours: "rgb" };
  assert.ok(isGridValue("7R,3G,0B/1R,2R,9B/4G,4G,8R", t));
  for (const bad of ["7R,3G,0B/1R,2R,9B", "7Y,3G,0B/1R,2R,9B/4G,4G,8R", "AR,3G,0B/1R,2R,9B/4G,4G,8R",
    "7R,3G,0B/1R,2R,9B/4G,4G,8R/", " 7R,3G,0B/1R,2R,9B/4G,4G,8R", 7 as unknown as string]) {
    assert.ok(!isGridValue(bad, t), String(bad));
  }
  assert.ok(isGridValue("AR,3G,0B/1R,2R,9B/4G,4G,8R", { ...t, symbols: "base12" }));
});

test("display parse works without settings", () => {
  const cells = parseGridForDisplay("THR,KSB/2CG,9DY")!;
  assert.equal(cells.length, 2);
  assert.equal(glyphForCode(cells[0][0].code), "10♥");
  assert.equal(parseGridForDisplay("hello"), null);
  assert.equal(parseGridForDisplay(42), null);
  assert.equal(parseGridForDisplay("1R,2G/3B"), null);
});

test("Grid settings: only shipped GridTypes; spawn and assert use the codec", async () => {
  const { DEFAULT_SETTINGS, validateSettings, assertObjectValue, uniformObject, SHIPPED_GRID_TYPE_KEYS, personalScore } = await import("../src/index.ts");
  const grid = { ...DEFAULT_SETTINGS, objectType: "Grid" as const };
  assert.doesNotThrow(() => validateSettings(grid));
  for (const key of SHIPPED_GRID_TYPE_KEYS) {
    const [size, symbols, colours] = key.slice(5, -1).split(",");
    const s = { ...grid, gridSize: Number(size), gridSymbols: symbols as never, gridColours: colours as never };
    validateSettings(s);
    const v = uniformObject(s, below(3));
    assert.doesNotThrow(() => assertObjectValue(v, s));
    assert.throws(() => assertObjectValue(42, s));
  }
  assert.throws(() => validateSettings({ ...grid, gridSize: 7 }), /Unsupported grid/);
  assert.throws(() => validateSettings({ ...grid, gridColours: "cmyk" as never }), /Unsupported grid/);
  assert.throws(() => validateSettings({ ...grid, agentEnergyPerSecond: -1 }), /agentEnergyPerSecond/);
  // Int/string settings ignore the grid fields
  assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, gridSize: 99 }));
  // signed net bits: the others' sum is floored at zero
  assert.equal(personalScore(new Map([["a", 3], ["b", -5], ["c", 1]]), "a").score, 0);
  assert.equal(personalScore(new Map([["a", -2], ["b", 5], ["c", 1]]), "a").score, -12);
  assert.equal(personalScore(new Map([["a", 2], ["b", 5], ["c", -1]]), "a").score, 8);
});
