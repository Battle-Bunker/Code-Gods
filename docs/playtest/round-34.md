# Playtest round 34 (2026-11-16, develop at 5915b20b): the first full new-player pass

This is the first round in the coordinator's new format: everything a new player does, not only dynamics. It ran on a
fresh local deployment, app build b81ff6d6, at **time scale 1**, with three accounts:
- alice at 1440, the room owner;
- carol at 1440;
- bob at **390** (phone).

They played two games:
- **Room 5H3DP3**, three people, no practice partners: Lines · beginner, a pause, a rematch, then End the game.
- **Room SMXW57**, carol's practice game of Grids · beginner, run **alone** to time the ticks.

Develop moved 65 merges past 5915b20b during the pass (now fb08b278). Items already changed there are marked.
Screenshots: `docs/screenshots/playtest/round-34/`.

## Broken, misleading or unfinished (most serious first)

| # | What | Where | Owner | Shot |
|---|---|---|---|---|
| 1 | **Chat is invisible during a game with other people.** No pane on alice's desktop layout or bob's phone tabs shows chat. There is no unread mark and no toast. Carol wrote *"Alice: leave line 3 alone and I'll leave your line 1?"* at 11:51; nothing on alice's or bob's screens changed. The only way in is the command palette ("Open Public chat"). Yet the game itself sends players to chat: the tug note says *"Talk to them in chat about this line"* (08), and the end advice says *"Tell them in chat which way you are climbing"* (07). This is a negotiation game, and deals cannot start if no one sees the offer | game page, desktop and phone | app (W5) | 05, 06 |
| 2 | **Leapfrog (Grids · beginner) reaches its top in ten minutes.** Its main part reads *"each number and the number two cells along should be one apart … the closer, the better"*. Grids 1 and 3 ended **"one apart · exactly"** (19.22 and 15.63 bits). So the main part has a ceiling, against design principle 1, and an optimum was found and held | grids end page | rules lead | 11, 12 |
| 3 | **Rematch leaves players behind.** The owner pressed "Rematch: the same deal". Bob (phone) and carol were on game 1's end page and got no sign that game 2 had started; its 60 s planning ran down without them. Only the room page says *"You're playing in game 2. Open game 2"*, and they had to go there by hand | phone and desktop end page | app (W5) | 10 |
| 4 | **Growth-pattern cards drop y(0).** Prime Staircase's rule starts at y(0), and the One line view draws it as "start" (Line 2: **24**, then 22, 20, 18, 16). The Lines list and "What earned your points" cards show 22, 20, 18, 16 labelled "term 1 … term 4", with no start. The card's own text then says "then a term 1 from such a prime" about the 24 it does not show. Line 1's card sometimes shows its start and sometimes not | Lines list, end page | app / views (W5) | 04, 07 |
| 5 | **Prime Gradient's Why line prints a number that is not the gradient.** Line 2 at y = −6x + 23 reads *"gradient −6 · 5 above −11, a prime ending in 1"* and then *"The gradient rounding to as big a prime as possible: −4½"*. Line 3 at gradient −8 says *"−2½"*. A player reads −4½ as the gradient | carol's Lines list | views (W5) / rules lead | 05 |
| 6 | **Feed entries do not name the line.** *"Your agent Simple changed a line: y = −2x + 24 → y = −2x + 23 …"*. With five lines, two of them sometimes on the same gradient, I could not tell which line had moved without matching equations by hand | What just changed | app (W5) | 03 |
| 7 | **"Tie-breaker:" on the card despite #887.** The goal card said "Tie-breaker:" and the line badges "◆ tie-breaker", while the agent code said "Secondary preference". **Changed on develop since (#910)**; re-check next pass | goal card | — | 02 |

Seen in text only, with no screenshot, so not ranked:
- Check repeats itself for an agent already summoned: *"Summoning it costs 38.9 energy. Summoning it costs 38.88 energy."*
- The palette's "End the game" did nothing visible during planning (the confirm dialog never appeared). Once the world ran, it worked.

## What works

| Step | Verdict | Shot |
|---|---|---|
| Landing page, signed out | Clear: "A first game lasts 10 minutes, with a countdown"; one Sign in. Locally Sign in goes to Google with the placeholder client (expected; not tested on dev, which the owner may be using tonight) | 01 |
| Lobby, Join with a code, room settings | Work. A lower-case code joined (5h3dp3). The room lists 8 setups and every setting has its explanation | — |
| Room chat | Works on desktop and phone, with timestamps | — |
| Start game | Confirm dialog "Start the game? Deal rules and start planning" | — |
| Summon, then edit an agent | Summon cost 38.88 energy. Editing the code (FAR 2 → 3) and pressing Check, then "Replace Simple's code", cost **0.25 energy** ("only what you changed is charged") and made version 1, with "Put the previous version back" | — |
| "Leaves these lines alone" | `3` then Save gives *"Simple leaves line 3 alone. Use it to keep a deal made in chat."* | — |
| What if | Clear. "It would move the line up 1: y = −2x + 25. Your rarity 2.54 → 1.36 bits; your points on it 10.33 → 5.52". It states that the others' bits are assumed unchanged | 03 |
| Feed filters | "Moved by other players", "Line 2" and "Points changed by at least" all filter; an empty result says "No loaded move matches these filters" | — |
| Pause, then its 3-minute resume | Palette "Pause the game" asks for a second ↵ ("Use your one pause"). Every seat shows "Paused by Alice Liddell · resumes in 2:58", the phone included. It resumed on its own after about 3:00, with the clock kept (9:26 left) | 03, 09 |
| Phone panes | All seven open and read cleanly at 390 (goal, Where am I, What just changed, Agent code, My agents, Leaderboard, Lines) | 09 |
| End page | Contested lines, "What earned your points" and advice drawn from the game ("line 2 … changed hands 72 times") | 07 |
| Replay | Loads; play at 16×; scrub; "Watch as" each player; copy a link; Download. Tug notes and a TUG-OF-WAR badge on Line 1 | 08 |
| Rematch | "Past games" in the room offers "Rematch: the same deal" with a confirm; the same rules were dealt | — |
| End the game | Works while running, with a confirm | — |
| Grids · beginner | Grid pictures with struck-through leaps are readable; points 1,569 for the human | 11, 12 |

## Ticks (one game alone)

| Game | Ticks a minute | Median tick | Longest |
|---|---|---|---|
| SMXW57, grids, **alone** | 34–35 every minute | 0.3 s | 2.0 s once (minute 2), otherwise 0.4 s |
| 5H3DP3, lines, 3 people | 32–33 a minute while running (none while paused) | 0.4–0.5 s | 2.4 s |

0 failed ticks and 0 agent failures. One watchdog was still pending at the dump, after the games ended.

## Dynamics, briefly

- **Lines, 3 people** (Prime Staircase, Prime Gradient, Divisibility Ladder):
  - 2–4 lines changed every minute, and no minute was still.
  - But the gradient converged: **4 of 5 lines sat at gradient −11**, Prime Gradient's 2-digit rung. The tug in the last third was over the intercept, ±1: line 1 visited 3 states in 18 moves, and line 5 6 states in 20.
  - Every line was contested (changed hands 72, 67, 36 and 15 times). Divisibility Ladder is no longer dealt on develop (#904).
- **Grids, alone** (Leapfrog against Crosswise Threes and Two Pair):
  - 1–3 grids changed every minute.
  - **Grid 4 was a two-state cycle**, 26 moves between two boards (Two Pair 13, Leapfrog 13).
  - Carol's own agent made 22 changing moves in the last third and **none raised her points**.
- **Skip rates:**
  - lines: 77–89%;
  - grids: 85–94%.

## Screenshots

| # | Shows |
|---|---|
| 01 | Landing page at 1440 |
| 02 | The running game at 1440 |
| 03 | Paused, with What if |
| 04 | One line against the Lines list |
| 05 | Carol's chat and her Prime Gradient lines |
| 06 | Alice's screen with no chat |
| 07 | Alice's end page |
| 08 | Replay |
| 09 | Phone panes |
| 10 | Bob's phone after the rematch |
| 11 | Grids running |
| 12 | Grids end page, Leapfrog "exactly" |
