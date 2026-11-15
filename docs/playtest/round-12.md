# Playtest round 12 (2026-11-15, develop at 0e44b0eb)

After #648 (noise default), #649/#655 (grid tie-breakers, "Grids · more rules"), #656 (round-11 app items),
#660/#665 (narrow-screen controls), #667/#669 (exact totals live) and the line-rule work (#650, #657, #663,
#671). Develop deploy green (run 539). Fresh local deployment, app build f406db81. Played by hand in Chromium:
- room ZPC7YJ, Lines · beginner (others' sums blurred 8 bits): alice at 1440, bob at 390 and one practice partner. Game 1 had a fixed 5-minute end; game 2 had a hidden end with a 3-minute half-life.
- room 244QB7, Grids · more rules: carol at 1440, at the same time.
- room 46FL64, Grids · beginner with bidding: carol at 1440.

Screenshots: `docs/screenshots/playtest/round-12/`.

## Re-checks

| Item | Verdict | Evidence |
|---|---|---|
| Live totals vs the final count (round 10 #1, round 11 #1) | **Fixed by design**: the header total and the standings are exact while live ("You: 0.00 points", no "about"). Only each line's others' bits stay blurred ("others' about 7.46 bits"). The end note says so: "During the game, how much the others wanted each line was blurred to keep their rules secret; the totals were exact throughout". No chart drops at the end any more | 03, 07 |
| Hidden-end timer (round 11 #4) | ✓ "GAME ENDS **any moment** at a hidden time: 9 times in 10 within the next 12:58" | 06 |
| Trial setup name (round 11 #5) | ✓ "Lines · more ways to move (trial): Fraction lines, 11 kinds of rule" | — |
| Fractions | ✓ everywhere on lines: "y = 1⅔x − ⅕", "1⁵⁄₂₈x − ¹⁄₁₄", "area 3¹¹⁄₁₃" on the phone. Prime Gradient's main part no longer hits "exactly" at once ("gradient 1⅔ · off by ⅓") | 05, 06 |
| Results, three games at once | load for everyone; 0 timeouts or uncaught errors in the engine log | 03, 07 |
| Grid bidding | cards "Mirrormancer scores up to 26.00 bits ( 1 in 67 million by chance)"; bid 10 % → "won Mirrormancer in the bid: 10% comes off your total" | — |
| Grids · more rules | deals ("Staircase"); starters climb (110 moves, +867 points in 40 s); carol 2nd with 935.17 | 04 |

## Judged as a 12-year-old would

| Item | Verdict | Evidence |
|---|---|---|
| **Exact Change** (new line rule) | "Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to 6". The coin dot-grid worked example helps, but the idea is abstract for a beginner. In play, most lines say **"not scoring: the line reads as coins only when a and b (in a·x + b·y = N) are both positive"**. Alice sat at **0.00 points** after 40 s and 328 moves, peaked at 33.28, and finished **3rd with 9.86** against 266.43 and 258.62 (**27× behind**). Her Results page had only the chart and standings, with no "Try next game" and no "What earned your points" | 01, 02, 03 |
| "about" on each line's others' bits | clear, with the line under Lines explaining it | 02 |
| Mixed exact and decimal | "gradient ≈ 3.07 · off by ≈ 0.07" next to "3¹¹⁄₁₆₂x"; a long fraction pushes the equation past the card's left edge ("/ = 3¹¹⁄₁₆₂x …") | 07 |
| Bidding cards | "scores up to 26.00 bits" sits oddly with "no maxima" (owner decision 26); a stray space in "( 1 in" | — |
| Room settings | a new "Free: everyone sees every change / Paid: you see what you last looked at" setting (left Free); the noise default in a new room is "Blurred by about 8 bits" | — |

## Dynamics (metastable-ecosystem instruction)

| Question | What round 12 showed | Evidence |
|---|---|---|
| Did objects keep moving to the end? | **Yes.** Lines: tug-of-war from the start ("line 1 … 69 times from 4:59 to 4:36"; game 2's lines 1–4 at 14–50 moves). Grids: "grid 4 … 82 times", "grid 1 … 81 times" in the first 40 s. Scores rose and fell all game | 02, 04, 07 |
| Did the board converge or freeze? | No freeze. Fractions now persist in play. Staircase ("the bigger, the better") gives an open hill | 04, 06 |
| Did one strategy dominate? | No. But **one dealt rule (Exact Change) barely scores for the starter**, so its holder is out of the game from the deal. That is the opposite failure: no hill at all | 03 |
| Best state and sit? | Not seen | — |

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Exact Change does not score on most lines (only when both coins are positive), and the Simple starter does not reach scoring lines. Its holder finished with 9.86 against 266 and 259, and the end summary had nothing to suggest | 02, 03 | **major** (rules / agents: a beginner deal with no hill) |
| 2 | Long fractions push a line's equation past the card's left edge; decimal "≈ 3.07" sits next to exact fractions | 07 | minor (app) |
| 3 | Bidding cards say "scores up to N bits" (decision 26: no maxima); stray space in "( 1 in" | — | minor (app/rules) |
| 4 | A new room defaults to "Blurred by about 8 bits" although presets were set to exact (#648); confirm which is intended | — | question (server) |

Not covered this round: rotation totals (round 10 ✓), remote assistants (round 11 ✓), and the narrow-screen view selectors on "Grids · more rules" at 390 (#660/#665; bob was in the lines room).
