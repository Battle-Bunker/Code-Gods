# Playtest round 31 (2026-11-15, develop at 6a54a73e): the widened starter search (#855)

The agents session (W2) asked for this round: #855 lets the Simple and Thorough line starters also try mirrors, a
sideways slide, pivots about x = ±2 and moving one intercept (moves in the game's menu only). Fresh local deployment,
app build f7c78d95, **time scale 1**, three full ten-minute practice games of Lines · beginner, three cold accounts.
Prime Gradient was not dealt to the human in six tries; Same on Both Rulers was. 0 errors in the engine log; every
scheduled tick succeeded. Screenshots: `docs/screenshots/playtest/round-31/`.

## The rules dealt (family / tie-breaker)

| Game | Human | Partner 1 | Partner 2 |
|---|---|---|---|
| JHQESY (carol, 1440) | **Same on Both Rulers** / shared-factor | Prime Landing / shared-factor | Square Area / lpf |
| 4YBY22 (alice, 1440) | Treasure / shared-factor | Pythagorean Area / shared-factor | Prime Landing / shared-factor |
| EHDKX4 (bob, 390) | Treasure / shared-factor | Divisibility Ladder / next-rung | Ruler / far |

## Does the board keep moving?

| Game | Objects changed in each minute 0–9 | Changing moves per third | Still minutes | Lines still > 4 min | Highest bits | Own agent, last third |
|---|---|---|---|---|---|---|
| JHQESY (carol) | 3, 2, 1, 1, 2, 2, 2, 2, 3, 3 | 67 / 56 / 46 | 0 | 2 of 5 | 9.27 | 17 moves, 1 raised her points |
| 4YBY22 (alice) | 3, 2, 1, 1, 2, 1, 1, 1, 2, 2 | 34 / 20 / 41 | 0 | 3 of 5 | 8.97 | 8 moves, 0 raised her points |
| EHDKX4 (bob, phone) | 3, 1, 1, 1, 2, 1, **0, 0**, 1, 1 | 38 / 17 / 22 | 2 | 4 of 5 | 5.80 | 5 moves, 4 raised his points |

Ticks were 28–35 a minute, with a median of 0.3–0.6 s, slightly slower than round 30 (0.2–0.4 s). Each game had
two ticks of 4.5–6.5 s, and they came at the same moments across games.

## Per agent (W2's request)

| Game · seat | Acts | Skip share | Failures | Energy left | Committed changing moves by mutator | Changing moves per third |
|---|---|---|---|---|---|---|
| JHQESY · carol (Same on Both Rulers) | 519 | 87% | 0 | 27 | shift 57, mirror 5, stretch 1, turn 1, int.move 1 | 25 / 23 / 17 |
| JHQESY · partner 1 (Prime Landing) | 643 | 86% | **47** | 32 | shift 35, mirror 4, pivot 2, slide 1 | 17 / 15 / 10 |
| JHQESY · partner 2 (Square Area) | 623 | 90% | 0 | 31 | shift 56, tilt 2, stretch 1, mirror 1, slide 1, int.move 1 | 25 / 18 / 19 |
| 4YBY22 · alice (Treasure) | 638 | 96% | 0 | 34 | **mirror 14**, shift 7, stretch 1, pivot 1, tilt 1 | 12 / 4 / 8 |
| 4YBY22 · partner 1 (Pythagorean Area) | 691 | 95% | 0 | 47 | shift 15, **slide 7**, int.move 3, stretch 3, tilt 2, nudge 1, mirror 1 | 10 / 9 / 13 |
| 4YBY22 · partner 2 (Prime Landing) | 444 | 91% | 0 | 39 | shift 14, **mirror 13**, slide 5, int.move 3, tilt 3, pivot 1 | 12 / 7 / 20 |
| EHDKX4 · bob (Treasure) | 479 | 94% | 0 | **2** | tilt 23, shift 2, pivot 2, nudge 2, slide 1 | 18 / 7 / 5 |
| EHDKX4 · partner 1 (Divisibility Ladder) | 789 | **98%** | 0 | **269** | shift 10, slide 1, tilt 1, stretch 1 | 3 / 1 / 9 |
| EHDKX4 · partner 2 (Ruler) | 512 | 93% | 0 | **196** | tilt 21, shift 10, pivot 2, mirror 1 | 17 / 9 / 8 |

- **The new moves are used:** across all agents, 39 mirrors, 16 slides, 8 pivots and 8 intercept moves were committed.
  The mirror is the most taken; it was the top move for alice's Treasure agent and for the Prime Landing partner.
- **The skip share barely moved:** 86–98% (round 30: 91–98%). Bob's two partners again left 196–269 energy unspent.
- **Failures:** 47 for the Prime Landing partner in carol's game, the only failing seat.

## Does Same on Both Rulers run ahead?

**Narrowly.** Carol finished **1st, 296.32**, with both partners close behind for the whole game (01). Her agent reached
the **second rung**: line 2's unchanged number −22 "rounds to minus the palindrome 22" (10.52 bits, 155.08 points). In
round 30 no line passed the first rung (2). The table was the busiest of the three (169 changing moves), but the
movement is mostly shift (148 of 169 changing moves) and mostly a tug: line 1 had "86 pulls, 655.93 energy".

## Prime Gradient's line 1 (round 29's 71-pull tug)

**Not tested:** Prime Gradient was not dealt to the human in six deals. It appears only as a partner seat in practice
games this round.

## Other things seen

- Bob's end advice says the tug on line 5 was *"2 pulls, 390.77 energy"*. Two pulls costing 390 energy looks wrong,
  or at least is not explained (03).
- On carol's card a line off its rung reads *"the number the machine leaves unchanged −2⁶⁄₇ · not on a rung yet"*,
  while the card itself says "where the line meets y = x". Two names are used for one thing (01).

## Ranked

| Rank | What |
|---|---|
| 1 | The skip share stays at 86–98% even with the widened search; one partner (98%, 269 energy unspent) did almost nothing |
| 2 | Busy boards are tugs: line 1 in carol's game took 86 pulls |
| 3 | Your own agent rarely helps you late: alice 0 of 8, carol 1 of 17 |
| 4 | Same on Both Rulers did step up to 22 and narrowly led, so that ladder now climbs |
| 5 | The end advice's "2 pulls, 390.77 energy" and the two names for the unchanged number |
