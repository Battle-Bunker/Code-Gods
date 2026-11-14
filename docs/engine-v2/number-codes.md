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

## Bits per level for the three rules asked about

Value of each rung in bits (± error); "a line there" is a typical line from the chain on that rung, to show the sizes a
player meets.

**Prime Gradient + "the bigger that prime, the better"** (`line-z`): within 13 / 5 / 2 / 1 / exactly: 0.06, 0.16, 0.37,
2.32, 3.84 ± 0.03; then the prime at least 3 / 5 / 7 / 11 / 13 / 17 / 19 / 23: 4.68, 5.85, 7.20, 9.0, 10.4, 12.6 ± 0.6,
14.1 ± 1.0, 16.5 ± 4.7 (y = 23x + 9). On `line-q` the main layer's top is 5.41 and the prime ladder reaches ~16–24 bits
(error 1.5 at the top). Unconverged at 32M steps on the last rungs.

**m Meets c + "they meet at a big number"** (`line-z`): within 13 / 3 / 1 / exactly: 0.22, 0.65, 1.06, 1.67 ± 0.03; then
|c| at least 1 / 2 / 3 / 4 / 6 / 8 / 12 / 16 / 24: 6.30, 7.86, 8.80, 9.42, 10.6, 11.2, 12.5 ± 0.6, 12.9 ± 0.9,
13.8 ± 1.1 (y = 24x + 24). With "they meet at a prime" instead, the rule converges and its main layer snaps to
V(d) = 1.1016 − 0.25·log2(d + 1/4).

**Whole Intercept + smallest prime factor** (the owner's example of decision 12, plain lexicographic): on `line-z` the
main layer is trivial (every intercept is whole), so the rule is **too coarse** there; its tie-breaker ladder alone reads
spf ≥ 2 / 3 / 5 / 7 / 11 / 13 / 17 / 19: 1.65, 3.08, 4.58, 6.02, 7.79, 9.20, 11.2, 12.2 ± 0.4 (y = 19). On `line-q`:
c within 1/3 … exactly: 0.77 … 1.03; then spf ≥ 2 … 19: 3.33, 4.67, 6.17, 7.62, 10.0, 11.3, 14.1 ± 1.2, 15.6 ± 2.2. The
curator's earlier figure (10.6 bits settled for c alone) was under the digits code; under mixed costing a prime
intercept is dear and the ladder reaches ~16 bits.

## Sizes at the top rungs

The lines the chains hold on the top rungs are y = 23x + 9 (Prime Gradient), y = 24x + 24 (m Meets c), y = 19 and
y = −19 (Whole Intercept), y = 17x and y = 19x + 1 on `line-q`: primes in the teens and twenties, as the coordinator
asked ("primes like 23 or 47, not 9973"). The ladders stop at 23 or 24 because the families' thresholds stop there; a
longer ladder would run into rungs above 20 bits, which the default budget does not resolve.

## What did not converge, and the lever

At the default budget only `prime-gradient + cPrime` and `m-meets-c + meetPrime` on `line-z` converge to 2% on every
rung; the others miss on their rarest two or three rungs (errors 0.5–4.7 bits above ~12 bits), and are on
`too-hard-backlog.md`. The lever is the owner's compute parameter (`computeBudget`), or shorter tie-breaker ladders.
On `line-q`, Prime Gradient, m Meets c and Whole Intercept also show the splitting estimate 0.1–0.3 bits below the
eigenvector on mid rungs (flagged in the artefacts): the restricted chains' approximation where the price list is not
quite reversible, which more samples do not remove. The digits-only and steps-only codes are not shipped (decision
17); the digits code's figures are in the milestone-2 report (#356): Prime Gradient top 3.62 bits, m Meets c 1.75.
