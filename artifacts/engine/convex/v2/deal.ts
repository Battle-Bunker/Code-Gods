/**
 * The deal (spec §7.6, integration plan §4.3): which rule each seat holds. A dealt rule is a family scored by the dynamic
 * energy measure (owner decision 50) with parameters from its dealable list. Pure: the lobby (ops/game.ts) persists it.
 *
 * Rotation (copied and cleaned from v1's lib/dealRotation.ts, docs/beginner-pool.md §6): when a room plays again with
 * the same players and the same deal key, the last game's rules pass one seat along, so over as many games as there
 * are players everyone holds each seat's rule once (when the pool is smaller than the seats, some seats share a rule);
 * then the next game is dealt afresh. A deal made with winning bids never
 * rotates and never continues a rotation.
 *
 * Practice games (one human, every other seat a practice partner) are dealt exactly as a real game for the same seats
 * (`practiceDeal`: the coordinator's call of 15 Nov, owner-decisions.md; the old goal-sharing fit manufactured tables
 * that settled on a shared optimum), with the human's seat the anchor; the games after it rotate those rules like any
 * room's (playtest round 9: v1's rotation).
 *
 * Seating (pairs: lib/v2-pair seating.ts, no two rules one move climbs together): a pair deal is the seed's first shuffle
 * with no forbidden pair, else the one with the fewest over SEATING_TRIES shuffles. Grids lost their seating rule with
 * their old families (17 Nov: the dynamic grid rules pull against each other by construction, dynamic-families.ts). A
 * deal on any other object type is the first shuffle. The game records the pairs left (`seating` in tables.ts).
 */
import { canonicalJson, hashHex, rng, ruleLayers, type Rng, type RuleFamily } from "@workspace/v2-core";
import type { BidDealer } from "@workspace/v2-economy";
import { hasStarters } from "@workspace/v2-agents/pure";
import { findVariant, objectTypes, ruleKey } from "@workspace/v2-valuation";
import type { Preset } from "./presets.ts";

/** A rule as dealt: enough to evaluate it (family, params, tie-breaker). */
export interface DealtRule { family: string; params: unknown; tieBreaker: string | null; ruleKey: string; contentHash: string }

/** Every object type's families, by id (ids are unique across types: test/unit/v2-deal.test.ts checks it). */
const FAMILIES = new Map<string, RuleFamily<unknown, unknown>>(objectTypes.flatMap(t => t.families).map(f => [f.id, f as unknown as RuleFamily<unknown, unknown>]));
export function familyOf(id: string): RuleFamily<unknown, unknown> {
  const f = FAMILIES.get(id);
  if (!f) throw new Error(`Unknown rule family ${id}`);
  return f;
}
/** A family by id, or undefined when it is no longer defined (a stored game may name one retired since: decision 50). */
export const knownFamily = (id: string): RuleFamily<unknown, unknown> | undefined => FAMILIES.get(id);
/** Whether a family keeps its params under drift (a ladder: RuleFamily.keepsParams); false for a family no longer defined. */
export const keepsParams = (id: string): boolean => FAMILIES.get(id)?.keepsParams === true;

const pools = new Map<string, DealtRule[]>();
/**
 * Every rule the preset may deal: its pool's (family, parameters) scored by energy (decision 50)
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
    // Only a family scored by the energy estimate (RuleFamily.dynamic; decision 50) is dealt, main part only. A family
    // valued by a table (the two-line systems, the coloured boards) has none since the tables were deleted: its preset is
    // withheld until its rules are restated as utilities.
    if (!FAMILIES.get(r.family)!.dynamic) continue;
    out.push({ family: r.family, params: r.params, tieBreaker: null, ruleKey: ruleKey(type, variant, r.family, r.params, "none"), contentHash: hashHex(canonicalJson({ dynamic: r.family, params: r.params })) });
  }
  return out;
}

/**
 * Whether a preset can be played now: at least one of its rules is dealable (scored by energy, with starters). A preset
 * with none (the two-line systems and the coloured boards since the tables went, 17 Nov) is withheld: not listed, and refused by room.create and
 * room.settings.
 */
export const playable = (preset: Preset): boolean => dealablePool(preset).length > 0;

/** What starts a fresh deal when it changes: the preset's variant and its pool. */
export function dealKeyOf(preset: Preset, pool: readonly DealtRule[]): string {
  return hashHex(canonicalJson({ variant: preset.variant, pool: pool.map(r => r.ruleKey) }));
}

/** A seated rule: what the seating rules read. */
export interface SeatedRule { readonly family: string; readonly params?: unknown }

/**
 * A fresh deal for `seats` seats from `pool`, reproducible from the seed: each family equally likely, no family twice
 * while the pool lasts (`dealFrom`), the seating rule honoured. (The lines' anchored deal, which sat a seat with one of
 * its named opponents, went with the old line families and their opponent table, 16 Nov.)
 */
export function freshDeal(pool: readonly DealtRule[], seats: number, seed: string, variant?: string): DealtRule[] {
  const r = dealRng(seed);
  return dealFrom(pool, seats, r, variant ? rules => seatingCost(variant, rules) : undefined, entryTriesOf(variant));
}

/**
 * Whether a variant has a seating rule (pairs: lib/v2-pair seating.ts, by family and dealt parameters).
 */
export const hasSeatingRule = (_variant: string): boolean => false;
export const isGridVariant = (variant: string) => findVariant(variant).type.id === "grid";
/** The pairs of seated rules a variant's seating rule forbids; none where it has none. */
export function seatingClashes(variant: string, rules: readonly SeatedRule[]): string[] {
  void variant; void rules;
  return [];
}
/** A table's seating cost (forbidden pairs, then aligned ones); 0 where the variant has no seating rule. */
export function seatingCost(variant: string, rules: readonly SeatedRule[]): number {
  void variant; void rules;
  return 0;
}
const familySet = (pool: readonly { family: string }[]) => new Set(pool.map(r => r.family));
/** Shuffles a seating rule may draw before it settles for the deal with the fewest clashes. */
const SEATING_TRIES = 200;
/**
 * Draws of the seats' entries (parameters and tie-breaker) for one family order before the next shuffle, on an object
 * type whose seating rule reads the dealt parameters (pairs). Reshuffling families at every clash under-dealt the
 * family with the most clash rules (Whole Answer: 503 seats of an expected 750 at 4 seats, 574 of 938 at 5; the lens
 * worker, 15 Nov), since the shuffles that seated it were rejected most. Redrawing its numbers first keeps the family
 * draw uniform. Lines and grids keep one draw per shuffle, so their seeded deals are unchanged.
 */
const PAIR_ENTRY_TRIES = 12;
const entryTriesOf = (_variant: string | undefined): number => 1;
void PAIR_ENTRY_TRIES;
/** The deal's random stream for a game seed: the fresh deal and the bid dealer draw from the same one. */
export const dealRng = (seed: string): Rng => rng(seed, "deal");
/**
 * A fresh deal drawn from `r` (the coordinator's rule): the families in a seeded random order, so each family is equally
 * likely whatever the number of its (parameters, tie-breaker) entries, and no family twice at a table while the pool
 * has families enough (they are reused, in the same order, only beyond that); each seat gets one of its family's
 * entries uniformly. With `clashes` (the seating rule's cost of the dealt families), the first draw costing 0, else the
 * cheapest.
 */
export function dealFrom(pool: readonly DealtRule[], seats: number, r: Rng, clashes?: (rules: readonly DealtRule[]) => number, entryTries = 1): DealtRule[] {
  if (pool.length === 0) throw new Error("No rule of this preset is dealable (none is scored by energy): nothing can be dealt");
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
    for (let e = 0; e < (clashes ? entryTries : 1); e++) {
      const deal = Array.from({ length: seats }, (_, i) => { const entries = byFamily.get(order[i % order.length]!)!; return entries[r.below(entries.length)]!; });
      const n = clashes ? clashes(deal) : 0;
      if (n < fewest) { best = deal; fewest = n; }
      if (n === 0) return best!;
    }
  }
  return best!;
}

/** Who holds a seat. */
export type SeatKind = "human" | "practice" | "ai";
/** A practice game: one human, and every other seat a practice partner. Any other room gets the plain deal. */
export const isPracticeGame = (kinds: readonly SeatKind[]): boolean =>
  kinds.length > 1 && kinds.filter(k => k === "human").length === 1 && kinds.every(k => k !== "ai");

/** Whether rank `a` comes before `b`, comparing in order. */
const before = (a: readonly number[], b: readonly number[]): boolean => {
  const k = a.findIndex((x, i) => x !== b[i]);
  return k >= 0 && a[k]! < b[k]!;
};
/**
 * A practice game's deal (the coordinator's call of 15 Nov): exactly a real game's for the same seats. No preference
 * for partners whose goals fit the human's (CLAUDE.md: never help players reach or hold a fixed point). Reproducible
 * from the seed.
 */
export function practiceDeal(pool: readonly DealtRule[], kinds: readonly SeatKind[], seed: string, variant: string): DealtRule[] {
  return freshDeal(pool, kinds.length, seed, variant);
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
      return dealFrom(left, count, r, variant ? rules => seatingCost(variant, [...excluded.map(family => ({ family })), ...rules]) : undefined, entryTriesOf(variant));
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
    const top = 0;   // a family's scale: value tables measured it; energy has no fixed scale (decision 50)
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

/** What the player is shown about a dealt rule: its card and layers . */
export function ruleView(rule: DealtRule): RuleView {
  const f = knownFamily(rule.family);
  if (!f) return { title: "A retired rule", card: "This rule was retired on 17 November 2026 (the rules are now one number each); it scores nothing.", depends: [], primary: "si", layers: [] };
  return { title: f.title, card: f.card(rule.params, rule.tieBreaker), depends: [...f.depends], primary: f.main.rep, layers: ruleLayers(f, rule.tieBreaker).map(l => l.id) };
}

// ---------------------------------------------------------------- defence goals (v1, restored; owner-decisions call 1)

/** A defence goal as dealt: one of the variant's penalty families, its parameters, its key and card. */
export interface DealtDefence { family: string; params: unknown; ruleKey: string; card: string }

/**
 * Every penalty the variant could deal (ObjectType.penalties minus `excluded`), each instance, grouped by family (the room
 * refuses defence goals while every rule is scored by energy: lobby.ts). Empty for a type without penalties (lines).
 */
export function defencePool(variantId: string, excluded: readonly string[] = []): DealtDefence[][] {
  const { type, variant } = findVariant(variantId);
  return (type.penalties ?? []).filter(f => !excluded.includes(f.id)).map(f =>
    (f.dealable(variant) as unknown[]).flatMap(params => {
      const key = ruleKey(type, variant, f.id, params, "none");
      return [{ family: f.id, params, ruleKey: key, card: f.card(params as never, null) }];
    })).filter(g => g.length > 0);
}

/**
 * One defence goal for every seat, as v1 dealt them (every seat or none: a defence goal is a handicap for all alike):
 * a uniform family, then a uniform parameter set (v1's dealer prior), from the game's seed. Null when the variant has
 * no penalty to deal.
 */
export function dealDefence(variantId: string, seats: number, seed: string, excluded: readonly string[] = []): DealtDefence[] | null {
  const pool = defencePool(variantId, excluded);
  if (pool.length === 0) return null;
  const r = rng(seed, "deal-defence");
  return Array.from({ length: seats }, () => { const g = pool[r.below(pool.length)]!; return g[r.below(g.length)]!; });
}
