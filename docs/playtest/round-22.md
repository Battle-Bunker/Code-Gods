# Playtest round 22 (2026-11-15, develop at 06cb86fd)

After #786 (practice deal: the human's family drawn uniformly first) and #785 (Smooth Intercept's and Prime Landing's
tie-breakers in a child's words). Fresh local deployment, app build d5861b6f, **time scale 1**, three full ten-minute
practice games run at once, each with two practice partners, by hand:
- room WFNYPG, Lines · beginner: alice at 1440, **Prime Landing** (partners: Treasure, Smooth Intercept);
- room SQ4RA2, Lines · beginner: bob at 1440, Square Area (partners: Smooth Intercept, Divisibility Ladder);
- room G8N37T, Lines · beginner: carol at **390** (phone), Whole Crossing.

0 errors in the engine log. Screenshots: `docs/screenshots/playtest/round-22/`.

## Round 21 re-checks

| Item | Verdict | Evidence |
|---|---|---|
| Practice-deal skew (#786) | ✓ **fixed in play.** 20 human deals covered 10 of the 11 families: Ruler 4, Same on Both Rulers 3, **Prime Landing 3**, Whole Crossing 2, Divisibility Ladder 2, Prime Gradient 2, **Prime Staircase 1**, Treasure 1, Pythagorean Area 1, Square Area 1, Smooth Intercept 0 | — |
| Smooth Intercept freeze | **still open**, now from a partner's seat. In bob's game the Smooth Intercept partner put a line at y = 6888x + **6561** (3⁸) by 180 s, and nobody moved it for the last **420 s**. A second line (y = 1012x − 1188) froze from 318 s. The board as a whole kept moving (2–3 lines a minute) | — |
| Header vs Why points | **still open**: alice's Line 3 shows "19.52 points" in its header and "≈ 20.29 points" in its Why line (01), and later 6.27 against 5.93 (02) | 01, 02 |

## Prime Landing (#781), alice's seat

**The card** (01): *"Where the line crosses the x-axis should round to a prime ending in 9, the bigger the better; any
other line scores below them all, the closer to one the better. Tie-breaker: Take the number just before that prime.
The biggest number that divides both it and the y-intercept's whole part should be as big as possible (a whole part of
0 shares nothing)."*

| Question | Verdict | Evidence |
|---|---|---|
| Readable for a 12-year-old? | The main part is clear, and each line shows "x = 1¹⁸¹⁄₂₂₄ · nearest whole number 2, off by ⁴³⁄₂₂₄". The tie-breaker is now in plain steps (#785), but it is three steps from the board (prime, minus 1, common divisor with the y-intercept's whole part). At the card's size, the mixed number "1¹⁸¹⁄₂₂₄" reads like "1181/224" | 01 |
| Does the agent climb? | **Slowly, and each redraw resets it.** The digit drifted 9 → "minus a prime ending in 1" → 1. After the second redraw (about 3:00) every line sat near x = 1–2, 12 away from −11. Alice's agent made 102 moves (90 skipped) for **+1.06 points**, and her energy sat full at 288. Her score stayed at about 20–30 from 2:00 to 7:00 (02) | 02 |
| Late climb | After the last redraw (to "ending in 1") Line 2 reached **x = 10⅔, ⅓ below 11** by the end, 143.53 points. Alice finished 3rd, **237.14**; the chart rises steeply in the last two minutes (04) | 04 |
| Rungs past the first? | Not seen: no line got beyond the first rung (11, 19 or −11) | 04 |

## The phone (carol, 390)

The pane tabs (Lines, Your secret goal, Where am I, What just changed, Agent code, My agents, Leaderboard) all fit in
two rows. The "Summon my first agent" path and the planning countdown work. What just changed reads well. One move
"cost 131.45 energy" for "add −⅔ to the gradient" (03), and another 145.61 for "+½". Moves of that size elsewhere cost
15–25. At the buzzer the header still read RUNNING at 0:00 for a moment, then ENDED (05).

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute 0–9 | Changing moves per third | Last change | Final |
|---|---|---|---|---|
| Lines WFNYPG (alice, Prime Landing) | 3, 2, **0**, 3, 3, 4, 3, 4, 5, 4 | 35 / 55 / 64 | 584 s | alice 3rd, 237.14 |
| Lines SQ4RA2 (bob, Square Area) | 3, 3, 3, 2, 3, 3, 2, 2, 3, 3 | 63 / 31 / 45 | 599 s | bob 3rd, 89.83 |
| Lines G8N37T (carol, Whole Crossing) | 3, 3, 3, 3, 2, 3, 3, 4, 4, 3 | 46 / 29 / 86 | 599 s | carol 3rd, 128.48 |

- All three boards kept moving to the end. The last third was the busiest in two games.
- A partner won all three games. No seat ran away: the charts cross several times (04, 05).
- One line in bob's game was parked at 3⁸ for seven minutes (re-checks above): a single frozen object on a board that
  otherwise moves.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Smooth Intercept still parks a line at 3⁸ = 6561 and nobody moves it again (bob's game: 180 s → end). Round 21's finding 2 is open | — | **major** (rules: an adversary to "bigger made of p and q") |
| 2 | Prime Landing: after a redraw to "minus a prime ending in 1", the agent made 102 moves for +1.06 points while its energy sat full. The climb to the first rung started only after the next redraw, and no line passed the first rung | 02, 04 | major (agents/rules: the starter cannot climb toward a far target) |
| 3 | The header points and the Why points differ on the same card (19.52 vs 20.29, 6.27 vs 5.93). Round 21's finding 3 is open | 01, 02 | minor (views) |
| 4 | The mixed number "1¹⁸¹⁄₂₂₄" on Prime Landing's card reads as "1181/224" at that size | 01 | minor (views) |
| 5 | Practice deals are fixed (#786): 10 of 11 families in 20 deals | — | ✓ |
