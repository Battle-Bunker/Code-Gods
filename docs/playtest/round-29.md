# Playtest round 29 (2026-11-15, develop at 3267f440): does the board keep moving?

After #845 (end advice from this game's facts), #839 (Treasure as a coin-pile ladder), the dealer change in 9f3d0b3e
(named opponents drawn inversely to how often they are named; practice deals try a goal-sharing partner first) and #846
(Pythagorean Area fast on huge lines). Deploy run 685 is green. Fresh local deployment, app build 8399be3c, **time scale
1**, three full ten-minute practice games of Lines · beginner, three cold accounts, side by side. 0 errors and 0
timeouts in the engine log; every scheduled tick succeeded. Screenshots: `docs/screenshots/playtest/round-29/`.

## The rules dealt (family / tie-breaker)

| Game | Human | Partner 1 | Partner 2 |
|---|---|---|---|
| BF63XD (alice, 1440) | Same on Both Rulers / prime-start | Prime Staircase / step-back | Prime Landing / shared-factor |
| A3FRMR (carol, 1440) | Prime Gradient / shared-factor | Ruler / prime-gradient | Treasure / shared-factor |
| ZUTYKF (bob, 390) | Same on Both Rulers / m-spf | Pythagorean Area / shared-factor | Prime Staircase / step-back |

## Does the board keep moving?

| Game | Objects changed in each minute 0–9 | Changing moves per third | Still minutes | Lines still > 4 min | Highest bits | Own agent, last third |
|---|---|---|---|---|---|---|
| BF63XD (alice) | 3, 2, 1, 1, 2, 1, 3, 1, 4, 2 | 56 / 39 / 50 | 0 | 1 of 5 | 11.53 | 20 moves, 7 raised her points |
| A3FRMR (carol) | 3, 1, 1, 1, 2, 1, 1, 1, 2, 1 | 65 / 60 / 48 | 0 | 3 of 5 | 9.79 | 11 moves, **11 raised her points** |
| ZUTYKF (bob, phone) | 3, 1, 2, 1, 2, **0, 0**, 1, 1, **0** | 36 / 10 / 12 | **3** | 3 of 5 | 10.64 | 5 moves, 3 raised his points |

Ticks: 30–35 a minute in every minute of every game, median 0.3–0.4 s. In minute 7 all three games had one tick of
5.0–5.7 s at the same moment (a shared hiccup, as in round 28's minutes 4–5).

Skip rates (v2AgentEnergy), with 534–641 acts per agent and 0 failures:

| Game | Skip rates (human, partners) | Energy at the end |
|---|---|---|
| alice | 90%, 91%, 95% | about 30 |
| carol | 93%, 87%, 91% | about 30–55 |
| bob | 96%, **97%, 98%** | 48–92 |

**Verdict: the same picture as round 28.** Two boards moved every minute; one (bob's) had three still minutes and a
second and last third of only 10–12 changing moves. The still table again holds the human's Same on Both Rulers (as
alice's still table did in round 28), and its partners skip 97–98% of their turns. On the busy boards much of the
movement is a tug:
- carol's line 1 went "back and forth (71 pulls, 597.56 energy)" and ended exactly where it started for her (60.64 →
  60.64 points);
- her chart oscillates between about 100 and 150 for nine minutes (02).

Carol's own agent still climbs (all 11 of its last-third moves raised her points). Alice's agent landed two lines
"exactly" on −6, and she finished 1st with **319.12** (01).

## The end advice (#845)

**Now drawn from the game.** Examples:
- alice: *"This game you, Practice partner 1 and Practice partner 2 pulled line 3 back and forth (36 pulls, 579.39
  energy). Next game, open a line you share in One line and order its moves by 'Best for points'…"* (01);
- carol: 71 pulls and 597.56 energy (02);
- bob: 19 pulls and 175.70 energy (03).

Each game names its own tug. The second half is still the same sentence in every game.

## What remains (ranked)

| Rank | What | Evidence |
|---|---|---|
| 1 | **Some tables still go still.** Bob's table (Same on Both Rulers, Pythagorean Area, Prime Staircase) had 3 still minutes, and its partners skipped 97–98% of turns. In rounds 28–29 both still tables held Same on Both Rulers for the human | 03 |
| 2 | **Busy boards are mostly tugs.** On carol's board, line 1 moved 71 times and ended where it began, and her chart is a nine-minute sawtooth. The board moves, but the player's own points stand still | 02 |
| 3 | **Same on Both Rulers has an exact target.** "As close as possible to −6": alice's lines sat "−6 · exactly" from mid-game. That is a reachable top (design principle 1), and it may be why its tables stall once the target is hit | 01 |
| 4 | **Prime Gradient sits between rungs.** Carol's lines ended at gradients 10, 4 and 3 ("−½", "−6½" and "−7½" from the nearest rung); none landed on 11 | 02 |
| 5 | **A shared slow tick** (5–6 s) hits all three games at the same moment once a game (minute 4–5 in round 28, minute 7 here) | — |
