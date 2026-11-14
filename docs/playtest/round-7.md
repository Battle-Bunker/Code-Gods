# Playtest round 7 (2026-11-14, develop at 0b9f0936)

After #544–#552: pull-power-back fixes and the round-6 items (#549), a no-code leave control (#547), starters that
refuse moves lowering their own points on contested lines (#550), the line starters' points policy for grids (#551),
persona fixes (#552: one-tap start, one clock, Results as the page). Develop deploy green (run 447). `dev` restarted
on the **existing** local deployment without a schema error.
Hand play: alice 1440×900, carol 1440×900, bob 390×844. Screenshots: `docs/screenshots/playtest/round-7/`.

**Start to finish:** three grid practice games **yes** (1440 ×2, 390); a two-human lines game with a deal kept by
both sides **yes** up to the deal and past it. Bidding not repeated (unchanged since round 6, which played it).

## Round-6 majors

| Item | Now | Evidence |
|---|---|---|
| First agent starved after "Pull power back" | **fixed**: after pulling in planning, the first agent is back at **70 %** and the new one has 15 % ("77 moves … +920.43 points" vs "11 moves … +72.26 points" 30 s in) | 02 |
| False "pays by itself in about 2 seconds" during planning | **fixed**: "This summon costs 557.06 ⚡ and your store holds 342.94 ⚡. **Energy only comes in once the world runs**: pull power back from your agents to pay now, or start the world." with "Pull power back to pay for this now" | 01 |

## Human vs practice partners, per family (one agent unless noted)

| Rule (board) | Player | Result |
|---|---|---|
| Opposite Nines (grid, 390) | bob | **2nd**, 33,710 vs 36,881 / 31,218 |
| Crosswise Threes (grid, 1440) | carol | **1st**, 12,999 vs 12,329 / 8,362 |
| Spread of Three (grid, 1440, two agents) | alice | 3rd, 26,590 vs 33,913 / 33,592 (1.3×) |

The 8× (round 4) and 2.3× (round 5) gaps are gone in these deals: a one-agent human now finishes level with the
practice partners on grids.

## Two humans: a deal kept without code

Alice and bob (+1 partner) both pulled lines 4 and 11. Bob proposed in chat; each kept the deal with the new
control in Agent code, **"Simple leaves these lines alone: [ e.g. 3, 19 ]"** (alice typed 4, bob typed 11, Enter).
Each agent went to "Simple, version 1". The line-11 fight (alice, bob, partner: "27 times, from 4:59 left to 3:41
left") **stopped right after bob's edit (≈3:43 left)**; no later line-11 card appeared. This is the first time the
deal path worked end to end without touching code.

## Other re-tests and new findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | The leave control gives no confirmation: after Enter nothing says "Simple now leaves line 4 alone" or what it cost; only the version number changes from 0 to 1 | 04, 05 | minor (app) |
| 2 | The palette names it "Leave objects alone" / "Keep an agent off some objects" (the game's noun is lines/grids) and only says "Use its controls on the screen" without opening the pane | — | minor (app) |
| 3 | Phone: after "How the game went" the sticky pane-name row still lies over the top of the pane (the "Try next game" text runs under it); improved from round 6 but still overlapping | 03 | minor (app) |
| 4 | Enter in "Room code" now joins ✓; one-tap "Start the world now" ✓; feed times read "from 4:59 left to 3:41 left" | — | — |
| 5 | Starters now skip few moves ("0 skipped") and tug-of-war still appears within seconds on grids; legible, known | 02 | known |
