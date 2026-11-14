# Grids on engine v2: design note (14 November 2026)

Status: the design for milestone M4 ("grids ported", [integration-plan.md](integration-plan.md) §5.5), written before
the code. It follows the owner's decisions ([owner-decisions.md](owner-decisions.md), which override this note) and the
contracts of [spec.md](spec.md). It replaces spec §13's sketch. What it carries over from the old grid
(`archive/engine-v1`) is the board itself: the beginner's colourless 4×4 board of digits (the owner: "We eliminated
colour from the beginner grid game to increase concentration of interest within one dimension"). It does not carry the
old rules as they were: they were scored on a flat law and several were yes/no counts or read overlapping units, which
the v2 rules cannot be (§6).

## 0. In one page

- **The object** is one N×N board of whole numbers, read row by row. Beginner variant `grid-4-d10`: 4×4, every cell 0–9.
- **Energy is per cell**: φ(board) = Σ cells (v/2 + log2 Z), so a board's energy is **half its total** plus a constant.
  The gravitational centre is the empty board (all 0s). Every 1 added anywhere makes a board √2 times rarer.
- **Product-form law.** Every mutator is a potential move (a move and its inverse are proposed with equal weight), so the
  walk's stationary law is π(board) = Π cells p(v), p(v) = 2^−v/2 / Z: the cells are independent and identically
  distributed. A rule whose layers add up over disjoint units of cells (rows, boxes, opposite pairs, cells) has an
  **exact** value at every rung, by convolving the units' laws. No simulation, no tail bound, a few milliseconds a rule.
- **Six representations**, each a way a 12-year-old can read the board: the cells, the row and column totals, the
  opposite pairs, the rows read backwards, the steps along each row, the four corner boxes. Nine mutators, each tied to
  one of them; the three that rearrange numbers cost no energy.
- **Six rule families**, each one main layer (one representation, school arithmetic) and three alternative
  tie-breakers. Every pairing is in the exact class.

## 1. The object

### 1.1 State and canonical form

```ts
interface GridState { readonly cells: readonly number[] }   // N·N whole numbers, row-major: cells[r·N + c]
```

- **Canonical form**: the array itself. A board is not identified with its rotations or reflections: rules read rows,
  columns and corners, so orientation matters, and turning the board is a move (`turn.spin`).
- **Wire**: rows joined by `/`, each row its cells' digits (`0120/3001/0000/9000`). A variant whose cap is above 9
  separates cells with `,` (`10,0,3,1/…`). `decode` refuses anything not canonical (wrong size, a value past the cap).
- **Sites**: 1. A grid is one site; mutators and representations address cells, lines, pairs and boxes through their
  arguments and element names, not through sites. Each object is an independent universe (spec §2.6).

### 1.2 Variants and parameters

| Param | Values | Meaning |
|---|---|---|
| `size` | 4 (later 5, 6) | N: the board is N×N |
| `cap` | 9 (later null) | the largest number a cell may hold (null: any whole number; the energy keeps such boards normalisable) |
| `step` | ½ | bits of energy per unit in a cell (§2) |

Shipped first: **`grid-4-d10`** (4×4, cap 9, step ½), the beginner board. A tiny **`grid-2-d3`** (2×2, cap 2: 81
boards) exists for tests only: every value on it is checked against brute-force enumeration of all boards. Wider boards
and unbounded cells are later variants (a pull request each, owner decision 7).

### 1.3 Read length φ

φ(board) = Σ cells w(v), w(v) = v/2 + log2 Z, Z = Σ_{v=0}^{cap} 2^−v/2 (Z = 3.31 on digits, log2 Z = 1.73). The Kraft sum
over all boards is exactly 1 (the code is complete on 0…cap per cell), so π = 2^−φ needs no normaliser. On
`grid-4-d10` the empty board reads in 27.6 bits and the board of all 9s in 99.6. A full read of a cell costs w(v): 1.7
bits for a 0, 6.2 for a 9.

## 2. Energy: why half the total

The owner's principle (decision 11): moving to larger or more complex numbers must cost more than coming back, so the
board has a gravitational centre and energy is a description length. Two codes were considered for a cell:

- **Steps** (chosen): v costs v/2 bits more than 0. Energy is half the board's total, a fact a 12-year-old can say
  ("the bigger the numbers add up to, the rarer the board"), and it is the same principle as the line's additive moves
  (decision 17: "Adding to a number should have cost proportional to the absolute value of the amount added"). The law
  of a cell is geometric: P(0) = 0.30, P(1) = 0.21, P(5) = 0.05, P(9) = 0.013.
- **Factorisation** (the line's number code): 7 would cost more than 8 or 9, and 0 would hold half the mass (P(0) = 0.6
  on digits), so a newborn board is mostly blank. It suits unbounded lines, where primes are the axis of rarity, less a
  board of digits whose rules are sums and differences.

So the grid's axis of rarity is size: a rule that wants big numbers fights gravity, and a rule that wants a fixed total
gets exactly the boards of that total, equally weighted (π depends on the board through its total alone). That second
fact is what makes tie-breakers clean: at the top of "every row adds up to 12" every board with those row totals is
equally likely, so a tie-breaker's rarity there is a plain count of arrangements.

`step` is a variant parameter. The code is listed as a decision for the owner in §8 (steps on the beginner board).

## 3. Representations and their elements

Every representation is a scene of kind `grid` (spec §11.1; the one new renderer): the board drawn as cells, with the
representation's own elements drawn on it (margins, groups, arrows). Element values are numbers. Cells are named `rRcC`
with 0-based R and C (labels say "row 1, column 1"); every derived element names the cells it is made of, so marks and
cross-highlighting work by meaning (`cellValue(r, c)`, `rowTotal(r)`).

| Id | What a 12-year-old reads | Coordinates | Derived elements |
|---|---|---|---|
| `cells` | the board | `r0c0` … `r3c3` | `total` (all cells) |
| `tally` | the board with each row's and column's total in the margin | — | `row0` … `row3`, `col0` … `col3`, `total` |
| `turn` | each cell joined to its opposite (where a half turn of the board takes it) | — | `pair0` … `pair7`: the two cells' total, pairs numbered by the top-half cell in reading order |
| `mirror` | each row beside itself read backwards | — | `gap0` … `gap3`: how far row r is from reading the same both ways, \|a − d\| + \|b − c\| |
| `steps` | the step from each number to the next along a row | — | `s(r,j)` = cell (r, j+1) − cell (r, j) as `s00` … `s32`; `bend0` … `bend3`: how far row r's steps are from equal, \|s0 − s1\| + \|s1 − s2\| |
| `boxes` | the board cut into four 2×2 corner boxes | — | `box0` … `box3` (top-left, top-right, bottom-left, bottom-right): the box's total |

The tallies are the required "row/column tallies"; the opposite pairs, the backward rows, the steps and the boxes are
the representations rules anchor to. A priced query of a representation returns its static elements (spec §3.1); a
read of `tally` costs the bits of its eight totals, capped (as for lines) at the board's read length.

## 4. Mutators and their handling fees

Nine mutators, so "which" is log2 9 = 3.17 bits, as on the line. Positions are choices (their log2 is the handling fee
of the move: it is the same in both directions). Amounts are priced by steps (decision 17): a nonzero k costs
1 + ½(|k| − 1) + 1.77 bits (±1: 2.77). Every call also pays the confining surcharge max(0, φ(after) − φ(before)), which
here is half the growth of the total. A result past the cap or below 0 is refused, in both directions alike.

| Id | Rep | Arguments (bits) | Effect | Inverse | Price of the cheapest call |
|---|---|---|---|---|---|
| `cells.add` | cells | cell: choice of 16 (4); k: steps | cell += k | `cells.add(cell, −k)` | 9.94 (+½ when k = 1) |
| `cells.swap` | cells | a, b: two choices of 16 (8; a = b is refused) | swap them | self | 11.17, no surcharge |
| `tally.add` | tally | line: choice of 8 rows and columns (3); k: steps | every cell of the line += k | `tally.add(line, −k)` | 8.94 (+2 when k = 1) |
| `tally.rotate` | tally | line (3); j: choice of 3 (1.58) | the line's cells move j places along, the last coming round to the front | `tally.rotate(line, 4 − j)` (same price) | 7.75, no surcharge |
| `turn.spin` | turn | one of 7 turns and flips (2.81) | the whole board turned a quarter, half or three quarters, or flipped (two axes, two diagonals) | the opposite turn; flips are their own | 5.98, no surcharge |
| `turn.balance` | turn | pair: choice of 8 (3); k: steps | the pair's top-half cell += k, its opposite −= k (the pair's total is kept) | `turn.balance(pair, −k)` | 8.94, no surcharge |
| `mirror.reverse` | mirror | line (3) | a row or column written backwards | self | 6.17, no surcharge |
| `steps.tilt` | steps | line (3); k: steps | the line's cells += 0, k, 2k, 3k (every step along it grows by k) | `steps.tilt(line, −k)` | 8.94 (+3 when k = 1) |
| `boxes.add` | boxes | box: choice of 4 (2); k: steps | every cell of the box += k | `boxes.add(box, −k)` | 7.94 (+2 when k = 1) |

The cycle test is the hard gate it is on the line: lib/v2-grid's potential test proposes every call from a corpus of
boards on every variant and fails on any one-way move or any pair of opposite moves whose weights differ.

## 5. Value: the exact sum, what it buys and what it rules out

**The law.** π(board) = Π cells p(v) (§0). A rung's value is V_k = −log2 π(level ≥ k), as for lines (spec §7.1).

**The class every dealt grid rule is in ("unit-additive").** A family declares a partition of the cells into disjoint
**units** of at most four cells (rows, boxes, opposite pairs, single cells); each layer's term is a sum over the units
of a quantity that depends on that unit's cells alone. Then the pair (main term, tie-breaker term) is a sum of
independent random pairs, one per unit, and its exact law is the convolution of the units' laws. The engine never
duplicates rule logic: it reads each unit's contribution by evaluating the rule itself on boards that differ from a
reference board only in that unit, and it checks the declared additivity on 400 boards drawn from π before using it
(as `separable` is checked on lines). The interface is `gridSums` in lib/v2-grid/src/sums.ts:

```ts
interface GridSums { units(variant: Variant): readonly (readonly number[])[] }   // disjoint cell indices
```

**Recipe per family** (§6): enumerate each unit's configurations (at most 10^4 for a unit of four digits) with weight
Π p(v); record (main contribution, tie contribution); convolve the units' 2D laws (a few hundred support points);
level each support point with the rule's own ladder; sum upwards. On a bounded board the result is exact up to
floating point (no outside mass); on an unbounded variant each unit is enumerated within a bit budget and the outside
mass bounds the error, as `integersWithin` does for lines. Every rung is then `exact` in the artefact (spec §7.2), and
continuity (decision 13) is read off the law's support: each dealt layer must take at least six values.

**What it buys.**
- Every rung of every dealt pairing is exact to the top, with no compute budget and no cap: calibrating the whole pool is
  seconds, so a family can deal many parameter values (several targets) at no cost.
- Tie-breakers have no islands: the restricted chains that failed on Prime Staircase do not exist here.
- Exact conditional sampling: a board at any rung can be drawn exactly (unit by unit), which gives the goal card's
  worked examples and the tests' corpora.
- The 2×2 test board lets every exact value be checked against brute force over all 81 boards.

**What it rules out.**
- **Overlapping units**: the nine overlapping 2×2 windows (Spread of Three), touching pairs across the whole board
  (Strangers), runs that cross rows. They would need a transfer matrix over rows (10^4 states a row on 4×4 digits, too
  big with scores attached).
- **Layers on different partitions**: a main layer on rows with a tie-breaker on columns, a magic square (rows and
  columns both). A tie-breaker must read the main layer's units or finer ones (single cells).
- **Whole-board shape**: regions, paths, connectivity, symmetry of the board as a whole (except through pairs), and
  "how many different numbers" (a histogram rule needs its own recipe, not built).
- **Energy that prefers patterns**: a per-cell law cannot make a repeated row or a symmetric board cheaper than its
  numbers alone. Prices for rearranging are fees, never energy.
- **Asymmetric mutators**: "write v in a cell" priced by v is not a potential move (its inverse writes a different
  number at a different price); every mutator above is symmetric by construction.

## 6. The first rule pool

Six families. Each main layer is in one representation and in a 12-year-old's words; each has three alternative
tie-breakers, and a dealt rule is the main layer plus exactly one (decision 14). Every layer is graded (a distance, a
count, a size; decision 13). All six are unit-additive (§5), so every pairing is exact. The figures are from the exact
law on `grid-4-d10`. The ladders' last rungs are set so that every dealt top is in the 15–25 bit band: the committed
artefacts (`lib/v2-valuation/artefacts/grid-4-d10/`, every one `exact`) put the eighteen pairings' tops at 21.8–24.8
bits.

| # | Family (rep, units) | Main layer: the card | Tie-breakers (alternatives) | Main top (bits) |
|---|---|---|---|---|
| 1 | **Row Totals** (tally, rows) | "Every row should add up to 12." Distance: Σ rows \|total − 12\| | the first column as big as possible (Σ, size) · as many prime numbers as possible (count) · as many 0s as possible (count) | 16.8 |
| 2 | **Opposite Pairs** (turn, pairs) | "Every cell and its opposite (a half turn away) should add up to 9." Σ pairs \|a + b − 9\| | the top half adds up to as much as possible · as many primes as possible · as many odd numbers as possible | 37.0 exact (capped near 20) |
| 3 | **Mirror Rows** (mirror, rows) | "Every row should read the same backwards." Σ rows (\|a − d\| + \|b − c\|) | the two middle columns as big as possible · as many primes as possible · as many 0s as possible | 19.6 exact (capped at 1: 16.0) |
| 4 | **Steady Steps** (steps, rows) | "Along every row the numbers should go up (or down) in equal steps, like 1 3 5 7." Σ rows \|s0 − s1\| + \|s1 − s2\| | each row climbs as far as possible (Σ \|last − first\|) · the rows start as high as possible (first column) · as many primes as possible | ≈ 26 exact (capped near 20) |
| 5 | **Box Totals** (boxes, corner boxes) | "Each corner box of four should add up to 12." Σ boxes \|total − 12\| | the four corners of the board as big as possible · as many primes as possible · as many 0s as possible | 16.8 |
| 6 | **Prime Cells** (cells, cells) | "As many cells as possible should hold a prime number (2, 3, 5 or 7)." count | those primes add up to as much as possible · as many 7s as possible · the corners as big as possible | 25.0 (capped near 14 cells) |

Collisions are on purpose (decision 5): all six compete for the same sixteen numbers. Row Totals and Box Totals want
the same totals over crossing units; Mirror Rows and Steady Steps want incompatible rows except a constant one; every
"as big as possible" tie-breaker fights gravity and the "add up to" layers; Prime Cells pulls numbers away from the 0s
the centre favours.

**What became of the old beginner eight.** Magic Eighteen → Row Totals (18 is 26 bits under the energy, 12 is 17);
Opposite Nines → Opposite Pairs (same rule, graded); Mirrormancer → Mirror Rows (graded); Two Pair, Spread of Three,
Strangers, Leapfrog and Crosswise Threes are not ported: Spread of Three and Strangers read overlapping units, and Two
Pair's score is a category, not a quantity. Leapfrog and Crosswise Threes are exact and could return as alternatives
in a second pool.

## 7. Views, agents, server

- **Views** (lib/v2-views): one `grid` renderer for all six representations. Compact face: the main layer's
  representation with its marks (the rows that miss 12, with their totals). Expanded face: the representations the rule
  depends on side by side. Marks: focus on cells and derived elements, notes ("3 short"), candidates.
- **Agents**: priced host reads (a representation, or one element) exactly as for lines; starters Simple, Thorough and
  Bold per family that play for points (own bits times others' bits), coordinated with the agents session; an example per
  family × tie-breaker in Python and TypeScript.
- **Server**: a `grids-beginner` preset on `grid-4-d10` and its deal (bids included), with the server and app sessions.

## 8. Decisions for the owner, and judgment calls

**For the owner** (I proceed on the first option of each unless told otherwise):
1. The cell's energy on the beginner board: **steps** (energy = half the board's total, so bigger numbers are rarer) or
   the line's factorisation code (7 dearer than 9, a mostly blank board). §2.
2. The pool drops five of the old eight (overlapping units or category scores, §6) and moves Magic Eighteen's target
   from 18 to 12.

**Judgment calls** (mine; revisit freely):
- One site per board; orientation is part of the state.
- Births use the engine's birth walk (spec §2.4), though exact i.i.d. draws are available; the walk keeps one code path.
- Units of at most four cells, so a unit's law is enumerated directly.
- Cell element names are 0-based (`r0c0`) for agents; every label people read is 1-based ("row 1, column 1").
