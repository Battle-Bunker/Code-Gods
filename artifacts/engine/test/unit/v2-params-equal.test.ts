/**
 * Parameters make peer rules of equal opportunity (v1's rule, restored as its audit: the owner, 2026-11-04,
 * "Parameters should create peer variations within a rule family without any unfair asymmetry in scoring opportunity
 * between them"; docs/engine-v2/v1-audit.md #27). Within every deployed preset's dealable pool, the rules a family deals
 * with different parameters (same tie-breaker) must reach the same top and have the same spread of worth: their value
 * functions' best knot and median knot agree within TOLERANCE bits.
 *
 * Where every peer's main part has an exact value, the audit compares the worth of an exact main part (the least bits
 * of a knot whose main part is exact) rather than the best and median knots: for families with few knots (Prime
 * Staircase has three or four) or a sampled top those are sampling artefacts, several bits apart between exact peers
 * (the coordinator, 15 Nov). A preset whose parameters drift (driftSeconds > 0; the coordinator's declared TRIAL) may
 * differ by up to DRIFT_TOLERANCE bits: every seat cycles through the values, so unfairness between them is averaged
 * over the redraws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALUE_RECORDS } from "../../convex/v2/values.gen.ts";
import { dealablePool } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";

const TOLERANCE = 0.5;
const DRIFT_TOLERANCE = 1.0;
const top = (knots: readonly { bits: number }[]) => knots.reduce((m, k) => Math.max(m, k.bits), 0);
const median = (knots: readonly { bits: number }[]) => [...knots].map(k => k.bits).sort((a, b) => a - b)[Math.floor(knots.length / 2)] ?? 0;
/** The least bits of a knot whose main part is exact (its primary score 0), or null when no knot has it. */
const exactMain = (knots: readonly { u: unknown; bits: number }[]) => {
  const xs = knots.filter(k => Array.isArray(k.u) && k.u[0] === "0").map(k => k.bits);
  return xs.length ? Math.min(...xs) : null;
};

test("a family's parameter peers in a dealable pool have the same top and spread of worth", () => {
  const problems: string[] = [];
  for (const preset of PRESETS) {
    const drifts = preset.driftSeconds > 0;
    const peers = new Map<string, { params: string; top: number; median: number; exact: number | null }[]>();
    for (const r of dealablePool(preset)) {
      const v = VALUE_RECORDS.find(x => x.ruleKey === r.ruleKey);
      if (!v) continue;
      const key = `${r.family}/${r.tieBreaker}`;
      peers.set(key, [...(peers.get(key) ?? []), { params: JSON.stringify(r.params), top: top(v.knots), median: median(v.knots), exact: exactMain(v.knots as never) }]);
    }
    for (const [family, rs] of peers) {
      if (rs.length < 2) continue;
      const exact = rs.every(r => r.exact !== null);
      for (const field of exact ? ["exact"] as const : ["top", "median"] as const) {
        const xs = rs.map(r => r[field]!), spread = Math.max(...xs) - Math.min(...xs);
        if (spread > (drifts ? DRIFT_TOLERANCE : TOLERANCE)) problems.push(`${preset.id} ${family}: ${field} differs by ${spread.toFixed(2)} bits across ${rs.map(r => r.params).join(", ")}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
