/**
 * Shared helpers for the grid families (ported from lib/grid-lab/gridlab/{core,rules/_util,rules/cards}.py).
 *
 * Params use grid-lab's representation: colours and symbols are carrier *indices* (colour index in rainbow
 * order, symbol index = digit, or suit * 13 + rank for cards), so descriptors, canonical forms and the
 * grid-lab parity test share one encoding. Names are rendered through the instantiation only in summaries
 * and cards.
 */
import type { Constraint, ObjectValue, Rng } from "@workspace/game-types";
import type { FamilyContext, Ordinal, Params, ParamScalar, ScoreShape, UtilityFamily } from "../../types.ts";

// ------------------------------------------------------------------------------------------------
// the instantiation, as grid-lab's GridType
// ------------------------------------------------------------------------------------------------

export const COLOUR_NAMES: Readonly<Record<string, readonly string[]>> = {
  rgb: ["red", "green", "blue"],
  rgby: ["red", "yellow", "green", "blue"],
  rainbow6: ["red", "orange", "yellow", "green", "blue", "violet"],
};
/** Paint mixing (Mixable): [parent, parent, child] by colour name. */
export const MIXES: Readonly<Record<string, readonly (readonly [string, string, string])[]>> = {
  rgb: [],
  rgby: [["yellow", "blue", "green"]],
  rainbow6: [["red", "yellow", "orange"], ["yellow", "blue", "green"], ["red", "blue", "violet"]],
};
export const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"] as const;
const RANK_CODES = "A23456789TJQK";
const DIGIT_CODES = "0123456789ABCDEF";
const COLOUR_LETTER: Readonly<Record<string, string>> = {
  red: "R", orange: "O", yellow: "Y", green: "G", blue: "B", violet: "V",
};

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
}

const specs = new Map<string, GridSpec>();
export function gridSpec(ctx: FamilyContext): GridSpec {
  const { inst } = ctx;
  let s = specs.get(inst.key);
  if (s) return s;
  const N = Number(inst.args.size), symbols = String(inst.args.symbols), colours = String(inst.args.colours);
  const cards = symbols === "cards";
  const S = cards ? 52 : Number(symbols.slice(4));
  const colourNames = COLOUR_NAMES[colours];
  if (!colourNames || !(S > 0) || !(N >= 3)) throw new Error(`not a grid instantiation: ${inst.key}`);
  const idx = Array.from({ length: S }, (_, i) => i);
  const value = cards ? idx.map(i => (i % 13) + 1) : idx;
  const rank = cards ? idx.map(i => i % 13) : idx;
  s = {
    N, symbols, colours, cards, S, C: colourNames.length, colourNames, value, rank,
    ranks: cards ? 13 : S, base: cards ? null : S,
    vmin: Math.min(...value), vmax: Math.max(...value),
  };
  specs.set(inst.key, s);
  return s;
}

export const cname = (g: GridSpec, c: number) => g.colourNames[c];
export const colourIndex = (g: GridSpec, name: string) => g.colourNames.indexOf(name);
/** A symbol index with value v (cards: in the given suit). */
export const symForValue = (g: GridSpec, v: number, suit = 0) => (g.cards ? suit * 13 + (v - 1) : v);
/** 'card' or 'number': what a cell shows. */
export const thing = (g: GridSpec) => (g.cards ? "card" : "number");
/** Paint recipes as colour indices [P1, P2, M], in MIXES order (geometry._recipes). */
export const recipes = (g: GridSpec): (readonly [number, number, number])[] =>
  MIXES[g.colours].map(([a, b, m]) => [colourIndex(g, a), colourIndex(g, b), colourIndex(g, m)] as const);

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
export function wire(g: GridSpec, sym: Layer, col: Layer): ObjectValue {
  return sym.map((row, r) => row.map((s, c) => symbolCode(g, s) + COLOUR_LETTER[g.colourNames[col[r][c]]]).join(",")).join("/");
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
}
export function req(r: Requires = {}): readonly Constraint[] {
  const out: Constraint[] = (r.classes ?? []).map(has => ({ has }));
  if (r.minSize !== undefined && r.minSize > 3) out.push({ term: "size", op: ">=", value: r.minSize });
  if (r.maxSize !== undefined && r.maxSize < 7) out.push({ term: "size", op: "<=", value: r.maxSize });
  if (r.parity) out.push({ term: "size", parity: r.parity });
  if (r.minColours) out.push({ term: "colours.count", op: ">=", value: r.minColours });
  if (r.minSymbols) out.push({ term: "symbols.count", op: ">=", value: r.minSymbols });
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
// card rendering (grid-lab rules/cards.py `card`)
// ------------------------------------------------------------------------------------------------

/** Python's textwrap.wrap for plain prose. */
export function wrap(text: string, width = 96): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}
export function dedent(s: string): string {
  const lines = s.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)![0].length));
  return lines.map(l => l.slice(ind)).join("\n");
}

export type Const = readonly [name: string, value: ParamScalar | null | readonly ParamScalar[], comment?: string];

const pyLit = (v: Const[1]): string =>
  v === null ? "None" : typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "string" ? `"${v}"`
    : Array.isArray(v) ? `[${v.map(pyLit).join(", ")}]` : String(v);
const jsLit = (v: Const[1]): string =>
  v === null ? "null" : typeof v === "string" ? `"${v}"` : Array.isArray(v) ? `[${v.map(jsLit).join(", ")}]` : String(v);

export interface CardText {
  readonly emoji: string;
  readonly name: string;
  readonly about: string;
  readonly consts: readonly Const[];
}
export function pyCard(t: CardText, body: string): string {
  const out = [`# ${t.emoji} ${t.name}`, ...wrap(t.about).map(l => `# ${l}`)];
  for (const [k, v, note] of t.consts) out.push(`${k} = ${pyLit(v)}${note ? `  # ${note}` : ""}`);
  return `${out.join("\n")}\n\n${dedent(body)}\n`;
}
export function tsCard(t: CardText, body: string): string {
  const out = [`// ${t.emoji} ${t.name}`, ...wrap(t.about).map(l => `// ${l}`)];
  for (const [k, v, note] of t.consts) out.push(`const ${k} = ${jsLit(v)};${note ? `  // ${note}` : ""}`);
  return `${out.join("\n")}\n\n${dedent(body)}\n`;
}
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
  /** Penalties: "redder", "blobbier" (the ⚠️ line). */
  readonly comparative?: (p: P, g: GridSpec) => string;
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
    ...(d.comparative ? { comparative: (p: P, ctx: FamilyContext) => d.comparative!(p, gridSpec(ctx)) } : {}),
  };
}

// ------------------------------------------------------------------------------------------------
// search-based exemplars (grid-lab best_of / hill_climb / multi_climb), scored by the host evaluator
// ------------------------------------------------------------------------------------------------

type HostEval = (familyId: string, params: Params, ctx: FamilyContext) => (wire: ObjectValue) => Ordinal;
let hostEval: HostEval | null = null;
/** Installed by catalog.ts, so exemplars can score candidates with the family's own card. */
export function setHostEval(f: HostEval): void { hostEval = f; }

function cmp(a: Ordinal, b: Ordinal): number {
  const x = typeof a === "number" ? [a] : a, y = typeof b === "number" ? [b] : b;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
export interface Cand { readonly sym: Layer; readonly col: Layer }

/** The first candidate with the highest ordinal. */
export function bestOf(id: string, p: Params, ctx: FamilyContext, cands: readonly Cand[]): ObjectValue {
  if (!hostEval) throw new Error("host evaluator not installed");
  const g = gridSpec(ctx), u = hostEval(id, p, ctx);
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
export function climb(id: string, p: Params, ctx: FamilyContext, starts: readonly Cand[], restarts = 0): ObjectValue {
  if (!hostEval) throw new Error("host evaluator not installed");
  const g = gridSpec(ctx), u = hostEval(id, p, ctx), N = g.N;
  const rand = mulberry32(0x5eed);
  const all = [...starts];
  for (let i = 0; i < restarts; i++) {
    all.push({ sym: full(N, 0), col: fromFn(N, () => Math.floor(rand() * g.C)) });
  }
  let best: ObjectValue | null = null, bv: Ordinal | null = null;
  for (const s of all) {
    const sym = s.sym, col = s.col.map(r => r.slice());
    let cur = u(wire(g, sym, col));
    for (let step = 0; step < 200; step++) {
      let top: [number, number, number] | null = null, tv = cur;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const was = col[r][c];
        for (let k = 0; k < g.C; k++) {
          if (k === was) continue;
          col[r][c] = k;
          const v = u(wire(g, sym, col));
          if (cmp(v, tv) > 0) { tv = v; top = [r, c, k]; }
        }
        col[r][c] = was;
      }
      if (!top) break;
      col[top[0]][top[1]] = top[2];
      cur = tv;
    }
    if (bv === null || cmp(cur, bv) > 0) { best = wire(g, sym, col); bv = cur; }
  }
  return best!;
}
