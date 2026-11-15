# Playtest round 19 (2026-11-15, develop at c51f3c53)

Readability of the redesigned rules (#761 Prime Landing; #766 "Grids · arithmetic" with Divisibility and Leading
Digits). Fresh local deployment, app build b028e014, **time scale 1**, two full ten-minute practice games, each with two
practice partners, by hand at 1440:
- room VHYDWC, Grids · arithmetic: carol was dealt **Leading Digits**;
- room PGET4D, Lines · beginner: bob was dealt **Prime Landing** (on the first try; the other seat tried was dealt
  Prime Staircase).

Divisibility was not dealt in this round. 0 errors in the engine log. Screenshots:
`docs/screenshots/playtest/round-19/`.

## 1. Leading Digits, read as a bright 12-year-old

**The card** (01): *"Read the odd rows and the even rows row by row, and the odd columns and the even columns column by
column, each as one number: each should start with the same digits as some power of 7 (up to the 1000th), for as many
digits as possible, and no two rows or two columns may hold the same numbers. Tie-breaker: For each number, take the
smallest power of 7 it starts like (to that many digits): the digits of those exponents, added up, should be as much as
possible."*

- **What does my rule want?** Partly clear. I understood: make four long numbers out of the board, and each should
  start like a power of 7. I did not understand "the odd rows … row by row, … as one number" until the view's notes
  spelled it out (*"the odd rows (row by row): starts like 7²¹³ = 101…: 3 digits"*). "No two rows or two columns may
  hold the same numbers" lost me: same numbers as what? "Up to the 1000th" is a big number a child cannot check.
- **The tie-breaker** is beyond a 12-year-old: "the digits of those exponents, added up" is two steps removed from the
  board, and nothing shows the exponents' digit sums.
- **Why did my last move help?** The act log says *"Your agent Simple changed a grid (−1 in row 1, column 4). Your
  rarity 2.17 → 5.57 bits … Points on this grid 27.05 → 57.25"* (02), but not which reading improved, or by how many
  digits. The grid's line says *"main part: the leading digits matched: 15"*; I could not connect the move to the 15.
- **What would one more step need?** Nothing on screen says it. The main-part ruler (3 … 25, at 11) shows "bigger is
  better", but not which digit to change.
- **Drift**: the card changed from "some power of 7" to "some power of **2**" mid-game (02), with the countdown "Your
  rule may get new numbers in 0:22". The board view's notes followed.
- **Play**: the main part per grid hovered 15–19 all game (sampled every 25 s: 19, 18, 17, 15, 15, 16, 19, 17) and four
  grids were three-way tugs ("undid each other's moves (50 moves)"). Carol 2nd, 747.98.

## 2. Prime Landing (redesigned), bob's seat

**The card** (04): *"The y-intercept should be a prime ending in 1, the bigger the better; any other line scores below
them all, the closer to one the better. Tie-breaker: From that prime, y(1), y(2), y(3), … should go on being new primes
ending in 1 for as long as possible."* Clear. "The closer to one" reads as "the number 1" rather than "one of them".

| Question | Verdict | Evidence |
|---|---|---|
| Does the ruler show the rungs? | **Partly**: the main-part ruler marks only **11 and 31** for "ending in 1" (no 41, 61, 71 …), with the line's y-intercept as a dot. The tie-breaker ruler marks 0, 2, 3, 5, 7, 11, 13: plain primes, not the "ending in 1" ones it counts | 04 |
| Does the agent climb past its first prime? | **Yes, but it does not hold.** The top line's y-intercept went 11 (0:26–1:43) → −2½ → 7 → 7 → −1 → 7 → −12 → **29** (4:51–5:16, "y-intercept 29 · on 29") → 7 → 7 → −1½ → 3 → **13** (end). The other players pull it back (four lines "undid each other's moves", 35–49 moves each) | 05, 06 |
| Does the tie-breaker visibly restart on a step up? | **Rarely visible**: "how long y(1), y(2), … go on being such primes" read **0** at 21 of 24 samples, and **1** twice near the end (13 with y(1) prime). It never visibly climbed | — |
| Do objects keep moving late? | **Yes**: 183 moves; objects changed per minute 3, 2, 3, 3, 4, 4, 4, 4, 5, 4; changing moves per third 67 / 59 / 57 | — |
| Drift | the ending digit changed with each redraw: 1 → 9 → 3. Each time the rungs (11/31 → 19/29 → 3/13) and the target changed, so a "climb" restarted from scratch | 05, 06 |
| Result | bob **1st, 275.72**; scores rise and fall all game (06) | 06 |

The grids game was as busy: 232 moves; objects changed per minute 3, 3, 3, 3, 3, 4, 2, 3, 5, 4 (79 / 74 / 79 per third).

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Leading Digits is not readable for a 12-year-old. "Read the odd rows … as one number", "no two rows or two columns may hold the same numbers" and the exponent-digit tie-breaker need the view's notes to decode. Nothing says which digit to change next, or which reading a move improved | 01, 02 | **major** (rules/views: readability) |
| 2 | Prime Landing's main-part ruler shows only two rungs (11, 31). The tie-breaker ruler marks plain primes (2, 3, 5, 7, 11, 13) while the rule counts primes ending in k | 04 | minor (views) |
| 3 | Prime Landing: the tie-breaker ("go on being primes") read 0 nearly all game; its restart on a step up is not visible in play | — | watch (rules) |
| 4 | Drift changes the ending digit (1 → 9 → 3) every redraw, so a climb toward big primes restarts; the line reached 29 once and finished at 13 | 05, 06 | watch (rules: redraw of k vs. a long ladder) |
| 5 | "the closer to one the better" can be read as "closer to the number 1" | 04 | minor (wording) |
| 6 | Bob's Line 3 shows "y-intercept 7 · 12 below 19" beside "Main part … −12": the same gap with two signs | 05 | minor (views) |
