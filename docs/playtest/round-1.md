# Playtest round 1 (2026-11-14, develop at 3adb810)

Independent hand playtest of engine v2 in a real browser (Playwright, pre-installed Chromium), local backend
(`pnpm --filter @workspace/engine dev` + `deploy-static`). Players: alice (desktop 1440×900), bob (phone 390×844),
carol (desktop), admin (desktop, for the assistant). Screenshots: `docs/screenshots/playtest/round-1/`.

**Build/start:** `pnpm install --frozen-lockfile` 4 s; `dev` reached READY (built the Python bundle itself);
`deploy-static` 20 s. Nothing failed.

**Can a game be played start to finish?** Practice game: **yes** (desktop and phone). Bidding: **yes** (bid, deal,
play, handicap applied at the end). Two humans + one practice partner: **yes**, chat works both ways live.
Embedded assistant: **no** for a normal player (admin-only; locally a mock even for admin).

| # | Step | Verdict | Evidence | Severity |
|---|---|---|---|---|
| 1 | Sign in → home → Create room → "Play a practice game" | worked: seated and in planning in ~5 s | — | — |
| 2 | Goal card (Prime Landing): sentence, worked example, ladder per part | worked, mostly clear. Confusing: the example says "1.61 bits **step 10 of 20**" beside "Main part **step 2 of 4**", "Tie-breaker **step 3 of 4**" (two different step counts for the same thing); "Next step: **Add -1 to the step**" is not English for a player | 01 | minor |
| 3 | Switch representations, "Compare with" | worked (9 views; "general form · not read by your rule" is a good hint) | 01, 05 | — |
| 4 | Summon my first agent | worked in one press; message explains power share. Header energy showed 600.00 for ~2 s after the summon before dropping. Agent names are cut at 40 characters ("The first non-prime term close to a prim") | 13 (phone) | minor |
| 5 | "Start the world now" | first press turns into "Again to start the world now" (confirm), then silently reverts after ~20 s | — | minor |
| 6 | Watch moves: "What just changed" | own-move lines are excellent (cell change, step, ✨ rarity with reason, points with both wants). But from second 3 the feed is dominated by "Tug-of-war on line N" cards; own moves are rare in it | 03 | — (legible) |
| 7 | Starter's tug-of-war guard | **broken in effect**: the starter says it walks away after 3 take-backs (`contested(offer, 3)`), yet the feed reports "your agent … moved it back and forth 31 times … your agent spent 122.56 ⚡" on one line and the same on most lines all game | 03 | **major** (agents) |
| 8 | Lines pane, expanded face ("One line") | works, but at 1440×900 with 4–5 panes the Lines pane shows one row and the One line pane opens at the bottom of the middle column with the drawing below the fold. Opening it **evicted "What just changed"** ("at most five panes"), the pane a player most needs | 05 | **major** (app) |
| 9 | Dock with 5–6 panes | the layout switches to full-width rows ~140 px tall: every pane clipped (chat, assistant input, One line drawing, leaderboard axis). The end-of-game "How the game went" pane arrived as a 6th row with "Watch the replay" half cut off. The row layout carries into the next game's planning (code box squeezed) | 06, 07, 10 | **major** (app) |
| 10 | My agents pane | shows name, language, share, Destroy only: no agent energy, acts, spend, skips or failures, so "is my agent working?" has no answer there | 04 | **major** (app) |
| 11 | Edit the agent ("Try this: remove the tilt line") → Check → Replace → comparison → Put back | all worked; Check in ~3 s. Check text is garbled: "Summoning it costs 251.6 ⚡. Summoning it costs 251.59 ⚡. On sample lines it chose not to move, made a move." | 05 | minor |
| 12 | Command palette, operations with no argument (Explain my rule, Read the chat, Draft a pitch confirm) | worked | — | — |
| 13 | Command palette, **any operation that asks for text** (Send a chat message, Ask the assistant) | **broken**: after typing the text the palette says "Press ↵ to continue" and Enter does nothing; tried several times, also after waiting. The field is labelled "text" | 09 | **major** (app) |
| 14 | Palette search | "secret goal" and "public chat" (the panes' own titles) find nothing; "goal"/"chat" do. In a game the palette does not take a room code | — | minor |
| 15 | Chat pane | worked; two browsers see each other's messages within ~2 s | 14 | — |
| 16 | Embedded assistant as a normal player | **blocked**: "AI is only available in rooms run by an administrator for now", while the palette lists "Ask the assistant" first under *Suggested* and offers "Draft a cooperation pitch" (which then fails with the same line). The room says two contradictory things (ux 1.2) | 10 | **major** (app/server) |
| 17 | Assistant as admin (local mock) | first question answered by the mock with one tool call ("Show the game"); the next three sends cleared the box and nothing appeared, even after "Send the held messages". Could not test three real operations | 15 | major? (unconfirmed: mock) |
| 18 | Natural end, results, rotation totals | worked: "You finished 2nd of 3 with 3,601.87 points", "Game 1 of 3 in this rotation… Totals so far", chart with the rise-and-fall caption. No "why" (best line) under the headline (ux 2.9). After the bidding game the rotation line is missing | 08, 13 | minor |
| 19 | Replay | worked: "Getting the replay ready" ~3 s, play at 8×, "Watch as" another player shows their rule. Replay tug-of-war cards say "another player's agent … Talk to them in chat" where the live ones named the practice partners; chat is not filtered to the playhead | — | minor |
| 20 | Bidding room: bid phase | worked: secret bids, 5/10/20/40 % chips, take back, 45 s clock; the Start confirm still says "Deal rules and start planning". No explicit Pass button | 11 | minor |
| 21 | Bidding: what did I win? | **missing during the game**: nothing in the game says the player won Treasure by bid or that 10 % will come off; palette "Show the auction's result" fails: "not done … the app shows this live in its pane" and no pane opens. Only the results say "(after your bid's 10% handicap)" | 10 | **major** (app) |
| 22 | Phone 390 px | stacked panes, tab bar, header total all fine. The growth-pattern compact face scrolls so y(0) ("start", the term the Prime Staircase rule is about) is cut off on the left of every row | 12 | **major** (app) |
| 23 | Two humans negotiating | chat fine. Both humans were dealt "Same on Both Rulers, T = 6" (different tie-breakers): natural allies, but nothing shows it; "What others care about" is one anonymous scatter, so who is a rival and who an ally is guesswork | 14 | minor (design question) |
| 24 | Remote assistant connection | `/api/device/request` → `/device` page (clear: code, room, permission, expiry) → Approve → poll gives the credential → token → `/mcp` lists 31 tools and `room_get` answers → Revoke in Connected apps → next call 401. All worked. But `pnpm player connect` (PILOT.md) no longer exists, and the Connected apps sheet says "Connect one with 'Connect a player app…' in the menu", which is not in the menu | — | minor |

Not defects (known): agents of different players pulling the same line back and forth; it is legible ("Tug-of-war on
line 5 … neither of you is getting anywhere"). Balance: an admin with **no agent** was 2nd of 3 with 1,768 points at
0:30 (ux 7.1, open problem).

## Could a 12-year-old…

- **tell what to do next?** Yes in planning (one red button, "You don't need to change anything"). During the game the
  next step disappears once the dock fills.
- **say why their score moved?** Yes from an own-move line in What just changed; no once that pane is evicted.
- **say what their rule wants?** Yes (card sentence + worked example), except the two "step N of M" counts.
- **say who they fight / who is an ally?** Fights: yes (tug-of-war cards name them). Allies: no.

Could not test: real assistant operations (local deployment uses `AI_MOCK=1`); the `pnpm player` CLI (removed).
