# Playtest round 3 (2026-11-14, develop at c53839a2)

After #467–#483 (starters keep contested lines and leave a note, edit price, palette minors #470, grid preset
"Grids · beginner", no-steps part 1). Hand play in Chromium, local backend: alice 1440×900 (Lines · beginner,
practice), carol 1440×900 (**Grids · beginner**, practice), bob 390×844 (Lines · beginner, practice).
Screenshots: `docs/screenshots/playtest/round-3/`.

**Build/start:** clean. **Start to finish:** lines practice **yes** (desktop and phone), grid practice **yes**.
Not repeated: two humans (chat path unchanged since round 1), remote connection (unchanged), bidding (re-tested in
round 2). The UI still shows "step N of M": the app side of decision 23 has not landed, so values were not checked.

## Re-tests

| Item | Now | Evidence |
|---|---|---|
| Starter's note on a tug-of-war (W2) | **works**: the feed shows "Your agent says: Tug-of-war on line 22: another player keeps pulling it back. Make a deal with them? (said 5 times)" under the agent's move | — |
| Edit the agent to skip that line → the fight stops (W2) | **works, but only for a coder**: I added `if (String(offer.object) === "19") return null;` and pressed Replace ("now runs your new code… the price came from your own energy"). After the edit at ~2:15 no further tug-of-war card for line 19 appeared (the others continued to 2:29). Nothing in the starter or the note says how to leave a line (no constant such as `LEAVE = []`, no "Try this:" for it), so a 12-year-old cannot act on "Make a deal". The replace price was not shown anywhere (own store was full, so the header did not move) | 04 |
| Palette minors (#470) | not re-checked in detail this round; the palette had no assistant operations in these rooms | — |
| Dock at 1440×900 | still open (claude/v2-dock not merged): opening a grid again evicted "What just changed" | 03 |
| Phone growth face y(0) | not re-tested (no growth rule dealt on the phone) | — |

## New this round

| # | Step | Verdict | Evidence | Severity |
|---|---|---|---|---|
| 1 | Grid game, Lines pane compact face | **broken**: every row's thumbnail is a pile of overlapping annotation captions ("how far the top-left box is from two different pairs…") over a clipped board; the grid itself cannot be read in the list | 02 | **major** (app / views) |
| 2 | Grid game wording | the game noun is still "line" everywhere: pane titles "Lines" and "One line", "it moves lines towards your goal", "Your rule scores a line", "Another player's agent changed a line: 0 1 2 2 / 3 1 4 5 / …", "Points on this line" (ux 2.8: use the game's own noun) | 01, 02, 03 | **major** (app) |
| 3 | Grid game, first summon | the starter costs 511.07 ⚡ of 600, leaving 88.93 ⚡: the god's store can no longer pay for any starter after the first summon (ux 1.5) | 01 | major (agents / economy) |
| 4 | Grid planning | the setup card reads "grid-4-d10, 8 kinds of rule" (an internal id); the corner-box view draws small unexplained "0" circles between cells; the worked example is an all-zero board | 01 | minor |
| 5 | Totals between games | final totals differ about eightfold by deal: alice 2,585 (Divisibility Ladder), carol 8,413 (Two Pair, 3rd of 3), bob 19,441 (Prime Gradient, 2nd of 3; partner 2 had 5,928). Rotation sums these, so one lucky deal dominates a rotation | 05 | minor (rules / valuation; balance) |
| 6 | "1 in N by chance" in grid move lines | checked by hand: 3.70 bits → 1 in 13, 5.85 → 1 in 58, 9.03 → 1 in 525: consistent (N = 2^bits) | — | — |
