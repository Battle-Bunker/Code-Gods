# Stretch and the five lens moves in the beginner line pool (pool-dynamics, 15 Nov)

The coordinator's ask (15 Nov): with stretch by 2, 3, 5, 7 in the beginner line set, without redraws, (1) do seats still
step up late, (2) the guards (a level that pays more than its cost, a runaway by repeated stretching, one stretch raising
two seated rules), (3) collateral per stretch, (4) how stretch should be priced; and which of the five lens moves
(`lenses-and-mutators.md` §5) could join the beginner set.

Run on develop at 66be173c (Smooth Intercept dealt, the ladder starters), `lib/v2-agents/scripts/pool-dynamics.ts`,
600 s games, `--drift 0`, `--seed line-q` (every configuration seats the same rules game for game), simple starters:

    node --experimental-strip-types scripts/pool-dynamics.ts --drift 0 --seed line-q --games 60 --variant line-q --climber plain
    ... --climber stretch                                   # stretch by 2, 3, 5, 7, 1/2, 1/3, 1/5, 1/7 offered every act
    ... --variant line-q-lenses --climber stretch+moves:rot.turn,coef.swap,basis.lean,basis.zoom,fold
    ... --variant line-q-lenses --games 40 --climber stretch+moves:<one>

The options climbers add the moves to the starter's own options every act; the starter's own climb prices and picks
(points per energy among the QUOTES best). The plain starter already stretches: its `rounding` and `fractions` helpers
scale a line by a denominator (1121 stretches in 60 games).

## Per configuration (seat-weighted over families)

| climber | games | mean points gained | seats still climbing the main part in the last third (row 2: ≥ 67%) | seats whose last step came in the first 120 s | objects moving in the last third | balance (best family ÷ worst) | a seat's peak bits: median / max | an object's table total: median / max |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| plain | 60 | 248 | 56% | 16% | 41% | 3.0 | 12.3 / 38.3 | 220 / 1288 |
| + stretch | 60 | 306 | 63% | 13% | 46% | 3.3 | 14.6 / 41.6 | 270 / 1128 |
| + stretch + all five | 60 | 382 | 58% | 11% | 48% | 2.3 | 14.6 / 48.4 | 311 / 1708 |
| + stretch + rot.turn | 40 | 304 | 68% | 12% | 50% | 3.2 | 14.3 / 38.3 | 274 / 1288 |
| + stretch + coef.swap | 40 | 317 | 64% | 12% | 49% | 2.6 | 14.3 / **65.6** | 275 / 1141 |
| + stretch + basis.lean | 40 | 318 | 61% | 13% | 48% | 3.3 | 12.8 / 33.2 | 261 / 1141 |
| + stretch + basis.zoom | 40 | 380 | 68% | 11% | 53% | 2.6 | 14.8 / 48.6 | 321 / 1418 |
| + stretch + fold | 40 | 348 | 62% | 13% | 53% | 3.6 | 16.4 / 50.6 | 300 / 930 |

Prime Staircase fails row 2 in every configuration (14–29% still climbing late, 43–71% plateau in the first 120 s): a
family problem, not a move problem.

## Per move (the mutator of each committed act)

| move | in | moves | mover's bits gained | fee W (bits) | gain ÷ fee | gained more than its fee | others' bits changed | halved a seat holding ≥ 2 bits | raised another seat ≥ 1 bit |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| si.shift | + stretch | 3037 | 2.72 | 9.35 | 0.29 | 5% | −2.21 | 24% | 29% |
| si.tilt | + stretch | 2033 | 2.01 | 10.41 | 0.19 | 4% | −1.33 | 17% | 20% |
| mach.stretch | plain | 1121 | 2.12 | 12.27 | 0.17 | 3% | −1.40 | 19% | 27% |
| mach.stretch | + stretch | 2817 | 3.07 | 12.19 | 0.25 | 6% | −2.62 | 29% | 28% |
| rot.turn | + turn | 1134 | 4.59 | 16.04 | 0.29 | 4% | −4.05 | 56% | 35% |
| coef.swap | + swap | 568 | 5.35 | 5.32 | **1.01** | **67%** | −5.43 | **86%** | 49% |
| basis.lean | + lean | 782 | 4.65 | 12.27 | 0.38 | 12% | −4.72 | 64% | 33% |
| basis.zoom | + zoom | 1603 | 2.87 | 8.55 | 0.34 | 7% | −2.68 | 35% | 38% |
| fold | + fold | 547 | 3.58 | 11.00 | 0.33 | 5% | −3.43 | 44% | 21% |

Longest run of one seat's consecutive stretches on one object, per game: median 2 (plain), 6 (+ stretch), 3–14 with lens
moves; max 43–93. The runs do not make runaways: the peak seat bits move from 12.3 to 14.6 (median), and only 6% of
stretches gain more than their fee.

## Reading

- **Stretch is a priced choice, not free.** Its fee is 12.2 bits on average (×2 is 5.4 before Δφ, ×3 8.5; the rest is the
  growth of φ), above a shift's 9.4, and it returns 0.25 bits per fee bit against a shift's 0.29. Offering it every act
  raises late climbing (56% → 63%) and mean points (248 → 306) without a runaway or a shared climb: a stretch raises
  another seat by a bit 28% of the time, as a shift does (29%). Keep its price (factor by digits plus Δφ).
- **coef.swap is underpriced: a bug by CLAUDE.md's rule.** Its fee is about 5.3 bits (the which, the pair, Δφ ≈ 0 since
  the swap keeps the numbers), it pays as much as it costs, two moves in three gain more than their fee, it halves an
  exposed seat 86% of the time, and it gives the highest peak (65.6 bits on one seat).
- **basis.zoom is the best fit for the ladders.** It multiplies the intercept alone, which is the valuation ladder's step
  on c without moving m (Smooth Intercept still climbing late 43% → 79%, none plateau early; Divisibility Ladder 100%), and
  it has the mildest collateral of the five (35% halving) and the most shared climbs (38%).
- **rot.turn** passes row 2 (68%) without raising peaks (max 38.3, as plain), but it is dear (16 bits) and hard on the
  others (56% halving): interesting collateral damage, priced.
- **basis.lean** gains most per fee among the priced ones (0.38, 12% above fee) and does the most damage (64% halving).
- **fold** (the reflection through a pin) lifts peaks most (median 16.4) and gives the worst balance (3.6): a reflection
  is a cheap way back to a mirrored state.
- Peaks above principle 8 already happen with the plain starters (38 bits on a seat); none of the moves reaches the
  hundreds.
