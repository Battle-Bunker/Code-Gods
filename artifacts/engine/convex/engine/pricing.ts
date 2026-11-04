"use node";
/**
 * Open-agent pricing (ported from api-server pricing.ts):
 *   summon price   = description bits (ast-bits-v1 / ts-ast-bits-v1-uniform) + each literal move   (god pays once)
 *   act charge     = the bits the act read + its change when that commits                        (agent pays, per act)
 * (docs/energy-model.md §2). expectedActCost, the estimate shown at validation and summon, is measured by RUNNING the
 * agent on the season's reference mixture plus up to 16 live objects; nothing is charged or scheduled from it.
 */
import { instantiationOf, type GameSettings, type Language, type ObjectValue } from "@workspace/game-core";
import type { Inspection } from "@workspace/game-runtime";
import {
  availableMutators, futilityWarnings, measureAgent, parseAct, probeFutility, referenceMixture, withComponents, type FutilityProfile, type Instantiation,
  type ReferenceMixture,
} from "@workspace/game-types";
import type { ActionCtx } from "../_generated/server";
import { act, inspect, isAgentFault } from "./runtime";
import { seasonCommitment, seasonSalt } from "./node";

/** The commit clause's summon price when any measured act uses it: 1 + log2 3 + 1 bits. */
export const COMMIT_CLAUSE_BITS = 1 + Math.log2(3) + 1;
export const GAME_COMPONENT = 16;
/** -log2(1/8): the flag bits of a literal move (game-runtime MOVE_FLAG_BITS). */
const MOVE_FLAG_BITS = 3;
const CONCURRENCY = 4;

/** The estimated cost per act, split: the bits it reads and its change (docs/energy-model.md §5). */
export type CostBreakdown = { read: number; change: number };
export type SummonParts = { structure: number; names: number; literals: number; moveFlags: number; literalMoves: number; commitClause: number };
export type Examination = {
  cost: number; parts: SummonParts; complexityFunctionId: string;
  expectedActCost: number; breakdown: CostBreakdown; randomized: boolean;
  /** Measured on the reference objects: the share of acts that change the object, that fail or are invalid, and that skip. */
  changeRate: number; invalidRate: number; skipRate: number;
  /** Two passes over a sample world (the game's objects first): the expected success rate and why acts would fail. */
  futility: Omit<FutilityProfile, "warnings" | "n">; warnings: string[];
  diagnostics: string[]; runs: number; measureMs: number;
};

const lg = (x: number) => (x > 1 ? Math.log2(x) : 0);

export function summonPrice(inspection: Inspection, inst: Instantiation): { cost: number; parts: SummonParts } {
  const avail = availableMutators(inst), byId = new Map(avail.map(m => [m.id, m]));
  let literalMoves = 0;
  inspection.literalMoves.forEach(([id, raw], i) => {
    const m = byId.get(id);
    let bits = inspection.literalMoveFallbackBits[i];
    if (m) {
      try { bits = MOVE_FLAG_BITS + lg(avail.length) + m.describeBits(m.parse(raw, inst), inst); }
      catch { /* invalid here: priced as an ordinary call */ }
    }
    literalMoves += bits;
  });
  return { cost: inspection.cost + literalMoves, parts: { ...inspection.parts, literalMoves, commitClause: 0 } };
}

const mixtures = new Map<string, ReferenceMixture>();
export function seasonMixture(inst: Instantiation): ReferenceMixture {
  const key = `${inst.key}\0${seasonCommitment()}`;
  let mix = mixtures.get(key);
  if (!mix) {
    mix = referenceMixture(inst, seasonSalt());
    if (mixtures.size >= 32) mixtures.delete(mixtures.keys().next().value!);
    mixtures.set(key, mix);
  }
  return mix;
}

/** An agent-fault examination failure (compile error etc.): reported to the player, never a host error. */
export class AgentFault extends Error {}

/** Throws AgentFault for the agent's own compile errors; host failures propagate as they are. */
export async function examineAgent(ctx: ActionCtx, settings: GameSettings, language: Language, source: string, live: readonly ObjectValue[]): Promise<Examination> {
  const inst = instantiationOf(settings);
  let inspection: Inspection;
  try { inspection = await inspect(ctx, source, language, settings); }
  catch (error) {
    if (!isAgentFault(error)) throw error;
    throw new AgentFault((error as Error).message.slice(0, 1000));
  }
  const price = summonPrice(inspection, inst);
  const game = live.slice(0, GAME_COMPONENT);
  const mixture = game.length ? withComponents(seasonMixture(inst), { game }) : seasonMixture(inst);
  let hostFailure: unknown, runs = 0, usesClause = false;
  const sample = { value: undefined as ObjectValue | undefined, calls: undefined as string | undefined, error: undefined as string | undefined };
  const started = performance.now();
  // The measurement and the futility probe (docs/rules-design.md §11: the game's objects first, then the reference
  // mixture) run side by side; after a host failure neither runs anything more.
  const probing = probeFutility(async (value, seed) => {
    if (hostFailure) throw hostFailure;
    runs++;
    try { const result = await act(ctx, source, language, value, settings, seed); return { calls: result.calls, usedRandom: result.usedRandom, steps: result.steps, readBits: result.readBits }; }
    catch (error) {
      if (!isAgentFault(error)) { hostFailure ??= error; throw error; }
      return { calls: "[]", error: (error as Error).message.slice(0, 200) };
    }
  }, inst, [...game, ...mixture.values], { salt: seasonSalt(), concurrency: CONCURRENCY });
  const measured = await measureAgent(async (value, seed, at) => {
    if (hostFailure) throw hostFailure;
    runs++;
    try {
      const result = await act(ctx, source, language, value, settings, seed);
      if (settings.commitClause && !usesClause) { try { usesClause = parseAct(result.calls).commit !== undefined; } catch { /* invalid act */ } }
      if (at.component === "game" && at.replicate === 0 && sample.value === undefined) Object.assign(sample, { value, calls: result.calls });
      return { calls: result.calls, usedRandom: result.usedRandom, steps: result.steps, readBits: result.readBits };
    } catch (error) {
      if (!isAgentFault(error)) { hostFailure ??= error; throw error; }
      if (at.component === "game" && at.replicate === 0 && sample.value === undefined) Object.assign(sample, { value, error: (error as Error).message });
      return { calls: "[]", error: (error as Error).message.slice(0, 200), readBits: (error as { readBits?: number }).readBits };
    }
  }, inst, mixture, { salt: seasonSalt(), concurrency: CONCURRENCY });
  const probed = await probing;
  // A capacity or configuration failure is not the agent's price: never charge from a partial measurement.
  if (hostFailure) throw hostFailure;
  // An agent the measurement saw read `random` (on inputs the probe's sample may have missed) makes no deterministic claims.
  const { warnings: _w, ...profile } = measured.randomized ? { ...probed, deterministic: false, constant: false, idempotent: false } : probed;
  const warnings = futilityWarnings(profile);
  const { n: probedCount, ...futility } = profile;
  const measureMs = performance.now() - started;
  if (usesClause) { price.parts.commitClause = COMMIT_CLAUSE_BITS; price.cost += COMMIT_CLAUSE_BITS; }
  const breakdown: CostBreakdown = { read: measured.expectedRead, change: measured.expectedChange };
  const d = measured.diagnostics;
  const diagnostics = [
    `Summon price ${price.cost.toFixed(1)} bits (${inspection.complexityFunctionId}: structure ${inspection.parts.structure.toFixed(1)}, names ${inspection.parts.names.toFixed(1)}, literals ${inspection.parts.literals.toFixed(1)}, literal moves ${price.parts.literalMoves.toFixed(1)}${usesClause ? `, commit clause ${COMMIT_CLAUSE_BITS.toFixed(2)}` : ""}).`,
    `Each act: about ${measured.expectedActCost.toFixed(2)} bits = reading ${measured.expectedRead.toFixed(2)} + changing ${measured.expectedChange.toFixed(2)} (an act pays what it reads, plus its change only when it changes the object; there is no fixed charge).`,
    `Measured on ${d.n} reference objects${measured.randomized ? " (it uses random)" : ""}: changes ${(100 * d.changeRate).toFixed(0)}%, skips ${(100 * d.skipRate).toFixed(0)}%, invalid or failing ${(100 * d.invalidRate).toFixed(0)}%${d.errors.length ? ` (${d.errors.map(([e, n]) => `${e} ×${n}`).join(", ")})` : ""}; mutators ${d.mutators.join(", ") || "none"}.`,
  ];
  diagnostics.push(`Two passes over a sample world of ${probedCount} objects: ${(100 * futility.successRate).toFixed(0)}% of its acts succeed (first pass ${(100 * futility.firstPass).toFixed(0)}%, second ${(100 * futility.secondPass).toFixed(0)}%).`);
  if (sample.value !== undefined) {
    diagnostics.push(sample.error ? `On object 1 it fails: ${sample.error.slice(0, 300)}`
      : `On object 1 it returns ${sample.calls!.length > 300 ? `${sample.calls!.slice(0, 300)}…` : sample.calls}.`);
  }
  return {
    cost: price.cost, parts: price.parts, complexityFunctionId: inspection.complexityFunctionId,
    expectedActCost: measured.expectedActCost, breakdown, randomized: measured.randomized,
    changeRate: d.changeRate, invalidRate: d.invalidRate, skipRate: d.skipRate, futility, warnings: [...warnings],
    diagnostics, runs, measureMs,
  };
}
