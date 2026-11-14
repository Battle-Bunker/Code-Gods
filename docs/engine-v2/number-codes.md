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
above this section came from the simulation under the earlier price list. The values now committed are below.

The owner has asked that families be chosen so an exact valuation exists. The pool is now the curator's
(layered-line-rules.md §10.5): Prime Landing, Square Area, Whole Crossing, Divisibility Ladder, Treasure, Same on Both
Rulers, Prime Gradient and Prime Staircase. Ruler, Exact Change and Pythagorean Area are deleted. Every tie-breaker
of the pool reads one of m or c (or a whole number the main layer fixes), so each pairing sums as `separable` or as a
`band` (spec §12.5). Of the 31 `line-z` pairings:

- **Exact to the top: 18.** No simulation was run for them; every rung is certified within 2%.
- **Hybrid: 11** (one flagged). Exact low rungs, the simulation above where it converges, capped as in call (g).
  Treasure + m-gpf is flagged: the simulation sits 0.4–0.55 bits below the exact value on rungs 27–29, the restricted
  chains' known bias; the exact value is the one dealt.
- **Too coarse: 2.** Whole Intercept, whose main layer is constant on whole-number lines.
- **Dealable: 29.**

`line-q` has no exact law yet and is simulated under the new prices: 3 of 31 are dealable (Prime Gradient + prime, Same on Both Rulers + m-gpf, Treasure +
prime-terms).

**The beginner pool on `line-z`: each family's best dealt top against the curator's reference** (layered-line-rules.md
§9.2, §9.5 and §10.5; the curator's enumeration is offset by about 1.6 bits in normalisation, analytic-calibration.md §3):

| Family | Best dealt top (bits) | How | Curator's reference |
|---|--:|---|--:|
| Prime Staircase | 27.25 ± 0.30 (first-prime) | hybrid (band over the primes; exact to 23 bits) | 22.8 (first prime ≥ 13) |
| Divisibility Ladder | 25.89 ± 0.39 (m-spf); 22.35 exact (m-prime) | hybrid; exact (separable) | — |
| Square Area | 22.79 ± 0.40 (spf ≥ 31) | exact (band: 2\|m\| = t², c a multiple of t) | 22.6 (spf ≥ 29) |
| Treasure | 22.54 ± 0.09 (m-spf) | hybrid (band; y(k) = T as one c per m) | 16.8 (prime terms; 22.63 for m-spf) |
| Prime Gradient | 22.22 ± 0.03 (c-spf) | exact (separable) | — |
| Prime Landing | 22.22 ± 0.03 (m-spf) | exact (separable) | 23.7 |
| Whole Crossing | 21.30 ± 0.14 (k-gpf) | exact (band: c a multiple of m near it) | matches rung for rung |
| Same on Both Rulers | 23.09 ± 0.13 (m-spf) | exact to rung 40 of 40 (fixed point = T as one c per m) | 19.68 (23.22 for m-spf ≥ 19) |

**Why Treasure and Prime Staircase sit above the curator's reference.** They are no disagreement: the references are
for other rungs. Treasure's 16.8 is its old prime-terms tie-breaker. That tie-breaker reads 15.18 here, which equals the
curator's exact value (layered-line-rules.md §10.5, exact class table) once the older reference's 1.6-bit normalisation
offset is removed. The new m-spf and m-gpf tie-breakers reach higher. The curator's own exact values for them are 22.63 and
22.58 at a factor ≥ 23; ours are 22.54 and 22.50. Staircase's 22.8 is "first prime ≥ 13" under the old normalisation.
The exact values agree to the hundredth: ≥ 11 is 19.04 and ≥ 13 is 20.85, both ours and the curator's. Our dealt top is
a higher rung, ≥ 23, at 27.25.

**Point bands.** Where the main layer is exact, c is fixed by m: c = T(1 − m) for Same on Both Rulers and c = T − km for
Treasure. A band of one point per m is then summed at any size, and only m beyond the budget is left outside, bounded by
T(m) times the most one c can weigh. That took Same on Both Rulers from 11.79 (capped) to 23.09, exact to the top, with
steep exact at 13.98, the curator's value.

| Variant | Family | Tie-breaker | Status | Dealt | Exact rungs | Dealt to rung | Dealt top (bits) |
|---|---|---|---|---|---|---|--:|
| line-q | crossing-check | size | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | crossing-check | whole | unconverged | no | 0/40 | 0/40 | 0.00 ± 0.00 |
| line-q | divisibility-ladder | m-gpf | unconverged | no | 0/43 | 0/43 | 0.00 ± 0.00 |
| line-q | divisibility-ladder | m-prime | unconverged | no | 0/27 | 1/27 | 1.42 ± 0.03 |
| line-q | divisibility-ladder | m-spf | unconverged | no | 0/27 | 8/27 | 3.78 ± 0.06 |
| line-q | divisibility-ladder | steep | unconverged | no | 0/43 | 0/43 | 0.00 ± 0.00 |
| line-q | m-meets-c | meetPrime | unconverged | no | 0/40 | 3/40 | 0.80 ± 0.03 |
| line-q | m-meets-c | size | unconverged | no | 0/41 | 3/41 | 0.67 ± 0.02 |
| line-q | prime-gradient | c-gpf | unconverged | no | 0/43 | 8/43 | 0.65 ± 0.03 |
| line-q | prime-gradient | c-spf | unconverged | no | 0/43 | 13/43 | 3.17 ± 0.06 |
| line-q | prime-gradient | prime | unconverged | yes | 0/42 | 24/42 | 5.17 ± 0.10 |
| line-q | prime-landing | big-prime | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | prime-landing | m-gpf | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | prime-landing | m-spf | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | prime-staircase | first-prime | unconverged | no | 0/23 | 5/23 | 7.79 ± 0.14 |
| line-q | same-on-both-rulers | m-gpf | unconverged | yes | 0/37 | 12/37 | 4.58 ± 0.08 |
| line-q | same-on-both-rulers | m-spf | unconverged | no | 0/37 | 8/37 | 0.66 ± 0.02 |
| line-q | same-on-both-rulers | steep | unconverged | no | 0/39 | 9/39 | 0.82 ± 0.01 |
| line-q | square-area | lpf | unconverged | no | 0/47 | 20/47 | 2.51 ± 0.04 |
| line-q | square-area | omega | unconverged | no | 0/43 | 0/43 | 0.00 ± 0.00 |
| line-q | square-area | spf | unconverged | no | 0/47 | 0/47 | 0.00 ± 0.00 |
| line-q | treasure | m-gpf | unconverged | no | 0/42 | 0/42 | 0.00 ± 0.00 |
| line-q | treasure | m-spf | unconverged | no | 0/42 | 5/42 | 5.14 ± 0.10 |
| line-q | treasure | prime-terms | unconverged | yes | 0/42 | 20/42 | 8.41 ± 0.15 |
| line-q | triangle-area | even | unconverged | no | 0/37 | 0/37 | 0.00 ± 0.00 |
| line-q | triangle-area | legs | unconverged | no | 0/40 | 0/40 | 0.00 ± 0.00 |
| line-q | whole-crossing | k-gpf | unconverged | no | 0/40 | 0/40 | 0.00 ± 0.00 |
| line-q | whole-crossing | k-spf | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | whole-crossing | m-spf | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-q | whole-intercept | omega | unconverged | no | 0/34 | 24/34 | 0.99 ± 0.03 |
| line-q | whole-intercept | spf | unconverged | no | 0/39 | 0/39 | 0.00 ± 0.00 |
| line-z | crossing-check | size | hybrid | yes | 27/28 | 27/28 | 6.51 ± 0.09 |
| line-z | crossing-check | whole | hybrid | yes | 27/36 | 36/36 | 9.89 ± 0.15 |
| line-z | divisibility-ladder | m-gpf | hybrid | yes | 50/50 | 50/50 | 25.25 ± 0.25 |
| line-z | divisibility-ladder | m-prime | exact | yes | 48/48 | 48/48 | 22.35 ± 0.03 |
| line-z | divisibility-ladder | m-spf | hybrid | yes | 49/49 | 49/49 | 25.89 ± 0.39 |
| line-z | divisibility-ladder | steep | exact | yes | 54/54 | 54/54 | 21.35 ± 0.02 |
| line-z | m-meets-c | meetPrime | exact | yes | 35/35 | 35/35 | 9.47 ± 0.00 |
| line-z | m-meets-c | size | exact | yes | 37/37 | 37/37 | 13.32 ± 0.00 |
| line-z | prime-gradient | c-gpf | exact | yes | 39/39 | 39/39 | 20.15 ± 0.01 |
| line-z | prime-gradient | c-spf | exact | yes | 39/39 | 39/39 | 22.22 ± 0.03 |
| line-z | prime-gradient | prime | exact | yes | 38/38 | 38/38 | 19.36 ± 0.00 |
| line-z | prime-landing | big-prime | exact | yes | 27/27 | 27/27 | 19.36 ± 0.00 |
| line-z | prime-landing | m-gpf | exact | yes | 27/27 | 27/27 | 20.15 ± 0.01 |
| line-z | prime-landing | m-spf | exact | yes | 27/27 | 27/27 | 22.22 ± 0.03 |
| line-z | prime-staircase | first-prime | hybrid | yes | 32/34 | 32/34 | 27.25 ± 0.30 |
| line-z | same-on-both-rulers | m-gpf | hybrid | yes | 40/40 | 40/40 | 22.93 ± 0.11 |
| line-z | same-on-both-rulers | m-spf | hybrid | yes | 40/40 | 40/40 | 23.09 ± 0.13 |
| line-z | same-on-both-rulers | steep | exact | yes | 39/39 | 39/39 | 13.98 ± 0.00 |
| line-z | square-area | lpf | exact | yes | 47/47 | 47/47 | 20.98 ± 0.12 |
| line-z | square-area | omega | exact | yes | 43/43 | 43/43 | 11.24 ± 0.00 |
| line-z | square-area | spf | exact | yes | 47/47 | 47/47 | 22.79 ± 0.40 |
| line-z | treasure | m-gpf | flagged | yes | 37/39 | 37/39 | 22.50 ± 0.08 |
| line-z | treasure | m-spf | hybrid | yes | 37/39 | 37/39 | 22.54 ± 0.09 |
| line-z | treasure | prime-terms | hybrid | yes | 34/34 | 34/34 | 15.18 ± 0.00 |
| line-z | triangle-area | even | hybrid | yes | 33/33 | 33/33 | 9.20 ± 0.00 |
| line-z | triangle-area | legs | exact | yes | 36/36 | 36/36 | 9.03 ± 0.00 |
| line-z | whole-crossing | k-gpf | exact | yes | 40/40 | 40/40 | 21.30 ± 0.14 |
| line-z | whole-crossing | k-spf | exact | yes | 39/39 | 39/39 | 20.70 ± 0.10 |
| line-z | whole-crossing | m-spf | exact | yes | 39/39 | 39/39 | 19.33 ± 0.04 |
| line-z | whole-intercept | omega | too-coarse | no | 34/34 | 34/34 | 5.46 ± 0.04 |
| line-z | whole-intercept | spf | too-coarse | no | 32/39 | 32/39 | 5.88 ± 0.06 |

## Value functions (owner decision 23)

Thresholds and rungs are gone. A state is worth bits(s) = −log2 π{states whose (primary, secondary) utilities are at
least as good}, at its actual score (spec §7.0). The artefacts are value functions (`lib/v2-valuation/values/`,
`pnpm --filter @workspace/v2-valuation values`): knots with certified intervals, bracketed between knots and
extrapolated beyond them. On `line-z` the exact sums certify knots to 25–30 bits (on the height-capped law the game
plays). On `line-q`, direct draws (a mixture of tilted laws) reach 12–20 bits. The owner's examples, at scores that
were never thresholds:

| Rule | Score | Bits | Certified | Where | Chance |
|---|---|--:|---|---|---|
| Whole Intercept + spf (line-q) | c 1/7 from a whole number | 0.89 | [0.85, 0.92] | between knots | 1 in 2 |
| | c 1/30 from a whole number | 1.06 | [1.03, 1.09] | between knots | 1 in 2 |
| | c whole, smallest prime factor 2 | 2.93 | [2.91, 2.95] | knot | 1 in 8 |
| | c whole, spf 5 | 5.98 | [5.92, 6.03] | knot | 1 in 63 |
| | c whole, spf 13 | 10.71 | [10.50, 10.95] | knot | 1 in 1,669 |
| | c whole, spf 31 | 20.02 | [13.16, ∞] | extrapolated | 1 in about a million |
| Prime Landing + big-prime (line-z) | c 3 from the prime 7 | 0.37 | [0.31, 0.42] | between knots | 1 in 1.3 |
| | c 1 from the prime 23 | 3.31 | exact | knot | 1 in 10 |
| | c = 11 | 8.83 | exact | knot | 1 in 454 |
| | c = 29 | 17.93 | exact | knot | 1 in 250,000 |
| | c = 53 | 30.12 | [29.94, 30.34] | knot | 1 in 1.2 billion |
| | c = 101 | 53.97 | [29.94, ∞] | extrapolated | — |

**Whole Intercept on `line-q`: the primary carries about 1.2 bits.** Under the mixed code 45% of the law's mass has c
whole (b = 1 is the commonest denominator by far). Closeness among non-whole c is worth little: c within 1/2 of a whole
number is 0.23 bits (85% of lines), within 1/3 is 0.59, within 1/7 is 0.89, within 1/30 is 1.06, and whole is 1.16. The
range is all in the secondary: whole with spf ≥ 2 is 2.93 bits, ≥ 5 is 5.98, ≥ 13 is 10.71. That is the law, not an
error. If the owner wants closeness to carry more, these are options; none is applied:
- A fraction variant whose denominator code is flatter (for instance b drawn from a code that gives 1 … D nearly
  equal weight), so a whole c has probability about 1/D and the primary spans about log2 D bits.
- A primary whose exact value is not the commonest case: c close to a prime (Prime Landing), or close to a target T
  that is not whole (c close to T = k + 1/2, say), so landing exactly is rare under the same code.
- Leave the primary as it is and deal Whole Intercept with a secondary (spf, omega) that carries the range, as now.
