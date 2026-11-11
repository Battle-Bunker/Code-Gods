/**
 * The tiered difficulty profile of the REAL tiered families (docs/layered-rules-design.md §5–§8): every family with
 * `UtilityFamily.tiered` on Grid(4,base10,mono), read through its own card evaluator and its real table (the shipped
 * one when fresh, else built here: the hybrid law for gated and plain draws, the sampling estimator for unlocked ones).
 * No per-family code: a family is picked up as soon as it declares `tiered`.
 *
 *   pnpm --filter @workspace/game-utilities tiered [options]
 *   (= node --experimental-strip-types lib/game-utilities/scripts/tiered-profile.ts [options];
 *    also `pnpm --filter @workspace/game-utilities layered --real [options]`)
 *
 *   --families a,b        only these families
 *   --compose gated|plain|unlock|uncapped   which tiered draws to profile (default gated)
 *   --depth 1|2           tiers per draw (default 1)
 *   --limit N             at most N values per interaction (evenly spread through the dealt list)
 *   --pair-limit N        synergy and games for at most N values per interaction (default 2)
 *   --budget default|quick
 *   --no-pairs / --no-games / --no-exact / --no-profile
 *   --games N             games per variant and policy (default 40)
 *   --compare             the composition comparison (gated, plain, unlock) on the family's `compare` values
 *   --sweep "lines:x=0..36;squares:x=0..36"   liveness of every value of a tier param, dealt or not
 *   --json FILE / --markdown FILE
 *
 * What is exact and what is sampled: the base's law is exact (convolution over its disjoint units); the tier's law
 * given the base is multilevel splitting (the hybrid law, src/tiers/hybrid.ts); climbs, synergy and games are seeded
 * searches. Where a family registers an exact enumeration of the boards that max its base (EXACT_TOP below), the
 * hybrid's P(tier ≥ i | base at its top) is compared with it, in bits, at every tier level.
 */
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { instantiate, objectType, type GridValue, type Instantiation } from "@workspace/game-types";
import {
  DEFAULT_BUDGET, QUICK_BUDGET, familyParams, familyRule, greedy, measurePair, measureRule, space, starts,
  type Budget, type Context, type PairReport, type Rule, type RuleReport, type Space,
} from "./rule-difficulty-lib.ts";
import { buildTable } from "./estimator.ts";
import { games, type GameReport } from "./layered-profile.ts";
import { FAMILIES, applicable, assertOrdinal, context, evaluator, family } from "../src/catalog.ts";
import { analyticFor, priorMeanBits, surprisal, tableFor, type CalibrationTable } from "../src/calibration.ts";
import { shippedTables } from "../src/calibration-data.ts";
import { baseParams, tiersOf } from "../src/families/grid/tiers.ts";
import { liveness, type HybridLaw, type Liveness } from "../src/tiers/hybrid.ts";
import type { Ordinal, Params, TierParams } from "../src/types.ts";

// ------------------------------------------------------------------------------------------------
// pure parts (test/tiered-profile.test.ts)
// ------------------------------------------------------------------------------------------------

export type Composition = "gated" | "plain" | "unlock";
/** Where the tier sits in a tiered draw's ordinal: gated and plain `[...base, tier]`, unlock `[min(base[0], gate), tier, ...base]`. */
export interface TierLayout { readonly compose: Composition; readonly gate: number; readonly at: number; readonly arity: number; readonly baseArity: number }

export function tierLayout(ordinalLength: number, baseArity: number, tiers: readonly Pick<TierParams, "gate" | "compose">[]): TierLayout {
  const unlock = tiers[0]?.compose === "unlock", gate = tiers[0]?.gate ?? 0;
  const arity = ordinalLength - baseArity - (unlock ? 1 : 0);
  if (arity < 1) throw new Error(`an ordinal of ${ordinalLength} components holds no tier over a base of ${baseArity}`);
  return { compose: unlock ? "unlock" : gate > 0 ? "gated" : "plain", gate, at: unlock ? 1 : baseArity, arity, baseArity };
}
/** The same board's ordinal with its tier at 0: the floor of the tier's headroom. */
export function tierFloor(o: readonly number[], l: TierLayout): number[] {
  const out = [...o];
  for (let i = 0; i < l.arity; i++) out[l.at + i] = 0;
  return out;
}
export const tierOf = (o: readonly number[], l: TierLayout): number[] => o.slice(l.at, l.at + l.arity);
/** The base's ordinal read off a gated or plain tiered ordinal. */
export const basePart = (o: readonly number[], l: TierLayout): number[] => (l.compose === "unlock" ? o.slice(1 + l.arity) : o.slice(0, l.baseArity));

/**
 * The share of the tier's headroom a board holds: from the bits of the same board with its tier at 0 (`floor`) to the
 * rule's top. 1 when there is no headroom left (the floor is the top), never below 0 or above 1.
 */
export function headroomShare(bits: number, floor: number, top: number): number {
  return top - floor > 1e-6 ? Math.min(1, Math.max(0, (bits - floor) / (top - floor))) : 1;
}

const cmp = (a: readonly number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/**
 * P(tier ≥ i | base at its top) read off a gated or plain table's levels (`[ordinal, log2 G]` or `[ordinal, bits]`):
 * the levels whose base part is the top base ordinal, relative to the first of them. `sign` is −1 for log2 G levels
 * (the analytic's) and +1 for bits (a table's).
 */
export function topTierOf(levels: readonly (readonly [Ordinal, number])[], baseArity: number, sign: 1 | -1 = -1): [number[], number][] {
  const tup = (o: Ordinal) => (typeof o === "number" ? [o] : [...o]);
  const top = tup(levels[levels.length - 1][0]).slice(0, baseArity);
  const at = levels.filter(([o]) => cmp(tup(o).slice(0, baseArity), top) === 0);
  return at.map(([o, l]) => [tup(o).slice(baseArity), 2 ** (-sign * (l - at[0][1]))]);
}

/** An exact law of the tier on the boards that max the base. */
export interface ExactTop {
  /** Boards that max the base (all enumerated). */
  readonly boards: number;
  /** `[tier, P(tier ≥ this | base at its top)]`, increasing, only the values that occur. */
  readonly survival: readonly (readonly [number, number])[];
  readonly how: string;
}
/** A tally of whole-number tiers over an enumeration of the top set (the generic route for a small top set). */
export function exactTopFromBoards(boards: Iterable<Uint8Array>, tier: (board: Uint8Array) => number, how = "enumerated through the tier function"): ExactTop {
  const counts = new Map<number, number>();
  let n = 0;
  for (const b of boards) { const t = tier(b); counts.set(t, (counts.get(t) ?? 0) + 1); n++; }
  return { boards: n, survival: survivalOf([...counts], n), how };
}
function survivalOf(counts: readonly (readonly [number, number])[], n: number): [number, number][] {
  const sorted = counts.filter(([, c]) => c > 0).sort((a, b) => a[0] - b[0]);
  let above = 0;
  const out: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) { above += sorted[i][1]; out.unshift([sorted[i][0], above / n]); }
  return out;
}

/**
 * Opposite Nines on 4×4 digits, natively: the 10⁸ boards on which all 8 half-turn pairs add up to 9 (the first 8 cells
 * free, cell 15 − i forced to 9 − cell i). For every total x at once, the number of boards with exactly h units adding
 * up to x, for the 10 lines (rows, columns, long diagonals) or the 9 overlapping 2×2 squares. `counts[x * 11 + h]`.
 */
export function ninesTopCounts(kind: "lines" | "squares"): Float64Array {
  const counts = new Float64Array(37 * 11), seen = new Int32Array(37);
  // A row of four digits by index 0..9999, most significant first.
  const d = new Uint8Array(40000);
  for (let i = 0; i < 10000; i++) { d[4 * i] = Math.floor(i / 1000); d[4 * i + 1] = Math.floor(i / 100) % 10; d[4 * i + 2] = Math.floor(i / 10) % 10; d[4 * i + 3] = i % 10; }
  const sums = new Uint8Array(10);
  const n = kind === "lines" ? 10 : 9;
  for (let a = 0; a < 10000; a++) {
    const a0 = d[4 * a], a1 = d[4 * a + 1], a2 = d[4 * a + 2], a3 = d[4 * a + 3];
    for (let b = 0; b < 10000; b++) {
      const b0 = d[4 * b], b1 = d[4 * b + 1], b2 = d[4 * b + 2], b3 = d[4 * b + 3];
      // Rows 2 and 3 are forced: row 2 = 9 − (b3 b2 b1 b0), row 3 = 9 − (a3 a2 a1 a0).
      const c0 = 9 - b3, c1 = 9 - b2, c2 = 9 - b1, c3 = 9 - b0, e0 = 9 - a3, e1 = 9 - a2, e2 = 9 - a1, e3 = 9 - a0;
      if (kind === "lines") {
        sums[0] = a0 + a1 + a2 + a3; sums[1] = b0 + b1 + b2 + b3; sums[2] = c0 + c1 + c2 + c3; sums[3] = e0 + e1 + e2 + e3;
        sums[4] = a0 + b0 + c0 + e0; sums[5] = a1 + b1 + c1 + e1; sums[6] = a2 + b2 + c2 + e2; sums[7] = a3 + b3 + c3 + e3;
        sums[8] = a0 + b1 + c2 + e3; sums[9] = a3 + b2 + c1 + e0;
      } else {
        sums[0] = a0 + a1 + b0 + b1; sums[1] = a1 + a2 + b1 + b2; sums[2] = a2 + a3 + b2 + b3;
        sums[3] = b0 + b1 + c0 + c1; sums[4] = b1 + b2 + c1 + c2; sums[5] = b2 + b3 + c2 + c3;
        sums[6] = c0 + c1 + e0 + e1; sums[7] = c1 + c2 + e1 + e2; sums[8] = c2 + c3 + e2 + e3;
      }
      for (let k = 0; k < n; k++) seen[sums[k]]++;
      for (let k = 0; k < n; k++) { const s = sums[k], h = seen[s]; if (h) { counts[s * 11 + h]++; seen[s] = 0; } }
    }
  }
  // Boards with no unit at x: the rest.
  for (let x = 0; x <= 36; x++) { let some = 0; for (let h = 1; h <= 10; h++) some += counts[x * 11 + h]; counts[x * 11] = 1e8 - some; }
  return counts;
}
const ninesCache = new Map<string, Float64Array>();
/** Exact P(tier ≥ i | all 8 pairs add up to 9) for "lines add up to x" or "2×2 squares add up to x" (10⁸ boards). */
export function ninesExactTop(kind: "lines" | "squares", x: number): ExactTop {
  let counts = ninesCache.get(kind);
  if (!counts) ninesCache.set(kind, counts = ninesTopCounts(kind));
  const row = Array.from({ length: 11 }, (_, h) => [h, counts![x * 11 + h]] as const);
  return { boards: 1e8, survival: survivalOf(row, 1e8), how: "native enumeration of the 10⁸ boards with all 8 pairs at 9" };
}

/**
 * The exact tier law at the base's top, by family: the hook for a family whose top set is small enough to enumerate
 * (natively, or with `exactTopFromBoards`). Returns null for draws it does not cover.
 */
export const EXACT_TOP: Record<string, (params: Params, inst: Instantiation) => ExactTop | null> = {
  opposite_nines: (p, inst) => {
    const t = tiersOf(p);
    if (inst.key.replace(/,[a-z]+\)$/, ")") !== "Grid(4,base10)" || t.length !== 1 || t[0].compose === "unlock") return null;
    const x = t[0].x as number;
    if ((t[0].id !== "lines" && t[0].id !== "squares") || !Number.isInteger(x) || x < 0 || x > 36) return null;
    return ninesExactTop(t[0].id, x);
  },
};

export interface TierError { tier: number; hybrid: number | null; exact: number; error: number | null }
/** |hybrid − exact| in bits of −log2 P(tier ≥ i | top) at every tier level the exact law has (null: the hybrid never saw it). */
export function calibrationError(hybrid: readonly (readonly [readonly number[], number])[], exact: ExactTop): TierError[] {
  return exact.survival.map(([tier, p]) => {
    const h = hybrid.find(([v]) => v.length === 1 && v[0] === tier);
    const e = -Math.log2(p), hb = h ? -Math.log2(h[1]) : null;
    return { tier, hybrid: hb, exact: e, error: hb === null ? null : Math.abs(hb - e) };
  });
}

// ------------------------------------------------------------------------------------------------
// real rules and their tables
// ------------------------------------------------------------------------------------------------

export interface RealRule {
  rule: Rule;
  familyId: string;
  params: Params;
  table: CalibrationTable;
  /** "shipped" (fresh in data/calibration) or "built" here. */
  from: "shipped" | "built";
  /** "hybrid", "exact", "approx" (analytic kinds) or "sampled" (the Monte Carlo + splitting estimator). */
  kind: string;
  /** Seconds to build the table here (measured even when the shipped one is used), NaN when not timed. */
  seconds: number;
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const tup = (o: Ordinal): number[] => (typeof o === "number" ? [o] : [...o]);
const label = (p: Params) => {
  const t = tiersOf(p);
  if (!t.length) return "base";
  const how = t[0].compose ?? (t[0].gate === 0 ? "plain" : "gated");
  return t.map(({ id, gate: _g, compose: _c, ...v }) => `${id}(${Object.entries(v).map(([k, x]) => `${k}=${x}`).join(",")})`).join("+") + (how === "gated" ? "" : `@${how}`);
};

/** A family draw as a rule over its real table. `time`: build the table here even when a fresh one is shipped, for its seconds. */
export function realRule(familyId: string, params: Params, inst: Instantiation, opts: { time?: boolean } = {}): RealRule {
  const f = family(familyId), ctx = context(inst), codec = objectType(inst.objectType).codec(inst);
  const canon = f.canonical(params, ctx);
  const ev = evaluator({ familyId, params: canon }, inst), shape = f.shape(ctx, canon);
  const score = (g: GridValue) => assertOrdinal(shape, ev(codec.encode(g)));
  const shipped = tableFor(shippedTables(inst.key), { familyId, params: canon }, inst);
  let table = shipped, seconds = NaN;
  if (!shipped || opts.time) {
    const b = buildTable(familyId, canon, inst);
    seconds = b.seconds; table ??= b.table;
  }
  const budget = table!.estimator.budget, kind = typeof budget === "string" ? budget.split(":")[0] : "sampled";
  let topBits = table!.levels[table!.levels.length - 1][1];
  // A hybrid draw's exemplar is the best board of its law, so this is where the law is first computed: time it here.
  const t0 = performance.now();
  try {
    const top = f.top?.(canon, ctx) ?? (f.exemplar ? ev(f.exemplar(canon, ctx)) : undefined);
    if (top !== undefined) topBits = Math.max(topBits, surprisal(table!, top));
  } catch { /* no closed-form top here */ }
  if (Number.isNaN(seconds) && kind === "hybrid") seconds = (performance.now() - t0) / 1000;
  const rule: Rule = {
    id: `${familyId}.${label(canon)}`, source: f.card.typescript(canon, ctx), score, calibration: shipped ? "shipped" : "calibrated", topBits,
    bits: o => Math.min(rule.topBits, surprisal(table!, o)),
  };
  return { rule, familyId, params: canon, table: table!, from: shipped ? "shipped" : "built", kind, seconds };
}

// ------------------------------------------------------------------------------------------------
// the profile of one tiered draw against its base
// ------------------------------------------------------------------------------------------------

export interface TierColumns {
  layout: TierLayout;
  addedTop: number;
  /** Base-only one-cell greedy to its end (it climbs the base draw's ordinal): bits on this rule's table, on the base's own table, and the difference. */
  baseAgent: number;
  baseAgentOwn: number;
  baseAgentLoss: number;
  /** The share of the tier's headroom those ends hold by accident. */
  accidental: number;
  /** Tier-aware one-cell greedy to its end: bits and headroom share. */
  tierAgent: number;
  tierShare: number;
}

export function tierColumns(full: RealRule, base: RealRule, sp: Space, b: Budget): TierColumns {
  const S = starts(sp, b.starts), ctx = context(sp.inst), f = family(full.familyId);
  const baseShape = f.shape(ctx, base.params), baseArity = baseShape.kind === "tuple" ? baseShape.arity : 1;
  const baseEnds = S.map(g => greedy(base.rule, sp, g, b.longSteps).boards.at(-1)!);
  const fullEnds = S.map(g => greedy(full.rule, sp, g, b.longSteps).boards.at(-1)!);
  const layout = tierLayout(tup(full.rule.score(S[0])).length, baseArity, tiersOf(full.params));
  const top = full.rule.topBits;
  const bitsOf = (g: GridValue) => full.rule.bits(full.rule.score(g));
  const share = (g: GridValue) => { const o = tup(full.rule.score(g)); return headroomShare(full.rule.bits(o), full.rule.bits(tierFloor(o, layout)), top); };
  const baseAgent = mean(baseEnds.map(bitsOf)), baseAgentOwn = mean(baseEnds.map(g => base.rule.bits(base.rule.score(g))));
  return {
    layout, addedTop: top - base.rule.topBits, baseAgent, baseAgentOwn, baseAgentLoss: baseAgentOwn - baseAgent,
    accidental: mean(baseEnds.map(share)), tierAgent: mean(fullEnds.map(bitsOf)), tierShare: mean(fullEnds.map(share)),
  };
}

export interface LiveReport extends Liveness { seconds: number; levels: number; topTier: [number[], number][] }

/**
 * Liveness of a gated or plain tiered draw (src/tiers/hybrid.ts `liveness`, the check `tierLiveness` runs), from the
 * hybrid analytic the family itself declares: no tier spec needed, so any tiered family is covered. Null for a draw
 * without a hybrid law (unlocked, or a base without disjoint units).
 */
export function liveOf(familyId: string, params: Params, inst: Instantiation, band?: { min: number; max: number }): LiveReport | null {
  const f = family(familyId), ctx = context(inst), canon = f.canonical(params, ctx);
  const a = analyticFor(familyId, canon, inst);
  if (!a || a.kind !== "hybrid") return null;
  const t0 = performance.now(), levels = a.levels as readonly (readonly [number[], number])[], seconds = (performance.now() - t0) / 1000;
  const baseShape = f.shape(ctx, baseParams(canon)), baseArity = baseShape.kind === "tuple" ? baseShape.arity : 1;
  const topTier = topTierOf(levels, baseArity);
  const arity = topTier[0][0].length, N = Math.sqrt(space(inst, "symbol").cells), S = space(inst, "symbol").S;
  const ev = evaluator({ familyId, params: canon }, inst), codec = objectType(inst.objectType).codec(inst);
  const law = { levels, topTier: topTier.map(([v, p]) => [arity === 1 ? v[0] : v, p] as const) } as unknown as HybridLaw;
  const live = liveness(law, N, S, board => tup(ev(codec.encode({ size: N, sym: board, col: new Uint8Array(board.length) } as GridValue))), band);
  return { ...live, seconds, levels: levels.length, topTier };
}

export interface VariantReport {
  id: string; family: string; params: Params; interaction?: string;
  report: RuleReport;
  table: { from: string; kind: string; seconds: number; levels: number; priorMean: number };
  tier?: TierColumns;
  live?: LiveReport | null;
  exact?: { how: string; boards: number; rows: TierError[]; maxError: number; missed: number } | null;
}

function exactOf(familyId: string, params: Params, inst: Instantiation, live: LiveReport | null | undefined): VariantReport["exact"] {
  const hook = EXACT_TOP[familyId];
  if (!hook || !live) return null;
  const e = hook(params, inst);
  if (!e) return null;
  const rows = calibrationError(live.topTier, e), errs = rows.filter(r => r.error !== null).map(r => r.error!);
  return { how: e.how, boards: e.boards, rows, maxError: errs.length ? Math.max(...errs) : NaN, missed: rows.filter(r => r.error === null).length };
}

export function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter(s => /[\p{L}\p{N}]/u.test(s)).length;
}

// ------------------------------------------------------------------------------------------------
// command line
// ------------------------------------------------------------------------------------------------

const BEGINNER_EIGHT = ["mirrormancer", "magic_eighteen", "opposite_nines", "two_pair", "spread_three", "strangers", "leapfrog", "crosswise_threes"];
const spread = <T>(xs: readonly T[], n: number): T[] => (xs.length <= n ? [...xs] : Array.from({ length: n }, (_, k) => xs[n === 1 ? xs.length - 1 : Math.round(k * (xs.length - 1) / (n - 1))]));
const key = (p: unknown) => JSON.stringify(p);

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const flag = (name: string) => argv.includes(`--${name}`);
  const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" }), ctx = context(inst);
  const sp = space(inst, "symbol"), budget = opt("budget") === "quick" ? QUICK_BUDGET : DEFAULT_BUDGET, dctx: Context = { sp, budget };
  const log = (s: string) => process.stderr.write(s + "\n");
  const only = opt("families")?.split(","), compose = (opt("compose") ?? "gated") as "gated" | "plain" | "unlock" | "uncapped";
  const depth = Number(opt("depth") ?? 1), limit = Number(opt("limit") ?? Infinity), pairLimit = Number(opt("pair-limit") ?? 2);
  const fams = FAMILIES.filter(f => f.tiered && f.objectType === inst.objectType && applicable(f, inst).ok && (!only || only.includes(f.id)));
  if (!fams.length) throw new Error("no family with tiers here");

  const draws = (f: (typeof FAMILIES)[number], c: typeof compose, d = depth) => {
    const seen = new Set<string>(), out: Params[] = [];
    for (const p of f.tiered!(ctx, d, c)) { const canon = f.canonical(p, ctx); if (!seen.has(key(canon))) { seen.add(key(canon)); out.push(canon); } }
    return out;
  };
  const byInteraction = (ps: readonly Params[]) => {
    const groups = new Map<string, Params[]>();
    for (const p of ps) { const id = `${key(baseParams(p))}|${tiersOf(p).map(t => t.id).join("+")}`; groups.set(id, [...(groups.get(id) ?? []), p]); }
    return [...groups.values()];
  };

  const variants: VariantReport[] = [], rules = new Map<string, RealRule>(), pairs: PairReport[] = [], gameReports: GameReport[] = [];
  const baseOf = new Map<string, RealRule>();
  const measure = (r: RealRule, base?: RealRule): VariantReport => {
    const report = measureRule(r.rule, dctx);
    const v: VariantReport = {
      id: r.rule.id, family: r.familyId, params: r.params, interaction: tiersOf(r.params).map(t => t.id).join("+") || undefined, report,
      table: { from: r.from, kind: r.kind, seconds: r.seconds, levels: r.table.levels.length, priorMean: priorMeanBits(r.table) },
    };
    if (base) {
      v.tier = tierColumns(r, base, sp, budget);
      v.live = liveOf(r.familyId, r.params, inst);
      if (v.live && Number.isNaN(v.table.seconds)) v.table.seconds = v.live.seconds;
      if (!flag("no-exact")) v.exact = exactOf(r.familyId, r.params, inst, v.live);
    }
    log(`${v.id}: top ${report.topBits.toFixed(1)} DIFF ${report.difficulty.toFixed(1)} K ${report.entangle.toFixed(1)} rate4 ${report.rate4.toFixed(2)} (${r.from} ${r.kind})`);
    return v;
  };
  const baseRule = (familyId: string, p: Params) => {
    const k = `${familyId}|${key(baseParams(p))}`;
    let b = baseOf.get(k);
    if (!b) { baseOf.set(k, b = realRule(familyId, baseParams(p), inst, { time: true })); rules.set(b.rule.id, b); variants.push(measure(b)); }
    return b;
  };

  const chosen: { r: RealRule; base: RealRule; paired: boolean }[] = [];
  if (!flag("no-profile")) for (const f of fams) for (const group of byInteraction(draws(f, compose))) {
    const picked = spread(group, limit), paired = new Set(spread(picked, pairLimit).map(key));
    for (const p of picked) {
      const base = baseRule(f.id, p), r = realRule(f.id, p, inst);
      rules.set(r.rule.id, r); variants.push(measure(r, base)); chosen.push({ r, base, paired: paired.has(key(p)) });
    }
  }

  let beginner: Rule[] = [];
  if (chosen.length && (!flag("no-pairs") || !flag("no-games"))) {
    beginner = BEGINNER_EIGHT.filter(id => FAMILIES.some(f => f.id === id) && applicable(family(id), inst).ok)
      .map(id => familyRule(id, familyParams(id, inst, 1)[0], inst));
    for (const b of beginner) measureRule(b, dctx);
    log(`beginner eight: ${beginner.map(b => b.id).join(", ")}`);
  }
  if (!flag("no-pairs")) {
    const done = new Set<string>();
    for (const { r, base, paired } of chosen) for (const x of paired ? [base, r] : []) {
      if (done.has(x.rule.id)) continue;
      done.add(x.rule.id);
      for (const b of beginner) pairs.push(measurePair(x.rule, b, dctx));
      log(`pairs ${x.rule.id}`);
    }
  }
  if (!flag("no-games")) for (const { r, base, paired } of chosen) if (paired) {
    gameReports.push(games(r.rule, base.rule, beginner, sp, Number(opt("games") ?? 40)));
    log(`games ${r.rule.id}`);
  }

  // The composition comparison: the family's compare values under gated, plain and unlock.
  const comparison: CompareRow[] = [];
  if (flag("compare")) for (const f of fams) {
    const same = (a: Params, b: Params) => key(tiersOf(a).map(({ gate: _g, compose: _c, ...v }) => v)) === key(tiersOf(b).map(({ gate: _g, compose: _c, ...v }) => v)) && key(baseParams(a)) === key(baseParams(b));
    const gated = draws(f, "uncapped", 1), unlock = draws(f, "unlock", 1);
    for (const plain of draws(f, "plain", 1)) {
      const base = baseRule(f.id, plain), S = starts(sp, budget.starts);
      const baseEnds = S.map(g => greedy(base.rule, sp, g, budget.longSteps).boards.at(-1)!);
      const own = mean(baseEnds.map(g => base.rule.bits(base.rule.score(g))));
      const baseReport = variants.find(v => v.id === base.rule.id)!;
      comparison.push({ value: label(plain).replace("@plain", ""), compose: "base", id: base.rule.id, rate4: baseReport.report.rate4, priorMean: baseReport.table.priorMean,
        top: baseReport.report.topBits, difficulty: baseReport.report.difficulty, tierAgent: NaN, baseAgent: own, baseAgentOwn: own, loss: 0,
        chars: base.rule.source.length, sentences: sentenceCount(f.summary(base.params, ctx)), source: `${base.from} ${base.kind}`, seconds: base.seconds, levels: base.table.levels.length });
      for (const [how, p] of [["gated", gated.find(g => same(g, plain))], ["plain", plain], ["unlock", unlock.find(u => same(u, plain))]] as const) {
        if (!p) continue;
        const r = realRule(f.id, p, inst, { time: true }), report = measureRule(r.rule, dctx), t = tierColumns(r, base, sp, budget);
        comparison.push({ value: label(plain).replace("@plain", ""), compose: how, id: r.rule.id, rate4: report.rate4, priorMean: priorMeanBits(r.table), top: report.topBits,
          difficulty: report.difficulty, tierAgent: t.tierAgent, baseAgent: t.baseAgent, baseAgentOwn: t.baseAgentOwn, loss: t.baseAgentLoss,
          chars: r.rule.source.length, sentences: sentenceCount(f.summary(r.params, ctx)), source: `${r.from} ${r.kind}`, seconds: r.seconds, levels: r.table.levels.length });
        log(`compare ${r.rule.id}: top ${report.topBits.toFixed(1)} rate4 ${report.rate4.toFixed(2)} loss ${t.baseAgentLoss.toFixed(1)}`);
      }
    }
  }

  // The liveness sweep: every value of a tier param, dealt or not.
  const sweep: SweepRow[] = [];
  for (const part of (opt("sweep") ?? "").split(";").filter(Boolean)) {
    const m = /^(\w+):(\w+)=(-?\d+)\.\.(-?\d+)$/.exec(part.trim());
    if (!m) throw new Error(`--sweep wants "interaction:param=lo..hi", got ${part}`);
    const [, id, param, lo, hi] = m;
    for (const f of fams) {
      const dealt = draws(f, "gated", 1), lab = draws(f, "uncapped", 1).filter(p => !dealt.some(d => key(d) === key(p)));
      const template = dealt.find(p => tiersOf(p)[0].id === id);
      if (!template) continue;
      const seen = new Map<string, number[]>();
      for (let x = Number(lo); x <= Number(hi); x++) {
        const p = f.canonical({ ...template, tiers: [{ ...tiersOf(template)[0], [param]: x }] }, ctx), k = key(p);
        if (seen.has(k)) { seen.get(k)!.push(x); continue; }
        seen.set(k, [x]);
      }
      for (const [k, xs] of seen) {
        const p = JSON.parse(k) as Params;
        const status = dealt.some(d => key(d) === k) ? "dealt" : lab.some(d => key(d) === k) ? "lab" : "not dealt";
        let live: LiveReport | null = null, error = "";
        try { live = liveOf(f.id, p, inst); } catch (e) { error = String((e as Error).message ?? e); }
        const exact = live && !flag("no-exact") ? exactOf(f.id, p, inst, live) : null;
        const baseTop = live ? -(analyticFor(f.id, f.canonical(baseParams(p), ctx), inst)?.levels.at(-1)?.[1] ?? NaN) : NaN;
        sweep.push({ family: f.id, interaction: id, param, values: xs, status, live, error, exactMax: exact ? exact.maxError : NaN, exactMissed: exact ? exact.missed : 0,
          exactAdded: exact ? exact.rows[exact.rows.length - 1].exact : NaN, exactTop: exact ? exact.rows[exact.rows.length - 1].tier : NaN, baseTop });
        log(`sweep ${f.id} ${id} ${param}=${xs.join("~")}: ${status} ${live ? `${live.tierMin}–${live.tierTop} +${live.addedBits.toFixed(1)} ${live.problems.join("; ")}` : error}`);
      }
    }
  }

  const md = markdown({ variants, pairs, gameReports, beginner: beginner.map(b => b.id), comparison, sweep, compose, budget: budget === QUICK_BUDGET ? "quick" : "default" });
  console.log(md);
  if (opt("markdown")) writeFileSync(opt("markdown")!, md);
  if (opt("json")) writeFileSync(opt("json")!, JSON.stringify({ instance: inst.key, compose, variants, pairs, games: gameReports, comparison, sweep },
    (_, v) => (v === Infinity ? "inf" : typeof v === "number" && Number.isNaN(v) ? null : v), 2) + "\n");
}

interface CompareRow {
  value: string; compose: string; id: string; rate4: number; priorMean: number; top: number; difficulty: number; tierAgent: number;
  baseAgent: number; baseAgentOwn: number; loss: number; chars: number; sentences: number; source: string; seconds: number; levels: number;
}
interface SweepRow {
  family: string; interaction: string; param: string; values: number[]; status: string; live: LiveReport | null; error: string;
  exactMax: number; exactMissed: number; exactAdded: number; exactTop: number; baseTop: number;
}

const f = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "–" : Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "∞" : "–");

export function markdown(r: { variants: VariantReport[]; pairs: PairReport[]; gameReports: GameReport[]; beginner: string[]; comparison: CompareRow[]; sweep: SweepRow[]; compose: string; budget: string }): string {
  const out: string[] = [];
  const tiered = r.variants.filter(v => v.tier);
  if (r.variants.length) {
    out.push(`### Profile (${r.compose} draws, ${r.budget} budget)`, "",
      "| variant | table | levels | build s | top | +top | prior mean | rate4 | g10 | g20 | trap | gap | esc2 | K | **DIFF** | base agent | accidental | tier agent | tier share |",
      "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
      ...r.variants.map(v => {
        const q = v.report, t = v.tier;
        return `| ${v.id} | ${v.table.from} ${v.table.kind} | ${v.table.levels} | ${f(v.table.seconds)} | ${f(q.topBits)} | ${t ? f(t.addedTop) : ""} | ${f(v.table.priorMean, 2)} | ${f(q.rate4, 2)} | ${f(q.greedy10)} | ${f(q.greedy20)} | ${f(q.trap, 2)} | ${f(q.gap, 2)} | ${f(q.escape2, 2)} | ${f(q.entangle)} | **${f(q.difficulty)}** | ${t ? f(t.baseAgent) : ""} | ${t ? f(t.accidental, 2) : ""} | ${t ? f(t.tierAgent) : ""} | ${t ? f(t.tierShare, 2) : ""} |`;
      }), "");
  }
  if (tiered.some(v => v.live)) {
    out.push("### Liveness at the base's top (hybrid law)", "",
      "| variant | tier min | tier top | share at top | added bits | degenerate boards | problems |", "|---|--:|--:|--:|--:|---|---|",
      ...tiered.filter(v => v.live).map(v => `| ${v.id} | ${key(v.live!.tierMin)} | ${key(v.live!.tierTop)} | ${v.live!.shareAtTop.toExponential(2)} | ${f(v.live!.addedBits)} | ${v.live!.degenerate.length ? `${v.live!.degenerate.length} (${v.live!.degenerate[0]})` : "none"} | ${v.live!.problems.join("; ") || "alive"} |`), "");
  }
  if (tiered.some(v => v.exact)) {
    out.push("### Calibration error against the exact law at the base's top", "",
      "Bits of P(tier ≥ i | base at its top): hybrid / exact, at every tier level the exact law has (– : the hybrid never saw the level).", "",
      "| variant | boards | levels: tier hybrid/exact | max error (bits) | levels missed |", "|---|--:|---|--:|--:|",
      ...tiered.filter(v => v.exact).map(v => `| ${v.id} | ${v.exact!.boards.toExponential(0)} | ${v.exact!.rows.map(x => `${x.tier}: ${f(x.hybrid, 2)}/${f(x.exact, 2)}`).join(", ")} | ${f(v.exact!.maxError, 2)} | ${v.exact!.missed} |`), "");
  }
  if (r.pairs.length) {
    out.push(`### Synergy SYN (ceiling) with the beginner eight`, "",
      `| variant | ${r.beginner.join(" | ")} | mean SYN |`, `|---|${r.beginner.map(() => "--:").join("|")}|--:|`);
    for (const a of [...new Set(r.pairs.map(p => p.a))]) {
      const row = r.beginner.map(b => r.pairs.find(p => p.a === a && p.b === b)!);
      out.push(`| ${a} | ${row.map(p => `${f(p.difficulty, 0)} (${f(p.ceiling, 2)})`).join(" | ")} | ${f(mean(row.map(p => p.difficulty)))} |`);
    }
    out.push("");
  }
  if (r.gameReports.length) out.push("### Three-player games", "",
    "Seat 0 is dealt the variant, the other two seats a random pair of the beginner eight; same seeds, seat 0 playing the base only or the whole rule.", "",
    "| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |", "|---|--:|--:|--:|--:|--:|--:|",
    ...r.gameReports.map(g => `| ${g.id} | ${g.games} | ${f(g.winBase, 2)} | ${f(g.winTier, 2)} | ${f(g.ownBase)} | ${f(g.ownTier)} | ${f(g.payRatio, 2)} |`), "");
  if (r.comparison.length) out.push("### Composition comparison", "",
    "| value | composition | rate4 | prior mean | top | DIFF | tier agent @48 | base-only @48 on this table | base-only @48 on the base table | base-only loses | card chars | summary sentences | table | levels | build s |",
    "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|--:|--:|",
    ...r.comparison.map(c => `| ${c.value} | ${c.compose} | ${f(c.rate4, 2)} | ${f(c.priorMean, 2)} | ${f(c.top)} | ${f(c.difficulty)} | ${f(c.tierAgent)} | ${f(c.baseAgent)} | ${f(c.baseAgentOwn)} | ${f(c.loss)} | ${c.chars} | ${c.sentences} | ${c.source} | ${c.levels} | ${f(c.seconds)} |`), "");
  if (r.sweep.length) out.push("### Liveness sweep", "",
    "| family | interaction | value(s) | status | tier min–top | share at top | added bits (hybrid) | added bits (exact) | tier top (exact) | max error (bits) | hybrid s | problems |",
    "|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|---|",
    ...r.sweep.map(s => `| ${s.family} | ${s.interaction} | ${s.param} = ${s.values.join(", ")} | ${s.status} | ${s.live ? `${key(s.live.tierMin)}–${key(s.live.tierTop)}` : "–"} | ${s.live ? s.live.shareAtTop.toExponential(2) : "–"} | ${s.live ? f(s.live.addedBits) : "–"} | ${f(s.exactAdded)} | ${f(s.exactTop, 0)} | ${f(s.exactMax, 2)}${s.exactMissed ? ` (${s.exactMissed} missed)` : ""} | ${s.live ? f(s.live.seconds) : "–"} | ${s.live ? s.live.problems.join("; ") || "alive" : s.error} |`), "");
  return out.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
