/**
 * Per-family annotators: for one draw (a descriptor) and one value, the marks that show at a glance which parts of the
 * object make up that utility's score (the vocabulary is ../annotations.ts). Pure functions of the value and the
 * params, written beside the families they explain; each mirrors its family's TypeScript card (the tests cross-check
 * them against the card's ordinal).
 *
 * A family without an annotator still gets one in the player client: a generic sensitivity analysis that re-scores the
 * value with each cell (digit, character) changed (artifacts/player-web/src/sdk/annotate.ts). Register a bespoke one
 * here when the family's idea has a clearer picture (the patch, the stripe, the cells that touch).
 *
 * An annotator never throws: a value it cannot read gets no marks.
 */
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, decodeGrid, gridArgs, type Instantiation, type ObjectValue } from "@workspace/game-types";
import type { AnnotatedCell, Annotation } from "../annotations.ts";
import type { UtilityDescriptor } from "../types.ts";

/** A utility family's id (`UtilityFamily.id`, e.g. "kingdom"). */
export type FamilyId = string;
export type Annotator = (value: ObjectValue, descriptor: UtilityDescriptor, instance: Instantiation) => Annotation[];

// ------------------------------------------------------------------------------------------------
// a decoded grid, as the cards see it
// ------------------------------------------------------------------------------------------------

interface Board {
  readonly N: number;
  readonly col: (r: number, c: number) => number;
  readonly sym: (r: number, c: number) => number;
  /** The symbol's point value (digits: the digit; cards: A = 1 .. K = 13), the prelude's `cell.value`. */
  readonly value: (r: number, c: number) => number;
  readonly colourName: (k: number) => string;
  readonly cards: boolean;
}

function board(value: ObjectValue, inst: Instantiation): Board | null {
  if (inst.objectType !== "Grid" || typeof value !== "string") return null;
  try {
    const args = gridArgs(inst), g = decodeGrid(value, args), N = g.size;
    const values = SYMBOL_COMPONENTS[args.symbols].values, names = COLOUR_COMPONENTS[args.colours].names;
    return {
      N, cards: args.symbols === "cards",
      col: (r, c) => g.col[r * N + c], sym: (r, c) => g.sym[r * N + c], value: (r, c) => values[g.sym[r * N + c]],
      colourName: k => names[k] ?? `colour ${k}`,
    };
  } catch {
    return null;
  }
}

const each = (N: number) => Array.from({ length: N * N }, (_, i) => ({ r: Math.floor(i / N), c: i % N }));
/** The cells touching a cell's sides (the prelude's `cell.neighbours`). */
const neighbours = (N: number, r: number, c: number) =>
  [[r, c - 1], [r, c + 1], [r - 1, c], [r + 1, c]].filter(([y, x]) => y >= 0 && x >= 0 && y < N && x < N) as [number, number][];
const onEdge = (N: number, r: number, c: number) => r === 0 || c === 0 || r === N - 1 || c === N - 1;
const weighted = (list: readonly { r: number; c: number }[], weight?: number): AnnotatedCell[] =>
  list.map(({ r, c }) => (weight === undefined || weight === 1 ? { r, c } : { r, c, weight }));
/** A cells annotation, or nothing when no cell qualifies. */
const cellsOf = (list: readonly { r: number; c: number }[], tone: Annotation["tone"], label: string, weight?: number): Annotation[] =>
  list.length ? [{ kind: "cells", cells: weighted(list, weight), tone, label }] : [];
const num = (x: unknown) => Number(x);

// ------------------------------------------------------------------------------------------------
// Grid families
// ------------------------------------------------------------------------------------------------

/** Green Ones: the cells it counts (right colour and number), and the halfway cells of its tiebreak. */
const greenOnes: Annotator = (value, { params }, inst) => {
  const b = board(value, inst);
  if (!b) return [];
  const colour = num(params.colour), target = num(params.value);
  const name = b.colourName(colour), what = b.cards && target === 1 ? "aces" : `${target}s`, one = b.cards && target === 1 ? "an ace" : `a ${target}`;
  const all = each(b.N);
  const rightColour = (r: number, c: number) => b.col(r, c) === colour, rightValue = (r: number, c: number) => b.value(r, c) === target;
  return [
    ...cellsOf(all.filter(({ r, c }) => rightColour(r, c) && rightValue(r, c)), "good", `${name} ${what}`),
    ...cellsOf(all.filter(({ r, c }) => rightColour(r, c) !== rightValue(r, c)), "good", `halfway: ${name} or ${one}`, 0.4),
  ];
};

/** Homebody: your colour at home (on the edge, or off it) is +1, away from home −1. */
const homebody: Annotator = (value, { params }, inst) => {
  const b = board(value, inst);
  if (!b) return [];
  const X = num(params.X), rim = params.zone === "rim", name = b.colourName(X);
  const mine = each(b.N).filter(({ r, c }) => b.col(r, c) === X);
  const home = ({ r, c }: { r: number; c: number }) => onEdge(b.N, r, c) === rim;
  return [...cellsOf(mine.filter(home), "good", `${name} at home`), ...cellsOf(mine.filter(x => !home(x)), "bad", `${name} away from home`)];
};

/** Picture Frame: all or nothing on the edge; the wrong edge cells are what stands between you and the point. */
const pictureFrame: Annotator = (value, { params }, inst) => {
  const b = board(value, inst);
  if (!b) return [];
  const X = num(params.X), name = b.colourName(X);
  const edge = each(b.N).filter(({ r, c }) => onEdge(b.N, r, c));
  return [
    ...cellsOf(edge.filter(({ r, c }) => b.col(r, c) !== X), "bad", `not ${name}: breaks the frame`),
    ...cellsOf(edge.filter(({ r, c }) => b.col(r, c) === X), "good", `${name} frame`, 0.5),
  ];
};

/**
 * Feuding Families: safe cells of each family (not touching the other); the smaller family's count is the score, so its
 * safe cells weigh fully and the larger family's half (both fully on a tie). Cells touching the other family are bad.
 */
const feudingFamilies: Annotator = (value, { params }, inst) => {
  const b = board(value, inst);
  if (!b) return [];
  const X = num(params.X), Y = num(params.Y), nameX = b.colourName(X), nameY = b.colourName(Y);
  const safe = (r: number, c: number, enemy: number) => neighbours(b.N, r, c).every(([y, x]) => b.col(y, x) !== enemy);
  const all = each(b.N);
  const safeX = all.filter(({ r, c }) => b.col(r, c) === X && safe(r, c, Y));
  const safeY = all.filter(({ r, c }) => b.col(r, c) === Y && safe(r, c, X));
  const touching = all.filter(({ r, c }) => (b.col(r, c) === X && !safe(r, c, Y)) || (b.col(r, c) === Y && !safe(r, c, X)));
  const weightX = safeX.length <= safeY.length ? 1 : 0.5, weightY = safeY.length <= safeX.length ? 1 : 0.5;
  return [
    ...cellsOf(safeX, "good", `safe ${nameX}`, weightX),
    ...cellsOf(safeY, "good", `safe ${nameY}`, weightY),
    ...cellsOf(touching, "bad", "touching the other family"),
    { kind: "badge", tone: "neutral", text: `${safeX.length} safe ${nameX} · ${safeY.length} safe ${nameY}` },
  ];
};

/** Joined-up patches of one colour (the prelude's `grid.regions(sameColour)`), in row-major order of their first cell. */
function patches(b: Board, colour: number): { r: number; c: number }[][] {
  const seen = new Set<number>(), out: { r: number; c: number }[][] = [];
  for (const start of each(b.N)) {
    if (b.col(start.r, start.c) !== colour || seen.has(start.r * b.N + start.c)) continue;
    const patch = [start], todo = [start];
    seen.add(start.r * b.N + start.c);
    while (todo.length) {
      const { r, c } = todo.pop()!;
      for (const [y, x] of neighbours(b.N, r, c)) {
        if (b.col(y, x) !== colour || seen.has(y * b.N + x)) continue;
        seen.add(y * b.N + x);
        patch.push({ r: y, c: x });
        todo.push({ r: y, c: x });
      }
    }
    out.push(patch.sort((p, q) => p.r - q.r || p.c - q.c));
  }
  return out;
}

/** Kingdom: the biggest joined-up patch of your colour (the first one found on a tie) as one region. */
const kingdom: Annotator = (value, { params }, inst) => {
  const b = board(value, inst);
  if (!b) return [];
  const C = num(params.C), name = b.colourName(C);
  const biggest = patches(b, C).reduce<{ r: number; c: number }[] | null>((best, p) => (!best || p.length > best.length ? p : best), null);
  if (!biggest) return [{ kind: "badge", tone: "neutral", text: `no ${name} yet` }];
  return [{ kind: "region", cells: weighted(biggest), tone: "good", label: `biggest ${name} patch (${biggest.length})` }];
};

/**
 * Stripe Painter: each scoring stripe (a line all one colour, unlike the stripe before it) as a region; a solid line
 * repeating the previous stripe's colour is neutral (it scores nothing); in the other lines, the cells off the line's most
 * common colour break the stripe.
 */
const stripePainter: Annotator = (value, { params }, inst) => {
  const b = board(value, inst);
  if (!b) return [];
  const rows = params.axis !== "cols";
  const lines = Array.from({ length: b.N }, (_, i) => Array.from({ length: b.N }, (_, k) => (rows ? { r: i, c: k } : { r: k, c: i })));
  const out: Annotation[] = [], repeats: { r: number; c: number }[] = [], breaks: { r: number; c: number }[] = [];
  let previous: number | null = null;
  for (const line of lines) {
    const colours = line.map(({ r, c }) => b.col(r, c));
    const counts = colours.map(k => colours.filter(x => x === k).length);
    const best = Math.max(...counts), common = colours[counts.indexOf(best)];
    if (best === line.length) {
      if (common !== previous) out.push({ kind: "region", cells: weighted(line), tone: "good", label: "stripe" });
      else repeats.push(...line);
      previous = common;
    } else {
      breaks.push(...line.filter((_, k) => colours[k] !== common));
      previous = null;
    }
  }
  const order = (list: { r: number; c: number }[]) => list.sort((p, q) => p.r - q.r || p.c - q.c);
  return [...out, ...cellsOf(order(repeats), "neutral", "same colour as the stripe before"), ...cellsOf(order(breaks), "bad", "breaks a stripe", 0.6)];
};

// ------------------------------------------------------------------------------------------------
// Int and string families
// ------------------------------------------------------------------------------------------------

/** Digit Devotee: where your digit appears (positions from the left of the decimal digits; the sign is not a digit). */
const digitDevotee: Annotator = (value, { params }) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return [];
  const d = String(num(params.d));
  const positions = [...String(Math.abs(Math.trunc(value)))].flatMap((ch, i) => (ch === d ? [i] : []));
  return positions.length ? [{ kind: "digits", positions, tone: "good", label: `your ${d}s` }] : [];
};

/** Glyph Glutton: the runs of your character. */
const glyphGlutton: Annotator = (value, { params }) => {
  if (typeof value !== "string") return [];
  const ch = String(params.c), spans: { start: number; end: number }[] = [];
  [...value].forEach((x, i) => {
    if (x !== ch) return;
    const last = spans.at(-1);
    if (last && last.end === i) spans[spans.length - 1] = { start: last.start, end: i + 1 };
    else spans.push({ start: i, end: i + 1 });
  });
  return spans.length ? [{ kind: "spans", spans, tone: "good", label: `your "${ch}"s` }] : [];
};

// ------------------------------------------------------------------------------------------------
// the registry
// ------------------------------------------------------------------------------------------------

/** Bespoke annotators by family id. Families not listed here get the player client's generic sensitivity annotation. */
export const ANNOTATORS: Readonly<Partial<Record<FamilyId, Annotator>>> = Object.freeze({
  seed3_green_ones: greenOnes,
  homebody,
  picture_frame: pictureFrame,
  feuding_families: feudingFamilies,
  kingdom,
  stripe_painter: stripePainter,
  "digit-devotee": digitDevotee,
  "glyph-glutton": glyphGlutton,
});

/** The bespoke annotator of a family, wrapped so it never throws; undefined when the family has none. */
export function annotatorFor(familyId: FamilyId): Annotator | undefined {
  const annotate = Object.hasOwn(ANNOTATORS, familyId) ? ANNOTATORS[familyId] : undefined;
  if (!annotate) return undefined;
  return (value, descriptor, instance) => {
    try { return annotate(value, descriptor, instance); } catch { return []; }
  };
}
