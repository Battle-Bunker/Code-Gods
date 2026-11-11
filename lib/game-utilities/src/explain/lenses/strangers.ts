/**
 * 👋 Strangers: one unit per touching pair inside a 2×2 box that tiles the board (right from an even column, down from
 * an even row; pairs across two boxes are not units), picked on the board by the nearest shared edge. Strangers both
 * bigger than 1 score a primary point; a 1 beside a number bigger than 1 a secondary point. A failing pair names the
 * divisor its numbers share ("6 and 3 share 3") or says they are next-door ("4 and 5 are next-door").
 */
import { lens, tally, count } from "../lens.ts";
import type { Cell, Fact, Part } from "../model.ts";
import type { Board } from "../board.ts";
import { gcd } from "../../families/grid/beginner/strangers.ts";

type P = Record<string, never>;

/** A pair's points and its one fact, in the card's words with the board's tiles ("A (10)" on base 12). */
function judge(b: Board, x: Cell, y: Cell): { points: [number, number]; title: string; fact: Fact } {
  const a = b.value(x), c = b.value(y), low = Math.min(a, c), high = Math.max(a, c);
  const tx = b.say.tile(b.sym(x)), ty = b.say.tile(b.sym(y)), tHigh = high === a ? tx : ty;
  if (low === 0) {
    if (high === 0) return { points: [0, 0], title: "not strangers", fact: { text: `${tx} and ${ty} share 2`, ok: false } };
    if (high === 1) return { points: [0, 0], title: "0 beside 1", fact: { text: `${tx} beside ${ty}: 0 is not bigger than 1`, ok: false, tier: 1 } };
    return { points: [0, 0], title: "not strangers", fact: { text: `${tx} beside ${ty}: ${tHigh} divides both`, ok: false } };
  }
  if (low === 1) {
    if (high === 1) return { points: [0, 0], title: "1 beside 1", fact: { text: `${tx} beside ${ty}: no bigger number`, ok: false, tier: 1 } };
    return { points: [0, 1], title: `1 beside ${tHigh}`, fact: { text: `${tx} beside ${ty}: a 1 beside a bigger number`, ok: true, tier: 1 } };
  }
  const d = gcd(a, c);
  if (d > 1) return { points: [0, 0], title: "not strangers", fact: { text: `${tx} and ${ty} share ${d}`, ok: false } };
  if (high - low === 1) return { points: [0, 0], title: "next-door", fact: { text: `${tx} and ${ty} are next-door`, ok: false } };
  return { points: [1, 0], title: "strangers", fact: { text: `${tx} and ${ty} are strangers`, ok: true } };
}

export const strangers = lens<P>({
  familyId: "strangers",
  components: () => ["touching strangers in a box", "1s touching a bigger number in their box"],
  breakdown: (_p, _b, parts) => ({
    unit: ["pair", "pairs"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "pair")} of strangers, both bigger than 1` },
      { of: t => t.points[1] > 0, text: n => `${count(n, "pair")} of a 1 and a bigger number` },
      { of: () => true, text: n => `${count(n, "other pair")}, not scoring` },
    ]),
  }),
  parts: (_p, b) => {
    const out: Part[] = [];
    for (const x of b.cells) {
      const inBox = [["right", { r: x.r, c: x.c + 1 }, x.c % 2 === 0], ["down", { r: x.r + 1, c: x.c }, x.r % 2 === 0]] as const;
      for (const [name, y, ok] of inBox) {
        if (!ok || !b.inside(y.r, y.c)) continue;
        const { points, title, fact } = judge(b, x, y);
        out.push({ id: `pair:${x.r},${x.c}:${name}`, shape: "pair", group: "pair", cells: [x, y], points, title, facts: [fact] });
      }
    }
    return out;
  },
});
