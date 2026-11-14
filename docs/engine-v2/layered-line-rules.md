# Layered rules on a line: a measured catalogue (14 November 2026)

Status: design, with measurements. It answers the finding that one-condition rules on one line top out at 2–5 bits
(#347, [spec.md](spec.md) §7.8), and the owner's reply to it, verbatim:

> "you're not being remotely creative enough then. Consider secondary preferences like we started designing for grids.
> For example primary utility is distance of c from the nearest integer and secondary is the size of the smallest prime
> factor of that integer. Or primary is distance of area with origin to a perfect square and secondary is the number of
> prime factors in the root of that nearest perfect square."

It builds on the grid's layered rules ([../layered-rules-design.md](../layered-rules-design.md),
[../tiered-rules.md](../tiered-rules.md)), on the spec's line, representations, codes and valuation
([spec.md](spec.md) §2.3, §4, §7, §12), and on the owner's principle on prices: moving to larger or more complex numbers
costs more than coming back, which makes "gravitational centres that are expensive to depart from".

Measurements: `node docs/engine-v2/scripts/layered-ladders.mjs` (about five minutes for heights 20, 50, 100 and 200; a
few seconds for 20 and 50). Its full output, every rung of every family, is
[scripts/layered-ladders-results.md](scripts/layered-ladders-results.md). §3 says what it measures and what it does not.

> **Read §8 and §7 first.** §8 (ungated rules, several secondaries per family, finer primaries) supersedes §7.5's first pool. After this document first merged, the owner required graded rungs only, two-rung beginner rules
> with school-level primaries, and cards that state a graded quantity. §7 applies those rules to all five brainstorm
> documents, measures them with one method, and gives the current pools and spec changes. §0–§6 are the first pass and
> are superseded wherever they differ.

---

## 0. The answer in one page

- **A rule's score is a short ladder of conditions, compared lexicographically and gated.** The first condition is easy
  and visible in one representation. Each later condition only counts once the one before it is met exactly, and asks for
  rarer structure, usually seen through a different representation or a piece of number theory (primes, factors,
  squares, Pythagorean triples, continued fractions, Farey neighbours, lattice points, prime runs).
- **That is enough resolution on one line.** Of the 31 families below, 25 reach a settled top of 15 bits or more under
  the reference law on rational lines (at their best parameter), and the best ladders climb in steps of 1 to 4 bits all
  the way. The grid's
  beginner bases reach 15–28 bits; one line with a layered rule reaches the same band, so multi-line variants are not
  needed for resolution (spec call (c)).
- **High rungs live far from the centre.** In every good ladder the mean read length φ of the lines at a level rises
  with the level, by 2 to 4 bits a rung (§3.3): utility and energy rise together, as the owner asked. The primary rungs
  sit at or inside the centre (they reward simple lines); the secondary rungs leave it.
- **The owner's two examples work, with one change to the first.** "Square area, rich root" climbs smoothly (steps of at
  most 4 bits) to 16.6 bits settled and keeps going. "Smallest prime factor of the nearest integer" climbs smoothly but
  settles near 11 bits on c alone, because there are many primes and a big one costs only about 2·log2 p bits to write.
  Asked of the gradient and the y-intercept together (the smaller of the two smallest prime factors counts), it settles
  at 18.2 bits and keeps climbing.
- **A first pool of eight** (§4.1), settled tops 15–22 bits: the owner's two examples, the owner's four rules layered,
  Twin Sum and Prime Run. A second pool of eleven harder families (§4.2). Six more are usable reserves and six are not
  recommended, each with the reason.
- **Spec changes** (§5): layered score tuples with gating in the rule contract; a `num` lens of dynamic number-fact
  elements (nearest primes, factor tree, nearest square and its root, continued fraction, the Pythagorean triple of a
  rational), with two scene kinds to draw them; new ladders and parameters for the twelve families; a declared top rung
  for every unbounded ladder.

---

## 1. The design principle

### 1.1 The ladder

A layered rule's score is a tuple **(primary, secondary, tertiary)**, compared lexicographically, bigger better (spec
§4.2). Two conventions make it a ladder rather than a sum:

- **Gating.** A component after the first is 0 unless every component before it is at its own top (a distance of 0, a
  condition met). Below the gate the rule is its primary alone, exactly as the grid's gated tiers
  ([../tiered-rules.md](../tiered-rules.md)). "One primary point beats any number of secondary points" is the one
  sentence that explains the order on the card.
- **Rungs.** The ladder (spec §4.4) lists thresholds on the tuple: dyadic distances for the primary (≤ 2, 1, ½, ¼, 0),
  then thresholds on the secondary, then on the tertiary. Rung thresholds are what the calibration values and what the
  goal card counts as "steps to the top".

### 1.2 What each rung should be

- **Primary: easy and visible in one representation.** One or two mutations from a random line, about 1 to 5 bits, and
  readable straight off one view: "the y-intercept is a whole number", "a + b + c = 0", "the gradient is a prime".
- **Further rungs: rarer structure, seen through another lens.** The secondary is usually read in a different
  representation (the general form's coefficients, the pegboard, the triangle with the axes, the growth pattern) or
  through a number-theoretic lens on an element: its smallest prime factor, its nearest square and that square's root,
  its divisors, its continued fraction, whether it is the square of a rational (a Pythagorean triple in disguise).
- **Usually unbounded, with a declared top.** A tertiary of "bigger is better" (a bigger twin prime, a bigger triple, a
  later convergent) makes the ladder unbounded; the dealt rule declares a top rung so that its top is in the room's band
  and is calibratable (§5, item 7).

### 1.3 What makes a ladder good (five tests, four of them measured)

| | Test | How it is checked here |
|---|---|---|
| G1 | **Every rung reachable by a junior with thought.** No rung needs a search a twelve-year-old cannot do on paper or ask their agent for in a sentence. Steps between rungs are small. | The largest step between consecutive rungs, in bits (§3.2). Good ladders step by 1–4 bits; a step above 8 bits is a **wall**, named on the card ("the first Pythagorean triple is a big step"). |
| G2 | **A high or unbounded top.** | The settled top: the highest rung whose bits moved by at most 1 between heights 100 and 200 (§3.2). Target 15–30 bits. |
| G3 | **The next rung is visible in the annotation.** At every level, the picture shows the candidates for the next rung: the primes either side, the factor tree with the smallest prime circled, the nearest square and its root's factors, the next convergent. | By design: each family below names the elements and dynamic elements its annotation reads. |
| G4 | **Rungs pull away from the centre,** so energy and utility rise together and holding a high state is worth defending. | The mean read length φ of the lines at each level (§3.3) must rise with the level. |
| G5 | **Collisions with other rules on the same line.** Some lines serve two players' rules at once (something to agree on) and some force a choice (something to trade). | The pair table (§4.1): for each pair in the pool, the line that serves both best and how much of both tops it keeps. |

### 1.4 Anti-patterns the measurements caught

- **A rare top at the centre.** Hailstone Intercept's star y-intercepts (27 takes 111 Collatz steps, 97 takes 118) are
  small numbers, so its top settles at 10 bits. Perfect Line's top includes y = 6x + 6 (13 bits). Rarity that sits next
  to the origin is cheap to reach and cheap to hold: G2 and G4 fail together.
- **Degenerate counts.** A flat line y = 19 makes "count the primes among the first six terms" equal 6 for free; every
  count rule counts **different** values (the spec's Prime Run already says so), and Square Terms refuses flat lines.
- **A ceiling theorem below the target.** Whole Numbers Everywhere asks for m, c, the x-intercept, the area and the
  hypotenuse to be whole; at most four can be (a whole gradient makes 1 + m² a non-square), so its top is 6 bits. A
  lovely proof for a lesson, a poor rule.
- **Tail-heavy tops measured in a small box.** "Smallest prime factor ≥ 97" measured 15.2 bits at height 100 and 11.8 at
  height 200: most of the mass of "a big prime" lies in bigger primes. Only settled rungs are quoted as tops.
- **Walls.** The first Pythagorean triple (3, 4, 5) is about 11 bits above "m = c" or "tangent to the circle"; the sixth
  prime in a run is about 12 bits above the fifth. Where a wall is inherent, an intermediate hint rung helps if there is a
  natural one (Prime Run: how many of 2, 3 and 5 divide the step, which is exactly what a sixth prime needs).

### 1.5 The lenses

The number-theoretic lenses used below, each a function of one element's exact rational value, and so one dynamic
element of a new `num` lens (§5, item 2):

| Lens | On | Example |
|---|---|---|
| nearest integer, distance to it | any rational | c = 7/2: 3 and 4, both ½ away |
| smallest prime factor (spf), Ω (prime factors with repeats), divisor count τ, divisor sum σ | an integer | spf(91) = 7; Ω(48) = 5; τ(60) = 12; σ(28) = 56 |
| nearest prime either side | any rational | m = 5.4: 5 (0.4 away), 7 |
| nearest square, its root | any rational | area 50: 49 = 7², root 7 |
| nearest triangular number | any rational | 36 = T₈, also 6² |
| square of a rational? its triple | a rational | 1 + (3/4)² = (5/4)²: the triple (3, 4, 5) |
| continued fraction, Euclid's steps | a rational | 89/55 = [1; 1, 1, 1, 1, 1, 1, 1, 2]: 9 steps |
| Farey neighbours | two rationals | 1/2 and 2/3: 1·3 − 2·2 = −1 |
| ways as a sum of two squares | an integer | 325 = 1² + 18² = 6² + 17² = 10² + 15² |
| digits, digit sum | an integer | 999: 27 |
| Collatz steps | an integer | 27: 111 steps |

---

## 2. The catalogue: 31 layered families

**Notation.** The line is the primitive integer triple of a·x + b·y + g = 0 (the spec's `gen.a`, `gen.b`, `gen.c`; the
last is called g here so that **c** always means the y-intercept `si.c`). For non-vertical lines, y = m·x + c with
m = −a/b and c = −g/b. p is the x-intercept (−g/a). The intercept triangle has legs |p| and |c|, area |p·c|/2 = g²/(2|a·b|)
and slanted side h with h² = p² + c². y(n) is the value at x = n (`seq.term(n)`, `mach.out(n)`), x(q) the reverse machine
(`mach.reverse(q)`). d(x, S) is the distance from x to the nearest member of S (ℤ, the primes, the squares).

**Every entry gives:** the card; the lenses (primary representation first); parameters; the score tuple (gated, §1.1);
the ladder; the annotation (elements read, dynamic elements, marks); what it teaches; where its top lives; degenerate and
runaway cases. **Measured** quotes bits at height 200 under the reference law (§3); "settled top" is the highest rung
that moved by at most 1 bit from height 100 to 200; rungs above it are over-estimates.

The families are grouped by their primary representation: the owner's examples, the owner's four rules layered, the
number line of slope-intercept, the growth pattern and table, the machine, the intercept triangle, the general form, the
pegboard, and a curve on the plane.

### 2.1 The owner's two examples

#### 1. Prime-Factor Intercept `prime-factor-intercept` (owner's example 1)

- **Card.** Make the y-intercept a whole number. Then make that number's smallest prime factor as big as you can.
  (Two-element version: make the gradient and the y-intercept whole numbers; then make each one's smallest prime factor
  as big as you can. The smaller of the two counts.)
- **Lenses.** `si` (c on a number line); `num` (nearest integers, the factor tree).
- **Parameters.** `elements` ∈ {c}, {m, c}; the dealt top rung (spf ≥ 29, 37 or 47).
- **Score.** (−d(c, ℤ), spf(n)) where n is the nearest integer to c (on a tie, the neighbour with the bigger spf).
  spf(0) = 2 (every prime divides 0; the smallest is 2) and spf(±1) = 1 (no prime factor). Two elements:
  (−(d(m, ℤ) + d(c, ℤ)), min(spf(m), spf(c))).
- **Ladder.** d ≤ ¼, ⅛, 0; spf ≥ 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 37, 47, 59, ….
- **Worked exactly.** y = (3/2)x + 7/2: c = 7/2 lies halfway between 3 and 4, d = ½: score (−½, 0), because the secondary
  is gated. `si.shift(½)` makes c = 4 = 2·2: (0, 2). `si.shift(−1)` then makes c = 3: (0, 3). c = 91 = 7·13 scores
  (0, 7), no better than c = 7; c = 97 scores (0, 97). Two elements: y = 7x + 13 scores (0, 7); y = 97x + 97 scores
  (0, 97).
- **Annotation.** Focus `si.c` on a number line with the two nearest integers and their distances. Once c is whole, the
  factor tree of n with its smallest prime circled. Candidates for the next rung: the nearest integers above and below
  |n| whose smallest prime factor is bigger (usually the nearest primes), each with its distance.
- **Teaches.** Prime factorisation and factor trees; why 0 and 1 are special; that odd is not the same as prime; that a
  number is only as "prime-like" as its smallest factor.
- **Where the top lives.** c (and m) a large prime: far from the centre; each doubling of p adds about 2 bits of read
  length per element.
- **Degenerate and runaway.** c = 0 (through the origin) would otherwise have every prime as a factor; spf(0) = 2 files
  it with the even numbers. Unbounded, but the value of "spf ≥ P" grows only like log2(P·ln P) because primes are
  plentiful: on c alone it settles at 10.6 bits (spf ≥ 59). Asking it of two elements doubles the demand; that is the
  recommended form.
- **Measured.** c: 0.9 (whole), 4.2 (spf ≥ 3), 7.2 (≥ 11), 8.9 (≥ 29), 10.6 (≥ 59, settled), steps ≤ 3 bits.
  m and c: 1.2 (whole), 7.2 (≥ 3), 13.2 (≥ 11), 16.7 (≥ 29), **18.2 (≥ 37, settled)**, 22.4 at ≥ 97 (unsettled);
  largest step 5.2 bits.

#### 2. Square Area, Rich Root `square-area-roots` (owner's example 2)

- **Card.** The line cuts a triangle off the corner made by the two axes. Make its area a perfect square. Then make the
  square's root have as many prime factors as you can, counting repeats (12 = 2·2·3 has three).
- **Lenses.** `tri` (area); `cart` (the triangle drawn); `num` (nearest square, factor tree of its root).
- **Parameters.** The dealt top rung (Ω ≥ 4 or 5).
- **Score.** (−|area − s²|, Ω(s)) where s² is the nearest square to the area (on a tie, the root with more factors);
  Ω(0) = Ω(1) = 0.
- **Ladder.** d ≤ 2, 1, ½, ¼, 0; Ω ≥ 1, 2, 3, 4, 5, 6.
- **Worked exactly.** 3x + 4y − 10 = 0: legs 10/3 and 5/2, area 25/6; the nearest square is 4 = 2², d = 1/6: score
  (−1/6, 0). x + 2y − 8 = 0: legs 8 and 4, area 16 = 4², 4 = 2·2: (0, 2). x + 2y − 16 = 0: area 64 = 8²: (0, 3). The best
  line found at height 100, −2x + y − 96 = 0, has legs 48 and 96, area 2304 = 48², 48 = 2⁴·3: (0, 5).
- **Annotation.** The triangle shaded with its legs and area; beside it, the two nearest squares drawn as squares of side
  s with |area − s²| labelled; once exact, the factor tree of s, and the next rung's candidate: the nearest root with one
  more factor (s·2 is always one, at four times the area).
- **Teaches.** Area from intercepts; squares and square roots; prime factorisation; Ω (with repeats) against distinct
  primes.
- **Where the top lives.** The area grows like 4^Ω (s ≥ 2^Ω), so each rung roughly doubles the legs: about 2 to 3 bits a
  rung, unbounded, far from the centre.
- **Degenerate and runaway.** Lines through the origin or parallel to an axis have no triangle: WORST. Areas below ½ are
  nearest the square 0 (Ω 0). Powers of two are the cheapest roots for a given Ω; that is fine, they still cost.
- **Measured.** 2.4 (d ≤ 2), 7.2 (area square), 9.9 (Ω ≥ 2), 14.1 (Ω ≥ 4), **16.6 (Ω ≥ 5, settled)**, 19.2 at Ω ≥ 6
  (unsettled); largest step 4.0 bits.

### 2.2 The owner's four rules, layered

#### 3. Prime Gradient, Prime Pegs `prime-gradient-pegs` (owner's rule 1)

- **Card.** Make the gradient a prime number. Then make the line pass through "prime pegs", points whose x and y are
  both primes below 100: four if you can. With four, a bigger prime gradient scores more.
- **Lenses.** `si` (m); `cart` with the prime pegs drawn; `num` (primes either side of m).
- **Parameters.** Window W = 100 (prime pegs with x, y ≤ W); the peg gate 4.
- **Score.** (−d(m, primes), min(pegs, 4), [pegs ≥ 4]·m).
- **Ladder.** d ≤ 1, ½, ¼, 0; pegs ≥ 1, 2, 3, 4; then m ≥ 3, 5, 7.
- **Worked exactly.** y = 2x + 1 passes seven prime pegs, (2, 5), (3, 7), (5, 11), (11, 23), (23, 47), (29, 59),
  (41, 83) (Sophie Germain pairs): (0, 4, 0). y = 5x − 2 passes (3, 13), (5, 23), (11, 53), (17, 83): (0, 4, 5).
  y = 7x − 12 passes (2, 2), (5, 23), (7, 37), (13, 79): (0, 4, 7), the top.
- **Annotation.** Focus `si.m` with the primes either side as ghost lines (`cart.ghost(p)`, as in the spec's family 1);
  the prime pegs as dots (a new dynamic element, `peg.primePegs(W)`), those on the line filled; the nearest prime pegs
  off the line as candidates with their vertical distances.
- **Teaches.** Primes; gradient as "up m for each one across"; parity (an odd prime gradient makes odd and even x give
  opposite parities, so most of its pegs must have odd x); Sophie Germain pairs.
- **Where the top lives.** m = 7 with four pegs: steep lines leave the window fast, so a bigger prime fights the peg
  count. Bounded by W; a larger W raises it.
- **Degenerate and runaway.** m = 2 collects many pegs cheaply, which is why the count is capped at 4 and the gradient's
  size counts after it.
- **Measured.** 3.0 (d ≤ 1), 4.7 (m prime), 7.2 (four pegs), 9.2 (m ≥ 3), 11.6 (m ≥ 5), **16.5 (m ≥ 7, settled at every
  height)**; largest step 4.9 bits.

#### 4. Pythagorean Area `pythagorean-area` (owner's rule 2)

- **Card.** The line cuts a triangle off the axes: make its area A. Then make its slanted side a fraction, not a square
  root. Then make all three sides whole numbers.
- **Lenses.** `tri`; `cart`; `num` (is h² the square of a fraction?).
- **Parameters.** A ∈ {6, 24, 30, 60, 84}, the areas of whole right triangles (3-4-5, 6-8-10, 5-12-13, 8-15-17,
  7-24-25). Expert: A ∈ {5, 7}, congruent numbers whose rational triangles are far out.
- **Score.** (−|area − A|, [h rational], [all three sides whole]).
- **Ladder.** d ≤ 2, 1, ½, ¼, 0; h rational; all whole.
- **Worked exactly.** A = 6: 4x + 3y − 12 = 0 has legs 3 and 4, area 6, h = 5: (0, 1, 1). A = 5: 40x + 9y − 60 = 0 has
  legs 3/2 and 20/3, area 5, h = 41/6: (0, 1, 0), and no line does better.
- **Annotation.** The triangle with legs and area; h² as a fraction with the nearest rational square
  ("h² = 25 = 5²", or "h² = 1681/36 = (41/6)²", or "h² = 13: not a square").
- **Teaches.** Pythagoras; area; for the expert parameters, the congruent number problem (which areas a right triangle
  with fraction sides can have: 5, 6 and 7 can, 1, 2 and 3 never can, Fermat's theorem).
- **Where the top lives.** A finite set of triangles for each A; further out for larger A.
- **Degenerate and runaway.** None beyond the triangle's own. A ∈ {1, 2, 3} have no rational right triangle at all and are
  never dealt.
- **Measured.** A = 6: 6.1 (d ≤ 2), 10.2 (area 6), **16.2 (whole sides, settled)**; largest step 6.1. A = 30: 9.8, 17.2
  (area 30), **24.2 (settled)**. A = 5: 15.2 (area 5), then a 15-bit wall to **30.2** (h rational).

#### 5. m Meets c, on the Unit Circle `m-meets-c-pythagorean` (owner's rule 3)

- **Card.** Make the gradient and the y-intercept equal. Then make the triangle the line cuts off have a slanted side that
  is a fraction, not a square root. Then the bigger that triangle's whole-number version, the better.
- **Why it works.** m = c = t means y = t(x + 1): every such line passes through (−1, 0), and its triangle has legs 1 and
  |t|, so h² = 1 + t². For t = u/v in lowest terms that is a square exactly when u² + v² is: a Pythagorean triple
  (t = 3/4, 5/12, 8/15, …). The same line meets the unit circle again at the rational point
  ((1 − t²)/(1 + t²), 2t/(1 + t²)): triples are the rational points of the circle.
- **Lenses.** `si`; `cart` (the point (−1, 0), the triangle, the unit circle); `num` (the triple of t).
- **Parameters.** The dealt top rung (h ≥ 17 or 25).
- **Score.** (−|m − c|, h) where, at m = c = u/v (t ≠ 0), h = √(u² + v²) when that is whole, else 0.
- **Ladder.** |m − c| ≤ 2, 1, ½, ¼, 0; h ≥ 5, 13, 17, 25, 37, 53, 65, 85.
- **Worked exactly.** y = 2x + 1: |m − c| = 1. y = 2x + 2: m = c = 2, h² = 5: (0, 0). y = ¾x + ¾ (3x − 4y + 3 = 0):
  h² = 25/16, the 3-4-5 triangle: (0, 5). y = (5/12)(x + 1): (0, 13).
- **Annotation.** The spec's family 3 annotation (the point at x = −1 and its height c − m), plus the triangle, the unit
  circle with the second crossing point and its coordinates, and "1 + t² = 13/4: not a square" or the triple.
- **Teaches.** Why m = c means passing (−1, 0); Pythagorean triples; rational points on the circle.
- **Where the top lives.** Unbounded and far: each bigger triple needs bigger numerators.
- **Degenerate and runaway.** t = 0 (the x-axis): 1 + 0 is a square but there is no triangle; scored 0. A wall: the first
  triple is about 11 bits above m = c, because there is no smaller one. The card names it.
- **Measured.** 0.9 (|m − c| ≤ 2), 2.9 (m = c), 13.9 (h ≥ 5), 19.5 (h ≥ 13), 21.5 (h ≥ 17), 22.0 (h ≥ 25), 26.2 (h ≥ 37),
  **29.1 (h ≥ 85, settled)**; largest step 11.0 (the wall), 1–6 bits elsewhere.

#### 6. Crossing Check, Whole Machine, Prime Meeting `crossing-check` (owner's rule 4)

- **Card.** Feed k into the machine and q into the reverse machine. Make the two answers equal. Then make both of the
  machine's dials whole numbers. Then make the number where they meet a prime: the bigger the better.
- **Why it works.** y(k) = x(q) ⇔ c·(m + 1) = q − m²·k. With a whole m, m ≡ −1 modulo m + 1, so c is whole exactly when
  m + 1 divides q − k. The whole-dial solutions are the divisors of q − k: finitely many, so choose q − k with many
  divisors.
- **Lenses.** `mach` (both runs); `table`; `num` (divisors of q − k).
- **Parameters.** (k, q) ∈ {(1, 13), (1, 25), (2, 14)} (q − k = 12, 24, 12). Not (2, 6): q − k = 4 tops out at 11 bits.
- **Score.** (−|y(k) − x(q)|, [m and c whole], [whole]·|v| when |v| is prime, v = y(k)).
- **Ladder.** gap ≤ 2, 1, ½, ¼, 0; whole; |v| ≥ 2, 3, 5, 7, 11.
- **Worked exactly.** (k, q) = (1, 13). y = x + 6: y(1) = 7 and x(13) = 13 − 6 = 7: (0, 1, 7). y = −2x − 9: y(1) = −11
  and x(13) = (13 + 9)/(−2) = −11: (0, 1, 11), the top.
- **Annotation.** Both machine runs drawn (k → ×m → +c, and q → −c → ÷m) with the gap; once equal, the divisors of q − k as
  candidate machines, each with its meeting number, primes marked.
- **Teaches.** Inverse functions; solving for an unknown; why m + 1 must divide q − k (modular reasoning); divisors.
- **Where the top lives.** A finite set; moderate distance from the centre.
- **Degenerate and runaway.** m = 0 has no reverse machine (WORST); m = −1 has no solution unless q = k.
- **Measured.** (1, 13): 4.7 (gap ≤ 2), 8.1 (equal), 9.0 (prime meeting), 11.1 (≥ 7), **15.2 (11, settled)**; largest
  step 4.7. (2, 6): top 11.2.

### 2.3 The number line of slope-intercept

#### 7. Twin Coefficients `twin-coefficients`

- **Card.** Make the gradient and the y-intercept both prime numbers. Then make them twins, two apart like 11 and 13.
  Then make the twins as big as you can.
- **Lenses.** `si`; `num` (primes either side of each; twin pairs nearby).
- **Score.** (−(d(m, primes) + d(c, primes)), [|m − c| = 2], [twins]·min(m, c)).
- **Ladder.** sum ≤ 2, 1, ½, 0; twins; smaller twin ≥ 5, 11, 17, 29, 41, 59, 71.
- **Annotation.** `si.m` and `si.c` each on a number line with the primes either side; once both are prime, the twin
  pairs nearby as candidates.
- **Teaches.** Primes; twin primes, and that nobody knows whether they go on for ever.
- **Where the top lives.** Unbounded, far; each rung roughly doubles both coefficients.
- **Degenerate and runaway.** None: m = c cannot be twins.
- **Measured.** 3.9, 8.3 (both prime), 11.9 (twins), 18.0 (≥ 11), 22.0 (≥ 29), **25.9 (≥ 59, settled)**; largest step 3.9.

#### 8. Pell Gradient `pell-gradient`

- **Card.** Make the gradient times itself as close to 2 as you can. (Golden version: make m × m − m as close to 1 as you
  can.)
- **Lenses.** `si` (m as a fraction p/q); `num` (the continued fraction of m).
- **Parameters.** D ∈ {2, 3, 5, 6, 7} or golden.
- **Score.** (−|m² − D|): one component. The layering is in the number theory: the best fractions are the continued
  fraction's convergents 1, 3/2, 7/5, 17/12, 41/29, 99/70, with errors 1, ¼, 1/25, 1/144, 1/841, 1/4900 (p² − 2q² = ±1,
  Pell's equation). Golden: Fibonacci ratios.
- **Ladder.** error ≤ 1, ¼, 1/16, 1/64, 1/256, 1/1024, 1/4096.
- **Annotation.** m as p/q; p² and D·q² side by side with their difference; the next convergent as a ghost line.
- **Teaches.** √2 is irrational; rational approximation; Pell's equation; continued fractions; Fibonacci.
- **Where the top lives.** Unbounded: the score never reaches 0, so the dealt top rung is the cap. Each convergent is
  4–6 bits further out.
- **Degenerate and runaway.** None.
- **Measured.** D = 2: 3.0, 6.7, 10.8, 16.4, 20.6, 26.5, **26.9 (error ≤ 1/4096, settled)**; largest step 5.9. Golden:
  1.0 … **25.9 (settled)**; largest step 4.6.

#### 9. Crowded Intercept `crowded-intercept`

- **Card.** Make the y-intercept a whole number with as many divisors as you can (12 has six: 1, 2, 3, 4, 6, 12).
- **Lenses.** `si`; `num` (the divisor list).
- **Score.** (−d(c, ℤ), τ(n)), with τ(0) = 0 (zero does not count).
- **Ladder.** d ≤ ¼, 0; τ ≥ 2, 3, 4, 6, 8, 9, 10, 12.
- **Annotation.** The divisors of n as a rectangle-arrangements picture (n dots in every rectangle that fits).
- **Teaches.** Divisors; highly composite numbers (12, 24, 36, 48, 60).
- **Where the top lives.** Moderately far (60, 120, 180).
- **Degenerate and runaway.** c = 0 excluded by τ(0) = 0.
- **Measured.** 0.9, 3.2 (τ ≥ 2), 7.3 (≥ 6), **11.4 (≥ 12, settled)**. Not recommended as it stands (low top); the fix
  is to ask it of m and c together, as Prime-Factor Intercept does. It is the natural rival of Prime-Factor Intercept on the same element (prime against
  crowded).

#### 10. Euclid's Long Way `euclid-steps`

- **Card.** Write the gradient as a fraction in lowest terms and run Euclid's algorithm on its top and bottom (divide, keep
  the remainder, repeat). Make it take as many steps as you can.
- **Lenses.** `si` (m as p/q); `num` (the chain of divisions, the continued fraction).
- **Score.** (steps, −largest quotient): ties go to the run with smaller quotients.
- **Ladder.** steps ≥ 2, 3, …, 9; nine with every quotient ≤ 2.
- **Annotation.** The divisions as a staircase of rectangles cut into squares (each quotient a row of squares); the
  candidate: the Fibonacci fraction of the next size.
- **Teaches.** Euclid's algorithm and the gcd; continued fractions; Lamé's theorem: the longest runs for their size come
  from consecutive Fibonacci numbers (89/55 takes 9 steps, 144/89 takes 10).
- **Where the top lives.** Unbounded, far: each step multiplies the numbers by about 1.6, about 1.4 bits each of top and
  bottom.
- **Degenerate and runaway.** None; whole gradients take one step.
- **Measured.** 2.5, 4.6, 6.5, 8.9, 11.3, 13.7, **16.4 (8 steps, settled)**, 19.6 (9 steps, unsettled); largest step 3.2:
  the smoothest ladder in the catalogue.

#### 11. Farey Neighbours `farey-neighbours`

- **Card.** Write the gradient and the y-intercept as fractions p/q and r/s in lowest terms. Make p·s − q·r equal 1 or
  −1 (they are then neighbours: no simpler fraction fits between them). Then make the smaller of the two bottoms as big as
  you can.
- **Lenses.** `si`; `num` (both fractions on a Stern–Brocot or Farey picture).
- **Score.** (−||p·s − q·r| − 1|, min(q, s)).
- **Ladder.** off by ≤ 1, neighbours; smaller bottom ≥ 2, 3, 4, 5, 7, 10.
- **Annotation.** The two fractions on a number line with the Farey sequence of their size; the mediant (p + r)/(q + s)
  marked.
- **Teaches.** Fractions in lowest terms; Farey sequences and mediants; the determinant as a test.
- **Where the top lives.** Unbounded, far.
- **Degenerate and runaway.** Whole m and c one apart are neighbours for free (y = 2x + 3); the next rung is a 10.6-bit
  wall.
- **Measured.** 1.2, 2.1 (neighbours), 12.7 (bottoms ≥ 2), 16.6, 19.8, 20.7, **24.7 (≥ 7, settled)**.

#### 12. Egyptian Line `egyptian-line`

- **Card.** Make the gradient and the y-intercept unit fractions (one over a whole number, like ⅓). Then make
  y(1) = m + c a unit fraction too. Then make the biggest bottom as big as you can.
- **Lenses.** `si`; `table` (y(1)); `num`.
- **Score.** (number of unit fractions among m, c, m + c, [all three]·max(bottom of m, bottom of c)).
- **Annotation.** The three fractions as strips of a bar; ⅙ + ⅓ = ½ drawn.
- **Teaches.** Adding fractions; Egyptian fractions; 1/n + 1/(n(n − 1)) = 1/(n − 1).
- **Where the top lives.** Unbounded: 1/(n(n − 1)) grows fast, but the value grows slowly.
- **Measured.** 3.2, 4.0, 8.9 (all three), 11.2 (bottom ≥ 20), **13.0 (≥ 56, settled)**. Not recommended as it stands:
  low top, because unit fractions with big bottoms are plentiful.

#### 13. Perfect Line `perfect-line`

- **Card.** Make the gradient and the y-intercept whole numbers. Then make each as close to perfect as you can: its
  divisors other than itself should add up to itself (6 = 1 + 2 + 3).
- **Score.** (−(d(m, ℤ) + d(c, ℤ)), −(|σ(m) − 2m| + |σ(c) − 2c|)) on |m|, |c| ≥ 1.
- **Measured.** 0.5, 1.2, 7.7 (imperfection ≤ 1: powers of two), **13.0 (perfect, settled)**. Not recommended: the top
  includes y = 6x + 6, next to the centre (§1.4).

#### 14. Hailstone Intercept `hailstone-intercept`

- **Card.** Make the y-intercept a whole number. Then make its hailstone run long: halve it if even, otherwise triple it
  and add one, and count the steps to reach 1.
- **Score.** (−d(c, ℤ), Collatz steps of |n|).
- **Measured.** 0.9, 3.6, 7.5 (≥ 20 steps), **10.1 (≥ 110, settled)**. Not recommended: 27 (111 steps) and 97 (118) are
  small, so the top is cheap and near the centre. Kept because it is a lovely programming exercise for an agent.

### 2.4 The growth pattern and the table

#### 15. Prime Run `prime-run`

- **Card.** Look at the growth pattern y(1), y(2), …, y(6) and count the different primes in it. Six is the most, and six
  needs a step that 2, 3 and 5 all divide.
- **Lenses.** `seq`; `table`; `num` (the smallest factor of each composite term).
- **Score.** (different primes among y(1..6), how many of 2, 3, 5 divide the step, [six]·y(1)).
- **Ladder.** primes ≥ 1 … 5; five with 1, 2, 3 of {2, 3, 5} in the step; six; six with first ≥ 11, 47, 101.
- **Worked exactly.** y = 6x − 1: 5, 11, 17, 23, 29, 35: five primes, step 6 (two of 2·3·5). y = 30x − 23: 7, 37, 67, 97,
  127, 157: six. y = 30x + 77: 107 … 257: six, first 107. y = 120x + 161: 281, 401, 521, 641, 761, 881.
- **Annotation.** The sequence with primes marked and each composite term showing its smallest factor; the step's
  factors 2, 3, 5 ticked; the hint: "y(6) = 35 is divisible by 5: make the step a multiple of 5".
- **Teaches.** Arithmetic sequences; primes; why a long run of primes needs a step divisible by every small prime (and,
  for the curious, the Green–Tao theorem).
- **Where the top lives.** Six primes need a step of 30 or more; the first prime's size climbs further.
- **Degenerate and runaway.** A flat line y = 19 counts one prime, not six (different primes only).
- **Measured.** 2.7, 4.1, 6.0, 8.2 (five), 9.8, 14.8 (five, step 30), **20.8 (six), 21.1 (six, first ≥ 47, settled)**;
  largest step 6.0 (the hint rungs split what was a 12.6-bit wall).

#### 16. Square Terms `square-terms`

- **Card.** Count the different square numbers among y(1) … y(10). Then make them come in a row.
- **Score.** (different squares among y(1..10), the longest run of consecutive square terms); flat lines are WORST.
- **Worked exactly.** y = 24x − 23: 1, 25, 49 in a row. y = 96x − 92: 4, 100, 196, 484, 676: five squares, three in a
  row.
- **Annotation.** The sequence with squares drawn as squares; the gaps between square roots.
- **Teaches.** Squares in arithmetic progression, and Fermat's theorem that four squares can never be in a row with equal
  steps: the run tops out at 3, which a player can discover.
- **Measured.** 2.7, 3.5, 4.7 (three), 10.5 (four), **22.8 (five, run 3, settled)**; a 12.3-bit wall from four to five.

#### 17. Treasure Prime Run `treasure-prime-run`

- **Card.** When x is k, y should be T. Then make as many of y(1) … y(8) different primes as you can.
- **Lenses.** `table`; `seq`; `cart` (the line pivots about (k, T)).
- **Parameters.** (k, T) ∈ {(2, 37), (3, 11)}.
- **Score.** (−|y(k) − T|, different primes among y(1..8)).
- **Measured.** (2, 37): 9.0, 12.6 (y(2) = 37), 14.7, **18.5 (six primes, settled)**. (3, 11): top 11.1. Reserve: the
  treasure point fixes the line's pivot, so the prime run is a one-parameter search, good for agents.

#### 18. Divisibility Treasure `divisibility-treasure`

- **Card.** Make y(5) a whole number, not 0, that as many of 2, 3, 4, 5, 6, 7, 8, 9 divide as possible.
- **Score.** (−d(y(5), ℤ), how many of 2…9 divide it).
- **Teaches.** Divisibility tests; least common multiples (all eight need a multiple of 2520).
- **Measured.** 1.1, 2.9, 5.7, 10.3 (six), **15.3 (seven, settled)**. Reserve.

#### 19. Digit Treasure `digit-treasure`

- **Card.** Make y(10) a whole number with as big a digit sum as you can; at the top, a prime one.
- **Score.** (−d(y(10), ℤ), digit sum, [prime]).
- **Teaches.** Place value; digit sums and divisibility by 9 (it collides with Divisibility Treasure: a big digit sum
  that is a multiple of 9 means a multiple of 9).
- **Measured.** 1.1, 5.0, 9.5 (sum ≥ 18), 13.2, **15.5 (27, settled)**. Reserve.

### 2.5 The machine

#### 20. Cunningham Machine `cunningham-machine`

- **Card.** Feed s into the machine, then feed each answer back in. How many answers in a row are new primes?
- **Lenses.** `mach` (iterated); `num`.
- **Parameters.** Seed s ∈ {2, 3}.
- **Score.** (length of the run of new primes, at most 10).
- **Worked exactly.** Seed 2, y = 2x + 13: 17, 47, 107, 227, 467, 947, 1907, then 3827 = 43·89: seven. Seed 3,
  y = 75x − 28: 197, 14747, 1105997, … six.
- **Teaches.** Function iteration; growth; Cunningham chains (x → 2x + 1); that a machine with m = 1 makes an arithmetic
  sequence and needs a step divisible by small primes, as in Prime Run.
- **Measured.** Seed 2: 4.8 … 9.1 (four), **15.0–15.1 (five to seven, settled)**. Seed 3: 5.0, 12.5 (four), 21.4 (five),
  **22.2 (six, settled)**; largest step 9.0.

### 2.6 The intercept triangle

#### 21. Two-Square Area `two-square-area`

- **Card.** Make the triangle's area a whole number that is a sum of two square numbers in as many ways as you can
  (25 = 0 + 25 = 9 + 16).
- **Score.** (−d(area, ℤ), ways).
- **Teaches.** Sums of two squares; Fermat's theorem on primes of the form 4k + 1.
- **Measured.** 2.8, 5.4 (whole), 9.3 (two ways), **14.0 (three, settled)**. Not recommended as it stands: just below
  the band, and its rungs are coarse (one rung per extra way).

#### 22. Square Triangle Area `square-triangle-area`

- **Card.** Make the triangle's area a triangular number (3, 6, 10, 15, …). Then make that number a square as well. Then
  find the second one.
- **Score.** (−|area − T|, −|T − nearest square|, T) with T ≥ 3.
- **Worked exactly.** 36 = T₈ = 6² (legs 8 and 9); 1225 = T₄₉ = 35² (legs 35 and 70, x + 2y − 70 = 0). The next is 41616:
  square triangular numbers come from Pell's equation.
- **Measured.** 5.4, 9.3 (triangular), 12.2 (36), **18.2 (1225, settled)**. Reserve.

#### 23. Prime Hypotenuse `prime-hypotenuse`

- **Card.** Make the slanted side's square a whole number. Then make it a prime: the bigger the better.
- **Lenses.** `tri`; `num`.
- **Score.** (−d(h², ℤ), [h² prime]·h²).
- **Ladder.** d ≤ ¼, 0; prime ≥ 2, 5, 13, 29, 61, 101, 181, 401, 1009.
- **Teaches.** Pythagoras; which primes are sums of two squares (2 and those leaving remainder 1 on division by 4).
- **Where the top lives.** Unbounded, far. Collides with Pythagorean Area (prime against square on the same h²).
- **Measured.** 2.5, 3.9 (whole), 7.9 (≥ 5), 11.8 (≥ 29), 15.8 (≥ 181), 18.4 (≥ 401), **21.8 (≥ 1009, settled)**; largest
  step 3.4.

#### 24. Vieta Intercepts `vieta-intercepts`

- **Card.** Make the x-intercept and the y-intercept add up to S. Then make them multiply to P.
- **Lenses.** `int`; `tri`; `cart`.
- **Parameters.** (S, P) with whole roots, (7, 12) (3 and 4); expert (4, 2), roots 2 ± √2, never reached.
- **Score.** (−|p + q − S|, −|p·q − P|).
- **Teaches.** Sum and product of roots; for (4, 2), with p + q = 4 the gap is |(p − 2)² − 2|: Pell again.
- **Measured.** (7, 12): 7.1, 12.7 (sum), **18.2 (both, settled)**. (4, 2): 5.2, 8.4 (sum), 17.9, **28.2 (gap ≤ 1/16,
  settled)**.

#### 25. Whole Numbers Everywhere `whole-everywhere`

- **Card.** Count how many of these are whole numbers: the gradient, the y-intercept, the x-intercept, the area, the
  slanted side.
- **Measured.** 0.6, 1.2, 3.9, **5.8 (four)**. Five is impossible: a whole gradient m ≠ 0 makes h² = p²(1 + m²), and
  1 + m² is never a square. Not recommended as a rule; a good lesson.

### 2.7 The general form

#### 26. Twin Sum `twin-sum`

- **Card.** Write the line as ax + by + c = 0 in lowest terms. Make a + b + c = 0 (the line then passes through (1, 1)).
  Then make a, b and c all primes, ignoring signs. Then make the biggest as big as you can.
- **Why it works.** Three primes adding to 0 with signs: two odd primes and 2, so the other two are twin primes
  (2 + p = p + 2). The rule is a twin-prime ladder in disguise.
- **Lenses.** `gen`; `cart` (the point (1, 1)); `num`.
- **Score.** (−|a + b + g|, primes among |a|, |b|, |g|, [three]·max).
- **Ladder.** |a + b + g| ≤ 2, 1, 0; primes ≥ 1, 2, 3; largest ≥ 7, 13, 19, 31, 43, 61.
- **Worked exactly.** x + y − 2 = 0: sum 0, one prime: (0, 1, 0). 2x + 3y − 5 = 0: (0, 3, 5). 2x + 71y − 73 = 0:
  (0, 3, 73).
- **Annotation.** The three coefficients with their sum and prime badges; the point (1, 1) on the plane; the twin pairs
  near the current biggest as candidates.
- **Teaches.** The general form; a point lies on a line when its coordinates satisfy the equation (here (1, 1) gives
  a + b + c); parity; twin primes.
- **Where the top lives.** Unbounded, far.
- **Measured.** 0.9, 3.5 (sum 0), 6.8, 8.5, 12.3 (three primes), 14.5, 18.4, 21.5, 22.4, 25.5, **26.4 (≥ 61, settled)**;
  largest step 3.9.

#### 27. Stepping Coefficients `stepping-coefficients`

- **Card.** Make a, b and c go up (or down) in equal steps; the line then passes through (1, −2). Then make all three
  primes. Then make the biggest as big as you can.
- **Score.** (−|a − 2b + g|, primes among |a|, |b|, |g|, [three]·max).
- **Worked exactly.** 3x + 5y + 7 = 0 (3, 5, 7). Three primes in arithmetic progression: 5, 11, 17; 7, 19, 31.
- **Teaches.** Point–line duality: a condition on the coefficients is a point on the line. Primes in arithmetic
  progression.
- **Measured.** 1.2, 4.2 (equal steps), 13.5 (three primes), 16.6, 19.2, 21.8, 23.4, **25.0 (≥ 61, settled)**; largest
  step 4.5. A sibling of Twin Sum: deal one or the other in a room, not both.

#### 28. Tangent Circle `tangent-circle`

- **Card.** Make the line just touch the circle of radius R around the origin. Then tilt it so that, written as
  ax + by + c = 0, a and b are two sides of a whole right triangle, like 3x + 4y − 5 = 0 (3, 4, 5). The bigger the
  triangle, the better.
- **Why it works.** The distance from the origin to the line is |g|/√(a² + b²); equal to a whole R exactly when
  a² + b² is a square h² and |g| = R·h.
- **Lenses.** `gen`; `cart` (the circle, the foot of the perpendicular); `num`.
- **Parameters.** R ∈ {1, 2, 3}.
- **Score.** (−|dist² − R²|, h).
- **Worked exactly.** R = 1: y = 1 (h = 1), 3x + 4y − 5 = 0 (h = 5), 5x + 12y − 13 = 0 (h = 13).
- **Teaches.** Distance from a point to a line; tangents; Pythagorean triples as directions.
- **Measured.** R = 1: 0.3, 3.2 (tangent), 14.2 (h ≥ 5), 20.0, 23.1, 24.0, **27.3 (h ≥ 29, settled)**; an 11-bit wall at
  the first triple, as in family 5.

### 2.8 The pegboard

#### 29. Peg Ruler `peg-ruler`

- **Card.** Make the line pass through two pegs of the board. Then make neighbouring pegs on the line a whole number of
  units apart: the longer the better.
- **Why it works.** Pegs on a line are spaced by √(a² + b²) (with gcd(a, b) = 1), whole exactly for a Pythagorean
  direction.
- **Parameters.** The board [−10, 10]².
- **Score.** (min(pegs, 2), spacing when whole).
- **Measured.** 0.3, 1.3 (spacing 1), 8.2 (5), 13.3 (13), **17.3 (17, settled)**; bounded by the board. Reserve.

#### 30. Pick's Pegs `pick-pegs`

- **Card.** Make both intercepts whole numbers. Then make the number of pegs strictly inside the triangle exactly N.
- **Why it works.** Pick's theorem: inside = area − boundary/2 + 1, and the boundary pegs are |p| + |c| + gcd(|p|, |c|).
- **Parameters.** N ∈ {10, 30}.
- **Score.** (−(d(p, ℤ) + d(c, ℤ)), −|inside − N|).
- **Teaches.** Pick's theorem; the gcd counts the pegs on the slanted side.
- **Measured.** N = 30: 2.5, 3.9 (whole), 7.7, 11.2 (within 2), 19.1 (within 1), **21.9 (exactly 30, settled)**; an
  8-bit step at the end. N = 10: top 9.2.

### 2.9 A curve on the plane

#### 31. Parabola Kiss `parabola-kiss`

- **Card.** Make the line just touch the curve y = x². Then make it touch at a peg. Then touch as far out as you can.
- **Why it works.** y = mx + c meets y = x² where x² − mx − c = 0; it touches when m² + 4c = 0, at x = m/2. The tangent
  at (n, n²) is y = 2nx − n².
- **Lenses.** `si`; `cart` (the parabola drawn); `num`.
- **Score.** (−|m² + 4c|, [touch point a peg], [peg]·|m/2|).
- **Teaches.** The discriminant as a tangency test, before quadratics are formal; squares growing faster than lines.
- **Measured.** 1.5, 3.2 (touches at the origin), 8.2 (|x| ≥ 1), 13.8, 16.0, 18.8, 19.6, **21.8 (|x| ≥ 7, settled)**;
  largest step 5.7.

---

## 3. Measurement

### 3.1 Method, and its limits

**Which method.** The v2 valuation command (`lib/v2-valuation`) has not landed on `develop` (checked 14 November 2026:
no `lib/v2-*` package there, and no `claude/engine-v2-spec` branch on the remote yet). So the numbers come from a
standalone script, [scripts/layered-ladders.mjs](scripts/layered-ladders.mjs), with no dependencies:

- It enumerates every primitive line a·x + b·y + g = 0 with the spec's sign rule (b > 0, or b = 0 and a > 0) and height
  max(|a|, |b|, |g|) ≤ H, for H = 20, 50, 100 (as asked) and 200 (as a convergence check): 28 thousand, 427 thousand, 3.4
  million and 26.8 million lines.
- It weighs each line by 2^−φ with the spec's Q-domain read length φ = int(a) + int(b) + int(g) (§2.3, §12.2), normalised
  over the enumerated lines (the normaliser is 0.27 to 0.29).
- It scores every line exactly (integer arithmetic; magnitudes stay far below 2^53), finds its level on the family's
  ladder, and reports each rung's bits, −log2 of the mass at that rung or above (spec §7.1), and the mean φ of the lines
  at each level.
- With `--pairs`, it finds for each pair of families the line that serves both best (§4.1).

The full output is [scripts/layered-ladders-results.md](scripts/layered-ladders-results.md). Run time: 0.3 s, 3 s, 25 s
and 4 minutes for the four heights.

**Its limits, plainly.**

1. **The reference law is not the game's law.** 2^−φ is the stationary law of the spec's walk only when every
   mutator's base price is symmetric (spec §5.3). The spec's price list is deliberately asymmetric (pivot pays for its
   anchor, gen nudges have no inverse, stretch and its inverse have different codes), so the v2 estimator's values will
   differ. How much is not measured here. Expect the order of the families and the shape of each ladder to hold better
   than the exact bits.
2. **Truncation.** Lines above height H are missing. A rung whose mass lies in big numbers is over-estimated at small H
   (its bits fall as H grows: "spf ≥ 97" reads 15.2 at H = 100 and 11.8 at H = 200). Only **settled** rungs, those that
   moved by at most 1 bit between H = 100 and H = 200, are quoted as tops. Rungs above the settled top are marked * in
   the results file.
3. **Rarity, not difficulty.** Bits measure how rare a rung is under the law. They do not measure how many priced moves a
   greedy or planning agent needs, which the grid work measured separately (`DIFF`, `rate4`). That needs the v2 walk.
4. **One line per object, the Q domain, no variants.** Integer-domain variants (`line-z`) would cut most of these ladders
   short: the rational ones (Pell, Euclid, Farey, Egyptian, the triples) need fractions.

### 3.2 The table

Bits under the reference law. "Top at H" is the bits of the highest rung reached in the box of height H. It can fall as
H grows, because more lines reach the same rung. "Settled top" is defined in §3.1. "Largest step" is the biggest jump
between consecutive rungs at H = 200. Families are listed in the catalogue's order. Several are measured at two or three
parameters.

| # | Family (parameters) | First rung | Top at H = 20 / 50 / 100 / 200 | Settled top (rung) | Largest step | Verdict |
|--:|---|--:|---|---|--:|---|
| 1 | Prime-Factor Intercept (c) | 0.7 | 11.1 / 13.2 / 15.2 / 11.8 | 10.6 (spf ≥ 59) | 2.9 | as the m-and-c form |
| 1 | Prime-Factor Intercept (m and c) | 0.6 | 21.1 / 25.2 / 29.2 / 22.4 | **18.2** (spf ≥ 37) | 5.2 | beginner |
| 2 | Square Area, Rich Root | 2.4 | 14.1 / 15.2 / 17.2 / 19.2 | **16.6** (Ω ≥ 5) | 4.0 | beginner |
| 3 | Prime Gradient, Prime Pegs | 3.0 | 16.8 / 16.5 / 16.5 / 16.5 | **16.5** (four pegs, m ≥ 7) | 4.9 | beginner |
| 4 | Pythagorean Area (A = 6) | 6.1 | 16.1 / 16.2 / 16.2 / 16.2 | **16.2** (whole sides) | 6.1 | beginner |
| 4 | Pythagorean Area (A = 30) | 9.8 | 11.9 / 17.2 / 24.2 / 24.2 | 24.2 (whole sides) | 9.8 | |
| 4 | Pythagorean Area (A = 5) | 6.1 | 15.1 / 15.1 / 30.2 / 30.2 | 30.2 (h rational) | 15.0 | expert |
| 5 | m Meets c, on the Unit Circle | 0.9 | 23.1 / 31.8 / 34.0 / 30.0 | **29.1** (h ≥ 85) | 11.0 | beginner, capped |
| 6 | Crossing Check (k = 1, q = 13) | 4.7 | 15.1 / 15.2 / 15.2 / 15.2 | **15.2** (meets at 11) | 4.7 | beginner |
| 6 | Crossing Check (k = 2, q = 6) | 4.4 | 11.1 / 11.2 / 11.2 / 11.2 | 11.2 (meets at 3) | 4.4 | parameter too small |
| 7 | Twin Coefficients | 3.9 | 22.1 / 26.2 / 30.2 / 28.5 | 25.9 (twins ≥ 59) | 3.9 | second pool |
| 8 | Pell Gradient (m² → 2) | 3.0 | 17.1 / 21.2 / 27.2 / 26.9 | 26.9 (error ≤ 1/4096) | 5.9 | second pool |
| 8 | Pell Gradient (golden) | 1.0 | 13.5 / 22.2 / 26.2 / 25.9 | 25.9 (error ≤ 1/4096) | 4.6 | second pool |
| 9 | Crowded Intercept | 0.7 | 8.5 / 13.2 / 12.2 / 11.4 | 11.4 (τ ≥ 12) | 2.2 | not as is |
| 10 | Euclid's Long Way | 2.5 | 14.1 / 18.5 / 21.5 / 20.5 | 16.4 (8 steps) | 3.2 | second pool |
| 11 | Farey Neighbours | 1.2 | 21.1 / 20.8 / 24.9 / 28.4 | 24.7 (bottoms ≥ 7) | 10.6 | reserve |
| 12 | Egyptian Line | 3.2 | 14.9 / 14.4 / 16.2 / 14.0 | 13.0 (bottom ≥ 56) | 4.9 | not as is |
| 13 | Perfect Line | 0.5 | 13.1 / 13.0 / 13.0 / 13.0 | 13.0 (perfect) | 5.4 | no |
| 14 | Hailstone Intercept | 0.9 | 10.1 / 11.2 / 10.4 / 10.1 | 10.1 (≥ 110 steps) | 2.7 | no |
| 15 | Prime Run | 2.7 | 9.7 / 23.2 / 27.2 / 24.8 | **21.1** (six, first ≥ 47) | 6.0 | beginner |
| 16 | Square Terms | 2.7 | 10.5 / 22.8 / 22.8 / 22.8 | 22.8 (five, run 3) | 12.3 | second pool |
| 17 | Treasure Prime Run (2, 37) | 9.0 | 14.7 / 18.5 / 18.5 / 18.5 | 18.5 (six primes) | 9.0 | reserve |
| 17 | Treasure Prime Run (3, 11) | 4.8 | 11.0 / 11.1 / 11.1 / 11.1 | 11.1 (six primes) | 4.8 | |
| 18 | Divisibility Treasure (k = 5) | 1.1 | 12.9 / 10.7 / 16.1 / 15.3 | 15.3 (seven of 2–9) | 5.0 | reserve |
| 19 | Digit Treasure (k = 10) | 1.1 | 11.4 / 12.8 / 16.3 / 15.5 | 15.5 (sum 27) | 2.6 | reserve |
| 20 | Cunningham Machine (seed 2) | 4.8 | 15.1 / 15.1 / 15.1 / 15.1 | 15.1 (chain 7) | 5.9 | second pool |
| 20 | Cunningham Machine (seed 3) | 5.0 | 12.4 / 23.2 / 23.1 / 22.2 | 22.2 (chain 6) | 9.0 | second pool |
| 21 | Two-Square Area | 2.8 | 10.2 / 14.6 / 14.3 / 17.6 | 14.0 (three ways) | 4.7 | not as is |
| 22 | Square Triangle Area | 5.4 | 12.1 / 12.1 / 18.2 / 18.2 | 18.2 (1225) | 6.0 | reserve |
| 23 | Prime Hypotenuse | 2.5 | 20.1 / 23.2 / 22.0 / 21.8 | 21.8 (h² ≥ 1009) | 3.4 | second pool |
| 24 | Vieta Intercepts (7, 12) | 7.1 | 18.1 / 18.2 / 18.2 / 18.2 | 18.2 (both) | 7.1 | |
| 24 | Vieta Intercepts (4, 2) | 5.2 | 17.8 / 28.2 / 28.2 / 28.2 | 28.2 (gap ≤ 1/16) | 10.3 | second pool |
| 25 | Whole Numbers Everywhere | 0.6 | 5.8 / 5.8 / 5.8 / 5.8 | 5.8 (four) | 2.7 | no |
| 26 | Twin Sum | 0.9 | 22.5 / 26.6 / 30.6 / 28.9 | **26.4** (largest ≥ 61) | 3.9 | beginner, capped |
| 27 | Stepping Coefficients | 1.2 | 20.4 / 24.8 / 30.0 / 27.2 | 25.0 (largest ≥ 61) | 4.5 | second pool |
| 28 | Tangent Circle (R = 1) | 0.3 | 24.1 / 27.6 / 27.3 / 27.3 | 27.3 (h ≥ 29) | 11.0 | second pool |
| 28 | Tangent Circle (R = 3) | 4.9 | 16.1 / 24.2 / 32.2 / 30.4 | 27.9 (h ≥ 25) | 11.0 | |
| 29 | Peg Ruler | 0.3 | 17.3 / 17.3 / 17.3 / 17.3 | 17.3 (spacing 17) | 6.9 | reserve |
| 30 | Pick's Pegs (N = 30) | 2.5 | 11.1 / 19.6 / 21.9 / 21.9 | 21.9 (exactly 30) | 8.0 | second pool |
| 30 | Pick's Pegs (N = 10) | 2.5 | 9.0 / 9.1 / 9.1 / 9.2 | 9.2 (exactly 10) | 2.6 | parameter too small |
| 31 | Parabola Kiss | 1.5 | 20.1 / 22.2 / 26.2 / 24.7 | 21.8 (\|x\| ≥ 7) | 5.7 | second pool |

Against the target (tops of 15–30 bits with a smooth ladder, comparable to the grid's 15–28): 25 of the 31 families
reach it at their best parameter. The smoothest ladders (no step above 4 bits all the way to a settled top of 16 or more)
are Twin Sum, Twin Coefficients, Euclid's Long Way, Square Area Rich Root and Prime Hypotenuse.

### 3.3 Do the high rungs pull away from the centre?

Mean read length φ of the lines at exactly each level, at H = 200 (the full columns are in the results file). The mean φ
of a random line under the law is about 10 bits.

| Family | below the first rung | at the primary's top | then each secondary and tertiary rung |
|---|--:|--:|---|
| Twin Sum | 13.5 | 7.0 | 12.0, 13.3, 17.0, 19.0, 23.0, 27.0, 27.0, 31.0, 31.0, 35.4 |
| Prime-Factor Intercept (m and c) | 9.3 | 8.9 | 8.7, 16.1, 19.1, 19.6, 22.9, 23.5, 26.1, … 34.4 |
| Square Area, Rich Root | 9.1 | 13.2 | 16.0, 18.4, 20.4, 22.1, 23.5, 25.0 |
| Euclid's Long Way | 9.2 | — | 13.5, 16.7, 19.2, 22.8, 25.8, 27.9, 30.2, 33.4 |
| Pell Gradient (m² → 2) | 10.1 | — | 9.6, 13.7, 17.7, 24.2, 28.1, 35.4, 33.4 |
| m Meets c, on the Unit Circle | 10.6 | 6.4 | 17.4, 23.4, 27.0, 25.3, 31.2, 31.5, 36.0, 33.2, 33.8 |
| Tangent Circle (R = 1) | 12.7 | 7.0 | 19.0, 25.0, 29.0, 29.0, 34.2 |

Two things to see:

- **The secondary rungs climb outwards,** 2 to 4 bits of read length a rung, with small dips where a rung admits a few
  cheap lines: high utility means high energy, as the owner asked, and nothing at the top is cheap to hold.
- **The primary's exact top often sits inside the centre** (Twin Sum: 7.0 bits, against 13.5 for lines that miss; m = c:
  6.4; tangent: 7.0), though not always (an exactly square area: 13.2). The near-miss bands of a distance primary on the rationals ("within ¼ but not exact") are populated by
  complicated lines, because only a fraction with a big bottom lands near a target without hitting it. A junior gets to
  the primary's top by a cheap exact move, not by creeping closer. So a distance primary is a gradient for agents to
  follow, and its exact top is the place where every player's climb starts.

---

## 4. Pools

### 4.1 The beginner eight

Chosen for: a first rung a junior reaches in one or two moves; a smooth ladder; a settled top within one band once capped
(15 to 22 bits); and eight different primary lenses, so that the pool collides on every element of the line.

| | Family | Primary lens | Dealt as | Settled top (capped) | Largest step |
|---|---|---|---|--:|--:|
| P | Prime-Factor Intercept (owner's example 1) | `si`, m and c | elements m and c, top spf ≥ 37 | 18.2 | 5.2 |
| S | Square Area, Rich Root (owner's example 2) | `tri`, area | top Ω ≥ 5 | 16.6 | 4.0 |
| G | Prime Gradient, Prime Pegs (owner's rule 1) | `si` m, then the pegboard | W = 100 | 16.5 | 4.9 |
| A | Pythagorean Area (owner's rule 2) | `tri`, area, then h | A = 6 (A = 30 for a richer room: 24.2) | 16.2 | 6.1 |
| M | m Meets c, on the Unit Circle (owner's rule 3) | `si` m − c, then the circle | top h ≥ 17 | 21.5 | 11.0 (named wall) |
| X | Crossing Check, Whole Machine, Prime Meeting (owner's rule 4) | `mach` | (k, q) = (1, 13) | 15.2 | 4.7 |
| T | Twin Sum | `gen` | top largest ≥ 19 | 21.5 | 3.9 |
| R | Prime Run | `seq` | six primes | 20.8 | 6.0 |

**How each pair collides.** Measured at H = 100 with `--pairs` (the results file has the table). "Share" is a rule's
bits on a line over its top; the number after each pair is the best smaller share any single line achieves. 1 would
mean one line tops both. Low numbers are not a fault: they are what the players negotiate over.

| Pair | Best shared | What the players negotiate about |
|---|--:|---|
| P × S | 0.19 | With whole m and c the area is c²/(2m), a square only when m is twice a square, so m's smallest factor is 2. P's big primes and S's square areas are rivals; y = 89x + 67 keeps P at spf ≥ 59 with the area 25.2, a quarter from 25. |
| P × G | 0.37 | Both want m prime. They part over c: G's top, y = 7x − 12, has c = −12 (spf 2); P wants c a big prime. y = 97x − 97 tops P and passes one prime peg, (2, 97). |
| P × A | 0.54 | A whole line with area 6 needs c² = 12m, so c is a multiple of 6 and P is stuck at spf 2. A's 3-4-5 line has m = −4/3, not whole. y = 83x + 31 keeps P at 29 with the area 5.8. |
| P × M | 0.08 | Direct conflict: whole m = c = t makes 1 + t² a non-square, so no triple. Agreeing on m = c = 97 gives P its top and M only its primary. |
| P × X | 0.50 | X's whole machines come from the divisors of 12; y = −13x + 13 is one (meeting at 0) and gives P 13 on both. X's best meetings, 7 and 11, need c = 6 or −9 (smallest factors 2 and 3). |
| P × T | 0.07 | Direct conflict: whole m and c need b = 1, and T's three primes need \|b\| prime. One of them gives way. |
| P × R | 0.22 | Allies at first (both need whole m and c), rivals at the top: six primes need a step divisible by 30, whose smallest factor is 2. |
| S × G | 0.37 | Allies at m = 2: y = 2x + c has area c²/4, a square for every even c (y = 2x − 32: area 256, Ω 4). G's top, m = 7, gives up the square. |
| S × A | 0.37 | One number, two targets: the area cannot be both 6 and a square. The compromise sits between them (area 4 or 9). |
| S × M | 0.19 | m = c = t fixes the legs at 1 and t, so the area is t/2; a square area needs t = 2s², which is whole, and whole t never gives M's triple. |
| S × X | 0.48 | None of X's eleven whole machines has a square area. Compromise: X near its crossing with S's Ω ≥ 4 (the line 2x − 9y + 96 = 0 has area 256 = 16² and misses the crossing by 0.39). |
| S × T | 0.19 | T's twin-prime lines (2, p, p + 2) have area (p + 2)²/(4p), p²/(4(p + 2)) or 2/(p(p + 2)); none is a square, so the tops never meet. |
| S × R | 0.19 | Six primes need m = 30k, and a square area then forces c to share m's factors, which makes every term composite. y = 30x − 23 (six primes) has area 8.8, near 9. |
| G × A | 0.54 | A prime gradient with exact area 6 needs c² = 12m, so only y = 3x ± 6, whose values are all multiples of 3: one prime peg at most, (3, 3). y = 5x − 8 trades exactness (area 6.4) for four pegs. |
| G × M | 0.28 | A prime m = c is whole, so no triple. A near-miss deal: m = c = 99/20 is 1/20 from the prime 5 and makes the triple (20, 99, 101). |
| G × X | 0.60 | The best pair in the pool: y = 5x − 2 has a prime gradient, four prime pegs, and meets X at 3, a prime (y(1) = 3 = x(13) = 15/5). |
| G × T | 0.28 | Allies on b = 1 with \|a\| prime (y = 3x − 2: sum 0, two prime coefficients, four prime pegs). T's third prime needs b prime, which makes m a fraction. |
| G × R | 0.30 | y = 2x + 1 serves both well: five primes in its first six terms and seven prime pegs. Their tops conflict: six primes need a step divisible by 30, never a prime. |
| A × M | 0.08 | m = c = t gives area t/2 = 6 only at t = 12, and 1 + 144 = 145 is not a square: the tops never meet. |
| A × X | 0.53 | A's 3-4-5 line has m = −4/3, not a whole dial. The nearest whole machine, y = −13x + 13, has area 6½. |
| A × T | 0.52 | T's twin-prime line −31x + 2y + 29 = 0 has area 841/124 ≈ 6.8: close to 6, never exactly. |
| A × R | 0.54 | y = 30x − 19 has five prime terms (11, 41, 71, 101, 131) and area 361/60 ≈ 6.02, one sixtieth from 6. |
| M × X | 0.48 | m = c together with the crossing asks 2m² + m = 13, which has no rational root: never both exact. m = c = −35/12 (the 12-35-37 triple) misses the crossing by 0.38. |
| M × T | 0.08 | Exactly one line meets both primaries, y = ½x + ½ (a = g gives 2a + b = 0). Past it they part: t = ½ gives no triple and only one prime coefficient. |
| M × R | 0.10 | Prime terms need a whole step, and a whole m = c never gives a triple. The 3-4-5 line y = ¾x + ¾ has one prime term, y(3) = 3. |
| X × T | 0.48 | Whole dials need b = 1, three prime coefficients need b prime. T's top line −73x + 2y + 71 = 0 sits within ½ of X's crossing. |
| X × R | 0.36 | Allies on whole dials: y = 2x + 3 meets at 5, a prime, and has four prime terms. R's six primes need m + 1 = 31 or more to divide 12: impossible. |
| T × R | 0.22 | On b = 1 (which R needs), a + b + c = 0 means the line passes (1, 1), so y(1) = 1, never prime: T costs R its first term. |

In a three-player room the same table says which third rule breaks a deadlock: X is the most sociable rule in the pool
(six of its seven pairs at 0.48 or more), M the most contrarian (three pairs below 0.1). Dealers can use the pair table
to avoid rooms whose three rules are pairwise below 0.1 (P, M and T together).

### 4.2 The second pool (harder)

| Family | Dealt as | Settled top | Why it is harder |
|---|---|--:|---|
| Euclid's Long Way | 8 steps | 16.4 | continued fractions; the smoothest ladder, so a good first "hard" rule |
| Pell Gradient | D ∈ {2, 3, 5, golden}, top error ≤ 1/256 | 20.6 | never exact; rewards understanding convergents |
| Twin Coefficients | top twins ≥ 17 | 21.1 | two coupled primes |
| Stepping Coefficients | top largest ≥ 19 | 19.2 | point–line duality; Twin Sum's sibling (not both in one room) |
| Tangent Circle | R = 1, top h ≥ 17 | 23.1 | distance to a line; an 11-bit wall at the first triple |
| Parabola Kiss | top \|x\| ≥ 5 | 19.6 | discriminant before quadratics |
| Square Terms | five squares | 22.8 | Fermat's four-squares theorem; a 12-bit wall from four to five |
| Pick's Pegs | N = 30 | 21.9 | Pick's theorem and the gcd on the slanted side |
| Vieta Intercepts | (S, P) = (4, 2), top gap ≤ ¼ | 17.9 | sum and product; Pell in disguise |
| Prime Hypotenuse | top h² ≥ 401 | 18.4 | primes as sums of two squares |
| Cunningham Machine | seed 3, chain 6 | 22.2 | iteration; a 9-bit step from four to five |

Reserve (usable, measured, not in a pool): Farey Neighbours (a 10.6-bit wall), Square Triangle Area (18.2), Treasure
Prime Run (18.5), Peg Ruler (17.3), Divisibility Treasure (15.3), Digit Treasure (15.5). Not recommended: Crowded
Intercept, Two-Square Area and Egyptian Line as they stand (tops of 11–14 bits; each can be fixed by asking it of two
elements), and Perfect Line, Hailstone Intercept and Whole Numbers Everywhere (tops at the centre, or a ceiling theorem).

---

## 5. What to change in the spec's twelve families (for the spec session)

A concrete list against [spec.md](spec.md) §4 and §12.5, in the order to apply.

1. **Rule contract (§4.2, §4.4): gated tuples.** State that a family's score is a tuple whose components after the
   first are **gated**: 0 unless every earlier component is at its own top. Ladders list rungs as tuple thresholds, with
   trailing components meaning "anything". Add `topRung(params)` to `RuleFamily` (or make the ladder's last rung the
   declared top) so that unbounded ladders are calibratable and dealt within a band.
2. **A `num` lens (§3, §12.3).** Add a representation `num`, "number facts", with no coordinates and only dynamic
   elements, each taking an element ref: `nearInt(ref)` (the nearest integers and distances), `nearPrime(ref)`,
   `nearSquare(ref)` (the square and its root), `nearTriangular(ref)`, `factors(n)` (the factor tree; spf, Ω, τ, σ as
   derived values), `cf(ref)` (continued fraction and Euclid's steps), `triple(ref)` (whether a rational is the square
   of a rational, and the primitive triple), `twoSquares(n)`. Each is priced, as any dynamic element, by its value's code
   length. Rules use them for score terms, and marks cite them, so the annotation shows exactly the number facts the
   score used.
3. **Two scene kinds (§3, §11).** `numberline` (an element's value with candidates either side and their distances) and
   `factortree` (a factor tree with one prime circled). Add `peg.primePegs(W)` as a dynamic element of `peg`, and the
   unit circle and the parabola y = x² as optional overlays of `cart`.
4. **Replace the twelve families' scores (§12.5).**
   1. `prime-gradient` → **Prime Gradient, Prime Pegs** (#3 here): (−d(m, primes), min(prime pegs, 4), [four]·m), W = 100.
   2. `triangle-area` → **Pythagorean Area** (#4): (−|area − A|, [h rational], [all whole]), A ∈ {6, 24, 30, 60, 84},
      expert A ∈ {5, 7}. Drop A ∈ {4, 8, 12, 18}: they have no whole right triangle, so the ladder stops at the primary.
   3. `m-meets-c` → **m Meets c, on the Unit Circle** (#5): (−|m − c|, h of the triple of t), top h ≥ 17.
   4. `crossing-check` → **Crossing Check, Whole Machine, Prime Meeting** (#6): params (k, q) ∈ {(1, 13), (1, 25),
      (2, 14)}, chosen so that q − k has many divisors. The spec's grid k ∈ {1, 2, 3}, q ∈ {2, 4, 6} gives q − k ≤ 5 and
      tops near 11 bits.
   5. `y-intercept-prime` → **Prime-Factor Intercept** (#1, the owner's example): `elements` ∈ {c, (m, c)}; deal
      (m, c) in the beginner pool.
   6. `treasure` → **Treasure Prime Run** (#17) with (k, T) = (2, 37), or keep `treasure` as the primary of a
      Pythagorean or prime-run tier.
   7. `sequence-contains` → **Square Terms** (#16), or layer it: (−min |term(n) − T|, different primes among the first
      ten terms).
   8. `prime-run` → **Prime Run** (#15): count different primes; add the hint component (how many of 2, 3, 5 divide the
      step) and the tertiary (the first prime's size).
   9. `peg-count` → **Pick's Pegs** (#30, N = 30) or **Peg Ruler** (#29).
   10. `feed-zero-square` → **Square Area, Rich Root** (#2, the owner's example). The same ladder on `mach.out(0)` is a
       variant (the nearest square to c, then Ω of its root).
   11. `zero-sum` → **Twin Sum** (#26): (−|a + b + g|, prime coefficients, [three]·largest).
   12. `intercept-sum` → **Vieta Intercepts** (#24): (−|p + q − S|, −|p·q − P|), (S, P) ∈ {(7, 12), (4, 2)}.
5. **Distance ladders on Q (§12.5).** Use d ≤ 2, 1, ½, ¼, then exact, then the family's own secondary rungs: the spec's
   finer rungs (⅛ and below) add little (on Prime-Factor Intercept the ⅛ rung adds 0.1 bits), because the exact hit is
   cheaper than a near miss on the rationals (§3.3). Every count rule counts **different** values (a flat line
   otherwise games it).
6. **Lever 3 becomes the main lever (§7.8).** Tie-break components are what lift one line from 2–5 bits to 15–30. One
   line per object (`line-q`, k = 1) is enough for resolution, so `line-z4` is not needed for that reason. `line-z`
   cuts the rational ladders short (Pell, Euclid, Farey, the triples) and is a poor default.
7. **Calibration (§7.2, §7.6).** For unbounded ladders the estimator values only up to the declared top rung. The
   artefact records the top rung's value and the settled flag. The first calibration report should print, per rule,
   the largest step between rungs (flag above 8 bits as a wall) and the mean φ per level (the pull-away check).
8. **A cross-check test for `v2-valuation`.** On a price list with symmetric base prices, the estimator's values on
   `line-q` must match this script's reference law at H = 100 within the estimator's error. Pin three rules: Twin Sum,
   Square Area Rich Root and Pell Gradient. Then the asymmetric price list's departure from it is the measured effect of
   prices on value (decision 10).
9. **Dealing (§8, the deal).** Use the pair table (§4.1) as a dealing constraint: avoid rooms whose rules are pairwise
   below 0.1 on the best-shared measure (here P, M and T together), and prefer rooms with at least one pair above 0.45.

---

## 6. What this does not settle

- **Values under the real price list.** Everything here is under the symmetric reference law 2^−φ (§3.1). The v2
  estimator on the actual, asymmetric mutators may move individual rungs by a few bits; no family's verdict should
  hang on a difference smaller than that.
- **Agent difficulty.** No greedy or planning agent was run; "a junior can reach it" is a judgement from the cards and the
  algebra, not a measurement.
- **The far tops.** Rungs above the settled top (marked * in the results file) are over-estimates. Heights beyond 200
  were not enumerated.
- **Playtesting.** Whether twelve-year-olds read the cards as intended is untested.

---

## 7. The curated catalogue across all five brainstorms (graded rungs only)

Status: this part supersedes §2–§5 wherever they differ. After §1–§6 merged, the owner set four rules, relayed by the
coordinator, and this part applies them to every family from all five documents:

- **Graded rungs only.** "Binary decisions are worthless for extending the ladder. Require all rules to be
  continuous." Every primary and secondary is a distance, a count or a size with a direction, never a yes/no.
- **Accessible primaries.** Beginner primaries must be readable by a twelve-year-old who is learning linear equations
  at school, with some latitude for a dedicated learner (area, Pythagoras on a grid, primes and factors, square numbers,
  simplest-form fractions, grid points, simple sequences). Each is marked **core** (the school course) or **stretch**
  (what the child would look up).
- **Two rungs in the beginner pool.** The beginner pool is primary plus exactly one secondary. Three-rung ladders are
  kept for the second pool.
- **Card wording.** Cards state the graded quantity and its direction ("as close as possible to a whole number"),
  never a target as a fact. No rung should have fewer than about six attainable levels.

The other documents are [rule-brainstorm/b-story-lenses.md](rule-brainstorm/b-story-lenses.md) (B),
[rule-brainstorm/c-negotiation.md](rule-brainstorm/c-negotiation.md) (C) and
[rule-brainstorm/e-unusual-lenses.md](rule-brainstorm/e-unusual-lenses.md) (E). K marks the coordinator's eight
families plus the perpendicular foot. A is this document. Brainstorm D (number-theoretic ladders with proved reach) had
not reported by the cut-off; §7.7 says what is left for it.

### 7.1 One method, and what "levels" means

Every family in this part is re-implemented as **graded parts** in one library,
[scripts/line-families.mjs](scripts/line-families.mjs). A part is a quantity with ascending thresholds, and the parts
are gated as in §1.1. Two consumers measure the same definitions:

- **The reference law,** [scripts/layered-graded.mjs](scripts/layered-graded.mjs): exact enumeration of the 3.4 million
  primitive lines of height ≤ 100 weighted 2^−φ, as in §3. It gives bits per rung and **levels per rung** for all 78
  ladders (all 31 A families, the nine K families with each of their secondaries, and the strongest families of B, C and
  E). It also gives the pair table used for §7.5.
- **The v2 estimator,** [scripts/layered-v2-valuation.ts](scripts/layered-v2-valuation.ts): each family is wrapped as a v2
  `RuleFamily` whose score is its level, and `lib/v2-valuation`'s `calibrate` values it on the `line-q` variant's
  priced walk (spec §7.2). This is the one method used for the strongest thirty (§7.4). Where the stationary value did
  not converge, the estimator's own multilevel **splitting** estimate is quoted. The splitting estimate is the spec's §7.2 step-6
  diagnostic, and it agrees with the reference law within about half a bit wherever both exist. Each ladder is capped
  at its declared top, the last rung at or under 24 bits by the reference law. The estimator finds rungs by climbing
  and has no exemplar seeding yet, so rungs far beyond the cap are unreachable for it, not merely expensive.

Levels are reported two ways per part:

- **Attained:** thresholds that some line of height ≤ 100 meets. This is the coordinator's "levels on the test set".
- **Effective:** thresholds that add at least ¼ bit over the rung below. A rung that is attained but adds no bits
  extends nothing, which is the owner's actual concern.

**The main finding about levels.** A primary of the form "distance to the nearest whole number" (or to a fraction's
simplest form) has many **attained** levels on the rationals, but only one to three **effective** ones. The finer tail
to 1/64 proposed by brainstorm B adds attained levels and almost no bits. The reason is the one found in §3.3: on the
rationals an exact hit is cheaper than a near miss, because only fractions with big bottoms land near a whole number
without being one. The finer tail is adopted anyway, because it costs nothing and gives agents a gradient to follow.
But such a primary is a doorway, not a ladder: its family's reach must come from the secondary. The owner's first
example has exactly this shape, and the beginner pool below is chosen so that the secondary carries the reach.

### 7.2 Every family, deduplicated

Each row is one family after merging duplicates. Primaries and secondaries are given in their graded form ("→ min"
means smaller is better, "→ max" bigger). "Pool" gives this part's verdict: **1** first pool, **2** second pool, **r**
reserve, **–** not recommended (the reason is in §2, §7.3 or the source document).

| Family (merged names) | Lens | Primary (graded) | Secondaries (graded) | Sources | Pool |
|---|---|---|---|---|---|
| Prime-Factor Line / Whole Landing / Whole Intercept | slope-intercept | distance of c (and m) from whole numbers → min | smallest prime factor of that whole number → max; x-intercept's distance from whole → min; distance to a triangular number → min | A1, C WL, K3 | **1** (m and c form) |
| Square Area, Rich Root / Square Corner / Square Triangle | intercept triangle | distance of the area from a square number → min | prime factors of the root (Ω) → max; legs' distance from whole → min; distance of h² from a square → min | A2, C SC, K2 | **1** |
| Prime Gradient, Prime Pegs | slope, pegboard | distance of m from a prime → min | prime pegs on the line → max; then m's size | A3 | 2 |
| Pythagorean Area / Ladder Against the Wall | intercept triangle | distance of the area from A → min (B: legs' distance from whole → min) | distance of h² from a square → min; legs' distance from whole → min; Ω of the length → max | A4, B §1.5 | r |
| m Meets c, on the Unit Circle | slope-intercept, circle | \|m − c\| → min | distance of u² + v² from a square → min; size of the triple → max | A5 | **2** |
| Crossing Check | function machine | \|y(k) − x(q)\| → min | dials' distance from whole → min; meeting number's distance from a prime → min | A6 | – (graded secondary is flat) |
| Twin Coefficients | slope-intercept | distances of m, c from primes → min | \| \|m − c\| − 2 \| → min; smaller twin → max | A7 | r |
| Pell Gradient | slope as a fraction | \|m² − 2\| → min | (the convergents are the ladder) | A8 | **2** |
| Crowded Intercept / Taxi Meter | slope-intercept, fares | distance of c (or y(K)) from whole → min | divisors → max | A9, B §2.2 | – (low top) |
| Euclid's Long Way | Euclid's algorithm | steps on m = p/q → max | largest quotient → min | A10 | **2** |
| Farey Neighbours / Matched Pair | fractions | \| \|ps − qr\| − 1 \| → min (C: \| \|num m\| − den c \| → min) | smaller bottom → max (C: spf of the shared number → max) | A11, C MA | r |
| Egyptian Line | fractions | unit fractions among m, c, m + c → max | largest bottom → max | A12 | – |
| Perfect Line | slope-intercept | distance of m, c from whole → min | imperfection \|σ(n) − 2n\| → min | A13 | – |
| Hailstone Intercept | slope-intercept | distance of c from whole → min | Collatz steps → max | A14 | – |
| Prime Run / Prime Staircase / Prime Table | growth pattern | different primes among y(1..6) (K: run of primes from y(0)) → max | first prime → max; distance of m from a prime → min; gap from the last prime to the next → min | A15, K1, C PT | **1** (K form) |
| Square Terms / Squares in Step / Square Term | growth pattern, table | different squares among the first terms → max (C: distance of a term from a square → min) | biggest square → max; spread of root gaps → min; roots' distance from primes → min; \|m\| → min | A16, K8, C ST | **2** |
| Treasure Prime Run | table | \|y(2) − 37\| → min | different primes among y(1..8) → max | A17 | r |
| Divisibility Treasure | table | distance of y(5) from whole → min | how many of 2–9 divide it → max | A18 | r |
| Digit Treasure | table | distance of y(10) from whole → min | digit sum → max | A19 | r |
| Cunningham Machine | iterated machine | run of new primes from a seed → max | – | A20 | r |
| Two-Square Area | intercept triangle | distance of the area from whole → min | ways as a sum of two squares → max | A21 | – |
| Square Triangle Area | intercept triangle | distance of the area from a triangular number → min | that number's distance from a square → min | A22 | r |
| Prime Hypotenuse | intercept triangle | distance of h² from whole → min | distance of h² from a prime → min; the prime → max | A23 | r |
| Vieta Intercepts | intercept form | \|p + q − S\| → min | \|p·q − P\| → min | A24 | r |
| Whole Numbers Everywhere | five elements | how many are whole → max | – | A25 | – (ceiling theorem) |
| Twin Sum / Prime Equation / Prime Coefficients | general form | \|a + b + c\| → min (K, C: distances of \|a\|, \|b\|, \|c\| from primes → min) | distances from primes → min; \|a + b − c\| → min; largest → max | A26, K7, C PC | **2** |
| Stepping Coefficients | general form | \|a − 2b + c\| → min | distances from primes → min; largest → max | A27, K7 (in step) | r (Twin Sum's sibling) |
| Tangent Circle / Kiss the Circle | distance to a circle | \|dist² − R²\| → min | the tilt's triple → max (E: the foot's distance from a rim peg → min) | A28, E §14 | **2** |
| Peg Ruler / Peg Line / Pythagorean Normal / Orchard Walk | pegboard | pegs on the line → max (B: nearest approach to a tree → min; C: distance of a² + b² from a square → min) | distance of a² + b² from a square → min; pegs with a prime coordinate sum → max | A29, K4, C PN, B §2.13 | – (pegs are cheap: cheap lines pass many) |
| Pick's Pegs | pegboard, triangle | intercepts' distance from whole → min | \|inside pegs − N\| → min | A30 | **2** |
| Parabola Kiss | a curve on the plane | \|m² + 4c\| → min | touch point's distance from whole → min; \|touch x\| → max | A31 | r |
| Fixed Point / Same Reading / Same on Both Rulers | function machine, thermometers, nomogram | distance of c/(1 − m) from whole (E: from T) → min | Ω (or divisors) of it → max; doubling point's distance from whole → min; distance from a square → min; whole values of y(−5..5) → max | K5, B §1.4, C FP, E §11 | **1** (B form) |
| Prime Slope | rise over run | distances of rise and run from primes → min | \| \|rise − run\| − 2 \| → min; rise + run's distance from a square → min; \|den c − run\| → min | K6 | – (low top) |
| Perpendicular Foot / Plumb Line | the plane | squared distance of the foot from a peg → min | distance of dist² from a square → min; from a prime squared → min; intercepts' distance from whole → min | K9, E §16 | – (cheap lines put the foot on a peg) |
| Ruler | distance from (0, 0) | distance of D² from a square → min | the whole distance → max | C RU | **1** |
| Whole Crossing / Empty Tank | x-intercept | distance of the x-intercept (time to empty) from whole → min | divisors (spf) of it → max | C WC, B §1.7 | r |
| Half-Way House | value at x = ½ | distance of y(½) from whole → min | spf of it → max | C HW | **1** |
| Long Division | gradient as a decimal | \|period − 6\| → min | \|top of m\| → min | C LD | – (low top) |
| Gatekeeper | a gate point | \|y(gx) − gy\| → min | pegs → max | C GK | – (uneven by parameter) |
| Long Shot | pegboard | squared span of the first and last pegs → max | pegs → max | C LS | – |
| Steady Gradient | slope | distance of m from whole → min | divisors of it → max | C SG | – (low top) |
| Midpoint Peg | intercepts | distances of p/2, c/2 from whole → min | \|p/2\| + \|c/2\| → max | C MP | – |
| Matchstick Chains | growth pattern | \|c − 1\| → min | distance of the sides m + 1 from a prime → min | B §1.1 | r (low top: 8 bits) |
| Steady vs Doubling | table against 2ⁿ | min gap \|y(n) − 2ⁿ\| → min | second-smallest gap → min | B §1.2 | – (low top) |
| Shopping Baskets / Exact Change | general form as prices or coins | least change (E: \|ways − W\|) → min | prices' distance from primes → min (E: smallest pile → max) | B §1.3, E §13 | **1** (E form) |
| Savings Goal | growth pattern | distance of the goal week from whole → min | starting amount's distance from a coin → min | B §1.6 | – (low top) |
| Price per Minute | average rate | distance of y(10)/10 from whole → min | fee per minute's distance from whole → min | B §1.8 | – (low top) |
| Catch-Up, Fence Painters, Plant Diary, Speeding Up, Wheelchair Ramp, Mental Shortcut | stories | see B §2 | see B §2 | B §2 | not measured here (B's census tops 4–16 bits) |
| Sheep Fence | dots above a line | \|above − N\| → min | clearance to the nearest sheep → max | E §4 | r (low top: 9 bits) |
| Tresillo | drum beats from ⌊y(n)⌋ | beats matching the pattern → max | beats it keeps repeating → max | E §6 | **2** |
| Firefly Jar | iterating from 0 | \|escape hop − K\| → min | \|hop at escape\| → min | E §17 | r (low top) |
| Haga's Fold | paper crease (reflection) | landing's distance from the top edge → min | \|landing x − 4\| → min | E §2 | r |
| Cipher Wheel | the line mod 26 | letters right → max | \|m\| + \|c\| → min | E §18 | – (low top) |
| Fair Cut | area under the line | \|area below − 32\| → min | dark minus light squares cut → max | E §3 | – (low top) |
| Constellation Mirror, Palindrome Path, Trick Shot, One Thread, Homecoming Gear, Crate Ramp, Prime Threads, Tangent Kite, Sweet Chord | mirror, word, billiards, ring, gear, crates, threads, pole, music | see E §1–§19 | see E | E | not measured here (E's second pool) |

### 7.3 The coordinator's nine, corrected and measured with every secondary

Bits under the reference law at height 100. "Levels" gives attained / effective per part (P then S). Each secondary is
measured separately behind the same primary.

| Family / secondary | Levels P; S | Bits per rung (P \| S) | Top | Verdict |
|---|---|---|--:|---|
| **Prime Staircase** / first prime bigger | 5/5; 7/5 | 4.7 7.5 10.2 14.1 14.7 \| 14.7 14.7 17.9 18.7 19.1 19.1 19.1 23.1 28.6 | 28.6 | **first pool** |
| Prime Staircase / gradient near a prime | 5/5; 1/0 | … \| 14.7 14.7 14.7 | 14.7 | dead secondary (see correction 1) |
| Prime Staircase / last prime near another prime | 5/5; 3/1 | … \| 14.7 … 15.1 | 15.1 | nearly dead |
| **Square Triangle** / prime factors of the root | 7/5; 5/5 | 2.4 2.5 2.6 3.2 3.8 4.5 7.2 \| 8.2 10.0 12.1 14.6 17.2 | 17.2 | **first pool** (= Square Area, Rich Root) |
| Square Triangle / legs whole | 7/5; 4/0 | … \| 7.2 (flat) | 7.2 | dead: an exactly square area comes with cheap whole legs |
| Square Triangle / hypotenuse whole | 7/5; 8/5 | … \| 7.3 7.4 8.1 8.1 13.5 13.8 15.9 18.7 | 18.7 | lives, but never reaches 0 (correction 2) |
| **Whole Intercept** / spf | 6/1; 16/15 | 0.7 … 0.9 \| 1.3 4.2 5.5 6.2 7.2 … 15.2 | 15.2 | first pool as the m-and-c form |
| Whole Intercept / x-intercept whole | 6/1; 6/1 | … \| 1.8 1.9 (flat) | 1.9 | dead: cheap lines have whole x-intercepts |
| Whole Intercept / near a triangular number | 6/1; 5/0 | … \| 0.9 … 1.1 | 1.1 | dead: 0, 1 and 3 are triangular and cheap |
| **Peg Line** / pegs a whole distance apart | 13/1; 2/0 | 0.4 … 1.1 \| 1.1 … 1.3 | 1.3 | dead family: cheap lines (axes, diagonals) pass the most pegs |
| Peg Line / pegs with prime coordinate sum | 13/1; 5/2 | … \| 1.2 1.3 1.5 3.4 7.2 | 7.2 | weak |
| Peg Line / no peg on an axis | 13/1; 1/1 | … \| 2.1 | 2.1 | dropped: at most two pegs can lie on axes, so 3 levels (correction 3) |
| **Fixed Point** / divisors | 6/1; 8/8 | 0.9 … 1.3 \| 3.8 5.6 6.1 8.1 9.7 11.7 12.2 13.0 | 13.0 | reserve; Ω (Same Reading) reaches further |
| Fixed Point / doubling point whole | 6/1; 6/1 | … \| 1.7 (flat) | 1.7 | dead |
| Fixed Point / near a square | 6/1; 5/0 | … \| 1.3 … 1.5 | 1.5 | dead |
| **Prime Slope** / twins | 6/4; 6/1 | 0.5 0.5 0.5 1.4 2.3 4.7 \| 4.8 … 7.8 | 7.8 | low top |
| Prime Slope / rise + run a square | 6/4; 5/2 | … \| 4.7 … 7.6 | 7.6 | low top |
| Prime Slope / c's bottom matches the run | 6/4; 6/2 | … \| 4.8 … 6.0 | 6.0 | low top |
| **Prime Equation** / a + b = c | 6/5; 7/5 | 0.0 0.4 1.0 2.4 4.2 7.0 \| 7.1 … 12.3 | 12.3 | second pool as Twin Sum (three rungs) |
| Prime Equation / equal steps | 6/5; 7/5 | … \| 7.1 … 13.5 | 13.5 | as Stepping Coefficients |
| Prime Equation / through a prime peg | 6/5; 6/3 | … \| 7.9 … 9.2 | 9.2 | weak |
| **Squares in Step** / roots in equal steps | 4/4; 5/1 | 2.7 3.6 4.9 11.1 \| 11.1 … 16.8 | 16.8 | weak secondary (correction 4) |
| Squares in Step / roots near primes | 4/4; 5/2 | … \| 11.1 … 15.2 | 15.2 | weak |
| Squares in Step / smallest step | 4/4; 6/0 | … \| 11.1 (flat) | 11.2 | dead: the cheapest four-square lines already have the smallest steps |
| **Perpendicular Foot** / distance whole | 6/4; 5/0 | 0.9 1.2 1.5 1.6 1.8 2.1 \| 2.1 … 2.2 | 2.2 | dead family (the foot lands on a peg for every cheap line) |
| Perpendicular Foot / distance prime | 6/4; 5/1 | … \| 2.3 … 3.7 | 3.7 | dead |

**Corrections to the mathematics.**

1. *Prime Staircase, "the gradient itself prime".* The step between two odd primes is even. So a run of three or more
   odd primes has an even step, a prime step means m = 2, and with m = 2 one of any three consecutive terms is a
   multiple of 3: the run is at most 3 (3, 5, 7). A run of five from y(0) needs a step divisible by 6 (5, 11, 17, 23, 29),
   and a run of six a step divisible by 30. The secondary's graded form (distance from m to a prime) is 1 on every long
   run: dead.
2. *Square Triangle, "hypotenuse whole".* No right triangle with rational sides has a square area (Fermat; area 1 is
   not a congruent number). On the primary's top the secondary can never reach 0. Graded, it still climbs to 18.7 bits,
   and that impossibility is a good thing to discover. Brainstorm C found the same theorem between Square Corner and
   Ruler.
3. *Peg Line, "no peg on an axis".* A line meets each axis at most once, so at most two pegs lie on axes, and the graded
   form has three levels. It is dropped.
4. *Squares in Step, "roots in arithmetic progression".* If the squares sit at equally spaced terms and their roots are
   also equally spaced, the squares are constant. So the spread can shrink only when the squares sit at unequal
   spacings. Fermat's theorem (no four squares in arithmetic progression) still caps runs of consecutive squares at
   three.
5. *Prime Equation, "a + b = c" with three primes.* Two odd primes add to an even number, so one of the three is 2 and
   the others are twin primes. This secondary is Twin Sum's ladder (§2, family 26), which is why the two merge.

### 7.4 The strongest thirty, one method

Ranked by top and effective levels, one per merged family. The method is the reference law at height 100, applied to
all thirty alike. The v2 estimator (origin-seeded, `line-q` priced walk) is a cross-check on the seven it could reach.

| # | Family | Source | Parts | Levels (attained / effective) | Top bits (reference law) | v2 estimator: top of capped ladder |
|--:|---|---|---|---|--:|---|
| 1 | Square Terms | A16, K8, C ST | 2 | P 5/5, S 2/1 | 31.2 | unreachable from the origin |
| 2 | Twin Sum | A26, K7, C PC | 3 | 5/5, 6/3, 7/7 | 30.6 | unreachable |
| 3 | Twin Coefficients | A7 | 3 | 7/3, 5/1, 7/7 | 30.2 | unreachable |
| 4 | m Meets c, on the Unit Circle | A5 | 3 | 7/4, 6/2, 8/7 | 30.1 | unreachable |
| 5 | Prime-Factor Line | A1, C WL, K3 | 2 | 7/2, 16/16 | 29.2 | splitting 20.5 at spf ≥ 59 (reference 21.4) |
| 6 | Tangent Circle | A28, E §14 | 2 | 7/3, 7/7 | 28.9 | unreachable |
| 7 | Prime Staircase (first prime) | K1, A15, C PT | 2 | 5/5, 7/5 | 28.6 | unreachable |
| 8 | Vieta Intercepts (4, 2) | A24 | 2 | 7/5, 3/3 | 28.2 | unreachable |
| 9 | Stepping Coefficients | A27, K7 | 3 | 5/5, 6/4, 7/6 | 27.5 | unreachable |
| 10 | Pell Gradient | A8 | 1 | 6/6 | 27.2 | unreachable |
| 11 | Prime Run | A15 | 2 | 6/6, 5/2 | 27.2 | unreachable |
| 12 | Parabola Kiss | A31 | 3 | 7/3, 3/0, 7/7 | 26.2 | unreachable |
| 13 | Euclid's Long Way | A10 | 1 | 9/9 | 25.2 | stationary 27.2, splitting 21.8 at 9 steps (reference 21.3) |
| 14 | Farey Neighbours | A11, C MA | 2 | 5/2, 5/5 | 24.9 | unreachable |
| 15 | Exact Change / Shopping Baskets | E §13, B §1.3 | 2 | 5/4, 4/3 | 23.2 | unreachable |
| 16 | Cunningham Machine (seed 3) | A20 | 1 | 6/6 | 23.1 | unreachable |
| 17 | Square Term (distance form) | C ST | 2 | 8/2, 5/4 | 22.8 | unreachable |
| 18 | Prime Hypotenuse | A23 | 3 | 6/4, 5/1, 8/7 | 22.0 | unreachable |
| 19 | Pick's Pegs (30) | A30 | 2 | 5/3, 6/6 | 21.9 | unreachable |
| 20 | Square Triangle (hypotenuse) | K2 | 2 | 7/5, 8/5 | 18.7 | unreachable |
| 21 | Ruler | C RU | 2 | 9/6, 9/8 | 18.6 | unreachable |
| 22 | Treasure Prime Run (2, 37) | A17 | 2 | 8/6, 6/5 | 18.5 | unreachable |
| 23 | Matched Pair | C MA | 2 | 5/3, 4/4 | 18.2 | unreachable |
| 24 | Same Reading (fixed point, Ω) | B §1.4, K5, C FP, E §11 | 2 | 6/1, 6/6 | 17.7 | stationary 26.2, splitting 19.9 |
| 25 | Square Area, Rich Root | A2, C SC, K2 | 2 | 7/5, 5/5 | 17.2 | splitting 18.9 |
| 26 | Pythagorean Area (6) | A4, B §1.5 | 3 | 8/6, 7/2, 1/0 | 16.2 | unreachable |
| 27 | Divisibility Treasure | A18 | 2 | 6/1, 7/7 | 16.1 | splitting 17.3 |
| 28 | Half-Way House | C HW | 2 | 6/2, 16/16 | 15.7 | splitting 13.8 at spf ≥ 59 |
| 29 | Prime-Factor Intercept (c only) | A1 | 2 | 6/1, 16/15 | 15.2 | splitting 12.3 (reference 11.8 at height 200) |
| 30 | Tresillo | E §6 | 2 | 8/5, 6/2 | 15.6 | unreachable |

What the cross-check says: where the estimator reaches a ladder, its splitting estimate sits within about 2 bits of the
reference law. Its stationary estimate runs higher at the top (Euclid 27.2 against 21.3, Same Reading 26.2 against
17.7), which is the price-list effect of decision 10 plus the estimator's unconverged top rows; neither is settled here.
Twenty-three of the thirty are **unreachable** for the estimator as it stands: its seeded climb starts from y = 0 and
cannot find thin upper sets in 40,000 steps. Exemplar seeding (spec §7.2 step 1) is the fix (§7.6, item 5).

### 7.5 The pools

#### The first pool: eight families, two rungs each

Ranked first by how accessible the primary is, then by the reach of the secondary. Levels are attained / effective, at
height 100. Bits are the reference law's, per rung, up to the dealt top.

| # | Family | Primary practises | Primary card | Secondary card | Levels P; S | Bits P \| S (to the dealt top) |
|--:|---|---|---|---|---|---|
| 1 | **Prime-Factor Line** (owner's example 1) | core: gradient and y-intercept | "The gradient and the y-intercept should each be as close as possible to a whole number (distances added; units: 1/64 steps)." | "The smaller of their two smallest prime factors should be as big as possible (a prime)." | 7/2; 16/16 | 0.6 1.0 1.1 1.2 1.2 1.2 1.2 \| 2.0 7.3 9.9 11.2 13.3 14.2 15.5 15.9 16.4 17.1 18.9 20.1 (top: spf ≥ 47) |
| 2 | **Prime Staircase** (coordinator) | core: sequences (nth term), primes under 50 | "The pattern y(0), y(1), y(2), … should start with as long a run of different primes as possible (up to five)." | "The first prime y(0) should be as big as possible." | 5/5; 7/5 | 4.7 7.5 10.2 14.1 14.7 \| 14.7 14.7 17.9 18.7 19.1 19.1 19.1 23.1 (top: y(0) ≥ 47) |
| 3 | **Treasure Prime Run** | core: substituting x, table of values | "When x is 2, y should be as close as possible to 37." | "As many as possible of y(1) … y(8) should be different primes." | 8/6; 6/5 | 7.8 9.1 10.0 10.7 12.3 12.6 \| 13.0 13.2 14.3 14.7 18.5 |
| 4 | **Half-Way House** (C) | core: substituting a fraction for x | "At x = ½ the line should be as close as possible to a whole number." | "That whole number's smallest prime factor should be as big as possible." | 6/2; 16/16 | 1.2 1.5 1.7 1.8 1.8 1.8 \| 2.3 4.6 5.9 6.5 7.5 8.0 8.6 8.9 9.1 9.5 10.5 11.2 12.0 13.2 14.2 15.7 |
| 5 | **Same Reading** (B; the fixed point) | core: solving x = mx + c | "The temperature where both thermometers show the same number should be as close as possible to a whole number." | "That whole number should have as many prime factors as possible (counting repeats)." | 6/1; 6/6 | 3.1 3.3 3.4 3.4 3.4 3.4 \| 6.4 8.2 10.2 12.4 14.9 17.7 |
| 6 | **Square Area, Rich Root** (owner's example 2) | stretch: area of a triangle from its intercepts; square numbers | "The triangle the line cuts off the axes should have an area as close as possible to a square number." | "That square's root should have as many prime factors as possible (12 = 2·2·3 has three)." | 7/5; 5/5 | 2.4 2.5 2.6 3.2 3.8 4.5 7.2 \| 8.2 10.0 12.1 14.6 17.2 |
| 7 | **Exact Change** (E) | stretch: whole-number solutions of ax + by = N | "Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to 3." | "In every way to pay, the smaller pile should be as big as possible." | 5/4; 4/3 | 2.3 2.3 2.9 5.9 8.4 \| 15.7 18.9 23.2 |
| 8 | **Ruler** (C) | stretch: distance from a point to a line, by Pythagoras | "The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number." | "That whole distance should be as big as possible." | 9/6; 9/8 | 1.3 1.3 1.4 1.4 4.2 6.5 7.4 9.6 13.3 \| 14.5 15.0 15.9 16.2 16.6 17.4 17.9 18.6 |

Tops of the eight: 15.7 to 23.2 bits. On the coordinator's six-levels rule: every rung attains at least four levels and
most attain six or more. But four primaries of the "distance to the nearest whole number" kind (1, 4, 5, and partly 6)
have only one or two **effective** levels (§7.1). Their families get their reach from the secondary, which has 6 to 16
effective levels. That is the owner's own first example's shape, and it is the honest reading of "levels" on the
rationals.

**How each pair collides** (graded rules, height 60; the number is the best smaller share of the two tops that one line
achieves):

| Pair | Share | What the players negotiate about |
|---|--:|---|
| 1 × 2 | 0.32 | A five-prime staircase needs a step divisible by 6, whose smallest factor is 2: Prime-Factor Line's secondary dies on it. |
| 1 × 3 | 0.68 | y = 37x − 37 gives 1 its spf 37 and hits the treasure exactly (y(2) = 37), but only one prime term. |
| 1 × 4 | 0.08 | Direct conflict: with whole m and c, y(½) is whole only if m is even, so m's smallest factor is 2. |
| 1 × 5 | 0.22 | A whole fixed point −c/(m − 1) needs m − 1 to divide c; with m an odd prime, c is even (spf 2). |
| 1 × 6 | 0.30 | With whole m and c, a square area c²/(2m) needs m twice a square (spf 2). y = 37x + 43 keeps 1 high with the area 25.0. |
| 1 × 7 | 0.42 | Allies on falling whole lines: y = −29x + 59 keeps spf 29 and pays 59 in exactly three ways (29x + y = 59). |
| 1 × 8 | 0.47 | y = 59x + 59 tops 1 and leaves Ruler's distance just under 1. |
| 2 × 3 | 0.49 | Both want a run of primes; the treasure pins y(2) = 37, the staircase wants the run from y(0). y = 18x + 5 (5, 23, 41, 59) is the compromise. |
| 2 × 4 | **1.00** | Allies: y = 60x + 53 has the five primes 53, 113, 173, 233, 293, and y(½) = 83, a prime. |
| 2 × 5 | 0.41 | y = 2x + 3 (3, 5, 7) agrees at −3; long runs need steps of 6, whose fixed points are seldom rich in factors. |
| 2 × 6 | 0.30 | A five-prime run (step 30: y = 60x + 11) leaves the area 121/120, next to 1. |
| 2 × 7 | 0.42 | Exact Change needs a falling line, so the staircase runs downhill: 11, 7, 3 on y = −4x + 11 (three ways to pay 11). |
| 2 × 8 | 0.44 | y = 36x + 37 starts the staircase at 37 (37, 73, 109); its distance from (0, 0) is just over 1. |
| 3 × 4 | 0.54 | y = −6x + 50: y(2) = 38, one from the treasure; y(½) = 47, a prime. |
| 3 × 5 | 0.65 | y = 9x/2 + 28 hits the treasure exactly (y(2) = 37) and the thermometers agree at −8 (Ω 3); it has only one prime term. |
| 3 × 6 | 0.58 | y = 2x + 32 has area 256 = 16² (Ω 4) and y(2) = 36, one from the treasure. |
| 3 × 7 | 0.30 | A falling line through (2, 37) runs out of positive values fast, so it gets few prime terms. |
| 3 × 8 | 0.47 | y = 38x − 39 trades a whole distance for treasure and primes. |
| 4 × 5 | 0.60 | y = 2x + 60: y(½) = 61, a prime; the two thermometers agree at −60 (Ω 4). |
| 4 × 6 | 0.60 | The same line: area 900 = 30² (Ω 3). |
| 4 × 7 | 0.42 | y = −20x + 57 pays 57 three ways; y(½) = 47. |
| 4 × 8 | 0.47 | y = 60x + 59 tops 4 (y(½) = 89) and leaves the distance near 1. |
| 5 × 6 | **1.00** | Allies: y = 2x + 48 has area 576 = 24² (Ω 4) and agrees at −48 (Ω 5). |
| 5 × 7 | **0.00** | No line counts for both: Same Reading needs a rising line, Exact Change a falling one. The only negotiation is whose rule a line serves. |
| 5 × 8 | 0.80 | Allies: 4x − 3y + 60 = 0 is exactly 12 from the origin and agrees at −60. |
| 6 × 7 | 0.42 | 18x + y = 48 has area 64 = 8² and three ways to pay. |
| 6 × 8 | 0.47 | Fermat: an exactly square area and an exactly whole distance never meet. The compromise is y = 32x + 32. |
| 7 × 8 | 0.81 | Allies: 4x + 3y = 35 is exactly 7 from the origin and pays 35 in three ways, (2, 9), (5, 5) and (8, 1). |

Three pairs share a top (2 × 4, 5 × 6, and nearly 7 × 8), three can never share one (1 × 4, 5 × 7, 6 × 8), and the rest
sit between. That spread is what a pool for negotiation needs.

#### The second pool: eight harder families, up to three rungs

| Family | Parts | Levels | Top | Why it is here |
|---|---|---|--:|---|
| Twin Sum (A26, with K7 and C PC) | \|a + b + c\| → min; distances of \|a\|, \|b\|, \|c\| from primes → min; largest → max | 5/5, 6/3, 7/7 | 30.6 | the general form; a twin-prime ladder in disguise |
| m Meets c, on the Unit Circle (A5) | \|m − c\| → min; u² + v²'s distance from a square → min; triple size → max | 7/4, 6/2, 8/7 | 30.1 | Pythagorean triples as rational points on the circle |
| Tangent Circle (A28, E §14) | \|dist² − 1\| → min; the triple behind the tilt → max | 7/3, 7/7 | 28.9 | distance to a line; an 11-bit wall at the first triple |
| Pell Gradient (A8) | \|m² − 2\| → min | 6/6 | 27.2 | never exact: continued fractions do the climbing |
| Euclid's Long Way (A10) | Euclid's steps on m → max | 9/9 | 25.2 | the smoothest ladder: 2 to 4 bits a rung, Fibonacci at the top |
| Square Terms (A16, K8, C ST) | different squares among y(1..10) → max; the biggest square → max | 5/5, 2/1 | 31.2 | Fermat's four-squares theorem, met by playing |
| Pick's Pegs (A30) | intercepts' distance from whole → min; \|inside pegs − 30\| → min | 5/3, 6/6 | 21.9 | Pick's theorem, the gcd on the slanted side |
| Tresillo (E §6) | beats matching x..x..x. → max; beats the pattern keeps repeating → max | 8/5, 6/2 | 15.6 | the most different look at a line: rhythm from ⌊y(n)⌋ |

Reserves: Vieta Intercepts (4, 2) (28.2), Stepping Coefficients (27.5, Twin Sum's sibling), Farey Neighbours (24.9),
Cunningham Machine (23.1), Prime Hypotenuse (22.0), Matched Pair (18.2), Divisibility Treasure (16.1), and Haga's Fold
and Firefly Jar from E for variety.

### 7.6 What the spec should change (supersedes §5)

1. **Graded parts only (§4).** A family declares its parts, each a quantity of kind `distance` (minimised), `count` or
   `size` (maximised), with ascending thresholds and a `top`. There are no boolean terms. Parts after the first are
   gated, and the ladder is the concatenated thresholds. The card states each part's quantity and direction ("as close
   as possible to a whole number"), never a target as a fact.
2. **Levels in the calibration report (§7.2, §7.6).** For every part, report the levels attained on the calibration's
   samples and the **effective** levels (rungs adding ≥ ¼ bit). Flag a secondary with fewer than six attained or three
   effective levels. A distance-to-whole primary is allowed to have one or two effective levels when its secondary
   carries the reach (§7.1).
3. **The Q distance ladder.** For distance-to-whole parts use ¼, ⅛, 1/16, 1/32, 1/64, 0 (B's finer tail). It is
   cheap and gives agents a gradient, though it adds little value.
4. **Pools (§8).** The beginner pool has two parts per family; the second pool may have three. Replace the twelve
   §12.5 families with the first pool of §7.5 (Prime-Factor Line, Prime Staircase, Treasure Prime Run, Half-Way House,
   Same Reading, Square Area Rich Root, Exact Change, Ruler) and the second pool after it.
5. **Exemplar seeding in `lib/v2-valuation` (§7.2 step 1).** The spec allows `exemplars(params, variant)`; the
   package does not implement it. 23 of the 30 strongest families are "unreachable" from y = 0 in 40,000 climbing steps.
   Seeds must start the climb at the exemplar itself, not after a free burn-in, which walks off a thin set at once (tried
   here: a 4-step burn-in already loses it). Without this, the strongest rules cannot be calibrated at all.
6. **A `num` lens and two scene kinds (§3, §11),** as in §5 item 2–3: nearest integer, prime, square and triangular
   number; factor tree; continued fraction; the triple of a rational. Brainstorm E's lenses (fold, cut, beats, coins,
   cipher) need scene kinds of their own, which E sent to the spec session as gaps G1–G10.
7. **Dealing (§8).** Use the pair table as a constraint: some pairs share no line at all (Same Reading × Exact Change), and
   a room of three rules that are pairwise below 0.1 has nothing to negotiate.
8. **A cross-check test.** On a price list with symmetric base prices, the estimator should match the reference law. On
   the real price list, the seven families the estimator reaches today (§7.4) should be pinned as a regression set.

### 7.7 What is not settled

- **Brainstorm D** (number-theoretic ladders with proved reach) had not reported by the cut-off (90 minutes after the
  curator brief). Its families are not in the table; they should be added through `line-families.mjs` and the same two
  scripts.
- **Values under the real price list** for 23 of the thirty: the estimator cannot reach them until it can seed from an
  exemplar (§7.6 item 5). Their bits are the reference law's.
- **B's and E's second pools** (Catch-Up, Fence Painters, Plant Diary, Speeding Up, Wheelchair Ramp, Mental Shortcut,
  Constellation Mirror, Palindrome Path, Trick Shot, One Thread, Homecoming Gear, Crate Ramp, Prime Threads, Tangent
  Kite, Sweet Chord) are listed but not re-implemented here. Their own documents measure them.
- **Agent difficulty and playtesting,** as in §6.

The full per-rung output is [scripts/layered-graded-results.md](scripts/layered-graded-results.md) (all 78 ladders,
reference law) and [scripts/layered-v2-valuation-results.json](scripts/layered-v2-valuation-results.json) (the
estimator's thirty runs).

---

## 8. The beginner pool, ungated, with several secondaries per family

Status: supersedes §7.5's first pool. The coordinator relayed three more corrections after §7 was written:

- **No gating** (a provisional call; the owner may overrule). A rule's score is the plain lexicographic tuple (P, S).
  The secondary orders lines at every level of the primary, so both rungs can be seen and improved from the first
  move.
- **Fine-grained primaries.** Every primary needs about six attainable levels spread over several bits. The
  distance-to-whole primaries of §7.5 (one or two effective levels) are replaced. A primary now measures distance to a
  target that is not cheap, or is a count or a size.
- **Several secondaries per family,** in the owner's words: "I said I don't want tertiary preferences but I will want
  several secondary rule candidates within each family." A **family** is one primary plus three to five candidate
  secondaries. A **dealt rule** is the primary plus one of them, two rungs deep and never three.

**Which law.** Everything in §3, §7 and §8 is measured under the **old reference law**, 2^−φ with φ the digit-length
read length of §2.3. The owner has since made **mixed costing** the v2 default ("Use mixed costing now. I like
that."): additive moves are priced by steps and multiplicative ones by digits, so large primes become dear and large
composites cheap. The spec session is fixing the exact price list; when it lands, these pools are to be re-measured
with `lib/v2-valuation`. Expect families that climb through primes (Prime Staircase, Prime Landing, Treasure's prime
terms) to gain reach, and those that climb through highly composite numbers (Square Area's root factors) to lose some.

**How it is measured.** [scripts/layered-beginner.mjs](scripts/layered-beginner.mjs) uses the `BEGINNER` list in
[scripts/line-families.mjs](scripts/line-families.mjs) and the reference law at height 100. For each primary it gives
bits per level. For each secondary it gives three things:

- its bits per level over all lines (ungated, it orders every line);
- its bits per level among the lines at the primary's top (the dealt rule's upper rungs);
- the joint top, where P and S are both at their top rungs.

"Effective" counts levels that add at least ¼ bit. "Joint levels" counts the distinct (P, S) level pairs attained,
which is the dealt rule's actual resolution. The full output is in
[scripts/layered-beginner-results.md](scripts/layered-beginner-results.md).

A secondary is **dealable** when it has at least three effective levels. The others are listed so the owner can see why
they are not dealt.

### 8.1 The eight families

**1. Prime Staircase** (coordinator; core: sequences, the nth term, primes under 50)
Primary card: "The pattern y(0), y(1), y(2), … should start with as long a run of different primes as possible." Six
levels, all six effective: 4.7, 7.5, 10.2, 14.1, 14.7, 19.1 bits (a run of 1 to 6).

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| The first prime should be as big as possible. | growth pattern | 8 / 9 | 4.4 5.2 5.8 6.5 7.4 8.4 9.5 11.3 | 27.2 | 50 | pushes the run outwards; rivals any rule wanting a small y-intercept |
| The last prime of the run should be as big as possible. | growth pattern | 9 / 9 | 6.5 8.1 9.1 9.9 11.4 13.2 16.4 17.6 21.3 | 22.8 | 42 | rewards a steep step; rivals rules wanting a gentle gradient |
| The first term that is not prime should be as close as possible to a prime. | number line | 4 / 7 | 0.5 0.5 0.5 2.0 3.6 4.0 4.1 | 23.2 | 35 | a near miss for the next run; negotiable with rules on y(n) |
| The term before the start, y(−1), should be as close as possible to a prime. | growth pattern, backwards | 4 / 6 | 0.5 0.5 1.5 2.6 2.9 3.0 | 19.2 | 31 | extends the run backwards; pulls c down by m |
| *not dealt:* the step as close as possible to a multiple of 30 | slope | 2 / 7 | flat until exact | 19.1 | 38 | a hint, not a ladder |
| *not dealt:* the last prime as close as possible to another prime | number line | 1 / 6 | flat | 22.9 | 20 | prime gaps are too coarse a scale |

**2. Square Area** (owner's example 2; stretch: area of a triangle from its intercepts, square numbers)
Primary card: "The triangle the line cuts off the axes should have an area as close as possible to a square number."
Nine levels, five effective: 2.3 2.3 2.4 2.5 2.6 3.2 3.8 4.5 7.2.

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| That square's root should have as many prime factors as possible (12 = 2·2·3 has three). | factor tree | 6 / 7 | 4.5 6.2 8.1 10.5 13.8 16.2 | 17.2 | 48 | composite roots; rivals Prime Landing's big primes |
| That square's root should be as big as possible. | intercept triangle | 9 / 9 | 4.5 5.1 5.6 6.3 6.7 7.6 8.1 9.2 10.0 | 13.9 | 85 | bigger triangles; rivals any rule near the origin |
| The slanted side, squared, should be as close as possible to a square number. | intercept triangle | 3 / 7 | 2.3 2.3 2.4 2.5 2.7 3.2 15.6 | 13.5 | 78 | Fermat: never exact together with the primary, which is something to discover |
| That square's root should be as close as possible to a prime. | number line | 3 / 4 | 2.3 2.3 3.7 5.0 | 8.7 | 35 | low reach; kept as a gentle option |

**3. Treasure (2, 37)** (core: substituting x, table of values)
Primary card: "When x is 2, y should be as close as possible to 37." Nine levels, eight effective: 3.9 6.4 7.8 9.1 10.0
10.7 12.3 12.6 12.6.

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| As many as possible of y(1) … y(8) should be different primes. | table | 7 / 8 | 2.6 3.4 3.8 4.2 6.8 8.0 11.1 | 18.5 | 63 | a step of 30 through (2, 37); allies with Prime Staircase |
| The gradient should be as close as possible to a prime. | slope-intercept | 5 / 6 | 0.6 1.0 3.0 4.3 4.6 4.7 | 14.3 | 68 | odd prime steps; conflicts with long prime runs (even steps) |
| The y-intercept should be as close as possible to a square number. | slope-intercept | 3 / 6 | 0.5 0.6 0.6 0.7 1.0 1.5 | 14.7 | 70 | picks the pivot's other end; negotiable with intercept rules |
| *not dealt:* the x-intercept as close as possible to a whole number | plane | 1 / 5 | flat | 15.5 | 59 | cheap lines already have one |

**4. Ruler** (brainstorm C; stretch: distance from a point to a line, by Pythagoras)
Primary card: "The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square
number." Nine levels, six effective: 1.3 1.3 1.4 1.4 4.2 6.5 7.4 9.6 13.3.

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| That distance should be as big as possible. | plane | 8 / 8 | 4.6 5.3 5.7 6.1 6.5 6.9 7.4 7.8 | 18.6 | 80 | far lines; rivals rules near the origin |
| The gradient should be as close as possible to a prime. | slope-intercept | 5 / 6 | 1.5 2.3 3.0 4.3 4.6 4.7 | 25.5 | 69 | an exact whole distance needs a Pythagorean gradient (3/4, 5/12), never a prime: a real conflict inside one rule |
| The triangle cut off the axes should have an area as close as possible to a square number. | intercept triangle | 3 / 7 | 2.3 2.3 2.4 2.5 2.6 3.2 7.2 | 13.9 | 79 | Fermat again: never both exact (brainstorm C's finding) |
| *not dealt:* the foot of the perpendicular near a peg; the whole distance near a prime; the gradient near a whole number | pegboard, number line, slope | 1–2 / 4–6 | flat | 15–28 | — | flat on most lines |

**5. Exact Change (6 ways)** (brainstorm E; stretch: whole-number solutions of ax + by = N)
Primary card: "Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as
close as possible to 6." Six levels, all six effective: 2.9 5.7 6.9 7.6 8.9 10.5. (E's target of 3 ways gave only four
effective levels; 6 spreads them.)

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| In every way to pay, the smaller pile should be as big as possible. | pegboard | 6 / 6 | 2.9 11.3 14.7 17.8 19.9 23.2 | 21.9 | 28 | big bills with small coins; rivals rules wanting small coefficients |
| The bill N should be as big as possible. | general form | 7 / 7 | 7.6 8.4 8.8 9.7 10.5 11.6 13.8 | 20.3 | 56 | pushes c out; rivals intercept rules near the origin |
| Both coin values should be as close as possible to primes. | general form | 3 / 5 | 2.3 2.3 2.4 3.2 5.6 | 16.5 | 36 | allies with Twin Sum-like rules on the coefficients |
| *not dealt:* some way to pay with equal numbers of each coin | pegboard | 2 / 5 | flat | 15.3 | 41 | — |

**6. Prime Landing** (owner's example 1, regraded; core: y-intercept, primes under 50)
Primary card: "The y-intercept should be as close as possible to a prime number." Seven levels, five effective: 0.6
1.0 3.0 4.3 4.6 4.7 4.7. The owner's "distance to the nearest integer" became "distance to the nearest prime" so that
the primary is graded. The owner's secondary, the prime's size, is now the first candidate.

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| That prime should be as big as possible. | number line | 10 / 10 | 0.8 3.9 5.3 5.9 7.0 8.1 9.0 10.6 12.6 15.2 | 16.2 | 51 | the owner's example; big y-intercepts; should gain most under mixed costing |
| The gradient should be as close as possible to a prime too. | slope-intercept | 5 / 6 | 0.6 1.0 3.0 4.3 4.6 4.7 | 8.3 | 56 | twin-coefficient play; allies with Treasure's prime gradient |
| y(1) = m + c should be as close as possible to a prime too. | table | 4 / 6 | 0.5 0.5 1.5 2.6 2.9 3.0 | 5.3 | 52 | the first step of a prime run; allies with Prime Staircase |
| *not dealt:* the x-intercept near a whole number; the prime near another prime | plane, number line | 1 / 4–5 | flat | 5–6 | — | — |

Under the old law this family's reach is the lowest of the eight (16 bits, with its first secondary). It is kept
because it is the owner's own example, and because mixed costing makes big primes dear, which is exactly the direction
that raises it.

**7. Same on Both Rulers (T = 6)** (brainstorm E, with B's Same Reading, C's Fixed Point and the coordinator's Fixed
Point; core: solving x = mx + c)
Primary card: "The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to
6." Eight levels, six effective: 0.7 0.7 4.7 6.4 7.0 8.3 8.7 8.8. (The target 6 replaces "a whole number", whose
primary had one effective level.)

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| The gradient should be as far from 1 as possible. | slope-intercept | 5 / 7 | 0.6 0.7 0.8 2.5 3.4 4.2 5.0 | 19.7 | 72 | steep lines through (6, 6); rivals gentle-gradient rules |
| The y-intercept should be as close as possible to a prime (ignoring sign). | slope-intercept | 4 / 5 | 0.6 0.6 2.2 3.5 3.9 | 12.5 | 45 | allies with Prime Landing on one line through (6, 6) |
| As many of y(−5) … y(5) as possible should be different whole numbers. | table | 3 / 11 | 0.9 1.9 1.9 2.2 2.3 2.5 2.6 … | 11.9 | 70 | whole gradients; allies with whole-number rules |
| The lamp's height m/(m − 1) should be as close as possible to a whole number. | nomogram | 3 / 5 | 0.6 1.0 1.3 1.4 1.6 | 9.0 | 44 | the nomogram's own view; low reach |

**8. Pythagorean Area (A = 6)** (owner's rule 2; stretch: area of a triangle from its intercepts)
Primary card: "The triangle the line cuts off the axes should have an area as close as possible to 6." Eight levels,
six effective: 2.4 2.4 4.9 6.1 8.4 8.7 8.8 10.1.

| Secondary (card) | Lens | Effective / levels | Bits per level, all lines | Joint top | Joint levels | What it changes |
|---|---|---|---|--:|--:|---|
| The slanted side, squared, should be as close as possible to a square number. | intercept triangle | 3 / 7 | 2.3 2.3 2.4 2.5 2.7 3.2 15.6 | 16.2 | 66 | the 3-4-5 triangle; allies with Ruler's whole distances |
| The y-intercept should be as close as possible to a prime (ignoring sign). | slope-intercept | 4 / 5 | 2.3 2.3 3.0 4.3 4.6 | 11.2 | 44 | legs 3 and 4 are prime and near-prime; allies with Prime Landing |
| Both legs should be as close as possible to whole numbers. | intercept triangle | 3 / 5 | 2.5 3.2 3.6 3.7 3.9 | 10.1 | 51 | whole intercepts; allies with many rules |
| *not dealt:* the gradient's fraction as simple as possible | rise over run | 1 / 7 | flat | 11.2 | 69 | — |

### 8.2 What changed from §7.5, and why

- **Out:** Prime-Factor Line, Half-Way House and Same Reading in their whole-number forms. Their primaries had one or
  two effective levels, failing the six-levels rule.
- **In:** Prime Landing (the owner's example with a prime target), Same on Both Rulers (a target of 6, not "whole"), and
  Pythagorean Area (the owner's rule 2).
- **Exact Change** moves from 3 ways to 6 to spread its primary.
- Tops are lower as two-rung, ungated rules than with gating and a third rung. The joint tops of the dealable pairings
  run from 5 to 27 bits. The dealer should pair each primary with a secondary whose joint top falls in the room's band.
  The strongest are Staircase × first prime (27.2), Ruler × prime gradient (25.5), Staircase × near miss (23.2),
  Exact Change × big piles (21.9) and Same on Both Rulers × steep (19.7).
- **Joint levels:** a dealt rule has 28 to 85 distinct (P, S) levels on the test set. That is the resolution the owner
  asked for, and it comes from not gating.
- The pair table of §7.5 was computed for the gated rules. For the ungated pools it should be recomputed per dealt
  pairing, which is left for the run under mixed costing.
