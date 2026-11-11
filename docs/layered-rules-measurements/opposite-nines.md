# Opposite Nines with tiers: measurements

`Grid(4,base10,mono)`, default budget, seeded. Columns and commands: [`README.md`](README.md). Raw numbers:
`opposite-nines.profile.json`, `opposite-nines.compare.json`, `opposite-nines.sweep.json`.

**What these numbers were measured on.** The shipped tables of the tiered draws, and the hybrid law at the budget they
were built with (1,024 particles and 2 sweeps at the base's top; branch commit `6ee0bfa8`). The branch has since raised
the top budget to 8,192 particles and 4 sweeps (`86775be4`) without bumping `HYBRID_VERSION`, so the shipped tiered
tables still hold the old estimate under a key that reads as fresh. Rerun the three commands after the tables are
regenerated.

**Exact or sampled.** Exact: the base's law inside the tiered tables, and every "exact" column (all 10⁸ boards with 8
pairs at 9 are enumerated). Sampled: every tier level of a table (`top`, `+top`, liveness: the hybrid law), the base
draw's own shipped table (26.4 bits at its top; the exact value is 8 · log2 10 = 26.58), the unlocked tables, and all
climbs, synergy and games (12 starts, 40 games).

## Findings

1. **The shipped hybrid tables are off by more than their declared bound (1 bit) at the top tier level of some dealt
   values**: squares x = 10 by 2.34 bits (19.5 measured, 17.1 exact), lines x = 18 by 1.55 bits (16.4 against 14.8),
   lines x = 17 by 0.94. Every level below the top tier level is within 0.4 bits. With the top budget now in the code
   (8,192 particles, 4 sweeps) the splitting is within 0.5 bits at lines x = 18 (`test/tiered-profile.test.ts`).
2. **Lines x = 9 is refused for a reason that is a calibration error**: the hybrid law says it adds 21.8 bits (above the
   cap of 20); exactly it adds 19.3. Squares x = 9 goes the other way: 17.1 by the hybrid law, 20.3 exactly.
3. **Lines x = 6 (and 30): the hybrid law never saw the true top.** Three lines are possible there (21.6 bits exactly);
   the law found at most two. The value is not dealt.
4. **Refused values, confirmed.** Squares x = 18 and x = 8 (and x = 4, 0; lines x = 4, 0): a two-digit board reaches the
   top (`0000999900009999`, `7777777722222222`, ...). Lines x = 9: above the cap by the hybrid law (see 2).
5. **Many values that are not dealt pass the check**: lines x = 1, 2, 3, 5, 7, 8 and squares x = 2, 3, 5, 6, 7, 11, 13,
   15, 17 are alive and inside the 6 to 20 bit band.
6. **Against the design document** (`docs/layered-rules-design.md`, measured on prototypes with their own calibration):
   - Base: top 26.4 bits here (28.1 there), `rate4` 2.95 (2.76), prior mean 1.40 (0.82), mean `SYN` 28.4 (35.6).
   - Gating leaves the early climb alone, as designed: `rate4` 2.95 → 2.97–2.98, prior mean 1.40 → 1.41.
   - Lines x = 18: all ten lines are reachable, so the tier adds 14.8 bits exactly (16.5 in the shipped table), not the
     10.1 of the prototype (which found 8 lines). Tier share 0.08 and accidental 0.03 (0.11 and 0.06 there).
   - Synergy: the design says lines x = 18 *improves* the pair with Crosswise Threes (`SYN` 43 → 31) and keeps Magic
     Eighteen's ceiling at 1.00. Here the pair with Crosswise Threes gets worse (25 → 40) and Magic Eighteen's ceiling
     falls to 0.93. Mean `SYN` rises 28.4 → 42.4 (35.6 → 42.3 there).
   - Games: payoff ratio 1.00 to 1.03, as in the design (0.95 to 1.03).
7. **Compositions** (last table): gated and plain cost a base-only player nothing (their end boards score 0.6 to 0.8
   bits *more* on the tiered table, from accidental tier points); unlock costs them 7.1 to 8.9 bits. Plain raises
   `rate4` by 0.05 over gated and lets a tier-aware greedy agent hold 2.2 bits more at x = 18 (30.1 against 27.9), at
   the price of a table with five times the levels that took ten times as long to build. Unlock's table is the sampled
   estimator's, and its top (41.8 at x = 14) is not comparable with the hybrid tops.

Build seconds were measured with three runs in parallel on four cores. In the profile table the tiered rows show no
build time (the law was already cached when it was timed; fixed in the tool since); the sweep's `hybrid s` column has it.

## Profile (gated draws, default budget)

| variant | table | levels | build s | top | +top | prior mean | rate4 | g10 | g20 | trap | gap | esc2 | K | **DIFF** | base agent | accidental | tier agent | tier share |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| opposite_nines.base | shipped sampled | 120 | 9.3 | 26.4 |  | 1.40 | 2.95 | 26.4 | 26.4 | 0.00 | 0.00 | – | 1.0 | **0.0** |  |  |  |  |
| opposite_nines.lines(x=10) | shipped hybrid | 417 | – | 42.5 | 16.1 | 1.41 | 2.98 | 28.0 | 28.0 | 0.34 | 0.10 | 0.67 | 1.0 | **22.0** | 27.2 | 0.04 | 28.0 | 0.09 |
| opposite_nines.lines(x=11) | shipped hybrid | 416 | – | 41.1 | 14.7 | 1.41 | 2.97 | 27.3 | 27.3 | 0.34 | 0.16 | 1.00 | 1.0 | **24.9** | 26.8 | 0.01 | 27.3 | 0.05 |
| opposite_nines.lines(x=12) | shipped hybrid | 419 | – | 39.8 | 13.4 | 1.41 | 2.97 | 28.4 | 28.4 | 0.29 | 0.16 | 1.00 | 1.0 | **22.4** | 27.2 | 0.05 | 28.4 | 0.14 |
| opposite_nines.lines(x=13) | shipped hybrid | 418 | – | 39.5 | 13.1 | 1.41 | 2.98 | 29.8 | 29.8 | 0.25 | 0.13 | 1.00 | 1.0 | **18.7** | 27.4 | 0.07 | 29.8 | 0.25 |
| opposite_nines.lines(x=14) | shipped hybrid | 435 | – | 38.4 | 12.0 | 1.41 | 2.97 | 28.2 | 28.2 | 0.27 | 0.17 | 1.00 | 1.0 | **22.1** | 27.2 | 0.05 | 28.2 | 0.13 |
| opposite_nines.lines(x=15) | shipped hybrid | 434 | – | 38.8 | 12.4 | 1.41 | 2.98 | 28.4 | 28.4 | 0.27 | 0.19 | 0.33 | 1.0 | **22.7** | 27.3 | 0.06 | 28.4 | 0.15 |
| opposite_nines.lines(x=16) | shipped hybrid | 435 | – | 37.1 | 10.7 | 1.41 | 2.98 | 28.3 | 28.3 | 0.24 | 0.15 | 0.67 | 1.0 | **19.6** | 27.8 | 0.12 | 28.3 | 0.16 |
| opposite_nines.lines(x=17) | shipped hybrid | 433 | – | 38.4 | 12.0 | 1.41 | 2.98 | 27.9 | 27.9 | 0.28 | 0.14 | 1.00 | 1.0 | **20.9** | 27.6 | 0.08 | 27.9 | 0.11 |
| opposite_nines.lines(x=18) | shipped hybrid | 504 | – | 43.0 | 16.5 | 1.41 | 2.98 | 27.9 | 27.9 | 0.35 | 0.19 | 1.00 | 1.0 | **27.0** | 27.1 | 0.03 | 27.9 | 0.08 |
| opposite_nines.squares(x=10) | shipped hybrid | 417 | – | 46.0 | 19.6 | 1.41 | 2.97 | 27.7 | 27.7 | 0.40 | 0.12 | 1.00 | 1.0 | **25.9** | 27.3 | 0.04 | 27.7 | 0.06 |
| opposite_nines.squares(x=12) | shipped hybrid | 418 | – | 40.3 | 13.8 | 1.41 | 2.98 | 27.6 | 27.6 | 0.31 | 0.14 | 1.00 | 1.0 | **22.5** | 27.1 | 0.04 | 27.6 | 0.08 |
| opposite_nines.squares(x=14) | shipped hybrid | 443 | – | 39.2 | 12.8 | 1.41 | 2.98 | 28.3 | 28.3 | 0.28 | 0.17 | 0.67 | 1.0 | **22.6** | 27.1 | 0.04 | 28.3 | 0.13 |
| opposite_nines.squares(x=16) | shipped hybrid | 442 | – | 38.0 | 11.6 | 1.41 | 2.98 | 29.4 | 29.4 | 0.23 | 0.11 | 1.00 | 1.0 | **16.6** | 27.9 | 0.12 | 29.4 | 0.24 |

## Liveness at the base's top (hybrid law)

| variant | tier min | tier top | share at top | added bits | degenerate boards | problems |
|---|--:|--:|--:|--:|---|---|
| opposite_nines.lines(x=10) | 0 | 4 | 1.56e-5 | 16.0 | none | alive |
| opposite_nines.lines(x=11) | 0 | 4 | 4.27e-5 | 14.5 | none | alive |
| opposite_nines.lines(x=12) | 0 | 4 | 1.02e-4 | 13.3 | none | alive |
| opposite_nines.lines(x=13) | 0 | 4 | 1.29e-4 | 12.9 | none | alive |
| opposite_nines.lines(x=14) | 0 | 4 | 2.69e-4 | 11.9 | none | alive |
| opposite_nines.lines(x=15) | 0 | 4 | 2.09e-4 | 12.2 | none | alive |
| opposite_nines.lines(x=16) | 0 | 4 | 6.82e-4 | 10.5 | none | alive |
| opposite_nines.lines(x=17) | 0 | 4 | 2.68e-4 | 11.9 | none | alive |
| opposite_nines.lines(x=18) | 2 | 10 | 1.16e-5 | 16.4 | none | alive |
| opposite_nines.squares(x=10) | 0 | 4 | 1.39e-6 | 19.5 | none | alive |
| opposite_nines.squares(x=12) | 0 | 4 | 7.53e-5 | 13.7 | none | alive |
| opposite_nines.squares(x=14) | 0 | 4 | 1.54e-4 | 12.7 | none | alive |
| opposite_nines.squares(x=16) | 0 | 4 | 3.56e-4 | 11.5 | none | alive |

## Calibration error against the exact law at the base's top

Bits of P(tier ≥ i | base at its top): hybrid / exact, at every tier level the exact law has (– : the hybrid never saw the level).

| variant | boards | levels: tier hybrid/exact | max error (bits) | levels missed |
|---|--:|---|--:|--:|
| opposite_nines.lines(x=10) | 1e+8 | 0: 0.00/0.00, 1: 2.36/2.27, 2: 5.79/5.86, 3: 10.66/10.76, 4: 15.96/16.12 | 0.15 | 0 |
| opposite_nines.lines(x=11) | 1e+8 | 0: 0.00/0.00, 1: 2.11/1.99, 2: 5.23/5.25, 3: 9.84/9.75, 4: 14.51/14.46 | 0.12 | 0 |
| opposite_nines.lines(x=12) | 1e+8 | 0: 0.00/0.00, 1: 1.82/1.77, 2: 4.76/4.76, 3: 9.37/8.97, 4: 13.26/13.35 | 0.40 | 0 |
| opposite_nines.lines(x=13) | 1e+8 | 0: 0.00/0.00, 1: 1.72/1.59, 2: 4.38/4.36, 3: 8.59/8.37, 4: 12.92/12.54 | 0.38 | 0 |
| opposite_nines.lines(x=14) | 1e+8 | 0: 0.00/0.00, 1: 1.49/1.45, 2: 4.29/4.05, 3: 8.18/7.92, 4: 11.86/11.93 | 0.26 | 0 |
| opposite_nines.lines(x=15) | 1e+8 | 0: 0.00/0.00, 1: 1.29/1.33, 2: 3.91/3.82, 3: 7.98/7.58, 4: 12.22/11.47 | 0.75 | 0 |
| opposite_nines.lines(x=16) | 1e+8 | 0: 0.00/0.00, 1: 1.19/1.25, 2: 3.66/3.65, 3: 7.41/7.35, 4: 10.52/11.14 | 0.62 | 0 |
| opposite_nines.lines(x=17) | 1e+8 | 0: 0.00/0.00, 1: 1.18/1.20, 2: 3.69/3.55, 3: 7.48/7.20, 4: 11.86/10.93 | 0.94 | 0 |
| opposite_nines.lines(x=18) | 1e+8 | 2: 0.00/0.00, 4: 2.00/2.04, 6: 5.33/5.40, 8: 10.20/10.00, 10: 16.39/14.84 | 1.55 | 0 |
| opposite_nines.squares(x=10) | 1e+8 | 0: 0.00/0.00, 1: 2.23/2.28, 2: 5.78/5.73, 3: 10.46/10.39, 4: 19.46/17.12 | 2.34 | 0 |
| opposite_nines.squares(x=12) | 1e+8 | 0: 0.00/0.00, 1: 1.67/1.77, 2: 4.48/4.76, 3: 8.65/8.85, 4: 13.70/14.34 | 0.65 | 0 |
| opposite_nines.squares(x=14) | 1e+8 | 0: 0.00/0.00, 1: 1.45/1.45, 2: 4.04/4.03, 3: 7.42/7.67, 4: 12.67/12.67 | 0.25 | 0 |
| opposite_nines.squares(x=16) | 1e+8 | 0: 0.00/0.00, 1: 1.29/1.27, 2: 3.60/3.59, 3: 6.81/6.84, 4: 11.46/11.38 | 0.08 | 0 |

## Synergy SYN (ceiling) with the beginner eight

| variant | mirrormancer | magic_eighteen | opposite_nines | two_pair | spread_three | strangers | leapfrog | crosswise_threes | mean SYN |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| opposite_nines.base | 38 (1.00) | 23 (1.00) | 0 (1.00) | 42 (1.00) | 24 (1.00) | 41 (1.00) | 33 (1.00) | 25 (1.00) | 28.4 |
| opposite_nines.lines(x=10) | 51 (0.79) | 39 (0.82) | 21 (0.79) | 55 (0.87) | 39 (0.82) | 55 (0.79) | 37 (0.87) | 40 (0.82) | 42.1 |
| opposite_nines.lines(x=18) | 51 (0.93) | 34 (0.93) | 21 (0.82) | 52 (0.86) | 39 (0.82) | 54 (0.86) | 47 (0.86) | 40 (0.82) | 42.4 |
| opposite_nines.squares(x=10) | 52 (0.76) | 41 (0.79) | 23 (0.79) | 56 (0.79) | 42 (0.84) | 55 (0.76) | 52 (0.79) | 42 (0.79) | 45.5 |
| opposite_nines.squares(x=16) | 48 (0.84) | 36 (0.94) | 16 (0.89) | 52 (0.84) | 36 (0.85) | 51 (0.94) | 41 (0.94) | 37 (0.86) | 39.5 |

## Three-player games

Seat 0 is dealt the variant, the other two seats a random pair of the beginner eight; same seeds, seat 0 playing the base only or the whole rule.

| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |
|---|--:|--:|--:|--:|--:|--:|
| opposite_nines.lines(x=10) | 40 | 0.57 | 0.57 | 9.6 | 9.7 | 1.03 |
| opposite_nines.lines(x=18) | 40 | 0.68 | 0.60 | 11.0 | 11.0 | 1.00 |
| opposite_nines.squares(x=10) | 40 | 0.57 | 0.55 | 10.6 | 10.7 | 1.01 |
| opposite_nines.squares(x=16) | 40 | 0.55 | 0.57 | 11.0 | 11.1 | 1.00 |
## Liveness sweep

| family | interaction | value(s) | status | tier min–top | share at top | added bits (hybrid) | added bits (exact) | tier top (exact) | max error (bits) | hybrid s | problems |
|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|---|
| opposite_nines | lines | x = 0, 36 | not dealt | 0–2 | 1.91e-6 | 19.0 | 23.6 | 2 | 4.58 | 9.7 | a uniform or two-digit board reaches the top (0000999900009999) |
| opposite_nines | lines | x = 1, 35 | not dealt | 0–2 | 2.86e-6 | 18.4 | 19.6 | 2 | 1.16 | 9.4 | alive |
| opposite_nines | lines | x = 2, 34 | not dealt | 0–2 | 1.14e-5 | 16.4 | 16.9 | 2 | 0.52 | 11.0 | alive |
| opposite_nines | lines | x = 3, 33 | not dealt | 0–2 | 2.00e-5 | 15.6 | 14.9 | 2 | 1.22 | 8.5 | alive |
| opposite_nines | lines | x = 4, 32 | not dealt | 0–2 | 6.58e-5 | 13.9 | 13.3 | 2 | 0.57 | 6.3 | a uniform or two-digit board reaches the top (1111888811118888) |
| opposite_nines | lines | x = 5, 31 | not dealt | 0–2 | 3.40e-4 | 11.5 | 11.6 | 2 | 0.16 | 10.9 | alive |
| opposite_nines | lines | x = 6, 30 | not dealt | 0–2 | 1.01e-3 | 9.9 | 21.6 | 3 | 0.28 (1 missed) | 10.1 | alive |
| opposite_nines | lines | x = 7, 29 | not dealt | 0–3 | 2.42e-6 | 18.7 | 16.8 | 3 | 1.89 | 11.5 | alive |
| opposite_nines | lines | x = 8, 28 | not dealt | 0–3 | 6.37e-5 | 13.9 | 14.0 | 3 | 0.17 | 11.4 | alive |
| opposite_nines | lines | x = 9, 27 | lab | 0–4 | 2.77e-7 | 21.8 | 19.3 | 4 | 2.53 | 14.9 | adds 21.8 bits, above the cap of 20 |
| opposite_nines | lines | x = 10, 26 | dealt | 0–4 | 1.56e-5 | 16.0 | 16.1 | 4 | 0.15 | 17.0 | alive |
| opposite_nines | lines | x = 11, 25 | dealt | 0–4 | 4.27e-5 | 14.5 | 14.5 | 4 | 0.12 | 17.4 | alive |
| opposite_nines | lines | x = 12, 24 | dealt | 0–4 | 1.02e-4 | 13.3 | 13.3 | 4 | 0.40 | 14.5 | alive |
| opposite_nines | lines | x = 13, 23 | dealt | 0–4 | 1.29e-4 | 12.9 | 12.5 | 4 | 0.38 | 13.4 | alive |
| opposite_nines | lines | x = 14, 22 | dealt | 0–4 | 2.69e-4 | 11.9 | 11.9 | 4 | 0.26 | 19.2 | alive |
| opposite_nines | lines | x = 15, 21 | dealt | 0–4 | 2.09e-4 | 12.2 | 11.5 | 4 | 0.75 | 13.2 | alive |
| opposite_nines | lines | x = 16, 20 | dealt | 0–4 | 6.82e-4 | 10.5 | 11.1 | 4 | 0.62 | 16.9 | alive |
| opposite_nines | lines | x = 17, 19 | dealt | 0–4 | 2.68e-4 | 11.9 | 10.9 | 4 | 0.94 | 15.6 | alive |
| opposite_nines | lines | x = 18 | dealt | 2–10 | 1.16e-5 | 16.4 | 14.8 | 10 | 1.55 | 26.3 | alive |
| opposite_nines | squares | x = 0, 36 | not dealt | 0–3 | 1.68e-8 | 25.8 | 24.6 | 3 | 1.25 | 12.2 | adds 25.8 bits, above the cap of 20; a uniform or two-digit board reaches the top (9999999900000000) |
| opposite_nines | squares | x = 1, 35 | not dealt | 0–3 | 9.50e-8 | 23.3 | 21.6 | 3 | 1.75 | 10.7 | adds 23.3 bits, above the cap of 20 |
| opposite_nines | squares | x = 2, 34 | not dealt | 0–3 | 1.09e-6 | 19.8 | 19.5 | 3 | 0.47 | 10.5 | alive |
| opposite_nines | squares | x = 3, 33 | not dealt | 0–3 | 3.39e-6 | 18.2 | 17.9 | 3 | 0.61 | 12.5 | alive |
| opposite_nines | squares | x = 4, 32 | not dealt | 0–3 | 1.46e-5 | 16.1 | 16.6 | 3 | 0.49 | 12.5 | a uniform or two-digit board reaches the top (8888888811111111) |
| opposite_nines | squares | x = 5, 31 | not dealt | 0–3 | 2.01e-5 | 15.6 | 15.3 | 3 | 0.31 | 10.3 | alive |
| opposite_nines | squares | x = 6, 30 | not dealt | 0–3 | 3.16e-5 | 15.0 | 14.2 | 3 | 0.75 | 9.8 | alive |
| opposite_nines | squares | x = 7, 29 | not dealt | 0–3 | 1.05e-4 | 13.2 | 13.1 | 3 | 0.08 | 13.6 | alive |
| opposite_nines | squares | x = 8, 28 | not dealt | 0–3 | 1.61e-4 | 12.6 | 12.2 | 3 | 0.41 | 14.5 | a uniform or two-digit board reaches the top (7777777722222222) |
| opposite_nines | squares | x = 9, 27 | not dealt | 0–4 | 7.37e-6 | 17.1 | 20.3 | 4 | 3.20 | 17.3 | alive |
| opposite_nines | squares | x = 10, 26 | dealt | 0–4 | 1.39e-6 | 19.5 | 17.1 | 4 | 2.34 | 20.7 | alive |
| opposite_nines | squares | x = 11, 25 | not dealt | 0–4 | 1.38e-5 | 16.1 | 15.5 | 4 | 0.68 | 17.8 | alive |
| opposite_nines | squares | x = 12, 24 | dealt | 0–4 | 7.53e-5 | 13.7 | 14.3 | 4 | 0.65 | 20.9 | alive |
| opposite_nines | squares | x = 13, 23 | not dealt | 0–4 | 9.65e-5 | 13.3 | 13.5 | 4 | 0.30 | 16.0 | alive |
| opposite_nines | squares | x = 14, 22 | dealt | 0–4 | 1.54e-4 | 12.7 | 12.7 | 4 | 0.25 | 18.4 | alive |
| opposite_nines | squares | x = 15, 21 | not dealt | 0–4 | 3.47e-4 | 11.5 | 12.0 | 4 | 0.46 | 15.2 | alive |
| opposite_nines | squares | x = 16, 20 | dealt | 0–4 | 3.56e-4 | 11.5 | 11.4 | 4 | 0.08 | 17.2 | alive |
| opposite_nines | squares | x = 17, 19 | not dealt | 0–4 | 5.83e-4 | 10.7 | 11.0 | 4 | 0.25 | 15.1 | alive |
| opposite_nines | squares | x = 18 | not dealt | 1–9 | 4.21e-5 | 14.5 | 14.8 | 9 | 0.31 | 19.5 | a uniform or two-digit board reaches the top (0000999900009999) |

## Composition comparison

| value | composition | rate4 | prior mean | top | DIFF | tier agent @48 | base-only @48 on this table | base-only @48 on the base table | base-only loses | card chars | summary sentences | table | levels | build s |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|--:|--:|
| lines(x=18) | base | 2.95 | 1.40 | 26.4 | 0.0 | – | 26.4 | 26.4 | 0.0 | 752 | 4 | shipped sampled | 120 | 7.3 |
| lines(x=18) | gated | 2.98 | 1.41 | 43.0 | 27.0 | 27.9 | 27.1 | 26.4 | -0.6 | 1292 | 6 | shipped hybrid | 504 | 22.6 |
| lines(x=18) | plain | 3.03 | 1.43 | 41.4 | 21.0 | 30.1 | 27.1 | 26.4 | -0.7 | 1209 | 5 | built hybrid | 2529 | 212.2 |
| lines(x=18) | unlock | 3.03 | 1.39 | 40.8 | 29.3 | 28.5 | 19.4 | 26.4 | 7.1 | 1373 | 6 | shipped sampled | 236 | 11.9 |
| lines(x=14) | base | 2.95 | 1.40 | 26.4 | 0.0 | – | 26.4 | 26.4 | 0.0 | 752 | 4 | shipped sampled | 120 | 7.3 |
| lines(x=14) | gated | 2.97 | 1.41 | 38.4 | 22.1 | 28.2 | 27.2 | 26.4 | -0.8 | 1292 | 6 | shipped hybrid | 435 | 18.4 |
| lines(x=14) | plain | 3.02 | 1.43 | 37.6 | 19.4 | 28.8 | 27.2 | 26.4 | -0.7 | 1209 | 5 | built hybrid | 2187 | 227.2 |
| lines(x=14) | unlock | 3.01 | 1.40 | 41.8 | 25.6 | 29.6 | 17.5 | 26.4 | 8.9 | 1373 | 6 | shipped sampled | 190 | 11.5 |
