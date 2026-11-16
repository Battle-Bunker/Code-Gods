/**
 * Value functions on the coloured boards (value-board.ts): the draws follow the board's law, and the tail of a
 * bounded family never pays more at the family's top than the exact rarity there (call 37: honest values).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, rng } from "@workspace/v2-core";
import { board4Type, board4rgb, cellBits, BOARD_FAMILIES } from "@workspace/v2-grid-boards";
import { boardValueFunction, drawBoardFromPi, valueLookup } from "../src/index.ts";

test("a board drawn from π has uniform colours and geometric numbers", () => {
  const draw = drawBoardFromPi(board4rgb, rng("law"));
  const colours = new Map<number, number>(), sym = new Array(10).fill(0);
  const N = 20000;
  for (let i = 0; i < N; i++) { const s = draw(); colours.set(s.col[0]!, (colours.get(s.col[0]!) ?? 0) + 1); sym[s.sym[0]!]++; }
  assert.deepEqual([...colours.keys()].sort(), [0, 3, 4]);
  for (const k of colours.values()) assert.ok(Math.abs(k / N - 1 / 3) < 0.015);
  for (let s = 0; s < 10; s++) {
    const p = 3 * 2 ** -cellBits(board4rgb, s, 0);   // the three colours of a symbol together
    assert.ok(Math.abs(sym[s] / N - p) < 0.01, `symbol ${s}: ${sym[s] / N} vs ${p}`);
  }
});

test("Parity Painter: the sampled value's tail stays under the exact rarity at the family's top (every cell dressed)", () => {
  const f = BOARD_FAMILIES.find(x => x.id === "parity-painter")!;
  const vf = boardValueFunction(board4Type, f as never, { even: "red", odd: "blue" }, board4rgb, { draws: 100_000 });
  const look = valueLookup(vf);
  // Each cell independently in its kind's colour with chance 1/3: the top (16) has exactly 16·log2 3 bits.
  const exactTop = 16 * Math.log2(3);
  const paid = look([q(16)]).bits;
  assert.ok(paid <= exactTop + 0.5, `the tail pays ${paid} bits at the top, the exact rarity is ${exactTop}`);
  // A common score is worth little.
  assert.ok(look([q(0)]).bits < 2);
});
