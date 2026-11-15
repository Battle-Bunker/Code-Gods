# Maxima: an audit (owner decision 26)

The owner, 14 November 2026: "I don't want a cap on coefficient size: just a cost function that makes larger numbers
harder to reach. Ideally we want to fit curves to map utility to energy so that the possible energy of an object can be
unbounded. I don't want Maxima anywhere ideally, but if we have to accept some really high maximum possible scores for
some rules because they must have their utility-to-energy relation calculated fully empirically then I will accept this
for the sake of allowing more diversity of rule types."

This is every place a maximum existed on lines and grids when the decision came, what was done with it, and what
removing what is left would take. "Bounded component" below means the rule's own utility has a true top (a distance
reaches 0, a count of cells cannot pass 16): the score cannot improve past it, so its value there is a finite survival,
not a cap we chose.

## Summary

| # | Maximum | Where | Status |
|---|---------|-------|--------|
| 1 | The 10^6 box on line coefficients | `lineParams.heightCap`, `inDomain`, the variants, `capMass` in the exact sums | **Removed** (lines) |
| 2 | Value functions flat past the best knot (fitted tail slope 0 or ~0) | `tailOf` in lib/v2-valuation value.ts | **Removed**: schema 7 tails never saturate |
| 3 | The best knot and `sampledMaxBits` (18) read as "the most a rule pays" | bid phase (`top`, "scores up to"), harness tables ("top") | **Reworded** to "measured to"; the measurement limit stays |
| 4 | Exact Change gave up past 10^5 coin steps (the rule went undefined: worst) | `waysToPay` in lib/v2-linear representations.ts | **Removed**: counted in closed form at any size |
| 5 | Trial division stops at 10^5 (a larger cofactor counts as one prime) | lib/v2-linear numbers.ts, `factorWeight` in v2-core codes.ts | **Kept**: not a maximum on value (see below) |
| 6 | Bounded mains and tie-breakers (distances at 0, counts with a top) | the families | **Kept**: true tops of the rules; listed below |
| 7 | Grid cells 0–9 (`gridParams.cap`) | lib/v2-grid | **Kept for now**: proposal below |
| 8 | The tail's law ceiling, STEP = 0.5 bits per unit | `TAIL_CEILING` | **Added**: a bound on how fast value rises, not on value |
| 9 | Economy: energy capacity, debt ≤ capacity, bids ≤ 100% | lib/v2-economy | **Kept**: caps on spending per act, not on worth |
| 10 | Floats | `valueLookup` | Bits past `Number.MAX_VALUE` read as `Number.MAX_VALUE` |

## 1. The coefficient box (removed)

Every line variant had `heightCap: 1_000_000`: a line with |a|, |b| or |c| past it was invalid ("those numbers are past
the board's limit"), the walk's law was π conditioned on the box, and the exact sums divided by `capMass(10^6)` per
coordinate. Now any size is a state, priced by φ.

**Normalisation without the box.** p(n) = 2^−mixedInt(n) is a complete code over all integers. mixedInt(0) = 1 and
mixedInt(±n) = 2 + STEP·Σ e·p + log2 Z over n's factorisation, with Z = Π_p 1/(1 − 2^−STEP·p), so

  Σ_n p(n) = 1/2 + 2 · 2^−2 · (1/Z) · Σ_{n ≥ 1} 2^−STEP·Σ e·p = 1/2 + (1/2)·(1/Z)·Z = 1

by the Euler product (the factorisation code is a product of independent geometric exponents, one per prime). So π on
line-z is p(m)·p(c), a probability with no conditioning, and on line-q it is p(a)·p(b)·p(c) restricted to canonical
triples, whose mass is at most the product's, 1 (self-normalised in the sampler). Checked in lib/v2-core
codes.test.ts (log2 Z_1 = 0 to 10^−9, and the partial sums over |n| ≤ N rise to 1 from below) and lib/v2-linear
no-box.test.ts (line-q's canonical mass on a cube is below the product's). The box had held all but 3.4·10^−5 of a
coordinate's mass.

**What changed in the values.** The exact sums now enumerate every integer within their bit budget (at 44 bits about
three quarters of those integers are past 10^6). Two honest effects: rules whose rare scores live on big smooth numbers
are worth a little less (Divisibility Ladder's run of 12 needs c a multiple of 27720, and the multiples past 10^6 were
cut by the box: about 0.26 bits less at ladder 12), and the sums leave more mass past their budget, so their rarest
knots are certified a little less far (the tail rule takes over sooner).

**Evaluation stays bounded** for any size (lib/v2-linear no-box.test.ts runs every family and tie-breaker on lines with
coefficients of 10^30 and 10^200 and fractions with 2^64 denominators, each under a second): trial division stops at
10^5; nearbyPrimes walks to the nearest number with no factor below 10^5, and such numbers are never far apart (the
gaps of a sieve by the primes below 10^5 are bounded); Exact Change is now closed form (item 4); the nearest 7-smooth
number (Smooth Crossing, Intercept, Gradient, Square) is found by walking the odd parts 3^b·5^c·7^d in log space, not
by stepping through the gap (which hung on a crossing near 3·10^29). Factoring numbers
below 2^53 now runs in floating point (the same divisors and results, checked against the bigint loop), which keeps the
value builds fast now that the enumerations include large smooth numbers.

## 2. Saturating tails (removed)

Schema 6 extrapolated past the best knot along a straight line through the last knots, slope `max(0, fit)`. Where the
fit gave 0 or almost 0 on a utility that can keep improving, the value saturated: a line with |m| = 2^30 (φ ≈ 32
bits) would have been worth the same as |m| = 10^5. Schema 7 (`TailFit {form, slope, unclamped?}`):

- Utilities ≥ 0 (sizes, counts, primes) take a **magnitude ramp**, bits = b + slope·log2((1 + u)/(1 + u_best)), unless
  a straight line fits the last knots at least as well over three or more knots at a per-unit cost on the code's scale
  (≥ STEP/4). A line through a magnitude would over-value far scores without bound (2^30 is cheap under the code, 2^30
  units of a shallow line are not).
  This holds for a primary as for a secondary, and a best knot above 0 is a size even when lower knots are negative
  (Sunken Intercept's −c, Steep and Tall's min(m, c): measured to −c = 181500, the value keeps rising for −c = 10^30;
  tested in value.test.ts).
- Distances (≤ 0) take a straight line; it ends at 0, the distance's true top.
- **Floor** (`TAIL_FLOOR` ≈ 0.384 bits per doubling): one coordinate's magnitude doubling from 1 to 2 under p, the
  slowest it ever decays (it approaches 1 bit per doubling for large numbers). A fit below it, or no fit at all (one
  knot), takes the floor; for a distance, closing the rest of the gap to 0 is worth at least the floor.
- **Ceiling** (`TAIL_CEILING` = STEP = 0.5 bits per unit, on lines): the code charges p/2 bits for a prime p, and
  bits(score) ≤ φ of a cheapest state with that score, so a tail on a prime magnitude never rises faster than ½ bit
  per unit of the prime; it is applied to every utility ≥ 0 (for counts it is conservative, see below). A ramp is held to it at its start (slope ≤ STEP·(1 + u_best)·ln 2). The ceiling wins over the floor. The
  fitted slope is kept as `unclamped`. Grids have no ceiling (their cells take another code, and their components are
  bounded).
- A value function given without a tail (the gallery's points) takes the tail its knots imply.

### Schema-6 tails at or below 10^−3 bits per unit

| File | Tail | Why | Schema 7 |
|------|------|-----|----------|
| line-z divisibility-ladder + steep | secondary 0.0000 at \|m\| = 101250 | **fit failure**: a magnitude ramp (≈0.75 bits per doubling) fitted by a line | ramp |
| line-z m-meets-c + size | secondary 0.0005 at \|c\| = 3600 | **fit failure**: magnitude ramp | ramp, ≈1.27 per doubling |
| line-z prime-staircase + last-prime | secondary 0.0000 at 196579 | **fit failure**: the last prime is y(6) = 6m + c, a magnitude | ramp |
| line-q exact-change + big-piles | secondary 0 at 0 | **fit failure**: one knot at the best main; the piles are unbounded | floor ramp |
| line-z crossing-check + size | secondary 0 at (0, 0) | bounded: at gap 0 the only line is y = −2x + 2 (k = 1, q = 2), whose x(2) = 0 | floor (unreachable) |
| line-z crossing-check + whole | secondary 0 at 0 | bounded: a distance at its top | floor |
| line-z pythagorean-area + prime-height | secondary 0 at −1 | bounded: area 6 forces c² = 12\|m\|, so c is a multiple of 6 and never prime; −1 is the top | floor |
| line-z same-on-both-rulers + prime-start | secondary 0 at −1 | bounded: fixed point 6 forces c = 6(1 − m), never prime | floor |
| line-z ruler + prime-gradient, + square-area | secondary 0 | bounded: distances (the best main is one line) | floor |
| line-z treasure + prime-gradient | secondary 0 at 0 | bounded: a distance at its top | floor |
| line-z whole-intercept + omega, + spf | primary 0 | bounded: on whole lines c is whole, so the main is always 0 | floor |
| line-q divisibility-ladder + m-prime | secondary 0.0008 at −2 | bounded: a distance (noise in the fit) | floor: 0 is worth ≥ 0.38 bits more |
| grid opposite-nines + odd, strangers + ones | secondary 0 | bounded: counts of cells | floor |

Near the threshold and also magnitudes, now ramps: line-z exact-change + big-bill (0.0015), line-q exact-change +
big-bill (0.0014), line-q ruler + far (0.0011), line-z same-on-both-rulers + steep (0.005), line-q prime-staircase +
last-prime (0.0057).

### Fits the law's ceiling cut

See the regeneration report in the pull request for the full list (each file's `tail.*.unclamped`). They are of two
kinds. Prime magnitudes (spf, gpf, lpf, prime, big-prime, k-spf, c-spf, m-gpf, …) whose sampled knots rose a little
faster than ½ bit per unit: true over-payments, now held at ½ (line-q square-area + spf, found in play: 248.7 bits at spf
367 against a witness y = −2x + 734 of φ 197.8; tested in value.test.ts). And counts (the ladder's run, omega,
prime-terms, Prime Staircase's run), whose knots rise 1–2 bits per unit: held at ½ per unit past the best knot, which
under-values a further count (the safe direction: a count's next unit can cost more than ½ bit, but no witness bound
was available from the knots alone). Giving a layer its own ceiling (a count's cheapest next unit) would remove that
under-valuation; it needs the family to declare the layer's kind.

**Prime-valued layers declare it** (`Layer.measure: "prime"`, the `prime()` helper in lib/v2-linear layers.ts): a
layer whose value is a prime or a prime factor (big-prime, first-prime, last-prime, prime-gradient's prime, every spf,
gpf and lpf: m-, c-, k-, square-area's, whole-intercept's, mc-spf, m-bottom-spf). Its tail is a straight line at the
code's own cost of a prime, STEP = ½ bit per unit: the true rate, not only a ceiling, so these "bigger is better" hills
(owner decision 30) stay steep past the measured knots. A straight-line fit over three or more knots that rises more
slowly is taken instead, never below half that rate. Without the declaration the ramp default under-valued them badly
(line-q square-area + spf: about 26 bits at spf 367 against the witness y = −2x + 734's φ of 197.8); with it the
lookup lands within a few bits below φ (tested in value.test.ts). Plain magnitudes (|m|, |c|, the bill, piles, steep,
min(m, c), −c) keep the ramp; counts (Ω, runs, prime-terms) keep the clamp.

## 3. The best knot and `sampledMaxBits` (reworded)

`sampledMaxBits` (18) is how far the direct-draw sampler stayed calibrated, so no sampled knot is certified past it;
past the best knot the tail is the rule. Nothing presents it as a maximum now: the bid phase's `bid.state` returns
`measuredTo` ("bits at the furthest measured knot … not a maximum") where it said `top` ("the most bits the family's
rules pay"); the bid screen says "measured to N bits … rarer scores worth more" where it said "scores up to"; the
harness reports say "measured to" and "lines past the furthest knot". The stored `top` field of a bid phase's offers
is unchanged (a stored v2 table; only its reading changed). Removing the measurement limit itself would take a
sampler that stays calibrated further (more draws, more tilts) or exact sums for the sampled families.

## 4. Exact Change's coin limit (removed)

`waysToPay` walked x from 0 to N/a and refused (undefined, the worst score) past 10^5 steps, so Exact Change's
big-bill tie-breaker had a cliff at N ≈ 10^5·a. The ways to pay are x = x0, x0 + b/g, … (one modular inverse), so their
count and the two extreme ways are closed form; the smaller pile min(x, y) is concave along the ways, so it is
smallest at an end. Tested against brute force and at N = 10^30 + 7.

## 5. Trial division at 10^5 (kept)

A number whose cofactor has no factor below 10^5 counts that cofactor as one prime: in φ (it costs cofactor/2 bits, at
least the true cost, so the code stays a sub-probability) and in the rules (spf, gpf, Ω, isPrime). This is not a
maximum on any score: spf and gpf still grow without bound, and every number has a defined answer. It bounds
evaluation time. Removing it (true factorisation) would make a rule evaluation's time unbounded on huge numbers;
Pollard rho or ECM would push the limit far out at modest cost if exact factorisation were wanted.

## 6. Bounded mains and tie-breakers (kept: true tops of the rules)

A distance main's best is exactly 0, the true top of the main, and the tie-breaker then continues the ordering; a rule
has a true top score only where its tie-breaker is bounded too. Every distance (prime, whole, square, target, legs,
lamp, coins) has top 0. Counts with a top: Prime Staircase's run ≤ 12 terms, Divisibility Ladder ≤ 12, Treasure's
prime-terms ≤ 8, Same on Both Rulers' whole-values ≤ 11. Rules on lines whose best possible score is a true top (both
layers bounded): a distance main with a distance tie-breaker (prime-gradient + cPrime, m-meets-c + meetPrime,
prime-landing + prime-gradient / next-prime, treasure + prime-gradient / square-start, triangle-area + legs / even,
pythagorean-area + prime-height / whole-legs / slanted-square, crossing-check + whole, ruler + prime-gradient /
square-area, same-on-both-rulers + prime-start / whole-lamp, exact-change + prime-coins), and a count main at its top
with a distance or count tie-breaker. Their value at the top is the survival of the set of perfect states, finite by
definition. Some reachable tops are lower than the layer's (line-z: pythagorean-area's prime-height −1, same-on-both-
rulers' prime-start −1, crossing-check's only gap-0 line).

To remove them: give every rule an unbounded layer (a size, a prime, a count without a top) as its last word, e.g. a
third "the bigger |c| the better" layer that only ever breaks ties among perfect states; or replace bounded counts by
unbounded ones (the run of primes from y(0) with no 12-term window: needs a stopping rule that stays bounded in time,
e.g. a run measured up to the first non-prime, which the code makes rare).

Also kept: when the main can still improve, the secondary at the best main is bounded in truth by the next main's
value; the tail does not use that bound (it extrapolates each component on its own).

## 7. Grids (proposals only; no grid code changed)

Grid value files were re-tailed to schema 7 from their committed knots (the knots are unchanged; the grid code is).
Every grid component is bounded: cells hold 0–9 (`gridParams.cap`, at most 9 by `makeGridType`), so counts of cells
are ≤ 16, sums of cells ≤ 144, and each rule has a true top board. Proposals:

- **Unbounded cells with a code.** The cell code is geometric, 2^−step·v / Z on 0 … cap; on all v ≥ 0 it is still
  complete (Z = 1/(1 − 2^−step)), so the cap can go with no other change to the law. Or the mixed integer code, as on
  lines, for cells that can also be negative. What it takes: families that assume one digit a cell ("2, 3, 5 or 7",
  "opposite nines", nine-complements) restated for any whole number (primes, "the largest cell", distances to targets
  that scale), the exact sums (sums.ts) re-derived over an infinite alphabet (the per-unit sums become series), the
  views drawing a cell of any width, and `cells.swap`/`turn.spin`-style shortcuts unchanged.
- **A mutator set without a top.** Today `cells.add` and the other additive moves refuse a cell past 9; with unbounded
  cells they never refuse upward. Moves that read a digit's complement would be redefined (mirror a cell about the
  board's mean instead of about 9).
- **Unbounded layers.** Pair each bounded grid main with an unbounded tie-breaker (the board's largest prime cell, the
  total of the cells), so no grid rule has a top board.

## 8–10. Other bounds

- **The tail ceiling** is a bound on the slope of value, not on value: every tail still rises without bound.
- **Economy** (lib/v2-economy): an account's energy store holds at most its power times `fullChargeSeconds`, an act
  may take it into debt by at most that capacity, the change charge is W + βW², and bids are 1–100%. These bound how
  far one act can move (a far move costs at least its path) and what is spent, never what a state is worth; with no box,
  a very large coefficient is simply unaffordable in one act. Points are bits; nothing caps them.
- **Uniqueness** (`withUniqueness`): subtracts a shift from rare scores' bits; it does not cap them.
- **Wire and storage**: mutator arguments are any-length rationals (no length limit in the affordance schema); a state
  is bounded only by Convex's document size (1 MiB), far beyond any affordable number.
- **Floats**: a lookup's bits past `Number.MAX_VALUE` read as `Number.MAX_VALUE` (never Infinity or NaN); with
  ramps, that needs a number of about 2^(10^308) digits.
