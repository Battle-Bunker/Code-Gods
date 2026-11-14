# Systems of two and three lines (B): objects, mutators, rules and measurements (14 November 2026)

Status: design and measurement, written independently of the parallel study A. Nothing in the engine changes. The
script is [`scripts/multi-line-systems-B.mjs`](scripts/multi-line-systems-B.mjs) (self-contained, seeded, about four
minutes: `node docs/engine-v2/scripts/multi-line-systems-B.mjs`); its full output is
[`scripts/multi-line-systems-B-results.md`](scripts/multi-line-systems-B-results.md).

The owner's brief, verbatim: "Start up some new parallel work to design rules and mutators for two and three line
systems, which are also within reach for bright 12yos I think."

---

## In plain words

**The object.** One object is a *system*: two or three straight lines held together, the way a school exercise holds
two equations together ("2x + 3y = 12 and x − y = 1"). Each system is its own universe: a rule reads only that system.
Lines are labelled (red, blue, green) and must be different from each other; two may be parallel.

**What a child sees.** The equations stacked as at school; the graph with the lines crossing; the crossing point (the
answer to the simultaneous equations); for three lines, the triangle they make. Every primary rule is something a
bright 12-year-old can check: "the answer should be whole numbers", "the lines should cross at a right angle", "all
three corners of the triangle on grid points", "two sides the same length", "the balance point on a grid point".

**What is new in the moves.** Lines act on each other. *Add 2 × equation B to equation A* (the school's elimination
step) turns line A about the crossing and leaves the answer where it is. *Reflect A in B* uses B as a mirror. *Turn A
a quarter turn about where it meets B*, *slide A along B*, *slide where A meets rail B one notch along B* (three lines).
These are the owner's "operations in a different basis or flips around other lines": shortcuts priced as choices, with
the information in the mirror or basis line paid for by the read-length surcharge when that line was built and again
when the image comes out messy.

**What the measurements say.**

1. **The landscape is much bigger than one line's.** The law spreads over 13.6 bits of collision entropy for two lines
   and 22.0 for three (one line: 6.4). The states reachable for a given price grow ×1.49 (two lines) and ×1.79 (three
   lines) per bit of budget, against ×1.31 for one line, so ten moves reach roughly 10^10 and 10^13 systems: nobody
   enumerates them. A strong search (100,000 evaluations) and a medium one (20,000) disagree on the best state of 10 of
   the 16 three-seat tables.
2. **Rules are entangled unevenly, which is the political structure the owner asked for.** Some pairs help each other
   (Meeting Point and Rails, +0.62 correlation of the bits a move changes), some fight (Square Cross and Mirror Twins,
   −0.35; Right Triangle and Even Gradients, −0.25), many barely touch (near 0).
3. **The big-prime ramp of single lines is mostly gone.** One-sentence attacks that grow a prime ("x = 0 and x + p·y
   = 0") gain about 2 to 3 bits while read length grows by 60: a prime made out of several coefficients is not rare,
   so it is not worth much. 7 of 24 two-line rules and 6 of 27 three-line rules still climb with each doubling of the
   budget, but slowly.
4. **A bug, reported: tie-breakers that count something growing with size are a steep ramp through smooth numbers.**
   "Lattice points inside the triangle" (Pick) grows with the triangle's area, and a huge triangle is cheap to write
   with smooth numbers (x + y = 13,824). Isosceles with that tie-breaker goes from 7.3 to 19.5 bits while read length
   grows by only 10 bits, and energy-limited climbers drove systems to lines like y + 912,384 = 0. Such tie-breakers
   must not be dealt (§3.4 lists replacements).
5. **Cheap search is not enough on most tables, but not on all.** A 2,000-evaluation search reaches 95% of the strong
   search on 3 of 8 two-line tables and 2 of 8 three-line tables. And on 8 of 10 sampled tables the best twelve
   distinct states keep 80–100% of twelve copies of the best: many good systems lie along one free direction (keep y = x, vary the
   other line), so uniqueness costs little. Both are failures of the landscape analysis's tests 2 and 3 on part of the
   pool; §4.6 says where they come from.
6. **In play, short-sighted climbers freeze and planners keep moving.** One-call points climbers slow to a few moving
   objects; climbers that look at two-call plans keep 4 to 8 of 12 objects moving, with moves that help two or more
   seats at once to the end; "help the table" climbers freeze after the first fifth.

**Revision B2 (§8), after two owner rules that arrived once this was first merged.** A secondary must be tied to the
primary's anchor ("a secondary that seeks to maximise the largest common factor of that closest integer with the floor
of the gradient"), and unbounded "bigger is better" hills are wanted, provided each hill has adversaries and the pool
has deliberate tensions (decision 30). So point 4 above is no longer a defect in itself: it is the cheapest hill, and
the question is who opposes it. §8 gives a tied pool of 8 families and 16 rules, half of them preferring small,
negative or many-factored values, and measures alignment and tension pair by pair and per mutator. Off the hills, rules
barely touch (174 of 224 ordered pairs neutral). On joint hills, while one rule keeps climbing and the partner's
primary is held, there are 64 adversary pairs, 7 allies and 137 neutral, out of 208. Every one of the 16 hills has
at least one adversary; Steep and Steep-and-High are the one strong alliance. That meets "few aligned", but not yet "many
in tension": §8.4 says what to add.

**Recommended first cut** (§6): the two-line system on the rationals, the line's nine mutators per line plus four
system mutators (elimination, reflect in the other line, slide along the other line, translate the whole picture),
and five families whose tie-breakers are not size counts. Three lines next, after replacing the size-count
tie-breakers and dealing tables whose rules together read every degree of freedom.

---

## 0. Where this comes from: what children already do with two and three lines

- **Simultaneous equations.** Solved by elimination ("add the equations to get rid of y"), by substitution, and by
  drawing the graphs and reading the crossing. Every one of these is a lens here: elimination is a mutator, the graph
  and the stacked equations are representations, the crossing is a derived element.
- **Parallel and perpendicular.** "Same gradient means parallel; gradients multiplying to −1 means perpendicular" is
  the first fact children learn about two lines at once.
- **Triangles on a grid.** Geoboards with rubber bands, area by counting squares, the triangle's corners as crossing
  points; the centroid as the balance point of a cardboard triangle.
- **Reflections in mirror lines.** Children reflect shapes in y = x and x = 2; here a line is reflected in a line.
- **Puzzles.** Elimination behaves like a twist puzzle's move: it changes the equation but keeps one thing fixed (the
  answer). Rails borrow from slide rules and railway sleepers: a line crossing two notched rails. The mirror is a
  kaleidoscope.

## 1. The object and its lenses

### 1.1 State

A system of k lines (k = 2 or 3) is an ordered tuple of k lines on the rational domain (spec §12.1: each line a
primitive integer triple (a, b, c) of a·x + b·y + c = 0 with the sign rule). The lines must be pairwise different
(a call that would make two equal is refused both ways, so the walk stays reversible); parallel lines are allowed and
leave the elements that need their crossing undefined.

- **Read length** φ = Σ over lines of mixedInt(a) + mixedInt(b) + mixedInt(c) (spec §12.2), so the stationary law is
  the product of k line laws restricted to distinct lines. The gravitational centre is {y = 0, x = 0} for two lines
  (φ ≈ 12.2) and that pair plus y = ±x or a line one unit off an axis for three.
- **Degrees of freedom:** 2k (4 and 6); integers stored: 3k.
- **Uniqueness** (owner decision 24) is identity of the whole tuple. Because Σπ² is 2^−13.6 and 2^−22 (measured, §4.1),
  the uniqueness correction of spec §2.6 is negligible for systems.
- **One universe per object.** A rule reads only its own system; "one line acts on another" happens inside the object.

### 1.2 Representations

| Id | Scene | Coordinates (written by mutators) | Derived | Dynamic |
|---|---|---|---|---|
| `eqs` the equations, stacked: aᵢx + bᵢy = eᵢ | equation | aᵢ, bᵢ, eᵢ per line | — | `value(i, px, py)` |
| `si` per line: y = mᵢx + cᵢ | equation | mᵢ, cᵢ | — | `y(i, q)` |
| `graph` | plane | the lines | crossings Pᵢⱼ, "parallel" notes, intercepts | `pointAtX(i, q)` |
| `solve` (elimination and Cramer's rule) | table | — | Dᵢⱼ = aᵢbⱼ − aⱼbᵢ ("the number you divide by"), the numerators, x*ᵢⱼ and y*ᵢⱼ, the combination that eliminates x or y | — |
| `angle` | plane | — | dotᵢⱼ = aᵢaⱼ + bᵢbⱼ; tan θᵢⱼ = Dᵢⱼ/dotᵢⱼ (rational); perpendicular gap \|dot/D\| | — |
| `pencil` (two lines) | plane | the crossing P and the two gradients | — | — |
| `axis-tri` (two lines) | plane | — | the triangle the two lines make with the x-axis: vertices, area, interior lattice points | — |
| `tri` (three lines) | plane | — | corners, side lengths², area (= det³ˣ³² / 2\|D₁₂D₂₃D₃₁\|), centroid; circumcentre and orthocentre (rational) | `pegs` |
| `rails` (three lines) | rulers | — | for line i and rails j, k (crossing O = Pⱼₖ, notches one primitive step of each rail apart): sᵢ, tᵢ, where i meets each rail in notches | — |
| `mirror` | plane | — | — | `refl(i, j)`: line i reflected in line j |

Shared meanings: `crossing(i, j)` (graph.Pᵢⱼ, solve.x*ᵢⱼ/y*ᵢⱼ, a corner of tri), `divisor(i, j)` (solve.Dᵢⱼ,
angle.Dᵢⱼ), `gradient(i)`.

A few facts the lenses make visible, all exact:

- **Elimination keeps the divisor:** D(A + n·B, B) = D(A, B). The school's step changes the equation, not the answer and
  not the number you divide by.
- **Reflection multiplies it:** reflecting A in B gives the triple |n_B|²·A − 2(n_A·n_B)·B, so the divisor becomes
  |n_B|²·D/g (g the common factor removed). A mirror with lots of information (|n_B|² large) makes a messy image.
  Reflecting in y = 2x turns y = 0 into 4x + 3y = 0: lines with gradient 2 make 3-4-5 directions.
- **Tan of the angle between two rational lines is rational** (D/dot), so "how steeply they cross" is an exact number
  a rule can grade.

## 2. Mutators

### 2.1 The list

The price is the spec's (§5.2, §12.4): which (log2 N) + where (log2 k for one line, log2 k(k − 1) for an ordered pair)
+ choices, with one size priced so the whole fee is rate(o)·σ, plus the surcharge max(0, Δφ). N = 12 on two lines, 13
on three. The fees below are for the smallest argument, before the surcharge.

| Id | Lens | Arguments | Effect | Collateral (what else moves) | Fee, 2 lines / 3 lines (bits) | Inverse |
|---|---|---|---|---|---|---|
| the line's nine (`si.shift`, `si.tilt`, `seq.step`, `cart.pivot`, `cart.slide`, `cart.mirror`, `gen.nudge`, `int.move`, `mach.stretch`) | per line | as spec §12.4, plus the line (log2 k) | one line moves | every crossing on that line, the angles at it, the triangle | shift 5.64 / 6.32; nudge 7.18 / 7.88 | as spec |
| `sys.translate` | graph | (u, v) | every line slides by (u, v) | crossings, corners, centroid move by (u, v); angles, divisors, area, rails unchanged; intercepts change | 5.64 / 5.75 | (−u, −v) |
| `sys.mirror` | graph | axis: x, y, origin, diagonal (2 bits) | the whole picture is mirrored | orientation; everything about the origin and axes | 5.58 / 5.70 | self |
| `pair.combine` (elimination) | eqs, solve | ordered pair (i, j); n ≠ 0 | equation i += n × equation j; refused when the result has a common factor (it would be divided through: one-way) | line i turns about Pᵢⱼ: Pᵢⱼ and Dᵢⱼ stay, the angle at Pᵢⱼ, line i's other crossings and the triangle change | 5.61 / 7.29 per unit of n | n → −n (or n again when the sign rule turns the result over; the fee is the same) |
| `pair.reflect` | mirror | ordered pair (i, j) | line i reflected in line j | Pᵢⱼ stays; the angle flips; line i's coefficients grow by up to \|n_j\|² (the surcharge) | 4.58 / 6.29 + surcharge | self |
| `pair.quarter` | angle | (i, j); ± (1 bit) | line i turns a quarter turn about Pᵢⱼ | Pᵢⱼ stays; the angle becomes its complement; undefined if i ∥ j | 5.58 / 7.29 | the other direction |
| `pair.turn` (designed, not in the measured set) | pencil | (i, j); k ≠ 0 | gradient of line i += k, about Pᵢⱼ (a pivot whose anchor is read from line j, so the anchor costs nothing) | as quarter | about 5.6 / 7.3 per unit | k → −k |
| `pair.slideOn` | graph | (i, j); n ≠ 0 | line i moves parallel to itself so that Pᵢⱼ moves n primitive steps along line j | Dᵢⱼ and every angle stay; intercepts and line i's other crossings move | 5.61 / 7.29 per step | n → −n |
| `rail.move` (three lines) | rails | line i, which rail (6 choices); n ≠ 0 | where line i meets rail j moves n notches along j; where it meets rail k stays | the triangle's corner on rail k stays, the other two corners move; area changes linearly in n | 7.29 per notch | n → −n; refused both ways when the result passes through the rails' crossing or is parallel to a rail |
| `sys.straighten` (designed, deferred) | rails | two rails (j, k) | the affine map taking rail j to y = 0 and rail k to x = 0 (notches to units); line i becomes x/sᵢ + y/tᵢ = 1 | everything but the rails' coordinates of line i is lost | choice + φ(j) + φ(k): the call names the frame it removes | `sys.bend(j₀, k₀)`, whose arguments are the two rails, coded at their read length |

### 2.2 Exact potential and where an equal-fee inverse fails

Every mutator above pays the same fee as its inverse and differs only by the surcharge, so the walk is Metropolis on φ
and the law is exactly π ∝ 2^−φ restricted to distinct lines (spec §5.3's gate). The places this needs care:

- **`pair.combine`** would be one-way if a result with a common factor were divided through (as `gen.nudge`, spec §12.4);
  it is refused instead, both ways.
- **`pair.quarter`, `pair.turn`, `pair.slideOn`, `rail.move`** are undefined where the crossing or the frame is
  (parallel lines, a line through the rails' crossing). The refusal is symmetric, so detailed balance holds; the
  inverse is "partial" in the spec's sense.
- **`sys.straighten`** has no inverse among ordinary calls: undoing it must name the two rails it erased, which is
  information from scratch. It keeps an exact potential only if both directions pay the frame's code as a handling fee
  (then the undo costs about twice the rails' read length: once in fee, once in surcharge). This is the owner's
  "expensive to introduce a line with lots of information in it from scratch" made literal; deferred because it lets a
  system jump to the centre in one act.
- **Reflection in a line built for the purpose.** A cheap image needs a mirror with small |n|², and a mirror with
  large |n|² was dear to build (its φ was paid as surcharge) and makes a dear image. Nothing more is needed.

## 3. Rule families

Every family: a primary a 12-year-old can check (a distance, smaller is better, its top is exactly 0, many states
reach it: owner decision 5's collisions), then one of several tie-breakers (bigger is better, unbounded, mostly
reading *a different aspect* of the system: the owner's "secondaries should add entanglement with another aspect").
Three tie-breakers grade the primary's own target in the owner's own pattern ("smallest prime factor of that
integer"); they are marked *same*. Undefined primaries (parallel lines, a vertical line where a gradient is read) score
worst.

### 3.1 Two lines (8 families, 24 dealt rules)

Tie-breakers: `det-spf` the smallest prime factor of the divisor D (angle aspect); `answer-spf` of |X| + |Y| for the
grid point nearest the crossing (crossing aspect); `angle-cf` the number of steps Euclid's algorithm takes on tan θ =
D/dot (angle); `gap-spf` of the whole number nearest the gap between the y-intercepts (gap); `tri-pegs` the lattice
points inside the x-axis triangle (triangle; **not to be dealt**, §3.4).

| Family | Primary (the card) | Aspect | Tie-breakers | Undefined | Best draw (bits) |
|---|---|---|---|--:|--:|
| `whole-answer` | Solve the two equations: the answer (x, y) should be whole numbers. ‖x*‖ + ‖y*‖ | crossing | det-spf, tri-pegs, angle-cf | 4% | 15–24 |
| `square-cross` | The lines should cross at a right angle (gradients multiply to −1). \|dot/D\| | angle | answer-spf, gap-spf, tri-pegs | 4% | 15 |
| `square-triangle` | The triangle with the x-axis should have an area close to a square number. | triangle | root-omega (*same*: Ω of the root), angle-cf, answer-spf | 20% | 14–18 |
| `on-the-diagonal` | The lines should cross on y = x. \|x* − y*\| | crossing | det-spf, gap-spf, tri-pegs | 4% | 14–16 |
| `whole-distance` | The crossing should be a whole distance from (0, 0): x*² + y*² close to a square. | distance | root-spf (*same*), angle-cf, gap-spf | 4% | 14–23 |
| `mirror-twins` | The lines should be mirror images in the y-axis. \|m₁ + m₂\| + \|c₁ − c₂\| | symmetry | det-spf, tri-pegs, answer-spf | 16% | 11 |
| `gap-match` | The gap between the y-intercepts should equal the gap between the x-intercepts. | gap | answer-spf, angle-cf, det-spf | 29% | 15–17 |
| `steep-ratio` | One line should be a whole number of times as steep as the other (2, 3, 4, … times). | gradient | k-spf (*same*), tri-pegs, answer-spf | 29% | 17–29 |

### 3.2 Three lines (9 families, 27 dealt rules)

Tie-breakers: `area-spf` (area aspect), `det-min-spf` the smallest of the three divisors' smallest prime factors
(angles), `angles-cf` Euclid's steps over the three tan θ (angles), `centroid-spf` (centroid), `st-spf` and
`root-omega` (*same*), `pegs` (corners and area; **not to be dealt**, §3.4). A degenerate triangle (three lines through
one point) is undefined for every triangle family except Meeting Point, which wants it.

| Family | Primary (the card) | Aspect | Tie-breakers | Undefined | Best draw (bits) |
|---|---|---|---|--:|--:|
| `grid-triangle` | All three corners of the triangle on grid points. | corners | area-spf, det-min-spf, angles-cf | 10% | 14–15 |
| `square-area` | The triangle's area close to a square number. | area | root-omega, centroid-spf, det-min-spf | 10% | 10–14 |
| `meeting-point` | Make the little triangle as small as you can: best of all, all three lines through one point. | concurrency | det-min-spf, centroid-spf, angles-cf | 9% | 13–18 |
| `right-triangle` | The triangle should have a right angle. min \|dot/D\| | right angle | area-spf, pegs, centroid-spf | 10% | 15–22 |
| `isosceles` | Two sides of the triangle the same length. | sides | det-min-spf, pegs, centroid-spf | 10% | 13–20 |
| `balance-point` | The balance point (the average of the corners) on a grid point. | centroid | area-spf, angles-cf, pegs | 10% | 13–14 |
| `rails` | Two lines are rails with notches; the third should cross both rails exactly at notches. | frame | st-spf, area-spf, det-min-spf | 10% | 14–15 |
| `even-gradients` | The three gradients go up in equal steps (the middle one halfway between the others). | gradients | area-spf, pegs, centroid-spf | 25% | 14–16 |
| `mirror` | One line is a mirror: the other two are reflections of each other in it. | mirror | area-spf, det-min-spf, pegs | 44% | 10–12 |

"Best draw" is the rarest score among 60,000 tilted draws of the law, so it is where the value functions stop being
measured, not a top: every tie-breaker is unbounded. Past it the script extrapolates conservatively (§4.3).

### 3.3 Trying to break them: one-sentence solutions

Every primary has a one-sentence family, by design (they are school checks): two lines through a lattice point (Whole
Answer), normals (a, b) and (−b, a) (Square Cross), both through (t, t) (On the Diagonal), a crossing at a multiple of
(3, 4) (Whole Distance), y = mx + c and y = −mx + c (Mirror Twins), y = x and y = kx (Steep Ratio); three lines with
unimodular normals (Grid Triangle), x = 0, y = 0 and anything (Right Triangle), x = 0, y = 0, x + y = n (Isosceles),
three lines through one point (Meeting Point), the axes as rails (Rails), gradients 0, 1, 2 (Even Gradients), y = mx + c
and y = −mx − c with mirror y = 0 (Mirror). The question is whether the *tie-breaker* then has a cheap ramp. Measured
(script part `attack`; bits at p ≈ 7, 23, 61, 127):

| Attack | Rule | Bits | φ |
|---|---|---|---|
| x = 0 and x + p·y = 0 | whole-answer/det-spf | 5.7 → 6.8 → 7.5 → 8.0 | 19 → 79 |
| perpendicular through (0, 0), a² + b² prime | whole-answer/det-spf | 6.6 → 8.3 | rising with a, b |
| x = 0, y = 0, x + y = p | rails/st-spf | 9.3 → 11.2 → 11.8 → 12.3 | 28 → 88 |
| y = 0, y = x, y = −x + 2p | isosceles/pegs | 6.9 → 10.0 | 32 → 92 |
| **x = 0, y = 0, x + y = n, n smooth (16, 96, 1,024, 13,824)** | **isosceles/pegs** | **7.3 → 9.0 → 12.2 → 19.5** | **28 → 38** |
| same | right-triangle/pegs | 4.1 → 10.7 | 28 → 38 |
| same | balance-point/pegs | 0.9 → 14.2 (n = 13,824) | 28 → 38 |

- **Prime ramps are weak on systems.** A prime that is a derived number (a divisor, a crossing's coordinate, a rail
  product) is common among systems, because many cheap coefficient sets produce it; its value grows by about 2–3 bits
  while read length grows by 60. Compare one line's Prime Landing, whose bits track read length one for one.
- **Mirror Twins' det-spf is dead.** At its primary's top D = 2ab, so the smallest prime factor is always 2. Its
  tie-breakers need replacing (gap-spf or angle-cf would work: the twins' crossing is (0, c), their angle tan is 2m/(1 −
  m²)).
- **The count tie-breakers are the bug (next section).**

### 3.4 The bug: size counts reached through smooth numbers (reframed by decision 30, §8.1)

`tri-pegs` and `pegs` count lattice points inside a triangle, which grows with its area (Pick: about the area). A
triangle's area is a product of intercepts, and an intercept can be huge and cheap at once when it is smooth: x + y =
13,824 (2⁹·3³) costs about 18 bits to write. Under the law, P(pegs ≥ N) falls only like a power of N, so bits rise like
log N, about 2·log2 n for legs n, while φ rises like log2 n for smooth n. The ratio is above 1: each bit of read length
spent buys more than a bit of value. That is a steeper ramp than one line's big-prime ramp, and it has a one-sentence
solution ("the axes and x + y = a big power of two").

The climbers found it under a realistic energy budget: on the table with Right Triangle/pegs and Balance Point/pegs,
the planners' best object was "x = 0; x + 910,080y = 0; y + 912,384 = 0" (§4.5). Only the box (|coefficient| ≤ 10^6)
stopped them. The same route serves, less steeply, any tie-breaker read off the area, which is a product: on the table
with Square Area/root-omega (the owner's example 2 moved to triangles) and Right Triangle/area-spf the planners built
"y − 414,720 = 0" (2¹⁰·3⁴·5), although test 1 measured square-area/root-omega climbing only 7.2 → 7.4 → 8.8 bits.

**Recommendation (superseded by §8.1: unbounded hills are wanted if they have adversaries):** no dealt tie-breaker on systems counts something that grows with size (lattice points, area, a
perimeter, a run that lengthens with size). Tie-breakers read prime structure or coincidences of derived numbers
(smallest prime factor of a divisor or of a target, Euclid's steps, Ω of a root), which the measurements show grow
slowly. Replacements for the dealt pool: `tri-pegs` → `angle-cf` or `gap-spf`; `pegs` → `centroid-spf`,
`det-min-spf` or `angles-cf`. A size count may still be a *primary* graded against a dealt target ("exactly 12 pegs
inside"), where its top is not at the edge.

## 4. Measurements

All from the script; the results file has every table in full.

### 4.1 Degrees of freedom and concentration

| Object | Integers | Degrees of freedom | Collision entropy (bits) | Median φ | Draws with a crossing undefined |
|---|--:|--:|--:|--:|--:|
| one line (line-q) | 3 | 2 | 6.4 | 13.7 | – |
| two lines | 6 | 4 | 13.6 | 28.4 | 14% |
| three lines | 9 | 6 | 22.0 | 43.1 | 35% |

The one-line figure reproduces spec §2.6 (Σπ² = 0.012 on line-q). Two and three lines sit between one line and the
4×4 grid's 39 bits: room for coincidence rules near the centre (landscape-analysis proposal 3). Parallel pairs are
common because a line is horizontal half the time at the centre (a = 0 with probability ½).

### 4.2 Reachable states per budget

States within a total price W of a birth (Dijkstra over the calls climbers consider: small arguments of every
mutator), four births each:

| Object | W ≤ 8 | W ≤ 12 | W ≤ 16 | W ≤ 20 | growth per bit |
|---|--:|--:|--:|--:|--:|
| one line | 8–12 | 22–61 | 66–197 | 192–569 | ×1.31 |
| two lines | 12–24 | 32–129 | 150–410 | 451–1,924 | ×1.49 |
| three lines | 15–44 | 33–77 | 215–1,702 | 720–5,819 | ×1.79 |

A unit move costs 5–8 bits, so W = 20 is about three moves. Extrapolating the growth to W = 60 (about ten moves) gives
very roughly 10^7 lines, 10^10 two-line systems and 10^13 three-line systems: enumeration, which solved line-z
exactly, is out of reach.

### 4.3 Value functions

bits(s) = −log2 π{at least as good}, from 60,000 draws per size of a mixture of tilted laws (t = 1, 0.75, 0.55, 0.4,
0.3; weights π/q, self-normalised; the same sampler as spec §7.0, re-implemented in the script). They are measured to
about 15–25 bits. Past the best draw, the script extrapolates along the tie-breaker at the top primary by the more
modest of a linear and a logarithmic fit, so far tails may be undervalued, never overvalued by the fit. 100% of the
tail (draws worth ≥ 8 bits) sits at the primary's top for every family except the mirror families (1% and 33%): the
primaries are easy and crowded, the tie-breakers carry the high bits, as decision 12 intends.

### 4.4 Entanglement

For pairs of families (default tie-breakers): over random single calls from moderately rare states, the correlation
of the changes in the two rules' bits. Selected (full matrices in the results file):

| Two lines | | Three lines | |
|---|--:|---|--:|
| steep-ratio × gap-match | +0.37 | meeting-point × rails | +0.62 |
| on-the-diagonal × gap-match | +0.29 | meeting-point × grid-triangle | +0.37 |
| whole-answer × on-the-diagonal | +0.26 | meeting-point × balance-point | +0.35 |
| whole-answer × steep-ratio | 0.00 | right-triangle × isosceles | +0.22 |
| square-triangle × square-cross | 0.00 | mirror × everything | −0.02 to +0.07 |
| square-cross × gap-match | −0.13 | isosceles × even-gradients | −0.19 |
| square-cross × mirror-twins | −0.35 | right-triangle × even-gradients | −0.25 |

The collateral reach (the share of calls that move one rule by a bit or more and also move the other) runs from 2% to
71%. That is the shape the owner asked for: "highly entangled ... but it's also ok for some rule pairs to be less
entangled than others". Nothing here is a fixed alliance: the correlations are of *changes*, averaged over states, and
change sign locally.

### 4.5 Scripted climbers (test 4: does play keep moving?)

Three seats, three rules, 12 unique objects, 1,500 acts; seats start with 600 ⚡, earn 24 ⚡ per act offered, hold at
most 1,920 ⚡ and pay W + 0.05·W² per act (about 3,150 ⚡ per object at most over the run, near the landscape
analysis's 2,475 ⚡ line share). Per fifth of the run: calls committed / objects that moved / commits that raised two
or more seats' bits.

| Table | Seats | First fifth | Last fifth |
|---|---|---|---|
| two lines: square-triangle + gap-match + whole-answer | points | 125 / 10 / 63 | 26 / 2 / 7 |
| | planner | 196 / 12 / 89 | 74 / 6 / 16 |
| | table | 53 / 10 / 36 | 0 / 0 / 0 |
| two lines: square-triangle + whole-distance + mirror-twins | points | 163 / 12 / 58 | 43 / 3 / 7 |
| | planner | 236 / 12 / 86 | 138 / 8 / 11 |
| | table | 115 / 12 / 44 | 0 / 0 / 0 |
| three lines: isosceles + right-triangle + balance-point | points | 127 / 11 / 61 | 26 / 1 / 0 |
| | planner | 253 / 12 / 153 | 50 / 4 / 6 |
| | table | 93 / 11 / 53 | 0 / 0 / 0 |
| three lines: square-area + right-triangle + rails | points | 129 / 11 / 48 | 26 / 2 / 8 |
| | planner | 235 / 12 / 73 | 70 / 6 / 6 |
| | table | 70 / 11 / 25 | 0 / 0 / 0 |

- **One-call climbers stall on needles**, as on single lines (landscape-analysis §2, "frozen at small radius"):
  exact coincidences are isolated, so no single call improves.
- **Two-call planners keep moving to the end** and keep finding moves that help two or more seats. Their table mean F
  rose 1.0–1.8× from the first fifth to the last and was still rising on two of four tables.
- **"Help the table" seats freeze within the first fifth.** A seat that will not lower its own points in a three-rule
  table runs out of moves almost at once: the rules' improvements conflict locally. That is not collapse onto a shared
  state (each object froze somewhere different), but it is a still board.
- **The planners spent their energy on the size-count ramp** (§3.4) on the pegs tables. Rerunning with those
  tie-breakers replaced is the first thing to do once the families are in the engine.

### 4.6 Collapse tests (landscape-analysis.md §4)

| Test | Two lines | Three lines | Reading |
|---|---|---|---|
| 1. No ramp (each rule alone, searched within budgets 30, 60, 120 bits: bits grow >10% at each doubling with φ rising) | 7 of 24 ramp | 6 of 27 ramp | Slow ramps: whole-answer/det-spf 9.4 → 10.9 → 14.1 bits as φ goes 28 → 43; the pegs rules ramp steeply off this search's reach (§3.4). |
| 2. No cheap optimum (2,000 evaluations reach 95% of 100,000) | 3 of 8 tables fail | 2 of 8 fail | The strong search is not converged either: its 20,000-evaluation run disagrees with it on 5 two-line and 5 three-line tables (twice it found better). |
| 3. No single answer (best 12 distinct keep < 70% of 12 × the best) | 4 of 5 fail (65–100%) | 4 of 5 fail (59–98%) | Counting mirror and rotated copies as one changes little (58–99%), so it is not symmetry. |
| 4. No convergence in play | passes for planners; one-call and table seats freeze | same | §4.5 |
| 5. Disclosure | not re-run | not re-run | A property of what the game discloses, not of the object. |

**Why test 3 fails, and what to do about it.** The top states of a table come in one-parameter families: "y = x, and
4y = −kx ± 51 for several k"; "x + 1,080y + 4 = 0 and two lines through the origin". In a table of three rules whose
aspects do not between them read every degree of freedom, the free direction is a plateau, and every point on it is a
distinct, equally good state, so uniqueness costs nothing. Two remedies, both configuration:

- **Deal tables whose rules cover the system's degrees of freedom.** Each family's aspect is listed in §3; a table of
  three should read at least four aspects between primaries and tie-breakers on two lines (six on three), e.g. a
  crossing rule, an angle rule and a gap or distance rule. The dealer can check this from the declared aspects.
- **Prefer tie-breakers that read the aspect the table's primaries leave free.** The tie-breaker menu already reads
  different aspects from its primary; a deal that picks tie-breakers to cover the gaps closes most plateaus.

Test 2's failures are not explained yet. The failing tables mix aspects as much as the passing ones; two of the three
failing two-line tables carry a tie-breaker that is dead or nearly constant at its primary's top (mirror-twins and
steep-ratio with tri-pegs), which flattens the landscape, and the third (whole-distance/gap-spf + square-triangle/angle-cf
+ steep-ratio/k-spf) has a best state the cheap, medium and strong searches all found: "x + 3,002y − 27 = 0; x + 2y −
27 = 0". More tables are needed before saying which deals fail.

## 5. Storyboards

### 5.1 Two lines: Whole Answer, tie-breaker "the divisor's smallest prime factor" (`whole-answer/det-spf`)

1. **The card.** "Solve the two equations: the answer should be whole numbers. Tie-breaker: when you solve them you
   divide by a number (the divisor); the bigger its smallest prime factor, the better."
2. **The object.** Stacked: 2x + 3y = 12 and x − y = 1. On the graph a red and a blue line cross at (3, 2). The crossing
   glows: whole numbers, the main part is at its top.
3. **The tie-breaker.** The solve view shows the elimination worked out and the divisor: 2·(−1) − 1·3 = −5. Smallest
   prime factor 5.
4. **Trying elimination.** The child adds 2 × blue to red: 4x + y = 14. The red line turns about (3, 2); the answer is
   still (3, 2), and the divisor is still −5. The solve view says so: elimination never changes the divisor. A useful
   discovery, and a cheap move to know to avoid.
5. **Trying the mirror.** Reflect red in blue: 3x + 2y = 13. Still through (3, 2), divisor still −5 (the blue mirror
   x − y = 1 has |n|² = 2, and the factor 2 divides out).
6. **Turning the blue line.** Turn blue about the crossing, steeper by 2: y = 3x − 7, i.e. 3x − y = 7. Still through
   (3, 2); divisor 2·(−1) − 3·3 = −11. Smallest prime factor 11: more bits.
7. **The collateral.** Blue's y-intercept moved from −1 to −7. Another player's Gap Match rule (the gap between the
   y-intercepts) just changed, and so did the triangle the lines make with the x-axis. The child sees their value
   rise and the peer sum change: the start of a conversation.

### 5.2 Three lines: Grid Triangle, tie-breaker "every divisor has a big smallest prime factor" (`grid-triangle/det-min-spf`)

1. **The card.** "All three corners of the triangle on grid points. Tie-breaker: each pair of lines has a divisor (the
   number you divide by to find their corner); the smallest prime factor among the three, the bigger the better."
2. **The object.** x = 0, y = 0 and x + y = 6: a right triangle with corners (0, 0), (6, 0), (0, 6), all on the grid.
   Main part at its top. The divisors are all ±1: tie-breaker at the bottom.
3. **The tension.** A corner of two lines whose divisor is a prime p is a grid point only if p divides both of Cramer's
   numerators: a coincidence. Making the divisors bigger tends to push corners off the grid.
4. **Rails.** The child switches to the rails view: y = 0 and x = 0 are rails, the third line crosses them at notches 6
   and 6. Moving where it meets the x-rail one notch, to 7, gives 6x + 7y = 42: every corner still on the grid, divisors
   1, 6 and 7. The two rails' own divisor is 1, so the minimum stays at the bottom whatever the third line does: the
   rails themselves must change.
5. **Changing a rail.** They turn x = 0 about (0, 0) into 2x + 3y = 0. The corner with x + y = 6 moves to (18, −12),
   still whole, because that pair's divisor is 2·1 − 1·3 = −1. The pair with y = 0 now has divisor 2. The minimum is
   still 1: every pair must change, and every change risks a corner.
6. **Hunting.** The child learns the rule of thumb from the solve view: divisors with big prime factors and whole
   corners need the lines' constants to be multiples of those primes. They nudge the third line's constant to a
   multiple, slide it along a rail, check the three corners. Each step is a small move; the best combinations are
   rare and scattered.
7. **The collateral.** Each corner they move changes the triangle's area (Square Area's rule), its balance point
   (Balance Point) and whether it is still right-angled (Right Triangle). Who wants what decides which climb the table
   takes together.

## 6. What the engine needs, and a recommended first cut

**Needs.**

- **Variants** `system-q2` and `system-q3`: line-q's domain with `linesPerObject` 2 and 3 (exists, as line-z4 does),
  plus a flag that rules score the *object* (spec §4.2 and §12.6 evaluate per line today; `ObjectEvaluation.score` is
  null for multi-line objects) and that lines within an object are distinct.
- **Pair sites.** `Mutator.perSite` becomes `"line" | "pair" | false`; a pair site is an ordered pair priced log2
  k(k − 1); element refs gain pair elements (`P12`, `D12`, `L1→L2:refl`).
- **Representations** `eqs`, `solve`, `angle`, `pencil`, `axis-tri`, `tri`, `rails`, `mirror` (§1.2), with marks for
  crossings and triangles (spec §4.3's polygon, shade and match marks are already specified).
- **Mutators** `sys.translate`, `sys.mirror`, `pair.combine`, `pair.reflect`, `pair.quarter`, `pair.turn`,
  `pair.slideOn`, `rail.move`; each under lib/v2-linear's potential test (every move and its inverse, equal fees).
- **Valuation** by direct draws (spec §7.0) on the system law: the product of line-q laws restricted to distinct lines.
  No exact sums yet. The uniqueness correction is negligible (Σπ² ≤ 2^−13.6).
- **Views:** the plane with two or three coloured lines and their crossings; the stacked-equation scene; a worked
  elimination (the solve view); the rails view (spec §11's `rulers` scene fits).
- **The deal** reads families' declared aspects (§3) and refuses tables that leave degrees of freedom unread (§4.6).

**First cut.** Two lines only, on the rationals:

- mutators: the line's nine per line, plus `pair.combine`, `pair.reflect`, `pair.slideOn`, `sys.translate`;
- families and tie-breakers: `whole-answer` (det-spf, angle-cf), `square-cross` (answer-spf, gap-spf),
  `on-the-diagonal` (det-spf, gap-spf), `whole-distance` (root-spf, angle-cf, gap-spf), `steep-ratio` (k-spf,
  answer-spf). No `tri-pegs`;
- then measure again: the collapse tests with aspect-covering deals, and the climbers with the pegs tie-breakers gone.

Three lines next: the same contracts plus `rail.move` and `pair.quarter`, families `grid-triangle`, `meeting-point`,
`right-triangle`, `isosceles`, `balance-point`, `rails` with `pegs` replaced, and `mirror` reworked (it is undefined on
44% of draws and its tie-breakers rarely separate states).

## 7. What this does not settle

- The value functions are sampled and stop at about 15–25 bits; nothing here has an exact sum.
- The climbers see small arguments only and no births; the energy model is the landscape analysis's, simplified.
- The script re-implements the spec's codes and prices; it does not run the engine, so its prices may differ from
  lib/v2-linear's in small ways (the factor code's rate, the Q amount code).
- `pair.turn` and `sys.straighten` are designed but not measured.
- Whether the dealer's aspect-coverage check is enough to pass test 3 is a prediction, not a measurement.

## 8. Revision B2: tied secondaries, unbounded hills and deliberate tensions

### 8.1 The two new rules

Relayed by the coordinator after the first version merged, verbatim:

- "Secondary rules should tie to the primary in some way even if they invoke an extra dimension of the object. For
  example, a primary that seeks proximity to integers in the y intercept could have a secondary that seeks to maximise
  the largest common factor of that closest integer with the floor of the gradient. That's better than a secondary that
  just independently wants the gradient to be close to a large prime."
- Decision 30: "I absolutely want bigger is better mechanics so there are unbounded hills to climb. We just need to make
  sure there are adversaries to ongoing expensive climb of those hills and we should create diversity of goals so that
  it's rare for optimising just one thing, like finding a large prime in the x-intercept, to straightforwardly benefit
  multiple rules at once. Introduce more variety of the set of rules so that it's harder to improve multiple rules at
  once with a basic strategy. Also deliberately introduce rules that are in tension with one another. We want rules that
  prefer small values and lots of prime factors instead of large primes and more interesting interactions like wanting
  high gradient and y intercept so the X intercept that another player wants big will be small and negative etc."

What changes here:

- **§3's secondaries are mostly independent wishes.** "The divisor's smallest prime factor" does not mention the
  primary's anchor, the answer. They fail the first rule; §8.2 replaces them.
- **§3.4 is no longer a defect in itself.** A size-count hill reached cheaply through smooth numbers is an unbounded
  hill, which is wanted. What decision 30 asks is whether it has adversaries. The finding stands as a fact about cost:
  smooth numbers make size cheap, so a size hill needs at least one rule that prefers the opposite (small, negative,
  or one big prime factor rather than many small ones).
- **The ramp test (§4.6, test 1) is not a failure test any more.** It now measures how steep each hill is.

### 8.2 The tied pool (two lines, 8 families, 16 rules)

Each family has an **anchor**, the whole number its primary closes in on. Each secondary relates the anchor to another
aspect of the system. Senses are mixed: "big" hills, "small" hills (as negative as possible) and "smooth" hills (as many
prime factors as possible). A common factor with an anchor of 0 counts as 1, so the trivial anchor earns nothing.

| Family (primary) | Anchor | Secondary A | Secondary B |
|---|---|---|---|
| `whole-answer` (the answer whole) | X + Y of the answer | `answer-divisor`: common factor of X + Y and the divisor (big) | `south-west`: X + Y as negative as possible (small) |
| `square-cross` (a right angle) | the divisor (a² + b² at a right angle) | `divisor-factors`: Ω of the divisor (smooth) | `divisor-meets-intercept`: common factor of the divisor and red's y-intercept (big) |
| `on-the-diagonal` (cross on y = x) | t, the whole number nearest the crossing | `north-east`: t as big as possible (big) | `diagonal-gradient`: common factor of t and the steeper gradient's whole part, the owner's example (big) |
| `whole-distance` (a whole distance from (0, 0)) | r, the distance | `distance-factors`: Ω of r (smooth) | `distance-divisor`: common factor of r and the divisor (big) |
| `steep-ratio` (one line k times as steep) | k | `steep`: the steeper gradient's whole part (big) | `ratio-gap`: common factor of k and the y-intercepts' gap (big) |
| `far-crossing` (red's x-intercept whole) | red's x-intercept | `far-right`: as big as possible (big) | `crossing-share`: common factor of red's x- and y-intercepts (big) |
| `high-start` (red's y-intercept whole) | red's y-intercept | `steep-and-high`: the smaller of it and red's gradient, as big as possible, so red's x-intercept is small and negative: the owner's example of an opposite to `far-right` (big) | `start-factors`: Ω of what the y-intercept shares with the divisor (smooth) |
| `gap-match` (equal gaps) | the y-intercepts' gap | `small-gap-factors`: Ω of the gap (smooth) | `gap-divisor`: common factor of the gap and the divisor (big) |

Designed oppositions: `south-west` against `north-east`, and `far-right` against `steep-and-high`. The divisor is
pulled four ways: by common factors with the answer, the distance, the gap and the y-intercept, and toward many small
factors.

### 8.3 Measured: alignment and tension

Script parts `tension`, `adversaries` and `hills`; every matrix, pair by pair and per mutator, is in the results file.

**Anywhere** (calls from moderately rare states; ordered pairs of rules from different families): 30 aligned, 16 in
tension, 174 neutral, 4 mixed. Off the hills, rules barely touch. Every secondary counts only at its own primary's
top, and two primaries are seldom both at their tops by chance.

**On joint hills** is where tension counts: states where both rules' primaries are at their tops, the ground a
cooperating pair stands on. Joint states were found for 104 of 112 pairs. Of the calls that raise rule i there, the
share that knock rule j's primary off its top averages 27% (median 19%) over the cells with enough calls. Among calls
that keep it, the verdicts are 44 tension, 9 aligned, 24 neutral, 1 mixed; 146 cells had too few such calls to judge.
Per mutator the data are thin. Stretches carry most hill steps (429 calls), then nudges, shifts and slides. The system
mutators (combine, reflect, slideOn, translate, quarter) seldom raise a hill without moving the partner off its
primary.

**The ongoing climb** is decision 30's question: from each joint state, rule i keeps climbing (W = 60) through states
that hold j's primary at its top; j's mean change over that leg. Of 208 ordered pairs: **64 adversary** (j loses ≥ 1 bit),
**7 ally**, **137 neutral**.

| Hill | Sense | Its adversaries (Δ bits of the other while it climbs) |
|---|---|---|
| whole-answer/answer-divisor | big | steep-and-high (−2.4), north-east (−1.7), ratio-gap (−1.4) |
| whole-answer/south-west | small | gap-divisor (−10.7), distance-divisor (−8.5), north-east (−4.9), ratio-gap (−3.6), 3 more |
| square-cross/divisor-factors | smooth | gap-divisor (−3.0), north-east (−1.8), start-factors (−1.7), ratio-gap (−1.0) |
| square-cross/divisor-meets-intercept | big | answer-divisor (−3.8), ratio-gap (−3.1), crossing-share (−2.6), 3 more |
| on-the-diagonal/north-east | big | start-factors (−1.4), far-right (−1.3), answer-divisor (−1.3) |
| on-the-diagonal/diagonal-gradient | big | start-factors (−2.4) |
| whole-distance/distance-factors | smooth | answer-divisor (−8.7), start-factors (−6.6), steep-and-high (−2.3) |
| whole-distance/distance-divisor | big | steep-and-high (−3.1) |
| steep-ratio/steep | big | answer-divisor (−5.9), diagonal-gradient (−3.7), gap-divisor (−3.7), 2 more |
| steep-ratio/ratio-gap | big | answer-divisor (−5.0), gap-divisor (−3.8), start-factors (−3.4), 2 more |
| far-crossing/far-right | big | steep-and-high (−9.0), start-factors (−8.1), answer-divisor (−6.9), distance-divisor (−3.5), 5 more |
| far-crossing/crossing-share | big | start-factors (−5.7), answer-divisor (−5.4), steep-and-high (−3.6), ratio-gap (−3.3), 2 more |
| high-start/steep-and-high | big | answer-divisor (−5.7), north-east (−4.2) |
| high-start/start-factors | smooth | ratio-gap (−5.5), distance-divisor (−3.4), answer-divisor (−1.4) |
| gap-match/small-gap-factors | smooth | diagonal-gradient (−3.7), far-right (−1.9), ratio-gap (−1.7), 2 more |
| gap-match/gap-divisor | big | answer-divisor (−4.4) |

The allies: `steep` with `steep-and-high` (+6.2 one way, +2.6 the other; both want a steep red line),
`ratio-gap` with `steep-and-high` (+4.3), `answer-divisor` with `distance-divisor` (+2.1; they share the divisor),
`gap-divisor` with `north-east` (+1.8) and `south-west` (+1.1), and `crossing-share` with `diagonal-gradient` (+1.2).

- **Every hill has at least one adversary;** some have one (`distance-divisor`, `gap-divisor`, `diagonal-gradient`),
  some nine (`far-right`).
- **Designed oppositions work one way.** `far-right` costs `steep-and-high` 9.0 bits, but `steep-and-high` climbing
  changes `far-right` by less than a bit (why is not traced). `south-west` costs `north-east` 4.9, while `north-east`'s
  own climb costs `south-west` less than a bit.
- **The cost of a hill to its adversaries is real cost.** `south-west`'s climb costs `gap-divisor` 10.7 bits: a seat
  climbing it on a shared object takes that from a neighbour, which is the "adversaries to ongoing expensive climb"
  the owner asked for.
- **The counts are noisy.** With the climb legs seeded per pair (as here) the count is 64 adversary pairs; an earlier
  run that reused one seed across pairs gave 51 adversaries, 8 allies, and two hills without an adversary. Six joint
  states per pair is a small sample; treat each cell as an indication, the totals as the finding.

### 8.4 What to add for "many in tension"

The pool meets "few aligned" (7 allies in 208) and "some neutral", but tension is under a third of the pairs, not "many".
Next, all of them configuration:

- **Give every hill a declared opposite on the same anchor or aspect,** as `far-right`/`steep-and-high` and
  `south-west`/`north-east` already are. Missing: on-the-diagonal's hills have only weak adversaries (≤ 2.4 bits) and
  need a rule wanting the crossing near the origin or below the diagonal, and the divisor needs a rule wanting it **prime** (one big factor) against the
  four that want it to share factors.
- **Make opposites symmetric.** The measured oppositions bite one way; a rule wanting red's x-intercept "small and
  negative" in so many words would bite both ways against `far-right`.
- **Deal for tension.** The dealer reads each rule's declared sense and anchor and deals tables with at least one
  opposed pair, so no single climb straightforwardly raises everyone.
- **Three lines** take the same pattern (anchors: the corners' X + Y, the area's root, the common point, the rails'
  notches); not measured yet.
- §3's three-line pool and the first cut (§6) should use tied secondaries from this section, not §3's.

