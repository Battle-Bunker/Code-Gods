/**
 * 🐸 Leapfrog: one unit per pair two cells apart in a row, drawn as a link leaping over the cell between. A pair one
 * apart scores 1 point. On 5×5 and 6×6 a middle cell is in two pairs; the board picks, among the pairs with a cell under
 * the pointer, the one whose centre is nearest (so a cell picks the pair it starts or ends nearest).
 */
import { lens, tally, count } from "../lens.ts";
import type { Part } from "../model.ts";
import { leapPairs } from "../../families/grid/beginner/leapfrog.ts";

type P = Record<string, never>;

export const leapfrog = lens<P>({
  familyId: "leapfrog",
  components: () => ["pairs one apart, leaping over a cell"],
  breakdown: (_p, _b, parts) => ({
    unit: ["pair", "pairs"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "pair")} one apart` },
      { of: () => true, text: n => `${count(n, "pair")} not one apart` },
    ]),
  }),
  parts: (_p, b) => leapPairs(b.N).map(([x, y]): Part => {
    const apart = Math.abs(b.value(x) - b.value(y)), hit = apart === 1;
    const both = `${b.say.tile(b.sym(x))} and ${b.say.tile(b.sym(y))}`;
    return {
      id: `pair:${x.r},${x.c}`, shape: "pair", group: "pair", cells: [x, y], points: [hit ? 1 : 0],
      title: hit ? "one apart" : apart === 0 ? "the same" : `${apart} apart`,
      facts: [{ text: hit ? `${both} are one apart` : apart === 0 ? `${both} are the same, not one apart` : `${both} are ${apart} apart`, ok: hit }],
      links: [{ from: x, to: y, ok: hit }],
    };
  }),
});
