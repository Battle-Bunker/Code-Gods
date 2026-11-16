# Baseline 2 (2026-11-16): annotations, old grids beside new

This is the coordinator's second item: what the old annotation system did on the grid game, and the same on the new
one. It uses the same setup as baseline 1 (`docs/playtest/baseline-1.md`):
- old: `archive/engine-v1`, Annotated basics, dealt Magic Eighteen;
- new: develop 5f3ff8f2, Grids · beginner, dealt Two Pair.

Both were read after the game had ended, at 1440. The pair (old left, new right) is
`docs/screenshots/playtest/baseline-2/01-annotations-focus.png`. New lines were covered in round 34
(`docs/playtest/round-34.md`, shots 04 and 07).

## What the old annotation system did (grids)

- **One card per scoring unit, tied to the board.** The goal pane's example lists every scoring unit as a card, for
  example *"column 2 makes 18 (+1, 0)"*. Each card shows:
  - the unit's own cells as chips (5 6 2 5);
  - the primary contribution with its arithmetic: *"primary rule score +1 ✓ 5 + 6 + 2 + 5 = 18"*;
  - the secondary contribution: *"secondary rule score 0 ✓ exactly 18"*.
- **Point at a unit, in the list or on the board.** That column is ringed on the board, the other cells are greyed out,
  and a curved arrow joins the ring to its card. The header says what pointing does: *"This board's rule score is
  (3, −6). Point at a scoring unit, in the list or on the board, to see how it counts."*
- **The rule score as a tuple with names:** *"(3, −6) — primary: lines adding up to 18, 3 · secondary: how far the
  totals are from 18, −6"*, with a link to "how a rule score with parts compares".
- **"why?" on every grid** opens the score in steps:
  - *"🌟 1 in 7,500 ✨ 12.9 — Only 1 random grid in 7,500 does this well. That is rarer than 999 of 1,000 grids."*;
  - your rarity, the others' rarity added up, and how much the others want it (never below 0);
  - `points 12.878 × 40.788 = 525.3`;
  - "Opened from:" the move that sent you there.

## What the new one does (grids)

- The worked example and "Grid 2: why it scores" draw the main view, "board cut into four corner boxes", with dashed
  box outlines, a circled number in each box, and one sentence per box: *"how far the top-right box is from two
  different pairs 0•"*.
- Each part has a card with a ruler:
  - Main part: "exactly", on a 0–4 ruler;
  - Secondary preference: 4, on a 0–17 ruler.
- Below them: *"The main part counts first; each preference after it decides only between grids that are equally good on
  everything before it."*
- "Tap a part to see only its marks" filters the marks; "point at a number to find it in every view"; there are other
  views to choose and compare.

## Differences and UX faults (most serious first)

| # | What | Owner |
|---|---|---|
| 1 | **Selecting a part does not change the marks.** With *"secondary preference selected: only its marks are drawn"*, the board still shows the same circled numbers (14, 10, 6, 2) and box outlines as before. Nothing marks the pairs sitting on a diagonal, which is what the secondary counts | annotations |
| 2 | **The circled numbers are box totals that Two Pair does not use.** 14 = 4 + 3 + 3 + 4. No legend says what they are, and a player reads them as part of the score | annotations |
| 3 | **No arithmetic per unit.** The old card proved its unit (*"✓ 5 + 6 + 2 + 5 = 18"*). The new sentence gives only the distance (*"off by 1"*) and never says which cells make the pairs or which one breaks them | annotations |
| 4 | **No link between a unit and its place on the board.** The old app ringed the unit and drew an arrow to its card. The new per-box sentences sit under the board with no highlight on pointing (checked by click only; the harness cannot hover) | annotations |
| 5 | **The secondary's ruler runs to 17 while its top is 4.** There are four boxes, so 4 is the most possible. The 0–17 ruler suggests room to climb that does not exist | annotations / rules |
| 6 | **Rules: Two Pair reaches the top of both parts.** Grid 2 ended at 4332/3423/2110/1201: the main part "exactly" (off by 0) and the secondary at 4 of 4 boxes. That is a complete optimum, found within 10 minutes (21.97 bits). Grid 5 also ended "exactly". This is the same class of bug as Leapfrog in round 34 | rules lead, grids |

New lines (round 34):
- the growth-pattern view marks the start with ● and draws the run, and the One line view has the same rulers per
  part;
- but the Lines list and the end-page cards drop y(0) (round 34, item 4).
