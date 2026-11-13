# Mirrormancer with tiers: measurements on the shipped tables

`Grid(4,base10,mono)`, default budget, seeded. Columns and commands: [`README.md`](README.md). Raw numbers:
`mirrormancer.profile.json`, `calibration-check.json`, `build-times.json`. How the family's tiers were chosen (sweeps,
the gate, rejected forms), with numbers from the older budget: [`mirror-tiers.md`](mirror-tiers.md).

**Measured on** the shipped tables in `lib/game-utilities/data/calibration/v1/Grid(4,base10,mono).json` (hybrid version
2: 8,192 particles and 4 sweeps at the base's top). Nothing was rebuilt, except one timed build per kind of draw.

**Dealt.** `holding` y = 0..9 (one table: every y has the same law) and `halves` x = 7..11 (three tables: 7 ~ 11,
8 ~ 10, 9). Gate: 3 mirrors.

**Exact or sampled.** Exact: the base's table (26.6 bits at its top), the base's law inside the tiered tables, and the
reference law at the top (closed form: the four lines are independent mirrors, n of the 100 mirrors qualify; all 10⁸
top boards). Sampled: every tier level of a tiered table, and all climbs, synergy and games (12 starts, 40 games).

## Findings

1. **The shipped tables are within 0.28 bits of the exact law at every tier level** (bound: 1 bit). Worst: halves
   x = 8 at four mirrors, 16.14 against 15.86.
2. **Top 36.9 to 42.7 bits; the tier adds 10.4 (holding) and 14.4 to 16.1 (halves).** Exactly: 10.41, 14.28 (x = 9)
   and 15.86 (x = 7, 8).
3. **The base climb is unchanged**: `rate4` 2.89 → 2.89–2.91, prior mean 0.92 → 0.92.
4. **Little of the tier is reached by one-cell greedy play**: a base-only agent holds 1% to 7% of the tier's headroom,
   a tier-aware agent 2% to 11%. `DIFF` rises from 0 to 23–28.
5. **Synergy**: mean `SYN` 31.1 → 41.5 (holding), 44.2–45.3 (halves). Ceilings fall from 1.00 to 0.73–0.94 on most
   pairs. With Magic Eighteen the base is already at 0.66; halves x = 9 raises that ceiling to 0.80.
6. **Games**: payoff ratio 1.00 for all three values played; win share 0.38–0.45 either way.

## Profile (gated draws, default budget)

| variant | table | levels | build s | top | +top | prior mean | rate4 | g10 | g20 | trap | gap | esc2 | K | **DIFF** | base agent | accidental | tier agent | tier share |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| mirrormancer.base | shipped exact | 15 | 0.0 | 26.6 |  | 0.92 | 2.89 | 26.6 | 26.6 | 0.00 | 0.00 | – | 1.0 | **0.0** |  |  |  |  |
| mirrormancer.holding(y=0) | shipped hybrid | 25 | 12.0 | 36.9 | 10.4 | 0.92 | 2.91 | 27.7 | 27.7 | 0.25 | 0.21 | 1.00 | 1.0 | **23.1** | 27.2 | 0.06 | 27.7 | 0.11 |
| mirrormancer.halves(x=7) | shipped hybrid | 25 | 9.4 | 42.5 | 15.9 | 0.92 | 2.89 | 27.2 | 27.2 | 0.36 | 0.20 | 1.00 | 1.0 | **28.0** | 27.0 | 0.03 | 27.2 | 0.04 |
| mirrormancer.halves(x=8) | shipped hybrid | 25 | 12.1 | 42.7 | 16.1 | 0.92 | 2.89 | 26.9 | 26.9 | 0.37 | 0.10 | 1.00 | 1.0 | **23.5** | 26.7 | 0.01 | 26.9 | 0.02 |
| mirrormancer.halves(x=9) | shipped hybrid | 25 | 8.3 | 41.0 | 14.4 | 0.92 | 2.89 | 27.9 | 27.9 | 0.32 | 0.14 | 1.00 | 1.0 | **22.8** | 27.6 | 0.07 | 27.9 | 0.09 |

## Liveness at the base's top (hybrid law)

| variant | tier min | tier top | share at top | added bits | degenerate boards | problems |
|---|--:|--:|--:|--:|---|---|
| mirrormancer.holding(y=0) | 0 | 4 | 7.65e-4 | 10.4 | none | alive |
| mirrormancer.halves(x=7) | 0 | 4 | 1.64e-5 | 15.9 | none | alive |
| mirrormancer.halves(x=8) | 0 | 4 | 1.38e-5 | 16.1 | none | alive |
| mirrormancer.halves(x=9) | 0 | 4 | 4.62e-5 | 14.4 | none | alive |

## Calibration error against the exact law at the base's top

Bits of P(tier ≥ i | base at its top): hybrid / exact, at every tier level the exact law has (– : the hybrid never saw the level).

| variant | boards | levels: tier hybrid/exact | max error (bits) | levels missed |
|---|--:|---|--:|--:|
| mirrormancer.holding(y=0) | 1e+8 | 0: 0.00/0.00, 1: 0.85/0.87, 2: 2.79/2.80, 3: 5.81/5.87, 4: 10.35/10.41 | 0.06 | 0 |
| mirrormancer.halves(x=7) | 1e+8 | 0: 0.00/0.00, 1: 1.84/1.82, 2: 5.09/5.04, 3: 9.72/9.62, 4: 15.90/15.86 | 0.10 | 0 |
| mirrormancer.halves(x=8) | 1e+8 | 0: 0.00/0.00, 1: 1.74/1.82, 2: 4.92/5.04, 3: 9.60/9.62, 4: 16.14/15.86 | 0.28 | 0 |
| mirrormancer.halves(x=9) | 1e+8 | 0: 0.00/0.00, 1: 1.53/1.54, 2: 4.39/4.40, 3: 8.60/8.54, 4: 14.40/14.28 | 0.12 | 0 |

## Synergy SYN (ceiling) with the beginner eight

| variant | mirrormancer | magic_eighteen | opposite_nines | two_pair | spread_three | strangers | leapfrog | crosswise_threes | mean SYN |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| mirrormancer.base | 0 (1.00) | 55 (0.66) | 41 (1.00) | 34 (1.00) | 38 (1.00) | 26 (1.00) | 17 (1.00) | 37 (1.00) | 31.1 |
| mirrormancer.holding(y=0) | 15 (0.94) | 62 (0.65) | 50 (0.85) | 44 (0.89) | 47 (0.85) | 38 (0.85) | 29 (0.86) | 46 (0.89) | 41.5 |
| mirrormancer.halves(x=7) | 20 (0.82) | 65 (0.60) | 53 (0.86) | 48 (0.79) | 51 (0.73) | 41 (0.82) | 33 (0.79) | 50 (0.82) | 45.3 |
| mirrormancer.halves(x=9) | 17 (0.87) | 64 (0.80) | 53 (0.81) | 47 (1.00) | 50 (0.74) | 40 (0.81) | 33 (0.83) | 49 (0.83) | 44.2 |

## Three-player games

Seat 0 is dealt the variant, the other two seats a random pair of the beginner eight; same seeds, seat 0 playing the base only or the whole rule.

| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |
|---|--:|--:|--:|--:|--:|--:|
| mirrormancer.holding(y=0) | 40 | 0.40 | 0.40 | 9.4 | 9.4 | 1.00 |
| mirrormancer.halves(x=7) | 40 | 0.38 | 0.38 | 9.3 | 9.3 | 1.00 |
| mirrormancer.halves(x=9) | 40 | 0.40 | 0.45 | 10.0 | 10.1 | 1.00 |

## Shipped tables against the reference law at the base's top

Bits of P(tier ≥ i | base at its top): table / reference at every tier level of the reference (a sampled reference shows its boards at that level in brackets; its max error counts only levels with at least 100 boards).

| variant | status | table levels | table top | tier top | added bits (table) | added bits (reference) | levels: tier table/reference | max error (bits) | levels missed | reference |
|---|---|--:|--:|--:|--:|--:|---|--:|--:|---|
| mirrormancer.holding(y=0) | dealt | 25 | 36.93 | [4] | 10.35 | 10.41 | 0: 0.00/0.00, 1: 0.85/0.87, 2: 2.79/2.80, 3: 5.81/5.87, 4: 10.35/10.41 | 0.06 | 0 | closed form: 18 of the 100 mirrors qualify, 4 independent lines (all 1e+8 top boards) |
| mirrormancer.halves(x=7) | dealt | 25 | 42.47 | [4] | 15.90 | 15.86 | 0: 0.00/0.00, 1: 1.84/1.82, 2: 5.09/5.04, 3: 9.72/9.62, 4: 15.90/15.86 | 0.10 | 0 | closed form: 8 of the 100 mirrors qualify, 4 independent lines (all 1e+8 top boards) |
| mirrormancer.halves(x=8) | dealt | 25 | 42.72 | [4] | 16.14 | 15.86 | 0: 0.00/0.00, 1: 1.74/1.82, 2: 4.92/5.04, 3: 9.60/9.62, 4: 16.14/15.86 | 0.28 | 0 | closed form: 8 of the 100 mirrors qualify, 4 independent lines (all 1e+8 top boards) |
| mirrormancer.halves(x=9) | dealt | 25 | 40.98 | [4] | 14.40 | 14.28 | 0: 0.00/0.00, 1: 1.53/1.54, 2: 4.39/4.40, 3: 8.60/8.54, 4: 14.40/14.28 | 0.12 | 0 | closed form: 10 of the 100 mirrors qualify, 4 independent lines (all 1e+8 top boards) |

## One fresh build

| draw | estimator | levels | seconds |
|---|---|--:|--:|
| mirrormancer.base | exact:mirrormancer@1 | 15 | 0.0 |
| mirrormancer.holding(y=0) | hybrid:mirrormancer-lines-hybrid@102 | 25 | 12.3 |
| mirrormancer.halves(x=7) | hybrid:mirrormancer-lines-hybrid@102 | 25 | 9.2 |

## Synergy with the beginner eight (2026-11-13, the shipped rules and tables)

`SYN` = 100 × (1 − considerate joint value), the ceiling in brackets; higher `SYN` is harder to combine. Measured with
`pnpm --filter @workspace/game-utilities tiered --families mirrormancer --pair-limit 8 --no-games --no-exact`.
Every tier raises `SYN` against every partner and lowers the ceiling from 1.00 to 0.80–0.90: the rise tracks the tier's
added reach, not what the tier asks for, so no tier of this family agrees with a partner's rule
(docs/layered-rules-design.md §8.1).

| variant | mirrormancer | magic_eighteen | opposite_nines | two_pair | spread_three | strangers | leapfrog | crosswise_threes | mean SYN |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| mirrormancer.base | 0 (1.00) | 55 (0.66) | 41 (1.00) | 34 (1.00) | 38 (1.00) | 26 (1.00) | 17 (1.00) | 37 (1.00) | 31.1 |
| mirrormancer.holding(y=0) | 15 (0.94) | 62 (0.65) | 50 (0.85) | 44 (0.89) | 47 (0.85) | 38 (0.85) | 29 (0.86) | 46 (0.89) | 41.5 |
| mirrormancer.halves(x=7) | 20 (0.82) | 65 (0.60) | 53 (0.86) | 48 (0.79) | 51 (0.73) | 41 (0.82) | 33 (0.79) | 50 (0.82) | 45.3 |
| mirrormancer.halves(x=8) | 20 (0.81) | 65 (0.63) | 54 (0.81) | 48 (0.86) | 50 (0.79) | 38 (0.86) | 34 (0.79) | 50 (0.81) | 45.1 |
| mirrormancer.halves(x=9) | 17 (0.87) | 64 (0.80) | 53 (0.81) | 47 (1.00) | 50 (0.74) | 40 (0.81) | 33 (0.83) | 49 (0.83) | 44.2 |
