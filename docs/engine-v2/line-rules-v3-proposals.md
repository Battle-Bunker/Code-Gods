# Line rules, third pass: candidates measured against the collapse check (14 November 2026)

Status: proposals and measurements only. Nothing here changes the dealt rule pool, prices or scoring. The script is
`lib/v2-agents/scripts/line-rules-v3.ts`, run from `lib/v2-agents`:

- the first pass: `node --experimental-strip-types scripts/line-rules-v3.ts --part all` (about 25 minutes);
- the rational pool: `node --max-old-space-size=10000 --experimental-strip-types scripts/line-rules-v3.ts --pool rational --moves mutators --part rules,tables,ident,entangle` (about an hour);
- adversaries, contests, unfreezing and the flatter law: `--part adversary`, `--moves mutators --part contest`,
  `--pool rational --moves mutators --part unfreeze`, `--part flatlaw`, `--part pmi [--set channels]` (minutes each);
- balance and dynamism: `--moves mutators --part parambalance`, `--part paramdyn`, `--part paramdrift`, `--part drifttrial`, `--part lensfix` (SEED, TABLES env);
- parameterised families: `PAIRS=40 WIN=30 T=20 node --max-old-space-size=6000 --experimental-strip-types scripts/line-rules-v3.ts --part params` (about 15 minutes).

It follows [landscape-analysis.md](landscape-analysis.md), whose five collapse tests (§4) are applied here. Part A is the
second round, done after the owner's questions about rational lines; Part B is the first round, merged earlier as #607,
and is kept because its negative results are the evidence for Part A.

---

---

## The summary in plain words

**The owner was right about rationals.** The dealt line rules were shaped by the whole-number board and by the demand
for exact sums. The rational-native families (Whole Intercept, Pell, continued fractions, Farey, Egyptian, cyclic
decimals) were parked because they "degenerate on whole numbers", and the tie-breakers were rewritten to read one
coefficient's prime factors (§A0). Rationals do explode the state space. One line's share of a game reaches about
2 million fraction lines with ±1 steps (55× the whole-number board). With the mutators' shortcuts, a million lines sit
within 4% of that share.

**What I built (Part A).** A pool of eight rational-native families with kid-readable primaries. Every secondary is a
relation between the primary's anchor and another aspect of the line, as the owner now requires (§A1): the owner's own
example, gcd(nearest whole number to c, ⌊m⌋), is the first worked case. I measured it with the five collapse tests, an
entanglement matrix and the collateral damage of each mutator. Part B is the earlier round on whole-number features,
merged as #607.

**What works.**

- Every primary is graded on fractions, so there is always something to climb.
- Entanglement is high and varied: a move that helps one rule changes another's bits 55–95% of the time, with real
  allies (Root Hunter and Target Gradient coexist 88–94%) and rivals (Farey Pair fights everyone).
- Which mutator an agent uses decides whom it hurts. A mirror keeps the area and wrecks the gradient rules; a shift
  spares the gradient rules entirely.
- The reachable set is far past enumeration.
- Disclosure noise (σ = 8) hides the others' rules in every run.

**What does not.**

- A relation that is *maximised* still ramps, slowly, along cheap smooth numbers. That includes the owner's example,
  whose table answer is "gradient T, intercept the biggest smooth number in reach".
- Rules with a dealt target have interior tops, but each top is the target's simplest form.
- Every table still has a one-sentence near-best family. A rule-knowing climber with 10⁵ evaluations gets 68–100% of the
  best I could find.
- Scripted play freezes within 50–150 s.

**What needs the owner** (§A6):

1. Maximised relations (slow ramps, no top) against compared relations (a top, no ramp). On one line I found no third
   kind.
2. Two lines per object with rules that read across them: the next study.
3. Something that moves the landscape under the seats (drifting targets, redrawn twists, births and deaths) so that a
   frozen table is not a fixed point.
4. The law's heavy mass at 0 and ±1.

**Since then** (§A7–A9): the owner kept "bigger is better" hills (decision 30) and asked for adversaries. Five
adversary cards (Smooth Crossing, Smooth Intercept, Steep and Tall, Smooth Gradient, Smooth Square) went to the spec lead.
With any one of them seated, the largest crossing a climber reached stayed under 100, against 2,117 without. A
dealt target that is redrawn every 50 s is the one change that kept the whole board moving (79–88% of objects moving
late, against 4–8%). A flatter law at 0 and ±1 fixes the 27% vertical births but not the degenerate tops.

**Independence (§A10, owner decision 39).** Most pairs in my pools are aligned, with upper-set PMI of 2–8.5 bits,
because almost every rule rewards "the line is simple" (a whole, smooth bottom number). Smooth Intercept and Smooth
Crossing pay twice for the same power of 2 (8.5 bits). Rules that each read one coordinate of ax + by + c = 0 and one
prime's exponent measure as near-perpendicular (0–1.5 bits).

**Parameterised families (§A11, decisions 40, 41).** Lens × qualifier × second lens × base gives 8,250 rules. Random pairs
are near-perpendicular (median PMI 0.8 bits). In the window |coefficients| ≤ 30, 39 of 40 random pairs have no line worth
12 bits to both, while a single rule's 12-bit lines are common. Judged by balance and dynamism (§A12): reach varies 2–3× by lens and
qualifier, so it needs par-normalising. Fixed-parameter tables freeze (4–13% of objects move late), and tables whose
qualifiers drift every 50 s keep 54–100% moving.

The audit of all 46 current tie-breakers against the "tied" rule is §A3: 6 are tied, 22 read the anchor alone, 18 are
independent, and all 24 ramps are among the untied ones.

---

## A0. "Check this": the owner's question, answered plainly

**Were the dealt line rules shaped by the integer variant and by the demand for exact sums? Yes.**

- When the beginner pool was cut to rules an exact sum could value (`layered-line-rules.md` §10.3, §10.5), every
  rational-native family was set aside because it "degenerates on whole m and c". The eight are Whole Intercept, Pell
  Gradient, Euclid's Long Way (continued fractions), Farey Neighbours, Egyptian Line, Long Division/Cyclic Decimal, Prime
  Slope and Steady Gradient; Fence Painters was also marked "line-q". Ruler and Exact Change were replaced by Whole
  Crossing and Divisibility Ladder because those had a band sum ("c a multiple of m"), not because they were richer.
  Pythagorean Area went to reserve because its top on whole numbers was one thin family.
- Tie-breakers were rewritten as the smallest or largest prime factor of one coefficient, so that the sums would
  separate (`tie-breakers-replaced.md`). That is why 7 of 8 mains read only c and every feature was a whole-number one
  (landscape-analysis H3). The old tie-breakers that read several points and coupled m and c were the ones removed.
- **Rationals do explode the degrees of freedom.** Measured here: one line's share of a game (2,475 ⚡) reaches about
  **2 million fraction lines with ±1 steps**, against 36,000 whole-number lines (55× more). With the mutators'
  representation shortcuts (stretch by 2 or 3, mirror, pivot, moving an intercept: decision 25), **a million lines are
  within about 80–100 ⚡**, 4% of the share. The whole reach is not enumerable here; it is far past 10⁸.
  "Rationals add states, not structure" (landscape-analysis §2b) was true only because every rule read whole-number
  features, which on fraction lines are sparse plateaus.
- **My own first pass (Part B, #607) inherited the same bias.** All eight primaries were "distance to a whole number" and
  most secondaries were whole-number facts. On line-q that gives cheap degenerate tops (y = x + 1) and plateaus. Part B's
  negative result is evidence against integer-shaped features on rational lines, not against rational lines.
- **Ideas from the brainstorms that live in the rational world and were cut or flattened:**
  - numerator and denominator as separate degrees of freedom;
  - lowest terms, and the gcd structure of ax + by = c (when it has whole-number points, and how far apart they are);
  - continued-fraction length (Euclid's Long Way), and Pell approximations of √D (Root Hunter);
  - Farey and mediant neighbours, and Egyptian fractions;
  - the period of a repeating decimal (Long Division);
  - lattice points on the line (pegboard rules), the x-intercept and the area as rationals, and two-point form;
  - prime slopes over several points, and a steady gradient as a fraction.

## A1. The design rule for secondaries (the owner, 14 November), and the first worked case

The owner: "Secondary rules should tie to the primary in some way even if they invoke an extra dimension of the object.
For example, a primary that seeks proximity to integers in the y intercept could have a secondary that seeks to maximise
the largest common factor of that closest integer with the floor of the gradient. That's better than a secondary that
just independently wants the gradient to be close to a large prime."

**Constraint, recorded for every family below:** a secondary is a function of the primary's own anchor (the whole
number, point, area or crossing the primary singles out) *together with* another aspect of the line. It is a relation
between the two (gcd, divisibility, ratio, difference, shared factors, congruence, order, coincidence), never an
independent wish about another coordinate, and never the anchor's size alone.

**The owner's example, measured** (Whole Intercept, secondary gcd(n, ⌊m⌋), n the whole number nearest c; a 0 on
either side counts as no shared factor, else gcd(0, k) = k would be a free ramp):

- Top in the window |a|, |c| ≤ 12, b ≤ 12: **9.1 bits** at y = 12x + 12. In the window 24: **10.7 bits** at
  y = 24x + 24. Best within the cheapest 150,000 lines reached from six births: a median of **16.0 bits**.
- So the relation is tied as asked, and its value no longer tracks one number's length (correlation with φ 0.13, against
  0.99–1.00 for big-prime). But **it still drifts with size**: a larger common factor needs larger numbers, and under the
  mixed code (decision 17) smooth numbers (12, 24, 90, 990) are cheap. The one-sentence answer is "make c and ⌊m⌋ the same
  smooth number, as big as you can afford". It is a slower ramp than big-prime: the top gains 1.6 bits when the window
  doubles, where big-prime gained 6–7.
- In a table with Whole Crossing/gcd-c and Target Gradient (T = 5/3)/gcd-tops, the best lines are y = (5/3)x + 90,
  y = (5/3)x − 80 and y = (5/3)x + 990: "gradient T, intercept the biggest smooth number in reach". That is one sentence.
- **Conclusion for the owner:** tying the secondary to the anchor fixes the separability (the rules now fight over the
  same numbers, §A4) but not the ramp. A relation that is *maximised* ("as big a common factor as possible") is still
  "bigger is better", now along smooth numbers. A relation with no size direction compares, rather than maximises:
  "the common factor equals the dealt k", "n is a multiple of the gradient's bottom number", "the two are as close to
  coprime as possible". Such a relation has a top, which the owner prefers to avoid ("I don't want Maxima anywhere
  ideally"). §A6 sets out the trade-off.

## A2. The rational pool: eight families, every secondary tied

The object is the fraction line (line-q, now the beginner default). m = p/q and c = r/s are in lowest terms, so the
numerators and denominators are separate degrees of freedom. Every primary is graded on fractions and reads a
representation a 12-year-old meets. Every secondary is a relation between the primary's anchor and another aspect of
the line. Dealt parameters in the run: T = 5/3, x = 3/2, the point (2, 7/3), D = 2.

Moves are the mutators, representation shortcuts included (decision 25): nudge a, b or c by ±1; shift and tilt by ±1 or
±½; pivot about x = −1, 1 or 2; mirror in either axis, the origin or y = x; stretch by 2, ½, 3 or ⅓; move one intercept
by ±1. Each is priced as one call (which + choices + an amount by steps, or a factor by digits) plus the surcharge
max(0, Δφ), charged W + 0.05·W².

Bits columns, as in Part B: the top in the window 12 and the window 24 (at the smallest line reaching it), and the
median best over the cheapest 150,000 lines from six births. With shortcuts those 150,000 lines cost only 64–84 ⚡, so
"in reach" here understates what a game reaches.

| Family: primary (kid text) | Anchor | Secondary (tied) | Top, window 12 → 24 (bits @ line) | Best in reach | Verdict |
|---|---|---|---|---|---|
| **Whole Intercept**: the y-intercept as close to a whole number as possible | n, the whole number nearest c | gcd-floor-m: n and ⌊m⌋ share a big common factor (**the owner's example**) | 9.1 @ y = 12x + 12 → 10.7 @ y = 24x + 24 | 16.0 | slow ramp along smooth numbers |
| | | gcd-den-m: n shares a big factor with m's bottom number q | 8.0 → 9.4 @ y = (15/4)x + 4 | 14.0 | slow ramp |
| | | whole-at-n: at x = n, y is nearly whole too | 1.2 @ y = x + 1 | 1.2 | worthless (degenerate) |
| **Whole Crossing**: the line crosses the x-axis as close to a whole number as possible | N, the whole number nearest X | gcd-c: N and the whole number nearest c share a big factor | 6.4 → 6.9 @ y = x + 24 | 9.5 | edge, slow |
| | | gcd-num-m: N shares a big factor with m's top number p | 8.0 → 9.4 @ y = 4x + 16 | 13.4 | slow ramp |
| **Farey Pair**: write m = p/q and c = r/s; p × s and q × r should differ by as close to 1 as possible | the mediant (p + r)/(q + s) | mediant-mid: the mediant close to the average of m and c | 4.8 @ y = x | 4.8 | worthless |
| | | mediant-x: the mediant's bottom number shares a big factor with the x-intercept's bottom number | 18.8 @ (−11, 10, −10) → 20.9 @ (−17, 16, −16) | 22.4 | slow ramp (slopes n/(n − 1)) |
| **Root Hunter** (Pell): the gradient as close as possible to √2 | p/q | pell-c: p² − 2q² equals the y-intercept's top number | 13.6 @ m = 7/5 → 21.3 @ m = 24/17 | 21.3 | **ramp** along the convergents of √2 |
| | | share-den: c is a multiple of 1/q | 11.8 → 19.4 | 19.4 | **ramp** |
| **Whole Area**: the triangle with the axes has an area as close to a whole number as possible | K, the whole number nearest the area | gcd-x: K and the whole number nearest X share a big factor | 6.3 → 6.8 @ y = x + 24 | 9.4 | edge, slow |
| | | gcd-den-m: K shares a big factor with q | 9.4 → 11.1 @ y = x/12 + 2 | 16.7 | ramp in q (see table 3) |
| **Whole at x = T**: at the dealt x, y as close to a whole number as possible | Y, the whole number nearest y(T) | gcd-c: Y and the whole number nearest c share a big factor | 5.3 → 5.9 | 9.7 | slow |
| | | gcd-den-m: Y shares a big factor with q | 12.5 → 14.3 | 17.8 | slow |
| **Target Gradient**: the gradient as close as possible to the dealt T | m ≈ T | gcd-tops: the tops of m and c share a big factor | 13.7 @ y = (5/3)x + 5/3, no growth | 13.7 | **interior top**, one sentence |
| | | same-den: the bottoms of m and c share a big factor | 11.3 @ the same line, no growth | 11.3 | interior top, one sentence |
| **Near the Point**: the line passes as close as possible to the dealt point | the point (u, v) | lattice: the line's own whole-number point nearest the dealt point is close to it | 13.6 @ y = x/3 + 5/3, no growth | 13.6 | **interior top** |
| | | gcd-x: the whole numbers nearest X and nearest y(u) share a big factor | 11.8 @ y = 7/3, no growth | 11.8 | interior top |

**Reading it.** On fractions the primaries are graded, and the tied secondaries are worth 10–22 bits in reach, against
1–10 for Part B's bounded ones. But every secondary that *maximises* a relation (a gcd, a shared factor) still drifts
outward, more slowly than big-prime did, along smooth numbers or convergents. The three with interior tops (Target
Gradient's two, Near the Point's) read a dealt target, and their tops are the target's simplest form: one sentence each.
No secondary got ~30 bits without size.


## A3. Audit of the dealt and restored tie-breakers against the owner's rule

The owner's rule: a secondary is a function of the primary's own anchor *together with* another aspect of the line.
**Tied** means it is such a relation. **Anchor only** means it reads the anchor alone, so it is not tied and is usually
a size wish. **Independent** means it reads another coordinate without the anchor; the owner's counter-example ("the
gradient close to a large prime") is one. **Ramp** means "bigger is better" with no bound.

| Family (primary's anchor) | Tie-breaker | Class | Ramp |
|---|---|---|---|
| Prime Landing (the prime nearest c) | big-prime: that prime as big as possible | anchor only | **yes** |
| | prime-gradient: m close to a prime | independent (the owner's counter-example) | no |
| | next-prime: y(1) = m + c close to a prime | **tied** (the anchor's line one step on) | no |
| | m-spf, m-gpf: m's smallest / largest prime factor | independent | **yes** |
| Prime Gradient (the prime nearest m) | prime: that prime as big as possible | anchor only | **yes** |
| | cPrime: c close to a prime too | independent | no |
| | c-spf, c-gpf | independent | **yes** |
| Whole Intercept (the whole number nearest c) | spf, omega of that number | anchor only | **yes** (omega along powers of 2) |
| Whole Crossing (the whole number nearest the x-intercept) | k-spf, k-gpf | anchor only | **yes** |
| Square Area (the square nearest the area, and its root) | spf, lpf of the root | anchor only | **yes** |
| | omega of the root (the owner's example 2) | anchor only | **yes**, slowly. The owner's own; it should become tied, e.g. "the root shares many prime factors with the x-intercept" |
| Prime Staircase (the run of primes y(0), y(1), …) | first-prime, last-prime as big as possible | anchor only | **yes** |
| | near-miss: the first non-prime term close to a prime | **tied** (the run and the next term) | no |
| | step-back: y(−1) close to a prime | **tied** (the run extended backwards) | no |
| Treasure (y(k) near T) | prime-terms: different primes among y(1) … y(8) | **tied** (the anchor's neighbours in the table) | no |
| | prime-gradient, square-start | independent | no |
| | m-spf, m-gpf | independent | **yes** |
| Same on Both Rulers (the unchanged number c/(1 − m) near T) | steep: m far from 1 | independent | **yes** |
| | prime-start: \|c\| close to a prime | independent | no |
| | whole-values: whole numbers among y(−5) … y(5) | independent (reads many points, not the anchor) | no |
| | whole-lamp: m/(m − 1) close to whole | **tied** (the machine's own second number) | no |
| Divisibility Ladder (the run n \| y(n)) | steep | independent | **yes** |
| | m-prime | independent | no |
| Ruler (the distance² from (0, 0) near a square) | far: that distance as big as possible | anchor only | **yes** |
| | prime-gradient | independent | no |
| | square-area | independent (another representation's own wish) | no |
| Exact Change (ways to pay N near the target) | big-piles | anchor only | **yes** |
| | big-bill: N as big as possible | anchor only | **yes** |
| | prime-coins: a and b near primes | independent | no |
| Pythagorean Area (the triangle of area near A) | slanted-square: the third side² near a square | **tied** (the anchor triangle's third side) | no |
| | prime-height, whole-legs | anchor only (the triangle's legs) | no |
| Triangle Area (the triangle of area near A) | legs whole, legs equal | anchor only | no |
| m Meets c (the shared number) | size: as big as possible | anchor only | **yes** |
| | meetPrime: that number close to a prime | anchor only | no |
| Crossing Check (where y(k) meets x(q)) | size | anchor only | **yes** |
| | whole: x(q) nearly whole | anchor only | no |

The count: of 46 tie-breakers, 6 are tied (next-prime, near-miss, step-back, prime-terms, whole-lamp, slanted-square), 22
read the anchor alone and 18 are independent. 24 are ramps. Every ramp is an anchor-only or independent one. That fits
the coordinator's reading that a relation has no "bigger is better" direction by itself, but §A2 shows the tied gcd
relations of the new pool still drift with size (a larger common factor needs larger numbers), more slowly.

## A4. Entanglement: who fights whom, and through which mutators

8,910 random mutator moves from states along short random walks from births. Each family is represented by its first
secondary. A cell reads: of the moves that raise the row's bits, the share that lower the column's / the share that raise
it. The rest leave it unchanged.

| A raised \ B | Whole Intercept | Whole Crossing | Farey Pair | Root Hunter | Whole Area | Whole at x = T | Target Gradient | Near the Point |
|---|---|---|---|---|---|---|---|---|
| Whole Intercept | – | 34 / 31 | 54 / 32 | 49 / 36 | 40 / 48 | 43 / 51 | 46 / 35 | 51 / 43 |
| Whole Crossing | 27 / 27 | – | 53 / 34 | 45 / 37 | 37 / 54 | 49 / 43 | 41 / 36 | 48 / 44 |
| Farey Pair | 28 / 28 | 36 / 34 | – | 37 / 44 | 43 / 38 | 45 / 45 | 35 / 39 | 52 / 42 |
| Root Hunter | 30 / 27 | 33 / 31 | 46 / 37 | – | 37 / 43 | 46 / 45 | 3 / 88 | 23 / 71 |
| Whole Area | 28 / 34 | 33 / 44 | 56 / 31 | 45 / 41 | – | 46 / 47 | 43 / 40 | 47 / 46 |
| Whole at x = T | 27 / 34 | 37 / 32 | 54 / 34 | 47 / 40 | 41 / 44 | – | 43 / 38 | 48 / 45 |
| Target Gradient | 30 / 28 | 34 / 32 | 48 / 35 | 5 / 94 | 38 / 45 | 46 / 46 | – | 21 / 73 |
| Near the Point | 30 / 28 | 34 / 33 | 54 / 31 | 22 / 62 | 38 / 42 | 43 / 45 | 18 / 61 | – |

- **Entanglement is high and varied, as the owner asked.** Almost every pair is touched by most moves: a move that helps one
  rule changes another's bits 55–95% of the time. Most pairs are mixed (25–55% fight, 30–55% coexist), so there are
  deals to make.
- **Some pairs are allies.** Root Hunter (√2) and Target Gradient (T = 5/3) both want m to rise from where births sit,
  and coexist 88–94% of the time. They will fight only between 1.41 and 1.67. Near the Point leans the same way. Farey
  Pair fights everyone (45–56%).
- **Collateral damage by mutator** (mean |Δbits| a move does to each rule):

| Mutator | Whole Intercept | Whole Crossing | Farey Pair | Root Hunter | Whole Area | Whole at x = T | Target Gradient | Near the Point |
|---|---|---|---|---|---|---|---|---|
| nudge a, b or c | 0.5 | 0.4 | 0.2 | 0.2 | 0.4 | 0.4 | 0.2 | 0.2 |
| pivot about x0 | 0.4 | 0.6 | 0.1 | 1.5 | 1.0 | 1.0 | 1.4 | 0.7 |
| move an intercept | 0.2 | 0.1 | 0.3 | 1.1 | 0.6 | 0.6 | 1.1 | 1.0 |
| tilt | 0.2 | 0.5 | 0.2 | 1.3 | 0.6 | 0.8 | 1.2 | 0.9 |
| mirror | 0.3 | 0.1 | 0.2 | 1.7 | 0.0 | 0.4 | 1.7 | 1.5 |
| shift | 0.7 | 0.4 | 0.2 | 0.0 | 0.7 | 0.5 | 0.0 | 0.6 |
| stretch | 0.6 | 0.1 | 0.1 | 0.9 | 0.4 | 0.5 | 0.9 | 0.9 |

  The owner's picture holds. A shift does nothing to the gradient rules and most to the intercept and area rules. A
  mirror keeps the area and the crossing's distance and wrecks the gradient rules. A pivot about the point a rule cares
  about is how a gradient rule moves without paying for the intercept, and it does 1.0 bits of collateral damage to the
  area and y(T) rules. Which mutator an agent chooses is a political act.

## A5. The collapse tests on rational tables

Eight tables (six of 3 seats, two of 4). Reach: from every birth, the cheapest million lines cost under ~100 ⚡ of the
2,475, so the reachable set was capped at 10⁶ ("exact best" below is over those). The full reach is not enumerable here.

| # | Table | Best lines (3 births) | Near-best (≥ 90%) | 10⁵-eval climber / best of 10⁶ | Best 24 distinct keep | Slopes in top 24 | Dynamics: F at 50 s steps; objects moved in the last 100 s; largest coefficient |
|---|---|---|---|---|---|---|---|
| 1 | Whole Intercept/gcd-floor-m + Whole Crossing/gcd-c + Target Gradient/gcd-tops (**the owner's example**) | y = (5/3)x + 90, (5/3)x − 80, (5/3)x + 990 | 19–43 | 0.93–0.96 | 0.89 | 3 | 3,391 → 3,678, flat from 100 s; 13%; 3,888 |
| 2 | Whole Intercept/gcd-den-m + Farey Pair/mediant-mid + Root Hunter/share-den | m = 17/12, 45/32, 38/27 (near √2) | 1–3 | 0.83–1.00 | **0.57** | 12 | flat from 100 s; 8%; 2,430 |
| 3 | Whole Area/gcd-x + Whole at 3/2/gcd-c + Near the Point/lattice | y = x/324 + 2, x/432 + 2 | 7–20 | 0.93–1.00 | 0.77 | 24 | flat from 150 s; 4%; 5,400 |
| 4 | Farey Pair/mediant-x + Near the Point/gcd-x + Whole Crossing/gcd-num-m | (−35, 45, −36) on all three | 1 | 0.81–1.00 | 0.86 | 24 | flat from 100 s; 4%; 1,500 |
| 5 | Root Hunter/pell-c + Whole Intercept/whole-at-n + Whole Area/gcd-den-m | m = 36/25, 45/32 | 1–7 | 0.68–1.00 | 0.80 | 5 | rising to 150 s, then flat; 4%; **12,672** |
| 6 | Target Gradient/same-den + Whole at 3/2/gcd-den-m + Farey Pair/mediant-mid | m = 20/11, 12/7, 18/11 | 2–11 | 0.93–1.00 | 0.73 | 16 | flat from the start; 13%; 672 |
| 7 | Table 1 + Near the Point/lattice (4 seats) | y = (5/3)x − 1, on all three | 1–6 | 0.80–1.00 | **0.69** | 23 | flat from the start; 8%; 912 |
| 8 | Farey Pair/mediant-mid + Root Hunter/share-den + Whole Area/gcd-x + Whole at 3/2/gcd-c (4 seats) | m = 99/70, 24/17 | 3–63 | 0.89–1.00 | 0.85 | 3 | flat from the start; 8%; 2,541 |

Test by test:

1. **Ramp:** 11 of 17 rules drift outward (§A2). The drift is slower than big-prime's and runs along smooth numbers and
   convergents rather than primes.
2. **Cheap optimum for a rule-knowing searcher: improved, but it still fails.** The reachable set is no longer
   enumerable in seconds; shortcuts made it huge. But steepest-ascent climbs with 10⁵ evaluations reach 68–100% of the
   best of the cheapest million lines, and on most births 93–100%.
3. **Single answer:** two tables pass the < 70% bar (table 2 at 0.57, table 7 at 0.69). Each still has a sentence:
   - table 1: "gradient T, intercept the biggest smooth number in reach";
   - tables 2, 5 and 8: "m a convergent of √2 (17/12, 24/17, 99/70), c a multiple of 1/q";
   - table 3: "m = 1/(a big smooth number), c = 2";
   - table 4: "slopes n/(n − 1)";
   - table 7: "the simplest line through the dealt point with gradient T".
4. **Convergence in play: fails everywhere.** The table total stops changing by 50–150 s in every table. The seats keep
   spending (no idle seconds), but late moves touch 4–13% of objects, and in tables 3 and 5 one object is walked out to
   coefficients of 5,400 and 12,672.
5. **Disclosure: passes with noise.** Exact sums identify the others' rules in 1–39 probes; σ = 2 takes 97–1,183 or
   fails; at σ = 8 no table identifies them in 1,500 probes (15 of 15 runs).

## A6. What works, what does not, and what the owner must decide

**What works.**

- Rational-native primaries are graded everywhere, so near every state there is something to climb (the owner's "hill
  climb a combined landscape that improves several rules at once").
- Tied secondaries plus primaries reading m, c, the crossing, the area and points give **high, varied entanglement**,
  with collateral damage that depends on the mutator chosen (§A4).
- Representation shortcuts (decision 25) put the reachable set far beyond enumeration.
- Disclosure noise hides the rules.

**What does not.**

- A tied relation that is *maximised* (a gcd, a shared factor) still ramps, along smooth numbers. The owner's own
  example does this (§A1).
- Interior tops exist only where a dealt target sits (T, a point), and they are the target's simplest form.
- Every table still has a one-sentence near-best family, and scripted play freezes.

**The structural reason for the freeze**, as in Part B: with each object an independent universe and every utility
fixed, a hill climber stops at a local maximum of its own objective. Only conflict between seats over the same object
keeps it moving. Entanglement raises conflict, but seats still settle on a state no one can improve alone.

**For the owner** (no rule is changed here). *Answered since:* item 1 by decision 30 (unbounded hills wanted, with
adversaries: §A7); item 2 is with the two- and three-line sessions; item 3 is measured in §A8; item 4 in §A9.

1. **Maximised relations or compared relations.** "As big a common factor as possible" is a slow ramp with no top;
   "the common factor equals the dealt k", "n is a multiple of q" or "as close to coprime as possible" has a top and no
   ramp. The owner asked for neither tops nor ramps. On one line the measurements found no third kind: a rule whose
   value is rare without being large is rare because a coincidence holds, and then the coincidence is its top. **Which do
   you prefer, or should both kinds be dealt side by side** (the "diversity" the owner allowed for an empirical high
   maximum)?
2. **Fewer objects, and possibly two lines per object.** The owner asked for fewer objects in the beginner game. Two lines
   per object with rules that read across them ("where your two lines cross is nearly a whole-number point, sharing a
   factor with the first line's intercept") squares the state and multiplies the coincidences needed for a high peak. That
   is the next measurement (sessions on two- and three-line systems are starting).
3. **Something that moves the landscape under the seats** so that frozen play is not a fixed point. Candidates:
   - per-object twists redrawn during a game;
   - births and deaths;
   - rules whose dealt target drifts.

   Each is a game-rule change, and only the owner can make it.
4. **The law's mass at 0 and ±1**, which makes every exact coincidence cheap near the centre (Part B).

**Cards for the spec lead.** The tied secondaries above can replace the anchor-only and independent ones of the
restored families (§A3): for example Prime Landing's next-prime and Whole Intercept's gcd-den-m. They should be dealt only
alongside the collapse check (§A5), because they still ramp slowly.


## A7. Adversaries for the big-prime hills (owner decision 30)

Decision 30 keeps "bigger is better": "I absolutely want bigger is better mechanics so there are unbounded hills to
climb. We just need to make sure there are adversaries to ongoing expensive climb of those hills." The spec lead's
tension matrix (`tension-matrix.md`) found no adversary in the dealt pool to the stretch case (y = −2x + 734, the
crossing and the area's root both the prime 367). These five cards went to the spec lead. Each is one sentence, has a
tied tie-breaker and an unbounded hill of its own, and pulls an anchor the climbers use toward the opposite kind of
number. Run with `--part adversary` and `--part contest`.

| Card | Primary (kid text) | Tied tie-breaker | Adversary to |
|---|---|---|---|
| **Smooth Crossing** | the x-axis crossing as close as possible to a number made only by multiplying 2s, 3s, 5s and 7s | that number and the whole number nearest the y-intercept share as many prime factors as possible | Whole Crossing/k-spf, k-gpf; the stretch case |
| **Smooth Intercept** | the y-intercept as close as possible to such a number | that number and the whole number nearest the crossing share as many prime factors as possible | Prime Landing/big-prime, Whole Intercept/spf |
| **Steep and Tall** | the gradient and the y-intercept both positive and both as big as possible (the smaller counts) | their whole parts share as many prime factors as possible | every big-crossing rule: the crossing becomes −c/m, small and negative |
| **Smooth Gradient** | the gradient as close as possible to such a number | that number and the whole number nearest the y-intercept share as many prime factors as possible | Prime Gradient; big-crossing rules through steepness |
| **Smooth Square** | Square Area's own main | the square's root and the whole number nearest the crossing share as many prime factors as possible | Square Area/spf, lpf (same anchor, opposite pull) |

**Bits along the climbs** (bits at p ≈ 11, then p ≈ 1,471, and the gain per doubling):

| Rule | On y = −2x + 2p (p prime: the stretch case) | On its own hill | Per doubling on its own hill |
|---|---|---|---|
| Whole Crossing/spf (climber) | 10.1 → 32.8 (my ladder caps near 33) | – | ≥ 3.2 |
| Square Area/spf (climber) | 13.3 → 27.0 (capped) | – | ≥ 1.9 |
| Smooth Crossing | 2.0 → 2.0 | 6.6 → 17.9 (y = −2x + 2^(k+1)) | 1.6 |
| Smooth Intercept | 0.5 | 6.6 → 17.9 (the same path) | 1.6 |
| Steep and Tall | 0.8 | 8.2 → 21.8 (y = 2^k·x + 2^k) | 1.9 |
| Smooth Gradient | 5.2 | 8.9 → 24.2 (y = 2^k·x + 2^k) | 2.2 |
| Smooth Square | 7.0 | 8.6 → 20.5 (y = −2x + 2^(k+1)) | 1.7 |

**Contest in simulation** (greedy seats, mutator moves, 24 objects, 300 s, two seeds; climbers are Whole Crossing/spf,
Square Area/spf and Whole Intercept/spf):

| Seats | Largest \|crossing\| at the end | Whole Crossing/spf bits | Square Area/spf bits |
|---|---|---|---|
| climbers alone | **2,117 and 194** | 205, 153 | 208, 221 |
| + Smooth Crossing | 47, 73 | 94, 114 | 118, 117 |
| + Steep and Tall | 97, 97 | 73, 77 | 92, 87 |
| + Smooth Square | 49, 97 | 120, 86 | 178, 130 |
| two climbers + Smooth Crossing + Steep and Tall | 49, 80 | 127, 120 | 156, 155 |

- **An adversary seated stops the long climb.** The largest crossing stays under 100 in all eight adversary runs, against
  2,117 in one of the two climber-only runs. The climbers keep about half their bits.
- **What it costs the adversaries.** No "prefers small or smooth" rule can be worth much where the law already puts its
  mass, because small, smooth numbers are common. These adversaries' bits come from their own unbounded hills (powers
  of 2) and are 0.5–7 on the climbers' lines. They contest by pulling the same anchor the other way, not by scoring
  high where the climbers are.
- **What it does not do.** The greedy seats then trade the same few objects back and forth every second (the "bits
  destroyed" counts run to thousands), while the board and the table total are flat after 50 s. That is contest without
  progress (§A8).

## A8. What unfreezes play (proposal for the owner, with measurements)

The coordinator asked which of opposing seats, drifting targets, redrawn twists, or births and deaths unfreezes play.
Measured on the rational pool (Whole Intercept/gcd-den-m, Farey Pair/mediant-x, Target Gradient/gcd-tops), mutator
moves, two seeds, `--part unfreeze`:

| Variant | F at 50 s steps | Objects moved in the last 100 s |
|---|---|---|
| fixed rules | 4,535 → 4,555, then flat; 4,713 → 4,863, then flat | 8%, 4% |
| **Target Gradient's T redrawn every 50 s** (5/3, 3/4, −2/5, 7/2, 1/3, −3/2) | 4,535 → 4,652 → 3,183 → 5,625 → 3,031 → 5,783 | **88%, 79%** |
| a death and a birth every 10 s (the table's least valuable object replaced) | rises to 6,887 and 6,142, then slowly drifts | 8%, 8% |
| opposing seats (§A7) | flat after 50 s; seats trade the same objects | 4–8% |

- **A drifting dealt target is the only one that keeps the whole board moving.** Every redraw sends the seats climbing
  again. The cost: one value table per target value (decision 20: a cache keyed by parameter), and a card that says
  "the target changes every so often", which a 12-year-old reads easily. A target drawn from a known list keeps it fair.
- **Births and deaths** keep the total changing, but only the newborns move; the rest of the board stays put. They cost
  nothing in calibration (births already come from the law), and are a simple, readable rule.
- **Opposing seats** produce contest (§A7), but between greedy seats it degenerates into trading one object back and
  forth. Real players who talk may do better; the measurement cannot say.
- **Redrawn per-object twists** were not simulated separately. They behave like a drifting target on one object at a time,
  at the same calibration cost.
- The owner has said hard local maxima that need strategy are acceptable, so this is an option, not a need.

## A9. A flatter law at 0 and ±1 (proposal; measured by reweighting draws)

Each coordinate with |n| ≤ 1 is charged δ more bits, and the rest is renormalised (`--part flatlaw`):

| δ | Vertical lines in the law | Bounded rules' tops (window 24) |
|---|---|---|
| 0 (today) | 27.2% | 1.3–8.1 bits, at y = x + 1, y = 7x + 7, y = 1, y = 2x + 2 |
| 2 | 12.8% | +0 to +1.8 bits, at the same lines |
| 4 | 4.3% | +0 to +3.5 bits, at the same lines |
| 6 | 1.2% | +0.4 to +5.3 bits, at the same lines |

- A flatter law fixes the vertical-line births (27% of newborn lines are vertical today).
- It does not move the degenerate tops, because b = 1 is itself a "1": every non-vertical whole line pays alike, and the
  cheapest member of a coincidence set stays the cheapest.
- What it would take: add δ to mixedIntBits at 0 and ±1, and recompute its normaliser. That changes births, every
  surcharge and every value table.

**Limits of A7–A9.** Vertical lines score worst on every rule here that reads m or c (the general form would give some
of them a value, e.g. Ruler's distance). The seats are greedy and selfish. The ladder caps near 33 bits, so the climbers'
gains past p ≈ 47 are understated.


## A10. Independence: PMI of the upper sets (owner decision 39)

The owner: "two other players with 20 bits represents an object that's as rare and hard to reach as 40 bits". So for two
seated rules A and B, the joint rarity of their upper sets should be close to the sum of their bits. That holds when
the pointwise mutual information PMI = log2 π(U_A ∩ U_B) / (π(U_A) π(U_B)) is near 0, where U_r is the set of lines
worth at least d bits to r. PMI > 0 means one structure is paid for twice; PMI < 0 means it is hard to hold both.
Measured on 216,446 weighted draws of the line-q law, at d = 4 and 8 bits, `--part pmi`. The full matrices are in
`scripts/line-pmi-results.md`.

**My pools are strongly aligned.** At d = 8 there are 45 pairs with PMI ≥ 2 bits, among them:

| Pair | PMI at d = 8 | Why |
|---|---|---|
| Smooth Intercept × Smooth Crossing | **8.5** | both pay for the same power of 2 (y = −2x + 2^(k+1)): one number paid twice |
| Target Gradient/k-whole × Target Gradient/gcd-tops | 8.2 | the same primary |
| Smooth Intercept × Smooth Square, Smooth Crossing × Smooth Square | 6.3 | the same smooth number again |
| Whole Intercept/gcd-den-m × Whole Area/gcd-den-m | 6.1 | both reward a small whole denominator sharing factors |
| Whole Crossing/gcd-num-m × Smooth Gradient | 6.2 | smooth m |
| Smooth Gradient × Steep and Tall | 6.1 | a big smooth m with a shared c |
| Whole Intercept/spf × Whole Intercept/rep | 5.2 | the same anchor |
| Square Area/spf × Smooth Square | 5.3 | the same primary (the tension is only in the tie-breaker) |
| Whole Crossing/spf × Square Area/spf | 4.1 | **the stretch-to-367 pair**: the crossing and the area's root are the same prime |

Only one pair is clearly in tension (Near the Point/lattice × Sunken Intercept, −3.4 at d = 4).

**Why.** Nearly every rule rewards whole-number structure in some representation: "nearly whole", shared factors,
smooth numbers. On a fraction line all of those load on the same hidden variable: a small bottom number b (a whole
gradient and intercept) and coefficients rich in small primes. So the rules are not perpendicular; they are mostly
different readings of "the line is simple". My adversaries are aligned with each other and with the gcd rules. They
are adversaries to the big-prime hills only in the direction of their pull (§A7), not in rarity.

**What is perpendicular, measured.** The mixed code draws a, b and c independently, and within each number it draws
each prime's exponent independently. So a rule that reads one coordinate of ax + by + c = 0 and one prime's exponent is
statistically independent of a rule reading another coordinate or another prime. Five such "channel" rules (factors of 2
in a, factors of 3 in b, factors of 5 in c, factors of 2 in c, c a big prime):

PMI at depth 4 (upper half of the cell) and depth 8 (after the slash); blank where under 30 draws are in the joint set:

| | threes in b | fives in c | twos in c | c a big prime |
|---|---|---|---|---|
| twos in a | 0.7 / 0.8 | 0.6 / 0.3 | 0.2 / −0.0 | 0.6 / 0.2 |
| threes in b | | 0.7 / 1.5 | 0.7 / 1.2 | 0.9 / 0.7 |
| fives in c | | | −0.0 / – | 3.2 (c = 5 counts as both) / – |
| twos in c | | | | – / – |

All are within 0–1.5 bits, apart from one small-number artefact. The residue comes from the "rest of the number as
small as possible" tie-breakers I used, which all like small numbers.

**What this means for the pool (proposal).**

1. **Give each seated rule its own channel**: a coordinate of the standard form (a, b or c), or a prime it reads (2s,
   3s, 5s, big primes), or both. Two rules on the same number reading different primes are perpendicular (a stretch by
   2 helps one and not the other). Two rules reading the same prime of the same number pay twice (the stretch case).
2. **At most one "nearly whole" (integrality) primary per table.** Integrality is the common factor of almost the
   whole pool.
3. **Tension still comes from the moves.** A stretch by 2 multiplies a and c, a shift moves c through every prime's
   exponent at once, and a nudge changes one coordinate. So rules can be perpendicular in value and still collide
   through the mutators, which is the political structure decision 30 asks for.
4. **The cost to flag for the owner.** Perpendicular rules make the table's value close to separable, and the landscape
   analysis found that rules reading one coordinate each make a fixed point easier to reach (each rule's best is found
   on its own). Decisions 39 and 30 pull opposite ways here. What keeps it hard is each rule's own climb being priced
   and unbounded, uniqueness, and collisions through mutators, not entangled value.
5. **Decision 29 (tied tie-breakers) inside a channel.** A tie-breaker can stay in its rule's channel and still tie to
   the anchor, for example "the factors of 2 in a, and then the factors of 2 in the gradient's bottom number". Any tie
   to another coordinate's or prime's structure costs some perpendicularity. The size of that trade has not been
   measured yet.


## A11. Parameterised families (owner decisions 40, 41)

The owner: "I want it to be hard work to find states that would give two players 20 energy each on the same object
because their rules should naturally pull against each other (be roughly perpendicular)", and "all rules [should] have
substantial degrees of freedom in configuration params … distance to nearest prime ending in k". So a rule is drawn from
a product of named, typed parts:

- **Lens** (a way to turn the line into a number), 11 values: the y-intercept; where the line crosses the x-axis; the
  gradient; the height at x = t (t ∈ 2, 3, 5, 7); where the line reaches height h (h ∈ 1, 2, 5); the area of the triangle
  with the axes.
- **Qualifier** (a dealt property of whole numbers), 25 values:
  - a prime ending in k (k ∈ 1, 3, 7, 9);
  - a prime leaving r when divided by q (7 pairs);
  - exactly k primes multiplied together (k ∈ 2, 3, 4);
  - a square or a cube;
  - a multiple of 9, 16, 25 or 49;
  - a repdigit in base 3, 4 or 5;
  - 5-smooth or 7-smooth.
- **Primary:** "⟨lens⟩ should be as close as possible to ⟨qualifier⟩". Score: −|lens − n|, where n is the nearest
  qualifying whole number.
- **Tie-breaker (tied, an unbounded hill):** "that number and the whole number nearest ⟨second lens⟩ should end in as
  many of the same digits as possible [in base B]", with B ∈ 10, 2, 3. Matching k digits has rarity about B^−k.
- **11 × 25 × 10 × 3 = 8,250 distinct rules.** Example: "The height of the line at x = 7 should be as close as possible to
  a prime ending in 7. Tie-breaker: that number and the whole number nearest the height of the line at x = 2 should end
  in as many of the same digits as possible."

**Measured over 40 random pairs** (random lenses, qualifiers, second lenses and bases; `--part params`, results in
`scripts/line-params-results.md`). Joint counts are over the window |a|, |c| ≤ 30, 1 ≤ b ≤ 30.

| Measure | 10th / median / 90th percentile |
|---|---|
| PMI of the upper sets at 4 bits | −1.3 / **0.8** / 2.5 |
| PMI at 8 bits | 0.9 / 3.7 / 5.8, but 34 of 40 pairs are too rare to estimate, and the 6 that can be estimated are the overlapping ones |
| Lines worth ≥ 12 bits to one rule | 0 / 14 / 122 |
| Lines worth ≥ 12 bits to **both** | 0 / 0 / 0 (39 of 40 pairs have none) |
| The best line for both (the larger of the two rules' minimum) | 4.6 / 7.1 / 11.3 bits (the best pair reached 12.8) |
| Cheapest φ of a line ≥ 12 bits: to one / to both | 18.7 / 26.3 (median where found) |
| Lines worth ≥ 20 bits to one rule | 0 / 0 / 1 |

- **Random pairs are close to perpendicular**: a median PMI of 0.8 bits at depth 4, against 2–8.5 for my hand-made pools
  (§A10).
- **Joint high states are hard, as the owner wants.** In the window no random pair has a line worth 20 bits to both, and
  only one in 40 has one worth 12 to both. A line worth 12 to one rule is found in most pairs.
- **But a single unopposed rule rarely reaches 20 in this window** (median 0 lines). The owner said that should be
  "fairly easy". The window is small next to a game's reach with shortcuts, so the next measurement is reach-based:
  cheapest energy from a birth to 20 bits, alone and jointly. I have not measured it yet.
- **Equal opportunity (v1's rule)**, as the best bits in the window per qualifier, median over lenses:
  - primes with a residue or last digit: 11.5–14.9;
  - repdigits: 10.1–12.1;
  - exactly k primes, powers and multiples: 9.4–11.6;
  - smooth numbers: 7.5–7.9.

  Proposal: drop 5- and 7-smooth, or deal them with base 2 tie-breakers; and either equalise qualifier families by
  calibrating dealt values within a family to ±1 bit, or deal one qualifier family per seat type. Lenses differ more
  than qualifiers: the gradient and the area reach less, and heights at x = t and crossings reach more.


## A12. The parameterised pool judged by balance and dynamism

The coordinator relayed the owner's criterion: "the most important virtues to design for are game balance (fairness
across rules) and dynamism (metagame doesn't settle into static optima)". No par level is required, so the earlier "a
single rule rarely reaches 20" gap is withdrawn. Measured with mutator moves (shortcuts included), `--moves mutators
--part parambalance | paramdyn | paramdrift`; raw output in `scripts/line-params-dynamics-results.md`.

**Balance: best bits a rule reaches from a birth** (the cheapest 60,000 lines, up to about 75 ⚡; median of 3 births):

| By lens (6 random qualifiers each) | Median | Range |
|---|---|---|
| y-intercept | 9.7 | 9.4–16.1 |
| x-crossing | 14.4 | 9.8–16.1 |
| gradient | **17.2** | 13.4–18.8 |
| heights at x = 2, 3, 5, 7 | 10.9–13.3 | 7.4–14.7 |
| where y = 1, 2 | 12.2–12.7 | 8.5–15.8 |

Over 4 random lenses, qualifier medians run from 8.1 (repdigit base 5, 2-primes 9.4) to 23.5 (primes ≡ 3 mod 7). The
spread within one qualifier across lenses is as large as between qualifiers.

- **Not balanced as it stands.** A randomly dealt rule's reach varies about 2–3× between lenses, qualifiers and their
  combinations. With shortcuts the gradient reaches the most (a stretch or tilt changes it cheaply), reversing the
  window result in §A11. So balance must be measured on the real moves, not in a fixed window.
- **Proposal (a scoring decision for the coordinator and the owner):**
  - *par-normalise* each dealt (lens, qualifier, parameter) combination: measure the median best bits it reaches from
    births on the real moves and prices, and scale its bits by par ÷ that median, so every dealt rule offers the same
    reachable value;
  - or deal only combinations within ±1 bit of a common par and exclude the rest.

  The spec lead's offline valuation per declared grid is where either fits.

**Dynamism: random tables** (scripted seats, 24 objects, 300 s, mutator moves; 6 tables of 3 and 6 of 4 seats, random
lenses, qualifiers, second lenses and bases):

| | Table total F | Objects moved in the last 100 s | Seats' bits at the end, max ÷ min |
|---|---|---|---|
| fixed parameters (12 tables) | flat from 50–100 s in all 12 | **4–13%** | 1.1–2.5 (median about 1.4) |
| **each seat's qualifier redrawn within its family every 50 s** (the same 12 tables) | keeps changing in all 12, rising and falling | **54–100%** (median about 90%) | 1.2–3.7 |

- **Perpendicular, parameterised rules do not by themselves stop play from settling.** With fixed parameters every
  table froze: the seats keep spending energy but shuffle a few objects (§A8's structural reason).
- **Drifting dealt parameters do stop it.** A drifting value, for example "a prime ending in 7" becoming "a prime ending
  in 3", sends every seat climbing again. These families make that cheap: each family already has a declared grid of
  values, valued offline. It is the §A8 drifting target, built out of decision 41's parameters. It is a game-rule change
  (rules change during a game), for the coordinator to put to the owner, with how a 12-year-old would read it: "your
  rule's number changes every few minutes".
- **No one-sentence strategy** was apparent in the random tables: the random tables' best states were not one family,
  and pairs are near-perpendicular (§A11). That was judged from the tables, not measured by a test.

**Limits.**
- My scripted seats and prices are the harness's (§A2), not the server's. The time-dilation helper is not on develop
  yet, so these results are to be re-run on the real engine.
- Balance used 3 births and 4–6 random partners per lens or qualifier, so individual numbers are noisy (±2 bits).


## A13. The drift trial and the gradient lens (coordinator's calls, 15 November)

The coordinator's calls:
- **No par-normalisation.** Deal only combinations whose reach is within a band of par, and fix causes.
- **Parameter drift is a declared TRIAL game setting**, off by default until measured. Two measurements were asked for
  before choosing its default. Raw output is in `scripts/line-drift-results.md`; the script parts are `--part drifttrial`
  and `--part lensfix`, both with mutator moves.

**The gradient lens, a balance fault, fixed by a lens change.** Best bits in reach, median over 8 random qualifiers, on
the same births and reach as §A12:

| Lens | Median | Range |
|---|---|---|
| the gradient | 16.9 | 12.0–20.6 |
| how much the line climbs from x = 0 to x = 10 | 17.1 | 9.3–19.7 |
| the gradient's top number (in lowest terms) | 14.9 | 11.5–19.4 |
| **the gradient's bottom number (in lowest terms)** | **12.5** | 9.2–13.8 |
| the y-intercept | 11.8 | 7.7–14.2 |
| the height at x = 1 | 11.1 | 8.6–12.0 |

Recommendation: replace "the gradient" as a primary lens with "the bottom number of the gradient as a fraction in
lowest terms". It is rational-native and within about 1 bit of the y-intercept. Keep the gradient as a tie-breaker lens.
Scaling the gradient (×10) does not help.

**(1) Fixed parameters under the beginner economy** (8 ⚡/s, 600 at the start, cap 1,920, 24 objects; 12 random tables at
300 s and at 600 s):

- Play still settles. The table total is flat for most of the game in 9 of 12 tables at 300 s, and 4–17% of objects
  move in the last third, with a few exceptions (33–75%) when one late climb finishes.
- At 600 s the picture is the same: scarce energy slows the first climb, but it does not keep the board moving.
- Seats' end bits differ by max/min 1.1–2.9.

**(2) Drift intervals on a 600 s game** (8 ⚡/s; 3 and 5 objects; 12 tables × 2 object counts × 4 settings):

| Interval | Objects moved in the last 200 s | Table total over time | Share of the board's bits a redraw takes | Seats' end bits, max/min |
|---|---|---|---|---|
| off | 0–100%, median about 33% | flat from 100–200 s in most tables | – | median about 2.5 (1.3–12.7) |
| 50 s | about 100% | changes at every 100 s step; a redraw lands before most climbs finish | 15–59% (mean about 35%) | median about 2.3 (1.2–7.5) |
| **120 s** | about 100% | climbs usually finish shortly before the next redraw, then the board is shaken up | 18–62% (mean about 38%) | median about 2.5 (1.1–3.5) |
| 240 s | 33–100% | the board settles within about 100 s of a redraw, then sits | 12–71% (mean about 40%) | median about 2.5 (1.4–10.5) |

- **Drift keeps play moving at every interval**, against off.
- **"Can seats still plan"**, judged by whether a climb finishes before the next redraw:
  - at 240 s, climbs finish and the board then sits for half the interval (settling returns within each interval);
  - at 50 s, most climbs are cut short;
  - **120 s** is the interval at which a climb usually completes and is then disturbed.
- **Fairness across seats is not changed by drift.** The max/min spread is about 2.5 with or without drift, and it is
  noisy with only 3–5 objects (single runs reach 7–13).
- **The redraw cliff** takes about 35–40% of the board's bits on average. The design note to the spec lead offers an
  unmeasured softener: show the next value one interval ahead.

**Recommendation to the coordinator:** a default of 120 s on a 10-minute game, about 4 redraws. Re-measure on the
server's engine and prices with the time-dilation helper when it lands.


---

## Part B. The first round (#607): whole-number features on fraction lines

### B0. The summary of the first round

**What I tried.** Eight rule families on fraction lines (a·x + b·y + c = 0), each with a primary a 12-year-old can read
("the y-intercept is as close to a whole number as possible") and three advanced secondaries, 24 rules in all, following
the owner's pattern (decision 23). The secondaries cover what the brief asked for: (a) number structure that does not grow
with size (the decimal period of 1/n, "nearly a perfect square", a second representation also nearly whole); (b) primaries
that read several coefficients at once (distance from the centre, gradient × intercept, the line passing near a peg,
the area with the axes); (c) several representations of one line constraining each other (both intercepts, the area and
√(a² + b²)); and (d) a dealt twist (a target gradient T, a column x = T), per game and per object. Nine tables of three
and four of these rules went through the five collapse tests.

**What does not work, and why. No candidate passes the collapse check. I could solve every table in one sentence.**

1. **Bounded secondaries do not ramp, but they are worth very little, and their best line is a small degenerate one.**
   "1/n has a long repeating decimal", "n is nearly a square", "the x-intercept is whole too" top out at **1.3 to 10.5
   bits**, at lines like y = x + 1 or y = 7x + 7. A rule's top is worth −log2 of the law's mass on its best set, and that
   mass is dominated by the set's *cheapest* member. The law puts half of each coefficient on 0 and much of the rest on
   ±1, ±2, so every coincidence has a cheap solution near the centre. Example: "both intercepts whole" is satisfied by
   every line y = ±x + n, worth 2.1 bits.
2. **"As big as possible" secondaries still ramp.** Smallest-prime-factor secondaries reach 20 to 33 bits inside a line's
   share of a game, but their best line sits at the window's edge and grows with it (y = ±x ± 89 is the best of the
   control table; "m = ±1 and c the biggest prime you can afford" is still the sentence). Path-consistent prices make the
   ramp end where the money runs out (landscape-analysis H5), which is a budget, not a landscape. **So no "as big as
   possible" secondary survives on one line**, as the main source of bits or as a tie-breaker under the primaries tried.
3. **"Nearly whole" on a square root is a hidden ramp.** √(a² + b²), √(area) and the distance from the centre get closer
   to whole numbers as the numbers grow (√(n² + 1) ≈ n + 1/2n). Their exact hits are cheap and sit at the top, but the
   near-misses below them improve with size, so scripted climbers that cannot jump to an exact hit **walk outward for
   ever**: in two tables the climbers ended with a coefficient of 16,384 and 20,736.
4. **One line is too small a universe for "hard even for a frontier AI with compute".** A line's share of a game (2,475 ⚡
   at unit-step, path-consistent prices) reaches **about 2 million fraction lines** from one birth. Enumerating them and
   scoring three rules takes seconds. A rule-knowing climber with 10⁵ evaluations already gets 63–100% of the exact best.
   No rule on one line can fix that, because the searcher does not need to understand the rule, only to evaluate it.
5. **Few good states, and they share a closed form.** The best 24 distinct lines keep 68–100% of 24 × the best (the test
   asks for under 70%), and they are one family each: y = ±x + n, y = ±(7/2)x + 7n, slope = the dealt T.
6. **Dynamics freeze.** In 5 of 9 tables the table total stops changing within 50 s of a 300 s game; in the others the
   seats walk one or two objects outward along a ramp. Seats with fixed utilities on independent objects converge; that
   is a mechanism, not a tuning problem (§B3.4).

**What works, partly.**

- **Disclosure noise works** on these rules as it did on the old ones: identifying the other seats' rules from disclosed
  sums takes 2–28 probes when exact, 68–431 at σ = 2 bits, and is not done in 1,500 probes at σ = 8 in 13 of 15 runs.
- **A per-object twist makes the 24 objects 24 different problems**: with a per-object target gradient T, each object's
  best line differs (T = 5/3 → y = (5/3)x + 7; T = −2/7 → y = −(2/7)x + 3; T = 1/6 → y = x/6 + 3). It stops copying, not
  solving: each object's answer is again one sentence ("the simplest fraction at T, intercept a small multiple").
- **Coupled primaries do entangle the seats.** Primaries that read a, b and c together (distance, product, pegs) make the
  seats fight over the same coefficients, and the hardest table for a climber (Whole Distance/rep + Whole at x = 7/spf +
  Target Gradient/whole intercept) has a single needle (2 near-best states of 2 million) that 10⁵ evaluations reach only
  63–66% of. It is hard for a climber, trivial for enumeration.

**What needs the owner's decision** (none of these is taken here; each would change a game rule):

1. **More numbers per object** (proposal (c) at scale). An object of two or four lines, with rules that read across them
   ("where your two lines cross is nearly a whole-number point"), makes the reachable set about (2·10⁶)² = 4·10¹² or more,
   not enumerable, and gives coincidence rules room for ~30 bits without size, as on grids (16 cells, 60 climbs ended in
   60 places). Decision 2 and "lines per object" (coordinator's call (c), default 1) are where this lives. **This is the
   recommended next study**: it keeps every rule a pure function of one object.
2. **Relational rules** (a rule reads other objects). Out of scope by the owner's standing rule "every object is an
   independent universe"; flagged, not proposed.
3. **The law's mass at 0 and ±1** (landscape-analysis proposal 7). It is what makes every coincidence cheap at the centre
   and caps bounded rules at ~10 bits. A flatter law is a change to the potential, births and prices.
4. Whether a bounded rule worth ~10 bits at its top is acceptable at all, given "on order 30 bits worth of surprise within
   reach for each" rule. On one line, with this law, the measurements say a rule gets 30 bits only by size (a ramp).

---

### B1. Setup

- **Object.** A fraction line a·x + b·y + c = 0, primitive, b > 0 (or b = 0 < a: a vertical line, which these rules
  score as worst), the line-q object. Every rule reads a representation of the one line: gradient m = −a/b, y-intercept
  k = −c/b, x-intercept X = −c/a, area with the axes A = c²/(2|a|b), distance from the centre |c|/√(a² + b²), y at a
  given x.
- **Law.** Each of a, b, c from the mixed integer code (decision 17), conditioned on canonical lines (`lineLaw`).
- **Bits.** −log2 π{lines whose (primary, secondary) is at least as good, lexicographically}, estimated from 216,446
  canonical draws of the law tilted to t = 0.55 and reweighted (an empirical ladder, decision 22). No state measured fell
  past the sample's top.
- **Prices.** Path-consistent unit steps (#580): one call changes a, b or c by ±1 and costs log2 9 + the one-step code +
  max(0, Δφ) bits, charged W + 0.05·W² ⚡. A line's share of a three-seat game is 2,475 ⚡; a seat's game is 19,800 ⚡.
- **Table total.** F = Σᵢ nᵢ · Σ_{j≠i} nⱼ on each line, as in landscape-analysis.md.
- **Twists.** For the tables, Target Gradient's T = 5/3 and Whole at x = T's T = 7. §B3.5 varies T.

### B2. The eight families

Kid-readable primary first; secondaries are the three alternatives (decision 14: one primary, several secondaries, a
dealt rule is the primary plus one). Every primary is continuous (decision 13): closer is better, with no buckets.
"Bits" are the rule's top in the |a|, |c| ≤ 24, b ≤ 24 window, at the smallest line that reaches it, and the median best
over the cheapest 150,000 lines reachable from six births (the reach runs to 530–674 ⚡ of the 2,475; the full reach is
about 2 million lines).

| # | Family: primary (kid text) | Secondary | Maths | Top bits (window 24) @ line | Best in reach (bits) | Ramp? |
|---|---|---|---|---|---|---|
| 1 | **Whole Intercept**: the y-intercept is as close to a whole number as possible | spf: that number's smallest prime factor is big (the owner's example) | −‖c/b‖, then spf(round(c/b)) | 15.9 @ (−23, 1, −23), was 9.3 at window 12 | 28.7 | **yes** (edge, grows) |
| | | rep: 1 ÷ that number has a long repeating decimal | ord_n(10)/(n − 1) | 8.1 @ y = 7x + 7 | 8.1 | no; degenerate top |
| | | x-whole: the x-intercept is nearly whole too | −‖c/a‖ | 2.1 @ y = x + 1 | 2.1 | no; worthless |
| 2 | **Whole Crossing**: the line crosses the x-axis as close to a whole number as possible | spf | spf(round(−c/a)) | 16.8 @ y = x + 23 | 32.8 | **yes** |
| | | sq: that number is nearly a perfect square | −‖√n‖ | 6.3 @ y = x + 4 | 6.3 | hidden (√ near-misses) |
| | | area-whole: the triangle with the axes has nearly whole area | −‖A‖ | 5.1 @ y = 2x + 2 | 5.1 | no |
| 3 | **Whole Distance**: the line's distance from (0, 0) is as close to a whole number as possible | hyp-whole: √(a² + b²) nearly whole | −‖√(a² + b²)‖ | 3.7 @ y = 1 | 3.7 | hidden |
| | | spf | spf(round(dist)) | 17.1 @ y = 23 | 20.0 | **yes** |
| | | rep | reptend of round(dist) | 9.6 @ y = 7 | 9.6 | no |
| 4 | **Square Area**: the triangle with the axes has an area as close to a perfect square as possible | omega: the root has many prime factors (the owner's example 2) | Ω(round √A) | 8.5 @ y = 2x + 16 (7.7 at window 12) | 9.4 | slow ramp (powers of 2) |
| | | spf | spf(round √A) | 13.3 @ y = 2x + 22 | 26.0 | **yes** |
| | | k-whole | −‖c/b‖ | 6.7 @ y = 2x + 2 | 6.7 | no |
| 5 | **Peg Line**: the line passes as close as possible to a whole-number point in columns x = 1 to 9 | two-pegs: the second-closest peg is close too | second smallest ‖y(x)‖ | 1.3 @ y = x + 1 | 1.3 | no; worthless |
| | | spf of the peg's height | | 7.4 @ (−20, 3, 19) | 8.6 | slow |
| | | rep of the peg's height | | 5.8 @ y = 4x + 3 | 5.8 | no |
| 6 | **Target Gradient** (twist T): the gradient is as close as possible to the dealt T | k-whole | −\|m − T\|, then −‖k‖ | 10.5 @ y = (5/3)x + 1 | 10.5 | no; one-sentence top |
| | | spf | spf(round k) | 14.6 @ (−5, 3, −20) | 16.9 | **yes** (in c) |
| | | dist-whole | −‖dist‖ | 16.4 @ (−20, 12, −23) | 20.4 | hidden |
| 7 | **Whole at x = T** (twist T): at the dealt x, y is as close to a whole number as possible | next-whole: at x = T + 1 too | −‖y(T)‖, −‖y(T+1)‖ | 1.8 @ y = x + 1 | 1.8 | no; worthless |
| | | spf | spf(round y(T)) | 8.4 @ (−24, 1, −23) | 9.2 | edge |
| | | rep | | 5.3 @ y = x | 5.3 | no |
| 8 | **Whole Product**: gradient × y-intercept is as close to a whole number as possible | spf | spf(round(m·k)) | 18.4 @ y = 23x + 23 | 24.1 | **yes** |
| | | rep | | 9.8 @ y = 7x + 1 | 9.8 | no |
| | | x-whole | | 2.1 @ y = x + 1 | 2.1 | no; worthless |

(‖x‖ is the distance from x to the nearest whole number.) A birth scores 0.8–2.5 bits on every rule.

**Reading it.** Every rule is one of three kinds. *Size rules* (spf, and to a lesser degree omega and the peg height)
reach 17–33 bits in reach and ramp. *Coincidence rules with an exact top* (rep, sq, x-whole, area-whole, k-whole,
next-whole, two-pegs) do not ramp at the top, but the top is a tiny line worth 1–10 bits: the exact coincidence is cheap
near the centre because the law is. *Root near-misses* (hyp-whole, sq, dist-whole) have an exact top plus a ramp of
ever-better near-misses below it, which climbers walk (§B3.4). None reaches the owner's "on order 30 bits within reach"
without a ramp. The landscape analysis's correlation test (bits against φ above 0.9) does not fire on line-q, because φ
there includes a and b; the edge and growth tests do.

**Why, in one line.** A rule's top is worth −log2 π(its best set) ≈ φ of the set's cheapest member. If the best set has
a cheap member, the top is cheap and central; if not, its members are big, and bigger is the direction of travel. To get
~30 bits with neither, the best set must need many *independent* numbers to line up, and one line has only three.

### B3. The collapse tests on tables

Nine tables: the owner's pattern with spf everywhere (control, 3 and 4 seats) and seven of the new rules in groups that
make their primaries share coefficients.

| # | Table | Exact best in reach | Near-best (≥ 90%) lines / slopes | 10⁵-eval climber / exact | Best 24 distinct keep | Slopes in top 24 | Dynamics: F at 50 s steps; objects moved in the last 100 s |
|---|---|---|---|---|---|---|---|
| 1 | Whole Intercept/spf + Whole Crossing/spf + Whole Distance/spf (control) | y = ±x ± 89 | ~50 / 2 | 0.15, 0.52, 0.94 | 0.70 | 3 | 1,283 → 1,339, rising slowly; 54% (walking c outward) |
| 2 | Whole Intercept/rep + Whole Crossing/area-whole + Whole Distance/hyp-whole | y = (47/2)x − 47 | 32–36 / 16–18 | 0.96, 0.78, 0.95 | 0.93 | 12 | 1,039 → 1,166; 54%; a coefficient reached 16,384 |
| 3 | Peg Line/two-pegs + Whole at 7/next-whole + Whole Product/x-whole | y = x + n (any n) | ~35,000 / 333 | 1.00 | 1.00 | 8 | 347 → 357; flat top |
| 4 | Square Area/k-whole + Target Gradient/dist-whole + Whole Crossing/sq | y = (5/3)x − 70/3 | 6–8 / 3–4 | 0.91, 0.91, 0.90 | 0.86 | 5 | 2,034 → 2,156; a coefficient reached 20,736 |
| 5 | Whole Intercept/x-whole + Peg Line/rep + Square Area/omega | y = x/2 − 48 | 10 / 4 | 0.84, 0.91, 0.84 | 0.76 | 12 | 1,105 flat from 50 s; 4% |
| 6 | Whole Distance/rep + Whole at 7/spf + Target Gradient/k-whole | (−4, 3, −95) | 2 / 1 | 0.66, 0.63, 0.65 | 0.89 | 12 | 1,232 flat; 13% |
| 7 | Table 2 + Peg Line/two-pegs (4 seats) | y = (47/2)x − 47 | 24–28 / 12–14 | 0.89, 0.95, 0.84 | 0.94 | 12 | 1,586 flat; 8% |
| 8 | Whole Product/rep + Whole at 7/next-whole + Square Area/k-whole + Target Gradient/dist-whole | (−25, 15, 27) | 2 / 1 | 1.00, 0.74, 0.93 | 0.75 | 7 | 2,426 flat; 8% |
| 9 | Control + Whole at 7/spf (4 seats) | y = ±x ± 89 | ~55 / 2 | 0.94, 0.98, 0.97 | 0.68 | 7 | 2,012 flat; 8% |

Columns 3–5 are over the full reach of three births (1.98, 2.01 and 2.26 million lines).

#### B3.1 Test 1, no ramp: fails for every size secondary; bounded ones pass by being worth little

See §B2. 8 of 24 rules have a growing top at the window's edge; 4 more ramp below an exact top.

#### B3.2 Test 2, no cheap optimum for a rule-knowing searcher: fails

Exhaustive enumeration of the reach (2 million lines) took a few seconds a birth in a single-threaded script; a frontier
AI with compute does the same. Against the check's literal bar (10⁵ evaluations reaching 95% of the reference), a
steepest-ascent climber with restarts passes on tables 5, 6 and 8 and on some births of 1, 2 and 7. That is a measure of
needles, not of a landscape: table 6's optimum is 2 lines out of 2 million, and enumeration finds it. Table 3 has 35,000
near-best lines (every y = x + n) and is trivial.

#### B3.3 Test 3, no single answer: fails

The best 24 distinct lines keep 68–100% of 24 × the best (the check asks for under 70%). Each table's best states are one
sentence:

- Table 1 and 9: "y = ±x + p, p the largest prime you can afford" (as on line-z).
- Table 2 and 7: "gradient ±p/2 with p a full-reptend prime, intercept ∓p" (7, 17, 19, 23, 29, 47 …): both intercepts whole
  (−p and 2), area whole, and √(p² + 4) close to whole for large p (the hidden ramp), so the best line grows with p too.
- Table 3: "y = x + n". Table 4: "gradient T, the intercept a multiple of 1/3 that makes the rest whole".
- Table 6: "a 3-4-5 direction (whole distance), the intercept making y(7) a prime".

#### B3.4 Test 4, no convergence in play: fails, by freezing or by walking outward

Scripted seats (each second each seat makes its best affordable unit move by gain per ⚡ in its own points rate,
uniqueness enforced, a seat's 19,800 ⚡ over 300 s) never sit idle, but in tables 5–9 the table total stops changing by
50 s: the seats shuffle one or two objects between equally good states. In tables 1, 2 and 4 the total keeps rising by
1–2% a minute because a seat walks one object outward along a ramp (a big prime, or a root near-miss to 16,384 and
20,736). Neither is the dynamic ecosystem asked for. The mechanism is general: with each object an independent universe
and every utility fixed, a hill climber stops at a local maximum of its objective, and the only motion left is conflict
between seats over the same object. The rules here make the seats' interests overlap (they share coefficients) but not
conflict much, because the cheap degenerate lines (y = ±x + n) are good for nearly every rule at once.

#### B3.5 Test 5, disclosure: passes with noise, fails without

| Table | Candidates | σ = 0 | σ = 2 | σ = 8 |
|---|--:|---|---|---|
| 2 | 189 pairs | 3–28 probes | 214–431 | 1,165, 1,495, and 3 of 5 not identified in 1,500 |
| 3 | 189 | 2–4 | 68–397 | 5 of 5 not identified |
| 7 (4 seats) | 945 triples | 3–14 | 173–304 | 5 of 5 not identified |

The same as the old pool (landscape-analysis H4): exact sums give the rules away; v1's 8-bit noise hides them. Disclosure
noise was deleted in D1 and is open with the owner (`v1-audit.md`); nothing here changes that.

#### B3.6 The twist (d): per object it varies the answer, not its form

Target Gradient/whole intercept with Whole Intercept/rep and Whole Distance/hyp-whole, at six values of T (window 24):

| T | Best line | Best 24 keep | Slopes in top 24 |
|---|---|---|---|
| 5/3 | y = (5/3)x + 7 | 0.72 | 8 |
| −2/7 | y = −(2/7)x + 3 | 0.61 | 8 |
| 3/4 | y = (2/3)x + 7 | 0.76 | 10 |
| 7/2 | y = (7/2)x + 7 | 0.74 | 9 |
| −4/5 | y = −(4/5)x + 3 | 0.81 | 9 |
| 1/6 | y = x/6 + 3 | 0.66 | 7 |

Dealt per object, T makes the 24 objects 24 different problems, so "copy the best line" no longer works, and dealt per
game it stops answers carrying over between games. Each problem is still solved by one sentence ("the simplest fraction
at or near T, then the intercept that makes the secondary exact"). A twist keeps its parameter named, typed and of equal
opportunity if T is drawn from a set whose members give the same top bits (the six above give 10–12 bits); that is a
calibration per value, as decision 20 allows.

### B4. Being adversarial: the one-sentence solutions

For each family alone: Whole Intercept/spf, Whole Crossing/spf, Whole Product/spf: "y = ±x ± (largest affordable
prime)". Whole Distance/spf: "y = largest affordable prime". Square Area/spf: "y = 2x + 2p". Any rep: "make the number
7 (or the nearest full-reptend prime)". Any x-whole, k-whole, next-whole, two-pegs, area-whole: "y = x + n". hyp-whole:
"a horizontal line" (√(0 + 1) = 1). Peg Line: "any line with whole gradient and intercept". Target Gradient: "slope =
T's simplest fraction". Each table's sentence is in §B3.3. I found every one in under a minute from the rule text and
checked it against the measured tops.

### B5. What this suggests for the next round (proposals, for the owner)

Ranked by what the measurements say would move the tests, and all within "a utility is a pure function of one object"
except where marked.

1. **Objects of two or four lines, with rules that read across them** (needs the owner: object variant and default lines
   per object). Kid-readable primaries exist: "your two lines cross as close as possible to a whole-number point", "the
   triangle your three lines make has nearly whole area", "your four lines make a nearly square shape". Coincidences then
   need several independent numbers (as on grids, whose 16 cells have 39 bits of collision entropy against line-q's 5.9),
   so bits come from structure, not size, and the reachable set (≈ 4·10¹² for two lines) is not enumerable. This is the
   next measurement to make, with this script extended to tuples.
2. **No exact cheap degenerate states**: exclude, or score as worst, the lines every coincidence loves (gradient 0 or ±1,
   intercept 0), or make the law less concentrated there (needs the owner: landscape-analysis proposal 7). Without it,
   bounded secondaries stay at 1–10 bits whatever they say.
3. **Never use "nearly whole" on a square root as a secondary below an exact top.** Its near-misses improve with size
   (√(n² + 1) ≈ n + 1/2n) along a path of unit steps, and climbers walk it. Near-misses of fractions improve with size
   too (the best non-zero ‖c/b‖ is 1/b), but in these runs no climber walked one, presumably because growing b is dear
   under the law; that is not measured separately. If a root is read, read only whether it is exact.
4. **Per-object twists** (T per object, drawn from a calibrated set): stops copying and carry-over between games at the
   cost of a value cache per T. Worth doing with 1; alone it does not pass tests 2–4.
5. **Disclosure noise σ ≈ 8 bits** (open with the owner in the v1 audit): passes test 5 for every table measured.
6. **"As big as possible" secondaries**: drop them from tables where they are the only source of bits above ~10, or bound
   them by a dealt target (landscape-analysis proposal 8). On one line I found no setting where bigger stops paying before
   the budget does.
7. **Relational rules** (needs the owner to change "every object is an independent universe"): the only route measured
   or estimated so far in which an object's best state depends on states other players are moving. Listed for
   completeness; not proposed.

### B6. Limits of these measurements

- Unit steps on a, b, c stand in for the mutators (shift, tilt, step, pivot …); the real moves reach slightly different
  sets at similar costs. The per-rule "best in reach" is over the cheapest 150,000 lines (up to 530–674 ⚡); the table
  tests use the full reach.
- Ladders are empirical (216,446 weighted draws); tops above ~35 bits would need a larger sample. None was hit.
- The scripted seats are greedy and selfish; model seats talk and coordinate, which in the landscape analysis made
  collapse faster, not slower.
- Tables were chosen to make primaries share coefficients; I did not search all C(8, 3) · 27 tables.
