/**
 * Parameters make peer rules of equal opportunity (v1's rule, restored as its audit: the owner, 2026-11-04,
 * "Parameters should create peer variations within a rule family without any unfair asymmetry in scoring opportunity
 * between them"; docs/engine-v2/v1-audit.md #27). Within every deployed preset's dealable pool, the rules a family deals
 * with different parameters (same tie-breaker) must reach the same top and have the same spread of worth: their value
 * functions' best knot and median knot agree within TOLERANCE bits.
 *
 * Where the main part is a distance (sense "min": 0 is exact) and every peer's values reach it, the audit compares the worth of an exact main part (the least bits
 * of a knot whose main part is exact) rather than the best and median knots: for families with few knots (Prime
 * Staircase has three or four) or a sampled top those are sampling artefacts, several bits apart between exact peers
 * (the coordinator, 15 Nov). A preset whose parameters drift (driftSeconds > 0; the coordinator's declared TRIAL) may
 * differ by up to DRIFT_TOLERANCE bits: every seat cycles through the values, so unfairness between them is averaged
 * over the redraws.
 *
 * Sampled knots are compared as estimates (the coordinator, 15 Nov: "a statistical correction, not a loosening"): each
 * compared knot carries its interval (lo–hi), and peers differ when their intervals are more than the band apart (the
 * highest lo less the lowest hi), so two honest peers whose estimates differ by sampling noise pass.
 *
 * A ladder main (design-principles.md: a main part with no top, whose rungs are numbers the code prices, e.g. Prime
 * Landing's primes) is compared by bits minus the rung's code cost (the coordinator's declared TRIAL, 15 Nov): a climb
 * pays Δφ to reach a rung, so equal bits per unit of code cost is equal opportunity per unit of energy. Its best and
 * median knots differ by design (the first rungs are 3, 7, 11 and 19 for endings 3, 7, 1 and 9).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALUE_RECORDS } from "../../convex/v2/values.gen.ts";
import { dealablePool, familyOf } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";
import { LINE_Q_CODES } from "@workspace/v2-linear";

/** Ladder families: the code cost of a rung (the main part's whole value), or null where the knot is not on a rung. */
const LADDER_COST: Readonly<Record<string, (u: string) => number | null>> = {
  "prime-landing": u => (/^\d+$/.test(u) ? LINE_Q_CODES.c.bits(BigInt(u)) : null),
};
/** The median over rungs of (least bits on the rung − the rung's code cost). */
function ladderExcess(knots: readonly { u: unknown; bits: number }[], cost: (u: string) => number | null): number | null {
  const least = new Map<string, number>();
  for (const k of knots) {
    if (!Array.isArray(k.u) || typeof k.u[0] !== "string") continue;
    const c = cost(k.u[0]);
    if (c === null) continue;
    least.set(k.u[0], Math.min(least.get(k.u[0]) ?? Infinity, k.bits - c));
  }
  const xs = [...least.values()].sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)]! : null;
}

const TOLERANCE = 0.5;
const DRIFT_TOLERANCE = 1.0;
type Knot = { u: unknown; bits: number; lo?: number; hi?: number };
/** A knot's estimate as an interval (an exact knot's is its value). */
type Est = { lo: number; hi: number };
const est = (k: Knot | undefined): Est => (k ? { lo: k.lo ?? k.bits, hi: k.hi ?? k.bits } : { lo: 0, hi: 0 });
const byBits = (knots: readonly Knot[]) => [...knots].sort((a, b) => a.bits - b.bits);
const top = (knots: readonly Knot[]) => est(byBits(knots).at(-1));
const median = (knots: readonly Knot[]) => est(byBits(knots)[Math.floor(knots.length / 2)]);
/** The least worth of a knot whose main part is exact (its primary score 0), or null when no knot has it. */
const exactMain = (knots: readonly Knot[]): Est | null => {
  const k = byBits(knots).find(x => Array.isArray(x.u) && x.u[0] === "0");
  return k ? est(k) : null;
};
/** A ladder's excess as a (point) interval. */
const point = (x: number | null): Est | null => (x === null ? null : { lo: x, hi: x });

test("a family's parameter peers in a dealable pool have the same top and spread of worth", () => {
  const problems: string[] = [];
  for (const preset of PRESETS) {
    const drifts = preset.driftSeconds > 0;
    const peers = new Map<string, { params: string; top: Est; median: Est; exact: Est | null; ladder: Est | null }[]>();
    for (const r of dealablePool(preset)) {
      const v = VALUE_RECORDS.find(x => x.ruleKey === r.ruleKey);
      if (!v) continue;
      const key = `${r.family}/${r.tieBreaker}`;
      peers.set(key, [...(peers.get(key) ?? []), { params: JSON.stringify(r.params), top: top(v.knots as readonly Knot[]), median: median(v.knots as readonly Knot[]), exact: familyOf(r.family).main.sense === "min" ? exactMain(v.knots as readonly Knot[]) : null,
        ladder: LADDER_COST[r.family] ? point(ladderExcess(v.knots as never, LADDER_COST[r.family]!)) : null }]);
    }
    for (const [family, rs] of peers) {
      if (rs.length < 2) continue;
      const exact = rs.every(r => r.exact !== null), ladder = rs.every(r => r.ladder !== null);
      for (const field of ladder ? ["ladder"] as const : exact ? ["exact"] as const : ["top", "median"] as const) {
        const xs = rs.map(r => r[field]!), gap = Math.max(...xs.map(x => x.lo)) - Math.min(...xs.map(x => x.hi));
        if (gap > (ladder ? TOLERANCE : drifts ? DRIFT_TOLERANCE : TOLERANCE)) problems.push(`${preset.id} ${family}: ${field} intervals ${gap.toFixed(2)} bits apart across ${rs.map(r => r.params).join(", ")}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
