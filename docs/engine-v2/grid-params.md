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

## 9. Gate on the merged families (#713): fails on balance and on optima

Measured on the repository's own rules (`evaluate()` of the 81 new values and the 45 dealt rules; score order agrees
with `evaluateSite` on 2,000 board pairs per family). Bits as dealt (main, then tie-breaker) from the same 2 million π
boards, with exact main laws or tops where a family splits into independent units; reach is a first-improvement
climber, ≤ 100 moves (±1, swaps), 64 π starts.

**Balance: the tie-breakers move the band.** Median reach per (value, tie-breaker):

| family | range of medians (family median) | width | values within ±0.5 | p90 range |
|---|---|---|---|---|
| Magic Totals | 11.2–21.7 (16.3) | 10.5 | 14 / 57 | 14.9–27.2 |
| Spread | 14.8–21.6 (17.4) | 6.8 | 6 / 30 | 15.4–31.7 |
| Number Lines | 15.0–24.6 (16.0) | 9.6 | 29 / 60 | 16.5–24.6 |
| Pair Sums | 22.9–30.6 (23.6) | 7.6 | 55 / 96 | 22.9–33.9 |

By tie-breaker (median reach): Magic Totals different-totals 14.7, same-quotient 16.3, small-totals 18.9; Spread
low-floor 16.3, extremes-apart 17.4, all-different 20.5; Number Lines 15.6–16.6; Pair Sums 23.6–25.3. The bands were set
on the main alone; tie-breakers add up to 5 bits, and Pair Sums sits about 7 bits above the rest. Banding must be per
(value, tie-breaker), or only band-keeping tie-breakers dealt.

**PMI** (depth-averaged, depths 4–12): new × new (300 pairs) median −0.11, mean |PMI| 1.12, 63 / 16 / 9 / 12 %
independent / mild / aligned / anti-aligned; new × today's 45 dealt rules (270) median 0.06, mean 1.19, 58 / 24 / 9 / 7 %.
By family: Number Lines 0.55, Magic Totals 0.78, Spread 1.53, Pair Sums 1.72. Extremes: Spread (squares, s 1) × Magic
Eighteen −7.8, Pair Sums × Strangers −7.7, Spread + all-different × Spread of Three +6.9.

**Joint hardness** (annealing, 30 pairs): new × new keeps a median 0.59 of the worse rule's solo best (p10 0.31, p90
0.81), 2 pairs reach ≥ 95 % of both, both main parts at their exact top in 5; new × dealt 0.62, 4 pairs, 0 exact.

**Drift survival** (with tie-breakers): Magic Totals 0.32, Spread 0.17, Number Lines 0.42, Pair Sums 0.27 (median).

**Dynamism** (3 climbers on one board, 600 moves, a redraw every 40): three rules of different new families as dealt
never settle, drift on or off (about 40 of 40 moves per window change the board, about 580 distinct boards, no window
all stuck), but they churn low: 3–6 bits each, the worst player's second-half median 1.6. Mains only, drift off: 7 % of
late windows all stuck, bits to about 7.5. One climber alone freezes at about 20 bits with drift off and keeps about 5
improving moves per window with drift on: drift is what keeps an unopposed rule moving.

**Optima found (bugs).** Both mains at their exact tops in 5 of 30 new × new annealing pairs; all three mains' exact
tops in 2 of the 3-climber tables (mains only), held for up to 9 windows. Mechanism: every new family reads rows,
columns, pairs or totals that a period-2 board keeps (two alternating digits, or a repeated pair of rows), so one row
that satisfies each rule locally extends to the whole board: 0202 / 0202 / 0202 / 0202 meets Number Lines (rows, q 11,
r 4), Spread (row triples, s 2) and Pair Sums (side by side, "add up to 2") at once; 2625 / 2526 / 0744 / 2625 and
6436 / 6346 / 6436 / 6346 likewise. Candidate fix: units a period-2 board breaks (diagonals, or a rule rewarding
different rows). With tie-breakers dealt the tables never reached an optimum, but nobody reached 20 bits either.

## 10. Re-band, the no-repeats guard and the re-gate

- **Guard.** Every main part adds 1 to its distance for each row equal to an earlier row and each column equal to an
  earlier column; each card gains "… and no two rows or two columns may be the same". Boards with a repeated row or
  column can no longer reach a main's top; no such optimum was found again.
- **Re-band** (533 candidate values × 3 tie-breakers, 4 million π boards, 64 climbs per pair): a common band of 17 ± 0.5
  bits for all four families (`PARAM_DEALT` in lib/v2-grid param-families.ts): Magic Totals 121 (value, tie-breaker)
  pairs, Spread 15, Number Lines 46, Pair Sums 79. On a fresh sample the family medians are within 0.8 bits of each
  other (15.9–16.7; it was 7 bits), but a single pair's median does not replicate to ±0.5: climbs either solve the rule
  or stall early, so 64 climbs move a median by ±2 bits. A non-bimodal statistic (the share of climbs reaching 17 bits)
  or about 1,000 climbs per pair would make the band replicable.
- **PMI:** new × new mean |PMI| 0.79, 70 / 20 / 4 / 6 % independent / mild / aligned / anti-aligned (was 1.12, 63 %); new ×
  dealt 0.95, 72 / 17 / 7 / 4 %. Number Lines 0.50, Magic Totals 0.78, Pair Sums 0.87, Spread 1.13.
- **Joint hardness:** the worse rule keeps a median 0.71 (new × new) and 0.66 (new × dealt) of its solo best; 2 and 1 of
  30 pairs reach ≥ 95 % of both.
- **Drift survival:** Magic Totals 0.24, Spread 0.23, Number Lines 0.36, Pair Sums 0.32.
- **Dynamism:** three climbers on one board never settle, drift on or off (about 40 of 40 moves change it, no window all
  stuck), but players churn at 3–5 bits; someone reaches 20 bits in 2 of 30 tables with drift on, 4 with drift off.
- **Optima still found (bugs).** Both mains at their exact tops in 7 of 30 new × new annealing pairs, on boards with
  distinct rows: (1) rotated or reordered copies of a row keep totals, spreads and remainders and pass the exact-repeat
  guard (6757 / 3536 / 7675 / 5363 meets Spread squares + columns s 4 and Magic Totals columns + boxes mod 12 r 9);
  (2) two congruences on the same rows (Magic Totals rows + boxes with Number Lines rows) have a generically non-empty
  joint top that annealing finds, though climbers never did. Next: the guard "no two rows or columns holding the same
  numbers in any order", and banding on a non-bimodal reach statistic.

## 11. Any-order guard, banding on a share of climbs, the re-gate (round 3)

- **Guard.** A row (column) now counts as a repeat when it holds the same numbers as an earlier one in any order; the
  card ends "… and no two rows or two columns may hold the same numbers". It closes the reordering route of §10
  (6757 / 3536 / 7675 / 5363 now scores 5 repeats, 5515 / 1537 / 6262 / 6226 scores 1).
- **Re-band on a share of climbs.** A (value, tie-breaker) pair is dealt when 45–55 % of 256 first-improvement climbs
  (≤ 100 moves, from π boards) reach 17 bits. Unlike the median of §10 it replicates: on a fresh sample the kept pairs'
  shares have median 0.50 (p10–p90 0.41–0.57), the mean difference between samples 0.05 against binomial noise of
  0.04 (Number Lines the noisiest, 0.10). Dealt: Magic Totals 93 values (113 pairs), Spread 12 (15), Number Lines 13
  (15), Pair Sums 24 (38). Median reach 16.4–17.3 bits across the four families.
- **Number Lines never divides by 3, 9, 2, 5 or 10.** A number leaves the same remainder as its digits' total when
  divided by 9 (or 3), so Number Lines with q = 9 is Magic Totals in disguise, and it met Spread's top at once
  (columns mod 9 r 2 with Spread squares + rows s 4: 7365 / 6759 / 3357 / 4748, both main parts at their exact tops):
  the one optimum this gate found, a bug, fixed by dropping q = 9 (13 values). A test forbids any q where 10 leaves 0 or 1.
- **Same-units seating rule: measured, rejected.** Seating apart two main parts that constrain the same kind of unit
  (rows, columns, boxes, squares) made tables *easier*, not harder: with the any-order guard, clashing pairs reached no
  joint optimum (0 of 16) and kept less of their solo best; excluding them raised the worse rule's kept share from 0.60
  to 0.69 and pairs both at 20 bits from 4 to 8. The rule was not kept.
- **PMI:** new × new mean |PMI| 1.20, 63 / 14 / 8 / 15 % independent / mild / aligned / anti-aligned (worse than §10's
  0.79): every kept Spread value is a small spread (1–4) on squares or three-in-a-rows, which favours small digits
  (Spread's mean |PMI| 1.91). New × dealt 1.41, 61 / 16 / 13 / 10 %. Next: band Spread on wider spreads.
- **Joint hardness** (annealing, 30 pairs): the worse rule keeps a median 0.60 (new × new) and 0.66 (new × dealt) of its
  solo best; no pair other than the q = 9 one reached both exact tops.
- **Drift survival** (median share of bits kept after a redraw): Magic Totals 0.14, Spread 0.63, Number Lines 0.28,
  Pair Sums 0.46. Magic Totals' same-tie-breaker neighbourhood is too thin; let its redraw change the tie-breaker.
- **Dynamism** (30 tables, 3 climbers, 600 moves): the board never freezes (40 of 40 moves per window change it, about
  585 distinct boards, no window all stuck), no table reached all three main parts' tops, but opposed players churn at
  3–6 bits: someone reaches 20 bits in 6 of 30 tables with drift on, 4 with drift off (best 24.5).

## 12. Divisibility: the first grid family built to the rule design check

The design check (`design-principles.md`, 15 November) failed every dealt grid family on row 1 (each main part has an
exact top that search finds), most on row 3 (tie-breakers not defined by the main part's attained value) and all on
row 4 (one dealt instance). The prototypes (scratchpad p7–p9, analysis only) tried "as close as possible to a prime,
square, semiprime …" for rows, columns and 8-digit readings, the largest prime among the row numbers, distinct primes,
smoothness, roughness, leading digits of powers and the golden ratio. Every "close to P" form fails row 1: π favours
small digits, so leading-zero rows (0003, 0007) make primes and squares dense, and a whole board of qualifying rows and
columns sits at 17–30 bits where search finds it. A single 8-digit reading divisible by a high power has a formula top
(2²⁶ = 67108864). What passes is the same goal on **overlapping readings**: every cell sits in a row reading and a
column reading, so no formula meets all four at once.

`lib/v2-grid/src/divisibility.ts` (dealt only by the §13 playtest preset). Card: "Read the top half and the bottom half row by row, and the left half
and the right half column by column, each as one number: each should be divisible by as high a power of 3 as possible
(count the 3s that divide it), and no two rows or two columns may hold the same numbers." Tie-breaker: "What is left of
those numbers after dividing out their 3s should have digits adding up to as much as possible." Dealt: powers of 3 and
matching (the two row numbers, and the two column numbers, differing by a high power of 2), each on halves or on
alternate rows and columns. The view focuses the cells of the reading(s) with the highest power; it should also show
each reading and its power (for example "12345678 = 3² × 1371742").

| | Question | Evidence | Verdict |
|---|---|---|---|
| 1 | Unbounded main part? | Powers of 3: bound 64 levels, best found 28–34 (14 annealing runs of 10⁵–10⁶ moves and 8 seeded with known high multiples; at most 2 runs reach the best, the long runs had not converged). Matching: bound ≈ 52, best 28. Writing 3¹⁴ = 04782969 into one half gives 14 from that reading but leaves the other three at random; seeded runs end below annealing. | Pass on halves (operational reading: a long search still improves); alternate layouts not yet searched |
| 2 | Ladder length? | Each level costs about log2 q bits (1.6 for 3, 1 for 2). A starter-like climber (150 tries of ±1 or a swap, 400 climbs, three seeds) passes a median of 4 levels and stops at 9.0–9.1 bits (powers, both layouts), 8.3 (matching, halves), 7.3 (matching, alternate); p90 11–14. | Pass; the four instances span 1.8 bits |
| 3 | Tie-breaker defined by the main part's value? | It reads what is left of each number after dividing out its power. Prototype: it fell at 55–70% of main-part steps, and the best tie-breaker differs at two capped main-part levels (powers 165 vs 64, matching 71 vs 46). Test: swapping two cells lifts one reading from 3² to 3⁴ and changes what is left of it. | Pass |
| 4 | Dealable instances? | 8 (two lenses × two q's × two layouts, §14); a test requires at least 4. | Pass |
| 5 | Perpendicular? | Depth-averaged PMI against the beginner eight's mains within ±0.48; between the four divisibility lenses near 0 (−0.50 at most). Measured on halves only. | Pass on halves; alternate to measure |
| 6 | Opponents? | Roughness ("smallest prime factor as big as possible", PMI −2.47 against powers of 3, the weaker rule keeps 0.38) is the natural opponent but its balance is 2.8 and its reach 13.5 bits; distinct primes (−1.07) fails its own row 1. | Open: no balanced opponent yet |
| 8 | What does it reach? | Starters 7–9 bits median, p90 up to 14; the top (64 levels) would be about 100 bits but is not found; nothing reachable near the hundreds. | Pass |
| 9 | Balanced, keeps moving? | Not measured in seated play: needs value functions and starters, built when the coordinator switches the pool. | Open |

The coordinator's next requirement before the beginner pool changes: at least four distinct goals, not one family with
different q, each with a balanced opponent and a card a 12-year-old can follow. Leading digits (each reading starting
like a power of 2 or 7) passes rows 1–3 at 10.3–10.6 bits but has no opponent; roughness is the opponent of powers but
sits 3 bits above the band. The alternative, uncapped cells with the old lenses made unbounded, is being prototyped for
the owner (p10).

## 13. Grids · arithmetic (playtest preset)

`grids-arithmetic` ("Grids · arithmetic") deals Divisibility (§12) and Leading Digits on 4×4, each family with its one
tie-breaker on the attained number, so the owner can playtest how readable cards about long numbers are. It is a
**readability playtest, not the default**: the default stays `lines-beginner`, and Grids · beginner is unchanged. It
plays the beginner grid's game (ten minutes, three boards, exact readings, drift every 120 s) and economy (130 to start).
Seating needs no rule for it: neither family is in a seating cluster (`seating.ts`), so only one family twice is
forbidden, and with two families every table of two seats holds both.

| Family | Dealt (4 each) | Tie-breaker |
|---|---|---|
| Divisibility (`divisibility.ts`) | powers q = 3 and matching q = 2, each on halves or alternate | leftover-digits |
| Leading Digits (`leading-digits.ts`) | b ∈ {2, 7}, each on halves or alternate | exponent-digits |

Leading Digits reads the same four readings (`divisibilityReadings`). Card (b = 2, halves): "Read the top half and the
bottom half row by row, and the left half and the right half column by column, each as one number: each should start
with the same digits as some power of 2 (up to the 1000th), for as many digits as possible, and no two rows or two
columns may hold the same numbers." The main part adds, over the four readings, the leading digits each shares with the
start of some 2^k, k = 0 … 1000 (2¹²⁹ starts 6805…, so 68051234 shares 4), less the repeated rows and columns. A reading
with leading zeros is the shorter number; a reading of 0 counts nothing. The powers are exact (BigInt): a power with
fewer digits than the reading shares only its own digits, so 20000000 shares one digit with 2, not eight (the
prototype padded short powers with zeros). The tie-breaker adds up the digits of each reading's smallest matching
exponent. The view cites the four readings, focuses those that match the most digits, and notes each one ("starts like
2¹²⁹ = 6805…: 4 digits"). Value functions are sampled (2M plain draws); the starters in both languages build the table
of starts themselves, keeping each power's first 40 digits.

The check table for Leading Digits (b = 2, halves, from the prototype `leadMatch`, scratchpad p9, before the exact
short powers):

| | Question | Evidence | Verdict |
|---|---|---|---|
| 1 | Unbounded main part? | Bound 32 (four 8-digit readings, each a full start of a power); best found 28, with no top found (2 of 14 annealing runs reached 28). | Pass |
| 2 | Ladder length? | A starter-like climber stops at 10.3 bits (b = 7: 10.6). | Pass |
| 3 | Tie-breaker defined by the main part's value? | It reads the exponents attained; it fell at 45% of main-part steps; at two capped main-part levels the best tie-breaker is 96 and 94. | Weak |
| 4 | Dealable instances? | 4 (b ∈ {2, 7} × two layouts). | Pass |
| 5 | Perpendicular? | Maximum depth-averaged \|PMI\| against the beginner eight's mains 1.32. | Pass |
| 6 | Opponents? | None yet. | Open |
| 9 | Balanced, keeps moving? | Not measured in seated play: this preset is how it gets measured. | Open |

## 14. Closing finding (15 November): what a 4×4 digit board can carry

**In short.** On a finite board of digits, every goal a child can read at a glance (sums, mirrors, pairs, spreads,
patterns) has a small top that search, or a known design, reaches. A ladder long enough to pass the rule design check
(`design-principles.md`) needs numbers read across several cells, and then the card leans on arithmetic the view must
do. One family passes on all three counts so far: **Divisibility**.

**What passes.** Divisibility (§12): the board's halves read as 8-digit numbers, each divisible by as high a power of q
as possible (or the two row numbers, and the two column numbers, differing by one). It deals two lenses × two q's × two
layouts (powers of 3 or 7; differences by 2 or 3; halves or odd and even rows and columns); a redraw changes only q.
Search finds 28–40 of a bound of 52–64; starters stop at 6.7–9.2 bits; the tie-breaker (what is left after dividing
out the power) restarts at 16–81% of main steps; seated play keeps 79% of seats stepping up in the last third and 9%
on a level reached in the first two minutes (drift off; powers of 3 on halves is the weakest at 60% and 20%); balance
1.2–1.3 with drift off. Its card is one sentence and its view shows each reading, its power and "one more 3: add 18 or
take away 9". It has no opponent with balance under 2 (row 6 open).

**Withdrawn (16 November): an optimum found by formula.** The grid tuple-rules worker found Divisibility's top boards by
lattice reduction (fpylll LLL and BKZ, a few seconds): digits d in [0, 9]^16, the four readings W·d ≡ 0 mod q^e, closest
vector around a board of 4s and 5s. Powers of 3 on halves reach 46 powers, e.g. **1110/1212/1116/0261** (transposition
symmetric, so the left half equals the top half and the four readings are two; its rows are distinct multisets, so no
repeats penalty), against the 28–40 that search found above; powers of 7 on halves reach 22. The attack applies to every
divisibility goal on readings linear in the digits. The coordinator withdrew the Grids · arithmetic preset; Divisibility
and Leading Digits keep their code and values, undealt, for the grid design session.

**Every goal tried, and why it failed.**

| Goal | Failure |
|---|---|
| The beginner eight, the more-rules seven, the parameterised four (§1–11) | exact tops found; one dealt instance; tie-breakers not read from the attained value |
| Rows, columns or 8-digit readings as close as possible to a prime, square, semiprime, prime ending in d | small top: π favours small digits, leading zeros make qualifying numbers dense, the whole board qualifies at 17–30 bits |
| Largest prime among the row numbers | top (9973) found every run |
| One reading divisible by a high power | formula top (2²⁶ = 67108864) |
| Powers of 2 or 5 on readings | trailing zeros make them cheap |
| Common factor of readings, shared modulus | boards of zeros; aligned with Divisibility |
| Distinct primes of the readings | plateau found; aligned with the big-digit rules; cannot be shown |
| Smoothness | formula top (2²⁶ then 2²⁵) |
| Roughness (smallest prime factor big) | passes row 1 but reach 13 bits at any reading count; balance 2.8–348 |
| Golden ratio, residues in several bases, residues mod 7, 11, 13 | top found; two rungs; formula (1001 = 7·11·13) |
| Neighbour gcds | formula top (7777 / 8888 / 9999 / 1111) |
| Sum of two squares | formula top (48612265 = 5·13·17·29·37·41) |
| Ends like a power, near a multiple of 9973, mirror divisibility | formula top; top found; the same goal (digit sums ignore order) |
| Shared leading digits, palindrome sums, repdigit sums, trailing 9s | small top found (the readable digit patterns) |
| Count goals over 19 overlapping units on 4×4 | all 19 reached (by search and a Klein-square seed) |
| Leading Digits (readings starting like powers of 2 or 7) | passes rows 1–3, but rejected on its card (round 19): not something a child can check or aim at |
| Graded main parts (progress toward the next power) | a no-op for q = 2, 3: a number with exactly v factors is always q^v from the next multiple |

**Uncapped cells** (any whole number, the lines' number code; old lenses made unbounded): every variant failed. Sharing
a total is a coordination constraint, so single moves stall after a level or two and the only way up is a formula
(double every cell, then nudge to the next prime), linear and endless into the hundreds of bits; zeros cheapened the
sums; balance 2.4–8. A rescue with all four fixes (the shared value scored by its smallest prime factor, zero counting
as no unit, multiplying moves priced by size, the C3 code) failed rows 1–3 the same way. Dropped.

**5×5 board** (shared totals over 28 rows, columns, squares and diagonals): a magic-square construction from two
orthogonal Knut Vik squares scores 22 without search, the best search finds; the card needs two totals (5-cell lines
and 4-cell squares cannot share one); tie-breakers restart at 4–25% of steps; reach 12–15 bits. Dropped. Palindrome
sums on 6×6: top found.

**The structural reason.** Sixteen digits hold about 53 bits. A goal a child reads at a glance is a local pattern over
a few cells; its levels are few, each level is coarse, and the full pattern is a small set a search or a known design
(magic and Latin squares, repeating rows) reaches. Unbounded-looking ladders need many digits read as one number, which
gives each level a rarer, finer step and no formula that meets overlapping readings at once; but that number's
property (a power, a factor, a prefix) is arithmetic a child cannot check, so the view must show it. Uncapped cells
remove the board's ceiling but not the coordination problem.
