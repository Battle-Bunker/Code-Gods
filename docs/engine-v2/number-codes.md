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

## Capped ladders (coordinator's call (g), provisional)

A rule that misses only its rarest rungs is dealt with its ladder capped at the last rung through which every rung
converged (`cap`, `dealable` in each artefact; spec §7.5); a line above the cap scores as the cap. It is not dealt when
it is too coarse, unreachable, or fewer than six rungs converge. Of the 70 artefacts, 42 are dealable (27 of 34 on
`line-z`, 15 of 36 on `line-q`, where many rules miss already on their first rung, at about 3 bits ± 4%). Ruler + far
and Exact Change + big-piles are no longer dealt or calibrated on whole-number variants (they cannot decide anything
there: `Layer.dealtOn`).

**The beginner pool on `line-z` (`lines-beginner`): all 8 families deal.** Capped tops, by tie-breaker:
Prime Staircase 9.1 (first-prime), 8.5 (last-prime), 9.2 (near-miss), 8.4 (step-back); Square Area 8.2 (spf), 6.6
(omega; lpf not dealt); Treasure 11.4 (prime-gradient), 10.9 (prime-terms), 8.1 (square-start); Ruler 9.3
(prime-gradient), 11.2 (square-area); Exact Change 8.9 (big-bill), 9.7 (prime-coins); Prime Landing 7.1 (big-prime),
4.2 (next-prime), 7.8 (prime-gradient); Same on Both Rulers 7.0 (prime-start), 0.3 (steep, capped at its ninth rung),
7.3 (whole-lamp; whole-values too coarse); Pythagorean Area 10.3 (prime-height; slanted-square and whole-legs not
dealt).

| Variant | Family | Tie-breaker | Status | Dealt | Cap (rung) | Cap bits | Uncapped top | Rungs within 2% | Steps | Drift flags |
|---|---|---|---|---|---|--:|---|---|---|---|
| line-q | crossing-check | size | unconverged | no | 0/37 | — | 34.21 | 1/35 | 17.8M | 0 |
| line-q | crossing-check | whole | unconverged | no | 0/40 | — | 10.60 ± 0.38 | 0/36 | 18.9M | 0 |
| line-q | exact-change | big-bill | unconverged | yes | 9/31 | 7.50 | 19.93 ± 0.77 | 16/31 | 27.6M | 0 |
| line-q | exact-change | big-piles | unconverged | no | 4/30 | — | 29.87 ± 3.92 | 7/29 | 26.8M | 0 |
| line-q | exact-change | prime-coins | unconverged | yes | 23/29 | 10.23 | 17.04 ± 2.58 | 23/29 | 25.9M | 0 |
| line-q | m-meets-c | meetPrime | unconverged | yes | 36/40 | 8.61 | 10.92 ± 0.36 | 35/39 | 18.9M | 0 |
| line-q | m-meets-c | size | unconverged | yes | 28/41 | 2.15 | 19.98 ± 1.27 | 27/38 | 19.3M | 0 |
| line-q | prime-gradient | cPrime | unconverged | no | 1/40 | — | 9.13 ± 0.21 | 31/40 | 18.9M | 0 |
| line-q | prime-gradient | prime | unconverged | yes | 32/42 | 5.32 | 34.40 ± 3.21 | 26/36 | 19.8M | 0 |
| line-q | prime-landing | big-prime | unconverged | no | 6/39 | — | 22.21 ± 10.17 | 25/34 | 18.4M | 0 |
| line-q | prime-landing | next-prime | converged | yes | 34/34 | 5.66 | 5.66 ± 0.06 | 34/34 | 30.2M | 0 |
| line-q | prime-landing | prime-gradient | flagged | yes | 34/34 | 9.46 | 9.46 ± 0.17 | 34/34 | 30.2M | 0 |
| line-q | prime-staircase | first-prime | unconverged | no | 8/23 | — | 39.68 ± 9.13 | 5/19 | 21.1M | 0 |
| line-q | prime-staircase | last-prime | unconverged | no | 8/23 | — | 20.93 ± 1.30 | 5/18 | 21.1M | 0 |
| line-q | prime-staircase | near-miss | unconverged | no | 4/23 | — | — | 11/22 | 21.1M | 1 |
| line-q | prime-staircase | step-back | unconverged | yes | 7/23 | 5.63 | 15.17 ± 5.49 | 9/19 | 21.0M | 0 |
| line-q | pythagorean-area | prime-height | unconverged | no | 0/37 | — | 13.05 ± 0.33 | 2/35 | 17.5M | 1 |
| line-q | pythagorean-area | slanted-square | unconverged | no | 0/39 | — | 15.15 ± 0.86 | 8/37 | 18.4M | 0 |
| line-q | pythagorean-area | whole-legs | unconverged | no | 0/37 | — | 10.70 ± 0.43 | 9/35 | 17.5M | 0 |
| line-q | ruler | far | unconverged | no | 1/44 | — | 18.18 ± 0.88 | 0/42 | 20.7M | 0 |
| line-q | ruler | prime-gradient | unconverged | no | 0/40 | — | 18.38 ± 4.41 | 10/40 | 19.2M | 0 |
| line-q | ruler | square-area | unconverged | no | 0/42 | — | 12.41 ± 1.03 | 5/42 | 20.1M | 0 |
| line-q | same-on-both-rulers | prime-start | unconverged | yes | 10/37 | 2.88 | 12.65 ± 1.06 | 20/36 | 17.5M | 0 |
| line-q | same-on-both-rulers | steep | unconverged | yes | 8/39 | 0.80 | 19.11 ± 2.73 | 10/38 | 18.4M | 0 |
| line-q | same-on-both-rulers | whole-lamp | unconverged | yes | 11/37 | 1.39 | 9.31 ± 0.21 | 15/36 | 17.5M | 0 |
| line-q | same-on-both-rulers | whole-values | unconverged | yes | 8/43 | 0.83 | 11.99 ± 0.30 | 11/37 | 20.3M | 0 |
| line-q | square-area | lpf | unconverged | no | 0/47 | — | 31.69 ± 1.48 | 5/45 | 22.1M | 0 |
| line-q | square-area | omega | unconverged | no | 0/43 | — | 23.14 ± 2.57 | 0/31 | 20.3M | 0 |
| line-q | square-area | spf | unconverged | no | 0/47 | — | 30.02 ± 10.63 | 14/43 | 22.1M | 0 |
| line-q | treasure | prime-gradient | unconverged | no | 1/42 | — | 17.87 ± 0.51 | 3/42 | 19.8M | 0 |
| line-q | treasure | prime-terms | unconverged | no | 4/42 | — | 19.02 ± 4.35 | 3/29 | 20.1M | 0 |
| line-q | treasure | square-start | unconverged | yes | 9/42 | 6.63 | 12.78 ± 0.87 | 9/42 | 19.8M | 0 |
| line-q | triangle-area | even | unconverged | no | 0/37 | — | 23.38 ± 1.75 | 13/36 | 17.8M | 0 |
| line-q | triangle-area | legs | unconverged | no | 0/40 | — | 9.78 ± 0.30 | 0/37 | 18.9M | 0 |
| line-q | whole-intercept | omega | unconverged | yes | 29/34 | 3.44 | 11.76 ± 1.45 | 22/27 | 30.2M | 0 |
| line-q | whole-intercept | spf | unconverged | yes | 28/39 | 1.03 | 31.44 ± 2.77 | 27/37 | 18.4M | 0 |
| line-z | crossing-check | size | unconverged | yes | 25/28 | 5.50 | 10.04 ± 0.24 | 17/20 | 25.3M | 0 |
| line-z | crossing-check | whole | unconverged | yes | 35/36 | 9.91 | 9.91 ± 0.21 | 27/28 | 31.9M | 0 |
| line-z | exact-change | big-bill | unconverged | yes | 21/31 | 8.94 | 16.22 ± 0.69 | 21/31 | 27.6M | 0 |
| line-z | exact-change | prime-coins | unconverged | yes | 27/28 | 9.71 | 11.83 ± 0.34 | 27/28 | 25.3M | 0 |
| line-z | m-meets-c | meetPrime | converged | yes | 35/35 | 9.41 | 9.41 ± 0.10 | 35/35 | 31.0M | 0 |
| line-z | m-meets-c | size | unconverged | yes | 7/37 | 0.30 | 15.10 ± 0.63 | 8/37 | 17.5M | 0 |
| line-z | prime-gradient | cPrime | converged | yes | 35/35 | 7.56 | 7.56 ± 0.11 | 35/35 | 16.6M | 0 |
| line-z | prime-gradient | prime | unconverged | yes | 20/38 | 0.36 | 27.38 ± 1.69 | 19/27 | 18.0M | 0 |
| line-z | prime-landing | big-prime | unconverged | yes | 20/27 | 7.05 | 25.63 ± 1.45 | 15/22 | 24.2M | 0 |
| line-z | prime-landing | next-prime | converged | yes | 20/20 | 4.24 | 4.24 ± 0.05 | 20/20 | 18.2M | 0 |
| line-z | prime-landing | prime-gradient | converged | yes | 20/20 | 7.81 | 7.81 ± 0.11 | 20/20 | 18.2M | 0 |
| line-z | prime-staircase | first-prime | unconverged | yes | 12/34 | 9.08 | — | 9/23 | 30.2M | 0 |
| line-z | prime-staircase | last-prime | unconverged | yes | 9/37 | 8.47 | 20.39 ± 0.97 | 6/20 | 17.5M | 0 |
| line-z | prime-staircase | near-miss | unconverged | yes | 14/26 | 9.16 | 15.55 ± 7.48 | 14/24 | 23.7M | 0 |
| line-z | prime-staircase | step-back | unconverged | yes | 11/28 | 8.43 | 15.70 ± 9.34 | 11/24 | 25.0M | 0 |
| line-z | pythagorean-area | prime-height | unconverged | yes | 34/35 | 10.26 | 10.26 ± 0.25 | 31/32 | 31.4M | 0 |
| line-z | pythagorean-area | slanted-square | unconverged | no | 0/38 | — | 14.89 ± 0.63 | 13/29 | 18.3M | 0 |
| line-z | pythagorean-area | whole-legs | unconverged | no | 0/37 | — | 9.79 ± 0.23 | 22/34 | 17.5M | 1 |
| line-z | ruler | prime-gradient | unconverged | yes | 34/35 | 9.27 | 11.52 ± 0.27 | 34/35 | 31.4M | 0 |
| line-z | ruler | square-area | flagged | yes | 35/35 | 11.18 | 11.18 ± 0.21 | 35/35 | 31.4M | 0 |
| line-z | same-on-both-rulers | prime-start | flagged | yes | 35/35 | 7.03 | 7.03 ± 0.13 | 33/33 | 16.9M | 0 |
| line-z | same-on-both-rulers | steep | unconverged | yes | 9/39 | 0.28 | 15.04 ± 4.32 | 21/27 | 18.4M | 0 |
| line-z | same-on-both-rulers | whole-lamp | unconverged | yes | 32/37 | 7.27 | 7.45 ± 0.16 | 30/35 | 17.5M | 0 |
| line-z | same-on-both-rulers | whole-values | too-coarse | no | 10/43 | — | 9.54 ± 0.21 | 13/15 | 20.2M | 0 |
| line-z | square-area | lpf | unconverged | no | 0/47 | — | 30.27 ± 2.88 | 6/44 | 22.1M | 0 |
| line-z | square-area | omega | unconverged | yes | 37/43 | 6.59 | 21.05 ± 2.87 | 26/32 | 20.3M | 1 |
| line-z | square-area | spf | unconverged | yes | 38/47 | 8.19 | 40.65 ± 7.35 | 35/44 | 22.1M | 0 |
| line-z | treasure | prime-gradient | unconverged | yes | 31/32 | 11.40 | 13.86 ± 0.57 | 31/32 | 28.5M | 0 |
| line-z | treasure | prime-terms | unconverged | yes | 32/34 | 10.86 | 14.37 ± 0.84 | 26/28 | 30.5M | 0 |
| line-z | treasure | square-start | unconverged | yes | 23/33 | 8.08 | 12.12 ± 0.53 | 25/33 | 29.3M | 0 |
| line-z | triangle-area | even | unconverged | no | 0/33 | — | 8.91 ± 0.15 | 17/26 | 29.6M | 0 |
| line-z | triangle-area | legs | converged | yes | 36/36 | 8.84 | 8.84 ± 0.14 | 34/34 | 31.9M | 0 |
| line-z | whole-intercept | omega | too-coarse | no | 27/34 | — | — | 0/7 | 30.2M | 0 |
| line-z | whole-intercept | spf | too-coarse | no | 27/39 | — | — | 0/12 | 18.4M | 0 |
