/**
 * Which object an opportunity targets (v1's `objectSelection`, restored; v1-audit.md table row 19, archive
 * lib/world.ts pickObject; archive grid-lab docs/explore/spirals.md §9):
 *  - "uniform" (the default): every live object alike;
 *  - "shelter": weight 1/(1 + σ⁺), σ the object's salience (every seat's bits on it added up), so the objects many
 *    players care about are hit a little less and agreements on them last longer. Never weighted towards salience:
 *    v1's measurements found attention a threat to a salient object (α > 0 hurt, α < 0 helped).
 * Pure: the tick and the agents' table both draw with it.
 */
export type ObjectSelection = "uniform" | "shelter";

/** The shelter weight of an object of salience σ: 1/(1 + σ), a σ below 0 counted as 0. */
export const shelterWeight = (salience: number): number => 1 / (1 + Math.max(0, salience));

/** The index of the object an opportunity targets, from the objects' saliences (undefined when there are none). */
export function pickObject(saliences: readonly number[], mode: ObjectSelection, rng: { unit(): number }): number | undefined {
  const n = saliences.length;
  if (n === 0) return undefined;
  if (mode !== "shelter") return Math.min(n - 1, Math.floor(rng.unit() * n));
  const weights = saliences.map(shelterWeight);
  let u = rng.unit() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) { u -= weights[i]!; if (u < 0) return i; }
  return n - 1;
}
