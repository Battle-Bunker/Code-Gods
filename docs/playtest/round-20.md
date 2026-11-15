# Playtest round 20 (2026-11-15, develop at e8b7bf34)

After #768 and #773 (**Smooth Intercept**, Prime Landing's adversary on the y-intercept, dealt in the beginner pool, and
its starter climbing the ladder), #775 (Divisibility: two q's per lens), #776 (Prime Staircase as a ladder; the
beginner start at 524 bits, 100 energy) and the design-principles docs. Develop deploy green (run 629). Fresh local
deployment, app build 2d805977, **time scale 1**. Three ten-minute practice games, each with two practice partners:
- room S2HAMP, Lines · beginner: alice at 1440, **Smooth Intercept**;
- room DUWD53, Grids · arithmetic: carol at 1440, **Divisibility**;
- room 3PNJPB, Lines · beginner: bob at 390, Treasure.

Prime Staircase was not dealt in 8 tries on bob's seat, so it is not judged here. 0 errors in the engine log.
Screenshots: `docs/screenshots/playtest/round-20/`.

Note: my seat searches left the first world running with no agent for about a minute ("You have no agent yet. Summon one
to start scoring.", 8:54 left), so each human summoned about 70 s into the world.

## Smooth Intercept, read as a 12-year-old

**Card** (01): *"The y-intercept (ignoring its sign) should be a number made only by multiplying 3s and 7s, the bigger
the better; any other line scores below them all, the closer to one the better. Tie-breaker: That number plus 1 and the
whole part of the gradient should share as big a factor as possible (a whole part of 0 shares nothing)."*

- **What does it want?** Clear: a y-intercept like 3, 7, 9, 21, 27, 49, 63 …, bigger is better. "Ignoring its sign" is
  plain.
- **The tie-breaker** is hard: "that number plus 1 and the whole part of the gradient should share as big a factor"
  needs "factor" and "whole part" at once.
- **Ladder in play**: after a redraw to "2s and 7s" (the card changed with the countdown), alice's Line 1 climbed to
  **y = 21⅓x + 64**, "main part: y-intercept 64 · on 64" (64 = 2⁶), worth 43.18 points: a real climb, well past the
  first rungs (02). Other lines sat at 6 ("1 below 7") and 4 ("on 4").
- **Why did my move help?** "Your agent Simple changed a line: y = 32x + 96 → y = 21⅓x + 64 (multiply every output by
  ⅔)". The move is legible, and the main-part line under it names the new value.
- Alice 1st, **126.01** points.

## Divisibility, read as a 12-year-old

**Card** (03): *"Read the odd rows and the even rows row by row, and the odd columns and the even columns column by
column, each as one number: each should be divisible by as high a power of 3 as possible (count the 3s that divide it),
and no two rows or two columns may hold the same numbers. Tie-breaker: What is left of those numbers after dividing out
their 3s should have digits adding up to as much as possible."*

- **What does it want?** Clearer than Leading Digits (round 19): "count the 3s that divide it" is a child's phrase, and
  each grid's line reads "main part: the powers counted: 2", with the tie-breaker "the digits of what is left, added
  up: 84". "Read the odd rows … as one number" and "no two rows or two columns may hold the same numbers" still need
  the board view to decode.
- **Why did my move help?** "Your agent Simple changed a grid (swap row 4, column 1 and row 4, column 3). Your rarity
  7.23 → 13.93 bits" (04), but not which reading gained a 3.
- **A tie**: carol and Practice partner 2 were both dealt **Divisibility** (the setup has two families for three
  seats), and the leaderboard showed them "1st TIED" at exactly **970.53** each mid-game (04). Two seats on one rule
  pull together and score alike. Carol finished 3rd, 306.18.

## Dynamics (from `v2Moves`, state-changing moves counted once per (game, seq))

| Game | Moves | Objects changed in each minute 0–9 | Changing moves per third |
|---|---|---|---|
| Lines S2HAMP (Smooth Intercept) | 175 | 3, 2, 3, 2, 3, 2, 3, 4, 3, 3 | 36 / 68 / 71 |
| Grids DUWD53 (Divisibility) | 210 | 3, 3, 3, 3, 4, 4, 2, 4, 5, 4 | 56 / 74 / 79 |

Both boards kept moving to the end, with the last third the busiest. Bob's Treasure game (phone) ended 3rd, 409.30. The
partners' lines on his chart rose to about 800 in the last two minutes (05).

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Grids · arithmetic deals three seats from two families, so two seats share a rule; they scored identically and the leaderboard showed them "TIED" at 970.53 | 04 | major (rules/dealer: the setup needs a third family, or two humans' seats must differ) |
| 2 | Smooth Intercept's tie-breaker ("that number plus 1 and the whole part of the gradient should share as big a factor") is hard for a 12-year-old | 01 | minor (wording) |
| 3 | Divisibility is readable on its main part; "read the odd rows … as one number" and "no two rows or two columns may hold the same numbers" still need the view | 03 | minor (wording) |
| 4 | Prime Staircase was not dealt in 8 beginner deals on one seat | — | watch (dealer weights?) |
