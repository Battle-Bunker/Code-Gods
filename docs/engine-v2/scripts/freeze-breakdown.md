# Why objects freeze in play (15 Nov)

The coordinator's question, after the collapse check's test 4 (on the beginner lines preset, 45–86% of end objects had
no improving shortcut move): on a frozen object, is the landscape flat for every seat, or do moves that raise a seat's
points exist that the starters do not take?

`lib/v2-agents/scripts/freeze-breakdown.ts` plays the collapse check's dealt tables (line-q, 8 tables, 600 s, 3 objects,
1/240 births, β 0.05) with the shipped Simple starters. For every (end object, seat) it searches every call of the
variant priced at most 12 bits (556 calls) and the shortcut climber's moves, and sorts the seat into:

- **flat**: no move raises its bits;
- **priced out**: only moves dearer than a full charge (960⚡) raise them;
- **tension**: affordable moves raise its bits, but each cuts its points (its bits times the others'), because the others
  fall more (W2's round-29 Prime Gradient line);
- **available**: an affordable move raises its points.

40 end objects; 30% changed in the last minute.

| family | (object, seat) pairs | flat | priced out | tension | available | median best affordable gain (bits) |
|---|--:|--:|--:|--:|--:|--:|
| prime-gradient | 5 | 0% | 0% | 0% | 100% | 3.38 |
| pythagorean-area | 9 | 0% | 0% | 11% | 89% | 3.50 |
| prime-landing | 14 | 0% | 0% | 14% | 86% | 6.00 |
| same-on-both-rulers | 12 | 0% | 0% | 25% | 75% | 2.48 |
| prime-staircase | 4 | 0% | 0% | 25% | 75% | 1.66 |
| whole-crossing | 15 | 7% | 0% | 20% | 73% | 2.50 |
| smooth-intercept | 12 | 0% | 0% | 33% | 67% | 1.99 |
| square-area | 16 | 6% | 0% | 31% | 63% | 2.55 |
| treasure | 16 | 6% | 0% | 38% | 56% | 1.61 |
| divisibility-ladder | 17 | 12% | 0% | 35% | 53% | 2.52 |

## Reading

- The landscape is rarely flat (0–12%) and never priced out.
- Tension holds 0–38% of seats.
- For 53–100% of seats an affordable move raises the seat's points, by a median of 1.6–6 bits.
- The moves are almost never the Simple starter's own (shift, tilt, stretch). They are steps, slides, pivots, turns,
  mirrors, nudges and moves along an axis, for example:
  - Divisibility Ladder: a step by −3 on y = 9x + 9, 13.2⚡, own 1.74 → 5.23 bits, points 23.2 → 53.1;
  - Prime Landing: a turn by 8 on 20x − 4y − 25 = 0, 35.3⚡, own 0.48 → 10.27, points 2.4 → 36.3;
  - Prime Staircase: a mirror in the x-axis, 5.2⚡, own 6.88 → 8.54, points 76.8 → 95.4.
- That reconciles this with W2's finding on round 29. Among the starter's own candidates (tilts and shifts), every route
  onto Prime Gradient's rung cut the points, so it declined. Moves that raise the points exist, but in mutators the
  starter does not search.
- **The freeze is mostly the starters' search width**, not the rules: a matter for the agents session.

Rerun: `node --experimental-strip-types lib/v2-agents/scripts/freeze-breakdown.ts --tables 8`. It prints the table, and
for each family up to two end objects with the move that raises the seat's points most, for replaying with a starter.
