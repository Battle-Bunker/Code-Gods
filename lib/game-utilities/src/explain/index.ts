/**
 * Goal annotations (docs/annotations-design.md): explain a utility on a board, piece by piece, for a focus cell.
 *
 *   const goal = explainer(descriptor, inst);          // null for an unsupported object type
 *   const e = goal.explain(value);                     // the whole board: parts, the card's ordinal, verified
 *   const view = goal.focus(value, e, { r: 0, c: 0 }); // what to draw for one focus cell
 *   const ex = goal.example();                          // the goal card's example board and default focus
 *
 * Explanations are computed by the family's lens from the board and checked against the card program itself
 * (`evaluator`, the program the engine scores with): `verified` is false when the parts do not add up to the card's
 * score, and the renderer then draws no breakdown.
 */
import { seededRng, type Instantiation, type ObjectValue, type Rng } from "@workspace/game-types";
import { context, evaluator, family, paramsKey, type Draw } from "../catalog.ts";
import { points as pointsWord } from "../families/say.ts";
import { gridSpec, wire, type GridSpec } from "../families/grid/_util.ts";
import type { Ordinal } from "../types.ts";
import { boardOf, readBoard, type Board } from "./board.ts";
import { containing, type Lens } from "./lens.ts";
import { toneOf, type Cell, type Explanation, type FocusView, type GoalExample, type Part } from "./model.ts";
import { parityPainter } from "./lenses/parity-painter.ts";
import { setSpotter } from "./lenses/set-spotter.ts";
import { numberBonds } from "./lenses/number-bonds.ts";
import { chessmaster } from "./lenses/chessmaster.ts";
import { honestMinesweeper } from "./lenses/honest-minesweeper.ts";
import { magicAccountant } from "./lenses/magic-accountant.ts";
import { kingdom } from "./lenses/kingdom.ts";
import { pictureFrame } from "./lenses/picture-frame.ts";
import { mirrormancer } from "./lenses/mirrormancer.ts";

export * from "./model.ts";
export { MAX_FOCUS_PARTS, containing, orderParts, type Lens } from "./lens.ts";
export { boardOf, readBoard, type Board } from "./board.ts";

/** The families with a lens (a rich annotation). */
export const LENSES: readonly Lens[] = Object.freeze([
  parityPainter, setSpotter, numberBonds, chessmaster, honestMinesweeper, magicAccountant, kingdom, pictureFrame, mirrormancer,
]);
const byFamily = new Map(LENSES.map(l => [l.familyId, l]));
export const lensFor = (familyId: string): Lens | undefined => byFamily.get(familyId);

const asArray = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);

/** Whether the parts add up to the card's ordinal on every explained component. */
export function addsUp(parts: readonly Part[], components: number, ordinal: Ordinal): boolean {
  const ord = asArray(ordinal);
  if (components < 1 || components > ord.length) return false;
  for (let k = 0; k < components; k++) {
    let sum = 0;
    for (const p of parts) {
      if (p.points.length !== components) return false;
      sum += p.points[k];
    }
    if (sum !== ord[k]) return false;
  }
  return true;
}

export interface GoalExplainer {
  readonly familyId: string;
  /** Whether the family has a rich annotation (a lens); without one, only the example board and its score are shown. */
  readonly rich: boolean;
  explain(value: ObjectValue): Explanation | null;
  focus(value: ObjectValue, explanation: Explanation, cell: Cell): FocusView | null;
  /** The card's ordinal of a value (the card program), or null when it cannot be scored. */
  score(value: ObjectValue): Ordinal | null;
  example(): GoalExample | null;
}

/** An explainer for one draw on one Grid instantiation, or null when the object type is not Grid. */
export function explainer(draw: Draw, inst: Instantiation): GoalExplainer | null {
  if (inst.objectType !== "Grid") return null;
  const l = lensFor(draw.familyId), p = draw.params;
  let card: ((wire: ObjectValue) => Ordinal) | null | undefined;
  const score = (value: ObjectValue): Ordinal | null => {
    try {
      card ??= evaluator(draw, inst);
      return card(value);
    } catch { return null; }
  };
  const boards = new Map<string, Board | null>();
  const board = (value: ObjectValue) => {
    const key = String(value);
    if (!boards.has(key)) {
      if (boards.size > 64) boards.delete(boards.keys().next().value!);
      boards.set(key, readBoard(inst, value));
    }
    return boards.get(key)!;
  };
  let example: GoalExample | null | undefined;
  return {
    familyId: draw.familyId,
    rich: !!l,
    score,
    explain(value) {
      const b = board(value);
      if (!l || !b) return null;
      let parts: Part[], components: string[];
      try { parts = l.parts(p, b); components = l.components(p, b); } catch { return null; }
      const ordinal = score(value);
      if (ordinal === null) return null;
      return { familyId: draw.familyId, size: b.N, parts, components, ordinal, verified: addsUp(parts, components.length, ordinal) };
    },
    focus(value, explanation, cell) {
      const b = board(value);
      if (!l || !b || !b.inside(cell.r, cell.c)) return null;
      const focus = b.cells[cell.r * b.N + cell.c];
      try {
        const parts = l.select ? l.select(explanation.parts, focus, p, b) : containing(explanation.parts, focus);
        const table = l.table?.(p, b, focus) ?? undefined;
        const note = l.note?.(explanation.parts, focus, p, b) ?? undefined;
        return {
          focus, headline: `${b.where(focus)}: ${b.describe(focus)}`, parts,
          ...(table ? { table } : {}), ...(note ? { note } : {}),
        };
      } catch { return null; }
    },
    example() {
      if (example === undefined) {
        try { example = searchExample(draw, inst, l, score); } catch { example = null; }
      }
      return example;
    },
  };
}

// ------------------------------------------------------------------------------------------------
// the goal card's example board (§6.5)
// ------------------------------------------------------------------------------------------------

interface Candidate { sym: number[]; col: number[] }

const randomBoard = (rng: Rng, g: GridSpec): Candidate => {
  const n = g.N * g.N;
  return { sym: Array.from({ length: n }, () => rng.int(g.S)), col: Array.from({ length: n }, () => rng.int(g.C)) };
};
const mutate = (rng: Rng, g: GridSpec, x: Candidate, changes: number): Candidate => {
  const sym = x.sym.slice(), col = x.col.slice();
  for (let k = 0; k < changes; k++) {
    const i = rng.int(sym.length);
    if (rng.int(2)) sym[i] = rng.int(g.S); else col[i] = rng.int(g.C);
  }
  return { sym, col };
};
const toWire = (g: GridSpec, x: Candidate): string => {
  const layer = (v: number[]) => Array.from({ length: g.N }, (_, r) => v.slice(r * g.N, r * g.N + g.N));
  return String(wire(g, layer(x.sym), layer(x.col)));
};
function fromWire(g: GridSpec, inst: Instantiation, value: ObjectValue): Candidate | null {
  const b = readBoard(inst, value);
  return b ? { sym: b.cells.map(x => b.sym(x)), col: b.cells.map(x => b.col(x)) } : null;
}

/** How well a focus cell teaches: pieces of both kinds beat pieces of one kind; a few pieces beat none or many. */
function focusScore(sel: readonly Part[]): number {
  const tones = new Set(sel.map(s => toneOf(s.points)));
  return tones.size * 10 + Math.min(sel.length, 4) + (tones.has("gain") ? 5 : 0) - Math.max(0, sel.length - 4) * 4;
}

/** How well a board teaches: its best focus, scoring and non-scoring pieces both present, not too busy. */
function illumination(l: Lens, p: Draw["params"], b: Board): { score: number; focus: Cell } {
  const parts = l.parts(p, b);
  let best = -1, focus = b.cells[0];
  for (const x of b.cells) {
    const sel = l.select ? l.select(parts, x, p, b) : containing(parts, x);
    const s = focusScore(sel) + (l.table ? new Set(parts.map(t => toneOf(t.points))).size : 0);
    if (s > best) { best = s; focus = x; }
  }
  const gains = parts.filter(t => toneOf(t.points) === "gain").length, rest = parts.length - gains;
  const tones = new Set(parts.map(t => toneOf(t.points))).size;
  // The first component's points: a board that scores a fair amount in total reads better than one that barely does.
  const total = parts.reduce((s, t) => s + t.points[0], 0), won = parts.reduce((s, t) => s + Math.max(0, t.points[0]), 0);
  // A varied board (several numbers, every colour) looks like a real game, not a test pattern.
  const variety = Math.min(new Set(b.cells.map(x => b.sym(x))).size, 8) + 2 * new Set(b.cells.map(x => b.col(x))).size;
  return {
    score: best * 4 + Math.min(gains, 4) * 3 + Math.min(rest, 4) * 2 + tones * 5 + Math.min(won, 5) * 2 + variety * 2
      - (gains === 0 ? 40 : 0) - (total <= 0 ? 20 : 0),
    focus,
  };
}

function caption(ordinal: Ordinal | null, rich: boolean): string {
  const ord = ordinal === null ? null : asArray(ordinal);
  const head = ord ? `This board scores ${pointsWord(ord[0])}.` : "An example board.";
  return rich ? `${head} Point at a cell to see how it counts.` : head;
}

function searchExample(draw: Draw, inst: Instantiation, l: Lens | undefined, score: (v: ObjectValue) => Ordinal | null): GoalExample | null {
  const ctx = context(inst), g = gridSpec(ctx), f = family(draw.familyId), p = draw.params;
  const rng = seededRng(`goal-example|${inst.key}|${draw.familyId}|${paramsKey(p)}`);
  const pool: Candidate[] = [];
  let exemplar: Candidate | null = null;
  try { if (f.exemplar) exemplar = fromWire(g, inst, f.exemplar(p, ctx)); } catch { exemplar = null; }
  for (let k = 0; k < 160; k++) pool.push(randomBoard(rng, g));
  if (exemplar) for (let k = 0; k < 160; k++) pool.push(mutate(rng, g, exemplar, 2 + rng.int(g.N + 2)));
  if (l?.seeds) {
    const b0 = boardOf(g, pool[0].sym, pool[0].col);
    for (const s of l.seeds(p, b0)) { const c = fromWire(g, inst, s); if (c) pool.push(c); }
  }

  if (!l) {
    // No lens: a board that scores, but not the best possible one (the exemplar), so there is something to improve.
    const scored = pool.map(x => ({ x, o: score(toWire(g, x)) })).filter((s): s is { x: Candidate; o: Ordinal } => s.o !== null);
    if (!scored.length) return null;
    scored.sort((a, b) => compare(a.o, b.o));
    const pick = scored[Math.floor(scored.length * 0.85)];
    return { value: toWire(g, pick.x), size: g.N, focus: { r: 0, c: 0 }, caption: caption(pick.o, false) };
  }

  const rate = (x: Candidate) => illumination(l, p, boardOf(g, x.sym, x.col));
  const ranked = pool.map(x => ({ x, r: rate(x) })).sort((a, b) => b.r.score - a.r.score);
  // Hill-climb the best few: single-cell changes that do not make the board teach worse.
  const climbed = ranked.slice(0, 4).map(({ x, r }) => {
    let cur = x, curR = r;
    for (let k = 0; k < 120; k++) {
      const next = mutate(rng, g, cur, 1), nr = rate(next);
      if (nr.score >= curR.score) { cur = next; curR = nr; }
    }
    return { x: cur, r: curR };
  }).sort((a, b) => b.r.score - a.r.score);
  for (const { x, r } of [...climbed, ...ranked]) {
    const value = toWire(g, x), o = score(value);
    if (o === null) continue;
    const b = boardOf(g, x.sym, x.col), parts = l.parts(p, b), components = l.components(p, b);
    if (!addsUp(parts, components.length, o)) continue;
    return { value, size: g.N, focus: r.focus, caption: caption(o, true) };
  }
  return null;
}

function compare(a: Ordinal, b: Ordinal): number {
  const x = asArray(a), y = asArray(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
