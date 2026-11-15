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

## 8. On the engine (lines-pairs, after #706)

The standing collapse check on `pair-q` with the engine's own law (code C3), prices and values, 6 dealt tables of
three seats, tests 1–3 (test 4 waits for the pair starters). Output:
[scripts/two-line-systems-collapse-pair-q.txt](scripts/two-line-systems-collapse-pair-q.txt).

| β | 1. no unopposed joint rise | 2. no cheap optimum | 3. no single answer |
|--:|---|---|---|
| 0.02 | PASS (0/6 tables) | **FAIL** (2/6 cheap; cheap search median 92% of the best) | PASS (1/6; best 24 keep 96%) |
| 0.05 | PASS (0/6) | PASS (1/6; 80%) | PASS (0/6; 87%) |
| 0.1 | PASS (0/6) | **FAIL** (5/6; 100%) | PASS (0/6; 87%) |

- **Bug found and fixed (an easy really-high peak).** The first run valued No Fractions/answer-prime at 410–546 bits
  inside the energy window, and Right Angle/prime-divisor at up to 190: the prime hills carried the tail for primes
  WRITTEN as coefficients (½ bit per unit, the code's cost), but a pair's primes are derived. −9x + 14y + 5 = 0 with
  −2x + 3y − 104 = 0 divides by 1 and lands on (−1471, −946): |x| + |y| = 2417, a prime, for about 60 bits of φ. Pair
  layers no longer declare `measure: "prime"` (they take the size tail); after the fix the same hills top at 12 and
  16–18 bits. Far Crossing/far-prime still reaches 45–58 bits, honestly: its prime is a coefficient (x = 109) and its
  value tracks read length (correlation 0.7–0.8).
- **Test 2 fails at β 0.02 and 0.1** (open, reported). With the energy of a game, a 5,000-evaluation search reaches
  the best joint state of a table in 2 (β 0.02) to 5 (β 0.1) of 6 tables: the reachable set shrinks as β grows
  (2.5·10⁸ states at 0.1), and the tables' best states are near their births. This is the "no cheap optimum" failure the
  line variants also show; the remedies on the table are the deal (aspect-covering tables, §7) and wider energy, not
  the pool. Test 3 (plateaus) passes on the engine, unlike in the study (§4.4), at every β.
- **Births under C3**: a parallel pair is born about once in 50 (14% under the study's law), so the families that are
  undefined on parallel lines are rarely at their worst at birth.

### 8.1 The tension matrix and the starters in play (after #719)

The pair starters are the agents session's (#719, the guest two-line kit). On develop a `lines-pairs` game of three
practice partners plays end to end (artifacts/engine test/v2-game.test.ts, 8 of 8). The preset keeps v1's default board,
with its hidden half-life end; the test pins a fixed end.

**Tension matrix** (lib/v2-agents scripts/pair-tension.ts). The method is tension.ts's, on pairs. Each of the 16 rules
gets states up to 16 bits by subset simulation. Every call with arguments ≤ 8 bits (104 directions, on either line or
the system) is applied once, and again repeated 8 times. Output:
[scripts/two-line-systems-tension.txt](scripts/two-line-systems-tension.txt).

- When a move climbs one family, another family rises more often than it falls in **21 of the 56** ordered pairs. That
  is not 0: there is aligned drift. But none of those pairs is one-sided (the largest margin is 41% / 34%).
  No Fractions and Right Angle are the strongest adversaries: climbing Right Angle lowers No Fractions 67% of the time.
  Every family falls at least a quarter of the time under some other family's climbs.
- **A repeated basic strategy raises one family by more than 1 bit in 64% of runs**, two in 26%, three or more in 10%.
- **Found (decision 30's pattern, open, proposed to the coordinator): Steep Ratio and High Start share a hill.**
  - Repeating "stretch line 1 by 3" lifts both by about 1.7 bits per step. Each step is 3 bits of φ and ~14 energy.
  - Example: from −2x + 3y = 5 with x + 2y = 1, eight steps reach y = 4374x + 10935, which gives Steep Ratio
    (ratio-gap) 17.7 bits and High Start (steep-and-high) 17.0 bits for 110 energy. No dealt rule falls by more than
    a few bits along the way.
  - Why: both primaries reward the steeper line's size. Steep Ratio wants the steeper gradient large. High Start wants
    the steeper line's y-intercept large, and its steep-and-high tie-breaker asks for the gradient too. A stretch raises
    gradient and intercept together.
  - It is not an easy high peak: each rule stays inside its tail bound (bits ≈ 0.4 φ). It is an unopposed shared
    climb, worth ~1.2 joint bits per bit of φ.
  - Candidate fixes: an adversary on that anchor. For example, High Start could read the gentler line's intercept, or
    Steep Ratio could want the steeper line's intercept small. Either is a change to a rule, so it is the
    coordinator's to trial.


**Collapse test 4 (dynamics in play).** lib/v2-agents collapse-check.ts now plays pairs with the shipped Simple
starters. It runs them on the preset's own board: v1's economy, 10 starting objects, a birth every 10 s, 300 s. The
frozen share is over the pair's own calls (pairs have no line shortcut climber). Each β was played twice, on one table
(Whole Answer/south-west, Far Crossing/far-prime, High Start/start-factors). Output:
[scripts/two-line-systems-collapse-dynamics.txt](scripts/two-line-systems-collapse-dynamics.txt).

| β | 4. dynamics | idle | objects changing in the last minute | gains after the midpoint | frozen at the end | objects |
|--:|---|--:|--:|--:|--:|---|
| 0.02 | **FAIL** (a) | 94% | 25% (floor 25%) | 44% | 0% | 10 → 34 / 44 |
| 0.05 | **FAIL** (a) | 95% | 23% | 47% | 0% | 10 → 39 / 34 |
| 0.1 | PASS | 94% | 32% | 51% | 0% | 10 → 38 / 34 |

- **No convergence seen.** No object is frozen at the end: every one still has an improving move. Gains keep coming,
  about half of them after the midpoint, at every β.
- Check (a) fails by a hair at β 0.02 and 0.05. The cause is attention, not a fixed point: births bring the board to
  34–44 objects, and three seats change about a quarter of them in any minute.
- Not measured here: a shortcut climber for pairs, test 5 (disclosure), and more tables and seeds. Two games per β is
  a smoke test, not an estimate.

### 8.2 Trial: High Start on the gentler line (owner-decisions trial 21)

High Start now reads the gentler line's y-intercept, and its tie-breaker "high and rising" reads the gentler line's
gradient. Re-run before the dealt numbers (§8.3), the tension matrix shows the climb shared with Steep Ratio gone.
High Start's climbs raise Steep Ratio 28% of the time and lower it 38%; Steep Ratio's climbs raise High Start 21% and
lower it 21%. The shared hill of §8.1 does not appear in the repeated strategies.

### 8.3 Dealt numbers and drift (owner-decisions trial 22)

**Families.** Six families carry a number from their card, redrawn every 120 s on `lines-pairs` (drift, call 18):

- **A remainder.** Whole Answer's x, Far Crossing's x-intercept, High Start's y-intercept and Steep Ratio's whole
  number of times aim at a whole number that leaves r when divided by q.
- **No Fractions:** you divide by k.
- **Double Gap:** the y-gap is k times the x-gap.

Right Angle and Forty-Five have no natural number on the card and keep none. The kit gained
`nearestLeaving(v, q, r, atLeast)` (Python `nearest_leaving`), and every starter reads its rule's numbers.

**Which numbers are dealt.** The measured grid was q 3, 5 or 7 with every r coprime to q, plus k 1–6 and k 2–5:
116 rules with value functions. Two checks pick the dealt set.

- **Equal reach.** For each tie-breaker, a greedy climber from 40 births reaches within 1 bit of the family's median
  (scripts/pair-reach.ts; [scripts/two-line-systems-reach.txt](scripts/two-line-systems-reach.txt)).
- **Equal value.** The engine's equal-opportunity test: the value functions' top and median knots agree within 0.5
  bits.

Both checks together leave 16 numbers (lib/v2-pair families.ts `DEALT_NUMBERS`):

| Family | Dealt numbers |
|---|---|
| Whole Answer | (5, 2), (5, 3), (5, 4), (7, 5) |
| No Fractions | 1, 3 |
| Double Gap | 2, 3, 4 |
| Far Crossing | (5, 2), (5, 4) |
| High Start | (7, 2), (7, 3), (7, 5) |
| Steep Ratio | (5, 1), (5, 4) |

- **Thin, and why (open).** A value function's top knot is sampled to about ±0.5 bits, the size of the test's
  tolerance, so most of the grid fails on noise. More draws per pair value, or a tolerance against the knots'
  intervals, would let more through.
- **Unequal families (open).** Families' reach differs: a climber's median is about 5 bits on Far Crossing and High
  Start and about 11 on No Fractions. That is balance across rules (decision 42), which dealing numbers within a family
  does not fix.

**Bug found and fixed (an easy really-high peak).**

- **What happened.** On the dealt values the tension matrix found "stretch line 1 by 3", repeated, paying High Start
  (high and rising, q 7) **8,238 bits** at y = 59049x + 52488 beside x = −12. Two value functions had fitted a LINEAR
  tail on the intercept, 0.16 bits per unit.
- **Why it is wrong.** The pair law charges exactly 1 bit of φ per doubling of a coefficient, so a derived number of
  size N is reached for about log₂ N bits. Several other pair tails also rose 1.4–3 bits per doubling.
- **The fix.** Every pair size tail is now a log ramp of at most 1 bit per doubling (lib/v2-valuation value-pair.ts
  `PAIR_SIZE_RATE`). Tails were recomputed from the unchanged knots, and a regression test checks the found state
  against its φ.

**Measured on the dealt pool, after the fix.**

Tension matrix ([scripts/two-line-systems-tension.txt](scripts/two-line-systems-tension.txt)):

- In 26 of 56 ordered pairs the column rises more often than it falls, never by more than 50% / 40%.
- No Fractions keeps the strongest adversaries: Right Angle's and Forty-Five's climbs lower it 66% and 54% of the
  time.
- A repeated basic strategy raises one family by more than 1 bit in 52% of runs, two in 33%, three or more in 16%.
- The largest joint gain is 14.2 + 11.5 bits (High Start and No Fractions, "stretch line 1 by 2" eight times). That is
  under decision 40's "20 energy each on the same object".

Collapse check ([dynamics](scripts/two-line-systems-collapse-dynamics.txt),
[tests 2 and 5](scripts/two-line-systems-collapse-dealt.txt)):

| β | 2. no cheap optimum | 4. dynamics (v1 board) | 5. disclosure |
|--:|---|---|---|
| 0.02 | **FAIL** (3/8 tables cheap; search 87% of best) | PASS: 33% of objects change in the last minute, 43% of gains after the midpoint, 3% frozen | PASS (40/40 unidentified) |
| 0.05 | **FAIL** (3/8; 91%) | PASS: 29%, 48%, 3% | PASS |
| 0.1 | **FAIL** (5/8; 99%) | PASS: 28%, 44%, 1% | PASS |

- **Dynamics.** Play keeps moving and nothing settles; the narrow check (a) failures of §8.1 are gone.
- **Test 2 (open, reported).** It now fails at every β (before the dealt numbers: at 0.02 and 0.1). A 5,000-evaluation
  search with a game's energy finds the best joint state of 3–5 tables in 8. Drift moves that best state every 120 s,
  which test 2 does not model, so it measures one deal's landscape.

**Review fixes, after these measurements.**

- **Prime-factor counts.** The counts of prime factors (High Start's start-factors, Forty-Five's smooth-divisor) keep
  the line tail of ½ bit per factor, because k factors need a number of at least 2^k and so cost about k bits. The
  size rate would have flattened them. This touches 4 of the 38 value functions; the measurements above used the size
  rate there.
- **Titles.** No Fractions and Double Gap are titled "Divide By" and "Gap Ratio" (ids unchanged), since they are
  dealt k other than 1 and 2.
- **Not changed here, shared with lines, passed to the coordinator.**
  - The dealer weights a family by its number of dealt (numbers, tie-breaker) entries, and can seat one family twice
    with different numbers.
  - A bid card shows a family's first dealt numbers.

## 9. Ladders, the design-principles check, and the seating rule (15 November)

The coordinator's orders after #771: apply design-principles.md rows 1, 3 and 4 to every two-line family (the owner's
principles, not a trial; owner-decisions.md under trial 22), measure row 2 in play, guard the valuation ladders
(approved (a) ladders joined by a stretch, (b) starter shortcuts, (i) triangular rungs), and merge with the table.

### 9.1 What changed

- **Main parts are ladders with no top** (lib/v2-pair families.ts). Three kinds:
  - *residue ladder* (Right Angle's corner y, Forty-Five's |x| + |y|, Far Crossing's x-intercept): level j when the
    number leaves the dealt r mod q, then mod q², …, mod q^j (each level q times rarer);
  - *power ladder* (Divide By's |D|, Gap Ratio's y-gap over x-gap): level j at k^j;
  - *valuation ladder* (Whole Answer's y, High Start's gentler y-intercept, Steep Ratio's ratio): q^t·m with m ≡ r
    (mod q), level L the highest with L(L+1)/2 ≤ t (triangular rungs, approval (i)): the first rung is one stretch by q
    away, the next two, then three, so a stretch shortcut gets dearer per level.
  Within a level the score is q^L × (1 + 1/(1 + d)), d the distance to the next level's class.
- **Tie-breakers read what the main part attained** (row 3): Whole Answer's gcd(|X| + |n|, D) and X + n, Divide By's
  ω(|xD| + |yD|) and gcd(xD, yD), Right Angle's spf(|X| + |n|) and gcd(|X| + |n|, ⌊|m|⌋), Forty-Five's ω(n) and
  gcd(n, y-gap), Gap Ratio's gcd and spf of the gap, Far Crossing's n and spf(n), High Start's and Steep Ratio's
  readings of their n. A step up the main part moves n and restarts the tie-breaker's climb.
- **Dealt numbers** (row 4; `DEALT_NUMBERS`): measured at q 5 or 7 with every r for the valuation ladders (q 3 is too
  cheap: a cost-blind climber reached 34–51 bits), q 5, 7, 11 for the residue ladders. Dealt where the climber's reach
  is within 1 bit of the family's and the equal-opportunity audit passes (intervals, 1 bit under drift): Whole Answer 8,
  High Start 3, Steep Ratio 6, Divide By 6 (k 3, 4, 6, 9, 10, 11), Right Angle 10, Forty-Five 17, Gap Ratio 4 (k 2–5),
  Far Crossing 8.
- **Pair tails** grow at most 1 bit per doubling (`PAIR_SIZE_RATE`, the 8,238-bit bug of §8.3).
- **Starters** use the kit's ladder helpers (`ladder`, `valuationLadder`, `powerLadder`), stretch by their own q or k
  (`pairSteps(..., factors)`), and translate; Right Angle and Forty-Five reach 4 on their translate and slide moves.
- **Seating** (lib/v2-pair seating.ts, deal.ts, drift.ts): see §9.4.

### 9.2 The check table

Measured on the pool of §9.1: 40 games of 600 s without redraws (pool-dynamics `--drift 0`, simple starters, three
families a game; [0](scripts/two-line-systems-pool-dynamics-0.txt), [10](scripts/two-line-systems-pool-dynamics-10.txt),
[20](scripts/two-line-systems-pool-dynamics-20.txt), [30](scripts/two-line-systems-pool-dynamics-30.txt)); the tension
matrix ([tension](scripts/two-line-systems-tension.txt)); PMI ([pmi](scripts/two-line-systems-pmi.txt)). Row 7 is not
in design-principles.md.

| Family | 1 unbounded | 2 climbed late (40 games) | 3 tie-breaker from the main | 4 instances | 5 PMI (independent / aligned pairs) | 6 opposed by (lowers it) | 8 reach: end bits mean / max | 9 gain, objects moving late |
|---|---|---|---|---|---|---|---|---|
| Whole Answer | PASS: valuation ladder | 57% of 14 seats | PASS: reads n; 47% of main steps lowered it | 8 | 64% / 112 (all same-r or same-q: §9.4) | Divide By 43%, Steep Ratio 40% | 5.4 / 18.4 | 196; 40% |
| Divide By | PASS: power ladder | 55% of 11 | PASS: numerators over D; 27% | 6 | 84% / 0 | Steep Ratio 45%, Right Angle 44% | 3.7 / 11.0 | 176; 26% |
| Right Angle | PASS: residue ladder | **39% of 18** (starter: §9.3) | PASS: reads n; 10% | 10 | 72% / 68 (with Whole Answer, High Start) | Gap Ratio 51%, High Start 47% | 3.8 / 13.2 | 157; 43% |
| Forty-Five | PASS: residue ladder | **50% of 20** (starter: §9.3) | PASS: reads n; 15% | 17 | 69% / 6 | Gap Ratio 46%, Divide By 44% | 5.2 / 14.7 | 238; 42% |
| Gap Ratio | PASS: power ladder | 57% of 7 | PASS: reads the gap; 18% | 4 | 56% / 0 (177 anti-aligned) | Steep Ratio 35%, Forty-Five 34% | 5.8 / 11.0 | 262; 43% |
| Far Crossing | PASS: residue ladder | 57% of 14 | PASS: reads n; 1% | 8 | 82% / 0 | Divide By 19%, Whole Answer 18% | 4.4 / 11.4 | 227; 32% |
| High Start | PASS: valuation ladder | 67% of 21 | PASS: reads n; 7% | **FAIL: 3** | 78% / 62 (Whole Answer, Right Angle) | Steep Ratio 27%, Divide By 26% | 4.8 / 16.0 | 256; 34% |
| Steep Ratio | PASS: valuation ladder | 60% of 15 | PASS: reads the ratio; 17% | 6 | 97% / 0 | Gap Ratio 47%, High Start 33% | 7.7 / 18.0 | 286; 30% |

- **Row 1.** Every main part is a ladder: no state scores a maximum; the next level is always one class away.
- **Row 2, honestly.** The criterion is "at least two seats in three still stepping up their main part in the last
  third". Only High Start (67%) meets it; Steep Ratio is at 60%, five families at 55–57%, Forty-Five 50%, Right Angle
  39%. Every family climbs late in at least a third of its seats, and its progress is contested (below). The second
  clause (no seat on a level reached in the first two minutes) is not measured separately.
- **Row 3.** The share of a family's main-part steps that lowered its tie-breaker (pool-dynamics "main-part steps that
  lowered the tie-breaker"): the tie-breaker is reset by a step up wherever the share is well above 0. Far Crossing
  (1%) and High Start (7%) are weak: their tie-breakers (n itself, the factors of n) mostly rise with the step.
- **Row 4.** At least 4 everywhere but High Start. Its two tie-breakers' median knots spread 3.5–7.5 bits across its
  ten numbers, and only three pass the audit; the nearest four miss by 0.09 bits. The median knot by index moves with
  where a value function's knots cluster, so it may be the wrong statistic for a ladder (the coordinator's call). A
  greedy climber's reach per number: [scripts/two-line-systems-reach.txt](scripts/two-line-systems-reach.txt). The
  play, tension and PMI measurements were made on the ten numbers each before this cut.
- **Row 6.** The share of the row family's climbs that lower it, from the tension matrix (the best tie-breaker per
  family). Every family has an adversary lowering it at least a third of the time except Far Crossing (19%) and High
  Start (27%), the two weakest opposed.
- **Row 8.** Nothing near 30 bits: the highest end bits in 40 games are 18.4 (Whole Answer).
- **Row 9.** Mean points gained, best over worst family: **1.82** (Steep Ratio 286, Right Angle 157).

### 9.3 Right Angle and Forty-Five: the starter, not the rule

Their low late stepping is the starter's. Focus runs (12 games each, the family at seat 0 with each dealt number in
turn):

- **Right Angle.** The Simple starter climbs late in about 50% of seats, the Thorough starter about 70%.
- **Forty-Five.** The Simple starter, widened to reach 4 on its translate and slide moves, climbs late in about 75% of
  seats; Thorough about 58%.

A wider search reaches the next level, so the rule has rungs to climb late. The Simple starters are now widened
(reach 4). The 40 games above were played before that widening.

### 9.4 Guards on the valuation ladders, and the seating rule

- **No level pays more than its φ.** Pure stretching by q from a birth (gain per energy falls with the level):

  | Family (q) | start | after 15 stretches | energy |
  |---|--:|--:|--:|
  | High Start (7) | 4.7 | 24.4 | 393 |
  | Steep Ratio (5) | 6.1 | 19.6 | 319 |
  | Whole Answer (7) | 6.8 | 22.1 | 800 |

  Before triangular rungs, one level per stretch let High Start reach 59.3 bits in play; with them, play peaks at 18.4.
- **Contest.** Another seat's move lowered a family's main part on an object it had climbed 78 (Divide By) to 864
  (Right Angle) times in 40 games; the climber climbed back 24% (Divide By) to 68% (High Start) of the time.
- **Two seated rules raised by one move (found, fixed).**
  - *PMI* on 150 rules: 7,132 of 9,704 different-family pairs independent, 283 anti-aligned, **124 aligned** (> 2
    bits). All 124 are among Whole Answer, High Start, Right Angle and Forty-Five, and nearly all share a residue r
    (Right Angle {7, 3} × Whole Answer {7, 3}: 3.3 bits). Each reads a y that one stretch or translate moves for both.
  - *Tension matrix*: in 34 of 56 ordered family pairs the column rises more often than it falls. A repeated basic
    strategy raises one family by more than 1 bit in 49% of runs, two in 30%, three or more in 22%. The largest joint
    gain is Gap Ratio and Divide By, +10.9 bits each (a turn eight times making D = −9 and the gaps' ratio a power of
    3).
  - *The fix: a seating rule for pairs* (lib/v2-pair seating.ts). Forbidden at one table: one family twice; two of Whole
    Answer, High Start, Right Angle with the same r; Whole Answer with Forty-Five at the same (q, r); two valuation
    ladders with the same q (a stretch by q climbs both); Gap Ratio with Divide By on one base (k 2 and 4, 3 and 9). The
    deal takes the first shuffle without one (as the grids' rule), the game records any left, and drift never redraws a
    seat into a pair the current parameters do not already make.

### 9.5 Collapse check

Test 5 (disclosure) passes at every β (40/40 unidentified in 3,000 probes). Test 2 (no cheap optimum) with drift off
(the fixed deal) and on (one-seat redraws: whether the cheap best survives), before and after the seating rule:

