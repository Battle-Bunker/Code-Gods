# Playtest round 2 (2026-11-14, develop at 3e1943e)

Re-test after #464 (app fixes for round 1) and #463 (grid agents). Same method as round 1: hand play in Chromium,
local backend, alice at 1440×900 (practice game), bob at 390×844 (bidding room with practice partners).
Screenshots: `docs/screenshots/playtest/round-2/`.

**Build/start:** clean (install, `dev` READY, `deploy-static`).
**Start to finish:** practice game **yes**, bidding game **yes** (phone). Two-human and remote-connection flows were
not repeated this round (nothing touching them merged).

## Round-1 findings re-tested

| R1 # | Finding | Now | Evidence |
|---|---|---|---|
| 13 | Palette operations that ask for text never run | **fixed**: "Send a chat message" asks for "Your message", Enter sends it, it appears in Public chat; "Read the chat" opens the pane | — |
| 21 | Bid result invisible during the game; "Show the auction's result" fails | **fixed**: Where am I says "You won Square Area in the bid: 20% comes off your total at the end of the game"; results "(after your bid's 20% handicap)" and "A rule was won in the bid this game, so there is no rotation this round" | 03, 04 |
| 10 | My agents: no agent stats | **fixed**: "Energy 416.75 ⚡ · 737 moves · 161 skipped · 0 failed · 6,568.06 ⚡ spent · +830.37 points from its moves". At 1440×900 the stats line is clipped by the dock (see 8/9) | 01 |
| 16 | Assistant/pitch offered where AI cannot run | **fixed in the palette** ("Ask the assistant", "Draft a cooperation pitch" gone). Left: the pane menu still offers "Your assistant" (it opens and says "AI is only available in rooms run by an administrator for now"); the palette still lists "Stop the assistant", "Edit a waiting message", "Set the room's AI quotas" | — | 
| 8, 9 | Dock clips/evicts panes at 1440×900 | **not yet** (W5: rebuilding on `claude/v2-dock`). Still "It replaced What just changed (at most five panes at once)"; the results pane and My agents are cut off | 01, 02 |
| 22 | Phone growth face cuts off y(0) | not re-tested (W5: with the annotations session; my rule this round was not a growth rule) | — |
| 7 | Starter's tug-of-war guard | **still open** (no fix reported): "Tug-of-war on line 24: your agent and Practice partner 1's agent moved it back and forth 7 times (2:28 to 2:35)"; feed dominated by contested lines again | — |
| 2 | "step N of M" wording | superseded (owner decision 23 removes steps and rungs) | — |
| 18 (part) | No rotation line after a bidding game | explained in the results now (by design) | 04 |

## New this round

| Step | Verdict | Severity |
|---|---|---|
| After "Send a chat message" from the palette the palette closes with no confirmation; you only know it worked by opening the chat | minor |
| Palette search still finds no pane by its title ("what just changed", "secret goal"): the pane menu is the only way | minor |
| The agent-code button after a summon now reads "Summon another agent" (was "Summon beside it"); fine | — |

No new blocker or major found. Still open majors: the dock at 1440×900 (app, in progress), the starters' tug-of-war
guard (agents), the phone growth face (annotations).
