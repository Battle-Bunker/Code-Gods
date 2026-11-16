/**
 * What would make a line rarer (docs/engine-v2/annotations-design.md §5; owner decision 23): the price/bits frontier of
 * single moves. Calls are tried in ascending code length, priced with their real price, valued by the rule's value
 * function on the new utility, and kept when they raise the bits: the cheapest such move, then the cheapest that is
 * worth more than every cheaper one. Each comes with its own words, the new values of the rule's quantities and its new
 * bits. Computed in the browser for the viewer's own rule only.
 */
import {
  applyPriced, compareScores, evaluateObject, isInvalid, variantMutators, type Call, type Mutator, type ObjectType, type Price, type Score,
} from "@workspace/v2-core";
import type { RuleRef } from "./annotate.ts";
import { changesBetween, contributors } from "./contributors.ts";
import { candidateArgs, DEFAULT_BUDGET, type ImproveBudget } from "./improve.ts";
import { chipRep, repText } from "./rep-view.tsx";
import { typesetNumbers } from "./format.ts";

export interface Move<S> {
  readonly call: Call;
  /** The move in words: "move the line down 1"; "change the equation to y = 6x + 24" where its own words name a letter. */
  readonly words: string;
  readonly price: Price;
  readonly after: S;
  readonly utility: Score;
  /** The line's bits after the move; null without the rule's value function (then moves are ranked by utility). */
  readonly bits: number | null;
  /** What it does to the rule's quantities: "y-intercept 25 → 24", "the prime 23 → 7". */
  readonly changes: readonly string[];
  /** The line after the move, written: "y = 6x + 24". */
  readonly text: string;
  /** Why it is listed: "the cheapest for the main part", "the cheapest for the tie-breaker", "the most rarity per energy". */
  readonly reason: string;
}

export interface MovesOptions {
  /** How many moves on the frontier (default 3). */
  readonly k?: number;
  readonly budget?: ImproveBudget;
}

/** A move's own words, unless they name a coefficient letter of the general form ("add −1 to b"). */
function wordsOf<S>(type: ObjectType<S>, m: Mutator<unknown, unknown>, args: unknown, after: S): string {
  // The mutator says its numbers plainly ("by 1/2", "-3"): typeset them as every other number ("by ½", "−3").
  const d = typesetNumbers(m.describe(args));
  return /\b(to|from|of) [abc]\b/.test(d) ? `change the equation to ${repText(type, after, chipRep(type, after))}` : d;
}

export function moves<S, P>(rule: RuleRef<S, P>, state: S, value: ((u: Score) => number) | null | undefined, opts: MovesOptions = {}): Move<S>[] {
  const { type, family, params, variant, tieBreaker } = rule;
  const budget = opts.budget ?? DEFAULT_BUDGET;
  // The object's score (its utilities); a multi-site object has none yet, and one site's never stands for it.
  const utilOf = (s: S): Score => evaluateObject(type, family, params, s, variant, tieBreaker).score;
  const u0 = utilOf(state);
  if (type.sites(state, variant) !== 1) value = null;
  const before = value ? value(u0) : null;
  // Better: more bits; without a value function, a better utility (lexicographic).
  const better = (u: Score, bits: number | null, than: { utility: Score; bits: number | null }) =>
    bits !== null && than.bits !== null ? bits > than.bits + 1e-9 : compareScores(u, than.utility) > 0;
  const ms = variantMutators(type as ObjectType<unknown>, variant);
  const k = type.sites(state, variant);
  const cands: { m: Mutator<unknown, unknown>; site: number; a: unknown; base: number }[] = [];
  for (const m of ms) {
    const code = m.args(variant);
    const args = candidateArgs(code as never, `moves:${variant.id}:${m.id}`, budget);
    for (let site = 0; site < (m.perSite ? k : 1); site++) for (const a of args) cands.push({ m, site, a, base: code.bits(a) });
  }
  cands.sort((x, y) => x.base - y.base);
  const found: Omit<Move<S>, "changes" | "words" | "text" | "reason">[] = [];
  const meta = new Map<object, { m: Mutator<unknown, unknown>; a: unknown }>();
  const want = opts.k ?? 3;
  let tried = 0;
  for (const c of cands) {
    if (tried >= budget.evaluations) break;
    // Enough of the frontier is found and every later call costs at least as much as its last move.
    // (A move for the main part, when one exists, is worth the search: the varied list leads with it.)
    if (found.length >= want && found.some(f => compareScores(f.utility === null ? null : [f.utility[0] ?? null], u0 === null ? null : [u0[0] ?? null]) > 0)) {
      const f = frontierOf(found, better);
      if (f.length >= want && c.base >= f[want - 1]!.price.total) break;
    }
    const r = applyPriced(type as ObjectType<unknown>, variant, state, c.m, c.site, c.a);
    if (isInvalid(r)) continue;
    tried++;
    const after = r.result as S;
    const utility = utilOf(after);
    const bits = value ? value(utility) : null;
    if (!better(utility, bits, { utility: u0, bits: before })) continue;
    const call: Call = { mutator: c.m.id, site: c.site, args: c.m.args(variant).encode(c.a) as Record<string, string> };
    const f = { call, price: r.price, after, utility, bits };
    meta.set(f, { m: c.m, a: c.a });
    found.push(f);
  }
  const was = contributors(rule, state).parts;
  return varied(found, u0, before, want, f => meta.get(f)!.m.id, better).map(({ f, reason }) => {
    const { m, a } = meta.get(f)!;
    const changes = changesBetween(was, contributors(rule, f.after).parts);
    return { ...f, words: wordsOf(type, m, a, f.after), changes, text: repText(type, f.after, chipRep(type, f.after)), reason };
  });
}

/**
 * A varied list (coordinator, from real games: three "multiply every output by 4, 16, 64"): the cheapest move that
 * improves the main part, the cheapest that improves the tie-breaker without hurting the main part, then the most
 * rarity per energy; at most one move of each kind; filled from the price/bits frontier if short.
 */
function varied<F extends Found>(all: readonly F[], u0: Score, before: number | null, want: number, kindOf: (f: F) => string,
  better: (u: Score, bits: number | null, than: Found) => boolean): { f: F; reason: string }[] {
  // A move no player could pay for in a game (a game hands out thousands of energy) is noise, not a way forward.
  const affordable = all.filter(f => f.price.total <= MAX_MOVE_PRICE);
  const found = affordable.length ? affordable : all;
  const byPrice = [...found].sort((a, b) => a.price.total - b.price.total || (b.bits ?? 0) - (a.bits ?? 0));
  const part = (u: Score, i: number): Score => (u === null ? null : [u[i] ?? null]);
  const improves = (f: F, i: number) => compareScores(part(f.utility, i), part(u0, i)) > 0;
  const keeps = (f: F, i: number) => compareScores(part(f.utility, i), part(u0, i)) >= 0;
  const out: { f: F; reason: string }[] = [];
  const kinds = new Set<string>();
  const take = (f: F | undefined, reason: string) => {
    if (!f || out.length >= want || out.some(o => o.f === f) || kinds.has(kindOf(f))) return;
    out.push({ f, reason });
    kinds.add(kindOf(f));
  };
  take(byPrice.find(f => improves(f, 0)), "the cheapest for the main part");
  take(byPrice.find(f => !kinds.has(kindOf(f)) && keeps(f, 0) && improves(f, 1)), "the cheapest for the secondary preference");
  if (before !== null) {
    const perEnergy = (f: F) => ((f.bits ?? before) - before) / Math.max(f.price.total, 1e-9);
    // One move for this reason: the best value that is not already listed (or of a kind already listed).
    take([...found].sort((a, b) => perEnergy(b) - perEnergy(a)).find(f => !out.some(o => o.f === f) && !kinds.has(kindOf(f))), "the most rarity per energy");
  }
  const fill = ["rarer still", "rarer again", "rarest on offer"];
  for (const f of frontierOf(found, better)) take(f, fill[out.filter(o => fill.includes(o.reason)).length] ?? "rarer again");
  return out;
}

type Found = { price: Price; utility: Score; bits: number | null };
/** The dearest move worth listing, in energy: far beyond what a game hands out (the gallery listed one at 2.1 × 10²² energy). */
export const MAX_MOVE_PRICE = 1e6;
/** The frontier: cheapest first; each later move worth more than every cheaper one. */
function frontierOf<F extends Found>(found: readonly F[], better: (u: Score, bits: number | null, than: Found) => boolean): F[] {
  const sorted = [...found].sort((a, b) => a.price.total - b.price.total || (b.bits ?? 0) - (a.bits ?? 0) || compareScores(b.utility, a.utility));
  const frontier: F[] = [];
  for (const f of sorted) if (!frontier.length || better(f.utility, f.bits, frontier[frontier.length - 1]!)) frontier.push(f);
  return frontier;
}
