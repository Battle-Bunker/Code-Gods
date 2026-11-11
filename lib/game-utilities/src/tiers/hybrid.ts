/**
 * Hybrid calibration and liveness for tiered rules (docs/layered-rules-design.md §7.3, §12 steps 2 and 3).
 *
 * A tiered rule's ordinal is `[...base, base[0] ≥ gate ? tier : 0]`. Its base is a sum of scores of DISJOINT units
 * (pairs, boxes, rows), so the base has an exact law by convolution and an exact sampler of boards given the base. The
 * tier is then calibrated conditionally, one base level at a time:
 *
 *   G(b, i) = G_B(> b) + P(B = b) · P(I ≥ i | B = b)
 *
 * with P(I ≥ i | B = b) from multilevel splitting started at exact draws of boards with B = b and moved by a kernel
 * that never leaves {B = b} (two units are redrawn together, uniformly among all fillings with the same summed score).
 * Below the gate the levels are the base's own, exactly. Everything here is abstract (cells hold symbol indices; the
 * tier is a function of the board), so it is tested against brute force on small alphabets (test/tiers-hybrid.test.ts).
 */
import type { Ordinal } from "../types.ts";

/** A base whose ordinal is the componentwise sum of its units' scores. Units are disjoint and all score alike. */
export interface DisjointBase {
  /** Id and version of this decomposition ("opposite-nines-pairs@1"): part of the hybrid analytic id. */
  readonly id: string;
  /** Symbols per cell (each cell is uniform over 0..symbols−1 under the prior). */
  readonly symbols: number;
  /** Number of cells of the board. Cells in no unit are free (they never change the base). */
  readonly cells: number;
  /** The units, each a list of cell indices; all of one length. */
  readonly units: readonly (readonly number[])[];
  /** One unit's score from its cells' symbols (in the unit's cell order): a vector of `arity` whole numbers. */
  readonly score: (symbols: readonly number[]) => readonly number[];
  /** Length of the score vector (the base ordinal's arity). */
  readonly arity: number;
}

export interface HybridOptions {
  /** The tier counts only when the base's first component is at least this (0: always). */
  readonly gate: number;
  /** The tier of a board (cell symbols): a whole number or a lexicographic tuple. Only called on boards at or above the gate. */
  readonly tier: (board: Uint8Array) => Ordinal;
  /** The tier's value below the gate, and its arity (1 for a number). */
  readonly tierArity: number;
  readonly seed: number;
  /** Particles per base level; the top base level gets `topParticles`. */
  readonly particles?: number;
  readonly topParticles?: number;
  /** Kernel moves per particle per stage, in units of the number of units. */
  readonly sweeps?: number;
}

export interface HybridLaw {
  /** `[ordinal, log2 G]`, ordinals strictly increasing: the base's exact levels below the gate, conditional ones above. */
  readonly levels: readonly (readonly [readonly number[], number])[];
  /** The base's exact law: `[base ordinal, log2 P(B ≥ b)]`, increasing. */
  readonly baseLevels: readonly (readonly [readonly number[], number])[];
  /** At the base's top level: the tier values seen there with P(I ≥ i | top), increasing in i. */
  readonly topTier: readonly (readonly [Ordinal, number])[];
  /** A board reaching the best ordinal found (base top, best tier there). */
  readonly best: Uint8Array;
  readonly evaluations: number;
}

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tupleOf = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);
function cmp(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
const add = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x + b[i]);
const sub = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x - b[i]);
const keyOf = (a: readonly number[]) => a.join(",");

interface UnitClass { readonly score: readonly number[]; readonly key: string; readonly fillings: number[] }
interface Prepared {
  readonly base: DisjointBase;
  readonly k: number;
  /** The fillings of one unit (as base-`symbols` numbers), grouped by score. */
  readonly classes: readonly UnitClass[];
  readonly classOf: Int32Array;
  /** ways[m]: summed score of m units → number of fillings. */
  readonly ways: readonly Map<string, { readonly total: readonly number[]; readonly n: number }>[];
  readonly free: readonly number[];
}

const prepared = new WeakMap<DisjointBase, Prepared>();
/** The most fillings one unit may have (4 cells of 16 symbols). */
export const MAX_UNIT_FILLINGS = 1 << 17;

function prepare(base: DisjointBase): Prepared {
  let p = prepared.get(base);
  if (p) return p;
  const k = base.units[0].length, S = base.symbols, count = S ** k;
  if (!base.units.every(u => u.length === k)) throw new Error(`${base.id}: units of different sizes`);
  if (count > MAX_UNIT_FILLINGS) throw new Error(`${base.id}: ${count} fillings per unit is too many`);
  const byKey = new Map<string, UnitClass>(), classes: UnitClass[] = [], classOf = new Int32Array(count);
  const syms = new Array<number>(k).fill(0);
  for (let f = 0; f < count; f++) {
    let x = f;
    for (let i = 0; i < k; i++) { syms[i] = x % S; x = Math.floor(x / S); }
    const score = base.score(syms);
    if (score.length !== base.arity) throw new Error(`${base.id}: unit score of arity ${score.length}, expected ${base.arity}`);
    const key = keyOf(score);
    let c = byKey.get(key);
    if (!c) { c = { score: [...score], key, fillings: [] }; byKey.set(key, c); classes.push(c); }
    c.fillings.push(f);
    classOf[f] = classes.indexOf(c);
  }
  const zero = new Array<number>(base.arity).fill(0);
  const ways: Map<string, { total: readonly number[]; n: number }>[] = [new Map([[keyOf(zero), { total: zero, n: 1 }]])];
  for (let m = 1; m <= base.units.length; m++) {
    const next = new Map<string, { total: readonly number[]; n: number }>();
    for (const w of ways[m - 1].values()) for (const c of classes) {
      const total = add(w.total, c.score), key = keyOf(total), e = next.get(key);
      if (e) e.n += w.n * c.fillings.length; else next.set(key, { total, n: w.n * c.fillings.length });
    }
    ways.push(next);
  }
  const used = new Set(base.units.flat());
  if (used.size !== base.units.length * k) throw new Error(`${base.id}: units overlap`);
  const free = Array.from({ length: base.cells }, (_, i) => i).filter(i => !used.has(i));
  prepared.set(base, p = { base, k, classes, classOf, ways, free });
  return p;
}

/** The base's exact law: every attainable base ordinal with its probability, increasing. */
export function baseLaw(base: DisjointBase): { readonly ordinal: readonly number[]; readonly p: number }[] {
  const pre = prepare(base), all = base.symbols ** (pre.k * base.units.length);
  return [...pre.ways[base.units.length].values()].map(w => ({ ordinal: w.total, p: w.n / all })).sort((a, b) => cmp(a.ordinal, b.ordinal));
}

function writeUnit(pre: Prepared, board: Uint8Array, u: number, filling: number): void {
  const cells = pre.base.units[u], S = pre.base.symbols;
  let x = filling;
  for (let i = 0; i < pre.k; i++) { board[cells[i]] = x % S; x = Math.floor(x / S); }
}
function readUnit(pre: Prepared, board: Uint8Array, u: number): number {
  const cells = pre.base.units[u], S = pre.base.symbols;
  let x = 0;
  for (let i = pre.k - 1; i >= 0; i--) x = x * S + board[cells[i]];
  return x;
}

/** An exact uniform draw among the boards whose base is `b`. */
export function drawGiven(base: DisjointBase, b: readonly number[], rand: () => number): Uint8Array {
  const pre = prepare(base), M = base.units.length, board = new Uint8Array(base.cells);
  for (const i of pre.free) board[i] = Math.floor(rand() * base.symbols);
  let rest = b;
  for (let u = 0; u < M; u++) {
    const left = M - 1 - u, here = pre.ways[left + 1].get(keyOf(rest));
    if (!here) throw new Error(`${base.id}: base ${keyOf(b)} is not attainable`);
    let x = rand() * here.n, chosen: UnitClass | null = null;
    for (const c of pre.classes) {
      const w = pre.ways[left].get(keyOf(sub(rest, c.score)));
      if (!w) continue;
      chosen = c;
      x -= c.fillings.length * w.n;
      if (x < 0) break;
    }
    writeUnit(pre, board, u, chosen!.fillings[Math.floor(rand() * chosen!.fillings.length)]);
    rest = sub(rest, chosen!.score);
  }
  return board;
}

/** Splits of a two-unit total into two classes, with cumulative weights (memoised per base). */
const splitMemo = new WeakMap<Prepared, Map<string, { a: number; b: number; cum: number }[]>>();
function splits(pre: Prepared, total: readonly number[]): { a: number; b: number; cum: number }[] {
  let memo = splitMemo.get(pre);
  if (!memo) splitMemo.set(pre, memo = new Map());
  const key = keyOf(total);
  let s = memo.get(key);
  if (!s) {
    s = [];
    let cum = 0;
    const index = new Map(pre.classes.map((c, i) => [c.key, i]));
    pre.classes.forEach((c, a) => {
      const b = index.get(keyOf(sub(total, c.score)));
      if (b === undefined) return;
      cum += c.fillings.length * pre.classes[b].fillings.length;
      s!.push({ a, b, cum });
    });
    memo.set(key, s);
  }
  return s;
}

/**
 * One move of the base-preserving kernel, in place: a free cell is redrawn, or two units are redrawn uniformly among
 * all pairs of fillings with the same summed score (a heat-bath step, so the uniform law on {B = b} is invariant).
 * Returns what to restore if the move is refused.
 */
function move(pre: Prepared, board: Uint8Array, rand: () => number): () => void {
  const M = pre.base.units.length;
  if (pre.free.length && rand() * (pre.free.length + M) < pre.free.length) {
    const i = pre.free[Math.floor(rand() * pre.free.length)], was = board[i];
    board[i] = Math.floor(rand() * pre.base.symbols);
    return () => { board[i] = was; };
  }
  const u = Math.floor(rand() * M);
  let w = Math.floor(rand() * (M - 1));
  if (w >= u) w += 1;
  const fu = readUnit(pre, board, u), fw = readUnit(pre, board, w);
  const total = add(pre.classes[pre.classOf[fu]].score, pre.classes[pre.classOf[fw]].score);
  const s = splits(pre, total), x = rand() * s[s.length - 1].cum;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].cum > x) hi = mid; else lo = mid + 1; }
  const A = pre.classes[s[lo].a].fillings, B = pre.classes[s[lo].b].fillings;
  writeUnit(pre, board, u, A[Math.floor(rand() * A.length)]);
  writeUnit(pre, board, w, B[Math.floor(rand() * B.length)]);
  return () => { writeUnit(pre, board, u, fu); writeUnit(pre, board, w, fw); };
}

// ------------------------------------------------------------------------------------------------
// the conditional tier law at one base level (multilevel splitting inside {B = b})
// ------------------------------------------------------------------------------------------------

export interface ConditionalLaw {
  /** `[tier value, P(I ≥ value | B = b)]`, increasing in value; the first entry has probability 1. */
  readonly survival: readonly (readonly [readonly number[], number])[];
  /** A board with the best tier found. */
  readonly best: Uint8Array;
  readonly evaluations: number;
}

/** Survival fraction aimed at per splitting stage. */
const P0 = 0.25;
/** Splitting stops once the conditional probability falls below 2^-this (far below any table's reach). */
const MAX_CONDITIONAL_BITS = 60;

export function conditionalTier(base: DisjointBase, b: readonly number[], tier: (board: Uint8Array) => Ordinal,
  options: { readonly particles: number; readonly sweeps: number; readonly rand: () => number }): ConditionalLaw {
  const pre = prepare(base), { particles: n, rand } = options;
  const steps = Math.max(1, Math.ceil(options.sweeps * (base.units.length + pre.free.length)));
  let evaluations = 0;
  const score = (board: Uint8Array) => { evaluations++; return tupleOf(tier(board)); };
  const boards = Array.from({ length: n }, () => drawGiven(base, b, rand));
  const scores = boards.map(score);
  const survival: [readonly number[], number][] = [];
  let p = 1;                                   // P(I ≥ threshold | b) of the cloud's current conditioning
  let threshold: readonly number[] | null = null;
  for (let stage = 0; stage < 400; stage++) {
    // The cloud is uniform on {B = b, I ≥ threshold}: record every value it shows above the threshold.
    const order = scores.map((s, i) => ({ s, i })).sort((x, y) => cmp(x.s, y.s));
    const values: { v: readonly number[]; from: number }[] = [];
    order.forEach((e, at) => { if (!values.length || cmp(values[values.length - 1].v, e.s) !== 0) values.push({ v: e.s, from: at }); });
    let next = -1;
    for (let j = 0; j < values.length; j++) {
      const { v, from } = values[j];
      if (threshold && cmp(v, threshold) <= 0) continue;
      const frac = (n - from) / n;
      survival.push([v, p * frac]);
      if (frac >= P0 || next < 0) next = j;    // the highest value still held by a quarter of the cloud, or the first one above
      if (frac < P0) break;
    }
    if (next < 0) {
      // Every particle sits at the threshold: look for something higher, and stop when a full stage finds nothing.
      let found = false;
      for (let i = 0; i < n && !found; i++) {
        for (let t = 0; t < steps; t++) {
          const undo = move(pre, boards[i], rand), s = score(boards[i]);
          if (cmp(s, threshold!) < 0) { undo(); continue; }
          scores[i] = s;
          if (cmp(s, threshold!) > 0) { found = true; break; }
        }
      }
      if (!found) break;
      continue;
    }
    const cut = values[next];
    // Drop the recorded values above the cut: they are re-estimated from the next, better conditioned cloud.
    while (survival.length && cmp(survival[survival.length - 1][0], cut.v) > 0) survival.pop();
    p *= (n - cut.from) / n;
    threshold = cut.v;
    if (-Math.log2(p) > MAX_CONDITIONAL_BITS) break;
    if (cut.from === 0) continue;              // the whole cloud is already at or above the cut: nothing to resample
    // Resample the survivors to a full cloud and move each inside {B = b, I ≥ threshold}.
    const alive = order.slice(cut.from).map(e => e.i);
    const nextBoards = boards.map((_, i) => (cmp(scores[i], threshold!) >= 0 ? boards[i] : null));
    for (let i = 0; i < n; i++) {
      if (nextBoards[i]) continue;
      const from = alive[Math.floor(rand() * alive.length)];
      boards[i] = Uint8Array.from(boards[from]);
      scores[i] = scores[from];
    }
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < steps; t++) {
        const undo = move(pre, boards[i], rand), s = score(boards[i]);
        if (cmp(s, threshold) < 0) undo(); else scores[i] = s;
      }
    }
  }
  let bi = 0;
  for (let i = 1; i < n; i++) if (cmp(scores[i], scores[bi]) > 0) bi = i;
  return { survival, best: boards[bi], evaluations };
}

// ------------------------------------------------------------------------------------------------
// the hybrid law
// ------------------------------------------------------------------------------------------------

export function hybridLaw(base: DisjointBase, options: HybridOptions): HybridLaw {
  const law = baseLaw(base), rand = mulberry32(options.seed);
  const particles = options.particles ?? 256, topParticles = options.topParticles ?? 1024, sweeps = options.sweeps ?? 2;
  const zeros = new Array<number>(options.tierArity).fill(0);
  // above[i] = P(B > law[i].ordinal), summed from the rare end to keep relative precision.
  const above = new Array<number>(law.length).fill(0);
  for (let i = law.length - 2; i >= 0; i--) above[i] = above[i + 1] + law[i + 1].p;
  const levels: [readonly number[], number][] = [];
  const baseLevels = law.map((l, i) => [l.ordinal, Math.log2(above[i] + l.p)] as const);
  let topTier: (readonly [Ordinal, number])[] = [], best: Uint8Array = new Uint8Array(base.cells), evaluations = 0;
  law.forEach((l, i) => {
    const top = i === law.length - 1;
    if (l.ordinal[0] < options.gate) { levels.push([[...l.ordinal, ...zeros], Math.log2(above[i] + l.p)]); return; }
    const c = conditionalTier(base, l.ordinal, options.tier, { particles: top ? topParticles : particles, sweeps, rand });
    evaluations += c.evaluations;
    for (const [v, q] of c.survival) levels.push([[...l.ordinal, ...v], Math.log2(above[i] + l.p * q)]);
    if (top) { topTier = c.survival.map(([v, q]) => [options.tierArity === 1 ? v[0] : v, q] as const); best = c.best; }
  });
  // Clean-up: log2 G must not increase and the first level is exactly 0.
  levels[0][1] = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i][1] > levels[i - 1][1]) levels[i][1] = levels[i - 1][1];
  return { levels, baseLevels, topTier, best, evaluations };
}

// ------------------------------------------------------------------------------------------------
// liveness (docs/layered-rules-design.md §2.3 rule 1 and 2, §8.3)
// ------------------------------------------------------------------------------------------------

/** The added reach a dealt tier must have, in bits over its base's top (§8.3: below 6 it is not worth a card line). */
export const TIER_MIN_ADDED_BITS = 6;
export const TIER_MAX_ADDED_BITS = 20;
/** At most this share of the boards that max the base may also max the tier. */
export const TIER_MAX_SHARE_AT_TOP = 0.5;

export interface Liveness {
  /** The best tier found on boards that max the base (`tierTop`). */
  readonly tierTop: Ordinal;
  /** The least tier there. */
  readonly tierMin: Ordinal;
  /** P(tier = tierTop | base at its top). */
  readonly shareAtTop: number;
  /** Bits the tier adds above the base's top: −log2 of that share. */
  readonly addedBits: number;
  /** Uniform or two-digit boards (as symbol strings) that reach the best ordinal. */
  readonly degenerate: readonly string[];
  /** Why the tier may not be dealt; empty when it is alive. */
  readonly problems: readonly string[];
}

/**
 * The uniform boards and the two-digit boards the red team named (§10 finding 7): checkerboards, stripes, `abba/baab`
 * quadrant patterns and one digit on a field of another, for every ordered pair of symbols.
 */
export function degenerateBoards(N: number, symbols: number): Uint8Array[] {
  const out: Uint8Array[] = [], seen = new Set<string>();
  const patterns: ((r: number, c: number) => boolean)[] = [
    () => false,
    (r, c) => (r + c) % 2 === 1,
    r => r % 2 === 1,
    (_r, c) => c % 2 === 1,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 2)) % 2 === 1,
    (r, c) => ((r === 0 || r === N - 1) ? 1 : 0) + ((c === 0 || c === N - 1) ? 1 : 0) === 1,     // abba/baab: edges that are not corners
    (r, c) => r > 0 && r < N - 1 && c > 0 && c < N - 1,                                           // the centre block
    (r, c) => r === c,
    (r, c) => r === c || r + c === N - 1,
    r => r < N / 2,
    (_r, c) => c < N / 2,
  ];
  for (const pat of patterns) for (let a = 0; a < symbols; a++) for (let b = 0; b < symbols; b++) {
    const board = new Uint8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) board[r * N + c] = pat(r, c) ? b : a;
    const key = board.join(",");
    if (!seen.has(key)) { seen.add(key); out.push(board); }
  }
  return out;
}

/**
 * The liveness check of one tier on one shape, from its hybrid law: on the boards that max the base the tier must
 * vary, must not be maxed by most of them, must add between 6 and 20 bits, and no uniform or two-digit board may reach
 * the best ordinal. `ordinalOf` scores a whole board with the full rule (base and tier).
 */
export function liveness(law: HybridLaw, N: number, symbols: number, ordinalOf: (board: Uint8Array) => readonly number[],
  band: { readonly min: number; readonly max: number } = { min: TIER_MIN_ADDED_BITS, max: TIER_MAX_ADDED_BITS }): Liveness {
  const t = law.topTier, tierTop = t[t.length - 1][0], tierMin = t[0][0], shareAtTop = t[t.length - 1][1];
  const addedBits = -Math.log2(shareAtTop);
  const bestOrdinal = law.levels[law.levels.length - 1][0];
  const degenerate = degenerateBoards(N, symbols).filter(b => cmp(ordinalOf(b), bestOrdinal) >= 0).map(b => b.join(""));
  const problems: string[] = [];
  if (t.length < 2) problems.push("the tier does not vary on the boards that max the base");
  else if (tupleOf(tierTop).every(x => x === 0)) problems.push("the tier is dead at the base's top");
  if (shareAtTop > TIER_MAX_SHARE_AT_TOP) problems.push(`${(100 * shareAtTop).toFixed(0)}% of the boards that max the base also max the tier`);
  if (addedBits < band.min) problems.push(`adds only ${addedBits.toFixed(1)} bits`);
  if (addedBits > band.max) problems.push(`adds ${addedBits.toFixed(1)} bits, above the cap of ${band.max}`);
  if (degenerate.length) problems.push(`a uniform or two-digit board reaches the top (${degenerate[0]})`);
  return { tierTop, tierMin, shareAtTop, addedBits, degenerate, problems };
}
