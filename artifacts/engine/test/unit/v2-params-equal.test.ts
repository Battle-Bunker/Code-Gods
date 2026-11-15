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
 * Staircase's runs) is compared by bits minus the rung's code cost (the coordinator's declared TRIAL, 15 Nov):
 * a climb pays Δφ to reach a rung, so equal bits per unit of code cost is equal opportunity per unit of energy. Its best
 * and median knots differ by design (each peer's first rung is a different number). Prime Staircase's rung is the run's
 * length, costed as the cheapest whole line with that run; peers are compared on the rungs all their values reach. Prime
 * Landing's rungs are windows (a landing that rounds to the prime), whose cheapest line jumps about from rung to rung,
 * so it is compared by its best and median knots like any other family.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { valueRecord } from "../../convex/v2/values.ts";
import { dealablePool, familyOf } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";
import { LINE_Q_CODES } from "@workspace/v2-linear";

/**
 * Ladder families: the code cost of a rung (from the main part's value), or null where the knot is not on a rung.
 * Prime Staircase: the rung is the run's length
 * L (the whole part of run + 1/(2 + d)), costed as the cheapest whole line (m, c) whose run is at least L.
 */
/** A rung: its key (knots with one key are on one rung) and its code cost. */
type Rung = readonly [key: string, cost: number];
const LADDER_COST: Readonly<Record<string, (u: string, params: Record<string, unknown>) => Rung | null>> = {
  // Whole Crossing: the rung is the level j (the crossing 5^j × t, t leaving r when divided by 5). A level is a level
  // whatever r: the climb between levels is the same ×5 (a stretch or zoom), so peers are compared level by level on
  // their bits (cost 0). Subtracting the cheapest y-intercept's code instead over-corrects (t = 1 against t = 2).
  // Smooth Intercept: the rung is the level ℓ (the whole part of u on a rung, u ≥ 1): a level is reached by one more of
  // the dealt primes multiplied in, a stretch by one of them, whatever the set, so peers are compared level by level.
  "smooth-intercept": u => {
    const [n, d = "1"] = u.split("/");
    const level = BigInt(n!) / BigInt(d);
    return !u.startsWith("-") && level >= 1n ? [String(level), 0] : null;
  },
  // Prime Gradient: the rung is the level of digits (the whole part of u on a rung, u ≥ 1), compared level by level.
  "prime-gradient": u => {
    const [n, d = "1"] = u.split("/");
    const level = BigInt(n!) / BigInt(d);
    return !u.startsWith("-") && level >= 1n ? [String(level), 0] : null;
  },
  "whole-crossing": u => (/^\d+$/.test(u) ? [u, 0] : null),
  // The two-line valuation ladders (Whole Answer, High Start, Steep Ratio; lib/v2-pair families.ts): the score is
  // q^L × (1 + 1/(1 + d)) on level L ≥ 0 (below 1 off the ladder), so the rung is L, the largest with q^L ≤ the score,
  // costed as its cheapest number's code (the coordinator's call 19). Unlike Whole Crossing's one base, peers here have
  // q 5 or 7: at cost 0 a q-7 level is about 2 bits rarer than a q-5 one, which its bigger number pays for.
  "whole-answer": (u, p) => valuationRung(u, p),
  "high-start": (u, p) => valuationRung(u, p),
  "steep-ratio": (u, p) => valuationRung(u, p),
  "prime-staircase": (u, p) => {
    const [n, d = "1"] = u.split("/"), L = Number(BigInt(n!) / BigInt(d));
    const cost = L >= 1 ? staircaseCosts(p.ends as number)[L] : undefined;
    return cost === undefined ? null : [String(L), cost];
  },
};
/** A valuation ladder's level from its score (null off the ladder, below 1). */
function valuationRung(u: string, p: Record<string, unknown>): Rung | null {
  const [n, d = "1"] = u.split("/"), num = BigInt(n!), den = BigInt(d), q = BigInt(p.q as number);
  if (num < den) return null;
  let L = 0;
  while (q ** BigInt(L + 1) * den <= num) L++;
  // The cheapest number on rung L: q^T(L) × m, T(L) = L(L + 1)/2, m the smallest |m| leaving r (r or r − q).
  const r = BigInt(p.r as number), m = r < q - r ? r : q - r, cheapest = q ** BigInt((L * (L + 1)) / 2) * m;
  return [String(L), LINE_Q_CODES.c.bits(cheapest)];
}
const isPrime = (n: bigint) => { if (n < 2n) return false; for (let i = 2n; i * i <= n; i++) if (n % i === 0n) return false; return true; };
const STAIRCASE_COSTS = new Map<number, number[]>();
/** costs[L]: the least code cost of a whole line (m, c) whose y(0), y(1), … start with at least L different primes ending in k. */
function staircaseCosts(k: number): number[] {
  const hit = STAIRCASE_COSTS.get(k);
  if (hit) return hit;
  const costs: number[] = [];
  for (let c = BigInt(k); c < 5000n; c += 10n) {
    if (!isPrime(c)) continue;
    for (let m = -600n; m <= 600n; m += 10n) {
      let L = 0;
      for (let t = c, seen = new Set<bigint>(); t > 0n && isPrime(t) && !seen.has(t) && L < 40; t += m) { seen.add(t); L++; }
      const bits = LINE_Q_CODES.c.bits(c) + LINE_Q_CODES.a.bits(m);
      for (let l = 1; l <= L; l++) costs[l] = Math.min(costs[l] ?? Infinity, bits);
    }
  }
  STAIRCASE_COSTS.set(k, costs);
  return costs;
}
/** Per rung: the least bits on the rung − the rung's code cost. */
function ladderExcess(knots: readonly { u: unknown; bits: number }[], rung: (u: string) => Rung | null): Map<string, number> | null {
  const least = new Map<string, number>();
  for (const k of knots) {
    if (!Array.isArray(k.u) || typeof k.u[0] !== "string") continue;
    const r = rung(k.u[0]);
    if (r === null) continue;
    least.set(r[0], Math.min(least.get(r[0]) ?? Infinity, k.bits - r[1]));
  }
  return least.size ? least : null;
}
/**
 * The median excess over the rungs every peer's values reach (Prime Staircase: run 1 for all endings, runs 2 and 3
 * only where sampling saw them), or over all its rungs where peers share none (a family whose peers' rungs are different numbers).
 */
function ladderMedians(maps: readonly Map<string, number>[]): number[] {
  const shared = [...maps[0]!.keys()].filter(key => maps.every(m => m.has(key)));
  return maps.map(m => {
    const xs = (shared.length ? shared.map(key => m.get(key)!) : [...m.values()]).sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)]!;
  });
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

test("a family's parameter peers in a dealable pool have the same top and spread of worth", () => {
  const problems: string[] = [];
  for (const preset of PRESETS) {
    const drifts = preset.driftSeconds > 0;
    const peers = new Map<string, { params: string; top: Est; median: Est; exact: Est | null; ladder: Map<string, number> | null }[]>();
    for (const r of dealablePool(preset)) {
      const v = valueRecord(r.ruleKey);
      if (!v) continue;
      const key = `${r.family}/${r.tieBreaker}`;
      peers.set(key, [...(peers.get(key) ?? []), { params: JSON.stringify(r.params), top: top(v.knots as readonly Knot[]), median: median(v.knots as readonly Knot[]), exact: familyOf(r.family).main.sense === "min" ? exactMain(v.knots as readonly Knot[]) : null,
        ladder: LADDER_COST[r.family] ? ladderExcess(v.knots as never, u => LADDER_COST[r.family]!(u, r.params as Record<string, unknown>)) : null }]);
    }
    for (const [family, rs] of peers) {
      if (rs.length < 2) continue;
      const exact = rs.every(r => r.exact !== null), ladder = rs.every(r => r.ladder !== null);
      for (const field of ladder ? ["ladder"] as const : exact ? ["exact"] as const : ["top", "median"] as const) {
        // A ladder compares point medians; sampled knots compare intervals (the highest lo less the lowest hi).
        const xs: Est[] = field === "ladder" ? ladderMedians(rs.map(r => r.ladder!)).map(x => ({ lo: x, hi: x })) : rs.map(r => r[field]!);
        const gap = Math.max(...xs.map(x => x.lo)) - Math.min(...xs.map(x => x.hi));
        if (gap > (ladder ? TOLERANCE : drifts ? DRIFT_TOLERANCE : TOLERANCE)) problems.push(`${preset.id} ${family}: ${field} intervals ${gap.toFixed(2)} bits apart across ${rs.map(r => r.params).join(", ")}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
