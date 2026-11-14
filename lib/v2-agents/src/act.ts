/**
 * One act (spec §6.1): offer an object to an agent, run its program in the sandbox against the engine host, apply
 * the calls it returns and charge it. `runAct` is the function the server calls from an action (W3) and the
 * harness calls in a loop; its record is what the server stores as an `act` event.
 */
import { applyCalls, isInvalid, type ObjectType, type Price, type Variant } from "@workspace/v2-core";
import type { ActLimits, Language, Sandbox, TranscriptEntry } from "@workspace/v2-sandbox";
import { changeCharge, EngineHost, lensOf, parseCalls, SPEC_ECONOMY, type Economy, type RuleRef } from "./host.ts";

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
  /** Which object was offered, and how many were live (the offer costs log2 of that, read bits; §6.1). */
  readonly object?: number;
  readonly liveObjects?: number;
  readonly limits?: Partial<ActLimits>;
  readonly economy?: Economy;
}

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
  readonly steps?: number;
}

export async function runAct<S>(sandbox: Sandbox, input: ActInput<S>): Promise<{ record: ActRecord; state: S }> {
  if (sandbox.language !== input.program.language) throw new Error(`a ${sandbox.language} sandbox cannot run a ${input.program.language} program`);
  const economy = input.economy ?? SPEC_ECONOMY;
  const host = new EngineHost({ type: input.type, variant: input.variant, state: input.state, rule: input.rule, energy: input.energy, economy });
  const offerBits = Math.log2(Math.max(1, input.liveObjects ?? 1));
  const result = await sandbox.act({ source: input.program.source, offer: { object: input.object ?? 0 }, seed: input.seed, host, limits: input.limits });
  const before = input.type.encode(input.state);
  const readBits = result.readBits + offerBits;
  const readsByRep: Record<string, number> = Object.fromEntries(host.readsByRep);
  if (offerBits > 0) readsByRep.offer = offerBits;
  const base = { offerBits, readBits, readsByRep, before, transcript: result.transcript };
  const nothing = (outcome: "skipped" | "failed", extra: { reason?: string; code?: string } = {}, steps?: number) => ({
    record: { outcome, ...extra, calls: [], changeBits: 0, charge: readBits / economy.kappa, after: before, ...base, ...(steps === undefined ? {} : { steps }) },
    state: input.state,
  });
  if (!result.ok) return nothing("failed", { reason: result.error, code: result.code });

  let parsed: unknown;
  try { parsed = JSON.parse(result.calls); } catch { return nothing("failed", { reason: "the calls are not JSON" }, result.steps); }
  if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) return nothing("skipped", {}, result.steps);
  const calls = parseCalls(parsed);
  if (typeof calls === "string") return nothing("failed", { reason: calls }, result.steps);
  const applied = applyCalls(input.type, input.variant, input.state, calls);
  if (isInvalid(applied)) return nothing("failed", { reason: applied.invalid }, result.steps);

  const record: ActRecord = {
    outcome: "committed",
    calls: calls.map((c, i) => ({ ...c, rep: lensOf(input.type, c.mutator) ?? "?", price: applied.prices[i]! })),
    changeBits: applied.total,
    charge: readBits / economy.kappa + changeCharge(applied.total, economy),
    after: input.type.encode(applied.result),
    steps: result.steps,
    ...base,
  };
  return { record, state: applied.result };
}

