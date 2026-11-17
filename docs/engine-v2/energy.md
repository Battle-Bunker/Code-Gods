# The dynamic energy measure

Owner decision 49 (16 November): "energy of an object is the expected energy cost of reaching a state at least this good
from a random object of the same 'size'". This replaces the value tables (decision 23), levels and the lift. Labels:
**built** (in the code, tested), **seen narrowly** (measured under the stated assumptions), **guess**.

## Lines on the owner's definition of 17 Nov (built: lib/v2-linear energy.ts, lens-routes.ts; v2-core free-energy.ts)

    energy(s) = mean over K = 12 starts x of c(x),   c(x) = −log2 Σ over distinct one-turn routes 2^−bits(route)

- **Lenses** (built: the game's own, lens-moves.ts, seen through lens-routes.ts' `Lens`): gradient and y-intercept (m top, m
  bottom, c top, c bottom); x- and y-intercepts; a, b, c; gradient and signed area (c's sign kept from the line before).
  Every fraction is a pair of whole numbers in lowest terms, bottom > 0.
- **A route's bits** (built): the cheapest turn in any lens that names the target: its mutations' naming bits
  (v2-core surprise.ts `namingBits`, menu of six: add, multiply, divide exactly, negate, swap, round) plus the turn's
  surprise (`turnSurprise` over the lens's numbers before and after). Per number the cheapest list is one add, one
  multiply or divide (with a negate), a negate, or a negate then an add (across zero an add's long path is dear); per
  pair a swap or a round may come first, and the target may be written unreduced (25/4 → 26/4 names 13/2 with one add).
- **Starts** (built): each whole number of the rule's lens (`reads`: c or m → gradient and y-intercept, X → the
  intercepts, gen → a, b, c, area → gradient and area, its starts drawn in the gradient-and-y-intercept lens) with log2 |n|
  uniform in [log2 |n|, log2 |n| + ½), a Latin hypercube across the starts, tops either sign; a pair sharing a factor
  is drawn again.
- **Routes** (built): the direct turn onto s, a greedy climb in each lens (the rule's own lens first; steps of ±1, ±2,
  ±4^j, ×/÷ 2, 3, 10, negate, swap, round; at most six steps; given up 16 bits past the best route), and the rule's
  `candidates` (its old searches' targets).
- **Time and spread** (seen narrowly: one good line per rule from its candidates, its first dealt parameters, six seeds,
  Node on this machine): 0–60 ms an estimate; repeat sd 2–9% for most rules, 16–25% for Power Hug and Circle Kiss.
  In the Convex runtime (seen narrowly: artifacts/engine test/v2-energy-cost.test.ts, one Lines · beginner game, the local backend on this machine, 17 Nov): a commit (every seat's energy on the changed line) took a median 155 ms and at most 207 ms over 20 commits; a look at every object a median 107 ms and at most 162 ms. The test fails past 600 ms; Convex stops a mutation at 1 s. The lenses and their prices are the game's own (lens-moves.ts: each mutation which + where + argument + continue bit, the lens named once a turn).

### Spot check: does the universal climb alone match the best route found with candidates? (seen narrowly)

Same lines, K = 12, six seeds (72 starts each, starts already as good left out): the universal routes (climb and
direct) were the cheapest route on 56 of 72 starts for **Multiples**, 17 of 72 for **Fine Bottom** and 12 of 72 for
**Square Triangle** (Circle Kiss 72 of 72; Stepping Coefficients 10, Next-door Bottom 4, Prime Hug 23 of 69). So the
candidates set the energy for the fraction and area rules, which is what the definition guards against; how much they
lower it is not measured. How this could be wrong: one line per rule; the climb's six steps and coarse amounts are this
build's choice, and a longer climb would match more often.

### Fine structure: Unit Fraction, Prime Sliver and Crossing Pattern (17 Nov, a coordinator's trial)

Measured first (seen narrowly): under the old formulas (1/n nearest the reading, 4 × the distance off) their good lines
cost 0–0.3 bits, because 69–72 of 72 same-size starts were already as good: size-only rules in disguise. The
coordinator redesigned them as fine-structure rules on the whole numbers they read, counted in whole units, so a
same-size start almost never qualifies (the owner: rules "that grow in utility and energy in fine structure rather
than magnitude"):

| Rule | Reads | Utility (bigger better) | Space |
|---|---|---|---|
| Unit Fraction | c | the bottom's last digits matching the dealt digits repeated (counted from the right) − (\|top\| − 1)³ | 99 suffixes |
| Prime Sliver | m | e·log2 p for p^e dividing the bottom − log2 (the rest of the bottom) − log2 \|top\| | p a prime 2–199 (46) |
| Crossing Pattern | X | leading continued-fraction whole parts of \|X\| matching the dealt pattern repeated − ¼ × the whole parts after the first miss | patterns of 1–3 digits 1–4 (84) |

Energy against depth (seen narrowly: one line per depth, K = 12, mean of three seeds; lib/v2-linear scripts/depth-probe.ts):

| Unit Fraction 3: c = 1/13, 1/133, 1/1333, 1/13333, 1/1333333, 1/133333333 | 11, 17, 24, 30, 44, 57 bits |
|---|---|
| Prime Sliver 3: m = 1/3, 1/3², 1/3⁴, 1/3⁶, 1/3⁹, 1/3¹² | 6, 9, 16, 22, 31, 41 bits |
| Crossing Pattern 1: X = 5/3, 13/8, 55/34, 233/144, 1597/987 (4–16 ones) | 6, 14, 24, 33, 46 bits |

Built and tested (test/dynamic-families.test.ts): energy rises with depth for each, and at most one of 12 same-size
starts already qualifies at the deepest state tested. The agents' scores follow (lib/v2-agents dynamic-catalogue.ts,
both languages tested against the engine). A finite continued fraction ends in a whole part of 2 or more, so the
pattern "1" always misses its last term ([1; 1, …, 1, 1] is written [1; 1, …, 2]); harmless, every state pays it.
How this could be wrong: one line per depth; a random same-size start is the definition's reference, and players reach
these states by multiplying or by adding to a digit tail, which may be cheaper than this estimator's routes find.

## The estimator before 17 Nov (deleted)

What follows described the estimator that the section above replaces (act charges, `LINE_K`, floor and heuristics);
it is kept for the record of measurements made with it.

### How it was computed

A rule family with `dynamic` (lib/v2-core contracts.ts) has a utility `u` (any real function of the state, bigger
better), the readings it `reads`, and its own `searches` (heuristics that propose target states). The object type's
`estimate` computes, for a state s:

    energy(s) = mean over K starts x of min(direct(x → s), floor(x), heuristics(x))

- **Starts** (lines, lib/v2-linear energy.ts `sameSize`): a random line whose read numbers (gradient m, y-intercept c)
  each have s's information content: as many binary digits in the top and in the bottom (lowest terms; each log2 uniform
  in [log2, log2 + ½)), either sign; the other reading from the law. Fresh randomness each time.
- **direct**: the cheapest one or two solved moves onto s itself (the ceiling).
- **floor**, shared by every rule: each single move with a solved amount onto one of s's readings (either sign, or the
  reading rounded to a whole number, ten or tenth), its crossing and area, the shortcuts (mirrors, stretch by 2, 3, ½,
  ⅓, 1/10, −1, and `si.round`), and a shortcut followed by a solved move (simplify first: round-then-solve,
  divide-then-solve). A route counts when it reaches u ≥ u(s).
- **Descent** (built 16 Nov): `si.round` rounds the gradient or the y-intercept to the nearest whole number, ten or
  tenth, priced as two choices. It has no inverse. The dynamic measure needs no exact potential (energy is re-estimated
  from starts, not read from a stationary law), so a one-way move is allowed. The birth walk never takes a one-way move (v2-core `walkStep`
  stays put when it draws one, and `cycleDiagnostic` skips them), so births keep the law π ∝ 2^−φ.
- **Fraction fees** (17 Nov, the owner: "it should cost information to mutate a denominator to a bigger value"): an
  amount p/q has size |p| + ⌈log2 q⌉ (v2-core codes.ts `amountSize`; whole numbers keep |k|), and the rational code's
  rate is re-solved so births keep the law. A shift by 1/97 costs 115 energy (was about 11,650), 1/7 costs 39 (was
  92), 1/1000 costs 198; a shift by 97 costs 11,659 (was 11,651). Re-measured below: padding still does not pay (ratio
  about 1·10⁻⁷: the act's surcharge for the state's growth still prices it).
- **Padding does not pay** (`test/energy.test.ts`, seen narrowly: one test rule u = −|c − 867|, K = 400, line-q
  prices; re-measured 17 Nov with the digit fees: E(867) = 548, E(8,670,001/10,000) = 573, cheapest padding found
  2.4·10⁸). E(867) = 549, E(8,670,001/10,000) = 573: the padded state scores the plain one plus about three roundings
  (8.4 each), because its starts round to numbers within a binary digit of 867's starts. The cheapest padding found
  (a shift by 1/10,000, a stretch by 8,670,001/8,670,000, or two stretches) costs about 7·10^8, so the ratio of energy
  gained to energy spent padding is about 3·10^−8. How this could be wrong: a cheaper padding path than the three tried
  (the ratio is an upper bound only over those), or a rule whose rounded neighbour is worse than the padded state (then
  rounding gives no route and the padded starts are dearer).
- **heuristics**: the family's targets, reached by solved moves onto the readings that differ, from the start and from
  where each shortcut lands. Adding a heuristic only lowers the estimate on the same starts (tested).
- **Price**: the game's own act charge for each move as its own act (`changeCharge`), so energy is in the units players
  pay. The scoring trial used its friction floor instead; that was a comparison only.
- K = 8 on the server (`LINE_K`; 12 until 17 Nov, lowered for the commit's time, below).

## Where it runs (built)

- A commit (loop.ts `valuesAt`) estimates every seat's energy for the changed line: the leaderboard's numbers. Points
  are still own energy × the others' energy summed. That product still rewards states good for several rules at once,
  and nothing here breaks it.
- A look (`object.look`) estimates the looker's own energy afresh, so the same line reads differently each time.
- Rules in this measure have no table, so `rule.values` and `rule.worth` say so. Agents' hosts value states by energy
  (own bits, `othersAfter` and the commit clause; seeded by the act's seed, so one act sees one number per state).
- **Cost in the Convex runtime** (seen narrowly, test/v2-energy-cost.test.ts: one Lines · beginner game, four seats,
  the local backend on this machine, 17 Nov): a commit (every seat's energy on the changed line) took a median 302 ms
  and at most 431 ms at K = 12, and 199 ms (max 430, a cold start) at K = 8; a look at every object at most 254 ms at
  K = 12 and 173 ms at K = 8. Convex stops a mutation at 1 s; the test fails past 600 ms. How this could be wrong: the
  cloud runtime is slower or faster than this machine; more seats cost proportionally more; a far-off state can take
  longer than the sample (every utility bounds its own search at 10^10).
- Seen narrowly: a 60-world-second Lines · beginner game with three practice partners ran to its end on the local
  backend (test/v2-game.test.ts), with no function-limit warnings. One estimate takes 1–35 ms in Node (K = 12, the eight
  families on a few sample lines). One outlier, a far-off state under a trial family, took 0.9 s, so a utility must
  bound its own search: every dealt family treats numbers past 10^10 as out of reach.

## The dealt line families (lib/v2-linear dynamic-families.ts)

| Family | Reads | Utility (bigger better) | Pulls | Space |
|---|---|---|---|---|
| Power Hug | c | √(log2 P) − \|c − P\|³, P the nearest power of k (the owner's example) | up, precise | k 2–40 |
| Prime Hug | m | √(log2 p) − \|m − p\|³, p the nearest prime ending in the suffix | up, precise | 444 suffixes |
| Multiples | c | (log2\|n\| − √\|c − n\|) × (k's in n − other factors): the owner's example | up | k 2–12 |
| Fine Bottom | c | log2 (k-part of c's bottom) − 2 log2 (rest of the bottom) | fractions | k 2–9 |
| Next-door Bottom | m | log2 gcd(\|top\| + t, bottom) − log2 (the rest of the bottom) | fractions | t 1–9 |
| Unit Fraction | c | the bottom's last digits matching the suffix repeated − (\|top\| − 1)³ (fine structure, 17 Nov) | finer bottoms | 99 suffixes |
| Prime Sliver | m | e·log2 p for p^e dividing the bottom − log2 (rest of the bottom) − log2 \|top\| (17 Nov) | deeper powers of p | 46 primes |
| Crossing Pattern | X | leading continued-fraction whole parts of \|X\| following the pattern − ¼ per whole part after the first miss (17 Nov) | longer patterns | 84 patterns |
| Stepping Coefficients | a, b, c | log2 max(\|a\|, \|b\|, \|c\|) − 2(\|b − a − d\| + \|c − b − d\|), ax + by + c = 0 in lowest whole numbers, b > 0 | up, in steps | d ±1–30 |
| Circle Kiss | m, c | ½ log2(p² + q²) − 4 \|c²/(1 + m²) − R²\|, m = p/q: touch the circle of radius R (Pythagorean tilts) | finer tilts | R 1–60 |
| Square Triangle | m, c (the area c²/2\|m\|) | log2 n − 2√\|area − n²\|, n the multiple of k with n² nearest | area up | k 2–30 |

Changes of 16 Nov (step 2 of the cutover): Smooth Hug left (one of four y-intercept hugs); Crossing Sliver, Stepping
Coefficients, Circle Kiss and Square Triangle joined. Eleven are dealt: four want small or fine numbers (Unit Fraction,
Prime Sliver, Crossing Sliver, and Fine Bottom/Next-door Bottom's fine bottoms), six want big ones. Circle Kiss and
Square Triangle are this pool's own formulations of the reserve ideas (A22, A28 in layered-line-rules.md), not their
tuples: Square Triangle asks for a square area n² (n a multiple of k) rather than a square triangular number, whose
ladder (36, 1225, 41616, …) has too few rungs. The floor also gained a route through a mirror and back (reflect, one
solved move, reflect back): without it the x-crossing could only be moved by a dear sized amount, and Crossing Sliver's
energies were about a thousand times its peers' on the same lines (seen narrowly: six sample lines, K = 12).

The old families stay in the code; they are not dealt on Lines · beginner. The other line presets still use tables until
those are deleted.

## The design-principles check, adapted (docs/engine-v2/design-principles.md)

Labels as above. Several rows assumed tables or tie-breakers, and the adaptation says how.

| Row | Status |
|---|---|
| 1 Unbounded main part | Built: every utility rises without bound (powers, primes, factor counts, bottoms, 1/n, the biggest coefficient, the tilt's hypotenuse, the square's side). |
| 2 Climbed all game | Not measured. Guess: the up-pulling hugs climb by power or prime steps, each far bigger than the last, so they are slowed by price, not by a top. |
| 3, 3a Tie-breaker tied to the main part | Adapted: no tie-breakers. Precision is a term of the utility (cubed or ×4 distance to the anchor the main part chose), so a step to a new anchor restarts the precision climb. |
| 4 Dealable instances | Built: large spaces (RuleFamily.space); two peers listed per family. |
| 5 Perpendicular | Not measured: the PMI table is computed from value tables (exempt in v2-rule-check). |
| 6 Opponents | By construction: on c, Power Hug and Multiples pull the y-intercept up while Unit Fraction wants its top 1 and a long digit tail on its bottom (Fine Bottom wants a bottom of k's: the two bottoms disagree); on m, Prime Hug pulls up, Prime Sliver wants a bottom that is a power of p, Next-door Bottom a bottom dividing top + t; on the x-crossing, Crossing Pattern wants a continued fraction of small dealt whole parts against Square Triangle's big area (area = \|c·X\|/2); Stepping Coefficients' big a, b, c oppose every rule that wants a simple gradient or intercept; Circle Kiss ties c to m (c² = R²(1 + m²)). |
| 7 Kinds | Powers, large primes, k-multiples, denominators of a base, divisibility of top + t by bottom, digit tails of a bottom, prime-power bottoms, continued-fraction patterns, arithmetic steps, Pythagorean tilts, square areas: no kind shared by more than two. |
| 10 Small bump | Not measured. Guess: the cubed terms make every off-anchor bump expensive in utility, but energy, not utility, is paid, so the loss is the energy of a slightly worse state. |
| 12 Writable from the card | Each card states the formula in words. Not tested with a reader. |
| 13 Lives on the rationals | Fine Bottom, Next-door Bottom, Unit Fraction and Prime Sliver need fractions by construction (their bottoms carry the score), Crossing Pattern a fractional crossing past its first whole part; Circle Kiss's tangent lines have fractional gradients (p/q from a triple) and intercepts (R·h/q); Stepping Coefficients' lines have gradient −a/(a + d). |

How this could be wrong: K = 12 is noisy. A rule whose good states are cheap from most same-size starts scores near 0
however good it is. The floor and heuristics are only what is coded, so a cheaper route nobody coded overvalues a state.

## Grids (17 Nov)

Every grid setup deals nine rules, each ONE pure function from the 4 × 4 board to a real number (lib/v2-grid
dynamic-families.ts; the old grid families are one line each in old-rule-ideas.md).

### The estimator on the owner's definition of 17 Nov (built; lib/v2-core free-energy.ts, lib/v2-grid energy.ts)

The owner: a state's energy for a rule is "the surprise of reaching a value at least this good from a random start that
is augmented by rule-specific heuristics primarily for performance, in a way that makes evaluated energy less sensitive
to those particular heuristics".

    energy(s) = mean over starts x of c(x),   c(x) = −log2 Σ over distinct one-turn routes 2^−bits(route)

- **Bits** (built): energy is bits, no factor. A grid has no size, so a turn costs naming bits only: per mutation,
  which move (log2 12), which cells or lines (log2 of the choices), the amount (v2-core surprise.ts `argBits`: a
  self-delimiting code and a sign bit, 4 bits for ±1, 8 for ±9) and one "continue" bit. Changing one cell by ±1
  names 12.6 bits. The direct rewrite and the anchors price a changed cell at the ±1 rate (a cheap floor).
- **Starts** (built): uniformly random boards, stratified: across the K = 20 starts each cell's digit is a
  Latin-hypercube draw (each digit twice).
- **Routes per start** (built), in order of importance: (1) universal, no rule code: the direct turn onto s (rewrite
  the cells that differ: the ceiling) and a cost-aware greedy climb over every single mutation of the variant (the best
  utility gain per naming bit, the gain capped at what is still needed, until u ≥ u(s)); (2) the rule's: the separable
  rules' cheapest group rewrites onto their anchors (a Pareto front per group, merged; up to four boards) and
  `candidates` (Adding Rows solves a line, Census fixes a surplus cell at a time, Snake lays each of the ten snakes).
  Distinct routes (by target board) are summed; c(x) = 0 when x already qualifies. The climb runs last and gives up
  once it is 16 bits dearer than the best route found (it would add under 2^−16).
- **A candidate only lowers c(x)** (built, tested: test/energy.test.ts): the soft minimum over a larger set of routes.
- **Spread and time** (seen narrowly: one climbed board per rule, its first dealt parameters, 8 seeds, Node on this
  machine): repeat sd 2–7% of the energy, mean 3.3%; 12–36 ms an estimate. `Estimate.spread` reports the standard
  error of the mean over the starts. In the Convex runtime (seen narrowly: test/v2-energy-cost.test.ts, one Grids ·
  beginner game, the local backend, 17 Nov): a commit took a median 155 ms and at most 200 ms; a look at every object a
  median 140 ms and at most 172 ms.
- **Which route wins** (seen narrowly, same boards, K = 20, six seeds): the universal climb is the cheapest route on
  70–100% of starts for six rules (Census and Snake: all), on 52% for Adding Rows, and on about 30% for Row Multiples
  and Power Diagonals, where the anchors (whole rows or diagonals onto multiples or powers) win. Climbed boards cost 40–95 bits; random boards 0–10.
- How this could be wrong: the climb takes one step at a time, so a route that needs a worse board on the way (a row
  rewritten through a poor middle) is found only by a rule's anchors; the direct turn rewrites cell by cell, so a
  rearrangement onto s (a swap, a turn) is priced higher than its own naming; K = 20 is still noisy on states whose
  starts split between "already there" and "far".

- **One-digit boards** (the Seesaw and Mirrormancer bug): each parameter space leaves out the instances whose anchors
  hold a one-digit row, column or box (1111 × d): Row Multiples' k never divides 1111 × d, Prime Columns' 1111 × d + t is
  never prime, Square Boxes' 1111 × d − j is never a square. Tested: no one-digit board comes within 1 of a climbed board
  on any dealt rule (lib/v2-grid test/dynamic-families.test.ts).

| Rule | Reads | Utility (bigger better) | Instances |
|---|---|---|---|
| Row Multiples | rows as numbers | Σ rows log2(1 + n) − 4 log2(1 + \|R − n\|), n the multiple of k nearest | 71 (k 7–199) |
| Prime Columns | columns as numbers, + t | Σ columns log2 p − 4 log2(1 + \|C + t − p\|), p the nearest prime | 283 (t 0–999) |
| Square Boxes | corner boxes, clockwise | Σ boxes log2(1 + n) − 4 log2(1 + \|B − j − n²\|) | 92 (j 0–99) |
| Light Rows | rows: digits and number | Σ rows log2(1 + R) − 3 \|digit total − T\| | 21 (T 10–30) |
| Mirror Gap | mirror pairs | Σ pairs (a + b)/4 − 2 \|a − b − d\| | 36 (4 mirrors × d 1–9) |
| Power Diagonals | the two diagonals | Σ diagonals log2 P − 4 log2(1 + \|D − P\|), P the nearest power of b | 29 (b 2–30) |
| Adding Rows | three rows (or columns) | log2(1 + C) − 4 log2(1 + \|A + B − C\|) | 24 |
| Census | the multiset of digits | −Σ digits \|count − dealt count\| | 112,035 count vectors |
| Snake | the snake path | −Σ steps (distance of the step from +s round 0–9) | 72 |

The design-principles check (design-principles.md, adapted as above; labels as above):

| Row | Status |
|---|---|
| 1 Unbounded main part | Not possible on a finite board: every utility has a top. Each top is far (seen narrowly: climbed boards cost 40–95 bits against 0–10 for random ones, 17 Nov estimator), and the rules' tops disagree (row 6). |
| 2 Climbed all game | Not measured. |
| 3, 3a Tie-breakers | None by design (decision 50): precision is the 4 log2(1 + distance) term. |
| 4 Dealable instances | Built: 21 to 112,035 per rule (above); two peers dealt each. |
| 5 Perpendicular | Not measured (the PMI table needs value tables). |
| 6 Opponents | By construction: rows read as numbers (Row Multiples, Light Rows, Adding Rows) cross columns (Prime Columns), boxes (Square Boxes) and diagonals (Power Diagonals) in every cell, each on a different anchor set; Light Rows keeps most of a row 0 against every rule that wants big numbers; Census fixes how many 9s (and 0s) the board may hold against all of them; Snake wants every neighbour to differ by s, against every repeated digit; Mirror Gap ties each cell to its mirror. |
| 7 Kinds | Multiples, primes, squares, digit totals, mirror differences, powers, sums of numbers, counts, steps round a clock: no kind shared. |
| 10 Small bump | Not measured. Guess: one cell off an anchor costs 4 log2 2 = 4 in utility on the rules that read numbers. |
| 12 Writable from the card | Each card states the formula in words. Not tested with a reader. |
| 13 Many values | By construction: every utility is a real number over 10^16 boards. |

How this could be wrong: K = 8 is noisy; the heuristics price group rewrites by single-cell acts only (a row move or a
swap can be cheaper, so a good board can be overvalued); the one-digit test checks the dealt peers only (the spaces
exclude every instance a one-digit board tops by construction, but a two-digit board may come close on some).

## Fraction-native rules after the digit fees (seen narrowly, 17 Nov)

One decent state per rule (its first dealt parameters), its energy at K = 40, and what it costs to reach from eight
newborn line-q lines (each move its own act at the act charge, surcharge included): rounding the read reading to a
whole number then one solved move, or the solved move alone. A player's income is about 2,530 a game.

| Rule | State | u | Energy | Round then solve: median (min) | Solve alone: median |
|---|---|---|---|---|---|
| Unit Fraction (3) | c = 1/23 | 4.5 | 5 | 2,170 (196) | 7,482 |
| Prime Sliver (3) | m = 1/23 | 4.5 | 7 | 46,868 (278) | 57,040 |
| Crossing Sliver (7) | y = 2x − 2/17 | 4.1 | 10 | 1,067 (221) | 8,059 |
| Fine Bottom (k 2) | c = 1/8 | 3.0 | 38 | 318 (69) | 1,000 |
| Next-door Bottom (t 1) | m = 15/16 | 4.0 | 29 | 18,479 (687) | 33,396 |

The rules on the y-intercept are now reachable within an income from a typical newborn; the two on the gradient are
not from the median newborn (its gradient's own size is the cost: the tilt's numerator, not the fraction), only from the
better ones. Energies are small because same-size starts reach these states cheaply through the shortcuts. How this could
be wrong: one state per rule, eight starts, and only these two routes (a stretch or a mirror first can be cheaper).
