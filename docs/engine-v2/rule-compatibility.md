# Rule compatibility on whole-number lines (diagnosis, 2026-11-15)

**The finding, in plain words.**
- **Naive play is a coordination failure.** Points on a line are your rarity times the others' rarity, added up, so a
  line that is good for everyone pays everyone.
- **Settling and holding pays about 18× on a mixed table.** When every player brings the lines to one agreed state and
  holds them there, everyone scores far more than when each climbs their own rule.
- **Keeping off each other's lines does not pay.** On these tables, staying off lines lost to naive play.

All runs below: 3-player mixed table (Prime Landing/big-prime, Treasure/prime-terms, Whole Crossing/k-spf), server
economy, 300 s, 2 games. Table total points at the end:

| How the three seats play | Table total | Lowest seat | Against naive |
|---|--:|--:|--:|
| Naive starters | 8,695 | 2,399 | 1× |
| Keep off each other's lines (protect every line) | ≈ 7,600 | – | 0.9× |
| My points must not fall (rarity × others' total) | ≈ 11,400 | – | 1.3× |
| Model seats that deal in chat (cheapest model) | ≈ 10,600 | – | 1.2× |
| One seat settles every line at y = −x + 59 and holds | 52,183 | 6,001 | 6× |
| **All seats settle every line at y = −x + 59 and hold** | **157,701** | **14,677** | **18×** |

Rows marked ≈ were measured as points gained and converted to totals at the end by adding the table's starting
points (about 440).

The coordinated optimum, the state that maximises the table's total points on one line, against naive play per line
at the end (`scripts/anarchy.ts`):

| Table | Optimum / naive per line | Energy to move every line there, of the players' energy |
|---|--:|---|
| 2 players, compatible | 2.7× | 20k of 79k ⚡ |
| 2 players, conflict | 3.4× | 19k of 79k ⚡ |
| 3 players, compatible | 0.9× (naive already gets there) | 8k of 119k ⚡ |
| 3 players, mixed | 17× | 18k of 119k ⚡ |
| 4 players, mixed | 5× | 18k of 158k ⚡ |

**How a player can do it.**
1. Say in chat what your own rule wants, and ask the others the same. A player may always describe their own rule; no
   tool reads hidden rules.
2. Agree a state, e.g. "settle lines 3 and 7 at y = −x + 59 and hold them".
3. Set the starter's TARGET and SETTLE to that state and those lines. The agent then moves the lines there, holds them,
   and tells its owner "Holding line 7 at y = −x + 59 as agreed."


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

## Tables: how many can win together (2–4 players)

`lib/v2-agents/scripts/tables.ts` (lines, exact at game scale, every dealt tie-breaker) and
`lib/v2-agents/scripts/grid-tables.ts` (grids: 4×4 digits, too many boards to enumerate, so a hill-climbing search with
restarts; its counts are lower bounds). A table is winnable when some single object (one line, or one board) lets
every player keep the share of their best alone.

| Players | Lines, ≥ 80% (family sets with a winnable deal) | Grids, ≥ 80% (search) | Lines, ≥ 50% | Grids, ≥ 50% (search) |
|---|---|---|---|---|
| 2 | 9 of 28 (35 of 229 rule pairs) | 4 of 28 | 22 of 28 | 23 of 28 |
| 3 | 2 of 56 (6 of 1,287 tables) | 0 of 56 | 18 of 56 | 18 of 56 |
| 4 | 0 of 70 (0 of 4,455 tables) | 0 of 70 | 1 of 70 | 3 of 70 |

- **More freedom per object does not make shared wins common.** A grid's sixteen cells give no more winnable tables
  than a line's two numbers: grid rules read the whole board, so they compete for the same cells.
- **Three or more players rarely share a win, and four never do at 80%.**
- **The winnable 3-player line tables** all combine Prime Landing (reads the y-intercept) with Prime Gradient and a
  gradient-factor tie-breaker (Treasure or Whole Crossing m-spf), which all want a prime gradient. That is the
  "compatible deal": families whose main parts read different features (c vs m), or whose tie-breakers want the same
  thing.
- **Multi-line objects (line-z4):** waiting for the spec lead's answer on how a rule scores an object of several lines.
  If it is the best line, players can each own a line in one object and shared wins become easy; if it is a sum, it is
  no easier than one line.

## Play on a compatible table (server economy, 300 s, 2 games; mean points gained a seat)

Prime Landing/m-spf, Treasure/m-spf and Prime Gradient/prime (a winnable 3-player table), against the mixed table of the
earlier runs (Prime Landing/big-prime, Treasure/prime-terms, Whole Crossing/k-spf):

| Table | Naive | New starters (quarter-energy cap) | New starters, no cap | Model seats (cheap, commitments) |
|---|--:|--:|--:|--:|
| Compatible | 14,649 | 9,937 | 13,967 | ≈ 9,600 (deals 16, kept 10) |
| Mixed | 2,752 | 2,246 | 2,119 | 1,908 |

- **A compatible deal multiplies everyone's points by about five.** That is the cooperation lesson at the table level:
  which rules sit together decides most of the score.
- **On a compatible table, greedy play is already cooperation.** Each move toward one's own goal also helps the others,
  so anything that slows the agents (the energy cap, keeping off lines) costs points. The cap is now dropped; without
  it the starters come within 5% of Naive there.
- **On a conflicted table nothing beats Naive.** There are few shared lines to protect, and points go to whoever moves
  most.
- **What would make keeping deals pay:** tables where shared states exist but greedy play does not find them, i.e.
  partial compatibility where coordination (agreeing which shared target to build) matters. The pool has few such
  pairs.

## Cooperating agents against naive ones (server economy, 300 s, 2 games; table totals)

The agents' host now answers `othersAfter(plan)`: the other players' rarity on the line, added up, now and after a
candidate plan (the total only, never each player's; a small read). The helper `fair(offer, plan)` and the starters'
`PROTECT = []` list build on it: on protected lines a starter only makes moves that keep the others at least as well
off.

| Table | Naive | Starters | Protect every line (`fair`) | Own points never fall (rarity × others' total after the move ≥ before) |
|---|--:|--:|--:|--:|
| Mixed (conflicted) | 8,257 | 6,357 | 7,153 | **10,977** |
| Compatible | **43,947** | 41,902 | 25,047 | 27,524 |

- **Never lowering the others is too strict.** It gives up moves that raise the mover far more than they cost the
  others, and it loses on both tables.
- **"My points must not fall" beats naive on the conflicted table by a third, in total and per seat.** That is the
  rule the scoring rewards: a move that spoils a line for the others lowers the mover's own points. It loses on the
  compatible table, where climbing often passes through states that briefly lower the others.
- **So no single rule wins everywhere yet.** Whether the starters adopt the points-never-fall rule depends on which
  tables the server deals (owner's call).
