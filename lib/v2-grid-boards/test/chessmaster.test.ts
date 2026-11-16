import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite } from "@workspace/v2-core";
import { board4Type, board4rgb, chessmaster, decodeBoard } from "../src/index.ts";

const f = chessmaster();
const score = (w: string, p = { a: "red", b: "blue" }, tb = "seams") => evaluateSite(board4Type, f, p, decodeBoard(w), board4rgb, 0, tb);

test("Chessmaster deals one rule per pair of the board's colours", () => {
  assert.deepEqual(f.dealable(board4rgb), [{ a: "red", b: "green" }, { a: "red", b: "blue" }, { a: "green", b: "blue" }]);
});

test("a full chessboard of red and blue has 9 little chessboards and 24 seams; numbers do not matter", () => {
  const e = score("0R,9B,0R,0B/3B,0R,0B,0R/0R,0B,7R,0B/0B,0R,0B,0R");
  assert.deepEqual(e.score?.map(x => x && Number(x.n)), [9, 24]);
});

test("a block needs both colours alternating: one wrong corner spoils its blocks; green does not count", () => {
  const e = score("0R,0B,0G,0G/0B,0R,0G,0G/0G,0G,0G,0G/0G,0G,0G,0G");
  assert.deepEqual(e.score?.map(x => x && Number(x.n)), [1, 4]);
  const e2 = score("0R,0B,0G,0G/0B,0B,0G,0G/0G,0G,0G,0G/0G,0G,0G,0G");
  assert.deepEqual(e2.score?.map(x => x && Number(x.n)), [0, 2]);
});
