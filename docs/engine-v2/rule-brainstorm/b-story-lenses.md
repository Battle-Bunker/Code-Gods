# Rule brainstorm B: story lenses for the line

Status: brainstorm (14 November 2026; revised the same day for the owner's later rules, see the revision note), one of five independent brainstorms of layered rule families for the v2 line
([spec.md](../spec.md) §12, [owner-decisions.md](../owner-decisions.md)). This one's slant is **everyday stories and
metaphors**: the line is a taxi meter, a draining tank, two thermometers, a matchstick pattern, a shopping budget, a
ladder against a wall. Each family's primary is a sentence in the story's own words, and its secondaries are exact
arithmetic, often seen through a different representation from the primary's.

Every number in this document was computed exactly (Python `fractions`) by
[`scripts/b_story_lenses.py`](scripts/b_story_lenses.py):

```
python3 docs/engine-v2/rule-brainstorm/scripts/b_story_lenses.py --beginner [--census]   # the beginner set, §1
python3 docs/engine-v2/rule-brainstorm/scripts/b_story_lenses.py [--census]              # the full ladders, §2
```

## Revision: the owner's later rules, and what they changed

Relayed by the coordinator after the first version (PR #350):

1. *"Binary decisions are worthless for extending the ladder. Require all rules to be continuous."* Every rung is now a
   graded quantity (a distance, a count, a capped size). The five yes/no rungs of the first version were converted or
   replaced: Shopping's primary ("a basket exists") became the change left over; Catch-Up's "a real chase", Same
   Reading's "below zero", Fence Painters' "the painters differ" and Price per Minute's "there is a fee" became
   distances (§2). §4 lists every rung with its number of levels.
2. *"Optimise for the primary rules being maximally accessible to 12yos currently learning a standard linear equations
   curriculum at school. Secondary rules can be more advanced. Don't include tertiary rules for the beginner set,"*
   later loosened to *"allow a bit of latitude ... within reach of some dedicated study by a smart 12yo"*. The top
   eight (§5) are now the **beginner set** (§1): a primary in textbook words, marked **core** (curriculum) or
   **stretch** (what the child would look up), with the topic it practises, and exactly **one** secondary. The longer
   ladders of §2 are the **second pool**; for the beginner families they are second-pool variants.
3. *"I said I don't want tertiary preferences but I will want several secondary rule candidates within each family,"*
   with the coordinator's provisional call of no gating. Each beginner family now lists three to five graded candidate
   secondaries, each measured paired with the primary on ungated lines (§1.0); a dealt rule takes one.

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
  confining surcharge (spec §5.3) makes such lines vanishingly rare anyway, and the cap keeps the ladder finite for calibration.
- There are **no yes/no rungs** (the revision note at the top). A "smaller is better" size (a denominator) enters negated, capped at 12.

This is the spec's tie-break lever (§7.8, item 3), applied systematically. It also keeps every score a tuple of small
integers, which is what the card shows ("rung 6 of 8, then 3, then ...").

**Story gates (superseded for the beginner set).** In the first version several stories only made sense for some lines
(a draining tank needs c > 0 and m < 0), and outside the gate the score was WORST. The coordinator has since called for
no gating (provisional); §1.0 removes the gates from the beginner set and measures the result. The second-pool families
of §2 still show their gates and gated census figures; if the call stands they are ungated the same way (the story's
"no answer" becomes the primary's worst rung).

**Helpers.** `dZ(x)` is the distance from x to the nearest integer. "Nearest positive integer" N of x is 1 if x < 1, and
otherwise the nearer integer, ties to the smaller. `dPrime`, `dSq`, `dTri` are distances to the nearest prime (≥ 2),
square (0, 1, 4, ...) and positive triangular number (1, 3, 6, ...). `den(q)` is the denominator in lowest terms.

**Domain.** All families are written for `line-q`. On `line-z` (integer m and c) most "is it whole?" primaries are free,
so a family is only worth dealing on Z if its primary or first secondary still bites there; the summary table in §3
says which do.

**The census.** For "where the best lines sit", the script scores every non-vertical primitive line
a·x + b·y + c₀ = 0 with |a|, |c₀| ≤ 16 and 1 ≤ b ≤ 16 (14 369 lines), weights each by 2^−φ (φ the spec's Q read length,
§12.2: the cheap centre is heavy), and reports, for the primary's top rung and for the best tuple found, the number of
lines, a crude rarity in bits (−log₂ of the weight share) and the cheapest such line. This is a sketch to find
degenerate designs, not the calibration of spec §7: it has no walk, no mutator prices and a hard box. It earned its keep:
the first drafts of four families were topped by the flat line y = 0 or by a runaway, and were fixed (§6).

---

## 1. The beginner set: one primary, several candidate secondaries

The top eight (§5), each cut to two rungs. The primary uses what a first school course on linear equations teaches, or
what a keen 12-year-old could look up ("stretch"); the secondary may be more advanced. Distances are rungs on the Q
ladder (at most 9 levels, 0 to 8). Scores are `[P, S]`. Census figures in 1.1 to 1.8 are the crude rarities of §0 for the two-rung score with the first revision's gates; §1.0 gives the ungated figures.
The full stories, cards and collisions are in §2; the second-pool ladders there keep these primaries.

| # | Family | Primary, in textbook words | Curriculum topic | Level | Default secondary (others: §1.0) | Levels (P, S) |
|---|---|---|---|---|---|---|
| 1 | Matchstick Chains | Pattern 0 (before any shapes are built) has exactly one stick. | nth term of a sequence; the zeroth term is the y-intercept | core | the shapes have a prime number of sides, at least a triangle | 9, 9 |
| 2 | Steady vs Doubling | In some week from 1 to 8 the steady plan pays exactly what the doubling plan pays. | tables of values, substituting x; powers of 2 | stretch | it happens in a second week too | 9, 9 |
| 3 | Shopping Baskets | Buy at least one apple and one banana and spend as much as you can: the change left should be as small as possible. | substituting into ax + by = c; whole-number solutions | stretch | both prices are prime numbers | 6, 6 |
| 4 | Same Reading | There is a temperature where both thermometers show the same number; it should be a whole number. | solving a linear equation (x = mx + c) | core | the agreeing number has many prime factors | 4 (7 with the fine tail), 7 |
| 5 | Ladder Against the Wall | The foot and the top of the ladder (where the line meets the axes) are at whole-metre marks. | x- and y-intercepts | core | the ladder's length is a whole number of metres (Pythagoras) | 5 (8), 9 |
| 6 | Savings Goal | You reach exactly £100 after a whole number of weeks. | rate and starting amount; solving mx + c = T | core | you started with exactly one real coin | 9, 9 |
| 7 | Empty Tank | The tank is empty at a whole number of minutes. | the x-intercept; solving mx + c = 0 | core | the emptying minute has a big smallest prime factor | 5 (8), 7 |
| 8 | Price per Minute | On a 10-minute call the average price per minute is a whole number of pence. | substituting x; average = total ÷ minutes | stretch | the connection fee adds a whole number of pence (at least 1p) to each minute | 4 (7), 5 (8) |

Levels count the rungs a component can actually reach (§4). A distance to the nearest whole number is at most 1/2, so
on the Q ladder it only reaches rungs 5 to 8 (4 levels); a sum of two such distances, or a distance to the nearest
*positive* whole number of a positive quantity, is at most 1 (5 levels). I propose a **fine tail** for these rungs:
ladder thresholds `1, 1/2, 1/4, 1/8, 1/16, 1/32, 1/64, 0` (spec §4.4 lets a family declare its ladder), which gives
them 7 or 8 levels. The figures in brackets are with the fine tail. Shopping's change is whole pence (rungs for 0p,
1p, 2p, 3–4p, 5–8p, more: 6 levels), and so is its distance to prime prices.

### 1.0 No gates, and several candidate secondaries per family

A later correction relayed by the curator: *"I said I don't want tertiary preferences but I will want several secondary
rule candidates within each family."* A beginner **family** is one primary plus several graded candidate secondaries; a
**dealt rule** is the primary plus one of them, two rungs deep. The coordinator's provisional call is also applied
here: **no gating**. The score is a plain lexicographic tuple `[rung(P), S]` defined on every line; where a story has
no answer (a level line never empties a tank), the primary takes its worst rung, a value like any other, not WORST.

**The primaries without gates** (run `scripts/b_story_lenses.py --candidates`):

| Family | Ungated primary | What changed |
|---|---|---|
| Matchstick Chains | rung(\|c − 1\|) | nothing (it had no gate) |
| Steady vs Doubling | rung(min over n = 1..8 of \|y(n) − 2ⁿ\|) | nothing |
| Shopping Baskets | prices A = \|a\|, B = b, budget C = \|c₀\| of the primitive a·x + b·y + c₀ = 0; rung of the least change (or the shortfall) | signs read as sizes; a level line is "apples are free" (A = 0) |
| Same Reading | rung(dZ(c/(1 − m))); m = 1 (the scales never agree) is rung 0 | falling and level "scales" are allowed |
| Ladder Against the Wall | rung(D(legX) + D(legY)), D = distance to the nearest **positive** whole number; a level line's leg is 0 | the ladder must stand at least 1 m from the corner, so a line through the origin is not free |
| Savings Goal | rung(D((100 − c)/m)); m = 0 is rung 0 | none needed beyond m = 0 |
| Empty Tank | rung(D(−c/m)), the line meets the time axis at a whole positive minute; m = 0 is rung 0 | a rising line reads as "a tank filling from empty": its x-intercept is when it was empty |
| Price per Minute | rung(dZ(y(10)/10)) | negative fees and rates are allowed |

Removing the gates makes three primaries much cheaper at the centre: Same Reading (~0.7 bits: y = 0 "agrees" at 0),
Price per Minute (~1.6 bits) and Shopping (~2.1 bits: y = 1 is free apples and 1p bananas). Their value then comes from
the secondary, which is why each needs at least one strong candidate.

**The candidates, each measured paired with its primary.** For each candidate: the best pair `[P, S]` found in the
census box, its crude rarity in bits (and how many bits it adds over the primary's top alone), the cheapest line that
reaches it, and the number of distinct levels the secondary showed. Candidates marked ★ are my recommended default;
candidates adding about a bit or less over the primary are listed under "weak" and should not be dealt (most are
satisfied for free by y = 0, y = x or y = 2x).

**1. Matchstick Chains** (primary top ~3.5 bits, cheapest y = 1)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| ★ the shapes have a prime number of sides, a triangle or more: D9(m + 1 to an odd prime) | [8, 8] | 7.8 (+4.3) | y = 2x + 1 | 9 |
| each new shape adds a whole number of sticks, at least 2 | [8, 8] | 6.7 (+3.2) | y = 3x + 1 | 9 |
| pattern 10 uses a prime number of sticks: dPrime(10m + c) | [8, 8] | 6.0 (+2.5) | y = x + 1 | 9 |
| pattern 10 uses a square number of sticks: dSq(10m + c) | [8, 8] | 4.5 (+1.0) | y = 1 | 9 |

**2. Steady vs Doubling** (primary top ~4.2 bits, cheapest y = 2x)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| the weeks the steady plan pays more (count, 0 to 8) | [8, 6] | 22.5 (+18.4) | y = 16x + 16 | 7 |
| ★ it happens in a second week too: the second-smallest gap | [8, 8] | 6.2 (+2.0) | y = 2x | 9 |
| the raise is a prime number of pounds: dPrime(m) | [8, 8] | 6.0 (+1.8) | y = 2x | 9 |
| week 8's steady pay is a square number: dSq(y(8)) | [8, 8] | 5.4 (+1.2) | y = 2x | 9 |
| weak: the raise is whole pounds; week 0's pay is whole pounds | [8, 8] | 4.3 (+0.1) | y = 2x | 4 |

The count is the strongest but its top lies far out (y = 16x + 16 meets 2ⁿ in week 7, 128, and pays more in weeks 1 to 6);
the second-week gap is the gentle default.

**3. Shopping Baskets** (primary top ~2.1 bits, cheapest y = 1, "free apples")

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| the number of exact baskets (count) | [8, 15] | 12.5 (+10.4) | y = x + 16 | 16 |
| ★ both prices are prime: dPrime(A) + dPrime(B) | [8, 8] | 9.1 (+7.0) | y = 3/2x + 7/2 (3x − 2y + 7 = 0: 3p and 2p, 7p) | 4 |
| a basket with twice as many bananas as apples: dZ(C/(A + 2B)) | [8, 8] | 4.1 (+2.0) | y = 2 | 4 |
| the budget is a square number: dSq(C) | [8, 8] | 3.3 (+1.2) | y = 1 | 4 |
| the budget is a prime number of pence: dPrime(C) | [8, 8] | 3.3 (+1.2) | y = 3 | 3 |
| weak: a basket with as many apples as bananas | [8, 8] | 2.4 (+0.2) | y = 1 | 4 |

The count runs away with the budget on unit prices (y = x + 16 is x − y + 16 = 0: 1p apples, 1p bananas, 16p, fifteen
baskets), so prime prices stay the default.

**4. Same Reading** (primary top ~0.7 bits, cheapest y = 0)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| ★ the agreeing number has many prime factors: Ω, capped at 6 | [8, 4] in the box | 11.3 (+10.6) | y = 16 | 5 seen (7 with the cap) |
| the multiplier is a prime number: dPrime(m) | [8, 8] | 4.6 (+3.9) | y = 3x | 9 |
| they agree below freezing: distance to −1, −2, ... | [8, 8] | 3.2 (+2.5) | y = −1 | 9 |
| weak: a simple multiplier; agree at a round ten; a whole multiplier | — | 1.1 to 1.6 (+0.4 to +0.9) | y = 0 | 4 to 20 |

Without the gate, Ω's cheapest top is the level line y = 16 (it "agrees" at 16 = 2⁴). Pairing Ω with the multiplier
being prime (a second-pool ladder) would push the top back to y = 2x + 16.

**5. Ladder Against the Wall** (primary top ~3.3 bits, cheapest y = x + 1)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| ★ the ladder is a whole number of metres long: dSq(legX² + legY²) | [8, 8] | 15.5 (+12.2) | y = 4/3x + 4 | 9 |
| the one-out-for-four-up safety rule: \|\|m\| − 4\| | [8, 8] | 11.9 (+8.6) | y = 4x + 4 | 8 |
| the triangle's area is a whole number | [8, 8] | 5.0 (+1.7) | y = x + 2 | 4 |
| the top is at a prime height: dPrime(\|c\|) | [8, 8] | 4.7 (+1.4) | y = x + 3 | 6 |

**6. Savings Goal** (primary top ~2.4 bits, cheapest y = x)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| you save a prime number of pounds a week: dPrime(m) | [8, 8] | 5.6 (+3.2) | y = 2x | 9 |
| ★ you started with one real coin (pence to the nearest coin) | [8, 8] | 5.4 (+3.0) | y = x + 1 | 6 |
| the number of weeks is a square number | [8, 8] | 4.3 (+1.9) | y = x | 6 |
| the goal ends a four-week month | [8, 8] | 3.5 (+1.1) | y = x | 3 |
| weak: you save one real coin a week | [8, 8] | 3.0 (+0.6) | y = x | 6 |

**7. Empty Tank** (primary top ~3.6 bits, cheapest y = x − 1)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| ★ the minute's smallest prime factor, capped at 13 | [8, 13] | 10.6 (+7.0) | y = x − 13 | 7 |
| it starts with a prime number of litres: dPrime(c) | [8, 8] | 6.7 (+3.2) | y = −x + 3 | 9 |
| it starts with a square number of litres: dSq(c) | [8, 8] | 6.2 (+2.6) | y = −x + 1 | 9 |
| it is half empty at a whole minute too: dZ(T/2) | [8, 8] | 5.7 (+2.1) | y = x − 2 | 4 |
| weak: it drains a whole number of litres a minute | [8, −1] | 4.5 (+0.9) | y = x − 1 | 12 |

**8. Price per Minute** (primary top ~1.6 bits, cheapest y = 0)

| Candidate secondary | Best pair | Bits (+ over P) | Cheapest top | Levels |
|---|---|---|---|---|
| ★ the fee adds a whole number of pence, at least 1p, to each minute: D(c/10) | [8, 8] | 9.6 (+8.0) | y = 10 | 7 |
| the average is a prime number of pence | [8, 8] | 5.1 (+3.6) | y = 3x | 9 |
| the rate is a prime number of pence a minute | [8, 8] | 5.1 (+3.6) | y = 3x | 9 |
| weak: a 10-minute call costs a square number of pence (+1.0); whole on a 20-minute call too (+0.0); whole averages for 1 to 10 minutes (+0.0) | — | 1.6 to 2.5 | y = 0 | 4 to 9 |

Every family keeps at least three candidates that add more than a bit. The ★ default is the one used in the examples
below (1.1 to 1.8), whose gate sentences are superseded by this subsection.

### 1.1 Matchstick Chains (core)

- **P** = rung(|c − 1|), pattern 0 is `seq.zeroth`. **S** = rung(distance from m + 1 to the nearest odd prime: 3 − (m + 1)
  when m + 1 ≤ 3), the shape's number of sides. A secondary of "prime" alone was topped by y = x + 1, a chain of
  two-sided shapes; asking for a triangle or more makes the cheapest top the triangle chain y = 2x + 1.
- Good: y = 4x + 1 (pentagons), [8, 8]. Middling: y = 3x + 1 (the textbook squares; 4 is one from 3 and 5), [8, 4].
  Bad: y = 1/2x + 5, |c − 1| = 4 and m + 1 = 3/2, [2, 3].
- Census: P top ~3.5 bits (y = 1); [8, 8] ~7.8 bits, cheapest y = 2x + 1.
- Card: patterns 0 to 3 in matchsticks, pattern 0's single stick ringed; one shape labelled with its sides and the
  nearest primes.

### 1.2 Steady vs Doubling (stretch: powers of 2)

- **P** = rung(min over n = 1..8 of |y(n) − 2ⁿ|). **S** = rung(second-smallest such gap).
- Good: y = 2x (weeks 1 and 2) and y = 42x − 80 (weeks 2 and 8), both [8, 8]. Bad: y = 1/2x + 7, gaps 1/2 (week 3) and 4
  (week 2), [5, 2].
- Census: P top ~4.2 bits; [8, 8] ~6.2 bits, cheapest y = 2x. A beginner top beside the centre; the far top (most weeks
  above the doubling plan) is a second-pool rung.
- Card: the two-row table of weeks 1 to 8, equal cells joined; the doubling dots and the line on a small plane.

### 1.3 Shopping Baskets (stretch: whole-number solutions)

- Line A·x + B·y = C (`gen`), (gated in the first revision; ungated in §1.0). **P** = rung(least change C − A·x − B·y over whole x, y ≥ 1 with
  A·x + B·y ≤ C; if one of each costs more than C, the shortfall A + B − C). **S** = rung(dPrime(A) + dPrime(B)).
- Good: 2x + 3y = 25, no change (e.g. 5 and 5), prime prices, [8, 8]. Middling: x + y = 5, [8, 3] (1p is not prime).
  Bad: 4x + 6y = 15, the best basket (2, 1) costs 14p and leaves 1p; 4 and 6 are each 1 from a prime: [4, 3].
- Census: P top ~5.9 bits (x + y = 3); [8, 8] ~11.1 bits, cheapest 2x + 3y = 7.
- Card: the pegboard's first quadrant, the best basket ringed with "1p change"; the till receipt "4p × 2 + 6p × 1 = 14p".

### 1.4 Same Reading (core: solving a linear equation)

- (First revision's gate m > 0, m ≠ 1; ungated in §1.0.) **P** = rung(dZ(c/(1 − m))). **S** = Ω(|n|), n the nearest integer to the agreeing reading,
  capped at 6.
- Good: y = 2x + 40 and the real y = 9/5x + 32 both agree at −40 = −2³·5: [8, 4]. Bad: y = 1/2x + 1/3 agrees at 2/3,
  [5, 0].
- Census: P top ~2.9 bits (y = 3x agrees at 0); [8, 4] ~14.1 bits, cheapest y = 2x + 16 (−16 = −2⁴). Ω 5 and 6 need
  readings like −32 and −64, further out.
- Card: the machine with the agreeing reading going in and coming out unchanged; its factor tree.

### 1.5 Ladder Against the Wall (core: intercepts)

- (First revision's gate m, c ≠ 0; ungated in §1.0.) **P** = rung(dZ(legX) + dZ(legY)). **S** = rung(dSq(legX² + legY²)).
- Good: y = −4/3x + 4, legs 3 and 4, length 5: [8, 8]. Middling: y = −x + 3, length² 18 (2 from 16): [8, 3]. Bad:
  y = −2/5x + 7/3, legs 35/6 and 7/3: [5, 2].
- Census: P top ~3.3 bits; [8, 8] ~15.5 bits (the 3-4-5 ladders). The steepest beginner climb: the secondary is the
  advanced step, as the owner allows.
- Card: the triangle with the ladder on its long side, whole-metre ticks, "3² + 4² = 25 = 5²".

### 1.6 Savings Goal (core: rate and starting amount)

- Goal T = 100 (m = 0: rung 0, §1.0). **P** = rung(|W − N|), W = (100 − c)/m. **S** = rung(distance from 100·c to the nearest
  coin in pence: 1, 2, 5, 10, 20, 50, 100, 200).
- Good: y = 1/2x + 2, 196 weeks, starting with a £2 coin: [8, 8]. Middling: y = x (start with nothing, 1p from a
  coin): [8, 4]. Bad: y = 3x + 1/3 (33⅓p is 40/3 from 20p): [6, 0].
- Census: P top ~2.4 bits; [8, 8] ~5.4 bits, cheapest y = x + 1. A gentle beginner family; its second-pool ladder adds
  a coin step and four-week months.
- Card: the savings table with the goal row, the starting coin drawn.

### 1.7 Empty Tank (core: the x-intercept)

- (First revision's gate c > 0 > m; ungated in §1.0.) **P** = rung(|T − N|), T = −c/m. **S** = spf(N), capped at 13 (the owner's own example shape).
- Good: y = −x + 7, empty at minute 7: [8, 7]. Middling: y = −2x + 4, minute 2: [8, 2]. Bad: y = −3/4x + 5/2,
  T = 10/3: [5, 3].
- Census: P top ~4.6 bits; [8, 13] ~11.6 bits, cheapest y = −x + 13.
- Card: the water under the line, the nearest whole minute on the time axis, its factor tree.

### 1.8 Price per Minute (stretch: average rate)

- K = 10 (first revision's gate m > 0, c ≥ 0; ungated in §1.0). **P** = rung(dZ(y(10)/10)). **S** = rung(|c/10 − N|), N the nearest positive integer:
  the fee spread over a 10-minute call adds a whole number of pence, at least 1p, to each minute. (A fee of 0 is 1p
  away, so fee-free plans, which meet the primary for free, do not top the secondary.)
- Good: y = 3x + 20, 50p for 10 minutes (5p a minute), the fee adds 2p a minute: [8, 8]. Middling: y = 2x (no fee),
  [8, 4]. Bad: y = 1/3x + 7/2, [5, 4].
- Census: P top ~3.6 bits; [8, 8] ~11.6 bits, cheapest y = x + 10.
- Card: the chord from the origin to (10, y(10)) with its slope "5p a minute", the rate m beside it.

---

## 2. The full ladders (second pool)

Every family with its full ladder. For the eight beginner families of §1 this is their second-pool variant: the same
primary with a longer, more advanced ladder.

### 2.1 Empty Tank

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

### 2.2 Taxi Meter

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

### 2.3 Catch-Up

**Story and representation.** A walker leaves home at r km/h (the fixed line y = r·x, drawn as a ghost on `cart`). A
cyclist's distance from home is our line y = mx + c. Parameter r ∈ {3, 4, 5} (examples r = 4). Parallel lines are
WORST: "they never meet".

**Primary.** *"The cyclist catches the walker at a whole number of hours."* t = c/(r − m), N = nearest positive integer
to t, P = rung(|t − N|).

**Secondaries.**
1. **S1, a whole-kilometre head start**: rung(dZ(c)). (The first version had a yes/no "real chase" here; see the revision note.)
   Rarer: t whole only needs c/(r − m) whole. Lens: the y-intercept, where the cyclist starts.
2. **S2, whole-number cycling speed**: −den(m), capped at 12. Lens: `si.m`.
3. **S3, they meet at a kilometre stone with many divisors**: τ(nearest positive integer to r·t), capped at 12. Lens:
   the meeting point's height on the distance axis.

**Example, good.** y = 6x − 6 (φ = 17). t = −6/(4 − 6) = 3: P = 8. Head start 6 km behind: S1 = 8. S2 = −1. Meeting at
km 12, τ = 6: S3 = 6. Score [8, 8, −1, 6]. (y = 5x − 3, φ = 15, is the same score and cheaper.)

**Example, bad.** y = 1/2x + 1/3 (φ = 17). t = 2/21, N = 1, distance 19/21: P = 4. dZ(1/3): S1 = 5. S2 = −2. km 8/21,
nearest positive integer 1, τ = 1: S3 = 1. Score [4, 5, −2, 1]. y = 4x + 1 is WORST (parallel).

**Card.** The plane with the walker's ghost line `cart.ghost(r)` through the origin and the cyclist's line; the
crossing point marked; `cart.xAxisMark(N)` for the nearest whole hour with the gap; the head start on the y-axis with
the nearest whole kilometre; the meeting kilometre's divisors.

**Teaches.** Intersection of two lines as "when do they meet"; relative speed (r − m) and head start (c) give the time
c/(r − m); why parallel means never.

**Centre.** Primary ~5.7 bits; cheapest top y = 3x + 1 (they meet an hour in, the cyclist slower and ahead). Best tuple
in the box [8, 8, −1, 12]: y = 3x + 15 (meet at hour 15, km 60 with τ = 12), ~14.2 bits.

**Degenerate and runaway.** m → r makes t huge; the cap on τ bounds S3. Lines with t < 0 met in the past; they are
scored by their distance to hour 1, which keeps a gradient.

**Collisions.**
- *Prime Gradient*, cooperation: y = 5x − 3 and y = 7x − 9 are both prime cycling speeds that meet the walker at hour
  3, km 12. The Prime Gradient player only cares about m; the catch-up player supplies c.
- *m meets c*, a narrow band: with m = c the meeting time is c/(r − c), in the future only for 0 < c < r. For r = 4
  it is hour N at c = 4N/(N + 1), whole only for N = 1 and 3: y = 2x + 2 (hour 1, km 4: [8, 8, −1, 3]) and
  y = 3x + 3 (hour 3, km 12). y = 5x + 5 has m = c but "met" 5 hours ago ([1, 8, −1, 1]). The negotiation is which of
  the two shared lines to defend.

### 2.4 Same Reading

**Story and representation.** Two thermometers with different scales; the line converts a reading x on thermometer A to
the reading y on B (Celsius to Fahrenheit is y = 9/5x + 32). Drawn as the function machine `mach` and, for the fixed
point, the plane with the diagonal y = x. Gate: m > 0 and m ≠ 1 ("a scale must go up, and not just slide").

**Primary.** *"There is a temperature where both thermometers show the same number, and it is a whole number."*
f = c/(1 − m) (where the line crosses y = x), P = rung(dZ(f)).

**Secondaries.**
1. **S1, the agreeing number has many prime factors**: Ω(|n|), n the nearest integer to f (ties toward 0), capped at 6.
   The famous −40 = −2³·5 has Ω = 4. Lens: the factor tree of the agreeing reading.
2. **S2, a simple conversion fraction**: −(|numerator of m| + denominator of m), capped at 20. 9/5 costs 14, 2 costs 3. Rarer in the
   sense that simple fractions are few. Lens: `mach.times` as a fraction.
3. **S3, they agree at a round ten**: rung(dZ(f/10)). (The first version had a yes/no "below zero" here; see the revision note.)
   Lens: the reading on a thermometer scale marked in tens.

**Example, good.** y = 2x + 40 (φ = 21). f = 40/(1 − 2) = −40: P = 8. Ω(40) = 4: S1 = 4. m = 2: S2 = −3. −40 is a round ten:
S3 = 8. Score [8, 4, −3, 8]. The real Celsius–Fahrenheit line, y = 9/5x + 32 (φ = 33), scores [8, 4, −14, 8]: the same
famous −40, but its fraction is harder.

**Example, bad.** y = 1/2x + 1/3 (φ = 17). f = (1/3)/(1/2) = 2/3, dZ = 1/3: P = 5. Ω(1) = 0: S1 = 0. S2 = −3.
dZ(1/15) = 1/15: S3 = 7. Score [5, 0, −3, 7].

**Card.** The machine "× m, then + c" with the agreeing reading fed in and coming out unchanged (`mach.out(f)`, the
same number both sides, highlighted); on a small plane, the diagonal and the crossing point; the nearest integer's
factor tree.

**Teaches.** Fixed points (input = output); unit conversion as a line; why Celsius and Fahrenheit agree at −40;
solving x = mx + c.

**Centre.** Primary ~2.9 bits (y = 3x agrees at 0). Best tuple in the box [8, 4, −3, 5] at y = 2x + 16 (agree at −16),
~14.5 bits: large |c| is needed for many prime factors, so the top climbs away.

**Degenerate and runaway.** m → 1 makes f huge; Ω grows like log |f| and is capped at 6. m ≤ 0 is gated out (81% of
the census weight). Identity y = x (agree everywhere) is gated as m = 1.

**Collisions.**
- *Prime Gradient*, cooperation: m = 2 and m = 3 are both prime and simple. y = 2x + 40 tops Prime Gradient and Same
  Reading's S2 among the agreeing-at-−40 lines.
- *Y-intercept Prime*, conflict on S1: with m = 2, f = −c, so a prime c makes the agreeing reading a prime (Ω = 1):
  y = 2x + 29 is [8, 1, −3, 7]. The thermometer player wants c with many factors (40, 48, 64); they negotiate whether
  S1 is worth losing a partner.

### 2.5 Matchstick Chains

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

### 2.6 Shopping Baskets

**Story and representation.** Apples cost A pence, bananas B pence, and you have C pence to spend exactly: A·x + B·y = C.
Drawn in the general form `gen` (a, b, c₀ with c₀ = −C) and the pegboard `peg` (whole-number baskets are lattice
points). Gate: A > 0 and C > 0 (b > 0 by the sign rule): prices and budget positive, else WORST.

**Primary.** *"Buy at least one apple and one banana and spend as much of your money as you can: the change left should
be as small as possible."* P = rung(least change C − A·x − B·y over whole x, y ≥ 1 with A·x + B·y ≤ C; if one of each
costs more than C, the shortfall A + B − C). (The first version's primary was the yes/no "a basket spends it all";
see the revision note.) The change is whole pence, so in practice 6 levels: 0p, 1p, 2p, 3–4p, 5–8p, more.

**Secondaries.**
1. **S1, both prices are prime**: rung(dPrime(A) + dPrime(B)). Lens: `gen.a`, `gen.b` as prices.
2. **S2, there is a basket with as many apples as bananas**: rung(dZ(C/(A + B))). Rarer: it needs A + B to divide C.
   Lens: the diagonal x = y on the pegboard.
3. **S3, the number of baskets**: the count of positive whole solutions, uncapped but small (it is about C/(A·B)).
   Lens: the pegs on the line in the first quadrant.

**Example, good.** 2x + 3y = 25 (y = −2/3x + 25/3, φ = 21). No change: P = 8. 2 and 3 prime: S1 = 8. 25/5 = 5: S2 = 8.
Baskets (2, 7), (5, 5), (8, 3), (11, 1): S3 = 4. Score [8, 8, 8, 4].

**Example, bad.** x + y = 5 (y = −x + 5, φ = 13): P = 8; 1 is not prime, 1 + 1: S1 = 3; 5/2: S2 = 5; four baskets:
S3 = 4. Score [8, 3, 5, 4]. 2x + 3y = 1 is 4p short of one of each: [2, 8, 6, 0]. 4x + 6y = 15 leaves 1p at best:
[4, 3, 5, 0].

**Card.** The pegboard's first quadrant with the line and its whole-number baskets filled; the equation as a till
receipt "2p × apples + 3p × bananas = 25p"; prices with "prime ✓"; the diagonal x = y faint, with the equal basket
(5, 5) ringed.

**Teaches.** Linear Diophantine equations without the name: whole solutions exist only when gcd(A, B) divides C, they
step along the line by (B, −A); intercepts as "all apples" and "all bananas".

**Centre.** Primary top ~5.9 bits (x + y = 3 is the cheapest). The best tuple in the box, [8, 8, 8, 2] at
2x + 3y = 15, is ~15.5 bits. The first draft put the basket count first and was topped by x + y = 12 (11 baskets,
prices 1): the count runs away with C on unit prices. Putting prime prices first fixed it.

**Degenerate and runaway.** S3 grows with C; it is last, so it only breaks ties. 93% of the census weight is gated out
(rising lines, negative budgets): the card must explain the gate in words.

**Collisions.**
- *Zero Sum* (a + b + c₀ = 0), cooperation: it is exactly C = A + B, so (1, 1) is a basket and S2 holds. 2x + 3y = 5
  tops Zero Sum and scores Shopping [8, 8, 8, 1].
- *Triangle Area (A = 12)*: 2x + 3y = 12 has area 12²/(2·2·3) = 12 exactly and a basket (3, 2), prime prices, but no
  equal basket (12/5): Shopping [8, 8, 5, 1]. The negotiation is the budget: 15 (equal basket) against 12 (area).

### 2.7 Fence Painters

**Story and representation.** Ann alone paints the fence in p hours, Ben alone in q hours; if Ann paints for x hours and
Ben for y hours the fence is done when x/p + y/q = 1. Drawn in intercept form `int` (p, q). Gate: p > 0 and q > 0.

**Primary.** *"Working side by side they finish at a whole number of hours."* t = pq/(p + q) (where the line meets
x = y), N = nearest positive integer, P = rung(|t − N|).

**Secondaries.**
1. **S1, each alone takes whole hours**: rung(dZ(p) + dZ(q)). With t whole too, 1/t = 1/p + 1/q is an Egyptian
   fraction split; there are only τ(t²) of them. Lens: the two intercepts.
2. **S2, the faster painter takes a prime number of hours**: rung(dPrime(min(p, q))). (The first version had a yes/no
   "the painters differ" here; see the revision note.) Rarer: the whole splits (p, q) = (t + u, t + v) with uv = t² rarely put a prime
   at the smaller end. Lens: the nearer intercept.
3. **S3, together they take a prime number of hours**: rung(dPrime(N)). Lens: the number N.

**Example, good.** x/3 + y/6 = 1 (y = −2x + 6, φ = 15). t = 18/9 = 2: P = 8. p, q whole: S1 = 8. Ann's 3 hours
is prime: S2 = 8. 2 is prime: S3 = 8. Score [8, 8, 8, 8], the top.

**Example, bad.** y = −3/4x + 5/2 (φ = 21): p = 10/3, q = 5/2, t = 10/7, distance 3/7 from 1: P = 5. dZ sum 5/6: S1 = 4.
dPrime(5/2) = 1/2: S2 = 5. N = 1, dPrime = 1: S3 = 4. Score [5, 4, 5, 4]. y = −x + 4 (p = q = 4) is [8, 8, 4, 8].

**Card.** The intercept triangle with "Ann alone: 3 h" on the x-axis and "Ben alone: 6 h" on the y-axis; the diagonal
x = y meeting the line at (2, 2) labelled "together: 2 h"; the fraction sentence 1/3 + 1/6 = 1/2.

**Teaches.** Intercept form as a work-rate story; harmonic means; unit fractions.

**Centre.** Primary ~7 bits; top ~11.5 bits, first at y = −1/2x + 3 (p = 6, q = 3). Close to the centre: a
beginner family.

**Degenerate and runaway.** Lines through the origin or parallel to an axis are gated (no intercepts). 93% of the
census weight is gated. No runaways.

**Collisions.**
- *Triangle Area (A = 8)*: p = q = 4 gives area 8 and t = 2, but 4 hours is not prime (S2 = 4). The pitch is
  whether the painter player gives up S2 for a partner.
- *Intercept Sum (S = 4, 7, 10)*, conflict: with p + q = S and pq = t(p + q), p and q are the roots of
  z² − Sz + St, which are rational only if S² − 4St is a square. For S = 7 and S = 10 no whole t ≥ 1 gives one (21; 60,
  20), and for S = 4 only t = 1, p = q = 2. So the painter's primary top and Intercept Sum 7 or 10 can never meet: hard
  opponents, worth knowing before agreeing to anything.

### 2.8 Ladder Against the Wall

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
provably empty top rung is a lesson, not a bug, but calibration must drop it (spec §4.4 drops empty rungs).

**Collisions.**
- *Triangle Area (A = 6)*, cooperation: the 3-4-5 ladder y = −4/3x + 4 has area 6 exactly. A natural alliance.
- *Prime Gradient*, conflict on S2: Prime Gradient wants m = 3 or 5; the ladder wants |m| near 4 with a Pythagorean
  shape. y = 5x + 5 has legs 1 and 5 (whole, P = 8) but length √26; they meet on the primary and fight on S1.

### 2.9 Plant Diary

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

### 2.10 Speeding Up

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

### 2.11 Steady vs Doubling

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

### 2.12 Wheelchair Ramp

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

### 2.13 Orchard Walk

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

### 2.14 Savings Goal

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

### 2.15 Mental Shortcut

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

### 2.16 Price per Minute

**Story and representation.** A phone plan charges a connection fee c pence and m pence a minute. The average price per
minute of a K-minute call is y(K)/K, the slope of the line from the origin to the point (K, y(K)). Drawn on the plane
with that chord. Parameter K ∈ {5, 10, 30} (examples K = 10). Gate: m > 0 and c ≥ 0.

**Primary.** *"On a K-minute call the average price per minute is a whole number of pence."* P = rung(dZ(y(K)/K)).

**Secondaries.**
1. **S1, the fee adds a whole number of pence, at least 1p, to each minute of a K-minute call**: rung(|c/K − N|), N the
   nearest positive integer to c/K. (The first version had a yes/no "there is a fee" here; see the revision note.) A fee-free plan is
   1p away. Lens: the gap between the chord's slope and the line's slope.
2. **S2, the average is whole on a call twice as long too**: rung(dZ(y(2K)/(2K))). With S1 and P met this needs 2K to
   divide c. Lens: a second chord.
3. **S3, whole averages for calls of 1 to 10 minutes**: the count of x in 1..10 with y(x)/x whole (with m whole, the
   divisors of c among 1..10). Lens: the table of averages.

**Example, good.** y = 3x + 20 (φ = 19): average at 10 minutes 50/10 = 5: P = 8; the fee adds 2p a minute: S1 = 8; at 20 minutes 80/20 = 4:
S2 = 8; whole at 1, 2, 4, 5, 10: S3 = 5. Score [8, 8, 8, 5].

**Example, bad.** y = 1/3x + 7/2 (φ = 23): 23/6 at 10 minutes, distance 19/60: P = 5; 7/20 is 13/20 from 1: S1 = 4;
distance 59/120: S2 = 5; none whole: S3 = 0. Score [5, 4, 5, 0]. The fee-less y = 2x is [8, 4, 8, 10].

**Card.** The plane with the chord from the origin to (K, y(K)) and its slope "5p a minute"; the second chord to 2K;
a little table of averages for 1–10 minutes with the whole ones bold.

**Teaches.** Average rate as the slope of a chord from the origin, against the marginal rate m; why a fee makes long
calls cheaper per minute.

**Centre.** Primary ~3.6 bits. S1 and S2 are the climb: the best tuple in the box is [8, 8, 5, 4] at y = x + 10
(~11.6 bits); S2 needs 20 | c, so the top (y = 3x + 20 and its kin) lies just outside the box.

**Degenerate and runaway.** S3 rewards c with many small divisors: bounded by 10.

**Collisions.**
- *Taxi Meter* (with K = 10), cooperation: both read y(10); a whole fare that divides by 10 serves both.
- *m meets c*: y = 10x + 10 averages 11 at 10 minutes and has whole averages at 1, 2, 5, 10 (Price [8, 8, 5, 4]);
  the price player wants a fee divisible by 20 instead, and the two must choose.

---

## 3. Summary table

Census rarities are the crude −log₂ weight shares of §0, not calibrated values, for the full (second-pool) ladders.
"Pool" says whether the family is in the beginner set (§1, two rungs) or only in the second pool.

| # | Family | Representation of the primary | Pool | Primary top (bits) | Best tuple in the box (bits) | Cheapest primary-top line | Bites on Z? |
|---|---|---|---|---|---|---|---|
| 2.1 | Empty Tank | cart.xInt | beginner | 4.6 | 12.5 | y = −x + 1 | yes (T = c/\|m\|) |
| 2.2 | Taxi Meter | table y(K) | second | 0.5 | 10.3 | y = 0 | only S2 |
| 2.3 | Catch-Up | cart, ghost line | second | 5.7 | 14.2 | y = 3x + 1 | yes |
| 2.4 | Same Reading | mach, fixed point | beginner | 2.9 | 14.5 | y = 3x | yes |
| 2.5 | Matchstick Chains | seq | beginner | 3.5 | 9.4 | y = 1 | yes |
| 2.6 | Shopping Baskets | gen, peg | beginner | 5.9 | 15.5 | x + y = 3 | prices B = 1 only |
| 2.7 | Fence Painters | int | second | 7.0 | 11.5 | y = −x + 2 | yes |
| 2.8 | Ladder Against the Wall | tri | beginner | 3.3 | 15.5 | y = x + 1 | S1 yes |
| 2.9 | Plant Diary | table | second | 0.6 | 4.5 | y = 0 | S1 yes |
| 2.10 | Speeding Up | cart area | second | 2.9 | 7.6 | y = 1 | partly |
| 2.11 | Steady vs Doubling | table vs 2ⁿ | beginner | 4.2 | 8.5 (top far out) | y = 2x | yes |
| 2.12 | Wheelchair Ramp | cart slope | second | 1.6 | 8.6 | y = x | no (needs \|m\| < 1) |
| 2.13 | Orchard Walk | peg | second | 0.9 | 13.5 | y = x | S1 no |
| 2.14 | Savings Goal | seq | beginner | 2.4 | 12.5 | y = x | partly |
| 2.15 | Mental Shortcut | cart vs ghost | second | — | 16.5 (rung 2 only) | y = 2x + 16 | yes |
| 2.16 | Price per Minute | cart chord | beginner | 3.6 | 11.6 | y = x | yes |

## 4. Every rung and its levels

Every rung is graded (the revision note). Codes: **D9** a distance that can be large (all 9 rungs of the Q ladder);
**D4** a distance to the nearest whole number (at most 1/2: rungs 5 to 8; 7 levels with the fine tail of §1); **D5** a
distance of at most 1 (a sum of two D4s, or a positive quantity's distance to the nearest positive whole number: rungs 4
to 8; 8 with the fine tail). Sizes and counts give their range.

| Family | P | S1 | S2 | S3 |
|---|---|---|---|---|
| Empty Tank | D5 | spf, capped at 13: 7 (1, 2, 3, 5, 7, 11, 13) | −den(m), capped: 12 | D9 (to a square) |
| Taxi Meter | D4 | D4 | τ of the fare, capped: 12 | −den(m), capped: 12 |
| Catch-Up | D9 (t may be in the past) | D4 | −den(m), capped: 12 | τ of the meeting km, capped: 12 |
| Same Reading | D4 | Ω, capped: 7 (0 to 6) | −height of m, capped at 20: 19 | D4 (round ten) |
| Matchstick Chains | D9 | D9 | D9 (to a prime) | D9 (to a prime) |
| Shopping Baskets | change in whole pence: 6 | prime prices, whole: 6 | D4 (equal basket) | basket count, about C/(A·B): small, last |
| Fence Painters | D5 | D5 | D9 (to a prime) | whole N to a prime: 5 in practice |
| Ladder Against the Wall | D5 | D9 (to a square) | D9 to 4, rung 8 provably empty: 8 | Ω, capped: 7 |
| Plant Diary | whole heights: 5 (0, 1, 2, 3, 6) | squares: 5 (0 to 4) | doubling pairs: about 4 | primes: 7 (0 to 6) |
| Speeding Up | D4 | D4 | D9 (to a triangular number) | D9 (\|c\|) |
| Steady vs Doubling | D9 | D9 | D4 | weeks above: 9 (0 to 8; 6 with a whole raise) |
| Wheelchair Ramp | D5 | D9 (12 − n) | D4 | τ, capped: 12 |
| Orchard Walk | D4 | whole distance to a square: 6 | tree count: 14 (0 to 13) | D5 |
| Savings Goal | D9 (W may be negative) | D9 (to a coin) | D4 on quarters: 3 (0, 1/4, 1/2) | D9 (to a coin) |
| Mental Shortcut | D9 on the wide ladder | D4 | D4 | D9 |
| Price per Minute | D4 | D5 (fee per minute) | D4 | whole averages: 11 (0 to 10) |

The beginner set (§1) uses P and the one secondary named there; Matchstick Chains' beginner secondary is "a prime
number of sides, at least a triangle" (D9). The weakest rungs for extending a ladder are those with few levels:
Savings Goal's four-week month (3), Fence Painters' S3 (5), Plant Diary's counts, and every D4 without the fine tail.
They are graded and cheap to read, so they stay, but a curator short of levels should cut them first or give them the
fine tail.

## 5. My top eight (the beginner set)

Each with its beginner primary and its one secondary (§1).

1. **Matchstick Chains** (core: nth term). *"Pattern 0 has exactly one stick"*, then *"the shapes have a prime number of
   sides"*. Exact and visual; the textbook squares pattern misses because 4 is not prime, a lovely surprise for a
   child. Its second-pool ladder adds "pattern 10 is prime" (top 6x + 1, 4x + 1, 10x + 1).
2. **Steady vs Doubling** (stretch: powers of 2). *"In some week from 1 to 8 the steady plan pays exactly what the
   doubling plan pays"*, then *"in a second week too"*. Linear against exponential growth and convexity; the
   second-pool ladder (a whole raise, weeks above) is a real divisibility puzzle with a far top, y = 42x − 80.
3. **Shopping Baskets** (stretch: whole-number solutions). *"Buy at least one of each and spend as much as you can:
   the change left should be as small as possible"*, then *"both prices are prime"*. The only family here in the
   general form; linear Diophantine equations without the name; pairs naturally with Zero Sum and Triangle Area.
4. **Same Reading** (core: solving a linear equation). *"Both thermometers show the same whole number somewhere"*, then
   *"that number has many prime factors"*. A fixed-point lens with a famous fact (−40) and a built-in argument: the real
   conversion is beaten by "double and add 40" on simplicity.
5. **Ladder Against the Wall** (core: intercepts). *"The foot and the top of the ladder are at whole-metre marks"*, then
   *"the ladder is a whole number of metres long"*. Pythagoras as the advanced step, a steep climb (3-4-5 at ~15.5
   bits), allied with Triangle Area 6.
6. **Savings Goal** (core: rate and starting amount). *"You reach exactly £100 after a whole number of weeks"*, then
   *"you started with exactly one real coin"*. Gentle and money-shaped; its second-pool top y = 1/2x + 2 is a short
   line that is rare.
7. **Empty Tank** (core: the x-intercept). *"The tank is empty at a whole number of minutes"*, then *"that minute has a
   big smallest prime factor"*. The owner's own ladder shape told as a story.
8. **Price per Minute** (stretch: average rate). *"On a 10-minute call the average price per minute is a whole number
   of pence"*, then *"the fee adds a whole number of pence to each minute"*. The chord-from-the-origin lens (average
   against marginal rate) is new to the line family.

Runners-up for the second pool: Fence Painters and Speeding Up (tops near the centre), Catch-Up for its two-line story,
Orchard Walk for Pythagorean slopes. Plant Diary is charming (Fermat's four squares) but tops too cheaply.

## 6. What the census changed

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
