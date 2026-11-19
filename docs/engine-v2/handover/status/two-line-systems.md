# Status: two-line systems (pairs), worker session, 15–16 November

Written from the session's own context on 20 Nov, with no new investigation. Labels: **built** (merged and tested),
**seen narrowly** (a measurement under stated assumptions), **guess** (conjecture).

## 1. What I was asked to do
- Build and tune the two-line ("pair") object type and its rule families for the non-default preset `lines-pairs`,
  under the coordinator's orders and design-principles.md.
- Work items: the pair law; trial 31 (zero coefficients rarer in the pair law); ladder tails capped by witnesses;
  single large jumps; frozen tops; rung geometry; row 3 and 3a tie-breakers; Whole Answer's under-dealing; collapse
  test 2.
- Then, on 16 Nov:
  - play `lines-pairs` end to end in a browser;
  - design pair families in the owner's tuple shape (3b), undealt;
  - port "gravity" (size-based codes) to the pair law. Paused by the owner before I started it.

## 2. Merged (all into develop)
- **#847** pair law trial 31, pair cards, beginner economy for `lines-pairs`, the energy gate covering pairs.
- **#856** ladder-log tails fitted between rungs, and the per-level tie-breaker value (`TieBreakerLevels`).
- **#990**:
  - trial 36: rung windows of 1/(L + 2) and the `sys.zoom` mutator;
  - trial 37: tie-breakers tied to the level's number, three or more per family;
  - pair deals redraw the seats' numbers before reshuffling families;
  - the 1-bit-a-halving distance rate.
- **#1058** the end-page chart crash (empty series in `LineChart`): **built**.
- **#1021, #1027, #1032** docs only: docs/engine-v2/two-line-tuples.md (walk-throughs for Power Ratio, Prime Crossing
  and Power Crossing), plus scripts/pair-tuples.ts and scripts/prime-crossing-tree.ts.
- **Unmerged:** none. No open branch or PR holds work in progress.

## 3. Unfinished plan (next steps, if pairs ever return)
1. Port the gravity law to pair-q. The gravity session's line code was never on origin; my proposal was its
   per-coefficient code applied to both lines.
2. Regenerate the pair values. Re-measure, under the current energy and utility model rather than my rarity tails:
   the level bits, exact against near, the energy gate, and the share of value a cheap move keeps.
3. Rewrite Power Ratio, Power Crossing and Prime Crossing as one-number utilities (decision 50), not tuples.
4. Close Far Crossing's third form (two forms only: prime readings were unequal between q 7 and 11) and the row-7
   form caps (exempted in v2-rule-check).

## 4. Obstacles, and lessons not already in the docs
- **Every exploit the energy gate found was extrapolation** (seen narrowly, gate climbs with one seat's income):
  - an unmeasured level priced by a lower level's curve;
  - a fitted rate past sparse data (a distance curve ran at 4 bits a halving and paid 34 bits);
  - a one-point curve from a −10¹⁹ floor (25 bits for an ordinary state).
  - Lesson: never let a value rise faster past the data than its witnesses allow. Distances rise at most 1 bit a
    halving, which is exact for a smooth density.
- **Aligned hills from shortcuts** (seen narrowly, energy gate): "N shares a factor with X" climbs with any stretch
  or zoom that multiplies both numbers (52, 41 and 38 bits). "Near a multiple" and "smallest prime factor of a sum"
  pull against the shortcut. On a valuation ladder, read N without its factors of q.
- **Exact rungs freeze seats** (seen narrowly, rung-hold.ts): almost every single move breaks an exact angle or a
  whole number. Windows helped modestly: moves that keep the level went from 7–53% to 12–55%.
- **Fairness between parameters** (built, v2-params-equal): any whole-number relation to a k-sized number is about
  log₂ k rarer for a bigger k. Relative forms (a share of the target) or a size form pass.
- **Lexicographic knots give a tie-breaker about 0 bits** when the main score is near-continuous (seen narrowly).
  This motivated the per-level conditional curve.
- **The tuple tree stalls** at the first exact target unless its inner terms are bounded (seen narrowly: Prime
  Crossing went from 2 to 14 primes per greedy climb with the inner terms bounded at 2 bits). tree-value.ts also
  stops past the largest measured target, which is a top of its own.
- **Tooling:**
  - Regenerating the pair values took 30–45 minutes on 4 parallel processes, which was the main time cost.
  - `values-cli --params` fails for pair families; use `--all-params`.
  - Starter code in the guest cannot use bigint literals; write `BigInt(0)`.
  - The kit's `whole()` rounds a half up; match the engine to it.
  - The local engine on port 3399 survives across turns; reuse it, don't start a second.
- **Test-2 confound** (guess): the economy changed W from 314 to 2,530 energy between runs, so the hit rates across
  dates are not comparable.

## 5. Obsolete since the 16–17 Nov rebuild (one-number utilities, energy as bits of surprise)
- **Obsolete** (guess, from CLAUDE.md as it now stands; I have not read the rebuild):
  - every tie-breaker design: trial 37, row 3a and the per-level `TieBreakerLevels` curves;
  - the ladder-log tails and the witness caps in their current form;
  - test-2 figures quoted against the old valuation;
  - the tuple walk-throughs as written. Their cards and cheap-move tables may still serve as raw material for
    one-number utilities.
- **Probably still useful:**
  - the pair object type, its law and mutators, including `sys.zoom` with its size floor;
  - the pair deal's seating rule and entry redraws;
  - the chart fix;
  - the lessons in §4 about extrapolation and aligned shortcuts, which apply to any value curve.
