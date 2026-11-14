# Rule brainstorm C: families designed for the table (negotiation)

Status: brainstorm (14 November 2026), revised the same day for three owner rules (§0), one of five independent brainstorms on layered rule families for the v2 line
(`docs/engine-v2/spec.md` §4.4 ladders, §12 the line). This one's slant: design for the table, not the solo player.
Owner decision 9 says the comparative advantage is "carefully coordinating with other players to find agents that
efficiently pursue states that meet an intersection of value among the cooperating players' utility functions while
collectively defending those objects against damage by non cooperating players", and decision 5 says "We want
collisions of values". So every family here was designed as a member of a set, and most of the document is about the
sets: which pairs share lines, which triples force a choice, what the negotiations look like in numbers, and how a
spoiler attacks.

Every claim about an intersection, a score or a price below was checked by
[`scripts/negotiation_families.py`](scripts/negotiation_families.py) (standalone Python, exact rationals, the line-q
read length of spec §12.2 and the price list of §12.4; no engine). Its full output is
[`scripts/negotiation_families.out.txt`](scripts/negotiation_families.out.txt). Run it with
`python3 -I docs/engine-v2/rule-brainstorm/scripts/negotiation_families.py [families|examples|pairs|triples|pool|coalitions|claims|levels|beginner|negotiations|attacks|defend]`
(about five minutes for everything; the slow part is scoring a grid of 186,000 lines against 18 families once).

## 0. Revision: the owner's three rules

The coordinator relayed three owner rules after the first version merged (#355). This version applies them.

1. **Every rung is graded.** The owner: "binary decisions are worthless for extending the ladder. Require all rules to be
   continuous". Every yes/no rung of the first version became a distance, a count or a size. "Is prime" became the
   distance to the nearest prime, "is whole" the distance to the nearest whole number and "equals" the absolute
   difference (the list is in §2). §3 gives each rung's number of levels on the checker's grid (section `levels`).
2. **Beginner primaries are for a twelve-year-old on a first linear-equations course, with some latitude.** The owner
   allows "area and any other features ... within reach of some dedicated study by a smart 12yo". Each primary in the
   pool of eight (§5) is tagged **core curriculum** or **stretch (what the child would look up)**, and its card uses
   textbook words.
3. **No tertiary preferences, but several secondary candidates.** The owner, as corrected: "I said I don't want tertiary
   preferences but I will want several secondary rule candidates within each family." A pool family is one primary plus
   three graded secondary candidates (§5). A dealt rule is the primary plus ONE candidate, two rungs deep. The
   coordinator's provisional call is that there is no gating: the score is a plain lexicographic tuple (primary,
   secondary), so the secondary orders lines at every level of the primary, not only at its top. The other eight
   families keep their longer ladders and are marked **second pool**.

The negotiations (§4.3) are restated as positions on the pool's two graded scales. The intersections, the empty pairs
and the attacks read only the primaries, so they did not change.

## Contents

1. The idea in a page
2. Conventions
3. The sixteen families
4. Interaction analysis
   - 4.1 The compatibility table
   - 4.2 The pool's 28 pairs, described exactly
   - 4.3 Two-player negotiations (seven, in numbers)
   - 4.4 Three-player situations (four, with a real choice of coalition)
   - 4.5 The spoiler: the cheapest attack on each of the top eight, and the defence
5. The recommended pool of eight
6. Open questions for calibration

---

## 1. The idea in a page

**A line has two degrees of freedom; a family's primary should usually pin exactly one.** Then the other is the
bargaining chip: a player whose rule pins the y-intercept does not care what the gradient is, and can offer it to anyone.
Two families that each pin one degree of freedom meet on a set of lines that is usually infinite but thin, and finding it
takes insight into how the two quantities relate (the y-intercept and the x-intercept are related through the gradient;
the area of the intercept triangle is c²/2|m|; the distance from the origin is |c|/√(1 + m²)). Three such families
meet, typically, nowhere: any two can be satisfied, the third cannot, and which two is the negotiation.

**Secondaries are where the bargaining happens.** Once two players agree on a joint top line, they still have a
one-parameter family (or a lattice) of joint lines to choose from, and their secondaries pull in different directions
along it. A good secondary is (a) cheap for a partner to grant (the partner does not care about it), or (b) a real
conflict with a natural partner, so that the pair has something to trade. Most families below have one of each.

**Hidden oppositions are the best lessons.** The interesting pairs are those whose cards look friendly and are
impossible, or look opposed and share a rich set:

- *Square Corner* (the intercept triangle's area is a square) and *Ruler* (the line's distance from the origin is a
  whole number) look like friendly geometry. They never meet: a line at the top of both would be a right triangle with
  rational sides and square area, which Fermat proved impossible (his right-triangle theorem; 1 is not a congruent
  number). The closest pair of near-misses on the grid is `y = 18x + 18` (Square Corner exact, Ruler off by 1/325).
- *Matched Pair* (the gradient's numerator equals the y-intercept's denominator) looks like the enemy of *Whole
  Landing* (the y-intercept is whole). They share every line `y = ±x/e + N`: when the denominator is 1, the numerator
  must be 1. The catch is that Matched Pair's secondary (that shared number should be a large prime) is then at its
  floor, so the friendship costs Matched Pair a rung, and that is the trade.
- *Long Division* (the gradient's decimal repeats every six digits, like 1/7) looks like the fraction-lover opposed to
  Whole Landing; its own third secondary asks for a whole y-intercept, so the pair is almost free.
- *Prime Coefficients* (in ax + by + c = 0, the three numbers are different primes) looks harmless and is impossible
  with Whole Landing, Whole Crossing, Square Corner, Ruler, Pythagorean Normal and Matched Pair: whole intercepts force
  one prime to divide another, and two primes are never the legs of a Pythagorean triangle.

**Defence is about what the cheap moves do.** Every attack in the walk is a priced call, and the cheapest calls are the
four mirrors (5.17 bits), unit shifts and tilts (6.17) and unit gen nudges (6.75). Under confining prices an attack that
*simplifies* the line pays no surcharge while its repair climbs back and pays one; so the family that is easy to defend
is one whose top set is closed under the cheap moves (Whole Landing: every whole shift, tilt, step and three of the four
mirrors leave a whole y-intercept whole; its cheapest damage is 8.75 bits), and the pair that is easy to defend is one
whose joint line is fixed by the cheap mirrors (Whole Landing + Whole Crossing on `y = −x + N`: the diagonal mirror
swaps the two intercepts, so it changes nothing either player cares about, and hurting both partners at once costs
14.17 bits against 6.17 to hurt one).

**The pool** (§5): Whole Landing, Whole Crossing, Square Corner, Ruler, Matched Pair, Half-Way House, Fixed Point and
Long Division. Each has a primary a twelve-year-old can check (five core curriculum, three stretch) and three graded
secondary candidates; a dealt rule takes one. Across its 56 triples: 30 have a common line, 18 are "two of the three pairs only" (a real coalition
choice), 5 are "every pair but not all three" (the purest choice) and 3 have only one compatible pair (§4.4).

---

## 2. Conventions

- The domain is `line-q` (spec §12.1): every line with rational coefficients. The families here are all undefined on
  vertical lines (WORST), and several are undefined on more (stated per family). A non-vertical line is y = mx + c with
  m, c ∈ ℚ; p = −c/m is the x-intercept (m ≠ 0); (a, b, c₀) is the primitive integer triple of ax + by + c₀ = 0 with
  b > 0 (spec §12.1, so m = −a/b and c = −c₀/b). den(x) and num(x) are the denominator (≥ 1) and numerator of x in lowest
  terms. ‖x‖ = |x − round(x)| is the distance to the nearest integer; N = round(x) rounds halves up. spf(n) is the smallest
  prime factor of |n| (1 for |n| ≤ 1), Ω(n) the number of prime factors of |n| with multiplicity, τ(n) the number of
  divisors of |n| (0 for n = 0). "Pegs" are the lattice points of [−6, 6]² on the line (spec's `peg.pegs`).
- A score is a lexicographic tuple (primary, S1, S2, S3); every component written so that bigger is better (a "min" is
  stored negated, as spec §4.2 does). The primary's ladder is spec §12.5's: for a distance, `d ≤ 8, 4, 2, 1, 1/2, 1/4,
  1/8, 0`; for a count, every count. Secondaries lengthen the ladder above the primary's top (spec §7.8 lever 3); a
  calibration would add rungs for each secondary value it sees.
- φ is the read length (spec §12.2, line-q: int(a) + int(b) + int(c₀)). Prices are spec §5.2: W = log2 9 (3.17) + the
  argument's bits + max(0, φ(after) − φ(before)). The cheap calls: a mirror 5.17 bits; si.shift, si.tilt or seq.step by
  ±1 6.17; gen.nudge by ±1 6.75; by ±2 or ±3 8.17 / 8.75; by ±1/2 8.17 plus surcharge.
- **All rungs are graded** (owner rule, §0): each is a distance to the nearest member of a set, a count, a size or a
  number of factors, never a yes/no. The first version's yes/no rungs were converted as follows:
  - SC's "whole legs" became ‖p‖ + ‖c‖;
  - PT's "y(6) is prime" became the distance from y(6) to the nearest prime;
  - RU's "the foot is a peg" became the foot's ‖x‖ + ‖y‖;
  - LD's "den(m) is prime" became spf(den(m));
  - LS's "misses the centre" became min(|c|, 6);
  - SG's "c/M is whole" became ‖c/M‖;
  - PN's "|c₀| is prime" became the distance from |c₀| to the nearest prime;
  - MP's "on a diagonal" became ||p| − |c||;
  - MA's "matched, then spf" became spf(|num(m)|), and its "crossed" became |den(m) − |num(c)||.
- **Levels.** "Levels" counts the distinct values a rung takes on the checker's grid (denominators up to 8): a primary
  over a sample of every line, a secondary over the family's top lines. The grid undercounts distances and unbounded
  sizes; on the real domain they have many more.
- The scores in this document are printed as the script prints them, e.g. Whole Landing on `y = −x + 5` is
  `(0, 5, −1, 8)`: distance 0, smallest prime factor 5, denominator of m is 1, eight pegs.
- Short names, used in tables: WL Whole Landing, WC Whole Crossing, SC Square Corner, FP Fixed Point, PT Prime Table,
  RU Ruler, PC Prime Coefficients, LD Long Division, HW Half-Way House, GK Gatekeeper (G11, G−10, G25 for its gates (1, 1),
  (−1, 0), (2, 5)), LS Long Shot, SG Steady Gradient, PN Pythagorean Normal, ST Square Term, MP Midpoint Peg, MA Matched
  Pair.

---

## 3. The sixteen families

Each entry: the card (one sentence a twelve-year-old can check by eye), the primary's representation and exact
mathematics, three secondaries (exact), a line that does well with its full ladder evaluated, the degrees of freedom the
primary pins, and what the family teaches. "Hooks" names the quantities other families also read, which is what makes
the family a negotiating partner.

### 3.1 Whole Landing (WL) (the owner's first example)

- **Card.** Where the line crosses the y-axis should be a whole number.
- **Primary** (cart: `cart.yInt`; also si.c). min ‖c‖.
- **S1** max spf(N), N = round(c): the whole number it lands on should have a big smallest prime factor (a prime is
  best; 0 and ±1 count as 1). **S2** min den(m): the gradient should be a simple fraction. **S3** max pegs.
- **Example.** `y = −x + 5` (φ 13): (0, 5, −1, 8): lands on 5, a prime; gradient −1; eight pegs, (−1, 6) to (6, −1).
- **Pins** c. **Free** m entirely: the gradient is Whole Landing's bargaining chip.
- **Hooks** c, N, den(m).
- **Teaches** the y-intercept in every representation (cart.yInt, si.c, table.y0, mach.out(0), seq.zeroth), prime
  factors, and (S2 and S3 together) why a simple gradient puts more pegs on the line.

### 3.2 Whole Crossing (WC)

- **Card.** Where the line crosses the x-axis should be a whole number.
- **Primary** (int: `int.p`; also cart.xInt, mach.reverse(0)). min ‖p‖, p = −c/m; horizontal lines are WORST.
- **S1** max τ(P), P = round(p): the crossing should have many divisors (P = 0 counts 0). **S2** min |num(m)|: the line
  should rise 1 at a time (rise 1, run n). **S3** min den(c).
- **Example.** `y = x/3 − 4` (φ 17): (0, 6, −1, −1): crosses at 12, which has six divisors; rise 1 per 3; y-intercept −4.
- **Pins** p. **Free** the rotation about (P, 0).
- **Hooks** p = −c/m (links c and m), num(m), den(c).
- **Teaches** that the x-intercept is −c/m (a division), divisors, and the axis swap: the diagonal mirror turns Whole
  Crossing into Whole Landing.

### 3.3 Square Corner (SC) (the owner's second example)

- **Card.** The line and the two axes make a triangle; its area should be a square number (1, 4, 9, 16, …).
- **Primary** (tri: `tri.area`; also cart). min |A − r²|, A = c²/(2|m|), r ≥ 1 the integer whose square is nearest. Lines
  through the origin or parallel to an axis are WORST.
- **S1** max Ω(r): the side of that square should have many prime factors (the owner's "number of prime factors in the
  root"; 9 levels on the grid). **S2** min ‖p‖ + ‖c‖: the legs should be close to whole numbers (9). **S3** min the distance from the hypotenuse
  squared, p² + c², to the nearest square: the triangle should be nearly a Pythagorean one.
- **Example.** `y = −x/2 + 4` (φ 17): (0, 2, 0, −1): legs 8 and 4, area 16 = 4², Ω(4) = 2, both legs whole, hypotenuse²
  80 is one away from 81.
- **Pins** the area (one equation, |m| = c²/(2r²)). **Free** the position along that curve (for each whole y-intercept
  there is exactly one gradient per r).
- **Hooks** the legs (= the two intercepts), the hypotenuse (Pythagorean slopes).
- **Teaches** area = c²/2|m| from the two intercepts; squares; Fermat's right-triangle theorem through S3 (on Square
  Corner's top S3 is *never* 0: a rational right triangle with square area does not exist, so S3 is an endless
  near-miss ladder; the checker confirms no top line of the grid reaches it).

### 3.4 Fixed Point (FP)

- **Card.** Find the number the machine gives back unchanged (put it in, get it out); it should be a whole number.
- **Primary** (mach: `mach.out`; also cart, where it is the point where the line crosses y = x). min ‖X‖, X = c/(1 − m);
  m = 1 is WORST (no fixed number, or every number).
- **S1** min |m + 1|: the line should cross the diagonal at right angles (the machine is its own reverse machine).
  **S2** max min(|round X|, 12): the meeting point should be far out. **S3** min den(c).
- **Example.** `y = −x + 8` (φ 15): (0, 0, 4, −1): 4 in, 4 out; m = −1; meets y = x at (4, 4).
- **Pins** the fixed point (the line passes through the lattice point (X, X)). **Free** the rotation about it.
- **Hooks** X links m and c; m = −1 (the diagonal mirror fixes such lines).
- **Teaches** fixed points of functions, the line y = x, inverse functions, perpendicular gradients (m·1 = −1).

### 3.5 Prime Table (PT)

- **Card.** In the table of values for x = 0 to 5, as many of the six answers as possible should be different primes.
- **Primary** (table: `table.y0` … `table.y5`). max |{y(k) : 0 ≤ k ≤ 5, y(k) a prime}|.
- **S1** min the distance from y(6) to the nearest prime: the run nearly goes on. **S2** max the smallest prime in the
  run. **S3** min |m|. (Second pool.)
- **Example.** `y = 30x + 7` (φ 21): (6, −4, 7, −30): 7, 37, 67, 97, 127, 157; y(6) = 187 = 11·17, 4 below the prime 191.
- **Pins** both (six primes in arithmetic progression force m to be a multiple of 30: if 5 did not divide m, y(k) and
  y(k + 5) would both be multiples of 5 for some k, and likewise for 2 and 3; the grid's top set is five lines, all with
  m = ±30 or ±60).
- **Hooks** c prime (Whole Landing's S1), m with many divisors (Steady Gradient's S1).
- **Teaches** arithmetic progressions, and the argument mod 2, 3 and 5 for why the step must be a multiple of 30.
- A climber: its top is far from the cheap centre (φ ≥ 21), which is what the owner's pricing principle wants, and
  fragile (§4.5); kept out of the pool for that reason.

### 3.6 Ruler (RU)

- **Card.** Measure the shortest distance from the centre (0, 0) to the line: it should be a whole number. The line must
  slope.
- **Primary** (cart: the foot of the perpendicular; uses si). min |D² − k²|, D² = c²/(1 + m²), k ≥ 1 the integer whose
  square is nearest. m = 0 is WORST.
- **S1** min ‖fx‖ + ‖fy‖ for the foot of the perpendicular (fx, fy) = (−mc, c)/(1 + m²): the line's nearest point to the
  centre should be close to a peg (13 levels on the grid). **S2** max min(k, 12): farther is rarer (11). **S3** min den(m) (5).
- **Example.** `y = −3x/4 + 25/4` (φ 23): (0, 0, 5, −4): distance 5, and the nearest point of the line to the centre is
  the peg (3, 4).
- **Pins** both, discretely: m must be a Pythagorean slope (1 + m² a rational square: ±3/4, ±4/3, ±5/12, ±12/5, ±8/15,
  …) and then c = k·h/v for the slope u/v of a triple (u, v, h).
- **Hooks** Pythagorean slopes (shared with Pythagorean Normal and Square Corner's S3), c a multiple of the hypotenuse.
- **Teaches** the distance from a point to a line, Pythagorean triples, rational points on a circle.

### 3.7 Prime Coefficients (PC)

- **Card.** Write the equation as ax + by + c = 0 with the smallest whole numbers: a, b and c should be three different
  primes (ignore minus signs).
- **Primary** (gen). max |{|a|, |b|, |c₀|} ∩ primes| counting different values only.
- **S1** min |a + b + c₀| (the line passes near (1, 1)). **S2** max min(|a|, |b|, |c₀|). **S3** max pegs.
- **Example.** `2x + 3y − 5 = 0`, i.e. `y = −2x/3 + 5/3` (φ 17): (3, 0, 2, 4): 2, 3, 5; 2 + 3 − 5 = 0 so it passes
  through (1, 1).
- **Pins** both, onto a large discrete set. Second pool. The primary is a count with only 4 levels (0 to 3); its
  secondaries have 84, 4 and 5 on the grid.
- **Teaches** the general form and lowest terms. Its role at the table is the hidden opposition (§4.1): it shares no line
  with six other families, and the reasons are two short proofs a player can learn.

### 3.8 Long Division (LD)

- **Card.** Work the gradient out as a decimal: its repeating block should be exactly six digits long, like
  1/7 = 0.142857 142857 ….
- **Primary** (si: `si.m` as a decimal). min |ℓ(m) − 6|, ℓ(m) the period of the decimal expansion (0 if it stops),
  ℓ = ord_q(10) for q = den(m) with its 2s and 5s removed. (A parameter L ∈ {6, 16, 18} is possible; 6 is the first.)
- **S1** min |num(m)|: a unit fraction. **S2** max spf(den(m)). **S3** min den(c): a simple y-intercept (8 levels on the
  grid; this is the pool's default candidate).
- **Levels.** On the grid the primary takes only the values 0, 5 and 6, because denominators stop at 8. On the real domain
  |ℓ − 6| takes every value from 0 to 6 and beyond: period 1 for 1/3, 2 for 1/11, 3 for 1/27 and 1/37, 4 for 1/101,
  5 for 1/41, 16 for 1/17.
- **Example.** `y = x/7 + 2` (φ 19): (0, −1, 7, −1).
- **Pins** m's denominator class (7, 13, 21, 39, 63, 91, … and their multiples by 2s and 5s). **Free** c.
- **Hooks** den(m) (the opposite of Whole Landing's S2), c whole (Whole Landing's primary, granted by S3).
- **Teaches** long division, why 1/7 and 1/13 both repeat every six (both divide 999 999), why 1/49 repeats every 42.

### 3.9 Half-Way House (HW)

- **Card.** At x = ½ the line should be at a whole number.
- **Primary** (table: `table.y(1/2)`; also cart.pointAtX). min ‖m/2 + c‖.
- **S1** max spf(H), H = round(m/2 + c) (43 levels on the grid). **S2** min den(m). **S3** min ‖m/2‖: an even gradient.
- **Example.** `y = 4x + 5` (φ 17): (0, 7, −1, 0): y(½) = 7.
- **Pins** the value at ½ (the line passes through (½, H)). **Free** the rotation about it.
- **Hooks** m/2 + c (with c whole it asks for an even m; with m whole it asks for c whole or a half).
- **Teaches** evaluating at a fraction; parity ("half" and "whole" agree exactly when the gradient is even).

### 3.10 Gatekeeper (GK), parameter g ∈ {(1, 1), (−1, 0), (2, 5), (3, −3)} (the script checks the first three)

- **Card.** The line should pass through the gate at g.
- **Primary** (cart: `cart.pointAtX(gx)`). min |y(gx) − gy|.
- **S1** max pegs. **S2** min den(m). **S3** min den(c).
- **Example.** Gate (1, 1): `y = −x + 2` (φ 11): (0, 11, −1, −1).
- **Pins** a pencil (lines through g). **Free** the rotation.
- Second pool (the gate is a parameter, which makes deals uneven).
- **Teaches** that two points fix a line: two gatekeepers with different gates share exactly one line (`y = x/2 + 1/2`
  for (1, 1) and (−1, 0)), which is the cleanest "any two of three" triple (§4.4). Gate (1, 1) is spec's `zero-sum`
  seen as a point; gate (−1, 0) is the owner's `m-meets-c` seen as a point (m = c ⇔ y(−1) = 0), which is itself a
  lesson worth a card.

### 3.11 Long Shot (LS)

- **Card.** The first and last pegs on the line should be further apart than the board is wide (12).
- **Primary** (peg: `peg.firstPeg`, `peg.lastPeg`). max s = (Δx)² + (Δy)² between the first and last peg in x order (0 with
  fewer than two pegs); the ladder is s ≥ 0, 4, 16, 36, 64, 100, 144, 145 (the top rung: longer than 12), 200, 288.
- **S1** max pegs. **S2** max min(|c|, 6): the line should miss the centre by a lot. **S3** min den(m). (Second pool.)
- **Example.** `y = 11x/12 − 1/2` (φ 25): (265, 2, 1/2, −12): corner peg (−6, −6) to (6, 5).
- **Pins** both, discretely (two far pegs). Second pool. The cheap tops `y = ±x` (s = 288) go through the centre, where every
  triangle family is undefined: that is the conflict (§4.3, negotiation 7).
- **Teaches** lattice points on a line, step vectors (den(m), num(m)), Pythagoras for lengths.

### 3.12 Steady Gradient (SG)

- **Card.** The gradient (how far the line goes up for each step right) should be a whole number.
- **Primary** (seq: `seq.step`; also si.m, mach.times). min ‖m‖.
- **S1** max τ(M), M = round(m). **S2** min den(c). **S3** min ‖c/M‖ (1 if M = 0): the x-intercept should be close to
  whole too.
- **Example.** `y = 6x − 12` (φ 19): (0, 4, −1, 0): step 6, four divisors, crosses the x-axis at 2.
- **Pins** m. **Free** c (Steady Gradient's chip). Second pool.
- **Teaches** the gradient as the step of the growth pattern; divisors. With Prime Table, a free ride: Prime Table's top
  has m = 30 with τ = 8, better than most lines Steady Gradient would choose alone (§4.3).

### 3.13 Pythagorean Normal (PN)

- **Card.** Written as ax + by + c = 0 in lowest terms, a² + b² should be a square number (think 3, 4, 5). The line must
  slope.
- **Primary** (gen: `gen.normal`). min |a² + b² − r²|, r ≥ 1 nearest; a = 0 is WORST.
- **S1** max r. **S2** min the distance from |c₀| to the nearest prime. **S3** min |a + b + c₀|.
- **Example.** `4x + 3y − 5 = 0`, i.e. `y = −4x/3 + 5/3` (φ 19): (0, 5, 0, −2).
- **Pins** m (to the Pythagorean slopes). **Free** c, but primitivity couples c's numerator to the triple. Second pool.
- **Teaches** the normal vector and its length; that Ruler's top lies inside this family's (the checker confirms
  RU ⊂ PN), so a Ruler player is a natural ally.

### 3.14 Square Term (ST)

- **Card.** One of the first ten numbers of the growth pattern should be a square number.
- **Primary** (seq: `seq.term(n)`, n = 1 … 10). min over n of the distance from y(n) to the nearest square (a negative
  term counts its distance to 0).
- **S1** max the number of different whole squares among the ten terms. **S2** max the largest root among them.
  **S3** min den(m).
- **Example.** `y = 24x − 23` (φ 25): (0, 5, 13, −1): 1, 25, 49, 121, 169 (every square of a number coprime to 6 is
  1 more than a multiple of 24). Cheaper: `y = 8x + 1` (φ 15): (0, 4, 9, −1): 9, 25, 49, 81 (odd squares are 1 mod 8).
- **Pins** one term (a union of pencils). **Free** the rotation. Second pool.
- **Teaches** sequences, squares mod 8 and mod 24: a ladder whose upper rungs are found by an idea, not by search.

### 3.15 Midpoint Peg (MP)

- **Card.** Halfway between where the line crosses the two axes should be a peg (both coordinates whole).
- **Primary** (cart: `cart.xInt`, `cart.yInt`). min ‖p/2‖ + ‖c/2‖; lines through the origin or parallel to an axis are
  WORST.
- **S1** min ||p| − |c||: the midpoint should be near a diagonal. **S2** max min(|p/2| + |c/2|, 12). **S3** min den(m).
- **Example.** `y = −x + 6` (φ 13): (0, 0, 6, −1): midpoint (3, 3).
- Second pool.
- **Pins** both onto a lattice (c and p even integers). Its top is inside Whole Landing ∩ Whole Crossing (checked), so it
  is a natural mediator for that pair.
- **Teaches** the midpoint formula; parity.

### 3.16 Matched Pair (MA)

- **Card.** Write the gradient and the y-intercept as fractions in lowest terms: the top of the gradient should equal
  the bottom of the y-intercept.
- **Primary** (si). min | |num(m)| − den(c) |; m = 0 is WORST.
- **S1** max spf(|num(m)|): the gradient's top should have a big smallest prime factor, so on the primary's top the
  shared number is a big prime (the pool's default candidate). **S2** min |den(m) − |num(c)||: the other two should match
  as well ("crossed"). **S3** min |m|.
- **Example.** `y = 3x/5 + 5/3` (φ 29): (0, 3, 0, −3/5): 3 over 5 and 5 over 3.
- **Pins** one arithmetic relation between m and c. **Free** one degree of freedom, but in a number-theoretic, not
  geometric, direction.
- **Teaches** numerators and denominators as separate things; the owner's suggested pairing (one rule on the gradient's
  numerator, another on the y-intercept's denominator) as a single card.

---

## 4. Interaction analysis

### 4.1 The compatibility table

The number of lines of the checker's grid at the top of both primaries. The grid is m = a/b with |a| ≤ 36, b ≤ 8 (and
whole m to ±60), c = e/f with |e| ≤ 48, f ≤ 8 (and whole c to ±160): 186,000 lines. Symbols: **R** ≥ 1000 (rich),
**m** 100–999, **s** 6–99 (sparse), a digit for 1–5, **∅** none. A count is a hint of how easy the pair is, not its
value: value comes from the stationary law (spec §7).

| | WL | WC | SC | FP | PT | RU | PC | LD | HW | G11 | G-10 | G25 | LS | SG | PN | ST | MP | MA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **WL** | — | R | R | R | 5 | m | ∅ | R | R | m | m | m | m | R | R | R | R | R |
| **WC** | R | — | R | R | ∅ | m | ∅ | R | R | s | m | s | m | R | m | R | R | R |
| **SC** | R | R | — | m | ∅ | ∅ | ∅ | ∅ | m | ∅ | s | 4 | s | m | ∅ | m | m | R |
| **FP** | R | R | m | — | ∅ | m | s | R | R | m | s | s | m | R | R | R | R | R |
| **PT** | 5 | ∅ | ∅ | ∅ | — | ∅ | ∅ | ∅ | 5 | ∅ | ∅ | ∅ | ∅ | 5 | ∅ | ∅ | ∅ | ∅ |
| **RU** | m | m | ∅ | m | ∅ | — | ∅ | s | s | ∅ | ∅ | ∅ | ∅ | ∅ | m | s | s | ∅ |
| **PC** | ∅ | ∅ | ∅ | s | ∅ | ∅ | — | m | s | s | ∅ | s | s | ∅ | ∅ | m | ∅ | ∅ |
| **LD** | R | R | ∅ | R | ∅ | s | m | — | m | s | s | s | s | ∅ | R | R | R | R |
| **HW** | R | R | m | R | 5 | s | s | m | — | s | s | s | s | R | m | R | m | ∅ |
| **G11** | m | s | ∅ | m | ∅ | ∅ | s | s | s | — | 1 | 1 | s | m | s | m | 1 | 2 |
| **G-10** | m | m | s | s | ∅ | ∅ | ∅ | s | s | 1 | — | 1 | s | m | s | s | ∅ | 2 |
| **G25** | m | s | 4 | s | ∅ | ∅ | s | s | s | 1 | 1 | — | s | m | s | s | 3 | 4 |
| **LS** | m | m | s | m | ∅ | ∅ | s | s | s | s | s | s | — | m | s | m | s | s |
| **SG** | R | R | m | R | 5 | ∅ | ∅ | ∅ | R | m | m | m | m | — | ∅ | R | R | R |
| **PN** | R | m | ∅ | R | ∅ | m | ∅ | R | m | s | s | s | s | ∅ | — | m | m | m |
| **ST** | R | R | m | R | ∅ | s | m | R | R | m | s | s | m | R | m | — | R | m |
| **MP** | R | R | m | R | ∅ | s | ∅ | R | m | 1 | ∅ | 3 | s | R | m | R | — | R |
| **MA** | R | R | R | R | ∅ | ∅ | ∅ | R | ∅ | 2 | 2 | 4 | s | R | m | m | R | — |

Every ∅ in the table has a reason a player can learn; the ones worth a card:

| Empty pair | Why |
|---|---|
| SC, RU and SC, PN | Fermat's right-triangle theorem: a right triangle with rational sides never has square area. SC's top with a Pythagorean slope u/v would need 2uv to be a square. |
| SC, LD | On SC's top the odd part of den(m) is a square (|m| = c²/2r²); no square above 1 has a six-digit repeat (the only square factors of 999 999 are 3² and 3³, and 1/9 repeats every digit). |
| PC, WL and PC, WC | c = −c₀/b whole needs b to divide c₀; for two primes that means b = c₀, not three different primes. Same with a for WC. |
| PC, RU and PC, PN | Two primes are never the legs of a Pythagorean triangle (one leg must be even, so 2; and 2² + b² = h² has no solution). |
| PC, MA and PC, SC | MA needs |a| = b; SC needs c₀² = 2|a|b·r², impossible with three different primes. |
| RU, MA | Matched Pair would need u to divide v in a primitive triple, so u = 1, and 1 + 1/v² is never a square. |
| MA, HW | den(c) = |num(m)| = d forces d to divide 2, and then m/2 + c has an odd numerator over an even denominator. |
| LD, SG; RU, SG; PN, SG | A whole gradient has no repeating decimal, and no whole nonzero gradient is Pythagorean (1 + M² is never a square). |
| PT with almost everything | Six primes in a row of the table is a needle (five grid lines); it pairs only with families that like whole c and whole or even m. |

### 4.2 The pool's 28 pairs, described exactly

The joint top set (both primaries at their top), exactly; a one-word surprise rating (low: a child sees it; medium: one
step of algebra; high: a theorem). "Checked" means the script compares the description with the grid's set line by line.

| Pair | Lines good for both, exactly | Surprise |
|---|---|---|
| WL, WC | c ∈ ℤ and c/m ∈ ℤ: lines through two lattice points on the axes, m = −N/P (and every line through the origin). Checked. | low |
| WL, SC | c ∈ ℤ ∖ {0}, |m| = c²/(2r²) for a whole r ≥ 1: for each whole y-intercept N, one gradient per square area r². Checked. | medium |
| WL, RU | m a Pythagorean slope u/v (u² + v² = h²) and c a nonzero whole multiple of the hypotenuse h: `y = ±3x/4 + 5j`, `y = ±4x/3 + 5j`, `y = ±5x/12 + 13j`, …. Checked. | high |
| WL, MA | c ∈ ℤ and m = ±1/e: the shared number is forced to be 1. Checked. | medium |
| WL, HW | c ∈ ℤ and m ∈ 2ℤ. Checked. | medium |
| WL, FP | lines through (0, N) and (X, X): m = 1 − N/X (and c = 0 with any m ≠ 1). Checked. | low |
| WL, LD | c ∈ ℤ and m with a six-digit repeat (m = n/q, q's odd part in {7, 13, 21, 39, 63, 91, 117, …}). | low (once you see LD's S3) |
| WC, SC | p ∈ ℤ and |p·c| = 2r², i.e. c = ±2r²/P. | medium |
| WC, RU | m = u/v Pythagorean and p a nonzero whole multiple of h (the mirror image of WL, RU). | high |
| WC, MA | exactly WL ∩ MA: m = ±1/e and c ∈ ℤ (then p = ∓ce is whole automatically; a shared number s > 1 would need s² to divide ce). Checked. | high |
| WC, HW | p = P ∈ ℤ and m = 2t/(1 − 2P) for t ∈ ℤ: lines through (P, 0) and (½, t). Checked. | medium |
| WC, FP | lines through (P, 0) and (X, X), X ≠ P: m = X/(X − P). | low |
| WC, LD | p ∈ ℤ and m with a six-digit repeat; c = −pm inherits m's denominator. | low |
| SC, RU | ∅ (Fermat). Nearest: `y = 18x + 18` (SC exact, RU off by 1/325, φ 25); `y = 4x/3 + 5/3` (RU exact, SC off by 1/24, φ 19). | high |
| SC, MA | |num(m)| = den(c) and c²/(2|m|) = r². On the grid every joint line has shared number 1 (the script lists none with a larger one), so the set is m = ±1/e, c ∈ ℤ, e·c²/2 a whole square: `y = −x/2 − 1`, `y = −x/8 + 7`. | medium |
| SC, HW | c = H − m/2 with (H − m/2)² = 2|m|r²: `y = −2x − 2` (area 1, y(½) = −3), `y = −2x + 4` (area 4, y(½) = 3). | medium |
| SC, FP | c = X(1 − m) with X²(1 − m)² = 2|m|r²: `y = x/2 − 1` (X = −2, area 1). | medium |
| SC, LD | ∅ (square denominators, see §4.1). | high |
| RU, MA | ∅. | high |
| RU, HW | m Pythagorean, c = kh/v and m/2 + c ∈ ℤ: `y = −4x/3 + 5/3` (k = 1, y(½) = 1). Sixteen grid lines. | high |
| RU, FP | m Pythagorean, c = kh/v and c/(1 − m) ∈ ℤ: `y = 3x/4 − 5/4` (k = 1, X = −5). | high |
| RU, LD | m Pythagorean with a six-digit repeat: `y = −24x/7 − 25/7` (7, 24, 25; φ 29). | high |
| MA, HW | ∅. Nearest: `y = 7x/8 − 3/7` (MA exact, HW off by 1/112, φ 37). | high |
| MA, FP | |num(m)| = den(c) and c/(1 − m) ∈ ℤ: `y = −x`, `y = x/8` (fixed point 0), `y = −x/2 + 3` (X = 2). | medium |
| MA, LD | m = ±1/q with a six-digit repeat and c ∈ ℤ (the shared number 1 again): `y = x/7 + N`, `y = x/13 + N`. | medium |
| HW, FP | lines through (½, H) and (X, X). | low |
| HW, LD | m with a six-digit repeat and c = H − m/2: `y = 2x/7 + 48/7` (y(½) = 7). | medium |
| FP, LD | lines through (X, X) with m a six-digit repeater: `y = −x/7` (X = 0), `y = x/7 + 6/7` (X = 1). | low |

### 4.3 Two-player negotiations

Each negotiation below is stated on the two graded scales of the pool (§5): the primary (a distance; 0 is the top) and
the family's default secondary candidate (the first in §5's candidate table). A score `(−1/4, 2)` means the primary is 1/4 from its target (the 1/4 rung) and the secondary is at
2 on its scale. "Alone" is a good, reasonably cheap line for that player by itself; φ is what the line costs to read,
which is also its build and repair cost (§4.5). The script's section is `beginner`.

**N1. Whole Landing and Square Corner: one gradient per square.** WL's scales are ‖c‖, then spf of the landing number.
SC's are |area − r²|, then Ω(r).

| Line | φ | WL | SC | Positions |
|---|---|---|---|---|
| WL alone `y = −x + 7` | 13 | (0, 7) | (−1/2, 1) | SC half a unit off a square (area 24.5) |
| SC alone `y = −x/2 + 4` | 17 | (0, 2) | (0, 2) | WL lands on 4: spf 2 |
| deal `y = −x/2 + 7` | 17 | (0, 7) | (0, 1) | SC gives Ω 2 → 1 (area 49 = 7²) |
| deal `y = −x/8 + 7` | 25 | (0, 7) | (0, 2) | nobody gives on the ladder: area 196 = 14², Ω(14) = 2; both pay 8 bits of φ |

The insight is area = c²/2|m|: with c = 7 the gradient must be 49/(2r²). r = 7 gives |m| = 1/2 and r = 14 gives 1/8.
The trade is no longer one secondary against another. It is SC's secondary against eight bits of build cost: a pair
that can afford the dearer line gives up nothing.

**N2. Whole Crossing and Matched Pair: every step up MA's scale costs WC 1/s².** WC's scales are ‖p‖, then τ(P). MA's
are | |num m| − den c |, then spf(|num m|). The theorem of §4.2 (WC ∩ MA forces the shared number to be 1) means that
on a line good for both, MA's secondary is at its floor, 1.

| Line | φ | WC | MA | Positions |
|---|---|---|---|---|
| WC alone `y = x/3 − 4` | 17 | (0, 6) | (0, 1) | MA top, but at the floor of its secondary |
| MA alone `y = 3x/5 + 5/3` | 29 | (−2/9, 2) | (0, 3) | WC 2/9 off |
| `y = 2x/5 + 1/2` (s = 2) | 23 | (−1/4, 1) | (0, 2) | WC on the 1/4 rung |
| `y = 3x/10 + 1/3` (s = 3) | 29 | (−1/9, 1) | (0, 3) | WC on the 1/8 rung |
| `y = 5x/26 + 1/5` (s = 5) | 39 | (−1/25, 1) | (0, 5) | WC still on the 1/8 rung, 1/25 off |

So the compromise is a position on a graded scale. With shared number s the best x-intercept is −(ks² ± 1)/s², which is
1/s² from whole. A larger prime for MA moves WC *closer* to its top but costs φ (23, 29, 39). WC's position on its own
secondary falls to τ = 1 (it crosses at ±1). WC's pitch: "s = 3 costs you nothing over your solo line (φ 29 either
way) and leaves me one rung below the top".

**N3. Ruler and Whole Landing: a prime hypotenuse squared.** RU's scales are |D² − k²|, then the foot's distance to a
peg. WL's are ‖c‖, then spf.

| Line | φ | RU | WL | Positions |
|---|---|---|---|---|
| RU alone `y = −3x/4 + 25/4` | 23 | (0, 0) | (−1/4, 2) | foot exactly on the peg (3, 4); WL a quarter off |
| WL alone `y = −x + 7` | 13 | (−1/2, −1) | (0, 7) | slope −1 is not Pythagorean |
| `y = −4x/3 + 5` | 21 | (0, −3/5) | (0, 5) | foot 3/5 from a peg; WL lands on 5 |
| `y = −3x/4 + 25` | 27 | (0, 0) | (0, 5) | foot on (12, 16); both at their solo secondary or better |
| `y = −12x/5 + 13` | 31 | (0, −6/13) | (0, 13) | WL gets 13; RU's foot 6/13 off |
| `y = −12x/5 + 169` | 37 | (0, 0) | (0, 13) | both: c = 13², foot on a peg, spf(169) = 13 |

The pattern is that the foot lands on a peg when c is a multiple of h² (for the triple with hypotenuse h), and then
WL's spf is at least h when h is prime. So the pair climbs together along 5, 13, 17, 29, …, paying φ at every step.
Where to stop is the negotiation, and it is about cost, not about rungs.

**N4. Long Division and Whole Landing: a free gift.** LD's scales are |ℓ − 6|, then den(c). LD alone, `y = x/7` (φ 11),
scores (0, −1). WL alone, `y = −x + 7`, has LD at (−6, −1) (period 0). The deals `y = x/7 + 7` (φ 23) and
`y = x/13 + 13` (φ 29) give LD (0, −1) and WL (0, 7) and (0, 13). LD's secondary asks for a whole y-intercept, so WL's
choice of prime is free to LD. The card ("fractions" against "whole numbers") looks like a fight; on the scales it is a
gift.

**N5. Fixed Point and Half-Way House: how perpendicular.** FP's scales are ‖X‖, then |m + 1|. HW's are ‖y(½)‖, then
spf(H).

| Line | φ | FP | HW | Positions |
|---|---|---|---|---|
| FP alone `y = −x + 8` | 15 | (0, 0) | (−1/2, 2) | m = −1 makes y(½) = c − ½: HW can never be whole there |
| HW alone `y = 4x + 5` | 17 | (−1/3, −5) | (0, 7) | |
| `y = −2x + 9` | 17 | (0, −1) | (0, 2) | dominated by the next line |
| `y = 7` | 11 | (0, −1) | (0, 7) | HW at its solo value; FP 1 from perpendicular |
| `y = −2x/3 + 10/3` | 19 | (0, −1/3) | (0, 3) | FP 1/3 from perpendicular, HW's prime 3 |
| `y = −4x/5 + 27/5` | 25 | (0, −1/5) | (0, 5) | FP 1/5, HW 5 |

This is a clean graded trade-off. Each step of FP towards perpendicular (1, 1/3, 1/5) moves HW's prime (7, 3, 5) and
costs φ. The pair chooses a point on the curve.

**N6. Whole Crossing and Square Corner: climb together.** WC alone, `y = x/3 − 4`, scores (0, 6) and leaves SC at (−1, 1).
SC alone, `y = −x/2 + 4`, leaves WC at (0, 4). The insight is |p·c| = 2r²: take p with many divisors and c = r²/(p/2).

- `y = −x/2 + 6` (φ 17): WC (0, 6), SC (0, 2). Both are at their solo values at the solo price.
- `y = −x/2 + 12` (φ 19): WC (0, 8), SC (0, 3). Both are better than alone, for 2 bits more.

There is nothing to give up, only an idea to find: the pair's whole negotiation is the pitch "the x-intercept 24 and the
y-intercept 12 make area 144".

**N7. Matched Pair and Fixed Point: the shared number is forced to 1 again.** MA ∩ FP, like MA ∩ WC, forces
|num m| = 1. The proof: X = ne/(s(e ∓ s)), and s is coprime to everything in the numerator. So on joint lines
(`y = −x + 8`, φ 15: MA (0, 1), FP (0, 0)) MA is at the floor of its secondary. With s = 3 the best FP can do is 1/120
off its top on `y = −3x/37 − 13/3` (φ 43). That is a real but expensive compromise. The cheap one, `y = −3x/2 + 5/3`
(φ 25), gives MA (0, 3) and FP (−1/3, −1/2).

The second pool keeps its longer ladders (the script's `negotiations` section). Three examples:

- **Prime Table and Half-Way House** climb together. `y = 60x + 11` (φ 25) gives PT (6, −2, 11, −60), against
  (6, −4, 7, −30) on its solo `y = 30x + 7`. HW (0, 41, …) beats its solo 7.
- **Fixed Point and Gatekeeper (2, 5)** split on j. Their joint lines are m = 1 − 3/j, so X = 2 + j. At j = 2,
  `y = −x/2 + 6`, FP prefers (|m + 1| = 1/2). At j = 1, `y = −2x + 9`, the gatekeeper prefers (5 pegs, whole gradient).
  Both are φ 17.
- **Long Shot and Square Corner** leave the centre. `y = −x/2 + 3` (φ 15) gives LS 180 (from 288 on `y = x`, where SC is
  WORST) and SC area 9.

### 4.4 Three-player situations

Scores for pool families are their two graded rungs (§5); the gatekeepers show their full ladders. The payoff matters here: π_i = n_i·Σ_{j≠i} n_j (spec §8). A left-out player still scores on the object through the other
two, and the other two score through it, so a coalition wants the left-out player as close as possible to its top as
well. "Which two" is therefore a choice among compromise lines, judged by how far the third is left.

**T1. Whole Landing, Half-Way House, Long Division: every pair, never all three.** WL ∩ HW is c whole and m even; WL ∩
LD is c whole and m a six-digit repeater; HW ∩ LD is m a repeater and c = H − m/2. All three would need m even and
repeating: impossible.

| Coalition | Line (φ) | WL | HW | LD | The third |
|---|---|---|---|---|---|
| WL + HW | `y = 4x + 5` (17) | (0, 5) | (0, 7) | (−6, −1) | LD at the bottom of its ladder (period 0 against 6) |
| WL + LD | `y = x/7 + 7` (23) | (0, 7) | (−1/14, 7) | (0, −1) | HW 1/14 from whole: the 1/8 rung, one below the top |
| HW + LD | `y = 2x/7 + 48/7` (25) | (−1/7, 7) | (0, 7) | (0, −7) | WL 1/7 from whole: the 1/4 rung |

WL + LD is the table's choice: the left-out HW is one rung from the top, while WL + HW drops LD to the bottom. So HW,
the player left out, is the one who should propose it, and its price for agreeing is the choice of c: on `y = x/7 + 7`
y(½) = 7 + 1/14 rounds to 7 (spf 7), so HW's secondary is as good as on its own solo line, and WL's is 7 as well. Both
pair partners give the third player something that costs them nothing.

**T2. Whole Landing, Square Corner, Ruler: Fermat decides.** SC ∩ RU is empty; WL is compatible with both. The real
choice is which of SC and RU joins WL.

| Coalition | Line (φ) | WL | SC | RU |
|---|---|---|---|---|
| WL + SC | `y = −x/2 + 7` (17) | (0, 7) | (0, 1) | (−16/5, −3/5): D² = 39.2, rung ≤ 4 |
| WL + RU | `y = −4x/3 + 5` (21) | (0, 5) | (−3/8, 1): area 9.375, rung ≤ 1/2 | (0, −3/5) |
| (SC + RU) | none; nearest `y = 4x/3 + 5/3` (19) | (−1/3, 2) | (−1/24, 0): rung ≤ 1/8 | (0, −3/5) |

WL + RU leaves SC two rungs higher than WL + SC leaves RU, and the "impossible" SC + RU near-miss leaves both SC and RU
near the top and WL at the 1/2 rung. A table that knows Fermat's theorem skips the search for SC + RU and argues about
the other two; a table that does not wastes its agents' budget looking.

**T3. Whole Landing, Matched Pair, Half-Way House: one hub, one wall.** MA ∩ HW is empty (a parity argument); WL meets
each.

| Coalition | Line (φ) | WL | MA | HW |
|---|---|---|---|---|
| WL + MA | `y = x + 5` (13) | (0, 5) | (0, 1) | (−1/2, 2): y(½) = 5.5, rung ≤ 1/2 |
| WL + HW | `y = 2x + 5` (15) | (0, 5) | (−1, 2): |2 − 1| = 1, rung ≤ 1 | (0, 2) |
| (MA + HW) | none; nearest `y = 7x/8 − 3/7` (37) | (−3/7, 1) | (0, 7) | (−1/112, 1) |

The two coalitions leave the third one rung apart, and the WL + MA line is cheaper. HW's counter-pitch is that on
`y = 2x + 5` MA is still on the 1 rung with spf 2 against 1, and WL is unchanged. The MA + HW near-miss is a trap: it is the
closest the two can get, it costs φ 37, and it pushes WL down to the 1/2 rung.

**T4. Whole Landing and two gatekeepers, (1, 1) and (−1, 0): the purest choice.** Two gates fix one line,
`y = x/2 + 1/2`; WL with either gate is a one-parameter family (WL ∩ G11: c = N, m = 1 − N; WL ∩ G−10: m = c = N). The
third player's distance in the WL + gate coalitions is |2N − 1|, so WL's secondary (a large prime N) is paid for directly by
the left-out gatekeeper.

| Coalition | Line (φ) | WL | G11 | G−10 |
|---|---|---|---|---|
| G11 + G−10 | `y = x/2 + 1/2` (11) | (−1/2, 1): rung ≤ 1/2 | (0, 6, −2, −2) | (0, 6, −2, −2) |
| WL + G11, modest | `y = 1` (7) | (0, 1) | (0, 13, −1, −1) | (−1, …): rung ≤ 1 |
| WL + G11, greedy | `y = −6x + 7` (17) | (0, 7) | (0, 2, −1, −1) | (−13, …): bottom |
| WL + G−10, greedy | `y = 7x + 7` (17) | (0, 7) | (−13, …): bottom | (0, 1, −1, −1) |

The table's best line is the two gates' line, which leaves WL on the 1/2 rung, or the modest `y = 1`, which leaves G−10
on the 1 rung; the greedy WL lines (spf 7) send the third to the bottom. This is the cleanest demonstration in the
document that a secondary is a negotiating position: WL's secondary is worth something to WL and costs the table. (The gatekeepers are second pool and show their full ladders.)

Other pool triples with the "every pair but not all three" shape (§5's table): WL-RU-HW, WC-RU-LD, RU-HW-LD, RU-FP-LD.

### 4.5 The spoiler: the cheapest attack on each of the top eight, and the defence

Method (the script's `attacks` and `defend` sections): for a top line, every call of §12.4 with small arguments
(numerators up to 6, denominators up to 4, pivots and slides over the nine cheapest points) is priced by §5.2, and the
cheapest call that lowers the family's primary is the spoiler's attack; the cheapest call from the damaged line back to
the original is the repair. For defence, every joint top line with φ ≤ 21 (the 60 cheapest per pair) is searched for the
one whose cheapest damaging call (to either partner) is dearest.

Three facts drive everything:

1. **Mirrors cost 5.17 bits and are their own repair.** A mirror changes no read length, so neither the attack nor the
   repair pays a surcharge: an even war of attrition. The diagonal mirror swaps the axes (x-intercept ↔ y-intercept,
   m ↔ 1/m); the x mirror flips the sign of m and c; the y mirror flips m; the origin mirror flips c.
2. **Simplifying attacks are cheap and their repairs dear.** A unit nudge that zeroes a coefficient (flattening a line,
   making it pass through the origin) shortens φ, so it pays no surcharge, while the repair climbs back and pays both a
   fractional argument and the surcharge. This is the owner's pricing principle ("moving to larger or more complex
   numbers costs more than coming back") turned against defenders: families undefined on simple lines (axis-parallel,
   through the origin) are exposed.
3. **A pair splits the spoiler's budget.** On a joint line the spoiler picks one victim cheaply, but hurting both at
   once usually costs much more, so a pair that repairs for each other (both earn from both: π_i = n_i·(n_j + …))
   defends at about the price of one.

| Family | Top line (φ), two-rung score | Cheapest damage | Repair | Defence (line, partner, cheapest damage there) |
|---|---|---|---|---|
| WL | `y = −x + 5` (13), (0, 5) | 8.75 bits, gen.nudge(b, 1) → `y = −x/2 + 5/2`, falls to the 1/2 rung | 6.75, gen.nudge(b, −1) | Already the most robust family: every whole shift, tilt and step and three mirrors are harmless. Alone at `y = −3x` (φ 9) the cheapest damage is 14.17 (a half shift). With WC at `y = −x + 5` the diagonal mirror is refused (the line is its own mirror image) and hurting both costs 14.17. |
| WC | `y = x/3 − 4` (17), (0, 6) | 6.75, gen.nudge(a, 1) → `y = −4` (horizontal: WORST) | 14.17, si.tilt(1/3) | Choose |a| ≥ 2 so the flattening nudge costs more: alone at `y = −2x/3` or with WL at `y = −3x/2`, cheapest damage 8.75. |
| SC | `y = −x/2 + 4` (17), (0, 2) | 6.75, gen.nudge(a, −1) → `y = 4` (WORST) | 14.17, si.tilt(−1/2) | Use a whole gradient: on `y = −2x + 4` (φ 15, with WL) the cheapest damage is si.shift(1) (6.17), which only drops SC to the 4 rung, and its repair is 6.17: the attack is no longer one-sided. |
| RU | `y = −3x/4 + 25/4` (23), (0, 0) | 6.17, si.shift(1), falls to the 4 rung | 6.17, si.shift(−1) | Mirrors are harmless to RU alone (Pythagorean slopes stay Pythagorean under every mirror). With WL at `y = −4x/3 + 5` the cheapest attack is a tilt (6.17) whose repair costs 10.17; with WC the diagonal mirror hurts WC, not RU. RU is best defended alone or with PN, which shares its slope set. |
| MA | `y = 3x/5 + 5/3` (29), (0, 3) | 5.17, mirror(diagonal) → `y = 5x/3 − 25/9` | 5.17, the same mirror | On `y = −x + 5` (with WL, φ 13) the diagonal mirror is refused; the cheapest attack is si.tilt(1) to a flat line (WORST, 6.17), repair 8.17. MA's defence is to stay on m = −1, which costs its S1 (shared number 1). |
| HW | `y = 4x + 5` (17), (0, 7) | 5.17, mirror(diagonal) → `y = x/4 − 5/4` (the 1/8 rung) | 5.17, the same mirror | Alone or with WL or FP, `y = 0` (φ 5): the cheapest damage is si.tilt(1) at 8.17. A real line: `y = −x + 5/2` (φ 17) is fixed by the diagonal mirror, cheapest damage si.tilt(1) 6.17, repair 10.17. |
| FP | `y = −x + 8` (15), (0, 0) | 5.17, mirror(x) → `y = x − 8` (m = 1: WORST) | 5.17, mirror(x) | FP's own secondary (m = −1) is one mirror from WORST: a real tension. `y = −x/2 + 6` (φ 17) gives up half a rung of S1 and survives every mirror (mirror x gives X = −12, still whole); the cheapest damage becomes si.shift(1) at 6.17, to the 1/2 rung. With WL at `y = −x/7` the cheapest damage is 8.75. |
| LD | `y = x/7 + 2` (19), (0, −1) | 5.17, mirror(diagonal) → `y = 7x − 14` (period 0: bottom) | 5.17, the same mirror | Choose m whose reciprocal also repeats every six: m = 7/13 or 13/7 (both 7 and 13 have period 6), and the diagonal mirror is harmless; `y = 7x/13 + 5` alone has cheapest damage 6.75 (gen.nudge(b, −1)). With WL the same line exposes WL instead (the mirror moves WL's y-intercept to −65/7). |

What a defending pair does, in one paragraph a player can use: pick the joint line where the cheapest calls are refused
(a line equal to its own mirror image: m = −1 for the diagonal mirror, c = 0 for the origin mirror) or harmless (a whole
y-intercept survives whole shifts and tilts); avoid lines one unit nudge away from a line where your rule is WORST
(flat lines for intercept and triangle families, m = 1 for Fixed Point); prefer whole gradients so the spoiler's cheap
attack is a shift whose repair costs the same; and agree in advance who repairs what, because the spoiler's cheapest
attack always picks the partner that is cheaper to hurt.

---

## 5. The recommended pool of eight

Each family is a primary plus three graded secondary candidates (owner rule 3, §0); a dealt rule is the primary and one
candidate, scored as the plain tuple (primary, secondary) with no gating. The card is in textbook
words. "Curriculum" says what a first linear-equations course covers. **Core** means the course itself. **Stretch**
means what a smart twelve-year-old would look up to play it, within the owner's latitude: area, primes, factors,
square numbers, simple fractions, perpendicular, ratios. "Levels" are distinct values on the checker's grid (§2); a
distance primary has the spec's eight rungs (8, 4, 2, 1, 1/2, 1/4, 1/8, 0) and more values between them.

| Family | Card (primary) | Exact primary | Curriculum | Default secondary candidate (exact) | Levels (primary / default on the grid) |
|---|---|---|---|---|---|
| Whole Landing | "The line's y-intercept should be a whole number." | min ‖c‖ | core: the y-intercept, reading the starting amount | the whole number it lands on should have a big smallest prime factor: max spf(round c) | 12 (grid-limited; many on ℚ) / 38 |
| Whole Crossing | "Where the line crosses the x-axis should be a whole number." | min ‖−c/m‖ | core: solving mx + c = 0 for the x-intercept | that number should have many factors: max τ(round p) | ≥ 1000 / 24 |
| Square Corner | "The line and the two axes make a triangle: its area should be a square number." | min \|c²/(2\|m\|) − r²\| | stretch: area of a triangle from the two intercepts; square numbers | the square's side should have many prime factors (the owner's): max Ω(r) | ≥ 1000 / 9 |
| Ruler | "The shortest distance from (0, 0) to the line should be a whole number." | min \|c²/(1 + m²) − k²\| | stretch: perpendicular distance, Pythagoras (3-4-5) | the nearest point of the line to (0, 0) should be close to a grid point: min ‖fx‖ + ‖fy‖ | ≥ 1000 / 13 |
| Matched Pair | "Write the gradient and the y-intercept as fractions in lowest terms: the top of the gradient should equal the bottom of the y-intercept." | min \| \|num m\| − den c \| | core: gradient as a fraction (rise over run), simplifying fractions | the gradient's top should have a big smallest prime factor: max spf(\|num m\|) | 60 / 5 (grid-limited; unbounded) |
| Half-Way House | "When x is ½, y should be a whole number." | min ‖m/2 + c‖ | core: substituting a value of x | that whole number should have a big smallest prime factor: max spf(round y(½)) | 152 / 43 |
| Fixed Point | "The line crosses the line y = x where x is a whole number." | min ‖c/(1 − m)‖ | core: solving mx + c = x (where two lines meet) | the line should cross y = x as close to a right angle as it can: min \|m + 1\| | ≥ 1000 / 233 |
| Long Division | "Write the gradient as a decimal: the repeating block of digits should be six long, like 1/7 = 0.142857…" | min \|ℓ(m) − 6\| | stretch: recurring decimals by long division | the y-intercept should be a simple fraction: min den(c) | 3 on the grid, 7+ on ℚ (§3.8) / 8 |

**The secondary candidates.** Each candidate is graded. Its levels are measured on the primary's top lines of the
checker's grid (script section `levels`; S1 to S3 of §3). The first candidate is the default used in §4.3.

| Family | Candidate A (default) | Candidate B | Candidate C |
|---|---|---|---|
| Whole Landing | big smallest prime factor of the landing number, max spf(round c): 38 levels | simple gradient, min den(m): 8 | many pegs on the board: 14 |
| Whole Crossing | many factors of the crossing, max τ(round p): 24 | rise of 1 at a time, min \|num m\|: 60 | simple y-intercept, min den(c): 8 |
| Square Corner | many prime factors of the square's side, max Ω(r): 9 | legs near whole, min ‖p‖ + ‖c‖: 9 | nearly Pythagorean, min distance of p² + c² to a square: 284 (never 0 on the top: Fermat) |
| Ruler | foot of the perpendicular near a grid point, min ‖fx‖ + ‖fy‖: 13 | far from (0, 0), max min(k, 12): 11 | simple gradient, min den(m): 5 |
| Matched Pair | big smallest prime factor of the gradient's top, max spf(\|num m\|): 5 (grid-limited) | crossed, min \|den m − \|num c\|\|: 160 | gentle, min \|m\|: 43 |
| Half-Way House | big smallest prime factor of y(½), max spf(round y(½)): 43 | simple gradient, min den(m): 6 | even gradient, min ‖m/2‖: 12 |
| Fixed Point | close to a right angle with y = x, min \|m + 1\|: 233 | far meeting point, max min(\|X\|, 12): 13 | simple y-intercept, min den(c): 8 |
| Long Division | simple y-intercept, min den(c): 8 | unit fraction, min \|num m\|: 31 | big smallest prime factor of the gradient's bottom, max spf(den m): 1 on the grid (only 7 has a six-digit repeat below 9), 3, 7, 13, … on ℚ: the weakest candidate |

Which candidate is dealt changes the table. Examples from §4.3 and the first version's full ladders:

- In N1, WL dealt "simple gradient" prefers r = 7 (`y = −x/2 + 7`, den 2) to r = 14 (den 8). The default ("big prime")
  is indifferent between them.
- In N4, WL dealt "many pegs" loses all its pegs on `y = x/7 + 7`, so the free gift becomes a real concession.
- In N2, MA dealt "crossed" gets `y = x/4 − 4` (den 4 = |num c| 4) at the cost of one divisor to WC. The default is at
  its floor whatever happens.

So a dealer who wants a cooperative table deals candidates that are cheap for likely partners to grant, and a dealer
who wants hard bargaining deals candidates that conflict.

Why these eight:

- **Whole Landing** is the hub. It is compatible with all but Prime Coefficients, it is the owner's example, and it is
  the most robust to attack.
- **Whole Crossing** is WL's mirror twin (the diagonal mirror swaps them), and the base of every two-intercept deal.
- **Square Corner** is the owner's example and the Fermat wall with Ruler (§4.1). It climbs together with WC (N6).
- **Ruler** is the Pythagorean climber. It joins WL only on multiples of the hypotenuse (N3).
- **Matched Pair** looks opposed to WL and shares a rich set with it. Its secondary is forced to the floor by WC and FP
  (N2, N7): a negotiation over a graded position, not a yes/no.
- **Half-Way House** shows "half" agreeing with "whole" exactly on even gradients. It is the third player of T1 and T3,
  and FP's graded trade (N5).
- **Fixed Point** is the pool's only machine/solving-equations primary. Its secondary (m = −1) is also its weakness
  against the x mirror, which makes it a defence lesson (§4.5).
- **Long Division** is the false opposition with WL (N4) and the square-denominator wall with SC. The 7/13 gradient
  is its mirror-proof defence.

Five primaries are core curriculum and three are stretch. The pool's 56 triples (script section `pool`):

- 30 share a line.
- 18 have two of the three pairs only (a choice of partner).
- 5 have every pair but no common line: WL-HW-LD, WL-RU-HW, WC-RU-LD, RU-HW-LD and RU-FP-LD. These are the purest
  coalition choice.
- 3 have one pair only: SC-RU-MA, SC-RU-LD and RU-MA-HW. A dealer should avoid dealing these together to a three-player
  table, or deal them on purpose as the hard table.

The primaries read the line in eight different ways: the y-axis, the x-axis, the triangle, the perpendicular foot,
fractions, the table at ½, the line y = x and decimals.

**Second pool** (longer ladders, all rungs graded, §3):

- **Prime Coefficients** walls with six families. It is the best lesson and the worst seat, and its primary has only
  4 levels.
- **Prime Table** has five lines on the grid: a needle. Keep it as a rare deal.
- **Gatekeeper** is excellent for T4, but its parameter makes deals uneven.
- **Long Shot, Steady Gradient, Pythagorean Normal, Square Term and Midpoint Peg** are each close to a pool member:
  - SG is WL's chip;
  - PN contains RU;
  - MP sits inside WL ∩ WC;
  - ST is like HW's pencils;
  - LS reads the pegs.

## 6. Open questions for calibration

- The negotiations compare ladders lexicographically; value is bits from the stationary law (spec §7). Whether a deal
  like N3's climb is worth it to WL depends on how many bits RU's extra rungs carry against WL's lost pegs, which only a
  calibration can say. The script's φ column is a first proxy (a line's stationary mass falls with its read length).
- Several secondaries climb without end (S2 of RU, FP, MP is capped at 12; WL's spf is not). Ladders on unbounded
  secondaries need rungs a calibration can fill; a cap such as "spf up to 23" may be wiser.
- Square Corner's S3 never reaches 0 on its top (Fermat). That is intended (an endless near-miss ladder), but the
  calibration's empty-rung check (spec §4.4) must not drop the rung "gap 0" silently; it should report it as the theorem.
- The attack model is one call; a spoiler with two calls can do more (a mirror then a shift). A two-call search is a
  small extension of the script if the numbers here look too optimistic.
