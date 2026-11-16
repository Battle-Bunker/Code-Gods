import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type RuleFamily } from "@workspace/v2-core";
import { board4Type, board4rgb, colourBonds, colourMirror, decodeBoard, honestMinesweeper, kingdom, parityPainter, pictureFrame, setSpotter, type BoardState } from "../src/index.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const score = (f: RuleFamily<BoardState, any>, w: string, p: unknown, tb: string | null = null) =>
  evaluateSite(board4Type, f, p, decodeBoard(w), board4rgb, 0, tb).score?.map(x => x && Number(x.n));

test("Parity Painter: right colour +1, the other kind's colour −1, a third colour 0", () => {
  // Row 1: 0R ✓, 1B ✓, 2B ✗, 3G 0. Every other cell is 0 in green: 0.
  assert.deepEqual(score(parityPainter(4), "0R,1B,2B,3G/0G,0G,0G,0G/0G,0G,0G,0G/0G,0G,0G,0G", { even: "red", odd: "blue" }), [1]);
  assert.equal(parityPainter(4).dealable(board4rgb).length, 6);
});

test("Colour Mirror: mirror rows count, matching pairs break ties", () => {
  // Row 1 RGGR mirror (2 pairs); row 2 RGBR one pair; rows 3, 4 all blue: mirrors.
  assert.deepEqual(score(colourMirror(4), "0R,0G,0G,0R/0R,0G,0B,0R/0B,0B,0B,0B/0B,0B,0B,0B", { axis: "rows" }, "colour-pairs"), [3, 7]);
});

test("Picture Frame: edge 1 or 4, middle −1 or −4", () => {
  // r0c0 red 7: edge both +4; r0c1 red 0: edge one +1; r1c1 green 7: middle one −1; r1c2 red 7: middle both −4.
  assert.deepEqual(score(pictureFrame(4), "7R,0R,0G,0G/0G,7G,7R,0G/0G,0G,0G,0G/0G,0G,0G,0G", { colour: "red", symbol: "7" }), [0]);
  assert.equal(pictureFrame(4).dealable(board4rgb).length, 30);
});

test("Colour Bonds: touching same-colour pairs adding up to 10", () => {
  // 3R+7R across ✓; 7R+3G across ✗ (colours); 3R above 7R ✓.
  assert.deepEqual(score(colourBonds(4), "3R,7R,3G,0B/7R,0B,0B,0B/0B,0B,0B,0B/0B,0B,0B,0B", {}), [2]);
});

test("Honest Minesweeper: a cell scores its number when it equals the mines around it (corners count)", () => {
  // Blue mines at r0c0 and r1c1. r0c1 = 2 touches both ✓ (2); r1c0 = 2 ✓ (2); r0c2 = 1 touches r1c1 ✓ (1); r2c2 = 2 touches one ✗.
  assert.deepEqual(score(honestMinesweeper(4), "0B,2R,1R,0R/2R,0B,0R,0R/0R,0R,2R,0R/0R,0R,0R,0R", { mine: "blue" }), [5]);
});

test("Kingdom: the biggest patch of your colour, joined side to side", () => {
  assert.deepEqual(score(kingdom(4), "0R,0R,0B,0R/0B,0R,0B,0R/0B,0B,0B,0R/0R,0B,0B,0R", { colour: "red" }), [4]);
});

test("Set Spotter: three in a line, colours all same or all different, numbers evenly spaced", () => {
  // Row 1: 2R,5G,8B → SET (all different, step 3); 5G,8B,0R no. Column 1: 2R,2R,2R → SET. Row 4: 0G,0R,0B → SET (all different, all the same number).
  assert.deepEqual(score(setSpotter(4), "2R,5G,8B,0R/2R,9B,9B,9G/2R,0G,4G,0R/0G,0R,0B,6G", {}), [3]);
});
