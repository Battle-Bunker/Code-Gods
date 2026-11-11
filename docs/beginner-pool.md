# The beginner pool (Annotated basics)

Status: shipped 2026-11-11. Owner's request: the most basic game is a 4×4 grid of numbers with no colour (the `mono`
palette), dealing about eight annotated rules that are *equally simple to understand and to write an algorithm for*.
The measuring stick is the rule-difficulty framework (docs/rule-difficulty.md).

Code: `BEGINNER_POOL` in `lib/game-core/src/settings.ts` (the default setup, `grid-annotated-basics`, deals exactly
these on `Grid(4,base10,mono)`); the new families live in `lib/game-utilities/src/families/grid/beginner/`, each with a
lens in `src/explain/lenses/` and a Python reference in `lib/grid-lab/gridlab/rules/beginner/`.

## 1. The eight

| Rule | Units on 4×4 | Score | Top |
|---|---|---|---|
| 🪞 Mirrormancer (existing) | 4 lines (rows or columns) | (#lines that read the same both ways, #matching pairs) | (4, 8) |
| 🎩 Magic Eighteen | 4 lines (rows or columns) | (#lines adding up to 18, −Σ\|total − 18\|) | (4, 0) |
| 🙃 Opposite Nines | 8 half-turn pairs | (#pairs adding up to 9, −Σ\|a + b − 9\|) | (8, 0) |
| ✌️ Two Pair | 4 corner 2×2 boxes | (#boxes holding two different pairs, #boxes with one pair or three of a kind) | (4, 0) |
| 📏 Spread of Three | 9 overlapping 2×2 squares | (#squares whose biggest − smallest = 3, −Σ\|spread − 3\|) | (9, 0) |
| 👋 Strangers | 16 touching pairs inside the corner boxes | (#pairs both > 1, no common divisor, at least 2 apart; #1s beside a bigger number) | (16, 0) |
| 🐸 Leapfrog | 8 pairs two cells apart in a row | #pairs exactly one apart | 8 |
| ↙️ Crosswise Threes | 6 pairs across the top-right/bottom-left diagonal | (#pairs exactly 3 apart, −Σ\|\|a − b\| − 3\|) | (6, 0) |

Magic Eighteen is magic_accountant's exact scoring with the target fixed at the middle sum N·(S−1)/2 (18 on 4×4
digits). magic_accountant keeps its own params, support and calibration keys for the other setups; the sibling exists
because only targets 18 avoid flat contradictions with the rest of the pool and setups cannot restrict a family's
params.

The coloured annotated set is kept as its own setup, **Annotated colours** (`grid-annotated-colours`, Grid(4,base10,rgb),
every family with a lens).

## 2. How it was chosen

Brainstorms proposed eight; measurement replaced three and tuned two (2026-11-11):

- **stepping_stones** (biggest group of hops of 2) dropped: flat parity contradictions with Opposite Nines and the
  fold rule (a pair adding to 9 or differing by 1 mixes parities; a hop-2 group is one parity) and with Mirrormancer
  (four mirrors halve the board), and its bits ran far above the pool. It keeps its new lens in Annotated colours.
- **magic_accountant** → **Magic Eighteen**: odd targets contradict Mirrormancer (a palindrome a b b a has an even sum),
  every target but 18 contradicts Opposite Nines (half-turn sums force row r + row 3−r = 36), and targets 16/20 are
  maximised by an all-same board.
- **Step-Stool Mirror** (fold top onto bottom, one apart) → **Leapfrog**: the fold pairs are Mirrormancer's column pairs
  (equal against one apart: a flat contradiction). The near-miss tier was dropped: with it Leapfrog won 49% of games.
- **Strangers** on all 24 touching pairs conflicted with Mirrormancer (equal middle neighbours); it now counts the 16
  pairs inside the corner boxes and adds "not next-door" (without it, 15 bits, below the band).
- **Crosswise Threes** (eighth rule) instead of Spin-Three or Crosswise Nines, which repeat Opposite Nines' pairs or
  relation.

## 3. Measurements (Grid(4,base10), number moves, every dealt variant)

Framework (`difficulty --moves symbol`, default budget): card bits, top bits, rate4 (bits per move over the first 4
greedy moves), g10, trap, K, DIFF, SYN. Own harness: A = share of random boards with an improving one-cell move (2,000),
B = one-cell greedy stops below the best (500 starts), G = three-player win share over 2,400 seat-rotated games
(greedy / deny).

| Rule | card | top | rate4 | g10 | trap | K | DIFF | SYN | A | B | G greedy / deny |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mirrormancer | 626 | 26.6 | 3.25 | 26.6 | 0 | 1.0 | 0 | 36.5 | 1.00 | 0% | .36 / .16 |
| Magic Eighteen | 427 | 15.6 | 2.99 | 15.6 | 0 | 2.2 | 0 | 53.9 | 1.00 | 0% | .39 / .38 |
| Opposite Nines | 626 | 26.2 | 3.01 | 26.2 | 0 | 1.0 | 0 | 39.3 | 1.00 | 0% | .45 / .43 |
| Crosswise Threes | 745 | 16.9 | 2.79 | 16.9 | 0 | 1.0 | 0 | 28.2 | 1.00 | 0% | .28 / .41 |
| Two Pair | 878 | 20.1 | 2.75 | 20.1 | 0 | 3.0 | 0 | 36.4 | 1.00 | 0% | .32 / .21 |
| Spread of Three | 752 | 23.8 | 3.16 | 23.2 | .02 | 2.3 | 2.5 | 32.3 | 1.00 | 14.8% | .25 / .44 |
| Strangers | 886 | 23.0 | 2.48 | 22.6 | 0 | 1.1 | 0 | 31.1 | 1.00 | 1.2% | .18 / .41 |
| Leapfrog | 423 | 21.0 | 2.00 | 21.0 | 0 | 1.0 | 0 | 36.5 | 1.00 | 0% | .43 / .23 |

Card bits for Crosswise Threes, Strangers and Leapfrog are the shipped cards'; the others were measured on equivalent
ad-hoc card bodies. Every pair of rules, over every pair of dealt variants, has a board at 1.00 of both tops in the
harness's search; the framework's lowest pair ceiling is 0.76 (Magic Eighteen × Mirrormancer), pair SYN 15–67. Only
Mirrormancer has a uniform-board maximum.

Against `SYMMETRIC_POOL` the verdict still fails on marginal or structural lines: card bits over 800 (Two Pair,
Strangers), g10/g20 outside ±25% (Mirrormancer above, Magic Eighteen below: it is done in 4 moves), rate4 max/min 1.62
(1.6), card max/min 2.56 (2.5), per-rule SYN spread 26 (15). Win shares outside 20–47%: Mirrormancer under deny (.16, a
property of the rule) and Strangers under greedy (.18; tried a richer near-miss tier, the plain in-box rule, "at least 3
apart": .18–.20). The balance model's seat order (seats 1/2/3 win .44/.33/.23 under greedy) is separate from the rules
and is averaged out above.

Anchors on the same yardstick: honest_minesweeper (greedy stalls on every board, never reaches 90% of top; K 5.3, DIFF
33, SYN 60) against Mirrormancer (never stalls, K 1.0, DIFF 0, SYN 36.5).
