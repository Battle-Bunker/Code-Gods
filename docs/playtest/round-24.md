# Playtest round 24 (2026-11-15, develop at d336b2e3)

After #797 (Smooth Intercept climbs in levels that each need one more factor than the last; Prime Landing in levels of
digits; ladder families no longer redrawn), #795 (the turn's words) and #793 (the two-line preset `lines-pairs`, ladder
redesign). Fresh local deployment, app build 57e8c9eb, **time scale 1**, by hand:
- room WB7HY4, Lines · beginner: alice at 1440, **Smooth Intercept** (3s and 13s), 10 minutes;
- room 7RX37R, Lines · beginner: carol at 1440, **Prime Landing** (ending in 1), 10 minutes;
- Lines · pairs (two lines per object): bob at **390**. Game JHS5Q6 was **Gap Ratio** and ended at a hidden moment after
  6:32; game NVU3SS was **Far Crossing** and ended after 2:35.

Screenshots: `docs/screenshots/playtest/round-24/`.

## A load problem first (it shaped this round)

Dealing Smooth Intercept and Prime Landing took 6 and 12 deals. Each abandoned deal left a practice world running, so
about 28 worlds ran at once on the local backend. From the start of my games until **13:29:21**, the backend logged
**92 "Function execution timed out (maximum duration: 1s)"** errors. They hit the game loop (`v2/loop:commit` 39,
`v2/loop:tickFailed` 24, `loop:snapshot`, `loop:statesOf`) and the pages (`v2/play:object` 33, `play:objectMoves` 14,
`play:moves`, `play:digest`, `play:me`, `games:standings`).
- The page shows "Your totals could not load: … timed out" and panes read "This pane could not load: the server took too
  long (it is busy right now). Try again (reloads the page)" (01). **A pane does not recover by itself** once the server
  is quiet; only the reload brings it back. Bob's phone kept the red banners to the end (04).
- At idle afterwards, on a page reload, `v2/play:object` and `v2/play:objectMoves` still took **0.85–0.97 s** each (logged
  as warnings against the 1 s limit). So one page's per-object reads sit at the edge of the limit with only ~30 stored
  games.

The two beginner games lost part of their first half to this. Their dynamics below are still complete (from `v2Moves`).

## 1. Smooth Intercept (alice)

| Check | Verdict | Evidence |
|---|---|---|
| Does it still park lines at big numbers for minutes? | **Much less.** Best line: y = 11x + **243** (3⁵, "5 of the dealt primes multiplied, level 2"). One of five lines sat still for 280 s (last change at 320 s); round 23 had three of five parked for 4–8 minutes. No line went past level 2 (243) in ten minutes | 05, 06 |
| Can I say from the card what a level is? | **Mostly.** *"…using as many of them as possible: 1 makes level 1, 3 make level 2, 6 make level 3, 10 make level 4 (each level needs one more than the last). Between levels each extra one counts part of a level, and of two numbers with as many, the smaller counts a little more."* A 12-year-old gets "count the 3s and 13s you multiply". "Each level needs one more than the last" reads as "one more factor per level", but 1, 3, 6, 10 need 2, 3, 4 more (it is the *step* that grows by one). Each line's Why line says it plainly: "on 243: 5 of the dealt primes multiplied, level 2" | 05 |
| Redraw countdown gone? | **No.** The card still read "Your rule may get new numbers in 0:44 … 0:28". At the countdown the rule kept "3s and 13s" (no redraw, as #797 intends), so the countdown promises a change that never comes | 01, 05 |
| Result | alice **2nd, 429.28**; the chart dips once around 4:40 for all three seats, then climbs to the end | 06 |

## 2. Prime Landing (carol)

| Check | Verdict | Evidence |
|---|---|---|
| Card readable? | *"…should round to a prime ending in 1, the bigger the better, in levels of digits that each need more than the last (1, 3, 6, 10 digits …)"*. **Lost here:** "levels of digits" does not say what a level is (a prime with 1 digit? 3 digits?), and "1, 3, 6, 10 digits" does not fit primes ending in 1 (there are none with 1 digit) | 02 |
| Does the agent land on a prime and step to the next? | **Approaches, does not land.** Line 1 finished at x = 10¹⁶⁄₄₇ ("³¹⁄₄₇ below 11") and Line 3 at x ≈ 10.51 ("≈ 0.49 below 11"). No line sat on 11, and none stepped on toward 31 | 07 |
| Redraw countdown gone? | **No**, the same as Smooth Intercept: "new numbers in 1:44 … 0:58", with no change at the tick | — |
| Result | carol **1st, 405.51** | 07 |

## 3. The two-line setup, read as a 12-year-old (bob, phone)

**Gap Ratio** (03): *"The gap between the lines' y-intercepts should be a whole number and 4 times the gap between their
x-intercepts; better still 16 times, then 64 times, and so on. Neither line may pass through (0, 0). The closer, the
better. Tie-breaker: The gap between the y-intercepts (to the nearest whole number) should have as big a smallest prime
factor as possible."*
- Lost at **"The closer, the better"**: closer to what? I guess "closer to 4 times", but it follows "and so on", so it
  reads as unattached.
- "4 times, then 16, then 64" is a clear ladder, but nothing says why 16 is better than 4: the card should say "each
  step up the ladder is worth more".
- A redraw notice arrived as a toast at once: "Your rule's target changed from 6 to 4". The pairs seats still drift.

**Far Crossing** (08): *"The steeper line should cross the x-axis at a whole number that leaves 2 when divided by 11;
better still, leaves 24 when divided by 121, then 266 when divided by 1331, and so on."*
- Lost at **"leaves 24 when divided by 121"**: where does 24 come from? A child cannot continue the pattern (24 = 2 + 2·11,
  266 = 24 + 2·121), so "and so on" is not something they can follow.
- The numbers drifted mid-game (it read "leaves 5 … 60 … 665" at first, then "leaves 2 … 24 … 266").

**Climb, ongoing or settled?** Ongoing in both games. Gap Ratio changed **10, 11, 14, 14, 18, 13, 12** pairs per minute
(306 changing moves in 6:32), and Far Crossing changed 12, 15, 17 a minute until its early end. The moves used were
pair.turn 104, pair.combine 83, **mach.stretch 68**, pair.slide 28, sys.translate 23. **Stretching by your own number as
a shortcut**: the agents use the stretch heavily, but the card never mentions it, so a player would not know it is a
shortcut. Both games ended early at a hidden moment (2:35 and 6:32), which is short for judging a ladder.

The Results advice on the phone (04) points at one move: *"Pair 21 is the one the others want most (6.85 bits). Try
'slide line 2 so the crossing moves 1 step along the other line' on it: 5.93 energy for 7.21 bits for you."*

## Header vs Why (re-check)

**Still open**: alice's Line 3 shows "98.35 points" against "≈ 92.45" (05).

## Highest bits seen

The highest rarity on any object in a move's after-state: Prime Landing game **18.43 bits**, Smooth Intercept game 11.45,
Gap Ratio 15.35, Far Crossing 13.04.

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute | Changing moves per third | Last change | Lines parked > 4 min |
|---|---|---|---|---|
| WB7HY4 (alice, Smooth Intercept) | 3, 2, 2, 2, 4, 4, 3, 3, 3, 3 | 47 / 72 / 38 | 600 s | 1 (from 320 s) |
| 7RX37R (carol, Prime Landing) | 3, 3, 3, 1, 2, 2, 3, 3, 3, 3 | 58 / 36 / 52 | 597 s | 1 (from 128 s) |
| JHS5Q6 (bob, Gap Ratio; ended 6:32) | 10, 11, 14, 14, 18, 13, 12 | — | 385 s | — |
| NVU3SS (bob, Far Crossing; ended 2:35) | 12, 15, 17 | — | 155 s | — |

Both beginner boards moved to the end, with 2–4 lines a minute. The two-line boards were far busier.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Under load (about 28 worlds on the local backend), queries and the game loop time out at 1 s, and panes stay broken until the page is reloaded. At idle, `v2/play:object` and `play:objectMoves` still take 0.85–0.97 s on a page load | 01, 04 | **major** (server: read cost, R1–R9; app: a pane that never recovers) |
| 2 | The redraw countdown still shows on ladder seats (Smooth Intercept, Prime Landing), although #797 stops their redraw; nothing changes at the tick | 01, 05 | minor (app) |
| 3 | Prime Landing's agent approaches 11 (10.51, 10¹⁶⁄₄₇) but never lands on it, and never steps on toward 31 | 07 | major (agents) |
| 4 | Smooth Intercept: the parks are much shorter (1 line for 280 s, against 3 lines for 4–8 min in round 23); best 3⁵, level 2 | 05, 06 | ✓ improved; watch |
| 5 | Smooth Intercept's card says "each level needs one more than the last", which reads as one more factor per level; levels 1, 3, 6, 10 need 2, 3, 4 more | 05 | minor (wording) |
| 6 | Prime Landing's "levels of digits (1, 3, 6, 10 digits …)" is not readable, and 1 digit cannot end a prime ending in 1 | 02 | minor (wording) |
| 7 | Two-line cards: "The closer, the better" has no object; the ladder's next numbers (24, 266 for Far Crossing) cannot be followed by a child; the stretch shortcut is not mentioned | 03, 08 | minor (wording, two-line session) |
| 8 | Two-line games ended at hidden moments after 2:35 and 6:32: short for judging a ladder climb | 04 | watch (preset) |
| 9 | Header and Why points still differ (98.35 vs 92.45) | 05 | minor (views), open |
