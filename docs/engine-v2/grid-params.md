# Parameterised grid families (owner decisions 39–42): first design and measurements

Analysis only: nothing here is dealt. The grids session's first pass at parameterising the grid families (owner
decisions 40, 41) and measuring them by the spec lead's PMI method (decision 39). The measurement scripts were scratch
code, kept out of the repository; the families that are built land in lib/v2-grid with their own tests. The current 15
mains were reproduced up to a constant offset on 3,000 boards.

**Status (15 November).** The coordinator approved building, undealt until gated: Magic Accountant as the residue
family, a parameterised Spread, Number Lines, and Opposite Nines and Magic Eighteen with their current main as one
value. Cards carry at most four numbers, one shared relation then the list (the spec lead), and each family is banded
on reach in play, not on its exact top (decision 42). §2's per-unit design is superseded by that; the second pass
reports here before anything is dealt. Opposite Nines × Staircase is blocked at the table meanwhile (§3; lib/v2-grid
seating.ts).

## 1. Why one relation per family cannot be equal-opportunity

Tops move in coarse steps. Within 0.5 bits of each current main the only peers are symmetric variants (Magic Eighteen
5, Strangers 1, Spread 2, Uphill 8, Staircase 4). Uphill's four corners and Staircase's four directions are exactly
equal under π: the peers audit's corner spread was sampling noise. Residues are nearly flat in r (rows mod 5:
9.22–9.35 bits), but with only 4 units their tops are low (about log2 q per unit).

## 2. The design: a relation per unit group

Each unit group (row, column, box, fold row) is dealt its own relation; a parameter set is kept when the summed top
(exact: disjoint units, independent cells) is within B ± 0.25 bits.

| Family: parameters | B | in band |
|---|---|---|
| Mirrormancer: row/column/half-turn mirror × per line gap 0–4 or "same remainder mod q" (3–9) | 19.6 | 4,872 |
| Magic Eighteen: 5 partitions × per unit total T 0–36 | 26.1 | 126,555 |
| Opposite Nines: 7 pairings × per group sum T or sum ≡ r mod q (3–10) | 37.0 | 1,953,322 |
| Two Pair: 5 partitions × per unit pattern (two pairs, k apart, three of a kind + one, run, even/odd pairs) | 15.6 | 385 |
| Spread: per row of three-in-a-rows or per band of 2×2 squares | 16.0 | 516 |
| Strangers: box/row/column edges × per unit relation (strangers ≥1/2/3 apart, friends, sum prime, difference prime, sum mod q) | 37.3 | 1,173 |
| Leapfrog: rows or columns × per line gap or difference mod q | 15.6 | 90,440 |
| Crosswise: 2 folds × per fold-row gap, sum T or sum mod q | 17.8 | 46,720 |
| Kings: 5 partitions × per unit "king = subjects + k" (−3…3) or "≡ mod q" | 11.8 | 21,175 |
| Uphill: corner × rise kind along rows and columns | 45.5 | 12 |
| Staircase: per line step (±1, ±1 wrapping 9→0, ±2, +3/+7 last digit, double) | 38.0 | 160 |
| Magic Accountant as the residue family: rows and columns, q 6–8, a remainder per line | 20.0 | ≈269k (estimated) |
| NEW Number Lines: each line read as a 4-digit number, closest to a prime, square, semiprime, twin prime, or 1 more than a multiple of 7/11/13/17 | 12.0 | 3,100 |
| Stepping Stones / Mountain Climb / Fillomino (empirical) | – | 1 / 13 / 1 |

About 2.5 million distinct mains. Card examples (the template's wording needs a copy-edit):

- "Each row should add up to its own number: 1 → 3, 2 → 26, 3 → 16, 4 → 2."
- "Divide each row's and each column's total by 7: the rows should leave 6, 6, 1, 2 and the columns 0, 6, 4, 5."
- "Every cell and its mirror across the middle of its row should add up to: row 1 → 16, row 2 → 1, row 3 → 5,
  row 4 → 1 more than a multiple of 6."
- "Read each column top to bottom as a number (0 3 1 7 is 317): column 1 as close as possible to two primes
  multiplied together, column 2 to a multiple of 7 …"

## 3. Measurements

PMI by the spec lead's method: 2 million π boards, depths 4–12, a depth read when the joint upper set holds at least
30 draws, headline the depth average. 300 random new pairs against all 105 pairs of the current dealt mains.

| | depth-averaged PMI p10 / median / p90 | mean \|PMI\| | independent / mild / aligned / anti-aligned |
|---|---|---|---|
| new | −0.93 / −0.05 / 0.77 | 0.58 | 82 / 14 / 2 / 2 % |
| current | −2.62 / 0.05 / 3.00 | 1.57 | 49 / 24 / 13 / 14 % |

Tilted draws (2 million, τ ∈ {1, 0.6, 0.35}, weights ≤ 5) agree: new 84/12/2/3 %, current 48/23/14/15 %. Boards worth
≥ 12 bits to both: 4 % of new pairs against 14 % of current pairs.

Joint hardness (simulated annealing, 40 pairs each; bits exact for disjoint-unit rules, else capped at 20.9):

- the worse rule's share of its solo best kept in the joint state: median 0.67 new against 0.81 current;
- states worth ≥ 95 % of both solo bests: 8 of 40 new pairs against 15 of 40 current;
- both ≥ 20 bits: 5 new pairs (of 10 whose solo bests reach 20) against 9 current (of 13);
- a bug under the standing instruction: current Opposite Nines × Staircase reached both exact tops at once
  (37 and 38 bits).

## 4. Current mains that must change

- Magic Accountant: its main is Magic Eighteen's (PMI 8.2). Repurposed as the residue family it is the most
  perpendicular family measured (mean |PMI| 0.09).
- Spread of Three: "every 2×2 square spreads by 3" (13.66 bits) has one peer within 0.5 bits; the parameterised
  Spread needs B = 16 and drops it.
- Stepping Stones and Fillomino: no other parameter comes within 0.5 bits; they stay single-parameter.
- Opposite Nines and Magic Eighteen keep "all 9" / "all 18" but have the highest new-family |PMI| (0.88); a band near
  20 bits would drop the uniform case.
- Tops below 20 bits (Kings 11.8, Number Lines 12, Two Pair and Leapfrog 15.6, Crosswise 17.8) cap a lone player.

## 5. Proposed tied tie-breakers (one per family, parameterised, not measured)

Mirrormancer: mirrored pairs' totals ≡ r mod q. Magic Eighteen: per unit, biggest − smallest = k. Opposite Nines: each
pair's numbers differ by a multiple of q. Two Pair: the pair values add up to a multiple of q. Spread: biggest and
smallest on a dealt diagonal, the ends, or side by side. Strangers: the passing pairs' sums ≡ r mod q. Leapfrog: the
middle number above, between or below its partners (dealt). Crosswise: the fold line's total ≡ r mod q. Kings: each king
≡ r mod q. Stepping Stones: the cells outside the biggest group total ≡ r mod q. Mountain Climb: the climb ends toward a
dealt edge. Uphill: rising steps rise by exactly k. Staircase: stairs climb from numbers ≡ r mod q. Residue family:
line totals' whole quotients by q all equal or all different (dealt). Fillomino: the right-size patches' numbers add
to a multiple of q. Number Lines: the nearest qualifying numbers end in the same digit in base B.

## 6. Caveats

Depth 8+ from π reads only overlapping pairs (biased up); tilted draws rarely read 10–12 for new pairs. 23 of 40 new
and 26 of 40 current annealing pairs include a rule capped at 20.9 bits. No game path costs; no tie-breakers measured.
The residue family's count is an estimate (exact tops of 520 sampled sets). Equal opportunity is matched on the top
share only (score levels per parameter range from 13 to 135).

## 7. Notes

- Per-unit targets make cards of four to eight filled-in numbers. That is decision 41's specificity, but it strains
  "one sentence a 12-year-old reads" and the faces' space; a shared relation with per-unit numbers in a short list
  (the first two examples) reads better than mixed qualifiers per unit (the fourth).
- Joint hardness improves (0.81 → 0.67 kept; 15 → 8 of 40 near-joint-optima) but the median best min(A, B) is unchanged
  (15.7 vs 15.6): the shallower rule's top bounds it, so deeper tops (B ≥ 20) matter as much as perpendicularity.

## 8. Second pass: shared relations, banded on reach in play (decision 42)

Cards carry one relation and at most four numbers; each family is banded on reach in play: a first-improvement
climber of at most 100 moves (±1 on a cell, a swap) from 64 π boards, median bits within ±0.5 across a family's kept
values. Bits are exact for rules over disjoint units (enumeration, transfer matrix or DP), else from 2 million π boards
with the exact top at the best score. Values whose top is a uniform board, and near-duplicates ("sum ≡ 9 mod 10" is
"sum 9"), were dropped.

| family | kept values | top bits | median reach (p90) | card |
|---|---|---|---|---|
| Residue (Magic Accountant) | 19: rows + columns with (q, r) = (8, 1/2/6), (12, 9/10); rows + boxes and columns + boxes with (6, 1/3/5), (10, 1/9), (12, 3/11) | 15.1–25.2 | 14.6–15.6 (to 25) | "Every row's and every column's total should leave 2 when divided by 8." |
| Spread | 10: squares s = 1 or 5; squares + rows (or columns) s = 4; three-in-a-rows along rows or columns s = 2 or 3; squares + three-in-a-rows s = 3 | 14.7–19.2 | 14.6–15.5 | "Every 2×2 square should spread by exactly 5." |
| Number Lines (new) | 20: rows or columns, q = 11 with r = 3–8, q = 13 with r = 1, 7, 8; rows + columns q = 11 with r = 3 or 8 | 14.1–24.6 | 14.1–14.9 | "Read each row as a number (0 3 1 7 is 317): each should be as close as possible to a number that leaves 5 when divided by 11." |
| Opposite Nines | 16: 8 pairings × {add up to 9, add up to at least 11} | 37.0–37.3 | 37.0 (reach = top) | "Every cell and its opposite should add up to 9." |
| Magic Eighteen | 5: rows, columns, corner boxes, slanting lines, same-spot sets, T = 18 | 26.1 | 26.1 (reach = top) | "Every column should add up to 18." |

- Climbers stall after 6–9 moves on the residue family and Number Lines (local optima), which is dynamism.
- No common band: keeping "add up to 9" and "add up to 18" fixes those families at 37 and 26 bits, and a 100-move
  climber reaches their tops every time, so as kept they are solved rules. Opposite Nines has a 22.6–23.6-bit band of
  12 relations ("add up to a multiple of 9", "add up to 2", …) × 8 pairings, without the current main.

**PMI** (the spec lead's method, 2 million π boards, depths 4–12, depth average):

| pairs | median | mean \|PMI\| | independent / mild / aligned / anti-aligned |
|---|---|---|---|
| new × new (300) | 0.03 | 1.42 | 67 / 8 / 9 / 15 % |
| new × the 11 other current mains (220) | −0.12 | 1.14 | 60 / 20 / 6 / 13 % |

Mean |PMI| by family (against new / against current): Number Lines 0.36 / 0.31, residue 0.53 / 0.41, Spread 1.64 / 1.37,
Opposite Nines 2.16 / 1.72, Magic Eighteen 2.59 / 1.84. The kept anchors keep the old cluster: Magic Eighteen with
Opposite Nines is about +7, Spread (s = 1) with Magic Eighteen −7.5.

**Drift** (climb under one value, score under a random other value of the family): share of bits kept, median
(p10–p90): residue 0.05 (0–0.27), Number Lines 0.07 (0–0.30), Spread 0.15 (0.02–0.36), Opposite Nines 0.31 (0.12–0.68),
Magic Eighteen 0.45 (0.23–0.58). In every family 30 recovery moves restore the pre-drift bits: a redraw is a short
re-solve, not a long climb. A family's values align with each other (median within-family PMI 4.4).

**Joint hardness** (annealing, 30 pairs each): new × new, the worse rule keeps a median 0.78 of its solo best, 6 of 30
pairs reach ≥ 95 % of both; new × current 0.81, 12 of 30 (today's pool: 0.81, 15 of 40). 17 of 30 pairs include a rule
capped at 20.9 bits.

**Tied tie-breakers** (each family's first kept value; a lexicographic climb never hurt the main):

| family: tie-breaker | PMI with the main | tie-breaker bits, main-only climb → lexicographic climb |
|---|---|---|
| Residue: the totals divided by q give the same whole number | too coarse to read | 2.1 → 2.1 |
| Spread: biggest and smallest on a diagonal of each square | +0.19 | 0.5 → 2.7 |
| Number Lines: the nearest such numbers end in the same digit | +0.49 | 1.0 → 1.0 |
| Opposite Nines: the pair's numbers differ by a multiple of 3 | −0.45 | 0.7 → 0.7 |
| Magic Eighteen: biggest − smallest is 4 in each unit | −2.0 | 0.5 → 1.8 |

**The optimum found on today's pool (Opposite Nines × Staircase, both exact tops, 37.0 and 38.0 bits)** has a closed
form: every row counts up by 1 and the bottom two rows are the top two's complements to 9 in reverse, so they count up
too (3456 / 6789 / 0123 / 3456). Annealing reached it in 21 of 21 seeds (median about 8,000 steps, 6,436–47,516);
greedy steepest ascent from π boards in 6 of 300 runs (median 36 moves); a first-improvement climber in 17 of 300 with
100 moves. Rare for a greedy player, certain for a searcher. The pair is blocked at the table (lib/v2-grid seating.ts).

Not done: tilted draws in this pass; path prices beyond the move cap; columns versions' reach is taken from the rows
versions by symmetry; uniform-board tops were the only easy routes checked.
