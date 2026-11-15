# Playtest round 28 (2026-11-15, develop at bfa62339): does the board keep moving?

After #840 (a practice game is dealt exactly like a real game: rules in tension, no goal-sharing partners), #832
(shortcut prices and value tails) and #833 (the phone end page). Fresh local deployment, app build 9e8f0741, **time
scale 1**, three full ten-minute practice games of Lines · beginner, three cold accounts, run side by side:
- room 6QZSTR: alice at 1440;
- room TW37H4: carol at 1440;
- room X72ZYL: bob at 390.

0 errors, 0 timeouts and 0 watchdog restarts in the engine log; every scheduled tick succeeded. Screenshots:
`docs/screenshots/playtest/round-28/`.

## The rules dealt (seat: family / tie-breaker)

| Game | Human | Partner 1 | Partner 2 |
|---|---|---|---|
| 6QZSTR (alice) | Same on Both Rulers / m-gpf | Divisibility Ladder / next-rung | Ruler / far |
| TW37H4 (carol) | Smooth Intercept / shared-factor | Same on Both Rulers / m-spf | Pythagorean Area / whole-legs |
| X72ZYL (bob, phone) | Ruler / prime-gradient | Whole Crossing / shared-factor | Square Area / lpf |

## Does the board keep moving?

| Game | Objects changed in each minute 0–9 | Changing moves per third | Minutes with no change | Highest bits | Own agent in the last third |
|---|---|---|---|---|---|
| 6QZSTR (alice) | 3, 2, **0, 0**, 4, **0**, 4, **0**, 1, 1 | 27 / 16 / 19 | **4** | 5.91 | 7 moves, 2 raised her points |
| TW37H4 (carol) | 3, 1, 1, 1, 2, 1, 2, 2, 2, 1 | 46 / 23 / 56 | 0 | 8.59 | 14 moves, **11 raised her points** |
| X72ZYL (bob, phone) | 3, 3, 2, 2, 3, 2, 2, 2, 3, 2 | 63 / 60 / 60 | 0 | 6.41 | 21 moves, 1 raised his points |

Ticks, for every game and every minute, ran at 32–36 a minute with a median of 0.2–0.3 s. Minutes 4–5 had a longest
tick of 4.5–6.0 s in all three games at once (one shared hiccup), then went back to under 1.2 s.

Agents (v2AgentEnergy): 413–802 acts each, 0 failures, and skip rates of:

| Game | Skip rates (human, partner 1, partner 2) | Energy at the end |
|---|---|---|
| 6QZSTR | 96%, 97%, 96% | 198–277 (unspent) |
| TW37H4 | 92%, 95%, 91% | about 30 |
| X72ZYL | 85%, 95%, 85% | about 25 |

**Verdict: better than rounds 26–27, but not yet a living board.**
- Bob's phone game moved every minute, with an even third-by-third count (63 / 60 / 60).
- Carol's game moved every minute, and her own Smooth Intercept agent kept stepping up to the end: 11 of its 14
  last-third moves raised her points, and her chart climbs in steps to 263.15 (2nd) (02).
- Alice's game had **four still minutes**. Her agents left 200–280 energy unspent, and her chart is flat from about
  2:00 to 10:00 at about 90 points (01). Her Same on Both Rulers line was "−2²⁄₃₂₃ · off by 3³²¹⁄₃₂₃" from −6.
- In carol's and bob's games, 2 of 5 lines (in alice's game, 0 of 5) were still for more than four minutes. The numbers stay small
  (highest bits 5.9–8.6), so no huge-number parks this round.

## The phone end page (#833)

**Fixed.** After "GAME OVER", the top-bar **"See it line by line"** opens the Lines pane with each line's points
(04). The page scrolls by mouse wheel through How the game went to **"What earned your points"**: three line cards
and "These 3 lines earned 134.33 of your 140.39 points". A new **"What cost you"** section follows: *"You, Practice
partner 1 and Practice partner 2 pulled line 3 back and forth (64 pulls, 1,100.28 energy)."* (05). The bottom of the
page is Where am I and the Leaderboard (03), which I had taken in rounds 26–27 for a jump back. The page simply ends
there, so round 26's rank 4 was partly my misreading. Not tested: a touch swipe, which the harness cannot do.

## What remains (the round-26 list, re-ranked)

| Rank | What | Evidence |
|---|---|---|
| 1 | **Still minutes in some deals.** Alice's table (Same on Both Rulers, Divisibility Ladder, Ruler) had four minutes with no change and a flat chart for eight minutes, with 96–97% of acts skipped and energy left unspent. The other two tables moved every minute | 01 |
| 2 | **Your own agent rarely helps you late.** In bob's game his agent made 21 last-third moves and only 1 raised his points (alice: 2 of 7). The board moves, but a newcomer watching their own points sees them stand still or fall | 03 |
| 3 | **Cards are still long.** Same on Both Rulers reads *"The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to −6. Tie-breaker: The gradient's largest prime factor should be as big as possible."* That is 37 words and clear, but "the number the machine leaves unchanged" is abstract, and "as close as possible to −6" is a target that can be hit exactly (design principle 1) | 01 |
| 4 | **Scores differ a lot between seats in one game.** Carol 263 against partner 1's 159; alice 92 against about 200 | 01, 02 |
| 5 | **The end advice repeats word for word** (alice's and bob's games, and round 27): "open a line you share in One line and order its moves by 'Best for points'". That is better than before, but it is not yet drawn from what happened in the game | 01 |
