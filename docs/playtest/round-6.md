# Playtest round 6 (2026-11-14, develop at 6c419c81)

After #521–#537: the end summary (#525, #526, #533–#535: "Try next game", "What earned your points", "What cost
you"), round-5 app fixes (#532), server and agents work (hold notes, assistant fixes). The latest finished develop
deploy was green (run 432). `dev` restarted on the **existing** local deployment with no schema error.
Hand play: alice 1440×900 (Grids · beginner, Mirrormancer), carol 1440×900 (Lines with bidding, won Prime Staircase),
bob 390×844 (Lines · beginner, Divisibility Ladder), admin 390×844 (gallery). Screenshots:
`docs/screenshots/playtest/round-6/`.

**Start to finish:** grid practice **yes**; lines practice on the phone **yes**; lines bidding room **yes** through
the bid, deal and start ("You won Prime Staircase in the bid: 10% comes off your total"). Two humans: not repeated
(chat and LEAVE were tested in round 5; nothing in them changed).

## Re-tests

| Item | Now | Evidence |
|---|---|---|
| Pull power back for a second summon | **offered**: "This summon costs 467.81 ⚡ and your store holds 432.19 ⚡: it pays by itself in about 2 seconds, or pull power back from your agents to pay now" with a "Pull power back to pay for this (about 1 s)" button, then a progress bar "432.19 ⚡ of 467.81 ⚡" and "Stop and put the split back". **Two problems** (below) | 01, 02, 03 |
| Phone growth face y(0) | **fixed**: the growth pattern starts with "2 · start" on the phone (gallery, Prime Staircase) and "3 · start" in carol's goal card at 1440 | 04, 05 |
| Standings shown twice on Results | **fixed**: one table ("Game 1 of 3 in this rotation … Totals so far"); the Leaderboard says "The final standings are in Results" | 07 |
| Phone Results headline under the pane-name row | **better, not gone**: the top half of "You finished 3rd of 3 with 1,224.37 points" is still under the row of pane names | 06 |
| Header link cut off | 1440: "See it grid by grid" in full ✓. 390: still "See it line by" in the header text, though the screenshot shows "See it line by line" on its own line, so on the phone it is only my reader's cut | 03, 06 |
| Opposite Nines one agent | not dealt this round. Per family this round: **Mirrormancer** (grid, 1440) alice 3rd, **2,702 vs 7,391 / 7,361 (2.7× behind)**; **Divisibility Ladder** (lines, 390) bob 3rd, 1,224 vs 1,553 / 1,455 (close) | 06, 07 |

## New this round

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | **Pulling power back leaves the first agent starved.** After the pull, the second agent was summoned at 49.5 % and the first ("Simple") stayed at **1 % (0.64 ⚡ a second)**: 20 s later it had made 9 moves for 0.00 points while the new one made 262. The split was never put back. A player who pressed the button to *add* an agent has silently switched the first one off | 03 | **major** (app) |
| 2 | **In planning the promise is false.** Energy does not accrue during planning, so "pays by itself in about 2 seconds" and "(about 1 s)" never happen; the bar sat at "432.19 ⚡ of 467.81 ⚡" for the rest of planning and the summon only went through after the world started | 02 | **major** (app) |
| 3 | Mirrormancer's starter with the human loses 2.7× to the partners (and the human here had the first agent cut to 1 %, see 1, so this is not a clean measure) | 07 | major? (grids; needs a clean re-measure) |
| 4 | The end summary is a real improvement: "TRY NEXT GAME — Next game, hold grid 25 like this: it was worth 123.16 points to you there" (with the board), "What earned your points" (top three grids, "These 3 grids earned 563.50 of your 2,701.76 points"), "What cost you" ("You, Practice partner 2 and Practice partner 1 pulled grid 25 back and forth (2 pulls, 44.85 ⚡)") | 06, 07 | — (good) |
| 5 | The gallery's line rule page offers a "Grids" board button for a line-only rule (Prime Staircase) | 05 | minor (app) |
| 6 | Grid energy cap now reads "950.40 ⚡ (full)" at the end (was 576): the cap moved above the 900 start, which answers round 5's "576 (full)" question | 07 | — |
