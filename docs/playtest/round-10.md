# Playtest round 10 (2026-11-14, develop at e9a6ad00)

After #579/#591 (settle and hold deleted), #580 (prices), #581/#602 (climb view), #587 (live anonymity), #596 (round-9
app items), #597/#600 (10 starting objects, births 0.05/s, rational lines by default), #608 (noise at 8 bits), #610
(rotation). Run on a **fresh** local deployment (the old 1.2 GB store caused round 9's out-of-memory kill), app build
a3a53e6f. Played by hand in Chromium:
- room 53C5C2, Lines · beginner (fraction lines), a three-game rotation: alice at 1440×900, bob at 390×844 and one
  practice partner;
- room NR4B44, Grids · beginner practice: carol at 1440;
- room B79UPG, Lines · beginner with bidding: carol at 1440 with practice partners.

Up to three games ran at once, with **0** timeouts in the engine log and memory at most 10 GB. No deal tests beyond
one LEAVE split, as the coordinator asked. Screenshots: `docs/screenshots/playtest/round-10/`.

## Functional sweep

| Step | Verdict | Evidence |
|---|---|---|
| Sign-in, room, join by code (phone), practice game, goal card, Summon, Start the world | works | 01, 03 |
| Settle/hold anywhere | **gone**: the palette has no "settle"/"hold" entry (only "Pause the game (hold on)"); MCP lists 54 tools with no hold/settle (`agent_leaveAlone` only); the end summary's tip is now "climb with the moves marked ↑ both" | 06, 12 |
| Chat between two humans | alice (palette "Send a chat message") ↔ bob (phone "Public chat" pane): three messages both ways | 03 |
| LEAVE split | alice "leaves line 13", bob "leaves line 14": the control shows the price before Save ("only that part of its code changes, for 4.17 ⚡") and confirms "✓ Simple now leaves line 13 alone (it cost 4.17 ⚡)". No new 13/14 tug-of-war cards after it | 05 |
| Live anonymity | cards say "your agent and another player" and "Ask in chat who else wants this line"; names appear only after the game ends | 01, 04 |
| Results (three games at once) | loads for every player in every game | 06–08, 12 |
| Rotation | **fixed**: game 2 "Game 2 of 3 … Totals so far" (alice 812.86 + 308.12 = 1,120.98 ✓, bob 608.80 + 487.87 = 1,096.67 ✓); game 3 "The 3 games are over: everyone has played each rule once. Totals over the 3 games" (alice 1,735.07 ✓). Rules rotate: alice Prime Gradient → Whole Crossing → Same on Both Rulers; bob Same on Both Rulers → Prime Gradient → … | 07, 08 |
| Replay | **fixed**: "What just changed" shows each move ("Another player changed a grid (swap row 1, column 2 and row 3, column 4) …"); Play, step and speed work | 09 |
| Bidding | cards "Prime Landing scores up to 16.00 bits (1 in 66,000 by chance)"; bid 10 % → "You won Prime Landing in the bid: 10% comes off your total"; leaderboard shows "−10%"; Results "(after your bid's 10% handicap)" | 10–12 |
| Remote assistants | `pnpm player connect` → /device approve → CLI `status` (54 tools), `agents list`, `agent leave-alone` (3.56 ⚡, version 1), `chat send`; MCP `tools/list`; `pnpm player disconnect` → the next MCP call is **401** | — |
| Phone (390) | the pane chips, chat and tug cards read well | 03, 04 |

## Judged as a 12-year-old would

| Item | Verdict | Evidence |
|---|---|---|
| **"About" numbers** | The header reads "You: about 224.99 points", the Why line "others' about 63.06 bits", and the Lines list explains the blur. But the live estimate is **much higher than the final count**, every time: alice "about 1,509" at 1:55 → **812.86** at the end; game 2 "Your highest was 889.62 points at 2:57; you ended with 308.12"; game 3 highest 1,418.37 → **614.09**; carol (bidding) "about 2,895.85 · 1st of 3" at 0:40 → **1,612.13, 2nd** (1,791 before the 10 % handicap). Line 11: "others' about 63.06 bits ≈ 339.64 points" live, **46.54 bits = 250.65** at the end; line 7: 18.16 → 7.65. Every player's line on the chart drops off a cliff at 5:00. A child sees their score halve at the buzzer and the leader change. The explanation ("During the game your points were an estimate") is there, but an estimate that is always about 1.5–2.5× too high reads as a trick | 06, 11, 12 |
| "about 0.00 points" in planning | odd but harmless | — |
| **Fractions** | the setup is "Fraction lines", but almost every line on screen is whole-number (y = 59x + 0, y = 5x − 25, y = −1x + 12, y = 17x + 3, y = 13x + 13). The only fraction I saw was in a rule's working (x = −6/7). Fractions are not "everywhere"; they are nearly absent | 01, 07, 11 |
| "−1x" | written "y = −1x + 12" (a child expects "−x") | — |
| "another player" in the log | clear; "Ask in chat who else wants this line" is the right nudge. In practice rooms the same card also says "Practice partners do not read chat", which gives away that the other player is a partner | 02, 11 |
| Only 10 lines at the start | 10 at the start, 26+ lines by the end (births); not confusing. The Lines list shows empty "Line 25 …" boxes for a few seconds when scrolled fast | — |
| Agent notes | "Make a deal with them, then add 14 to LEAVE in your agent" points at code, while the no-code "leaves these lines alone" box exists | 04 |
| Replay agent name | the replay calls carol's agent "Agent 1"; live it was "Simple" | 09 |

## Dynamics (metastable-ecosystem instruction)

| Question | What round 10 showed | Evidence |
|---|---|---|
| Did objects keep moving to the end? | **Yes.** Tug-of-war ran to 0:00 in every game: bob's line 17 "94 times (from 3:12 left to 0:00 left)", carol's line 5 "80 times (from 4:59 left to 0:43 left)"; the end summaries list 10+ contested lines each. Score lines kept rising and falling; game 2's line chart zig-zags the whole game | 04, 06, 07, 11 |
| Did the board converge or freeze? | **Main parts are maxed fast.** Prime Gradient reached "gradient 59 · exactly", "gradient 5 · exactly" and "gradient 2 · exactly" on three lines within 20 s of the start (any prime gradient is exact). Prime Landing showed "y-intercept 3 · on 3" and "13 · on 13" on its top lines. The main part then stops mattering and only the tie-breaker separates lines (the "bigger prime" ramp, already known and being replaced) | 01, 11 |
| Did one strategy dominate? | Every human ran Simple. The practice partner won the rotation total and two of the three games (bob won game 2), so no human strategy dominated. Within a game, tug-of-war on many lines with all three agents on each was the norm | 07, 08 |
| Could a player find a best state and sit on it? | With no hold, no: lines kept being pulled until the end. But a whole-number gradient that is prime is an instant "exactly" for Prime Gradient, so the **main part** is a sit-able peak on every line | 01 |

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | The live "about" points are systematically far above the final exact count (1.5–2.5×, every player, every game); every chart drops off a cliff at 5:00; the live leader can lose. An unbiased blur would be both above and below | 06, 11, 12 | **major** (server/rules: the #608 noise) |
| 2 | "Fraction lines" show almost only whole numbers; the starting lines and the agents' moves stay on integers | 01, 07, 11 | **major** (rules/server: the rational default in #597 does not show) |
| 3 | Prime Gradient's and Prime Landing's main parts are hit exactly within seconds on several lines (any prime value is exact), so the main part is an easy, repeatable peak | 01, 11 | **major** (rules; dynamics criterion; separate from the known tie-breaker ramp) |
| 4 | The palette's "Leave lines alone" still closes without opening the control (round 7 #2) | — | minor (app) |
| 5 | Agent notes still say "add 14 to LEAVE in your agent" (code) although the no-code box exists | 04 | minor (agents) |
| 6 | "y = −1x + 12" should read "y = −x + 12" | — | minor (app) |
| 7 | Practice rooms: the anonymous card adds "Practice partners do not read chat", which reveals who the other player is | 02, 11 | minor (app) |
| 8 | The replay names the agent "Agent 1"; live it is "Simple" | 09 | minor (app/server) |

## Re-checks of round 9

Replay events ✓ (09). Rotation ✓ (07, 08). Signed-out page and device page styling: not reached this round. Three games at once: 0 timeouts on a fresh store.
