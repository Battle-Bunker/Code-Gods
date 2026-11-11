# Opposite Nines with tiers: measurements on the shipped tables

`Grid(4,base10,mono)`, default budget, seeded. Columns and commands: [`README.md`](README.md). Raw numbers:
`opposite-nines.profile.json`, `opposite-nines.compare.json`, `calibration-check.json`, `build-times.json`.

**Measured on** the shipped tables in `lib/game-utilities/data/calibration/v1/Grid(4,base10,mono).json` (hybrid version
2: 8,192 particles and 4 sweeps at the base's top). Nothing was rebuilt, except the timed builds. An earlier version of
this file measured the tables built with 1,024 particles; its numbers are replaced here.

**Dealt.** `lines` x = 10..26 (nine tables: x ~ 36 − x) and `squares` x = 10, 12, 14, 16, 20, 22, 24, 26 (four tables).
Lab: lines x = 9, 27 and squares x = 9, 27. Gate: 6 pairs.

**Exact or sampled.** Exact: the base's law inside the tiered tables, and the reference law at the top (all 10⁸ boards
with 8 pairs at 9 are enumerated). Sampled: every tier level of a table (`top`, `+top`, liveness: the hybrid law), the
base draw's own shipped table (26.4 bits at its top; exactly 8 · log2 10 = 26.58), the unlocked table, and all climbs,
synergy and games (12 starts, 40 games).

## Findings

1. **Every dealt table is within 0.38 bits of the exact law at every tier level** (bound: 1 bit). Worst: lines x = 10
   at four lines, 16.50 against 16.12. With the old budget the worst was 2.34 bits (squares x = 10) and 1.55 (lines
   x = 18); they are now 0.15 and 0.22.
2. **The Lab values are within 0.56 bits**: lines x = 9 adds 19.64 by its table (19.25 exactly), squares x = 9 adds
   19.69 (20.25 exactly: just above the cap of 20, and under it by the table).
3. **Top 37.5 to 43.5 bits; the tier adds 10.9 to 17.0 bits** over the base's exact top (`+top` in the profile is
   against the base's sampled table and reads 0.2 higher).
4. **The base climb is unchanged**: `rate4` 2.95 → 2.97–2.98, prior mean 1.40 → 1.41.
5. **Tier share**: a base-only greedy agent ends with 1% to 12% of the tier's headroom (mean 6%), a tier-aware one 5%
   to 25% (mean 13%). `DIFF` rises from 0 to 16–26.
6. **Against the design document** (`docs/layered-rules-design.md`, measured on prototypes with their own calibration):
   - Lines x = 18: all ten lines are reachable, and the tier adds 14.84 bits exactly (15.06 in the shipped table), not
     the 10.1 of the prototype (which found 8 lines). Tier share 0.09 and accidental 0.03 (0.11 and 0.06 there).
   - Synergy: the design says lines x = 18 *improves* the pair with Crosswise Threes (`SYN` 43 → 31) and keeps Magic
     Eighteen's ceiling at 1.00. Here the pair with Crosswise Threes gets worse (25 → 39) and Magic Eighteen's ceiling
     falls to 0.88 (`SYN` 23 → 33). Mean `SYN` rises 28.4 → 41.5 (35.6 → 42.3 there).
   - Base: top 26.4 bits here (28.1 there), `rate4` 2.95 (2.76), prior mean 1.40 (0.82), mean `SYN` 28.4 (35.6).
   - Games: payoff ratio 1.00 to 1.03, as in the design (0.95 to 1.03).
7. **Compositions, lines x = 18** (last table):
   - Early climb: `rate4` 2.95 (base), 2.98 (gated), 3.03 (plain), 3.03 (unlock); prior mean 1.40, 1.41, 1.43, 1.39.
   - Top: 41.6 (gated), 41.3 (plain), 40.8 (unlock; a sampled table, not comparable with the hybrid tops).
   - A base-only player loses nothing under gated and plain (their end boards score 0.7 bits *more* on the tiered
     table, from accidental tier points) and 7.1 bits under unlock.
   - A tier-aware greedy agent ends at 27.9 bits gated, 30.0 plain, 28.5 unlock.
   - Card: 1,292 characters and 6 sentences gated, 1,209 and 5 plain, 1,373 and 6 unlock (base: 752 and 4).
   - Table: gated 504 levels, built in 46 s; plain 2,529 levels, 238 s; unlock 236 levels, 10 s (sampling estimator).
     Seconds were measured on four cores shared with other work.

**Not rerun.** The liveness sweep over every x (0..36), dealt or not. The earlier one used the old budget; its file is
removed.

## Profile (gated draws, default budget)

| variant | table | levels | build s | top | +top | prior mean | rate4 | g10 | g20 | trap | gap | esc2 | K | **DIFF** | base agent | accidental | tier agent | tier share |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| opposite_nines.base | shipped sampled | 120 | 13.4 | 26.4 |  | 1.40 | 2.95 | 26.4 | 26.4 | 0.00 | 0.00 | – | 1.0 | **0.0** |  |  |  |  |
| opposite_nines.lines(x=10) | shipped hybrid | 417 | 51.0 | 43.1 | 16.6 | 1.41 | 2.98 | 27.9 | 27.9 | 0.35 | 0.10 | 0.67 | 1.0 | **22.5** | 27.2 | 0.03 | 27.9 | 0.08 |
| opposite_nines.lines(x=11) | shipped hybrid | 416 | 25.9 | 40.9 | 14.5 | 1.41 | 2.97 | 27.2 | 27.2 | 0.33 | 0.16 | 1.00 | 1.0 | **24.9** | 26.7 | 0.01 | 27.2 | 0.05 |
| opposite_nines.lines(x=12) | shipped hybrid | 419 | 40.4 | 39.7 | 13.2 | 1.41 | 2.97 | 28.4 | 28.4 | 0.28 | 0.16 | 1.00 | 1.0 | **22.1** | 27.2 | 0.05 | 28.4 | 0.14 |
| opposite_nines.lines(x=13) | shipped hybrid | 418 | 69.9 | 39.1 | 12.7 | 1.41 | 2.98 | 29.7 | 29.7 | 0.24 | 0.13 | 1.00 | 1.0 | **18.4** | 27.4 | 0.06 | 29.7 | 0.25 |
| opposite_nines.lines(x=14) | shipped hybrid | 435 | 58.0 | 38.5 | 12.1 | 1.41 | 2.97 | 28.1 | 28.1 | 0.27 | 0.17 | 1.00 | 1.0 | **22.2** | 27.2 | 0.05 | 28.1 | 0.13 |
| opposite_nines.lines(x=15) | shipped hybrid | 434 | 38.0 | 38.2 | 11.7 | 1.41 | 2.98 | 28.4 | 28.4 | 0.26 | 0.18 | 0.33 | 1.0 | **21.7** | 27.3 | 0.07 | 28.4 | 0.16 |
| opposite_nines.lines(x=16) | shipped hybrid | 435 | 81.4 | 37.7 | 11.3 | 1.41 | 2.98 | 28.3 | 28.3 | 0.25 | 0.16 | 0.67 | 1.0 | **20.3** | 27.8 | 0.11 | 28.3 | 0.16 |
| opposite_nines.lines(x=17) | shipped hybrid | 433 | 62.5 | 37.5 | 11.1 | 1.41 | 2.98 | 27.9 | 27.9 | 0.26 | 0.14 | 1.00 | 1.0 | **19.6** | 27.6 | 0.09 | 27.9 | 0.12 |
| opposite_nines.lines(x=18) | shipped hybrid | 504 | 52.2 | 41.6 | 15.2 | 1.41 | 2.98 | 27.9 | 27.9 | 0.33 | 0.18 | 1.00 | 1.0 | **25.5** | 27.1 | 0.03 | 27.9 | 0.09 |
| opposite_nines.squares(x=10) | shipped hybrid | 417 | 57.3 | 43.5 | 17.1 | 1.41 | 2.97 | 27.7 | 27.7 | 0.36 | 0.12 | 1.00 | 1.0 | **24.1** | 27.3 | 0.04 | 27.7 | 0.07 |
| opposite_nines.squares(x=12) | shipped hybrid | 418 | 40.3 | 41.1 | 14.7 | 1.41 | 2.98 | 27.7 | 27.7 | 0.33 | 0.14 | 1.00 | 1.0 | **23.3** | 27.2 | 0.04 | 27.7 | 0.08 |
| opposite_nines.squares(x=14) | shipped hybrid | 443 | 57.5 | 39.2 | 12.7 | 1.41 | 2.98 | 28.3 | 28.3 | 0.28 | 0.17 | 0.67 | 1.0 | **22.5** | 27.1 | 0.04 | 28.3 | 0.13 |
| opposite_nines.squares(x=16) | shipped hybrid | 442 | 55.7 | 37.9 | 11.5 | 1.41 | 2.98 | 29.4 | 29.4 | 0.22 | 0.10 | 1.00 | 1.0 | **16.4** | 27.9 | 0.12 | 29.4 | 0.25 |

## Liveness at the base's top (hybrid law)

| variant | tier min | tier top | share at top | added bits | degenerate boards | problems |
|---|--:|--:|--:|--:|---|---|
| opposite_nines.lines(x=10) | 0 | 4 | 1.08e-5 | 16.5 | none | alive |
| opposite_nines.lines(x=11) | 0 | 4 | 4.71e-5 | 14.4 | none | alive |
| opposite_nines.lines(x=12) | 0 | 4 | 1.14e-4 | 13.1 | none | alive |
| opposite_nines.lines(x=13) | 0 | 4 | 1.71e-4 | 12.5 | none | alive |
| opposite_nines.lines(x=14) | 0 | 4 | 2.54e-4 | 11.9 | none | alive |
| opposite_nines.lines(x=15) | 0 | 4 | 3.27e-4 | 11.6 | none | alive |
| opposite_nines.lines(x=16) | 0 | 4 | 4.49e-4 | 11.1 | none | alive |
| opposite_nines.lines(x=17) | 0 | 4 | 5.13e-4 | 10.9 | none | alive |
| opposite_nines.lines(x=18) | 2 | 10 | 2.93e-5 | 15.1 | none | alive |
| opposite_nines.squares(x=10) | 0 | 4 | 7.83e-6 | 17.0 | none | alive |
| opposite_nines.squares(x=12) | 0 | 4 | 4.30e-5 | 14.5 | none | alive |
| opposite_nines.squares(x=14) | 0 | 4 | 1.64e-4 | 12.6 | none | alive |
| opposite_nines.squares(x=16) | 0 | 4 | 3.93e-4 | 11.3 | none | alive |

## Calibration error against the exact law at the base's top

Bits of P(tier ≥ i | base at its top): hybrid / exact, at every tier level the exact law has (– : the hybrid never saw the level).

| variant | boards | levels: tier hybrid/exact | max error (bits) | levels missed |
|---|--:|---|--:|--:|
| opposite_nines.lines(x=10) | 1e+8 | 0: 0.00/0.00, 1: 2.30/2.27, 2: 5.79/5.86, 3: 10.76/10.76, 4: 16.50/16.12 | 0.38 | 0 |
| opposite_nines.lines(x=11) | 1e+8 | 0: 0.00/0.00, 1: 1.99/1.99, 2: 5.33/5.25, 3: 9.83/9.75, 4: 14.37/14.46 | 0.08 | 0 |
| opposite_nines.lines(x=12) | 1e+8 | 0: 0.00/0.00, 1: 1.77/1.77, 2: 4.82/4.76, 3: 9.18/8.97, 4: 13.10/13.35 | 0.24 | 0 |
| opposite_nines.lines(x=13) | 1e+8 | 0: 0.00/0.00, 1: 1.61/1.59, 2: 4.35/4.36, 3: 8.43/8.37, 4: 12.51/12.54 | 0.06 | 0 |
| opposite_nines.lines(x=14) | 1e+8 | 0: 0.00/0.00, 1: 1.46/1.45, 2: 4.07/4.05, 3: 7.98/7.92, 4: 11.94/11.93 | 0.06 | 0 |
| opposite_nines.lines(x=15) | 1e+8 | 0: 0.00/0.00, 1: 1.32/1.33, 2: 3.84/3.82, 3: 7.66/7.58, 4: 11.58/11.47 | 0.11 | 0 |
| opposite_nines.lines(x=16) | 1e+8 | 0: 0.00/0.00, 1: 1.27/1.25, 2: 3.61/3.65, 3: 7.33/7.35, 4: 11.12/11.14 | 0.04 | 0 |
| opposite_nines.lines(x=17) | 1e+8 | 0: 0.00/0.00, 1: 1.19/1.20, 2: 3.52/3.55, 3: 7.17/7.20, 4: 10.93/10.93 | 0.03 | 0 |
| opposite_nines.lines(x=18) | 1e+8 | 2: 0.00/0.00, 4: 2.06/2.04, 6: 5.36/5.40, 8: 9.91/10.00, 10: 15.06/14.84 | 0.22 | 0 |
| opposite_nines.squares(x=10) | 1e+8 | 0: 0.00/0.00, 1: 2.26/2.28, 2: 5.66/5.73, 3: 10.39/10.39, 4: 16.96/17.12 | 0.15 | 0 |
| opposite_nines.squares(x=12) | 1e+8 | 0: 0.00/0.00, 1: 1.78/1.77, 2: 4.75/4.76, 3: 8.97/8.85, 4: 14.51/14.34 | 0.16 | 0 |
| opposite_nines.squares(x=14) | 1e+8 | 0: 0.00/0.00, 1: 1.44/1.45, 2: 3.96/4.03, 3: 7.55/7.67, 4: 12.58/12.67 | 0.12 | 0 |
| opposite_nines.squares(x=16) | 1e+8 | 0: 0.00/0.00, 1: 1.29/1.27, 2: 3.66/3.59, 3: 6.84/6.84, 4: 11.31/11.38 | 0.07 | 0 |

## Synergy SYN (ceiling) with the beginner eight

| variant | mirrormancer | magic_eighteen | opposite_nines | two_pair | spread_three | strangers | leapfrog | crosswise_threes | mean SYN |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| opposite_nines.base | 38 (1.00) | 23 (1.00) | 0 (1.00) | 42 (1.00) | 24 (1.00) | 41 (1.00) | 33 (1.00) | 25 (1.00) | 28.4 |
| opposite_nines.lines(x=10) | 51 (0.82) | 40 (0.82) | 21 (0.82) | 55 (0.68) | 39 (0.82) | 55 (0.79) | 38 (0.87) | 41 (0.79) | 42.5 |
| opposite_nines.lines(x=18) | 50 (0.88) | 33 (0.88) | 20 (0.83) | 51 (0.88) | 38 (0.83) | 53 (0.88) | 47 (0.88) | 39 (0.80) | 41.5 |
| opposite_nines.squares(x=10) | 51 (0.86) | 40 (0.86) | 21 (0.81) | 55 (0.78) | 40 (0.86) | 54 (0.78) | 51 (0.81) | 40 (0.81) | 44.0 |
| opposite_nines.squares(x=16) | 48 (0.89) | 35 (0.89) | 16 (0.86) | 52 (0.84) | 36 (0.85) | 51 (0.94) | 41 (0.94) | 37 (0.81) | 39.4 |

## Three-player games

Seat 0 is dealt the variant, the other two seats a random pair of the beginner eight; same seeds, seat 0 playing the base only or the whole rule.

| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |
|---|--:|--:|--:|--:|--:|--:|
| opposite_nines.lines(x=10) | 40 | 0.57 | 0.57 | 9.6 | 9.7 | 1.03 |
| opposite_nines.lines(x=18) | 40 | 0.68 | 0.60 | 11.0 | 11.0 | 1.00 |
| opposite_nines.squares(x=10) | 40 | 0.57 | 0.55 | 10.6 | 10.7 | 1.01 |
| opposite_nines.squares(x=16) | 40 | 0.55 | 0.57 | 11.0 | 11.1 | 1.00 |

## Shipped tables against the reference law at the base's top

Bits of P(tier ≥ i | base at its top): table / reference at every tier level of the reference (a sampled reference shows its boards at that level in brackets; its max error counts only levels with at least 100 boards).

| variant | status | table levels | table top | tier top | added bits (table) | added bits (reference) | levels: tier table/reference | max error (bits) | levels missed | reference |
|---|---|--:|--:|--:|--:|--:|---|--:|--:|---|
| opposite_nines.lines(x=10) | dealt | 417 | 43.07 | [4] | 16.50 | 16.12 | 0: 0.00/0.00, 1: 2.30/2.27, 2: 5.79/5.86, 3: 10.76/10.76, 4: 16.50/16.12 | 0.38 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=11) | dealt | 416 | 40.95 | [4] | 14.37 | 14.46 | 0: 0.00/0.00, 1: 1.99/1.99, 2: 5.33/5.25, 3: 9.83/9.75, 4: 14.37/14.46 | 0.08 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=12) | dealt | 419 | 39.68 | [4] | 13.10 | 13.35 | 0: 0.00/0.00, 1: 1.77/1.77, 2: 4.82/4.76, 3: 9.18/8.97, 4: 13.10/13.35 | 0.24 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=13) | dealt | 418 | 39.09 | [4] | 12.51 | 12.54 | 0: 0.00/0.00, 1: 1.61/1.59, 2: 4.35/4.36, 3: 8.43/8.37, 4: 12.51/12.54 | 0.06 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=14) | dealt | 435 | 38.52 | [4] | 11.94 | 11.93 | 0: 0.00/0.00, 1: 1.46/1.45, 2: 4.07/4.05, 3: 7.98/7.92, 4: 11.94/11.93 | 0.06 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=15) | dealt | 434 | 38.15 | [4] | 11.58 | 11.47 | 0: 0.00/0.00, 1: 1.32/1.33, 2: 3.84/3.82, 3: 7.66/7.58, 4: 11.58/11.47 | 0.11 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=16) | dealt | 435 | 37.70 | [4] | 11.12 | 11.14 | 0: 0.00/0.00, 1: 1.27/1.25, 2: 3.61/3.65, 3: 7.33/7.35, 4: 11.12/11.14 | 0.04 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=17) | dealt | 433 | 37.50 | [4] | 10.93 | 10.93 | 0: 0.00/0.00, 1: 1.19/1.20, 2: 3.52/3.55, 3: 7.17/7.20, 4: 10.93/10.93 | 0.03 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=18) | dealt | 504 | 41.64 | [10] | 15.06 | 14.84 | 2: 0.00/0.00, 4: 2.06/2.04, 6: 5.36/5.40, 8: 9.91/10.00, 10: 15.06/14.84 | 0.22 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.squares(x=10) | dealt | 417 | 43.54 | [4] | 16.96 | 17.12 | 0: 0.00/0.00, 1: 2.26/2.28, 2: 5.66/5.73, 3: 10.39/10.39, 4: 16.96/17.12 | 0.15 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.squares(x=12) | dealt | 418 | 41.08 | [4] | 14.51 | 14.34 | 0: 0.00/0.00, 1: 1.78/1.77, 2: 4.75/4.76, 3: 8.97/8.85, 4: 14.51/14.34 | 0.16 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.squares(x=14) | dealt | 443 | 39.15 | [4] | 12.58 | 12.67 | 0: 0.00/0.00, 1: 1.44/1.45, 2: 3.96/4.03, 3: 7.55/7.67, 4: 12.58/12.67 | 0.12 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.squares(x=16) | dealt | 442 | 37.89 | [4] | 11.31 | 11.38 | 0: 0.00/0.00, 1: 1.29/1.27, 2: 3.66/3.59, 3: 6.84/6.84, 4: 11.31/11.38 | 0.07 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.lines(x=9) | lab | 413 | 46.22 | [4] | 19.64 | 19.25 | 0: 0.00/0.00, 1: 2.63/2.59, 2: 6.68/6.63, 3: 12.07/12.10, 4: 19.64/19.25 | 0.39 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |
| opposite_nines.squares(x=9) | lab | 412 | 46.26 | [4] | 19.69 | 20.25 | 0: 0.00/0.00, 1: 2.56/2.62, 2: 6.38/6.31, 3: 11.39/11.30, 4: 19.69/20.25 | 0.56 | 0 | native enumeration of the 10⁸ boards with all 8 pairs at 9 |

## One fresh build

| draw | estimator | levels | seconds |
|---|---|--:|--:|
| opposite_nines.base | sampled | 120 | 4.5 |
| opposite_nines.lines(x=10) | hybrid:opposite-nines-pairs-hybrid@102 | 417 | 27.4 |
| opposite_nines.squares(x=10) | hybrid:opposite-nines-pairs-hybrid@102 | 417 | 28.4 |

## Composition comparison

| value | composition | rate4 | prior mean | top | DIFF | tier agent @48 | base-only @48 on this table | base-only @48 on the base table | base-only loses | card chars | summary sentences | table | levels | build s |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|--:|--:|
| lines(x=18) | base | 2.95 | 1.40 | 26.4 | 0.0 | – | 26.4 | 26.4 | 0.0 | 752 | 4 | shipped sampled | 120 | 8.5 |
| lines(x=18) | gated | 2.98 | 1.41 | 41.6 | 25.5 | 27.9 | 27.1 | 26.4 | -0.7 | 1292 | 6 | shipped hybrid | 504 | 45.9 |
| lines(x=18) | plain | 3.03 | 1.43 | 41.3 | 20.8 | 30.0 | 27.1 | 26.4 | -0.7 | 1209 | 5 | shipped hybrid | 2529 | 238.0 |
| lines(x=18) | unlock | 3.03 | 1.39 | 40.8 | 29.3 | 28.5 | 19.4 | 26.4 | 7.1 | 1373 | 6 | shipped sampled | 236 | 9.9 |
