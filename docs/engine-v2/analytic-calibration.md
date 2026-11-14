# Analytic calibration of the upper ladder: a feasibility study (14 November 2026)

The owner asked for the upper ladder to be calibrated analytically, chained rung by rung onto the simulated part. This is
the study the coordinator set (five questions); prices and artefacts are unchanged. Code: `lib/v2-valuation/src/cycles.ts`
(cycle diagnostic), `src/exact.ts` (exact sums, dominant states), `study/` (the runs; `study/run.sh` reproduces them in
about ten minutes on four cores, results in `study/results/`), tests in `test/analytic.test.ts`.

## Summary

1. **Why top rungs fail.** Two causes, by family. Prime Landing + big-prime: each rare rung is reached by only 26–29
   upward crossings in 181M steps, and the stitched values above the cap are biased by 6–8 bits (simulated 24.3 and
   27.2 bits where the exact sum gives 17.9 and 19.3), a bias the jackknife error (0.7 bits) does not see. Prime
   Staircase + first-prime: islands: the run-of-six level sets are single lines that no move keeps in the set, so a
   restricted chain sits on its seed (rung 34: 524,288 samples, 0 crossings in) and the rung has no value.
2. **The price list is an exact potential except for one branch of one mutator.** On `line-z` every mutator but
   `gen.nudge` proposes s → t and t → s with equal weight, so the walk is Metropolis on φ and its stationary law is
   π ∝ 2^−φ. `gen.nudge`'s renormalising branch (a nudge of b that divides the line through by 1 + k) is one-way. Worst
   edge 1.84 bits, worst loop 1.17 bits, median 0 over 206,116 loops. The free walk confirms it: P(m = 0) is 0.556
   with the nudge and 0.502 without it, against 0.500 under 2^−φ.
3. **Exact sums work and agree with simulation.** Without the nudge, π(m, c) = p(m)·p(c) with p(n) = 2^−mixedInt(n)
   (Kraft sum exactly 1), so a rung's mass is a sum over lines with a rigorous bound for the lines not enumerated.
   On the four separable beginner pairings, 88 of 91 simulated rungs that converged to 2% agree with the exact value
   within max(3σ, 2%) (worst difference 0.11 bits), and the exact sums reach the top rungs (19.3 bits) with intervals
   of ±0.02 bits. The committed artefacts, which include the nudge, differ by 0.1–0.4 bits mid-ladder.
4. **Without a potential**, the dominant-state estimate (cheapest lines in the rung, minus log2 of their number) is
   within 0.3–0.75 bits of the exact value: a sanity check, not 2%.
5. **Proposal**: drop `gen.nudge`'s renormalising branch, then calibrate each rung by simulation where it converges and
   by the exact ratio above, with two rungs of overlap that must agree.

## 1. Why top rungs fail

From the level matrices of the 256M-step artefacts (#422), per rung: the samples at that level, and the transitions
into it from below (the counts that stitch it to the rest).

| Rung | Simulated bits | Exact bits | Samples at level | Crossings in from below |
|---|--:|--:|--:|--:|
| Prime Landing + big-prime: prime ≥ 19 | 13.49 ± 0.39 | 13.22 | 4,332 | 58 |
| … prime ≥ 23 | 15.94 ± 0.47 | 15.34 | 20,392 | 29 |
| … prime ≥ 29 | 24.32 ± 0.71 | 17.92 | 2,260 | 26 |
| … prime ≥ 31 | 27.16 ± 0.68 | 19.35 | 656 | 28 |
| Prime Staircase + first-prime: run 6, y(0) ≥ 7 | 17.45 ± 1.06 | — | 1,312,860 | 50 (0 upward from it) |
| … run 6, y(0) ≥ 11 | 28.35 ± 2.94 | — | 163,376 | 28 |
| … run 6, y(0) ≥ 13 | 28.44 ± 3.58 | — | 48,968 | 6 |
| … run 6, y(0) ≥ 31 | — | — | 524,288 | 0 |

Prime Landing is the crossing case. The rare level sets are well sampled from inside, and they are connected: one shift
moves c from 23 to 29. But the rate that stitches each to the rung below rests on a few dozen events, and the stitched
value drifts far from the truth: 6.4 bits too high at prime ≥ 29. The replicates agree with one another, so the
jackknife cannot see the bias. Prime Staircase is the island case: every line with a run of six primes is isolated (any
single move breaks the run), so the chain on that upper set never moves, and its level gets no rate at all.

## 2. How far the price list is from a potential

The walk (v2-core `walkStep`) proposes a mutator uniformly and its arguments from their code (probability 2^−bits), and
accepts a growth Δφ of the read length with probability 2^−Δφ. That is Metropolis on φ. Its effective price is
price(s → t) = −log2 q(s → t) + max(0, Δφ), where q sums over every (mutator, arguments) that takes s to t. Around a
loop the Δφ terms telescope, so a cycle's sum of price(s → t) − price(t → s) is the sum of the argument asymmetries
r = log2 q(s → t) / q(t → s).

The diagnostic (`cycleDiagnostic`) covered all 81 lines with |m|, |c| ≤ 4 on `line-z`, every proposal with arguments
up to 16 bits (6,082 edges), and every triangle and square among those lines:

| Mutator | Edges | Asymmetric | One-way | Worst \|log2 ratio\| |
|---|--:|--:|--:|--:|
| si.shift, si.tilt, seq.step, cart.slide, cart.pivot, cart.mirror, int.move, mach.stretch | 13,344 | 0 | 0 | 0 |
| gen.nudge | 3,854 | 216 | 48 | 6.0 |

Over all mutators together: worst edge 1.84 bits, median 0; worst loop 1.17 bits, median 0, over 206,116 loops.

The asymmetry is `gen.nudge`'s renormalisation. On `line-z` a nudge of b gives (a, 1 + k, c). That line is valid only
when 1 + k divides a and c, and then it becomes (a/(1+k), 1, c/(1+k)). It is a division by 1 + k with no inverse
nudge, so it pulls lines towards 0. A free walk of 20M steps measures its effect:

| | P(m = 0) | P(m < 0) | P(gradient > 13 from a prime) |
|---|--:|--:|--:|
| Under 2^−φ (exact) | 0.500 | 0.250 | 0.080 |
| Walk without gen.nudge | 0.502 | 0.249 | 0.080 |
| Walk with gen.nudge (today) | 0.556 | 0.222 | 0.041 |

## 3. Exact rung values under the potential

On `line-z`, φ(m, c) = mixedInt(m) + mixedInt(c), and mixedInt is a prefix code whose Kraft sum is exactly 1, so
π(m, c) = p(m)·p(c) with p(n) = 2^−mixedInt(n). For n ≠ 0, p(±n) = 2^−2 · 2^−½Σe·p / Z, where Z = Π_p (1 − 2^−p/2)^−1.
A rung's value is V_k = −log2 Σ_{level ≥ k} π.

- **Closed forms (Euler products).** The mass of the integers whose smallest prime factor is at least q is
  ½ · (Π_{p ≥ q} (1 − 2^−p/2)^−1 − 1) / Z. Lines that are exactly a prime ≥ t carry Σ_{p ≥ t} 2^−(2 + p/2)/Z, so the
  step from one prime to the next costs about half the prime gap. That is the curator's observation on Square Area's
  spf steps (1.3–2.7 bits): its cheapest exact-square lines are (m, c) = (±2s², 2rs), and the root's spf rungs climb
  through r = p.
- **Exact sums with a rigorous bound** (`exactRungs`, `exactRungsSeparable`). Enumerate every integer within a bit budget,
  cheapest first by prime factorisation (`integersWithin`; within 40 bits: 120,195 integers carrying all but 2^−24.6 of
  the mass). The mass T outside the enumeration bounds the error whatever the rule does there:
  −log2(M_k + T) ≤ V_k ≤ −log2 M_k. A rule whose main part and tie-breaker each depend on one coefficient factorises
  into 1D laws (checked on 400 random lines before use). A general rule needs the 2D sum, and its outside mass falls
  slowly: 5.2M lines (φ ≤ 36) still leave 2^−14, which certifies rungs only up to about 8 bits. The upper rungs of
  non-separable rules therefore need each rule's structure: a linear substitution (Treasure's y(2) = 2m + c,
  Prime Landing's y(1) = m + c, Same on Both Rulers' c ≈ T(1 − m)), or a parametrisation of the exact set (Square
  Area's and Pythagorean Area's areas c²/(2|m|): m = ±2s², c = 2rs), each a 1D or Euler-type double sum.

**Agreement with simulation** (`study/compare.mjs`): exact sums within 40 bits against a 32M-step simulation of the same
walk without `gen.nudge`, on every rung where the simulation converged to 2%:

| Pairing (`line-z`) | Exact: outside mass | Converged simulated rungs | Agree within max(3σ, 2%) | Worst difference | Exact top (bits) |
|---|--:|--:|--:|--:|--:|
| Prime Gradient + prime | 2^−24.6 | 20 | 17 | 0.11 | 19.35 ± 0.02 |
| Prime Gradient + cPrime | 2^−23.6 | 35 | 35 | 0.09 | (converged) |
| Prime Landing + big-prime | 2^−24.6 | 16 | 16 | 0.09 | 19.35 ± 0.02 |
| Prime Landing + prime-gradient | 2^−23.6 | 20 | 20 | 0.09 | (converged) |
| **All** | | **91** | **88** | **0.11** | |

The three misses are low rungs of Prime Gradient + prime at 4σ, with errors near 0.02 bits. They show the restricted
chains' small bias, which the splitting diagnostic also flags. The committed artefacts (with the nudge) differ from
the exact values by 0.1–0.4 bits mid-ladder, and by 7–8 bits at their unconverged tops.

**Against the curator's enumeration** (layered-line-rules.md §9.2), for Prime Landing with c exactly a prime:

| Threshold | Exact | Curator |
|---|--:|--:|
| prime ≥ 37 | 22.10 bits | 23.7 bits |
| prime ≥ 47 | 27.40 bits | 29.0 bits |

The step between them is identical (5.30 against 5.3). The constant 1.6-bit offset is a difference of normalisation,
from the curator's "height 100" box, not of shape.

## 4. Without a potential: the dominant-state estimate

If the prices were not a potential, a rung could still be estimated from its cheapest climb:
V_k ≈ φ_min(U_k) − φ_min(all) − log2(number of lines at φ_min(U_k)), where φ is the minimum net price of reaching
the rung and the count is the number of cheapest paths (`dominantRungs`). Against the exact sums on Prime Gradient
+ prime and Prime Landing + big-prime, the difference is 0.31–0.42 bits median and 1.27 at worst; on rungs above 8 bits,
0.50 median and 0.75 at worst, always low (the estimate leaves out the many slightly dearer lines). That is good enough
for a sanity bound or for ranking rules, not for the 2% target.

## 5. The proposal

**Make the price list an exact potential.** Refuse a `gen.nudge` whose result must be renormalised, that is, any nudge
that leaves the triple with a common factor. On `line-z` that removes every nudge of b; nudges of a and c are untouched.
On `line-q` it removes the nudges that create a common factor. Nothing else changes. The values shift by up to about
0.4 bits mid-ladder and by 0.07 at the bottom (P(m = 0) returns to ½), so every artefact is recalibrated once.

The freedom that remains while the potential stays exact:
- any per-mutator handling fee that is the same in both directions (today log2 9 for every mutator);
- any argument code that prices an argument and its inverse the same (±k, f and 1/f);
- the choice of potential E itself, provided the confining surcharge uses E.

**The hybrid ladder.**
- For each rung, use the simulated value where it converged to 2%.
- Above the last converged rung, chain on the exact rung ratio: V_{k+1} = V_k + (V^exact_{k+1} − V^exact_k).
- Before chaining, the two highest converged rungs (at least) must agree with the exact values within max(3σ, 2%, 0.05
  bits). Otherwise the rule is flagged and capped as today.
- Each exact rung carries its rigorous interval, and the artefact marks it `exact`.

Where a rule has no closed form or factorisation yet, its tail stays capped (call (g)) until one is written. Of the
beginner pairings:
- The four separable ones are done.
- Treasure, Prime Landing + next-prime and Same on Both Rulers need a linear substitution (1D).
- Square Area and Pythagorean Area need the exact-area parametrisation (a double sum).
- Prime Staircase's runs need an enumeration of arithmetic progressions of primes with a sieve bound; this is also the
  only way past its islands.
- Ruler and Exact Change need lattice sums near their curves.

Each of these is a page of code. Each is checked, as here, against every simulated rung that converges.
