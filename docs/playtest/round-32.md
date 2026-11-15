# Playtest round 32 (2026-11-15, develop at 6d44b6e8): moving, or flipping?

After #858 (the Prime Landing starter's rung search within the step limit), #853 and #860 (Ruler as a ladder, its card
in plain sentences) and #859. Fresh local deployment, app build 9781bb50, **time scale 1**, three full ten-minute
practice games of Lines · beginner, three cold accounts. Prime Gradient was not dealt to the human in six tries, and
Prime Landing not in four. 0 errors in the engine log; every scheduled tick succeeded. Screenshots:
`docs/screenshots/playtest/round-32/`.

## The rules dealt (family / tie-breaker)

| Game | Human | Partner 1 | Partner 2 |
|---|---|---|---|
| GUHMDC (alice, 1440) | Same on Both Rulers / shared-factor | **Prime Landing** / shared-factor | Prime Staircase / shared-factor |
| DRLEK7 (carol, 1440) | Smooth Intercept / shared-factor | Whole Crossing / shared-factor | Prime Gradient / shared-factor |
| 33KX8A (bob, 390) | Square Area / spf | Treasure / shared-factor | Pythagorean Area / shared-factor |

## The headline: much of the late "movement" is a line flipped between two states

| Game | Objects changed in each minute 0–9 | Changing moves per third | Still minutes | Highest bits | Own agent, last third |
|---|---|---|---|---|---|
| GUHMDC (alice) | 3, 3, 3, 3, 3, 3, 3, 3, 4, 3 | 64 / 88 / 87 | 0 | **24.94** | 19 moves, 19 raised her points |
| DRLEK7 (carol) | 3, 2, 1, 1, 2, 1, 1, 1, 2, 1 | 44 / 36 / 29 | 0 | 11.32 | 2 moves, 2 raised her points |
| 33KX8A (bob, phone) | 3, 1, 0, 1, 2, 1, 1, 1, 2, 1 | 15 / 46 / 40 | 1 | 8.35 | 14 moves, 0 raised his points |

By the counts in rounds 28–31, alice's game was the liveliest yet: 3–4 lines changed every minute, and 239 changing
moves were made. **But in the last third, most moves only switch a line between two states.**

| Game | Last-third changing moves | Per object in the last third (moves / distinct states) |
|---|---|---|
| GUHMDC | 87, of which **76 are diagonal mirrors** | 36 / **2**, 20 / **2**, 18 / **2**, 13 / 13 |
| DRLEK7 | 29 | 25 / **2**, 4 / 4 |
| 33KX8A | 40 | 38 / 5, 2 / 2 |

In alice's game two lines were mirrored across y = x every 2–4 s for the last minutes, by both partners and by alice's
own agent:

| Line | Its two states, alternating |
|---|---|
| line "8mc5" | y = −3x/8 + 57/8 and y = −8x/3 − 57/3 |
| line "90r9" | y = −19x/7 − 133/7 and y = −7x/19 + 133/19 |

Each mirror helps the agent that makes it and undoes the last one. The end summary says it plainly:
- *"Line 2: you, Practice partner 1 and Practice partner 2 moved it 50 times … your points 124.29 → 124.29"*;
- the advice: *"pulled line 2 back and forth (59 pulls, 304.39 energy)"*;
- alice's chart is a sawtooth between about 200 and 400 from 4:00 to the end (01).

This is a two-state cycle, the cheapest possible tug. The "objects changed per minute" count, which I have reported
since round 13, cannot tell it from real movement. From this round on I also report **distinct states per object**.

The highest bits, **24.94**, were reached early (193 s) on line "97te" (y = −60x − 29).

## The agents' moves (committed changing moves)

| Game · seat | Main moves | Skip share | Failures | Energy left |
|---|---|---|---|---|
| GUHMDC · alice (Same on Both Rulers) | **mirror 32**, shift 9, pivot 6, tilt 3, stretch 2, int.move 2, turn 1, slide 1 | 90% | 0 | 21 |
| GUHMDC · partner 1 (**Prime Landing**) | **mirror 92**, pivot 5, shift 4, tilt 1 | 84% | **0** | 19 |
| GUHMDC · partner 2 (Prime Staircase) | **mirror 58**, stretch 8, shift 6, tilt 4, pivot 2, int.move 2, slide 1 | 85% | 0 | 30 |
| DRLEK7 · carol (Smooth Intercept) | stretch 5, tilt 4, pivot 3, int.move 2, shift 1 | 98% | 0 | 26 |
| DRLEK7 · partner 1 (Whole Crossing) | tilt 36, slide 3, stretch 3, mirror 3, shift 2 | 93% | 0 | 31 |
| DRLEK7 · partner 2 (Prime Gradient) | tilt 39, int.move 3, stretch 3, pivot 1, nudge 1 | 89% | 0 | 7 |
| 33KX8A · bob (Square Area) | shift 31, tilt 3, mirror 2 | 93% | 0 | 26 |
| 33KX8A · partner 1 (Treasure) | shift 23, mirror 3, stretch 3, tilt 1, pivot 1 | 95% | 0 | 47 |
| 33KX8A · partner 2 (Pythagorean Area) | shift 27, mirror 3, pivot 2, tilt 1, slide 1 | 94% | 0 | 28 |

- **#858 works:** the Prime Landing seat had 0 failures (round 31: 47).
- **No agent was left with unspent energy** this round (7–47 left; round 31 had 196–269).

## Other observations

- **Smooth Intercept (carol)** reached 81 = 3⁴ on two lines ("on 81", "on −81"). Carol finished 2nd with **501.47**; her
  chart climbs in steps (02). Her own agent made only 2 last-third moves.
- **Ticks:** 28–34 a minute, median 0.3–0.6 s. Each game had five slow ticks of 4.8–6.5 s, at the same moments
  in all three games, more than in rounds 29–31 (one or two).
- **Bob's game:** line 4 took "49 pulls, 835.11 energy" (03), and his own agent's 14 last-third moves raised his points
  0 times.

## Ranked

| Rank | What |
|---|---|
| 1 | **Two-state mirror cycles.** Alice's board was the liveliest by the per-minute count, but three of its four late-moving lines only flipped between two states (74 of 87 last-third moves); one line had 50 moves for no change in points. The mirror, now in the starters' search (#855), is the cheapest way to undo a rival |
| 2 | **Two-state tugs on other moves too:** carol's line moved 25 times between 2 states in the last third |
| 3 | **Your own agent helps you late in some games only** (alice 19 of 19, carol 2 of 2, bob 0 of 14) |
| 4 | **The shared slow ticks are more frequent:** 5 per game of 4.8–6.5 s, against 1–2 in rounds 29–31 |
| 5 | Prime Gradient (human seat) is still untested after 12 tries over two rounds |
