/**
 * 🫅 Kings and Subjects: one unit per 2×2 box that tiles the board (the 4 corner boxes on 4×4), or per overlapping 2×2
 * square in the expert variant. A box whose single biggest number (the king, marked) equals the other three added up
 * is a court: a primary point. Every box deducts how far its king is from that sum; a tie for biggest crowns no king
 * and deducts the card's NO_KING. The lens explains the base's two components (a tiered draw's ★ points are not units
 * of a box).
 */
import { lens, tally, count } from "../lens.ts";
import type { Part } from "../model.ts";
import { courtScore, courtSquares, noKingPenalty, type CourtP } from "../../families/grid/layered/royal_court.ts";

const boxWord = (p: CourtP): [string, string] => (p.squares === "all" ? ["square", "squares"] : ["box", "boxes"]);

export const kingsAndSubjects = lens<CourtP>({
  familyId: "kings_and_subjects",
  components: () => ["courts", "how far the kings are from their subjects' sums"],
  breakdown: (p, _b, parts) => {
    const [one, many] = boxWord(p);
    return {
      unit: ["court", "courts"],
      items: tally(parts, [
        { of: t => t.points[0] > 0, text: n => `${count(n, "court")}: the king equals the subjects added up` },
        { of: t => t.title === "no king", text: (n, pts) => `${count(n, one, many)} with no king: ${-pts[1]} off` },
        { of: () => true, text: (n, pts) => `${count(n, one, many)} with a king ${-pts[1]} away from the subjects' sum in all` },
      ]),
    };
  },
  parts: (p, b) => {
    const out: Part[] = [], all = p.squares === "all", noKing = noKingPenalty(b.spec), [one] = boxWord(p);
    for (const { r, c } of courtSquares(b.N, all ? "all" : "corners")) {
      const cells = [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
      const values = cells.map(x => b.value(x)), { score, king } = courtScore(values, noKing);
      const base = { id: `${one}:${r},${c}`, shape: "block" as const, group: one, cells, points: [score[0], score[1]] };
      if (king < 0) {
        const top = Math.max(...values), tied = values.filter(v => v === top).length;
        out.push({ ...base, title: "no king", facts: [
          { text: `the biggest number, ${top}, appears ${tied} times: no king`, ok: false },
          { text: `no king deducts ${noKing}`, ok: false, tier: 1 },
        ] });
        continue;
      }
      const subjects = values.filter((_, i) => i !== king), sum = subjects.reduce((a, v) => a + v, 0), away = -score[1];
      out.push({
        ...base, title: away === 0 ? "a court" : `${away} away`,
        spots: [{ cell: cells[king], label: "king", tone: away === 0 ? "gain" : "zero" }],
        facts: [
          { text: `king ${values[king]}, subjects ${subjects.join(" + ")} = ${sum}`, ok: away === 0 },
          ...(away === 0 ? [] : [{ text: `the king is ${away} away from ${sum}: deducts ${away}`, ok: false, tier: 1 }]),
        ],
      });
    }
    return out;
  },
});
