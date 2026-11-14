# Why lines are easy to optimise, and what would make them hard (14 November 2026)

Status: analysis with measurements. Nothing here changes game behaviour. The script is
`lib/v2-agents/scripts/landscape.ts`. Run it with `node --experimental-strip-types scripts/landscape.ts [--part …]`
from `lib/v2-agents`. Every part together takes about ten minutes.

The question (coordinator, 14 November): AI seats on a three-rule line table told each other their rules and, within a
minute, set every line to y = −x + 59. Scripted settle tables score 3–18× naive. The owner's criterion is "an enormous
complex mathematical landscape that is hard work, even for a frontier AI with a substantial amount of compute, to find
optimal solutions in"; "if you discover that optimal *solutions* are ever being found you should report this as a bug."

---

## The finding in plain words

**Every line rule in the pool is the same simple ramp in disguise.**
- Most rules end in "…and that number should be as big as possible". A rule's value in bits is how rare its score is
  under the game's law of lines. The law makes a big prime about as rare as its own length. So the value of "a big prime
  y-intercept" is, almost exactly, *how long the number is*. More digits mean more bits, smoothly, for ever.
- Rules that read the same number agree about which way is up. Prime Landing wants c to be a big prime. Whole Crossing
  wants −c/m to be a whole number with a big smallest factor, so it wants m = ±1 and c a big prime too. Prime Gradient's
  c-tie-breakers want the same.
- So the three-seat table has no peaks to find, only a direction to walk: "m = ±1, c the biggest prime you can afford".
  Once the rules are said in chat, one sentence of number theory solves the table. No search is needed.

**The state the seats agreed on was not the optimum. It was the corner of the window they looked in.** y = −x + 59 is the
best line with |c| ≤ 60, because 59 is the largest prime below 60. Widen the window and the best line moves to its edge
every time: y = −x + 397 (29× the table total), −x + 997 (175×), −x + 2999 (1,567×). On today's prices, a line's share
of one game's energy (2,475 ⚡) reaches y = −x + 887, worth **139×** the agreed state. The seats left more than 99% of the
table's points unclaimed. The landscape is not too easy to search: there is nothing to search. It is a ramp whose top is
wherever the money runs out.

**What a blind climber sees is different.** Valued lines are isolated needles (c exactly prime and m exactly ±1), so a
greedy climber with no rule knowledge stalls after about 6 moves on a needle worth 0.3× the agreed state. The difficulty is
all in *not knowing the rule*, and chat removes that for free. A landscape that is hard only for those who cannot read
the card is a static exam once the card is read aloud.

**What would make it hard** (§3, ranked): value that comes from rare *coincidences between several numbers* rather than
from one number's size; rules that read other objects, so no object's best state is fixed; a dealt per-game target or
per-object twist, so no answer carries over; more numbers per object; and noisier, slower disclosure. Path-consistent
prices and uniqueness, the two fixes already in hand, stop the runaway but do not make the landscape rugged (§2.5, §2.6).
A nightly **collapse check** (§4) would catch a regression.

---

## 1. Setup

- **Variant.** line-z (y = mx + c, whole m and c), the beginner economy: 64 ⚡/s, 30 s to full charge (1,920 ⚡ cap),
  600 ⚡ at the start. A 300 s game gives one seat 19,800 ⚡. Three seats over 24 lines give 2,475 ⚡ a line.
- **Law.** m and c are independent, each drawn from the mixed integer code: p(0) = ½, and
  p(±n) = 2^−(2 + ½·sopfr(n) + log2 Z). sopfr(n) is the sum of n's prime factors with repeats. A prime p costs about
  p/2 bits; a smooth composite of the same size is cheap.
- **Value.** A rule's bits at a line are −log2 π{lines whose score is at least as good}, from the committed value
  functions (`lib/v2-valuation/values/line-z`).
- **Table total.** On one line, F = Σᵢ nᵢ · Σ_{j≠i} nⱼ (points accrue at this rate; `scripts/anarchy.ts`).
- **The mixed table.** Prime Landing/big-prime, Treasure/prime-terms and Whole Crossing/k-spf: the table the seats played.
- **Prices.** As v2-core prices one call: which (log2 9) + argument (steps: 1 + ½(|k| − 1) + 1.77) + surcharge
  max(0, Δφ). The act charge is W + 0.05·W². The script checks its prices against `applyPriced`. "Path-consistent" below
  means unit steps only, so a far move costs at least its path. That is the repricing in progress.

## 2. The hypotheses

### H1. Few degrees of freedom: CONFIRMED, and it is the smaller part of the problem

A line-z state is two integers. Births sit at the centre: of 48 births, the median |m| is 1, the median |c| is 0, and 24
are flat (m = 0, which the law draws half the time).

States reachable from a birth (separable cheapest-path search over shift, tilt and sign flips. Stretches and steps
would add a few more):

| Budget | Today's prices (jumps ≤ 64) | Path-consistent (unit steps) |
|---|---|---|
| A full charge, 1,920 ⚡ | 2.6 million states, \|c\| up to 1,331 | 27,500 states, \|c\| up to 96 |
| A line's share of a 3-seat game, 2,475 ⚡ | 4.4 million, \|c\| up to 1,728 | 36,000, \|c\| up to 106 |
| One seat's whole game on one line, 19,800 ⚡ | 276 million, \|c\| up to 13,455 | 248,000, \|c\| up to 270 |

- Evaluating three rules costs about 6.5 µs a line. A line's whole reachable set takes **about 90 s** to enumerate at
  today's prices and **under 1 s** at path-consistent prices.
- Enumerating the full game-scale window (|m| ≤ 10, |c| ≤ 60) and sorting it takes 0.2 s. |m| ≤ 40, |c| ≤ 400 takes 2.6 s.
- So exhaustive enumeration is trivial. But even an un-enumerable state space would not help, because of H2 and H3:
  with the rules known, the optimum needs no enumeration at all.

### H2. Concentrated law, so bits come from magnitude: CONFIRMED for every unbounded tie-breaker

- Σπ² on line-z is **0.068**, a collision entropy of **3.9 bits**. Half of each coordinate's mass sits on 0. For contrast,
  line-q's is 0.017 (5.9 bits) and the 4×4 grid's is 1.5·10⁻¹² (39 bits).
- With so little spread at the centre, high bits can only come from the tail. On line-z the tail of a coordinate is its
  size and primality (φ ≈ ½·sopfr).
- Per rule over |m| ≤ 60, |c| ≤ 600 (145,000 lines), with the tail taken as lines worth ≥ 10 bits:

| Rule | Top in window (bits, at (m, c)) | Corr(bits, φ) in the tail | R² of the tail on magnitude bins | Strict local maxima in the tail |
|---|---|--:|--:|---|
| prime-landing/big-prime | 301 at (−60, 599) | **1.00** | 0.91 | 0 of 12,584 (a pure ramp) |
| prime-gradient/prime | 33 at (59, −600) | 0.11 | 0.74 | 0 of 14,412 (a pure ramp in m) |
| prime-gradient/c-spf | 306 at (2, −599) | **0.99** | 0.30 | 4,080 of 4,624 |
| prime-gradient/c-gpf | 308 at (2, −599) | **0.99** | 0.09 | 5,970 of 15,334 |
| whole-crossing/k-spf | 292 at (−1, −599) | **0.99** | 0.52 | 2,070 of 2,280 |
| whole-crossing/k-gpf | 295 at (−1, −599) | **1.00** | 0.19 | 1,966 of 4,224 |
| square-area/spf | 156 at (−2, −586) | **1.00** | 0.44 | 708 of 708 |
| square-area/lpf | 145 at (−2, −586) | **1.00** | 0.18 | 1,704 of 1,704 |
| whole-crossing/m-spf | 33 at (−59, −590) | 0.92 | 0.80 | 1,036 of 1,036 |
| same-on-both-rulers/m-gpf | 49 at (−59, 360) | 0.66 | 0.19 | 118 of 118 |
| treasure/m-gpf | 46 at (−59, 155) | 0.30 | 0.03 | 121 of 257 |
| treasure/prime-terms | 15 at (−6, 49) | 0.00 | 0.05 | 121 of 166 |
| prime-staircase/first-prime | 19 at (−60, 311) | 0.03 | 0.08 | 489 of 489 |
| divisibility-ladder (four tie-breakers) | 11.4–11.5 at c = −420 | ≤ 0.49 | 0.02–0.95 | 30–656 of 242–1,178 |
| square-area/omega | 12 at (−2, −512) | −0.16 | 0.60 | 72 of 72 |

(All 23 dealt rules are in the script's output.)

- **20 of the 23 dealt rules have their top at the edge of the window** (|m| ≥ 54 or |c| ≥ 540). Every "bigger is better" tie-breaker on c or a derived whole number has its top there, at 145 to 308 bits, and its bits track the state's read length almost perfectly (correlation 0.99–1.00). Its
  value is the number's length. The window's edge, not the rule, sets the top: Prime Landing's top grows from 33 bits
  (|c| ≤ 60) to 201 (|c| ≤ 400) to 301 (|c| ≤ 600).
- **Bounded rules are where the texture is.** Treasure/prime-terms, Prime Staircase, Divisibility Ladder and
  Square-area/omega top out at 11–19 bits, near the centre. Their tails are not explained by magnitude (R² ≤ 0.1). These
  are the only rules with an interior optimum. They are exactly the ones a big-prime ramp outvotes on a shared table:
  Treasure gets 3.8 bits at the agreed state, against 33 for the other two.
- "Rugged" needs care. Most tail lines are strict local maxima under unit moves, because a valued line is a needle (c
  exactly prime). That is roughness at unit scale. At the scale of what the rule says, the needles lie on a line ordered
  by size. It is rough for a blind climber and smooth for anyone who has read the card.

### H3. Rules read one coefficient or a simple function of two: CONFIRMED

Which degrees of freedom each layer reads (by reading the code; the R² columns are each rule's variance explained by m
alone, by c alone, and by additive m + c effects, over the 145,000-line window):

| Family | Main layer reads | Tie-breakers read | R² m / c / m + c |
|---|---|---|---|
| Prime Landing | c (distance to a prime) | big-prime: c · m-spf, m-gpf: m | big-prime 0.00 / 1.00 / 1.00; m-tie-breakers 0.05 / 0.58 / 0.63 |
| Prime Gradient | m (distance to a prime) | prime: m · c-spf, c-gpf: c | prime 1.00 / 0.00 / 1.00; c-tie-breakers 0.16 / 0.12 / 0.28 |
| Divisibility Ladder | c mod lcm(1..n) (y(n)/n = m + c/n) | m | 0.04 / 0.95 / 0.99 |
| Prime Staircase | c, m + c, 2m + c, … (a prime run) | first-prime: c | 0.00 / 0.97 / 0.97 |
| Whole Crossing | −c/m | round(−c/m) · m | 0.14 / 0.01 / 0.15 |
| Square Area | c²/(2\|m\|) | the root √(c²/2\|m\|) | 0.10 / 0.01 / 0.12 |
| Treasure | 2m + c | m · y(1..8) = m + c … 8m + c | 0.00 / 0.21 / 0.21 |
| Same on Both Rulers | c/(1 − m) | m | 0.12 / 0.07 / 0.19 |

- **Seven of eight main layers read c, or c with m held to a small set.** Every one is a sieve on c: "c prime",
  "c divisible by lcm(1..n)", "c a prime with c/m whole". Sieves on the same coordinate intersect in a 1-D set of c values.
- **The interacting rules have a trivial fixed point.** m = ±1 turns −c/m into ∓c, c/(1 − m) into c/2 or c, c²/2|m| into
  c²/2, and 2m + c into c ± 2. So m = ±1 (or 2) reduces every interacting rule to a sieve on c as well. That is why the
  seats' state, and every top in H2's table, has m ∈ {±1, ±2} or m at the window's edge.
- A rule on m (Prime Gradient) and a rule on c (Prime Landing) do not interact at all: their best lines are the product
  of their best m and best c. 68 lines at game scale serve both at their tops (`rule-compatibility.md`).

### H4. Information: CONFIRMED (identification is cheap even without chat)

- **Rules said in chat: 0 probes.** The prompt tells seats to say their rule first; nothing else is needed.
- **Without chat**, a seat sees the others' exact summed bits for every candidate move. The simulation: 60 random
  tables. The seat knows its own family; the candidates are the 229 pairs of rules from two other families. Each probe is
  one line drawn from the birth law, with its disclosed sum. A pair counts as identified when its posterior reaches 0.95:

| Noise on the disclosed sum (σ, bits) | Median probes | 90th percentile | Not identified in 3,000 |
|--:|--:|--:|--:|
| 0 (today) | **3** | 12 | 0 of 60 |
| 2 | 1,218 | 3,000+ | 19 of 60 |
| 8 (v1's default `peerNoiseBits`) | 3,000+ | 3,000+ | 59 of 60 |
| 16 | 3,000+ | 3,000+ | 60 of 60 |

- Exact sums give the others' rules away in a handful of candidate evaluations. A seat's agent sees that many in its
  first act. v1 found the same and added 8-bit disclosure noise (`archive/engine-v1:docs/public-log-design.md` §5), keyed
  to the value so it cannot be averaged away. These probes are central births, the least informative lines. Probes
  chosen near the rules' tops would identify faster, so the noisy rows are upper bounds.
- So H4 is a real leak, but a secondary one. Once the rules are known, H2 and H3 make the table a closed-form problem.
  Hiding the rules only moves the table back to the blind-climber case.

### H5. Cheap long jumps remove path difficulty: CONFIRMED, but fixing it does not create a landscape

- A unit step costs 7.7 ⚡. One jump of k costs, against k unit steps: k = 5, 3.5× less; k = 20, 5.6× less; k = 58, 4.8×
  less; k = 400, 1.3× less (the β·W² term catches up only at hundreds).
- The bigger saving is in the surcharge. With jumps, a line hops prime to prime (397 → 401 → 409 …). Each hop pays only
  the small rise in φ, so the whole climb to a big prime costs about its read length. Unit steps must cross the cheap
  composites between primes and pay each prime's whole read length again. Moving a birth to y = −x + 397 costs
  **1,108 ⚡** at today's prices and **50,258 ⚡** at unit steps.
- Path-consistent prices shrink the reachable set about 120× (4.4 million → 36,000 lines a line-share). The table's best
  affordable line falls from y = −x + 887 (139× the agreed state) to y = −x + 103 or 107 (2.2×).
- **So path-consistent pricing stops the runaway and makes the agreed state nearly right.** It does not make the
  landscape hard: the best affordable state is still "the biggest prime on the ramp you can afford", now a smaller
  number, and the reachable set enumerates in under a second.

### H6. Uniqueness: CONFIRMED that it was needed, REFUTED that it now bites

The best 24 *distinct* lines for the mixed table, against 24 copies of the best:

| Window | Best line | 24 best distinct keep | Top five |
|---|---|--:|---|
| \|m\| ≤ 10, \|c\| ≤ 60 | y = −x + 59 | 54% | (−1, 59) (1, 59) (−1, 53) (1, 53) (−1, 47) |
| \|m\| ≤ 40, \|c\| ≤ 400 | y = −x + 397 | 85% | (−1, 397) (1, 397) (−1, 389) (1, 389) (−1, 383) |
| \|m\| ≤ 60, \|c\| ≤ 1,000 | y = −x + 997 | 93% | … |
| \|m\| ≤ 60, \|c\| ≤ 3,000 | y = −x + 2999 | 96% | … |

Uniqueness costs about half the points inside the game-scale box, where there are only a dozen primes. On the scale
that today's prices reach, it costs 4–15%. The best N distinct states are simply "y = ±x + each of the N/2 largest
affordable primes": one more line of the same sentence, no harder to find. Uniqueness stops copying; it does not stop
the formula.

### Was y = −x + 59 a global optimum?

No. It is the best line in |m| ≤ 10, |c| ≤ 60, the window `scripts/anarchy.ts` and the seats searched. F has no global
optimum on line-z: the table total grows about as the square of the largest prime used, and the best line is always at
the window's edge. Under an energy budget the best line is interior only because the budget is. At today's prices a
line's share reaches y = −x + 887 (139×). At path-consistent prices it reaches y = −x + 103/107 (2.2×), and one seat's
whole game on one line reaches y = −x + 269 (13.5×).

### Greedy climber against the optimum, and how long a frontier-style search needs

- **Greedy steepest ascent on F** (moves of up to 5 on shift, tilt and step, and sign flips; no rule knowledge, no energy
  limit) from 48 births: 10 distinct endpoints after about 6.5 moves, median F 823 (**0.3×** the agreed state), best
  1,330 (y = x + 31). F has 3,336 strict local maxima above the median over |m| ≤ 40, |c| ≤ 400 (5% of lines).
- **Search with rule knowledge.** Enumerating |m| ≤ 40, |c| ≤ 400 and sorting takes 2.6 s. Enumerating the energy-limited
  problem (cheapest paths, then every affordable line) takes a few seconds a birth. No annealing or beam is needed. The
  closed form ("m = ±1, the largest affordable prime c") is exact.
- So: rugged for a climber that cannot read the card, trivial for one that can. The seats could read the cards, because
  the cards were said in chat.

### In play: frozen at small radius, not at large (W2's freeze data, 14 November)

`lib/v2-agents/scripts/freeze.ts` runs a table with unique objects at the new prices (2 games each). For each final
object it then asks whether any single move within ±3 or ±10 would raise some seat's points or own bits.

| Table | Frozen at ±3 | Frozen at ±10 |
|---|--:|--:|
| Points climbers, line-z, births 0.1/s | ≈ 80% | 5–11% |
| Points climbers, line-z, births 1/s | ≈ 51% | – |
| Points climbers, line-q | 85% | 47% |
| Naive | 21% | – |

This is the same picture as above, seen in play. The landscape has dense, shallow local optima at small radius: needles
a unit move cannot leave. Improvements sit a few steps further out, along the same ramp. With path-consistent prices, a
small-step climber now stalls on those needles. That gives the dynamics the owner wants (objects keep moving), but only
because climbers are short-sighted, not because the landscape is deep. A seat that knows the rules still plans straight
along the ramp (H2, H3). The collapse check's test 4 should report freeze fractions at both radii.

### A high peak found by stretching (W2, 14 November): a reported bug

Setup: line-q, the new prices and decision 25's shortcuts, the conflict table (Prime Landing/big-prime, Square Area/spf,
Whole Crossing/k-spf). A scripted climber that tries stretch, pivot and mirror when it is stuck reached **y = −2x + 734**:
- the area is 734²/4 = 134,689 = 367², and 367 is prime, so Square Area/spf scores 248.7 bits;
- it crosses the x-axis at x = 367, so Whole Crossing/k-spf scores 198.6 bits;
- Prime Landing scores 4.1 bits.

That one line holds 102,419 table points, against 2,792 for the best whole-number line with |m| ≤ 10, |c| ≤ 60 (37×). The
climber got there almost entirely by `mach.stretch` (269 of its moves, 109% of the game's net points), with numbers of at
most four digits. To reproduce: `node --experimental-strip-types lib/v2-agents/scripts/freeze.ts --agents shortcut
--table conflict --games 1`.

**Why it happens.** This is H2 again, now reached through a shortcut:
- Every "as big as possible" tie-breaker is valued at about the length of the number.
- A stretch multiplies m and c by a factor and is priced by the factor's digits (decision 25), so it scales a line's
  numbers for a few bits.
- Here the line keeps its shape while its numbers grow: the crossing −c/m stays a whole number and the area stays a
  square.
- So a cheap move buys an unbounded amount of value.

H1's reachable-state counts left stretch out (§2, H1). With stretch, the magnitude axis of the ramp costs about log(size)
instead of size. Path-consistent pricing of additive moves does not touch this.

**What fixes it, within decision 25.** Shortcuts are wanted, so the fix belongs in the rules, not the prices. Proposals 2 and 8 below (value from
coincidences, not size; saturate or target the "as big as possible" tie-breakers) remove it at the source: a stretch
can scale a line, but it cannot scale a value that does not grow with size. Until then, the collapse check's test 1
("no ramp") flags exactly these tie-breakers.

## 2b. Contrasts: grids and fraction lines

| | line-z (2 integers) | line-q (3 integers, rationals) | grid 4×4 digits (16 cells) |
|---|---|---|---|
| Collision entropy of the law | 3.9 bits | 5.9 bits | 39.2 bits |
| Mixed table's best in the game-scale window | y = −x + 59 | x + y − 59 = 0 (the same line) | – |
| Best in a wider window | y = −x + 397, 28.6× (edge) | −x + y − 397 = 0, 28.6× (edge, the same line) | – |
| 24 best distinct keep (wide window) | 85% | 85% | – |
| Strict local maxima (above the median) | 5.1% | 11.6% (±1 nudges) | – |
| Greedy climbs | 10 endpoints from 48 births, median 0.3× the agreed state | – | **60 distinct endpoints from 60 boards**; only 1 reaches the best (6,110); median 1,161 |
| Simulated annealing, 200,000 evaluations | not needed (closed form) | not needed | best 6,110, median 4,582, worst 2,511 over 10 runs (3 min) |

- **Fraction lines change nothing for this table.** The rules read c, −c/m and 2m + c. Their tops on line-q are the same
  whole-number lines y = ±x + p, with the same ramp and the same edge. The extra freedom (a denominator) holds no value
  any of these rules reward. Rationals add states, not structure. They would add structure only with rules that reward
  something about fractions themselves: continued fractions, Farey neighbours, a rational point on a conic
  (`layered-line-rules.md` §1.5 has the lenses).
- **Grids are closer to what the owner asked for.** Every greedy climb ends somewhere different, annealing
  runs disagree by more than 2×, and nothing short of a large search finds the best board. Neither search proves its best
  board is the global optimum. Grids have 16 coupled numbers, rules that read overlapping sets of cells (rows, columns,
  mirrors), and bounded per-cell values. So high bits come from coincidences across many cells, not from one number's
  size. That is the structural difference proposals 1–3 import into lines.
- **But the grids are not safe either** (from the grid session, 14 November):
  - Every grid main part is a sum of bounded per-unit distances (Σ|row − 18|, Σ|b_i + b_{15−i} − 9|, palindrome gaps). That makes each main smooth, nearly separable and bounded, with a global top.
  - Several mains share satisfying patterns: rows like "2 7 2 7" are palindromes in pairs, sum to 18 and pair to 9.
  - A plain hill-climb with 6 restarts found 8118455454451881, at 26, 37 and 31 bits for the three rules.
  - Far moves are cheap there too: cells.add +9 costs 18.4 bits in one act, against 94 as unit steps.
  - So the grid's hardness here is moderate: a few seconds of restarts get within about 5% of the best board found (≈ 5,830 against 6,110). It comes from 16 coupled cells, not from rules that resist a solver.
  - The same proposals apply: coupling between objects, coincidences across units rather than separable distances, and path-consistent prices.
- Grid tables still beat naive 1.6–3× by settling (`ai-table-results.md`). Agreement on a good board is possible there
  too, but no one can say in one sentence which board is best.

## 3. Proposals, ranked

Each is meant to keep calibrated bits: a value is still −log2 π{at least as good} under the law, and what changes is
where the rare sets lie.

| # | Proposal | What it fixes | Measured or estimated effect | Cost |
|---|---|---|---|---|
| 1 | **Relational rules: a rule reads other objects** ("your line meets another line at a lattice point whose coordinates are both prime"; "your y-intercept equals the sum of two other lines' gradients"; "your crossing lies between two other lines' crossings") | H3, H6, metagame collapse. An object's best state depends on the others' current states, which other players are moving. The joint state is the whole board (24 lines, 48 integers) and its value does not separate into lines, so there is no fixed answer to copy or memorise. This is the direct route to a *metastable ecosystem*. | Estimated. The coupled search space is the board's 48 integers, against today's 2 per line. Even at path-consistent reach (≈ 36,000 states a line) that is 36,000²⁴ joint states with interactions. The grids (16 coupled cells) already show the signature: 60 climbs, 60 different endpoints. | Value is still exact. Under the product law, a pair or a k-tuple of lines is i.i.d., so "−log2 π{tuples at least as good}" is a sum over pairs or a Monte Carlo estimate (decision 22 allows empirical ladders). Engine: a move changes other players' scores on other objects, so the tick must re-score dependents (a dependency index). Pedagogy: "meets another line" is school geometry. |
| 2 | **Value from coincidences, not size: rules that couple coefficients and derived quantities, with bounded or dealt targets** (e.g. "m·c + 1 is a square *and* the crossing is whole"; "y(1..8) hold a Pythagorean triple"; "the area and the slant are both whole") instead of "that prime as big as possible" | H2. The rare sets stop lying at the far end of one axis and scatter. The top becomes interior. | Measured, partly: the pool's bounded rules (Treasure/prime-terms, Prime Staircase, Divisibility Ladder, Square-area/omega) have tail R² on magnitude ≤ 0.1 and interior tops, against 0.99–1.00 correlation with read length for every "as big as possible" tie-breaker. **But on line-z they top out at 11–19 bits**, because a 3.9-bit law has no room near the centre for 30 bits of coincidence. So 2 needs 3 or 4. | New families and value functions. Exact sums may not exist, so empirical ladders (decision 22). Removes the "utility and energy rise together" property for these rules, so it must be justified to the owner. |
| 3 | **More numbers per object** (line-z4's four lines, or lines with a third number such as a point or a weight), with rules that read across them (where the lines meet, the quadrilateral they bound) | H1, and room for 2. Bits can come from structure across 8+ small numbers, as on grids (39 bits of collision entropy) | Measured by contrast: grids, 16 bounded cells, have scattered optima (60 distinct climb endpoints, annealing runs differ 2×). line-q's one extra integer did **not** help (it only adds denominators no rule rewards). | line-z4 exists; families and annotations for multi-line rules do not. Harder for a 12-year-old to read. Keep the beginner tier simple and use this for the next tier. |
| 4 | **A dealt twist per game and per object**: Treasure's target T, the modulus, the window or the prime offset drawn per game from a wide set; or each object carries a hidden or public offset its rule reads through (score f(c + t_obj)) | Metagame transfer between games (a seat that solved Prime Landing once has solved it for ever) and copying between objects (H6) | Estimated: with per-object offsets, the 24 best distinct states stop being "the 24 largest primes" and become 24 different problems. Does not by itself make each problem hard. | Calibration per dealt parameter (cache by parameter; exact sums usually take a parameter). Card text must show the twist. |
| 5 | **Noise on disclosed sums, and fewer free exact readings** (restore v1's `peerNoiseBits` = 8, keyed per value; price "the others' total at a candidate" as a read) | H4 | Measured: identification goes from 3 probes (exact) to 1,218 (σ = 2) and to more than 3,000 in 59 of 60 tables (σ = 8). | Cooperation needs talk, which is the intent. Novices lose the exact "this helps the others" cue. Only matters once 1–3 make knowledge insufficient: today, knowing the rules solves the table, and chat gives them away. |
| 6 | **Path-consistent prices** (in progress) | H5: the runaway along the ramp | Measured: reachable set 4.4 million → 36,000 lines a line-share. Best affordable table total 139× → 2.2× the agreed state. The prime-hopping climb (y = −x + 397 for 1,108 ⚡) becomes 50,258 ⚡. | Already decided. Makes the landscape *smaller*, not rougher: enumeration drops from ≈ 90 s to < 1 s. |
| 7 | **A less concentrated law on lines** (p(0) = ½ today; a law with ≈ 12+ bits of central entropy, e.g. a geometric code with a lower ratio on small numbers, or no special mass at 0) | H2: lets bounded rules reach 20–30 bits near the centre | Estimated from line-z vs grid: collision entropy 3.9 vs 39 bits. Raising line-z's to ~12 would let a coincidence rule reach about 25 bits within \|c\| ≲ 100. | The law is the potential: births, prices and every value function change, and many lines are drawn horizontal on purpose today. Bigger births are harder to read. |
| 8 | **Saturating "as big as possible" tie-breakers** (target a dealt prime P, or "nearest to P", instead of the largest) | The unbounded ramp in H2 | Estimated: removes the window-edge optimum; the top becomes P's line. Combined with 4, P varies per game. | Small: a family parameter. Alone it turns the ramp into a single known target, which is easier still. Only useful with 1–4. |

**Recommended order.** 1 and 2 together are the change that makes the landscape what the owner asked for. 3 gives 2 room
on lines. 4 stops the metagame from carrying solutions across games and objects. 5 matters once knowledge no longer
solves a table. 6 is already under way and is hygiene. 7 and 8 are tuning.

**One principle behind all of them.** A rule's calibrated value is the rarity of its "at least as good" set under the
law. If that set is "far out along one axis", value is distance, and a product of distance-valued rules is a ramp. Value
should come from sets that are rare because several independent numbers must line up (within and *between* objects),
not because one number is big.

## 4. A standing collapse check

A check that fails when the landscape collapses again: `scripts/landscape.ts` is its seed. Proposed as a nightly CI
job (`pnpm --filter @workspace/v2-agents collapse-check`). The thresholds are starting points for the owner to set.

1. **No ramp.** For every dealable rule, measure its top in the energy-reachable window W and in 2W. The rule fails if
   its top lies at W's edge, grows by more than 10% from W to 2W, and its tail bits correlate with read length above 0.9.
   *Today: 8 of 23 line-z rules fail all three conditions* (big-prime, c-spf, c-gpf, k-spf, k-gpf, Square Area's spf and lpf, Whole Crossing's m-spf). 20 of 23 have their top at the window's edge.
2. **No cheap optimum, for a searcher that knows the rules.** For each of 20 dealt three-seat tables: give a searcher
   with full rule knowledge B = 10⁵ evaluations inside the energy-reachable set (path-consistent prices). It enumerates
   when the set is ≤ B, else anneals with 10 restarts. Compare with the best of 100·B evaluations. The table fails if
   the B-budget search reaches 95% of the reference. The variant fails if more than a quarter of its tables fail.
   *Today: line-z fails every table* (the reachable set, ≈ 36,000 lines, enumerates exactly). *Grids would be expected
   to pass:* 6.5 s of greedy climbs (≈ 10⁵ evaluations) reached the best only once in 60, and annealing medians sit at
   75% of the best found.
3. **No single answer.** On each table, the best N = 24 *distinct* states must keep less than 70% of N × the best state,
   or the 24 must not all satisfy one short closed form (checked by the top states all lying on one coordinate sieve:
   same m class, c in a sieve). *Today: 85–96% at reachable scales.*
4. **No convergence in play.** Run the scripted settle table and the model-seat table on the server economy (300 s,
   3 games). The variant fails if, over the last 100 s, more than half the objects sit within one unit move of a single
   state family, or fewer than 10% of objects change state per minute (the table has stopped moving).
   *Today: y = −x + 59 on every line, within a minute, then held.*
5. **Disclosure.** Probes until the others' rules are identified from disclosed sums (H4's simulation) must have a
   median above a set floor (e.g. 200). *Today: 3.*

Checks 1–3 and 5 are pure computation (minutes, no sandboxes). Check 4 needs `runTable` and, for model seats, a small
spend (about $0.20 a night at today's prices), so it could run weekly. A failing check files an issue rather than
blocking merges: the owner asked for collapse to be treated as a bug.

**Implemented** as `pnpm --filter @workspace/v2-agents collapse-check` (`lib/v2-agents/scripts/collapse-check.ts`,
thresholds in `src/collapse.ts`, shared tools in `scripts/landscape-lib.ts`) and the nightly, non-blocking workflow
`.github/workflows/collapse-check.yml`. It always exits 0. How each test is measured:

- **Prices.** The real ones: each one-coordinate move's fee and surcharge are read from v2-core's `applyPriced` (line-z:
  si.tilt and si.shift; line-q: gen.nudge on a, b or c; grids: cells.add), one call per act charged W + β·W², jumps
  of up to 64 (grids 9). Moving one coordinate at a time gives a cheapest cost per state; other mutators could only make
  a state cheaper, so W is a subset of what is truly reachable. W is a line's share of a 3-seat game (2,475 ⚡; grids
  2,513), counted at 24 objects.
- **Test 1** finds each rule's top in W and 2W by annealing (30,000 evaluations each) and the tail correlation on a
  uniform sample of 2W. **Tests 2 and 3** deal 8 tables on lines and 3 on grids (§4 says 20; `--tables`); the reference
  is W enumerated when it has at most 300,000 states, else 10·B of annealing (§4 says 100·B; `--ref-mult`). Test 3's
  "one closed form": one coordinate free, every other taking at most two values up to sign over the 24.
- **Test 4** runs the scripted starters only (no model seats) at 10 starting objects and 0.05 births a second (the
  beginner presets' new numbers; `--objects`, `--births`), 3 games of 300 s per β, plus one comparison row at the old
  24 and 0.1 (not counted). "No move found" is the share of acts in the last 100 s whose program returned no calls.
- **Test 5** is β-independent; it is repeated on each row and counted on each.

### First run (14 November 2026)

All tests, defaults (25 minutes on 4 cores; grids since measure tests 1–3 once when every board is reachable). Pools:
line-q from `lines-rational`, line-z from `lines-beginner`, grids from `grids-beginner`; no rule lacked a value
function. 23 failures. Abbreviated (full notes in the script's output):

| Variant | β | 1 no ramp | 2 no cheap optimum | 3 no single answer | 4 no convergence | 5 disclosure |
|---|--:|---|---|---|---|---|
| line-q | 0.02 | FAIL: 1/23 rules ramp, 8 tops at W's edge | FAIL: 4/8 tables cheap, B-search median 100% (W ≈ 2.4·10⁷) | PASS: 1/8 one answer, 24 best keep 83% | PASS: 10 → 20–24 objects; no move found 92%; 17%/min move; 12% in one family | FAIL: 1 probe |
| line-q | 0.05 | FAIL: 1/23, 12 at edge | FAIL: 3/8, 94% (1.2·10⁷) | PASS: 1/8, 75% | PASS: 10 → 21–29; 92%; 21%/min; 12% | FAIL: 1 |
| line-q | 0.05, 24 objects, 0.1/s | – | – | – | PASS: 24 → 47–58; 89%; 18%/min; 19% | – |
| line-q | 0.1 | FAIL: 1/23, 11 at edge | FAIL: 5/8, 100% (5.5·10⁶) | PASS: 0/8, 59% | PASS: 10 → 19–22; 91%; 23%/min; 12% | FAIL: 1 |
| line-z | 0.02 | FAIL: 3/23, 11 at edge | FAIL: 7/8, 100% (3.4·10⁵) | FAIL: 3/8, 81% | PASS: 10 → 19–23; 92%; 17%/min; 31% | FAIL: 5 |
| line-z | 0.05 | FAIL: 4/23, 16 at edge | FAIL: 8/8, 100% (2.1·10⁵) | PASS: 2/8, 89% | PASS: 10 → 22–23; 93%; 19%/min; 38% | FAIL: 5 |
| line-z | 0.05, 24 objects, 0.1/s | – | – | – | PASS: 24 → 42–55; 88%; 22%/min; 22% | – |
| line-z | 0.1 | FAIL: 2/23, 13 at edge | FAIL: 8/8, 100% (1.2·10⁵) | PASS: 2/8, 86% | PASS: 10 → 20–28; 92%; 19%/min; 35% | FAIL: 5 |
| grid-4-d10 | 0.02 | PASS: 0/24 | FAIL: 1/3, 92% (10¹⁶, every board) | PASS: 0/3, 71% | PASS: 10 → 20–28; 90%; 20%/min; 7% | FAIL: 1 |
| grid-4-d10 | 0.05 | PASS: 0/24 | PASS: 0/3, 81% | PASS: 0/3, 82% | PASS: 10 → 20–24; 90%; 21%/min; 5% | FAIL: 1 |
| grid-4-d10 | 0.05, 24 objects, 0.1/s | – | – | – | PASS: 24 → 52–58; 68%; 42%/min; 2% | – |
| grid-4-d10 | 0.1 | PASS: 0/24 | PASS: 0/3, 66% | PASS: 0/3, 80% | PASS: 10 → 24–30; 85%; 32%/min; 4% | FAIL: 1 |

What it says:
- **Lines fail tests 1, 2 and 5 at every β; line-q no less than line-z.** On line-z a searcher with the rules reaches
  the best line of W in every table at every β; on line-q in 3–5 of 8. The ramping rules on line-z are Whole Crossing
  (k-spf, k-gpf, m-spf) and Square Area/spf, with tops at 99–100% of W's energy that grow 73–86% from W to 2W. Raising
  β shrinks W (line-z 3.4·10⁵ → 1.2·10⁵ states) but does not change a verdict.
- **Test 4 passes everywhere, and that is the threshold's fault, not the game's.** The freeze shows in "no move found":
  85–93% of late acts at 10 objects (62–75% on grids at 24). But the starters still change 17–23% of line objects a
  minute, above the 10% floor, and the largest family on line-z holds 31–38%, under the 50% bar. The 10-object preset
  freezes harder than 24 objects did (line-z 93% against 88%; grids 90% against 68%).
- **Test 3 passes most line tables only through the closed-form clause**: the best 24 keep 75–89% of 24 × the best
  (§4 expected 85–96%), but the coarse closed-form check does not recognise their family.
- **Grids pass 1–4 apart from one cheap table in three at β = 0.02** (three tables are noisy); disclosure fails on
  grids too.

### Thresholds set 14 Nov

The coordinator set the thresholds, and the owner's decision 30 replaced test 1: unbounded hills are wanted, and
collapse is prevented by adversaries and diversity of goals. The constants are in `src/collapse.ts`.

- **Test 1: no unopposed joint rise.** For each dealt table, a direction is one call repeated 8 times: every call up to
  12 bits, plus the shortcut climber's moves on lines. The table fails when, from at least 25% of the distinct births,
  two seated rules each gain at least 2 bits by step 4 and more by step 8, and no third seated rule falls by at least
  half the smaller gain. That third rule would be the adversary. Single-rule ramps are now reported as information
  only.
- **Test 4: dynamics.** Idle acts are information. The test fails on any of three conditions:
  - (a) under the plain starters, fewer than 25% of the objects change in the last minute;
  - (b) a shortcut search (the climber in `scripts/climbers.ts`, shared with `scripts/freeze.ts`) finds no improving
    move on more than half the final objects;
  - (c) the gains made after the midpoint are at most 2% of the game's, for every climber.

  Every table now runs under unique objects.
- **Test 5: disclosure.** The others' sums carry the server's noise: 8 bits, keyed on the state
  (`convex/v2/disclose.ts`, #608). Exact sums appear only as a comparison row.

The re-run covers line-q at β 0.05 for tests 1, 4 and 5, with 3 games for each kind of climber. The pool is now 43
rules dealt by `lines-beginner`.

| Row | 1 no unopposed joint rise | 4 dynamics | 5 disclosure |
|---|---|---|---|
| line-q, β 0.05 | FAIL: 4 of 8 tables have an unopposed direction (often a repeated pivot or `seq.step`); 1 more is opposed by an adversary. Information: 1 of 43 single rules ramps | FAIL (a). Plain starters: idle 96%, 15% of objects change in the last minute, 29% of gains come after the midpoint. Shortcut climber: idle 89%, 27% change, 38% after the midpoint, 46% of objects frozen. Objects 10 → 22–24 | PASS: σ = 8, median above 3,000 probes; 39 of 40 tables unidentified |
| exact sums (σ = 0), not counted | – | – | FAIL: median 1 probe |
| 24 objects, 0.1 births/s, not counted | – | FAIL (a). Plain: idle 96%, 12% change, 9% of gains after the midpoint. Shortcut: idle 84%, 28% change, 13% after the midpoint, 32% frozen. Objects 24 → 43–56 | – |

### The 247k table and an adversary (`scripts/adversary.ts`)

The table is Prime Landing/big-prime, Square Area/spf and Whole Crossing/k-spf, on line-q with 10 objects and 0.05
births a second. Every seat is a shortcut climber. β is 0.05, and each table played 2 games.

| Table | Game | Points gained per seat | Table total | Shortcut moves' share of gains | Best line | Lines with \|m\| ≤ 3, \|c\| ≥ 300 |
|---|--:|---|--:|--:|---|--:|
| the 247k table | 0 | Prime Landing 64,778; Square Area 74,329; Whole Crossing 102,029 | 241,136 | 121% | **y = −2x + 734** | 2 of 28 |
| | 1 | 7,682; 76,074; 78,179 | 161,935 | 113% | y = 2x + 842 | 1 of 26 |
| Treasure/m-spf in Square Area's seat | 0 | Prime Landing 9,168; Treasure 4,907; Whole Crossing 8,313 | 22,388 | 58% | y = −x + 47 | 0 of 28 |
| | 1 | 26,136; 5,678; 24,524 | 56,338 | 81% | y = −x + 229 | 0 of 28 |

- **The case reproduces.** Shortcut moves (stretch, pivot, mirror) bring more than all of the table's gains. The other
  moves lose points on balance.
- **The pool has no real adversary for this direction.** Every rule of the pool was measured as c/(−m) and the root
  grow (|m| ≤ 3, 20 ≤ c ≤ 800).
  - The most adverse is the Treasure family, all five tie-breakers alike. It loses 0.6 bits for each doubling of c/m,
    and its mean bits fall from 5.8 to 0.5.
  - The seated climbers gain 9.8 bits for each doubling: Prime Landing's mean bits go from 9.6 to 47.8, and Whole
    Crossing's from 2.4 to 35.6.
  - So Treasure falls about 16 times more slowly than the climbers rise. It is not a comparable adversary.
- **Treasure in the seat still changes the game.** Table totals fall 4 to 10 times, and no line reaches |c| ≥ 300.
  Part of that drop is simply the loss of a rule that was climbing with the others.
- **What the adversary needs.** Its bits must fall by about 10 bits for each doubling of c/(−m) or of the root
  √(c²/2|m|), so that a joint climb along that direction costs it about as much as the others gain. That is a family
  for the rule-design session.
