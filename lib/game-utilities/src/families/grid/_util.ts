/**
 * Shared helpers for the grid families (ported from lib/grid-lab/gridlab/{core,rules/_util,rules/cards}.py).
 *
 * Params use grid-lab's representation: colours and symbols are carrier *indices* (colour index in rainbow
 * order, symbol index = digit, or suit * 13 + rank for cards), so descriptors, canonical forms and the
 * grid-lab parity test share one encoding. Names are rendered through the instantiation only in summaries
 * and cards.
 */
import { COLOUR_COMPONENTS, type Constraint, type GridColourSet, type ObjectValue, type Rng } from "@workspace/game-types";
import type { CardExample, FamilyContext, Ordinal, Params, ScoreShape, UtilityFamily } from "../../types.ts";
import { phrasebook, type Phrasebook } from "../say.ts";
export { RuleTextError, an as article, count, list, points, type Phrasebook } from "../say.ts";
import type { AnalyticSurvival } from "../../analytic.ts";

// ------------------------------------------------------------------------------------------------
// the instantiation, as grid-lab's GridType
// ------------------------------------------------------------------------------------------------

/**
 * Colour names and paint mixes come from game-types' colour components (the tables the board view draws with), so every
 * colour set that exists, including ones added later, is described and checked the same way (docs/rules-design.md §4.2).
 */
const colourSet = (id: string) => (COLOUR_COMPONENTS as Readonly<Record<string, (typeof COLOUR_COMPONENTS)[GridColourSet]>>)[id];
export const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"] as const;
const RANK_CODES = "A23456789TJQK";
const DIGIT_CODES = "0123456789ABCDEF";

export interface GridSpec {
  readonly N: number;
  readonly symbols: string;
  readonly colours: string;
  readonly cards: boolean;
  /** Number of symbols / colours. */
  readonly S: number;
  readonly C: number;
  readonly colourNames: readonly string[];
  /** Point value per symbol index (digits: the digit; cards: A=1 .. K=13). */
  readonly value: readonly number[];
  /** Rank per symbol index (cards: suit ignored). */
  readonly rank: readonly number[];
  readonly ranks: number;
  readonly base: number | null;
  readonly vmin: number;
  readonly vmax: number;
  /** How rule text names this shape's symbols, colours and counts (../say.ts): use it for every name in a summary or card. */
  readonly say: Phrasebook;
}

const specs = new Map<string, GridSpec>();
export function gridSpec(ctx: FamilyContext): GridSpec {
  const { inst } = ctx;
  let s = specs.get(inst.key);
  if (s) return s;
  const N = Number(inst.args.size), symbols = String(inst.args.symbols), colours = String(inst.args.colours);
  const cards = symbols === "cards";
  const S = cards ? 52 : Number(symbols.slice(4));
  const colourNames = colourSet(colours)?.names;
  if (!colourNames || !(S > 0) || !(N >= 3)) throw new Error(`not a grid instantiation: ${inst.key}`);
  const idx = Array.from({ length: S }, (_, i) => i);
  const value = cards ? idx.map(i => (i % 13) + 1) : idx;
  const rank = cards ? idx.map(i => i % 13) : idx;
  s = {
    N, symbols, colours, cards, S, C: colourNames.length, colourNames, value, rank,
    ranks: cards ? 13 : S, base: cards ? null : S,
    vmin: Math.min(...value), vmax: Math.max(...value), say: phrasebook(symbols, colours),
  };
  specs.set(inst.key, s);
  return s;
}

/** The law of one cell's value under μ, indexed by value (digits: 1/S each; cards: values 1..13 at 1/13, index 0 empty). */
export function valueLaw(g: GridSpec): number[] {
  const pv: number[] = new Array(g.vmax + 1).fill(0);
  for (const v of g.value) pv[v] += 1 / g.S;
  return pv;
}
export const cname = (g: GridSpec, c: number) => g.colourNames[c];
export const colourIndex = (g: GridSpec, name: string) => g.colourNames.indexOf(name);
/** A symbol index with value v (cards: in the given suit). */
export const symForValue = (g: GridSpec, v: number, suit = 0) => (g.cards ? suit * 13 + (v - 1) : v);
/** 'card' or 'number': what a cell shows. */
export const thing = (g: GridSpec) => (g.cards ? "card" : "number");
/** Paint recipes as colour indices [P1, P2, M] with P1 < P2, in the colour set's order (geometry._recipes). */
export const recipes = (g: GridSpec): (readonly [number, number, number])[] => colourSet(g.colours)!.mixes.map(([a, b, m]) => [a, b, m] as const);

// ------------------------------------------------------------------------------------------------
// wire values (exemplars): canonical ASCII "7R,3G,0B/..." (architecture.md §6)
// ------------------------------------------------------------------------------------------------

export type Layer = number[][];
export const full = (N: number, v: number): Layer => Array.from({ length: N }, () => Array<number>(N).fill(v));
export const fromFn = (N: number, f: (r: number, c: number) => number): Layer =>
  Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => f(r, c)));
export const isRim = (N: number, r: number, c: number) => r === 0 || c === 0 || r === N - 1 || c === N - 1;

export function symbolCode(g: GridSpec, s: number): string {
  return g.cards ? RANK_CODES[s % 13] + "SHDC"[Math.floor(s / 13)] : DIGIT_CODES[s];
}
const RANK_GLYPHS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
/** What a cell with symbol index s shows (the prelude's cell.symbol): "7", "B", "10♥". */
export function glyph(g: GridSpec, s: number): string {
  return g.cards ? RANK_GLYPHS[s % 13] + "♠♥♦♣"[Math.floor(s / 13)] : DIGIT_CODES[s];
}
export function wire(g: GridSpec, sym: Layer, col: Layer): ObjectValue {
  return sym.map((row, r) => row.map((s, c) => symbolCode(g, s) + colourSet(g.colours)!.letters[col[r][c]]).join(",")).join("/");
}

// ------------------------------------------------------------------------------------------------
// constraints (grid-lab Requires as data)
// ------------------------------------------------------------------------------------------------

export interface Requires {
  readonly classes?: readonly string[];
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly parity?: "odd" | "even";
  readonly minColours?: number;
  readonly minSymbols?: number;
  /** Cards: at least this many suits / picture-card ranks. */
  readonly minSuits?: number;
  readonly minFaces?: number;
  /** An even number of colours (opposites on the colour wheel pair up). */
  readonly evenColours?: boolean;
}
export function req(r: Requires = {}): readonly Constraint[] {
  const out: Constraint[] = (r.classes ?? []).map(has => ({ has }));
  if (r.minSize !== undefined && r.minSize > 3) out.push({ term: "size", op: ">=", value: r.minSize });
  if (r.maxSize !== undefined && r.maxSize < 7) out.push({ term: "size", op: "<=", value: r.maxSize });
  if (r.parity) out.push({ term: "size", parity: r.parity });
  if (r.minColours) out.push({ term: "colours.count", op: ">=", value: r.minColours });
  if (r.minSymbols) out.push({ term: "symbols.count", op: ">=", value: r.minSymbols });
  if (r.minSuits) out.push({ term: "suits.count", op: ">=", value: r.minSuits });
  if (r.minFaces) out.push({ term: "faces.count", op: ">=", value: r.minFaces });
  if (r.evenColours) out.push({ term: "colours.count", parity: "even" });
  return out;
}

// ------------------------------------------------------------------------------------------------
// params: support, sampling, canonical forms
// ------------------------------------------------------------------------------------------------

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Ordered pairs of distinct colours (grid-lab `colours(rng, gt, 2)`). */
export const colourPairs = (g: GridSpec): [number, number][] =>
  range(g.C).flatMap(a => range(g.C).filter(b => b !== a).map(b => [a, b] as [number, number]));
/** Cartesian product of param options. */
export function product<P extends Params>(options: { readonly [K in keyof P]: readonly P[K][] }): P[] {
  let out: Record<string, unknown>[] = [{}];
  for (const [k, vs] of Object.entries(options) as [string, readonly unknown[]][]) {
    out = out.flatMap(p => vs.map(v => ({ ...p, [k]: v })));
  }
  return out as P[];
}
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[rng.int(items.length)];
/** True with probability num/den. */
export const chance = (rng: Rng, num: number, den: number) => rng.int(den) < num;
/** k distinct items, in draw order (numpy `rng.choice(n, k, replace=False)` as a distribution). */
export function choose<T>(rng: Rng, items: readonly T[], k: number): T[] {
  const pool = items.slice(), out: T[] = [];
  for (let i = 0; i < k; i++) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}
/** Rename colour-valued params by first appearance -> 0, 1, 2 ... (grid-lab `recolour`). */
export function recolour<P extends Params>(p: P, keys: readonly string[]): P {
  const q: Record<string, unknown> = { ...p };
  const m = new Map<unknown, number>();
  for (const k of keys) {
    const v = q[k];
    if (v === null || v === undefined) continue;
    if (!m.has(v)) m.set(v, m.size);
    q[k] = m.get(v);
  }
  return q as P;
}

// ------------------------------------------------------------------------------------------------
// card rendering: ../card.ts (grid-lab rules/cards.py `card`)
// ------------------------------------------------------------------------------------------------
export { dedent, pyCard, tsCard, wrap, type CardText, type Const } from "../card.ts";
/** Joins sentences, skipping empty ones (e.g. `g.say.valueKey()` on base 10). */
export const sentences = (...parts: string[]) => parts.filter(Boolean).join(" ");
export const an = (w: string) => (/^[aeiou]/.test(w) ? "an " : "a ") + w;
export const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
export const RANK_NAMES: Readonly<Record<number, string>> = { 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" };
export const valueNote = (g: GridSpec, v: number) => (g.cards ? RANK_NAMES[v] ?? "" : "");

// ------------------------------------------------------------------------------------------------
// family constructor
// ------------------------------------------------------------------------------------------------

export const SCALAR: ScoreShape = { kind: "scalar" };
export const tuple = (arity: number): ScoreShape => ({ kind: "tuple", arity });

export interface GridFamilyDef<P extends Params> {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly theme: string;
  readonly requires?: Requires;
  /** What one draw additionally needs from the shape (rules-design.md §4). */
  readonly needs?: (p: P, g: GridSpec) => Requires;
  readonly shape: ScoreShape | ((g: GridSpec) => ScoreShape);
  readonly role?: "reward" | "penalty";
  readonly tags?: readonly string[];
  /** Every param the sampler can return. */
  readonly support: (g: GridSpec) => readonly P[];
  /** Grid-lab's sampling distribution (defaults to uniform over the support). */
  readonly sample?: (rng: Rng, g: GridSpec) => P;
  readonly canonical?: (p: P, g: GridSpec) => P;
  readonly summary: (p: P, g: GridSpec) => string;
  readonly python: (p: P, g: GridSpec) => string;
  readonly typescript: (p: P, g: GridSpec) => string;
  readonly exemplar?: (p: P, g: GridSpec, ctx: FamilyContext) => ObjectValue;
  /** The best ordinal in closed form; the exemplar must reach it (test/rules.test.ts). */
  readonly top?: (p: P, g: GridSpec) => Ordinal;
  /** A tiny example board for the goal card: symbol and colour layers (k×k) and a caption. */
  readonly example?: (p: P, g: GridSpec) => { readonly sym: Layer; readonly col: Layer; readonly caption: string };
  /** Penalties: "redder", "blobbier" (the ⚠️ line). */
  readonly comparative?: (p: P, g: GridSpec) => string;
  /** The analytic survival function (src/analytic.ts), or null for params/shapes it does not cover. */
  readonly analytic?: (p: P, g: GridSpec, ctx: FamilyContext) => AnalyticSurvival | null;
}

export function gridFamily<P extends Params>(d: GridFamilyDef<P>): UtilityFamily<P> {
  const shape = d.shape;
  return {
    id: d.id, name: d.name, emoji: d.emoji, objectType: "Grid", theme: d.theme,
    requires: req(d.requires), role: d.role ?? "reward", tags: d.tags ?? [],
    shape: ctx => (typeof shape === "function" ? shape(gridSpec(ctx)) : shape),
    support: ctx => d.support(gridSpec(ctx)),
    sample: (rng, ctx) => (d.sample ? d.sample(rng, gridSpec(ctx)) : pick(rng, d.support(gridSpec(ctx)))),
    canonical: (p, ctx) => (d.canonical ? d.canonical(p, gridSpec(ctx)) : p),
    summary: (p, ctx) => d.summary(p, gridSpec(ctx)),
    card: {
      python: (p, ctx) => d.python(p, gridSpec(ctx)),
      typescript: (p, ctx) => d.typescript(p, gridSpec(ctx)),
    },
    ...(d.exemplar ? { exemplar: (p: P, ctx: FamilyContext) => d.exemplar!(p, gridSpec(ctx), ctx) } : {}),
    ...(d.needs ? { needs: (p: P, ctx: FamilyContext) => req(d.needs!(p, gridSpec(ctx))) } : {}),
    ...(d.top ? { top: (p: P, ctx: FamilyContext) => d.top!(p, gridSpec(ctx)) } : {}),
    ...(d.example ? { example: (p: P, ctx: FamilyContext): CardExample => {
      const g = gridSpec(ctx), e = d.example!(p, g);
      return { value: wire(g, e.sym, e.col), size: e.sym.length, caption: e.caption };
    } } : {}),
    ...(d.comparative ? { comparative: (p: P, ctx: FamilyContext) => d.comparative!(p, gridSpec(ctx)) } : {}),
    ...(d.analytic ? { analytic: (p: P, ctx: FamilyContext) => d.analytic!(p, gridSpec(ctx), ctx) } : {}),
  };
}

// ------------------------------------------------------------------------------------------------
// search-based exemplars (grid-lab best_of / hill_climb / multi_climb), scored by the host evaluator
// ------------------------------------------------------------------------------------------------

import { cmp, hostEval as host } from "../define.ts";
export interface Cand { readonly sym: Layer; readonly col: Layer }

/** The first candidate with the highest ordinal. */
export function bestOf(id: string, p: Params, ctx: FamilyContext, cands: readonly Cand[]): ObjectValue {
  const g = gridSpec(ctx), u = host(id, p, ctx);
  let best = wire(g, cands[0].sym, cands[0].col), bv = u(best);
  for (const c of cands.slice(1)) {
    const w = wire(g, c.sym, c.col), v = u(w);
    if (cmp(v, bv) > 0) { best = w; bv = v; }
  }
  return best;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic steepest ascent over single-cell colour edits from each start plus `restarts` seeded random
 * colourings; returns the best grid found ("best found" exemplars, as grid-lab's multi_climb).
 */
export function climb(id: string, p: Params, ctx: FamilyContext, starts: readonly Cand[], restarts = 0,
  symbols?: readonly number[]): ObjectValue {
  const g = gridSpec(ctx), u = host(id, p, ctx), N = g.N;
  const rand = mulberry32(0x5eed);
  const all = [...starts];
  for (let i = 0; i < restarts; i++) {
    all.push({ sym: full(N, 0), col: fromFn(N, () => Math.floor(rand() * g.C)) });
  }
  let best: ObjectValue | null = null, bv: Ordinal | null = null;
  for (const s of all) {
    // `symbols` given: edit symbols (from that list), else colours.
    const sym = s.sym.map(r => r.slice()), col = s.col.map(r => r.slice());
    const layer = symbols ? sym : col, choices = symbols ?? range(g.C);
    let cur = u(wire(g, sym, col));
    for (let step = 0; step < 200; step++) {
      let top: [number, number, number] | null = null, tv = cur;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const was = layer[r][c];
        for (const k of choices) {
          if (k === was) continue;
          layer[r][c] = k;
          const v = u(wire(g, sym, col));
          if (cmp(v, tv) > 0) { tv = v; top = [r, c, k]; }
        }
        layer[r][c] = was;
      }
      if (!top) break;
      layer[top[0]][top[1]] = top[2];
      cur = tv;
    }
    if (bv === null || cmp(cur, bv) > 0) { best = wire(g, sym, col); bv = cur; }
  }
  return best!;
}
