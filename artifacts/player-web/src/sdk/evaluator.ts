/**
 * Your own utility function, evaluated in the browser: the same TypeScript kid card the engine runs
 * and the same shipped calibration tables, so a local score of a value equals the engine's score of
 * that value for you. Use it for "what if": score a hypothetical value, or apply mutator calls to a
 * live object and see the change before an agent ever tries it.
 *
 * It knows only YOUR descriptor (from the server's own-utility query). Opponents' utility functions
 * are never available to a client, so peer aggregates of hypothetical values cannot be computed here.
 *
 * The calibration tables are large, so the scoring libraries load lazily, on first use.
 */
import type { GameSettings, ObjectValue } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import type { ActOutcome, MutatorCallWire } from "@workspace/game-types";

/** Your score of one value: the ordinal, reward bits (surprisal), optional penalty bits, and net bits. */
export type OwnScore = { ordinal: number | number[]; rewardBits: number; penaltyBits?: number; netBits: number };

export type Evaluator = {
  /** Your score of any value of this game's object type (wire form, as in `object.value`). */
  score(value: ObjectValue): OwnScore;
  /** Apply mutator calls (`[["paint", {...}], ...]`) to a value: the engine's validation, result and act cost. */
  apply(value: ObjectValue, calls: readonly MutatorCallWire[]): ActOutcome;
};

const bits = (x: number) => (x === 0 ? 0 : x);

/** Build an evaluator for a game's settings and your descriptor (loads the scoring libraries once). */
export async function createEvaluator(settings: GameSettings, descriptor: UtilityDescriptor): Promise<Evaluator> {
  const [core, utilities, types] = await Promise.all([
    import("@workspace/game-core"), import("@workspace/game-utilities"), import("@workspace/game-types"),
  ]);
  const inst = core.instantiationOf(settings);
  const prior = settings.priorId === utilities.UNIFORM_PRIOR.id ? utilities.UNIFORM_PRIOR : undefined;
  if (!prior) throw new Error(`Unknown prior ${settings.priorId}`);
  const tableOf = (draw: { familyId: string; params: UtilityDescriptor["params"] }) => {
    const table = utilities.tableFor(draw, inst, prior);
    if (!table) throw new Error(`No calibration table for ${draw.familyId} in ${inst.key}`);
    return table;
  };
  const reward = utilities.evaluator(descriptor, inst), rewardTable = tableOf(descriptor);
  const penalty = descriptor.penalty ? { fn: utilities.evaluator(descriptor.penalty, inst), table: tableOf(descriptor.penalty) } : undefined;
  const typeDef = types.objectType(inst.objectType);
  return {
    // Mirrors the engine's scoring (createUtilitiesAdapter.score in the engine): keep the two in step.
    score(value) {
      const ordinal = reward(value);
      const rewardBits = bits(utilities.surprisal(rewardTable, ordinal));
      if (!penalty) return { ordinal, rewardBits, netBits: bits(core.netBits({ rewardBits }, settings.penaltyWeight)) };
      const penaltyBits = bits(core.softHinge(utilities.surprisal(penalty.table, penalty.fn(value))));
      return {
        ordinal, rewardBits, penaltyBits,
        netBits: bits(core.netBits({ rewardBits, penaltyBits, penaltyMeanBits: utilities.penaltyMeanBits(penalty.table) }, settings.penaltyWeight)),
      };
    },
    apply(value, calls) {
      return types.applyCalls(typeDef, inst, value, JSON.stringify(calls));
    },
  };
}
