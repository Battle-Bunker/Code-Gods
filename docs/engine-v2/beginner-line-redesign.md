# The ten beginner line families, redesigned against the design principles (15 November 2026)

Status: design only, for the spec lead to value and build. Nothing here changes the dealt pool. The acceptance test is
[design-principles.md](design-principles.md). The owner's words that set this task: "We want long ladders that are
hard to climb and highly configurable rule families where random instances of each are highly likely to be close to
perpendicular and secondary rules that are entangled with the primary rule so that choice of primary rule impacts how
well one can optimise the secondary one and moving to a higher primary energy requires starting over to climb higher on
the secondary dimension."

Every family keeps its name, its reading of the line and its story. What changes is that its main part becomes an
unbounded ladder, and its tie-breaker reads the number the main part has reached. The worked lines were computed with
a small exact script (rational arithmetic, kept with the session's scratch work), not with the engine's value
functions. The bits rows are argued, not valued: valuing is the spec lead's.

---

## 1. One template for all ten

**The ladder (main part).** The family reads a number v from the line (the y-intercept, the crossing, an area …). It
deals a set S of whole numbers and a rung count ρ on S, such as "how many primes ending in 3 are multiplied together",
or "how many times 3 divides it". The main part scores

  M = max over A in S of [ ρ(A) − log2(1 + |v − A|) ].

- **No top.** ρ is unbounded, so there is always a higher rung.
- **Each rung is rarer.** ρ counts prime factors of a qualified kind, so under the mixed code each rung costs about half
  the smallest qualifying prime, in bits. That is a log ramp in the size of the number, with no linear tail. The
  engine's clamp of value tails to φ applies as usual.
- **Incremental.** A line that does not land on S is graded by the log of its distance, so the climb has no cliffs.
- **Far anchors barely pay.** A rung-ρ member is at least about 2^ρ in size, so ρ − log2|v − A| is small unless v is
  near A. In v_q ladders a far anchor can still win at a low score (§4.7); that is by the formula.

The family's **anchor** A* is the winning A (ties go to the larger ρ, then to the smaller |A|). Two families (Prime
Staircase, Divisibility Ladder) are runs: there M = run length + a graded fraction for the next term, and the anchor is
the run's last term. Treasure is a pure approximation ladder (§4.4).

**The tie-breaker (entangled, restarting).** T counts the trailing digits, in a dealt base B, that A* shares with a
second whole-number reading R of the line. R is the whole part of the gradient, the whole number nearest the
y-intercept, and so on. Three rules make T fair:

1. Trailing zeros (factors of B) are removed from both numbers first, so two multiples of 100 do not match for free.
2. Digits are compared only while both numbers still have digits.
3. B shares no prime with the ladder's qualifier. Otherwise successive anchors (5, 25, 125 …) share endings and the tie
   would not restart.

T is unbounded, and each matched digit is about log2 B bits rarer.

**Why the tie-breaker restarts.** Stepping up a rung moves A* to a different number. The digits R matched against the old
anchor no longer count, and the climb on R starts again. The only exception is a shared ending between the old and new
anchors, which rule 3 makes uncommon. This is the owner's example, "the largest common factor of that nearest integer
and the floor of the gradient", in a form whose climb provably restarts: a gcd with a growing anchor keeps its old
factors, so it would not restart.

**Card wording** for B = 10: "…should end in as many of the same digits as possible (zeros at the end don't count)".
For B ≠ 10: "…should leave the same remainder when divided by 7, by 49, by 343 …, as far as possible".

**Why random instances are close to perpendicular.** The mixed code draws a, b and c independently, and within each
number it draws each prime's exponent independently. Families that read different numbers of the line, or different
prime classes, reward independent structure. The digit tie-breakers are close to uniform. Measured support: rules that
read one coordinate and one prime had PMI 0–1.5 bits (line-rules-v3-proposals §A10), and random parameterised pairs had
a median PMI of 0.8 (§A11). **Aligned pairs the dealer must keep apart:** two rules reading the same number with the
same prime class, for example Pythagorean Area with q = 3 and Square Area with root a multiple of 3.

---

## 2. The check for all ten (argued; rows 5, 8 and 9 to be measured by the spec lead)

| Family | 1 Unbounded? | 2 Ladder (bits per rung, argued) | 3 Tie-breaker restarts? | 4 Instances | 6 Named adversaries |
|---|---|---|---|---|---|
| Prime Landing | yes (Ω) | 1.5–3.5 by class | yes (§4.1) | ~15 | Ruler, Same on Both Rulers, other c-classes |
| Prime Gradient | yes (Ω) | 2.5–8.5 by class | yes (§4.2) | ~15 | Divisibility Ladder, Treasure, Square/Pythagorean Area |
| Prime Staircase | yes (run, Green–Tao) | rises with the run; value clamped to φ | yes (§4.3) | ~24 | Divisibility Ladder, Prime Gradient, Treasure |
| Treasure | yes (an irrational target) | about 3.3 per digit by rarity | yes (§4.4) | 12 | Divisibility Ladder, Prime Staircase, Prime Gradient |
| Same on Both Rulers | yes (B^e) | 1–3.5 by B | yes (§4.5) | 10 | Prime Landing, Prime Gradient, Whole Crossing |
| Pythagorean Area | yes (v_q) | about q/2 | yes (§4.6) | 7 | Square Area (other q), Ruler, Whole Crossing |
| Whole Crossing | yes (v_q(N − r)) | about log2 q | yes (§4.7) | ~15 | Pythagorean and Square Area, Same on Both Rulers, Ruler |
| Ruler | yes (v_q) | about q/2 | yes (§4.8) | 12 | Prime Landing, Pythagorean Area, Same on Both Rulers |
| Square Area | yes (exponent k) | about ½·sopfr(root) | yes (§4.9) | ~8 | Pythagorean Area (other q), Whole Crossing, Prime Landing |
| Divisibility Ladder | yes (run) | 1–3 (lcm growth) | yes (§4.10) | 8 | **open fail** (measured 15 Nov, #817: no family opposes more than 7% of its climbs; merged dealt by the coordinator; Prime Staircase is to be made to contest its heights) |

- **Row 5 (perpendicular).** Argued in §1. The pairwise PMI table is the spec lead's.
- **Row 8 (reach).** Log ramps keep values out of the hundreds. 20 bits needs about 6–15 rungs.
- **Row 9 (balance and dynamism).** The template is the same across families. Per-rung costs differ by class and B and
  must be calibrated into the band by valuation. Drift of the dealt value is the coordinator's trial
  (line-rules-v3-proposals §A13).

---

## 3. Parameters, by family

| Family | Reading v | Qualifier and rung ρ | Tie-breaker reading R | Grid |
|---|---|---|---|---|
| Prime Landing | the y-intercept c | numbers built only from primes in a class; ρ = Ω | ⌊m⌋ | class ∈ {ends in 3, ends in 7, ≡ 1 mod 4, ≡ 3 mod 4, ≡ 1 mod 3, ≡ 2 mod 3} × B ∈ {10, 7, 9} without clashes |
| Prime Gradient | the gradient's bottom number q (lowest terms) | as Prime Landing | round(c) | as Prime Landing |
| Prime Staircase | the heights y(0), y(1), … | a run of distinct primes in a class | ⌊m⌋ | class ∈ {ends in 1, 3, 7 or 9; ≡ 1 or 3 mod 4; ≡ 1 or 2 mod 3} × B ∈ {9, 10, 7} |
| Treasure | the height y(k) | digits matched to an irrational τ | ⌊m⌋, against the denominator of y(k) | k ∈ {2, 3, 5} × τ ∈ {√2, √3, √5, golden ratio} |
| Same on Both Rulers | the unchanged number c/(1 − m) | ±B^e; ρ = e | round(m/(m − 1)), the lamp | B ∈ {2, 3, 5, 6, 10} × tie base {3 or 10, 7} |
| Pythagorean Area | the area with the axes | v_q(A) | round(hypotenuse²) | q ∈ {3, 7, 11, 13} × B ∈ {10, 9 (not with q = 3)} |
| Whole Crossing | the crossing X | v_q(N − r) | round(c) | (q, r) ∈ {(2,1), (2,3), (3,1), (3,2), (5,2), (5,3), (7,3)} × B coprime to q |
| Ruler | the distance² c²/(a² + b²) | v_q(A) | round(c), or round(X) for a vertical line | q ∈ {5, 13, 17, 29} × B ∈ {3, 10, 7} |
| Square Area | the area | the largest k with A = r^k and q dividing r | round(X) | q ∈ {2, 3, 5, 7} × B without clashes |
| Divisibility Ladder | the heights y(s), y(s+1), … | a run with d·i dividing y(i) | ⌊m⌋, against y(n)/(d·n) | d ∈ {1, 2, 3, 5} × s ∈ {1, 2} |

That is about 130 dealable instances before the equal-opportunity band is applied.

---

## 4. The ten families

Each family gives the card (with one dealt instance filled in), the exact definition and two worked lines that show the
tie-breaker restart.

### 4.1 Prime Landing

**Card (k = 3):** "Land the y-intercept on a number made only by multiplying primes that end in 3 (3, 9, 13, 27, 39, 69,
117 …). The more primes multiplied together, the better; being near one counts a little less. Tie-breaker: that number
and the whole part of the gradient should end in as many of the same digits as possible (zeros at the end don't
count)."

**Definition:** v = c; S = {±n : every prime factor of n is in the class}; ρ = Ω. T = match(A*, ⌊m⌋, B).

**Worked lines:**
- y = −13x − 13: A* = −13, M = 1. ⌊m⌋ = −13, so T = 2.
- One stretch (×2), y = −26x − 26: A* = −27 = −3³, M = 3 − log2 2 = 2 (higher). "27" vs "26", so T = 0: a restart.

### 4.2 Prime Gradient

**Card (≡ 1 mod 4):** "Write the gradient as a fraction in lowest terms. Its bottom number should be built only from primes
that leave 1 when divided by 4 (5, 13, 17, 25, 65 …): the more primes multiplied, the better; being near one counts a
little less. Tie-breaker: that number and the whole number nearest the y-intercept should end in as many of the same
digits as possible."

**Definition:** v = q, the bottom number of m; ρ = Ω on the class; T = match(A*, round(c), B). This uses the balance fix
of line-rules-v3-proposals §A13: the gradient's bottom number reaches 12.5 bits, against 16.9 for the gradient itself.

**Worked lines:**
- y = x/13 + 13: M = 1, A* = 13, T = 2.
- y = x/169 + 13: M = 2 (169 = 13²). "169" vs "13", so T = 0: a restart. Re-climbing with c = 69 gives T = 2.

### 4.3 Prime Staircase

**Card (ending in 7, B = 9):** "Starting at x = 0, as many heights in a row as possible should be different primes ending in
7. The next height being near such a prime counts a little. Tie-breaker: the last prime of your run and the whole part
of the gradient should leave the same remainder when divided by 9, by 81, by 729 …, as far as possible."

**Definition:** L = the longest prefix of y(0), y(1), … made of distinct whole primes in the class.
M = L + 0.99/(1 + d), where d is the distance from y(L) to the nearest class prime. A* = y(L − 1). T = match(A*, ⌊m⌋, B).

**Worked lines:**
- y = −x/5 + 37: run 1, M = 1.82, A* = 37, T = 1.
- y = 10x + 37: the heights 37, 47, 57 give run 2, M = 2.09, A* = 47, T = 0: a restart.
- y = 30x + 7: the heights 7, 37, 67, 97, 127, 157 give run 6.

### 4.4 Treasure

**Card (k = 2, τ = √2):** "At x = 2 the line's height should match the treasure number 1.41421356… (the square root of 2) to
as many decimal places as possible. Tie-breaker: write that height as a fraction in lowest terms; its bottom number and
the whole part of the gradient should end in as many of the same digits as possible."

**Definition:** M = −log10|y(k) − τ|. A* = the denominator of y(k). T = match(A*, ⌊m⌋, 10).

**Worked lines:**
- y = 5x − 43/5: y(2) = 7/5, M = 1.85, T = 1.
- y = 5x − 103/12: y(2) = 17/12, M = 2.61. "12" vs "5", so T = 0: a restart. y = 12x − 271/12 gives T = 2.

**Honest risk:** the best approximations are the continued-fraction convergents, which is a one-sentence path. The
tie-breaker and the adversaries contest it.

### 4.5 Same on Both Rulers

**Card (B = 2):** "The number the machine leaves unchanged should land on a power of 2: the higher the power, the better;
being near one counts a little less. Tie-breaker: that power and the whole number nearest the lamp's height m/(m − 1)
should leave the same remainder when divided by 3, by 9, by 27 …, as far as possible."

**Definition:** v = c/(1 − m); S = ±B^e with ρ = e. T = match(A*, round(m/(m − 1)), 3). A line with m = 1 scores worst.

**Worked lines:**
- y = (7/5)x − 77: u = 192.5, A* = 256, M = 1.99. The lamp rounds to 4, so T = 2.
- One tilt (−1), y = (2/5)x − 77: A* = −128, M = 6.58. The lamp rounds to −1, so T = 0: a restart.

### 4.6 Pythagorean Area

**Card (q = 3):** "The triangle the line cuts off the axes should have an area that lands on a multiple of 3 as many times
over as possible; being near one counts a little less. Tie-breaker: that number and the slanted side squared should end
in as many of the same digits as possible (zeros at the end don't count)."

**Definition:** v = |c·X|/2; ρ = v_q. T = match(A*, round(c² + X²), 10).

**Worked lines:**
- y = −(5/4)x − 75: area 2250, M = 2, hypotenuse² = 9225, T = 3 ("225").
- One shift (+1), y = −(5/4)x − 74: A* = 2187 = 3⁷, M = 4.86. T = 0: a restart.

### 4.7 Whole Crossing

**Card (q = 2, r = 1, B = 3):** "The line should cross the x-axis at a whole number N for which N − 1 can be divided by 2 as
many times as possible (3, 5, 9, 17, 33, 65, 129 …); being near one counts a little less. Tie-breaker: that number and
the whole number nearest the y-intercept should leave the same remainder when divided by 3, by 9, by 27 …, as far as
possible."

**Definition:** v = X; ρ(N) = v_q(N − r). T = match(N*, round(c), B).

**Worked lines:**
- y = −x/2 + 43: X = 86, N* = 129, M = 1.54. 129 with its 3s removed is 43, the same as round(c) = 43, so T = 4.
- One tilt (−1), y = −(3/2)x + 45: X = 30, N* = 33, M = 3.0. T = 1: a restart.

### 4.8 Ruler

**Card (q = 5, B = 3):** "The distance from (0, 0) to the line, squared, should land on a whole number that is a multiple of 5
as many times over as possible; being near one counts a little less. Tie-breaker: that number and the whole number
nearest the y-intercept should leave the same remainder when divided by 3, by 9, by 27 …, as far as possible."

**Definition:** v = c²/(a² + b²) from the general form, defined for vertical lines too, which fixes the artefact the
annotations session found. ρ = v_q. T = match(A*, round(c), B), with round(X) for vertical lines.

**Worked lines:**
- y = −7x − 50: distance² 50, M = 2, T = 4.
- A tilt of +6, y = −x − 50: distance² 1250, M = 4, T = 1: a restart.

### 4.9 Square Area

**Card (root a multiple of 3):** "The triangle the line cuts off the axes should have an area that lands on a perfect power
whose root is a multiple of 3 (9, 27, 36, 81, 216, 729 …): the higher the power, the better; being near one counts a
little less. Tie-breaker: that number and the whole number nearest the x-crossing should end in as many of the same
digits as possible."

**Definition:** ρ(A) = the largest k ≥ 2 with A = r^k and q dividing r. T = match(A*, round(X), 10).

**Worked lines:**
- y = −2x − 72: area 1296 = 6⁴, M = 4, round(X) = −36, T = 1.
- y = −2x − 54: area 729 = 3⁶, M = 6, round(X) = −27, T = 0: a restart.

### 4.10 Divisibility Ladder

**Card (d = 1):** "y(1) should be a multiple of 1, y(2) a multiple of 2, y(3) of 3, and so on: make the run as long as
possible. The next height being nearly a multiple counts a little. Tie-breaker: the last height of your run divided by
its position, and the whole part of the gradient, should end in as many of the same digits as possible."

**Definition:** n = the run length. M = n + 0.99·(1 − 2‖y(n+1)/(d(n+1))‖). A* = y(n)/(d·n). T = match(A*, ⌊m⌋, 10).

**Worked lines:**
- y = −13x + 78: run 3, M = 3.0, A* = 13, ⌊m⌋ = −13, T = 2.
- One stretch (×2), y = −26x + 156: run 4, M = 4.59, ⌊m⌋ = −26, T = 0: a restart.

**As built (15 Nov, #817; owner-decisions trial 27):** the run of n dividing y(n), with no top, in triangular levels;
tie-breaker gcd(y(n), n) where the run stops at n.

**For later: a residue reading** (the spec lead's proposal, kept by the coordinator for later, not now). Make the rule
"y(n) leaves 1 when divided by n", excluding c = 1 as c = 0 is excluded now. For a whole gradient a run of k then needs
c ≡ 1 (mod lcm(1, …, k)). Prime Staircase and Divisibility Ladder would then read the same number, y(0) = c, and
contest it along a climb; today they only exclude each other. The cost:
- With Prime Staircase ending 9 they still exclude (c ≡ 1 (mod 10) does not end in 9).
- With ending 1 they partly align, because 1 + t·lcm has no small factors, so it is prime more often. That would need
  the seating rule.

---

## 5. What is not settled

- **Rows 5, 8 and 9 of the check need valuation.** That means the PMI table, the starter's reach opposed and unopposed,
  balance and moving share. They are the spec lead's.
- **Per-rung cost differs by class and base** (from 1 to about 8.5 bits). Calibrate each dealt value and keep only those
  in the band (the coordinator's call: no par-normalisation).
- **Treasure's convergents are a closed-form path to its main part.** Watch it in play.
- **The tie-breaker's digit matching is mechanical.** If players find it unappealing, the owner's gcd form can replace it
  where the anchor changes completely between rungs (prime anchors). It does not restart with a growing anchor, because
  the old common factors carry over.
