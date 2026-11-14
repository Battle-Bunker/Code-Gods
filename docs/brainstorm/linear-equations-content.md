# Linear equations: representations, rule families and mutators (brainstorm 3A and 3B, 14 November 2026)

Status: design only, for the owner to choose from. No engine changes. Answers sections 3A and 3B of
`docs/brainstorm/linear-equations-brief.md`. 3C (scoring without rarity) and 3D (the representation-elements API)
are other sessions' work; where this document needs a number to compare rules it uses today's rarity bits and the
energy of the cheapest path to the top, and says so.

Numbers come from `docs/brainstorm/linear-equations-measure.py` (plain Python, about 10 s). Costs follow
docs/mutation-cost-design.md: a call costs W = ℓ_which + ℓ_where + λ·d + ε bits, and an act costs energy
C = W + 0.05·W².

## 0. The recommendation in one page

**The object is the line, not the written equation.** `2y = 4x + 2` and `y = 2x + 1` are one state. Every written form
is a *lens*, computed on read, in one canonical writing per lens. Algebraic manipulation is then never a paid mutation
(it changes nothing any rule can see); it is the skill of choosing the lens in which your rule is simple to read and
your move is cheap to make (§3).

**Two boards.**

| Board | States | Contains | For |
|---|---|---|---|
| **Whole-number lines** | y = mx + c, m in −6..6, c in −12..12: **325 lines** | horizontal lines; no vertical lines | the first game (ages 11–12) |
| **Pegboard** | every line through at least two pegs of the 13×13 board [−6, 6]²: **6,460 lines** (184 directions, both axes) | vertical, horizontal, gradients like 2/3, intercepts like 5.5 | the second tier (ages 12–14) |

Both are finite. A uniform state is a fair "random line" on the first board but not on the second (81% of pegboard
lines pass through exactly two pegs, so a uniform pick is almost always an ugly line). A new pegboard line is therefore
born through two random pegs of the inner [−4, 4]² box.

**The object is one line, and every beginner rule pins down about one degree of freedom.** A line has two degrees of
freedom. A rule that pins both ("make y = 3x + 2") leaves nothing for anybody else. A rule that pins one ("the
gradient is prime", "the line passes through (3, 11)") leaves a whole family of lines. Three such rules on one line are
three conditions on two unknowns: whether one line can please all three players is literally whether a system of
equations has a solution. That is the lesson the multiplayer game teaches. Measured on the beginner eight: 17 of 28
pairs have a line that tops both, 8 of 56 triples have a line that tops all three, and the best line for a triple
still gives each player 0.83 of their top on average (lowest 0.62). A pair of lines (four degrees of freedom) is the
natural *second* object type, "Crossroads", where rules about the crossing point teach simultaneous equations
explicitly (§2.11).

**The beginner eight** (whole-number board; seven different primary representations):

| # | Rule (card sentence) | Primary representation | Shape in the (m, c) plane |
|---|---|---|---|
| 1 | **Prime Gradient**: make the gradient as close as possible to a prime number. (owner) | slope-intercept | vertical lines m = 2, 3, 5 |
| 2 | **Triangle Area**: the line and the two axes make a triangle; make its area as close as possible to A. (owner, fixed) | intercept triangle | parabola c² = 2A·\|m\| |
| 3 | **m Meets c**: make the gradient and the y-intercept as close as possible to each other. (owner) | y = mx + c symbols | diagonal c = m |
| 4 | **Taxi Meter**: a ride of k km should cost exactly £T (the meter starts at c and adds m per km). | rate and starting amount | line c = T − k·m |
| 5 | **Sequence Contains**: the pattern y(1), y(2), …, y(10) should contain the number T. | growth pattern | fan of ten lines |
| 6 | **Prime Run**: count how many different primes are among the first six terms. | table / sequence | scattered points |
| 7 | **Peg Count**: the line should pass through exactly n pegs of the board. | pegboard (lattice points) | a band (steep lines near c = 0, gentle ones near the edge) |
| 8 | **Feed Zero Square**: feed 0 into the machine (×m, then +c); the answer should be as close as possible to a square number. | function machine | horizontal lines c = 0, 1, 4, 9 |

The owner's fourth example, "minimise the gap between y(k) and x(q)", is in the second tier: reading x(q) means
solving an equation first, only 3 of the 325 lines top it, and its card is the longest (§2.12).

**Mutators.** Seven families on the whole-number board, twelve on the pegboard, each owned by a representation
(shift the y-intercept, tilt, change the step of the pattern, turn about a peg, slide, mirror, stretch an axis, nudge the
general form's constant, move an intercept, drag a peg, quarter-turn). Each call is priced by what it specifies, with
the λ's of docs/mutation-cost-design.md. The same change of line typically costs 1.2–6× more energy through the wrong lens:
y = 2x + 1 → y = (x − 1)/2 is one mirror (5.9 bits) or three coefficient edits (19.1 bits); y = 3 → x = 3 is one
mirror and cannot be done at all in y = mx + c (§4.4). Over the eight rules, an agent that may use every lens reaches
the top for 1.2–2.3× less energy than one restricted to "change m, change c" (§2.12).

**Decisions for the owner** (§7): the state is the line; the two boards and their bounds; **a call is priced as made,
not by the cheapest program that would have had the same effect** (otherwise the engine does the lens switching for
the player and the skill disappears); one line per object for the first pool; the eight; the Farey-neighbour turn as the
rotation generator.

---

## 1. Representations

Twenty-four views, in six groups. For each: what it is, its **elements** (named, addressable parts and derived
quantities; *dynamic* elements take a rule's parameter, written `(q)`), what it cannot express, how it is drawn, and
what a learner aged 11–14 learns from it. Element names are written `lens.element` so that a rule's card, its
annotation and an agent's read all name the same thing.

Conventions: the line is L. On the whole-number board L is y = mx + c. On the pegboard L is a·x + b·y + c = 0 with
whole numbers a, b, c, no common factor, and a > 0 (or a = 0 and b > 0). The window is [−6, 6]².

### 1.1 Symbolic

**R1. Slope-intercept, `si`: y = mx + c.**
- Elements: `si.m` (gradient), `si.c` (y-intercept), `si.x`, `si.y` (the pronumerals), `si.y(q)` = mq + c,
  `si.x(q)` = (q − c)/m, `si.sign(m)`, the written string with its three slots.
- Cannot express: vertical lines. Expresses horizontal lines as m = 0 and lines through the origin as c = 0 without
  trouble.
- Compact: the equation, with the slot a rule reads highlighted (`y = [2]x + 1`). Expanded: the equation with each
  slot boxed and the value of every dynamic element written beside it (`y(3) = 2·3 + 1 = 7`).
- Learns: gradient and intercept are two independent knobs; substituting a number for x.

**R2. General form, `gen`: ax + by + c = 0.**
- Elements: `gen.a`, `gen.b`, `gen.c` (primitive, as above), `gen.normal` = (a, b), `gen.step` = (b, −a) (the
  peg-to-peg step), `gen.value(p)` = a·px + b·py + c (which side of the line the point p is on, and how far in steps),
  `gen.sum` = a + b + c.
- Cannot express: nothing; it is the only symbolic form with every line. It is not unique without the normalisation.
- Compact: `2x − y + 1 = 0`. Expanded: the three coefficients as three dials, and the line drawn with arrows for
  (a, b) and (b, −a).
- Learns: x and y on an equal footing; vertical lines are ordinary; "the same line, many equations" (multiply through).

**R3. Intercept form, `int`: x/p + y/q = 1.**
- Elements: `int.p` (x-intercept), `int.q` (y-intercept), `int.ratio` = q/p.
- Cannot express: lines through the origin (both intercepts 0), lines parallel to an axis (one intercept missing).
- Compact: `x/2 + y/4 = 1`. Expanded: the two intercepts marked on the axes, each with its number.
- Learns: where the line crosses the axes; that "set y = 0" finds the x-intercept.

**R4. Point-slope, `ps`: y − y₀ = m(x − x₀).**
- Elements: `ps.anchor(q)` = (q, y(q)) for any chosen q, `ps.m`, and for the pegboard the list of pegs that can serve
  as anchors.
- Cannot express: vertical lines (as R1).
- Compact: the equation with a named anchor. Expanded: the anchor drawn as a pin, the line as a rod that turns about it.
- Learns: a line is fixed by one point and a direction; turning about a point changes m and c together.

**R5. Two-point, `two`: the line through P and Q.**
- Elements: `two.pegs` (every peg of the window on L, in order), `two.first`, `two.last`, `two.rise`, `two.run`
  between any two of them.
- Cannot express: nothing on the pegboard (every line there has two pegs). On the whole-number board a steep line may
  have only one peg in the window, so the view picks pegs outside it.
- Compact: two dots and the segment. Expanded: every peg on L, with the run and rise between neighbours.
- Learns: two points fix a line; gradient = rise ÷ run between any two of them, whichever two.

**R6. Inverse form, `inv`: x = m′y + c′.**
- Elements: `inv.m′` = 1/m, `inv.c′` = −c/m (the x-intercept again), `inv.x(q)`.
- Cannot express: horizontal lines. It is R1 with the axes swapped, and it is where vertical lines are easy (m′ = 0).
- Compact: `x = ½y − ½`. Expanded: R1 and R6 side by side with the mirror y = x drawn.
- Learns: inverse functions as "swap x and y"; why a steep line has a gentle inverse.

### 1.2 Geometric

**R7. The Cartesian line, `cart`.**
- Elements: `cart.xInt`, `cart.yInt`, `cart.angle` (with the x-axis, −90° to 90°), `cart.angleY`, `cart.point(x=q)`,
  `cart.point(y=q)`, `cart.quadrants` (which of the four it crosses), `cart.side(p)` (above or below a point),
  `cart.vdist(p)` = vertical distance to a point, `cart.chord` (the segment inside the window, its two ends and length).
- Cannot express: nothing.
- Compact: a small square plot with the line and the one element the rule reads (a dot, an angle arc, a distance tick).
  Expanded: the full window with grid, axes, intercepts labelled, and the dynamic elements of every dealt rule.
- Learns: the picture as the meaning; the sign of m is "uphill or downhill"; steep vs shallow.

**R8. The intercept triangle, `tri`.** The triangle cut off by L and the two axes.
- Elements: `tri.legX` = |xInt|, `tri.legY` = |yInt|, `tri.area` = c²/(2|m|), `tri.hyp` (the slanted side),
  `tri.perimeter`, `tri.quadrant` (where it sits), `tri.isosceles`.
- Cannot express: lines through the origin (area 0, no triangle) and lines parallel to an axis (no triangle).
- Compact: the shaded triangle with its area written inside. Expanded: legs and hypotenuse labelled, with the
  computation ½·4·4 = 8.
- Learns: intercepts as lengths; area of a right triangle; Pythagoras when the hypotenuse is asked for.

**R9. The slope staircase, `stair`: rise over run.**
- Elements: `stair.run`, `stair.rise` (the smallest whole-number step along L: (b, −a) on the pegboard, (1, m) on the
  whole-number board), `stair.steps(q)` (the staircase from one point to another).
- Cannot express: nothing (vertical is run 0).
- Compact: one step drawn under the line. Expanded: the staircase from the y-intercept to the edge of the window.
- Learns: gradient as a ratio, and the meaning of a gradient of 2/3 (up 2 for every 3 across).

**R10. Normal form, `norm`: x·cos θ + y·sin θ = p.**
- Elements: `norm.p` (distance from the origin), `norm.theta` (direction of the perpendicular), `norm.foot` (the
  point of L nearest the origin), `norm.dist(q)` for any point q.
- Cannot express: nothing (θ is ambiguous by 180° only when p = 0).
- Compact: the perpendicular from O to L with its length. Expanded: the right angle at the foot, and the
  √(a² + b²) computation.
- Learns: shortest distance is perpendicular; Pythagoras; not for the first game (square roots).

**R11. Direction vector and point, `vec`: r = P + t·d.**
- Elements: `vec.d` = (b, −a), `vec.P` (a chosen peg), `vec.point(t)`.
- Cannot express: nothing.
- Compact: one arrow on the line. Expanded: the arrows P, P + d, P + 2d … as a walking robot's path.
- Learns: lines as journeys; vectors; the "robot program" (start here, repeat: right 3, up 2).

**R12. The pegboard, `peg`: the lattice points on L.**
- Elements: `peg.list` (pegs of the window on L), `peg.count`, `peg.gap` = √(a² + b²) (distance between neighbouring
  pegs), `peg.inQuadrant(k)`, `peg.nearest(q)` (the peg on L closest to a point).
- Cannot express: nothing, but a line with no pegs is not a state at all on these boards.
- Compact: the dots of the window with the pegs on L filled. Expanded: the same with the gap drawn and the count.
- Learns: whole-number solutions of an equation; steep lines skip pegs; a gradient's denominator is the peg spacing.

### 1.3 Numeric and tabular

**R13. Table of values, `table`.**
- Elements: `table.y(q)` for the columns shown (x = 0..5 by default, plus any x a rule asks for), `table.row`.
- Cannot express: vertical lines.
- Compact: one row of five numbers. Expanded: the table with the column a rule reads highlighted and the arrows
  "+m" between neighbours.
- Learns: a line is a rule that makes a table; reading values; spotting the constant step.

**R14. Growth pattern / arithmetic sequence, `seq`.** Term n is y(n) for n = 1, 2, 3 … (pictured as matchstick
squares, tiles or stacked coins: start c + m, add m each time).
- Elements: `seq.term(n)`, `seq.first` = y(1), `seq.step` = m, `seq.zeroth` = c, `seq.contains(T)`, `seq.index(T)`
  = (T − c)/m.
- Cannot express: vertical lines; a negative step is a shrinking pattern (fine); a fractional step is awkward to draw.
- Compact: the first four terms as numbers. Expanded: the first four terms as pictures, with the "+m each time" rule
  and the nth-term formula.
- Learns: the nth term, why the formula is "step × n + (term 0)"; the classic Year 7–8 pattern lesson.

**R15. First differences, `diff`.**
- Elements: `diff.first` (always m), `diff.of(k)` = y(x + k) − y(x) = k·m.
- Cannot express: anything but m. It is the test "is it linear at all?" and nothing more, so it anchors no rule well.
- Compact: the row of differences. Expanded: table plus differences underneath.
- Learns: constant differences mean linear; the gradient is the difference.

**R16. Mapping diagram, `map`: two number lines with arrows.**
- Elements: `map.arrow(q)` from q on the x line to y(q) on the y line, `map.fixed` (a number mapped to itself:
  c/(1 − m)), `map.stretch` = m (how the arrows fan out).
- Cannot express: vertical lines.
- Compact: three arrows. Expanded: arrows from 0..5, with the fan meeting at a point when m ≠ 1.
- Learns: a function as a transformation of the number line; fixed points.

### 1.4 Contextual metaphors

**R17. Rate and starting amount, `rate`** (taxi fare: £c to start, £m per km; a tank: c litres, filling at m per
minute; savings: £c, adding £m a week).
- Elements: `rate.start` = c, `rate.per` = m, `rate.after(q)` = y(q), `rate.when(T)` = x(T).
- Cannot express: vertical lines; negative starting amounts and rates need the right story (a tank draining, a debt).
- Compact: "£3 + £2/km". Expanded: the meter ticking along a road, with the cost at each km.
- Learns: what m and c *mean*; linear models of real things.

**R18. Balance scale, `bal`: m bags of x and c weights on one pan, T on the other.**
- Elements: `bal.left(T)`, `bal.solution(T)` = (T − c)/m, `bal.isWhole(T)`.
- Cannot express: the line as a whole (it shows one equation y = T at a time); negative numbers need balloons.
- Compact: the scale with "2 bags + 1 = 9". Expanded: the steps of solving (take 1 off both pans, halve both).
- Learns: solving a linear equation by doing the same to both sides.

**R19. Function machine, `mach`: in → ×m → +c → out, and the reverse machine.**
- Elements: `mach.out(q)` = y(q), `mach.reverse(q)` = x(q), `mach.twice(q)` = y(y(q)), `mach.fixed`.
- Cannot express: vertical lines.
- Compact: the two boxes. Expanded: the boxes with an input flowing through, and the reverse machine underneath
  (−c, then ÷m).
- Learns: order of operations; inverse operations undo in reverse order.

**R20. Unit conversion, `conv`** (°C → °F is y = 1.8x + 32; cm → inches is y = 0.39x; pounds → euros).
- Elements: `conv.rate`, `conv.offset`, `conv.same` (the temperature where both scales agree, −40 for °C/°F),
  `conv.proportional` (offset 0).
- Cannot express: vertical lines.
- Compact: "°F = 1.8 × °C + 32". Expanded: the two scales side by side, like a thermometer with two labels.
- Learns: proportional (through the origin) versus not; stretching an axis is changing a unit.

**R21. Two travellers, `travel`** (distance–time: you walk at m from c; a fixed partner walks along a fixed line).
- Elements: `travel.meet` (the time and place where L crosses the partner's line), `travel.ahead(t)`.
- Cannot express: a meeting with a parallel partner (never meet), which is itself a lesson.
- Compact: the two lines with the meeting dot. Expanded: two figures on a road at times 0, 1, 2 …
- Learns: intersection = the time both equations hold; simultaneous equations by graph.

**R22. Recipe with a fixed extra, `recipe`** (pancakes: m grams of flour per person plus c for the pan).
- Elements: `recipe.for(q)`, `recipe.perPerson`, `recipe.extra`.
- Cannot express: vertical lines. Mostly a rewording of R17; kept for variety of stories, not of mathematics.
- Learns: proportional part plus fixed part.

**R23. Budget line, `budget`: a·x + b·y = −c** (apples at £a, pears at £b, spend exactly £(−c); chickens and rabbits:
2x + 4y = legs).
- Elements: `budget.combos` (whole-number solutions with x, y ≥ 0), `budget.count`, `budget.maxApples`.
- Cannot express: nothing; it is the natural story of the general form.
- Compact: "2x + 4y = 20". Expanded: the first-quadrant pegs on L, each labelled as a basket.
- Learns: equations with two unknowns have many solutions; whole-number solutions are special.

### 1.5 Other

**R24. The line's address, `addr`: the point (m, c) in the "m–c plane".** Each line is one point; each 1-condition
rule is a curve of points.
- Elements: `addr.point`, and for each rule its curve of perfect lines.
- Cannot express: vertical lines (use (a : b : c) on the pegboard).
- Compact: not for children. Expanded: a second small plot "every line is a dot here", with the dealt rules' curves.
- Learns (older or curious players, and every agent author): a whole line is one object; "please both rules" is
  "where two curves cross". It is the representation in which this document judges rules (the shape column of §2).

**Dropped as separate representations:** homogeneous coordinates (a : b : c) (the engine's storage, not a view for
children); polar form r = p / cos(θ − α) (no 11–14 content); matrices (not at this age).

### 1.6 What each representation cannot show

| Lens | vertical | horizontal | through the origin |
|---|---|---|---|
| R1 si, R4 ps, R13–R22 | no | yes (m = 0, or a constant pattern) | yes (c = 0; proportional) |
| R6 inv | yes (m′ = 0) | no | yes |
| R3 int, R8 tri | no | no | no |
| R2 gen, R5 two, R7 cart, R9 stair, R10 norm, R11 vec, R12 peg, R23 budget | yes | yes | yes |
| R24 addr | no | yes | yes |

A rule that reads an element a line lacks scores that line at the rule's worst value, never as a bonus and never as
an error (§3.4).

---

## 2. Rule families

Forty-seven candidates, grouped by their primary representation. Each entry gives the card sentence, the primary lens
(shown in compact contexts) and the lenses it also reads (shown in parallel when expanded), parameters, the score
tuple (compared lexicographically, bigger is better), what it exercises, its **shape in the (m, c) plane** (R24: the set
of perfect lines, which decides how it combines with other rules), and its risks.

Three facts shape the whole catalogue:

1. **A line has two degrees of freedom.** A rule whose perfect lines form a curve in the (m, c) plane ("1-condition")
   leaves room for others; one whose perfect lines are a few isolated points ("2-condition") does not. Beginner rules
   must be 1-condition, or a union of 1-condition curves.
2. **Many contextual rules are the same rule.** "A ride of 3 km costs £11", "the machine turns 3 into 11", "the
   table has 11 under 3", "the travellers meet at time 3 at mile 11" and "the line passes through (3, 11)" are all
   *the line passes through a point*: a straight line c = 11 − 3m in the (m, c) plane. Two such rules cross at
   exactly one line: solving a pair of simultaneous equations. A pool may hold more than one of them only with care.
3. **Rules must read the line, not a written equation** (§3). A rule like "the coefficients of your equation add up
   to 0" is allowed only because it is a property of the canonical form, which is a property of the line (it means
   "passes through (1, 1)", S4).

Board sizes below: W = whole-number board (325 lines), P = pegboard (6,460 lines).

### 2.1 Slope-intercept and symbolic (R1, R2, R6)

**S1. Prime Gradient** (owner's first example). *"Make your line's gradient as close as possible to a prime number."*
- Lens: si (`si.m`); also cart (the staircase shows rise per step).
- Params: none. Score: (−distance(m, nearest prime)). On P, m is a fraction: 5/2 scores −½, 7/3 scores −⅓.
- Worked: y = 4x − 3 scores −1 (nearest primes 3 and 5). Tilt by +1 → y = 5x − 3 scores 0. y = −2x + 1 scores −4
  (nearest prime 2): a downhill line is far from every prime, which is itself a small lesson.
- Exercises: gradient as a number; primes. Shape: vertical lines m = 2, 3, 5 (on P, every vertical with prime m, plus
  a graded neighbourhood).
- Sharing: reads only m, so it is a perfect partner for any rule that reads only c (M1) and a rival of every other
  gradient rule (G3, V4).
- Risks: on W it is coarse and easy (75 of 325 lines are perfect, 2.1 bits); there is no degenerate maximum.
- Verdict: **beginner** (the easiest of the eight; keep it, it is the owner's and the gentlest card).

**S2. m Meets c** (owner's third example). *"Make the gradient and the y-intercept as close as possible to each
other."*
- Lens: si (`si.m`, `si.c`); expanded also shows cart with the point (−1, 0) and seq.
- Params: none (a variant deals a gap d: "make c − m as close as possible to d", d in −3..3). Score: (−|m − c|).
- Worked: y = x + 5 scores −4. The insight: m = c means y = m(x + 1), so **every perfect line passes through
  (−1, 0)**, and |m − c| is exactly the height of the line above (−1, 0), |y(−1)|. A player who sees this stops
  juggling two numbers and pins one point. The cheapest fix is not to change m or c but the step of the growth
  pattern (keep y(1), change the step), which moves m − c by 2 per unit: y = x + 5 → y = 3x + 3 for 5.98 bits against
  9.15 for shifting by −4 (§5.1).
- Exercises: reading m and c; the meaning of a point on a line. Shape: the diagonal c = m (13 perfect lines on W).
- Sharing: a through-point rule; it meets every other through-point rule at one line, and it fights Triangle Area
  (a perfect m-meets-c line has area |c|/2, so area 8 needs c = 16, off the board: pair ceiling 0.63, the pool's
  lowest).
- Risks: none degenerate. Verdict: **beginner**.

**S3. Fixed Gap.** *"Make c − m as close as possible to d."* The general family of S2 (passes through (−1, d)).
Verdict: variant of S2, not a separate pool member.

**S4. Zero Sum.** *"Write your line as ax + by + c = 0 with the smallest whole numbers; make a + b + c as close as
possible to 0."*
- Lens: gen; reveals cart. a + b + c is the value of the left side at (1, 1), so the rule means "pass through (1, 1)",
  and the score is how many parallel lattice steps the line is from (1, 1).
- Exercises: substitution; the "aha" that a coefficient fact is a geometric fact. Shape: c = 1 − m (through-point).
- Risks: the card needs "smallest whole numbers, a positive" or it is ill-defined. Verdict: **tier 2**, as an
  "aha" card; never in the same pool as another through-point rule.

**S5. Product Line.** *"Make m × c as close as possible to P."* (P in 6..36 with several factor pairs.)
- Lens: si. Shape: hyperbola c = P/m (on W, P = 12 has (1, 12), (2, 6), (3, 4), (4, 3), (6, 2) and their negatives:
  10 perfect lines). Exercises: times tables, factor pairs.
- Sharing: crosses every straight shape twice; a different shape from the through-point rules, which helps a pool.
- Risks: m·c has no geometric meaning a child can see (it is −m²·xInt). Verdict: **tier 2** (spare beginner if a
  pool needs a curve that is not a through-point).

**S6. Smallest Equation.** *"Write your line with the smallest whole numbers."* (min |a| + |b| + |c|.)
Degenerate maximum (the axes, x = 0 and y = 0, score 1), 2-condition. Verdict: **drop** as a rule; useful as a
tie-breaker nowhere either (it pulls every rule to the axes).

**S7. Prime Coefficients.** *"Count how many of a, b, c are prime."* Fiddly (depends on sign conventions), pulls to
lines like 2x + 3y + 5 = 0 for no reason a child can see. Verdict: **drop**.

**S8. Intercept Ratio.** *"The x-intercept is k times the y-intercept."* That is m = −1/k: a gradient-only rule
dressed up. Verdict: **drop** (keep G3 or S1 for gradient rules).

### 2.2 Cartesian and intercept triangle (R7, R8, R9)

**G1. Triangle Area** (owner's second example, fixed). *"The line and the two axes make a triangle. Make its area as
close as possible to A."*
- Lens: tri (`tri.area`); also int (the legs) and cart.
- Why not "maximise the area", as the owner wrote it: the area is c²/(2|m|), and on any board it grows without limit
  toward the edge: steep lines far out. On W the maximum is 72 at m = ±1, c = ±12 (the corners of the board); on P it
  is 181.5 for the line through (5, 6) and (6, −6) (x-intercept 5.5, y-intercept 66, gradient −12). The optimum is
  then a fact about where the board ends, not about lines, and every maximiser converges on the same four boundary
  lines. A target area keeps the rule 1-condition and interior.
- Params: A in {2, 8, 18} on W (8 perfect lines each; other values have 4). Score: (−|area − A|); a line with no
  triangle (horizontal, or through the origin) counts as area 0.
- Worked (A = 8): y = x + 4 has intercepts −4 and 4, area ½·4·4 = 8, perfect. y = 2x + 4 has intercepts −2 and 4,
  area 4, score −4. Tilting by −1 about the y-intercept gives y = x + 4 (4.4 bits on W). On the pegboard the
  same fix is "move the x-intercept from −2 to −4" (7.8 bits), and for A = 6 from y = 2x + 4 (x-intercept to −3,
  gradient 4/3) only the intercept lens has a one-call fix.
- Exercises: intercepts; area of a triangle; that steepness and intercept trade off. Shape: the parabola c² = 2A·|m|.
- Sharing: crosses straight shapes at up to four lines; worst with m Meets c (0.63) and Taxi Meter (0.77).
- Risks: tops at 8 lines on W, 5.3 bits: one of the harder beginner rules. Verdict: **beginner**.

**G2. Whole Hypotenuse.** *"The slanted side of the triangle should be a whole number of units long."*
- Lens: tri; reads Pythagoras. Perfect: intercepts (3, 4), (6, 8), (5, 12) and signs/swaps. Score: (−distance of the
  hypotenuse from a whole number, area as a weak tie-breaker? no: none). 2-condition on W (isolated points).
- Verdict: **tier 2** for 13–14 year olds; deal it only on P, where more triples fit.

**G3. Angle Target.** *"Make the angle between your line and the x-axis as close as possible to θ."* (θ in 30°, 45°,
60°, 75°.)
- Lens: cart (`cart.angle`). Needs tan, or a protractor overlay. Gradient-only (vertical shape).
- Verdict: **tier 2** (on W every θ is reached by some whole-number gradient only roughly; on P it is graded finely).

**G4. Intercept Sum.** *"Make the x-intercept plus the y-intercept as close as possible to S."*
- Lens: int. c − c/m = S, a curve. Exercises: computing −c/m. Verdict: **tier 2**.

**G5. Isosceles.** *"Make the triangle isosceles."* Equivalent to m = ±1. Verdict: **drop** (a gradient rule with a
long card).

**G6. Window Chord.** *"The part of your line inside the board should be as long as possible."* Maximum at the
diagonals (degenerate), and the chord is a nasty computation. Verdict: **drop**.

**G7. Fair Split.** *"Cut the board into two pieces of equal area."* Equivalent to "pass through the centre"
(through-point (0, 0)). Verdict: **drop** (use a through-point rule with a clearer card).

**G8. Quadrant Tour.** *"Cross exactly k of the four quadrants."* Three values only; most lines cross three.
Verdict: **drop**.

### 2.3 Normal form, vectors and directions (R10, R11)

**V1. Ring.** *"The shortest distance from the origin to your line should be as close as possible to r."*
- Lens: norm (`norm.p` = |c|/√(1 + m²)). Shape: the hyperbola c² = r²(1 + m²). On W only 2 lines are perfect for
  r = 3 (y = ±3): 7.3 bits, the hardest measured.
- Verdict: **tier 2** (Pythagoras and square roots; deal on P with r² a sum of two squares).

**V2. Peg Foot.** *"The point of your line nearest the origin should be a peg."* Number theory ((ac, bc)/(a² + b²)
whole). Verdict: **tier 3**, for curious 14-year-olds.

**V3. Peg Gap.** *"Neighbouring pegs on your line should be exactly √k apart."* (k = 5, 10, 13, 25.) Gradient-only:
direction (1, 2) gives √5; (3, 4) gives 5. Verdict: **tier 2**, on P only.

**V4. Perpendicular Partner.** *"Make your line perpendicular to the fixed line L*."* m·m* = −1. On W only for
m* = ±1. Verdict: **tier 2**, on P; it teaches the "negative reciprocal" rule better than any worksheet.

**V5. Robot Steps.** *"Your robot's step along the line (right r, up u) should have r + u = s."* Gradient-only, card
long. Verdict: **drop**.

### 2.4 Lattice points (R12, R23)

**P1. Peg Count.** *"Your line should pass through exactly n pegs of the board."*
- Lens: peg (`peg.count`); also stair (steep lines skip pegs).
- Params: n in 3..6 (n = 13 is only the horizontal and diagonal lines through the middle: degenerate). Score:
  (−|count − n|).
- Worked (n = 4): y = 3x + 1 has pegs at x = −2, −1, 0, 1 (y = −5, −2, 1, 4): 4, perfect. y = x has 13: score −9.
  Tilting to y = 3x brings it to 5 (x = −2..2).
- Exercises: whole-number solutions; how gradient and position set how much of the line is inside the board.
  Shape: a band (gentle lines need |c| near the edge, steep ones need c near 0): 56 perfect lines.
- Sharing: easy to share; no pair of the eight scores below 0.81 with it.
- Risks: easy (2.5 bits on W). Verdict: **beginner**.

**P2. Budget Combos.** *"Your equation ax + by = T has exactly n whole-number solutions with x, y ≥ 0."* (Baskets of
apples and pears; chickens and rabbits.)
- Lens: budget / gen. Exercises: the general form as a story; listing solutions systematically. Shape: a region.
- Verdict: **tier 2**, on P (the whole-number board's lines are written y = mx + c, so the story does not fit).

**P3. Prime Pegs.** *"Count the pegs on your line whose two coordinates are both prime."* Pulls to y = x and to
nothing a child can reason about. Verdict: **drop**.

**P4. Corner to Corner.** *"Pass through as many corner pegs of the four 3×3 corner boxes as possible."* Arbitrary.
Verdict: **drop**.

### 2.5 Table, sequence and differences (R13, R14, R15)

**T1. Taxi Meter** (also "Treasure": *"when x is k, y should be t"*). *"A ride of k km should cost exactly £T."*
- Lens: rate (`rate.after(k)`); also table (`table.y(k)`) and cart (the point (k, T)).
- Params: k in 1..5, T in 5..20 (dealt so that 5–9 perfect lines fit). Score: (−|y(k) − T|).
- Worked (k = 3, T = 11): y = 2x + 3 costs 9 at 3 km, score −2. Shift +2 (6.0 bits on W) or tilt +1 (y = 3x + 3
  costs 12: overshoots); the line through (3, 11) with gradient 2 is y = 2x + 5. Every perfect line is a meter with
  start 11 − 3·rate.
- Exercises: substitution; the meaning of a rate and a start. Shape: the line c = T − k·m.
- Sharing: crosses S2 at exactly one line (here c = m and c = 11 − 3m give m = c = 2.75: not whole, so the pair's
  best line is a compromise, ceiling 0.84).
- Verdict: **beginner** (it is the through-point family's friendliest card; S2 is the same family, see §2.12).

**T2. Sequence Contains.** *"The pattern y(1), y(2), …, y(10) should contain the number T."*
- Lens: seq (`seq.term(n)`, `seq.index(T)`); also bal ("solve mx + c = T: is the answer a whole number from 1 to
  10?") and mach (the reverse machine).
- Params: T in 10..20. Score: (−min over n = 1..10 of |y(n) − T|).
- Worked (T = 12): y = x − 6 runs −5, −4, …, 4: nearest is 4, score −8. Shifting up by 8 costs 15.5 bits; tilting by
  +1 (y = 2x − 6) makes term 9 equal to 12 for 4.4 bits, because a tilt moves term n by n (§5.3).
- Exercises: the nth term; solving one linear equation; "is T in the pattern" is "is (T − c)/m a whole number from 1
  to 10". Shape: a fan of ten lines c = T − n·m (43 perfect lines on W).
- Sharing: very friendly (pairs with 6 of the other 7 at 1.00).
- Risks: the constant pattern T, T, T … is perfect (one line); harmless. Verdict: **beginner**.

**T3. Prime Run.** *"Count how many different prime numbers appear among the first six terms."*
- Lens: seq / table. Params: none. Score: (#different primes among y(1..6)). Top 5 (no six-term run of primes has a
  step under 30, so 5 is the most, for example 3, 5, 7, 9, 11, 13 from y = 2x + 1, which has 5).
- Exercises: computing a pattern; primes; why an even step from an even start can never work. Shape: scattered points
  (8 perfect lines on W, 5.3 bits); a graded count, so greedy agents climb well.
- Risks: "different" is required: without it y = 7 (a constant pattern of 7s) scores 6. Verdict: **beginner** (the
  hardest of the eight to reach in one call: 0.65 of lines have a one-call fix).

**T4. Table Total.** *"y(1) + y(2) + y(3) + y(4) should add up to T."*
- Lens: table. 10m + 4c = T: it means "pass through (2.5, T/4)": the total is four times the middle value.
- Verdict: **tier 2** ("aha" card, through-point family).

**T5. Times-Table Run.** *"Count how many of the first six terms are in the k times table (and different)."*
- Lens: seq. Perfect when m and c are both multiples of k. Verdict: **tier 2 / spare** (a gentler sibling of T3, but
  its perfect set is a lattice of points, 2-condition, so it fights more).

**T6. Square Run.** *"Count how many of the first six terms are square numbers."* Best is 3 (1, 4, 16 in 1, 4, 7,
10, 13, 16). Verdict: **tier 2**.

**T7. Crossing Check** (owner's fourth example). *"Make y(k) and x(q) as close as possible: y(k) is the height of
your line at x = k, and x(q) is where your line reaches height q."*
- Lens: table (`table.y(k)`) and mach (the reverse machine for x(q)); expanded shows cart with the two points
  (k, y(k)) and (x(q), q).
- Params: k and q in −3..3 (k ≠ q gives a non-trivial rule). Score: (−|y(k) − x(q)|); x(q) is undefined for a
  horizontal line, which scores worst.
- Worked (k = 1, q = 4): y = x + 1 has y(1) = 2 and x(4) = 3: score −1. y = 2x has y(1) = 2 and x(4) = 2: perfect.
  In general y(k) = x(q) = t means the line passes through **both (k, t) and (t, q)**; with mk + c = t and mt + c = q
  that is c(m + 1) = q − m²k. On W for k = 1, q = 4 the perfect lines are exactly y = 2x, y = −2x and y = −4x + 4.
- Exercises: function and inverse; solving for x. Shape: a rational curve, c = (q − m²k)/(m + 1).
- Risks: 3 perfect lines on W (6.8 bits); a one-call fix exists from only 54% of lines; the card is the longest of
  the candidates; it is undefined at m = 0. Verdict: **tier 2** (first in the queue; deal it on P, where many more
  lines are perfect, or with a near-miss band).

**T8. Constant Difference.** *"The first differences should all be d."* That is m = d. Verdict: **drop** (S1 is a
better gradient rule).

### 2.6 Function machines and mapping diagrams (R16, R19)

**M1. Feed Zero Square.** *"Feed 0 into your machine (×m, then +c). Make the answer as close as possible to a square
number (0, 1, 4, 9, 16 …)."*
- Lens: mach (`mach.out(0)` = c); also si.
- Params: none (a variant: "a multiple of k"). Score: (−distance(c, nearest square)).
- Exercises: order of operations (×0 first); squares. Shape: horizontal lines c = 0, 1, 4, 9 (52 perfect lines).
- Sharing: reads only c; perfect partner of S1 (12 lines top both).
- Risks: easy (2.6 bits). It is the c-only rule a pool needs so that a gradient rule has an uncontested partner.
  Verdict: **beginner**.

**M2. Fixed Point.** *"Find a whole number from 1 to 10 that your machine gives back unchanged (y(t) = t)."*
- Lens: map / mach. t = c/(1 − m). Score: (−distance of the fixed point from the nearest whole number in 1..10).
- Exercises: fixed points (the −40° where Celsius and Fahrenheit agree). Shape: a fan of lines c = t(1 − m).
- Risks: m = 1 has no fixed point (worst) unless c = 0 (every point: perfect, degenerate y = x). Verdict: **tier 2**.

**M3. Round Trip.** *"Put 1 through your machine twice. Make the answer as close as possible to T."* m² + mc + c =
T. Composition; a curve. Verdict: **tier 2**.

**M4. Undo to Whole.** *"The reverse machine turns T into a whole number from 1 to 10."* Identical to T2.
Verdict: **variant of T2** (offer it as T2's card in a "machines" theme).

### 2.7 Contextual (R17–R23)

**X1. Cheaper Plan.** *"For rides of 1 to 10 km, your plan should be cheaper than the rival plan y = 2x + 6 for
exactly n of them."* Inequalities; a region. Verdict: **tier 2** (the best first inequality rule).

**X2. Meeting Time.** *"You and the walker on y = 10 − x should meet at a whole-number time from 1 to 9."* A fan of
through-points on the walker's line. Verdict: **tier 2**, or as T2's sibling in a "journeys" theme.

**X3. Same Number.** *"Your conversion should have a temperature where both scales read the same, and it should be a
whole number."* = M2. Verdict: **variant of M2**.

**X4. Break-even.** *"Your plan and the rival plan cost the same for a ride of exactly k km."* Through-point on the
rival's line. Verdict: **variant of T1**.

**X5. Recipe.** *"Pancakes for k people should need exactly T grams."* Through-point. Verdict: **variant of T1**.

### 2.8 The address plane (R24)

**D1. In the Shape.** *"Your line's address (m, c) should land inside the shaded shape."* A meta-rule; good for
agent authors, meaningless to an 11-year-old. Verdict: **drop** as a rule; keep R24 as the designer's and agent's
tool.

### 2.9 Rules for a pair of lines (the second object type, "Crossroads")

A pair of lines has four degrees of freedom. Rules can then pin two conditions each without crowding. These are not
for the first pool; they show where the next type goes.

**H1. Peg Crossing.** *"Your two lines should cross at a peg."* (Simultaneous equations with whole-number solutions.)
**H2. Right Angle.** *"Your two lines should be perpendicular."* (m₁·m₂ = −1.)
**H3. Crossing Height.** *"The two lines should cross at height T."*
**H4. Lanes.** *"Your two lines should be parallel and exactly d apart (vertically)."*

### 2.10 Summary table

| Id | Name | Primary lens | Shape in (m, c) | Verdict |
|---|---|---|---|---|
| S1 | Prime Gradient (owner) | si | vertical lines | **beginner** |
| S2 | m Meets c (owner) | si | diagonal | **beginner** |
| S3 | Fixed Gap | si | line | variant of S2 |
| S4 | Zero Sum | gen | line (through (1, 1)) | tier 2 |
| S5 | Product Line | si | hyperbola | tier 2 (spare beginner) |
| S6 | Smallest Equation | gen | points (axes) | drop |
| S7 | Prime Coefficients | gen | scattered | drop |
| S8 | Intercept Ratio | int | vertical line | drop |
| G1 | Triangle Area (owner, target) | tri | parabola | **beginner** |
| G2 | Whole Hypotenuse | tri | points | tier 2 |
| G3 | Angle Target | cart | vertical line | tier 2 |
| G4 | Intercept Sum | int | curve | tier 2 |
| G5 | Isosceles | tri | vertical lines | drop |
| G6 | Window Chord | cart | region (degenerate) | drop |
| G7 | Fair Split | cart | line | drop |
| G8 | Quadrant Tour | cart | regions | drop |
| V1 | Ring | norm | hyperbola | tier 2 |
| V2 | Peg Foot | norm | scattered | tier 3 |
| V3 | Peg Gap | vec | vertical lines | tier 2 |
| V4 | Perpendicular Partner | vec | vertical line | tier 2 |
| V5 | Robot Steps | vec | vertical lines | drop |
| P1 | Peg Count | peg | band | **beginner** |
| P2 | Budget Combos | budget | region | tier 2 |
| P3 | Prime Pegs | peg | scattered | drop |
| P4 | Corner to Corner | peg | scattered | drop |
| T1 | Taxi Meter / Treasure | rate / table | line | **beginner** |
| T2 | Sequence Contains | seq / bal | fan of lines | **beginner** |
| T3 | Prime Run | seq | scattered points, graded | **beginner** |
| T4 | Table Total | table | line (through (2.5, T/4)) | tier 2 |
| T5 | Times-Table Run | seq | lattice of points | tier 2 / spare |
| T6 | Square Run | seq | scattered | tier 2 |
| T7 | Crossing Check (owner) | table + mach | rational curve | **tier 2, first in line** |
| T8 | Constant Difference | diff | vertical line | drop |
| M1 | Feed Zero Square | mach | horizontal lines | **beginner** |
| M2 | Fixed Point | map | fan | tier 2 |
| M3 | Round Trip | mach | curve | tier 2 |
| M4 | Undo to Whole | mach | fan | variant of T2 |
| X1 | Cheaper Plan | rate | region | tier 2 |
| X2 | Meeting Time | travel | fan | tier 2 |
| X3 | Same Number | conv | fan | variant of M2 |
| X4 | Break-even | rate | line | variant of T1 |
| X5 | Recipe | recipe | line | variant of T1 |
| D1 | In the Shape | addr | any | drop |
| H1–H4 | Crossroads rules | pair of lines | — | second object type |

### 2.11 Two degrees of freedom and three players

- **One line, 1-condition rules (recommended for the first pool).** Each rule is a curve in the (m, c) plane. Two
  curves usually cross at a few lines; three usually do not share one. On the eight, measured on W: 17 of 28 pairs
  have a line that tops both; 8 of 56 triples have a line that tops all three; the best line for a triple gives the
  geometric mean of the three shares of top **0.83** (lowest 0.62, Triangle Area with m Meets c and any third). On
  the 4×4 digit grid the corresponding pair ceilings are mostly 1.00 with the lowest 0.76. Lines are tighter, as
  two degrees of freedom must be. That is acceptable, and it is the point: the cooperative play is "find the line
  that best satisfies three conditions", the over-determined system, and the considerate agent's question "which of
  my perfect lines hurts the others least?" is answered by walking along your own curve. The multiplicative payoff
  already rewards that walk.
- **One line, 2-condition rules (rejected).** "Make the line y = 3x + 2", "pass through (1, 4) and (3, 8)", Ring on
  W. With such a rule the other players have no room and the game is a tug of war over a point.
- **Two lines per object** ("Crossroads", the second type). Four degrees of freedom for three players with
  1-condition or 2-condition rules; rules about the crossing teach simultaneous equations directly (§2.9). Costs: a
  bigger card ("which line?"), every element doubles, and the mutators need a "which line" bit.
- **One line with extra structure.** A line and a marked peg on it (three degrees of freedom: the line, and which of
  its pegs), or a line and a parameter (a "window" of x values). It adds room without a second line, but the extra part
  is arbitrary from the mathematics' point of view, and children will ask what the marked peg *is*. Not recommended.

### 2.12 Curation: the beginner eight, and the second tier

**Measured on the whole-number board** (`linear-equations-measure.py`; seven mutator families as in §4.2; energy is
the cheapest path from each of the 325 lines to the rule's top, averaged; "si only" restricts the agent to shift
and tilt, the two y = mx + c knobs):

| Rule | perfect lines | top bits (uniform) | energy to top, every lens | energy, si only | ratio |
|---|---|---|---|---|---|
| Prime Gradient | 75 | 2.1 | 5.4 | 10.3 | 1.9 |
| Triangle Area (A = 8) | 8 | 5.3 | 10.2 | 13.9 | 1.4 |
| m Meets c | 13 | 4.6 | 10.1 | 22.8 | 2.3 |
| Taxi Meter (3 km, £11) | 7 | 5.5 | 10.4 | 20.1 | 1.9 |
| Sequence Contains (12) | 43 | 2.9 | 6.4 | 11.6 | 1.8 |
| Prime Run | 8 | 5.3 | 12.1 | 23.1 | 1.9 |
| Peg Count (4) | 56 | 2.5 | 5.7 | 6.6 | 1.2 |
| Feed Zero Square | 52 | 2.6 | 6.5 | 12.9 | 2.0 |
| *Crossing Check (1, 4)* | 3 | 6.8 | 13.7 | 25.4 | 1.9 |
| *Ring (3)* | 2 | 7.3 | 15.4 | 25.0 | 1.6 |

**Why these eight.**
- Each anchors a different representation (slope, symbols, intercept triangle, rate and start, growth pattern,
  table and primes, pegboard, function machine), so a room of eight teaches eight lenses.
- They cover seven shapes in the (m, c) plane: verticals (S1), horizontals (M1), straight lines (S2, T1), a fan (T2),
  a parabola (G1), a band (P1) and scattered points (T3). Only S2 and T1 share a shape; they cross at one line (a
  pair of simultaneous equations), and the deal should avoid putting them at the same table until learners have met
  simultaneous equations (or embrace it, see §7).
- All are 1-condition, graded (a closer line scores better), and have no degenerate maximum on W.
- The owner's first three examples are in; the fourth leads tier 2.

**Where they are uneven.** Energy to the top spans 5.4–12.1 (2.2×; the digit pool's comparable `rateE` spread is
1.5×). Prime Gradient, Peg Count and Feed Zero Square are the easy three (2–3 bits, about 6 energy); Prime Run,
Triangle Area, Taxi Meter and m Meets c are the hard four (5–5.5 bits, 10–12 energy). Levers, in order of preference:
(1) parameters: Taxi Meter's (k, T) and Peg Count's n change the perfect set severalfold; (2) a near-miss tier for the
hard four ("★ to score even higher" in the layered-rules sense is the wrong direction here; they need an *easier*
base); (3) under 3C's perturbation scoring the numbers will move anyway, so the balancing is a job for the first
measured pool, not this brainstorm.

**Second tier** (ages 12–14, pegboard): Crossing Check (owner's fourth), Product Line, Zero Sum, Table Total, Angle
Target, Ring, Perpendicular Partner, Peg Gap, Intercept Sum, Fixed Point, Round Trip, Budget Combos, Cheaper Plan,
Meeting Time, Whole Hypotenuse, Times-Table Run, Square Run. They need one more idea each (solving for x, a fraction,
Pythagoras, inequality, composition), have smaller perfect sets, or only work with fractional gradients.

**Dropped** (and why, in one line each, above): Smallest Equation, Prime Coefficients, Intercept Ratio, Isosceles,
Window Chord, Fair Split, Quadrant Tour, Robot Steps, Prime Pegs, Corner to Corner, Constant Difference, In the
Shape. The pattern: gradient-only rules in disguise, degenerate maxima at the axes or the board's edge, and properties
of a written equation rather than of the line.

---

## 3. The object

### 3.1 What a state is: the line, the written equation, or something in between

| | (a) **The line** (recommended) | (b) The written equation | (c) In between: the line plus a chosen "display form" |
|---|---|---|---|
| States | one per line (325 on W, 6,460 on P) | one per triple of coefficients: 2y = 4x + 2 and y = 2x + 1 differ | one per line × form (× 5 or so) |
| "Multiply both sides by k" | no change: not a mutation; every form is a free read | a mutation that changes no line rule's score | a mutation that changes only what is drawn |
| Rules | read properties of the line, through any lens | may also read the written form ("make every coefficient even") | as (a), plus rules about the chosen form |
| Teaching | "one object, many descriptions": the central idea of the request | invites the misconception that 2y = 4x + 2 is a different line from y = 2x + 1 | children see their form persist, which is friendly, but the form is a preference, not mathematics |
| Mutators | each is defined in a lens's canonical form | the meaning of "add 1 to c" depends on how the equation happens to be written, so an agent must normalise anyway | as (a) |
| Scoring and rarity | a finite set with a natural uniform measure on W | infinite, or bounded by an arbitrary coefficient cap; most states are the same line many times | ×5 states that no rule can tell apart |

**Recommendation: (a).** The state is the line. Every lens is computed from it in one **canonical writing**:
y = mx + c with m and c in lowest terms; ax + by + c = 0 with whole numbers, no common factor, a > 0 (or a = 0 and
b > 0); intercept form when both intercepts exist; and so on. Algebraic manipulation is not a mutation: it is what an
agent (or a child) does when it *reads* the line in the form that makes its rule simple, and it is what decides which
mutator is cheap. That is where the skill of manipulation pays in this game: Zero Sum (S4) and m Meets c (S2) are both
trivial once rewritten, and an agent that rewrites y = x + 5 into "y(−1) = 4" finds the 5.98-bit fix instead of the
9.15-bit one.

The one thing (b) offers, rules about written coefficients, is either a disguised line property (S4) or arbitrary (S7);
nothing is lost. (c) is a display preference: let the *viewer* choose which lens is drawn first, per person, not per
object.

### 3.2 The number domain

| Option | States | For | Against |
|---|---|---|---|
| **W: whole-number lines**, y = mx + c, m in −6..6, c in −12..12 | 325 | every table, pattern, machine and meter value is a whole number at whole x; 11-year-olds know y = mx + c with whole m and c first | no vertical lines; mirror in y = x and quarter turns mostly leave the board, so those mutators are not offered; small (every rule's top is 2–5.5 bits under uniform rarity) |
| **P: pegboard**, every line through ≥ 2 pegs of [−6, 6]² | 6,460 (184 directions; \|a\|, \|b\| ≤ 12; \|c\| ≤ 66) | vertical and horizontal lines are ordinary; fractions with denominators up to 12; every symmetry of the square is a mutator; a rubber band on a pegboard is a perfect physical metaphor | 81% of its lines have exactly two pegs and look arbitrary; fractions for 11-year-olds |
| P with [−10, 10]² | 44,388 | more room | the same ugliness, ×7 |
| Rationals with bounded denominators but no peg condition | infinite or arbitrary | — | includes lines like 2x + 4y = 1 with no whole-number point at all, so the peg, table and budget lenses have nothing to show |
| Reals (floats) | — | — | not deterministic across languages; no bit costs (docs/mutation-cost-design.md §5.4 needs a declared quantum) |
| Unbounded whole numbers | infinite | — | maximising rules run away (the area example); no natural birth |

**Recommendation:** W for the first pool and P for tier 2. Both are finite, so today's rarity remains exactly
computable on them: a free baseline against which 3C's perturbation scoring can be checked. Both are small enough to
enumerate in an agent: optimising your *own* rule is a loop over all lines (a fine first program). What stays hard is
the price of getting there (§4) and sharing the line (§2.11), which is where the request wants the skill.

### 3.3 Birth

- **W:** uniform over the 325 lines. Every line is a reasonable line. (If the steepest lines feel noisy, weight m by
  how many pegs the line has in the window; not needed to start.)
- **P:** pick two different pegs uniformly from the inner [−4, 4]² box and take the line through them. A line is
  then born with probability proportional to the number of peg pairs it holds, so simple directions (0, ±1, ±2, ±½)
  are common and two-peg oddities rare. The birth law should also be the reference measure for 3C if 3C needs one.

### 3.4 Vertical lines, horizontal lines, the origin

- On W a vertical line is not a state; a mutator that would make one fails (like a digit pushed past 9).
- On P vertical and horizontal lines are ordinary states. Each lens declares which elements are *undefined* for
  which lines (§1.6). A rule that reads an undefined element scores the line at its own worst value, and its
  annotation says why ("a horizontal line never reaches height 4, so x(4) does not exist"). Never NaN, never a free
  pass, never an error in an agent.
- Lines through the origin: the intercept lens and the triangle are undefined (area counted as 0, §2.2 G1).
- An empty triangle, a missing intercept and a missing fixed point are themselves teaching moments; the annotation
  should show them, not hide them.

---

## 4. Mutators

### 4.1 Principles

1. **A mutator belongs to a lens and changes the line through that lens's canonical form.** "Add 1 to c" in
   y = mx + c moves the line up 1; "add 1 to c" in ax + by + c = 0 moves it to the next parallel line with pegs. They
   are different moves with different names.
2. **Price = the length of the call's code** (docs/mutation-cost-design.md §0): W = ℓ_which + ℓ_where + λ·d(argument)
   + ε, with
   - ℓ_which = log2(number of families on the board): log2 7 = 2.81 bits on W, log2 12 = 3.58 on P;
   - ℓ_where = log2 of the number of choices of *where* (which peg to turn about, which intercept, which axis);
   - λ the Kraft-tight rate of the argument's own metric: 1.585 bits per step on a whole-number slider (±k),
     **2.543 bits per step for a lattice vector** (u, v) under the |u| + |v| metric (the root of 4x/(1 − x)² = 1:
     there are 4d vectors at distance d), 2.185·log2|k| for a scale factor k (the magnitude code), log2(deg + 1) per
     hop on the Farey graph of directions (§4.3);
   - ε = 0 for all of them: every mutator here is a bijection of the plane.
   An act costs C = W + 0.05·W² as today.
3. **A call is priced as made, not by its net effect.** Docs/mutation-cost-design.md prices a grid composite by the
   cheapest program with the same before → after. For lines that rule would make every change cost its cheapest lens
   automatically, and the skill the owner wants ("rotating between lenses to find lower cost paths") would be done
   by the engine. So each call pays its own code; within one call the argument is what the agent wrote. (The only
   net-effect rule kept: a call that does not change the line is refused, so sliding a line along itself is not a
   paid no-op.)
4. **No "set the line".** Writing the target costs its cheapest path, which the agent must find.
5. **Out of the board, the call fails** (sliders do not wrap). On P a call whose result has fewer than two pegs in
   the window also fails.
6. **Every family passes the invariants of docs/mutation-cost-design.md §5.5**: identity costs 0 (and is refused),
   Kraft ≤ 1 per family (by construction), monotone in the declared distance, symmetric (+k and −k cost the same; the
   four mirrors cost the same).

### 4.2 The whole-number board: seven families (ℓ_which = 2.81 bits)

| Family | Lens | Call | W (bits) | What it does to (m, c) |
|---|---|---|---|---|
| `shift(k)` | si / rate (change the start) | k ≠ 0 | 2.81 + 1.585\|k\| | (m, c + k) |
| `tilt(k)` | si / rate (change the rate, keep the start) | k ≠ 0 | 2.81 + 1.585\|k\| | (m + k, c) |
| `step(k)` | seq (change the step, keep the first term y(1)) | k ≠ 0 | 2.81 + 1.585\|k\| | (m + k, c − k) |
| `pivot(peg, k)` | ps / peg (turn about a peg on the line) | a peg x₀ of the n on L in the window; k ≠ 0 | 2.81 + log2 n + 1.585\|k\| | (m + k, c − k·x₀) |
| `slide(u, v)` | cart (translate) | (u, v) ≠ (0, 0) | 2.81 + 2.543(\|u\| + \|v\|) | (m, c + v − m·u) |
| `mirror(which)` | cart (x-axis, y-axis, half-turn about O) | one of 3 | 2.81 + 1.585 | (−m, −c), (−m, c), (m, −c) |
| `stretch(k)` | conv / mach (multiply every output by k) | k in ±2..±4 | 2.81 + 2.185·log2\|k\| | (k·m, k·c) |

`tilt` and `step` are `pivot` about x = 0 and x = 1 with the "where" bits folded into the family. They are separate
families because each is *the* natural move of a lens (the meter's rate; the pattern's step), and children should
meet them by name.

### 4.3 The pegboard: twelve families (ℓ_which = 3.58 bits)

The seven above, with `pivot` generalised to `turn` (below), `mirror` widened to five (x-axis, y-axis, y = x,
y = −x, half-turn) and `stretch` to either axis, ×k or ÷k; plus:

| Family | Lens | Call | W (bits) | Effect |
|---|---|---|---|---|
| `nudge(k)` | gen (add k to c in ax + by + c = 0) | k ≠ 0 | 3.58 + 1.585\|k\| | the k-th parallel line with pegs, distance k/√(a² + b²) |
| `coef(a or b, k)` | gen (add k to a or to b, keep the rest) | which, k | 3.58 + 1 + 1.585\|k\| | changing a turns L about its y-intercept; changing b turns it about its x-intercept |
| `intercept(x or y, k)` | int (move one intercept by k, keep the other) | which, k | 3.58 + 1 + 1.585\|k\| | turns L about the other intercept |
| `turn(peg, hops)` (replaces `pivot`) | ps / stair (turn about a peg to a neighbouring direction) | a peg of n; a path on the Farey graph | 3.58 + log2 n + Σ log2(deg + 1) | see below |
| `quarter(peg, ±)` | vec / norm (turn 90° about a peg on L) | a peg of n; direction | 3.58 + log2 n + 1 | m → −1/m through the peg |
| `drag(keep, move, v)` | two (keep one peg, drag another by a lattice vector) | two pegs of n; v | 3.58 + log2 n + log2(n − 1) + 2.543\|v\|₁ | the line through the kept peg and the dragged one |

**Turning, and why "the next steeper direction" is the wrong step.** The directions available on P (184 of them,
sorted by angle) are unevenly spaced. Stepping to the next direction in that order costs 1.585 bits a step, and a
quarter turn is 92 steps: 146 bits. The principled step is a **Farey neighbour**: from direction (run, rise) to a
direction (run′, rise′) with run·rise′ − rise·run′ = ±1, the smallest turn after which the parallelogram of the two
staircases holds no peg. Simple directions are then close to each other: 2 → 3 is one hop (3.7 bits), horizontal →
vertical one hop (4.7 bits), 1 → −1 two hops (9.3 bits), 2 → −½ three (13.0). On the 13×13 board the mean number of
neighbours is 4.0, so a hop costs about 2.3 bits plus the start's degree. The whole-number board's `pivot` is the
special case where only whole gradients exist.

**Considered and not offered:**
- *Multiply both sides by k*: the identity on the line (§3.1).
- *Swap x and y*: offered, as `mirror(y = x)`; on W it leaves the board except at m = ±1, so it is P-only.
- *Substitute x → x − h*: it is `slide(h, 0)`; one family, two names in the card text.
- *Change one table entry and refit*: "change y(x₁) by k keeping y(x₀)" is `pivot` about x₀ with a fractional
  argument when (x₁ − x₀) does not divide k; offered only as `pivot`.
- *Rotate by an angle in degrees*: not closed on pegs.

### 4.4 Each mutator seen through the other lenses

| Mutator | si (m, c) | table / sequence | intercepts and triangle | pegs | (m, c) plane |
|---|---|---|---|---|---|
| shift k | c + k | every entry + k; differences unchanged | both move; area changes | all pegs up k | vertical move |
| tilt k | m + k | entry at x gains k·x; column 0 fixed; differences + k | y-intercept fixed, x-intercept moves | turns about (0, c) | horizontal move |
| step k | m + k, c − k | entry at x gains k(x − 1); term 1 fixed | both move | turns about (1, y(1)) | diagonal move (changes c − m by 2k: why it is m Meets c's lens) |
| pivot x₀, k | m + k, c − k·x₀ | entry at x₀ fixed | both move | turns about a peg | move along direction (1, −x₀) |
| slide (u, v) | c + v − m·u | entries shift; differences unchanged | both move | pegs move by (u, v) | vertical move (by v − m·u) |
| mirror x-axis | (−m, −c) | entries negate | reflected | reflected | point reflection |
| mirror y = x | (1/m, −c/m) | becomes the inverse table | intercepts swap | swapped coordinates | — |
| stretch y ×k | (k·m, k·c) | entries × k | x-intercept fixed, area × k | pegs thin out | ray from the origin |
| nudge k | c − k/b (when b ≠ 0) | entries shift by −k/b | both move | the next parallel peg line | vertical move |
| coef a, k | m − k/b | entry at x gains −k·x/b | y-intercept fixed | turns about the y-intercept | horizontal move |
| intercept x, k | m changes, c fixed | — | one leg changes, area changes in proportion | turns about the y-intercept | horizontal move |
| quarter | m → −1/m | — | — | — | — |

### 4.5 One change, two prices: worked examples

P examples use ℓ_which = 3.58; W examples use 2.81. Energy C = W + 0.05W², summed over acts when a lens needs
several calls.

| # | Change of line | Cheap lens: call, W, C | Dear lens: call(s), W, C | C ratio |
|---|---|---|---|---|
| 1 (P) | y = 2x + 1 → y = 2x + 5 | `slide(−2, 0)`: 8.67, 12.4 | `shift(+4)`: 9.92, 14.9 | 1.2 |
| 2 (P) | y = 3x − 2 → y = 3x + 7 | `slide(−3, 0)`: 11.21, 17.5 | `shift(+9)`: 17.85, 33.8 | 1.9 |
| 3 (P) | y = x + 1 → y = −x + 1 | `mirror(y-axis)`: 5.91, 7.7 | `tilt(−2)`: 6.75, 9.0; `turn((0, 1), 2 hops)`: 16.47, 30.0 | 1.2–3.9 |
| 4 (P) | y = 2x + 1 → y = (x − 1)/2 | `mirror(y = x)`: 5.91, 7.7 | `coef(a, −1)`, `coef(b, −1)`, `nudge(−2)`: 19.09, 25.2 | 3.3 |
| 5 (P) | y = 2x + 1 → y = −½x + 1 (perpendicular through (0, 1)) | `quarter((0, 1), +)`: 7.17, 9.7 | `turn` 3 hops: 19.17, 37.5; three coefficient calls: 23.85, 33.6; impossible in si | 3.5–3.9 |
| 6 (P) | x/2 + y/4 = 1 → x/3 + y/4 = 1 | `intercept(x, +1)`: 6.17, 8.1 | `drag((0, 4), (2, 0), (1, 0))`: 11.52, 18.2; `turn` 2 hops: 13.29, 22.1; three coefficient calls (2x + y = 4 → 4x + 3y = 12): 31.76, 51.0 | 2.2–6.3 |
| 7 (P) | y = 2x + 1 → y = 3x (both through (1, 3)) | `step(+1)`: 5.17, 6.5 | `turn((1, 3), 1 hop)`: 9.87, 14.7; `tilt(+1)` then `shift(−1)`: 10.34, 13.0 | 2.0–2.3 |
| 8 (P) | y = 2x + 1 → y = 4x + 2 | `stretch(y, ×2)`: 7.77, 10.8 | `tilt(+2)`, `shift(+1)`: 11.92, 15.6 | 1.4 |
| 9 (P) | y = 2x + 1 → y = −2x − 1 | `mirror(x-axis)`: 5.91, 7.7 | `tilt(−4)`, `shift(−2)`: 16.67, 23.9 | 3.1 |
| 10 (P) | y = 3 → x = 3 | `mirror(y = x)`: 5.91, 7.7 | `quarter((3, 3))`: 8.29, 11.7; `turn((3, 3), 1 hop)`: 11.99, 19.2; impossible in si | 1.5–2.5 |
| 11 (W) | y = 2x + 1 → y = 2x − 5 | `slide(3, 0)`: 10.44, 15.9 | `shift(−6)`: 12.32, 19.9 | 1.3 |
| 12 (W) | y = x + 5 → y = 3x + 3 (m Meets c) | `step(+2)`: 5.98, 7.8 | `shift(−4)` to y = x + 1: 9.15, 13.3 | 1.7 |
| 13 (W) | y = x − 6 → y = 2x − 6 (Sequence Contains 12) | `tilt(+1)`: 4.39, 5.4 | `shift(+8)` to y = x + 2: 15.49, 27.5 | 5.1 |

Rules of thumb a child (and an agent) can learn from the table:
- **Steep line, move it up?** Slide it sideways: one step across is m steps up (1, 2, 11).
- **Far term of a pattern?** Tilt: term n moves n times as far as the tilt (13).
- **Keep a point you like?** Turn about it, by the lens that pins it: `tilt` keeps the y-intercept, `step` keeps the
  first term, `intercept` keeps the other intercept, `pivot` keeps a peg (6, 7, 12).
- **Big symmetric changes** (negate the gradient, invert, go perpendicular, swap vertical and horizontal) are one
  mirror or quarter turn, never a chain of coefficient edits (3, 4, 5, 9, 10).

### 4.6 Checks

- Kraft: each family's argument code sums to at most 1 by construction; families share the board's uniform family
  prior. Different calls that reach the same line make the code redundant (the sum over *lines* is below 1), which
  is allowed and is exactly the room lens choice exploits.
- The prices sit in the same range as the shipped digit board's (a one-step nudge 4.4 bits on W and 5.2 on P,
  against 5.58 for a +1 on a 4×4 digit board), so the energy economy carries over unchanged.
- The cost-aware greedy on W (`linear-equations-measure.py`) reaches every beginner rule's top for 5–12 energy:
  one or two acts.

---

## 5. What agents would look like

An abstract agent API, consistent with the brief (3D will settle the real one): `line.view(lens)` returns that
lens's elements (free); `price(call)` returns the call's bits; `preview(line, call)` returns the resulting line or
None, without committing (free: it is a read); `commit(call)` pays.

### 5.1 m Meets c: switching to the growth-pattern lens

```python
def act(line):
    m, c = line.view("si").m, line.view("si").c
    gap = c - m                      # = y(-1): how high the line is above (-1, 0)
    if gap == 0:
        return skip()
    options = [[shift(-gap)], [tilt(+gap)]]          # the y = mx + c knobs: change c, or change m
    k, rest = divmod(gap, 2)                           # the pattern lens: keep y(1), change the step;
    options.append([step(k)] + ([shift(-1)] if rest else []))   # each unit of step closes the gap by 2
    for u in (-3, -2, -1, 1, 2, 3):                    # the picture lens: slide sideways by u and up by v,
        options.append([slide(u, m * u - gap)])        # which moves c by v - m*u = -gap
    options = [o for o in options if all_valid(line, o)]
    best = min(options, key=lambda o: sum(energy(price(call)) for call in o))
    return commit(best[0])           # one call per act; the rest next time
```

From y = x + 5 it finds `step(+2)` (7.8 energy) instead of `shift(−4)` (13.3). From y = 4x + 12 (gap 8) the slide
wins: `slide(2, 0)` moves c by −m·u = −8 (to y = 4x + 4) for 7.9 bits, against 15.5 for `shift(−8)`; `step(+4)`
would push m to 8, off the board. Which lens is cheapest depends on the line: that is
the point of offering all of them.

### 5.2 Sequence Contains T: let the term number choose the lens

```python
def act(line, T):
    m, c = line.view("si").m, line.view("si").c
    best = None
    for n in range(1, 11):                     # for each term of the pattern
        gap = T - (m * n + c)                  # how far term n is from T
        if gap == 0:
            return skip()
        cands = [shift(gap)]                   # move every term by gap
        if gap % n == 0:
            cands.append(tilt(gap // n))       # a tilt of k moves term n by k*n
        if n > 1 and gap % (n - 1) == 0:
            cands.append(step(gap // (n - 1))) # a step of k (keeping term 1) moves term n by k*(n-1)
        for call in cands:
            if valid(line, call) and (best is None or price(call) < price(best)):
                best = call
    return commit(best)
```

It discovers that tilting makes the far terms cheap: y = x − 6 needs `tilt(+1)` (term 9 becomes 12, 5.4 energy)
rather than `shift(+8)` (27.5).

### 5.3 Triangle Area A: search every lens, one call deep (the cost-aware greedy)

```python
FAMILIES = ["shift", "tilt", "step", "pivot", "slide", "mirror", "stretch"]

def area(line):
    m, c = line.view("si").m, line.view("si").c
    return 0 if m == 0 or c == 0 else c * c / (2 * abs(m))

def act(line, A):
    here = -abs(area(line) - A)
    if here == 0:
        return skip()
    best, best_rate = None, 0
    for call in all_calls(line, FAMILIES, max_arg=4):   # every family, small arguments: about 200 calls
        new = preview(line, call)
        if new is None:
            continue
        gain = -abs(area(new) - A) - here
        rate = gain / energy(price(call))
        if gain > 0 and rate > best_rate:
            best, best_rate = call, rate
    return commit(best) if best else skip()
```

The lens switching here is implicit: the agent tries every family and keeps the best gain per energy. A considerate
version adds one line: skip any call whose preview lowers what it can infer of the other players' rules (on this
object type, the visible history of their agents' moves is a strong hint: a player who only ever tilts about (0, 4)
cares about the y-intercept).

---

## 6. Open questions, and what to test with learners first

**Open questions for the design.**
1. **3C will change the difficulty numbers.** Under perturbation scoring a rule with a big perfect set (Prime
   Gradient: whole columns of the (m, c) plane) is robust to random moves, so its states may be worth *more*, not
   less, than its 2.1 rarity bits suggest. The eight should be re-balanced once 3C's estimator exists; this document's
   energy-to-top column is the input it will need.
2. **Is one line per object too tight at four players?** Four 1-condition rules on two unknowns. Measure triple and
   quadruple ceilings on the eight; if the four-player mean falls under about 0.7, offer "Crossroads" (two lines) for
   four or more.
3. **Should the deal avoid two through-point rules at one table?** (m Meets c with Taxi Meter.) Their best line is
   one point; a pair of simultaneous equations is either a lesson or a frustration depending on the year group.
4. **Per-call pricing invites exhaustive call search** (§5.3). That is fine (it is the lens skill done by program),
   but it means the assistant can write the optimal one-call agent at once. The lasting skill is then multi-call
   planning and cooperation. Is that the intended ceiling for juniors? Probably yes.
5. **Turning on the Farey graph is principled but hard to explain.** Children may need "turn to the next simple
   direction" with a picture of the two staircases; or the beginner board keeps only whole-number `pivot`.
6. **Fractions on P.** The pegboard needs "gradient 2/3" and "x-intercept 5.5" in every lens. Draw them, never
   decimals.

**What to test with learners first** (before any engine work):
1. **A paper pegboard game** (an afternoon, six children aged 11–13): a 13×13 pegboard, a rubber band per object,
   the eight cards, price cards in bits (shift 1 = 4 tokens, slide one across = 5, mirror = 4.4 …), three players per
   board. Watch for: do they read the card in its primary lens or translate it; do they discover sliding and the
   step move without being told; do they talk about the shared line ("if you tilt it about (0, 4) I'm still happy").
2. **Card comprehension**: each card alone; the child scores three given lines. Pass mark: two of three right for
   every beginner card. Crossing Check is the one expected to fail at 11.
3. **"One object, many forms"**: show y = 2x + 1 and 2y = 4x + 2 and ask whether they are the same object. Children
   who say no are exactly the audience for the parallel views; the expanded view should then show both forms of one
   line side by side, and the test is repeated after a game.
4. **Which lens do they act in?** Give a target line and the price list; record which mutator they choose. If
   nobody uses `step` or `slide`, the names or pictures are wrong, not the idea.
5. **Undefined elements**: give a horizontal line to a Crossing Check player and see whether "x(4) does not exist"
   is understood or felt as unfair.

---

## 7. Decisions for the owner

1. **State = the line** (not the written equation). Algebraic manipulation is a free lens, not a mutation (§3.1).
2. **Two boards**: whole-number lines (y = mx + c, m in −6..6, c in −12..12; 325 lines) for the first pool;
   pegboard (lines through two pegs of [−6, 6]²; 6,460 lines) for tier 2. Bounds are a parameter (§3.2).
3. **Price each call as made**, not by the cheapest program with the same effect, so that lens choice is the
   player's skill (§4.1). This departs from the grid's net-effect rule on purpose.
4. **One line per object** for the first pool, with only 1-condition rules; "Crossroads" (two lines) as the second
   type (§2.11).
5. **The beginner eight** (§0, §2.12): Prime Gradient, Triangle Area (as a target, not a maximum), m Meets c, Taxi
   Meter, Sequence Contains, Prime Run, Peg Count, Feed Zero Square. The owner's fourth example (Crossing Check)
   leads tier 2.
6. **The mutator families**: seven on W, twelve on P, with the Farey-neighbour turn as the rotation (§4.2, §4.3).
