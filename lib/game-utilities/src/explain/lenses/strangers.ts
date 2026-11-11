/**
 * 👋 Strangers: one unit per touching pair (right and down), picked on the board by the nearest shared edge (as Number
 * Bonds). Strangers both bigger than 1 score a primary point; a 1 beside a number bigger than 1 a secondary point. A
 * failing pair names the divisor its numbers share ("6 and 3 share 3"), a 0 says what divides both ("0 beside 5: 5 divides both").
 */
import { lens, tally, count } from "../lens.ts";
import type { Cell, Fact, Part } from "../model.ts";
import type { Board } from "../board.ts";
import { gcd } from "../../families/grid/beginner/strangers.ts";

type P = Record<string, never>;

/** A pair's points and its one fact, in the card's words with the board's tiles ("A (10)" on base 12). */
function judge(b: Board, x: Cell, y: Cell): { points: [number, number]; title: string; fact: Fact } {
  const a = b.value(x), c = b.value(y), low = Math.min(a, c), high = Math.max(a, c);
  const tx = b.say.tile(b.sym(x)), ty = b.say.tile(b.sym(y));
  if (low === 0) {
    const why = high > 1 ? `${b.say.tile(high === a ? b.sym(x) : b.sym(y))} divides both` : "a 0 never scores";
    return { points: [0, 0], title: "a 0 never scores", fact: { text: `${tx} beside ${ty}: ${why}`, ok: false } };
  }
  if (low === 1) {
    if (high === 1) return { points: [0, 0], title: "1 beside 1", fact: { text: `${tx} beside ${ty}: equal numbers never score`, ok: false, tier: 1 } };
    return { points: [0, 1], title: `1 beside ${high === a ? tx : ty}`, fact: { text: `${tx} beside ${ty}: a 1 beside a bigger number`, ok: true, tier: 1 } };
  }
  const d = gcd(a, c);
  return d === 1
    ? { points: [1, 0], title: "strangers", fact: { text: `${tx} and ${ty} share nothing: strangers`, ok: true } }
    : { points: [0, 0], title: "not strangers", fact: { text: `${tx} and ${ty} share ${d}`, ok: false } };
}

export const strangers = lens<P>({
  familyId: "strangers",
  components: () => ["touching strangers", "1s touching a bigger number"],
  breakdown: (_p, _b, parts) => ({
    unit: ["touching pair", "touching pairs"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "pair")} of touching strangers, both bigger than 1` },
      { of: t => t.points[1] > 0, text: n => `${count(n, "pair")} of a 1 and a bigger number` },
      { of: () => true, text: n => `${count(n, "other touching pair")}, not scoring` },
    ]),
  }),
  parts: (_p, b) => {
    const out: Part[] = [];
    for (const x of b.cells) {
      for (const [name, y] of [["right", { r: x.r, c: x.c + 1 }], ["down", { r: x.r + 1, c: x.c }]] as const) {
        if (!b.inside(y.r, y.c)) continue;
        const { points, title, fact } = judge(b, x, y);
        out.push({ id: `pair:${x.r},${x.c}:${name}`, shape: "pair", group: "pair", cells: [x, y], points, title, facts: [fact] });
      }
    }
    return out;
  },
});
