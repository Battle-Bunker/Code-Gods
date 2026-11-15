# Playtest round 21 (2026-11-15, develop at eed892b2)

After #778 (Smooth Intercept's starter stretches), #780 and #781 (Prime Landing on the x-axis, a window ladder of primes
ending in 1 or 9). Fresh local deployment, app build c13676fa, **time scale 1**, three full ten-minute practice games run
at once, each with two practice partners, by hand at 1440:
- room NVGLAZ, Lines · beginner: alice, **Divisibility Ladder**;
- room YURRXD, Lines · beginner: bob, **Smooth Intercept** (drifted from 2s and 7s to 3s and 11s);
- room PTPKU9, Grids · beginner: carol, **Strangers**.

Neither Prime Landing nor Prime Staircase came up in 20 deals to alice and bob, so the redesigned Prime Landing (#781)
was **not played** this round (finding 1 says why). 0 errors in the engine log. Screenshots:
`docs/screenshots/playtest/round-21/`.

## 1. The dealer rarely gives the human Prime Staircase

Of the 20 human deals, Smooth Intercept came up 7 times; Prime Landing and Prime Staircase came up 0 times. #752 says
the dealer picks a family uniformly. It does (`dealFrom`), but a practice game then keeps only a deal where the human
is compatible with a partner (`practiceDeal` → `practiceFits`, by the pair verdicts). Over 1,000 seeded practice deals
of Lines · beginner (`practiceDeal`, 1 human and 2 partners), the human seat gets:

| Family | Human seat | Uniform would be |
|---|---|---|
| Smooth Intercept | **21.5%** | 9.1% |
| Prime Gradient | 16.3% | 9.1% |
| Treasure | 10.9% | 9.1% |
| Divisibility Ladder | 10.2% | 9.1% |
| Same on Both Rulers | 9.2% | 9.1% |
| Prime Landing | 8.6% | 9.1% |
| Ruler | 8.4% | 9.1% |
| Pythagorean Area | 6.6% | 9.1% |
| Whole Crossing | 4.0% | 9.1% |
| Square Area | 3.7% | 9.1% |
| Prime Staircase | **0.6%** | 9.1% |

A beginner who plays practice games almost never holds Prime Staircase, and holds Smooth Intercept one game in five.
The owner asks for diversity of goals as the adversary to collapse. This filter narrows it for the human seat.

## 2. Smooth Intercept: one move repeated, then a frozen board

Bob's agent climbed by repeating one move, "multiply every output by −3" (#778's stretch, a representation shortcut
priced as a choice): y = 27x + 27 → −81x − 81; 704x − 729 → −2112x + 2187; then up to **6561 = 3⁸** (04). Each step costs
about 21 energy and raises the y-intercept threefold. The main part ("as big a number made of 3s and 11s") has no
adversary at this table: the partners held Ruler and Whole Crossing.

- By 5:30 four lines sat at y-intercept ±729 or ±6561, and the partners' points rose with bob's on two of them (Results:
  "Line 5 … and Line 4 … climbed together, every move raising the points") (05).
- **From 352 s to 493 s no line moved at all.** After that only the new line born at 480 s moved; the same recipe took
  it 3 → 33 → 99 → 297 → 891 → 2673. The four older lines kept their states to the end.
- Bob finished 1st, **382.41**; the chart is flat from about 6:00 to 8:00, then steps up with the new line (05).

This is the shape the owner calls a bug: one cheap recipe, applied again and again, reaches states every seat likes,
and the board stops. The tie-breaker ("that number plus 1 and the whole part of the gradient should share a factor")
never showed up in play.

## 3. Readability, as a bright 12-year-old

| Rule | Verdict | Evidence |
|---|---|---|
| **Strangers** (grids) | **Clear.** "Touching numbers in the same corner box should be strangers: both bigger than 1, no common divisor bigger than 1, and at least 2 apart (like 2 and 5)" gives a test a child can apply to each pair, and the example helps. The box view's "touching strangers in the top-left box: 0 of 4" says how far there is to go. The tie-breaker (1s beside a bigger number) pulls against the main part (1 is never a stranger); that is a fair adversary and readable | 01, 06 |
| **Divisibility Ladder** | Mostly clear: "y(1) should be a multiple of 1, y(2) a multiple of 2, y(3) of 3 …"; the table of values with "whole / not whole" marks shows where the run breaks. "(the line not through (0, 0))" puzzles a child: why not? | 02 |
| **Smooth Intercept** | The card is clear ("a number made only by multiplying 3s and 11s, the bigger the better"). Each line's Why line reads "The y-intercept on as big a number of the dealt primes as possible: 2187". That sentence is garbled, and "dealt primes" is jargon. The card's "any other line scores below them all, the closer to one the better" again reads as "closer to the number 1" (round 19, finding 5) | 04, 05 |

**Header and Why disagree** on the same line card: alice's Line 1 shows "**51.94 points**" in its header and "Why? …
≈ **33.84** points" under it (02). Bob's Line 3 shows 107.56 against 104.16 (04), and carol's Grid 1 shows 17.92 against
26.47 (01). A child cannot tell which number is the score.

## 4. Strangers' main part has a top

Each corner box has 4 touching pairs, so the main part is at most **16** (the view counts "0 of 4" per box). The best
grids reached 11 ("touching strangers in the corner boxes: 11", both at **22.00 bits**) (06). Design principle 1
(`docs/engine-v2/design-principles.md`) asks for a main part with no top. This one is an old beginner rule regraded, and
16 was not reached in ten minutes, but a perfect grid (for example 2 5 / 9 2 in every box) is easy to write down.

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute 0–9 | Changing moves per third | Last change | Final |
|---|---|---|---|---|
| Lines NVGLAZ (alice, Divisibility) | 3, 3, 1, 1, 1, 1, 1, 1, 3, 2 | 61 / 23 / 49 | 600 s | alice 2nd, 127.90 |
| Lines YURRXD (bob, Smooth Intercept) | 3, 2, 3, 3, 3, 3, **0, 0**, 1, 1 | 55 / 39 / **11** | 567 s | bob 1st, 382.41 |
| Grids PTPKU9 (carol, Strangers) | 3, 3, 2, 1, 2, 1, 1, 1, 2, 2 | 79 / 35 / 56 | 599 s | carol 1st, 2,432.60 |

- Alice's game kept moving, but only one line a minute from 2:00 to 8:00.
- Bob's game froze: no move from 352 s to 493 s, and only the line born at 480 s moved after that (section 2).
- Carol's grids kept moving to the end. Three of five grids were tugs ("undid each other's moves (50 moves)"), and all
  three seats climbed to about 2,000–2,400.
- **Scale:** grid points end near 2,400 and line points near 130–380 in games of the same length.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | The practice-game filter (`practiceFits`) skews the human's family: Smooth Intercept 21.5%, Prime Staircase 0.6% (uniform 9.1%), over 1,000 seeded deals. #752's uniform pick is undone for the human seat | section 1 | **major** (server/agents: diversity of goals) |
| 2 | Smooth Intercept climbs by repeating "multiply every output by −3" (3⁵ → 3⁸ in a few moves) with no adversary at the table. Four lines then sat still from 352 s to the end, with the partners' points rising on them too. An easy recipe reached a state every seat liked, and the board stopped | 04, 05 | **major** (rules: an optimum found; needs an adversary to "bigger made of p and q" in the pool, or a costlier stretch) |
| 3 | Line and grid cards show a header score that differs from the Why line's score (51.94 vs 33.84, 107.56 vs 104.16, 17.92 vs 26.47) | 01, 02, 04 | minor (views) |
| 4 | Strangers' main part has a top of 16, against design principle 1; the best grids reached 11 (22.00 bits) | 06 | watch (rules: old rule regraded) |
| 5 | Smooth Intercept's Why line is garbled: "The y-intercept on as big a number of the dealt primes as possible" | 04, 05 | minor (wording) |
| 6 | Prime Landing (#781) was not dealt to the human in 20 deals, so its new ladder was not judged | — | carry over to round 22 |
