# Mirrormancer's tiers: what was measured

Everything here is on 4×4 digits (`Grid(4,base10,*)`), and is reproduced by

```
cd lib/game-utilities
node --experimental-strip-types scripts/mirror-tiers-sweep.ts [cards] [dealt] [sweep] [exact] [gate] [literal] [cross] [hall]
```

Code: `src/families/grid/layered/mirror-tiers.ts`, wired in `src/families/grid/strategy.ts`; tests
`test/mirror-tiers.test.ts`. Design: `docs/layered-rules-design.md` §5.2, §6.1, §10.

## The base

Today's Mirrormancer, unchanged: `[mirrors, pairs]` over the rows (`axis: "LR"`) or the columns (`"TB"`).

- Its rows are disjoint units scoring `[is a mirror, matching pairs]`, which add up to the ordinal (500 random boards
  per axis in the test). So it has a `DisjointBase` (`mirrormancer-lines@1`), an exact law and an exact sampler.
- Top: all four lines `abba`, 10⁸ boards of 10¹⁶, **26.6 bits**. Every uniform board reaches it.
- The base card and the shipped table key are byte-identical (`test/calibration.test.ts`, and the key compared with
  the manifest in `test/mirror-tiers.test.ts`). A tiered card differs from the base card in one line: it names the
  lines (`lines = grid.rows`) so the tier can read them.

## The gate: 3 mirrors

| A lone one-cell greedy climber, 2,000 uniform starts | mean mirrors | ≥ 3 | 4 |
|---|---|---|---|
| after 4 moves | 2.19 | 19% | 1% |
| after 5 moves | 2.61 | 57% | 4% |
| after 6 moves | 3.19 | 100% | 19% |
| after 7 moves | 3.57 | 100% | 57% |
| after 8 to 10 moves | 4.00 | 100% | 100% |

- The difficulty framework agrees: `g10` = 26.6 bits = the base's top (`pnpm --filter @workspace/game-utilities difficulty`).
- Read literally, "the greedy ten-move level" is the top (4 of 4). Opposite Nines is in the same position (`g10` =
  its top) and gates at three quarters of its pairs, so the gate here is **3 of 4 lines**: reached at move 6 alone.
- P(mirrors ≥ 3) = 3.97·10⁻⁶ (17.9 bits). Below it the levels are the base's own.

## What ships

Both tiers count **different** mirrors: two lines that read the same count once.

| Tier | Card sentence | n | tierTop | exact added bits | hybrid law: shareAtTop, added, top bits | levels | build | problems |
|---|---|---|---|---|---|---|---|---|
| `holding` (every y; one table) | "Each mirror that holds exactly two 7s scores 1 tertiary point." | 18 | 4 | 10.41 | 5.76·10⁻⁴, 10.8, 37.3 | 25 | 0.8 s | none |
| `halves` x = 7 (and 11) | "Fold each mirror in half, like the 2 3 of 2 3 3 2. Each mirror whose half adds up to 7 with two different numbers scores …" | 8 | 4 | 15.86 | 9.10·10⁻⁶, 16.7, 43.3 | 25 | 0.7 s | none |
| `halves` x = 8 (and 10) | | 8 | 4 | 15.86 | 1.21·10⁻⁵, 16.3, 42.9 | 25 | 0.5 s | none |
| `halves` x = 9 | | 10 | 4 | 14.28 | 8.00·10⁻⁵, 13.6, 40.2 | 25 | 0.6 s | none |

- **n** is the number of mirrors (of the 100 `abba` lines) that qualify. At the base's top the four lines are
  independent, so the top is exact: n·(n−1)·(n−2)·(n−3) of the 10⁸ top boards score 4.
- "hybrid law" is what the tier machinery measures (`tierLiveness`, through the card that scores in a game).
- Every board with fewer than three different digits stops at 2 (`7337/3773/3773/7337` scores `[4, 8, 2]`).
- The tier is 0 on a uniform board, so it breaks the base's uniform maximum.

**Shared tables (all exact, each checked on 300 to 400 boards in the test):**
- `TB` is the transpose of `LR`: one table for both axes.
- Relabelling the digits keeps every mirror and turns "two ys" into "two 0s": one table for every y. The law's own
  estimates for y = 0 and y = 7 are 10.8 and 11.1 bits (exact: 10.41 for both).
- 9 − digit keeps every mirror and turns a half of x into a half of 18 − x: x folds with 18 − x.

### The halves sweep, x = 1..17

| x | n | exact tierTop | exact added bits | hybrid law (x / 18 − x) | verdict |
|---|---|---|---|---|---|
| 1, 2, 16, 17 | 2 | 2 | 9.73 | 9.6 to 10.5 | a two-digit board tops it (`0110/1001/1001/0110`) |
| 3, 4, 14, 15 | 4 | 4 | 21.99 | 23.1, 23.0 / 22.4; x = 14 never found the top (read tierTop 3) | above the 20-bit cap |
| 5, 13 | 6 | 4 | 18.08 | 20.1 / 19.7 | in the band, but not certifiable (below) |
| 6, 12 | 6 | 4 | 18.08 | 16.2 / 21.3 | in the band, but not certifiable |
| 7, 11 | 8 | 4 | 15.86 | 16.7 / 14.9 | **dealt** |
| 8, 10 | 8 | 4 | 15.86 | 16.3 / 15.0 | **dealt** |
| 9 | 10 | 4 | 14.28 | 13.6 | **dealt** |

**A finding about the machinery.** The hybrid law's estimate of a tier's top is off by 1 to 3 bits once the top is 16
or more bits inside the base's top (x and 18 − x have the same exact law and read 16.2 and 21.3), and it missed the top
altogether for x = 14 (24 boards of 10⁸). That is above `HYBRID_MAX_ERROR_BITS` (1). `tiers-hybrid.ts` runs
`hybridLaw` with its default particles (256, 1,024 at the top; about 0.7 s a law), and has no way to ask for more.
The dealt values are the ones whose exact figure is well inside the band, so the verdict does not depend on the noise.

## Why the owner's literal forms were changed

| Form | Base | Result |
|---|---|---|
| "more ys are in exactly 2 symmetries" (y = 7), cells counted | 18 lines (Hall of Mirrors) | **0 on all 1,000 top boards** (exact). Every cell is in 3 or 4 mirror lines there. |
| the same | rows base (a cell is in one row and one column, so "exactly two" is "both") | tierTop 8, 14.0 bits, but **the uniform 7 board tops it**. |
| "each mirror row holding exactly two 7s", every row counted | rows base | tierTop 4, 9.5 bits; **`0770/7007/7007/0770` tops it** (two digits). |
| "halves add up to x", no clause, x = 6 | rows base | tierTop 4, 16.4 bits; **the uniform 3 board tops it**. |
| the same, x = 6, every line | 18 lines | top 16 on exactly one of the 1,000 top boards: the uniform 3 board. |
| "halves add up to x with two different numbers", every row counted, x = 6, 7, 9 | rows base | 13.3 to 16.6 bits; **`0660/6006/6006/0660`-type boards top it** (design §10 finding 7). |

"Different mirrors" is the smallest change that removes the two-digit top: four different qualifying lines need at least
three digits for `holding` and four for `halves`.

## A tier across units: measured, not dealt

| Candidate on the rows base | tierTop | added bits | verdict |
|---|---|---|---|
| columns that are mirrors too | 4 | 15.5 | every uniform board tops it |
| mirror columns with two different numbers | 4 | 14.5 | `0110/1001/1001/0110` tops it |
| different mirror columns | 2 | 17.2 | the same board tops it |
| mirror columns holding exactly two 7s | 2 | 10.0 | `0770/7007/7007/0770` tops it |
| different mirror columns holding exactly two 7s | 1 | 8.4 | the same board tops it |
| different mirror rows **or columns** holding exactly two 7s | 4 | 10.4 | alive, but see below |

- Asking the columns to mirror too is the double symmetry, and the boards with both symmetries have four free cells
  (corners, two kinds of edge, centre). A two-digit board of the red team's list always fits, so every such tier keeps a
  degenerate top.
- "Rows or columns" passes the check, but its top is 4 and four different mirror rows already reach it (with all rows
  mirrors, a mirror column forces two rows to read the same). At the top it is the `holding` tier with more ways in. It
  adds reach, not depth, so it is not dealt.
- The "different" clause is itself across units: a row scores only if no other row reads the same.

## Why the 18-line Hall of Mirrors base is not shipped

- Its lines overlap (a cell is in a row, a column and up to two diagonals), so it has no disjoint units: no exact law
  by convolution and no exact sampler of boards given the base. The machinery has nothing to stand on.
- Its top **can** be listed exactly. The 18 mirror conditions are equalities between cells; joining them leaves 3
  classes (corners, edges, centre), so the top is 10³ = 1,000 boards (43.19 bits). Listed in 4 ms.
- The tiers' exact law on those 1,000 boards:

| Tier on the 18-line top | values × boards | top | exact added bits |
|---|---|---|---|
| literal "7s in exactly two mirror lines" | 0 × 1,000 | 0 | 0 (dead) |
| mirror lines holding exactly two 7s | 0×729, 4×1, 6×162, 8×9, 10×9, 14×9, 16×81 | 16 on 81 boards | 3.63 |
| the same, different lines only | 0×729, 1×19, 2×162, 3×9, 4×81 | 4 on 81 boards | 3.63 |
| halves, every line, x = 6 | … 16×1 | 16 on 1 board (uniform 3) | 9.97 |
| halves on 4-cell lines, two different numbers, x = 6 or 13 | 0×838, 2×48, 4×96, 6×12, 8×6 | 8 on 6 boards | 7.38 |
| the same, x = 7 | 0×784, 2×64, 4×128, 6×16, 8×8 | 8 on 8 boards | 6.97 |

- So an exact **top level** for a Hall of Mirrors tier costs nothing. `holding` adds only 3.6 bits there (below the
  6-bit floor); `halves4` adds 7.0 to 7.4.
- What is still missing is every level between the gate and the top: the base's own law, and the tier given each base
  level. The base depends only on which cells are equal, so it is a function of the partition of the 16 cells into
  classes of equal digits. An exact law would sum over those partitions (about 10¹⁰ of them, 8 times fewer by the
  board's symmetries) with the number of digit colourings of each. That is an offline job, once per shape (its
  running time was not measured), and nothing of the kind exists in `src/tiers/` today.
