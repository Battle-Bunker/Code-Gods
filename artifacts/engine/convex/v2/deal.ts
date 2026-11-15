/**
 * The deal (spec §7.6, integration plan §4.3): which rule each seat holds. A dealt rule is a family's main layer plus
 * one of its tie-breakers, with parameters from the family's dealable grid, and is dealt only when it has a value
 * function (owner decision 23). Pure: the lobby (ops/game.ts) persists the result.
 *
 * Rotation (copied and cleaned from v1's lib/dealRotation.ts, docs/beginner-pool.md §6): when a room plays again with
 * the same players and the same deal key, the last game's rules pass one seat along, so over as many games as there
 * are players everyone holds each seat's rule once (when the pool is smaller than the seats, some seats share a rule);
 * then the next game is dealt afresh. A deal made with winning bids never
 * rotates and never continues a rotation.
 *
 * Practice games (one human, every other seat a practice partner; the coordinator's call (b), provisional) are dealt
 * so the human is not the odd one out (`practiceDeal`), by the agents session's pair verdicts; the games after it rotate
 * those rules like any room's (playtest round 9: v1's rotation).
 *
 * Seating (grids; the coordinator's calls following owner decision 39, lib/v2-grid seating.ts): every grid deal (fresh,
 * practice, and the rest of a bid deal) is the seed's first shuffle with no forbidden pair and no aligned pair, else the
 * one with the lowest seating cost (forbidden pairs first, then aligned ones) over SEATING_TRIES shuffles. A deal on any
 * other object type is the first shuffle, as before. The game records the pairs left (`seating` in tables.ts).
 */
import { canonicalJson, hashHex, rng, ruleLayers, type Rng, type RuleFamily } from "@workspace/v2-core";
import type { BidDealer } from "@workspace/v2-economy";
import { hasStarters, pairPmi, pairVerdict, unopposedDirections, type PairVerdict, type UnopposedDirection } from "@workspace/v2-agents/pure";
import { findVariant, objectTypes, ruleKey } from "@workspace/v2-valuation";
import { gridAlignedPairs, gridClashes, gridSeatingCost } from "@workspace/v2-grid";
import { lineClashes, lineSeatingCost, type SeatedRule } from "@workspace/v2-linear";
import { measuredToBits, valueRecord } from "./values.ts";
import type { Preset } from "./presets.ts";

/** A rule as dealt: enough to evaluate it (family, params, tie-breaker) and to find its value function. */
export interface DealtRule { family: string; params: unknown; tieBreaker: string | null; ruleKey: string; contentHash: string }

/** Every object type's families, by id (ids are unique across types: test/unit/v2-deal.test.ts checks it). */
const FAMILIES = new Map<string, RuleFamily<unknown, unknown>>(objectTypes.flatMap(t => t.families).map(f => [f.id, f as unknown as RuleFamily<unknown, unknown>]));
export function familyOf(id: string): RuleFamily<unknown, unknown> {
  const f = FAMILIES.get(id);
  if (!f) throw new Error(`Unknown rule family ${id}`);
  return f;
}

const pools = new Map<string, DealtRule[]>();
/**
 * Every rule the preset may deal: its pool's (family, parameters, tie-breaker) with a value function (decision 23)
 * and shipped starters (a player, or a practice partner, must be able to summon one: integration plan §5.2).
 */
export function dealablePool(preset: Preset): DealtRule[] {
  let pool = pools.get(preset.id);
  if (!pool) pools.set(preset.id, pool = buildPool(preset));
  return pool;
}
function buildPool(preset: Preset): DealtRule[] {
  const { type, variant } = findVariant(preset.variant);
  const out: DealtRule[] = [];
  for (const r of preset.pool) {
    if (!FAMILIES.has(r.family) || !hasStarters(r.family)) continue;
    for (const tb of r.tieBreakers) {
      const key = ruleKey(type, variant, r.family, r.params, tb ?? "none");
      const vf = valueRecord(key);
      if (vf) out.push({ family: r.family, params: r.params, tieBreaker: tb, ruleKey: key, contentHash: vf.contentHash });
    }
  }
  return out;
}

/**
 * Whether a preset can be played now: at least one of its rules has a value function (decision 23). A preset whose
 * value functions have not landed yet (a new object type) is withheld: not listed, and refused by room.create and
 * room.settings.
 */
export const playable = (preset: Preset): boolean => dealablePool(preset).length > 0;

/** What starts a fresh deal when it changes: the preset's variant and its pool. */
export function dealKeyOf(preset: Preset, pool: readonly DealtRule[]): string {
  return hashHex(canonicalJson({ variant: preset.variant, pool: pool.map(r => r.ruleKey) }));
}

/**
 * A fresh deal for `seats` seats from `pool`: a seeded shuffle, dealt in order, so seats hold different rules while
 * the pool lasts (the pool is reused from its start when there are more seats than rules).
 */
export function freshDeal(pool: readonly DealtRule[], seats: number, seed: string, variant?: string): DealtRule[] {
  return dealFrom(pool, seats, dealRng(seed), variant ? rules => seatingCost(variant, rules) : undefined);
}

/**
 * Whether a variant has a seating rule (grids: lib/v2-grid seating.ts, by family; lines: lib/v2-linear seating.ts, by
 * family and dealt parameters).
 */
export const hasSeatingRule = (variant: string): boolean => ["grid", "line"].includes(findVariant(variant).type.id);
const isGrid = (variant: string) => findVariant(variant).type.id === "grid";
const familiesOf = (rules: readonly SeatedRule[]) => rules.map(r => r.family);
/** The pairs of seated rules a variant's seating rule forbids; none where it has none. */
export function seatingClashes(variant: string, rules: readonly SeatedRule[]): string[] {
  return !hasSeatingRule(variant) ? [] : isGrid(variant) ? gridClashes(familiesOf(rules)) : lineClashes(rules);
}
/** The aligned (allowed but avoided) pairs among seated rules; none where the variant has no seating rule. */
export function seatingAligned(variant: string, rules: readonly SeatedRule[]): string[] {
  return hasSeatingRule(variant) && isGrid(variant) ? gridAlignedPairs(familiesOf(rules)) : [];
}
/** A table's seating cost (forbidden pairs, then aligned ones); 0 where the variant has no seating rule. */
export function seatingCost(variant: string, rules: readonly SeatedRule[]): number {
  return !hasSeatingRule(variant) ? 0 : isGrid(variant) ? gridSeatingCost(familiesOf(rules)) : lineSeatingCost(rules);
}
/** Shuffles a seating rule may draw before it settles for the deal with the fewest clashes. */
const SEATING_TRIES = 200;
/** The deal's random stream for a game seed: the fresh deal and the bid dealer draw from the same one. */
export const dealRng = (seed: string): Rng => rng(seed, "deal");
/**
 * A fresh deal drawn from `r` (the coordinator's rule): the families in a seeded random order, so each family is equally
 * likely whatever the number of its (parameters, tie-breaker) entries, and no family twice at a table while the pool
 * has families enough (they are reused, in the same order, only beyond that); each seat gets one of its family's
 * entries uniformly. With `clashes` (the seating rule's cost of the dealt families), the first draw costing 0, else the
 * cheapest.
 */
export function dealFrom(pool: readonly DealtRule[], seats: number, r: Rng, clashes?: (rules: readonly DealtRule[]) => number): DealtRule[] {
  if (pool.length === 0) throw new Error("No rule of this preset is dealable (none has a value function): nothing can be dealt");
  const byFamily = new Map<string, DealtRule[]>();
  for (const x of pool) byFamily.set(x.family, [...(byFamily.get(x.family) ?? []), x]);
  const families = [...byFamily.keys()];
  let best: DealtRule[] | undefined, fewest = Infinity;
  for (let t = 0; t < (clashes ? SEATING_TRIES : 1); t++) {
    const order = [...families];
    for (let i = order.length - 1; i > 0; i--) {
      const j = r.below(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const deal = Array.from({ length: seats }, (_, i) => { const entries = byFamily.get(order[i % order.length]!)!; return entries[r.below(entries.length)]!; });
    const n = clashes ? clashes(deal) : 0;
    if (n < fewest) { best = deal; fewest = n; }
    if (n === 0) break;
  }
  return best!;
}

/** Who holds a seat. */
export type SeatKind = "human" | "practice" | "ai";
/** A practice game: one human, and every other seat a practice partner. Any other room gets the plain deal. */
export const isPracticeGame = (kinds: readonly SeatKind[]): boolean =>
  kinds.length > 1 && kinds.filter(k => k === "human").length === 1 && kinds.every(k => k !== "ai");

/** Seeded deals a practice deal draws before it settles for the first (a pool too small to satisfy it). */
const PRACTICE_TRIES = 200;
/** Two dealt rules' verdict (lib/v2-agents compat.gen.ts); the same rule shares its own goal. */
function verdictOf(variant: string, a: DealtRule, b: DealtRule): PairVerdict | undefined {
  return a.ruleKey === b.ruleKey ? "compatible" : pairVerdict(variant, `${a.family}/${a.tieBreaker}`, `${b.family}/${b.tieBreaker}`);
}
/**
 * Whether a practice deal leaves the human (seat `h`) in company: compatible with at least one partner, and no two
 * partners compatible with each other while both conflict with the human.
 */
export function practiceFits(variant: string, deal: readonly DealtRule[], h: number): boolean {
  const human = deal[h]!, partners = deal.filter((_, i) => i !== h);
  if (!partners.some(p => verdictOf(variant, human, p) === "compatible")) return false;
  return !partners.some((p, i) => partners.some((q, j) => i !== j && verdictOf(variant, p, q) === "compatible"
    && verdictOf(variant, human, p) === "conflict" && verdictOf(variant, human, q) === "conflict"));
}
/**
 * A practice game's deal (playtest round 21: redrawing whole tables until they fit skewed the human's family, so
 * Smooth Intercept took 21.5% of practice games and Prime Staircase 0.6%). The human's family is drawn uniformly over
 * the pool's families and one of its entries uniformly; the partners are then drawn from the other families (the
 * seating rule counted with the human seated): the first of PRACTICE_TRIES draws that fits (`practiceFits`), or the
 * first draw when none does. Reproducible from the seed.
 */
export function practiceDeal(pool: readonly DealtRule[], kinds: readonly SeatKind[], seed: string, variant: string): DealtRule[] {
  const r = dealRng(seed), h = kinds.indexOf("human");
  const [human] = dealFrom(pool, 1, r);
  const others = pool.filter(x => x.family !== human!.family);
  const rest = others.length ? others : pool;
  const seat = (partners: readonly DealtRule[]) => [...partners.slice(0, h), human!, ...partners.slice(h)];
  let first: DealtRule[] | undefined;
  for (let i = 0; i < PRACTICE_TRIES; i++) {
    const deal = seat(dealFrom(rest, kinds.length - 1, r, partners => seatingCost(variant, seat(partners))));
    first ??= deal;
    if (practiceFits(variant, deal, h)) return deal;
  }
  return first!;
}

// ---------------------------------------------------------------- the dealing trial, step 2 (logging only)

/** A pair the W table has not read counts as this much PMI, in bits (the spec lead's policy). */
export const MISSING_PMI = 1.5;
/** Seeded candidate tables the policy weighs (v1's fair-aligned dealer: the best of 32). */
export const POLICY_CANDIDATES = 32;
const ruleId = (r: DealtRule) => `${r.family}/${r.tieBreaker}`;

/**
 * v1's fair-aligned score of a table on the W table (lib/v2-agents pairPmi, depth-averaged PMI in bits): the mean
 * pairwise W minus the spread of each seat's mean W to the rest of the table; a missing pair counts MISSING_PMI.
 */
export function fairAlignedScore(variant: string, deal: readonly DealtRule[]): number {
  const n = deal.length;
  if (n < 2) return 0;
  const w = (a: DealtRule, b: DealtRule) => pairPmi(variant, ruleId(a), ruleId(b))?.pmi ?? MISSING_PMI;
  let pairSum = 0;
  const perSeat = deal.map((a, i) => deal.reduce((t, b, j) => (j === i ? t : t + w(a, b)), 0) / (n - 1));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairSum += w(deal[i]!, deal[j]!);
  const mean = pairSum / (n * (n - 1) / 2), avg = perSeat.reduce((t, x) => t + x, 0) / n;
  return mean - Math.sqrt(perSeat.reduce((t, x) => t + (x - avg) ** 2, 0) / n);
}

/** What the policy would have dealt, and why (stored on the game; the deal itself is unchanged until the coordinator turns it on). */
export interface PolicyChoice {
  wouldDeal: string[];
  unopposed: UnopposedDirection[];
  score: number;
  /** Why the choice is not a qualifying table: no W table for the variant (the lottery), or none of the candidates qualified. */
  fallback?: string;
}

/**
 * The dealing trial's step 2 (the spec lead's policy, logging only): POLICY_CANDIDATES seeded tables (the seating rule
 * honoured; in a practice game, tables that leave the human in company first). A table qualifies with no strong
 * unopposed shared direction and at most one weak; among those, the fewest unopposed directions, ties to the higher
 * fair-aligned score. None qualifying: the best by the same order, with the reason. No W table: the lottery's first.
 * Drawn from its own stream, so the real deal is untouched.
 */
export function policyDeal(pool: readonly DealtRule[], kinds: readonly SeatKind[], seed: string, variant: string): PolicyChoice {
  const r = rng(seed, "deal-policy"), h = kinds.indexOf("human"), practice = isPracticeGame(kinds);
  const candidates = Array.from({ length: POLICY_CANDIDATES }, () => dealFrom(pool, kinds.length, r, rules => seatingCost(variant, rules)));
  const fits = practice ? candidates.filter(d => practiceFits(variant, d, h)) : candidates;
  const tables = fits.length ? fits : candidates;
  const ids = [...new Set(pool.map(ruleId))];
  const measured = ids.some((a, i) => ids.some((b, j) => j > i && pairPmi(variant, a, b) !== null));
  const shaped = tables.map(deal => {
    const unopposed = unopposedDirections(variant, deal.map(ruleId));
    const strong = unopposed.filter(u => u.strength === "strong").length, weak = unopposed.length - strong;
    return { deal, unopposed, strong, weak, score: measured ? fairAlignedScore(variant, deal) : 0 };
  });
  const pick = (cs: typeof shaped) => cs.reduce((best, c) => (c.unopposed.length < best.unopposed.length || (c.unopposed.length === best.unopposed.length && c.score > best.score) ? c : best));
  const out = (c: typeof shaped[number], fallback?: string): PolicyChoice =>
    ({ wouldDeal: c.deal.map(x => x.ruleKey), unopposed: c.unopposed, score: c.score, ...(fallback ? { fallback } : {}) });
  if (!measured) return out(shaped[0]!, `no W table for ${variant}: the lottery`);
  const qualifying = shaped.filter(c => c.strong === 0 && c.weak <= 1);
  if (qualifying.length) return out(pick(qualifying), practice && !fits.length ? "no table left the human in company" : undefined);
  const best = shaped.reduce((b, c) => (c.strong < b.strong || (c.strong === b.strong && c.weak < b.weak) || (c.strong === b.strong && c.weak === b.weak && c.score > b.score) ? c : b));
  return out(best, `none of ${shaped.length} tables had no strong and at most one weak unopposed direction`);
}

/**
 * The dealer as the bid mechanism reaches it (lib/v2-economy dealWithBids): a winner is dealt one of their family's
 * dealable rules; everybody else is dealt fresh from the rules of the families nobody won, from the same stream, so
 * a phase with no bids deals exactly what the plain deal would.
 */
export function bidDealer(pool: readonly DealtRule[], variant?: string): BidDealer<DealtRule> {
  return {
    dealFamily(family, r) {
      const rules = pool.filter(x => x.family === family);
      if (!rules.length) throw new Error(`No dealable rule of ${family}`);
      return rules[r.below(rules.length)]!;
    },
    dealRest(count, excluded, r) {
      const left = pool.filter(x => !excluded.includes(x.family));
      // The won families are seated too: the seating rule counts their clashes with the rest (by family: their dealt
      // parameters are drawn apart, so a line rule's parameter clash with a won seat is not seen here).
      return dealFrom(left, count, r, variant ? rules => seatingCost(variant, [...excluded.map(family => ({ family })), ...rules]) : undefined);
    },
  };
}

/**
 * The families on offer in a bid phase: each with its card and the rarity bits at the furthest measured knot of its
 * rules' value curves (rounded to 0.1): a scale for the bid, not a ceiling (owner decision 26: rarer scores keep rising).
 */
export function offers(pool: readonly DealtRule[]) {
  const out: { family: string; title: string; card: string; top: number }[] = [];
  for (const id of [...new Set(pool.map(r => r.family))]) {
    const rules = pool.filter(r => r.family === id), f = familyOf(id);
    const top = Math.max(...rules.map(r => { const vf = valueRecord(r.ruleKey); return vf ? measuredToBits(vf) : 0; }));
    out.push({ family: id, title: f.title, card: f.card(rules[0]!.params, null), top: Math.round(top * 10) / 10 });
  }
  return out;
}

// ---------------------------------------------------------------- rotation

export interface PastDeal {
  /** The game's roster order (member ids). */
  readonly members: readonly string[];
  /** The rule key each roster member was dealt, in roster order. */
  readonly rules: readonly string[];
  readonly dealKey: string;
  /** Whether the deal was made with winning bids. */
  readonly bid: boolean;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
/** The rule member `m` holds once the round that began with `base` has passed its rules `shift` seats along. */
const heldAfter = (base: PastDeal, m: string, shift: number) => {
  const P = base.members.length;
  return base.rules[((base.members.indexOf(m) - shift) % P + P) % P]!;
};
function passedOn(game: PastDeal, base: PastDeal, shift: number): boolean {
  if (!sameSet(game.members, base.members) || game.dealKey !== base.dealKey || game.bid || base.bid) return false;
  return game.members.every((m, k) => game.rules[k] === heldAfter(base, m, shift));
}

/**
 * The rotated deal for a game of `members` (roster order) given the room's earlier games (newest first), as rule keys
 * in roster order, or null for a fresh deal. `round` is this game's place in the rotation (2 for the first passed-on
 * game) of `of` players.
 */
export function rotatedDeal(members: readonly string[], dealKey: string, history: readonly PastDeal[]): { rules: string[]; round: number; of: number } | null {
  const last = history[0];
  if (!last || last.bid || last.dealKey !== dealKey || !sameSet(members, last.members)) return null;
  const P = members.length;
  let played = 1;
  for (let m = Math.min(P, history.length) - 1; m >= 1; m--) {
    if (history.slice(0, m).every((game, j) => passedOn(game, history[m]!, m - j))) { played = m + 1; break; }
  }
  if (played >= P) return null;
  const base = history[played - 1]!;
  return { rules: members.map(m => heldAfter(base, m, played)), round: played + 1, of: P };
}

// ---------------------------------------------------------------- the player's card

export interface RuleView { title: string; card: string; depends: string[]; primary: string; layers: string[] }

/** What the player is shown about a dealt rule: its card and layers (its value function is `valueRecord(ruleKey)`). */
export function ruleView(rule: DealtRule): RuleView {
  const f = familyOf(rule.family);
  return { title: f.title, card: f.card(rule.params, rule.tieBreaker), depends: [...f.depends], primary: f.main.rep, layers: ruleLayers(f, rule.tieBreaker).map(l => l.id) };
}
