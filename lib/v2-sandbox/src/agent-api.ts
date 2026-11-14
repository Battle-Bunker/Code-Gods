/**
 * The agent API's wire types (docs/engine-v2/spec.md §3.1, §5.1, §6.2–§6.5), as the sandbox needs them.
 *
 * This is the one file to swap for `@workspace/v2-core`'s types once that package merges: nothing else in
 * this package declares a message shape. Rationals travel as strings "p/q" (or "p" when q = 1).
 */

/** A rational on the wire: "p/q" in lowest terms with q ≥ 1, or "p" when q = 1. */
export type QWire = string;

export type ElementValueWire =
  | { kind: "number"; q: QWire }
  | { kind: "point"; x: QWire; y: QWire }
  | { kind: "segment"; from: { x: QWire; y: QWire }; to: { x: QWire; y: QWire } }
  | { kind: "symbol"; text: string }
  | { kind: "undefined"; reason: string };

export interface ElementRef {
  rep: string;
  name: string;
  site?: number;
  /** Dynamic elements' arguments, as Q wire strings. */
  args?: Record<string, QWire>;
}

/** One mutator call, as an agent returns it (§5.1). Numeric arguments are Q wire strings. */
export interface Call {
  mutator: string;
  site: number;
  args: Record<string, unknown>;
}

/** What the guest asks the host (§6.5). */
export type HostRequest =
  | { op: "view"; rep: string; site?: number }
  | { op: "element"; ref: ElementRef }
  | { op: "myRule" }
  | { op: "myScore" }
  | { op: "quote"; calls: Call[] }
  | { op: "budget" }
  | { op: "worth" }
  | { op: "rarity"; score: (QWire | null)[] | null }
  | { op: "recent" }
  | { op: "note"; text: string }
  | { op: "othersAfter"; calls: Call[] };

export type HostOp = HostRequest["op"];
export const HOST_OPS: readonly HostOp[] = ["view", "element", "myRule", "myScore", "quote", "budget", "worth", "rarity", "recent", "note", "othersAfter"];

/** §3.1 */
export interface ViewReply { rep: string; site: number; elements: Record<string, ElementValueWire>; bits: number }
export interface ElementReply { ref: ElementRef; value: ElementValueWire; bits: number }
/** §6.2 */
export interface RuleReply {
  /** What the rule scores, in the game's own word ("line", "grid"); "line" when a host does not say. */
  object?: string;
  family: string;
  params: Record<string, unknown>;
  /** The dealt tie-breaker's id, or null for the main layer alone. */
  tieBreaker: string | null;
  card: string;
  /** The dealt layers in order (main part, then tie-breaker); sense "min": smaller is better. */
  layers: { id: string; title: string; sense: "min" | "max" }[];
}
export interface ScoreReply {
  /** null: WORST. A null component: that layer is undefined for this state (v2-core's layered ladders). */
  score: (QWire | null)[] | null;
  /** What the score is worth, in bits (owner decision 23: a continuous function of the utilities); null when the game does not say. */
  bits: number | null;
  /** The dealt layers, main part first. */
  layers: { id: string }[];
  terms: { id: string; value: QWire | null }[];
}
/** §6.3: `bits` here are the calls' prices, in order; `charge` what committing them would cost in energy. */
export interface QuoteReply { valid: boolean; reason?: string; bits: number[]; total: number; charge: number }
export interface BudgetReply { energy: number; readPrice: number; beta: number; hostCallsLeft: number }
/**
 * What the offered line is worth now, as the player sees it (spec §8): their own rarity n_i, the others' summed rarity
 * Σ n_j and their points π_i = n_i · Σ n_j, in bits.
 */
export interface WorthReply { mine: number; others: number; points: number }
/**
 * The other players' rarity on the offered line, added up, now and after a plan (coordinator, 2026-11-14: the total
 * only, never each player's), in bits; `after` is null when the plan is not allowed.
 */
export interface OthersAfterReply { before: number; after: number | null }
/** The rarity the player's own rule gives a score (their own calibration, as their goal card shows), in bits. */
export interface RarityReply { bits: number }
/** The latest moves on the offered line the player may see (newest last): theirs, and others' that changed their points. */
export interface RecentReply { moves: { mine: boolean; pointsBefore: number; pointsAfter: number }[] }
export interface NoteReply { kept: boolean }

/** The result half of a successful reply, per op. */
export interface HostResults {
  view: ViewReply;
  element: ElementReply;
  myRule: RuleReply;
  myScore: ScoreReply;
  quote: QuoteReply;
  budget: BudgetReply;
  worth: WorthReply;
  rarity: RarityReply;
  recent: RecentReply;
  note: NoteReply;
  othersAfter: OthersAfterReply;
}

/**
 * What the host answers. `bits` on a success is the call's receipt: the read bits it was charged (0 for a free
 * call, a repeated query, or a quote of a state already read). A failure is surfaced to the agent as an exception
 * it may catch (§6.4: uncaught, it fails the act, which is still charged its reads).
 */
export type HostReply = { ok: true; result: HostResults[HostOp]; bits: number } | { ok: false; error: string };
