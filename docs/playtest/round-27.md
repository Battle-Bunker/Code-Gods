# Playtest round 27 (2026-11-15, develop at 8e450ca0): round 26's top five re-checked

The same newcomer path as round 26, after #820 (landing copy), #821 (end advice from what happened), #823 (compact
large numbers), #824 (cards a child can act on), #825 (planning in one step, code folded), #826 (the points key in one
sentence) and #827–#830 (agents). Deploy run 673 is green. Fresh local deployment, app build 1f4cef17, **time scale 1**,
three new accounts, by hand:
- alice, desktop 1440: room BT7QG7, Lines · beginner, **Whole Crossing**;
- bob, phone 390: room LHTM6R, Lines · beginner, **Whole Crossing**;
- carol, desktop 1440: room XST4FT, Grids · beginner, **Magic Eighteen**.

0 errors, 0 timeouts and 0 watchdog restarts in the engine log. Screenshots: `docs/screenshots/playtest/round-27/`.

## Round 26's top five

| Rank (round 26) | Now | Evidence |
|---|---|---|
| 1. The board stops in the second half | **Ticks are fixed; the stall is not.** Ticks ran at 32–36 a minute, about 0.3 s each, for all ten minutes in all three games (round 26: down to 2–4 a minute at 14–50 s). But both lines boards still went quiet: objects changed per minute were 3, 1, 0, 1, 2, 2, 1, 2, 1, 1 (alice) and 3, 2, 1, **0**, 1, **0, 0**, 2, 2, **0** (bob, 58 changing moves in ten minutes). With twice the turns of round 26 (530–680 acts per agent), the agents **skipped 88–97%** of them: bob's game 519/535, 581/602 and 615/636. This is now the agents' half of round 26's diagnosis | 03, 05, 06 |
| 2. Huge numbers on the phone | **Not reproduced.** No line stretched to large numbers in either lines game (the highest bits were 9.78 and 9.73), so #823's compact numbers were not exercised | 03 |
| 3. Cards too long | **Better, but still over 30 words.** Whole Crossing: *"Cross the x-axis on a whole number leaving 2 once its 5s are divided out (like 7, 35 or 175), with as many 5s as possible. Each extra counts less. Tie-breaker: The crossing without its 5s, plus 1, and the gradient's whole part should share as big a factor as possible."* That is 52 words (round 26: 66), and the examples (7, 35, 175) help. The worked example now says "whole number leaving 2 when divided by 5", with no "q = 5, r = 4". Magic Eighteen is 17 words | 02, 04 |
| 4. Phone after the buzzer | **Not fixed.** The phone end page is the same as round 26: "How the game went" sits above, but the page stays on Where am I and the Leaderboard. "See it line by line" does nothing, and "What earned your points" is out of reach | 06 |
| 5. Promises that do not match | **Fixed.** The landing page now says *"A first game lasts 10 minutes"* and *"A practice game seats you with two practice partners at once … When other people play too, you can make deals with them in the room's chat."* The end advice is now specific: *"Next game, open a line you share in One line and order its moves by 'Best for points': your points there are your bits × theirs, so the top move counts their bits as well as yours and gives them less reason to undo it."* It points at real controls, though "One line" and "Best for points" are names a newcomer has not met yet | 01, 05 |

Other changes seen:
- Planning has one red "Summon my first agent" in the header plus a plain one under the code. The code itself is
  folded ("Show the code (you don't need to read it to play)") (02).
- The grid key reads as one sentence: "Each grid's box is its points for you: as wide as your bits and as tall as the
  others' bits, so the bigger the box, the more points" (04).

## New this round

- **Magic Eighteen has a top.** *"Every row should add up to 18. Tie-breaker: The columns should add up to 18 too."*
  This is "as close as possible to X" with X reachable, which design principle 1 rules out. Its best grid had three
  rows on 18 and one at 16 ("off by 2"), at 19.40 bits; the game's highest was **23.78 bits**. Carol's chart is flat
  from about 6:00 (07). The grids board kept changing 1–2 grids a minute, but three of five grids were still for more
  than four minutes.
- On the phone the chart has two flat stretches (about 4:00–8:00), and its three seats ended 2nd, 1st and 3rd within
  about 100 points (06).

## Dynamics (from `v2Moves` and `_scheduled_functions`)

| Game | Objects changed in each minute 0–9 | Changing moves per third | Objects still > 4 min | Highest bits | Ticks a minute |
|---|---|---|---|---|---|
| BT7QG7 (alice, Whole Crossing) | 3, 1, 0, 1, 2, 2, 1, 2, 1, 1 | 28 / 65 / 42 | 2 | 9.78 | 33–36 |
| LHTM6R (bob, Whole Crossing, phone) | 3, 2, 1, 0, 1, 0, 0, 2, 2, 0 | 35 / 6 / 17 | 2 | 9.73 | 32–36 |
| XST4FT (carol, Magic Eighteen) | 3, 3, 3, 1, 2, 2, 1, 1, 2, 2 | 85 / 67 / 55 | 3 | 23.78 | 32–36 |

Agents (v2AgentEnergy): 532–681 acts each, 469–634 skips, 0 failures. Energy ended at 25–84, so they spent their
income.

## Findings

| # | Finding | Severity |
|---|---|---|
| 1 | With healthy ticks, the starters still skip 88–97% of their turns, so lines boards go quiet for whole minutes (bob: 0 lines changed in minutes 3, 5, 6 and 9) | **major** (agents) |
| 2 | Phone end page: "See it line by line" does nothing after the game, and "What earned your points" cannot be reached (round 26 rank 4, open) | major (app) |
| 3 | Magic Eighteen's main part has a top (every row on 18) | watch (rules: design principle 1) |
| 4 | Whole Crossing's card is 52 words, still over the 30-word target | minor (rules wording) |
| 5 | Round 26's tick slowdown did not recur with the same harness and three games: 0.3 s ticks all game | ✓ (server: watch on dev) |
| 6 | Landing copy and end advice are fixed | ✓ |
