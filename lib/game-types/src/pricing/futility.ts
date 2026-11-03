/**
 * Summon-time futility probe (docs/rules-design.md §11): run the agent over a small sample world, twice, as the engine
 * would (uniqueness included), and say when most of its acts will fail:
 *
 * - constant: different objects get the same result, so only one object can ever hold it and every other act collides;
 * - idempotent: acting again on its own result changes nothing, so it acts once per object, then wastes acts;
 * - identity: it never changes an object.
 *
 * The success rate is over both passes. Constant and idempotent are claims about a deterministic agent (no run read
 * `random`); a randomized one gets the success rate only. A deterministic agent runs once per distinct value. Pure:
 * the caller supplies the runner (the sandbox) and the sample (the game's objects first, then the reference mixture).
 */
import { applyCalls, DEFAULT_COST_KNOBS } from "../mutators.ts";
import { objectType } from "../registry.ts";
import type { Instantiation, ObjectTypeDef, ObjectValue } from "../types.ts";
import type { AgentRun, RunActs } from "./measure.ts";
import { deriveSeed } from "./rng.ts";

/** Sample objects at most (each costs up to two sandbox runs). */
export const PROBE_OBJECTS = 16;

export interface FutilityProfile {
  /** Sample objects (distinct values). */
  readonly n: number;
  /** No run read `random`: the same input always gives the same act. */
  readonly deterministic: boolean;
  /** At least two objects changed, all to one value. */
  readonly constant: boolean;
  /** Acting again on any result it produced changes nothing. */
  readonly idempotent: boolean;
  /** No sample object changed. */
  readonly identity: boolean;
  /** Share of sample objects changed by the first pass, and by the second. */
  readonly firstPass: number;
  readonly secondPass: number;
  /** Share of all acts of both passes that changed their object (the expected success rate). */
  readonly successRate: number;
  /** One line each, for the owner. Empty when nothing is wrong. */
  readonly warnings: readonly string[];
}

type Result = { ok: true; value: ObjectValue } | { ok: false; reason: string };

const pct = (x: number) => `${Math.round(100 * x)}%`;
const isRun = (x: unknown): x is AgentRun => typeof x === "object" && x !== null && !Array.isArray(x) && "calls" in x;

export async function probeFutility(run: RunActs, inst: Instantiation, values: readonly ObjectValue[],
  opts: { salt: string | Uint8Array; concurrency?: number }): Promise<FutilityProfile> {
  const typeDef = objectType(inst.objectType) as ObjectTypeDef<unknown>;
  const sample = [...new Set(values)].slice(0, PROBE_OBJECTS);
  const n = sample.length;
  let randomized = false;
  const once = async (value: ObjectValue, pass: number, i: number): Promise<Result> => {
    let res: unknown;
    try { res = await run(value, deriveSeed(opts.salt, ["futility", inst.key, pass, i]), { index: i, replicate: pass, component: "futility" }); }
    catch (e) { return { ok: false, reason: `run failed: ${(e as Error).message}` }; }
    const r: AgentRun = isRun(res) ? res : { calls: res };
    if (r.usedRandom) randomized = true;
    if (r.error) return { ok: false, reason: r.error };
    const out = applyCalls(typeDef, inst, value, r.calls, DEFAULT_COST_KNOBS);
    return out.ok ? { ok: true, value: out.value } : { ok: false, reason: out.reason };
  };
  // A deterministic agent's result on a value is reused (it is the same act).
  const known = new Map<ObjectValue, Result>();
  const all = async (inputs: readonly ObjectValue[], pass: number) => {
    const out = new Array<Result>(inputs.length);
    let next = 0;
    const worker = async () => {
      while (next < inputs.length) {
        const i = next++, cached = randomized ? undefined : known.get(inputs[i]);
        out[i] = cached ?? await once(inputs[i], pass, i);
        if (!randomized) known.set(inputs[i], out[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, inputs.length)) }, worker));
    return out;
  };
  /** One pass over the world in order, uniqueness enforced as the engine does: the changed count. */
  const state = [...sample], occupied = new Set<ObjectValue>(sample);
  const pass = (results: readonly Result[]) => {
    let changed = 0;
    results.forEach((r, i) => {
      if (!r.ok || occupied.has(r.value)) return;
      occupied.delete(state[i]); occupied.add(r.value); state[i] = r.value; changed++;
    });
    return changed;
  };

  const first = await all(sample, 0);
  const outputs = [...new Set(first.flatMap(r => (r.ok ? [r.value] : [])))];
  const changedInputs = first.filter(r => r.ok).length;
  const s1 = pass(first);
  // Idempotence: the agent on each of its own results (a deterministic agent's second pass reuses these runs).
  const again = !randomized && outputs.length ? await all(outputs, 2) : [];
  const s2 = pass(await all([...state], 1));
  const deterministic = !randomized;
  const identity = changedInputs === 0;
  const constant = deterministic && changedInputs >= 2 && outputs.length === 1;
  const idempotent = deterministic && again.length > 0 && again.every(r => !r.ok);
  const successRate = n ? (s1 + s2) / (2 * n) : 0;
  const rate = `in a sample world of ${n} objects, ${pct(successRate)} of its acts succeed`;
  const warnings: string[] = [];
  if (identity) warnings.push(`It never changes an object (${n} tried): every act would fail and still cost energy.`);
  else if (constant) warnings.push(`It gives every object the same result, so only one object can ever hold this value; every other act will collide (${rate}). Make the result depend on the object.`);
  else if (idempotent) warnings.push(`Applying it twice changes nothing more: it acts once per object, then wastes acts (${rate}). Make each act change something new.`);
  else if (successRate < 0.5) warnings.push(`Most of its acts fail: ${rate} over two passes (results collide with other objects' values or change nothing).`);
  return { n, deterministic, constant, idempotent, identity, firstPass: n ? s1 / n : 0, secondPass: n ? s2 / n : 0, successRate, warnings };
}
