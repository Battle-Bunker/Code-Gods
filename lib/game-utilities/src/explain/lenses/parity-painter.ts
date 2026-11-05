/** 🎭 Parity Painter: each cell alone: its kind (even or odd, or the suit's colour) wants one colour, +1 or −1 or 0. */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Part } from "../model.ts";

type P = { even_or_red: string; odd_or_black: string; split: "parity" | "suit" };
const ix = (b: Board, colour: string) => b.spec.colourNames.indexOf(colour);


/** 0 = the kind that wants colour P (even numbers, or hearts and diamonds), 1 = the other kind. */
const kindOf = (p: P, b: Board, x: Cell) =>
  p.split === "suit" ? ([1, 2].includes(Math.floor(b.sym(x) / 13)) ? 0 : 1) : (b.value(x) % 2 === 0 ? 0 : 1);
const kindWord = (p: P, kind: number) =>
  p.split === "suit" ? (kind === 0 ? "hearts and diamonds" : "spades and clubs") : (kind === 0 ? "even numbers" : "odd numbers");
const pointsFor = (p: P, b: Board, kind: number, colour: number) => {
  const right = kind === 0 ? ix(b, p.even_or_red) : ix(b, p.odd_or_black), wrong = kind === 0 ? ix(b, p.odd_or_black) : ix(b, p.even_or_red);
  return colour === right ? 1 : colour === wrong ? -1 : 0;
};

export const parityPainter = lens<P>({
  familyId: "parity_painter",
  components: () => ["points"],
  breakdown: (_p, _b, parts) => ({
    unit: ["point", "points"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "cell")} in the right colour: +1 each` },
      { of: t => t.points[0] < 0, text: n => `${count(n, "cell")} in the other kind's colour: −1 each` },
      { of: () => true, text: n => `${count(n, "cell")} in a colour neither kind wants: 0` },
    ]),
  }),
  parts: (p, b) => b.cells.map((x): Part => {
    const kind = kindOf(p, b, x), right = kind === 0 ? ix(b, p.even_or_red) : ix(b, p.odd_or_black);
    const pts = pointsFor(p, b, kind, b.col(x));
    const g = b.glyph(x), rightName = b.spec.colourNames[right];
    const what = p.split === "suit" ? `${g} is a ${kind === 0 ? "red" : "black"} suit` : `${g} is ${kind === 0 ? "even" : "odd"}`;
    return {
      id: `cell:${x.r},${x.c}`, shape: "cell", group: "cell", cells: [x], points: [pts],
      title: pts > 0 ? "right colour" : pts < 0 ? "the other kind's colour" : "a colour neither kind wants",
      facts: [
        { text: what, ok: true },
        { text: `${kindWord(p, kind)} should be ${rightName}: this one is ${b.colour(x)}`, ok: pts > 0 },
      ],
    };
  }),
});
