# Playtest round 26: the owner's-eye walk (2026-11-15, develop at 3aeed1c0)

The coordinator's brief: do exactly what the owner will do this evening on dev, starting cold. Sign in, make a room,
start a practice beginner lines game and play the full ten minutes on desktop, then a second on a phone, then the
default beginner grids game. Write down every moment of confusion, being stuck or misled, boredom or breakage, then rank
the top five.

Fresh local deployment, app build a25bdded, **time scale 1**, three new accounts, by hand:
- alice, desktop 1440: room 9XLSUE, Lines · beginner, dealt **Whole Crossing**;
- bob, phone 390: room 6Y3YCU, Lines · beginner, dealt **Prime Landing**;
- carol, desktop 1440: room BHTSY5, Grids · beginner, dealt **Strangers**.

The three games ran side by side for the same ten minutes. 0 errors and 0 timeouts in the engine log. Screenshots:
`docs/screenshots/playtest/round-26/`.

## Top five things that would spoil a first impression

| Rank | What | Where | Evidence |
|---|---|---|---|
| **1** | **The board stops in the second half.** In all three games most objects stop moving after about 4 minutes. Grids changed **0, 1, 0, 0, 0, 1, 1** objects a minute from minute 3 on, with 75 changing moves in the first third and **8** in the last. Lines (desktop) went 65 / 10 / 4 by third. The newcomer watches a flat chart for five minutes (carol's chart is flat from 5:30; bob's from 5:00) while the countdown runs. The agent's energy sits full ("Energy 288.00 (full)") with nothing to do | all three games | 05, 08, 10 |
| **2** | **Unreadable numbers on the phone.** Bob's Prime Landing log reads *"y = −1093½x − 19683 → y = −1092½x − 19683 … 1 in 292 → 1 in 809 by chance"*. In the stored states the partners stretched lines to y-intercepts of **2,324,522,934** and **−6,973,568,802** (3²⁰-sized), and one line hit **22.87 bits** at 2:00 and froze there. A newcomer sees ten-digit numbers and fractions of a thousand | phone game | 07 |
| **3** | **The card is too long and abstract to act on.** Whole Crossing: *"Cross the x-axis on a whole number leaving 4 when divided by 5, times 5 as often as possible. More 5s are better, though each extra counts less. Tie-breaker: Take that number with its 5s divided out, ignore its sign and add 1. The biggest number that divides both it and the gradient's whole part (ignoring sign) should be as big as possible (a whole part of 0 shares nothing)."* That is **66 words**, over the 30-word target, and the main part alone needs three readings. The worked example under it shows "whole number (q = 5, r = 4) −1", which is the code's notation leaking into the view | desktop, planning | 02 |
| **4** | **What the phone hides after the buzzer.** At the end the phone shows "How the game went", but scrolling it jumps back to Where am I and the Leaderboard. The list of lines ("What earned your points") cannot be reached, and **"See it line by line" does nothing**, because the Lines tab is gone after the game | phone, end | 08 |
| **5** | **Promises that do not match.** The landing page says *"A first game lasts five minutes, with a countdown"*; the beginner game lasts **ten**. It also says "write tiny agents … bargain in chat". In a practice game there is no one to bargain with, and the newcomer is told *"You don't need to change anything"* about the code. The end advice is the same every game ("take the moves marked 'good for both'"), but no move is marked "good for both" anywhere a newcomer looked | landing, end | 01, 05 |

## Lines on desktop (alice, Whole Crossing), in order

1. **Landing (signed out)**: clear and handsome. "A first game lasts five minutes" is wrong (rank 5) (01).
2. **Room**: clear. "A game needs three players. Play a practice game against practice partners, or invite friends."
   Lines · beginner is chosen by default.
3. **Planning** (02): three panes. "Summon my first agent" appears twice (header and Where am I) with a third
   "Summon my first agent" under the code: three of the same red button, beside a fourth, "Start the world now", that a
   newcomer may press first.
4. **The card**: 66 words (rank 3). "Cross the x-axis on a whole number" is fine; "times 5 as often as possible" is not
   (what is multiplied?). The worked example's last line, "whole number (q = 5, r = 4) −1", is jargon.
5. **The agent code pane** opens with 40 lines of code comments ("reads the line once as y = mx + c (a small read),
   tries sm…"), cut off at the pane edge. The newcomer is told not to read it, so why show it first?
6. **Running** (03): the default panes are clear. The log entry reads well: *"Your agent Simple changed a line: y = 5x −
   10 → y = 3x − 10 (add −2 to the gradient). Your rarity 0.41 → 2.36 bits: 1 in 1.3 → 1 in 5.1 by chance. Points on
   this line 2.89 → 16.68."* A tug-of-war note appears inside it: *"Your agent says: Tug-of-war on line 2: another
   player keeps pulling it back. Make a deal with them; to keep your agent off it, add 2 to 'leaves these lines alone'
   under your agent. (said 2 times) Leave line 2 alone"*. That is helpful, with a one-click button.
7. **Lines pane**: "width: your bits · height: others' bits · area: your points" over tiny bars is a puzzle, and the
   "?" is the only explanation.
8. **The turn** (04), found under What if → Change: **much better than round 23.** The inputs are labelled "Where to pin
   it" (with the help text "origin, or a number: the point of the line above or below it on the x-axis (0 is where it
   crosses the y-axis)") and "How far to turn". The sentence reads *"Stick a pin in the line at (0, −10) and turn the
   line around it, anticlockwise, by 45° (one eighth turn)…"*, and the sketch now draws the line, the pin, the 45° arc
   and the turned line dashed. What if still only previews; nothing lets the player move a line.
9. **Middle and end**: from about 4:00 the board barely moves (rank 1). The chart swings, then flattens. The final
   lines read "on the rung at −6" and "on 4". Alice finished **1st, 177.38**.
10. **End summary** (05): "You finished 1st of 3". Contested lines are listed in plain words, and "What earned your
    points" shows each line. The advice box is the same text as every previous round.

## Lines on the phone (bob, Prime Landing), in order

1. **Planning** (06): the tabs wrap onto two rows ("Your secret goal · Where am I · Agent code"). After summoning, the
   page scrolls to the middle of Where am I, so the top of the card is above the fold.
2. **Running**: the "What just changed" pane is the right default. The numbers in it are not phone-sized (rank 2) (07).
3. **The card** (Prime Landing, the ladder card from #815, without levels): *"Where the line crosses the x-axis should
   round to minus a prime ending in 9. Bigger primes are better, though each extra digit counts for less. Tie-breaker:
   …"*. The levels are gone, and the main part is now plain (about 25 words). The whole card is **59 words**, because
   the tie-breaker ("Take the number just before that prime. The biggest number that divides both it and the
   y-intercept's whole part…") is long.
4. **End** (08): "You finished 3rd of 3 with 500.90 points", with Contested lines. Nothing below them can be reached
   (rank 4).
5. The chart: a step at about 4:30, then nearly flat to the end (rank 1).

## Grids (carol, Strangers), in order

1. **Planning** (09): the clearest card of the three (*"Touching numbers in the same corner box should be strangers:
   both bigger than 1, no common divisor bigger than 1, and at least 2 apart (like 2 and 5)"*). The 2×2 box drawing
   with a "5" in a circle between cells is unexplained (what is the 5?).
2. **Running**: grid pictures with dashed box borders are small; the log shows the grid with the changed cell boxed,
   which is good. Points climb fast (1,472 by 5:33).
3. **Middle and end** (10): the chart is a staircase that goes flat from about 5:30. Grids changed 0–1 a minute from
   minute 3 on (rank 1). Carol finished **2nd, 1,542.99**. The best grids reached 10 and 11 of 16 touching strangers.
4. **Scale**: grids score about 1,500 and lines about 180–500 in the same ten minutes. A newcomer comparing two games
   would read that as "grids are easier".

## Dynamics (from `v2Moves`, state-changing moves counted once per move)

| Game | Objects changed in each minute 0–9 | Changing moves per third | Objects still > 4 min | Highest bits |
|---|---|---|---|---|
| 9XLSUE (alice, Whole Crossing, desktop) | 3, 2, 2, 2, 2, 1, 0, 1, 0, 1 | 65 / 10 / **4** | 3 of 5 | 9.37 |
| 6Y3YCU (bob, Prime Landing, phone) | 3, 2, 1, 1, 2, 1, 1, 1, 2, 2 | 44 / 36 / 18 | 2 of 5 | **22.87** (a stretch to 59049 = 3¹⁰ at 2:00, then still) |
| BHTSY5 (carol, Strangers, grids) | 3, 3, 2, **0**, 1, **0, 0, 0**, 1, 1 | 75 / 18 / **8** | 4 of 5 | 18.13 |

This is the quietest round since round 13. Round 25's games, on the same beginner lines setup, changed 3–4 lines every
minute to the end. In all three games the agents' energy was full at the end (288.00), so the stop is not energy: the
starters found nothing they wanted to do. In the grids game no seat ran away: the two leaders ended close. In
bob's game the partner led from 4:30 to the end.

## Prime Landing (carried over)

Bob held it, but on the phone I could not reach the per-line list after the game (rank 4), and the live log showed only
moves on lines near −19683. Its landing is still not judged.
