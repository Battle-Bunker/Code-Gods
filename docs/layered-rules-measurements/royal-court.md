# 🫅 Kings and Subjects (Royal Court): measurements

The family is `kings_and_subjects` (`lib/game-utilities/src/families/grid/layered/royal_court.ts`). The design calls it
Royal Court; that id belongs to the cards family 👑 Royal Court. Everything here is Grid(4,base10,mono), measured
2026-11-11.

Reproduce:

```
cd lib/game-utilities
node --experimental-strip-types scripts/rule-difficulty.ts --families kings_and_subjects \
  --adhoc scripts/royal-court-base-candidates.mjs --shape "Grid(4,base10,mono)" --no-pairs       # the base table
node --experimental-strip-types scripts/royal-court-sweep.ts [--only pairs,sameRoads] [--agents] [--dist]   # the tiers
```

## 1. The base

A box is a court when its single biggest number (the king) equals the other three (the subjects) added up. A tie for
biggest crowns no king.

| Candidate | ordinal | DIFF | K | trap | rate4 | g10 (bits) | reach16 | verdict |
|---|---|--:|--:|--:|--:|--:|--:|---|
| corners, graded, no king deducts 20 | `[courts, −gap]` | **0.0** | 3.0 | 0.00 | 2.86 | 14.9 | 1.00 | **chosen** |
| corners, graded, no king deducts 10 | `[courts, −gap]` | 0.0 | 3.0 | 0.00 | 2.88 | 15.0 | 1.00 | a king's gap can be 15, so crowning a king could cost points |
| corners, graded, no king deducts king + 1 | `[courts, −gap]` | 0.0 | 2.9 | 0.00 | 2.76 | 14.3 | 1.00 | harder to say on a card |
| corners, 2 for a court, 1 for one away | points | 16.8 | 3.0 | 0.17 | 2.60 | 11.7 | 0.83 | greedy trapped on 17% of starts |
| corners, court primary, one away secondary | `[courts, near]` | 16.5 | 3.0 | 0.16 | 2.76 | 12.5 | 0.84 | the same traps |
| all 9 squares, graded, no king deducts 20 (`squares: "all"`) | `[courts, −gap]` | 20.7 | 3.1 | 0.21 | 3.51 | 22.3 | 0.79 | expert only: not in `support` |
| all 9 squares, graded, no king deducts 10 | `[courts, −gap]` | 20.7 | 3.3 | 0.21 | 3.73 | 23.4 | 0.79 | |
| all 9 squares, 2 and 1 points | points | 28.6 | 3.6 | 0.29 | 3.49 | 21.1 | 0.71 | K above 3.5 too |

The shipped family measured by the same run: DIFF 0.0, K 3.0, rate4 2.73, g10 14.3 bits, reach16 1.00, card 1291 bits
(the two rows of the same rule differ by the calibration sample: the framework calibrates each on the spot).

Exact, from the base's law (`hybridLawOf(...).baseLevels`):

| | |
|---|---|
| base levels | 179 |
| top | `[4, 0]`, 14.81 bits |
| uniform boards at the top | none: every uniform board and every 0/k checkerboard is the worst board, `[0, −80]` |
| two-digit boards at the top | **yes**: 3 = 1 + 1 + 1, so `1111/1331/1331/1111` (and 2/6, 3/9, and the kings in other corners) are four courts |
| greedy, 4 moves (400 random boards) | mean 3.54 courts; 0/0/5/172/223 boards at 0..4 courts |
| greedy, 10 moves | mean 3.99 courts; 396 of 400 at 4 → **gate = 4 courts** |
| greedy, 20 moves | mean 3.98 courts |

The no-king deduction is twice the number of symbols (20, 24, 32): more than the worst gap a king can have (2S − 5), so
crowning a king never costs points.

## 2. Tiers on the corner base, gate 4 courts

`shareAtTop` is P(tier = tierTop | four courts with gap 0); added bits = −log2 of it; top bits = 14.81 + added.
Build seconds are one hybrid law plus the liveness check. Levels are the hybrid law's (179 base levels + the tier's).

### Dealt

| tier | tierTop | added bits | top bits | shareAtTop | problems | build s | levels | base-only greedy | tier-aware greedy |
|---|--:|--:|--:|--:|---|--:|--:|--:|--:|
| pairs x = 1 | 6 | 13.3 | 28.1 | 9.9e-5 | none | 1.6 | 185 | 9% | 35% |
| pairs x = 2 | 6 | 12.9 | 27.7 | 1.3e-4 | none | 1.7 | 185 | 15% | 45% |
| pairs x = 3 | 6 | 12.2 | 27.0 | 2.2e-4 | none | 1.5 | 185 | 17% | 48% |
| pairs x = 4 | 6 | 12.5 | 27.3 | 1.8e-4 | none | 2.1 | 185 | 22% | 47% |
| pairs x = 5 | 6 | 12.8 | 27.6 | 1.4e-4 | none | 1.6 | 185 | 14% | 46% |
| sameRoads y = 2 | 5 | 13.9 | 28.7 | 6.6e-5 | none | 1.9 | 184 | 20% | 40% |
| sameRoads y = 3 | 3 | 15.0 | 29.8 | 3.1e-5 | none | 1.3 | 182 | 9% | 17% |
| sameRoads y = 4 | 2 | 12.6 | 27.4 | 1.6e-4 | none | 1.2 | 181 | 1% | 5% |

The agent columns are the mean share of `tierTop` held after 30 one-cell greedy moves from 40 random boards: an agent
that climbs the base only, and one that climbs the whole rule. (`scripts/layered-profile.ts` compiles prototype rule
modules against a stand-in prelude without `cell.right`, so it cannot run a real family; the sweep script measures this
instead.) All eight dealt values add 12.2 to 15.0 bits: within 15% of their median (12.9) except sameRoads y = 3.

`pairs`: P(tier ≥ i | top) for x = 3 is 1, 0.63, 0.32, 0.14, 0.035, 0.0058, 0.00022 for i = 0..6: one pair at a time.

### Lab (alive, above the 20-bit cap)

| tier | tierTop | added bits | top bits |
|---|--:|--:|--:|
| paths x = 17 | 16 | 22.0 | 36.8 |
| paths x = 20 | 15 | 24.9 | 39.7 |
| pairs x = 13 | 5 | 21.9 | 36.7 |

### Rejected, with the numbers that rejected them

| candidate | swept | result |
|---|---|---|
| **paths (x)**, the owner's plain count: each shortest path whose numbers, kings included, add up to x | x = 4..44 | x = 4 dead. Elsewhere tierTop 6–20 paths and +22.0 to +53.2 bits (above the cap) for 38 of 40 values; only x = 13 (+17.6) and x = 26 (+19.3) fit. Corner-to-corner kings have 20 paths, so the best boards are very rare. A base-only agent holds 3–6% of the top, a tier-aware one 19–21%. |
| **pathPairs (x)**: pairs with x in between, the number of such paths as a second component | x = 0..29 | above the cap (+21.1 to +51.7) for 25 of 30 values; the second component brings back the path count's tail. A longer card too. |
| **pairs (x)**, other values | x = 0..30 | x = 0: +11.4, alive, but "add up to 0" reads oddly. x = 6..12: alive, +14.4 to +19.2 (tierTop 6, then 5 from x = 9): held back to keep the dealt group's reach within 15% of its median. x = 13..17: +21.9 to +29.4, above the cap. x = 18..30: tierTop 2 (chunky), x = 29: tierTop 1. |
| **longest road of subjects** (the owner's literal form) | – | 91% of the boards with four courts have one road of all 12 subjects; +0.1 bits; `1111/1331/1331/1111` tops it. |
| **roads of exactly y subjects** | y = 1..12 | depends only on where the kings sit: dead for y = 1, 2, 4, 5, 7, 8, 10, 11; +4.3 (y = 3), +4.6 (y = 6), +4.1 (y = 9), +0.1 (y = 12): all under 6 bits. |
| **longest same-number road** | – | tierTop 11 found (12 exists: `1111/1331/1331/1111`); +29.8 bits; a two-digit board tops it. |
| **same-number roads of exactly y**, other values | y = 1, 5..8 | y = 1: +2.4. y = 5: +16.5, tierTop 2, a tier-aware agent holds 3%. y = 6, 7, 8: tierTop 1 (a cliff), and the share is 1 to 5 hits in 1,024 particles, so the estimate is weak. |

No x or y folds onto another: Kings and Subjects has no complement symmetry (a king's value is not preserved by
v → 9 − v).

## 3. What is not measured

- Shapes other than 4×4 digits: nothing is dealt there (`dealt` and `lab` are empty), and the base's DIFF, K and top
  were not measured on 6×6 or base 12 / 16.
- Shipped calibration tables for the new family (the lead regenerates them at merge; `test/calibration.test.ts` fails
  until then).
- Synergy with the beginner eight and three-player games.
