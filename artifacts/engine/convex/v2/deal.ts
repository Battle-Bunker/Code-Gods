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
import { hasStarters, pairVerdict, type PairVerdict } from "@workspace/v2-agents/pure";
import { findVariant, objectTypes, ruleKey } from "@workspace/v2-valuation";
import { gridAlignedPairs, gridClashes, gridSeatingCost } from "@workspace/v2-grid";
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
  return dealFrom(pool, seats, dealRng(seed), variant ? fams => seatingCost(variant, fams) : undefined);
}

/** Whether a variant has a seating rule (grids: lib/v2-grid seating.ts). */
export const hasSeatingRule = (variant: string): boolean => findVariant(variant).type.id === "grid";
/** The pairs of seated families a variant's seating rule forbids; none where it has none. */
export function seatingClashes(variant: string, families: readonly string[]): string[] {
  return hasSeatingRule(variant) ? gridClashes(families) : [];
}
/** The aligned (allowed but avoided) pairs among seated families; none where the variant has no seating rule. */
export function seatingAligned(variant: string, families: readonly string[]): string[] {
  return hasSeatingRule(variant) ? gridAlignedPairs(families) : [];
}
/** A table's seating cost (forbidden pairs, then aligned ones); 0 where the variant has no seating rule. */
export function seatingCost(variant: string, families: readonly string[]): number {
  return hasSeatingRule(variant) ? gridSeatingCost(families) : 0;
}
/** Shuffles a seating rule may draw before it settles for the deal with the fewest clashes. */
const SEATING_TRIES = 200;
/** The deal's random stream for a game seed: the fresh deal and the bid dealer draw from the same one. */
export const dealRng = (seed: string): Rng => rng(seed, "deal");
/**
 * A fresh deal drawn from `r`: a shuffle of the pool dealt in order. With `clashes` (the seating rule's cost of the dealt
 * families), the first shuffle costing 0, else the cheapest.
 */
export function dealFrom(pool: readonly DealtRule[], seats: number, r: Rng, clashes?: (families: readonly string[]) => number): DealtRule[] {
  if (pool.length === 0) throw new Error("No rule of this preset is dealable (none has a value function): nothing can be dealt");
  let best: DealtRule[] | undefined, fewest = Infinity;
  for (let t = 0; t < (clashes ? SEATING_TRIES : 1); t++) {
    const order = [...pool];
    for (let i = order.length - 1; i > 0; i--) {
      const j = r.below(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const deal = Array.from({ length: seats }, (_, i) => order[i % order.length]!);
    const n = clashes ? clashes(deal.map(x => x.family)) : 0;
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
 * A practice game's deal: the first of the seed's fresh deals that fits (`practiceFits`), or the first fresh deal when
 * none of PRACTICE_TRIES does. Reproducible from the seed.
 */
export function practiceDeal(pool: readonly DealtRule[], kinds: readonly SeatKind[], seed: string, variant: string): DealtRule[] {
  const r = dealRng(seed), h = kinds.indexOf("human");
  let first: DealtRule[] | undefined;
  for (let i = 0; i < PRACTICE_TRIES; i++) {
    const deal = dealFrom(pool, kinds.length, r, fams => seatingCost(variant, fams));
    first ??= deal;
    if (practiceFits(variant, deal, h)) return deal;
  }
  return first!;
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
      // The won families are seated too: the seating rule counts their clashes with the rest.
      return dealFrom(left, count, r, variant ? fams => seatingCost(variant, [...excluded, ...fams]) : undefined);
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
