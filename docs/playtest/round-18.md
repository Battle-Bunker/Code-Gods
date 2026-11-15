# Playtest round 18 (2026-11-15, develop at 836ddca9)

After #752 (the dealer picks a family uniformly, never two seats of one family), #754 (the drift notice reads the
server's previous rule), #756/#758 (starters save up for a move instead of spending their income away; pool-dynamics
rows), and the docs and undealt families #759/#760. Develop deploy green (run 616). Fresh local deployment, app build
f27c7240, **time scale 1**, two full ten-minute games run at the same time:
- room M6ULS4, Lines · beginner: alice at 1440 (Prime Landing), bob at 390 (Square Area), one practice partner; the two
  humans chatted;
- room A3F3ZP, Grids · beginner practice: carol at 1440 (Crosswise Threes).

0 errors in the engine log. Screenshots: `docs/screenshots/playtest/round-18/`.

## Functional

| Item | Verdict | Evidence |
|---|---|---|
| Two humans chat | ✓ alice (palette "Send a chat message") → bob's phone Public chat pane ("Alice Liddell 7:08 AM …"); bob replied from the phone ("Shall I leave 2 if you leave 4?") | 01 |
| Dealer | ✓ three different families in the lines room (Prime Landing, Square Area, the partner's) | — |
| Drift notice | Prime Landing was "minus a prime ending in 7" at the end; the card, ruler (−17, −7) and line marks ("y-intercept −7 · on −7") follow it | 02 |
| Results | load for every player | 02, 03 |

## Dynamics (from `v2Moves`, state-changing moves counted once per (game, seq))

| Game | Moves in ten minutes | Objects changed in each minute 0–9 | Changing moves per third | Final |
|---|---|---|---|---|
| Lines M6ULS4 | 142 | 3, 3, **0, 0**, 1, 4, 4, 3, 4, **0** | 33 / 70 / 39 | alice 2nd 123.67 |
| Grids A3F3ZP | 140 | 3, 3, 1, 1, 1, 1, **0, 0**, 1, 1 | 75 / 24 / 41 | carol 2nd 2,022.74 |

Compared with round 17 (lines 3,1,1,1,4,3,4,3,3,5; grids 2,2,2,3,4,4,3,3,5,3), **both boards went quieter**:
- **Grids**: after minute 2 only 0–1 grid changed per minute. Carol's chart climbs in steps with flat stretches from about 3:00 to 6:00 and from 8:00 to the end (03). Her best grid reached "folded cells three apart · **exactly**". The grid board mostly settles again.
- **Lines**: no line changed in minutes 2–3 or minute 9. The chart is flat from about 1:00 to 3:30 and again from 5:30 to 8:00, with spikes at redraws (02).
- About 140 moves per game in ten minutes at beginner power 4: one move every 4 s for the whole table.

This follows #756 ("starters save up for a move instead of reading their income away"). Round 17 ran before it. Two
games are not a measurement, but both moved less, and the grid game shows the round-13 pattern again (main part exact,
then little movement).

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| D1 | Boards went quieter than in round 17. Grids changed 0–1 objects a minute from minute 2 on, with a main part "exactly"; lines had empty minutes 2–3 and 9. About 140 moves per ten-minute game | 02, 03 | **major** (agents/economy; the metastable criterion; possibly #756) |
| 1 | The leaderboard legend on bob's phone names "Alice Liddell" live, while the act log hides other movers; consistent with earlier rounds, noted only for the anonymity design | 01 | question |
