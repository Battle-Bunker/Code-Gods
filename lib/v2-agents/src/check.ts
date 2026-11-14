/**
 * `check(program)`: what the forge's Check button and `agent.check` report (integration plan §1.4). It runs the
 * program once on each sample object in the sandbox, against the real host, without spending anything, and prices
 * summoning it. Its shape is the `agent.check` affordance's result (lib/v2-affordances ops/agents.ts).
 */
import type { ObjectType, Variant } from "@workspace/v2-core";
import type { Sandbox } from "@workspace/v2-sandbox";
import { runAct, type ActRecord, type Program } from "./act.ts";
import type { RuleRef } from "./host.ts";
import { summonBits } from "./summon.ts";

export interface CheckInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly rule: RuleRef;
  readonly program: Program;
  /** The objects to try it on, with the ids to report them by. */
  readonly samples: readonly { readonly objectId: string; readonly state: S }[];
  readonly energy: number;
}

export interface CheckReport {
  readonly verdict: "works" | "warns" | "fails" | "rejected";
  readonly summary: string;
  /** The summon price in energy. */
  readonly price: number;
  readonly sample: readonly { readonly objectId: string; readonly outcome: ActRecord["outcome"]; readonly reason?: string }[];
  /** Each sample's full act record (calls, reads by view, charge), for the forge's details and the assistant. */
  readonly acts: readonly ActRecord[];
}

export async function check<S>(sandbox: Sandbox, input: CheckInput<S>): Promise<CheckReport> {
  const price = summonBits(input.program.language, input.program.source).energy;
  const acts: ActRecord[] = [];
  for (const [i, s] of input.samples.entries()) {
    const { record } = await runAct(sandbox, {
      type: input.type, variant: input.variant, state: s.state, rule: input.rule, program: input.program,
      seed: String(i + 1), energy: input.energy, object: i, liveObjects: input.samples.length,
    });
    acts.push(record);
    if (record.code === "COMPILE") break;   // the same on every sample
  }
  const sample = acts.map((a, i) => ({ objectId: input.samples[i]!.objectId, outcome: a.outcome, ...(a.reason ? { reason: a.reason } : {}) }));
  const n = acts.length, committed = acts.filter(a => a.outcome === "committed").length, failed = acts.filter(a => a.outcome === "failed");
  const p = (x: number) => `${Math.round(x * 10) / 10} ⚡`;
  if (n === 0) return { verdict: "warns", summary: `There were no sample lines to try it on. Summoning it costs ${p(price)}.`, price, sample, acts };
  if (acts[0]?.code === "COMPILE") return { verdict: "rejected", summary: `The program does not run: ${acts[0].reason}`, price, sample, acts };
  if (failed.length === n) return { verdict: "fails", summary: `It failed on every sample: ${failed[0]!.reason}`, price, sample, acts };
  const spend = acts.reduce((t, a) => t + a.charge, 0) / n;
  const summary = `It made a change on ${committed} of ${n} sample lines, spending about ${p(spend)} a turn. Summoning it costs ${p(price)}.`;
  if (failed.length) return { verdict: "warns", summary: `${summary} It failed on ${failed.length}: ${failed[0]!.reason}`, price, sample, acts };
  if (committed === 0) return { verdict: "warns", summary: `${summary} It never changed a line: check that it returns moves.`, price, sample, acts };
  return { verdict: "works", summary, price, sample, acts };
}
