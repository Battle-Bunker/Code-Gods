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

/**
 * Every committed value function of the 4×4 colour board pays, at its family's top, no more than the top's exact
 * rarity, where the top can be counted (call 37: the original-rules baseline's values are honest). The tops:
 * Chessmaster 9 boards and 24 seams (the two checkerboards of a and b), Parity Painter 16 (each cell in its kind's
 * colour), Colour Mirror 4 mirror rows and 8 pairs (each row x y y x), Kingdom 16 (the whole board one colour), Picture
 * Frame 48 (all 12 edge cells your colour and symbol, the 4 middle cells neither).
 */
test("4×4 colour board: no committed value pays more at its family's top than the top's exact rarity", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = join(import.meta.dirname, "..", "values", "board-4-base10-rgb");
  if (!existsSync(root)) return;
  const C = 3, third = Math.log2(C);
  const p = (s: number) => 3 * 2 ** -cellBits(board4rgb, s, 0);   // a number's chance, any colour
  const tops: Record<string, (params: Record<string, unknown>) => { u: ReturnType<typeof q>[]; bits: number }> = {
    "chessmaster": () => ({ u: [q(9), q(24)], bits: 16 * third - 1 }),
    "parity-painter": () => ({ u: [q(16)], bits: 16 * third }),
    "colour-mirror": () => ({ u: [q(4), q(8)], bits: 8 * third }),
    "kingdom": () => ({ u: [q(16)], bits: 16 * third }),
    "picture-frame": params => {
      const ps = p(Number(params.symbol)), pc = 1 / C;
      return { u: [q(48)], bits: -(12 * Math.log2(pc * ps) + 4 * Math.log2((1 - pc) * (1 - ps))) };
    },
  };
  let checked = 0;
  for (const fam of readdirSync(root)) {
    const top = tops[fam];
    if (!top) continue;
    for (const file of readdirSync(join(root, fam))) {
      const vf = JSON.parse(readFileSync(join(root, fam, file), "utf8"));
      const t = top(vf.params);
      const paid = valueLookup(vf)(t.u).bits;
      assert.ok(paid <= t.bits + 0.5, `${fam} ${JSON.stringify(vf.params)}/${vf.tieBreaker}: pays ${paid.toFixed(1)} bits at the top, whose exact rarity is ${t.bits.toFixed(1)}`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});
