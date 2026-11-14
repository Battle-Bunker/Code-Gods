# Playtest round 9 (2026-11-14, develop at 00a4661e)

After #568 (Results/replay query cost), #569 (one tug line per object, palette nouns, a board in the numbers box),
#570 (holds during planning), #572/#573 (rematch, the Rematch button), #574. Develop deploy green (run 462). `dev`
restarted on the **existing** local deployment with no schema error. The coordinator's scope for this round: the
re-checks (Results with two games at once, #569, rematch) and a sweep of replay, remote assistants (CLI/MCP) and
rotation; **no deal tests**. Hand play: alice 1440×900 (room FKKAKK, Grids · beginner, games 1–3) and carol 1440×900
(room KLNV95, Grids · beginner, game 1 and its rematch), at the same time. The phone width was not played this round.
Screenshots: `docs/screenshots/playtest/round-9/`.

## Re-checks

| Item | Verdict | Evidence |
|---|---|---|
| Results with two games ending together | **loads for both players** ("You finished 1st of 3 with 28,432.94", "2nd of 3 with 35,784"); engine log **0** timeouts at that point (round 8: 14) | 02 |
| Replay builds after the game | **yes**, "Getting the replay ready" for about 10 s, then the controls | — |
| #569 palette nouns | ✓ "Leave grids alone", "Settle and hold grids" in a grid game | — |
| #569 a board typed into the grid-number box | ✓ refused: *"5364645353636354" is not a grid number: it looks like a board, which goes in the board box*, Save disabled | 01 |
| #569 one tug-of-war line per object | ✓ in carol's game: one card per grid in What just changed (grids 22, 29, 32, 18, 42; "Show the 12 moves" folds the rest) | 09 |
| #572/#573 Rematch | ✓ "Rematch: the same deal" in the room's past games, with a confirm. Game 2 has the **same seed, deal, roster, rules (Opposite Nines, Opposite Nines, Leapfrog) and settings** as game 1 (read from the local `v2Games` rows); `rotates` becomes false, which fits | — |

## Sweep

| Step | Verdict | Evidence |
|---|---|---|
| Replay controls | Play/Pause, back/forward one move, start/end, the slider, speed 0.5×–8× and **Watch as** each player all work | 03 |
| Replay events | **broken**: "What just changed" fails as soon as the first move is on screen, for every viewer: *"This pane could not load: o.notes is not iterable"*; **Try again** gives the same. Seen in both rooms, watching as yourself and as each practice partner. The likely spot is `artifacts/player-web/src/panes/move-notes.ts:11` (`for (const n of m.notes)`): the replay's moves seem to have no `notes` | 03 |
| Remote assistant: device flow | `pnpm player connect --room FKKAKK` printed the `/device` link and code; the page showed code, room ("you own it"), permission ("Act — …") and label; **Approve access** → "Access approved"; the CLI said "Connected to room FKKAKK with act rights" | 04 |
| CLI | `status` ("31 tools offered now"), `tools`, `chat send` (shows in the room chat), `agent check`, **`agent summon`** (an agent "Idle" for 5.99 ⚡, visible in My agents), **`agent replace`** (version 1), `agent programs`; `agent hold` on code without hold settings refuses clearly ("…replace it with a starter (Simple, Thorough, Bold), which has them") | — |
| MCP (`/mcp`, Bearer credential) | `tools/list` → 55 tools; `tools/call game_standings` works, wrapped as untrusted game data | — |
| Revoke | Avatar → Connected apps → Revoke → "Click again to revoke" → "No connected apps"; the next `/mcp` call → **401** `invalid_token`; the CLI says "This connection was revoked or has expired. Run `pnpm player connect --room CODE` again." | 05 |
| Rotation (games 1→2→3 in FKKAKK) | **broken**, see finding 2 | 07, 08 |

## Rotation, game by game (room FKKAKK, alice + two practice partners)

| Game | Alice | Practice partner 1 | Practice partner 2 | Results says |
|---|---|---|---|---|
| 1 | Crosswise Threes | Spread of Three | Two Pair | "Game 1 of 3" (alice 1st, 28,432.94) |
| 2 | Mirrormancer | Leapfrog | Leapfrog | **"Game 1 of 3"**, standings of this game only (alice 3rd, 7,762.86) |
| 3 | Leapfrog | Mirrormancer | Magic Eighteen | **"Game 1 of 3"**, standings of this game only (alice 2nd, 14,436.50) |

Every game is dealt fresh and labelled game 1, so no player gets each rule once and nothing adds up over the three
games. Game 2 also dealt both partners the same rule. `pnpm player game rotation` between games returned
`{"seats": []}`. The games were started with the room's **Start game** button. (Game 2 ran through the backend
restart below, but game 3 was started and played afterwards and shows the same thing.)

## Local engine under two games

With two grid games running at once (carol's rematch and alice's game 2), the engine log filled with
`Function execution timed out (maximum duration: 1s)` in the tick (`Q(v2/loop:actInputs)`, `Q(v2/loop:statesOf)`,
`M(v2/loop:commit)`, `A(v2/tick:tick)`, "v2 tick failed"; 20 in all from 21:58). Then the kernel **killed the local
Convex backend for memory: 10.5 GB resident** (only two browsers were running this time). Both games froze at
**"RUNNING · 0:00"** with no message to the player (09). After I restarted `dev` both games ended and Results loaded,
but alice had been signed out (the stand-in sign-in restarts with it). The restarted backend took 8–9 GB of memory before any
game ran; the local deployment holds nine rounds of games (1.2 GB of SQLite). This is my machine, not the cloud
deployment, so it is an observation for the server session: the tick's queries pass 1 s with two games on this box,
and a game whose tick stops shows a 0:00 clock that never ends.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Replay: "What just changed" fails for every viewer with "o.notes is not iterable"; Try again does not help | 03 | **major** (app) |
| 2 | Rotation does not rotate: games 2 and 3 are fresh deals, Results calls each "Game 1 of 3" and shows no totals over the games; game 2 gave two partners the same rule; `game rotation` returns no seats | 07, 08 | **major** (server/rules; app shows what it is given) |
| 3 | When the tick stops (here: the local backend died after 1 s timeouts with two games), the game shows RUNNING · 0:00 forever with no message | 09 | minor (app); the timeouts themselves: server, local only so far |
| 4 | "Try next game" tells the player to "set TARGET and SETTLE in your agent's code", though the no-code Hold control exists | 02 | minor (app/annotations) |
| 5 | Grids pane's sort control is labelled "Change the objects' order"; the CLI/MCP titles are still "Leave objects alone", "Settle and hold objects" (the palette says grids) | — | minor (app / affordances) |
| 6 | The signed-out landing page says "Sign in to watch or play game NH7EHCWNZHV7MAZZPN4G65BSDN8J7C5J in room FKKAKK" (the raw id, upper-cased) | 06 | minor (app) |
| 7 | "Access approved" on the device page is drawn in the red error style | 04 | minor (app) |
| 8 | PILOT.md's CLI section works as written (`pnpm player connect/status/tools/help`) | — | — (good) |

Not re-tested this round: the end summary and holds (round 8 #2), the phone width, a bidding room, two humans in chat.
