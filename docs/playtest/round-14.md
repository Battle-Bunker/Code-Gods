# Playtest round 14 (2026-11-15, develop at 608ffa50)

After #699 (line drift), #700/#703 (price scale, paid-look screenshots), #708/#711 (round-13 app items), #716 (world time
at the time scale) and the two-line-systems work (#706, #710, #717). The latest finished develop deploy is green
(run 578). Fresh local deployment, app build 5c5b05fe. Played by hand in Chromium, **with time dilation** (#698,
`v2/lobby:setTimeScale`):
- room EN9CJ2, Lines · beginner at **5×** (a 10-minute game in 2 minutes): alice at 1440 and bob at 390, two humans plus a practice partner, games 1 and 2 of a rotation;
- room 8AASZ7, Grids · beginner with bidding at **10×**: carol at 1440.

0 timeouts or errors in the engine log. Screenshots: `docs/screenshots/playtest/round-14/`.

## Re-checks (#708, #711)

| Item | Verdict | Evidence |
|---|---|---|
| Header energy | ✓ "Energy 57.60 (full)", no doubled word | 01, 02 |
| "Price of a look" setting | ✓ second in the room's settings: "0.19× (the setup's own)", "Times the read price. Everyone sees each line or grid as they or their agents last saw it; a look costs energy" | 03 |
| Rotation | ✓ game 2 "Game 2 of 3 … Totals so far", alice 334.45 + 850.38 = **1,184.84** ✓. Alice's game-1 rule (Prime Staircase) went to bob in game 2 | 02 |
| Two humans | chat sent from alice's palette ("Message sent"); the game was over before bob read it at 5× (see finding 3) | — |
| Watcher price, "Look at every line now", hidden-end note in Results | **not reached**: at 5× and 10× the games ran too fast to open these by hand | — |

## Time dilation as a 12-year-old would meet it

| Item | Verdict | Evidence |
|---|---|---|
| Planning and bidding | planning is dilated too: at 5× it lasted about 12 s, and at 10× the bid phase passed before carol could bid (she was dealt "Spread of Three" with 0:46 left on arrival) | — |
| World time vs wall time | at 5× bob's phone showed a line "**seen 3 min ago** · up to date" while the header said "GAME ENDS IN 1:19" of a 2-minute game. The freshness mark counts in world minutes, the clock in wall minutes | 01 |
| Room summary | "10 min game" for a room set to 5×; the room page says nothing about the speed-up | 03 |
| "a look costs 0.19× the read price" | jargon for a beginner: "read price" is not explained anywhere a player sees | 03 |

## Dynamics (metastable-ecosystem instruction; measured from `v2ObjectStates.changedAt`)

| Game | Objects | Changed in the last third | Last changes (world s) |
|---|---|---|---|
| EN9CJ2-1 (lines, 5×, 120 s world) | 4 | **1** | 22, 22, 71, 86 |
| EN9CJ2-2 (lines, 5×, 120 s world) | 5 | **1** | 4, 8, 10, 77, 97 |
| 8AASZ7-1 (grids, 10×, 60 s world) | 6 | **6** | 41, 59, 59, 60, 60, 60 |

- **Lines still freeze** (round 13 D1, still open): in both line games only 1 line moved in the last third. Alice's game-2 chart is a staircase of flat stretches (02).
- **Grids keep moving** to the end, at least at 10× over 60 world seconds.
- The stored world end for a dilated game is the wall length (120 s at 5×, 60 s at 10×), so these are short worlds, not 10-minute worlds run fast. Whether that is intended is a question for the server session.
- No dominant strategy: everyone ran Simple; alice won game 2, the partner won game 1, and carol was 3rd.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| D1 | Line games still freeze: in two lines games only 1 of 4–5 lines changed in the last third | 02 | **major** (rules/agents; round 13 D1 still open) |
| 1 | Under time dilation, the freshness mark ("seen 3 min ago") counts world time while the clock counts wall time | 01 | minor (app) |
| 2 | Under dilation the room page still says "10 min game" and shows no speed; `endAtWorld` stores the wall length (120 s at 5×), so a "10-minute game at 10×" is a 60-second world, not 600 s of world | 03 | question (server: is the world shortened or sped up?) |
| 3 | Planning and the bid phase are dilated as well, so at 10× a human cannot bid or summon before the world starts | — | minor (server; dilation is a test tool, but the owner may playtest with it) |
| 4 | "a look costs 0.19× the read price" is jargon | 03 | minor (app) |

Not covered this round: a phone grid game, replay, remote assistants (round 13 ✓), and the Watcher/look/hidden-end
wording from #711 (to re-check undilated in round 15).
