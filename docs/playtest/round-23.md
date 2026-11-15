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

## Supplement: the turn and the zoom tried by hand (the coordinator's brief)

Played on develop 872fe49f, after #790 (the zoom out of the beginner set; the turn stays). Fresh local deployment, app
build 4cdbdef5, time scale 1, at 1440:
- room DZ7BQD, Lines · beginner: alice, **Prime Staircase** (the turn);
- room ENBL49, Lines · more ways to move (trial): carol, Treasure (the zoom lives only there now).

**A player cannot make a move by hand.** The only place a person meets a move is the **What if** pane: "Try a change to
see what it would do. Nothing happens to the line: only agents change lines." It opens from the palette ("List a
representation's mutators") or the pane menu. You pick a line in Lines, choose the move from **Change**, fill its
numbers, and read what it would do, your rarity and points before and after, and "An agent would spend about … energy
on this change". So "used by hand" below means tried there, twice each.

| Question (as a bright 12-year-old) | Turn | Zoom |
|---|---|---|
| Can I find it? | Yes, under "the line on the plane" in Change. But it sits beside an older move, **"turn the line about its point at x = x0"**: two "turn" moves in one list, and "x0" means nothing to a child (06) | Yes in the trial preset ("zoom the line away from the origin or towards it, keeping its steepness"). Not in Lines · beginner since #790 |
| Do the title and sketch say what it will do before I press? | The **sentence** does: *"Stick a pin in the line at (0, −5) and turn the line around it, anticlockwise, by the angle of a 1 gradient (the slope of a line that goes 1 up for every 1 across). The pin stays put. Now the line goes down ³⁵⁄₆₉ for every 1 across"* (09). The **sketch** does not: a dot, an arrowhead and the label "¼ TURN", whose end the arrowhead covers; the line itself is not drawn (08). The inputs are labelled with raw names, "centre" (the text "origin") and "turn" (the text "left", or a gradient such as "3/4"); nothing says what may be typed (07) | The **sentence** does: *"Zoom from the origin O: everything ends up twice as far from the origin, so the line's crossings move from −1⅓ to −2⅔ on the x-axis and from 4 to 8 on the y-axis (the arrows), and it keeps the same slope. It becomes y = 3x + 8"* (11). The **sketch** shows two arrowheads marked "×2" and a dot at 0, with no line and no axes. The input is labelled "f" (10) |
| Price shown? | Yes: a quarter turn about the origin, **about 106.97 energy**; a 1-gradient turn about the y-intercept, **111.75** on one line and **52.20** on another. An agent's ordinary moves in the same game cost 15–30 | Yes: ×2 **about 9.71 energy**, ×⅓ **about 14.50** (the trial preset, 64 energy a second) |
| What it would do to my points | ¼ turn about the origin: 64.77 → 12.77 points; the 1-gradient turn: 12.21 → 12.21 | ×2: −36.30 → −23.10; ×⅓: 10.08 → 34.49 |
| An agent's move in the log, and to whom | Round 23's log entry for the starter's turn (03): *"turn the line clockwise by the angle of a 1 gradient about its point at x = 0"*, with my rarity and points before and after. Moves by **other** seats appear in the public log only as **"Line 3 changed."**, so a player cannot see what someone else's turn did, or how much another seat lost (12) | No zoom by an agent appeared in carol's logs (the trial game's starters made 1 mirror and no zoom in the moves read) |

Two more things seen:
- What if showed **"Your points on it −36.30 points"** while the same line's card read 37.08 points. Negative points are
  never explained (read below 11, not in a screenshot). The second zoom showed 10.08 against the card's 5.82: the header/Why mismatch again.
- Alice (Prime Staircase) finished **1st, 303.09**, and her agent kept stepping up late: the chart rises in the last
  two minutes. The best lines still held runs of **one** prime ("1¹³⁄₂₉"), so no run of two was reached (13). A redraw
  changed the ending digit 7 → 3 → 7.

### Supplement findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| S1 | A player cannot move a line by hand; What if only previews. If the brief expects players to use moves themselves, there is no control for it | 06, 07 | question (app/coordinator) |
| S2 | Two "turn" moves sit side by side in Change ("…about its point at x = x0" and "…around a pin, like a clock hand"); "x0" is jargon | 06 | minor (wording) |
| S3 | The turn's and the zoom's sketches do not draw the line, and the turn's label is covered by its arrowhead ("¼ TUR▶") | 08, 11 | minor (views) |
| S4 | Inputs are labelled with raw parameter names ("centre", "turn", "f"), with no hint of what may be typed ("origin", "left", "3/4") | 07, 10 | minor (app) |
| S5 | Other seats' moves show as "Line N changed." in the public log, so who lost what to a turn or zoom is invisible | 12 | minor (by design? coordinator) |
| S6 | What if can show negative points on a line (−36.30) with no explanation | — | minor (views) |
| S7 | A turn costs 52–112 energy in What if, 3–7 times an ordinary move | 07, 09 | watch (pricing) |
