# Baseline 1 (2026-11-16): the grid game, old app beside new

The coordinator's brief (23:44 on 15 Nov), after the owner's new priorities: play the same grid game through the old app
and the new one as a new player, and list every place where the new app does less, does it worse, or is broken.

**How it ran.** Both apps ran on local engines on the same machine at the same time:

| App | Code | Ports (cloud / site) | Build |
|---|---|---|---|
| Old | `archive/engine-v1` (1018e913), a read-only worktree | 3220 / 3221 | db895f69 |
| New | develop 5f3ff8f2 | 3210 / 3211 | a4ea4f89 |

The setups played:
- old: the default setup **Annotated basics** (4×4 digits, 1 min planning, a 5 min game; dealt Magic Eighteen on desktop
  and Strangers on the phone);
- new: **Grids · beginner** (4×4 digits, 60 s planning, a 10 min game; dealt Two Pair).

Each app was played at 1440 (alice) and at 390 (bob), every game a practice game with two AI or practice players. Each
screenshot is a pair, old on the left and new on the right, in `docs/screenshots/playtest/baseline-1/`.

**Nothing blocks playing a game in the new app.** Lobby, room, start, planning, summon, the running game, the end page
and the phone layout all work. The new app's chat, pause, What if, filters, replay and rematch were checked in round 34
(`docs/playtest/round-34.md`). The old app showed chat in no pane by default either, so round 34's item 1 is a UX fault
that both apps share, not a regression.

## Where the new app does less or worse (most serious first)

| # | Difference | Old | New | Owner | Pair |
|---|---|---|---|---|---|
| 1 | **Rematch keeps the same rules** | The end page says *"Game 1 of 3 in this rotation. Play again with the same players and you get Recursion Regent's rule, until everyone has held each rule once."* | "Rematch: the same deal": every seat keeps its rule | settings and setups (A), W5 | 05 |
| 2 | **No setups of your own, and no colour boards** | A searchable setup picker with Edit, Duplicate and **New setup**, plus "See all settings →". It includes *Annotated colours*, *Classic 5×5 with four colours* and *Low income* | Eight fixed setups chosen by radio buttons; settings are edited in the room. No colour board (#919 is only its foundation) and no saved setups | A, grids | 01 |
| 3 | **Planning hides the board and your points** | During planning, "Your points now: 42.9 … every grid already gives everyone some points", the Objects list with every grid's points, and the annotated example open | "You: 0.00 points"; no Grids pane until the world starts; the worked example folded | W5 | 02 |
| 4 | **The board does not grow** | Grids are born during the game ("spawned 0:53 ago"; "107 of its latest moves … on 14 grids") | Five grids, fixed for the whole game | grids, A | 04 |
| 5 | **No assistant** | Every grid has "why?" and "ask my assistant" | No assistant action in the palette; "why" exists as the Why line only | W5 / panels (B) | 04 |
| 6 | **My agents tells less** | Power share with "Give Simple line balancer more power", an energy bar ("full in 14 s"), energy spent split into reading and changing, actual against estimated cost per act, and "can act now" | Share, energy, moves, skipped, failed, energy spent, points from moves. Power is split only from the palette ("Split power between agents") | W5 | 04 |
| 7 | **The end page has no standings table and no best/worst grid chart, and the replay has no event marks** | A "Final standings" table, "Why: your best and worst grids", and a replay timeline with event marks and "◆ prev / next ◆" (event 5790 of 5790) | "1st of 3", the Leaderboard chart, Contested grids and advice. The replay (round 34, shot 08) has a slider but no event marks | W5 | 05 |
| 8 | **The worked example's circled numbers are unexplained** | Point at a scoring unit to get a callout: *"column 1 makes 18 (+1, 0) … ✓ 6 + 3 + 3 + 6 = 18"* | Each corner box carries a circled number (8, 1, 2, 6). These are the box totals, which Two Pair does not use, and no legend says so. The per-box list and the "off by 5" ruler underneath are clear | annotations | 03 |

Where the new app is better:
- the end advice is drawn from the game;
- the Why line names the parts of the score;
- What if previews a change;
- the phone layout has tabs for every pane (pair 06).

The old board also shows its own failure: on alice's table many grids parked in identical stripes (2222/7777,
0000/9999, 6666/3333, each at 18.3 bits) by 1:06 (pair 04). The new rules are meant to avoid exactly that.

## Seen in text only (no pair)

- In a grid game, the new palette's "Open a pane" list still names the panes for lines: "Lines: Which lines earn you
  points", "One line", "What if: Try a change on a line".
- Old palette actions with no new counterpart: "Mark me ready", "Wake the game", "Layout: side by side" and "Arrange the
  dock". The old panels "Code results" and "Leaderboard race" have no new counterpart.

## Not done yet (next)

The annotations pass:
- on old grids: what is marked on the board for the rule, hover and focus, legends, the worked example, how a score is
  explained;
- then the same on new grids and new lines.

Also still to do on the old app: chat, pause, What if and the object view, side by side.
