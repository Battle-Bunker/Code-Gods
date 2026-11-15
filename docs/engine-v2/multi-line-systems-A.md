# Systems of two and three lines: object, lenses, mutators, rules (design A, 14 November 2026)

Status: design and measurement. **Nothing here changes the engine, its dealt rules, prices or values.** It answers the
owner's brief (decision 28: "Start up some new parallel work to design rules and mutators for two and three line
systems, which are also within reach for bright 12yos I think"). A second session worked the same brief independently;
this document did not read its output. The script is [scripts/multi-line-systems-A.mjs](scripts/multi-line-systems-A.mjs)
(self-contained, no engine imports; `node --max-old-space-size=6500 docs/engine-v2/scripts/multi-line-systems-A.mjs [--part law,reach,values,ramp,entangle,climb,search,sentence] [--quick]`;
about 15 minutes per part group, 45 in all); its full output is [scripts/multi-line-systems-A-results.md](scripts/multi-line-systems-A-results.md).

---

## The summary in plain words

- **The object is a set of two (or three) different lines.** Not an ordered pair: swapping the lines changes nothing,
  so a swapped copy is not a second object (decision 24). Its numbers are the 6 (or 9) whole numbers of the lines'
  equations a·x + b·y + c = 0, and its law is the engine's own: each number costs its mixed code (decision 17), so
  the gravitational centre is **the two axes**, x = 0 and y = 0, crossing at the origin at a right angle.
- **A system has many more things to look at than a line.** Where the lines cross (the answer to the simultaneous
  equations), the angle between them, the system as a matrix (its determinant, its row operations), the triangle the
  lines make with the y-axis, and for three lines the triangle itself (corners, area, balance point, pegs inside, its
  shape). Parallel lines and three lines through one point are not special cases but limits: the answer runs off to
  infinity as the lines turn parallel, and the triangle shrinks to nothing as three lines come to meet.
- **The moves that matter are the ones a single line does not have.** *Add a multiple of one equation to the other*
  (a row operation) turns a line about the crossing point; *reflect one line in the other* folds it over; *make it
  perpendicular at the crossing*; *slide the whole system*; *zoom*. They are cheap shortcuts in one lens and big,
  expensive changes in another, which is what decision 25 asked for, and every one has an inverse of the same fee.
- **Eighteen rule families** (nine for two lines, nine for three), each with a primary a 12-year-old can read off a
  picture ("the answer should be whole numbers", "the lines cross at a right angle", "the triangle's area is close to
  6") and three secondaries **tied to the primary** (decision 29): each reads the whole number the primary is about
  (the answer's peg, the root, the determinant at the crossing) and asks for a big smallest prime factor, many prime
  factors (decision 30's "small values and lots of prime factors", in tension with the first), a big common factor with
  another aspect, or a long run of prime heights. None has a top.
- **What the measurements say** (§4):
  - *Room.* A system holds far more spread at the centre than a line: collision entropy 12.5 bits for two lines and 19.4
    for three, against 6.4 for one rational line, so births are varied and no primary needs a big number to be rare (their
    tops sit at 2–13 bits). That is landscape-analysis's proposals 3 and 7, obtained without changing the law.
  - *Play keeps moving.* Scripted climbers on 3-seat tables never froze on two lines (0 of 8 objects frozen in all
    eight tables; on line-z, landscape-analysis measured about 80% frozen at small radius); a third to a half of all moves
    raised two seats at once, and two thirds to nine tenths of moves damaged another seat. Rules are entangled in
    both directions: on two lines some pairs are allies (+0.35) and some rivals (−0.31).
  - *Blind search finds it rugged.* A searcher that knows the rules but searches blindly gets 8–67% (two lines) and
    21–92% (three lines) of what ten long runs find, and the ten runs never agree on a best state. Their best states show
    the style of the peaks: horizontal and vertical lines carrying smooth numbers (y = 7200, x = 6400), the cheap hill
    of the "many prime factors" secondaries under mixed costing.
  - *But a reader of the cards often wins with a sentence.* One generic sentence ("two lines through one peg"; "a
    triangle with corners on pegs") matches or beats those ten runs in **3 of 8 two-line tables and 6 of 8 three-line
    tables**. Three lines are more exposed than two, because their rules pull the same way (area, pegs and corners
    move together).
- **The honest bug report** (§3.4, §4.7): most families have a one-sentence route up their secondary hill: "use the
  two axes as two of the lines and put the anchor at a big prime (or a power of two) on an axis". The axes are the
  cheapest lines there are, so a system collapses back to *one line plus the axes*, and the single-line ramps of
  `landscape-analysis.md` return. Two pairings are worse: their secondary has a ceiling theorem (Treasure Crossing's
  prime ladder from the treasure, Six Square Units' smallest prime factor of the determinant). The families that resist
  a sentence are the **coincidence** ones: Crossing at the Gradients, Area Counts Pegs and every prime ladder whose
  start moves with the state.
- **Recommended first cut** (§6): the two-line object, five families chosen for tension (Right Angle against
  Forty-Five, Whole Answer, Triangle on the Wall, Crossing at the Gradients), nine mutators, valued by direct draws
  (the sampler the engine already has works unchanged). Three proposals for the coordinator, unmeasured: anchors that
  cannot sit on the axes, a dealt treasure per game, and a "sentence attack" added to the standing collapse check.
  Three lines next, once they have rules in tension and exact values for their prime ladders.

---

## 1. The object and its lenses

### 1.1 State, canonical form, law

- **State.** A set {L₁, …, L_k} of k = 2 or 3 **distinct** lines over Q. Each line is the spec's primitive triple
  (a, b, c) of a·x + b·y + c = 0 (gcd 1, b > 0, or b = 0 and a > 0; spec §12.1). Vertical lines are allowed (line-q).
- **Canonical form.** The lines sorted by their triples (lexicographic). A system is one object whatever order its
  lines were written in. Uniqueness (decision 24) is equality of the sorted triples, so "swap the two lines" is not a
  move and cannot make a copy. The app keeps each line's colour by tracking which line a move addressed (display only).
- **Distinct lines.** A move that would make two lines of one system equal is refused (both ways, so the walk stays
  reversible), exactly like a move onto another object's state.
- **Read length.** φ = Σ over the lines of mixedInt(a) + mixedInt(b) + mixedInt(c) (spec §2.5, §12.2). It is an exact
  potential, so the stationary law is π ∝ 2^−φ on distinct sets inside the box, and it is sampled exactly by drawing
  the lines independently and refusing duplicates (the engine's `sampleMixedInt` per number, refusing triples that
  are not primitive; each line has two signed triples of equal φ, so fixing the sign is exact).
- **The centre.** The cheapest lines are y = 0 and x = 0 (φ ≈ 6.1 each); the cheapest two-line system is the pair of
  axes; the cheapest three-line systems add a line such as y = x, x + y = 0 or y = ±1 (φ ≈ 9.2). So the law's centre is
  a right angle at the origin, and births are often degenerate: in the law, **14.5% of two-line systems are parallel**
  and **36.5% of three-line systems have a parallel pair** (horizontal and vertical lines are common, because a zero
  coefficient costs 1 bit). That is a feature for teaching (degenerate cases are met often) and a lever for rules (a
  rule undefined on parallel lines scores them worst).

| | one line (line-q) | two lines | three lines |
|---|--:|--:|--:|
| Whole numbers in the state | 3 | 6 | 9 |
| Collision entropy of π (−log2 Σπ²) | 6.4 bits | **12.5 bits** | **19.4 bits** |
| φ of a birth: median / 90% / 99% | 13.7 / 21.8 / 29.8 | 28.0 / 39.1 / 49.6 | 42.7 / 55.8 / 68.2 |

(Measured, 200,000 draws each, box 10⁴; `--part law`.) For contrast, landscape-analysis.md: line-z 3.9 bits, the
4×4 digit grid 39 bits. A two-line system sits where proposal 7 of the landscape analysis wanted a line to be (≈ 12 bits),
without touching the law.

### 1.2 The lenses (representations)

With L_i = (a_i, b_i, c_i), for a pair i, j: the **determinant** D = a_i·b_j − a_j·b_i, the **dot product** of the
normals d = a_i·a_j + b_i·b_j, and the numerators N_x = b_i·c_j − b_j·c_i, N_y = c_i·a_j − c_j·a_i (Cramer's rule).

| Lens (id) | Scene | Elements | Undefined for (a limit, not a bucket) |
|---|---|---|---|
| `eqs` the pair of equations | equations | each line's `si` (m, c), `gen` (a, b, c), `int`, `mach`… per line (every single-line lens, with a site) | as for one line |
| `sol` the answer | plane | `x` = N_x/D, `y` = N_y/D (the crossing point P), `peg` = the lattice point nearest P | parallel lines (D → 0: P runs off to infinity along the lines' direction) |
| `mat` the system as a matrix | matrix | the augmented matrix [A \| −c], `det` = D, its row operations, elimination steps (`elim`: what you multiply by, what you divide by) | — (D = 0 shown as "no unique answer") |
| `ang` the angle | plane, protractor | `tan` = \|D\|/\|d\|, `cot` = \|d\|/\|D\|, `deg`; perpendicular when d = 0, parallel when D = 0 | — |
| `pencil` the lines through P | plane | every line a·L_i + b·L_j through P, the two lines' place in it; `bisectors` (rational only when (a_i² + b_i²)(a_j² + b_j²) is a square: a Pythagorean coincidence) | parallel lines (the pencil is a family of parallels) |
| `wall` the triangle with the y-axis | plane | corners (0, y_i), (0, y_j), P; `base` = the y-intercepts' gap, `height` = \|x of P\|, `area` = base·height/2, `pegs` inside | parallel lines, a vertical line, P on the y-axis |
| `tri` (three lines) the triangle | plane | corners V_ij, `area` = Δ²/(2·\|D₁₂·D₁₃·D₂₃\|) with Δ the 3×3 determinant of the coefficients, `side²` (rational), `G` the balance point (centroid), `pegs` inside, `type` (the corner angles' cot, side ratios) | a parallel pair (a corner at infinity: area → ∞); concurrency (Δ → 0: area → 0, the corners merge) |
| `mat3` (three lines) | matrix | the 3×3 matrix [a b c], `Δ`, the cofactors D_ij; Δ = 0 exactly when the lines meet at one point | — |

Shared meanings (the same number, seen in several lenses): the determinant D is "the number you divide by when you
eliminate" (`mat`), "the sine of the angle times the normals' lengths" (`ang`) and "the denominator of the answer"
(`sol`); the area of the three-line triangle is a square of Δ over the product of the three D's, so one number links
the matrix, the corners and the area. These links are what makes rules on one aspect entangle with rules on another.

## 2. Mutators

Every mutator below keeps prices an exact potential: a move and its inverse pay the same fee, the only asymmetric part
is the surcharge max(0, Δφ) (spec §5.3). Fees are in the spec's scheme: an **amount** added (a shift, a tilt, a step, a
slide, a row multiple k) costs its size at the variant's rate, so far moves cost at least their path; a **choice**
(which line, which axis, which other line to reflect in) costs log2 of the number of choices; a **factor** costs its
digits. N is the number of mutators offered (16 in the study), k the lines (log2 k bits for "which line").

### 2.1 The single-line mutators, with a site

All nine of spec §12.4 (`si.shift`, `si.tilt`, `seq.step`, `cart.pivot`, `cart.slide` of one line, `cart.mirror`,
`gen.nudge`, `int.move`, `mach.stretch`), and the proposals of `lenses-and-mutators.md` (`rot.turn` about a point of the
line, `rot.fold`, …), applied to one line of the system. Their inverses are as for one line. **Collateral:** every one
moves the answer, the angle or the determinant: a shift of one line slides P along the other line; a tilt changes D,
the angle and P together.

### 2.2 The system mutators

| Id | Lens | Arguments (price) | Effect | Keeps | Changes (collateral) | Inverse (same fee) |
|---|---|---|---|---|---|---|
| `row.add` | `mat` | which line i, which other j (choices), k (amount, whole, ≠ 0) | L_i ← L_i + k·L_j (an elimination step) | the answer P, line j and \|D\| (det(L_i + k·L_j, L_j) = det(L_i, L_j)) | line i turns about P: its gradient, intercepts, the dot product and so the angle; far coefficients for small k | `row.add(i, j, −k)` (or `+k` when canonical form flipped the sign); refused when the result is not primitive, both ways, so refusals are symmetric |
| `pencil.turn` | `ang`, `pencil` | i, j (choices), k (amount) | line i's gradient += k, turning about its crossing with line j | P (and, for three lines, the corner V_ij) | the angle, D, line i's intercepts, for three lines the two other corners and the area | `pencil.turn(i, j, −k)`; refused for a vertical line i |
| `vertex.slide` (three lines) | `tri` | the corner V_ij, the side it slides along (line i), t (amount, in steps of line i's primitive direction) | turns the third side's line about its other corner so V_ij moves along line i | line i, the other corner on the turned line | area, the balance point, the corner angles | `vertex.slide(…, −t)` |
| `pair.reflect` | `pencil`, `ang` | i, j (choices only) | fold line i over line j: L_i ← (a_j² + b_j²)·L_i − 2·d·L_j, then primitive | P, the angle (mirrored), line j | line i's coefficients, often by a lot (the factor a_j² + b_j²): the surcharge prices that | itself (reflecting twice in the same line is the identity) |
| `pair.perpendicular` | `ang` | i, j (choices only) | replace line i by the perpendicular to it through P | P, line j | the angle becomes its complement (tan ↔ cot: D and d swap roles), D | itself (two quarter turns about P give the same line) |
| `sys.slide` | `sol`, `tri` | (u, v) (amount, size \|u\| + \|v\|) | translate every line by (u, v): c_i ← c_i − a_i·u − b_i·v | every gradient, the angle, D, the area, the triangle's shape | P (moves by (u, v)), every intercept, the anchors measured from the origin | `sys.slide(−u, −v)` |
| `sys.zoom` | `sol`, `tri` | factor f = p/q (digits) | scale the plane about the origin: c_i ← f·c_i | gradients, the angle | P (× f), area (× f²), pegs inside | `sys.zoom(1/f)`; refused when every line passes through the origin (nothing changes), both ways |
| `sys.mirror` | plane | axis (choice of 4) | mirror the whole system in the x-axis, the y-axis, the origin or y = x | the angle, \|D\|, the area, the shape | P, every gradient's sign or the roles of x and y | itself |

- **Representation shortcuts (decision 25).** `row.add` with k = 5 is one cheap call (steps on 5) whose effect on line
  i's coefficients is 5·L_j, possibly dozens of units on each coefficient: a far move in the `eqs` lens, short in the
  `mat` lens. `pair.reflect` and `pair.perpendicular` are priced as choices only, never by the path, and they satisfy the
  owner's condition on flips around other lines (decision 28: "but where it's expensive to introduce a line with lots of
  information in it from scratch"): the mirror is *already in the system*, so no information is introduced; folding in
  an arbitrary line would cost that line's code, as `mirror.any` in lenses-and-mutators.md does.
- **The owner's rotation (decision 27).** "Rotate the line about that point" is, in a system, `pencil.turn` (about the
  crossing) and `row.add` (the same pencil, parametrised by multiples of the other equation): two prices for one
  family of states. An agent that wants line i's gradient changed while the answer stays put pays little; whoever cared
  about line i's y-intercept, or the triangle's area, takes the collateral damage.
- **Where an inverse of equal fee fails, and what the design does.**
  1. *Row operations with a fractional multiple, and scaling an equation.* L_i ← q·L_i + p·L_j is not undone by a
     move of the same shape when the result has a common factor (dividing it out loses the scale), and "multiply an
     equation by 3" does not change the line at all. So `row.add` takes whole k only and is refused on a non-primitive
     result, and scaling is a view (the `mat` lens shows any multiple), not a move: a lesson in itself ("multiplying an
     equation by 3 gives the same line").
  2. *Swap two equations.* Not a move: the object is a set.
  3. *Rotate a line about P by a general angle.* Irrational unless the angle's tangent is rational. Rotation by a
     Pythagorean angle (3-4-5, 5-12-13, priced by the triple's digits; `rot.turn` of lenses-and-mutators.md) is exact and
     self-consistent (its inverse is the opposite turn, same fee); `pair.perpendicular` is the quarter turn.
  4. *Angle bisectors* are irrational unless (a_i² + b_i²)(a_j² + b_j²) is a square, so "replace a line by a
     bisector" is not offered; it is a secondary-rule idea instead.
  5. *Moves that would make two lines of one system equal* are refused both ways. *Moves onto a parallel pair* are
     allowed: a parallel system is a valid state whose answer is undefined, and the next move can leave it.
- **The script's move set** (`calls()`): per line, shift, tilt and step by ±1, ±2; pivot about x0 ∈ {±1, ±2}; nudge of
  each coefficient by ±1; six stretches; four mirrors; per ordered pair, `row.add` ±1, ±2, `pencil.turn` ±1,
  `pair.reflect`, `pair.perpendicular`; and for the system, eight slides, five zooms, four mirrors: about 95 calls on two
  lines and 160 on three. Fees: amounts at 4.3 bits per unit of size (spec §12.4's rate at o = log2 9, rescaled to 16
  mutators), choices log2 of the count, factors 5.4 bits per bit of digits.

## 3. Rule families

Every family has a **primary** a 12-year-old reads off one picture, a distance to an exact condition (closer better,
continuous, decision 13 and 23), and **three secondaries tied to it** (decision 29): each reads the primary's
**anchor**, the whole number the primary is about, and relates it to itself or to another aspect. The four kinds of
secondary, all unbounded (decisions 26 and 30):

| Kind | Reads | Wants | Why it is there |
|---|---|---|---|
| `spf` | the anchor | a big smallest prime factor | the owner's own example (decision 12): the hill of big primes |
| `omega` | the anchor | many prime factors, counted with repeats | decision 30: "rules that prefer small values and lots of prime factors instead of large primes"; in **tension** with `spf` on the same anchor |
| `gcd` | the anchor and a number from another aspect | a big common factor | decision 29's own example (the intercept's nearest integer and the gradient's floor) |
| `ladder` | the anchor as a start x, and every line | a long run x = n₀, n₀ + 1, … where every line's height is a prime | a coincidence across all the lines; long runs need search (prime k-tuples), not a formula |

### 3.1 Two lines

| Family | Primary (what the kid reads) | Lens | Anchor | Secondaries (other aspect for `gcd`) |
|---|---|---|---|---|
| Whole Answer `whole-answer` | the answer (x, y) of the two equations is close to whole numbers: −(dist(x, ℤ) + dist(y, ℤ)) | `sol` | \|X\| + \|Y\| of the peg nearest the answer | `gcd` (the determinant), `omega`, `ladder` from X |
| Right Angle `right-angle` | the lines cross at a right angle (gradients multiply to −1): −\|d\|/\|D\| | `ang` | the determinant D (for perpendicular lines a multiple of a² + b², a sum of two squares) | `spf`, `omega`, `gcd` (the answer's peg) |
| Meet on the Floor `meet-on-floor` | the lines cross on the x-axis: −\|y of P\| | `sol` | the whole number nearest the crossing's x | `spf`, `omega`, `gcd` (D) |
| Treasure Crossing `treasure-crossing` | the lines cross close to the treasure T = (3, 2) (dealt per game in play): −\|P − T\|₁ | `sol` | D at the treasure | `ladder` from T's x, `omega`, `gcd` (d) |
| Triangle on the Wall `wall-triangle` | the triangle the lines make with the y-axis has area close to 6 | `wall` | the base on the wall (the y-intercepts' gap), nearest whole | `spf`, `omega`, `gcd` (the height) |
| Forty-Five `forty-five` | the lines cross at 45°: −\|\|D\| − \|d\|\| / (\|D\| + \|d\|) | `ang` | D (= ±d at 45°) | `spf`, `omega`, `gcd` (the answer's peg) |
| No Fractions `no-fractions` | when you solve by elimination, the number you divide by is close to 1: −(\|D\| − 1) | `mat` | the answer's peg (whole whenever D = ±1) | `spf`, `omega`, `ladder` from X |
| Mirror Pair `mirror-pair` | the lines are mirror images in the y-axis (opposite gradients, the same y-intercept) | `eqs` | the shared y-intercept, nearest whole | `gcd` (the gradient's floor: decision 29's example), `spf`, `omega` |
| Crossing at the Gradients `gradient-point` | the lines cross at the point (m₁, m₂) made of their own gradients | `sol` × `eqs` | the crossing's x (one gradient), nearest whole | `gcd` (the crossing's y, the other gradient), `spf`, `ladder` from X |

### 3.2 Three lines

| Family | Primary | Lens | Anchor | Secondaries |
|---|---|---|---|---|
| Pegged Triangle `pegged-triangle` | all three corners land on pegs: −Σ dist₁(corner, ℤ²) | `tri` | twice the area (whole for a triangle on pegs; Pick) | `spf`, `omega`, `ladder` from the leftmost corner |
| Six Square Units `six-units` | the triangle's area is close to 6 | `tri` | the 3×3 determinant Δ | `spf`, `omega`, `gcd` (the corners' pegs' total) |
| Right Corner `right-corner` | one corner is close to a right angle | `tri`, `ang` | the right corner's peg, \|X\| + \|Y\| | `spf`, `omega`, `gcd` (that corner's D) |
| All Meet `all-meet` | the three lines nearly meet at one point: −area | `tri`, `mat3` | the meeting point's peg | `spf`, `omega`, `ladder` from its x |
| Balance on a Peg `balance-peg` | the triangle's balance point (centroid) lands on a peg | `tri` | the balance point's peg | `spf`, `omega`, `gcd` (Δ) |
| Two Equal Sides `two-equal-sides` | two sides are close to the same length (relative difference of side²) | `tri` | the apex's peg | `spf`, `omega`, `ladder` from the apex's x |
| Square Triangle `square-triangle` | the area is close to a square number (1, 4, 9, …) | `tri` | the root k (decision 12's second example) | `spf`, `omega` (decision 12's "number of prime factors in the root"), `gcd` (Δ) |
| Five Pegs Inside `five-pegs` | exactly 5 pegs strictly inside (closer to 5 is better; a count, discrete by nature) | `tri` | twice the area, nearest whole | `spf`, `omega`, `gcd` (Δ) |
| Area Counts Pegs `area-is-pegs` | the area equals the number of pegs inside: −\|area − pegs\| | `tri` | the pegs inside | `spf`, `omega`, `gcd` (Δ) |

### 3.3 Anti-patterns the design and the measurements caught

- **A ceiling theorem below the secondary (layered-line-rules §1.4).**
  - *Treasure Crossing / `ladder` from the treasure.* Both lines pass through (3, 2), so the ladder is an arithmetic
    progression of primes starting at 2. The next term is odd only if the gradient is odd, and then the term after is
    even: **the ladder is at most 2**. In general a run of primes starting at prime p is at most p long unless its step is
    a multiple of p. A ladder must start at a moving anchor, never at a fixed treasure. (The measured values show it:
    `treasure-crossing/ladder` is flat.)
  - *Six Square Units / `spf` of Δ.* Area 6 means Δ² = 12·|D₁₂D₁₃D₂₃|, so 2 and 3 divide Δ: **at the primary's top
    the smallest prime factor of Δ is always 2**. Use `omega` or `gcd` there.
  - *No Fractions / a secondary on the angle's Euclid steps* (an earlier draft): with |D| = 1 the steps of (1, d) are
    at most 2. Replaced.
- **Region counts as "more is better"** (an earlier draft had "pegs inside the triangle, more better"): nearly parallel
  lines cross far away and make enormous triangles cheaply (area grows like 1/D with D = 1 available at every size), so
  the count was a pure magnitude ramp (the draft's annealer found 7 million pegs in its first window). Counts are kept
  only as a primary with a target (Five Pegs Inside) or a coincidence (Area Counts Pegs).
- **Degenerate secondaries at the centre.** The axes are the law's centre and satisfy Right Angle, Whole Answer, No
  Fractions and Meet on the Floor exactly (the answer is (0, 0), D = 1, d = 0). Their primaries' tops are 2 to 3 bits
  (§4.3): cheap, as a beginner's primary should be. Their secondaries then read an anchor of 0, which every kind scores
  worst (spf 1, Ω 0, gcd 0, no ladder), so the centre is not a free secondary.

### 3.4 Adversarial: can a sentence solve a table? (by reasoning, before measuring)

For each family, the cheapest route a reader of the card can name (the axes are the cheapest lines, φ ≈ 6.1 each):

| Family / secondary | The sentence | Hill it climbs |
|---|---|---|
| Meet on the Floor / `spf` | "y = 0 and x = p for a big prime p" | the single-line Prime Landing ramp, unchanged |
| Meet on the Floor, Whole Answer / `omega` | "y = 0 and x = 2^k" | powers of two: Ω = k for about k bits of φ per number |
| Whole Answer / `gcd` (D) | "x = n and a·x + n·y = a·n" (through (n, 0), D = n) | n smooth |
| Right Angle / `spf` | "perpendicular lines with normals (1, b) and (−b, 1), b² + 1 prime" | b on a sparse set of primes of the form b² + 1 |
| Forty-Five / `spf` | "normals (a, b) and (a − b, a + b), a² + b² prime" (D = d = a² + b²) | the same numbers as Right Angle, but a different pair of lines: Right Angle and Forty-Five cannot both be at their tops (tension) |
| Mirror Pair / `gcd` | "y = 2^k x + 2^k and y = −2^k x + 2^k" | powers of two |
| Square Triangle / `spf`, `omega` | "the axes and x + 2y = 2k" (area k²), k prime or k = 2^j | the owner's own example, as a ramp |
| Pegged Triangle / `spf` | "the axes and the line from (1, 0) to (0, p)" (twice the area = p) | primes |
| All Meet / `spf` | "y = 0, x = p, x + y = p" | primes |
| Crossing at the Gradients / `gcd` | lines y = a·x + (b − a²), y = b·x + (b − ab) cross at (a, b) for any whole a ≠ b; gcd(a, b) wants a and b to share factors, but then b − a² and b − ab carry factors like 2^(k−1) − 1 that are not smooth | no cheap direction found: the cost is not monotone in the anchor |
| Area Counts Pegs | no closed form: Pick's theorem makes area = pegs impossible for a triangle with corners on pegs (it would need 2 boundary pegs, and corners give 3), so the corners must be off the pegs | none found |
| any `ladder` from a moving anchor | "both gradients multiples of 30 (or of 210), intercepts found by a sieve" narrows the search but does not give the run: long simultaneous prime runs are found by search | a sentence plus a search |

So **the bug, stated plainly: most pairings reduce a system to one line plus the axes**, and the ramps of the
single line come back (landscape-analysis H2, H3). Two things are different from one line and they are measured in §4:
whether *tables* of 3–4 such rules still share one sentence (they read different anchors: the answer's peg, D, the
base on the wall, Δ), and whether a blind search finds what a sentence finds.

## 4. Measurements

All numbers are from the script (seeds fixed). Full tables: [scripts/multi-line-systems-A-results.md](scripts/multi-line-systems-A-results.md).

### 4.0 Method, and its limits

- **Values** are taken the engine's way (spec §7.0, direct draws): 240,000 systems per size from a mixture of the law
  tilted on coefficient size (t = 1, 0.75, 0.55, 0.4), self-normalised weights, bits = −log2 of the weight at or above
  a score. Where fewer than 5 draws reach a score, the study extrapolates from the fifth-best draw (along log2 of the
  secondary at that primary, or one bit per halving of a primary distance, at most 3) and marks it "beyond". That
  extrapolation is monotone, which is what climbers and searches need, but **not certified**: the certified top (30
  draws) of every rule is 10–13 bits. A first version extrapolated two bits per halving with no cap and valued an exact
  Treasure Crossing at 27.7 bits; a direct count (2 million lines: 1.16% pass through (3, 2), so both lines do with
  probability 2^−12.9) showed 12.9, and the extrapolation was corrected (it now reads 12.8). Every table below is from
  the corrected run.
- **Prices** follow the spec's scheme with the study's move set (§2.2), not the engine's code; amounts at 4.3 bits per
  unit, so a unit move costs about 4.3 bits plus its surcharge.
- **Windows.** Searches run inside φ ≤ 50 bits (two lines; a birth's median is 28) or φ ≤ 75 (three lines; median 43),
  the analogue of landscape-analysis's coordinate box.
- **Not measured:** disclosure (collapse test 5) is a property of the economy, not the object; model seats.

### 4.1 Degrees of freedom and reach

| | two lines | three lines |
|---|--:|--:|
| Whole numbers in the state | 6 | 9 |
| States within 15 bits of fees of a birth | 58–96 | 281–550 |
| … within 25 bits | 1,118–1,850 | 8,575–27,005 |
| … within 35 bits | 17,500–36,700 | 236,000–1,224,000+ |

(Three births each, cheapest paths over the ≈ 95 or ≈ 160 calls; "+" means the search stopped at 150,000 settled states.)
For scale: one line at path-consistent prices reached about 36,000 states with a whole line's share of a game
(landscape-analysis H1). A three-line system reaches more than that in 35 bits, about eight unit moves.

### 4.2 How concentrated the law is

Collision entropy 12.5 bits (two lines) and 19.4 (three), against 6.4 for one rational line (§1.1). The primaries'
tops sit at 2–14 bits (below), so the law has room near its centre: no primary needs a big number to be rare.

### 4.3 Values

| | two lines | three lines |
|---|---|---|
| Primary top, cheapest | Whole Answer 2.0, Meet on the Floor 2.4, Right Angle 2.7, No Fractions 2.8 bits (the axes satisfy them) | Right Corner 2.2, Pegged Triangle 4.1, All Meet 4.7 |
| Primary top, dearest | Treasure Crossing 12.8, Crossing at the Gradients 10.7, Triangle on the Wall 10.5, Mirror Pair 11.1 | Six Square Units 11.5, Area Counts Pegs 10.6, Square Triangle 7.2 |
| Certified top (30 draws) | 9.7–13.3 bits | 4.1–13.4 bits |
| P(primary undefined) | 14.5% (parallel); Triangle on the Wall 62.5% (also vertical lines, or P on the y-axis); Crossing at the Gradients 55% | 36.5–40% |

Every primary is cheap to *reach* from a birth (a few moves) and every secondary adds a hill above it. Two problems
show in the values: the three-line **prime ladders are almost never non-zero in the law** (three prime heights in a
row at the same x is rare near the centre), so `pegged-triangle/ladder`, `all-meet/ladder` and
`two-equal-sides/ladder` are valued by their primary alone; they need an exact sieve sum (§6.1) before they can be
dealt. And the ceiling theorems of §3.3 show as flat secondaries.

### 4.4 Entanglement

For a random priced move from a state drawn from the law (half from π, half from a flatter tilt), the chance that rule
B's bits change when rule A's do, and the correlation of the two changes (each family with its first secondary).

- **Two lines: every pair is entangled** (P(B changes | A changes) 0.59–0.99), **and the signs differ**: correlations
  run from −0.31 to +0.35. The tense pairs are Right Angle with Forty-Five (−0.31; they cannot both be at their tops)
  and Right Angle with Mirror Pair (−0.30); the aligned pairs are Crossing at the Gradients with Meet on the Floor
  (+0.35) and No Fractions with Whole Answer (+0.32: D = ±1 makes every answer whole). Most pairs sit near 0: a move
  that helps one rule is a coin toss for another, which is collateral damage, and some pairs are allies and some
  rivals, which is political structure (decision 27).
- **Three lines: even more entangled (0.64–1.00) but more aligned**: correlations −0.04 to +0.71. All Meet and Area
  Counts Pegs (+0.71), Six Square Units and Five Pegs Inside (+0.66), Right Corner and Two Equal Sides (+0.61) pull the
  same way, because area, pegs inside and corner positions all move together. Few three-line pairs are in tension.
  This is a design debt for three lines: it needs rules that want the triangle *big* against rules that want it
  *small* or *thin*.

### 4.5 Scripted climbers: does play keep moving?

Eight tables of three seats per size, eight unique objects, each seat 400 bits of fees, each seat taking in turn the
move with the best rise in its own points per bit (points = own bits × the others' bits).

| | two lines | three lines |
|---|---|---|
| Moves per table | 105–153 | 78–166 |
| Moves that raised at least two seats ("shared improvements") | **32–51%** | **23–74%** |
| Moves that lowered another seat ("collateral") | **66–89%** | **45–93%** |
| Objects still moving in the last third of the game | 2–7 of 8 | 1–5 of 8 |
| Objects frozen at the end (no single move raises anyone) | **0 of 8 in every table** | 0 in 5 tables, 1 in 2, 3 in 1 |
| Distinct final states | 8 of 8 | 8 of 8 |
| Table F, start → end | ×7 to ×32 | ×5 to ×35 |

Climbers keep finding shared improvements throughout (a third to a half of all moves help two seats at once) and
almost every move damages someone: the table's hill is shared but contested, which is the picture the owner asked
for. Contrast landscape-analysis's line-z freeze data: about 80% of objects frozen at ±3. Here no object freezes,
because a system always has a move that helps someone (the pencil, the row operations, the reflections reach
different neighbours than a single line's shifts).

### 4.6 Search with the rules known (collapse tests 2 and 3)

A searcher that knows the rules anneals inside the window: cheap (5,000 evaluations, median of five births) against a
reference (ten runs of 50,000).

| | two lines (8 tables) | three lines (8 tables) |
|---|---|---|
| Cheap / reference | 0.08–0.67 | 0.21–0.92 |
| Tables where the cheap search reaches 95% of the reference (test 2 fails) | 0 | 0 |
| The five best reference runs | five different states in every table | five different states in every table |

So for a **blind** searcher the landscape is rugged, as grids are: runs disagree and a small budget gets a third of
the best. The reference's best states also show the style of the peaks: horizontal and vertical lines carrying smooth
numbers (y = 7200, x = 6400, 4x − y = 5760, 7776 = 6⁵), and mirror pairs at smooth heights (y = ±(8/3)x + 48). That is
the `omega` and `gcd` hill under mixed costing: a smooth number is cheap (decision 17), and has many factors.

### 4.7 The one-sentence attack: does a reader of the cards beat the search?

A reasoner does not search blindly; it names a family and takes its best member. The script tries one generic
sentence per size, not tailored to the table: **"two lines through one peg"** (pegs |x|, |y| ≤ 3, normals up to 10;
361,756 systems) and **"a triangle with corners on pegs, or three lines through one peg"** (282,528 systems).

| | two lines (8 tables) | three lines (8 tables) |
|---|---|---|
| Family ≥ reference search | **2 tables** (1.04, 1.07) | **3 tables** (1.09, 1.09, 1.18) |
| Family within 5% of it | 1 more (0.96) | 3 more (0.96, 0.98, 0.99) |
| Family clearly worse | 5 (0.43–0.84) | 2 (0.35, 0.58) |

- **A generic sentence matches or beats ten runs of a knowledgeable annealer in 3 of 8 two-line tables and 6 of 8
  three-line tables.** By the owner's criterion this is the bug: a cheap formula ("put the corners on pegs") finds the
  best states the search finds. Three lines are *more* exposed than two, because a triangle on pegs satisfies several
  three-line primaries at once (Pegged Triangle exactly; area a half-integer for Six Square Units, Square Triangle and
  Five Pegs Inside; the corners' pegs as anchors), and §4.4 showed the three-line rules pull the same way.
- **A tailored sentence would do better than the generic one.** §3.4's sentences ("the axes and a line through
  (0, p)", "y = 0 and x = 2^k") are each one rule's ramp; a table's sentence is their intersection. On two lines that
  intersection is often empty: the generic family *loses* clearly in five two-line tables, where the reference found
  states no single structured family covers.
- **Where the sentences fail.** On two lines, the tables with Mirror Pair or No Fractions (0.43–0.64): their anchors
  (the shared intercept, the answer when D = ±1) want lines that a peg-centred family does not hold, and Mirror Pair is
  in tension with most rules (§4.4). On three lines, the two tables with Square Triangle (0.35, 0.58): a square area
  is rarely a half-integer area with small corners.

### 4.8 The collapse check, summarised (landscape-analysis §4)

| Test | Two lines | Three lines |
|---|---|---|
| 1. No ramp | **Fails by reasoning** for every `spf`, `omega` and `gcd` pairing whose anchor can sit on an axis (§3.4). The measured W → 2W test (0 of 27 and 2 of 27 grew by 10%) is search-limited and does not see them. | Same |
| 2. No cheap optimum | Passes as defined (cheap/reference ≤ 0.67) | Passes as defined (≤ 0.92) |
| 2′. No cheap *sentence* (added here) | Fails in 3 of 8 tables | **Fails in 6 of 8** |
| 3. No single answer | Passes: five different best states in every table | Passes |
| 4. No convergence in play | **Passes**: no object frozen, 32–51% shared moves | Passes (one table 3 of 8 frozen) |
| 5. Disclosure | not measured (economy, not object) | — |

The standing check should gain test 2′: a structured-family attack, because blind search is the wrong adversary for
a game whose players read the cards.

## 5. What a 12-year-old sees and does

What the app already has (spec §11, annotations-design.md): a plot of the object, the rule card with the contributor
chain (each layer's terms, highlighted on the plot) and priced candidate moves. A system adds a second line on the same
plot, the answer marked as a dot, and a small matrix beside the equations.

### 5.1 Two lines: Whole Answer, secondary "a long prime ladder from the answer's x" (`whole-answer/ladder`)

1. **The card.** "**Whole Answer.** Solve your two equations. The answer should be whole numbers: the closer, the
   better. *Then:* starting at the answer's x, walk right: how many steps in a row give both lines a prime height?"
2. **The board.** Red line 2x − y = 1, blue line x + y = 7. The plot shows them crossing at (8/3, 13/3), a hollow dot
   between pegs, with dashed arrows to the nearest peg (3, 4): "1/3 + 1/3 = 2/3 away". The equations panel shows the
   elimination: "add the equations: 3x = 8, so x = 8/3. You divided by 3."
3. **Candidate moves** (priced, sorted by what they do for this card):
   - "Shift blue up 1 (x + y = 8): answer (3, 5), whole! — 5 bits" (the contributor chain lights the primary green).
   - "Add blue to red (row operation: 3x = 8 stays): red becomes 3x = 8, a vertical line — 5 bits" (the answer does not
     move: the kid sees why elimination works, and that this move is useless for this card).
   - "Fold red over blue (choice, 4 bits + surcharge 9 bits)".
4. **After the shift.** The answer is the peg (3, 5); the primary is at its top. The ladder panel appears under the
   plot: x = 3: red 5 ✓ prime, blue 5 ✓ prime; x = 4: red 7 ✓, blue 4 ✗. "Ladder: 1 step." Candidate moves now sort by
   the ladder: "turn blue about the answer by +2 (pencil turn): x + y = 8 becomes y = x + 2 … heights 5, 6 ✗" and so on.
   The kid sees the whole-number answer is a *pivot*: turning a line about it keeps the primary and changes the
   ladder. A ladder of 3 needs both gradients even (so heights stay odd); a ladder of 5 needs gradients that are
   multiples of 6 *and* the right starting primes: the kid's agent searches, and the kid negotiates.
5. **Collateral, visible.** Another player at the table has Triangle on the Wall. The plot's ghost layer shows their
   triangle with the y-axis shrinking when the kid turns blue about the answer: the "this hurts Sam" chip appears on
   that candidate move, and the kid can choose the other turn that keeps Sam's area.

### 5.2 Three lines: Square Triangle, secondary "the root has many prime factors" (`square-triangle/omega`)

1. **The card.** "**Square Triangle.** Your three lines make a triangle. Its area should be close to a square number
   (1, 4, 9, 16, …). *Then:* the side of that square, k, should have as many prime factors as possible (12 = 2·2·3 has
   three)."
2. **The board.** The lines x = 0, y = 0 and 3x + 7y = 21: the triangle with corners (0, 0), (7, 0), (0, 3), shaded.
   The area panel: "area 10.5; nearest square 9 = 3², √10.5 = 3.24, 0.24 away". For the curious, the matrix panel shows
   area = Δ²/(2·|D₁₂·D₁₃·D₂₃|) = 21²/(2·1·7·3).
3. **Candidate moves.** "Slide the bottom line up 1 (si.shift): area 14/3, √ = 2.16, 0.16 from 2²: closer"; "slide the
   corner (7, 0) one step along the x-axis (vertex.slide; the slanted side turns about (0, 3) and becomes x + 2y = 6):
   area 9, a perfect square!"; "zoom ×2 (sys.zoom): area × 4 = 42, √ = 6.48, worse".
4. **After the vertex slide.** Area 9 = 3²: primary at the top. Secondary: k = 3 has one prime factor. The zoom move
   is now the star: "zoom ×2: area 36 = 6², k = 6 = 2·3, two prime factors — 7 bits + surcharge". Zoom ×2 again:
   k = 12, three factors. The kid discovers that doubling the picture doubles the side of the square, and that the
   bill for each zoom grows (the surcharge: the numbers get longer). A player whose card is Six Square Units sees every
   zoom wreck their area (collateral), and the table bargains over who zooms.

These two show the pattern the brief asks for: the primary is something a 12-year-old checks on a plot with a
calculator (solve two equations; area of a triangle), the secondary is a door into number theory, and the moves are
the textbook's moves (row operations, translating, enlarging) with prices.

## 6. What the engine would need, and a recommended first cut

### 6.1 What the engine needs

1. **The object type.** A `lines` type (or the line type with a variant) whose state is a sorted set of k distinct
   primitive triples, with `canonical` sorting and refusing duplicate lines, `readLength` the sum of the lines' mixed
   codes (unchanged code, spec §2.5), and `sites` = k. `line-z4` today is an *ordered* tuple scored per line (spec
   §12.6); that variant's scoring (sum of per-line levels) is a different object: these systems are scored as one
   object by system rules. Variants: `lines-2q` (k = 2, Q) and `lines-3q` (k = 3, Q). Whole-number variants are not
   recommended (owner decision 2, and the retired whole-number setups of #620).
2. **Uniqueness.** Unchanged in kind (equality of the canonical state). Σπ² is 1.7·10⁻⁴ for two lines and 1.4·10⁻⁶ for
   three (§1.1), so the uniqueness correction (spec §2.6) is small: with E[M] ≈ (N − 1)·Σπ², about 0.006 bits at 25 objects and
   0.27 bits at 1,000 for two lines, and below 0.002 bits at 1,000 for three.
3. **Representations** `sol`, `mat`, `ang`, `pencil`, `wall` (two lines), `tri`, `mat3` (three lines), with the
   elements of §1.2; every single-line representation per site. Exact rationals throughout (the answer is N/D).
4. **Mutators** of §2.2 in `lib/v2-affordances` (decision 16), each declaring its inverse, so the potential test
   (`lib/v2-linear/test/potential.test.ts`) covers them unchanged: it proposes moves and checks that every move has an
   inverse of equal weight.
5. **The law and values.** π ∝ 2^−φ restricted to distinct sets: the engine's direct-draw sampler (spec §7.0) works
   unchanged, drawing each line from the per-number mixed code and refusing duplicates (exact, since the system's φ is
   a sum). This study's sampler is that method with four tilts. **What it cannot do yet:** the rare tails. With
   240,000 draws a rule's certified top (30 draws at or above) is 10–12 bits; the extrapolation the study uses beyond
   that (along log2 of the secondary at the knot's primary) is monotone but not certified. The engine's tilted mixture
   reaches 18 bits on one line; on systems it needs tilts on what is rare *for the rule*, not on coefficient size:
   for the coincidence primaries (a whole answer, a right angle, a peg corner) the natural tilt is to draw lines
   *through* a random peg or *perpendicular* to another drawn line with a known proposal density (importance
   sampling with the exact density of the construction). Prime ladders are sieves and could be summed exactly over the
   gradients' residues, as `sums.ts` does for Divisibility Ladder.
6. **Annotations.** Every family's terms are elements above, so the contributor chain needs no new machinery; the
   ladder needs a small table view (x, each line's height, ✓/✗).

### 6.2 Recommended first cut

**The two-line object first.** It is the better landscape of the two measured here: its rules are in tension as well
as in alliance (§4.4), its climbers never froze (§4.5), and a generic sentence beat search in fewer tables (§4.7).
Three lines follow once they have rules in tension (a triangle that should be big against one that should be thin or
small) and exact values for their ladders.

- **Variant** `lines-2q`: two distinct lines over Q, an unordered set, the engine's law and code unchanged.
- **Mutators (9, so "which" stays log2 9):** per line `si.shift`, `si.tilt`, `cart.pivot` (or `rot.turn` if
  lenses-and-mutators.md's proposal is adopted), `gen.nudge`; for the system `row.add`, `pencil.turn`,
  `pair.reflect`, `pair.perpendicular`, `sys.slide`.
- **Families (5), chosen for tension and for resisting the axis trick:**

  | Family | Secondaries | Why |
  |---|---|---|
  | Right Angle | `spf`, `omega`, `gcd` (D with the answer's peg) | the tense partner of Forty-Five; the axes give D = 1, so its secondaries start at the bottom |
  | Forty-Five | `spf`, `omega`, `gcd` | the other half of the tension: the same numbers a² + b², a different pair of lines |
  | Whole Answer | `ladder` (from the answer's x), `gcd` (D), `omega` | the ladder moves with the answer, so no ceiling; the textbook's first question about a system |
  | Triangle on the Wall | `spf`, `omega`, `gcd` (base with height) | a region rule: entangled with every rule but correlated with none (§4.4) |
  | Crossing at the Gradients | `gcd`, `spf`, `ladder` | a coincidence of two aspects with no cheap direction found (§3.4) |

  Left out of the first cut: Meet on the Floor (it is the single-line Prime Landing ramp with an axis added), Treasure
  Crossing with a ladder (a ceiling of 2), No Fractions (aligned with Whole Answer and cheap at the axes), Mirror Pair
  (a powers-of-two sentence, though a lovely beginner picture; it can come back as a tension rule).
- **Values** by direct draws, as the engine already does; certify the ladder by an exact sieve sum before it is dealt.
- **Before dealing, run the collapse check with test 2′** (§4.8) on the chosen pool, on the engine's prices.

**Proposals for the coordinator (not made here; each would be a declared trial):**

1. *Anchors that do not sit on the axes.* Most §3.4 sentences put the anchor (a peg, a root, an intercept) at a big
   prime or a power of two **on an axis**, using the two cheapest lines there are. Anchors measured from the system's
   own features (the answer's peg relative to the y-intercepts' midpoint, the base on the wall, D, Δ) cannot be moved
   by a cheap `sys.slide` or by choosing the axes. Unmeasured.
2. *A dealt treasure per game and per object* for Treasure Crossing (landscape-analysis proposal 4), with a ladder
   from a moving x rather than from the treasure.
3. *Test 2′ in the standing collapse check:* the best member of a structured family ("lines through one peg",
   "corners on pegs", "the axes plus one line") against the reference search, because the adversary that matters is
   a reader of the cards, not a blind annealer.
