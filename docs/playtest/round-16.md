# Playtest round 16 (2026-11-15, develop at 5b03fc64)

After #737 and #740 (mirrored parameters, so Prime Landing, Treasure, Same on Both Rulers, Prime Gradient and Prime
Staircase seats drift every 120 game seconds; a redraw may keep the value) and #738 (ruler marks). Fresh local
deployment, app build 2a322c4c, **time scale 1**. Three solo Lines · beginner practice games run at once, each with two
practice partners, the full ten minutes:
- R2BGSP: alice at 1440, **Treasure** (T = −37 at x = 2);
- 28WRC4: bob at 390, Prime Gradient;
- ZBBWQW: carol at 1440, Prime Gradient.

0 errors in the engine log. Screenshots: `docs/screenshots/playtest/round-16/`.

## The redraw, seen by the player

| Item | Verdict | Evidence |
|---|---|---|
| Countdown | ✓ on the goal card while running: "Your rule may get new numbers in 1:51", counting down to 0:04 and restarting at 1:5x every two minutes. During planning there is no countdown | 01, 02 |
| Redraw notice | ✓ at 2:00 a red-edged box on top of the goal card: **"Your rule's numbers just changed (8 s ago). Your rule now: When x is 2, y should be as close as possible to 37. Tie-breaker: The y-intercept should be as close as possible to a square number."** Clear and in plain words | 02 |
| Card and ruler follow the new sign | ✓ the card text, the main part and each line's mark switched from "−37" to "37" ("y(2) 10½ · 26½ below 37"); the tie-breaker flipped from "minus a square" to "a square" | 02 |
| Known points recomputed | ✓ every line's Why line used the new target right after the redraw | 02 |
| Toast | **not seen**: no transient toast at the redraw at 1440 or on the phone | 02, 03 |
| Phone | at the 2:00 redraw bob's "What just changed" pane shows only moves; the notice lives on the goal card, which on the phone is a separate tab ("Your secret goal"), so a phone player does not see the change unless they open it | 03 |
| Countdown near the end | at 1:34 left it read "new numbers in 1:34": it counts to a redraw at 10:00 that coincides with the end of the game | — |
| A 12-year-old | the notice says *what* changed. Nothing says *why* (the rule changes every two minutes to keep the board moving), and nothing warns that points will drop | 02 |

## Dynamics (from `v2Moves`, moves where the state changed, counted once per move)

| Game (seat) | Objects changed in each minute 0–9 | Changing moves per third |
|---|---|---|
| R2BGSP (alice, Treasure) | 4, 5, 5, 5, 6, 4, 5, 4, 5, 4 | 59 / 50 / 40 |
| ZBBWQW (carol, Prime Gradient) | 3, 4, 2, 2, 4, 3, 4, 3, 3, 1 | 71 / 70 / 40 |
| 28WRC4 (bob, Prime Gradient) | 3, 1, 1, 1, 0, 1, 8, 5, 5, 3 | 38 / 50 / 49 |

- **Boards keep moving after 2–3 minutes** in all three games, unlike round 13. Alice's game changed 4–6 lines every minute to the end. Bob's game went quiet from minute 1 to 5 (0–1 lines a minute), then woke at minute 6, after a redraw.
- **The leaderboard is a sawtooth** (04): every seat's points fall at each redraw (at 2:00 from about 85 to about 10 in alice's game), then climb again. Final scores are low (alice 1st with **69.86**) because the last redraw comes at the buzzer: the chart drops at 10:00.
- **Treasure stranded between ±37?** No. At the end alice's rule was back to T = −37, and her best line sat exactly on it ("Line 7 · main part: y(2) −37 · on −37"). Her other lines sat at y(2) of about 10–17, far from both targets but closer to +37, so a part of the board is left between the two.
- **Starter reacting**: after the redraw the Simple agent kept moving lines (4–6 a minute) toward the new sign; the moves listed in What just changed raise "y(2)" again.
- **No seat ran away**: the three seats in alice's game crossed each other several times.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | A redraw at the very end (10:00, with drift every 120 s on a 600 s game) drops every seat's points at the buzzer; the final standings are taken right after a redraw | 04 | **major** (server/rules: skip a redraw at the end, or end mid-cycle) |
| 2 | On the phone the redraw notice is only on the goal card's tab; the default "What just changed" pane says nothing | 03 | major (app: also put a line in What just changed, or a toast) |
| 3 | No toast at the redraw (the coordinator asked for a notice and a toast) | 02, 03 | minor (app) |
| 4 | The notice says what changed but not why, or that points drop | 02 | minor (app: one sentence, e.g. "Rules change every two minutes so no board stays settled; your points are counted under the new rule") |
| 5 | The countdown near the end counts to a redraw at 10:00 | — | minor (follows 1) |
| 6 | One game (bob's) was quiet for four minutes between redraws | — | watch |
