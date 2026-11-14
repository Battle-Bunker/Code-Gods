# Rule compatibility on whole-number lines (diagnosis, 2026-11-15)

The question (coordinator): do pairs of the beginner pool's rules have lines that are good for both, and how much are
they worth? If most pairs are compatible and cooperating seats still lose, the agents' edits are the problem; if most
pairs conflict, the pool is.

**Method.** `lib/v2-agents/scripts/compat.ts`. For every pair of the beginner pool's rules (each family's first dealt
tie-breaker), it searches every whole-number line y = mx + c in a grid, with values from the committed value functions
(line-z); nothing is simulated. For each pair it reports:
- the line that maximises their shared points (n_A · n_B, which each of the two earns on it);
- how much of its best alone each rule keeps there.

Verdicts: **compatible** when both keep at least 80%, **partial** when both keep at least 50%, **conflict** when one
keeps less than half. The last column asks whether both main parts can be at their best on the same line.

**Findings.**

- **Most pairs conflict.** At game scale (lines with |m| ≤ 10 and |c| ≤ 60, about the size of newborn lines and of what
  a few small moves reach): 6 compatible, 7 partial and 15 in conflict, of 28 pairs. Over a wider grid (|m| ≤ 40,
  |c| ≤ 400): 7, 1 and 20. Tie-breakers like "that prime as big as possible" have no ceiling, so each rule's best alone
  moves out with the grid while shared lines do not.
- **Main parts agree more often than tie-breakers, but on few lines.** In 17 of 28 pairs both main parts can be at their
  best on one line. Often it is one line, or a handful, of the 1,200 at game scale: Prime Landing with Square Area on 2,
  Divisibility Ladder with Same on Both Rulers on 1. Rules that read different coordinates are the compatible ones:
  Prime Landing (c) with Prime Gradient (m), and Treasure, Same on Both Rulers and Divisibility Ladder (m-factor
  tie-breakers) with Prime Gradient.
- **Splitting lines does not pay.** Points are n_A · n_B per line, so "you take lines 1–8, I take 9–16" earns both
  players nothing on every split line. Only lines both value score, and most pairs have few such lines.

**So this is a pool-design finding, not only an agent problem.** On most pairs, keeping off a partner's lines gives up
moves without opening a shared line worth more. Cooperation can pay where a pair is compatible. For it to pay across a
table, the pool needs more pairs that read different coordinates, or tie-breakers that agree.

## At game scale (|m| ≤ 10, |c| ≤ 60)

| Rule A | Rule B | Best shared line | A's bits there | B's bits there | Shared points | Verdict | Both main parts at their best on one line |
|---|---|---|--:|--:|--:|---|---|
| prime-landing/big-prime | square-area/spf | y = -6x + 59 | 33.1 of 33.1 (100%) | 2.5 of 21.7 (12%) | 84 | conflict | yes (2 lines) |
| prime-landing/big-prime | whole-crossing/k-spf | y = -1x + 59 | 33.1 of 33.1 (100%) | 33.7 of 33.7 (100%) | 1116 | compatible | yes (42 lines) |
| prime-landing/big-prime | divisibility-ladder/m-spf | y = -7x + 59 | 33.1 of 33.1 (100%) | 2.0 of 10.3 (19%) | 65 | conflict | no |
| prime-landing/big-prime | treasure/m-spf | y = -5x + 47 | 27.4 of 33.1 (83%) | 14.5 of 16.0 (90%) | 397 | compatible | yes (9 lines) |
| prime-landing/big-prime | same-on-both-rulers/m-spf | y = -9x + 59 | 33.1 of 33.1 (100%) | 7.3 of 15.6 (47%) | 242 | conflict | no |
| prime-landing/big-prime | prime-gradient/prime | y = 7x + 59 | 33.1 of 33.1 (100%) | 7.1 of 7.1 (100%) | 235 | compatible | yes (68 lines) |
| prime-landing/big-prime | prime-staircase/first-prime | y = -6x + 59 | 33.1 of 33.1 (100%) | 12.2 of 16.2 (75%) | 404 | partial | yes (2 lines) |
| square-area/spf | whole-crossing/k-spf | y = -2x + -58 | 21.7 of 21.7 (100%) | 19.4 of 33.7 (57%) | 421 | partial | yes (148 lines) |
| square-area/spf | divisibility-ladder/m-spf | y = -8x + -60 | 7.7 of 21.7 (36%) | 8.2 of 10.3 (80%) | 63 | conflict | yes (8 lines) |
| square-area/spf | treasure/m-spf | y = 2x + 34 | 15.7 of 21.7 (72%) | 8.1 of 16.0 (51%) | 127 | partial | no |
| square-area/spf | same-on-both-rulers/m-spf | y = -8x + 52 | 13.9 of 21.7 (64%) | 7.3 of 15.6 (47%) | 102 | conflict | yes (2 lines) |
| square-area/spf | prime-gradient/prime | y = 2x + -58 | 21.7 of 21.7 (100%) | 3.9 of 7.1 (55%) | 85 | partial | yes (60 lines) |
| square-area/spf | prime-staircase/first-prime | y = 6x + 7 | 4.1 of 21.7 (19%) | 10.7 of 16.2 (66%) | 44 | conflict | no |
| whole-crossing/k-spf | divisibility-ladder/m-spf | y = -2x + -58 | 19.4 of 33.7 (57%) | 2.7 of 10.3 (27%) | 53 | conflict | yes (28 lines) |
| whole-crossing/k-spf | treasure/m-spf | y = -1x + 41 | 25.1 of 33.7 (74%) | 7.3 of 16.0 (45%) | 183 | conflict | yes (2 lines) |
| whole-crossing/k-spf | same-on-both-rulers/m-spf | y = -6x + 42 | 8.4 of 33.7 (25%) | 10.3 of 15.6 (66%) | 86 | conflict | yes (7 lines) |
| whole-crossing/k-spf | prime-gradient/prime | y = 2x + -58 | 19.4 of 33.7 (57%) | 3.9 of 7.1 (55%) | 75 | partial | yes (144 lines) |
| whole-crossing/k-spf | prime-staircase/first-prime | y = -1x + 59 | 33.7 of 33.7 (100%) | 6.9 of 16.2 (43%) | 233 | conflict | no |
| divisibility-ladder/m-spf | treasure/m-spf | y = 7x + 24 | 6.9 of 10.3 (67%) | 10.6 of 16.0 (66%) | 73 | partial | no |
| divisibility-ladder/m-spf | same-on-both-rulers/m-spf | y = -9x + 60 | 9.3 of 10.3 (90%) | 12.0 of 15.6 (77%) | 111 | partial | yes (1 lines) |
| divisibility-ladder/m-spf | prime-gradient/prime | y = 7x + -60 | 10.3 of 10.3 (100%) | 7.1 of 7.1 (100%) | 73 | compatible | yes (8 lines) |
| divisibility-ladder/m-spf | prime-staircase/first-prime | y = -6x + 29 | 1.5 of 10.3 (15%) | 16.2 of 16.2 (100%) | 25 | conflict | no |
| treasure/m-spf | same-on-both-rulers/m-spf | y = -7x + 51 | 16.0 of 16.0 (100%) | 7.3 of 15.6 (46%) | 116 | conflict | no |
| treasure/m-spf | prime-gradient/prime | y = 7x + 23 | 16.0 of 16.0 (100%) | 7.1 of 7.1 (100%) | 114 | compatible | yes (4 lines) |
| treasure/m-spf | prime-staircase/first-prime | y = 7x + 23 | 16.0 of 16.0 (100%) | 6.9 of 16.2 (43%) | 111 | conflict | no |
| same-on-both-rulers/m-spf | prime-gradient/prime | y = 7x + -36 | 15.6 of 15.6 (100%) | 7.1 of 7.1 (100%) | 111 | compatible | yes (4 lines) |
| same-on-both-rulers/m-spf | prime-staircase/first-prime | y = -6x + 29 | 5.7 of 15.6 (36%) | 16.2 of 16.2 (100%) | 92 | conflict | no |
| prime-gradient/prime | prime-staircase/first-prime | y = 7x + 19 | 7.1 of 7.1 (100%) | 6.9 of 16.2 (43%) | 49 | conflict | no |

6 compatible, 7 partial and 15 in conflict, of 28 pairs; in 17 pairs both main parts can be at their best on the same line.

## Wider (|m| ≤ 40, |c| ≤ 400)

| Rule A | Rule B | Best shared line | A's bits there | B's bits there | Shared points | Verdict | Both main parts at their best on one line |
|---|---|---|--:|--:|--:|---|---|
| prime-landing/big-prime | square-area/spf | y = -21x + 337 | 171.2 of 201.0 (85%) | 4.8 of 108.4 (4%) | 813 | conflict | yes (2 lines) |
| prime-landing/big-prime | whole-crossing/k-spf | y = -1x + 397 | 201.0 of 201.0 (100%) | 195.2 of 195.2 (100%) | 39242 | compatible | yes (180 lines) |
| prime-landing/big-prime | divisibility-ladder/m-spf | y = -37x + 397 | 201.0 of 201.0 (100%) | 2.0 of 10.5 (19%) | 400 | conflict | no |
| prime-landing/big-prime | treasure/m-spf | y = -23x + 83 | 45.0 of 201.0 (22%) | 22.6 of 31.8 (71%) | 1018 | conflict | yes (28 lines) |
| prime-landing/big-prime | same-on-both-rulers/m-spf | y = -40x + 283 | 144.4 of 201.0 (72%) | 7.0 of 35.0 (20%) | 1008 | conflict | no |
| prime-landing/big-prime | prime-gradient/prime | y = 37x + 397 | 201.0 of 201.0 (100%) | 22.1 of 22.1 (100%) | 4442 | compatible | yes (936 lines) |
| prime-landing/big-prime | prime-staircase/first-prime | y = 30x + 359 | 182.1 of 201.0 (91%) | 19.2 of 19.2 (100%) | 3495 | compatible | yes (5 lines) |
| square-area/spf | whole-crossing/k-spf | y = -2x + -398 | 108.4 of 108.4 (100%) | 100.6 of 195.2 (52%) | 10905 | partial | yes (1136 lines) |
| square-area/spf | divisibility-ladder/m-spf | y = -2x + -398 | 108.4 of 108.4 (100%) | 2.7 of 10.5 (26%) | 296 | conflict | yes (84 lines) |
| square-area/spf | treasure/m-spf | y = 2x + 34 | 15.7 of 108.4 (14%) | 8.1 of 31.8 (26%) | 127 | conflict | no |
| square-area/spf | same-on-both-rulers/m-spf | y = -18x + 114 | 17.0 of 108.4 (16%) | 10.3 of 35.0 (29%) | 175 | conflict | yes (4 lines) |
| square-area/spf | prime-gradient/prime | y = 2x + -398 | 108.4 of 108.4 (100%) | 3.9 of 22.1 (18%) | 421 | conflict | yes (400 lines) |
| square-area/spf | prime-staircase/first-prime | y = 30x + 7 | 3.6 of 108.4 (3%) | 16.2 of 19.2 (85%) | 58 | conflict | no |
| whole-crossing/k-spf | divisibility-ladder/m-spf | y = -2x + -398 | 100.6 of 195.2 (52%) | 2.7 of 10.5 (26%) | 275 | conflict | yes (332 lines) |
| whole-crossing/k-spf | treasure/m-spf | y = -1x + 41 | 25.1 of 195.2 (13%) | 7.3 of 31.8 (23%) | 183 | conflict | yes (4 lines) |
| whole-crossing/k-spf | same-on-both-rulers/m-spf | y = -6x + 42 | 8.4 of 195.2 (4%) | 10.3 of 35.0 (29%) | 86 | conflict | yes (7 lines) |
| whole-crossing/k-spf | prime-gradient/prime | y = 1x + -397 | 195.2 of 195.2 (100%) | 2.2 of 22.1 (10%) | 434 | conflict | yes (1276 lines) |
| whole-crossing/k-spf | prime-staircase/first-prime | y = -1x + 397 | 195.2 of 195.2 (100%) | 6.9 of 19.2 (36%) | 1349 | conflict | no |
| divisibility-ladder/m-spf | treasure/m-spf | y = -11x + 60 | 10.4 of 10.5 (99%) | 10.6 of 31.8 (33%) | 111 | conflict | no |
| divisibility-ladder/m-spf | same-on-both-rulers/m-spf | y = 31x + -180 | 10.5 of 10.5 (100%) | 31.1 of 35.0 (89%) | 327 | compatible | yes (7 lines) |
| divisibility-ladder/m-spf | prime-gradient/prime | y = 37x + -360 | 10.5 of 10.5 (100%) | 22.1 of 22.1 (100%) | 232 | compatible | yes (144 lines) |
| divisibility-ladder/m-spf | prime-staircase/first-prime | y = -30x + 157 | 1.5 of 10.5 (15%) | 19.2 of 19.2 (100%) | 29 | conflict | no |
| treasure/m-spf | same-on-both-rulers/m-spf | y = -31x + 99 | 28.1 of 31.8 (88%) | 4.8 of 35.0 (14%) | 135 | conflict | no |
| treasure/m-spf | prime-gradient/prime | y = 37x + -37 | 31.8 of 31.8 (100%) | 22.1 of 22.1 (100%) | 703 | compatible | yes (12 lines) |
| treasure/m-spf | prime-staircase/first-prime | y = -23x + 83 | 22.6 of 31.8 (71%) | 6.9 of 19.2 (36%) | 156 | conflict | no |
| same-on-both-rulers/m-spf | prime-gradient/prime | y = 37x + -216 | 35.0 of 35.0 (100%) | 22.1 of 22.1 (100%) | 773 | compatible | yes (12 lines) |
| same-on-both-rulers/m-spf | prime-staircase/first-prime | y = -30x + 157 | 7.0 of 35.0 (20%) | 19.2 of 19.2 (100%) | 134 | conflict | no |
| prime-gradient/prime | prime-staircase/first-prime | y = 37x + 19 | 22.1 of 22.1 (100%) | 6.9 of 19.2 (36%) | 153 | conflict | no |

7 compatible, 1 partial and 20 in conflict, of 28 pairs; in 17 pairs both main parts can be at their best on the same line.
