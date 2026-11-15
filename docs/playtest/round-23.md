# Playtest round 23 (2026-11-15, develop at 3b14cf5e)

After #789 (the turn and the zoom join Lines · beginner, call 23; starters try zooms on Smooth Intercept and Divisibility
Ladder, and turns about the y-intercept on Prime Gradient and Same on Both Rulers). Fresh local deployment, app build
6878adac, **time scale 1**, three full ten-minute practice games run at once, each with two practice partners, by hand:
- room BPKJCK: alice at 1440, **Smooth Intercept** (partners: Prime Landing, Whole Crossing);
- room KJJTL4: bob at **390** (phone), Square Area (partners: Smooth Intercept, Ruler);
- room BP66MW: carol at 1440, **Prime Gradient** (partners: Divisibility Ladder, Ruler).

**#790 has since taken the zoom out of the beginner set again**, while this round ran, so the zoom findings below
describe #789 and support #790. Both develop deploy runs since round 22 (638 for #789, 639 for #790) are red. The
`deploy` job succeeded in both, and the failure is the `unit` job (`pnpm run test:offline:rest`). 0 errors in the local
engine log. Screenshots: `docs/screenshots/playtest/round-23/`.

## The new moves in play

Across the 15 games stored this round (the three played and twelve left by the deal search, with partners only), the
moves made were: tilt 401, stretch 353, shift 305, **zoom 120**, **turn 31**, pivot 8, nudge 5, slide 5.

| Question | Verdict | Evidence |
|---|---|---|
| Does a 12-year-old read the turn? | Partly. Carol's log says *"y = −6x + 12 → y = 1⅖x + 12 (turn the line clockwise by the angle of a 1 gradient about its point at x = 0)"*. "Clockwise" and "about its point at x = 0" are clear. "The angle of a 1 gradient" is not: a child would understand "an eighth of a turn" or "45°" | 03 |
| Do the starters use the turn? | Yes: Prime Gradient's starter turned 7 times, all about the y-intercept by a 1 gradient (±45°). This flips a gradient's sign (3 → −2, −6 → 1⅖), which suits a rule whose target sign flips at a redraw | 02, 03 |
| Does the zoom make a cheap repeated climb? | **Yes.** In bob's game the Smooth Intercept partner zoomed one line by −2 four times in 14 s: y-intercept 256 → −512 → 1024 → −2048 → **4096** (542–556 s). This is the same one-move recipe as round 21's "multiply every output by −3", at a lower price | — |
| Does the zoom hurt other seats? | Bob's chart is flat at about 100 from 2:00 to 6:30, then swings hard at 6:40 and climbs to **484.22** (1st). I could not tie the swing to one zoom | 05 |

## Smooth Intercept, alice's seat (re-check)

The rule drifted 3s and 5s → 2s and 7s. Alice's agent climbed by stretching (×(−3): 72x − 225 → −216x + 675) and,
after the redraw, to **y = 2048x + 65,536 = 2¹⁶** ("on 65,536", 186.42 points) (01, 04). It finished **1st, 233.89**.

**Parked lines, again**: of the five lines, three sat still for more than four minutes:

| Line (last state) | Last change |
|---|---|
| y = −1836x + 4096 (2¹²) | 112 s |
| y = −648x + 2025 (3⁴·5²) | 165 s |
| y = 14580x − 1,093,500 | 363 s |

In bob's game the line zoomed to 4096 (y = −2x + 4096) was also not touched after 556 s.

The Why line still says *"The y-intercept on as big a number of the dealt primes as possible"* (04).

## Prime Landing after a redraw

Not played by a human this round (it was a partner in alice's game). Carried over.

## Header vs Why (re-check)

**Still open**: carol's Line 4 shows "129.94 points" against "≈ 126.64", and Line 1 shows 53.23 against 45.07 (02).

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute 0–9 | Changing moves per third | Last change | Final |
|---|---|---|---|---|
| Lines BPKJCK (alice, Smooth Intercept) | 3, 3, 2, 1, 2, 2, 2, 1, 2, 1 | 65 / 25 / 38 | 600 s | alice 1st, 233.89 |
| Lines KJJTL4 (bob, Square Area) | 3, 2, 2, 1, 1, **0**, 3, 3, 2, 1 | 41 / 18 / 39 | 556 s | bob 1st, 484.22 |
| Lines BP66MW (carol, Prime Gradient) | 3, 2, 3, 2, 2, 2, 3, 2, 3, 1 | 65 / 44 / 28 | 600 s | carol 2nd, 198.01 |

- All three boards moved to the end, but more slowly than in round 22: 1–2 lines a minute in the middle of alice's
  and bob's games, with a still minute in bob's.
- In alice's game three of five lines were parked at big smooth numbers for more than four minutes.
- Carol's chart drops from about 370 to near 0 at each redraw of her sign (02): "minus a prime ending in 1" against "a
  prime ending in 1". The turn then flips the gradient back.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Smooth Intercept still parks lines at big smooth numbers (2¹², 3⁴·5², 2¹⁶): three of alice's five lines sat still for 4–8 minutes. Rounds 21 and 22 finding 1 are open | 01, 04 | **major** (rules) |
| 2 | With #789, the zoom gave the same one-move climb more cheaply (256 → 4096 in four zooms, 14 s). #790 removes it from the beginner set | — | major → addressed by #790 (re-check next round) |
| 3 | The turn's note "by the angle of a 1 gradient" is not a child's phrase; "an eighth of a turn (45°)" would be | 03 | minor (wording) |
| 4 | Develop deploy runs 638 and 639 are red on the `unit` job (`test:offline:rest`); the deployment itself succeeded | — | for the owning session |
| 5 | Header and Why points still differ (129.94 vs 126.64; 53.23 vs 45.07) | 02 | minor (views), open |
