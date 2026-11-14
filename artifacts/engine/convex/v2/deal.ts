/**
 * The deal (spec §7.6, integration plan §4.3): which rule each seat holds. A dealt rule is a family's main layer plus
 * one of its tie-breakers, with parameters from the family's dealable grid, and is dealt only when its artefact is
 * committed and converged. Pure: the lobby (ops/game.ts) persists the result.
 *
 * Rotation (copied and cleaned from v1's lib/dealRotation.ts, docs/beginner-pool.md §6): when a room plays again with
 * the same players and the same deal key, the last game's rules pass one seat along, so over as many games as there
 * are players everyone holds each seat's rule once (when the pool is smaller than the seats, some seats share a rule);
 * then the next game is dealt afresh. A deal made with winning bids never
 * rotates and never continues a rotation.
 */
import { canonicalJson, hashHex, rng, ruleLayers, scoreFromWire, type RuleFamily, type Rung } from "@workspace/v2-core";
import { families as lineFamilies } from "@workspace/v2-linear";
import { findVariant, ruleKey } from "@workspace/v2-valuation";
import { artefactFor, dealable } from "./artefacts.ts";
import type { Preset } from "./presets.ts";

/** A rule as dealt: enough to evaluate it (family, params, tie-breaker) and to find its artefact. */
export interface DealtRule { family: string; params: unknown; tieBreaker: string | null; ruleKey: string; contentHash: string }

const FAMILIES = new Map<string, RuleFamily<unknown, unknown>>(lineFamilies.map(f => [f.id, f as unknown as RuleFamily<unknown, unknown>]));
export function familyOf(id: string): RuleFamily<unknown, unknown> {
  const f = FAMILIES.get(id);
  if (!f) throw new Error(`Unknown rule family ${id}`);
  return f;
}

/** Every rule the preset may deal: its families × dealable parameters × tie-breakers, converged artefacts only. */
export function dealablePool(preset: Preset): DealtRule[] {
  const { type, variant } = findVariant(preset.variant);
  const out: DealtRule[] = [];
  for (const id of preset.families) {
    const f = FAMILIES.get(id);
    if (!f) continue;
    for (const params of f.dealable(variant)) {
      for (const tb of f.tieBreakers.map(t => t.id)) {
        const key = ruleKey(type, variant, f.id, params, tb);
        const a = artefactFor(key);
        if (dealable(a)) out.push({ family: f.id, params, tieBreaker: tb, ruleKey: key, contentHash: a.contentHash });
      }
    }
  }
  return out;
}

/** What starts a fresh deal when it changes: the preset's variant and its pool. */
export function dealKeyOf(preset: Preset, pool: readonly DealtRule[]): string {
  return hashHex(canonicalJson({ variant: preset.variant, pool: pool.map(r => r.ruleKey) }));
}

/**
 * A fresh deal for `seats` seats from `pool`: a seeded shuffle, dealt in order, so seats hold different rules while
 * the pool lasts (the pool is reused from its start when there are more seats than rules).
 */
export function freshDeal(pool: readonly DealtRule[], seats: number, seed: string): DealtRule[] {
  if (pool.length === 0) throw new Error("No rule of this preset has a converged artefact: nothing can be dealt");
  const r = rng(seed, "deal"), order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.below(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return Array.from({ length: seats }, (_, i) => order[i % order.length]!);
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

export interface RuleView {
  title: string; card: string; depends: string[]; primary: string; layers: string[];
  ladder: { level: number; label: string; rarityBits: number; layer?: string }[];
}

/** What the player is shown about a dealt rule: its card, layers and ladder with each rung's ✨ rarity (artefact bits). */
export function ruleView(rule: DealtRule): RuleView {
  const f = familyOf(rule.family), a = artefactFor(rule.ruleKey);
  if (!a) throw new Error(`No artefact for ${rule.ruleKey}`);
  const layers = ruleLayers(f, rule.tieBreaker).map(l => l.id);
  return {
    title: f.title, card: f.card(rule.params, rule.tieBreaker), depends: [...f.depends], primary: f.main.rep, layers,
    ladder: a.rungs.map((r, level) => ({ level, label: r.label, rarityBits: r.bits ?? 0, ...(r.layer >= 0 ? { layer: layers[r.layer]! } : {}) })),
  };
}

/** The ladder of a dealt rule as v2-core compares scores on it (from the artefact, so levels and bits agree). */
export function artefactLadder(rule: DealtRule): Rung[] {
  const a = artefactFor(rule.ruleKey);
  if (!a) throw new Error(`No artefact for ${rule.ruleKey}`);
  return a.rungs.map(r => ({ score: scoreFromWire(r.score), label: r.label, layer: r.layer }));
}
