# Playtest round 15 (2026-11-15, develop at 9156fef3)

After #721 (starters live within their income), #723 (parameter drift every 120 s), #729 (time dilation as a clock
rate) and #730 (known objects recomputed after a drift). Fresh local deployment, app build 07b218fc, **time scale 1**
(no dilation), two full ten-minute beginner games run at the same time, by hand:
- room 6ZRBQ3, Lines · beginner: alice at 1440 (Prime Landing), bob at 390 (Square Area) and one practice partner;
- room BP6NBQ, Grids · beginner practice: carol at 1440 (Spread of Three).

0 timeouts or errors in the engine log. Screenshots: `docs/screenshots/playtest/round-15/`.

## Re-checks

| Item | Verdict | Evidence |
|---|---|---|
| Watcher confirmation (#711) | ✓ "Summon a Watcher for **0.70 energy**: an agent that only looks, for 20% of your power …" | 02 |
| Look button (#711) | ✓ "Look at every line now (0.25 energy)" | — |
| Header energy | ✓ "Energy 288.00 (full)" | 03, 04 |
| Hidden-end note in Results | not checked: neither beginner preset ends at a hidden moment | — |

## Parameter drift (#723)

Both games have `driftSeconds` 120. Alice's card read "a prime **ending in 7**" at every sample, every 30 s for the
whole ten minutes, and the stored rule stayed `prime-landing {"ends": 7}` (Prime Gradient `{"ends": 1}` likewise).
`driftParams` only redraws to a *different* allowed value, and these families have one allowed value tonight, so the
drift did nothing visible, as the coordinator expected until the spec lead's values land. **The redraw, its notice and
the card countdown could not be judged yet**; that is the planned repeat of this round.

## Dynamics (from `v2Moves`, moves where the state changed)

| Game | Objects changed in each minute (0–9) | Changing moves per third | Final (points) |
|---|---|---|---|
| Lines 6ZRBQ3 | 3, 2, 2, 3, 2, 2, 2, 3, 3, 2 | 147 / 123 / 96 | partner 1st, alice 2nd 206.12, bob 3rd 161.02 |
| Grids BP6NBQ | 3, 3, 3, 2, 2, 2, 2, 1, 2, 3 | 60 / 33 / 33 | carol 1st 319.27, both partners close behind |

- **Objects keep moving to the end** in both games: 2–3 objects change in every minute, including the last. This is the first round since the 10-minute games where neither board froze (round 13: 4 of 7 lines stopped before 2:42).
- **Lines**: the leaderboard chart swings between about 200 and 300 points for the whole game: alice's and the partner's lines trade places every minute (03). The contested lines are a three-way tug ("undid each other's moves (46 moves)"); nobody runs away, but nobody climbs either after 2:30.
- **Grids**: a steady climb for all three seats from 0 to about 300 over ten minutes, close together; one grid was a joint climb ("climbed together, every move raising the points") (04).
- **Seat left behind**: bob (Square Area) sat about 100 points under the other two lines seats from 1:00 on and finished 3rd. That is a gap, not a runaway.
- **Activity is low**: the grid game logged 126 moves in ten minutes (power 4 energy a second; the starters now spend within income). The board moves, but slowly; a 12-year-old watching "What just changed" sees a move every few seconds.
- **Energy never stuck**: both humans ended with a full store (288.00) and agents kept acting; no "can't afford" text appeared.
- **Fresh view without looking**: the lines list showed "seen N s ago" with N under 10 for the lines the agents touch.

## Judged as a 12-year-old would

| Item | Verdict | Evidence |
|---|---|---|
| "a prime ending in 7" | clear on the card. The number line under it shows 2, 3, 5, **7**, 11, 13: the primes ending in 7 would be 7, 17, 37 …, so the picture mixes in primes that do not count | 01 |
| Results | "Try next game … the moves marked "good for both"" and the contested lists read well | 03, 04 |

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Parameter drift is on (120 s) but has no visible effect tonight: every dealt family has one allowed value, so the redraw keeps it. The redraw notice and countdown could not be tested | — | blocker for judging drift (expected; repeat this round when the spec lead's values land) |
| 2 | Prime Landing's number line shows 2, 3, 5, 7, 11, 13 for "a prime ending in 7": only 7 ends in 7 there | 01 | minor (views) |
| 3 | Bob's Square Area seat trailed by about 100 points from minute 1 to the end | 03 | watch (rules balance) |
| 4 | Low activity at the new beginner power: 126 moves in ten minutes on grids | 04 | watch (economy; the board still moves) |
