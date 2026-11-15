# Playtest round 25 (2026-11-15, develop at a1c073c7)

After #804 (no redraw countdown on ladder seats), #805 (a human's abandoned practice game ends when they start a new
one), #806 and #810 (a pane that failed comes back by itself; Try again asks afresh), #807 (the straight-hill gate walks
a greedy chain), e0df5bdf (Prime Gradient as a ladder in levels of digits, a declared trial) and #812. Deploy run 658 is
green. Fresh local deployment, app build 4d3afa1e, **time scale 1**, by hand:
- room VM7MQW, Lines · beginner: alice at 1440, **Smooth Intercept** (3s and 11s), 10 minutes;
- room TH9C4N, Lines · beginner: carol at 1440, **Prime Gradient** (minus a prime ending in 9), 10 minutes;
- Lines · pairs: bob at **390**. Room 548EWY was **Right Angle** (ended at a hidden moment after 0:45); the next game
  was **Gap Ratio** (ended after 2:56).

**Prime Landing was not dealt** to alice in 28 deals. The practice deal is fair: 1,000 seeded practice deals give the
human Prime Landing 7.2% of the time (each family 7–12%), so 28 misses has about a 12% chance. Prime Landing's landing
is carried over again. Screenshots: `docs/screenshots/playtest/round-25/`.

## Re-checks

| Item | Verdict | Evidence |
|---|---|---|
| Load from abandoned deals (#805) | ✓ **fixed.** After 28 deals the store held 12 ended games and only the live ones running. **0 timeouts** and no "took a long time" warnings in the engine log all round (round 24: 92 timeouts) | — |
| Redraw countdown on ladder seats (#804) | ✓ **gone.** Neither the Smooth Intercept card nor the Prime Gradient card shows "new numbers in …" | 01, 02 |
| Header vs Why points | ✓ **fixed in every card I read.** Alice: 67.96 = 67.96, 50.98 = 50.98, 21.95 = 21.95; carol: 50.69 = 50.69, 36.54 = 36.54, 35.58 = 35.58 | 01, 02 |
| Panes recover by themselves (#806) | not exercised: nothing failed to load this round | — |

## 1. Smooth Intercept (alice): no parking, but no climb either

- The board kept moving: 3–4 lines changed every minute to the end, and only one line was still for more than four
  minutes (last change at 331 s).
- But **no line went past level 1.** The y-intercepts stayed small (9, −3, 12, −9; "on 9: 2 of the dealt primes
  multiplied, level 1"), and the highest rarity on any line was **7.13 bits** (round 24: 243 = 3⁵, level 2, 11.45
  bits). Three lines were three-way tugs ("undid each other's moves (50 moves)") (04).
- Alice finished **2nd, 299.17**; the chart climbs in the last four minutes (04).
- The card still says "each level needs one more than the last" (round 24, finding 5) (01).

So round 21's freeze at 3⁸ is gone, and in this game the ladder was not climbed at all. One game is not enough to tell
whether the levels are too steep or the partners (Treasure, Divisibility Ladder) simply pulled against it. **Watch.**

## 2. Prime Gradient as a ladder (carol)

**The card** (02): *"The gradient should round to minus a prime ending in 9, the bigger the better, in levels of digits
that each need more than the last (1, 3, 6, 10 digits …); any other gradient scores below them all, the closer to one
the better. Tie-breaker: take the number just after that prime. The biggest number that divides both it and the
y-intercept's whole part (ignoring sign) should be as big as possible…"*

- **The agent lands on a rung.** Line 4 sat at y = −19x + 6, and its Why line read *"the gradient −19 rounds to minus
  the prime 19"* (02). Two other lines had gradients −7 and −9, between rungs.
- The same "levels of digits (1, 3, 6, 10 digits …)" wording as Prime Landing is not readable (round 24, finding 6). A
  "prime ending in 9" with 1 digit is 9, which is not prime.
- The highest rarity was **10.24 bits**. Carol finished **1st, 189.97**; the chart swings hard all game (02).

## 3. The two-line setup (bob, phone)

- **Right Angle** (03): *"The two lines should cross at a right angle (their gradients multiply to −1) at a grid point
  (whole x and y) whose y leaves 3 when divided by 5; better still, leaves 18 when divided by 25, then 93 when divided
  by 125, and so on. The closer, the better."* It is readable up to "grid point". After that comes the same
  remainder ladder with numbers a child cannot follow (18, 93), and the same "The closer, the better" with no object.
- **Gap Ratio's** wording is unchanged from round 24. Its new tie-breaker, *"…should share as big a factor as possible
  with the number you divide by when you solve"*, is worse for a child: which number, solving what?
- **The games are too short:** they ended at hidden moments after **0:45** and **2:56** (round 24: 2:35, 6:32). Bob's
  agent was barely summoned in the first. The climb is busy while it lasts (12–22 pairs a minute) (05).

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute | Changing moves | Lines still > 4 min | Highest bits |
|---|---|---|---|---|
| VM7MQW (alice, Smooth Intercept) | 3, 3, 3, 3, 4, 4, 3, 3, 4, 2 | 314 | 1 (from 331 s) | 7.13 |
| TH9C4N (carol, Prime Gradient) | 3, 3, 3, 3, 2, 4, 4, 4, 4, 3 | 285 | 0 | 10.24 |
| FZKM7V (bob, Gap Ratio; 2:56) | 14, 19, 22 | 311 | — | 10.70 |
| 548EWY (bob, Right Angle; 0:45) | 12 | 76 | — | 10.98 |

Both beginner boards moved to the end, with 2–4 lines a minute, and no board froze. No seat ran away: alice led at 5:42
and finished 2nd; carol led late in a game whose chart crossed all game.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Smooth Intercept no longer parks, but no line passed level 1 in ten minutes (best y-intercept 9, 7.13 bits) | 01, 04 | watch (rules: ladder steepness vs partners) |
| 2 | Prime Gradient (ladder) lands exactly on a rung (−19) | 02 | ✓ |
| 3 | Two-line games end at hidden moments after 0:45–6:32, so the ladders cannot be judged and a phone player barely gets started | 05 | major (preset: hidden end too early for ladder play) |
| 4 | "levels of digits (1, 3, 6, 10 digits …)" on Prime Gradient (and Prime Landing) is not readable, and 1-digit rungs do not exist for "ending in 9" or "ending in 1" | 02 | minor (wording) |
| 5 | Two-line cards: "The closer, the better" has no object; the remainder ladders (18, 93; 24, 266) cannot be followed; "the number you divide by when you solve" is jargon | 03 | minor (wording, two-line session) |
| 6 | Load, timeouts, the ladder countdown and header vs Why are all fixed | — | ✓ |
| 7 | Prime Landing was not dealt in 28 deals (fair odds: 7.2%); its landing is still unjudged | — | carry over |
