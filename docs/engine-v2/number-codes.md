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
main layer is constant there); Same on Both Rulers + whole-values and Exact Change + big-piles on `line-z` (two to five
values).

| Variant | Family | Tie-breaker | Status | Rungs within 2% | Converged through rung | Top bits | Steps | Drift flags |
|---|---|---|---|---|---|---|---|---|
| line-q | crossing-check | size | unconverged | 1/35 | 0 | 34.21 ± — | 17.8M | 0 |
| line-q | crossing-check | whole | unconverged | 0/36 | 0 | 10.60 ± 0.38 | 18.9M | 0 |
| line-q | exact-change | big-bill | unconverged | 16/31 | 9 | 19.93 ± 0.77 | 27.6M | 0 |
| line-q | exact-change | big-piles | unconverged | 7/29 | 4 | 29.87 ± 3.92 | 26.8M | 0 |
| line-q | exact-change | prime-coins | unconverged | 23/29 | 23 | 17.04 ± 2.58 | 25.9M | 0 |
| line-q | m-meets-c | meetPrime | unconverged | 35/39 | 36 | 10.92 ± 0.36 | 18.9M | 0 |
| line-q | m-meets-c | size | unconverged | 27/38 | 28 | 19.98 ± 1.27 | 19.3M | 0 |
| line-q | prime-gradient | cPrime | unconverged | 31/40 | 1 | 9.13 ± 0.21 | 18.9M | 0 |
| line-q | prime-gradient | prime | unconverged | 26/36 | 32 | 34.40 ± 3.21 | 19.8M | 0 |
| line-q | prime-landing | big-prime | unconverged | 25/34 | 6 | 22.21 ± 10.17 | 18.4M | 0 |
| line-q | prime-landing | next-prime | converged | 34/34 | 34 | 5.66 ± 0.06 | 30.2M | 0 |
| line-q | prime-landing | prime-gradient | flagged | 34/34 | 34 | 9.46 ± 0.17 | 30.2M | 0 |
| line-q | prime-staircase | first-prime | unconverged | 5/19 | 8 | 39.68 ± 9.13 | 21.1M | 0 |
| line-q | prime-staircase | last-prime | unconverged | 5/18 | 8 | 20.93 ± 1.30 | 21.1M | 0 |
| line-q | prime-staircase | near-miss | unconverged | 11/22 | 4 | — | 21.1M | 1 |
| line-q | prime-staircase | step-back | unconverged | 9/19 | 7 | 15.17 ± 5.49 | 21.0M | 0 |
| line-q | pythagorean-area | prime-height | unconverged | 2/35 | 0 | 13.05 ± 0.33 | 17.5M | 1 |
| line-q | pythagorean-area | slanted-square | unconverged | 8/37 | 0 | 15.15 ± 0.86 | 18.4M | 0 |
| line-q | pythagorean-area | whole-legs | unconverged | 9/35 | 0 | 10.70 ± 0.43 | 17.5M | 0 |
| line-q | ruler | far | unconverged | 0/42 | 1 | 18.18 ± 0.88 | 20.7M | 0 |
| line-q | ruler | prime-gradient | unconverged | 10/40 | 0 | 18.38 ± 4.41 | 19.2M | 0 |
| line-q | ruler | square-area | unconverged | 5/42 | 0 | 12.41 ± 1.03 | 20.1M | 0 |
| line-q | same-on-both-rulers | prime-start | unconverged | 20/36 | 10 | 12.65 ± 1.06 | 17.5M | 0 |
| line-q | same-on-both-rulers | steep | unconverged | 10/38 | 8 | 19.11 ± 2.73 | 18.4M | 0 |
| line-q | same-on-both-rulers | whole-lamp | unconverged | 15/36 | 11 | 9.31 ± 0.21 | 17.5M | 0 |
| line-q | same-on-both-rulers | whole-values | unconverged | 11/37 | 8 | 11.99 ± 0.30 | 20.3M | 0 |
| line-q | square-area | lpf | unconverged | 5/45 | 0 | 31.69 ± 1.48 | 22.1M | 0 |
| line-q | square-area | omega | unconverged | 0/31 | 0 | 23.14 ± 2.57 | 20.3M | 0 |
| line-q | square-area | spf | unconverged | 14/43 | 0 | 30.02 ± 10.63 | 22.1M | 0 |
| line-q | treasure | prime-gradient | unconverged | 3/42 | 1 | 17.87 ± 0.51 | 19.8M | 0 |
| line-q | treasure | prime-terms | unconverged | 3/29 | 4 | 19.02 ± 4.35 | 20.1M | 0 |
| line-q | treasure | square-start | unconverged | 9/42 | 9 | 12.78 ± 0.87 | 19.8M | 0 |
| line-q | triangle-area | even | unconverged | 13/36 | 0 | 23.38 ± 1.75 | 17.8M | 0 |
| line-q | triangle-area | legs | unconverged | 0/37 | 0 | 9.78 ± 0.30 | 18.9M | 0 |
| line-q | whole-intercept | omega | unconverged | 22/27 | 29 | 11.76 ± 1.45 | 30.2M | 0 |
| line-q | whole-intercept | spf | unconverged | 27/37 | 28 | 31.44 ± 2.77 | 18.4M | 0 |
| line-z | crossing-check | size | unconverged | 17/20 | 25 | 10.04 ± 0.24 | 25.3M | 0 |
| line-z | crossing-check | whole | unconverged | 27/28 | 35 | 9.91 ± 0.21 | 31.9M | 0 |
| line-z | exact-change | big-bill | unconverged | 21/31 | 21 | 16.22 ± 0.69 | 27.6M | 0 |
| line-z | exact-change | big-piles | too-coarse | 6/6 | 25 | 9.42 ± 0.12 | 22.8M | 0 |
| line-z | exact-change | prime-coins | unconverged | 27/28 | 27 | 11.83 ± 0.34 | 25.3M | 0 |
| line-z | m-meets-c | meetPrime | converged | 35/35 | 35 | 9.41 ± 0.10 | 31.0M | 0 |
| line-z | m-meets-c | size | unconverged | 8/37 | 7 | 15.10 ± 0.63 | 17.5M | 0 |
| line-z | prime-gradient | cPrime | converged | 35/35 | 35 | 7.56 ± 0.11 | 16.6M | 0 |
| line-z | prime-gradient | prime | unconverged | 19/27 | 20 | 27.38 ± 1.69 | 18.0M | 0 |
| line-z | prime-landing | big-prime | unconverged | 15/22 | 20 | 25.63 ± 1.45 | 24.2M | 0 |
| line-z | prime-landing | next-prime | converged | 20/20 | 20 | 4.24 ± 0.05 | 18.2M | 0 |
| line-z | prime-landing | prime-gradient | converged | 20/20 | 20 | 7.81 ± 0.11 | 18.2M | 0 |
| line-z | prime-staircase | first-prime | unconverged | 9/23 | 12 | — | 30.2M | 0 |
| line-z | prime-staircase | last-prime | unconverged | 6/20 | 9 | 20.39 ± 0.97 | 17.5M | 0 |
| line-z | prime-staircase | near-miss | unconverged | 14/24 | 14 | 15.55 ± 7.48 | 23.7M | 0 |
| line-z | prime-staircase | step-back | unconverged | 11/24 | 11 | 15.70 ± 9.34 | 25.0M | 0 |
| line-z | pythagorean-area | prime-height | unconverged | 31/32 | 34 | 10.26 ± 0.25 | 31.4M | 0 |
| line-z | pythagorean-area | slanted-square | unconverged | 13/29 | 0 | 14.89 ± 0.63 | 18.3M | 0 |
| line-z | pythagorean-area | whole-legs | unconverged | 22/34 | 0 | 9.79 ± 0.23 | 17.5M | 1 |
| line-z | ruler | far | unconverged | 30/33 | 32 | 20.23 ± 0.89 | 31.4M | 0 |
| line-z | ruler | prime-gradient | unconverged | 34/35 | 34 | 11.52 ± 0.27 | 31.4M | 0 |
| line-z | ruler | square-area | flagged | 35/35 | 35 | 11.18 ± 0.21 | 31.4M | 0 |
| line-z | same-on-both-rulers | prime-start | flagged | 33/33 | 35 | 7.03 ± 0.13 | 16.9M | 0 |
| line-z | same-on-both-rulers | steep | unconverged | 21/27 | 9 | 15.04 ± 4.32 | 18.4M | 0 |
| line-z | same-on-both-rulers | whole-lamp | unconverged | 30/35 | 32 | 7.45 ± 0.16 | 17.5M | 0 |
| line-z | same-on-both-rulers | whole-values | too-coarse | 13/15 | 10 | 9.54 ± 0.21 | 20.2M | 0 |
| line-z | square-area | lpf | unconverged | 6/44 | 0 | 30.27 ± 2.88 | 22.1M | 0 |
| line-z | square-area | omega | unconverged | 26/32 | 37 | 21.05 ± 2.87 | 20.3M | 1 |
| line-z | square-area | spf | unconverged | 35/44 | 38 | 40.65 ± 7.35 | 22.1M | 0 |
| line-z | treasure | prime-gradient | unconverged | 31/32 | 31 | 13.86 ± 0.57 | 28.5M | 0 |
| line-z | treasure | prime-terms | unconverged | 26/28 | 32 | 14.37 ± 0.84 | 30.5M | 0 |
| line-z | treasure | square-start | unconverged | 25/33 | 23 | 12.12 ± 0.53 | 29.3M | 0 |
| line-z | triangle-area | even | unconverged | 17/26 | 0 | 8.91 ± 0.15 | 29.6M | 0 |
| line-z | triangle-area | legs | converged | 34/34 | 36 | 8.84 ± 0.14 | 31.9M | 0 |
| line-z | whole-intercept | omega | too-coarse | 0/7 | 27 | — | 30.2M | 0 |
| line-z | whole-intercept | spf | too-coarse | 0/12 | 27 | — | 18.4M | 0 |
