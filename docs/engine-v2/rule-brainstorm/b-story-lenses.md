# Rule brainstorm B: story lenses for the line

Status: brainstorm (14 November 2026), one of five independent brainstorms of layered rule families for the v2 line
([spec.md](../spec.md) §12, [owner-decisions.md](../owner-decisions.md)). This one's slant is **everyday stories and
metaphors**: the line is a taxi meter, a draining tank, two thermometers, a matchstick pattern, a shopping budget, a
ladder against a wall. Each family's primary is a sentence in the story's own words, and its secondaries are exact
arithmetic, often seen through a different representation from the primary's.

Every number in this document was computed exactly (Python `fractions`) by
[`scripts/b_story_lenses.py`](scripts/b_story_lenses.py):

```
python3 docs/engine-v2/rule-brainstorm/scripts/b_story_lenses.py            # every example ladder below
python3 docs/engine-v2/rule-brainstorm/scripts/b_story_lenses.py --census   # where each family's best lines sit
```

## 0. Conventions used by every family

**The score is a tuple of rungs.** A family's score is `[P, S1, S2, S3]`, compared lexicographically. Each component
is put on a small ladder before it enters the tuple, so the secondaries break ties at *every* primary level, not only
among lines whose primary is exactly equal (with exact rational distances, exact ties are rare except at 0, so an
unbucketed secondary would only matter at the very top):

- A **distance** d ≥ 0 enters as its rung on the spec's Q ladder (§12.5): the number of thresholds
  `8, 4, 2, 1, 1/2, 1/4, 1/8, 0` that d meets. So d > 8 is rung 0, d ≤ 1/2 is rung 5, d = 0 is rung 8. (One family,
  Mental Shortcut, uses a wider ladder `32, 16, 8, 4, 2, 1, 1/2, 0`, stated there.)
- A **count** enters as the count.
- An **arithmetic size** (smallest prime factor `spf`, divisor count `τ`, prime-factor count with multiplicity `Ω`) enters
  as its value, **capped** (spf at 13, τ at 12, Ω at 6) so that it cannot run away to infinity. Past the cap, the walk's
  confining surcharge (§5.3) makes such lines vanishingly rare anyway, and the cap keeps the ladder finite for calibration.
- A **yes/no** enters as 1 or 0. A "smaller is better" size (a denominator) enters negated.

This is the spec's tie-break lever (§7.8, item 3), applied systematically. It also keeps every score a tuple of small
integers, which is what the card shows ("rung 6 of 8, then 3, then ...").

**Story gates.** Several stories only make sense for some lines (a draining tank needs c > 0 and m < 0). Outside the
gate the score is WORST, with the gate's sentence as the reason ("this tank is not draining"). The census below says how
much of the cheap centre each gate cuts off.

**Helpers.** `dZ(x)` is the distance from x to the nearest integer. "Nearest positive integer" N of x is 1 if x < 1, and
otherwise the nearer integer, ties to the smaller. `dPrime`, `dSq`, `dTri` are distances to the nearest prime (≥ 2),
square (0, 1, 4, ...) and positive triangular number (1, 3, 6, ...). `den(q)` is the denominator in lowest terms.

**Domain.** All families are written for `line-q`. On `line-z` (integer m and c) most "is it whole?" primaries are free,
so a family is only worth dealing on Z if its primary or first secondary still bites there; the summary table in §2
says which do.

**The census.** For "where the best lines sit", the script scores every non-vertical primitive line
a·x + b·y + c₀ = 0 with |a|, |c₀| ≤ 16 and 1 ≤ b ≤ 16 (14 369 lines), weights each by 2^−φ (φ the spec's Q read length,
§12.2: the cheap centre is heavy), and reports, for the primary's top rung and for the best tuple found, the number of
lines, a crude rarity in bits (−log₂ of the weight share) and the cheapest such line. This is a sketch to find
degenerate designs, not the calibration of §7: it has no walk, no mutator prices and a hard box. It earned its keep:
the first drafts of four families were topped by the flat line y = 0 or by a runaway, and were fixed (§3).

---

## 1. The families

### 1. Empty Tank

**Story and representation.** A water tank holds c litres and drains at −m litres a minute. Drawn on the plane (`cart`):
time across, water level up; the line meets the floor (`cart.xInt`) when the tank is empty. Gate: c > 0 and m < 0 (a
full tank draining), else WORST "this tank is not draining".

**Primary.** *"The tank is empty at a whole number of minutes."* T = −c/m (the x-intercept), N = nearest positive
integer to T, P = rung(|T − N|).

**Secondaries.**
1. **S1, the emptying minute has a big smallest prime factor**: spf(N), capped at 13 (the owner's own example shape). A
   prime minute beats an even one; a minute of 1 scores 1. Rarer because only about 1 integer in ln N is prime, and
   among whole emptying times the even ones are as common as the odd. Lens: the number N factorised, beside the axis.
2. **S2, it drains a whole number of litres each minute**: −den(m). Rarer because T whole only needs c/m whole, not m
   whole (y = −3/2x + 6 empties at minute 4). Lens: the table, where every row drops by the same amount.
3. **S3, the tank starts with a square number of litres**: rung(dSq(c)). Rarer because with S1 and S2 met, c = N·|m|
   with N prime; c square then forces |m| = N·j², so the top is y = −p·x + p² for a prime p. Lens: the y-intercept read
   as a number, a square of water.

**Example, good.** y = −7x + 49 (φ = 23). T = 7: P = 8. spf(7) = 7: S1 = 7. m = −7: S2 = −1. c = 49 = 7²: S3 = 8.
Score [8, 7, −1, 8]. (y = −13x + 169 is [8, 13, −1, 8], the capped top, at φ = 29.)

**Example, bad.** y = −3/4x + 5/2 (φ = 21). T = 10/3, N = 3, |T − N| = 1/3: P = 5. spf(3) = 3: S1 = 3. den = 4:
S2 = −4. dSq(5/2) = 3/2: S3 = 3. Score [5, 3, −4, 3]. And y = 2x − 6 (a filling tank) is WORST.

**Card.** The plane, the line from the y-axis down to the x-axis shaded as water. Dynamic elements: `cart.xAxisMark(N)`
for the nearest whole minute and the measure from `cart.xInt` to it labelled "1/3 min"; the minute N with its factor
tree in a corner ("3 = 3, prime"); beside the y-intercept, the two nearest squares with their distances ("49 = 7²" or
"4 ← 5/2 → 9").

**Teaches.** The x-intercept as "when does it run out"; why T = c/|m|; that a prime emptying time and a square volume
force each other (c = p·|m|, so |m| must carry the other p).

**Centre.** Primary top is cheap (~4.6 bits in the census; y = −x + 1 empties at minute 1). The best tuple in the
census box is y = −x + 13 (12.5 bits); the true capped top y = −13x + 169 is far out. The ladder climbs steadily away
from the centre: every secondary is paid in bigger numbers.

**Degenerate and runaway.** Without the cap S1 would reward ever larger primes; the cap at 13 stops it. m → 0⁻ makes T
huge and N large: S1 can be met by large primes with tiny slopes (y = −1/13x + 1), which S2 then punishes. Half the
plane is gated out (only 7% of the census weight is a draining tank), so newborn lines often start at WORST: this family
wants a gentle "your tank is not draining: flip the slope" note on the card.

**Collisions.**
- *Triangle Area (A = 4)*, cooperation: y = −2x + 4 empties at minute 2 and starts with 4 = 2² litres (tank
  [8, 2, −1, 8]) and makes a triangle of area 4 exactly. The tank player gives up S1 (spf 2 instead of 7) to share a
  line; the pitch is "your area is my square tank".
- *Y-intercept Prime*, collision on the secondary: y = −x + 7 is a prime y-intercept and an emptying minute 7 (tank
  [8, 7, −1, 3]) but 7 is not a square. The players negotiate whether the tank owner's S3 is worth a fight; a pair
  that agrees on y = −x + 7 both sit on their primary tops.

### 2. Taxi Meter

**Story and representation.** A taxi charges a pick-up fee c and m pounds a kilometre. Drawn as the table of fares
(`table`) and the meter's line (`si`). Parameter K ∈ {3, 5, 8} km (examples use K = 5). No gate: a negative pick-up fee
is a coupon.

**Primary.** *"A K-kilometre ride costs a whole number of pounds."* P = rung(dZ(y(K))).

**Secondaries.**
1. **S1, the pick-up fee is whole pounds**: rung(dZ(c)). Rarer: y(K) whole only needs mK + c whole (y = 1/2x + 1/2 costs
   exactly £3 for 5 km with a 50p pick-up). Lens: the y-intercept.
2. **S2, the fare splits evenly among friends in many ways**: τ(F), F the nearest positive integer to y(K), capped at
   12. Rarer: highly divisible numbers thin out (24 has 8 divisors, 25 has 3). Lens: the fare as a rectangle of coins,
   every way to share it.
3. **S3, the meter ticks whole pounds a km**: −den(m). Lens: the table's step.

**Example, good.** y = 2x + 14 (φ = 17). y(5) = 24: P = 8. c = 14: S1 = 8. τ(24) = 8: S2 = 8. den 1: S3 = −1.
Score [8, 8, 8, −1].

**Example, bad.** y = 1/3x + 1/2 (φ = 17). y(5) = 13/6, dZ = 1/6: P = 6. dZ(1/2) = 1/2: S1 = 5. F = 2, τ = 2: S2 = 2.
den 3: S3 = −3. Score [6, 5, 2, −3].

**Card.** The fare table with the column x = K highlighted; under it the fare F as a small grid of coins with its
divisors listed ("24: 1, 2, 3, 4, 6, 8, 12, 24 — 8 ways"); the nearest whole fares either side of y(K) when it is not
whole, with distances.

**Teaches.** Evaluating y(K) from a rule; that "whole fare" does not need whole parts; divisor counting.

**Centre.** The primary is almost free at the centre (~0.5 bits: every integer line meets it), which is the owner's own
example shape (an easy "is it whole" primary, then number theory on the whole number). The value lives in S2: the
census's best tuple [8, 8, 12, −1] (10.3 bits) is first met at y = 12x (y(5) = 60, τ = 12).

**Degenerate and runaway.** S2 would run away to 720, 5040, ... without the cap. y = 0 meets P and S1 (a free taxi);
S2 then scores F = 1, τ = 1, so the free taxi is a poor line, as it should be.

**Collisions.**
- *m meets c*, cooperation: y = 4x + 4 has m = c and y(5) = 24 (taxi [8, 8, 8, −1]). Pitch: "make the fee equal the
  rate and choose it so 6 × fee is a nice number".
- *Treasure (4, 5)*, compromise: y = x + 1 hits (4, 5) and costs 6 at 5 km (τ 4: [8, 8, 4, −1]); y = 7x − 23 hits (4, 5)
  and costs 12 (τ 6) but needs a coupon of 23. The negotiation is between the taxi player's S2 and the bigger numbers
  the treasure player must then defend.

### 3. Catch-Up

**Story and representation.** A walker leaves home at r km/h (the fixed line y = r·x, drawn as a ghost on `cart`). A
cyclist's distance from home is our line y = mx + c. Parameter r ∈ {3, 4, 5} (examples r = 4). Parallel lines are
WORST: "they never meet".

**Primary.** *"The cyclist catches the walker at a whole number of hours."* t = c/(r − m), N = nearest positive integer
to t, P = rung(|t − N|).

**Secondaries.**
1. **S1, a real chase**: 1 if c < 0 and m > r (the cyclist starts behind and is faster), else 0. Rarer: it fixes the
   signs of both coordinates relative to r. Lens: the story read on the plane (the cyclist's line starts below the
   walker's and is steeper).
2. **S2, whole-number cycling speed**: −den(m). Lens: `si.m`.
3. **S3, they meet at a kilometre stone with many divisors**: τ(nearest positive integer to r·t), capped at 12. Lens:
   the meeting point's height on the distance axis.

**Example, good.** y = 6x − 6 (φ = 17). t = −6/(4 − 6) = 3: P = 8. Chase: S1 = 1. S2 = −1. Meeting at km 12, τ = 6:
S3 = 6. Score [8, 1, −1, 6]. (y = 5x − 3, φ = 15, is the same score and cheaper.)

**Example, bad.** y = 1/2x + 1/3 (φ = 17). t = 2/21, N = 1, distance 19/21: P = 4. No chase: S1 = 0. S2 = −2. km 8/21,
nearest positive integer 1, τ = 1: S3 = 1. Score [4, 0, −2, 1]. y = 4x + 1 is WORST (parallel).

**Card.** The plane with the walker's ghost line `cart.ghost(r)` through the origin and the cyclist's line; the
crossing point marked; `cart.xAxisMark(N)` for the nearest whole hour with the gap; a small "chase?" badge (behind and
faster); the meeting kilometre's divisors.

**Teaches.** Intersection of two lines as "when do they meet"; relative speed (r − m) and head start (c) give the time
c/(r − m); why parallel means never.

**Centre.** Primary ~5.7 bits; cheapest top y = 3x + 1 (they met an hour in, the cyclist slower and ahead: no chase).
Best tuple in the box: y = 5x − 15 (chase, meet at hour 15, km 60 with τ = 12), ~16.5 bits.

**Degenerate and runaway.** m → r makes t huge; the cap on τ bounds S3. Lines with t < 0 met in the past; they are
scored by their distance to hour 1, which keeps a gradient.

**Collisions.**
- *Prime Gradient*, cooperation: y = 5x − 3 and y = 7x − 9 are both prime cycling speeds with a chase that meets at
  hour 3, km 12. The Prime Gradient player only cares about m; the catch-up player supplies c.
- *m meets c*, conflict: a chase needs c < 0 < r < m, so m = c is impossible. y = 5x + 5 meets m = c but the "meeting"
  is 5 hours in the past (catch-up [1, 0, −1, 1]). They must trade: one of them drops to a lower rung.

### 4. Same Reading

**Story and representation.** Two thermometers with different scales; the line converts a reading x on thermometer A to
the reading y on B (Celsius to Fahrenheit is y = 9/5x + 32). Drawn as the function machine `mach` and, for the fixed
point, the plane with the diagonal y = x. Gate: m > 0 and m ≠ 1 ("a scale must go up, and not just slide").

**Primary.** *"There is a temperature where both thermometers show the same number, and it is a whole number."*
f = c/(1 − m) (where the line crosses y = x), P = rung(dZ(f)).

**Secondaries.**
1. **S1, the agreeing number has many prime factors**: Ω(|n|), n the nearest integer to f (ties toward 0), capped at 6.
   The famous −40 = −2³·5 has Ω = 4. Lens: the factor tree of the agreeing reading.
2. **S2, a simple conversion fraction**: −(|numerator of m| + denominator of m). 9/5 costs 14, 2 costs 3. Rarer in the
   sense that simple fractions are few. Lens: `mach.times` as a fraction.
3. **S3, they agree below zero**: 1 if f < 0. Lens: the plane, the crossing in the bottom-left quadrant.

**Example, good.** y = 2x + 40 (φ = 21). f = 40/(1 − 2) = −40: P = 8. Ω(40) = 4: S1 = 4. m = 2: S2 = −3. Below zero:
S3 = 1. Score [8, 4, −3, 1]. The real Celsius–Fahrenheit line, y = 9/5x + 32 (φ = 33), scores [8, 4, −14, 1]: the same
famous −40, but its fraction is harder.

**Example, bad.** y = 1/2x + 1/3 (φ = 17). f = (1/3)/(1/2) = 2/3, dZ = 1/3: P = 5. Ω(1) = 0: S1 = 0. S2 = −3. S3 = 0.
Score [5, 0, −3, 0].

**Card.** The machine "× m, then + c" with the agreeing reading fed in and coming out unchanged (`mach.out(f)`, the
same number both sides, highlighted); on a small plane, the diagonal and the crossing point; the nearest integer's
factor tree.

**Teaches.** Fixed points (input = output); unit conversion as a line; why Celsius and Fahrenheit agree at −40;
solving x = mx + c.

**Centre.** Primary ~2.9 bits (y = 3x agrees at 0). Best tuple in the box [8, 4, −3, 1] at y = 2x + 16 (agree at −16),
~15.5 bits: large |c| is needed for many prime factors, so the top climbs away.

**Degenerate and runaway.** m → 1 makes f huge; Ω grows like log |f| and is capped at 6. m ≤ 0 is gated out (81% of
the census weight). Identity y = x (agree everywhere) is gated as m = 1.

**Collisions.**
- *Prime Gradient*, cooperation: m = 2 and m = 3 are both prime and simple. y = 2x + 40 tops Prime Gradient and Same
  Reading's S2 among the agreeing-at-−40 lines.
- *Y-intercept Prime*, conflict on S1: with m = 2, f = −c, so a prime c makes the agreeing reading a prime (Ω = 1):
  y = 2x + 29 is [8, 1, −3, 1]. The thermometer player wants c with many factors (40, 48, 64); they negotiate whether
  S1 is worth losing a partner.

### 5. Matchstick Chains

**Story and representation.** A growing pattern of matchstick shapes in a row, each new shape sharing one stick with
the last: pattern n uses y(n) sticks. Drawn as the growth pattern `seq` (first, step, zeroth). A chain of s-sided
shapes is y = (s − 1)n + 1.

**Primary.** *"Before any shapes are built there is exactly one stick."* P = rung(|c − 1|) (pattern 0, `seq.zeroth`).

**Secondaries.**
1. **S1, each new shape adds a whole number of sticks, at least two**: rung of dZ(m) if m ≥ 2, else 2 − m. Lens: the
   step of the pattern.
2. **S2, the shapes have a prime number of sides**: rung(dPrime(m + 1)) (triangles, pentagons, heptagons; squares,
   the textbook pattern 3n + 1, miss by 1). Lens: the picture of one shape.
3. **S3, pattern 10 uses a prime number of sticks**: rung(dPrime(y(10))). Lens: `seq.term(10)`.

**Example, good.** y = 6x + 1 (φ = 13): heptagons. c = 1: P = 8. m = 6: S1 = 8. 7 is prime: S2 = 8. y(10) = 61, prime:
S3 = 8. Score [8, 8, 8, 8], the top. y = 4x + 1 (pentagons, 41) and y = 10x + 1 (11-gons, 101) also top.

**Example, bad.** y = 1/2x + 5 (φ = 17). |c − 1| = 4: P = 2. m = 1/2 < 2, distance 3/2: S1 = 3. dPrime(3/2) = 1/2:
S2 = 5. y(10) = 10, dPrime = 1: S3 = 4. Score [2, 3, 5, 4]. The classic squares pattern y = 3x + 1 scores [8, 8, 4, 8]:
4 is not prime.

**Card.** Patterns 1, 2, 3 drawn in matchsticks (the sequence scene), with pattern 0's single stick ghosted; one shape
labelled "7 sides — prime"; the term at n = 10 with its nearest primes either side ("59 · 61 · 67").

**Teaches.** Reading a growth pattern as y = mx + c; why the zeroth term is the y-intercept; primes in two places.

**Centre.** Primary ~3.5 bits (y = 1, a single stick that never grows, is the cheapest; S1 scores it 3). Top ~9.4 bits
at y = 6x + 1 (φ = 13), close to the centre: a beginner-friendly top.

**Degenerate and runaway.** The flat line y = 1 meets the primary; S1 sinks it. None runaway: every component is a
distance.

**Collisions.**
- *Prime Gradient*, a tight squeeze: m prime and m + 1 prime forces m = 2 (triangles): y = 2x + 1 is Prime Gradient's top
  and Matchstick [8, 8, 8, 3] (21 is not prime). Pitch: "triangles are the only shape we both love".
- *Prime Run* (primes among terms 1..6), cooperation: y = 6x + 1 has terms 7, 13, 19, 25, 31, 37, five primes, and is
  Matchstick's top. Two players can defend one line.

### 6. Shopping Baskets

**Story and representation.** Apples cost A pence, bananas B pence, and you have C pence to spend exactly: A·x + B·y = C.
Drawn in the general form `gen` (a, b, c₀ with c₀ = −C) and the pegboard `peg` (whole-number baskets are lattice
points). Gate: A > 0 and C > 0 (b > 0 by the sign rule): prices and budget positive, else WORST.

**Primary.** *"You can spend all your money on whole apples and whole bananas, at least one of each."* P = 1 if some
x, y ≥ 1 are integers on the line, else 0.

**Secondaries.**
1. **S1, both prices are prime**: rung(dPrime(A) + dPrime(B)). Lens: `gen.a`, `gen.b` as prices.
2. **S2, there is a basket with as many apples as bananas**: rung(dZ(C/(A + B))). Rarer: it needs A + B to divide C.
   Lens: the diagonal x = y on the pegboard.
3. **S3, the number of baskets**: the count of positive whole solutions, uncapped but small (it is about C/(A·B)).
   Lens: the pegs on the line in the first quadrant.

**Example, good.** 2x + 3y = 25 (y = −2/3x + 25/3, φ = 21). Baskets exist: P = 1. 2 and 3 prime: S1 = 8. 25/5 = 5: S2 = 8.
Baskets (2, 7), (5, 5), (8, 3), (11, 1): S3 = 4. Score [1, 8, 8, 4].

**Example, bad.** x + y = 5 (y = −x + 5, φ = 13): P = 1; 1 is not prime, 1 + 1: S1 = 3; 5/2: S2 = 5; four baskets:
S3 = 4. Score [1, 3, 5, 4]. And 2x + 3y = 1 has no basket: [0, 8, 6, 0].

**Card.** The pegboard's first quadrant with the line and its whole-number baskets filled; the equation as a till
receipt "2p × apples + 3p × bananas = 25p"; prices with "prime ✓"; the diagonal x = y faint, with the equal basket
(5, 5) ringed.

**Teaches.** Linear Diophantine equations without the name: whole solutions exist only when gcd(A, B) divides C, they
step along the line by (B, −A); intercepts as "all apples" and "all bananas".

**Centre.** Primary ~5.9 bits (x + y = 3 is the cheapest). The best tuple in the box, [1, 8, 8, 2] at 2x + 3y = 15,
is ~15.5 bits. The first draft put the basket count first and was topped by x + y = 12 (11 baskets, prices 1): the
count runs away with C on unit prices. Putting prime prices first fixed it.

**Degenerate and runaway.** S3 grows with C; it is last, so it only breaks ties. 93% of the census weight is gated out
(rising lines, negative budgets): the card must explain the gate in words.

**Collisions.**
- *Zero Sum* (a + b + c₀ = 0), cooperation: it is exactly C = A + B, so (1, 1) is a basket and S2 holds. 2x + 3y = 5
  tops Zero Sum and scores Shopping [1, 8, 8, 1].
- *Triangle Area (A = 12)*: 2x + 3y = 12 has area 12²/(2·2·3) = 12 exactly and a basket (3, 2), prime prices, but no
  equal basket (12/5): Shopping [1, 8, 5, 1]. The negotiation is the budget: 15 (equal basket) against 12 (area).

### 7. Fence Painters

**Story and representation.** Ann alone paints the fence in p hours, Ben alone in q hours; if Ann paints for x hours and
Ben for y hours the fence is done when x/p + y/q = 1. Drawn in intercept form `int` (p, q). Gate: p > 0 and q > 0.

**Primary.** *"Working side by side they finish at a whole number of hours."* t = pq/(p + q) (where the line meets
x = y), N = nearest positive integer, P = rung(|t − N|).

**Secondaries.**
1. **S1, each alone takes whole hours**: rung(dZ(p) + dZ(q)). With t whole too, 1/t = 1/p + 1/q is an Egyptian
   fraction split; there are only τ(t²) of them. Lens: the two intercepts.
2. **S2, the painters are different**: 1 if p ≠ q. Rarer: p = q = 2t always works, the other splits need
   (p − t)(q − t) = t². Lens: the intercept triangle's shape (isosceles or not).
3. **S3, together they take a prime number of hours**: rung(dPrime(N)). Lens: the number N.

**Example, good.** x/3 + y/6 = 1 (y = −2x + 6, φ = 15). t = 18/9 = 2: P = 8. p, q whole: S1 = 8. Different: S2 = 1.
2 is prime: S3 = 8. Score [8, 8, 1, 8], the top.

**Example, bad.** y = −3/4x + 5/2 (φ = 21): p = 10/3, q = 5/2, t = 10/7, distance 3/7 from 1: P = 5. dZ sum 5/6: S1 = 4.
Different: S2 = 1. N = 1, dPrime = 1: S3 = 4. Score [5, 4, 1, 4]. y = −x + 4 (p = q = 4) is [8, 8, 0, 8].

**Card.** The intercept triangle with "Ann alone: 3 h" on the x-axis and "Ben alone: 6 h" on the y-axis; the diagonal
x = y meeting the line at (2, 2) labelled "together: 2 h"; the fraction sentence 1/3 + 1/6 = 1/2.

**Teaches.** Intercept form as a work-rate story; harmonic means; unit fractions.

**Centre.** Primary ~7 bits; top ~11.2 bits, first at y = −1/2x + 3 (p = 6, q = 3). Close to the centre: a
beginner family.

**Degenerate and runaway.** Lines through the origin or parallel to an axis are gated (no intercepts). 93% of the
census weight is gated. No runaways.

**Collisions.**
- *Triangle Area (A = 8)*: p = q = 4 gives area 8 and t = 2, but the painters are equal (S2 = 0). The pitch is whether
  the painter player gives up S2 for a partner.
- *Intercept Sum (S = 4, 7, 10)*, conflict: with p + q = S and pq = t(p + q), p and q are the roots of
  z² − Sz + St, which are rational only if S² − 4St is a square. For S = 7 and S = 10 no whole t ≥ 1 gives one (21; 60,
  20), and for S = 4 only t = 1, p = q = 2. So the painter's primary top and Intercept Sum 7 or 10 can never meet: hard
  opponents, worth knowing before agreeing to anything.

### 8. Ladder Against the Wall

**Story and representation.** The piece of line between the two axes is a ladder: its foot on the floor at the
x-intercept, its top on the wall at the y-intercept. Drawn as the intercept triangle `tri` (legX, legY, hyp2). Gate:
m ≠ 0 and c ≠ 0 (a triangle exists).

**Primary.** *"The foot and the top of the ladder are at whole-metre marks."* P = rung(dZ(legX) + dZ(legY)).

**Secondaries.**
1. **S1, the ladder is a whole number of metres long**: rung(dSq(legX² + legY²)) (the length squared is a square
   number). Rarer: Pythagorean triples. Lens: `tri.hyp2`, Pythagoras.
2. **S2, the safety rule (one out for every four up)**: rung(| |m| − 4 |), since legY/legX = |m|. Rarer, and in
   tension with S1: no Pythagorean triple has ratio exactly 4 (the hypotenuse would be legX·√17). The closest small
   ones: (9, 40, 41) misses by 4/9, (16, 63, 65) by 1/16. Lens: the slope as rise over run.
3. **S3, the length has many prime factors**: Ω(L), L the nearest integer length, capped at 6. Lens: number theory of
   the hypotenuse (every primitive hypotenuse is a product of primes of the form 4k + 1, which a curious player can
   discover here).

**Example, good.** y = −40/9x + 40 (φ = 41). Legs 9, 40: P = 8. 81 + 1600 = 1681 = 41²: S1 = 8. |40/9 − 4| = 4/9: S2 = 5.
Ω(41) = 1: S3 = 1. Score [8, 8, 5, 1]. Further out, y = −63/16x + 63 (φ = 45) scores [8, 8, 7, 2].

**Example, bad.** y = −2/5x + 7/3 (φ = 29). Legs 35/6 and 7/3, dZ sum 1/2: P = 5. Length² = 1421/36, dSq = 125/36: S1 = 2.
|2/5 − 4| = 18/5: S2 = 2. L = 6, Ω = 2: S3 = 2. Score [5, 2, 2, 2]. The cheap y = −x + 3 is [8, 3, 2, 2]: whole marks,
but the ladder is √18 long.

**Card.** The triangle with a ladder drawn on the hypotenuse; whole-metre ticks on both axes, the foot and the top
ringed; the length squared as "9² + 40² = 1681 = 41² ✓"; a small "1 in 4" gauge showing the ladder's lean against the
safe one.

**Teaches.** Intercepts, Pythagoras, Pythagorean triples, and a real safety rule as a slope.

**Centre.** Primary ~3.3 bits (y = x + 1). S1 is the jump: the best tuple in the box is 3-4-5 (y = ±4/3x + 4) at
~15.5 bits; S2 then pulls further out (9-40-41, 16-63-65). A family whose ladder climbs very steeply away from the
centre: good for a rich, long game.

**Degenerate and runaway.** S2 can be approached forever by larger triples; it is a distance with a finite ladder, so
it stops at rung 7 (≤ 1/8) for 16-63-65; rung 8 is unreachable (√17 is irrational). The card should say so: a
provably empty top rung is a lesson, not a bug, but calibration must drop it (§4.4 drops empty rungs).

**Collisions.**
- *Triangle Area (A = 6)*, cooperation: the 3-4-5 ladder y = −4/3x + 4 has area 6 exactly. A natural alliance.
- *Prime Gradient*, conflict on S2: Prime Gradient wants m = 3 or 5; the ladder wants |m| near 4 with a Pythagorean
  shape. y = 5x + 5 has legs 1 and 5 (whole, P = 8) but length √26; they meet on the primary and fight on S1.

### 9. Plant Diary

**Story and representation.** A plant's height measured each morning for six days, y(0) to y(5). Drawn as the table of
values `table` (y0 … y5).

**Primary.** *"Count the days on which the plant's height is a whole number of centimetres."* P = the count (0 to 6).

**Secondaries.**
1. **S1, square heights**: the number of different square numbers among the six heights. Rarer, with a famous ceiling:
   no four squares can be equally spaced (Fermat), yet four can hide in six terms: y = 24x + 1 gives 1, 25, 49, 73, 97,
   121 (days 0, 1, 2 and 5). A search over integer m, c < 3000 finds no line with five. Lens: the table read as squares.
2. **S2, doubling days**: the number of pairs of days i < j with y(j) = 2·y(i) > 0. Lens: ratios in the table.
3. **S3, prime heights**: the number of different primes among the six heights. Lens: the table read as primes.

**Example, good.** y = 24x + 1 (φ = 17). Six whole heights: P = 6. Squares 1, 25, 49, 121: S1 = 4. No doubling: S2 = 0.
Primes 73, 97: S3 = 2. Score [6, 4, 0, 2].

**Example, bad.** y = 1/3x + 1/2 (φ = 17): heights 1/2, 5/6, 7/6, 3/2, 11/6, 13/6: score [0, 0, 0, 0]. Middling:
y = 1/2x + 1 has heights 1, 3/2, 2, 5/2, 3, 7/2: [3, 1, 2, 2].

**Card.** The six-column table, whole heights in bold; squares with a small square badge, primes with a "p"; doubling
pairs joined by an arc labelled "×2".

**Teaches.** Tables of values; that the denominator of m decides how many entries are whole; Fermat's theorem on
squares in arithmetic progression as a discovered fact.

**Centre.** Very cheap (primary ~0.6 bits; the census best [6, 3, 2, 3] is y = x itself, 4.5 bits, because 0, 1, 4 are
squares and 2, 3, 5 primes). Only S1 = 4 pulls it out (24x + 1). This family is a good **beginner** rule and a poor
high-value one; dealt alone it tops early.

**Degenerate and runaway.** y = 0 (all heights 0) meets P and one square; flat lines are weak. All counts are bounded
(6), so no runaway.

**Collisions.**
- *Feed Zero Square*, cooperation: a square y-intercept is a square on day 0; y = 24x + 1 is a top for both.
- *Prime Run*, collision inside the same table: squares are never prime, so S1 and Prime Run compete for the same six
  cells. y = x + 1 has three primes (2, 3, 5) and two squares (1, 4): a fair split to propose.

### 10. Speeding Up

**Story and representation.** A car's speed is y = c + m·t metres per second; the distance travelled in the first K
seconds is the area under the speed line (a trapezium): D = cK + mK²/2. Drawn on the plane (`cart`) with the area
shaded. Parameter K ∈ {2, 3, 4} (examples K = 3). Gate: the car moves forwards (c ≥ 0, y(K) ≥ 0, D > 0).

**Primary.** *"In the first K seconds the car travels a whole number of metres."* P = rung(dZ(D)).

**Secondaries.**
1. **S1, the average speed is a whole number**: rung(dZ(D/K)). Rarer by a factor of about K. Lens: the speed at
   half-time, y(K/2), which is the average (the trapezium's midline).
2. **S2, the distance is a triangular number**: rung(dTri(D)). Lens: dots stacked in a triangle.
3. **S3, the car starts from rest**: rung(|c|). Lens: the y-intercept of the speed line.

**Example, good.** y = 2/3x (φ = 11). D = 9·(2/3)/2 = 3: P = 8. Average 1: S1 = 8. 3 is triangular: S2 = 8. From rest:
S3 = 8. Score [8, 8, 8, 8].

**Example, bad.** y = x + 1 (φ = 9). D = 3 + 9/2 = 15/2: P = 5. Average 5/2: S1 = 5. dTri(15/2) = 3/2: S2 = 3. |c| = 1:
S3 = 4. Score [5, 5, 3, 4].

**Card.** The speed line from t = 0 to t = K with the area shaded and labelled "3 m"; the midline at t = K/2 with
"average 1 m/s"; the distance as a triangle of dots.

**Teaches.** Area under a speed–time graph is distance; the trapezium's midline is the average; constant acceleration.

**Centre.** Cheap: primary ~2.9 bits, best tuple ~7.6 bits at y = 2/3x. A **beginner** family whose top sits next to
the centre.

**Degenerate and runaway.** The first draft was topped by y = 0 (a parked car travels 0, a "triangular" 0, from rest);
the gate and the positive-triangular rule fixed it. Very steep lines travel far and do not run away in any component.

**Collisions.**
- *m meets c*, conflict: S3 wants c = 0, so m = c forces m = 0, a parked car (gated). They meet only part-way:
  y = 2x + 2 is m = c and travels 15 m (a triangular number) at an average of 5 m/s: Speeding [8, 8, 8, 3], losing only
  "from rest". A fair middle to propose.
- *Prime Gradient*, partial cooperation: y = 2x (from rest, prime acceleration) travels 9 m with average 3, but 9 is
  not triangular: [8, 8, 4, 8].

### 11. Steady vs Doubling

**Story and representation.** Two pocket-money plans: the steady plan pays y(n) = mn + c in week n; the doubling plan
pays 2ⁿ. Drawn as the table of values for weeks 1 to 8 beside the powers of two, and as a plane with the doubling curve
as dots.

**Primary.** *"In some week from 1 to 8 the steady plan pays exactly what the doubling plan pays."*
P = rung(min over n of |y(n) − 2ⁿ|).

**Secondaries.**
1. **S1, in two different weeks**: rung of the second-smallest |y(n) − 2ⁿ|. Rarer: the line must be a chord of the
   doubling curve. Lens: the plane, the line through two dots.
2. **S2, a whole-pound raise**: rung(dZ(m)). The chord through weeks a and b has m = 2ᵃ(2^(b−a) − 1)/(b − a), whole only
   when b − a divides it (gaps 1, 2, 4, 6 work; 3, 5, 7 never do, since 7, 31, 127 are not divisible by 3, 5, 7).
   Lens: `si.m`, divisibility.
3. **S3, the weeks the steady plan pays more**: the count of n in 1..8 with y(n) > 2ⁿ. Because doubling curves upward,
   a straight line can only be above it *between* its two meeting weeks: S3 = b − a − 1 for a chord. Lens: convexity.

**Example, good.** y = 42x − 80 (φ = 31): meets the doubling plan in weeks 2 (4) and 8 (256): P = 8, S1 = 8; m = 42:
S2 = 8; above in weeks 3 to 7: S3 = 5. Score [8, 8, 8, 5]: the top (gap 6 is the largest gap with a whole raise; gap 7,
weeks 1 and 8, needs m = 254/7).

**Example, bad.** y = 1/2x + 7 (φ = 17): nearest gap 1/2 (week 3: 8.5 against 8): P = 5; second gap 4 (week 2: 8 against
4): S1 = 2; dZ(1/2): S2 = 5; above in weeks 1, 2, 3: S3 = 3. Score [5, 2, 5, 3]. The cheap y = 2x (weeks 1 and 2) is
[8, 8, 8, 0].

**Card.** Weeks 1–8 in a two-row table (steady, doubling), equal cells joined; on the plane the doubling dots and the
line, the stretch where the line is above shaded, with "a line can only be above between the two meetings".

**Teaches.** Linear against exponential growth; chords of a convex curve; divisibility of 2ᵏ − 1.

**Centre.** Primary ~4.2 bits (y = 2x). Best tuple in the box [8, 8, 8, 1] at y = 3x − 1 (~8.5 bits); the true top
y = 42x − 80 is far out, and the ladder S3 = 0, 1, ..., 5 marks the climb.

**Degenerate and runaway.** S3 is bounded by 5 (with a whole raise). Lines above the curve everywhere in 1..8 have
S3 up to 8 but miss the primary; the primary comes first, so they do not dominate.

**Collisions.**
- *Prime Gradient*, cooperation at the cheap end: y = 2x (weeks 1 and 2) has a prime gradient; the doubling player
  gives up S3 for a partner.
- *Treasure (4, 5)* and other value-at-a-point rules, conflict: a chord through (2, 4) and (8, 256) passes (4, 88). The
  negotiation is how far out the doubling player is willing to defend.

### 12. Wheelchair Ramp

**Story and representation.** A ramp's steepness is written "1 in n": it rises 1 for every n along (building rules ask
for 1 in 12 or gentler). Drawn on the plane (`cart`) with the slope triangle. Gate: m ≠ 0.

**Primary.** *"The ramp rises 1 for every whole number of steps along."* n = 1/|m|, N = nearest positive integer,
P = rung(|n − N|).

**Secondaries.**
1. **S1, gentle enough**: rung(max(0, 12 − n)). Rarer: |m| ≤ 1/12 is a thin wedge. Lens: the slope triangle.
2. **S2, the ramp starts at a whole-metre mark on the floor**: rung(dZ(x-intercept)). Lens: `cart.xInt`.
3. **S3, the run can be cut into equal whole planks in many ways**: τ(N), capped at 12. Lens: divisors of N.

**Example, good.** y = 1/12x − 1/2 (φ = 19): n = 12: P = 8; gentle: S1 = 8; starts at x = 6: S2 = 8; τ(12) = 6: S3 = 6.
Score [8, 8, 8, 6]. y = 1/60x − 1 (φ = 29) reaches the capped top [8, 8, 8, 12].

**Example, bad.** y = 3x + 1 (φ = 11): n = 1/3, N = 1, distance 2/3: P = 4; 12 − 1/3 = 35/3: S1 = 0; starts at −1/3:
S2 = 5; τ(1) = 1: S3 = 1. Score [4, 0, 5, 1].

**Card.** The line with a slope triangle "1 up, 12 along"; a wheelchair icon if gentle enough; `cart.xAxisMark` at the
nearest whole metre to the ramp's start; the run's divisors as plank lengths.

**Teaches.** Gradient as a fraction, its reciprocal as "1 in n"; that steep and gentle are |m| > 1 and |m| < 1.

**Centre.** Primary ~1.6 bits (y = x is "1 in 1"). S1 is the climb: the best tuple in the box (~8.6 bits) is y = 1/12x;
the cap pulls the top out to 1 in 60.

**Degenerate and runaway.** n grows without bound as m → 0; S3 is capped; S1 is satisfied by any n ≥ 12, so very gentle
ramps are not rewarded beyond it.

**Collisions.**
- *Triangle Area (A = 6)*, cooperation: y = 1/12x − 1 starts at 12 and has legs 12 and 1, area 6 exactly
  (ramp [8, 8, 8, 6]).
- *Prime Gradient*, total conflict: prime gradients are ≥ 2, ramps want ≤ 1/12. A good test of whether players see
  that some pairs can only fight.

### 13. Orchard Walk

**Story and representation.** An orchard has a tree at every whole-number point of the 13 × 13 square [−6, 6]²; your
path is the line. Drawn as the pegboard `peg`. Gate: m ≠ 0 ("a path along a row is a road, not a walk").

**Primary.** *"Somewhere between x = −6 and 6 the path goes straight through a tree."* P = rung(min over whole x in
−6..6 of dZ(y(x))).

**Secondaries.**
1. **S1, the trees on the path are a whole number of metres apart**: with m = p/q in lowest terms, consecutive trees
   on the path are √(p² + q²) apart; S1 = rung(dSq(p² + q²)). Rarer: Pythagorean slopes 3/4, 4/3, 5/12, ... only.
   Lens: the step between pegs.
2. **S2, how many trees the path passes**: the count of pegs on the line (spec's `peg.pegs`). Lens: the pegboard.
3. **S3, the path enters and leaves along the axis roads at trees**: rung(dZ(c) + dZ(x-intercept)). Lens: `cart`.

**Example, good.** y = 3/4x (φ = 13): passes trees: P = 8; 3² + 4² = 25 = 5²: S1 = 8; trees (−4, −3), (0, 0), (4, 3):
S2 = 3; both intercepts 0: S3 = 8. Score [8, 8, 3, 8]. In the box, y = 4/3x + 2 does slightly better: [8, 8, 4, 5].

**Example, bad.** y = 2/7x + 1/3 (φ = 25): nearest miss 1/21: P = 7; 4 + 49 = 53, dSq = 4: S1 = 2; no trees: S2 = 0;
dZ(1/3) + dZ(−7/6): S3 = 5. Score [7, 2, 0, 5]. y = x passes 13 trees but √2 apart: [8, 4, 13, 8].

**Card.** The pegboard, trees on the path filled; the step between two neighbouring trees drawn as a right triangle
"3 across, 4 up, 5 apart"; the nearest miss when there is none.

**Teaches.** Lattice points on a line, the step (q, p) between them, Pythagorean slopes.

**Centre.** Primary ~0.9 bits (almost free). S1 is the climb: best tuple ~13.5 bits at y = 4/3x + 2. The first draft
was topped by y = 0 (13 trees along a row); the gate fixed it.

**Degenerate and runaway.** None beyond the gate. S2 is bounded by 13.

**Collisions.**
- *Peg Count (n = 3)*, cooperation: y = 3/4x passes exactly 3 pegs.
- *Prime Gradient*, impossible together: a whole prime m gives q = 1 and p² + 1 is never a square. They can only
  share the primary.

### 14. Savings Goal

**Story and representation.** You start with c pounds and save m pounds a week; your goal is T pounds. Drawn as the
growth pattern `seq` and the table. Parameter T ∈ {50, 100, 120} (examples T = 100). Gate: m ≠ 0.

**Primary.** *"You reach exactly £T after a whole number of weeks."* W = (T − c)/m, N = nearest positive integer,
P = rung(|W − N|).

**Secondaries.**
1. **S1, you save one real coin a week**: rung(distance from 100·m to the nearest coin in pence: 1, 2, 5, 10, 20, 50,
   100, 200). Lens: `seq.step` as a coin.
2. **S2, the goal lands at the end of a four-week month**: rung(dZ(N/4)). Lens: the week count's divisibility.
3. **S3, you started with one real coin**: rung(distance from 100·c to the nearest coin in pence). Rarer: with S1 and
   S2, T − c must be a multiple of 4m. Lens: `seq.zeroth`.

**Example, good.** y = 1/2x + 2 (φ = 15): W = 98/(1/2) = 196: P = 8; 50p: S1 = 8; 196 = 4 × 49: S2 = 8; a £2 coin: S3 = 8.
Score [8, 8, 8, 8], the top, and the only line in the census box that reaches it.

**Example, bad.** y = 3x + 1/3 (φ = 17): W = 299/9, distance 2/9: P = 6; £3 is 100p from a £2 coin: S1 = 0; N = 33:
S2 = 6; 33⅓p is 40/3 from 20p: S3 = 0. Score [6, 0, 6, 0]. The cheap y = x (start with nothing) is [8, 8, 8, 4]: "nothing"
is 1p from a coin, so the top needs a real starting coin.

**Card.** The savings table with the goal row highlighted; the weekly coin drawn; the goal week on a calendar of
four-week months; the starting coin.

**Teaches.** Solving mx + c = T for x; divisibility (T − c by 4m); money units.

**Centre.** Primary ~2.4 bits; top ~12.5 bits at y = 1/2x + 2, a short line that is rare: a good shape (a cheap line
that only the right argument finds).

**Degenerate and runaway.** None: every component is a distance.

**Collisions.**
- *Y-intercept Prime*, cooperation: the top y = 1/2x + 2 has a prime y-intercept. A natural partner.
- *Prime Gradient*: y = 2x + 4 has a prime weekly saving, reaches 100 in 48 weeks (12 months) but starts with £4, not
  a coin ([8, 8, 8, 0]). With m = 2, S3 needs 100 − c ≡ 0 (mod 8) for a coin c: none of 1p … £2 works. A provable
  conflict to negotiate around.

### 15. Mental Shortcut

**Story and representation.** People convert Celsius to Fahrenheit in their heads with shortcuts like "double it and
add 30". Your line is a shortcut; the true conversion is y = 9/5x + 32. Drawn on the plane with the true line as a ghost
and the error band from 0 °C to 30 °C. Parameter: the reference conversion (Celsius to Fahrenheit by default; miles to
kilometres, y = 8/5x, is a near-centre variant).

**Primary.** *"Between 0 °C and 30 °C your shortcut is never more than a few degrees out."* E = max(|y(0) − 32|,
|y(30) − 86|) (the error of a straight line is largest at an end), P = rung(E) on the **wide** ladder
`32, 16, 8, 4, 2, 1, 1/2, 0`.

**Secondaries.**
1. **S1, easy to multiply in your head**: rung(dZ(2m)) (m whole or a half). Lens: `mach.times`.
2. **S2, add a round ten**: rung(dZ(c/10)). Lens: `mach.plus`.
3. **S3, exactly right at some whole temperature in the range**: rung of the distance from the crossing with the true
   line, (32 − c)/(m − 9/5), to the whole numbers 0..30. Lens: the plane, where your line crosses the ghost.

**Example, good.** y = 2x + 30 (φ = 19): errors −2 at 0 °C and +4 at 30 °C, E = 4: P = 4; m = 2: S1 = 8; c = 30: S2 = 8;
crosses the true line at 10 °C: S3 = 8. Score [4, 8, 8, 8]. The true line y = 9/5x + 32 (φ = 33) scores [8, 5, 6, 8]:
perfect but hard to do in your head.

**Example, bad.** y = x + 50 (φ = 19): E = 18: P = 1; S1 = 8; S2 = 8; crosses at 22.5 °C: S3 = 5. Score [1, 8, 8, 5].

**Card.** The plane from 0 to 30 °C with the true line ghosted, your line, and the gap between them shaded with the
largest gap labelled; the crossing point; your shortcut written as words ("double, add 30").

**Teaches.** Approximation and its worst-case error; a trade-off between accuracy and simplicity; that the worst error
of a line against a line is at an end of the range.

**Centre.** This family lives *far* from the centre: in the census box (|c| ≤ 16) the best primary is rung 2, at
~16.5 bits. It is the brainstorm's example of a **far target**, and it shows the cost: near the centre the primary is
flat (rung 0) and the walk gives no gradient. Deal it with the miles-to-kilometres reference on small rooms.

**Degenerate and runaway.** None: the error is bounded below by 0 and the secondaries are distances.

**Collisions.**
- *Y-intercept Prime*, cooperation: for m = 2 the best whole c is 29 (errors −3 and +3, E = 3), and 29 is prime.
  y = 2x + 29 scores [4, 8, 7, 8]. A lovely find to pitch: "the most accurate doubling shortcut has a prime".
- *Prime Gradient*: m = 2 is prime, so the shortcut player and the Prime Gradient player agree; only the far c is
  at stake.

### 16. Price per Minute

**Story and representation.** A phone plan charges a connection fee c pence and m pence a minute. The average price per
minute of a K-minute call is y(K)/K, the slope of the line from the origin to the point (K, y(K)). Drawn on the plane
with that chord. Parameter K ∈ {5, 10, 30} (examples K = 10). Gate: m > 0 and c ≥ 0.

**Primary.** *"On a K-minute call the average price per minute is a whole number of pence."* P = rung(dZ(y(K)/K)).

**Secondaries.**
1. **S1, the plan has a connection fee**: 1 if c > 0 (then longer calls are better value). Lens: the y-intercept.
2. **S2, the average is whole on a call twice as long too**: rung(dZ(y(2K)/(2K))). With S1 and P met this needs 2K to
   divide c. Lens: a second chord.
3. **S3, whole averages for calls of 1 to 10 minutes**: the count of x in 1..10 with y(x)/x whole (with m whole, the
   divisors of c among 1..10). Lens: the table of averages.

**Example, good.** y = 3x + 20 (φ = 19): average at 10 minutes 50/10 = 5: P = 8; a fee: S1 = 1; at 20 minutes 80/20 = 4:
S2 = 8; whole at 1, 2, 4, 5, 10: S3 = 5. Score [8, 1, 8, 5].

**Example, bad.** y = 1/3x + 7/2 (φ = 23): 23/6 at 10 minutes, distance 19/60: P = 5; fee: S1 = 1; distance 59/120:
S2 = 5; none whole: S3 = 0. Score [5, 1, 5, 0]. The fee-less y = 2x is [8, 0, 8, 10].

**Card.** The plane with the chord from the origin to (K, y(K)) and its slope "5p a minute"; the second chord to 2K;
a little table of averages for 1–10 minutes with the whole ones bold.

**Teaches.** Average rate as the slope of a chord from the origin, against the marginal rate m; why a fee makes long
calls cheaper per minute.

**Centre.** Primary ~3.6 bits; S2 is the climb (~18 bits in the box, because 20 | c needs |c| ≥ 20 for m whole). One of
the steepest ladders here.

**Degenerate and runaway.** S3 rewards c with many small divisors: bounded by 10.

**Collisions.**
- *Taxi Meter* (with K = 10), cooperation: both read y(10); a whole fare that divides by 10 serves both.
- *m meets c*: y = 10x + 10 averages 11 at 10 minutes and has whole averages at 1, 2, 5, 10 (Price [8, 1, 5, 4]);
  the price player wants a fee divisible by 20 instead, and the two must choose.

---

## 2. Summary table

Census rarities are the crude −log₂ weight shares of §0, not calibrated values.

| # | Family | Representation of the primary | Primary top (bits) | Best tuple in the box (bits) | Cheapest top line | Bites on Z? | Kind |
|---|---|---|---|---|---|---|---|
| 1 | Empty Tank | cart.xInt | 4.6 | 12.5 | y = −x + 1 | yes (T = c/\|m\|) | climbing |
| 2 | Taxi Meter | table y(K) | 0.5 | 10.3 | y = 0 | only S2 | owner-shape (cheap P) |
| 3 | Catch-Up | cart, ghost line | 5.7 | 16.5 | y = 3x + 1 | yes | climbing |
| 4 | Same Reading | mach, fixed point | 2.9 | 15.5 | y = 3x | yes | climbing |
| 5 | Matchstick Chains | seq | 3.5 | 9.4 | y = 1 | yes | beginner top near centre |
| 6 | Shopping Baskets | gen, peg | 5.9 | 15.5 | x + y = 3 | prices B = 1 only | climbing, gated |
| 7 | Fence Painters | int | 7.0 | 11.2 | y = −x + 2 | yes | beginner |
| 8 | Ladder Against the Wall | tri | 3.3 | 15.5 | y = x + 1 | S1 yes | steep climb |
| 9 | Plant Diary | table | 0.6 | 4.5 | y = 0 | S1 yes | beginner only |
| 10 | Speeding Up | cart area | 2.9 | 7.6 | y = 1 | partly | beginner |
| 11 | Steady vs Doubling | table vs 2ⁿ | 4.2 | 8.5 (top far out) | y = 2x | yes | climbing |
| 12 | Wheelchair Ramp | cart slope | 1.6 | 8.6 | y = x | no (needs \|m\| < 1) | Q only |
| 13 | Orchard Walk | peg | 0.9 | 13.5 | y = x | S1 no | climbing |
| 14 | Savings Goal | seq | 2.4 | 12.5 | y = x | partly | rare short line |
| 15 | Mental Shortcut | cart vs ghost | — | 16.5 (rung 2 only) | y = 2x + 16 | yes | far target |
| 16 | Price per Minute | cart chord | 3.6 | 18.1 | y = x | yes | steep climb |

## 3. What the census changed

- **Flat lines topped two families.** Speeding Up (a parked car travels 0 m, "triangular", from rest) and Orchard Walk
  (13 trees along a row) were both topped by y = 0. Story gates ("the car moves forwards", "a path along a row is a
  road") fixed them. Lesson for every family: check the horizontal line and the line y = 0 first.
- **A count ran away on unit prices.** Shopping Baskets with the basket count as its primary was topped by x + y = 12.
  Counts that grow with a coefficient belong last in the tuple.
- **Same Reading was topped by horizontal lines** (y = −8 "agrees" at −8 with the simplest fraction). The gate m > 0
  fixed it.
- **Units matter.** Savings Goal measured coins in pounds, so "start with nothing" was 1p from a coin and the cheapest
  line nearly topped it; measuring in pence fixed it.
- **A far target is flat at the centre.** Mental Shortcut's primary is rung 0 on every line with |c| ≤ 16 even on the
  wide ladder. Far targets need wide ladders and a near-centre parameter.

## 4. My top eight

1. **Matchstick Chains** (primary: *"before any shapes are built there is exactly one stick"*, |c − 1|). Every component
   is exact and visual; the top (6x + 1, 4x + 1, 10x + 1) is near the centre but needs three separate prime facts to
   line up; the textbook squares pattern fails on "4 is not prime", which is a lovely surprise for a child.
2. **Steady vs Doubling** (primary: *"in some week the steady plan pays exactly what the doubling plan pays"*). It
   teaches linear against exponential growth and convexity, the secondaries are a real divisibility puzzle (gaps 3, 5, 7
   never give a whole raise), and the top y = 42x − 80 is far out with a clear ladder to it.
3. **Shopping Baskets** (primary: *"you can spend all your money on whole apples and bananas, at least one of each"*).
   The only family here that lives in the general form; it teaches linear Diophantine equations without the name and
   pairs naturally with Zero Sum and Triangle Area.
4. **Same Reading** (primary: *"there is a temperature where both thermometers show the same number, and it is whole"*).
   A fixed-point lens nobody else will find, a famous fact (−40), and a built-in argument: the real conversion is worse
   than "double and add 40" on S2.
5. **Ladder Against the Wall** (primary: *"the foot and the top of the ladder are at whole-metre marks"*). Pythagoras plus
   a real safety rule whose exact top is provably empty (√17): a steep, long ladder with a story and an
   allied classic (Triangle Area 6 on the 3-4-5 ladder).
6. **Savings Goal** (primary: *"you reach exactly £T after a whole number of weeks"*). A short line (y = 1/2x + 2) that is
   rare: exactly the shape that rewards an agent for finding the right argument, not for walking far.
7. **Empty Tank** (primary: *"the tank is empty at a whole number of minutes"*). The owner's own ladder shape (a whole
   number, then its smallest prime factor) told as a story, with the elegant top y = −p·x + p².
8. **Price per Minute** (primary: *"on a K-minute call the average price per minute is a whole number of pence"*). The
   chord-from-the-origin lens (average against marginal rate) is new to the line family and its ladder is the steepest
   measured here.

Runners-up: Fence Painters and Speeding Up as beginner families (tops near the centre), Catch-Up for its two-line
story, Orchard Walk for Pythagorean slopes. Plant Diary is charming (Fermat's four squares) but tops too cheaply on its
own; I would deal it only as a beginner rule.
