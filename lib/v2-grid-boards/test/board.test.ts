import { test } from "node:test";
import assert from "node:assert/strict";
import { isInvalid } from "@workspace/v2-core";
import { board4Type as boardType, boardTypeOf, boardVariant, BOARD_VARIANTS, cellBits, decodeBoard, encodeBoard, symbolValue, type BoardState, paletteOf } from "../src/index.ts";

const v4 = boardVariant(4, "base10", "rgb");

test("the wire is the old game's: rows by /, cells by commas, each a symbol code and a colour letter", () => {
  const s: BoardState = { sym: [7, 3, 0, 1, 2, 9, 4, 4, 8, 0, 0, 0, 1, 1, 1, 1], col: [0, 3, 4, 0, 0, 4, 3, 3, 0, 0, 0, 0, 4, 4, 4, 4] };
  const w = encodeBoard(s);
  assert.equal(w, "7R,3G,0B,1R/2R,9B,4G,4G/8R,0R,0R,0R/1B,1B,1B,1B");
  assert.deepEqual(decodeBoard(w), s);
  assert.throws(() => decodeBoard("7R,3G,0B/2R,9B,4G/8R,0R"));
  assert.throws(() => decodeBoard("7X,3G/2R,9B"));
  // Yellow is not one of rgb's colours: the wire decodes, the variant refuses it.
  assert.ok(isInvalid(boardType.canonical(decodeBoard("7Y,3G,0B,1R/2R,9B,4G,4G/8R,0R,0R,0R/1B,1B,1B,1B"), v4)));
});

test("cards: rank then suit then colour; values are A = 1 … K = 13", () => {
  const v = boardVariant(7, "cards", "rainbow6");
  const sym = Array(49).fill(0), col = Array(49).fill(5); // violet
  sym[0] = 12 + 13 * 3; // king of clubs
  sym[1] = 9 + 13; // ten of hearts
  const w = encodeBoard({ sym, col, cards: true });
  assert.ok(w.startsWith("KCV,THV,ASV"), w);
  assert.equal(symbolValue(v, sym[0]), 13);
  assert.equal(symbolValue(v, sym[1]), 10);
  assert.equal(symbolValue(v, 0), 1);
  assert.deepEqual(decodeBoard(w), { sym, col, cards: true });
  // All low cards still read as cards.
  assert.equal(encodeBoard({ sym: [0, 1, 2, 3], col: [0, 0, 0, 0], cards: true }), "ASR,2SR/3SR,4SR");
});

test("the law is a product: value costs half a bit a unit, colour (and suit) are flat; the code is complete", () => {
  for (const v of BOARD_VARIANTS) {
    // Σ over one cell's alphabet of 2^−bits is 1: every cell's code is complete, so the board's is.
    const p = (v.params as { symbols: string }).symbols;
    const S = p === "cards" ? 52 : p === "base16" ? 16 : p === "base12" ? 12 : 10;
    let kraft = 0;
    for (let s = 0; s < S; s++) for (const c of paletteOf(v)) kraft += 2 ** -cellBits(v, s, c);
    assert.ok(Math.abs(kraft - 1) < 1e-12, `${v.id}: ${kraft}`);
  }
  // A unit more on a cell costs half a bit, whatever its colour.
  assert.ok(Math.abs(cellBits(v4, 5, 0) - cellBits(v4, 4, 4) - 0.5) < 1e-12);
  assert.equal(cellBits(v4, 3, 0), cellBits(v4, 3, 4));
});

test("the type: origin is the empty board, canonical refuses out-of-range cells, φ adds the cells", () => {
  const t = boardType;
  const o = t.origin(v4);
  assert.equal(o.sym.length, 16);
  assert.ok(o.sym.every(x => x === 0));
  assert.ok(isInvalid(t.canonical({ sym: [10, ...Array(15).fill(0)], col: Array(16).fill(0) }, v4)));
  assert.ok(isInvalid(t.canonical({ sym: Array(16).fill(0), col: [2, ...Array(15).fill(0)] }, v4))); // yellow on an rgb board
  assert.ok(!isInvalid(t.canonical(o, v4)));
  const s = { sym: [9, ...Array(15).fill(0)], col: Array(16).fill(3) };
  assert.ok(Math.abs(t.readLength(s, v4) - t.readLength(o, v4) - 4.5) < 1e-9);
});

test("the old game's seeded boards each have a variant", () => {
  const ids = BOARD_VARIANTS.map(v => v.id);
  for (const v of BOARD_VARIANTS) assert.equal(boardTypeOf(v).id, `board${(v.params as { size: number }).size}`);
  for (const id of ["board-4-base10-rgb", "board-5-base10-rgby", "board-6-base16-rainbow6", "board-7-cards-rainbow6"]) assert.ok(ids.includes(id), id);
});

test("the board's scene carries each cell's colour and letter, and a card's glyph", () => {
  const scene = boardType.representations[0]!.layout(decodeBoard("7R,3G,0B,1R/2R,9B,4G,4G/8R,0R,0R,0R/1B,1B,1B,1B"), 0) as { cellColours?: { letter: string; css: string }[]; cellGlyphs?: string[] };
  assert.deepEqual(scene.cellColours!.slice(0, 3).map(c => c.letter), ["R", "G", "B"]);
  assert.equal(scene.cellGlyphs, undefined);
});

test("Grids · original colours deals v1's eight colour families and ten of its twelve number families, Picture Frame on one symbol and Magic Accountant on one target", async () => {
  const { boardPresets } = await import("../src/index.ts");
  const p = boardPresets.find(x => x.id === "grids-original-colours")!;
  assert.deepEqual([...new Set(p.rules.map(r => r.family))].sort(), [
    "chessmaster", "colour-bonds", "colour-mirror", "honest-minesweeper", "kingdom",
    "original-crosswise-threes", "original-kings-and-subjects", "original-leapfrog", "original-magic-accountant", "original-magic-eighteen",
    "original-opposite-nines", "original-spread-three", "original-stepping-stones", "original-strangers", "original-two-pair",
    "parity-painter", "picture-frame", "set-spotter",
  ]);
  const frames = p.rules.filter(r => r.family === "picture-frame").map(r => (r.params as { symbol: string }).symbol);
  assert.deepEqual(frames, ["7", "7", "7"]);
  // A one-digit board tops Mirrormancer and Number Bonds (and Magic Accountant on 16 and 20): undealt (presets.ts).
  assert.deepEqual(p.rules.filter(r => r.family === "original-magic-accountant").map(r => r.params), [{ axis: "rows", target: 18 }, { axis: "columns", target: 18 }]);
});

test("colour-renamed twins of a rule are valued as one: colours are renamed to the board's first, in order", async () => {
  const { canonicalColours } = await import("../src/index.ts");
  assert.deepEqual(canonicalColours({ first: "blue", second: "red" }, v4), { first: "red", second: "green" });
  assert.deepEqual(canonicalColours({ colour: "green", symbol: "7" }, v4), { colour: "red", symbol: "7" });
  assert.deepEqual(canonicalColours({ target: 10 }, v4), { target: 10 });
});

test("no board family has a one- or two-letter parameter (a card would replace that word everywhere)", async () => {
  const { BOARD_FAMILIES, BOARD_VARIANTS } = await import("../src/index.ts");
  for (const f of BOARD_FAMILIES) for (const v of BOARD_VARIANTS) for (const p of f.dealable(v) as object[]) {
    for (const k of Object.keys(p)) assert.ok(k.length > 2, `${f.id}: parameter ${k}`);
  }
});
