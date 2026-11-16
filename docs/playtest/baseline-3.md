# Baseline 3 (2026-11-16, 01:46 UTC): re-checks, and the old app's chat, pause, What if and object view

Both apps ran on local engines again, after the container restarted:
- old: `archive/engine-v1` (1018e913), Annotated basics, dealt **Spread of Three**;
- new: develop **5a800b5a**, build 026cca4e, Grids · beginner, dealt **Crosswise Threes**, at 1440 (alice) and 390
  (bob).

Screenshots are in `docs/screenshots/playtest/baseline-3/`.

## Re-checks of baselines 1 and 2

| Item | Now | Shot |
|---|---|---|
| Baseline 1 #3: planning hides your points | **Fixed.** Planning reads "Your points now 14.03 points · 3rd of 3" and explains when totals are counted | — |
| Baseline 1 #6: My agents tells less | **Fixed.** It now shows "full in 231 s", "can act now", "Spent 20.38 energy on 17 moves: 2.97 reading, 17.41 changing", the actual average per move, the last move's cost, and **Give Simple more power** / **Take half back** | 01 |
| Baseline 2 #4: unit ↔ board link | **Partly.** Fold pairs are joined by lines on the board, with a small badge per cell; one note per pair under the board ("row 1, column 3 minus the cell it folds onto (row 2, column 4): ● 0 apart"). There is still no ring-and-arrow from a note to its pair (the harness can only click, not hover) | 01, 02 |
| Baseline 2 #1: selecting the secondary changes the marks (#956) | **Not confirmed.** On Crosswise Threes the marks I saw after selecting the secondary looked like the main part's (fold lines and badges). I could not find the "selected: only its marks" banner in the pane's text afterwards. Re-check on a board whose secondary marks differ visibly | — |
| Baseline 2 #2: legend for the circled numbers (#982) | Not seen on Crosswise Threes, which has no circled box totals. The per-cell badges (−1, 1, −3, 2) have no legend either | 02 |
| Phone annotations | **Work at 390**: the same fold lines, badges and notes as on desktop | 02 |

## The old app's chat, pause, What if and object view, beside the new

| Feature | Old | New | Verdict |
|---|---|---|---|
| Chat | Not on screen by default; "Say publicly…" in the palette or "Add panel: Public chat" | Not on screen by default; "Send a chat message" or "Open Public chat" in the palette | **Same.** Neither shows chat or an unread mark during a game (round 34, item 1 is shared, not a regression) |
| Pause | "Use my one pause…" in the palette, plus "Wake the game" | "Pause the game", with a second ↵ to confirm, and the 3-minute resume (round 34) | Parity. "Wake the game" has no new counterpart |
| What if | None for the player: no preview of a change | What if previews a change's rarity and points without making it | **New does more** |
| Object view | Clicking "show this grid" in a feed line opens "Why this grid gives you 127.5 points", starting with *"Opened from:"* that move. It shows the rule score (4, −9), *"1 in 749 … rarer than 998 of 1,000 grids"*, your rarity, the others' rarity added up, how much they want it (never below 0), and `9.548 × 13.358 = 127.5`. "ask my assistant" sits beside it | One grid shows the board in your rule's view with marks, a ruler per part, and "your bits × others' bits ≈ points". The feed entries name the grid ("changed grid 3") | The new view lacks the old "1 in N … rarer than X of 1,000" sentence, the "Opened from:" link back to the move, and the assistant (baseline 1 #5). Pair 01 |

## New faults found this pass

| # | What | Owner | Shot |
|---|---|---|---|
| 1 | **The Grids list cards wrap their main-part line one word to a line** ("main / part: / folded / cells / three / apart · / off by 8"), at 1440. The text column beside the grid picture is a few characters wide | W5 (bug-fix) | 01 |
| 2 | **Notes and badges disagree on sign.** The badge on row 1, column 1 shows **−1**, and its note says "● 1 apart". The badges carry a sign and the notes do not, with no legend for either | annotations | 02 |
