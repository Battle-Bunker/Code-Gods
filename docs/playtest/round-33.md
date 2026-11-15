# Playtest round 33 (2026-11-15, develop at 3e2c28cc): two-state cycles after #868

After #868 (Same on Both Rulers loses its sign, trial 34, so a mirror pays nothing there), #865 (a skipped act keeps no
transcript), #866 (objectCap) and #869–#872 (audit). Deploy run 702 is green. Fresh local deployment, app build
aa514239, **time scale 1**. Three ten-minute practice games of Lines · beginner ran side by side, each with a cold account:
- room VTCB2B: alice at 1440;
- room 68R6N6: carol at 1440;
- room FZQBTS: bob at 390.

Every scheduled tick succeeded, with 0 agent failures. Screenshots: `docs/screenshots/playtest/round-33/`.

## The rules dealt

| Game | Human | Partner 1 | Partner 2 |
|---|---|---|---|
| VTCB2B (alice) | **Prime Gradient** / shared-factor (found on deal 3) | Pythagorean Area / shared-factor | Prime Staircase / step-back |
| 68R6N6 (carol) | Divisibility Ladder / next-rung | Whole Crossing / shared-factor | Prime Landing / shared-factor |
| FZQBTS (bob, phone) | Treasure / shared-factor | Divisibility Ladder / next-rung | Whole Crossing / shared-factor |

Same on Both Rulers was not dealt to any seat, in 6 deals for carol plus the three played games. So #868's fix was
not exercised; see below for what the cycles did instead.

## Does the board keep moving?

| Game | Objects changed in each minute 0–9 | Changing moves per third | Still minutes | Lines still > 4 min | Highest bits | Own agent, last third |
|---|---|---|---|---|---|---|
| VTCB2B (alice) | 3, 2, 1, 1, 1, 1, 1, 1, 2, 1 | 42 / 20 / 27 | 0 | 2 of 5 | 22.44 | 10 moves, 5 raised her points |
| 68R6N6 (carol) | 3, 1, **0, 0**, 1, **0, 0**, 1, 2, 1 | 23 / 9 / 37 | **4** | 3 of 5 | 10.25 | 16 moves, 15 raised her points* |
| FZQBTS (bob, phone) | 3, 2, 1, 1, 2, 1, 1, 1, 2, 1 | 58 / 40 / 33 | 0 | 3 of 5 | 8.23 | 15 moves, 14 raised his points* |

\* Nearly all of these are one half of a two-state cycle (below). Each raises the human's points, and the partner's
next move takes the points away again. From this round on, "raised the points" counts only moves whose state is not
undone within the next two moves on that line.

**Distinct states per line in the last third (400–600 s):**

| Game | Line | Changing moves | Distinct states | Who moved it | How |
|---|---|---|---|---|---|
| 68R6N6 (carol) | 3 | 29 | 4: **27 of 29 moves flip between `47,1,540` and `1,47,540`** | Whole Crossing 14, carol's Divisibility Ladder 13, Prime Landing 2 | `cart.mirror {axis: diagonal}` both ways, every 2–9 s from 459 s to 598 s |
| 68R6N6 (carol) | 5 | 8 | 8 | Whole Crossing 5, carol 3 | mixed |
| FZQBTS (bob) | 3 | 31 | 5: **27 of 31 moves flip between `−12,1,−12` and `−13,1,−14`** | Divisibility Ladder 15, bob's Treasure 14, Whole Crossing 2 | `cart.pivot {k: ±1, x0: −2}` both ways, from 403 s to 596 s |
| VTCB2B (alice) | 2 | 8 | 7 | Prime Gradient 4, the partners 2 each | mixed |
| VTCB2B (alice) | 3 | 15 | 6 (none above 4 visits) | Prime Gradient 6, Pythagorean Area 5, Prime Staircase 4 | mostly `si.tilt` |

The other lines in each game did not change in the last third. Stored states are the raw (a, b, c).

**Verdict:** alice's game was the best board of recent rounds. It moved every minute, it had no two-state cycle, and
on her two most contested lines 6 and 7 of the states were distinct. The other two games each had **one line stuck in
a two-state cycle for the whole last third**, with the rest of the board still. In carol's game that left 4 still
minutes, and her partners ended with 167–247 energy unspent. So the cycle is not specific to Same on Both Rulers:
- **Mirror (diagonal):** Whole Crossing and Divisibility Ladder both want the line, one on each side of the diagonal
  mirror. One cheap act undoes the other's at no loss.
- **Unit pivot:** Treasure and Divisibility Ladder trade ±1 pivots about the same point. That is not a shortcut, just
  the smallest step each way.

Both are agents of different players pulling one line back and forth, which the brief calls expected naive play. The
UI makes it legible: the end page says *"Line 3: you, Practice partner 1 and Practice partner 2 undid each other's
moves (50 moves)"* (03), and bob's chart is a visible sawtooth from about 6:40 (04). I report it for dynamics, not as
a defect: in two of three games the "living" part of the last third was one line toggling between two states.

## Prime Gradient (alice): first deal since round 29

- **The card has changed.** It now reads *"The gradient should round to a prime ending in 1. Bigger primes are better,
  though each extra digit counts for less."* That is 22 words for the main part. The levels-of-digits wording is gone,
  and the sign is positive (round 25 had "minus a prime ending in 9") (01).
- **It lands on a rung.** Lines 3 and 4 ended at y = 10½x + 19 and y = 10½x + 29, with the Why line *"the gradient
  10½ rounds to the prime 11: 2 digits; the next big step is 3 digits"*. No line reached a 3-digit prime in ten
  minutes.
- **No own-line tug.** In round 29 Prime Gradient pulled its own line 71 times. This round its agent's changing moves were 20 tilts
  and 9 other calls all game, and no line cycled.
- Alice finished **2nd, 528.29**; the chart climbs in steps to the end for all three seats (01).

## Tick health

There were 29–35 ticks a minute in every minute of every game, with a median of 0.3–0.5 s. Each game had two
ticks of 4.2–6.1 s, all in minutes 0–3, in all three games alike. That is the shared local contention W3
diagnosed in round 32, not a single game's.

## Agents (v2AgentEnergy)

| Game | Acts each | Skip rates (human, partner 1, partner 2) | Energy at the end |
|---|---|---|---|
| VTCB2B | 577–608 | 95%, 95%, 95% | 29–38 |
| 68R6N6 | 480–680 | 96%, 95%, 98% | **167–247 (unspent)** |
| FZQBTS | 403–786 | 86%, 90%, 98% | 33–85 |

Carol's table is the round-28 pattern again: high skips, energy unspent, and still minutes, with one line cycling.

## The end page

- **Advice names the wrong line in carol's game.** It said *"you and Practice partner 1 pulled line 5 back and forth
  (3 pulls, 236.89 energy)"*. Contested lines put line 3 first, with "undid each other's moves (40 moves)". The
  advice seems to rank by energy spent, so the cheap mirror cycle, which was the game's real tug, is not the one
  named (02).
- **Two counts of the same tug.** Alice's advice says "line 3 … 29 pulls" and Contested lines says "46 moves" for
  the same line; bob's says "97 pulls" against "50 moves" (01, 03). A newcomer reads these as two different facts.

## What remains (ranked)

| Rank | What | Evidence |
|---|---|---|
| 1 | **Two-state cycles outside Same on Both Rulers.** One line in each of two games toggled between two states for the whole last third: a diagonal mirror (Whole Crossing against Divisibility Ladder) and a ±1 pivot (Treasure against Divisibility Ladder). #868 removes the mirror cycle only where Same on Both Rulers sits, and it was not dealt this round | 03, 04 |
| 2 | **Still minutes in some deals.** Carol's table had 4 still minutes, 3 of 5 lines still for more than four minutes, and 167–247 energy unspent | 02 |
| 3 | **End advice ranks the tug by energy, not by pulls**, so it can name a 3-pull line over a 40-move cycle; its "pulls" count also differs from Contested lines' "moves" | 01, 02, 03 |
| 4 | **"Own agent raised your points" overstates late help.** Counting single moves, it looks like 15 of 16 and 14 of 15. Each of those gains was undone within seconds | 04 |
| 5 | **Prime Gradient stays at 2 digits.** It lands on 11 and holds there; ten minutes is short to see whether the 3-digit step is ever taken. Watch, not a defect | 01 |

Screenshots:
- 01: alice's end page at 1440 (Prime Gradient card, advice, chart);
- 02: carol's end page at 1440;
- 03: bob's end page on the phone;
- 04: bob's chart on the phone, with the sawtooth.
