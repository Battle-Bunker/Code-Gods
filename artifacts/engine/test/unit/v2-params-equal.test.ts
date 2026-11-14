/**
 * Parameters make peer rules of equal opportunity (v1's rule, restored as its audit: the owner, 2026-11-04,
 * "Parameters should create peer variations within a rule family without any unfair asymmetry in scoring opportunity
 * between them"; docs/engine-v2/v1-audit.md #27). Within every deployed preset's dealable pool, the rules a family deals
 * with different parameters (same tie-breaker) must reach the same top and have the same spread of worth: their value
 * functions' best knot and median knot agree within TOLERANCE bits.
 *
 * Today every family is dealt with one parameter set, so the audit holds trivially; it fails the day a pool deals peers
 * whose opportunity differs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALUE_RECORDS } from "../../convex/v2/values.gen.ts";
import { dealablePool } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";

const TOLERANCE = 0.5;
const top = (knots: readonly { bits: number }[]) => knots.reduce((m, k) => Math.max(m, k.bits), 0);
const median = (knots: readonly { bits: number }[]) => [...knots].map(k => k.bits).sort((a, b) => a - b)[Math.floor(knots.length / 2)] ?? 0;

test("a family's parameter peers in a dealable pool have the same top and spread of worth", () => {
  const problems: string[] = [];
  for (const preset of PRESETS) {
    const peers = new Map<string, { params: string; top: number; median: number }[]>();
    for (const r of dealablePool(preset)) {
      const v = VALUE_RECORDS.find(x => x.ruleKey === r.ruleKey);
      if (!v) continue;
      const key = `${r.family}/${r.tieBreaker}`;
      peers.set(key, [...(peers.get(key) ?? []), { params: JSON.stringify(r.params), top: top(v.knots), median: median(v.knots) }]);
    }
    for (const [family, rs] of peers) {
      if (rs.length < 2) continue;
      for (const field of ["top", "median"] as const) {
        const xs = rs.map(r => r[field]), spread = Math.max(...xs) - Math.min(...xs);
        if (spread > TOLERANCE) problems.push(`${preset.id} ${family}: ${field} differs by ${spread.toFixed(2)} bits across ${rs.map(r => r.params).join(", ")}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
