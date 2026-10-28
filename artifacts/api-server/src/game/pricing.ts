/**
 * Open-agent pricing on the server (lib/grid-lab open-agents.md; lib/game-types/src/pricing; lib/game-runtime).
 *
 *   summon price      = description bits of the source (ast-bits-v1 / ts-ast-bits-v1-uniform)
 *                       + each literal move: MOVE_FLAG_BITS + log2 #available + D(fields) if valid here,
 *                         else its fallback bits                                    paid once, by the god
 *   per-act charge    = decisionBits (the measured I(X; A)) + pointwise erasure + whole-act motion + floor
 *                       (a failed or duplicate act: decisionBits + floor)          paid by the agent
 *
 * decisionBits and expectedActCost are measured at summon by RUNNING the agent on the reference mixture
 * (season-salted uniform + structured values, plus the live objects as the "game" component), with the
 * measurement seeds of the pricing API; randomized agents are replicated. The agent is never read.
 */
import { instantiationOf, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { MOVE_FLAG_BITS, type Inspection } from "@workspace/game-runtime";
import {
  availableMutators, measureAgent, referenceMixture, withComponents, type Instantiation, type ReferenceMixture,
} from "@workspace/game-types";
import { isAgentFault, requireAdapters } from "./adapters";
import { seasonCommitment, seasonSalt } from "./season";

/** Live objects added to the mixture as its "game" component (at most). */
export const GAME_COMPONENT = 16;
/** Measurement runs in flight at once: the runtime admits four. */
const CONCURRENCY = 4;

export type CostBreakdown = { decision: number; erasure: number; motion: number; floor: number };
export type SummonParts = { structure: number; names: number; literals: number; moveFlags: number; literalMoves: number };
export type Examination = {
  /** Summon price in bits. */
  cost: number; parts: SummonParts; complexityFunctionId: string;
  decisionBits: number; expectedActCost: number; breakdown: CostBreakdown; randomized: boolean;
  diagnostics: string[]; runs: number; measureMs: number;
};

const lg = (x: number) => (x > 1 ? Math.log2(x) : 0);

/** The summon price of an inspection: its own bits plus each literal move, priced by the host. */
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
  return { cost: inspection.cost + literalMoves, parts: { ...inspection.parts, literalMoves } };
}

const mixtures = new Map<string, ReferenceMixture>();
/** The season's reference mixture of an instantiation (cached per instantiation and salt commitment). */
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

/** Throws with `agentFault` for the agent's own compile errors; host failures propagate as they are. */
export async function examineAgent(settings: GameSettings, source: string, live: readonly ObjectValue[]): Promise<Examination> {
  const { runtime } = requireAdapters();
  const inst = instantiationOf(settings);
  let inspection: Inspection;
  try { inspection = await runtime.inspect(source, settings); }
  catch (error) {
    if (!isAgentFault(error)) throw error;
    throw Object.assign(new Error((error as Error).message.slice(0, 1000)), { agentFault: true });
  }
  const price = summonPrice(inspection, inst);
  const game = live.slice(0, GAME_COMPONENT);
  const mixture = game.length ? withComponents(seasonMixture(inst), { game }) : seasonMixture(inst);
  let hostFailure: unknown, runs = 0;
  const sample = { value: undefined as ObjectValue | undefined, calls: undefined as string | undefined, error: undefined as string | undefined };
  const started = performance.now();
  const measured = await measureAgent(async (value, seed, at) => {
    runs++;
    try {
      const result = await runtime.act(source, value, settings, seed);
      if (at.component === "game" && at.replicate === 0 && sample.value === undefined) Object.assign(sample, { value, calls: result.calls });
      return { calls: result.calls, usedRandom: result.usedRandom, steps: result.steps };
    } catch (error) {
      if (!isAgentFault(error)) { hostFailure ??= error; throw error; }
      if (at.component === "game" && at.replicate === 0 && sample.value === undefined) Object.assign(sample, { value, error: (error as Error).message });
      return { calls: "[]", error: (error as Error).message.slice(0, 200) };
    }
  }, inst, mixture, { salt: seasonSalt(), perActFloorBits: settings.perActFloorBits, concurrency: CONCURRENCY, byComponent: false });
  // A capacity or configuration failure is not the agent's price: never charge from a partial measurement.
  if (hostFailure) throw hostFailure;
  const measureMs = performance.now() - started;
  const breakdown: CostBreakdown = { decision: measured.decisionBits, erasure: measured.expectedErasure,
    motion: measured.expectedMotion, floor: measured.perActFloorBits };
  const d = measured.diagnostics;
  const diagnostics = [
    `Summon price ${price.cost.toFixed(1)} bits (${inspection.complexityFunctionId}: structure ${inspection.parts.structure.toFixed(1)}, names ${inspection.parts.names.toFixed(1)}, literals ${inspection.parts.literals.toFixed(1)}, literal moves ${price.parts.literalMoves.toFixed(1)}).`,
    `Each act: ${measured.expectedActCost.toFixed(2)} bits expected = decision ${measured.decisionBits.toFixed(2)} + erasure ${measured.expectedErasure.toFixed(2)} + motion ${measured.expectedMotion.toFixed(2)}${measured.perActFloorBits ? ` + floor ${measured.perActFloorBits}` : ""}.`,
    `Measured on ${d.n} reference objects${measured.randomized ? ` × ${d.replicates} seeds (it uses random)` : ""}: changes ${(100 * d.changeRate).toFixed(0)}%, invalid or failing ${(100 * d.invalidRate).toFixed(0)}%${d.errors.length ? ` (${d.errors.map(([e, n]) => `${e} ×${n}`).join(", ")})` : ""}; mutators ${d.mutators.join(", ") || "none"}.`,
  ];
  if (sample.value !== undefined) {
    diagnostics.push(sample.error ? `On object 1 it fails: ${sample.error.slice(0, 300)}`
      : `On object 1 it returns ${sample.calls!.length > 300 ? `${sample.calls!.slice(0, 300)}…` : sample.calls}.`);
  }
  return {
    cost: price.cost, parts: price.parts, complexityFunctionId: inspection.complexityFunctionId,
    decisionBits: measured.decisionBits, expectedActCost: measured.expectedActCost, breakdown, randomized: measured.randomized,
    diagnostics, runs, measureMs,
  };
}
