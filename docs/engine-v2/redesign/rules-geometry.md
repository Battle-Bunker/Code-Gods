# Rule families from geometry and relations across lenses

Designer-analyst note, 17 November 2026 (Melbourne). Fresh thinking: the existing rule code and rule docs were not read.
Labels: **[calc]** checked with a few lines of code (script in the session scratchpad, not committed); **[guess]** reasoned, not
checked; **[conj]** conjecture about play.

## Two structural findings first

1. **Every "echo between lenses" is one of two things.** A line is a primitive triple (a, b, c) of ax + by + c = 0, and
   every lens number is a, b or c divided by one of the three pairwise gcds (gradient −a/b, y-intercept −c/b, x-intercept
   −c/a, area c²/2|ab|). So a cross-lens relation is either
   - **a curve in line space** (true by construction): a *linear* echo between lens numbers (say "y-intercept = θ ×
     gradient") is the same as *passing through a point*; a *quadratic* echo ("gradient² = −4k × y-intercept") is the same
     as *touching a conic*. These are **approach rules**: aim at a dealt irrational target, score digits of agreement.
   - **arithmetic of (a, b, c)**: squares, square classes, shared factors. These are **exactness rules**: exact solutions
     exist at every height, and utility is the height of the exact hit.
   The interesting play is in pairing one of each, or two exactness rules on the same pair of numbers.
2. **Dealt targets must have no rational points.** A target angle with irrational tangent, a circle whose squared radius
   has a prime ≡ 3 (mod 4) to an odd power, a star at irrational coordinates: then the approach rule can never be met
   exactly, so there is no maximum and no one-turn peak; depth is unbounded and paid for digit by digit. (True by
   construction; for the circle, [calc] no exact tangent to x²+y²=7 about (2,1) for |a|,|b| < 200.)

The two kinds behave differently under a knock, which matters for the "keep some value" wish:
approach rules lose only the tail (a +1 on a 13-bit denominator keeps about 13 of 33 bits [calc]); exactness rules lose
the excess over random when the *same* numbers are knocked (Whole stair 20/21: 4.9 → 0.6 [calc]) but nothing when other
numbers move (the intercept is free under a slope rule).

Utility convention for exactness rules: U = log2(H) − log2(1 + miss), where H is the natural size and miss the integer
residual of the equation. A random line scores about 0; an exact hit scores log2 H. [calc] For Whole stair, the share of
random 12-bit and 20-bit slopes with U ≥ u is 2^(−u) to within 0.5 bit for u = 2…8: **utility is close to rarity in bits**,
so energy should track utility. Approach rules use U = −log2(gap).

## The families

| # | Name | Card (two sentences) | Utility | Parameters | Lens |
|---|---|---|---|---|---|
| 1 | **Bearing** | Your line should point at φ degrees above flat. You score one point for every binary digit of its steepness that matches tan φ. | U = −log2 \|m − tan φ\|, m = gradient | φ: any angle whose tangent is irrational (every whole degree but 0, 45, 90, 135; or tenths: ~1,800) | gradient; continued fraction is the shortcut lens |
| 2 | **Whole stair** | Walk one step along your line: q across, p up. Score how close the slanted edge of that step is to a whole number times √n; exact long edges score most. | U = log2 √(p²+q²) − log2(1 + min_c \|p²+q² − n c²\|) | n: any sum of two squares (1, 2, 5, 10, 13, …: unbounded) | gradient, or (a, b) |
| 3 | **Corner** | Your line and the two axes cut off a right-angled corner triangle. Score how close its area is to n times a square. | U = log2 √(2n\|pq\|) − log2(1 + min_s \|2n\|pq\| − s²\|), p/q = gradient (area = c²/2\|ab\|, so the square class depends on the slope only) | n: squarefree whole numbers (unbounded) | gradient; prime-exponent lens (make exponents even) |
| 4 | **Ring** | A circle is drawn on the board. Score how closely your line just touches it without cutting it. | U = −log2 \| \|au+bv+c\|/√(a²+b²) − √ρ \| | centre (u, v) any lattice point, ρ with a prime ≡ 3 mod 4 to an odd power (never exact) or a perfect square (exact needs a whole stair, see pairings) | a, b, c |
| 5 | **Star** | A star hangs at a point you cannot write as a fraction. Score how close your line passes to it. | U = −log2 ( \|aα + bβ + c\| / √(a²+b²) ) | (α, β) = (√d₁, √d₂) or similar, d's non-squares: unbounded | a, b, c; y-intercept |
| 6 | **Belt** | Two coins lie on the board. Score how well your line lies flat against both, like a belt round two wheels. | U = min(U_ring1, U_ring2) | two circles (as Ring). Exactly four target lines | a, b, c |
| 7 | **Mirror** | Your line is a mirror. Score how close the reflection of the dealt point A lands to the dealt circle. | A′ = A − 2(aA_x+bA_y+c)(a,b)/(a²+b²); U = −log2 \| \|A′−O\|² − ρ \| | A, O, ρ | a, b, c |
| 8 | **Shared factors** | Write your line three ways: as a slope, by its two crossings of the axes, and as an equation. Score the bits of factor the three ways share. | U = log2 gcd(a,b) + log2 gcd(b,c) + log2 gcd(c,a), with gcd(x, 0) := 1 | optional: count only primes in a dealt set S (unbounded family) | a, b, c; prime-exponent lens |
| 9 | **Whole triangle** | Your line and the axes make a triangle. Score if all three of its sides are whole numbers, more for bigger ones. | U = Whole stair (n=1) on (a,b) + log2 of the part of c divisible by lcm(a, b), capped by log2 \|ab\| | none (or a scale unit) | x- and y-intercepts |
| 10 | **Two bearings** (pair rule) | Your line should point at φ while sitting at height h where it crosses the y-axis. Score the digits of the weaker of the two. | U = min(−log2\|m − tan φ\|, −log2\|Y − h\|), h irrational | φ, h | gradient + y-intercept |

### Ladders (shallow → deep)

| Rule | Ladder (line → U) | Source |
|---|---|---|
| Bearing φ = 37° (tan = 0.75355…) | 0/1 → 0.4; 3/4 → 8.1; 52/69 → 13.8; 159/211 → 21.1; 7898/10481 → 33.5; 860723/1142218 → 41.7. Random 12-bit slope: ~2 | [calc] |
| Whole stair, n = 1 | 1/1 → −0.5; 3/4 → 2.3; 20/21 → 4.9; 119/120 → 7.4; 696/697 → 9.9; 4059/4060 → 12.5 | [calc] |
| Corner, n = 5 | 1/1 → 0.7; 3/4 → 2.5; 1/10 → 3.3; 1/40 → 4.3; 9/40 → 5.9 | [calc] |
| Ring, centre (2,1), ρ = 7 | best lines with \|a\|,\|b\| ≤ 60: (60,17,28) → 13.3; (56,53,39) → 14.9 (shallow lines ~2–6) | [calc] |
| Star (√2, √3) | best by height ≤ 2, 5, 20, 40, 80: 5.5, 13.1, 14.0, 19.7, 23.9 (58x + 71y − 205 = 0) | [calc] |
| Belt, Mirror, Shared factors, Whole triangle, Two bearings | not computed | [guess] |

### Per-family notes (energy, knock, sink, friends and enemies)

- **Bearing.** Energy: a same-size random slope is ~2 bits from tan φ; each further bit halves the share of slopes that
  reach it [calc for the random baseline; rarity guess]. Knock: +1 on the top of a deep convergent drops 33.5 → 13.4,
  about log2 q [calc]. Sink: 0 and ∞ score ≤ 1. Fights every other Bearing on the gradient; cooperates with Star (the line
  through the star at angle φ is one irrational target both can approach) and partly with Whole stair (Pythagorean slopes
  are dense among angles, but good ones near φ are rarer than either alone [guess]). Risk: the continued-fraction lens
  makes copying tan φ's coefficients cheap per term; deal φ whose coefficients are irregular and check the cost of a
  CF-lens turn before dealing.
- **Whole stair.** Energy is rarity of the exact or near Pythagorean slope, ≈ U bits [calc]. Knock on p or q wipes the
  excess (20/21 → 21/21: 0.6) [calc]; moves on the intercept, swap (reflection in y = x) and negate are free: a mirror
  lens shortcut by construction. Sink: flat and vertical score 0 [calc]. Cooperates with Ring (square ρ) and Whole
  triangle; fights Bearing and Corner on (p, q).
- **Corner.** Same rarity shape as Whole stair [guess]. Knock on p or q wipes; intercept free. Sink check: a near-flat
  family p/q = 1/(2nk²) is exact at every k (1/40 for n=5 [calc]); it is a ladder, not a free lunch (each step changes q by
  ~4nk), but it is a cheap lane; consider measuring size by √(p²+q²) or excluding |p|=1. **Fights Whole stair, famously**:
  a slope that is both exact is a right triangle with whole sides and area n × square, i.e. n is a *congruent number*
  (true by construction; checked n = 6: 3,4; n = 5: 9,40; n = 7: 175,288 [calc]). For n = 1, 2, 3 no such slope exists
  (Fermat), so the two pull apart for ever; for n = 157 the smallest joint slope has dozens of digits.
- **Ring.** Never exact for ρ with a prime ≡ 3 (mod 4) to an odd power (true by construction). Knock: c+1 drops
  14.9 → 6.3, a+1 → 10.1 [calc]. Sink: the two vertical and two flat tangents approximate √ρ through Pell-like numbers; they
  are a legitimate thin ladder, not trivial lines [guess]. With a square ρ, exact tangency needs a Pythagorean direction,
  so Ring rides on Whole stair (one c-turn from a Pythagorean line, costing about the bits of c [guess]).
- **Star.** A random same-size line is ~1 unit from the star (U ≈ 0); best lines improve about 2 bits per bit of height
  (Dirichlet; ladder above) [calc ladder, rarity guess]. Knock on c loses all of it beyond log2 of the height; knock on a
  loses less. Sink: none (the origin and axes are irrationally far). Cooperates with Bearing and Ring (common tangents
  through the star: two target lines); fights other Stars on c.
- **Belt.** Four target lines; min() means both coins must improve together. Partly contrived (a min of two Rings).
- **Mirror.** A one-dimensional family of good lines (like Ring); exact hits possible when ρ is rational-friendly, so deal
  ρ as for Ring. Contrived: a 12-year-old can read it, but scoring needs a reflection formula.
- **Shared factors.** Rarity: P(gcd ≥ G) ~ 1/G for each pair [guess]. Knock: +1 on c kills two of the three gcds, keeps the
  third. Sink: through-origin (c = 0) and axis lines make gcd(x, 0) huge, hence gcd(x, 0) := 1. Cooperates with Whole
  triangle (c a multiple of a and b) and with smooth-number rules from other angles; fights Whole stair weakly (gcd(a,b) > 1
  means the line misses every lattice point). The cheapest lens for it is prime exponents, where it is easy to see and
  build: watch that it is not a cheap pump.
- **Whole triangle.** A composite of Whole stair and Shared factors. Contrived; listed so the pair is visible.
- **Two bearings.** A min of two approach rules; the target is one irrational line. Contrived (min of two numbers) and
  narrows to a single region; not for a first deal.

## Ranking for a first deal

1. **Bearing**: the clearest card; unbounded; graceful under knocks; huge parameter set.
2. **Whole stair**: one equation, exact hits at every height, utility ≈ rarity [calc].
3. **Corner**: same machinery as Whole stair on the same two numbers; together they are the congruent-number problem.
4. **Ring**: geometric, never exact, couples a, b and c.
5. **Star**: the simplest incidence rule; pulls c against Ring and Bearing.

## The two most interesting pairings

- **Whole stair × Corner (n dealt).** Both read the slope's p and q, both are exactness rules, and joint exactness is
  exactly "n is congruent". Deal n = 1, 2, 3 (or 10, 11) and the pair can never both be met: permanent tension with
  partial agreements. Deal n = 5, 6, 7 and there is a joint target, reachable only by many steps. This is the cleanest
  case of rules that "pull against each other" on one shared number with a deep, well-studied landscape behind it.
- **Bearing × Ring.** One pins the gradient to an irrational angle, the other ties c to (a, b). Both are approach rules;
  there are exactly two lines meeting both at full depth, but each player's bits rise along different moves (gradient
  lens for one, c for the other), so the pair cooperates while a third rule (Star, or a second Bearing) pulls one of
  those numbers away.

## Honest about contrivance and risk

- Contrived: Belt, Mirror, Whole triangle, Two bearings (min-of-two and composite rules). Shared factors is arithmetic
  dressed as cross-lens and its card is not 12-year-old clear.
- Approach rules with full depth have finitely many target lines per pair (true by construction); diversity comes from
  the deal, not from within a rule. **How this could be wrong:** if players can copy continued-fraction coefficients of
  tan φ or √ρ cheaply in the CF lens, approach rules become a lookup, not a climb; the cost of one CF-lens turn that
  adds k correct terms must be checked against the energy it buys before these are dealt.
- Exactness rules are knife-edged on their own numbers; the "keep some value" property holds only for moves on the other
  numbers. **How this could be wrong:** an agent may find that the cheapest climb jumps between exact solutions (a
  Pythagorean slope to the next) by a representation shortcut I have not priced.
- Every rarity figure except Whole stair's is a guess until the scorer measures it; the ladders are calculations.
