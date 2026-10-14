import { payoffs } from "./model.ts";
import type { Deity, ObjectValue } from "./model.ts";

/** null = identity; any other output = a legal constant agent.
 * One uniformly selected slot runs. Repeating slots changes selection weight,
 * not the game's payoff formula. No deployment/execution cost is invented here.
 */
export function uniformAgentPayoffs(
  gods: readonly Deity[], input: ObjectValue, slots: readonly (ObjectValue | null)[],
): number[] {
  if (!slots.length) throw new RangeError("At least one slot is required");
  const totals = gods.map(() => 0);
  for (const slot of slots) {
    const scores = payoffs(gods.map(g => g.evaluate(slot === null ? input : slot)));
    scores.forEach((score, i) => { totals[i] += score / slots.length; });
  }
  return totals;
}

/** Ordered identity/constant composition: the last writer wins. */
export function composeConstantAgents(input: ObjectValue, outputs: readonly (ObjectValue | null)[]): ObjectValue {
  return outputs.reduce<ObjectValue>((current, output) => output === null ? current : output, input);
}
