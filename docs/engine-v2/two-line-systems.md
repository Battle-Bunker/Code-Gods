# Two-line systems: one design from A and B (15 November 2026)

Status: the design the `lines-pairs` preset builds (lib/v2-pair). It takes the best of the two independent studies,
[multi-line-systems-A.md](multi-line-systems-A.md) and [multi-line-systems-B.md](multi-line-systems-B.md), and
fixes the bugs both reported and the ones this synthesis found. The script is
[scripts/two-line-systems.mjs](scripts/two-line-systems.mjs) (self-contained; A's law, value tables, annealer,
climbers and sentence attack, B's joint-hill adversary test; `node --max-old-space-size=6500
docs/engine-v2/scripts/two-line-systems.mjs [--pool v1…v6|v6-dealt] [--deal guard] [--part …] --write`, about two
minutes a pool). Its outputs are the `scripts/two-line-systems-results-*.md` files.

## In plain words

- **The object is two different lines, as one object, written either way round.** Swapping them changes nothing, so a
  swapped copy is never a second object (decision 24). Parallel lines are allowed; equal lines are not.
- **Fifteen moves.** The line's nine on either line, and six that use the pair: add a multiple of one equation to the
  other (elimination), turn a line about the crossing, reflect a line in the other, turn it a quarter turn about the
  crossing, slide it so the crossing runs along the other line, and slide the whole picture. Each has an inverse at
  the same fee; the shortcuts (reflect, quarter turn) are priced as choices (decision 25).
- **Nine families, eight dealt.** Each primary is a school check on two lines ("the answer is whole numbers", "they
  cross at a right angle", "the steeper line crosses the x-axis at a whole number"); each has two tie-breakers tied to
  the primary's anchor (decision 29), every one unbounded (decision 26), with senses balanced between big, small,
  prime, smooth and shared, so that every hill has a rule in the pool that loses when it is climbed (decision 30).
- **What the measurements say about the dealt eight** (§5): a cheap blind search never reaches 95% of a long one; a
  reader of the cards with a one-sentence family beats the long search in 1 of 9 tables (against 5 of 9 for the first
  pool, and 7 of 9 with On the Diagonal in); all 16 hills have at least one adversary (95 adversary pairs, 5 allies);
  scripted climbers never freeze (0 of 8 objects frozen in 7 of 8 tables) and a fifth to a half of their moves help
  two seats at once.
- **Bugs reported, honestly** (§6): On the Diagonal is held back from the deal because one sentence ("two lines
  through a far point (n, n), n smooth") reaches its hills; the best states of most tables lie on plateaus (collapse
  test 3 fails in 8 of 9 tables, as in B); and the sampled value tails past the draws are not certified.

## 1. The object

### 1.1 State, canonical form, law (A §1.1, unchanged)

- **State.** Two distinct lines over Q, each line-q's primitive triple (a, b, c) of a·x + b·y + c = 0 (gcd 1, b > 0,
  or b = 0 < a). One object, one universe: rules read only this system.
- **Unordered, not labelled.** A chose a set, B labelled lines red and blue. The set wins: with labels, swapping the
  lines makes a different object one cheap move away, the "copy one state" the owner ruled out, and rules about "red's
  intercept" make a symmetric object asymmetric for no reason. Where a rule needs one line it names it by a property
  of the system: **the steeper line** (a vertical line is steepest). The canonical state lists the lines sorted by
  (a, b, c); the app calls them line 1 and line 2 in that order and keeps each line's colour across moves (display).
- **Law.** φ is the sum of the six numbers' mixed codes (decision 17), so π ∝ 2^−φ on distinct pairs, drawn exactly by
  drawing two lines as line-q does and refusing equal ones. Measured: collision entropy 12.5 bits (one line: 6.4),
  13.9% of births parallel, φ of a birth median 28 bits, 99% under 50. The centre is the two axes.

### 1.2 Lenses

| Lens (id) | What a 12-year-old sees | Elements |
|---|---|---|
| `pair` | the graph: both lines, the answer where they cross, the nearest grid point | `L1`, `L2`, `P`, `x`, `y`, `peg`, `X`, `Y` |
| `eqs` | the two equations stacked, ax + by = e | `a1 b1 e1`, `a2 b2 e2` |
| `si` | each line as y = mx + c, and the steeper line | `m1 c1 r1`, `m2 c2 r2`, `ms cs rs` (steeper), `ratio`, `ygap`, `xgap` |
| `solve` | elimination worked out: x = top ÷ D | `D` ("the number you divide by"), `nx`, `ny`, `x`, `y` |
| `angle` | how the lines cross | `dot` (0 at a right angle), `D` (0 when parallel), `offRight` = \|dot/D\|, `off45` |

Shared meanings, as A and B both noted: D is the number you divide by, the sine of the angle (with the normals'
lengths), and the denominator of the answer, so a rule on the angle, one on the answer and one on elimination read
the same number in three lenses.

## 2. Mutators

Prices follow the spec (§5.2, §12.4) through v2-linear's own argument codes, so a move on one line of a system is
priced exactly as on a line: "which" log2 15, the line as one bit (where line-q's "where" goes), an amount of size σ
costs rate(o)·σ in all (a far move costs exactly its path), plus the surcharge max(0, Δφ).

| Id | Lens | Arguments | Effect | Keeps | Inverse (same fee) |
|---|---|---|---|---|---|
| line-q's nine (`si.shift`, `si.tilt`, `seq.step`, `cart.pivot`, `cart.slide`, `cart.mirror`, `gen.nudge`, `int.move`, `mach.stretch`) | `eqs`, `si`, `pair` | the line, then as on a line | moves one line | the other line | as on a line, on the moved line (it may now be listed first or second; a choice of the same price) |
| `pair.combine` | `solve`, `eqs` | line i, k (whole amount) | L_i += k·L_j: elimination | the answer, line j, \|D\| | k → −k (or k again when the result was turned over); refused both ways when the result has a common factor |
| `pair.turn` | `pair`, `angle` | line i, k (amount) | line i's gradient += k about the crossing | the answer | −k |
| `pair.reflect` | `pair`, `angle` | line i (choice) | line i reflected in line j | the answer, line j | itself |
| `pair.quarter` | `pair`, `angle` | line i (choice) | the perpendicular to line i through the crossing | the answer; tan ↔ cot | itself |
| `pair.slide` | `pair` | line i, k (whole amount) | line i moves parallel so the crossing moves k steps along line j | D, the angle, line j | −k |
| `sys.translate` | `pair` | (u, v) (amount) | both lines slide by (u, v) | D, the angle, the shape | (−u, −v) |

- **Representation shortcuts (decision 25).** Elimination with k = 5 is one cheap call whose effect on line i's
  coefficients is dozens of units; reflect and quarter turn are choices, never priced by a path. A reflection's mirror
  is already in the system, so no information is introduced from scratch (decision 28); a messy image pays the
  surcharge.
- **Left out.** A's zoom and system mirror (a zoom is the move that makes the position hills cheap, §4.2: it should
  stay a path of slides and stretches, not one choice), B's rails (three lines) and `sys.straighten` (no equal-fee
  inverse). Equal lines are refused both ways, so the walk stays reversible.
- **Gate.** `lib/v2-pair/test/potential.test.ts`: every proposal has a reverse of the same weight, every mutator
  proposes something (the exact potential, decision 19).

## 3. The pool

A primary is a distance to an exact school condition (closer better, its top 0); its **anchor** is the whole number
it closes in on, whole at the top (A's definition, kept strictly: §4.3). Each tie-breaker reads the anchor and relates
it to itself or to another aspect (decision 29). Senses: **big**, **small** (as negative as possible), **prime** (a
big smallest prime factor), **smooth** (many prime factors), **shared** (a big common factor). "Zoom" says what a
smooth zoom of the picture does to the hill (§4.2): ↑ grows, capped (bounded by a number a zoom keeps), ↓ falls.

| Family | Primary (the card) | Anchor | Tie-breaker 1 | Tie-breaker 2 |
|---|---|---|---|---|
| Whole Answer | Solve the two equations: the answer should be whole numbers | the answer's peg (X, Y) | `peg-divisor`: \|X\| + \|Y\| shares a factor with D (shared; capped) | `south-west`: X + Y as small as possible (small; ↑ for a negative zoom) |
| No Fractions | The number you divide by should be 1 | the answer (whole when \|D\| = 1) | `answer-prime`: \|X\| + \|Y\| a big prime (prime; ↓) | `answer-gradient`: \|X\| + \|Y\| shares a factor with the steeper gradient's whole part (shared; capped) |
| Right Angle | The lines cross at a right angle | D | `prime-divisor`: D a big prime (prime) | `divisor-intercept`: D shares a factor with the steeper line's y-intercept (shared; capped) |
| Forty-Five | The lines cross at 45° | D | `smooth-divisor`: D has many prime factors (smooth) | `divisor-gap`: D shares a factor with the y-intercepts' gap (shared; capped) |
| Double Gap | The y-intercepts' gap is a whole number, twice the x-intercepts' gap; no line through (0, 0) | g, the y-intercepts' gap | `gap-prime`: g a big prime (prime; ↓) | `gap-divisor`: g shares a factor with D (shared; capped) |
| Far Crossing | The steeper line crosses the x-axis at a whole number | r, that x-intercept | `far-right`: r as big as possible (big; ↑) | `far-prime`: r a big prime (prime; ↓) |
| High Start | The steeper line crosses the y-axis at a whole number | h, that y-intercept | `steep-and-high`: the smaller of h and the steeper gradient's whole part, as big as possible, so its x-intercept is small and negative (big; capped by the gradient) | `start-factors`: h and D share many prime factors (smooth; capped) |
| Steep Ratio | One line is a whole number of times as steep as the other (±2, ±3, …) | k, the times | `ratio-gap`: k shares a factor with the y-intercepts' gap (shared; capped) | `ratio-prime`: k a big prime (prime) |
| *On the Diagonal* (not dealt, §6.1) | The lines cross on y = x at a grid point; neither line is y = x | t, the crossing's x | `north-east`: t as big as possible (big; ↑) | `diagonal-prime`: t a big prime (prime; ↓) |

**Designed oppositions** (decision 30's "rules in tension"): on D, big prime (`prime-divisor`) against many factors
(`smooth-divisor`) against D = ±1 (No Fractions' primary) against the shared hills that want D to share factors; on
the answer, `south-west` against `answer-prime` and the position hills of the other sign; on the steeper line,
`far-right` against `steep-and-high` (the owner's own example: high gradient and intercept make the x-intercept small
and negative); and every hill a smooth zoom raises (`south-west`, `far-right`) against the prime hills on exact
position anchors that the same zoom lowers (`answer-prime`, `far-prime`, `gap-prime`).

## 4. The bugs A and B reported, what this design changed, and the bugs it found

Each change was measured with the script (pools v1 → v6). Sentence = the best member of a structured family (A §4.7's
"two lines through one peg", A §3.4's "an axis and a line with a big number" and "x = u, y = v", and this design's "two
lines through (n, n)") against ten long annealing runs; counts are of 9 tables (6 of three seats, 3 of four).

| Pool | Change | Sentence ≥ search | Notes |
|---|---|--:|---|
| v1 | A's and B's families, re-tied; mostly big, smooth and shared senses | 5 | "two lines through (n, n), n smooth" wins |
| v2 | prime hills on position anchors | 6 | a rounded rational is prime by luck: cheap |
| v3 | only three hills grow under a zoom; the rest capped by D or a gradient | 6 | two families shared one secondary |
| v4 | every anchor whole at its primary's top; no shared secondaries | 6 | equal gaps are free for any pair symmetric about y = x |
| v5 | Gap Match → Double Gap | 6 | y = x as one line meets On the Diagonal for ever; a line through (0, 0) meets Double Gap |
| v6 | no primary met by one line alone | 7 (5 of them On the Diagonal) | the "through (n, n)" sentence climbs its north-east hill |
| **v6-dealt** | **On the Diagonal held back** | **1** (1.12) | the dealt pool |

(v1, v5 and v6 ran with the law-bound clamp of §5.8 and their results files are kept; v2–v4 ran before the clamp was added and were not kept: `--pool v2` etc. reruns them.)

### 4.1 A's generic sentence and the axis ramp

- **"Two lines through one peg" beat search on 3 of 8 of A's tables.** Too many of A's primaries are met by a crossing
  on a grid point (Whole Answer, Meet on the Floor, Treasure, Crossing at the Gradients, No Fractions). This pool keeps
  one crossing-on-a-peg primary (Whole Answer) and its ally No Fractions, and puts the others on the angle (Right
  Angle, Forty-Five), the intercepts (Double Gap, Far Crossing, High Start) and the gradients (Steep Ratio). Measured on
  the dealt pool: the peg sentence wins no table (its best is 0.94 of the search).
- **The axis ramp** ("use the axes as two lines and put the anchor at a big prime on an axis"). The axes give D = 1,
  the answer (0, 0) and no gradient: every anchor here is 0 or 1 there and every tie-breaker scores its bottom (an
  anchor of 0 earns nothing). The axis sentences ("an axis and one line with a big number", "x = u and y = v") win no
  dealt table.

### 4.2 B's size hills through smooth numbers, generalised: the zoom

B found lattice counts climbing steeply through smooth numbers (x + y = 13,824). Counts are gone (decision 30 keeps
size hills, so the question is adversaries), but the same mechanism reappeared in v1: **zoom the picture by a smooth
n** (every constant c × n: the answer, the intercepts and the gaps × n; gradients, D and the angle kept). A smooth n
costs about log2 n bits of φ per line, and every big, smooth and shared hill on a position grows with it, together. One
sentence climbed most of a table. The fix (v3) sorts every hill by what a zoom does to it (§3's column): only
`south-west` and `far-right` (and the held-back `north-east`) grow; the shared hills are capped by a zoom-invariant
number (D, a gradient, k); the prime hills on exact positions fall under a smooth zoom. A zoom is also not one move:
it is a path of slides and stretches (§2).

### 4.3 Found here: rounded anchors, shared secondaries, one-line primaries

- **A prime hill on a rounded rational is a size hill** (v2). The y-intercepts' gap of y = 3x − 2048 and
  3y = x + 2048 is 8192/3, nearest whole 2731, a prime: 26.8 bits for a cheap system. Rule (v4): an anchor is whole at
  its primary's top, so a big prime costs its digits.
- **Two families sharing one secondary are allies** (v3): Whole Answer and Right Angle both wanted gcd(\|X\| + \|Y\|, D).
- **A primary met by one line alone is a free plateau** (v4, v5): equal intercept gaps hold for every pair symmetric
  about y = x; y = x itself meets every other line on the diagonal; a line through (0, 0) doubles any other line's gaps.
  B's "free direction" (keep y = x, vary the other line) is this. Rule (v6): such states score worst.

### 4.4 B's free-direction plateaus (collapse test 3): still failing

The best 24 distinct states of a table keep ≥ 70% of 24 × the best in 8 of 9 dealt tables: good states come in
families along a direction no seated rule reads. B's remedy, dealing tables whose rules read every degree of freedom,
is not built; it needs each family's aspects declared and read by the deal (§7).

## 5. Measurements of the dealt pool (v6-dealt)

Values by A's weighted draws (240,000 systems, tilts 1, 0.75, 0.55, 0.4); bits = −log2 π{score ≥ s}. Full tables:
[v6](scripts/two-line-systems-results-v6-law-values-ramp-entangle-adversary-climb.md),
[v6-dealt search and sentence](scripts/two-line-systems-results-v6-dealt-search-sentence.md),
[v6-dealt adversaries and climbers](scripts/two-line-systems-results-v6-dealt-adversary-climb.md).

1. **Values.** Primary tops from 0.8 bits (Far Crossing) to 4.4 (Forty-Five); Double Gap's is 13.5 (its primary is a
   needle: undefined for 94% of births). Certified tops (the 30th best draw) 10–23 bits.
2. **Hills** (test 1, information). Four of eighteen grew more than 10% from a window of 50 bits of φ to 100:
   `far-prime`, `steep-and-high`, `start-factors`, `ratio-prime`. They are the wanted unbounded hills; each has
   adversaries (next).
3. **Adversaries** (B's joint-hill test). From states where both families' primaries are at their tops, one rule
   climbs 60 bits of fees: **every one of the 16 hills has at least one adversary**; of 200 ordered pairs, 95 lose a
   bit or more (5 gain) when the other climbs freely, 6 lose while the climber keeps their primary at its top (23
   gain). Strongest designed pairs measured: `far-right` costs `divisor-gap` 6.4 bits, `steep-and-high` costs
   `divisor-intercept` 9.4 and `prime-divisor` 7.2, `south-west` costs `divisor-intercept` 5.6 (4.4 held). Caveat:
   Double Gap's needle primary makes it everyone's casualty (−7 to −12), which is collateral, not designed tension.
4. **Entanglement anywhere.** P(B changes | A changes) 0.36–0.99; correlations −0.23 (Right Angle against
   Forty-Five) to +0.24 (Double Gap with Steep Ratio): some pairs allies, some rivals, most near 0.
5. **Climbers** (test 4; 8 tables of 3 seats, 8 objects, 400 bits each). 84–147 moves a table; 10–55% of moves raised
   two seats at once; 63–84% lowered another seat; 2–6 of 8 objects still moving in the last third; 0 of 8 frozen at
   the end in 7 tables (2 of 8 in one); 8 distinct final states every time.
6. **Search** (tests 2 and 3). A cheap search (5,000 evaluations) reaches 0.14–0.72 of a reference (10 runs of
   50,000), never 95%; the reference's five best runs are five different states in every table. Test 3 fails (§4.4).
7. **Sentences** (test 2′). One table of nine: "two lines through (n, n)" finds x + y = 38, 2x + y = 57 at 1.12 of the
   search (No Fractions/answer-gradient, Steep Ratio/ratio-gap, Forty-Five/smooth-divisor, Double Gap/gap-prime).
8. **Value tails are not certified.** Past the fifth-best draw the script extrapolates (A's method) and clamps to the
   law's bound (bits(S) ≤ φ(S) − 5.7, the engine's rule for tails). Several "best states" above are valued past the
   draws (e.g. 37.1 bits for Right Angle/divisor-intercept at D = 80); their size is an upper bound, not a measurement.
   The engine's valuation (direct draws with its own tails, decision 26) will be measured again on the preset (§7).

## 6. Bug report

1. **On the Diagonal's hills are reached by a sentence** (an easy high peak, the owner's bug). Two lines through a far
   diagonal point (n, n) with n smooth (y = 2x − 3072 and 2y = x + 3072) cost about 40 bits of φ, and the north-east
   hill values them near the law's bound (40+ bits), beating ten long searches in 5 tables. Its prime hill is reached
   the same way with n prime (y = 6x + 65, x + 6y = −91 at (−13, −13)). It is not dealt; candidate fixes, for the
   coordinator: an anchor read relative to the system (the crossing's distance from the y-intercepts' midpoint, A's
   proposal 1), or a dealt opposite for every table that seats it.
2. **Plateaus** (test 3, §4.4): uniqueness costs little on 8 of 9 tables; the remedy is in the deal.
3. **The zoom guard does not help.** A deal rule that seats a zoom hill only beside an opposite (`--deal guard`) left
   the sentence count at 7 of 9 on v6: the winning sentences were not zooms of a dealt hill but On the Diagonal's
   structure. It is not proposed.

## 7. What the build does (part 2) and what is left

- **Built:** `lib/v2-pair` (object type `pair`, variant `pair-q`): the state, law and direct draws, the five lenses,
  the fifteen mutators under the potential gate, the nine families (On the Diagonal undealt), the preset
  `lines-pairs` (not the default), valued by plain draws with the engine's intervals and tails.
- **Next measurements on the engine:** the standing collapse check and the tension matrix on `pair-q`, with the
  engine's own values, prices and starters.
- **Proposals for the coordinator** (each a declared trial if taken): deal tables whose rules read every aspect
  (B §4.6); an anchor for On the Diagonal that a zoom cannot move; and the sentence attack (test 2′, A §4.8) in the
  standing collapse check.
- **Three lines** wait for rules in tension on the triangle (A §4.4: area, pegs and corners pull together).
