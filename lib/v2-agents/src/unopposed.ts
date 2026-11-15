/**
 * Unopposed shared directions at a table (owner decision 30; the coordinator's declared trial of "adversary-aware
 * fair-aligned" dealing, step 1: measurement only). A direction is a shared unopposed rise for a set of seated rules
 * when every pair of them rises together along it and no other seated rule opposes it: falls along it, or gives up
 * for it at least OPPORTUNITY_FRACTION of a climber's gain (its opportunity cost). Nothing here changes a deal: the
 * server logs what a dealt table holds, and the collapse check reports it. Everything is precomputed per pair and
 * direction, so a call is a few table lookups (microseconds for a 3–6 seat table).
 *
 * The data is src/tension.gen.ts (scripts/gen-tension.ts, from scripts/tension.ts's measurements).
 */
import { TENSION, type TensionTable } from "./tension.gen.ts";

/**
 * The joint gain (bits per ⚡) below which a shared unopposed rise is "weak", at or above which it is "strong".
 *
 * Set from the measurements printed by `pnpm --filter @workspace/v2-agents gen-tension` (14 November 2026, seed t1):
 *   - the reference is the 247k table's ladder, lines through (p, 0) and (0, 2p) for prime p (y = −2x + 734 at
 *     p = 367): Square Area/spf gains 1.32 and Whole Crossing/k-spf 1.06 bits per bit of read length (the surcharge
 *     the law charges for the bigger numbers), so its joint gain (the smaller) is 1.06 bits per ⚡
 *     (TENSION["line-q"].reference);
 *   - over the 46 cheap directions, the 4,147 (pair, direction) shared rises of the pool (both rules "+" both ways)
 *     have joint gains, along the direction repeated 8 times, of median 0.005, 90th percentile 0.019, 99th percentile
 *     0.036 and at most 0.053 bits per ⚡ (per rule alone: median 0.013, 99th percentile 0.29, at most 2.3).
 * 0.1 admits every measured cheap shared climb with a margin of about 2 over the largest, and is under a tenth of the
 * reference (1/10.6). A strong direction pays two seated rules within an order of magnitude of the stretch-to-367 rate.
 */
export const WEAK_BELOW = 0.1;

/**
 * A seated rule C opposes a climb when its opportunity cost reaches this multiple of a climber's gain: C's best bits
 * one move from the start (or staying put) less its bits where the climb ends, against the climbing rule's gain. Rule
 * design found that small/smooth adversaries cannot fall comparably along a climber's path (their bits at the hill's
 * foot are 0.5–7), so they contest by opportunity cost (the coordinator, 14 November).
 *
 * Set from the measurements printed by `gen-tension` (seed t1; along cheap directions repeated 8 times, a cost counts
 * when it holds in at least half of the climber's rising runs). Opportunity cost at sampled states does not tell
 * adversaries from partners well, because any rule's best one-move gain is a few bits, as large as an 8-step climb's.
 * The share of (rule, direction, other rule) cases where the other is opposed, by the other's signature:
 *     fraction   0.5    1      2      4
 *     "−"        0.97   0.92   0.71   0.32
 *     "0"        0.87   0.75   0.52   0.26
 *     "+"        0.77   0.58   0.33   0.16
 * 2 separates the rules that fall ("−") from those that rise with the climber ("+") the most (0.38 apart); over every
 * (shared rise, third rule) case it opposes 47% (1 would oppose 75%, 0.5 91%: nearly every third rule).
 * On the prime ladders the third rule of the 247k table has an equal-sized peak one move away (a mirror swaps the
 * intercepts): per doubling of p its cost is about 1.1–1.2 × the climbers' gain (Prime Landing 244 bits against Whole
 * Crossing's 219 on (p, 2p)). So at 2 the 247k table's ladders are unopposed (strong); at 1 they would be opposed.
 */
export const OPPORTUNITY_FRACTION = 2;

export interface UnopposedDirection {
  /** The direction's id: a cheap direction ("shift 1", "tilt -1/2", …) or a constructed ladder ("ladder (p, 2p)"). */
  readonly direction: string;
  /** "cheap": one call repeated, measured from sampled states; "ladder": a constructed family of lines (a prime p grown). */
  readonly kind: "cheap" | "ladder";
  /** The seated rules rising together along it, in seat order (deduplicated). */
  readonly rules: string[];
  /** Each rising rule's gain per ⚡ along the direction, aligned with `rules`. */
  readonly gains: number[];
  /** The joint gain per ⚡: the second largest of `gains` (for two rules, the smaller). */
  readonly gainPerEnergy: number;
  readonly strength: "weak" | "strong";
}

/**
 * The shared unopposed rises at a table of rules ("family/tieBreaker") of a variant: for each direction, every maximal
 * set of ≥ 2 seated rules that rise together along it, pairwise ("+" both ways in the measured signatures; on a ladder,
 * each rule's bits grow with p), while no other seated rule opposes any of them. Strongest first.
 *
 * Opposed (the definition shipped): another seated rule C opposes a rising rule A along a cheap direction when climbing
 * A lowers C ("−" in A's signature) or C's opportunity cost along A's climbs reaches OPPORTUNITY_FRACTION of A's gain
 * in at least half of them; on a ladder, when C's bits shrink as p grows, or its median opportunity cost per doubling
 * of p reaches OPPORTUNITY_FRACTION of A's median gain per doubling. (A fall is itself an opportunity cost, so the
 * signature test is kept as part of the definition; both are precomputed.)
 *
 * Rules the table does not know (another variant, an undealt rule) are left out; a variant without a table (grids,
 * for now) has none. Two rules of the same family have no measured signature (the measurement skips them), so they
 * never rise together nor oppose each other here. A rule seated twice counts once.
 *
 * Joint gain: the second largest of the rising rules' gains, i.e. the smaller for a pair. Not the sum: a steep hill
 * with a passenger is one rule's own climb, which decision 30 wants; what makes a shared rise dangerous is how much the
 * second rule gets from it. Not the smallest of a larger set either: the strongest pair inside it is the climb two
 * players can share.
 */
export function unopposedDirections(variant: string, ruleIds: readonly string[]): UnopposedDirection[] {
  const t = TENSION[variant];
  return t ? unopposedIn(t, ruleIds) : [];
}

/** unopposedDirections over a given tension table (the generated one, or a hand-built one in tests). */
export function unopposedIn(t: TensionTable, ruleIds: readonly string[]): UnopposedDirection[] {
  const seated = [...new Set(ruleIds)].map(id => t.rules.indexOf(id)).filter(i => i >= 0);
  if (seated.length < 2) return [];
  const out: UnopposedDirection[] = [];
  const nd = t.directions.length;
  /** The opposition level (how many measured fractions an opportunity cost reaches) that OPPORTUNITY_FRACTION needs. */
  const level = t.opportunityFractions.filter(f => f <= OPPORTUNITY_FRACTION).length;
  for (let d = 0; d < nd; d++) {
    const sig = (a: number, b: number) => t.signatures[a]![b * nd + d]!;
    const costly = (a: number, x: number) => { const l = t.opposition[a]![x * nd + d]!; return l >= "0" && l <= "9" && Number(l) >= level; };
    const sets = maximalSets(seated, (a, b) => sig(a, b) === "+" && sig(b, a) === "+", (a, x) => sig(a, x) === "-" || costly(a, x));
    for (const s of sets) out.push(entry(t, t.directions[d]!.id, "cheap", s, s.map(a => t.gains[a]![d]!)));
  }
  for (const ladder of t.ladders) {
    const g = (a: number) => ladder.gains[a]!;
    const rises = (a: number) => g(a) >= LADDER_SLOPE, falls = (a: number) => g(a) <= -LADDER_SLOPE;
    const costly = (a: number, x: number) => ladder.cost[x]! >= OPPORTUNITY_FRACTION * ladder.doubling[a]!;
    const sets = maximalSets(seated, (a, b) => rises(a) && rises(b), (a, x) => falls(x) || costly(a, x));
    for (const s of sets) out.push(entry(t, ladder.id, "ladder", s, s.map(g)));
  }
  return out.sort((x, y) => y.gainPerEnergy - x.gainPerEnergy);
}

/** On a ladder, a rule rises (falls) when its bits grow (shrink) by at least this many bits per bit of read length. */
export const LADDER_SLOPE = 0.05;

function entry(t: TensionTable, direction: string, kind: "cheap" | "ladder", set: readonly number[], gains: number[]): UnopposedDirection {
  const sorted = [...gains].sort((x, y) => y - x);
  const joint = Math.max(0, sorted[1]!);
  return { direction, kind, rules: set.map(a => t.rules[a]!), gains, gainPerEnergy: joint, strength: joint < WEAK_BELOW ? "weak" : "strong" };
}

/**
 * Every maximal subset (≥ 2) of `seated` whose members pairwise `together`, and against whose every member no seated
 * outsider `opposes` (opposes(member, outsider)). Tables are small (≤ 8 seats), so the subsets are enumerated.
 */
function maximalSets(seated: readonly number[], together: (a: number, b: number) => boolean, opposes: (a: number, x: number) => boolean): number[][] {
  const n = seated.length, ok: number[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const ins = seated.filter((_, i) => mask & (1 << i));
    if (ins.length < 2) continue;
    if (!ins.every((a, i) => ins.every((b, j) => j <= i || together(a, b)))) continue;
    const outs = seated.filter((_, i) => !(mask & (1 << i)));
    if (outs.some(x => ins.some(a => opposes(a, x)))) continue;
    ok.push(mask);
  }
  return ok.filter(m => !ok.some(o => o !== m && (o & m) === m)).map(m => seated.filter((_, i) => m & (1 << i)));
}
