# Number codes and mixed costing (owner decision 17, 14 November 2026)

The owner: "Use mixed costing now. I like that." This file states the price list v2 uses for the line and what it does
to the stationary law and to rule values. Numbers come from `pnpm --filter @workspace/v2-valuation law` and `calibrate`
(seed "v2", default budget 32M walk steps per rule); every artefact is committed under `lib/v2-valuation/artefacts/`.

## The price list

- **The number code** (what a read costs, and the potential that confines the walk): a whole number is written by its
  prime factorisation, each prime p costing STEP·p bits, STEP = 1/2:
  `mixedPos(n) = ½ Σ e·p + log2 Z` (log2 Z ≈ 2.10), `mixedInt(0) = 1`, `mixedInt(±n) = 2 + mixedPos(n)`. Kraft sum 1, so
  the law is normalisable on the unbounded variants. 23 costs 15.6 bits, 24 costs 8.6; 47 costs 27.6, 48 costs 9.6.
  φ(line) = mixedInt(m) + mixedInt(c) on `line-z`, mixedInt over the primitive triple (a, b, c) on `line-q`.
- **Additive moves, by steps** (cost proportional to the amount added): shift, tilt, step, slide, pivot (its anchor and
  its turn), nudge and intercept moves. A nonzero integer k costs 1 + ½(|k| − 1) + 1.77 bits (±1: 2.77, ±4: 4.27,
  ±10: 7.27); a nonzero rational p/q costs 1 + ½(|p| − 1) + ½(q − 1) + 3.54; a value that may be 0 adds 1 bit.
- **Multiplicative moves, by digits**: `mach.stretch(f)` costs the gamma code of f (×2: 4 bits, ×½: 4 bits, ×6: 7 bits),
  and its inverse ×1/f costs the same, so it is always available. The reciprocal (`cart.mirror` in y = x) is a choice of
  4 (2 bits).
- Every call also pays log2 9 (which mutator) and the **confining surcharge** max(0, φ(after) − φ(before)) (decision 11).

Under this list the walk is close to detailed balance (reversibility 0.00–0.07 on levels), so the stationary law is close
to 2^−φ: energy is the mixed code, "roughly the shortest arithmetic description" of the line.

## Where the stationary mass sits

| Variant | Largest \|number\| in the line holding 50% / 90% / 99% of the mass | Frequency of 23 against 24, 47 against 48 |
|---|---|---|
| `line-z` (y = mx + c, whole m and c) | 2 / 20 / 162 | 3 : 679; 0 : 270 (in 200,000 numbers) |
| `line-q` (rational lines) | 1 / 12 / 81 | 2 : 256; 0 : 74 |

Gravity is strong and selective: smooth numbers (12, 16, 18, 24, 27, 32) are common, primes above 20 almost absent from
random play. That is what makes prime-seeking rules valuable.

## Calibration on the joint ladder (PR 5, 14 November)

Value follows the order (spec §4.4): a dealt rule is valued on the joint ladder of (main level, tie-breaker level)
pairs in lexicographic order. The tie-breaker has three rungs at each main level below the top and all of its rungs at
the top. Every artefact under `lib/v2-valuation/artefacts/` was regenerated with seed "v2" at the default budget (32M walk
steps): 72 rules (13 families, each with each of its tie-breakers, on `line-z` and `line-q`), 38 s each on average
(four running at once on four cores).

**Seeding and equilibration.** Every rung is seeded from enumeration (`line-z`: |m| ≤ 40, |c| ≤ 120; `line-q`:
|a|, |b| ≤ 12, |c| ≤ 60), or failing that by a climb. Each chain then makes 2,000 unsampled moves before sampling. The
equilibration check (spec §7.2 step 6) compares each chain's rate into the next rung in the first and second halves of
its samples. The comparison is paired across the 8 independent replicates, so its error bar accounts for autocorrelation.
A drift of more than 4 standard errors and more than 2 points flags the rung. As a negative control, Prime Gradient
with no burn-in drifts by 27 and 48 points on rungs 26–27 (4.1 and 4.4 SE) and is flagged; this control is a test.
With the default burn-in, one rung is flagged in each of 4 of the 72 runs (the Drift flags column below).

**Converged at 32M:** Prime Gradient + cPrime (top 7.56 ± 0.11), m Meets c + meetPrime (9.41 ± 0.10), Triangle Area +
legs (8.84 ± 0.14), Prime Landing + prime-gradient (7.81 ± 0.11) and Prime Landing + next-prime (4.24 ± 0.05), all on
`line-z`, plus Prime Landing + next-prime on `line-q` (5.66 ± 0.06). Every other rule meets the target on most rungs
but misses on its rarest, at 15–40 bits. Those are the prime-size and factor rungs that the curator's one-rung-per-prime
ladders reach (a prime gradient of 29 is 26 bits). The "Rungs within 2%" column counts the rungs that met the target.
More budget, or shorter prime ladders, is the lever (owner decision 4).

**The owner's example (decision 12), Whole Intercept + smallest prime factor, on `line-q`** (on `line-z` every
intercept is whole, so the main layer is constant and the rule is too coarse):
c within 1/3 of a whole number, nearest whole number's spf 1: 0.77 ± 0.02 bits. The same with spf ≥ 5: 0.85 ± 0.02.
c within 1/4, spf ≥ 5: 0.93 ± 0.02. c whole, spf ≥ 5: 6.28 ± 0.09. c whole, spf ≥ 11: 10.25 ± 0.43. Top (c whole,
spf ≥ 31): 31.4 ± 2.8 (unconverged).

**Prime Gradient + "the bigger that prime"** (`line-z`): gradient within 2 of a prime: 0.36. With a prime ≥ 7 nearby:
2.26. Within 1: 2.36. A prime gradient: 3.84 ± 0.07, then ≥ 11: 9.0, ≥ 13: 10.3, ≥ 17: 12.9 ± 0.5, ≥ 19: 15.7 ± 0.6,
≥ 23: 17.5 ± 3.8, ≥ 31: 27.4 ± 1.7.

**Too coarse** (a dealt layer with fewer than 6 distinct values over all samples): Whole Intercept on `line-z` (its
main layer is constant there); Same on Both Rulers + whole-values on `line-z`, and Exact Change + big-piles there (now not dealt on whole-number lines) (two to five
values).

## Exact values (owner decision 19)

Prices are an exact potential (#427), so on `line-z` the values are exact sums over lines (spec §7.2). The figures
above this section came from the simulation under the earlier price list. The values now committed are below. Of the
34 `line-z` pairings:

- **Exact to the top: 15.** No simulation was run for them; every rung is certified within 2%.
- **Hybrid: 16.** Exact low rungs, the simulation above where it converges, capped as in call (g).
- **Too coarse: 3.** Whole Intercept, whose main layer is constant on whole-number lines, and Same on Both Rulers +
  whole-values.
- **Dealable: 31.**

`line-q` has no exact law yet and is simulated under the new prices: 8 of 36 are dealable. Three hybrids are flagged
where a converged simulated rung missed the exact value by 0.13–0.16 bits (about 3.5σ): Exact Change + prime-coins,
Pythagorean Area + prime-height, and Prime Staircase + first-prime. That is the restricted chains' known bias; the
exact value is the one dealt.

**The beginner pool on `line-z`: each family's best dealt top against the curator's reference** (layered-line-rules.md
§9.2 and §9.5; the curator's enumeration is offset by about 1.6 bits in normalisation, analytic-calibration.md §3):

| Family | Best dealt top (bits) | How | Curator's reference |
|---|--:|---|--:|
| Square Area | 22.79 ± 0.40 (spf ≥ 31) | exact (band: 2\|m\| = t², c a multiple of t) | 22.6 (spf ≥ 29) |
| Prime Landing | 19.36 ± 0.00 (prime ≥ 31) | exact (separable) | 23.7 (prime ≥ 37; exact there: 22.10) |
| Treasure | 15.18 (prime-terms); 14.18 exact (prime-gradient) | hybrid; exact (band) | 16.8 |
| Pythagorean Area | 13.87 (slanted-square) | hybrid (exact to rung 38 of 38) | 13.8 |
| Same on Both Rulers | 11.20 ± 0.12 (steep) | hybrid | 15.8 |
| Prime Staircase | 10.74 ± 0.13 (near-miss) | hybrid (exact to 8 bits) | 22.8 |
| Exact Change | 9.77 ± 0.12 (big-bill) | hybrid | 16.3 |
| Ruler | 8.89 ± 0.15 (prime-gradient) | hybrid | 23.1 |

The owner has asked that families be chosen so an exact valuation exists. The curator's re-proposed pool
(layered-line-rules.md §10.5) keeps Prime Landing, Square Area, Treasure, Same on Both Rulers, Prime Gradient and Prime
Staircase (over the primes, as a band), adds Whole Crossing and Divisibility Ladder, and drops Ruler, Exact Change and
Pythagorean Area. It is implemented next.

| Variant | Family | Tie-breaker | Status | Dealt | Exact rungs | Dealt to rung | Dealt top (bits) |
|---|---|---|---|---|---|---|--:|
| line-q | crossing-check | size | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | crossing-check | whole | unconverged | no | 0/40 | 0/40 | 0.00 ± 0.00 |
| line-q | exact-change | big-bill | unconverged | yes | 0/31 | 18/31 | 8.34 ± 0.14 |
| line-q | exact-change | big-piles | unconverged | yes | 0/30 | 25/30 | 10.46 ± 0.13 |
| line-q | exact-change | prime-coins | unconverged | no | 0/29 | 0/29 | 0.00 ± 0.00 |
| line-q | m-meets-c | meetPrime | unconverged | no | 0/40 | 3/40 | 0.80 ± 0.03 |
| line-q | m-meets-c | size | unconverged | no | 0/41 | 3/41 | 0.67 ± 0.02 |
| line-q | prime-gradient | cPrime | unconverged | yes | 0/40 | 35/40 | 6.06 ± 0.06 |
| line-q | prime-gradient | prime | unconverged | yes | 0/42 | 24/42 | 5.17 ± 0.10 |
| line-q | prime-landing | big-prime | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | prime-landing | next-prime | unconverged | yes | 0/34 | 14/34 | 4.06 ± 0.08 |
| line-q | prime-landing | prime-gradient | unconverged | no | 0/34 | 5/34 | 0.73 ± 0.03 |
| line-q | prime-staircase | first-prime | unconverged | no | 0/23 | 5/23 | 7.79 ± 0.14 |
| line-q | prime-staircase | last-prime | unconverged | no | 0/23 | 4/23 | 5.48 ± 0.08 |
| line-q | prime-staircase | near-miss | unconverged | no | 0/23 | 1/23 | 0.46 ± 0.03 |
| line-q | prime-staircase | step-back | unconverged | yes | 0/23 | 7/23 | 6.04 ± 0.09 |
| line-q | pythagorean-area | prime-height | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | pythagorean-area | slanted-square | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | pythagorean-area | whole-legs | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | ruler | far | unconverged | no | 0/44 | 0/44 | 0.00 ± 0.00 |
| line-q | ruler | prime-gradient | unconverged | no | 0/40 | 0/40 | 0.00 ± 0.00 |
| line-q | ruler | square-area | unconverged | no | 0/42 | 0/42 | 0.00 ± 0.00 |
| line-q | same-on-both-rulers | prime-start | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | same-on-both-rulers | steep | unconverged | no | 0/39 | 9/39 | 0.82 ± 0.01 |
| line-q | same-on-both-rulers | whole-lamp | unconverged | no | 0/37 | 8/37 | 0.67 ± 0.03 |
| line-q | same-on-both-rulers | whole-values | unconverged | no | 0/43 | 0/43 | 0.00 ± 0.00 |
| line-q | square-area | lpf | unconverged | no | 0/47 | 20/47 | 2.51 ± 0.04 |
| line-q | square-area | omega | unconverged | no | 0/43 | 0/43 | 0.00 ± 0.00 |
| line-q | square-area | spf | unconverged | no | 0/47 | 0/47 | 0.00 ± 0.00 |
| line-q | treasure | prime-gradient | unconverged | yes | 0/42 | 7/42 | 4.92 ± 0.09 |
| line-q | treasure | prime-terms | unconverged | yes | 0/42 | 20/42 | 8.41 ± 0.15 |
| line-q | treasure | square-start | unconverged | no | 0/42 | 0/42 | 0.00 ± 0.00 |
| line-q | triangle-area | even | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | triangle-area | legs | unconverged | no | 0/40 | 0/40 | 0.00 ± 0.00 |
| line-q | whole-intercept | omega | unconverged | no | 0/34 | 24/34 | 0.99 ± 0.03 |
| line-q | whole-intercept | spf | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-z | crossing-check | size | hybrid | yes | 27/28 | 27/28 | 6.51 ± 0.09 |
| line-z | crossing-check | whole | hybrid | yes | 27/36 | 36/36 | 9.89 ± 0.15 |
| line-z | exact-change | big-bill | hybrid | yes | 16/31 | 24/31 | 9.77 ± 0.12 |
| line-z | exact-change | prime-coins | flagged | yes | 18/28 | 23/28 | 8.81 ± 0.16 |
| line-z | m-meets-c | meetPrime | exact | yes | 35/35 | 35/35 | 9.47 ± 0.00 |
| line-z | m-meets-c | size | exact | yes | 37/37 | 37/37 | 13.32 ± 0.00 |
| line-z | prime-gradient | cPrime | exact | yes | 35/35 | 35/35 | 7.78 ± 0.00 |
| line-z | prime-gradient | prime | exact | yes | 38/38 | 38/38 | 19.36 ± 0.00 |
| line-z | prime-landing | big-prime | exact | yes | 27/27 | 27/27 | 19.36 ± 0.00 |
| line-z | prime-landing | next-prime | exact | yes | 20/20 | 20/20 | 4.46 ± 0.00 |
| line-z | prime-landing | prime-gradient | exact | yes | 20/20 | 20/20 | 7.78 ± 0.00 |
| line-z | prime-staircase | first-prime | flagged | yes | 8/34 | 12/34 | 9.10 ± 0.10 |
| line-z | prime-staircase | last-prime | hybrid | yes | 8/37 | 12/37 | 8.82 ± 0.09 |
| line-z | prime-staircase | near-miss | hybrid | yes | 11/26 | 15/26 | 10.74 ± 0.13 |
| line-z | prime-staircase | step-back | hybrid | yes | 10/28 | 14/28 | 8.96 ± 0.16 |
| line-z | pythagorean-area | prime-height | flagged | yes | 35/35 | 35/35 | 9.93 ± 0.00 |
| line-z | pythagorean-area | slanted-square | hybrid | yes | 38/38 | 38/38 | 13.87 ± 0.00 |
| line-z | pythagorean-area | whole-legs | exact | yes | 37/37 | 37/37 | 10.03 ± 0.00 |
| line-z | ruler | prime-gradient | hybrid | yes | 28/35 | 33/35 | 8.89 ± 0.15 |
| line-z | ruler | square-area | hybrid | yes | 28/35 | 34/35 | 8.65 ± 0.11 |
| line-z | same-on-both-rulers | prime-start | hybrid | yes | 35/35 | 35/35 | 7.31 ± 0.01 |
| line-z | same-on-both-rulers | steep | hybrid | yes | 37/39 | 37/39 | 11.20 ± 0.12 |
| line-z | same-on-both-rulers | whole-lamp | exact | yes | 37/37 | 37/37 | 7.51 ± 0.01 |
| line-z | same-on-both-rulers | whole-values | too-coarse | no | 43/43 | 43/43 | 9.78 ± 0.05 |
| line-z | square-area | lpf | exact | yes | 47/47 | 47/47 | 20.98 ± 0.12 |
| line-z | square-area | omega | exact | yes | 43/43 | 43/43 | 11.24 ± 0.00 |
| line-z | square-area | spf | exact | yes | 47/47 | 47/47 | 22.79 ± 0.40 |
| line-z | treasure | prime-gradient | exact | yes | 32/32 | 32/32 | 14.18 ± 0.00 |
| line-z | treasure | prime-terms | hybrid | yes | 34/34 | 34/34 | 15.18 ± 0.00 |
| line-z | treasure | square-start | exact | yes | 33/33 | 33/33 | 11.93 ± 0.00 |
| line-z | triangle-area | even | hybrid | yes | 33/33 | 33/33 | 9.20 ± 0.00 |
| line-z | triangle-area | legs | exact | yes | 36/36 | 36/36 | 9.03 ± 0.00 |
| line-z | whole-intercept | omega | too-coarse | no | 34/34 | 34/34 | 5.46 ± 0.04 |
| line-z | whole-intercept | spf | too-coarse | no | 32/39 | 32/39 | 5.88 ± 0.06 |
