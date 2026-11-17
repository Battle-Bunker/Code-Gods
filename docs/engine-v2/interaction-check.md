# Interaction check of the dealt line rules (17 Nov)

The coordinator's questions: for the twelve dealt line rules under the live estimator at gravity 20 (beginner physics),
are there lines good for two (or three) rules at once, how dear are they from a newborn, is any joint peak cheap (a
bug), which pairs pull against each other, and does any single approach raise most rules at once. Labels: **built**,
**seen narrowly** (with its assumptions), **guess**.

Script: `lib/v2-linear/scripts/interaction-check.ts` (`pairs|triples|approach`; `ONLY="a+b;…"` for chosen groups).

## Method (seen narrowly)

- Each pair: 2 parameter draws × 3 newborn lines (the game's newborn law: most numbers 1–3 binary digits). Triples:
  24 random triples, 1 draw × 3 newborns.
- **Joint climb.** Joint points J = Σ over pairs of seats E_i·E_j (a seat's points on a line are its energy × the
  others' sum, so J is half the table's points on that line). Each turn takes the option with the best gain in J per
  bit of the turn's cost (the live route price); options are each rule's candidates at its utility + 1, 4 and 12, and
  the 12 single mutations (mc lens and the rules' own lenses) with the largest summed utility gain, all energy-estimated.
  At most 8 turns, a turn at most 120 bits; it stops when nothing gains.
- **Good for all:** every seat's energy ≥ 12 bits on the climb's best line; "distinct / runs" counts different such
  lines over the 6 runs (3 for triples).
- **Cheapest good-for-all turn:** over every first-turn option from each newborn, the one whose energies are all ≥ 12
  with the highest (sum of energies) / (turn cost); flagged **cheap** at a ratio ≥ 1.5.
- **Pull:** from the best line, each seat's own best candidate (at its utility + 1): what it costs the other seats'
  energy (positive: it hurts them).
- The runs used the estimator after #1218 (budget fix) but before #1222 (candidate fixes): Corner's, Ring's, Whole
  Stair's and Stepping Coefficients' energies were then overstated (estimator-accuracy.md).

## Headline

HEADLINE

## Pairs

| rules | good-for-all lines (distinct / runs) | best joint line: energies | its cost, turns | cheapest good-for-all turn from a newborn: energies / cost | pull: own move's loss to the other(s), bits |
|---|---|---|---|---|---|
| Bearing + Golden Path | 3 / 6 | 16.3, 60.5 | 532.8, 8 | none | 51.6, 2.5 |
| Bearing + Ring | 2 / 6 | 45.8, 98.3 | 376.4, 7 | 12.5, 22.5 / 78.9 (0.44) | 40.6, 0.3 |
| Bearing + Archimedes | 3 / 6 | 21.0, 62.0 | 432.0, 8 | 12.3, 21.1 / 88.3 (0.38) | 52.3, -9.2 |
| Bearing + Hensel | 3 / 6 | 14.7, 36.0 | 357.0, 6 | 13.0, 13.5 / 14.7 (1.80) **cheap** | 19.6, 13.1 |
| Bearing + Whole Stair | 6 / 6 | 26.7, 66.9 | 511.4, 8 | 12.1, 13.0 / 9.2 (2.72) **cheap** | 36.6, 1.5 |
| Bearing + Corner | 6 / 6 | 13.8, 173.0 | 249.5, 8 | 12.6, 24.9 / 30.7 (1.22) | 99.7, 7.2 |
| Bearing + Long Run | 4 / 6 | 13.6, 42.6 | 408.4, 7 | 13.3, 17.6 / 56.0 (0.55) | 33.1, 5.7 |
| Bearing + Prime Balance | 4 / 6 | 32.1, 230.7 | 424.1, 8 | 12.7, 51.5 / 93.7 (0.69) | 0.6, 1.3 |
| Bearing + Recurrence Pair | 3 / 6 | 29.1, 50.5 | 320.9, 7 | 21.3, 12.2 / 38.9 (0.86) | 29.0, 10.1 |
| Bearing + Unit Fraction | 5 / 6 | 41.8, 33.3 | 448.9, 8 | none | 0.0, 0.2 |
| Bearing + Stepping Coefficients | 0 / 6 | 9.0, 19.8 | 54.0, 2 | none | 13.1, 6.0 |
| Golden Path + Ring | 4 / 6 | 33.3, 50.0 | 191.5, 8 | none | 29.0, 0.1 |
| Golden Path + Archimedes | 3 / 6 | 50.1, 22.4 | 301.9, 5 | 18.3, 12.4 / 14.7 (2.09) **cheap** | 2.8, 33.4 |
| Golden Path + Hensel | 0 / 6 | 13.5, 9.0 | 66.3, 3 | none | 9.3, 12.9 |
| Golden Path + Whole Stair | 5 / 6 | 37.6, 45.2 | 376.0, 8 | 18.6, 25.3 / 56.0 (0.78) | 22.6, 18.5 |
| Golden Path + Corner | 5 / 6 | 49.0, 17.8 | 381.0, 8 | none | 8.4, 39.9 |
| Golden Path + Long Run | 0 / 6 | 0.0, 0.0 | 0.0, 0 | none | 0.0, 1.2 |
| Golden Path + Prime Balance | 5 / 6 | 34.6, 244.8 | 456.6, 8 | none | -0.4, 1.0 |
| Golden Path + Recurrence Pair | 3 / 6 | 56.8, 56.8 | 505.1, 8 | 15.7, 18.9 / 43.6 (0.79) | 1.1, 7.9 |
| Golden Path + Unit Fraction | 2 / 6 | 55.2, 34.8 | 522.2, 8 | none | -0.1, 0.1 |
| Golden Path + Stepping Coefficients | 5 / 6 | 59.5, 40.0 | 518.1, 8 | 19.5, 12.8 / 48.1 (0.67) | 3.9, 43.3 |
| Ring + Archimedes | 3 / 6 | 66.1, 38.4 | 296.4, 7 | none | 0.0, 26.7 |
| Ring + Hensel | 3 / 6 | 54.9, 14.7 | 269.8, 6 | none | 0.3, 33.2 |
| Ring + Whole Stair | 4 / 6 | 73.6, 50.2 | 386.7, 8 | none | 4.0, 45.0 |
| Ring + Corner | 3 / 6 | 84.9, 122.7 | 209.3, 4 | none | 0.1, 39.0 |
| Ring + Long Run | 3 / 6 | 51.1, 22.0 | 115.7, 4 | 12.3, 19.7 / 83.8 (0.38) | -0.6, 25.8 |
| Ring + Prime Balance | 3 / 6 | 500.1, 319.2 | 412.3, 8 | 44.1, 56.8 / 89.5 (1.13) | -32.1, 0.4 |
| Ring + Recurrence Pair | 2 / 6 | 88.5, 35.2 | 578.4, 8 | none | 0.3, 35.4 |
| Ring + Unit Fraction | 0 / 6 | 68.7, 7.2 | 239.4, 6 | none | -1.5, 47.7 |
| Ring + Stepping Coefficients | 4 / 6 | 39.6, 33.2 | 110.3, 3 | 13.8, 21.7 / 25.2 (1.41) | 22.6, 16.0 |
| Archimedes + Hensel | 4 / 6 | 29.8, 39.1 | 188.6, 5 | 12.7, 18.6 / 30.2 (1.03) | 33.0, 18.0 |
| Archimedes + Whole Stair | 5 / 6 | 13.7, 52.2 | 190.9, 6 | 12.9, 19.6 / 7.8 (4.19) **cheap** | 26.2, 19.2 |
| Archimedes + Corner | 5 / 6 | 35.1, 16.6 | 192.5, 4 | 12.5, 18.1 / 45.2 (0.68) | 26.3, 11.7 |
| Archimedes + Long Run | 3 / 6 | 56.3, 22.7 | 416.1, 7 | 12.4, 22.2 / 119.2 (0.29) | 14.5, 6.1 |
| Archimedes + Prime Balance | 5 / 6 | 29.3, 204.7 | 455.3, 8 | none | -0.2, 0.3 |
| Archimedes + Recurrence Pair | 5 / 6 | 65.4, 51.8 | 487.9, 7 | none | 6.7, 32.3 |
| Archimedes + Unit Fraction | 4 / 6 | 53.3, 34.9 | 449.1, 8 | none | 0.1, 0.1 |
| Archimedes + Stepping Coefficients | 4 / 6 | 51.5, 29.7 | 479.3, 8 | 28.4, 15.0 / 109.7 (0.40) | 4.4, 30.8 |
| Hensel + Whole Stair | 5 / 6 | 18.4, 30.0 | 254.4, 5 | 24.9, 17.4 / 92.0 (0.46) | 10.9, 27.9 |
| Hensel + Corner | 2 / 6 | 46.9, 51.0 | 221.8, 5 | 29.0, 12.6 / 103.1 (0.40) | 21.5, 18.1 |
| Hensel + Long Run | 1 / 6 | 39.3, 64.1 | 582.5, 8 | none | 1.8, -0.0 |
| Hensel + Prime Balance | 4 / 6 | 60.3, 162.1 | 397.9, 8 | none | 0.1, 0.3 |
| Hensel + Recurrence Pair | 4 / 6 | 36.0, 14.1 | 374.5, 7 | 14.7, 12.6 / 39.4 (0.69) | 4.5, 28.4 |
| Hensel + Unit Fraction | 6 / 6 | 36.0, 31.9 | 445.9, 8 | none | 0.2, 0.1 |
| Hensel + Stepping Coefficients | 5 / 6 | 39.7, 22.3 | 458.6, 8 | 13.5, 12.9 / 18.3 (1.44) | -0.6, 37.0 |
| Whole Stair + Corner | 5 / 6 | 32.8, 35.3 | 272.6, 6 | 19.7, 20.3 / 22.0 (1.82) **cheap** | 22.4, 20.2 |
| Whole Stair + Long Run | 2 / 6 | 48.5, 22.5 | 198.1, 6 | none | 10.6, 14.3 |
| Whole Stair + Prime Balance | 3 / 6 | 57.7, 165.7 | 405.7, 8 | 22.3, 12.6 / 56.0 (0.62) | 0.2, 4.3 |
| Whole Stair + Recurrence Pair | 5 / 6 | 32.5, 13.2 | 338.7, 6 | none | 12.8, 19.3 |
| Whole Stair + Unit Fraction | 3 / 6 | 64.8, 38.6 | 310.3, 8 | 41.5, 12.9 / 14.2 (3.84) **cheap** | 0.2, -0.7 |
| Whole Stair + Stepping Coefficients | 3 / 6 | 22.9, 65.4 | 241.4, 3 | none | 30.4, 12.9 |
| Corner + Long Run | 2 / 6 | 71.8, 64.0 | 484.9, 8 | none | 1.7, -1.5 |
| Corner + Prime Balance | 6 / 6 | 138.6, 83.1 | 397.1, 8 | none | 0.2, 2.6 |
| Corner + Recurrence Pair | 6 / 6 | 170.7, 14.9 | 245.2, 8 | 12.8, 16.5 / 30.4 (0.96) | 11.9, 156.5 |
| Corner + Unit Fraction | 6 / 6 | 74.3, 37.8 | 393.4, 8 | 13.3, 13.3 / 11.7 (2.28) **cheap** | 0.1, 0.9 |
| Corner + Stepping Coefficients | 5 / 6 | 194.2, 87.7 | 261.9, 8 | 15.4, 12.4 / 19.9 (1.40) | 29.3, -61.6 |
| Long Run + Prime Balance | 4 / 6 | 26.9, 199.3 | 366.6, 8 | none | 0.4, 3.9 |
| Long Run + Recurrence Pair | 4 / 6 | 45.5, 14.1 | 437.0, 7 | 16.7, 12.0 / 25.0 (1.15) | 1.1, 42.5 |
| Long Run + Unit Fraction | 2 / 6 | 31.5, 19.6 | 260.3, 5 | 16.2, 12.5 / 24.4 (1.18) | 0.3, 43.2 |
| Long Run + Stepping Coefficients | 4 / 6 | 20.6, 55.1 | 146.1, 2 | 17.0, 13.3 / 44.9 (0.68) | 5.1, 14.2 |
| Prime Balance + Recurrence Pair | 4 / 6 | 173.2, 28.1 | 413.9, 8 | none | 1.5, 0.0 |
| Prime Balance + Unit Fraction | 5 / 6 | 210.1, 26.1 | 288.5, 6 | 15.4, 18.2 / 83.8 (0.40) | 13.6, 91.1 |
| Prime Balance + Stepping Coefficients | 5 / 6 | 178.3, 77.4 | 278.7, 5 | 39.8, 12.7 / 107.9 (0.49) | 20.6, 104.5 |
| Recurrence Pair + Unit Fraction | 3 / 6 | 39.5, 32.0 | 358.5, 8 | none | 0.1, 0.6 |
| Recurrence Pair + Stepping Coefficients | 1 / 6 | 31.0, 15.1 | 210.4, 8 | 18.3, 12.3 / 76.8 (0.40) | 19.6, 9.2 |
| Unit Fraction + Stepping Coefficients | 4 / 6 | 42.6, 50.0 | 539.1, 8 | 18.2, 16.3 / 42.0 (0.82) | 9.4, 15.0 |

## Triples (24 random)

| rules | good-for-all lines (distinct / runs) | best joint line: energies | its cost, turns | cheapest good-for-all turn from a newborn: energies / cost | pull: own move's loss to the other(s), bits |
|---|---|---|---|---|---|
| Archimedes + Prime Balance + Stepping Coefficients | 2 / 3 | 243.1, 183.0, 190.1 | 347.6, 7 | none | 120.2, 70.2, 373.8 |
| Ring + Prime Balance + Recurrence Pair | 1 / 3 | 259.1, 153.8, 3.9 | 351.9, 8 | none | -19.4, 8.8, 76.2 |
| Whole Stair + Long Run + Prime Balance | 2 / 3 | 71.7, 52.6, 29.3 | 291.9, 8 | none | 4.3, -3.1, 70.3 |
| Ring + Whole Stair + Prime Balance | 2 / 3 | 147.9, 146.8, 188.4 | 399.4, 8 | none | 33.5, 91.9, 108.7 |
| Bearing + Corner + Unit Fraction | 2 / 3 | 12.4, 75.8, 34.8 | 457.1, 8 | none | 61.4, 7.1, 2.1 |
| Golden Path + Hensel + Unit Fraction | 0 / 3 | 23.3, 10.1, 33.2 | 342.9, 8 | none | 10.2, 20.9, 4.2 |
| Ring + Corner + Prime Balance | 0 / 3 | 0.0, 76.5, 136.0 | 425.3, 8 | none | -37.2, 0.3, 1.0 |
| Corner + Long Run + Prime Balance | 1 / 3 | 55.1, 59.0, 5.4 | 313.3, 8 | none | 5.5, -4.6, 55.9 |
| Archimedes + Hensel + Stepping Coefficients | 1 / 3 | 29.8, 35.9, 12.2 | 124.7, 3 | 12.1, 16.8, 12.4 / 64.7 (0.64) | 31.6, 22.4, 54.1 |
| Ring + Recurrence Pair + Stepping Coefficients | 0 / 3 | 68.6, 12.2, 8.7 | 201.8, 2 | none | 4.2, 40.8, 38.0 |
| Bearing + Golden Path + Prime Balance | 3 / 3 | 29.5, 24.4, 178.0 | 401.0, 8 | none | 16.8, 6.4, 7.7 |
| Ring + Corner + Stepping Coefficients | 1 / 3 | 71.6, 47.7, 23.3 | 246.2, 5 | none | 11.1, 44.6, 64.4 |
| Bearing + Ring + Corner | 1 / 3 | 13.8, 11.6, 42.7 | 194.0, 6 | none | 48.5, 0.4, 12.0 |
| Golden Path + Whole Stair + Stepping Coefficients | 1 / 3 | 21.9, 14.6, 20.8 | 103.7, 4 | none | 15.1, 41.4, 28.6 |
| Long Run + Recurrence Pair + Stepping Coefficients | 0 / 3 | 50.8, 7.0, 20.0 | 377.3, 7 | none | 3.9, 40.1, 8.6 |
| Long Run + Prime Balance + Stepping Coefficients | 3 / 3 | 39.6, 21.3, 21.0 | 340.6, 5 | 14.1, 13.3, 14.0 / 15.1 (2.74) **cheap** | 6.7, 48.9, 45.2 |
| Bearing + Whole Stair + Stepping Coefficients | 2 / 3 | 26.6, 49.8, 12.8 | 421.9, 7 | none | 38.9, 5.0, 59.3 |
| Golden Path + Archimedes + Whole Stair | 0 / 3 | 38.8, 5.3, 47.8 | 347.8, 8 | none | 22.1, 69.1, 30.5 |
| Archimedes + Prime Balance + Stepping Coefficients | 3 / 3 | 69.8, 151.1, 125.2 | 284.1, 6 | none | 40.5, 15.5, 209.3 |
| Bearing + Long Run + Recurrence Pair | 0 / 3 | 6.8, 66.0, 46.3 | 416.5, 8 | none | 42.3, 0.8, 6.5 |
| Bearing + Hensel + Stepping Coefficients | 2 / 3 | 12.4, 38.7, 17.9 | 420.4, 8 | none | 47.7, 4.8, 34.4 |
| Golden Path + Archimedes + Whole Stair | 2 / 3 | 20.5, 12.9, 46.3 | 397.5, 8 | none | 36.3, 49.9, 19.8 |
| Bearing + Hensel + Recurrence Pair | 2 / 3 | 14.3, 39.4, 14.3 | 453.3, 7 | 12.7, 17.3, 13.1 / 56.4 (0.76) | 50.2, 3.7, 49.2 |
| Bearing + Hensel + Whole Stair | 3 / 3 | 24.3, 15.4, 38.5 | 248.4, 4 | 12.1, 19.3, 12.6 / 101.2 (0.43) | 34.5, 38.9, 24.3 |

## One approach, many rules

From 24 newborns, every first-turn option (each rule's candidates and the best single mutations): how many of the
twelve rules' energies one option raises by at least 2 bits.

    options: 1215; rules raised ≥ 2 bits by one option (count: options): 0: 49, 1: 177, 2: 207, 3: 263, 4: 210, 5: 105, 6: 90, 7: 81, 8: 32, 9: 1
    most: 9 rules (Bearing, Golden Path, Ring, Archimedes, Whole Stair, Corner, Prime Balance, Recurrence Pair, Stepping Coefficients), line 12,7,2 from 2,2,-3 (a, b, c), turn cost 64.6 bits, the twelve energies' summed change 44.4
    best summed change per bit: 4.97 (38.1 over 7.7 bits, 6 rules ≥ 2 bits), line 4,1,-2 from 1,1,-2

## How this could be wrong

- 6 runs a pair, 3 a triple, 2 parameter draws: "none" or "one" can be bad luck; "distinct" lines are counted only
  on the climb's best line per run.
- The climb is greedy and stops at 8 turns: the median run used all 8 (it was still gaining), so "best joint line" and
  its cost are where the climb stopped, not a peak. Joint peaks deeper than 8 turns are not seen.
- J is a product: from a newborn where both energies are 0, a move raising only one rule does not raise J, so the climb
  can stall at the start (Golden Path + Long Run: 0, 0 after 0 turns). That is the method, not the rules.
- Energies are estimates (12 starts each): the "cheap" ratios compare an estimate with one turn's exact price, and a
  newborn is itself a random start, so a lucky newborn reaches a line for less than that line's average.
- Before #1222, Whole Stair and Corner were overstated by 8–18 bits at small sizes: their pairs' "cheap" ratios were
  inflated (re-run below).
