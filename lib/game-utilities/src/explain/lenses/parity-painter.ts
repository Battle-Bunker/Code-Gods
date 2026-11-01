/** 🎭 Parity Painter: each cell alone. The outcome table is the whole rule: kind × colour → +1, −1 or 0. */
import { lens } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, OutcomeTable, Part } from "../model.ts";

type P = { P: number; Q: number; key: "parity" | "suit" };

/** 0 = the kind that wants colour P (even numbers, or hearts and diamonds), 1 = the other kind. */
const kindOf = (p: P, b: Board, x: Cell) =>
  p.key === "suit" ? ([1, 2].includes(Math.floor(b.sym(x) / 13)) ? 0 : 1) : (b.value(x) % 2 === 0 ? 0 : 1);
const kindWord = (p: P, kind: number) =>
  p.key === "suit" ? (kind === 0 ? "hearts and diamonds" : "spades and clubs") : (kind === 0 ? "even numbers" : "odd numbers");
const pointsFor = (p: P, kind: number, colour: number) => {
  const right = kind === 0 ? p.P : p.Q, wrong = kind === 0 ? p.Q : p.P;
  return colour === right ? 1 : colour === wrong ? -1 : 0;
};

/** A symbol of the other kind, as close to `sym` as possible, for the outcome table's samples. */
function otherKindSymbol(p: P, b: Board, sym: number): number {
  const S = b.spec.S;
  const kindOfSym = (s: number) => (p.key === "suit" ? ([1, 2].includes(Math.floor(s / 13)) ? 0 : 1) : (b.spec.value[s] % 2 === 0 ? 0 : 1));
  const mine = kindOfSym(sym);
  if (p.key === "suit") {
    // Same rank in the next suit of the other kind (suits: spades, hearts, diamonds, clubs; hearts and diamonds are kind 0).
    for (let k = 1; k < 4; k++) { const s = (sym + 13 * k) % S; if (kindOfSym(s) !== mine) return s; }
    return sym;
  }
  for (let d = 1; d < S; d++) {
    for (const s of [sym + d, sym - d]) if (s >= 0 && s < S && kindOfSym(s) !== mine) return s;
  }
  return sym;
}

export const parityPainter = lens<P>({
  familyId: "parity_painter",
  components: () => ["points"],
  parts: (p, b) => b.cells.map((x): Part => {
    const kind = kindOf(p, b, x), right = kind === 0 ? p.P : p.Q;
    const pts = pointsFor(p, kind, b.col(x));
    const g = b.glyph(x), rightName = b.spec.colourNames[right];
    const what = p.key === "suit" ? `${g} is a ${kind === 0 ? "red" : "black"} suit` : `${g} is ${kind === 0 ? "even" : "odd"}`;
    return {
      id: `cell:${x.r},${x.c}`, shape: "cell", cells: [x], points: [pts],
      title: pts > 0 ? "right colour" : pts < 0 ? "the other kind's colour" : "a colour neither kind wants",
      facts: [
        { text: what, ok: true },
        { text: `${kindWord(p, kind)} should be ${rightName}: this one is ${b.colour(x)}`, ok: pts > 0 },
      ],
    };
  }),
  table: (p, b, focus): OutcomeTable => {
    const kind = kindOf(p, b, focus), own = b.sym(focus), other = otherKindSymbol(p, b, own);
    const sampleOf = (k: number) => (k === kind ? own : other);
    const C = b.spec.C;
    return {
      title: p.key === "suit" ? "Every kind of card" : "Every kind of cell",
      rows: [0, 1].map(k => kindWord(p, k)),
      cols: b.spec.colourNames.slice(),
      entries: [0, 1].map(k => Array.from({ length: C }, (_, c) => ({ points: pointsFor(p, k, c), sample: { sym: sampleOf(k), col: c } }))),
      at: [kind, b.col(focus)],
    };
  },
});
