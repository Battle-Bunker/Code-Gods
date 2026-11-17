/**
 * Every shipped starter, on every dealt rule of the shipped presets, in both languages, stays within 60% of the act's
 * step limit on big objects, so one costlier secondary or a bigger line cannot make every act fail (round 31: the Prime
 * Landing partner's 47 step-limit failures; 16 November: TypeScript Bold for Treasure at 490,000 of 500,000).
 *
 * What would break: a starter (or a guest helper it calls) whose work per act grows past the margin.
 */
import { lineQ, grid4 } from "./config.ts";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { Qn, type ObjectType, type Variant } from "@workspace/v2-core";
import { gridPresets, gridType } from "@workspace/v2-grid";
import { fromMC, lineType, presets } from "@workspace/v2-linear";
import { DEFAULT_LIMITS } from "@workspace/v2-sandbox";
import { births } from "../src/births.ts";
import { CATALOGUE, runAct, sandboxes, startersFor } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const MARGIN = 0.6 * DEFAULT_LIMITS.stepBudget;
const q = Qn.q;

/** Big lines: steep, far out, fractional (the costliest the starters' searches meet). */
const BIG_LINES = [fromMC(q(997), q(-1234)), fromMC(q(-12, 7), q(355, 113)), fromMC(q(1, 40), q(-2001))];

type Case = { type: ObjectType<any>; variant: Variant; rules: readonly { family: string; params: unknown; tieBreakers: readonly unknown[] }[]; states: readonly unknown[] };
const cases: Case[] = [
  { type: lineType, variant: lineQ, rules: presets.find(p => p.id === "lines-beginner")!.rules, states: BIG_LINES.map(l => ({ lines: [l] })) },
  // The tuple families, not dealt yet, with their first dealable numbers.
  { type: lineType, variant: lineQ, states: BIG_LINES.map(l => ({ lines: [l] })), rules: CATALOGUE.filter(e => e.boundedSimple).flatMap(e => {
    const f = lineType.families.find(x => x.id === e.family), params = f?.dealable(lineQ)[0];
    return f && params ? [{ family: f.id, params, tieBreakers: f.tieBreakers.map(t => t.id).filter(id => e.tieBreakers[id]) }] : [];
  }) },
  { type: gridType as ObjectType<any>, variant: grid4, rules: gridPresets.flatMap(p => p.rules), states: births(gridType as ObjectType<any>, grid4, "budget", 3) },
];

test("every shipped starter stays within 60% of the step limit on big objects, in both languages", { timeout: 900_000 }, async () => {
  const over: string[] = [];
  let acts = 0;
  for (const { type, variant, rules, states } of cases) {
    const seen = new Set<string>();
    for (const r of rules) for (const tb of r.tieBreakers) {
      const tie = tb === null ? null : typeof tb === "string" ? tb : (tb as { id: string }).id;
      const key = `${r.family}/${tie}`;
      if (seen.has(key)) continue;   // the presets deal a family several times with other parameters: one is enough
      seen.add(key);
      const rule = { family: r.family, params: r.params as Record<string, unknown>, tieBreaker: tie };
      for (const language of ["typescript", "python"] as const) {
        let shipped; try { shipped = startersFor(r.family, language, tie); } catch { continue; }
        for (const a of shipped) for (const state of states) {
          const { record } = await runAct(await boxes.get(language), {
            type, variant, state, rule, program: { language, source: a.source }, seed: "1", energy: 500,
          });
          acts++;
          if (record.outcome === "failed" || (record.steps ?? 0) > MARGIN) over.push(`${key} ${a.kind} (${language}) on ${type.encode(state)}: ${record.outcome === "failed" ? record.reason : `${record.steps} steps`}`);
        }
      }
    }
  }
  assert.ok(acts > 300, `${acts} acts`);
  assert.deepEqual(over, [], `over ${MARGIN} steps`);
});
