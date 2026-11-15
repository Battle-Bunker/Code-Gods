# Playtest round 17 (2026-11-15, develop at 398eb681)

After #741 (Treasure ±11/±13), #745 (redraws staggered per seat, none in the last 90 s), #746/#747 (the redraw toast,
the notice in What just changed, its wording) and #749 (births at 240 s and 480 s, ending at exactly 5 lines). Fresh
local deployment, app build 17b6ac71, **time scale 1**, two full ten-minute games run at the same time, by hand:
- room JDT24M, Lines · beginner: alice at 1440 (**Treasure**), bob at 390 (**Prime Gradient**), one practice partner;
- room C2KNXA, Grids · beginner practice: carol at 1440 (Spread of Three).

0 errors in the engine log. Screenshots: `docs/screenshots/playtest/round-17/`.

## The coordinator's checks

| Check | Verdict | Evidence |
|---|---|---|
| Leaderboard no longer a whole-table sawtooth | ✓ the seats' lines spike at different times; there is no drop shared by all at 2:00, 4:00, … Each seat still drops at its own redraw, then climbs | 02 |
| No collapse at the buzzer | ✓ the countdown disappears with 1:35 left, and the scores rise right to 10:00: alice **286.35** (round 16: 69.86), bob's line climbs to the end too | 02 |
| Exactly 5 lines at the end | ✓ 5 lines (and 5 grids) in the stored states at the end | — |
| Notice and toast on the phone's default pane | ✓ at bob's redraw (about 0:45 in: staggered) the default **What just changed** pane shows the red notice at its top, and a toast overlays it: "Your rule's numbers just changed. Your points are now counted by the new rule, so they may drop for a while; your agents now climb toward it. Your rule now: Make the gradient as close as possible to minus a prime ending in 1 …" | 01 |
| Countdown reads your own seat's next redraw, hides near the end | ✓ alice's card read "new numbers in 1:58 … 0:55 … 1:52 …" on its own cycle, and nothing from 1:35 left | — |

The wording now answers round 16's "why": a child reads that points may drop and that their agents will climb toward
the new rule. On the phone the toast repeats the notice directly beneath it, so the same text appears twice for 15 s
(01).

## Treasure between its targets

Alice's Treasure ended at **T = −13** (y at x = 2). Line 2 sat exactly on it ("y(2) −13 · on −13", 215.61 points), line 1
at −12⅔ (⅓ above). The ±11/±13 targets keep the seat's lines near its current target. With ±37, lines were stranded at
10–17, between the targets.

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute 0–9 | Changing moves per third | Final |
|---|---|---|---|
| Lines JDT24M | 3, 1, 1, 1, 4, 3, 4, 3, 3, 5 | 44 / 68 / 58 | alice 1st 286.35 |
| Grids C2KNXA | 2, 2, 2, 3, 4, 4, 3, 3, 5, 3 | 25 / 24 / 19 | carol 1st 700.93, partners close |

- Objects keep moving to the end in both games; the last third is as busy as the first (lines 58 vs 44).
- Lines had a quiet stretch in minutes 1–3 (one line a minute) before the first births and redraws.
- Grids climb steadily for all three seats, with no drift on grids.
- No runaway: alice led at the end only after the last 90 s, by about 80 points.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | On the phone the toast repeats, right under it, the notice already at the top of What just changed (the same text twice for 15 s) | 01 | minor (app) |
| 2 | Lines are quiet in minutes 1–3 (one line changed a minute) | — | watch |
| 3 | Alice's points chart still has tall spikes (0 → 150 → 0) at her own redraws | 02 | watch (expected under drift) |

All of round 16's major findings are fixed.
