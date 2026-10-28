/**
 * Grid mutators: the 26 mutators of lib/grid-lab/gridlab/mutators.py (its docstring says 25; `flatten`
 * came later), ported with identical fields, regions, apply, D and analytic terms. Rationale and cost
 * tables: lib/grid-lab/docs/mutators.md. Every mutator is a bijection (erases 0) or an idempotent
 * overwrite; none is random at apply time.
 *
 * The one deliberate difference: erasure is POINTWISE, log2 |f⁻¹(f(x))| given the call
 * (energy.py `pointwise_erasure`), whose expectation over the spawn prior is mutators.py's Shannon E.
 * Constant overwrites erase the same bits on every input; recolour, stamp, tally, blend, sort_line,
 * majority_line and flatten erase what they actually merge. Motion is energy.py's pointwise motion,
 * (log2 C · Ē_col · d_col + log2 S · Ē_sym · d_sym) / N², expressed through `expectedChange`
 * (Ē_L · log2 alphabet, keys "colour" / "symbol") and the type's changedBits / layerBits.
 *
 * Guest constructors (Python / JS) take kid inputs: colours by name ("red") or letter, symbols as
 * shown ("7", "B", "K♥") or by value for digits, cells (grid.cell(2, 3), a loop variable) and areas:
 * row(i), column(i), diagonal(), other_diagonal(), square(top, left, size), ring(depth), edge(),
 * middle(), everything(), busiest_line(), or a list of cells such as grid.rows[2]. The shared
 * support reads the base prelude's tables and is emitted with swap_cells (first, always available).
 *
 * Wire params are mutators.py's params with tuples as arrays, e.g.
 *   ["paint", {"kind": "line", "region": [0, 2], "colour": 0}]       paint row 2 red
 *   ["swap_cells", {"layer": "both", "near": "next door", "pair": [[0, 0], [0, 1]]}]
 * Regions whose only choice is () in mutators.py (line*, core, all; mirror_fold's line when kind = all)
 * omit the field. Indices follow core.py (cards: suit · 13 + rank; colours in rainbow order).
 */
import type { HelperDoc, Instantiation, MutatorDef, MutatorKind, MutatorScope, Rng } from "../types.ts";
import { fail, lg, mdoc, mod } from "../mutators.ts";
import type { GridTypeArgs, GridValue } from "./codec.ts";
import { COLOUR_COMPONENTS, RANK_GLYPHS, SUIT_GLYPHS, SYMBOL_COMPONENTS, type SymbolComponent } from "./components.ts";

type Choice = number | string | readonly unknown[];
type GP = Record<string, any>;

// ------------------------------------------------------------------------------------------------
// instantiation tables (core.py GridType)
// ------------------------------------------------------------------------------------------------

export interface GridCtx {
  readonly key: string;
  readonly N: number;
  readonly S: number;
  readonly C: number;
  /** Number of ranks (13 for cards). */
  readonly R: number;
  readonly cards: boolean;
  readonly suited: boolean;
  readonly colourNames: readonly string[];
  /** Mixable recipes (a, b, child) as colour indices, a < b (core.py MIXES order). */
  readonly recipes: readonly (readonly [number, number, number])[];
  readonly symbols: SymbolComponent;
}

const ctxCache = new Map<string, GridCtx>();
export function gridCtx(inst: Instantiation): GridCtx {
  let g = ctxCache.get(inst.key);
  if (!g) {
    const { size, symbols, colours } = inst.args as unknown as GridTypeArgs;
    const sc = SYMBOL_COMPONENTS[symbols], cc = COLOUR_COMPONENTS[colours];
    if (!sc || !cc || !Number.isInteger(size)) throw new Error(`not a Grid instantiation: ${inst.key}`);
    g = Object.freeze({
      key: inst.key, N: size, S: sc.count, C: cc.count, R: sc.rankCount, cards: !!sc.suits,
      suited: inst.classes.includes("Suited"), colourNames: cc.names, recipes: cc.mixes, symbols: sc,
    });
    ctxCache.set(inst.key, g);
  }
  return g;
}

const memo = new Map<string, unknown>();
function cached<T>(key: string, f: () => T): T {
  if (!memo.has(key)) memo.set(key, f());
  return memo.get(key) as T;
}

const rankOf = (g: GridCtx, s: number): number => g.symbols.ranks[s];
const valueOf = (g: GridCtx, s: number): number => g.symbols.values[s];
const stepSym = (g: GridCtx, s: number, k: number): number =>
  g.cards ? Math.floor(s / 13) * 13 + mod((s % 13) + k, 13) : mod(s + k, g.S);

const copy = (v: GridValue): { size: number; sym: Uint8Array; col: Uint8Array } =>
  ({ size: v.size, sym: v.sym.slice(), col: v.col.slice() });

// ------------------------------------------------------------------------------------------------
// parameter fields (prefix code)
// ------------------------------------------------------------------------------------------------

interface Field { readonly name: string; choices(g: GridCtx, p: GP): readonly Choice[] | null }

const choiceIndex = new WeakMap<readonly Choice[], Map<string, number>>();
function indexOfChoice(ch: readonly Choice[], v: unknown): number {
  let ix = choiceIndex.get(ch);
  if (!ix) {
    ix = new Map(ch.map((c, i) => [JSON.stringify(c), i]));
    choiceIndex.set(ch, ix);
  }
  let k: string | undefined;
  try { k = JSON.stringify(v); } catch { return -1; }
  return k === undefined ? -1 : ix.get(k) ?? -1;
}

function parseFields(fields: readonly Field[], raw: Readonly<Record<string, unknown>>, g: GridCtx): GP {
  const p: GP = {};
  for (const f of fields) {
    const ch = f.choices(g, p);
    if (ch === null) continue;
    if (!(f.name in raw)) fail(`missing parameter "${f.name}"`);
    const i = indexOfChoice(ch, raw[f.name]);
    if (i < 0) fail(`"${f.name}" cannot be ${JSON.stringify(raw[f.name]) ?? String(raw[f.name])} here`);
    p[f.name] = ch[i];
  }
  for (const k of Object.keys(raw)) if (!(k in p)) fail(`unknown parameter "${k}"`);
  return p;
}

function describeFields(fields: readonly Field[], p: GP, g: GridCtx): number {
  let d = 0;
  const q: GP = {};
  for (const f of fields) {
    const ch = f.choices(g, q);
    if (ch === null) continue;
    d += lg(ch.length);
    q[f.name] = p[f.name];
  }
  return d;
}

function sampleFields(fields: readonly Field[], rng: Rng, g: GridCtx): GP {
  const p: GP = {};
  for (const f of fields) {
    const ch = f.choices(g, p);
    if (ch !== null) p[f.name] = ch[rng.int(ch.length)];
  }
  return p;
}

const range = (n: number, from = 0): number[] => Array.from({ length: Math.max(0, n - from) }, (_, i) => i + from);
const combos = (n: number): number[][] => range(n).flatMap(a => range(n, a + 1).map(b => [a, b]));
const ordered = (n: number): number[][] => range(n).flatMap(a => range(n).filter(b => b !== a).map(b => [a, b]));

// ------------------------------------------------------------------------------------------------
// regions
// ------------------------------------------------------------------------------------------------

export const REGION_SCOPE: Readonly<Record<string, MutatorScope>> = {
  cell: "local", line: "line", "line*": "line", diag: "line", block: "block", ring: "region", core: "region", all: "global",
};
const blockSizes = (N: number) => [2, 3].filter(k => k < N);

/** mutators.py region_choices; null where mutators.py's only choice is () (the field is omitted). */
function regionChoices(kind: string, N: number): readonly Choice[] | null {
  return cached(`rc:${kind}:${N}`, () => {
    if (kind === "cell") return range(N).flatMap(r => range(N).map(c => [r, c]));
    if (kind === "line") return [0, 1].flatMap(a => range(N).map(i => [a, i]));
    if (kind === "diag") return [0, 1];
    if (kind === "block") return blockSizes(N).flatMap(k => range(N - k + 1).flatMap(r => range(N - k + 1).map(c => [r, c, k])));
    if (kind === "ring") return range(Math.floor((N + 1) / 2));
    return null;
  });
}

const kindsOk = (kinds: readonly string[], g: GridCtx) => kinds.filter(k => !(k === "core" && g.N < 4));

function ringDepth(N: number): Int8Array {
  return cached(`depth:${N}`, () => Int8Array.from(range(N * N), i => {
    const r = Math.floor(i / N), c = i % N;
    return Math.min(r, c, N - 1 - r, N - 1 - c);
  }));
}

/** Cells of a region in row-major order, except line regions, which run along the line. */
function regionCells(kind: string, val: any, N: number): readonly number[] {
  return cached(`rm:${kind}:${JSON.stringify(val ?? null)}:${N}`, () => {
    switch (kind) {
      case "cell": return [val[0] * N + val[1]];
      case "line": return range(N).map(t => (val[0] === 0 ? val[1] * N + t : t * N + val[1]));
      case "diag": return range(N).map(t => t * N + (val === 0 ? t : N - 1 - t));
      case "block": { const [r, c, k] = val; return range(k).flatMap(i => range(k).map(j => (r + i) * N + c + j)); }
      case "ring": return range(N * N).filter(i => ringDepth(N)[i] === val);
      case "core": return range(N * N).filter(i => ringDepth(N)[i] >= 1);
      case "all": return range(N * N);
      default: throw new Error(kind);
    }
  });
}

function regionMask(kind: string, val: any, N: number): Uint8Array {
  return cached(`mask:${kind}:${JSON.stringify(val ?? null)}:${N}`, () => {
    const m = new Uint8Array(N * N);
    for (const i of regionCells(kind, val, N)) m[i] = 1;
    return m;
  });
}

const regionSize = (kind: string, val: any, N: number): number => (kind === "line*" ? N : regionCells(kind, val, N).length);
const lineOf = (idx: number, N: number): [number, number] => (idx < N ? [0, idx] : [1, idx - N]);

/** Per-line count of hits: rows 0..N-1 then columns N..2N-1. */
function lineScores(hit: (i: number) => boolean, N: number): number[] {
  const s = new Array(2 * N).fill(0);
  for (let i = 0; i < N * N; i++) if (hit(i)) { s[Math.floor(i / N)]++; s[N + (i % N)]++; }
  return s;
}
const argmax = (xs: readonly number[]): number => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);

type Feature = (v: GridValue) => number[];
/** The cells a region names on `v` (line* picks the line that maximises `feature`, lowest index on ties). */
function resolveCells(p: GP, g: GridCtx, v: GridValue, feature?: Feature): readonly number[] {
  if (p.kind === "line*") return regionCells("line", lineOf(argmax(feature!(v)), g.N), g.N);
  return regionCells(p.kind, p.region, g.N);
}

function regionText(p: GP, g: GridCtx, star = "the line where it is most common"): string {
  const v = p.region;
  switch (p.kind) {
    case "cell": return `the cell at row ${v[0] + 1}, column ${v[1] + 1}`;
    case "line": return `${v[0] === 0 ? "row" : "column"} ${v[1] + 1}`;
    case "line*": return star;
    case "diag": return v === 0 ? "the main diagonal" : "the other diagonal";
    case "block": return `the ${v[2]}x${v[2]} square at row ${v[0] + 1}, column ${v[1] + 1}`;
    case "ring": return regionSize("ring", v, g.N) === 1 ? "the centre cell" : v === 0 ? "the outer edge" : `ring ${v + 1} in from the edge`;
    case "core": return "everything off the edge";
    default: return "the whole grid";
  }
}

const F_kind = (...kinds: string[]): Field => ({ name: "kind", choices: g => kindsOk(kinds, g) });
const F_REGION: Field = { name: "region", choices: (g, p) => regionChoices(p.kind, g.N) };
const F_LINE: Field = { name: "line", choices: g => regionChoices("line", g.N) };
const F_LAYER: Field = { name: "layer", choices: () => ["both", "colour", "symbol"] };
const F_colour = (name = "colour"): Field => ({ name, choices: g => cached(`col:${g.C}`, () => range(g.C)) });
const F_pairOrdered = (name = "pair"): Field => ({ name, choices: g => cached(`ord:${g.C}`, () => ordered(g.C)) });
const F_pair = (name = "pair"): Field => ({ name, choices: g => cached(`comb:${g.C}`, () => combos(g.C)) });
const linep = (p: GP): GP => ({ kind: "line", region: p.line });

// ------------------------------------------------------------------------------------------------
// the mutator record
// ------------------------------------------------------------------------------------------------

interface Terms { erase?: number; dcol?: number; dsym?: number; measure?: number; scope: MutatorScope }

interface GridMutatorSpec {
  id: string; name: string; emoji: string; summary: string;
  requires: readonly string[];
  kind: MutatorKind;
  scope: MutatorScope;
  fields: readonly Field[];
  terms(p: GP, g: GridCtx): Terms;
  apply(v: GridValue, p: GP, g: GridCtx): GridValue | null;
  /** Pointwise erasure for data-dependent overwrites; default: 0 (bijection) or terms().erase (constant). */
  pointwise?(v: GridValue, p: GP, g: GridCtx): number;
  text(p: GP, g: GridCtx): string;
  guest: { python: string; js: string; dts: string; docs: readonly HelperDoc[] };
}

/** A grid mutator: the MutatorDef contract plus the mutators.py analytic terms (tests, parity, docs). */
export interface GridMutator extends MutatorDef<GridValue, GP> {
  /** mutators.py `terms_fn`: analytic (expected) erasure, expected changed cells per layer, M, scope. */
  terms(params: GP, inst: Instantiation): Required<Terms>;
  /** Kid-readable one-liner, as mutators.py `describe`. */
  describe(params: GP, inst: Instantiation): string;
}

function def(s: GridMutatorSpec): GridMutator {
  const full = (p: GP, g: GridCtx): Required<Terms> => ({ erase: 0, dcol: 0, dsym: 0, measure: 0, ...s.terms(p, g) });
  return Object.freeze({
    id: s.id, name: s.name, emoji: s.emoji, summary: s.summary,
    requires: s.requires.map(has => ({ has })), scope: s.scope, kind: s.kind,
    parse: (raw: Readonly<Record<string, unknown>>, inst: Instantiation) => parseFields(s.fields, raw, gridCtx(inst)),
    describeBits: (p: GP, inst: Instantiation) => describeFields(s.fields, p, gridCtx(inst)),
    apply: (v: GridValue, p: GP, inst: Instantiation) => s.apply(v, p, gridCtx(inst)),
    erasureBits: (v: GridValue, p: GP, inst: Instantiation) => {
      if (s.kind === "bijective") return 0;
      const g = gridCtx(inst);
      return s.pointwise ? s.pointwise(v, p, g) : full(p, g).erase;
    },
    scopeOf: (p: GP, inst: Instantiation) => full(p, gridCtx(inst)).scope,
    measureBits: (p: GP, inst: Instantiation) => full(p, gridCtx(inst)).measure,
    expectedChange: (p: GP, inst: Instantiation) => {
      const g = gridCtx(inst), t = full(p, g);
      return { colour: t.dcol * Math.log2(g.C), symbol: t.dsym * Math.log2(g.S) };
    },
    sample: (rng: Rng, inst: Instantiation) => sampleFields(s.fields, rng, gridCtx(inst)),
    terms: (p: GP, inst: Instantiation) => full(p, gridCtx(inst)),
    describe: (p: GP, inst: Instantiation) => s.text(p, gridCtx(inst)),
    guest: s.guest,
  });
}

const LAYERS: Record<string, readonly ("sym" | "col")[]> = { both: ["sym", "col"], colour: ["col"], symbol: ["sym"] };
const layerBits = (g: GridCtx, layer: string) =>
  ({ both: Math.log2(g.C) + Math.log2(g.S), colour: Math.log2(g.C), symbol: Math.log2(g.S) } as Record<string, number>)[layer];
/** Expected (colour, symbol) cells changed when n cells receive another cell's content. */
function moved(g: GridCtx, layer: string, n: number): { dcol: number; dsym: number } {
  return {
    dcol: layer === "both" || layer === "colour" ? n * (1 - 1 / g.C) : 0,
    dsym: layer === "both" || layer === "symbol" ? n * (1 - 1 / g.S) : 0,
  };
}
const OF_LAYER: Record<string, string> = { both: "", colour: "the colours of ", symbol: "the symbols of " };
const cn = (g: GridCtx, k: number) => g.colourNames[k];
const symText = (g: GridCtx, s: number) => g.symbols.glyphs[s];
const rankText = (g: GridCtx, r: number) => (g.cards ? RANK_GLYPHS[r] : g.symbols.glyphs[r]);
const lineCells = (line: readonly number[], N: number) => regionCells("line", line, N);

// guest helpers -----------------------------------------------------------------------------------

type Doc = [python: string, typescript: string, kid: string, cls?: string];
interface G { py: string; js: string; dts: string; doc: Doc[] }
const guest = ({ py, js, dts, doc }: G): GridMutatorSpec["guest"] =>
  ({ python: py, js, dts, docs: doc.map(([p, t, k, c]) => mdoc(p, t, k, c)) });

/** Shared guest support (tables from the base prelude, input conversion, region builders). */
export const GRID_GUEST_SUPPORT: G = {
  py: `
_M_TURNS = {"anticlockwise": "rot90", "half": "rot180", "clockwise": "rot270", "flip_left_right": "flipH",
            "flip_up_down": "flipV", "transpose": "transpose", "antitranspose": "antitranspose", "rot90": "rot90",
            "rot180": "rot180", "rot270": "rot270", "fliph": "flipH", "flipv": "flipV"}
_M_FOLDS = {"left": "left->right", "right": "right->left", "top": "top->bottom", "bottom": "bottom->top",
            "below_diagonal": "below->above diagonal", "above_diagonal": "above->below diagonal",
            "below_other_diagonal": "below->above other diagonal", "above_other_diagonal": "above->below other diagonal"}
_M_FOLDS.update({v: v for v in list(_M_FOLDS.values())})
_M_LAYERS = {"both": "both", "colour": "colour", "colours": "colour", "color": "colour", "symbol": "symbol", "symbols": "symbol"}
_M_SUITS = {"spades": 0, "spade": 0, "s": 0, "\u2660": 0, "hearts": 1, "heart": 1, "h": 1, "\u2665": 1,
            "diamonds": 2, "diamond": 2, "d": 2, "\u2666": 2, "clubs": 3, "club": 3, "c": 3, "\u2663": 3}


def _M_TABLES():
    cards = len(_SYMBOLS) == 52
    colours = {n.lower(): i for i, n in enumerate(_COLOURS)}
    colours.update({k.lower(): i for k, i in _LETTERS.items()})
    syms, ranks = {}, {}
    for code, s in _CODES.items():
        r = s % 13 if cards else s
        for k in (code, _SYMBOLS[s]):
            syms[k.lower()] = s
            ranks[k.lower()] = r
        if cards:
            ranks[code[:-1].lower()] = r
            ranks[_SYMBOLS[s][:-1].lower()] = r
        else:
            syms[str(_VALUES[s])] = s
        ranks[str(_VALUES[s])] = r
    return colours, syms, ranks, (13 if cards else len(_SYMBOLS))


_M_COLOUR_KEYS, _M_SYMS, _M_RANKS, _M_R = _M_TABLES()


def _M_CALL(_m, **params):
    params["__m"] = _m
    return params


def _M_FAIL(msg):
    raise ValueError(msg)


def _M_INT(x, what):
    if isinstance(x, bool) or not isinstance(x, int):
        _M_FAIL(what + " must be a whole number, not " + repr(x))
    return x


def _M_LOOKUP(table, x, what):
    k = str(x).strip().lower()
    if k in table:
        return table[k]
    _M_FAIL("unknown " + what + " " + repr(x))


def _M_COLOUR(x):
    k = str(x).strip().lower()
    if k in _M_COLOUR_KEYS:
        return _M_COLOUR_KEYS[k]
    _M_FAIL("unknown colour " + repr(x) + ": use one of " + ", ".join(_COLOURS))


def _M_SYMBOL(x):
    return _M_LOOKUP(_M_SYMS, x, "symbol")


def _M_RANK(x):
    return _M_LOOKUP(_M_RANKS, x, "number")


def _M_LAYER(x):
    return _M_LOOKUP(_M_LAYERS, x, "part (use 'both', 'colour' or 'symbol')")


def _M_POS(x):
    if hasattr(x, "row") and hasattr(x, "col"):
        x = (x.row, x.col)
    if not isinstance(x, (list, tuple)) or len(x) != 2:
        _M_FAIL("expected a cell, not " + repr(x))
    return [_M_INT(x[0], "row"), _M_INT(x[1], "column")]


def _M_WHERE(x):
    if isinstance(x, dict) and "kind" in x:
        return dict(x)
    if hasattr(x, "row") or (isinstance(x, (list, tuple)) and len(x) == 2 and all(isinstance(v, int) for v in x)):
        return {"kind": "cell", "region": _M_POS(x)}
    if not isinstance(x, (list, tuple)):
        _M_FAIL("expected an area such as row(2), a cell or a list of cells, not " + repr(x))
    ps = sorted(set(tuple(_M_POS(c)) for c in x))
    n, N = len(ps), _SIZE
    rs = sorted(set(p[0] for p in ps))
    cs = sorted(set(p[1] for p in ps))
    if n == 1:
        return {"kind": "cell", "region": list(ps[0])}
    if n == N and len(rs) == 1:
        return {"kind": "line", "region": [0, rs[0]]}
    if n == N and len(cs) == 1:
        return {"kind": "line", "region": [1, cs[0]]}
    if ps == [(i, i) for i in range(N)]:
        return {"kind": "diag", "region": 0}
    if ps == sorted((i, N - 1 - i) for i in range(N)):
        return {"kind": "diag", "region": 1}
    if n == N * N:
        return {"kind": "all"}
    k = len(rs)
    if n == k * k and len(cs) == k and rs == list(range(rs[0], rs[0] + k)) and cs == list(range(cs[0], cs[0] + k)):
        return {"kind": "block", "region": [rs[0], cs[0], k]}
    _M_FAIL("those cells are not a row, a column, a diagonal, a square or the whole grid")


def _M_LINE(x):
    w = _M_WHERE(x)
    if w["kind"] != "line":
        _M_FAIL("this needs a whole row or column, like row(2) or grid.columns[1]")
    return w["region"]


def row(i):
    return {"kind": "line", "region": [0, _M_INT(i, "row")]}


def column(i):
    return {"kind": "line", "region": [1, _M_INT(i, "column")]}


def diagonal():
    return {"kind": "diag", "region": 0}


def other_diagonal():
    return {"kind": "diag", "region": 1}


def square(top, left, size=2):
    return {"kind": "block", "region": [_M_INT(top, "row"), _M_INT(left, "column"), _M_INT(size, "size")]}


def ring(depth=0):
    return {"kind": "ring", "region": _M_INT(depth, "depth")}


def edge():
    return ring(0)


def middle():
    return {"kind": "core"}


def everything():
    return {"kind": "all"}


def busiest_line():
    return {"kind": "line*"}

`,
  js: `
const __M_TURNS = { anticlockwise: "rot90", half: "rot180", clockwise: "rot270", flip_left_right: "flipH",
  flip_up_down: "flipV", transpose: "transpose", antitranspose: "antitranspose", rot90: "rot90", rot180: "rot180",
  rot270: "rot270", fliph: "flipH", flipv: "flipV" };
const __M_FOLDS = { left: "left->right", right: "right->left", top: "top->bottom", bottom: "bottom->top",
  below_diagonal: "below->above diagonal", above_diagonal: "above->below diagonal",
  below_other_diagonal: "below->above other diagonal", above_other_diagonal: "above->below other diagonal" };
for (const v of Object.values(__M_FOLDS)) __M_FOLDS[v] = v;
const __M_LAYERS = { both: "both", colour: "colour", colours: "colour", color: "colour", symbol: "symbol", symbols: "symbol" };
const __M_SUITS = { spades: 0, spade: 0, s: 0, "\u2660": 0, hearts: 1, heart: 1, h: 1, "\u2665": 1,
  diamonds: 2, diamond: 2, d: 2, "\u2666": 2, clubs: 3, club: 3, c: 3, "\u2663": 3 };
const [__M_COLOUR_KEYS, __M_SYMS, __M_RANKS, __M_R] = (() => {
  const cards = __SYMBOLS.length === 52, colours = {}, syms = {}, ranks = {};
  __COLOURS.forEach((n, i) => { colours[n.toLowerCase()] = i; });
  for (const [k, i] of __LETTERS) colours[k.toLowerCase()] = i;
  for (const [code, s] of __CODES) {
    const r = cards ? s % 13 : s;
    for (const k of [code, __SYMBOLS[s]]) { syms[k.toLowerCase()] = s; ranks[k.toLowerCase()] = r; }
    if (cards) { ranks[code.slice(0, -1).toLowerCase()] = r; ranks[__SYMBOLS[s].slice(0, -1).toLowerCase()] = r; }
    else syms[String(__VALUES[s])] = s;
    ranks[String(__VALUES[s])] = r;
  }
  return [colours, syms, ranks, cards ? 13 : __SYMBOLS.length];
})();

function __M_FAIL(msg) { throw new Error(msg); }
function __M_INT(x, what) {
  if (!Number.isInteger(x)) __M_FAIL(what + " must be a whole number, not " + JSON.stringify(x));
  return x;
}
function __M_LOOKUP(table, x, what) {
  const k = String(x).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(table, k)) return table[k];
  return __M_FAIL("unknown " + what + " " + JSON.stringify(x));
}
function __M_COLOUR(x) {
  const k = String(x).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(__M_COLOUR_KEYS, k)) return __M_COLOUR_KEYS[k];
  return __M_FAIL("unknown colour " + JSON.stringify(x) + ": use one of " + __COLOURS.join(", "));
}
function __M_SYMBOL(x) { return __M_LOOKUP(__M_SYMS, x, "symbol"); }
function __M_RANK(x) { return __M_LOOKUP(__M_RANKS, x, "number"); }
function __M_LAYER(x) { return __M_LOOKUP(__M_LAYERS, x, "part (use 'both', 'colour' or 'symbol')"); }
function __M_POS(x) {
  if (x !== null && typeof x === "object" && "row" in x && "col" in x) x = [x.row, x.col];
  if (!Array.isArray(x) || x.length !== 2) __M_FAIL("expected a cell, not " + JSON.stringify(x));
  return [__M_INT(x[0], "row"), __M_INT(x[1], "column")];
}
function __M_WHERE(x) {
  if (x !== null && typeof x === "object" && !Array.isArray(x) && "kind" in x) return { ...x };
  if ((x !== null && typeof x === "object" && "row" in x) || (Array.isArray(x) && x.length === 2 && x.every(Number.isInteger))) {
    return { kind: "cell", region: __M_POS(x) };
  }
  if (!Array.isArray(x)) __M_FAIL("expected an area such as row(2), a cell or a list of cells, not " + JSON.stringify(x));
  const N = __SIZE, seen = new Set(x.map((c) => __M_POS(c).join(",")));
  const ps = [...seen].map((s) => s.split(",").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const n = ps.length, rs = [...new Set(ps.map((p) => p[0]))], cs = [...new Set(ps.map((p) => p[1]))].sort((a, b) => a - b);
  const line = (f) => n === N && ps.every(f);
  if (n === 1) return { kind: "cell", region: ps[0] };
  if (n === N && rs.length === 1) return { kind: "line", region: [0, rs[0]] };
  if (n === N && cs.length === 1) return { kind: "line", region: [1, cs[0]] };
  if (line((p, i) => p[0] === i && p[1] === i)) return { kind: "diag", region: 0 };
  if (line((p, i) => p[0] === i && p[1] === N - 1 - i)) return { kind: "diag", region: 1 };
  if (n === N * N) return { kind: "all" };
  const k = rs.length;
  if (n === k * k && cs.length === k && rs[k - 1] - rs[0] === k - 1 && cs[k - 1] - cs[0] === k - 1) {
    return { kind: "block", region: [rs[0], cs[0], k] };
  }
  return __M_FAIL("those cells are not a row, a column, a diagonal, a square or the whole grid");
}
function __M_LINE(x) {
  const w = __M_WHERE(x);
  if (w.kind !== "line") __M_FAIL("this needs a whole row or column, like row(2) or grid.columns[1]");
  return w.region;
}
function row(i) { return { kind: "line", region: [0, __M_INT(i, "row")] }; }
function column(i) { return { kind: "line", region: [1, __M_INT(i, "column")] }; }
function diagonal() { return { kind: "diag", region: 0 }; }
function otherDiagonal() { return { kind: "diag", region: 1 }; }
function square(top, left, size = 2) {
  return { kind: "block", region: [__M_INT(top, "row"), __M_INT(left, "column"), __M_INT(size, "size")] };
}
function ring(depth = 0) { return { kind: "ring", region: __M_INT(depth, "depth") }; }
function edge() { return ring(0); }
function middle() { return { kind: "core" }; }
function everything() { return { kind: "all" }; }
function busiestLine() { return { kind: "line*" }; }

`,
  dts: `
/** An area made by row(2), column(0), diagonal(), square(1, 1), ring(0), edge(), middle(), everything() or busiestLine(). */
interface AreaRef { readonly kind: string; readonly region?: unknown }
type CellRef = Cell | readonly [number, number];
/** Where a move acts: an area, a cell, or a list of cells such as grid.rows[2] or grid.diagonals[0]. */
type Area = AreaRef | CellRef | readonly CellRef[];
/** A whole row or column: row(2), column(1), grid.rows[2], grid.columns[1] (or busiestLine() for majority). */
type LineRef = AreaRef | readonly CellRef[];
type Layer = "both" | "colour" | "symbol";
type Turn = "anticlockwise" | "clockwise" | "half" | "flip_left_right" | "flip_up_down" | "transpose" | "antitranspose";
declare function row(i: number): AreaRef;
declare function column(i: number): AreaRef;
declare function diagonal(): AreaRef;
declare function otherDiagonal(): AreaRef;
declare function square(top: number, left: number, size?: 2 | 3): AreaRef;
declare function ring(depth?: number): AreaRef;
declare function edge(): AreaRef;
declare function middle(): AreaRef;
declare function everything(): AreaRef;
declare function busiestLine(): AreaRef;
`,
  doc: [
    ["row(i)", "row(i)", "Row i (0 = top), for any move that takes an area or a line. grid.rows[i] works too."],
    ["column(i)", "column(i)", "Column i (0 = left). grid.columns[i] works too."],
    ["diagonal()", "diagonal()", "The main diagonal, top-left to bottom-right."],
    ["other_diagonal()", "otherDiagonal()", "The other diagonal, top-right to bottom-left."],
    ["square(top, left, size=2)", "square(top, left, size = 2)", "A 2x2 or 3x3 square whose top-left cell is at (top, left)."],
    ["ring(depth=0)", "ring(depth = 0)", "A ring of cells: 0 = the outer edge, 1 = the ring inside it, ..."],
    ["edge()", "edge()", "The outer edge of the grid (ring 0)."],
    ["middle()", "middle()", "Everything off the edge (grids of size 4 and up)."],
    ["everything()", "everything()", "The whole grid."],
    ["busiest_line()", "busiestLine()", "The row or column that already has the most of what you use (paint, recolour, write, majority)."],
  ],
};
const withSupport = (g: G): G => ({
  py: GRID_GUEST_SUPPORT.py + g.py, js: GRID_GUEST_SUPPORT.js + g.js, dts: GRID_GUEST_SUPPORT.dts + g.dts,
  doc: [...GRID_GUEST_SUPPORT.doc, ...g.doc],
});

// ================================================================================================
// 1. positional bijections
// ================================================================================================

function pairs(N: number, near: string): readonly Choice[] {
  return cached(`pairs:${N}:${near}`, () => {
    const adj = [...range(N).flatMap(r => range(N - 1).map(c => [[r, c], [r, c + 1]])),
      ...range(N - 1).flatMap(r => range(N).map(c => [[r, c], [r + 1, c]]))];
    if (near === "next door") return adj;
    const s = new Set(adj.map(x => JSON.stringify(x)));
    return combos(N * N).map(([a, b]) => [[Math.floor(a / N), a % N], [Math.floor(b / N), b % N]])
      .filter(x => !s.has(JSON.stringify(x)));
  });
}

const swap_cells = def({
  id: "swap_cells", name: "Swap", emoji: "🔀", summary: "Swap two cells (or just their colours, or just their symbols).",
  requires: [], kind: "bijective", scope: "local",
  fields: [F_LAYER, { name: "near", choices: () => ["next door", "anywhere"] }, { name: "pair", choices: (g, p) => pairs(g.N, p.near) }],
  terms: (p, g) => ({ ...moved(g, p.layer, 2), scope: "local" }),
  apply: (v, p, g) => {
    const out = copy(v), [[r1, c1], [r2, c2]] = p.pair, a = r1 * g.N + c1, b = r2 * g.N + c2;
    for (const L of LAYERS[p.layer]) [out[L][a], out[L][b]] = [out[L][b], out[L][a]];
    return out;
  },
  text: (p, g) => `swap ${OF_LAYER[p.layer] || "the "}cells at (${p.pair[0][0] + 1},${p.pair[0][1] + 1}) and (${p.pair[1][0] + 1},${p.pair[1][1] + 1})`,
  guest: guest(withSupport({
    py: `def swap_cells(a, b, what="both"):
    p, q = sorted([_M_POS(a), _M_POS(b)])
    near = "next door" if abs(p[0] - q[0]) + abs(p[1] - q[1]) == 1 else "anywhere"
    return _M_CALL("swap_cells", layer=_M_LAYER(what), near=near, pair=[p, q])
`,
    js: `function swapCells(a, b, what = "both") {
  let p = __M_POS(a), q = __M_POS(b);
  if (q[0] < p[0] || (q[0] === p[0] && q[1] < p[1])) [p, q] = [q, p];
  const near = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) === 1 ? "next door" : "anywhere";
  return { __m: "swap_cells", layer: __M_LAYER(what), near, pair: [p, q] };
}
`,
    dts: `declare function swapCells(a: CellRef, b: CellRef, what?: Layer): MutatorCall;\n`,
    doc: [["swap_cells(a, b, what=\"both\")", "swapCells(a, b, what = \"both\")",
      "Swap two cells. what=\"colour\" or \"symbol\" swaps only that part."]],
  })),
});

const shift_line = def({
  id: "shift_line", name: "Slide", emoji: "➡️", summary: "Slide a row or column along, wrapping round the end like a conveyor belt.",
  requires: [], kind: "bijective", scope: "line",
  fields: [F_LAYER, F_LINE, { name: "k", choices: g => cached(`k:${g.N}`, () => range(g.N, 1)) }],
  terms: (p, g) => ({ ...moved(g, p.layer, g.N), scope: "line" }),
  apply: (v, p, g) => {
    const out = copy(v), cells = lineCells(p.line, g.N);
    for (const L of LAYERS[p.layer]) cells.forEach((c, t) => { out[L][c] = v[L][cells[mod(t - p.k, g.N)]]; });
    return out;
  },
  text: (p, g) => `slide ${OF_LAYER[p.layer]}${regionText(linep(p), g)} ${p.k} step${p.k > 1 ? "s" : ""} ${p.line[0] === 0 ? "right" : "down"}, wrapping round`,
  guest: guest({
    py: `def slide(line, steps=1, what="both"):
    k = _M_INT(steps, "steps") % _SIZE
    if k == 0:
        _M_FAIL("sliding a whole lap round does nothing")
    return _M_CALL("shift_line", layer=_M_LAYER(what), line=_M_LINE(line), k=k)
`,
    js: `function slide(line, steps = 1, what = "both") {
  const k = ((__M_INT(steps, "steps") % __SIZE) + __SIZE) % __SIZE;
  if (k === 0) __M_FAIL("sliding a whole lap round does nothing");
  return { __m: "shift_line", layer: __M_LAYER(what), line: __M_LINE(line), k };
}
`,
    dts: `declare function slide(line: LineRef, steps?: number, what?: Layer): MutatorCall;\n`,
    doc: [["slide(line, steps=1, what=\"both\")", "slide(line, steps = 1, what = \"both\")",
      "Slide a row right (or a column down) by some steps; cells falling off the end come back at the start."]],
  }),
});

const reverse_line = def({
  id: "reverse_line", name: "Reverse", emoji: "↔️", summary: "Read a row or column backwards: flip its order end to end.",
  requires: [], kind: "bijective", scope: "line",
  fields: [F_LAYER, F_LINE],
  terms: (p, g) => ({ ...moved(g, p.layer, g.N - (g.N % 2)), scope: "line" }),
  apply: (v, p, g) => {
    const out = copy(v), cells = lineCells(p.line, g.N);
    for (const L of LAYERS[p.layer]) cells.forEach((c, t) => { out[L][c] = v[L][cells[g.N - 1 - t]]; });
    return out;
  },
  text: (p, g) => `reverse ${OF_LAYER[p.layer]}${regionText(linep(p), g)}`,
  guest: guest({
    py: `def reverse(line, what="both"):
    return _M_CALL("reverse_line", layer=_M_LAYER(what), line=_M_LINE(line))
`,
    js: `function reverse(line, what = "both") {
  return { __m: "reverse_line", layer: __M_LAYER(what), line: __M_LINE(line) };
}
`,
    dts: `declare function reverse(line: LineRef, what?: Layer): MutatorCall;\n`,
    doc: [["reverse(line, what=\"both\")", "reverse(line, what = \"both\")", "Flip a row or column end to end."]],
  }),
});

const swap_lines = def({
  id: "swap_lines", name: "Swap rows", emoji: "🔃", summary: "Swap two whole rows (or two whole columns).",
  requires: [], kind: "bijective", scope: "line",
  fields: [{ name: "axis", choices: () => [0, 1] }, { name: "pair", choices: g => cached(`comb:${g.N}`, () => combos(g.N)) }],
  terms: (_p, g) => ({ ...moved(g, "both", 2 * g.N), scope: "line" }),
  apply: (v, p, g) => {
    const out = copy(v), [i, j] = p.pair, a = lineCells([p.axis, i], g.N), b = lineCells([p.axis, j], g.N);
    for (const L of ["sym", "col"] as const) a.forEach((c, t) => { out[L][c] = v[L][b[t]]; out[L][b[t]] = v[L][c]; });
    return out;
  },
  text: p => `swap ${p.axis === 0 ? "rows" : "columns"} ${p.pair[0] + 1} and ${p.pair[1] + 1}`,
  guest: guest({
    py: `def swap_rows(a, b):
    return _M_CALL("swap_lines", axis=0, pair=sorted([_M_INT(a, "row"), _M_INT(b, "row")]))

def swap_columns(a, b):
    return _M_CALL("swap_lines", axis=1, pair=sorted([_M_INT(a, "column"), _M_INT(b, "column")]))
`,
    js: `function swapRows(a, b) {
  return { __m: "swap_lines", axis: 0, pair: [__M_INT(a, "row"), __M_INT(b, "row")].sort((x, y) => x - y) };
}
function swapColumns(a, b) {
  return { __m: "swap_lines", axis: 1, pair: [__M_INT(a, "column"), __M_INT(b, "column")].sort((x, y) => x - y) };
}
`,
    dts: `declare function swapRows(a: number, b: number): MutatorCall;\ndeclare function swapColumns(a: number, b: number): MutatorCall;\n`,
    doc: [["swap_rows(a, b)", "swapRows(a, b)", "Swap two whole rows (0 = top)."],
      ["swap_columns(a, b)", "swapColumns(a, b)", "Swap two whole columns (0 = left)."]],
  }),
});

const D4_MOVES = ["rot90", "rot180", "rot270", "flipH", "flipV", "transpose", "antitranspose"] as const;
const D4_TEXT: Record<string, string> = {
  rot90: "a quarter turn anticlockwise", rot180: "a half turn", rot270: "a quarter turn clockwise",
  flipH: "a left-right flip", flipV: "an upside-down flip", transpose: "a flip across the main diagonal",
  antitranspose: "a flip across the other diagonal",
};
/** numpy D4 on a k×k array: out[i][j] = a[src(i, j)]. */
const D4_SRC: Record<string, (i: number, j: number, k: number) => [number, number]> = {
  rot90: (i, j, k) => [j, k - 1 - i], rot180: (i, j, k) => [k - 1 - i, k - 1 - j], rot270: (i, j, k) => [k - 1 - j, i],
  flipH: (i, j, k) => [i, k - 1 - j], flipV: (i, j, k) => [k - 1 - i, j], transpose: (i, j) => [j, i],
  antitranspose: (i, j, k) => [k - 1 - j, k - 1 - i],
};
const movedCells = (move: string, k: number) =>
  cached(`d4:${move}:${k}`, () => range(k * k).filter(x => { const [a, b] = D4_SRC[move](Math.floor(x / k), x % k, k); return a * k + b !== x; }).length);

function turn(v: GridValue, N: number, r: number, c: number, k: number, move: string): GridValue {
  const out = copy(v);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const [si, sj] = D4_SRC[move](i, j, k), dst = (r + i) * N + c + j, src = (r + si) * N + c + sj;
    out.sym[dst] = v.sym[src];
    out.col[dst] = v.col[src];
  }
  return out;
}
const TURN_DOC = "how: \"anticlockwise\", \"clockwise\", \"half\", \"flip_left_right\", \"flip_up_down\", \"transpose\" or \"antitranspose\"";

const turn_block = def({
  id: "turn_block", name: "Spin a square", emoji: "🔄", summary: "Turn or flip a small square of cells, like a tile on a puzzle board.",
  requires: [], kind: "bijective", scope: "block",
  fields: [{ name: "kind", choices: () => ["block"] }, F_REGION, { name: "move", choices: () => D4_MOVES }],
  terms: (p, g) => ({ ...moved(g, "both", movedCells(p.move, p.region[2])), scope: "block" }),
  apply: (v, p, g) => turn(v, g.N, p.region[0], p.region[1], p.region[2], p.move),
  text: (p, g) => `give ${regionText(p, g)} ${D4_TEXT[p.move]}`,
  guest: guest({
    py: `def turn_square(where, how):
    return _M_CALL("turn_block", **_M_WHERE(where), move=_M_LOOKUP(_M_TURNS, how, "turn"))
`,
    js: `function turnSquare(where, how) {
  return { __m: "turn_block", ...__M_WHERE(where), move: __M_LOOKUP(__M_TURNS, how, "turn") };
}
`,
    dts: `declare function turnSquare(where: Area, how: Turn): MutatorCall;\n`,
    doc: [["turn_square(where, how)", "turnSquare(where, how)", `Turn or flip a 2x2 or 3x3 square, e.g. turn_square(square(0, 0), "clockwise"); ${TURN_DOC}.`]],
  }),
});

const turn_grid = def({
  id: "turn_grid", name: "Spin the grid", emoji: "🌀", summary: "Turn or flip the whole grid.",
  requires: [], kind: "bijective", scope: "global",
  fields: [{ name: "move", choices: () => D4_MOVES }],
  terms: (p, g) => ({ ...moved(g, "both", movedCells(p.move, g.N)), scope: "global" }),
  apply: (v, p, g) => turn(v, g.N, 0, 0, g.N, p.move),
  text: p => `give the whole grid ${D4_TEXT[p.move]}`,
  guest: guest({
    py: `def turn_grid(how):
    return _M_CALL("turn_grid", move=_M_LOOKUP(_M_TURNS, how, "turn"))
`,
    js: `function turnGrid(how) {
  return { __m: "turn_grid", move: __M_LOOKUP(__M_TURNS, how, "turn") };
}
`,
    dts: `declare function turnGrid(how: Turn): MutatorCall;\n`,
    doc: [["turn_grid(how)", "turnGrid(how)", `Turn or flip the whole grid; ${TURN_DOC}.`]],
  }),
});

// ================================================================================================
// 2. positional overwrites
// ================================================================================================

/** Deterministic PRNG for the fixed-seed Monte Carlo statistics. */
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
const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
const lgfact = (n: number) => cached(`lgf:${n}`, () => range(n + 1, 2).reduce((s, k) => s + Math.log2(k), 0));

/** log2 N!/∏ m! of a line's multiset of (symbol, colour) items: the pointwise erasure of sorting it. */
function sortErasure(g: GridCtx, items: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  let e = lgfact(items.length);
  for (const m of counts.values()) e -= lgfact(m);
  return e;
}

const sortKey = (g: GridCtx, s: number, c: number) => (rankOf(g, s) * g.S + s) * g.C + c;
function sortOrder(g: GridCtx, keys: readonly number[], dir: number): number[] {
  const order = range(keys.length).sort((a, b) => keys[a] - keys[b] || a - b);
  return dir < 0 ? order.reverse() : order;
}

/** Fixed-seed Monte Carlo (mutators.py `_sort_stats`, own RNG): expected erasure and changed cells. */
function sortStats(g: GridCtx): { erase: number; changed: number } {
  return cached(`sort:${g.key}`, () => {
    const rnd = mulberry32(hash(g.key)), B = 4096;
    let er = 0, ch = 0;
    for (let b = 0; b < B; b++) {
      const s = range(g.N).map(() => Math.floor(rnd() * g.S)), c = range(g.N).map(() => Math.floor(rnd() * g.C));
      const keys = s.map((x, t) => sortKey(g, x, c[t])), sorted = [...keys].sort((x, y) => x - y);
      ch += sorted.filter((k, t) => k !== keys[t]).length;
      er += sortErasure(g, keys);
    }
    return { erase: er / B, changed: ch / B };
  });
}

const sort_line = def({
  id: "sort_line", name: "Sort", emoji: "📶", summary: "Sort a row or column into counting order (cells keep their colours).",
  requires: ["Ranked"], kind: "overwrite", scope: "line",
  fields: [F_LINE, { name: "dir", choices: () => [1, -1] }],
  terms: (_p, g) => { const st = sortStats(g); return { erase: st.erase, ...moved(g, "both", st.changed), scope: "line" }; },
  apply: (v, p, g) => {
    const out = copy(v), cells = lineCells(p.line, g.N);
    const order = sortOrder(g, cells.map(c => sortKey(g, v.sym[c], v.col[c])), p.dir);
    cells.forEach((c, t) => { out.sym[c] = v.sym[cells[order[t]]]; out.col[c] = v.col[cells[order[t]]]; });
    return out;
  },
  pointwise: (v, p, g) => sortErasure(g, lineCells(p.line, g.N).map(c => v.sym[c] * g.C + v.col[c])),
  text: (p, g) => `sort ${regionText(linep(p), g)} ${p.dir > 0 ? "smallest" : "biggest"} first`,
  guest: guest({
    py: `def sort_line(line, biggest_first=False):
    return _M_CALL("sort_line", line=_M_LINE(line), dir=-1 if biggest_first else 1)
`,
    js: `function sortLine(line, biggestFirst = false) {
  return { __m: "sort_line", line: __M_LINE(line), dir: biggestFirst ? -1 : 1 };
}
`,
    dts: `declare function sortLine(line: LineRef, biggestFirst?: boolean): MutatorCall;\n`,
    doc: [["sort_line(line, biggest_first=False)", "sortLine(line, biggestFirst = false)",
      "Sort a row or column into counting order, smallest first (cells keep their colours).", "Ranked"]],
  }),
});

export const FOLDS = ["left->right", "right->left", "top->bottom", "bottom->top",
  "below->above diagonal", "above->below diagonal", "below->above other diagonal", "above->below other diagonal"] as const;

/** (dest, src) flat indices of a fold (mutators.py `_fold_map`). */
function foldMap(N: number, kind: string, line: any, side: any): [number[], number[]] {
  return cached(`fold:${N}:${kind}:${JSON.stringify(line ?? null)}:${side}`, () => {
    const mid = (N - 1) / 2;
    if (kind === "line") {
      const ts = range(N).filter(t => (side === 0 ? t > mid : t < mid));
      const at = (t: number) => (line[0] === 0 ? line[1] * N + t : t * N + line[1]);
      return [ts.map(at), ts.map(t => at(N - 1 - t))];
    }
    const f = FOLDS.indexOf(side), dest: number[] = [], src: number[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      let ok: boolean, sr: number, sc: number;
      if (f <= 1) { ok = f === 0 ? c > mid : c < mid; sr = r; sc = N - 1 - c; }
      else if (f <= 3) { ok = f === 2 ? r > mid : r < mid; sr = N - 1 - r; sc = c; }
      else if (f <= 5) { ok = f === 4 ? c > r : c < r; sr = c; sc = r; }
      else { ok = f === 7 ? r + c > N - 1 : r + c < N - 1; sr = N - 1 - c; sc = N - 1 - r; }
      if (ok) { dest.push(r * N + c); src.push(sr * N + sc); }
    }
    return [dest, src];
  });
}

const mirror_fold = def({
  id: "mirror_fold", name: "Mirror", emoji: "🪞", summary: "Copy one half onto the other half as a mirror image (of one row, or the whole grid).",
  requires: [], kind: "overwrite", scope: "line",
  fields: [F_LAYER, { name: "kind", choices: () => ["line", "all"] },
    { name: "line", choices: (g, p) => (p.kind === "line" ? regionChoices("line", g.N) : null) },
    { name: "side", choices: (_g, p) => (p.kind === "line" ? [0, 1] : FOLDS) }],
  terms: (p, g) => {
    const n = foldMap(g.N, p.kind, p.line, p.side)[0].length;
    return { erase: n * layerBits(g, p.layer), ...moved(g, p.layer, n), scope: p.kind === "line" ? "line" : "global" };
  },
  apply: (v, p, g) => {
    const out = copy(v), [dest, src] = foldMap(g.N, p.kind, p.line, p.side);
    for (const L of LAYERS[p.layer]) dest.forEach((d, i) => { out[L][d] = v[L][src[i]]; });
    return out;
  },
  text: (p, g) => {
    const w = { both: "cells", colour: "colours", symbol: "symbols" }[p.layer as string];
    if (p.kind === "line") return `make ${regionText(linep(p), g)} a palindrome: mirror its ${p.side === 0 ? "first half onto the second" : "second half onto the first"} (${w})`;
    return `mirror the whole grid ${p.side} (${w})`;
  },
  guest: guest({
    py: `def mirror_line(line, keep="first", what="both"):
    side = {"first": 0, "second": 1}.get(keep)
    if side is None:
        _M_FAIL("keep must be \\"first\\" or \\"second\\"")
    return _M_CALL("mirror_fold", layer=_M_LAYER(what), kind="line", line=_M_LINE(line), side=side)

def mirror_grid(keep, what="both"):
    return _M_CALL("mirror_fold", layer=_M_LAYER(what), kind="all", side=_M_LOOKUP(_M_FOLDS, keep, "half"))
`,
    js: `function mirrorLine(line, keep = "first", what = "both") {
  const side = { first: 0, second: 1 }[keep];
  if (side === undefined) __M_FAIL('keep must be "first" or "second"');
  return { __m: "mirror_fold", layer: __M_LAYER(what), kind: "line", line: __M_LINE(line), side };
}
function mirrorGrid(keep, what = "both") {
  return { __m: "mirror_fold", layer: __M_LAYER(what), kind: "all", side: __M_LOOKUP(__M_FOLDS, keep, "half") };
}
`,
    dts: `declare function mirrorLine(line: LineRef, keep?: "first" | "second", what?: Layer): MutatorCall;
declare function mirrorGrid(keep: string, what?: Layer): MutatorCall;
`,
    doc: [["mirror_line(line, keep=\"first\", what=\"both\")", "mirrorLine(line, keep = \"first\", what = \"both\")",
      "Make a row or column a palindrome by copying its first (or second) half onto the other half."],
    ["mirror_grid(keep, what=\"both\")", "mirrorGrid(keep, what = \"both\")",
      "Copy one half of the grid onto the other as a mirror image; keep: \"left\", \"right\", \"top\", \"bottom\", \"below_diagonal\", \"above_diagonal\", \"below_other_diagonal\" or \"above_other_diagonal\"."]],
  }),
});

// ================================================================================================
// 3. colour layer
// ================================================================================================

const PAINT_KINDS = ["cell", "line", "line*", "diag", "block", "ring", "core", "all"];
const colourHits = (k: number): Feature => v => lineScores(i => v.col[i] === k, v.size);
const symbolHits = (s: number): Feature => v => lineScores(i => v.sym[i] === s, v.size);
const starMeasure = (p: GP, g: GridCtx) => (p.kind === "line*" ? lg(2 * g.N) : 0);

const paint = def({
  id: "paint", name: "Paint", emoji: "🖌️", summary: "Paint a cell, a line, a square, a ring or the whole grid in one colour.",
  requires: [], kind: "overwrite", scope: "local",
  fields: [F_kind(...PAINT_KINDS), F_REGION, F_colour()],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: n * Math.log2(g.C), dcol: n * (1 - 1 / g.C), measure: starMeasure(p, g), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v, colourHits(p.colour))) out.col[i] = p.colour;
    return out;
  },
  text: (p, g) => `paint ${regionText(p, g, `the row or column with the most ${cn(g, p.colour)}`)} ${cn(g, p.colour)}`,
  guest: guest({
    py: `def paint(where, colour):
    return _M_CALL("paint", **_M_WHERE(where), colour=_M_COLOUR(colour))
`,
    js: `function paint(where, colour) {
  return { __m: "paint", ...__M_WHERE(where), colour: __M_COLOUR(colour) };
}
`,
    dts: `declare function paint(where: Area, colour: string): MutatorCall;\n`,
    doc: [["paint(where, colour)", "paint(where, colour)",
      "Paint a cell, row, column, diagonal, square, ring, the middle or everything in one colour: paint(row(2), \"red\")."]],
  }),
});

const recolour = def({
  id: "recolour", name: "Recolour", emoji: "🎨", summary: "Turn every cell of one colour into another colour, inside an area.",
  requires: [], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "line*", "block", "ring", "core", "all"), F_REGION, F_pairOrdered()],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: (n * 2) / g.C, dcol: n / g.C, measure: starMeasure(p, g), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v), [a, b] = p.pair;
    for (const i of resolveCells(p, g, v, colourHits(b))) if (v.col[i] === a) out.col[i] = b;
    return out;
  },
  // one bit per output-b cell of the area (it was a or b)
  pointwise: (v, p, g) => {
    const [a, b] = p.pair;
    return resolveCells(p, g, v, colourHits(b)).filter(i => v.col[i] === a || v.col[i] === b).length;
  },
  text: (p, g) => `turn every ${cn(g, p.pair[0])} cell in ${regionText(p, g, `the row or column with the most ${cn(g, p.pair[1])}`)} ${cn(g, p.pair[1])}`,
  guest: guest({
    py: `def recolour(where, old, new):
    return _M_CALL("recolour", **_M_WHERE(where), pair=[_M_COLOUR(old), _M_COLOUR(new)])
`,
    js: `function recolour(where, oldColour, newColour) {
  return { __m: "recolour", ...__M_WHERE(where), pair: [__M_COLOUR(oldColour), __M_COLOUR(newColour)] };
}
`,
    dts: `declare function recolour(where: Area, oldColour: string, newColour: string): MutatorCall;\n`,
    doc: [["recolour(where, old, new)", "recolour(where, oldColour, newColour)",
      "Turn every cell of one colour into another inside an area (a row or column, a square, a ring, the middle or everything)."]],
  }),
});

const swap_colours = def({
  id: "swap_colours", name: "Trade colours", emoji: "🔁", summary: "Two colours trade places inside an area: every A becomes B and every B becomes A.",
  requires: [], kind: "bijective", scope: "line",
  fields: [F_kind("line", "block", "ring", "all"), F_REGION, F_pair()],
  terms: (p, g) => ({ dcol: (2 * regionSize(p.kind, p.region, g.N)) / g.C, scope: REGION_SCOPE[p.kind] }),
  apply: (v, p, g) => {
    const out = copy(v), [a, b] = p.pair;
    for (const i of resolveCells(p, g, v)) out.col[i] = v.col[i] === a ? b : v.col[i] === b ? a : v.col[i];
    return out;
  },
  text: (p, g) => `swap ${cn(g, p.pair[0])} and ${cn(g, p.pair[1])} in ${regionText(p, g)}`,
  guest: guest({
    py: `def swap_colours(where, a, b):
    return _M_CALL("swap_colours", **_M_WHERE(where), pair=sorted([_M_COLOUR(a), _M_COLOUR(b)]))
`,
    js: `function swapColours(where, a, b) {
  return { __m: "swap_colours", ...__M_WHERE(where), pair: [__M_COLOUR(a), __M_COLOUR(b)].sort((x, y) => x - y) };
}
`,
    dts: `declare function swapColours(where: Area, a: string, b: string): MutatorCall;\n`,
    doc: [["swap_colours(where, a, b)", "swapColours(where, a, b)", "Two colours trade places inside a row or column, a square, a ring or everything."]],
  }),
});

const hue_turn = def({
  id: "hue_turn", name: "Rainbow step", emoji: "🌈", summary: "Move colours along the rainbow by some steps (wrapping round), inside an area.",
  requires: ["Spectral"], kind: "bijective", scope: "local",
  fields: [F_kind("cell", "line", "block", "ring", "all"), F_REGION, { name: "k", choices: g => cached(`k:${g.C}`, () => range(g.C, 1)) }],
  terms: (p, g) => ({ dcol: regionSize(p.kind, p.region, g.N), scope: REGION_SCOPE[p.kind] }),
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v)) out.col[i] = (v.col[i] + p.k) % g.C;
    return out;
  },
  text: (p, g) => `move every colour in ${regionText(p, g)} ${p.k} step${p.k > 1 ? "s" : ""} along the rainbow`,
  guest: guest({
    py: `def rainbow_step(where, steps=1):
    k = _M_INT(steps, "steps") % len(_COLOURS)
    if k == 0:
        _M_FAIL("a whole lap round the rainbow does nothing")
    return _M_CALL("hue_turn", **_M_WHERE(where), k=k)
`,
    js: `function rainbowStep(where, steps = 1) {
  const C = __COLOURS.length, k = ((__M_INT(steps, "steps") % C) + C) % C;
  if (k === 0) __M_FAIL("a whole lap round the rainbow does nothing");
  return { __m: "hue_turn", ...__M_WHERE(where), k };
}
`,
    dts: `declare function rainbowStep(where: Area, steps?: number): MutatorCall;\n`,
    doc: [["rainbow_step(where, steps=1)", "rainbowStep(where, steps = 1)",
      "Move every colour in a cell, row or column, square, ring or everything some steps along the rainbow (next_colour, repeated).", "Spectral"]],
  }),
});

const pattern_line = def({
  id: "pattern_line", name: "Pattern a line", emoji: "〰️", summary: "Paint a row or column as a rainbow run or as two alternating colours.",
  requires: ["Spectral"], kind: "overwrite", scope: "line",
  fields: [F_LINE, { name: "pattern", choices: () => ["ramp", "alternate"] },
    { name: "start", choices: (g, p) => (p.pattern === "ramp" ? F_colour().choices(g, p) : null) },
    { name: "dir", choices: (_g, p) => (p.pattern === "ramp" ? [1, -1] : null) },
    { name: "pair", choices: (g, p) => (p.pattern === "alternate" ? F_pairOrdered().choices(g, p) : null) }],
  terms: (_p, g) => ({ erase: g.N * Math.log2(g.C), dcol: g.N * (1 - 1 / g.C), scope: "line" }),
  apply: (v, p, g) => {
    const out = copy(v);
    lineCells(p.line, g.N).forEach((c, t) => {
      out.col[c] = p.pattern === "ramp" ? mod(p.start + p.dir * t, g.C) : t % 2 === 0 ? p.pair[0] : p.pair[1];
    });
    return out;
  },
  text: (p, g) => p.pattern === "ramp"
    ? `paint ${regionText(linep(p), g)} as a rainbow starting ${cn(g, p.start)}, ${p.dir > 0 ? "forwards" : "backwards"} along the rainbow`
    : `paint ${regionText(linep(p), g)} ${cn(g, p.pair[0])}, ${cn(g, p.pair[1])}, ${cn(g, p.pair[0])}, ... alternating`,
  guest: guest({
    py: `def rainbow_line(line, start, backwards=False):
    return _M_CALL("pattern_line", line=_M_LINE(line), pattern="ramp", start=_M_COLOUR(start), dir=-1 if backwards else 1)

def alternate_line(line, a, b):
    return _M_CALL("pattern_line", line=_M_LINE(line), pattern="alternate", pair=[_M_COLOUR(a), _M_COLOUR(b)])
`,
    js: `function rainbowLine(line, start, backwards = false) {
  return { __m: "pattern_line", line: __M_LINE(line), pattern: "ramp", start: __M_COLOUR(start), dir: backwards ? -1 : 1 };
}
function alternateLine(line, a, b) {
  return { __m: "pattern_line", line: __M_LINE(line), pattern: "alternate", pair: [__M_COLOUR(a), __M_COLOUR(b)] };
}
`,
    dts: `declare function rainbowLine(line: LineRef, start: string, backwards?: boolean): MutatorCall;
declare function alternateLine(line: LineRef, a: string, b: string): MutatorCall;
`,
    doc: [["rainbow_line(line, start, backwards=False)", "rainbowLine(line, start, backwards = false)",
      "Paint a row or column as a rainbow run starting with one colour.", "Spectral"],
    ["alternate_line(line, a, b)", "alternateLine(line, a, b)", "Paint a row or column a, b, a, b, ...", "Spectral"]],
  }),
});

function motifColour(p: GP, g: GridCtx, r: number, c: number): number {
  if (p.style === "stripes") return mod(p.start + p.dir * (p.axis === 0 ? r : c), g.C);
  if (p.style === "checker") return (r + c) % 2 === 0 ? p.pair[0] : p.pair[1];
  return mod(p.start + p.dir * (p.axis === 0 ? r + c : r - c), g.C);
}

const motif = def({
  id: "motif", name: "Wallpaper", emoji: "🧱", summary: "Repaint the whole grid with a pattern: rainbow stripes, diagonal rainbows or a chessboard.",
  requires: ["Spectral"], kind: "overwrite", scope: "global",
  fields: [{ name: "style", choices: () => ["stripes", "checker", "diagonal"] },
    { name: "axis", choices: (_g, p) => (p.style !== "checker" ? [0, 1] : null) },
    { name: "start", choices: (g, p) => (p.style !== "checker" ? F_colour().choices(g, p) : null) },
    { name: "dir", choices: (_g, p) => (p.style !== "checker" ? [1, -1] : null) },
    { name: "pair", choices: (g, p) => (p.style === "checker" ? F_pairOrdered().choices(g, p) : null) }],
  terms: (_p, g) => ({ erase: g.N ** 2 * Math.log2(g.C), dcol: g.N ** 2 * (1 - 1 / g.C), scope: "global" }),
  apply: (v, p, g) => {
    const out = copy(v);
    for (let i = 0; i < g.N * g.N; i++) out.col[i] = motifColour(p, g, Math.floor(i / g.N), i % g.N);
    return out;
  },
  text: (p, g) => {
    const back = p.dir > 0 ? "" : ", going backwards";
    if (p.style === "stripes") return `paint the whole grid in rainbow ${p.axis === 0 ? "stripes across" : "stripes down"} starting ${cn(g, p.start)}${back}`;
    if (p.style === "checker") return `paint the whole grid as a ${cn(g, p.pair[0])}/${cn(g, p.pair[1])} chessboard`;
    return `paint the whole grid in diagonal rainbow stripes starting ${cn(g, p.start)}${back}`;
  },
  guest: guest({
    py: `def stripes(start, down=False, backwards=False):
    return _M_CALL("motif", style="stripes", axis=1 if down else 0, start=_M_COLOUR(start), dir=-1 if backwards else 1)

def diagonal_rainbow(start, other_way=False, backwards=False):
    return _M_CALL("motif", style="diagonal", axis=1 if other_way else 0, start=_M_COLOUR(start), dir=-1 if backwards else 1)

def chessboard(a, b):
    return _M_CALL("motif", style="checker", pair=[_M_COLOUR(a), _M_COLOUR(b)])
`,
    js: `function stripes(start, down = false, backwards = false) {
  return { __m: "motif", style: "stripes", axis: down ? 1 : 0, start: __M_COLOUR(start), dir: backwards ? -1 : 1 };
}
function diagonalRainbow(start, otherWay = false, backwards = false) {
  return { __m: "motif", style: "diagonal", axis: otherWay ? 1 : 0, start: __M_COLOUR(start), dir: backwards ? -1 : 1 };
}
function chessboard(a, b) {
  return { __m: "motif", style: "checker", pair: [__M_COLOUR(a), __M_COLOUR(b)] };
}
`,
    dts: `declare function stripes(start: string, down?: boolean, backwards?: boolean): MutatorCall;
declare function diagonalRainbow(start: string, otherWay?: boolean, backwards?: boolean): MutatorCall;
declare function chessboard(a: string, b: string): MutatorCall;
`,
    doc: [["stripes(start, down=False, backwards=False)", "stripes(start, down = false, backwards = false)",
      "Repaint the whole grid in rainbow stripes (each row one colour; down=True: each column).", "Spectral"],
    ["diagonal_rainbow(start, other_way=False, backwards=False)", "diagonalRainbow(start, otherWay = false, backwards = false)",
      "Repaint the whole grid in diagonal rainbow stripes.", "Spectral"],
    ["chessboard(a, b)", "chessboard(a, b)", "Repaint the whole grid as a chessboard of two colours.", "Spectral"]],
  }),
});

function pluralityCounts(N: number, C: number): Float64Array {
  return cached(`plur:${N}:${C}`, () => {
    const out = new Float64Array(C), cnt = new Int32Array(C);
    let maxSum = 0;
    for (let x = 0; x < C ** N; x++) {
      cnt.fill(0);
      for (let t = 0, y = x; t < N; t++, y = Math.floor(y / C)) cnt[y % C]++;
      let best = 0;
      for (let k = 1; k < C; k++) if (cnt[k] > cnt[best]) best = k;
      out[best]++;
      maxSum += cnt[best];
    }
    memo.set(`plurmax:${N}:${C}`, maxSum / C ** N);
    return out;
  });
}
/** mutators.py `_majority_stats`: exact Shannon erasure and expected changed cells of a line vote. */
function majorityStats(N: number, C: number): { erase: number; changed: number } {
  return cached(`maj:${N}:${C}`, () => {
    const counts = pluralityCounts(N, C), total = C ** N;
    const H = -[...counts].reduce((s, c) => (c > 0 ? s + (c / total) * Math.log2(c / total) : s), 0);
    return { erase: N * Math.log2(C) - H, changed: N - (memo.get(`plurmax:${N}:${C}`) as number) };
  });
}
const plurality = (cols: readonly number[], C: number): number => {
  const cnt = new Array(C).fill(0);
  for (const c of cols) cnt[c]++;
  return argmax(cnt);
};
const majorityFeature = (g: GridCtx): Feature => v =>
  range(2 * g.N).map(L => { const cnt = new Array(g.C).fill(0); for (const i of lineCells(lineOf(L, g.N), g.N)) cnt[v.col[i]]++; return Math.max(...cnt); });

const majority_line = def({
  id: "majority_line", name: "Majority vote", emoji: "🗳️", summary: "A row or column votes: every cell takes the line's most common colour.",
  requires: [], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "line*"), F_REGION],
  terms: (p, g) => { const st = majorityStats(g.N, g.C); return { erase: st.erase, dcol: st.changed, measure: starMeasure(p, g), scope: "line" }; },
  apply: (v, p, g) => {
    const out = copy(v), cells = resolveCells(p, g, v, majorityFeature(g)), k = plurality(cells.map(i => v.col[i]), g.C);
    for (const i of cells) out.col[i] = k;
    return out;
  },
  pointwise: (v, p, g) => {
    const cells = resolveCells(p, g, v, majorityFeature(g));
    return Math.log2(pluralityCounts(g.N, g.C)[plurality(cells.map(i => v.col[i]), g.C)]);
  },
  text: (p, g) => `make ${regionText(p, g, "the row or column that is closest to one colour")} all its most common colour`,
  guest: guest({
    py: `def majority(line):
    return _M_CALL("majority_line", **_M_WHERE(line))
`,
    js: `function majority(line) {
  return { __m: "majority_line", ...__M_WHERE(line) };
}
`,
    dts: `declare function majority(line: LineRef): MutatorCall;\n`,
    doc: [["majority(line)", "majority(line)",
      "A row or column votes: every cell takes its most common colour. majority(busiest_line()) picks the line closest to one colour."]],
  }),
});

// ================================================================================================
// 4. symbol layer
// ================================================================================================

const write = def({
  id: "write", name: "Write", emoji: "✏️", summary: "Write one symbol into a cell, a line, a square, a ring or the whole grid.",
  requires: [], kind: "overwrite", scope: "local",
  fields: [F_kind(...PAINT_KINDS), F_REGION, { name: "symbol", choices: g => cached(`col:${g.S}`, () => range(g.S)) }],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: n * Math.log2(g.S), dsym: n * (1 - 1 / g.S), measure: starMeasure(p, g), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v, symbolHits(p.symbol))) out.sym[i] = p.symbol;
    return out;
  },
  text: (p, g) => `write ${symText(g, p.symbol)} in ${p.kind === "cell" ? "" : "every cell of "}${regionText(p, g, `the row or column with the most ${symText(g, p.symbol)}s`)}`,
  guest: guest({
    py: `def write(where, symbol):
    return _M_CALL("write", **_M_WHERE(where), symbol=_M_SYMBOL(symbol))
`,
    js: `function write(where, symbol) {
  return { __m: "write", ...__M_WHERE(where), symbol: __M_SYMBOL(symbol) };
}
`,
    dts: `declare function write(where: Area, symbol: string | number): MutatorCall;\n`,
    doc: [["write(where, symbol)", "write(where, symbol)", "Write one symbol into a cell, row, column, square, ring or everything: write(cell, 7)."]],
  }),
});

const flatten = def({
  id: "flatten", name: "Flatten", emoji: "🏔️",
  summary: "Flatten the lowlands: in an area, every number except the highest drops to the area's lowest (cards keep their suit).",
  requires: ["Ranked"], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "block", "ring", "all"), F_REGION],
  terms: (p, g) => {
    const n = Math.max(regionSize(p.kind, p.region, g.N) - 1, 0);
    return { erase: n * Math.log2(g.R), dsym: n * (1 - 2 / g.R), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const cells = resolveCells(p, g, v);
    if (cells.length < 2) return v;
    const rr = cells.map(i => rankOf(g, v.sym[i])), hi = Math.max(...rr), lo = Math.min(...rr);
    const out = copy(v);
    cells.forEach((i, t) => { if (rr[t] !== hi && rr[t] !== lo) out.sym[i] = g.cards ? Math.floor(v.sym[i] / 13) * 13 + lo : lo; });
    return out;
  },
  // energy.py: the n non-peak cells had ranks in [lo, hi), at least one equal to lo
  pointwise: (v, p, g) => {
    const rr = resolveCells(p, g, v).map(i => rankOf(g, v.sym[i]));
    const hi = Math.max(...rr), lo = Math.min(...rr), n = rr.filter(r => r !== hi).length, h = hi - lo;
    if (n === 0 || h <= 0) return 0;
    return n * Math.log2(h) + (h > 1 ? Math.log2(1 - ((h - 1) / h) ** n) : 0);
  },
  text: (p, g) => `in ${regionText(p, g)}, every number except the highest drops to the lowest one there`,
  guest: guest({
    py: `def flatten(where):
    return _M_CALL("flatten", **_M_WHERE(where))
`,
    js: `function flatten(where) {
  return { __m: "flatten", ...__M_WHERE(where) };
}
`,
    dts: `declare function flatten(where: Area): MutatorCall;\n`,
    doc: [["flatten(where)", "flatten(where)",
      "In a row or column, square, ring or everything, every number except the highest drops to the lowest one there.", "Ranked"]],
  }),
});

const step_rank = def({
  id: "step_rank", name: "Count on", emoji: "🔢", summary: "Count every number in an area on by some steps (wrapping round; cards keep their suit).",
  requires: ["Ranked"], kind: "bijective", scope: "local",
  fields: [F_kind("cell", "line", "block", "ring", "all"), F_REGION, { name: "k", choices: g => cached(`k:${g.R}`, () => range(g.R, 1)) }],
  terms: (p, g) => ({ dsym: regionSize(p.kind, p.region, g.N), scope: REGION_SCOPE[p.kind] }),
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v)) out.sym[i] = stepSym(g, v.sym[i], p.k);
    return out;
  },
  text: (p, g) => `count every number in ${regionText(p, g)} on by ${p.k}`,
  guest: guest({
    py: `def count_on(where, steps=1):
    k = _M_INT(steps, "steps") % _M_R
    if k == 0:
        _M_FAIL("counting on a whole lap does nothing")
    return _M_CALL("step_rank", **_M_WHERE(where), k=k)
`,
    js: `function countOn(where, steps = 1) {
  const k = ((__M_INT(steps, "steps") % __M_R) + __M_R) % __M_R;
  if (k === 0) __M_FAIL("counting on a whole lap does nothing");
  return { __m: "step_rank", ...__M_WHERE(where), k };
}
`,
    dts: `declare function countOn(where: Area, steps?: number): MutatorCall;\n`,
    doc: [["count_on(where, steps=1)", "countOn(where, steps = 1)",
      "Count every number in a cell, row or column, square, ring or everything on by some steps, wrapping round (cards keep their suit).", "Ranked"]],
  }),
});

const write_ramp = def({
  id: "write_ramp", name: "Count along", emoji: "🪜", summary: "Write a counting run along a row or column: 3, 4, 5, 6, ... (cards keep their suit).",
  requires: ["Ranked"], kind: "overwrite", scope: "line",
  fields: [F_LINE, { name: "start", choices: g => cached(`col:${g.R}`, () => range(g.R)) }, { name: "dir", choices: () => [1, -1] }],
  terms: (_p, g) => ({ erase: g.N * Math.log2(g.R), dsym: g.N * (1 - 1 / g.R), scope: "line" }),
  apply: (v, p, g) => {
    const out = copy(v);
    lineCells(p.line, g.N).forEach((c, t) => {
      const r = mod(p.start + p.dir * t, g.R);
      out.sym[c] = g.cards ? Math.floor(v.sym[c] / 13) * 13 + r : r;
    });
    return out;
  },
  text: (p, g) => `write a counting run in ${regionText(linep(p), g)} starting at ${rankText(g, p.start)}, counting ${p.dir > 0 ? "up" : "down"}`,
  guest: guest({
    py: `def count_along(line, start, down=False):
    return _M_CALL("write_ramp", line=_M_LINE(line), start=_M_RANK(start), dir=-1 if down else 1)
`,
    js: `function countAlong(line, start, down = false) {
  return { __m: "write_ramp", line: __M_LINE(line), start: __M_RANK(start), dir: down ? -1 : 1 };
}
`,
    dts: `declare function countAlong(line: LineRef, start: string | number, down?: boolean): MutatorCall;\n`,
    doc: [["count_along(line, start, down=False)", "countAlong(line, start, down = false)",
      "Write a counting run along a row or column: 3, 4, 5, ... (down=True counts down; cards keep their suit).", "Ranked"]],
  }),
});

const swap_symbols = def({
  id: "swap_symbols", name: "Trade numbers", emoji: "🔄", summary: "Two numbers trade places inside an area: every 3 becomes 7 and every 7 becomes 3.",
  requires: ["Ranked"], kind: "bijective", scope: "line",
  fields: [F_kind("line", "block", "ring", "all"), F_REGION, { name: "pair", choices: g => cached(`comb:${g.R}`, () => combos(g.R)) }],
  terms: (p, g) => ({ dsym: (2 * regionSize(p.kind, p.region, g.N)) / g.R, scope: REGION_SCOPE[p.kind] }),
  apply: (v, p, g) => {
    const out = copy(v), [a, b] = p.pair;
    for (const i of resolveCells(p, g, v)) {
      const r = rankOf(g, v.sym[i]);
      if (r === a) out.sym[i] = stepSym(g, v.sym[i], b - a);
      else if (r === b) out.sym[i] = stepSym(g, v.sym[i], a - b);
    }
    return out;
  },
  text: (p, g) => `swap ${rankText(g, p.pair[0])}s and ${rankText(g, p.pair[1])}s in ${regionText(p, g)}`,
  guest: guest({
    py: `def swap_numbers(where, a, b):
    return _M_CALL("swap_symbols", **_M_WHERE(where), pair=sorted([_M_RANK(a), _M_RANK(b)]))
`,
    js: `function swapNumbers(where, a, b) {
  return { __m: "swap_symbols", ...__M_WHERE(where), pair: [__M_RANK(a), __M_RANK(b)].sort((x, y) => x - y) };
}
`,
    dts: `declare function swapNumbers(where: Area, a: string | number, b: string | number): MutatorCall;\n`,
    doc: [["swap_numbers(where, a, b)", "swapNumbers(where, a, b)",
      "Two numbers trade places inside a row or column, square, ring or everything (cards keep their suit).", "Ranked"]],
  }),
});

// ================================================================================================
// 5. couplers
// ================================================================================================

function keyColour(p: GP, g: GridCtx, s: number): number {
  const v = valueOf(g, s);
  if (p.key === "parity") return v % 2 === 0 ? p.pair[0] : p.pair[1];
  if (p.key === "mod") return (v + p.shift) % g.C;
  const suit = Math.floor(s / 13);
  return suit === 1 || suit === 2 ? p.pair[0] : p.pair[1];
}

const paint_by_key = def({
  id: "paint_by_key", name: "Paint by number", emoji: "🔟", summary: "Colour cells by what they show: even/odd, number-to-colour, or red/black suits.",
  requires: ["Valued"], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "all"), F_REGION,
    { name: "key", choices: g => (g.suited ? ["parity", "mod", "redblack"] : ["parity", "mod"]) },
    { name: "pair", choices: (g, p) => (p.key !== "mod" ? F_pairOrdered().choices(g, p) : null) },
    { name: "shift", choices: (g, p) => (p.key === "mod" ? F_colour().choices(g, p) : null) }],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: n * Math.log2(g.C), dcol: n * (1 - 1 / g.C), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v)) out.col[i] = keyColour(p, g, v.sym[i]);
    return out;
  },
  text: (p, g) => {
    const where = regionText(p, g);
    if (p.key === "parity") return `in ${where}, paint even numbers ${cn(g, p.pair[0])} and odd numbers ${cn(g, p.pair[1])}`;
    if (p.key === "mod") return `in ${where}, paint each cell by its number (colour = number + ${p.shift}, round the rainbow)`;
    return `in ${where}, paint hearts and diamonds ${cn(g, p.pair[0])} and spades and clubs ${cn(g, p.pair[1])}`;
  },
  guest: guest({
    py: `def paint_even_odd(where, even, odd):
    return _M_CALL("paint_by_key", **_M_WHERE(where), key="parity", pair=[_M_COLOUR(even), _M_COLOUR(odd)])

def paint_by_number(where, shift=0):
    return _M_CALL("paint_by_key", **_M_WHERE(where), key="mod", shift=_M_INT(shift, "shift") % len(_COLOURS))

def paint_red_black(where, red, black):
    return _M_CALL("paint_by_key", **_M_WHERE(where), key="redblack", pair=[_M_COLOUR(red), _M_COLOUR(black)])
`,
    js: `function paintEvenOdd(where, even, odd) {
  return { __m: "paint_by_key", ...__M_WHERE(where), key: "parity", pair: [__M_COLOUR(even), __M_COLOUR(odd)] };
}
function paintByNumber(where, shift = 0) {
  const C = __COLOURS.length;
  return { __m: "paint_by_key", ...__M_WHERE(where), key: "mod", shift: ((__M_INT(shift, "shift") % C) + C) % C };
}
function paintRedBlack(where, red, black) {
  return { __m: "paint_by_key", ...__M_WHERE(where), key: "redblack", pair: [__M_COLOUR(red), __M_COLOUR(black)] };
}
`,
    dts: `declare function paintEvenOdd(where: Area, even: string, odd: string): MutatorCall;
declare function paintByNumber(where: Area, shift?: number): MutatorCall;
declare function paintRedBlack(where: Area, red: string, black: string): MutatorCall;
`,
    doc: [["paint_even_odd(where, even, odd)", "paintEvenOdd(where, even, odd)",
      "In a row or column (or everything), paint cells with even values one colour and odd values another.", "Valued"],
    ["paint_by_number(where, shift=0)", "paintByNumber(where, shift = 0)",
      "In a row or column (or everything), colour each cell by its value: colour number = value + shift, round the rainbow.", "Valued"],
    ["paint_red_black(where, red, black)", "paintRedBlack(where, red, black)",
      "Cards only: paint hearts and diamonds one colour and spades and clubs another.", "Suited"]],
  }),
});

const stamp = def({
  id: "stamp", name: "Stamp", emoji: "📮", summary: "Every cell of one colour gets the same symbol stamped on it, inside an area.",
  requires: [], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "block", "all"), F_REGION, F_colour(), { name: "symbol", choices: g => cached(`col:${g.S}`, () => range(g.S)) }],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: (n / g.C) * Math.log2(g.S), dsym: (n / g.C) * (1 - 1 / g.S), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v)) if (v.col[i] === p.colour) out.sym[i] = p.symbol;
    return out;
  },
  pointwise: (v, p, g) => resolveCells(p, g, v).filter(i => v.col[i] === p.colour).length * Math.log2(g.S),
  text: (p, g) => `stamp ${symText(g, p.symbol)} on every ${cn(g, p.colour)} cell in ${regionText(p, g)}`,
  guest: guest({
    py: `def stamp(where, colour, symbol):
    return _M_CALL("stamp", **_M_WHERE(where), colour=_M_COLOUR(colour), symbol=_M_SYMBOL(symbol))
`,
    js: `function stamp(where, colour, symbol) {
  return { __m: "stamp", ...__M_WHERE(where), colour: __M_COLOUR(colour), symbol: __M_SYMBOL(symbol) };
}
`,
    dts: `declare function stamp(where: Area, colour: string, symbol: string | number): MutatorCall;\n`,
    doc: [["stamp(where, colour, symbol)", "stamp(where, colour, symbol)",
      "Stamp the same symbol on every cell of one colour, in a row or column, a square or everything."]],
  }),
});

function mineCounts(v: GridValue, X: number, N: number): number[] {
  return range(N * N).map(i => {
    const r = Math.floor(i / N), c = i % N;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N && v.col[rr * N + cc] === X) n++;
    }
    return n;
  });
}

const tally = def({
  id: "tally", name: "Count the mines", emoji: "💣", summary: "Cells of one colour are mines; every other cell shows how many mines touch it.",
  requires: ["Numeral"], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "block", "all"), F_REGION, F_colour()],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: n * (1 - 1 / g.C) * Math.log2(g.S), dsym: n * (1 - 1 / g.C) * (1 - 1 / g.S), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v), mines = mineCounts(v, p.colour, g.N);
    for (const i of resolveCells(p, g, v)) if (v.col[i] !== p.colour) out.sym[i] = Math.min(mines[i], g.S - 1);
    return out;
  },
  pointwise: (v, p, g) => resolveCells(p, g, v).filter(i => v.col[i] !== p.colour).length * Math.log2(g.S),
  text: (p, g) => `treat ${cn(g, p.colour)} cells as mines: every other cell in ${regionText(p, g)} shows how many mines touch it`,
  guest: guest({
    py: `def count_mines(where, mine_colour):
    return _M_CALL("tally", **_M_WHERE(where), colour=_M_COLOUR(mine_colour))
`,
    js: `function countMines(where, mineColour) {
  return { __m: "tally", ...__M_WHERE(where), colour: __M_COLOUR(mineColour) };
}
`,
    dts: `declare function countMines(where: Area, mineColour: string): MutatorCall;\n`,
    doc: [["count_mines(where, mine_colour)", "countMines(where, mineColour)",
      "Cells of one colour are mines; every other cell in a row or column, square or everything shows how many mines touch it.", "Numeral"]],
  }),
});

// ================================================================================================
// 6. capability-specific: paint mixing and suits
// ================================================================================================

function neighHas(v: GridValue, k: number, N: number, i: number): boolean {
  const r = Math.floor(i / N), c = i % N;
  return (r > 0 && v.col[i - N] === k) || (r < N - 1 && v.col[i + N] === k) || (c > 0 && v.col[i - 1] === k) || (c < N - 1 && v.col[i + 1] === k);
}
const blendCells = (v: GridValue, p: GP, g: GridCtx) => {
  const [a, b] = p.recipe;
  return resolveCells(p, g, v).filter(i => v.col[i] !== a && v.col[i] !== b && neighHas(v, a, g.N, i) && neighHas(v, b, g.N, i));
};

const blend = def({
  id: "blend", name: "Mix paint", emoji: "🧪", summary: "Where two paints meet (say red and yellow), the cells touching both turn the mixed colour (orange).",
  requires: ["Mixable"], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "all"), F_REGION, { name: "recipe", choices: g => g.recipes }],
  terms: (p, g) => {
    const C = g.C, N = g.N;
    let q = 0;
    for (const i of regionCells(p.kind, p.region, N)) {
      const r = Math.floor(i / N), c = i % N, d = 4 - +(r === 0) - +(r === N - 1) - +(c === 0) - +(c === N - 1);
      q += (1 - 2 / C) * (1 - 2 * (1 - 1 / C) ** d + (1 - 2 / C) ** d);
    }
    return { erase: q * lg(C - 2), dcol: (q * (C - 3)) / (C - 2), scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of blendCells(v, p, g)) out.col[i] = p.recipe[2];
    return out;
  },
  pointwise: (v, p, g) => blendCells(v, p, g).length * lg(g.C - 2),
  text: (p, g) => `in ${regionText(p, g)}, every cell touching both ${cn(g, p.recipe[0])} and ${cn(g, p.recipe[1])} turns ${cn(g, p.recipe[2])}`,
  guest: guest({
    py: `def mix_paint(where, a, b):
    x, y = sorted([_M_COLOUR(a), _M_COLOUR(b)])
    child = _MIXES.get(_COLOURS[x] + "+" + _COLOURS[y])
    if child is None:
        _M_FAIL(repr(a) + " and " + repr(b) + " do not mix")
    return _M_CALL("blend", **_M_WHERE(where), recipe=[x, y, _COLOURS.index(child)])
`,
    js: `function mixPaint(where, a, b) {
  const [x, y] = [__M_COLOUR(a), __M_COLOUR(b)].sort((p, q) => p - q);
  const child = __MIXES.get(__COLOURS[x] + "+" + __COLOURS[y]);
  if (child === undefined) __M_FAIL(JSON.stringify(a) + " and " + JSON.stringify(b) + " do not mix");
  return { __m: "blend", ...__M_WHERE(where), recipe: [x, y, __COLOURS.indexOf(child)] };
}
`,
    dts: `declare function mixPaint(where: Area, a: string, b: string): MutatorCall;\n`,
    doc: [["mix_paint(where, a, b)", "mixPaint(where, a, b)",
      "In a row or column (or everything), cells touching both paint a and paint b turn their mix (mix(a, b)).", "Mixable"]],
  }),
});

const suit_swap = def({
  id: "suit_swap", name: "Trade suits", emoji: "♠️", summary: "Two suits trade places inside an area: every heart becomes a spade and every spade a heart.",
  requires: ["Suited"], kind: "bijective", scope: "local",
  fields: [F_kind("cell", "line", "block", "all"), F_REGION, { name: "pair", choices: () => cached("comb:4", () => combos(4)) }],
  terms: (p, g) => ({ dsym: (2 * regionSize(p.kind, p.region, g.N)) / 4, scope: REGION_SCOPE[p.kind] }),
  apply: (v, p, g) => {
    const out = copy(v), [a, b] = p.pair;
    for (const i of resolveCells(p, g, v)) {
      const su = Math.floor(v.sym[i] / 13);
      if (su === a) out.sym[i] = v.sym[i] + (b - a) * 13;
      else if (su === b) out.sym[i] = v.sym[i] + (a - b) * 13;
    }
    return out;
  },
  text: (p, g) => `swap ${SUIT_GLYPHS[p.pair[0]]} and ${SUIT_GLYPHS[p.pair[1]]} in ${regionText(p, g)}`,
  guest: guest({
    py: `def swap_suits(where, a, b):
    return _M_CALL("suit_swap", **_M_WHERE(where), pair=sorted([_M_LOOKUP(_M_SUITS, a, "suit"), _M_LOOKUP(_M_SUITS, b, "suit")]))
`,
    js: `function swapSuits(where, a, b) {
  return { __m: "suit_swap", ...__M_WHERE(where), pair: [__M_LOOKUP(__M_SUITS, a, "suit"), __M_LOOKUP(__M_SUITS, b, "suit")].sort((x, y) => x - y) };
}
`,
    dts: `declare function swapSuits(where: Area, a: string, b: string): MutatorCall;\n`,
    doc: [["swap_suits(where, a, b)", "swapSuits(where, a, b)",
      "Two suits trade places in a cell, row or column, square or everything: swap_suits(everything(), \"hearts\", \"spades\").", "Suited"]],
  }),
});

const suit_set = def({
  id: "suit_set", name: "Change suit", emoji: "🃏", summary: "Every card in an area changes to one suit (keeping its rank).",
  requires: ["Suited"], kind: "overwrite", scope: "line",
  fields: [F_kind("line", "block", "ring", "all"), F_REGION, { name: "suit", choices: () => cached("col:4", () => range(4)) }],
  terms: (p, g) => {
    const n = regionSize(p.kind, p.region, g.N);
    return { erase: 2 * n, dsym: 0.75 * n, scope: REGION_SCOPE[p.kind] };
  },
  apply: (v, p, g) => {
    const out = copy(v);
    for (const i of resolveCells(p, g, v)) out.sym[i] = p.suit * 13 + (v.sym[i] % 13);
    return out;
  },
  text: (p, g) => `make every card in ${regionText(p, g)} a ${SUIT_GLYPHS[p.suit]}`,
  guest: guest({
    py: `def set_suit(where, suit):
    return _M_CALL("suit_set", **_M_WHERE(where), suit=_M_LOOKUP(_M_SUITS, suit, "suit"))
`,
    js: `function setSuit(where, suit) {
  return { __m: "suit_set", ...__M_WHERE(where), suit: __M_LOOKUP(__M_SUITS, suit, "suit") };
}
`,
    dts: `declare function setSuit(where: Area, suit: string): MutatorCall;\n`,
    doc: [["set_suit(where, suit)", "setSuit(where, suit)",
      "Every card in a row or column, square, ring or everything changes to one suit, keeping its rank.", "Suited"]],
  }),
});

/** mutators.py MUTATORS, in its order. */
export const GRID_MUTATORS: readonly GridMutator[] = Object.freeze([
  swap_cells, shift_line, reverse_line, swap_lines, turn_block, turn_grid,
  sort_line, mirror_fold,
  paint, recolour, swap_colours, hue_turn, pattern_line, motif, majority_line,
  write, step_rank, write_ramp, swap_symbols, flatten,
  paint_by_key, stamp, tally,
  blend, suit_swap, suit_set,
]);
