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
  | { op: "budget" };

export type HostOp = HostRequest["op"];
export const HOST_OPS: readonly HostOp[] = ["view", "element", "myRule", "myScore", "quote", "budget"];

/** §3.1 */
export interface ViewReply { rep: string; site: number; elements: Record<string, ElementValueWire>; bits: number }
export interface ElementReply { ref: ElementRef; value: ElementValueWire; bits: number }
/** §6.2 */
export interface RuleReply { family: string; params: Record<string, unknown>; card: string }
export interface ScoreReply {
  /** null: WORST. A null component: that layer is undefined for this state (v2-core's layered ladders). */
  score: (QWire | null)[] | null;
  level: number;
  top: number;
  terms: { id: string; value: QWire | null }[];
}
/** §6.3: `bits` here are the calls' prices, in order; `charge` what committing them would cost in energy. */
export interface QuoteReply { valid: boolean; reason?: string; bits: number[]; total: number; charge: number }
export interface BudgetReply { energy: number; readPrice: number; beta: number; hostCallsLeft: number }

/** The result half of a successful reply, per op. */
export interface HostResults {
  view: ViewReply;
  element: ElementReply;
  myRule: RuleReply;
  myScore: ScoreReply;
  quote: QuoteReply;
  budget: BudgetReply;
}

/**
 * What the host answers. `bits` on a success is the call's receipt: the read bits it was charged (0 for a free
 * call, a repeated query, or a quote of a state already read). A failure is surfaced to the agent as an exception
 * it may catch (§6.4: uncaught, it fails the act, which is still charged its reads).
 */
export type HostReply = { ok: true; result: HostResults[HostOp]; bits: number } | { ok: false; error: string };
