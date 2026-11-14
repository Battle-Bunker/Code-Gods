# Layered rule families D: number-theoretic depth and reach (14 November 2026)

Status: brainstorm, documentation only. Nothing in the engine changes. Sixteen layered rule families for the line object
of engine v2 ([spec](../spec.md) §12), each a lexicographic ladder: a primary a twelve-year-old can check by eye, then
secondaries that ask for rarer structure. The slant of this document is reach and proof: where each rung's optimum
lives, how many lines reach it, and how many bits it is worth.

Every number below is printed by [`scripts/d_number_theory_ladders.py`](scripts/d_number_theory_ladders.py) (standard
library only, deterministic, about three minutes); its full output is committed beside it as
[`scripts/d_number_theory_ladders.out.txt`](scripts/d_number_theory_ladders.out.txt).

## 0. The result on one page

- **Layered ladders on one line reach 40 to 80 bits under the default height cap of 10^6**, against the 2 to 5 bits of
  the one-condition rules measured in #347. Eleven of the sixteen families pass 48 bits; for six the law of the bits per
  rung is proved.
- **The mechanism is the owner's principle, made exact** (§1.2): a rung is worth the read length of the cheapest line
  that reaches it, less the logarithm of how many lines are about that cheap. So a ladder is deep exactly when its
  upper rungs force large coefficients, and energy and utility rise together by construction.
- **A tie-break earns bits only if it is cheaper than the next step of the component before it** (§1.3). Three of the
  sixteen families have tie-breaks that are correct, pretty and worth nothing, and the script shows which.
- **The recipe that works** (§5): a cheap whole-number gate, then a multiplicative sieve (prime, coprime, square-free),
  then "larger" as the last component, on an integer that the line is forced to write out in full.
- **Top eight** (§4): Coin Line, Rectangle Field, Parabola Chord, Pythagoras' Corner, Divisibility Ladder, Root Hunter,
  Euclid's Staircase, Prime Parade.

## 1. Conventions, and three facts used throughout

### 1.1 The law

- A line is the primitive integer triple (a, b, c) of a·x + b·y + c = 0, b > 0 (or b = 0, a > 0). Its **read length** is
  φ = int(a) + int(b) + int(c) with the spec's code (§2.3): int(0) = 1 bit, int(±1) = 3, and in general
  int(n) = 2⌊log2(2|n|)⌋ + 1 for n ≠ 0, the same for n and −n.
- The reference law is π(line) = 2^−φ / Z: the resting law of the priced walk when the price list passes the cycle
  test (scoring-by-perturbation §1.5). The spec's price list is deliberately not exactly reversible, so the calibrated
  values will differ from these by the size of its currents (a quarter of a bit on the 325-line board). Z = 0.284
  (measured: the box |a|, |b|, |c| ≤ 64 holds 890,208 lines and all but 0.03 bits of the mass). **A line holds 8.1 bits**
  (the entropy of π).
- **The weight of an integer.** 1/(8n²) ≤ 2^−int(n) < 1/(2n²): doubling a coefficient costs two bits, and the chance
  that a coefficient is at least N in size is 2^−⌊log2 N⌋−1, about 1/(2N).
- A family's **score** is a tuple compared lexicographically, bigger is better (a distance enters with a minus sign);
  no score is WORST. A **rung** is a threshold tuple; a line's level is the number of thresholds its score meets. The
  **value** of a rung is V = −log2 π{score ≥ threshold} (spec §7.1). E(line) = φ + log2 Z = φ − 1.82 is its energy.
- "Height at most H" means |a|, |b|, |c| ≤ H. There are (2H + 1)³ / (2ζ(3)) ≈ 3.33 H³ such lines and (2H + 1)² ≈ 4H² of
  them are **whole lines** (b = 1: y = mx + c with whole m and c). Under π a line is whole with probability 0.43
  (1.2 bits).

### 1.2 Fact 1: a rung is worth its cheapest line, less its multiplicity

For any rung, V ≤ E(cheapest line of the rung), because the upper set contains that line. In the other direction the
mass of all lines of height ≥ H is about 3/(2H), and lines that share a rung at height H are far fewer than H³, so the
mass of a rung is carried by the lines within a few bits of its cheapest:

```
V(rung) = E(cheapest line) − log2(number of lines of the rung about that cheap) + O(1).
```

The script reports this gap for every family (0.4 bits for Prime Parade, where the cheapest line is alone; 6 bits for
Rectangle Field, where a highly composite area has 2^ω coprime splittings and the next areas up are close behind).
This is the owner's principle as a formula: **a rung is deep when, and only when, reaching it forces big numbers.**
It also gives the exchange rate for "larger is better": if a rung asks an integer n ≥ T and the line must write n in k
of its coefficients, the rung costs 2k·log2 T bits less the logarithm of the count of admissible n near T. Measured:
2.9 bits per doubling for Divisibility Ladder (k = 1 and a dense set), 3.2 for Coin Line, 3.3 for Parabola Chord, 6.0
for Pythagoras' Corner (k = 3: both legs and their product).

### 1.3 Fact 2: when a tie-break is worth bits

Lexicographic order always uses a tie-break to compare two lines. But a rung's *value* is the rarity of its upper set,
and the upper set of "primary = p and secondary ≥ s" contains every line with primary > p. So:

> A secondary rung adds value only if its cheapest line is cheaper than the cheapest line of the next primary step.

Three consequences shaped the ladders below.

1. A primary with an unbounded cheap climb (more matching digits, a longer staircase) starves its secondaries: Root
   Hunter's "the y-intercept is the neighbouring Pell fraction" needs a line of 43 bits when the next primary digit needs
   one of 27. The script marks such rungs with a step of 0.00.
2. A primary that is a gate (a count that tops out, a condition met exactly) hands its whole upper range to the
   secondaries. All the smooth, deep ladders here are of that kind.
3. A continuous component kills everything after it (ties have probability zero), so discrete components go first and
   "larger" or "closer" goes last.

### 1.4 Fact 3: how the confining prices meet the ladders

A call that moves a line to a state with a longer read pays the growth as a surcharge (spec §5.2). So the price of
climbing from rung i to rung i + 1 is at least E(cheapest of i + 1) − E(current line), and coming back down is nearly
free. In every family the column "E(cheapest)" rises with the rung; that column is the least a builder must spend in
surcharges to stand on the rung, and V is what standing there is worth. The ratio dV/dE over the upper half of each
ladder is between 0.7 and 1.0 (printed by the script): value keeps pace with price.

### 1.5 How to read the tables

`V` is bits; `src` says how the mass was obtained. **B**: the box H = 64. **E**: an exact enumeration of the rung to a
much larger height, in most families every line of the rung under the cap 10^6. **S**: the exact marginal weight of
every gradient p/q with p, q ≤ 2000, for rungs that read only the gradient. **C+S**: the same plus an enumeration of
the rungs that also read c. **W**: beyond every enumeration; the witness line proves V ≤ E, and V is extrapolated along
the family's measured line of V against E. "Cheapest" is the cheapest line at or above the rung. Tables list the rungs
that are worth something; the output file has all.

## 2. The sixteen families

### 1. Prime Parade

- **Primary representation**: sequence (`seq`); also table.
- **Card**: "Read the pattern from term 0: how many different primes come in a row before the first non-prime?"
- **Primary**: R = the largest r with y(0), y(1), …, y(r − 1) distinct primes (primes are positive whole numbers).
- **Secondaries**: (S1) B = the number of terms y(−1), y(−2), … that are prime once the minus sign is dropped, counted
  until the first failure; (S2) the number of the R primes that have a twin (p ± 2 prime); (S3) 1 if the sum of the R
  primes is prime.
- **Example**: y = 30x + 7 gives 7, 37, 67, 97, 127, 157 (then 187 = 11·17), so R = 6; backwards −23, −53, −83, −113
  (then −143 = −11·13), so B = 4; one twin (7); the sum 492 is not prime. Score (6, 4, 1, 0), 19.2 bits.

| R ≥ | 1 | 2 | 3 | 4 | 5 | 5, B ≥ 2 | 6 | 7 | 7, B ≥ 2 | 8 | 10 | 11 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 4.7 | 7.5 | 10.2 | 14.0 | 14.7 | 16.8 | 19.0 | 25.1 | 30.9 | 34.6 | 35.2 | 60.3 | 61.2 |
| cheapest | y = 3 | x + 2 | 2x + 3 | 6x + 5 | 6x + 5 | 12x + 5 | 30x + 7 | 150x + 7 | 210x + 47 | 210x + 199 | 210x + 199 | 60060x + 4943 | 60060x + 4943 |

**Analysis.**
- *Where the optimum lives.* For every prime p ≤ R, either p divides m or p is itself one of the first p terms (the
  first p terms cover every residue modulo p). So a long parade has m divisible by 2·3·5·7·…, and the exceptions are
  the parades that start at a small prime (3, 5, 7; 5, 11, 17, 23, 29; 7 + 30n; 7 + 150n).
- *Count.* The whole lines of height ≤ H with R ≥ k number c_k·H²/(log H)^k (1 + o(1)) for every k (Green, Tao and
  Ziegler's asymptotic for linear forms in primes; k = 2 is the prime number theorem), so a share ≍ 1/(H·(log H)^k) of
  all lines.
- *Bits.* By Fact 1, V_k = 2·log2 m_k + 2·log2 c_k + O(1) with m_k ≥ the product of the primes below k, which is
  e^(k(1+o(1))): at least 2.89 bits per term in the long run, 4.3 per live rung measured.
- *Top.* Unbounded over all lines (Green–Tao), bounded on each line (R ≤ c, since y(c) = c(m + 1)). Under the cap 10^6
  the top is R = 13 (4943 + 60060n, four lines, enumerated). There is a 25-bit cliff from 10 to 11 terms: 199 + 210n
  is a lucky cheap ten, and eleven needs 2310 | m.
- *Prices.* Each rung needs a longer gradient: energy and utility rise together, with a gap of 0.4 bits (the cheapest
  line is nearly alone).
- **A junior learns**: primes in arithmetic progression, why the step must be a multiple of 6, then 30, then 210.
- **Degenerate**: a horizontal line y = 7 is one prime, not infinitely many (distinct primes are counted). Negative
  gradients run downhill into non-primes quickly, which is why S1 reads backwards with the sign dropped.

### 2. Square Steps

- **Primary representation**: table (extended to thirteen columns); also sequence.
- **Card**: "How many of the first thirteen terms, y(0) to y(12), are square numbers?"
- **Primary**: Q = #{n ∈ 0..12 : y(n) is the square of a whole number}, distinct values counted once.
- **Secondaries**: (S1) 1 if three of them sit in consecutive columns; (S2) the number of the squares whose root is
  prime; (S3) 1 if the squares have no common factor.
- **Example**: y = 24x + 1 gives 1, 25, 49 at n = 0, 1, 2, then 121, 169, 289 at n = 5, 7, 12: Q = 6, three in a row,
  five prime roots (5, 7, 11, 13, 17), coprime. Score (6, 1, 5, 1), the top, 15.2 bits.

| Q ≥ | 1 | 2 | 3 | 4 | 5 | 5 with three in a row | 6 |
|---|---|---|---|---|---|---|---|
| V | 1.2 | 2.7 | 3.4 | 4.5 | 12.7 | 15.2 | 15.2 |
| cheapest | y = 0 | y = x | y = x | y = x | 8x + 1 | 24x + 1 | 24x + 1 |

**Analysis.**
- *Structure (proved).* No four squares are in arithmetic progression (Fermat; Euler's proof), so "three in a row" is
  the most consecutive squares a line can show, and the triples are 2-parameter: (u² − 2uv − v²)², (u² + v²)²,
  (u² + 2uv − v²)², with step 4uv(u² − v²), always a multiple of 24.
- *Count.* Whole lines of height ≤ H that show three consecutive squares number ≍ √H (the region
  uv(u² − v²) ≤ H/4 has area ≍ √H), a share ≍ H^(−5/2) of all lines.
- *Top.* Bounded: 6. Rudin's conjecture says 24n + 1 holds the most squares of any progression of N ≥ 6 terms; as I
  recall it is proved for N ≤ 52 (González-Jiménez and Xarles, 2014). The script finds nothing above 6 among whole lines
  of height ≤ 1000.
- *Prices.* The top is one cheap line (17 bits to read); the ladder is short and has an 8-bit cliff at five squares.
- **A junior learns**: odd squares are 8·(a triangular number) + 1, so y = 8x + 1 catches five; the differences of
  squares.
- **Degenerate**: y = x reaches Q = 4 for five bits (0, 1, 4, 9), which is why the ladder only starts to cost at 5.
  **Verdict**: deep theorems, shallow ladder (Fact 2: every tie-break is already held by the cheapest top line).

### 3. Rectangle Field

- **Primary representation**: intercept triangle (`tri`), drawn as the rectangle on the two legs; also `int`.
- **Card**: "The line cuts the axes at two points. Both distances from the origin should be whole numbers."
- **Primary**: W = the number of legs (|x-intercept|, |y-intercept|) that are whole numbers: 0, 1 or 2.
- **Secondaries**, with whole legs X and Y: (S1) 1 if gcd(X, Y) = 1 (the sloping side passes through no other peg);
  (S2) τ(X·Y), the number of divisors of the rectangle's area ("how many whole-number rectangles have this area");
  (S3) −|X − Y| (the squarest such field).
- **Example**: x/8 + y/15 = 1, that is 15x + 8y = 120: both legs whole, coprime, area 120 with 16 divisors, |X − Y| = 7.
  Score (2, 1, 16, −7), 25.3 bits.

| rung | one leg | both | coprime | τ ≥ 4 | 8 | 16 | 32 | 64 | 128 | 240 |
|---|---|---|---|---|---|---|---|---|---|---|
| V | 2.6 | 3.9 | 4.8 | 10.8 | 17.2 | 25.3 | 35.5 | 47.1 | 59.8 | 72.6 |
| cheapest area X·Y | 1 | 1 | 1 | 6 | 30 | 120 | 840 | 7560 | 83160 | 720720 |

**Analysis.**
- *Where the optimum lives.* A coprime field with area N is the line Y·x + X·y = N, of read length 4·log2 N + 5 ± 2
  whatever the splitting. τ ≥ T first happens at the highly composite numbers.
- *Count.* Lines with whole coprime legs and area ≤ H: 4·Σ_{n ≤ H} 2^ω(n) ~ (24/π²)·H·log H, of 3.33 H³.
- *Bits.* V_T = 4·log2 N_T − ω(N_T) − O(1) with N_T the least n having T divisors. By Wigert's theorem
  log2 τ(n) ≤ (1 + o(1))·ln n / ln ln n, so the cost of doubling the divisor count grows without bound: 10 bits per
  doubling at T = 32, 12.7 at T = 128.
- *Top.* Unbounded. Under the cap: 240 divisors (area 720720), 72.6 bits, every line enumerated.
- *Prices.* The smoothest of the deep ladders: steps of 4 to 7 bits, sd/mean 0.40.
- **A junior learns**: intercepts, factor pairs, why 12, 60, 360 and 840 are "round".
- **Degenerate**: non-coprime fields (x + y = 1000) are cheap and stop at rung "both"; S1 is what forces the product
  into the line.

### 4. Euclid's Staircase

- **Primary representation**: the plane's slope triangle (rise by run); also `si`.
- **Card**: "Draw the rise-by-run rectangle of the gradient. Cut off the biggest square you can, again and again. How
  many different sizes of square do you cut?"
- **Primary**: K = the number of partial quotients of the continued fraction of max(|M|, D)/min(|M|, D), where
  m = M/D in lowest terms (the number of division steps of Euclid's algorithm).
- **Secondaries**: (S1) 1 if the list of quotients reads the same backwards; (S2) 1 if moreover the larger of |M|, D is
  prime; (S3) 1 if moreover the y-intercept r/s is a "kissing fraction" of the gradient, |M·s − D·r| = 1.
- **Example**: y = (13/5)x + 5/2. 13/5 = [2; 1, 1, 2]: K = 4, a palindrome, 13 is prime, and 13·2 − 5·5 = 1. Score
  (4, 1, 1, 1). (Then 13 = 2² + 3²: see the analysis.)

| K ≥ | 1 | 2 | 3 | 4 | 4 pal. prime | 5 | 6 | 8 | 10 | 11 | 16 | 20 | 28 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 1.3 | 3.9 | 5.7 | 8.1 | 9.9 | 10.3 | 12.4 | 17.3 | 22.3 | 25.0 | 37.5 (W) | 48.3 (W) | 66.2 (W) |
| cheapest gradient | 1 | 3/2 | 5/3 | 13/5 | 13/5 | 13/8 | 21/13 | 55/34 | 233/89 | 233/144 | 2584/1597 | 17711/10946 | 832040/514229 |

**Analysis.**
- *Where the optimum lives (Lamé, 1844).* K steps need max(|M|, D) ≥ F(K + 1), with equality only for consecutive
  Fibonacci numbers: the golden staircase is the cheapest at every height.
- *Count.* Among gradients of height ≤ H, K is asymptotically normal with mean (12 ln 2/π²)·ln H = 0.843 ln H (Heilbronn;
  Hensley): K ≥ k is typical once H > 3.27^k and exponentially rare between 1.618^k and that.
- *Bits (transfer operator; sketch).* The marginal weight of a gradient p/q is ≍ 1/(p²q²), and the sum of 1/(p²q²) over
  continued fractions of length k is the k-th power of the operator f ↦ Σ_a (a + x)^−4 f(1/(a + x)), whose leading
  eigenvalue is 0.1995 (from memory: the constant of Flajolet and Vallée's analysis of Euclid-type algorithms). So
  V_K = 2.33·K + O(1). Measured from K = 4 to 11: 2.42 bits per step. The witness bound alone gives 2.78 (Fibonacci).
- *The palindrome rung (classical).* A palindromic list means p divides q² ± 1; with an even number of quotients it
  means p divides q² + 1, and then p is a sum of two squares read off the middle of the staircase. For a prime p this is
  H. J. S. Smith's proof of Fermat's two-square theorem: every prime ≡ 1 (mod 4) has exactly one such staircase. For an
  odd number of quotients ≥ 3 the larger number is never prime (it would divide (q − 1)(q + 1)).
- *Top.* Unbounded; under the cap K = 28 (F(30)/F(29)), about 66 bits.
- *Prices and Fact 2.* S1 is alive (1.4 to 2.3 bits at every K) and S2 adds 0.1 to 2.6; S3 is dead: the kissing
  intercept makes the line 31 bits long when one more staircase step needs 19.
- **A junior learns**: Euclid's algorithm as a picture; why Fibonacci fractions are the hardest to simplify.
- **Degenerate**: the rule ignores c except in S3, so it collides freely with intercept rules (wanted). Whole gradients
  are K = 1.

### 5. Root Hunter

- **Primary representation**: `si` (the gradient as a decimal); also the plane (the diagonal of the unit square).
- **Card**: "Write the gradient as a decimal. How many of its digits, from the left, agree with √2 = 1.41421356…?"
- **Primary**: G = the number of leading decimal digits of m that agree with √2 (0 if m is not between 1 and 2).
- **Secondaries**, with m = M/D: (S1) −|M² − 2D²| ("square the top, double the square of the bottom: how close?");
  (S2) 1 if S1 = −1 and c = r/s is a kissing fraction of m, |M·s − D·r| = 1; (S3) 1 if moreover |r² − 2s²| = 1.
- **Example**: y = (17/12)x + 7/5. 17/12 = 1.4166…: G = 3; 289 − 288 = 1; 17·5 − 12·7 = 1; 49 − 50 = −1. Score
  (3, −1, 1, 1).

| G ≥ | 1 | 2 | 3 | 3, Pell | 4 | 5 | 6 | 7 | 8 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 3.9 | 11.6 | 17.6 | 18.0 | 23.9 | 28.0 | 37.9 (W) | 41.9 (W) | 51.9 (W) | 63.9 (W) | 77.9 (W) |
| cheapest gradient | 1 | 7/5 | 17/12 | 17/12 | 58/41 | 99/70 | 577/408 | 1393/985 | 8119/5741 | 47321/33461 | 665857/470832 |

**Analysis.**
- *The law (proved up to the constant).* Let δ = 10^−(G−1) be the width of the digit window. √2 is badly approximable:
  |√2 − p/q| > 1/(3q²), so no gradient with q < (3δ)^−1/2 is in the window, and a convergent with q ≤ 2δ^−1/2 is. The
  marginal weight of p/q is ≍ q^−4 near √2, and the fractions in the window with denominator q number at most 2δq + 1.
  Summing, the mass of the window is ≍ δ², so **V = 2·log2(1/δ) + O(1): 6.64 bits per decimal digit**, for ever.
  Measured: 6.1 per digit from G = 2 to 5, lumpy because the convergents 7/5, 17/12, 41/29, 99/70 do not fall evenly on
  powers of ten.
- *Count.* Gradients of height ≤ H in the window: none below H ≈ δ^−1/2, about (6/π²)·δ·H² above it.
- *Top.* Unbounded. Under the cap: twelve digits, 665857/470832, about 78 bits (bound: 79.2).
- *Prices.* dV/dE = 1.00: every bit of read length is a bit of value.
- *Fact 2.* S1 is worth 0.4 bits; S2 and S3 are dead (a 43-bit line against 27 for the next digit). Kept as
  tie-breaks only.
- **A junior learns**: √2 is not a fraction but 99/70 is astonishingly close; the pattern 3/2, 7/5, 17/12, 41/29.
- **Degenerate**: none; the family has one parameter (the target: √2, √3, the golden ratio, each with its own chain).

### 6. Pythagoras' Corner

- **Primary representation**: intercept triangle (`tri`); also the plane.
- **Card**: "The line and the axes make a right-angled triangle. How many of its three sides are whole numbers?"
- **Primary**: T = the number of whole numbers among legX, legY and √(legX² + legY²): 0 to 3.
- **Secondaries**, at T = 3: (S1) 1 if gcd(legX, legY) = 1 (a triangle that is not an enlargement); (S2) 1 if the
  hypotenuse is prime; (S3) the hypotenuse (larger is better).
- **Example**: x/20 + y/21 = 1, that is 21x + 20y = 420: sides 20, 21, 29, coprime, 29 prime. Score (3, 1, 1, 29),
  34.5 bits.

| rung | T ≥ 1 | 2 | 3 | primitive, prime h | h ≥ 13 | 29 | 89 | 257 | 1009 | 2003 | 4001 | 7001 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 2.6 | 3.9 | 15.5 | 16.2 | 24.1 | 34.5 | 41.8 | 51.0 | 61.6 | 69.8 | 74.9 | 78.2 |
| cheapest legs | 1, 1 | 1, 1 | 3, 4 | 3, 4 | 5, 12 | 20, 21 | 15, 112 | 25, 312 | 45, 1012 | 65, 2112 | 95, 4512 | 121, 7320 |

**Analysis.**
- *Structure (proved).* Primitive triples are (u² − v², 2uv, u² + v²). A prime is a hypotenuse exactly when it is
  ≡ 1 (mod 4), and then of one primitive triple only (Fermat), so the rung "prime hypotenuse ≥ T" has one triangle
  (eight lines) per such prime, and Dirichlet's theorem makes the ladder infinite.
- *Count.* Primitive triples with hypotenuse ≤ N: N/(2π) (Lehmer); with prime hypotenuse: N/(2 ln N).
- *Bits.* The line of legs X, Y is Y·x + X·y = XY, read length ≈ 4·log2(XY). The cheapest triangle with hypotenuse near
  h is the thin one (2k + 1, 2k(k + 1)), XY ≈ 1.4·h^1.5, so V = 6·log2 h + O(log log h). Measured: 5.96 bits per
  doubling of h from 13 to 7001.
- *Top.* Unbounded; under the cap the hypotenuse 7321, 78.2 bits, every line enumerated.
- *Prices.* One cliff (11.6 bits: two whole legs to a whole hypotenuse, the 3-4-5 line), then steps of 1.4 to 8.
- **A junior learns**: Pythagorean triples, enlargements against originals, which primes are hypotenuses.
- **Degenerate / variant**: ordering by "legs as nearly equal as possible" instead of S2, S3 gives the Pell chain
  3-4-5, 20-21-29, 119-120-169, 696-697-985: only four rungs under the cap, 20 bits apart. Rejected for smoothness.

### 7. Pharaoh's Gradient

- **Primary representation**: `si` (the gradient as a sum of unit fractions); also the function machine.
- **Card**: "The gradient is between 0 and 1. Take away the biggest unit fraction you can, again and again, until
  nothing is left. How many unit fractions did you need?"
- **Primary**: E = the length of the greedy (Fibonacci–Sylvester) Egyptian expansion of m, 0 < m < 1.
- **Secondaries**: (S1) the number of prime denominators in the expansion; (S2) −(D − M) for m = M/D (as close to 1 as
  the length allows); (S3) 1 if the y-intercept is the first unit fraction of the expansion.
- **Example**: y = (41/42)x + 1/2. 41/42 = 1/2 + 1/3 + 1/7: E = 3, all three denominators prime, D − M = 1, and c = 1/2.
  Score (3, 3, −1, 1).

| rung | E ≥ 1 | 1/p | 2 | 2, both prime | 3 | 3, all prime | 4 | 5 (W) | 7 (W) | 9 to 11 (W) |
|---|---|---|---|---|---|---|---|---|---|---|
| V | 3.8 | 4.2 | 6.0 | 8.0 | 8.1 | 11.5 | 11.5 | 13.2 | 17.5 | 19.0 |
| cheapest gradient | 1/2 | 1/2 | 2/3 | 3/7 | 3/7 | 13/14 | 13/14 | 5/31 | 8/97 | 11/199 |

**Analysis.**
- *Proved.* The numerators strictly fall, so E ≤ M (Fibonacci 1202; Sylvester 1880). The closest any sum of k unit
  fractions comes to 1 from below is Sylvester's 1/2 + 1/3 + 1/7 + 1/43 + … (Curtiss 1922), which is why S2 has a top
  at each length: 1/2, 5/6, 41/42, 1805/1806, and the first four have all-prime denominators.
- *Not proved.* I know no theorem for how many gradients of height ≤ H have greedy length ≥ k. The cheapest witnesses
  found (11/199 has length 11 on a 27-bit line) suggest about two bits per term; the estimate is an extrapolation.
- *Top.* Unbounded in principle (E can be any number), reach under the cap unknown; 19 bits measured at length 11.
- *Prices.* Smooth (largest step 2.9 bits) but shallow, and the denominators of a long expansion have thousands of
  digits, which a junior cannot check.
- **A junior learns**: unit fractions, the greedy method, 1/2 + 1/3 + 1/6 = 1.
- **Verdict**: charming up to length 4; backlog beyond (no law, and hard to check by hand).

### 8. ABC Line

- **Primary representation**: general form (`gen`), written a·x + b·y = c with positive whole a, b, c; also the plane
  (the peg (1, 1)).
- **Card**: "Write the line as ax + by = c with positive whole numbers in lowest terms. Make a + b as close to c as you
  can" (the line through the peg (1, 1)).
- **Primary**: −|a + b − C| where the triple is (a, b, −C), a, b, C > 0.
- **Secondaries**, at a + b = C: (S1) C / rad(a·b·C), where rad is the product of the distinct primes ("multiply the
  different primes you see in a, b and c; that should be small compared with c"); (S2) the number of perfect powers
  among a, b, C; (S3) C.
- **Example**: 3x + 125y = 128. 3 + 5³ = 2⁷; rad = 2·3·5 = 30; ratio 128/30 = 4.27; two perfect powers. Score
  (0, 64/15, 2, 128), 34.2 bits.

| rung | within 8 | a + b = c | ratio ≥ 0.6 | > 1 | ≥ 2 | ≥ 4 | ≥ 8 (W) | ≥ 16 (W) | ≥ 24 (W) | ≥ 48 (W) |
|---|---|---|---|---|---|---|---|---|---|---|
| V | 4.7 | 8.3 | 9.0 | 18.2 | 30.0 | 34.2 | 49.5 | 53.4 | 74.5 | 76.5 |
| cheapest | x + y = 1 | 1 + 1 = 2 | 1 + 1 = 2 | 1 + 8 = 9 | 1 + 80 = 81 | 3 + 125 = 128 | 1 + 2400 = 2401 | 1 + 4374 = 4375 | 37 + 2¹⁵ = 32805 | 1 + 512000 = 512001 |

**Analysis.**
- *Structure.* a + b = C with the triple primitive makes a, b, C pairwise coprime: this is the abc equation.
- *Count.* Lines with a + b = C ≤ H: (3/π²)·H², a share ≍ 1/H. Ratio > 1 ("abc hits") is far rarer; the count below H is
  believed to be H^(2/3 + o(1)) (stated from memory, treat as conjecture).
- *Top.* The ratio is unbounded (Stewart and Tijdeman, 1986: infinitely many triples with C > rad·exp((4 − ε)·
  √(log rad)/log log rad)). The abc conjecture says C < K_ε·rad^(1+ε), so a ratio ρ needs C > ρ^(1/ε): the bits per
  doubling of the ratio grow without bound. That is a conjecture; the measured ladder agrees (16 bits from 4 to 8, 21
  from 16 to 24).
- *Prices.* Deep (76 bits under the cap) but the cliffiest ladder after Prime Parade and Congruent Corner; rungs above
  ratio 4 are witness estimates because the hits are too sparse to enumerate honestly.
- **A junior learns**: prime factorisation, "1 + 8 = 9 is special because 8 and 9 are both powers".
- **Degenerate**: x + y = 2 has ratio exactly 1 and is the cheapest "a + b = c". Catalan's 8, 9 is the only pair of
  consecutive perfect powers (Mihăilescu), so S2 = 3 with a = 1 has one line.

### 9. Coin Line

- **Primary representation**: pegboard, first quadrant (`peg`); also general form.
- **Card**: "ax + by = c with whole a, b ≥ 2 that share no factor. The line should pass through no peg with x ≥ 0 and
  y ≥ 0: you cannot pay c with a-coins and b-coins."
- **Primary**: 1 if a, b ≥ 2, gcd(a, b) = 1, C ≥ 1 and a·x + b·y = C has no solution in whole x, y ≥ 0.
- **Secondaries**: (S1) −(F − C) with F = ab − a − b ("c is the largest amount you cannot pay"); (S2) the number of
  primes among a, b; (S3) 1 if F is prime; (S4) F.
- **Example**: 5x + 7y = 23. 23 cannot be paid with 5s and 7s and every larger amount can; 5, 7 and 23 are prime. Score
  (1, 0, 2, 1, 23), 20.2 bits.

| rung | unpayable | c = F | F prime, prime coins | F ≥ 12 | 48 | 192 | 768 | 3072 | 12288 | 49152 | 196608 | 786432 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 7.6 | 10.0 | 13.5 | 20.2 | 24.6 | 30.7 | 37.2 | 43.4 | 49.7 | 55.9 | 62.1 | 69.7 |
| cheapest (a, b) | 2, 3 | 2, 3 | 2, 5 | 3, 11 | 3, 31 | 3, 101 | 29, 31 | 29, 127 | 31, 419 | 29, 1759 | 29, 7027 | 29, 28111 |

**Analysis.**
- *Structure (proved).* For coprime a, b the largest unpayable amount is ab − a − b and exactly (a − 1)(b − 1)/2 amounts
  are unpayable (Sylvester, 1884).
- *Count.* Lines with C = F and ab ≤ H: (6/π²)·H·log H. The weight of (a, b, −F) is ≍ (ab)^−4, and ab = n in τ(n) ways,
  so the mass of "C = F and F ≥ T" is ≍ T^−3·log T: **V = 3·log2 T − log2 log T + O(1)**, proved for the rung without
  the primality conditions. With them the count thins by (log T)^−3 (Bateman–Horn; for a = 2 it is exactly the twin
  primes b − 2, b), which is conjectural but only moves V by log-log terms.
- *Measured.* 3.0 to 3.4 bits per doubling of F across sixteen doublings; sd/mean of the steps 0.37, the smoothest deep
  ladder here.
- *Top.* Unbounded (conjecturally, with the primes; provably without S2 and S3). Under the cap 69.7 bits, every line
  enumerated.
- **A junior learns**: the chicken-nugget problem; that 5s and 7s make every amount above 23.
- **Degenerate**: half of all lines pass through no first-quadrant peg, so the primary alone is cheap by design (7.6 bits,
  most of it the two positive coprime coins); S1 carries the idea. Coins sharing a factor are excluded because then
  infinitely many amounts are unpayable.

### 10. Amicable Line

- **Primary representation**: `si`; also the function machine.
- **Card**: "Add up the factors of the gradient, leaving out the number itself: you should get the y-intercept. Do the
  same to the y-intercept: you should get the gradient."
- **Primary**: −(|s(m) − c| + |s(c) − m|) for whole m, c ≥ 2, where s(n) is the sum of the proper divisors of n.
- **Secondaries**: (S1) 1 if m ≠ c; (S2) 1 if m and c are both odd; (S3) min(m, c).
- **Example**: y = 220x + 284. s(220) = 284 and s(284) = 220. Score (0, 1, 0, 220), 36.2 bits.

| rung | off by ≤ 30 | ≤ 2 | exact | exact, ≥ 28 | two different numbers | ≥ 1184 | ≥ 5020 | both odd | odd, ≥ 100485 | odd, ≥ 802725 |
|---|---|---|---|---|---|---|---|---|---|---|
| V | 7.5 | 11.0 | 15.2 | 23.2 | 36.2 | 46.1 | 53.1 | 58.2 | 69.9 | 82.2 |
| cheapest (m, c) | 3, 3 | 2, 2 | 6, 6 | 28, 28 | 220, 284 | 1184, 1210 | 5020, 5564 | 12285, 14595 | 100485, 124155 | 802725, 863835 |

**Analysis.**
- *Structure.* Exact with m = c is a perfect number (6, 28, 496, 8128: Euclid and Euler tie the even ones to Mersenne
  primes); exact with m ≠ c is an amicable pair. Below 10^6 there are 40 pairs, 7 of them odd (enumerated by sieve).
- *Count.* Amicable numbers have density zero; their count below x is at most x·exp(−√(log x)) for large x (Pomerance).
  Whether there are infinitely many is open, as is the existence of an odd perfect number.
- *Bits.* Each pair is two lines of read length ≈ 4·log2 m + 6, alone at their height: V ≈ E − 1.
- *Top.* Unbounded only conjecturally. Under the cap 82.2 bits (the odd pair 802725, 863835), the highest of all
  sixteen, every line enumerated.
- *Prices.* Cliffs of 13 bits (28 to 220), 10 (220 to 1184) and 10 (the odd pairs): the structure is sparse and nothing
  can be done about it. Near misses (powers of two are off by 2; 48 and 75 are "betrothed", off by 2) fill the bottom.
- **A junior learns**: factors and their sums; Paganini found 1184 and 1210 at sixteen, after Euler had missed it.
- **Degenerate**: m = c = 2^k is always off by exactly 2, a broad cheap shelf at 11 bits. The primary is checkable by a
  twelve-year-old only for small numbers; a rule for the upper band of a room, not for beginners.

### 11. Divisibility Ladder

- **Primary representation**: table of values; also sequence.
- **Card**: "The line must not pass through the origin. Going along the table from x = 1: y(1) should be a multiple of
  1, y(2) a multiple of 2, y(3) a multiple of 3, … How far do you get?"
- **Primary**: K = the largest k with n | y(n) for every n = 1, …, k (c ≠ 0).
- **Secondaries**: (S1) the number of primes among the quotients |y(n)/n|, n ≤ K; (S2) 1 if those quotients are pairwise
  coprime; (S3) 1 if the x-intercept is a whole number.
- **Example**: y = −x + 12. y(n)/n = 11, 5, 3, 2 for n = 1, 2, 3, 4 and y(5) = 7 is not a multiple of 5: K = 4, four prime
  quotients, pairwise coprime, x-intercept 12. Score (4, 4, 1, 1), 11.2 bits.

| K ≥ | 1 | 2 | 3 | 4 | 4, all quotients prime | 6 | 7 | 8 | 10 | 12 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 2.2 | 4.2 | 6.5 | 8.5 | 11.2 | 12.6 | 18.6 | 20.6 | 24.3 | 30.6 | 38.9 | 41.2 |
| least \|c\| | 1 | 2 | 6 | 12 | 12 | 60 | 420 | 840 | 2520 | 27720 | 360360 | 720720 |

**Analysis.**
- *Exact structure.* y(n)/n = m + c/n. K ≥ 1 forces m + c whole and K ≥ 2 forces c/2 whole, hence m and c whole; then
  K ≥ k if and only if lcm(1, …, k) divides c. K takes only the values k with k + 1 a prime power.
- *Exact count.* Whole lines of height ≤ H with K ≥ k: (2H + 1)·2⌊H/L_k⌋ with L_k = lcm(1..k).
- *Exact bits.* The mass is P(whole line)·Σ_{j ≠ 0} 2^−int(j·L_k), so **V_k = 2·log2 L_k + c_k with 0.8 ≤ c_k ≤ 2.3**, and
  log L_k = ψ(k) is Chebyshev's function: ψ(k) ~ k is the prime number theorem. So V_k = 2.885·k·(1 + o(1)), and each
  rung costs 2·log2 p bits where p is the prime whose power k + 1 is: 2, 3.2, 2, 4.6, 5.6, 2, 3.2, 6.9, 7.4, 2, …
- *Top.* Unbounded. Under the cap K = 16 (c = ±720720), 41.2 bits, enumerated.
- *Prices.* One coefficient carries the whole climb (k = 1 in Fact 1), so this is the cheapest deep ladder to *build*
  per bit of value and the gentlest for a junior; S1 and S2 add 2.7 bits at K = 4 and 1.8 at K = 6 and then die, because
  m + c/n cannot be prime for many n at once (two of the quotients differ by 1 or 3).
- **A junior learns**: lowest common multiples; why 60 and 2520 are special; the first glimpse of ψ.
- **Degenerate**: lines through the origin have every quotient equal to m (excluded: c ≠ 0). Horizontal lines y = 60 are
  allowed and are the cheapest at each rung.

### 12. Prime Feedback

- **Primary representation**: function machine, fed back on itself (`mach.twice`); also sequence.
- **Card**: "Feed 1 into the machine, then feed each answer back in. How many different primes come out in a row?"
- **Primary**: R = the largest r such that x₁, …, x_r are distinct primes, where x₀ = 1 and x_{k+1} = m·x_k + c.
- **Secondaries**: (S1) the number of primes obtained by running the machine backwards from 1; (S2) 1 if the gradient is
  a whole prime (up to sign); (S3) the last prime of the chain.
- **Example**: y = 2x + 9: 1 → 11 → 31 → 71 → 151 → 311 → 631 → 1271 = 31·41. R = 6, gradient 2 is prime, last prime 631.
  Score (6, 0, 1, 631), 15.0 bits.

| R ≥ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| V | 4.0 | 5.9 | 7.8 | 10.8 | 14.1 | 15.0 | 20.1 | 21.2 |
| cheapest | y = 3x | x + 1 | x + 2 | 2x + 3 | 6x + 5 | 2x + 9 | 38x − 7 | 38x − 7 |

**Analysis.**
- *Structure.* With m = 1 this is a prime parade from 1 + c. With |m| ≥ 2 the chain grows geometrically (generalised
  Cunningham chains): x_k = m^k + c·(m^k − 1)/(m − 1). y = 38x − 7 gives 31, 1171, 44491, …, 3525236869051: eight primes
  for 21 bits.
- *Count (heuristic only).* A chain of length k has terms near |m|^j·|c|, each prime with chance about 1/ln, so lines of
  height ≤ H with R ≥ k number about H²·Π_{j ≤ k} 1/(j·ln|m| + ln H): for a fixed height the product falls faster than
  any power, so the top under a cap is small. Dickson's conjecture gives chains of every length; nothing is proved
  beyond what is found.
- *Top.* 8 found for |m| ≤ 120, |c| ≤ 10^5 (and all whole lines of height ≤ 1000): 21.2 bits. Honest reach: low.
- *Prices.* Smooth (2.7 bits a prime) but short, and the chain's later terms are too large for a junior to test.
- **A junior learns**: iteration; how fast "times 2 plus 9" grows.
- **Verdict**: a good beginner's ladder to R = 6; not a deep one.

### 13. Congruent Corner

- **Primary representation**: intercept triangle (`tri`); also the plane.
- **Card**: "Work out the sloping side of the triangle with Pythagoras. The square root must come out exactly: all
  three sides are fractions or whole numbers."
- **Primary**: 1 if legX² + legY² is the square of a rational (equivalently a² + b² is a perfect square).
- **Secondaries**: (S1) −(distance from the area to the nearest whole number ≥ 1); (S2) 1 if the area is square-free
  (not an enlargement of a smaller such triangle); (S3) 1 if the area is prime; (S4) the area.
- **Example**: 40x + 9y = 60 has legs 3/2 and 20/3, hypotenuse 41/6, area 5. Score (1, 0, 1, 1, 5), 30.2 bits.

| rung | rational sides | area within ¼ | whole area | square-free | prime (5) | prime ≥ 7 | prime ≥ 13 (41) |
|---|---|---|---|---|---|---|---|
| V | 9.0 | 12.1 | 15.5 | 16.2 | 30.2 | 52.2 | 62.2 |
| cheapest line | 3y − 4x = 1 | 3y − 4x = 7 | 3y − 4x = 12 | 3y − 4x = 12 | 40x + 9y = 60 | 175x + 288y = 840 | 369x + 800y = 4920 |

**Analysis.**
- *Structure.* A whole number that is the area of a right triangle with rational sides is a congruent number, and N is
  one exactly when y² = x³ − N²x has a rational point of infinite order. 1, 2, 3, 4 are not (Fermat's descent for 1);
  5, 6, 7 are. Tunnell's criterion (1983) decides N by counting solutions of two quadratic forms, proved in one
  direction and in the other under the Birch and Swinnerton-Dyer conjecture. Primes ≡ 5 or 7 (mod 8) are congruent
  (Heegner; Monsky); primes ≡ 3 (mod 8) are not.
- *Count.* Lines with rational sides: one per Pythagorean direction and intercept, ≍ H² of height ≤ H (a share 1/H).
  Whole square-free area: one line per rational point, and the size of the smallest triangle for N is erratic (area 6
  is 3-4-5, 21 bits; area 5 needs sixths, 35 bits; 7 needs 60ths, 57 bits; 13 needs 103 bits; 157 is famously
  astronomical). No formula for the bits of a rung is possible short of BSD.
- *Top.* Unbounded (infinitely many congruent primes). Found under the cap: areas 5, 7, 41 and 13.
- *Prices.* The steepest ladder here: cliffs of 14, 22 and 10 bits. Only 8 live rungs.
- **A junior learns**: Pythagoras with fractions; that area 5 is possible and area 1 is not.
- **Verdict**: the deepest mathematics in the list and the worst ladder; a showpiece rule for an expert room.

### 14. Cyclic Decimal

- **Primary representation**: `si` (the gradient as a recurring decimal); also the function machine.
- **Card**: "Write the gradient as a decimal. How long is the block of digits that repeats?"
- **Primary**: L = the period of the decimal expansion of m = M/D: the order of 10 modulo D with its factors 2 and 5
  removed (0 for a terminating decimal).
- **Secondaries**: (S1) 1 if L = D − 1, the longest the denominator allows; (S2) 1 if moreover the y-intercept has the
  same denominator and its repeating block is a different rotation of the gradient's; (S3) 1 if moreover m + c is a
  whole number (the two blocks add up to 999…9).
- **Example**: y = −x/7 + 1/7. −1/7 has fractional part 6/7 = 0.857142…, period 6 = 7 − 1; 1/7 = 0.142857… is a rotation;
  857142 + 142857 = 999999. Score (6, 1, 1, 1), 6.4 bits.

| rung | L ≥ 1 | 6 | 6, full, rotation, nines | 16, … | 46, … | 96, … | 982, … | 4000, … | 32000, … | 128000, … | 512000, … |
|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 3.3 | 4.9 | 6.4 | 7.4 | 9.9 | 11.3 | 17.2 | 19.5 | 22.9 | 25.2 | 28.2 |
| denominator | 3 | 7 | 7 | 17 | 47 | 97 | 983 | 4007 | 32029 | 128021 | 512021 |

**Analysis.**
- *Structure (proved).* L divides φ(D) and is at most D − 1, with equality only for primes D of which 10 is a primitive
  root (7, 17, 19, 23, 29, 47, 59, 61, 97, …). For such D every k/D has the same block, rotated, and the block of k/D
  plus the block of (D − k)/D is all nines (Midy, 1836).
- *Bits.* L ≥ ℓ needs D > ℓ, and a denominator is that large with probability about 1/ℓ: V ≥ log2 ℓ − O(1), proved. That
  full-period primes have positive density among primes (0.374, Artin's constant) is Artin's conjecture, proved under
  the generalised Riemann hypothesis (Hooley); granting it, V(L ≥ ℓ with all three secondaries) = log2 ℓ + log2 ln ℓ +
  O(1). Measured: 1.1 to 1.7 bits per doubling of ℓ from 1000 to 512000.
- *Top.* Unbounded (under Artin). Under the cap 28.2 bits. The slowest ladder: one bit per doubling.
- *Prices.* The smoothest ladder of all (largest step 2.9 bits, 23 live rungs). All three secondaries are alive at every
  level (0.4 to 2.9 bits per level): Fact 2 in its good case, because a full-period line with a small numerator is cheap.
- **A junior learns**: 1/7 = 0.142857…, the cyclic number, and that 2/7, 3/7, … are the same digits in a ring.
- **Degenerate**: m = 1/3 has period 1 = 3 − 1 (full period for D = 3). Denominators 2^i·5^j are level 0.

### 15. Circle Kiss

- **Primary representation**: the plane (the circle about the origin that the line touches); also general form.
- **Card**: "The line cuts both axes and touches exactly one circle centred on the origin. The radius of that circle
  should be a whole number."
- **Primary**: 0 if the distance d = |c|/√(a² + b²) from the origin is irrational; 1 if it is rational; 2 if it is a
  whole number (a, b, c all non-zero).
- **Secondaries**, at 2: (S1) 1 if the touching point is a peg; (S2) the number of pegs on that circle; (S3) the radius.
- **Example**: 3x + 4y = 325 touches the circle of radius 65 at the peg (39, 52); that circle holds 36 pegs. Score
  (2, 1, 36, 65), 23.9 bits.

| rung | rational d | whole d | touches at a peg | 20 pegs | 36 | 60 | 108 | 180 | 252 | 540 |
|---|---|---|---|---|---|---|---|---|---|---|
| V | 9.0 | 13.3 | 17.5 | 21.3 | 23.9 | 28.3 | 31.6 | 35.9 | 40.1 | 48.2 |
| least radius | 1/5 | 1 | 5 | 25 | 65 | 325 | 1105 | 5525 | 32045 | 160225 |

**Analysis.**
- *Structure (proved).* d is rational exactly when (a, b) is a Pythagorean pair with hypotenuse h; it is whole when h
  divides c; the touching point is a peg when h² divides c. So the lines are a·x + b·y = h²k, radius hk. The circle of
  radius d holds 4·Π(2e_p + 1) pegs, the product over primes p ≡ 1 (mod 4) of d (Jacobi's two-square formula).
- *Count and bits.* For the direction (3, 4) the line is 3x + 4y = 5d with 5 | d, read length 2·log2(5d) + 12. A circle
  with R pegs first appears at d_R = 5, 25, 65, 325, 1105, … (products of small primes ≡ 1 mod 4), so
  V = 2·log2 d_R + O(1); d_R grows like R^(c·log log R), as for the highly composite numbers.
- *Top.* Unbounded. Under the cap 540 pegs (radius 160225), 48.2 bits, every line enumerated.
- *Prices.* Smooth (steps 2.5 to 7.2, sd/mean 0.47). Only one coefficient grows, so it is cheap to build.
- **A junior learns**: tangents, the perpendicular distance, why radius 65 has more pegs than radius 64.
- **Degenerate**: horizontal and vertical lines touch whole circles trivially (excluded: the line must cut both axes).

### 16. Parabola Chord

- **Primary representation**: the plane with the parabola y = x² drawn; also the function machine (x ↦ x² − mx − c).
- **Card**: "The line cuts the curve y = x². How many of the crossing points are pegs?"
- **Primary**: N = the number of distinct whole-number solutions of x² = mx + c: 0, 1 or 2.
- **Secondaries**, at N = 2 with crossings r₁ < r₂: (S1) the number of primes among r₁, r₂; (S2) 1 if the gradient is
  prime; (S3) 1 if moreover 1 − c is prime; (S4) r₂.
- **Example**: y = 13x − 22 crosses at x = 2 and x = 11. Both prime; the gradient 13 = 2 + 11 is prime; 1 − c = 23 is
  prime. Score (2, 2, 1, 1, 11), 21.1 bits.

| rung | one peg | two | one prime | both prime | + prime gradient, 1 − c prime | p ≥ 10 | 40 | 320 | 2560 | 20480 | 163840 | 327680 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V | 1.5 | 2.8 | 5.3 | 14.7 | 14.8 | 21.1 | 29.2 | 40.0 | 49.9 | 60.1 | 69.9 | 73.4 |
| cheapest | y = 0 | y = x | y = 3x | 5x − 6 | 5x − 6 | 13x − 22 | 43x − 82 | 421x − 838 | 2971x − 5938 | 20773x − 41542 | 163993x − 327982 | 329473x − 658942 |

**Analysis.**
- *Structure (Vieta).* The crossings are the roots of x² − mx − c, so m = r₁ + r₂ and c = −r₁r₂: two whole crossings
  means the quadratic factorises. Two prime crossings with a prime sum force r₁ = 2 and (p, p + 2) twin primes; S3 asks
  2p + 1 prime as well (p is then also a Sophie Germain prime). The line is y = (p + 2)x − 2p.
- *Count.* Whole lines of height ≤ H with two whole crossings: ≍ H·log H (pairs with |r₁r₂| ≤ H), of 4H². The top rungs
  are the primes p with p + 2 and 2p + 1 prime: C·H/(log H)³ of them below H by the Hardy–Littlewood conjecture
  (Dickson's conjecture for infinitude; neither is proved; bounded gaps between primes are, Zhang and Maynard).
- *Bits.* The line's weight is ≍ p^−4, so V = 3·log2 p + 3·log2 ln p + O(1). Measured: 3.2 to 3.5 bits per doubling of p
  over fifteen doublings.
- *Top.* Unbounded (conjecturally). Under the cap 73.4 bits, every line enumerated (all p < 500000).
- *Prices.* One 9.4-bit cliff (one prime crossing to two), then the second-smoothest deep ladder (sd/mean 0.46).
- **A junior learns**: factorising quadratics, sum and product of roots, twin primes: the most curriculum-shaped rule
  in this document.
- **Degenerate**: a tangent at a peg is N = 1. Negative primes do not exist, so crossings left of the axis stop at S1.

## 3. Ranking by reach and by smoothness

From the script's summary (box H = 64). **Top** is the value of the highest rung that a line of height ≤ 10^6 reaches;
"E" means every line of the top rungs was enumerated, "W" that the top is extrapolated from a witness (whose energy is a
proved upper bound). **Live rungs** are worth at least a quarter of a bit more than the rung below. **Largest step** and
the spread of the steps (sd/mean) measure smoothness; the ranks are by top (reach) and by largest step (smoothness).

| Family | Top, bits | src | Live rungs | Mean step | Largest step | sd/mean | Reach rank | Smoothness rank | Law for the bits of a rung | Top unbounded? |
|---|---|---|---|---|---|---|---|---|---|---|
| Amicable Line | 82.2 | E | 16 | 5.1 | 13.0 | 0.76 | 1 | 13 | none (pairs are sporadic) | open |
| Pythagoras' Corner | 78.2 | E | 22 | 3.6 | 11.6 | 0.72 | 2 | 12 | 6·log2 h, proved shape | yes (Fermat, Dirichlet) |
| Root Hunter | 77.9 | W | 14 | 5.6 | 10.0 | 0.54 | 3 | 10 | 6.64 per digit, proved | yes |
| ABC Line | 76.5 | W | 14 | 5.4 | 21.2 | 1.15 | 4 | 14 | none (abc conjecture) | yes (Stewart–Tijdeman) |
| Parabola Chord | 73.4 | E | 19 | 3.9 | 9.4 | 0.46 | 5 | 9 | 3·log2 p, conjectural count | conjecturally |
| Rectangle Field | 72.6 | E | 16 | 4.5 | 7.2 | 0.40 | 6 | 5 | 4·log2 N(τ), proved | yes |
| Coin Line | 69.7 | E | 20 | 3.5 | 6.6 | 0.37 | 7 | 4 | 3·log2 F, proved without the primes | yes |
| Euclid's Staircase | 66.2 | W | 22 | 3.0 | 10.7 | 0.96 | 8 | 11 | 2.33 per step, proved rate | yes (Lamé) |
| Congruent Corner | 62.2 | E | 8 | 7.8 | 22.0 | 0.91 | 9 | 15 | none (needs BSD) | yes |
| Prime Parade | 61.2 | E | 14 | 4.3 | 25.1 | 1.39 | 10 | 16 | ≥ 2.89 per term, proved bound | yes (Green–Tao) |
| Circle Kiss | 48.2 | E | 11 | 4.4 | 7.2 | 0.47 | 11 | 6 | 2·log2 d(R), proved | yes |
| Divisibility Ladder | 41.2 | E | 15 | 2.7 | 8.3 | 0.74 | 12 | 8 | 2·log2 lcm(1..k), exact | yes (prime number theorem) |
| Cyclic Decimal | 28.2 | C+S | 23 | 1.2 | 2.9 | 0.59 | 13 | 1 | log2 ℓ, proved bound; Artin | under GRH |
| Prime Feedback | 21.2 | E | 8 | 2.7 | 5.1 | 0.51 | 14 | 3 | none (heuristic) | conjecturally |
| Pharaoh's Gradient | 19.0 | W | 10 | 1.9 | 2.9 | 0.50 | 15 | 2 | none | unknown reach |
| Square Steps | 15.2 | E | 6 | 2.5 | 8.2 | 1.02 | 16 | 7 | bounded: 6 squares | no |

Notes on the check.

- The W tops are estimates: Root Hunter's bound is 79.2 bits and its law says 78; Euclid's Staircase's bound is 79.2 and
  its law (2.33 per step) says about 67; ABC Line's bound is 79.2.
- Largest steps of "E" families are properties of the mathematics, not of the rung spacing I chose; where "larger is
  better" is the last component I placed rungs at doublings.
- Collisions the owner wants are plentiful because many optima are the same small lines: 4x + 3y = 12 is at once
  Pythagoras' Corner (3-4-5), Congruent Corner (area 6) and Rectangle Field (coprime, six divisors); y = 6x + 5 is a
  five-prime Prime Parade and a five-prime Prime Feedback; 12x + 5y = 60 stands on four ladders; y = −x + 12 on three.

## 4. Top eight

1. **Coin Line**: "you cannot pay c with a-coins and b-coins", then c is the largest such amount, the coins prime, c
   prime, c larger. 69.7 bits, the smoothest deep ladder (3.2 bits per doubling), Sylvester's theorem behind it, and a
   primary every child can test with counters.
2. **Rectangle Field**: both intercept distances whole, then coprime, then the area with the most divisors. 72.6 bits,
   steps of 4 to 7, a proved law, and it teaches factor pairs.
3. **Parabola Chord**: the line cuts y = x² at two pegs, then both prime, the gradient prime, 1 − c prime, larger.
   73.4 bits; it is factorising quadratics, with twin primes at the top.
4. **Pythagoras' Corner**: all three sides whole, then primitive, a prime hypotenuse, a larger one. 78.2 bits, infinite
   by Fermat and Dirichlet, six bits per doubling.
5. **Divisibility Ladder**: y(n) a multiple of n for n = 1, 2, 3, …. 41.2 bits, the only ladder whose every rung is
   known exactly (2·log2 lcm(1..k), the prime number theorem), the cheapest to build, the gentlest primary.
6. **Root Hunter**: the gradient's decimal digits agree with √2. About 78 bits, 6.64 bits per digit proved, and value
   equals price bit for bit.
7. **Euclid's Staircase**: the number of square sizes cut from the rise-by-run rectangle. About 66 bits, 2.33 bits per
   step, with Smith's two-square palindromes as live tie-breaks.
8. **Prime Parade**: primes in a row from term 0. 61.2 bits; the iconic rule, cliffy above ten terms but with seven
   useful rungs below 20 bits.

Runners-up: **Cyclic Decimal** (the smoothest and the most magical for a beginner, but one bit per doubling) and
**Circle Kiss** (smooth, 48 bits, good geometry). Showpieces for an expert room: **Amicable Line**, **ABC Line**,
**Congruent Corner**. Backlog: **Pharaoh's Gradient**, **Prime Feedback**, **Square Steps** (short ladders).

## 5. What makes a ladder deep

A ladder is deep when every upper rung forces the line to write a larger number, and smooth when the set of admissible
numbers is dense on a logarithmic scale; both follow from Fact 1. The recipe that produced every ladder in the top
eight has four layers. **A gate**: a primary that is a count with a top or an exact condition, visible in one picture
and worth 3 to 15 bits (two whole legs, two peg crossings, an unpayable amount), so that it can be met cheaply and its
upper range belongs to the secondaries (Fact 2). **A sieve**: one or two multiplicative conditions on the whole numbers
the gate produced (coprime, prime, square-free, "the largest such"), read through a different representation; each is
worth a few bits and, more important, removes the cheap scalings (x + y = 1000, enlargements of 3-4-5) so that the
numbers must appear in the coefficients in full. **A size**: "larger is better" as the last component, on an integer
that the sieve has tied to k coefficients; it then pays 2k bits per doubling less the density of the sieve, without a
ceiling, and it is exactly here that the confining price and the utility climb together. **A theorem**: choose the
sieve so that infinitude and the count are known (Sylvester, Fermat with Dirichlet, Chebyshev's ψ, Lamé, Wigert) or at
least standard conjectures with exact constants (Hardy–Littlewood), because then the artefact's curve can be snapped to
c·log2 of the size and checked rather than fitted. What to avoid is as definite: a primary that climbs for ever on its
own makes every tie-break worthless; a continuous component must come last; sporadic structures (amicable pairs,
congruent primes, abc hits) reach far but in cliffs of 10 to 25 bits; and structures bounded by a theorem (squares in
progression) make beautiful rules with ceilings near 15 bits.

## Appendix: the script

```
python3 docs/engine-v2/rule-brainstorm/scripts/d_number_theory_ladders.py            # all sixteen, about 3 minutes
python3 docs/engine-v2/rule-brainstorm/scripts/d_number_theory_ladders.py 32         # a smaller box
python3 docs/engine-v2/rule-brainstorm/scripts/d_number_theory_ladders.py 64 coin    # one family
```

It needs no engine code. Each family is a score function on the primitive triple, a list of rung thresholds, and the
enumerations that reach its upper rungs (their docstrings say what each one is complete for). The last section of the
output evaluates the example line of every family above.
