# Kings and Subjects with tiers: measurements on the shipped tables

`Grid(4,base10,mono)`, default budget, seeded. Columns and commands: [`README.md`](README.md). Raw numbers:
`kings-and-subjects.profile.json`, `calibration-check.json`, `build-times.json`. How the base and the tiers were chosen
(candidates, sweeps, rejected forms), with numbers from the older budget: [`royal-court.md`](royal-court.md).

**Measured on** the shipped tables in `lib/game-utilities/data/calibration/v1/Grid(4,base10,mono).json` (hybrid version
2: 8,192 particles and 4 sweeps at the base's top). Nothing was rebuilt, except one timed build per kind of draw.

**Dealt.** `pairs` x = 1..5 and `sameRoads` y = 2, 3, 4 (eight tables: nothing folds). Lab: paths x = 17, 20 and pairs
x = 13. Gate: 4 courts.

**Exact or sampled.** Exact: the base's law inside the tiered tables (top `[4, 0]`, 14.81 bits). Sampled: every tier
level of a tiered table, the base draw's own shipped table (14.6 bits at its top), and all climbs, synergy and games
(12 starts, 40 games). **The tier's law at the top is not computable exactly**: the tiers read kings and roads across
boxes (no product form) and the top set has 768⁴ = 3.5·10¹¹ boards. The reference here is an independent uniform sample
of that set (each corner box an independent uniform court): 2·10⁶ boards a value, 2·10⁷ for sameRoads y = 2 and 3. It
is unbiased, not exact; it cannot see a level rarer than about 1 board in 10⁶ (10⁷).

## Findings

1. **sameRoads y = 2 and y = 3 are above the cap in their shipped tables.** The version 2 law found a rarer best tier
   than the old budget did: 6 roads for y = 2 (was 5) and 4 roads for y = 3 (was 3). The tables say they add 25.5 and
   25.9 bits (top 40.3 and 40.7), and the liveness check on that law refuses both ("above the cap of 20"):
   `test/royal-court.test.ts` "every dealt tier is alive" fails on `{"id":"sameRoads","y":2}: adds 25.5 bits, above
   the cap of 20` (run here; 11 pass, 1 fails).
2. **The top level of the y = 2 table is off by about 4.8 bits, beyond the bound of 1.** The 2·10⁷ sample holds 12
   boards with 6 roads: 20.7 added bits (19.9 to 21.6 at 95%), against 25.5 in the table. So y = 2 sits at the cap,
   not 5 bits over it. The level below (5 roads) is 0.43 off (13.47 against 13.04, 2,373 boards). For y = 3 the sample
   holds 1 board with 4 roads: 24.3 bits (21.8 to 29.6 at 95%), consistent with the table's 25.9 and above the cap
   either way.
3. **Every other level agrees with the sample**: pairs x = 1..5 within 0.30 bits at every level, the top included
   (169 to 328 sampled boards there); sameRoads y = 4 within 0.03; sameRoads y = 2 and 3 within 0.36 and 0.16 below
   their top level. Lab values agree within 0.25 bits where the sample has 100 boards; their tops (31.7 to 33.9 bits
   added) are far beyond the sample.
4. **pairs: top 27.5 to 28.3 bits, +12.6 to 13.5** over the base's exact top; sameRoads y = 4: top 27.2, +12.4.
5. **The base climb moves a little**: `rate4` 2.79 → 2.96–3.20 (pairs) and 2.84–3.10 (sameRoads); prior mean
   1.40 → 1.41. The cause was not measured (royal-court.md: 223 of 400 greedy climbs hold four courts after 4 moves,
   so the gate can open inside the first four moves).
6. **Tier share**: pairs: a base-only greedy agent ends with 4% to 9% of the tier's headroom, a tier-aware one 19% to
   26%. sameRoads: 0% to 4% and 3% to 11%. `DIFF` rises from 0 to 24–29 (pairs) and 25–38 (sameRoads).
7. **Synergy**: mean `SYN` 45.6 → 59.8–59.9 (pairs), 60.0 (sameRoads y = 4), 66.1 (y = 2). The pair with Two Pair is
   hard already (73, ceiling 0.43) and gets harder (80–84, ceiling 0.26–0.31).
8. **Games**: payoff ratio 0.99 to 1.01. Win share is low either way (0.05 to 0.20).

## Profile (gated draws, default budget)

| variant | table | levels | build s | top | +top | prior mean | rate4 | g10 | g20 | trap | gap | esc2 | K | **DIFF** | base agent | accidental | tier agent | tier share |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| kings_and_subjects.base | shipped sampled | 84 | 8.4 | 14.6 |  | 1.40 | 2.79 | 14.6 | 14.6 | 0.00 | 0.00 | – | 3.0 | **0.0** |  |  |  |  |
| kings_and_subjects.pairs(x=1) | shipped hybrid | 185 | 21.8 | 28.3 | 13.7 | 1.41 | 2.96 | 17.3 | 17.3 | 0.39 | 0.12 | 1.00 | 3.2 | **25.4** | 15.5 | 0.05 | 17.3 | 0.19 |
| kings_and_subjects.pairs(x=2) | shipped hybrid | 185 | 11.1 | 27.8 | 13.2 | 1.41 | 2.96 | 17.5 | 17.5 | 0.37 | 0.18 | 1.00 | 3.0 | **27.5** | 15.5 | 0.06 | 17.5 | 0.21 |
| kings_and_subjects.pairs(x=3) | shipped hybrid | 185 | 12.3 | 27.5 | 12.9 | 1.41 | 3.05 | 17.9 | 17.9 | 0.35 | 0.16 | 0.67 | 3.7 | **25.6** | 16.0 | 0.09 | 17.9 | 0.24 |
| kings_and_subjects.pairs(x=4) | shipped hybrid | 185 | 13.7 | 27.5 | 12.8 | 1.41 | 3.17 | 18.1 | 18.1 | 0.34 | 0.13 | 1.00 | 3.2 | **23.6** | 15.4 | 0.04 | 18.1 | 0.26 |
| kings_and_subjects.pairs(x=5) | shipped hybrid | 185 | 22.2 | 27.7 | 13.1 | 1.41 | 3.20 | 17.6 | 17.6 | 0.37 | 0.21 | 1.00 | 3.3 | **28.8** | 15.9 | 0.08 | 17.6 | 0.21 |
| kings_and_subjects.sameRoads(y=2) | shipped hybrid | 185 | 28.6 | 40.3 | 25.7 | 1.41 | 3.10 | 17.6 | 17.6 | 0.56 | 0.10 | 1.00 | 3.3 | **33.2** | 15.7 | 0.04 | 17.6 | 0.11 |
| kings_and_subjects.sameRoads(y=3) | shipped hybrid | 183 | 15.8 | 40.7 | 26.1 | 1.41 | 2.99 | 15.6 | 15.6 | 0.62 | 0.15 | 1.00 | 3.0 | **38.2** | 15.0 | 0.01 | 15.6 | 0.03 |
| kings_and_subjects.sameRoads(y=4) | shipped hybrid | 181 | 20.8 | 27.2 | 12.6 | 1.41 | 2.84 | 15.2 | 15.2 | 0.44 | 0.05 | 0.67 | 3.0 | **24.5** | 14.8 | 0.00 | 15.2 | 0.03 |

## Liveness at the base's top (hybrid law)

| variant | tier min | tier top | share at top | added bits | degenerate boards | problems |
|---|--:|--:|--:|--:|---|---|
| kings_and_subjects.pairs(x=1) | 0 | 6 | 8.91e-5 | 13.5 | none | alive |
| kings_and_subjects.pairs(x=2) | 0 | 6 | 1.20e-4 | 13.0 | none | alive |
| kings_and_subjects.pairs(x=3) | 0 | 6 | 1.47e-4 | 12.7 | none | alive |
| kings_and_subjects.pairs(x=4) | 0 | 6 | 1.56e-4 | 12.6 | none | alive |
| kings_and_subjects.pairs(x=5) | 0 | 6 | 1.29e-4 | 12.9 | none | alive |
| kings_and_subjects.sameRoads(y=2) | 0 | 6 | 2.15e-8 | 25.5 | none | adds 25.5 bits, above the cap of 20 |
| kings_and_subjects.sameRoads(y=3) | 0 | 4 | 1.57e-8 | 25.9 | none | adds 25.9 bits, above the cap of 20 |
| kings_and_subjects.sameRoads(y=4) | 0 | 2 | 1.86e-4 | 12.4 | none | alive |

## Synergy SYN (ceiling) with the beginner eight

| variant | mirrormancer | magic_eighteen | opposite_nines | two_pair | spread_three | strangers | leapfrog | crosswise_threes | mean SYN |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| kings_and_subjects.base | 42 (1.00) | 36 (1.00) | 55 (0.90) | 73 (0.43) | 46 (1.00) | 51 (0.82) | 39 (1.00) | 22 (1.00) | 45.6 |
| kings_and_subjects.pairs(x=1) | 57 (0.78) | 54 (0.78) | 67 (0.75) | 80 (0.31) | 60 (0.76) | 64 (0.72) | 55 (0.88) | 41 (0.80) | 59.8 |
| kings_and_subjects.pairs(x=5) | 56 (0.76) | 54 (0.74) | 67 (0.67) | 80 (0.31) | 63 (0.76) | 64 (0.63) | 54 (0.79) | 40 (0.79) | 59.9 |
| kings_and_subjects.sameRoads(y=2) | 63 (0.84) | 62 (0.62) | 73 (0.55) | 84 (0.26) | 65 (0.63) | 70 (0.56) | 61 (0.75) | 52 (0.65) | 66.1 |
| kings_and_subjects.sameRoads(y=4) | 57 (0.84) | 53 (0.74) | 67 (0.74) | 80 (0.31) | 60 (0.74) | 64 (0.61) | 55 (0.84) | 43 (0.74) | 60.0 |

## Three-player games

Seat 0 is dealt the variant, the other two seats a random pair of the beginner eight; same seeds, seat 0 playing the base only or the whole rule.

| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |
|---|--:|--:|--:|--:|--:|--:|
| kings_and_subjects.pairs(x=1) | 40 | 0.10 | 0.15 | 6.1 | 6.0 | 0.99 |
| kings_and_subjects.pairs(x=5) | 40 | 0.20 | 0.20 | 6.1 | 6.0 | 0.99 |
| kings_and_subjects.sameRoads(y=2) | 40 | 0.13 | 0.20 | 6.2 | 6.6 | 1.01 |
| kings_and_subjects.sameRoads(y=4) | 40 | 0.05 | 0.05 | 5.7 | 5.8 | 1.00 |

## Shipped tables against the reference law at the base's top

Bits of P(tier ≥ i | base at its top): table / reference at every tier level of the reference (a sampled reference shows its boards at that level in brackets; its max error counts only levels with at least 100 boards).

| variant | status | table levels | table top | tier top | added bits (table) | added bits (reference) | levels: tier table/reference | max error (bits) | levels missed | reference |
|---|---|--:|--:|--:|--:|--:|---|--:|--:|---|
| kings_and_subjects.pairs(x=1) | dealt | 185 | 28.26 | [6] | 13.45 | 13.53 at 6 | 0: 0.00/0.00 [2000000], 1: 0.84/0.86 [1100639], 2: 2.21/2.24 [423980], 3: 3.39/3.42 [186803], 4: 5.15/5.20 [54562], 5: 7.29/7.35 [12230], 6: 13.45/13.53 [169] | 0.08 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.pairs(x=2) | dealt | 185 | 27.83 | [6] | 13.02 | 13.01 at 6 | 0: 0.00/0.00 [2000000], 1: 0.72/0.72 [1216260], 2: 1.84/1.84 [558110], 3: 3.08/3.08 [236670], 4: 5.00/4.98 [63159], 5: 7.46/7.40 [11840], 6: 13.02/13.01 [243] | 0.06 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.pairs(x=3) | dealt | 185 | 27.55 | [6] | 12.73 | 12.85 at 6 | 0: 0.00/0.00 [2000000], 1: 0.64/0.62 [1302581], 2: 1.59/1.58 [668685], 3: 2.81/2.83 [280775], 4: 4.82/4.86 [68776], 5: 7.54/7.55 [10669], 6: 12.73/12.85 [271] | 0.11 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.pairs(x=4) | dealt | 185 | 27.45 | [6] | 12.64 | 12.57 at 6 | 0: 0.00/0.00 [2000000], 1: 0.58/0.56 [1354139], 2: 1.46/1.43 [741761], 3: 2.72/2.70 [308522], 4: 4.88/4.80 [71645], 5: 7.71/7.69 [9711], 6: 12.64/12.57 [328] | 0.08 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.pairs(x=5) | dealt | 185 | 27.73 | [6] | 12.92 | 12.62 at 6 | 0: 0.00/0.00 [2000000], 1: 0.52/0.53 [1389724], 2: 1.35/1.35 [785912], 3: 2.64/2.62 [324324], 4: 4.84/4.81 [71182], 5: 7.95/7.91 [8342], 6: 12.92/12.62 [318] | 0.30 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.sameRoads(y=2) | dealt | 185 | 40.28 | [6] | 25.47 | 19.93 at 6 | 0: 0.00/0.00 [2000000], 1: 0.55/0.56 [1356912], 2: 1.95/1.97 [511250], 3: 4.30/4.35 [98109], 4: 7.83/7.86 [8611], 5: 13.47/13.11 [227], 6: 25.47/19.93 [2] | 0.36 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.sameRoads(y=3) | dealt | 183 | 40.73 | [4] | 25.92 | 13.76 at 3 | 0: 0.00/0.00 [2000000], 1: 2.42/2.46 [362407], 2: 6.90/6.96 [16076], 3: 13.92/13.76 [144] | 0.16 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.sameRoads(y=4) | dealt | 181 | 27.20 | [2] | 12.39 | 12.36 at 2 | 0: 0.00/0.00 [2000000], 1: 4.60/4.57 [84114], 2: 12.39/12.36 [381] | 0.03 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.paths(x=17) | lab | 200 | 48.67 | [21] | 33.86 | 19.35 at 13 | 0: 0.00/0.00 [2000000], 1: 0.63/0.63 [1289868], 2: 1.72/1.70 [614397], 3: 3.13/3.09 [235590], 4: 4.71/4.66 [79021], 5: 6.40/6.35 [24595], 6: 8.09/8.09 [7335], 7: 9.96/9.83 [2190], 8: 11.67/11.51 [685], 9: 13.46/13.21 [211], 10: 15.03/14.68 [76], 11: 16.27/16.35 [24], 12: 17.43/17.47 [11], 13: 19.41/19.35 [3] | 0.25 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.paths(x=20) | lab | 199 | 48.00 | [20] | 33.19 | 20.93 at 16 | 0: 0.00/0.00 [2000000], 1: 0.51/0.52 [1397630], 2: 1.40/1.43 [743477], 3: 2.62/2.66 [315551], 4: 4.08/4.12 [114744], 5: 5.64/5.73 [37703], 6: 7.35/7.42 [11713], 7: 9.08/9.16 [3501], 8: 10.82/10.90 [1050], 9: 12.41/12.66 [309], 10: 14.24/14.35 [96], 11: 16.14/15.76 [36], 12: 17.53/17.61 [10], 13: 18.96/18.93 [4], 14: 20.00/19.93 [2], 16: 20.94/20.93 [1] | 0.25 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.pairs(x=13) | lab | 185 | 46.49 | [6] | 31.68 | 19.35 at 5 | 0: 0.00/0.00 [2000000], 1: 0.94/0.95 [1037077], 2: 3.41/3.40 [190116], 3: 6.59/6.54 [21486], 4: 12.04/11.97 [499], 5: 18.68/19.35 [3] | 0.07 | 0 | sampled, not exact: 2e+6 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.sameRoads(y=2) (2·10⁷ sample) | dealt | 185 | 40.28 | [6] | 25.47 | 20.67 at 6 | 0: 0.00/0.00 [20000000], 1: 0.55/0.56 [13567238], 2: 1.95/1.97 [5116154], 3: 4.30/4.35 [982066], 4: 7.83/7.88 [84684], 5: 13.47/13.04 [2373], 6: 25.47/20.67 [12] | 0.43 | 0 | sampled, not exact: 2e+7 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |
| kings_and_subjects.sameRoads(y=3) (2·10⁷ sample) | dealt | 183 | 40.73 | [4] | 25.92 | 24.25 at 4 | 0: 0.00/0.00 [20000000], 1: 2.42/2.47 [3618591], 2: 6.90/6.95 [161893], 3: 13.92/13.85 [1357], 4: 25.92/24.25 [1] | 0.08 | 0 | sampled, not exact: 2e+7 uniform boards with four courts (768 courts a box, 3.5e+11 top boards), independent of the hybrid law |

## One fresh build

| draw | estimator | levels | seconds |
|---|---|--:|--:|
| kings_and_subjects.base | sampled | 84 | 4.6 |
| kings_and_subjects.pairs(x=1) | hybrid:kings-and-subjects-boxes-hybrid@102 | 185 | 17.2 |
| kings_and_subjects.sameRoads(y=2) | hybrid:kings-and-subjects-boxes-hybrid@102 | 185 | 19.7 |

