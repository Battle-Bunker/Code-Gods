/**
 * 📏 Spread of Three: one unit per 2×2 square (they overlap, (N−1)² of them). A spread (biggest minus smallest) of
 * exactly 3 scores a primary point; every step away from 3 deducts a secondary point. Like Chessmaster's blocks, the
 * board picks the square whose centre (a corner where four cells meet) is nearest the pointer.
 */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Part } from "../model.ts";

type P = Record<string, never>;
const SPREAD = 3;

/** "7", or "B (11)" where the tile's glyph is not its value. */
const named = (b: Board, x: Cell) => (b.glyph(x) === String(b.value(x)) ? b.glyph(x) : `${b.glyph(x)} (${b.value(x)})`);

export const spreadThree = lens<P>({
  familyId: "spread_three",
  components: () => [`squares with a spread of ${SPREAD}`, `how far the spreads are from ${SPREAD}`],
  breakdown: (_p, _b, parts) => ({
    unit: ["square", "squares"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "square")} with a spread of exactly ${SPREAD}` },
      { of: () => true, text: (n, pts) => `${count(n, "square")} off ${SPREAD}, ${-pts[1]} ${-pts[1] === 1 ? "step" : "steps"} away in all` },
    ]),
  }),
  parts: (_p, b) => {
    const out: Part[] = [];
    for (let r = 0; r + 1 < b.N; r++) for (let c = 0; c + 1 < b.N; c++) {
      const cells = [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
      const hi = cells.reduce((m, x) => (b.value(x) > b.value(m) ? x : m)), lo = cells.reduce((m, x) => (b.value(x) < b.value(m) ? x : m));
      const spread = b.value(hi) - b.value(lo), off = Math.abs(spread - SPREAD);
      out.push({
        id: `square:${r},${c}`, shape: "block", group: "square", cells,
        points: [off === 0 ? 1 : 0, off === 0 ? 0 : -off],
        title: `spread ${spread}`,
        facts: [
          { text: `biggest ${named(b, hi)}, smallest ${named(b, lo)}: ${b.value(hi)} − ${b.value(lo)} = ${spread}`, ok: off === 0 },
          ...(off === 0 ? [] : [{ text: `${off} too ${spread > SPREAD ? "wide" : "narrow"}: deducts ${off}`, ok: false, tier: 1 }]),
        ],
      });
    }
    return out;
  },
});
