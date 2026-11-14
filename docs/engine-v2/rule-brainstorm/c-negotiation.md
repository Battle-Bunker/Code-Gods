# Rule brainstorm C: families designed for the table (negotiation)

Status: brainstorm (14 November 2026), one of five independent brainstorms on layered rule families for the v2 line
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
`python3 -I docs/engine-v2/rule-brainstorm/scripts/negotiation_families.py [families|examples|pairs|triples|pool|coalitions|claims|negotiations|attacks|defend]`
(about five minutes for everything; the slow part is scoring a grid of 186,000 lines against 18 families once).

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
Long Division. Across its 56 triples: 30 have a common line, 18 are "two of the three pairs only" (a real coalition
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
  root"). **S2** max the number of whole legs (|p| and |c|; 0, 1 or 2). **S3** min the distance from the hypotenuse
  squared, p² + c², to the nearest square: the triangle should be nearly a Pythagorean one.
- **Example.** `y = −x/2 + 4` (φ 17): (0, 2, 2, −1): legs 8 and 4, area 16 = 4², Ω(4) = 2, both legs whole, hypotenuse²
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
- **S1** max [y(6) prime]: the run goes on. **S2** max the smallest prime in the run. **S3** min |m|.
- **Example.** `y = 30x + 7` (φ 21): (6, 0, 7, −30): 7, 37, 67, 97, 127, 157; y(6) = 187 = 11·17.
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
- **S1** max the number of whole coordinates of the foot of the perpendicular, (−mc, c)/(1 + m²): 0, 1 or 2. **S2** max
  min(k, 12): farther is rarer. **S3** min den(m).
- **Example.** `y = −3x/4 + 25/4` (φ 23): (0, 2, 5, −4): distance 5, and the nearest point of the line to the centre is
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
- **Pins** both, onto a large discrete set.
- **Teaches** the general form and lowest terms. Its role at the table is the hidden opposition (§4.1): it shares no line
  with six other families, and the reasons are two short proofs a player can learn.

### 3.8 Long Division (LD)

- **Card.** Work the gradient out as a decimal: its repeating block should be exactly six digits long, like
  1/7 = 0.142857 142857 ….
- **Primary** (si: `si.m` as a decimal). min |ℓ(m) − 6|, ℓ(m) the period of the decimal expansion (0 if it stops),
  ℓ = ord_q(10) for q = den(m) with its 2s and 5s removed. (A parameter L ∈ {6, 16, 18} is possible; 6 is the first.)
- **S1** min |num(m)|: a unit fraction. **S2** max [den(m) is prime]. **S3** min den(c): a whole y-intercept.
- **Example.** `y = x/7 + 2` (φ 19): (0, −1, 1, −1).
- **Pins** m's denominator class (7, 13, 21, 39, 63, 91, … and their multiples by 2s and 5s). **Free** c.
- **Hooks** den(m) (the opposite of Whole Landing's S2), c whole (Whole Landing's primary, granted by S3).
- **Teaches** long division, why 1/7 and 1/13 both repeat every six (both divide 999 999), why 1/49 repeats every 42.

### 3.9 Half-Way House (HW)

- **Card.** At x = ½ the line should be at a whole number.
- **Primary** (table: `table.y(1/2)`; also cart.pointAtX). min ‖m/2 + c‖.
- **S1** max spf(H), H = round(m/2 + c). **S2** min den(m). **S3** min ‖m/2‖: an even gradient.
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
- **Teaches** that two points fix a line: two gatekeepers with different gates share exactly one line (`y = x/2 + 1/2`
  for (1, 1) and (−1, 0)), which is the cleanest "any two of three" triple (§4.4). Gate (1, 1) is spec's `zero-sum`
  seen as a point; gate (−1, 0) is the owner's `m-meets-c` seen as a point (m = c ⇔ y(−1) = 0), which is itself a
  lesson worth a card.

### 3.11 Long Shot (LS)

- **Card.** The first and last pegs on the line should be further apart than the board is wide (12).
- **Primary** (peg: `peg.firstPeg`, `peg.lastPeg`). max s = (Δx)² + (Δy)² between the first and last peg in x order (0 with
  fewer than two pegs); the ladder is s ≥ 0, 4, 16, 36, 64, 100, 144, 145 (the top rung: longer than 12), 200, 288.
- **S1** max pegs. **S2** max [c ≠ 0]: the line misses the centre. **S3** min den(m).
- **Example.** `y = 11x/12 − 1/2` (φ 25): (265, 2, 1, −12): corner peg (−6, −6) to (6, 5).
- **Pins** both, discretely (two far pegs). The cheap tops `y = ±x` (s = 288) go through the centre, where every
  triangle family is undefined: that is the conflict (§4.3, negotiation 7).
- **Teaches** lattice points on a line, step vectors (den(m), num(m)), Pythagoras for lengths.

### 3.12 Steady Gradient (SG)

- **Card.** The gradient (how far the line goes up for each step right) should be a whole number.
- **Primary** (seq: `seq.step`; also si.m, mach.times). min ‖m‖.
- **S1** max τ(M), M = round(m). **S2** min den(c). **S3** max [M ≠ 0 and c/M whole]: the x-intercept is whole too.
- **Example.** `y = 6x − 12` (φ 19): (0, 4, −1, 1): step 6, four divisors, crosses the x-axis at 2.
- **Pins** m. **Free** c (Steady Gradient's chip).
- **Teaches** the gradient as the step of the growth pattern; divisors. With Prime Table, a free ride: Prime Table's top
  has m = 30 with τ = 8, better than most lines Steady Gradient would choose alone (§4.3).

### 3.13 Pythagorean Normal (PN)

- **Card.** Written as ax + by + c = 0 in lowest terms, a² + b² should be a square number (think 3, 4, 5). The line must
  slope.
- **Primary** (gen: `gen.normal`). min |a² + b² − r²|, r ≥ 1 nearest; a = 0 is WORST.
- **S1** max r. **S2** max [|c₀| is prime]. **S3** min |a + b + c₀|.
- **Example.** `4x + 3y − 5 = 0`, i.e. `y = −4x/3 + 5/3` (φ 19): (0, 5, 1, −2).
- **Pins** m (to the Pythagorean slopes). **Free** c, but primitivity couples c's numerator to the triple.
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
- **Pins** one term (a union of pencils). **Free** the rotation.
- **Teaches** sequences, squares mod 8 and mod 24: a ladder whose upper rungs are found by an idea, not by search.

### 3.15 Midpoint Peg (MP)

- **Card.** Halfway between where the line crosses the two axes should be a peg (both coordinates whole).
- **Primary** (cart: `cart.xInt`, `cart.yInt`). min ‖p/2‖ + ‖c/2‖; lines through the origin or parallel to an axis are
  WORST.
- **S1** max [|p| = |c|]: the midpoint is on a diagonal. **S2** max min(|p/2| + |c/2|, 12). **S3** min den(m).
- **Example.** `y = −x + 6` (φ 13): (0, 1, 6, −1): midpoint (3, 3).
- **Pins** both onto a lattice (c and p even integers). Its top is inside Whole Landing ∩ Whole Crossing (checked), so it
  is a natural mediator for that pair.
- **Teaches** the midpoint formula; parity.

### 3.16 Matched Pair (MA)

- **Card.** Write the gradient and the y-intercept as fractions in lowest terms: the top of the gradient should equal
  the bottom of the y-intercept.
- **Primary** (si). min | |num(m)| − den(c) |; m = 0 is WORST.
- **S1** max spf(s) when matched (s = |num(m)| = den(c)), else 1: the shared number should be a big prime. **S2** max
  [den(m) = |num(c)|]: the other two match as well (fully crossed). **S3** min |m|.
- **Example.** `y = 3x/5 + 5/3` (φ 29): (0, 3, 1, −3/5): 3 over 5 and 5 over 3.
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

Each: what each wants alone, the compromise line, what each gives up on its ladder, in numbers (the script's
`negotiations` section). "Ideal" means a good, reasonably cheap line for that player alone, not the unique optimum
(several ladders climb without end; that is the pricing principle at work).

**N1. Whole Landing and Square Corner: one gradient per square.** WL alone: `y = −x + 7` (φ 13), WL = (0, 7, −1, 6);
there SC is (−1/2, …) because the area is 24.5. SC alone: `y = −x/2 + 4` (φ 17), SC = (0, 2, 2, −1); there WL lands on
4 (spf 2). The insight both need: with c = 7, area 49/(2|m|) is a square only for |m| = 49/(2r²): r = 7 gives |m| = 1/2,
r = 14 gives |m| = 1/8. Two deals:

| Deal | φ | WL | SC | WL gives up | SC gives up |
|---|---|---|---|---|---|
| `y = −x/2 + 7` (r = 7) | 17 | (0, 7, −2, 3) | (0, 1, 2, −11) | den(m) 1 → 2, pegs 6 → 3 | Ω 2 → 1, hypotenuse gap 1 → 11 |
| `y = −x/8 + 7` (r = 14) | 25 | (0, 7, −8, 0) | (0, 2, 2, −49) | den(m) 1 → 8, pegs 6 → 0 | gap 1 → 49 |

Both keep their primaries and WL keeps S1 = 7. The choice is S2 of one against S1 of the other, and the r = 14 deal is
eight bits dearer to read, so dearer to build and to repair (§4.5). A sensible pitch from WL: "take r = 7 and I will pay
for the build".

**N2. Whole Crossing and Matched Pair: the trade of one divisor for a crossing.** WC alone: `y = x/3 − 4` (φ 17), WC =
(0, 6, −1, −1) (crosses at 12). MA alone: `y = 3x/5 + 5/3` (φ 29), MA = (0, 3, 1, −3/5); there WC is off by 2/9. The
theorem (§4.2): WC ∩ MA forces MA's shared number to 1, so MA's S1 drops to its floor whatever happens. What is left to
trade is MA's S2 (crossed) against WC's S1 (divisors): at `y = x/3 − 4`, MA = (0, 1, 0, −1/3) (not crossed: den(m) = 3,
num(c) = −4). Deal `y = x/4 − 4` (φ 21): WC = (0, 5, −1, −1) (crosses at 16: five divisors, one fewer), MA = (0, 1, 1,
−1/4) (crossed: 4 and −4). WC gives one divisor; MA gives S1 3 → 1 and gets its S2 and eight bits of build cost back
(φ 29 → 21).

**N3. Ruler and Whole Landing: climb together, or settle cheap.** RU alone: `y = −3x/4 + 25/4` (φ 23), RU = (0, 2, 5,
−4) (distance 5, foot at the peg (3, 4)); WL is off by 1/4. WL alone: `y = −x + 7`; RU off by 1/2 (the slope −1 is not
Pythagorean). Joint lines need c to be a multiple of the hypotenuse (§4.2).

| Deal | φ | RU | WL | RU gives up | WL gives up |
|---|---|---|---|---|---|
| `y = −4x/3 + 5` (cheap) | 21 | (0, 0, 3, −3) | (0, 5, −3, 3) | foot 2 → 0, k 5 → 3 | spf 7 → 5, den 1 → 3, pegs 6 → 3 |
| `y = −3x/4 + 25` (climb) | 27 | (0, 2, 12, −4) | (0, 5, −4, 0) | nothing: better than its own ideal (k = 20, capped at 12) | spf 7 → 5, den 1 → 4, pegs 6 → 0 |

The climbing deal makes RU strictly better off than alone and costs WL only secondaries, but it is six bits dearer to
read. Under the payoff π_i = n_i·Σ_{j≠i} n_j the climb is worth it to WL too whenever RU's extra bits outweigh WL's lost
rungs, which is a calibration question; the negotiation teaches both players to ask it.

**N4. Prime Table and Half-Way House: both climb.** PT alone: `y = 30x + 7` (φ 21), PT = (6, 0, 7, −30); there HW = (0,
2, −1, 0) (y(½) = 22, spf 2). HW alone: `y = 4x + 5` (φ 17), HW = (0, 7, −1, 0); there PT counts 3 primes. Deal
`y = 60x + 11` (φ 25): PT = (6, 0, 11, −60), HW = (0, 41, −1, 0). PT's S2 rises 7 → 11 (it outranks the worse S3), HW's
S1 rises 7 → 41. Neither gives up anything on its ladder; together they pay four bits more to read. This is the owner's
ladder idea working for the table: the deal lies further from the cheap centre than either player's solo line, and only
a pair would find it.

**N5. Fixed Point and Gatekeeper (2, 5): which j.** FP alone: `y = −x + 8` (φ 15), FP = (0, 0, 4, −1); there the gate
misses by 1. GK alone: `y = x + 3` (φ 11), GK = (0, 10, −1, −1); there FP is WORST (m = 1). Joint lines: c = 5 − 2m and
X = c/(1 − m) = 2 + 3/(1 − m), so 1 − m = 3/j and X = 2 + j for whole j: a whole family m = 1 − 3/j.

| Deal | φ | FP | GK | Who prefers it |
|---|---|---|---|---|
| j = 2: `y = −x/2 + 6` | 17 | (0, −1/2, 4, −1) | (0, 4, −2, −1) | FP (|m + 1| = 1/2 beats 1) |
| j = 1: `y = −2x + 9` | 17 | (0, −1, 3, −1) | (0, 5, −1, −1) | GK (5 pegs and a whole gradient beat 4 and a half) |

Same price, opposite preferences: the pure bargaining case. Neither can reach its own S1 (FP's m = −1 misses the gate;
GK's best pegs are on m = 1, FP's WORST).

**N6. Long Division and Whole Landing: the opposition that is not.** LD alone: `y = x/7` (φ 11), LD = (0, −1, 1, −1); WL
there lands on 0 (spf 1). WL alone: `y = −x + 7`; LD is 6 from its target (period 0). Deal `y = x/7 + 7` (φ 23): LD =
(0, −1, 1, −1), unchanged; WL = (0, 7, −7, 0): primary and S1 kept, S2 1 → 7 and pegs 6 → 0 given up. A table that
reads only the cards ("fractions" against "whole numbers") would expect a fight; LD's S3 makes it a gift, and WL pays in
pegs.

**N7. Long Shot and Square Corner: leaving the centre.** LS alone: `y = x` (φ 7), LS = (288, 13, 0, −1): corner to corner
through the centre, where SC is WORST. SC alone: `y = −x/2 + 4`; LS = 125 (below the top rung 145). Deal `y = −x/2 + 3`
(φ 15): LS = (180, 7, 1, −2) (still above 145, and now missing the centre, which LS's own S2 likes), SC = (0, 1, 2, −4)
(area 9 instead of 16: Ω 2 → 1). LS gives up length 288 → 180 and 6 pegs; SC gives up a prime factor of its root.

### 4.4 Three-player situations

The payoff matters here: π_i = n_i·Σ_{j≠i} n_j (spec §8). A left-out player still scores on the object through the other
two, and the other two score through it, so a coalition wants the left-out player as close as possible to its top as
well. "Which two" is therefore a choice among compromise lines, judged by how far the third is left.

**T1. Whole Landing, Half-Way House, Long Division: every pair, never all three.** WL ∩ HW is c whole and m even; WL ∩
LD is c whole and m a six-digit repeater; HW ∩ LD is m a repeater and c = H − m/2. All three would need m even and
repeating: impossible.

| Coalition | Line (φ) | WL | HW | LD | The third |
|---|---|---|---|---|---|
| WL + HW | `y = 4x + 5` (17) | (0, 5, −1, 3) | (0, 7, −1, 0) | (−6, …) | LD at the bottom of its ladder (period 0 against 6) |
| WL + LD | `y = x/7 + 7` (23) | (0, 7, −7, 0) | (−1/14, 7, …) | (0, −1, 1, −1) | HW 1/14 from whole: the 1/8 rung, one below the top |
| HW + LD | `y = 2x/7 + 48/7` (25) | (−1/7, 7, …) | (0, 7, −7, −1/7) | (0, −2, 1, −7) | WL 1/7 from whole: the 1/4 rung |

WL + LD is the table's choice: the left-out HW is one rung from the top, while WL + HW drops LD to the bottom. So HW,
the player left out, is the one who should propose it, and its price for agreeing is the choice of c: on `y = x/7 + 7`
y(½) = 7 + 1/14 rounds to 7 (spf 7), so HW's S1 is as good as on its own ideal line, and WL's S1 is 7 as well. Both
pair partners give the third player something that costs them nothing.

**T2. Whole Landing, Square Corner, Ruler: Fermat decides.** SC ∩ RU is empty; WL is compatible with both. The real
choice is which of SC and RU joins WL.

| Coalition | Line (φ) | WL | SC | RU |
|---|---|---|---|---|
| WL + SC | `y = −x/2 + 7` (17) | (0, 7, −2, 3) | (0, 1, 2, −11) | (−16/5, …): D² = 39.2, rung ≤ 4 |
| WL + RU | `y = −4x/3 + 5` (21) | (0, 5, −3, 3) | (−3/8, …): area 9.375, rung ≤ 1/2 | (0, 0, 3, −3) |
| (SC + RU) | none; nearest `y = 4x/3 + 5/3` (19) | (−1/3, …) | (−1/24, …): rung ≤ 1/8 | (0, 0, 1, −3) |

WL + RU leaves SC two rungs higher than WL + SC leaves RU, and the "impossible" SC + RU near-miss leaves both SC and RU
near the top and WL at the 1/2 rung. A table that knows Fermat's theorem skips the search for SC + RU and argues about
the other two; a table that does not wastes its agents' budget looking.

**T3. Whole Landing, Matched Pair, Half-Way House: one hub, one wall.** MA ∩ HW is empty (a parity argument); WL meets
each.

| Coalition | Line (φ) | WL | MA | HW |
|---|---|---|---|---|
| WL + MA | `y = x + 5` (13) | (0, 5, −1, 8) | (0, 1, 0, −1) | (−1/2, …): y(½) = 5.5, rung ≤ 1/2 |
| WL + HW | `y = 2x + 5` (15) | (0, 5, −1, 6) | (−1, …): |2 − 1| = 1, rung ≤ 1 | (0, 2, −1, 0) |
| (MA + HW) | none; nearest `y = 7x/8 − 3/7` (37) | (−3/7, …) | (0, 7, 0, −7/8) | (−1/112, …) |

The two coalitions leave the third one rung apart, and the WL + MA line is cheaper and has more pegs; HW's counter-pitch
is that on `y = 2x + 5` MA is still at the 1 rung and WL loses only two pegs. The MA + HW near-miss is a trap: it is the
closest the two can get, it costs φ 37, and it pushes WL down to the 1/2 rung.

**T4. Whole Landing and two gatekeepers, (1, 1) and (−1, 0): the purest choice.** Two gates fix one line,
`y = x/2 + 1/2`; WL with either gate is a one-parameter family (WL ∩ G11: c = N, m = 1 − N; WL ∩ G−10: m = c = N). The
third player's distance in the WL + gate coalitions is |2N − 1|, so WL's own S1 (a large prime N) is paid for directly by
the left-out gatekeeper.

| Coalition | Line (φ) | WL | G11 | G−10 |
|---|---|---|---|---|
| G11 + G−10 | `y = x/2 + 1/2` (11) | (−1/2, …): rung ≤ 1/2 | (0, 6, −2, −2) | (0, 6, −2, −2) |
| WL + G11, modest | `y = 1` (7) | (0, 1, −1, 13) | (0, 13, −1, −1) | (−1, …): rung ≤ 1 |
| WL + G11, greedy | `y = −6x + 7` (17) | (0, 7, −1, 2) | (0, 2, −1, −1) | (−13, …): bottom |
| WL + G−10, greedy | `y = 7x + 7` (17) | (0, 7, −1, …) | (−13, …): bottom | (0, 1, −1, −1) |

The table's best line is the two gates' line, which leaves WL on the 1/2 rung, or the modest `y = 1`, which leaves G−10
on the 1 rung; the greedy WL lines (spf 7) send the third to the bottom. This is the cleanest demonstration in the
document that a secondary is a negotiating position: WL's S1 is worth something to WL and costs the table.

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

| Family | Top line (φ) | Cheapest damage | Repair | Defence (line, partner, cheapest damage there) |
|---|---|---|---|---|
| WL | `y = −x + 5` (13), (0, 5, −1, 8) | 8.75 bits, gen.nudge(b, 1) → `y = −x/2 + 5/2`, falls to the 1/2 rung | 6.75, gen.nudge(b, −1) | Already the most robust family: every whole shift, tilt and step and three mirrors are harmless. Alone at `y = −3x` (φ 9) the cheapest damage is 14.17 (a half shift). With WC at `y = −x + 5` the diagonal mirror is refused (the line is its own mirror image) and hurting both costs 14.17. |
| WC | `y = x/3 − 4` (17), (0, 6, −1, −1) | 6.75, gen.nudge(a, 1) → `y = −4` (horizontal: WORST) | 14.17, si.tilt(1/3) | Choose |a| ≥ 2 so the flattening nudge costs more: alone at `y = −2x/3` or with WL at `y = −3x/2`, cheapest damage 8.75. |
| SC | `y = −x/2 + 4` (17), (0, 2, 2, −1) | 6.75, gen.nudge(a, −1) → `y = 4` (WORST) | 14.17, si.tilt(−1/2) | Use a whole gradient: on `y = −2x + 4` (φ 15, with WL) the cheapest damage is si.shift(1) (6.17), which only drops SC to the 4 rung, and its repair is 6.17: the attack is no longer one-sided. |
| RU | `y = −3x/4 + 25/4` (23), (0, 2, 5, −4) | 6.17, si.shift(1), falls to the 4 rung | 6.17, si.shift(−1) | Mirrors are harmless to RU alone (Pythagorean slopes stay Pythagorean under every mirror). With WL at `y = −4x/3 + 5` the cheapest attack is a tilt (6.17) whose repair costs 10.17; with WC the diagonal mirror hurts WC, not RU. RU is best defended alone or with PN, which shares its slope set. |
| MA | `y = 3x/5 + 5/3` (29), (0, 3, 1, −3/5) | 5.17, mirror(diagonal) → `y = 5x/3 − 25/9` | 5.17, the same mirror | On `y = −x + 5` (with WL, φ 13) the diagonal mirror is refused; the cheapest attack is si.tilt(1) to a flat line (WORST, 6.17), repair 8.17. MA's defence is to stay on m = −1, which costs its S1 (shared number 1). |
| HW | `y = 4x + 5` (17), (0, 7, −1, 0) | 5.17, mirror(diagonal) → `y = x/4 − 5/4` (the 1/8 rung) | 5.17, the same mirror | Alone or with WL or FP, `y = 0` (φ 5): the cheapest damage is si.tilt(1) at 8.17. A real line: `y = −x + 5/2` (φ 17) is fixed by the diagonal mirror, cheapest damage si.tilt(1) 6.17, repair 10.17. |
| FP | `y = −x + 8` (15), (0, 0, 4, −1) | 5.17, mirror(x) → `y = x − 8` (m = 1: WORST) | 5.17, mirror(x) | FP's own S1 (m = −1) is one mirror from WORST: a real tension. `y = −x/2 + 6` (φ 17) gives up half a rung of S1 and survives every mirror (mirror x gives X = −12, still whole); the cheapest damage becomes si.shift(1) at 6.17, to the 1/2 rung. With WL at `y = −x/7` the cheapest damage is 8.75. |
| LD | `y = x/7 + 2` (19), (0, −1, 1, −1) | 5.17, mirror(diagonal) → `y = 7x − 14` (period 0: bottom) | 5.17, the same mirror | Choose m whose reciprocal also repeats every six: m = 7/13 or 13/7 (both 7 and 13 have period 6), and the diagonal mirror is harmless; `y = 7x/13 + 5` alone has cheapest damage 6.75 (gen.nudge(b, −1)). With WL the same line exposes WL instead (the mirror moves WL's y-intercept to −65/7). |

What a defending pair does, in one paragraph a player can use: pick the joint line where the cheapest calls are refused
(a line equal to its own mirror image: m = −1 for the diagonal mirror, c = 0 for the origin mirror) or harmless (a whole
y-intercept survives whole shifts and tilts); avoid lines one unit nudge away from a line where your rule is WORST
(flat lines for intercept and triangle families, m = 1 for Fixed Point); prefer whole gradients so the spoiler's cheap
attack is a shift whose repair costs the same; and agree in advance who repairs what, because the spoiler's cheapest
attack always picks the partner that is cheaper to hurt.

---

## 5. The recommended pool of eight

| Family | Primary (card) | Pins | Why it is in the pool |
|---|---|---|---|
| Whole Landing | The y-intercept should be a whole number. | c | The hub: compatible with all but PC; the owner's example; the most robust to attack. |
| Whole Crossing | The x-intercept should be a whole number. | p | WL's mirror twin (the diagonal mirror swaps them), the base of every two-intercept negotiation. |
| Square Corner | The intercept triangle's area should be a square number. | area | The owner's example; the Fermat wall with Ruler; trades with WL along one gradient per square. |
| Ruler | The distance from the centre to the line should be a whole number. | both, discretely | The Pythagorean climber; joins WL only on multiples of the hypotenuse; Fermat with SC. |
| Matched Pair | The gradient's top should equal the y-intercept's bottom. | a relation | Looks opposed to WL, shares a rich set at a secondary's cost; walls with RU and HW. |
| Half-Way House | At x = ½ the line should be at a whole number. | the point (½, H) | "Half" agrees with "whole" exactly on even gradients; the third player of T1 and T3. |
| Fixed Point | The machine's unchanged number should be whole. | the point (X, X) | A machine-representation pencil compatible with everything in the pool; its S1 (m = −1) is its weakness, a defence lesson. |
| Long Division | The gradient's decimal should repeat every six digits. | den(m) class | The false opposition with WL; the square-denominator wall with SC; the mirror-proof 7/13 defence. |

The pool's 56 triples (script section `pool`): 30 share a line; 18 have two of the three pairs only (a choice of
partner); 5 have every pair but no common line (WL-HW-LD, WL-RU-HW, WC-RU-LD, RU-HW-LD, RU-FP-LD: the purest
coalition choice); 3 have one pair only (SC-RU-MA, SC-RU-LD, RU-MA-HW): a dealer should avoid dealing those together to
a three-player table, or deal them deliberately as the hard table. Six of the eight use a different
representation for their primary (cart y-axis, int, tri, the perpendicular foot, si fractions, table at ½, the
machine, decimals), so the table reads the line in many ways at once.

Left out, with reasons: Prime Coefficients (walls with six families: the best lesson, the worst seat); Prime Table
(five lines in the grid, a needle; keep it as a rare deal); Gatekeeper (excellent for T4, but its parameter makes deals
uneven; use it in a teaching table of gates); Long Shot, Steady Gradient, Pythagorean Normal, Square Term, Midpoint Peg
(good families, but each is close to a pool member: SG to WL's chip, PN to RU, MP to WL ∩ WC, ST to HW's pencils, LS to
the pegs every pool member reads as a secondary).

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
