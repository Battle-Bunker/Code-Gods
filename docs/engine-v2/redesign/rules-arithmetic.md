# Rule families from arithmetic fine structure

Designer-analyst note, 17 November 2026 (Melbourne). Fresh designs: I did not read the existing rule code or rule docs.
Claim labels: **[calc]** I checked it with a small script (40-bit random numbers, 100,000 to 200,000 samples);
**[constr]** it is true by construction or by algebra; **[guess]** it is a conjecture. "Bits" below means log2.

Common conventions. A rule reads one or more whole numbers of one lens (the card names which). A zero, an undefined
lens (a vertical line has no gradient) or an empty structure scores 0. Every utility is unbounded and is ~0 on a
random line; what pays is how rare the structure is among lines of the same size.

## The ten families

### 1. Prime Palette
*Card:* "You are dealt a few primes. Every time one of them divides your number, you score its size in bits."
*Utility:* U = Σ_{p∈S} v_p(n)·log2 p. Here n is the dealt lens number and v_p(n) is how many times p divides n.
*Parameters:* a set S of 1–3 primes below 100 (or a residue class, such as "primes that are 1 more than a multiple of 4"),
times about 10 lens numbers: about 26,000 cards.
*Depth:* a random n has v_p ≈ 0 and P(p^k | n) = p^−k, so energy grows by about log2 p per level **[constr]**.
*Ladder (S={3}, top of gradient):* 7 → 0; 9 → 3.2; 81 → 6.3; 5·3^10 → 15.8; 7·3^20 → 31.7.
*Knock:* adding 1 wipes everything (3 | n means 3 ∤ n+1) **[constr]**. Multiplying or dividing by other primes leaves
the score alone. This is the sharpest knife edge in the set: the score is easy to destroy and costly to repair (locks
are the defence).
*Sink:* 0 and ±1 score 0. *Fights:* family 2 for the bits of the same number (concentration against spread), and
any palette that wants the same prime on the other side of the fraction (lowest terms keep p in only one of top and
bottom) **[constr]**. *Cooperates:* palettes that share a prime; family 8.

### 2. Many Ways
*Card:* "Count the ways your number splits into equal groups using small primes. More ways, more points."
*Utility:* U = Σ_{p≤31} log2(1 + v_p(n)), that is, log2 of the number of 31-smooth divisors of n.
*Parameters:* the lens number and an optional prime pool. This is a small space.
*Random 40-bit n* **[calc]**: median 2.0, 99th percentile 5.6, 99.9th percentile 7.0.
*Ladder* **[calc]**: 12 → 2.6; 720720 → 7.9; 2^40 → 5.4; 3·5·…·31 → 10.0; 2^6·3^4·5^2·7^2·11·…·23 → 13.3.
*Knock:* adding 1 sends it to about 0 **[calc]**. *Sink:* 1 → 0. *Fights:* family 1 with a single prime (2^40 scores
only 5.4). *Cooperates:* family 8.

### 3. Golden Path (continued-fraction word)
*Card:* "Your fraction is a path down the tree of all fractions. You are dealt a repeating pattern of steps; you score
one point for every step that follows it before your path leaves it."
*Utility:* U = the number of leading partial quotients of x = t/u that match the dealt periodic word w (x = [a0; a1,
a2, …]). A bits-weighted variant is U = log2 of the denominator of the last matched convergent.
*Parameters:* periodic words with entries 1–9 and period up to 4 (about 7,400), times about 5 fraction lenses. Each
word is a quadratic irrational θ (w = [1] is the golden ratio, [1;2] is √2), so the rule says "approximate θ".
*Depth:* each extra matched quotient multiplies rarity by roughly 3–10; the factor depends on the entry
(Gauss–Kuzmin) **[calc, w=[1]: 42%, 3.4%, 3.3%, 1%, 0.45% for depths 1–5]**. It is unbounded: there are convergents at
every size.
*Ladder (w=[1]):* 2/1 → 2; 5/3 → 4; 21/13 → 5; F30/F29 → 28 **[calc]**.
*Knock:* a perturbation hits the tail, not the head. F30/F29 with +1 on the top keeps 14 of 28, and +1 on the bottom
keeps 13 **[calc]**. This is the most graceful family here.
*Sink:* 0 and 1/1 score at most 1. *Fights:* every Golden Path card with a different word on the same fraction (the
paths split at the first differing step) **[constr]**. *Cooperates:* family 4 when θ = √D.

### 4. Archimedes (Pell closeness)
*Card:* "Make top² − D·bottom² as small as you can while the numbers stay big. Big numbers with a tiny difference score
a lot."
*Utility:* U = log2(t² + D·u²) − log2|t² − D·u²|, for the dealt fraction t/u and a non-square D. If t² = D·u² (it
cannot happen when D is not a square) U = 0.
*Parameters:* non-square D up to 1,000 (about 970), times the fraction lenses.
*Random 40-bit pairs* **[calc]**: median 1.6, 99th percentile 7.2, 99.9th percentile 10.4.
*Ladder (D=2, convergents of √2)* **[calc]**: 3/2 → 4.1; 17/12 → 9.2; 239/169 → 16.8; 8119/5741 → 27.0;
54608393/38613965 → 52.4.
*Knock:* +1 on the top → 25.7 and +1 on the bottom → 25.2, so about half is kept; ×3 → 0.3 **[calc]**. A
representation shortcut (multiply) destroys, while a small additive knock only halves.
*Sink:* small fractions score little; a zero top gives log2 D − log2 D = 0.
*Fights:* family 5 on the same D (below), and Archimedes with a different D on the same fraction.
*Cooperates:* family 3 with θ = √D (this is the same structure read through two numbers; deal at most one of the pair
per θ).

### 5. Hensel (the same form, read by divisibility)
*Card:* "Compute top² − D·bottom². Score log2(p) points for every time the prime p divides it."
*Utility:* U = v_p(t² − D·u²)·log2 p, where D is a non-zero square mod p (so 7-adic √D exists) and D is not a
square (so the form is never 0 for a nonzero line).
*Parameters:* (D, p) pairs: thousands.
*Random pairs* **[calc, D=2, p=7]**: P(v ≥ 1, 2, 3, 4, 5) = 0.27, 0.055, 0.011, 0.002, 0.0003, so each level costs about
2.4–2.8 bits.
*Ladder:* x/1 with x the 7-adic √2 truncated: 3 → v=1, 10 → 2, 2166 → 4, 1802916 → 8 **[calc]** (these score
about 0 on Archimedes).
*Knock:* +1 on the top changes the form by 2t+1, usually not divisible by 7, so the score goes to 0 **[constr]**.
Adding a multiple of 7^j keeps j levels. This is a knife edge, like family 1.
*Sink:* t = 0 gives v_p(D) = 0.
*Fights Archimedes structurally:* if 7^k divides N then |N| ≥ 7^k, so A + 2.81·H ≤ log2(t² + D·u²) **[constr]**.
Both can be high only on big lines whose norm is exactly a power of p (such as 3² − 2·1² = 7, multiplied by powers of
the unit 3 + 2√2). That shared target is far away and has to be reached by many steps.

### 6. Farey Kin
*Card:* "Two of your line's fractions are kin when cross-multiplying them gives numbers that differ by 1. Score big
fractions that are close kin."
*Utility:* U = 2·log2 max(|p|,|q|,|r|,|s|) − log2|p·s − r·q| for the gradient p/q and the y-intercept r/s (other
pairs of lens fractions are possible). If the two fractions are equal, U = 0.
*Parameters:* which two fractions (about 10 pairs). This is a small space; a weakness.
*Ladder:* (1/2, 1/3) → 3.2; (3/5, 2/3) → 4.6; (13/21, 8/13) → 8.8; consecutive Fibonacci ratios near 2^20 → about 40
**[constr]**.
*Knock:* +1 on p changes the determinant by s, so about half is kept **[constr]**.
*Sink:* 0/1 with 1/1 scores 0.
*Cross-lens identity* **[calc, 20,000/20,000 random lines]**: written as ax + by + c = 0, the determinant equals
|c − a|·|b| / (gcd(a,b)·gcd(b,c)). So kinship in the gradient lens is factor-sharing in the a, b, c lens. See family 7.

### 7. Shared Secret
*Card:* "Write your line as ax + by + c = 0 with no common factor. Score the bits that each pair of a, b, c has in
common."
*Utility:* U = log2 gcd(a,b) + log2 gcd(b,c) + log2 gcd(c,a).
*Parameters:* the lens triple (small); weights by pair could enlarge it.
*Random 30-bit triples* **[calc]**: mean 2.5, 99th percentile 11.5.
*Structure* **[constr]**: the deep lines are a = xy, b = yz, c = zx with x, y, z pairwise coprime, and U = log2(xyz).
Then the gradient is −x/z, the y-intercept is −x/y and the x-intercept is −z/y: three fractions built from three numbers.
*Ladder (x, y, z):* (1, 2, 3) → 2.6; (7, 11, 13) → 10.0; (101, 103, 107) → 20.1; three 13-bit primes → about 39.
*Knock:* +1 on a kills two of the gcds and keeps gcd(b,c), so about a third remains **[constr]**.
*Sink:* (0, 1, c) would score log2 c, so this needs a guard: a zero coefficient scores 0.
*Mixed relation with Farey Kin (gradient, y-intercept):* the determinant is x·|y − z| **[constr]**. Kin wants x = 1 and
y, z adjacent; Secret wants x, y, z all big. They agree on big adjacent y and z and fight over x.

### 8. Long Run
*Card:* "Write your number in base b. Score the longest run of your dealt digit d."
*Utility:* U = (L − 1)·log2 b, where L is the longest run of the digit d (d ≠ 0) in base b.
*Parameters:* b from 3 to 36, d, and about 10 lens numbers: about 12,000 cards.
*Random 40-bit numbers, base 7, any digit* **[calc]**: run ≥ 4 has probability 3%, ≥ 5 has 0.4%, ≥ 6 has 0.05%.
*Ladder (b=7, d=3):* 3 → 0; 333₇ → 5.6; 3333333₇ → 16.8; twelve 3s → 39.
*Knock:* +1 and ×2 left a run of twelve 3s intact **[calc]**. A local add touches only the low digits; multiplying a
repdigit by a small number gives a near-repdigit **[guess beyond the checked case]**.
*Cooperates:* family 1 with primes dividing b^L − 1 (a repdigit is a multiple of (b^L − 1)/(b − 1); for example
19 | 7³ − 1) **[constr]**. *Fights:* family 1 with primes dividing b (n ≡ d mod b with d ≠ 0 means b's primes are absent
from n) **[constr]**.

### 9. Pythagoras
*Card:* "Your slope is rise over run. Score it when rise² + run² is nearly a perfect square: the triangle has whole
sides."
*Utility:* U = log2 s − log2(1 + |t² + u² − s²|), where s is the whole number nearest to √(t² + u²).
*Random 40-bit pairs* **[calc]**: median 1.0, 99.9th percentile 9.9.
*Ladder* **[calc]**: (3,4) → 2.3; (20,21) → 4.9; (119,120) → 7.4; (696,697) → 9.9; (4059,4060) → 12.5.
*Knock:* (4060,4060) → 0.8 **[calc]**, a total knife edge. Exactness is one-dimensional, so it has no partial credit.
*Cooperates:* family 1 with the primes that are 1 more than a multiple of 4 (every prime factor of a primitive
hypotenuse is one of these) **[constr]**. *Fights:* Golden Path and Archimedes cards whose θ is not a Pythagorean
slope; their paths diverge **[guess]**.

### 10. Mirror
*Card:* "Write your number in base b. Score every digit that matches its partner at the other end."
*Utility:* U = log2 b · #{i < L/2 : digit_i = digit_(L−1−i)} − (L/2)/b (the expected count is subtracted).
*Knock:* +1 breaks at most one pair (a carry can break more) **[constr]**. *Sink:* a one-digit number scores 0.
It fights the Long Run cards on other digits.

## Summary table

| # | Family | Cards | Knock (+1) keeps | Main partner / adversary |
|---|---|---|---|---|
| 1 | Prime Palette | ~26k | none | 8, 2 / 2, opposite palettes, 5 |
| 2 | Many Ways | small | none | 7 / 1 |
| 3 | Golden Path | ~37k | ~half [calc] | 4 / other words |
| 4 | Archimedes | ~5k | ~half [calc] | 3 / **5**, other D |
| 5 | Hensel | thousands | none (multiples of p^j keep j) | – / **4**, 1 |
| 6 | Farey Kin | ~10 | ~half | 7 (on y, z) / 7 (on x) |
| 7 | Shared Secret | small | ~third | 6, 2 / 6 |
| 8 | Long Run | ~12k | most [calc, one case] | 1 (b^L − 1) / 1 (primes of b) |
| 9 | Pythagoras | small | none [calc] | 1 / – |
| 10 | Mirror | ~300 | most | – / 8 |

## Scorer support (a fast list of good lines near a start)

- Families 3, 4 and 9: the convergents and semiconvergents of θ near the start's size, from the Stern–Brocot path.
- Family 5: the solutions of t ≡ r·u (mod p^k) form a lattice; take its short vectors near the start.
- Family 1: round n to the nearest multiples of p^k.
- Family 6: all fractions that are kin to p/q lie on r/s = r0/s0 + j·p/q (extended Euclid).
- Family 7: choose x, y and z from the start's own factors.
- Families 8 and 10: overwrite one digit window.

Each of these is microseconds of whole-number arithmetic for 64-bit inputs **[guess]**. Family 2 needs trial division
by 11 primes only.

## Ranking for a first deal

1. **Archimedes**: deep, graceful, a large parameter space, and a clean adversary.
2. **Golden Path**: the most graceful, the most readable, a huge parameter space.
3. **Hensel**: exists mainly as Archimedes' adversary. It is a knife edge, but the tension between the two is
   structural.
4. **Prime Palette**: the simplest card and a large parameter space. It is a knife edge to +1.
5. **Long Run**: graceful, and it cuts across the palettes in both directions.

Next is Farey Kin with Shared Secret, as a pair, once their parameter spaces are widened.

## The two most interesting pairings

- **Archimedes against Hensel on the same D and the same fraction.** The real and p-adic sizes of one number,
  t² − D·u², pull in opposite directions (A + H·log2 p ≤ log2(t² + D·u²), true by construction). Both score only on
  big lines whose norm is exactly p^k. Those are rare, found by formula, and reached by many additive steps. This
  conflict comes from mathematics, not from a contrived bolt-on, and I find it the most elegant item here.
- **Farey Kin against Shared Secret.** On a deep Secret line the kin determinant is x·|y − z| (true by construction).
  The two rules agree on y and z and fight over x, so they mix cooperation and conflict on named numbers in two
  different lenses.

## Honest weaknesses

- **Contrived or weak:** Mirror (recreational, depends on the base). Many Ways (the pool ≤ 31 and the log2(1 + e)
  weight are arbitrary, and it has few cards). Pythagoras (a total knife edge, few cards). Long Run depends on the base;
  it is moderately natural.
- **Small parameter spaces:** Farey Kin and Shared Secret would need weights or more lens pairs to give many distinct
  cards.
- **Overlap:** Golden Path with θ = √D and Archimedes with D are one structure. Dealing both for one θ removes the
  perpendicularity.
- **Knife edges:** families 1, 2, 5 and 9 lose everything to +1. Locks are meant to answer this, but the owner asked
  for rules that keep some value; the graceful families are 3, 4, 6, 7 and 8.
- **Peaks found by formula:** every deep state here (convergents, Pell units, Hensel lifts, repdigits) can be computed
  by anyone who reads the card. What protects the game is only that reaching such a state costs many steps and that
  many distinct ones are needed. The rarity figures above are for random 40-bit lines; I have not measured cheapest-turn
  energies with the real cost law, so "energy rises with depth" is a **[guess]** from rarity for every family.
- **How this could be wrong:** the rarities were measured on uniform random numbers with a fixed bit size, not on the
  scorer's actual same-size sampler. A sampler that fixes each number's size separately could make bottoms of 1, or
  integer gradients, common and so open sinks for families 3 and 4. I have not run any game dynamics.
