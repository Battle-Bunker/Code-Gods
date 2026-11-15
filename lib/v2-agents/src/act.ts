/**
 * One act (spec §6.1): offer an object to an agent, run its program in the sandbox against the engine host, apply
 * the calls it returns and charge it. `runAct` is the function the server calls from an action (W3) and the
 * harness calls in a loop; its record is what the server stores as an `act` event.
 */
import { applyCalls, isInvalid, type ObjectType, type Price, type Variant } from "@workspace/v2-core";
import type { ActLimits, Language, Sandbox, TranscriptEntry } from "@workspace/v2-sandbox";
import { changeCharge, EngineHost, lensOf, OTHERS_AFTER_BITS, parseCalls, SPEC_ECONOMY, type Economy, type HostInput, type RuleRef } from "./host.ts";

export interface Program {
  readonly language: Language;
  readonly source: string;
}

export interface ActInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly state: S;
  /** The acting agent's player's rule. */
  readonly rule: RuleRef;
  readonly program: Program;
  /** The act's seed (the agent's randomness and nothing else). */
  readonly seed: string | bigint;
  /** The agent's energy, as `budget()` reports it. */
  readonly energy: number;
  /** The energy the agent earns a second, as `budget()` reports it (absent: unknown). */
  readonly income?: number;
  /** Which object was offered, and how many were live (the offer costs log2 of that, read bits; §6.1). */
  readonly object?: number;
  readonly liveObjects?: number;
  readonly limits?: Partial<ActLimits>;
  readonly economy?: Economy;
  /** What the offered line is worth to the player now, its recent visible moves and the rule's value function (host.ts). */
  readonly value?: HostInput<S>["value"];
  readonly history?: HostInput<S>["history"];
  readonly values?: HostInput<S>["values"];
  readonly others?: HostInput<S>["others"];
  /** Whether another object already holds a state (unique objects): such a result is refused. */
  readonly occupied?: HostInput<S>["occupied"];
  /** Disclosure noise on the others' sum at a state (live games): `othersAfter` reports the noisy, clamped sum. */
  readonly disclosed?: HostInput<S>["disclosed"];
  /**
   * The game offers the commit clause (v1's `only_if_better`, off by default): an agent may return
   * onlyIfBetter(plan), committed only if it strictly raises the player's points on the line as the player sees them.
   */
  readonly commitClause?: boolean;
}

/** The reason an act's moves did not commit under the commit clause (v1's wording, a line for an object). */
export const COMMIT_KEPT = "the commit clause kept the line: it would not raise your points";

export type Outcome = "committed" | "skipped" | "failed";

/** A move as applied, with what it cost and through which view. */
export interface AppliedCall {
  readonly mutator: string;
  readonly site: number;
  readonly args: Readonly<Record<string, string>>;
  /** The representation the mutator belongs to first ("si" for si.shift): the lens the change was made through. */
  readonly rep: string;
  readonly price: Price;
}

export interface ActRecord {
  readonly outcome: Outcome;
  /** Why the act failed or what made the calls invalid. */
  readonly reason?: string;
  /** The sandbox's error code when the program itself failed (COMPILE, EXECUTION, LIMIT). */
  readonly code?: string;
  readonly calls: readonly AppliedCall[];
  /** W: the sum of the calls' prices (0 unless committed). */
  readonly changeBits: number;
  /** R: the bits read, the offer's included. */
  readonly readBits: number;
  readonly offerBits: number;
  /** Read bits by representation (the offer's are under "offer"). */
  readonly readsByRep: Readonly<Record<string, number>>;
  /** R/κ + (committed ? W + βW² : 0). */
  readonly charge: number;
  /** The state before and after, as the object type encodes it. */
  readonly before: string;
  readonly after: string;
  readonly transcript: readonly TranscriptEntry[];
  /** Short notes the agent left its owner (`note`), for the act log. */
  readonly notes: readonly string[];
  readonly steps?: number;
}

export async function runAct<S>(sandbox: Sandbox, input: ActInput<S>): Promise<{ record: ActRecord; state: S }> {
  if (sandbox.language !== input.program.language) throw new Error(`a ${sandbox.language} sandbox cannot run a ${input.program.language} program`);
  const economy = input.economy ?? SPEC_ECONOMY;
  const host = new EngineHost({
    type: input.type, variant: input.variant, state: input.state, rule: input.rule, energy: input.energy, ...(input.income === undefined ? {} : { income: input.income }), economy,
    value: input.value, history: input.history, values: input.values, others: input.others, occupied: input.occupied, disclosed: input.disclosed,
  });
  const offerBits = Math.log2(Math.max(1, input.liveObjects ?? 1));
  const result = await sandbox.act({ source: input.program.source, offer: { object: input.object ?? 0 }, seed: input.seed, host, limits: input.limits });
  const before = input.type.encode(input.state);
  const readBits = result.readBits + offerBits;
  const readsByRep: Record<string, number> = Object.fromEntries(host.readsByRep);
  if (offerBits > 0) readsByRep.offer = offerBits;
  const base = { offerBits, readBits, readsByRep, before, transcript: result.transcript, notes: [...host.notes] };
  const nothing = (outcome: "skipped" | "failed", extra: { reason?: string; code?: string } = {}, steps?: number) => ({
    record: { outcome, ...extra, calls: [], changeBits: 0, charge: base.readBits / economy.kappa, after: before, ...base, ...(steps === undefined ? {} : { steps }) },
    state: input.state,
  });
  if (!result.ok) return nothing("failed", { reason: result.error, code: result.code });

  let parsed: unknown;
  try { parsed = JSON.parse(result.calls); } catch { return nothing("failed", { reason: "the calls are not JSON" }, result.steps); }
  if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) return nothing("skipped", {}, result.steps);
  // The commit clause: { onlyIfBetter: [calls] } (the guest's onlyIfBetter / only_if_better).
  const clause = typeof parsed === "object" && !Array.isArray(parsed) && "onlyIfBetter" in (parsed as object);
  if (clause) {
    if (!input.commitClause) return nothing("failed", { reason: "this game does not offer the commit clause (onlyIfBetter)" }, result.steps);
    parsed = (parsed as { onlyIfBetter: unknown }).onlyIfBetter;
  }
  const calls = parseCalls(parsed);
  if (typeof calls === "string") return nothing("failed", { reason: calls }, result.steps);
  const applied = applyCalls(input.type, input.variant, input.state, calls);
  if (!isInvalid(applied) && input.occupied?.(input.type.encode(applied.result))) return nothing("failed", { reason: "another object is already in that state" }, result.steps);
  if (isInvalid(applied)) return nothing("failed", { reason: applied.invalid }, result.steps);
  if (clause) {
    // Decided on what the player is shown (own exact, the others as disclosed), and read like othersAfter: the clause
    // is never a cheaper or sharper probe of the others than asking (archive public-log-design.md §5.2).
    const before0 = host.payoffAt(input.state), after0 = host.payoffAt(applied.result);
    if (before0 === null || after0 === null) return nothing("failed", { reason: "this game does not say what lines are worth, so the commit clause cannot judge" }, result.steps);
    base.readBits += OTHERS_AFTER_BITS;
    base.readsByRep.othersAfter = (base.readsByRep.othersAfter ?? 0) + OTHERS_AFTER_BITS;
    if (!(after0.points > before0.points)) return nothing("failed", { reason: COMMIT_KEPT }, result.steps);
  }

  const record: ActRecord = {
    outcome: "committed",
    calls: calls.map((c, i) => ({ ...c, rep: lensOf(input.type, c.mutator) ?? "?", price: applied.prices[i]! })),
    changeBits: applied.total,
    charge: base.readBits / economy.kappa + changeCharge(applied.total, economy),
    after: input.type.encode(applied.result),
    steps: result.steps,
    ...base,
  };
  return { record, state: applied.result };
}

