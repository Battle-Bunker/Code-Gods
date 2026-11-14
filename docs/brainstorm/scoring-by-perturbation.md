# Scoring by perturbation: can value stop measuring absolute rarity? (brief §3C, 14 November 2026)

Status: design and analysis only. Nothing in the engine changes. Every number below is printed by
`docs/brainstorm/scripts/scoring_by_perturbation.py` (numpy only, deterministic, about 13 minutes;
`... lines`, `... grid` and `... stationary` run the three parts; the last takes seconds).

The owner's question (docs/brainstorm/linear-equations-brief.md §1): linear equations are an infinite set, so a
uniform measure does not exist. Should the value of a state become "the expectation that cost-weighted perturbations
move the object to a higher versus a lower utility", and can scoring then stop measuring the absolute probability of a
state?

## 0. The answer on one page

1. **The uniform measure can go. A measure cannot.** If a value is a function of the rule score, rises with it, and
   means the same thing under every rule, then it is minus log2 of the probability of doing at least as well under
   *some* reference law (§2.3). The only free choice is the law.
2. **The law to use is where priced random play comes to rest** (§1; the owner's direction of 14 November). Let random
   play make each mutation with probability 2^−price. Its stationary law π gives every state an **energy**
   E(s) = −log2 π(s), and a rule level the **value** −log2 π{score at least this good}. There is no birth state and no
   budget. This is PageRank without teleportation, read upside down: a common state is a popular page, and value is
   minus the logarithm of rank mass.
3. **Energy is read off the price list: a move's price minus its undo's price is the energy it climbs** (§1.2). That
   holds exactly when the price list passes Kolmogorov's cycle test, and then no eigenvector is needed. When every
   undo costs what the move cost, energy is flat, π is uniform and the value is today's rarity. So today's bits are
   already this value on the shipped grid cost models (§4.3), and nothing shipped is recalibrated.
4. **Only the lopsided part of a price reaches value.** The even part of a price list (how far, which mutator, which
   cell) sets how fast play moves, never where it rests. This is a theorem, and it answers "should mutator costing
   decisions matter to value": they matter exactly as far as a move and its undo are priced differently.
5. **The owner's stitching procedure is correct, and it is how rare levels are measured** (§1.4). Sample states inside
   each utility level, perturb them, count where they land: the level masses are the stationary vector of that
   level-to-level matrix (the "eigenvector math"), and when the price list passes the cycle test the ratio of two
   levels' masses is simply the ratio of the two flows between them. Checked: exact on the 325-line board; on the
   4×4 grid it measures a level of probability 10^−8 (26.6 bits) to ±0.12 bits from 360,000 samples, none of which
   ever has to find that level by a blind walk.
6. **On an infinite type the resting law exists only if prices confine** (§1.5). Even-priced ±k moves on the integers
   never come to rest. The principled confinement: *arriving at a state that takes more bits to read costs those
   extra bits*. Then E(s) is the state's read length, π = 2^−(read length) is normalisable by Kraft, and the grid is
   the special case where every board takes the same 53.2 bits to read.
7. **The local "up versus down" at one state is the slope of this value, not the value** (§5): it measures how sharp
   a place is, not how high. It is the right annotation, and hold rarity already is that term.

**Recommendation (§11).** One sentence, unchanged in form:

> An object's bits for a rule are minus log2 of the probability that **random play at rest** holds an object at least
> this good.

with two rules behind it: *a state's energy is the bits it takes to read it*, and *a move's price minus its undo's
price is the energy it climbs* (a unit test on every price list). Points stay own bits × the others' bits, and hold
rarity stays as it is. The budgeted "achievement from a birth state" of §4 is the same construction with teleportation
(§1.6); it is kept as analysis and as the fallback where a type's prices do not confine.

## 1. The centre: energy as the resting law of priced random play

The owner (14 November): sample states at each utility level, perturb them with a given amount of energy, accumulate
the probability of reaching one level from another, and stitch a map from utility to "objective energy levels in
terms of rareness (maybe with eigenvector math) ... something like inverse PageRank ... Is there some deep
relationship between energy and information and PageRank we can exploit in a principled way?" And, against a value
measured from a birth state within a budget: "we will want to map the energy level of utility scores that are
unreachable in practice by random walks from random states."

There is such a relationship, it is exact, and it is short.

### 1.1 Definitions

Random play is the Markov chain that, at each step, makes move a with probability 2^−W(a) (W the move's price in
bits) and otherwise leaves the object as it is. A price list is a legal one when these probabilities sum to at most 1
at every state (Kraft), which the shipped distance model guarantees by construction.

```
π              the stationary law of random play                         (πP = π)
E(s) = −log2 π(s)                                                         the energy of a state
V(u) = −log2 π{ s : U(s) ≥ u }  =  −log2 Σ_{U(s) ≥ u} 2^−E(s)             the value of a level: a free energy
```

V is non-decreasing in u by construction (the set shrinks), whatever the shape of E; the mass of a single level
need not be monotone in u, and nothing needs it to be (Prime Gradient on the 325-line board: the top level and the
next both hold 75 lines).

### 1.2 Energy, information and PageRank: the precise statements

1. **Gibbs.** π(s) = 2^−E(s) is a Boltzmann law at temperature 1 with energy in bits. The value of a level is the free
   energy of its upper set, which splits as V = (mean energy of the set) − (its entropy in bits): a level is valuable
   when its states are individually unlikely *and* few. With flat energy V = log2(all states) − log2(states at least
   this good): Boltzmann's entropy, and today's rarity.
2. **Detailed balance: energy is local.** If π(s)·P(s → s′) = π(s′)·P(s′ → s) for every pair, then

   ```
   E(s′) − E(s)  =  W(s → s′) − W(s′ → s).
   ```

   A move's price minus its undo's price is the energy difference. No global computation is needed to know a
   state's energy: add up price differences along any route from a reference state.
3. **Kolmogorov's criterion: when a price list has such an energy.** It does exactly when, around every closed loop
   of moves, the prices one way round add up to the prices the other way round. Equivalently, "price minus undo
   price" is the difference of a function of the state. This is a consistency condition on a price list, checkable
   as a unit test, and it is the condition under which *the route does not matter*: however many lenses reach s′
   from s, they all agree on how much energy was climbed.
4. **When it fails**, π still exists (on a finite type it is the Perron vector of P), but probability circulates:
   there are net currents round the loops that fail the test, energy differences can no longer be read from prices,
   and π must be computed globally. That is the situation PageRank was invented for (the web's links are one-way),
   and it is the only situation in which the eigenvector is needed at the level of states.
5. **Kac's lemma: value is blind search time.** For any set A, the mean number of steps of random play between two
   visits to A is exactly 1/π(A). So 2^V is the number of random moves a blind agent makes per visit to "at least this
   good", and V bits of value are V doublings of that work. Checked on the 325-line board: "m Meets c" returns every
   24.392 moves and 1/π = 24.392 (4.608 bits). Reaching the set for the first time from elsewhere takes longer (42
   moves there): Kac counts returns, and the difference is the set's clumping, which hold rarity prices.
6. **PageRank.** PageRank is the stationary law of a random surfer; its damping factor is a restart: with
   probability 1 − d the surfer jumps to a page drawn from a fixed law. Random play with a restart at the birth law
   has as its stationary law exactly the budgeted law μ_B of §3 and §4, with d = ρ. So "achievement from a birth state
   within budget B" *is* PageRank with teleportation, B is the damping, the birth law is the personalisation vector,
   and the owner's proposal is the limit d → 1. Teleportation exists in PageRank for the same reason a budget appears
   in §4: to force a resting law where the bare walk has none (§1.5).

**Where the analogy stops.**

- PageRank is interesting because the web is *not* reversible. Mutators mostly are (every move has an undo), and for
  a reversible walk the stationary law is a local quantity (on an undirected graph PageRank without damping is just
  the degree). The deep fact here is not the eigenvector; it is detailed balance, which makes energy readable from
  prices.
- This energy is not the game's energy currency. E is where random play rests; the currency is what a move costs.
  They meet in statement 2 (a difference of E is a difference of two prices) and in statement 5 (2^V moves, each
  costing on average the entropy of the move law, are what blind play spends per visit).
- Popular is cheap: value is the *inverse* of rank, and it belongs to upper sets, not to states.

### 1.3 What it gives on finite types (exact numbers)

**The beginner grid.** Under set-v1, distance-v1, dial-v1 and log-v1 every undo costs what the move cost. Energy is
flat (53.2 bits for a 4×4 board of digits, which is also its full read), and V is today's static bits: nothing
changes (§4.3, checked).

**The 325-line whole-number board** of the content proposal (PR #346: y = mx + c, m in −6..6, c in −12..12, seven
mutator families with its prices). Exact linear algebra on the 325 × 325 matrix:

| Price list | Energy range (uniform: 8.34) | Net current, share of all flow | Prime Gradient top | m Meets c top |
|---|---|---|---|---|
| plain rarity (uniform) | 8.34 | — | 2.12 | 4.64 |
| shift, tilt, step, slide, mirror: every undo costs the same | 8.34 to 8.34 | 0 | 2.12 | 4.64 |
| … plus pivot, which pays log2(pegs on the line) to say which peg | 7.56 to 9.01 | 4.1% | 2.14 | 4.39 |
| … plus stretch ×k, which has no undo: all seven | 7.89 to 8.62 | 8.1% | 2.17 | 4.61 |

- With the five even-priced families the resting law is exactly uniform: on that board the owner's proposal *is*
  plain rarity.
- `pivot` breaks the cycle test in an instructive way: turning from a line with n pegs to one with n′ costs log2 n
  one way and log2 n′ back. Lines with many pegs become common (y = 0 and y = x sit at 7.56 bits) and steep lines
  near the edge rare (y = x + 12 at 9.01). That lowers "m Meets c" by a quarter of a bit: its perfect lines pass
  through (−1, 0) and hold many pegs.
- `stretch` sends mass to the horizontal lines y = ±6, ±12 (multiples reached and never divided back).
- The tops move by at most 0.25 bits against plain rarity, and with all seven families none of the first eight levels
  of either rule moves by more than 0.05. So on this board the choice between
  "uniform" and "the resting law of the proposed price list" is nearly invisible in points, and it is a choice about
  principle: either accept currents, or make the list pass the test (pivot paying the same both ways, for instance by
  charging log2 of the larger peg count; stretch offered with its inverse).

### 1.4 The owner's stitching procedure: what is true, and its conditions

Group states by rule level L_0, L_1, … and let

```
T[i, j] = P( one step of random play from a state of L_i lands in L_j ),   the start drawn from π restricted to L_i.
```

1. **The level masses are the stationary law of T**, always: Σ_i π(L_i)·T[i, j] = π(L_j). The grouped process is not
   a Markov chain, but its stationary flows are exact. This is the "eigenvector math", and it is a small problem: one
   row per utility level, not per state.
2. **With detailed balance no eigenvector is needed**: π(L_i)·T[i, j] = π(L_j)·T[j, i] for every pair, so
   π(L_j)/π(L_i) = T[i, j]/T[j, i], and a chain of adjacent levels gives every mass. This is the flux identity of §5.2
   level by level.
3. **The same holds for any perturbation built from the moves**: several moves, or a budget of energy, in place of
   one. The budget is then an efficiency setting (bigger perturbations join more distant levels, at rarer rates),
   not part of the definition of value.
4. **The samples inside a level must be distributed as π restricted to that level.** "Random samples of states that
   achieve each level" is not enough if they come from somewhere else (the agents' boards, a greedy search). With
   flat energy that means uniform within the level. Ways to get them: where the level can be sampled directly, do
   so (the grid check below); otherwise a walk that refuses to leave the set keeps π restricted to it when the price list
   passes the cycle test, which is exactly the shipped splitting estimator (`mc-ams`, on upper sets, which are better
   connected than single levels).
5. **Unreachable levels are measured.** No sample has to travel from a typical state to a rare level; each level only
   has to see its neighbours. Thirty bits are thirty ratios near ½ or a handful of ratios near 2^−4.

Checks:

- *Exact, 325-line board, "m Meets c", 19 levels.* With the five even-priced families: the eigenvector of T, the
  adjacent-ratio ladder and exact enumeration agree (4.6439 bits at the top). With all seven families the eigenvector
  of T is still exact (4.6083), but the adjacent-ratio ladder is wrong by up to 0.52 bits (currents, and moves that
  skip levels), and T built from samples *uniform* within each level, the natural mistake, is wrong by up to 0.07.
- *Sampled, 4×4 grid, Opposite Nines*, levels = number of pairs adding to 9. 40,000 boards drawn uniformly inside each
  level, one random priced move each, adjacent ratios only:

  | pairs at 9 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | exact bits | 0.812 | 2.420 | 4.714 | 7.637 | 11.178 | 15.383 | 20.386 | 26.575 |
  | stitched | 0.827 | 2.436 | 4.729 | 7.663 | 11.279 | 15.467 | 20.440 | 26.622 |
  | one standard error | 0.032 | 0.044 | 0.053 | 0.062 | 0.071 | 0.081 | 0.094 | 0.115 |

  The top has probability 10^−8; 360,000 blind boards would contain it 0.004 times on average. The error grows like
  the square root of the number of levels crossed, and the seed fixes the result.

So the owner's objection to the budgeted value is about estimation, and it is answered by the estimator: under any
law that gives every state positive probability (the resting law, or the budgeted one), a level that blind walks never
reach still has a definite value and is measured by stitching. What the budget cannot avoid is depending on the birth
state and on B; the resting law depends on neither.

### 1.5 Infinite types: prices must confine, and then energy is a description length

Random play has a resting law only if it is positive recurrent. Even-priced moves on an infinite lattice are not
(§4.4): add ±k at the same price both ways and the walk spreads for ever, π is the flat counting measure, and no
level has a probability.

Detailed balance says what to change. For π to be normalisable some moves must cost more than their undo, and the
sum of 2^−E over all states must be finite. Any prefix-free code for states gives such an E, by Kraft. The natural
one is already in the game: **the bits it takes to read the state in full.** So:

> **A move pays its base price plus the bits by which the state's read length grows.**
> W(s → s′) = base(s, s′) + max(0, φ(s′) − φ(s)), with base the same both ways and φ the read length.

Then W(s → s′) − W(s′ → s) = φ(s′) − φ(s) for every move of every lens, the cycle test passes, and

```
E(s) = φ(s) + constant,        π(s) ∝ 2^−φ(s).
```

- The base prices (how far, which lens) drop out of π completely. Checked on a box of 361 lines with lift, tilt and
  slide all surcharged: E equals φ to 10^−5 bits. Sell slide *without* the surcharge and the list fails the cycle
  test: E departs from φ by up to 10.7 bits under the slider code and 3.6 under the doubling code (slide becomes a free ride
  to long constants).
- On a finite type whose states all read alike (a grid: log2 of the number of boards) the surcharge is always zero,
  so this is the shipped pricing and the shipped value.
- It also settles what a full read of an unbounded number costs, which the read meter needs anyway.

**A concrete list for lines y = mx + c with integer m and c**, φ(m, c) = len(m) + len(c), two candidate codes for an
integer:

| Code for an integer n | Normalisable because | Entropy of a line | "m close to c": \|m − c\| = 0, ≤ 1, ≤ 3 | "gradient near a prime": distance 0, ≤ 1, ≤ 2 | E of y = x + 1, y = 5x + 5, y = 7x − 21, y = 23x + 23 |
|---|---|---|---|---|---|
| slider code: 1 + 1.585·\|n\| (the Kraft root the game uses for ±k) | Σ 3^−\|n\| = 2 | 4.4 bits | 1.68, 0.54, 0.08 | 3.71, 2.00, 0.42 | 5.2, 17.9, 46.4, 74.9 |
| doubling code: 1.20 + 2·log2(\|n\| + 1) (two bits per doubling, as log-v1) | Σ (\|n\| + 1)^−2 = 2.29 | about 7 bits | 2.17, 1.17, 0.62 | 3.23, 1.90, 0.48 | 6.4, 12.7, 17.3, 20.7 |

Under the slider code the argument of a move that takes a coefficient one further from zero costs 3.17 bits, and one
nearer 1.585. Under the
doubling code the surcharge is 2 bits per doubling of size. For rationals p/q in lowest terms, φ = len(p) + len(q)
with the same codes is summable by the same bound (the sum over coprime pairs is below the product of the two sums),
so π is normalisable there too.

Compare §8.1: plain rarity on a lattice gives the top of "m close to c" anything from 3.5 to 7.7 bits as the bound N
goes from 5 to 100, and the budgeted law 2.9 to 4.3 as B goes from 8 to 128. The resting law has no N and no B. What
it has instead is the code for a number, which is a statement the game must make in any case to price a read.

### 1.6 How several lenses enter

Lenses add transition probability between the same pairs of states.

- If every lens prices a move and its undo by the same energy difference (even base prices plus the read-length
  surcharge), detailed balance survives any number of lenses, and **value does not depend on the lens set at all**.
  A cheaper route through another representation then changes what a player *pays*, never what the state is
  *worth*. That is the cleanest form of the owner's wish: lens choice is pure skill, and "it's totally fine for a
  state shift to cost much more with one mutator than another".
- If a lens prices its undo differently from the others (pivot's peg count, stretch without division, slide without
  the surcharge), value depends on the lens set through the currents it creates (§1.3: up to a quarter of a bit on
  the 325-line board; §1.5: ten bits on unbounded lines).
- Under the budgeted law of §4 a new lens always moves values (§4.5), because a walk that has not come to rest still
  remembers which routes were short. That is one more reason to prefer the resting law.

### 1.7 Deterministic computation

- Small boards: exact linear algebra. 325 lines: a 325 × 325 solve, milliseconds. The pegboard's 6,460 lines: a sparse
  solve of the same kind.
- Price lists that pass the cycle test need no solve at all: E is the read length, and a rule's table is a sum of
  2^−E over its upper sets (closed form for independent coordinates, as in the table above).
- Large or infinite types: the shipped seeded splitting estimator, with the walk's acceptance weighted by 2^−ΔE
  (Metropolis on the read length); error bars as in §1.4, about 0.1 bits at 27 bits for 360,000 samples.
- Clients and replays still only look up a table (§7.1).

### 1.8 The 325-line board three ways: plain rarity, a confining list, the budgeted law

Exact. Mutators: the five even-priced families (shift, tilt, step, slide, mirror). "Confining" adds the read-length
surcharge of §1.5 to every move, read length = len(m) + len(c). "Budgeted" is §4's law from y = x.

| Reference law | Prime Gradient top | m Meets c top | Energy of y = 0, y = x, y = 6x + 12 |
|---|---|---|---|
| plain rarity (= the resting law of the even-priced list) | 2.12 | 4.64 | 8.34, 8.34, 8.34 |
| resting law, confining prices, slider code | 3.71 | 1.68 | 2.00, 3.58, 30.53 |
| resting law, confining prices, doubling code | 3.33 | 1.90 | 2.12, 4.12, 15.13 |
| budgeted from y = x, B = 8 | 3.11 | 3.36 | 4.91, 1.05, 17.85 |
| budgeted, B = 32 | 2.39 | 3.32 | 5.16, 2.55, 12.00 |
| budgeted, B = 128 | 2.19 | 3.87 | 6.21, 4.28, 9.48 |
| budgeted, B = 2,048 | 2.12 | 4.56 | 8.00, 7.31, 8.42 |

- **The resting law is the B → ∞ limit of the budgeted law** (last row against the first): the budget and the origin
  fade together. On an infinite type that limit exists only with confining prices, and then the price list replaces
  both.
- With the confining list the computed energy equals the read length to 10^−6 bits, as §1.5 says.
- **Confinement changes which rule is worth more.** Under plain rarity "m Meets c" is the rarer top (4.64 against
  2.12); once small numbers are common it is the commoner one (1.7 to 1.9 against 3.3 to 3.7), because its perfect
  lines include y = 0, y = x + 1, y = −x − 1. This is the real content of choosing a confining code, and on a
  *finite* board nothing forces it: there the even-priced list rests at plain rarity. Recommended: no surcharge on
  finite boards; the surcharge only where the type is unbounded and needs it.

### 1.9 How many bits the object holds

A rule's top cannot exceed what the object holds, and in practice it is about one "unit" of the rule.

| Object | Bits held (entropy of the reference law) |
|---|---|
| integer line, doubling code | 7.0 |
| 325-line board | 8.3 |
| rational line (m and c fractions in lowest terms), doubling code | 12.3 |
| pegboard of PR #346 (6,460 lines) | 12.7 |
| 4×4 grid of digits | 53.2 |

The grid's rule tops are 15 to 27 bits not because a grid holds 53 bits but because each rule counts 4 to 16
independent units worth 2 to 4 bits each (8 pairs at 3.32 bits). A line is one unit. So richer coefficients do not
reach the grid's range (a rational line holds 12 bits, and a rule top on it stays a single unit of perhaps 3 to 6).
What reaches it is **several units per object**, each scored and annotated like today's units:

| k lines on the 325-line board, rule = "as many of my lines as possible satisfy it" | object holds | Prime Gradient, all k | m Meets c, all k |
|---|---|---|---|
| 1 | 8.3 | 2.1 | 4.6 |
| 2 | 16.7 | 4.2 | 9.3 |
| 4 | 33.4 | 8.5 | 18.6 |
| 6 | 50.1 | 12.7 | 27.9 |
| 8 | 66.8 | 16.9 | 37.2 |

Four to eight lines per object land in the grid's 15 to 27 bits. Equivalent ways to hold several units: a line with
four to six marked points each scored by the rule, a table of values whose rows are the units, or a small system of
lines whose pairwise crossings are the units (k lines give k(k − 1)/2 crossings, so four lines give six units).

## 2. What today's value is, and what the game relies on

### 2.1 The definition

For a rule r with utility U_r (a tuple compared lexicographically), an object type with spawn law μ (uniform on every
shipped type), and a state x:

```
s_r(x) = −log2 μ{ y : U_r(y) ≥ U_r(x) }                      static bits   (lib/game-utilities/src/calibration.ts)
n_r(x) = s_r(x) + hold_r(U_r(x), m)                           payoff bits   (docs/energy-model.md §8)
π_i(x) = n_i(x) · max(0, Σ_{j≠i} n_j(x))                      points        (lib/game-core/src/scoring.ts)
```

- hold = −log2 P(U(x′) ≥ u | U(x) ≥ u), where x′ is x after m = (players − 1) random mutations, each drawn with
  probability ∝ 2^−C over the type's single calls, C the energy price (`lib/game-types/src/noise.ts`). So one term of
  today's value is already a cost-weighted perturbation.
- A player's total is the sum of π over live objects. A defence goal subtracts a penalty term; nothing below depends
  on it.

### 2.2 The properties the game uses

| Property | Where it is used |
|---|---|
| **A function of the rule score alone**, non-decreasing in it | climbs compare scores, never bits (rule-difficulty.md §1); the goal card can say "better score, more bits" |
| **Calibrated**: under the spawn law, P(bits ≥ b) ≤ 2^−b for every rule, with equality at every attained level | "b bits" means "one newborn object in 2^b is this good" whatever the rule: the only reason bits of two rules, or two object types, may be multiplied or ranked |
| **A function of the state** (not of its history, the clock, or the other objects) | scores are recorded per object version; a replay folds recorded bits (docs/replay-design.md) |
| **Deterministic and cheap everywhere** | server, browser, Python and TypeScript agents evaluate U and look the bits up in a table of [score, bits] levels with a slope above the top |
| **Tables**, produced once per (family, parameters, instantiation, prior) and keyed by a hash | `tableKey`; the prior is already a versioned part of the key (`PriorRef`: "uniform", or a half-uniform mixture) |
| **Not additive** | bits of two rules on one object do not add (rules conflict, SYN in rule-difficulty.md §2.4); bits of independent parts of one rule do add (8 pairs of Opposite Nines: 8 × 3.32) |
| **Bounded on finite types** | every rule has a top; the table's slope extrapolates above it |

### 2.3 Why a calibrated value must be a rarity

Let v_r be any value with the first two properties: v_r(x) depends on x through u = U_r(x), is non-decreasing in u,
and is calibrated against a reference object X (P(v_r(X) ≥ b) = 2^−b at attained values b). Take a level u where v_r
strictly increases. Then {v_r(X) ≥ v_r(u)} = {U_r(X) ≥ u}, so 2^−v_r(u) = P(U_r(X) ≥ u):

```
v_r(u) = −log2 P( U_r(X) ≥ u ).
```

Where v_r does not strictly increase it is the rarity of a coarser score. So "comparable across rules" and "depends
on the score" together force the form. A design may choose the law of X. It may not avoid having one. Every candidate
below is judged by which law it uses, or by which of the two properties it gives up.

## 3. Priced mutators as a random policy

One object type, countable state space 𝒳, a set of moves a (a mutator with its arguments), each with a price W(a) in
bits and an effect x ↦ a(x) (a move that cannot apply leaves x as it is, as in `noise.ts`).

- **The random policy** plays move a with probability p(a) = 2^−W(a). This needs Σ_a 2^−W(a) ≤ 1 (Kraft). The shipped
  distance model satisfies it with equality by construction: W = log2(sites) + log2(families) + λ·d with λ the Kraft
  root of the argument space (docs/energy-model.md §4.5). So the price list *is* a probability law over moves, with
  nothing to add.
- **A sequence** a_1 … a_n has price W(a_1) + … + W(a_n) and probability 2^−price under the policy.
- **A budget.** For each n the sequences of length n have total probability 1, so the sum over all sequences diverges:
  a sequence needs an end. The owner's wording, "a sequence of random mutations of a given expected cost", fixes the
  mean price B. The maximum-entropy law of a budget with a fixed mean is the exponential one, and it gives the simplest
  rule: **each move is made if its price fits in what is left of the budget, and otherwise the sequence ends.** With
  an exponential budget this is the same as weighting a sequence by

  ```
  2^−(1+s)·price ,      s = 1 / (B ln 2)
  ```

  so the budget is a surcharge of s bits per bit. A step survives with probability ρ = Σ_a 2^−(1+s)W(a) < 1, and
  "end" is the last symbol of a prefix-free code over sequences (Kraft sum exactly 1).
- **Three quantities** follow, for a start law ν and a set A of states:

  ```
  μ_B(A)  = P( the sequence ends inside A )                         "end"     the law of where random play leaves an object
  h_B(A)  = P( the sequence is inside A at some moment )            "reach"   a hitting probability
  K_E(A)  = −log2 Σ over routes that first arrive in A of 2^−energy  "route price", energy = W + βW² per act, no budget
  ```

  K_E needs no budget because energy prices are not Kraft-tight: Σ_a 2^−(W+βW²) < 1 already (0.27 on the beginner
  board, 0.59 for the three line mutators below).

**The example used throughout** (§8): lines y = mx + c with integer m and c, origin y = x, three mutators chosen with
probability 1/3 each (1.585 bits):

| Mutator | Effect | Representation it belongs to | Argument bits |
|---|---|---|---|
| lift k | c += k | the graph moved up; the constant in y = mx + c | 1.585·\|k\| |
| tilt k | m += k | the graph turned about its y-intercept; the coefficient | 1.585·\|k\| |
| slide k | c −= m·k | the graph moved k to the right; y = m(x − k) + c | 1.585·\|k\| |
| (stretch k, studied apart) | (m, c) ×= k | every output multiplied; the function machine | 2.185·log2\|k\| |

The two rules are from the brief: **"m close to c"** (score −\|m − c\|) and **"gradient near a prime"** (score minus
the distance from m to the nearest prime).

## 4. Candidate (a): achievement, the rarity of the score under random play on a budget

This is the resting law of §1 with teleportation: B → ∞ gives §1 where a resting law exists (theorem 1), and theorem 2
says when it does not.

### 4.1 Definition

```
A_B(x) = −log2 μ_B{ y : U(y) ≥ U(x) }
```

with μ_B the end law of §3 started from the object's birth law ν. In words: minus log2 of the probability that a
random mutation sequence with a budget of mean B bits, started where objects are born, ends at least as good.

### 4.2 It is a description-length prior, and it is well defined on infinite sets

μ_B(x) = (1 − ρ) · Σ over sequences from the start that end at x of 2^−(1+s)·price. This is the algorithmic
probability of x in a language whose programs are mutation sequences: every way of writing x counts, weighted by
2^−length.

- **Well defined.** The sequences with their end symbol are a complete prefix-free code, so μ_B is a probability law
  on 𝒳 whenever ρ < 1, whatever the size of 𝒳. No counting of states enters. Lines with integer, rational or real
  -algebraic coefficients are all fine; what is needed is that each state's moves have a Kraft sum of at most 1.
- **Bounded by the cheapest route.** Keeping one sequence of the sum, −log2 μ_B(x) ≤ (1 + s)·W_min(x) + log2 1/(1 − ρ),
  with W_min the cheapest price of any route from the start to x. Many routes make it smaller. Measured (§8.3): the
  line y = 5x + 5 has −log2 μ = 10.0 against a cheapest route of 11.1 bits; y = 23x + 23 has 25.1 against 39.6.
- **One mutator on the integers, in closed form.** For "tilt" alone the end law is geometric, μ_B(x) = b·r^−|x| for
  x ≠ 0, with r the larger root of 2a·z² − (1 + 3a²)·z + 2a = 0, a = 2^−(1+s)·1.585. A far state is worth log2 r bits
  per step: 0.70 at B = 8, 0.33 at B = 32, 0.16 at B = 128 (closed form and dynamic programme agree to four places).
  The rate tends to 0 as B grows, which is theorem 2 below seen in one line: with an unlimited budget every finite set
  of integers has probability 0.

### 4.3 Theorem 1: on today's types it is today's value

*If the one-move kernel is symmetric (the chance of going from x to y in one move equals the chance of y to x) and
objects are born uniform, then μ_B is uniform for every B, so A_B(x) is today's static bits exactly.*

Proof. A symmetric kernel is doubly stochastic, so a uniform law stays uniform after any number of moves. The budget
depends only on the prices drawn, and prices do not depend on the direction of a move (+k and −k cost the same), so
conditioning on the prices keeps the kernel symmetric. ∎

Which shipped kernels are symmetric:

| Type and cost model | One move | Symmetric? |
|---|---|---|
| Grid, set-v1 | one cell's number or colour to another value, uniformly | yes |
| Grid, distance-v1, dial-v1, log-v1 | one number by ±k (weight depends on \|k\|; out of range stays), a colour or suit to another | yes (checked: one digit's kernel is symmetric and keeps the uniform law) |
| Grid, multiply-v1 | adds ×m mod 10 | **no**: ×0, ×2, ×5 merge digits. A digit walked with half multiplies settles at P(0) = 0.37, not 0.10 |
| Int | a digit add with wrap (a bijection); ×m when in range | adds yes; multiply **no** (there is no divide) |
| string | set, insert, delete a character | set yes; insert against delete not checked here |

Checked numerically on a board of two half-turn pairs (10^4 states): started uniform, the end law differs from uniform
by 1e-14 at B = 8, 32 and 128.

Consequences:

- For the beginner pool, candidate (a) changes no number, for any B, under any of the four symmetric cost models.
  **Prices do not reach the static value on a finite symmetric type, and no definition of this kind can make them**:
  the walk's speed depends on the prices, its resting law does not.
- Prices reach a value only through something that has a start and a finite horizon. Today that is hold rarity (m
  moves from the state). On an infinite type it is the reference law itself, because the walk never forgets its start.
- Where the kernel is not symmetric (multiply), random play does not rest at the uniform law, and (a) with a long
  budget would move those tables. That is a real difference of meaning, not an error: under multiply-v1, zeros are
  common.

### 4.4 Theorem 2: on an infinite type a start and a spread are unavoidable

*If the mutator walk on an infinite 𝒳 can reach every state from every state and has no stationary probability law
(it is transient or null recurrent, which holds for every symmetric walk on an infinite lattice), then μ_B(F) → 0 as
B → ∞ for every finite set F, from every start.*

So the limit that gives today's value on a grid does not exist on the integers: with unlimited random play every
particular line is infinitely rare, and so is every rule level made of finitely many lines. This is the precise form
of the owner's remark that absolute rareness does not generalise. The same theorem says what must replace the board's
size: a start and a finite budget. They cannot be removed by a cleverer formula, because without them there is no law
at all.

### 4.5 A cheaper path through another representation lowers a state's value. Is that what we want?

This holds for the budgeted law. Under the resting law of §1 with a price list that passes the cycle test, a new lens
does not move value at all (§1.6).

Adding a mutator adds sequences. States that the new mutator reaches cheaply gain probability, and since the total is
1 every other state loses a little (the "which mutator" code is one choice longer). Measured at B = 32 (§8.3):

| Line | With slide: −log2 μ | cheapest route | Without slide: −log2 μ | cheapest route |
|---|---|---|---|---|
| y = 5x + 5 | 10.0 | 11.1 | 9.6 | 16.3 |
| y = 7x − 21 = 7(x − 3) | 13.5 | 17.4 | 18.6 | 44.8 |
| y = 3x − 30 = 3(x − 10) | 14.8 | 22.2 | 23.1 | 53.7 |
| y = 12x + 36 = 12(x + 3) | 17.5 | 25.4 | 27.6 | 77.5 |
| y = 7x | 10.8 | 11.1 | 8.9 | 10.5 |

Lines of the form m(x − k) with a far constant are five to ten bits commoner once the "slide" lens exists, and a line
that gains nothing from it (y = 7x) is two bits rarer. y = 5x + 5 hardly moves, although its cheapest route falls by
five bits: a description length sums every route, and near the origin the many lift-and-tilt routes already
outweigh the one cheapest.

This is what the owner asked for, and it has a cost that should be seen:

- **For.** Value is the soft minimum over every lens, so no representation is the privileged "scoring"
  representation. A state that is one cheap move away in some lens is common, however far it looks in another. The
  player who sees the lens pays the cheap price; the player who does not pays the dear price for the same bits. Skill
  at changing lens is rewarded in energy saved, which is exactly "lower cost paths from state a to b".
- **Against.** There is no arbitrage. A design that valued states in one lens and let players move in another would
  pay lens-switching with *extra points*, which is louder feedback for a learner. Under (a) the feedback is quieter:
  the same points for less energy, hence more acts.
- **Why we still want it.** The loud version makes the value depend on which lens the designer happened to score in,
  and every new mutator would silently reprice the game. Under (a) a new mutator changes values in a stated way: by
  the probability it adds.

### 4.6 Properties

| Question | Answer for (a) |
|---|---|
| A function of the state alone? | Yes, through the rule score. |
| Comparable across rules and types? | Yes: calibrated against each type's own random play, as today each type has its own uniform law. |
| Own × others? | Unchanged: bits are bits. |
| Sensitive to the mutators and prices? | On symmetric finite types not at all (theorem 1). On infinite types completely: the law is made of them. Measured in §8.3: dropping one mutator moves single states by up to 10 bits and rule tops by 0.1; moving the origin from y = x to y = 0 moves the tops by 0.7 and 1.2 bits. |
| What the budget means | The mean price, in bits, of the random play that makes a newborn object: the type's size. |

**Choosing B without a magic number.** Three defensible rules (a decision only if the budgeted law is used):

1. *B is the instantiation's size argument*, as N and the base are for Grid(N, base): `Line(B = 32)`. Chosen like a
   board size, by what the room should feel like. Honest, simple, and exactly as arbitrary as "4×4".
2. *B is the energy one player earns per object in a game.* Then "random play" is "a random agent with your energy",
   and the rule reads: your bits are how unlikely it is that an agent making random moves with one player's energy
   would have done this. No new number (about 500 bits on the default setup: 64 bits/s for 300 s over about 35
   objects). It ties the tables to the room's economy, so they are computed on demand per room, as hold tables are.
3. *B is the smallest power of two at which a game's objects are born distinct more often than not.* Derived from the
   object count (not computed here).

Whichever is chosen, §8 shows that B matters the way a board size does: the top of "m close to c" is worth 2.9, 3.3
and 4.3 bits at B = 8, 32 and 128, and the top of "gradient near a prime" 2.8, 2.1 and 2.0. The two rules' order
changes with B, exactly as it changes with the bound N of a uniform lattice (3.5 against 1.9 at N = 5; 7.7 against
3.0 at N = 100). A scale has to be chosen once under either scheme. The difference is that B is a statement about
play ("this much random work"), and the same B means the same thing for every mutator set.

## 5. Candidate (b): local improvability

### 5.1 Definitions

From the state x itself, with no birth law:

```
L_1(x)  = log2 [ P(one random move lowers U) / P(one random move raises U) ]           the owner's wording, one move
L_B(x)  = log2 [ P(a budget-B sequence from x ends lower) / P(… ends higher) ]         the same at scale B
H_B(x)  = −log2 P( a budget-B sequence from x ends at least as good )                  "hold from the state"
```

All three are functions of the state alone, exist on infinite types, and need no origin. That is their appeal.

### 5.2 What it measures: the slope of rarity (the flux identity)

*Let the one-move kernel be symmetric and π uniform (or, generally, reversible with respect to π). For a level set
A = {U ≥ u}, write out = P(one move leaves A | inside A) and in = P(one move enters A | outside A), both averaged
over π. Then π(A)·out = π(Aᶜ)·in, hence*

```
today's bits of u  =  −log2 π(A)  =  log2( 1 + out / in ).
```

Proof: reversibility makes the probability flow across the boundary of A equal in both directions. ∎

Checked on the two-pair board: level (1, −4): out = 0.4442, in = 0.0664, log2(1 + out/in) = 2.9434 = today's bits;
the top (2, 0): out = 0.8500, in = 0.0086, 6.6439 both ways.

So the owner's instinct is exact at the scale of a level set: **rarity is the ratio of how fast random perturbation
knocks things out of "at least this good" to how fast it brings things in.** Today's tables are an integral of
"down versus up" along the ladder of levels. The identity holds for any reversible law, so on an infinite type it
gives *ratios* of level-set measures (how many more bits one level is worth than another) even where no probability
law exists. What it cannot give without a start and a budget is the level of the first rung.

### 5.3 Where it fails as a value

The identity is about averages over a level set. The value of a *state* computed from its own neighbourhood is a
different thing.

1. **It measures sharpness, not height.** Take two states with the same local picture (the same scores within the
   reach of budget B, up to a shift): they get the same L_B and H_B, whatever their scores. With rule 2 flipped
   ("\|gradient\| far from every prime", §8.5) the lines with m = 26, 93 and 120 sit at the middle of prime gaps of
   width 6, 8 and 14, with scores 3, 4 and 7, and m = 9 sits between 7 and 11 with score 2. One move raises the score
   with probability 0, 6e-13, 0 and 3e-9, so the one-move values are ∞, 39, ∞ and 27 bits: not in the order of the
   scores, and all "nearly unbeatable". Their hold-from-the-state bits at B = 32 are 1.48, 1.76, 1.76 and 1.43: the
   same sharpness at four heights. Under (a) at B = 32 the four are worth 18.6, at least 19, at least 19, and 2.96
   bits.
2. **Every local maximum is infinite.** Where no move within the budget improves, L is +∞. On the grid every top
   board, and every board where one-cell greedy stalls (Spread of Three stalls on 14.8% of starts,
   docs/beginner-pool.md §3), has L_1 = ∞.
3. **It is not a function of the score.** Two boards with the same score have different local values, and a better
   score can have a lower one (§9.2: a board with no pair, each 1 away, has one-move value 0.52; a random board
   with a better score has 0.09). So it cannot be calibrated, and
   own × others would multiply quantities with no common meaning.
4. **Plateaus.** On a wide flat region both probabilities are 0 at small budgets: 0/0. H_B is 0 there, which says "no
   achievement" on the plateau of a hard rule's best level.
5. **Gaming.** A player raises L by walking to a sharper place at the same score: a line whose neighbours are all
   worse, a board where every cell is load-bearing. That rewards fragility. Hold rarity already pays a *bounded*
   amount for exactly this (about 1 to 6 bits), and coordination-incentives.md shows fragile, spoilable value is the
   game's sore point, not something to pay more for.

### 5.4 Does a multi-scale version repair it?

- **Integrating L_B over budgets** needs a weight for each scale. Any weight is a choice with no principle behind it,
  and at every finite scale failure 1 remains: a hill wider than the largest budget is still invisible.
- **Taking B → ∞** does repair it on a finite type, and the repair is instructive. The sequence forgets x, so
  P(ends higher) → π{U > U(x)} and L_∞(x) = log2 [π{U < u} / π{U > u}]: the log odds of the state's *rank*, which
  for a rare state is today's bits to within the bits of its own level. The repaired local value is the global rarity
  it set out to replace. On an infinite type the limit does not exist (theorem 2).
- §9.2 shows the convergence on the grid: at B = 32 (about 5 moves) the log odds are about a third of today's bits,
  and at B = 256 (about 40 moves) still under a half.

**Verdict.** As a value, (b) fails comparability, monotonicity and robustness to gaming, and its repair is (a). As an
*explanation* it is exactly right, and cheap: "of the moves you could make, this share improve and this share spoil"
is the annotation every rule family already wants ("what the nearest improvement is"), and it is the quantity a
learner's agent should compute. It belongs in the annotation layer and in hold rarity, not in the score.

## 6. Candidate (c): three constructions that keep to perturbations

### 6.1 Reach: the probability of ever being this good (a hitting probability)

R_B(u) = −log2 h_B{U ≥ u}. Because an exponential budget has no memory,

```
P(ends in A) = P(reaches A) · P(ends in A | reached A)        ⇒        A_B = R_B + hold_B
```

exactly, where hold_B is minus log2 of the chance that play that has reached the level is still there when the budget
ends. This is the engine's "static + hold" read in the other direction, and it shows the three notions are one
family: *end* counts time spent at the level, *reach* counts getting there once, *hold* is the difference.

- Reach is a function of the score, exists on infinite types, and is smaller than (a) by the hold term (lines, tops,
  B = 32: 0.94 against 3.28 for "m close to c").
- It is not calibrated: P(reach bits ≥ b) is not 2^−b under any law of objects, because several levels can be reached
  by one sequence. So it loses the property that justifies multiplying bits of different rules.
- It grows with the budget only in one direction (more budget, more reached, fewer bits), and on a recurrent walk it
  tends to 0 for every level: with enough random play everything is reached. It therefore *needs* B more than (a)
  does. On the two-pair grid board the top is 6.64 bits today, 4.17 by reach at B = 32 and 2.60 at B = 128.

### 6.2 Route price: bits to say how to make it, in energy

K_E(A) is the soft minimum, over every route from the start into A, of the route's energy price. It is the candidate
closest to "depending only on cost-weighted perturbations": no budget, no law of states, only prices.

- **Points and energy share a currency.** K_E(A) ≤ the cheapest route's energy, with equality only when the route is
  unique. A player who makes A along the cheapest route pays at least its value; the gap is the number of other ways
  there were. Measured from y = x: y = x + 1 costs 3.7 energy bits to make and is worth 2.5; y = 7x − 21 costs 25.1
  and is worth 18.6; y = 23x + 23 costs 64.6 and is worth 43.3.
- **From a uniform birth on a finite symmetric type it is today's bits less at most log2 1/(1 − ρ_E)**, ρ_E the sum
  of 2^−energy over one move: 0.45 bits on the beginner board (the birth law already holds the level; routes add at
  most a factor 1/(1 − ρ_E)). So on the grid it would change nothing a player could see.
- **From a single origin it is a different value**: the price of making the level starting from one fixed state.
  That is not calibrated (an object born far from the origin is "valuable" before anyone touches it, and equally so
  for unrelated rules), and it makes the choice of origin weigh on every rule: y = x is one move from "m close to c".
- So K_E is budget-free only by taking the budget from β and from the origin. It removes the letter B, not the
  choice.

### 6.3 Matching budget: the energy a random agent needs to match you

V(u) = the budget B at which random play reaches the level with probability ½. It is a value in energy units, and
value ÷ energy spent reads "how many times cheaper than random play you were", which is the right sentence for a
learner's agent.

- On a finite type log2 V = today's bits + a constant − (a hold-like term), so its logarithm is the current value.
- On a transient walk the level may never be reached with probability ½, and V is infinite; the line walk with a
  multiplying mutator is transient (§8.4).
- It is a quantile, so "½" is a number someone chose.

It is a good *statistic* to show ("your agent matched 2,000 bits of random play with 180"), computed from the same
tables as (a). It is not a better score.

### 6.4 Summary of the candidates

| | (a) end, random play | (b) local, from the state | (c1) reach | (c2) route price | (c3) matching budget |
|---|---|---|---|---|---|
| Function of the rule score | yes | **no** | yes | yes | yes |
| Calibrated (comparable across rules, types) | yes | **no** | no | only from a birth law | via (a) |
| Exists on infinite types | yes | yes | yes | yes | not always |
| Equals today's on the beginner grid | exactly, any B | no | no (lower by hold) | within 0.45 bits | in logarithm, roughly |
| Feels the mutator prices | infinite types: wholly; finite: not at all | wholly | wholly | wholly | wholly |
| Free parameter | B (the type's size) and the origin | B, and a weight per scale | B and the origin | β and the origin | a quantile |
| Own × others | unchanged | meaningless | uncalibrated product | energy × energy | via (a) |

## 7. Computation

### 7.1 What runs where

Nothing changes in the split that exists today, and that split is what gives reproducibility:

- **Clients, agents and replays only look up a table**: evaluate the rule score (already mirrored in TypeScript and
  Python), find it among [score, bits] levels, interpolate, extrapolate with the stored slope above the top. No
  probability is ever computed in a browser or a sandbox. An unbounded rule on an infinite type ("maximise the
  triangle's area") is covered by the slope that tables already carry: the tail of μ_B is geometric in the number of
  steps, so bits grow linearly in the distance a score requires, at the rate of §4.2.
- **Tables are made once, in one implementation** (TypeScript, offline for shipped families, on demand in the engine
  as hold tables are), from a seeded generator keyed by the table key. Two machines never have to agree on a floating
  point sum; they agree on a stored table.
- **The key already has the slot.** `PriorRef {id, version}` is part of every table key. A random-play prior is
  `{id: "random-play", version: hash(mutator declarations, cost model, origin, B)}`.

### 7.2 Per rule family and per state

| | Precomputed per (family, parameters, instantiation, prior) | Per state |
|---|---|---|
| (a), (c1), (c3) | one table of levels, a few hundred to a few thousand [score, bits] pairs (today: 70 to 2,500 levels, a few to 60 KB as JSON) | one score evaluation and one lookup, as today |
| (c2) from a birth law | the same | the same |
| (b) | nothing can be precomputed: it is a function of the state | one move: every single call scored (288 score evaluations on the beginner board); at budget B: a simulation per state, per client, which is where determinism would be lost |

### 7.3 Making the table for an infinite type

Three methods, in the order to try them:

1. **Exact dynamic programming on a box, with the escaped mass as an error bar.** Iterate the sub-stochastic kernel
   from the origin; the mass that leaves the box is ε, and every probability lies in [inside, inside + ε]. For the
   three line mutators on \|m\|, \|c\| ≤ 256 (263,169 states): ε = 9e-11 at B = 8 (6 s), 2e-6 at B = 32 (27 s), 2e-3 at
   B = 128 (100 s) in numpy, and geometric tails mean each doubling of the box squares ε. Levels rarer than ε are
   reported as an interval, never as a guess.
2. **Closed forms for structured families.** A rule that reads one coordinate moved by one slider ("gradient near a
   prime" under tilt alone) has the geometric law of §4.2: the table is a sum of a geometric series over the level
   set. Independent coordinates multiply. Analytic survival functions already exist as a concept
   (`lib/game-utilities/src/analytic`).
3. **Importance splitting on sequences, for everything else and for 30-bit levels.** The shipped estimator
   (adaptive multilevel splitting, `mc-ams`) needs two things: a sampler of the reference law and a move that leaves
   it unchanged. For random play the particle is a *mutation sequence*; sampling is running the policy; the invariant
   move is "cut the sequence at a random point and redraw the rest from the policy" (it resamples a suffix from its
   conditional law). The level function is the score of the end state. Numbers of any size are handled, because a
   sequence is replayed, not tabulated. This is the method that also covers heavy-tailed mutators (§8.4), where a
   box cannot work. Cost: the same order as today's tables (seconds per table); determinism: the seed comes from the
   key, as today.

For small finite types nothing is needed: theorem 1 says the existing tables are the answer.

### 7.4 Thirty-bit levels

Splitting reaches 30 bits routinely today because each stage only has to estimate a conditional probability near ½.
That is unchanged. What is new on an infinite type is that the *top* may not exist (unbounded rules), so the table
ends at the target depth (`targetBits`) and the slope takes over. For geometric tails the exact slope is known (the
root r of §4.2 for one slider; the largest root of the corresponding characteristic equation in general), so the
extrapolation can be exact rather than fitted.

## 8. Worked example: lines with integer coefficients

Set-up as in §3: origin y = x, mutators lift, tilt and slide, 1.585 bits to say which, 1.585 bits per step. B = 8, 32
and 128 bits are 1.6, 7.6 and 31.9 moves on average, and the birth law then holds 4.2, 7.3 and 10.3 bits of entropy
(the beginner grid holds 53.2).

### 8.1 Candidate (a) against plain rarity on a bounded lattice

"Lattice N" is the obvious alternative: draw m and c uniformly from −N … N and measure rarity.

**Rule "m close to c"** (score −\|m − c\|):

| Line | score | (a) B = 8 | B = 32 | B = 128 | lattice N = 5 | N = 10 | N = 20 | N = 100 |
|---|---|---|---|---|---|---|---|---|
| y = x (the origin) | −1 | 0.62 | 1.46 | 2.57 | 1.96 | 2.85 | 3.80 | 6.07 |
| y = x + 1, y = 5x + 5, y = 23x + 23, y = 0 | 0 (top) | 2.88 | 3.28 | 4.21–4.28 | 3.46 | 4.39 | 5.36 | 7.65 |
| y = 2x + 5 | −3 | 0.16 | 0.70 | 1.63 | 0.90 | 1.71 | 2.61 | 4.86 |
| y = 9x + 4 | −5 | 0.06 | 0.42 | 1.21 | 0.41 | 1.13 | 2.00 | 4.21 |
| y = 24x + 30 | −6 | 0.04 | 0.33 | 1.07 | 0.26 | 0.93 | 1.78 | 3.97 |
| y = −6x + 10 | −16 | 0.00 | 0.08 | 0.48 | 0.00 | 0.07 | 0.64 | 2.67 |
| y = 7x − 21 | −28 | 0.00 | 0.02 | 0.26 | 0.00 | 0.00 | 0.14 | 1.92 |

**Rule "gradient near a prime"** (score −distance from m to the nearest prime):

| Line | score | (a) B = 8 | B = 32 | B = 128 | lattice N = 5 | N = 10 | N = 20 | N = 100 |
|---|---|---|---|---|---|---|---|---|
| m = 2, 5, 7, 23 | 0 (top) | 2.82 | 2.05 | 1.97 | 1.87 | 2.39 | 2.36 | 3.01 |
| m = 1, 24 | −1 | 0.25 | 0.57 | 0.84 | 1.14 | 1.22 | 1.19 | 1.61 |
| m = 0, 9 | −2 | 0.10 | 0.32 | 0.58 | 0.87 | 0.93 | 0.97 | 1.14 |
| m = −6 | −8 | 0.00 | 0.02 | 0.11 | 0.00 | 0.30 | 0.60 | 0.91 |

What the tables show:

- **Both schemes need a scale, and both move with it.** The lattice's top of "m close to c" is log2(2N + 1): it grows
  without limit, by a bit for each doubling of N, although nothing about the game changed. Under (a) it grows more
  slowly (0.4 to 1 bit per quadrupling of B), and B has a meaning.
- **The lattice treats y = 23x + 23 and y = x + 1 alike only because both happen to lie inside it.** At N = 20 the
  first is not a state at all. Under (a) every line is a state, and the two have the same *rule* value (the same
  score) while their single-state description lengths differ by 20 bits (§8.3).
- **A line holds few bits.** Two small integers are a 7 to 10 bit object, and a rule's top is worth 2 to 4 bits, where
  the beginner grid's tops are 15 to 27. This is a property of the object, not of the scoring: the lattice says the
  same. Points are products of bits, so with ladders this short most objects tie. The line type needs more to say
  (rational coefficients, a line with a marked point, two lines per object) or rules with long tie-break ladders;
  that is for §3A and §3B of the brief, but the scoring cannot conjure bits the object does not hold.

### 8.2 The birth law is concentrated near the origin, and that is the point

At B = 32 the origin itself keeps probability 2^−2.82 = 14%: one newborn line in seven is still y = x. (The engine
redraws a spawn that collides with a live object, so the births seen in a game are the law conditioned on being new.)
Simple lines are common and complicated ones rare, by a law the mutators define. A learner's intuition that y = x + 1
is "nothing special" and y = 23x + 23 "took some doing" is what the measure says.

### 8.3 Single states: description length, cheapest route, route price

B = 32. "Cheapest route" is the smallest total W from y = x; "energy" prices each move W + 0.05·W²; K_E is the
budget-free route price of §6.2.

| Line | −log2 μ | cheapest route, bits | cheapest route, energy | K_E | no slide: −log2 μ | cheapest route | K_E |
|---|---|---|---|---|---|---|---|
| y = x | 2.82 | 0 | 0 | 0 | 3.04 | 0 | 0 |
| y = x + 1 | 4.60 | 3.17 | 3.67 | 2.47 | 5.10 | 2.58 | 2.62 |
| y = 5x + 5 | 10.02 | 11.09 | 14.74 | 11.61 | 9.62 | 16.26 | 11.47 |
| y = 7x | 10.80 | 11.09 | 16.70 | 12.68 | 8.85 | 10.51 | 9.60 |
| y = 7x − 21 | 13.50 | 17.43 | 25.05 | 18.64 | 18.63 | 44.79 | 31.25 |
| y = 3x − 30 | 14.84 | 22.19 | 33.65 | 22.48 | 23.13 | 53.72 | 40.82 |
| y = 23x + 23 | 25.13 | 39.62 | 64.63 | 43.32 | 24.78 | 73.32 | 46.18 |
| y = 12x + 36 | 17.51 | 25.36 | 38.83 | 27.23 | 27.63 | 77.49 | 51.79 |
| y = −6x + 10 | 12.98 | 19.02 | 26.26 | 18.35 | 13.23 | 28.94 | 19.47 |

- The description length is always below the cheapest route for far states, and the gap grows with distance: many
  routes, and a big step is made of small ones.
- K_E sits below the cheapest route in energy, because energy is superlinear: the cheapest way to tilt by 22 is many
  small tilts, and they can be ordered in many ways.
- Rule tops at B = 32 with three mutators, without slide, and from the origin y = 0: "m close to c" 3.28, 3.36, 2.07;
  "gradient near a prime" 2.05, 1.97, 2.74. A mutator more or less barely moves a rule's top (0.1 bits): a level set
  is a large set and gains on some states what it loses on others. **The origin moves it by about a bit**, because
  y = 0 is itself a top state of the first rule and two tilts from a prime gradient. The origin is the more delicate
  choice of the two.

### 8.4 A multiplying mutator makes the law heavy-tailed

Adding "stretch by k" with the code the Int design proposes (2.185 bits per doubling, mutation-cost-design.md):

| B | probability that random play ends outside \|m\|, \|c\| ≤ 256 | top of "m close to c" | top of "gradient near a prime" |
|---|---|---|---|
| 8 | 0.002 | 3.11–3.13 | 2.96–2.99 |
| 32 | 0.126 | 2.24–3.56 | 1.90–2.83 |
| 128 | 0.559 | 0.76–4.97 | 0.67–3.87 |

At B = 128 more than half of all newborn lines have a coefficient beyond 256. That is the law telling the truth about
the prices: when multiplying is cheap, big numbers are cheap. Two consequences:

- the box method of §7.3 cannot make these tables (the intervals above are honest and useless); sequences must be
  sampled, which handles any size of number;
- a rule that rewards size ("maximise the triangle's area") is worth few bits once a multiplier is offered. Whether
  to offer one, and at what code, is a mutator decision (§3B) whose effect on value is now visible in advance.

### 8.5 Reach, hold and the local quantities

Tops, from y = x:

| Rule | (a) B = 32 | reach B = 32 | hold = (a) − reach | reach B = 8 | reach B = 128 | K_E | cheapest energy |
|---|---|---|---|---|---|---|---|
| m close to c | 3.28 | 0.94 | 2.34 | 1.79 | 0.51 | 1.78 | 3.67 |
| gradient near a prime | 2.05 | 1.21 | 0.84 | 2.49 | 0.58 | 2.57 | 3.67 |

Reach is 0 bits for every level at or below the origin's own score, so from a single origin it has one informative
level per rule here. "m close to c" loses 2.3 of its 3.3 bits to hold: the level m = c is easy to pass through and
hard to stay on, because every move leaves it.

Local quantities of §5.1 at single lines (one move; then budgets 8 and 32 from the line; last column the value (a)
at B = 32 for comparison):

| Rule | Line | score | one move: P(up), P(down), L_1 | B = 8: L_B, H_B | B = 32: L_B, H_B | (a) |
|---|---|---|---|---|---|---|
| m close to c | y = x | −1 | 0.333, 0.556, 0.74 | 1.36, 0.62 | 2.63, 1.46 | 1.46 |
| | y = 2x + 5 | −3 | 0.480, 0.507, 0.08 | 0.42, 0.55 | 1.23, 1.20 | 0.70 |
| | y = 9x + 4 | −5 | 0.444, 0.556, 0.32 | 0.88, 0.67 | 1.82, 1.53 | 0.42 |
| | y = 5x + 5 | 0 | 0, 1.000, ∞ | ∞, 1.26 | ∞, 2.72 | 3.28 |
| | y = 23x + 23 | 0 | 0, 1.000, ∞ | ∞, 1.27 | ∞, 2.81 | 3.28 |
| gradient near a prime | y = x | −1 | 0.153, 0.167, 0.13 | 0.19, 0.25 | 0.44, 0.57 | 0.57 |
| | y = 24x + 30 | −1 | 0.114, 0.173, 0.60 | 0.71, 0.26 | 0.79, 0.53 | 0.57 |
| | y = 0 | −2 | 0.167, 0.167, 0.00 | 0.00, 0.25 | 0.01, 0.56 | 0.32 |
| | y = 9x + 4 | −2 | 0.333, 0.000, −15.3 | −12.6, 0.00 | −7.2, 0.01 | 0.32 |
| | y = 23x + 23 | 0 | 0, 0.328, ∞ | ∞, 0.54 | ∞, 1.27 | 2.05 |
| \|gradient\| far from primes (rule 2 flipped) | m = 12 | 1 | 0.025, 0.225, 3.19 | 2.63, 0.32 | 1.62, 0.52 | 0.59 |
| | m = 9 | 2 | 3e-9, 0.333, 26.9 | 22.4, 0.56 | 13.4, 1.43 | 2.96 |
| | m = 26 | 3 | 0, 0.333, ∞ | ∞, 0.56 | ∞, 1.48 | 18.1–19.2 |
| | m = 93 | 4 | 6e-13, 0.333, 39.1 | ∞, 0.62 | 21.3, 1.76 | ≥ 19.0 |
| | m = 120 | 7 | 0, 0.333, ∞ | ∞, 0.62 | ∞, 1.76 | ≥ 19.0 |

- Equal scores get different local values (y = x and y = 24x + 30 under the prime rule: 0.13 and 0.60; y = 0 and
  y = 9x + 4: 0.00 and −15.3, because m = 9 lies between two primes and cannot get worse in one small move).
- Every top is infinite, and so is every local maximum of the flipped rule, whatever its score.
- H_B barely moves with the score: it measures how easily the place is left.
- The intervals in the last column are levels rarer than the mass outside the box (2e-6 at B = 32): the box proves
  "at least 19 bits" and no more, which is what §7.3 method 3 is for.

## 9. The beginner grid

Board: 4×4 digits, distance-v1 (a number moved by k costs 4 + 1.585·\|k\| bits). Rules: Opposite Nines (8 half-turn
pairs, score (pairs adding to 9, −total deviation)) and Magic Eighteen on rows (score (rows adding to 18, −total
deviation)). Today's static bits are computed exactly here (the pairs and the rows are independent): tops 26.58 and
15.60. The shipped tables for these two families are Monte Carlo estimates and give 26.43 and 14.79.

### 9.1 Candidate (a), (c1), (c2)

- **(a)** equals today's bits at every level, for every B (theorem 1; §4.3).
- **(c2)**, from the uniform birth law, is lower by at most 0.45 bits (the sum of 2^−energy over one-number moves is
  0.269).
- **(c1) reach** is lower by a hold-like term that grows with B. Exact, on the two-pair board:

| Level (pairs at 9, −deviation) | today's bits = (a) | reach, B = 32 | difference | reach, B = 128 | K_E |
|---|---|---|---|---|---|
| (0, −6) | 0.89 | 0.45 | 0.45 | 0.19 | 0.75 |
| (1, −4) | 2.94 | 1.54 | 1.40 | 0.75 | 2.44 |
| (1, −1) | 4.44 | 2.69 | 1.75 | 1.51 | 3.85 |
| (2, 0), the top | 6.64 | 4.17 | 2.47 | 2.60 | 5.73 |

  (K_E on this small board may lie up to 1.10 bits below today's: with 4 cells a move is cheap and the sum of
  2^−energy is 0.53.)

  A third to a half of the bits go, and more at larger budgets: reach forgives everything that random play would
  stumble on eventually.

### 9.2 Candidate (b)

One move is exact (all 288 single moves scored). The budgeted columns are 200,000 seeded walks from the board; B = 32
and 256 bits are about 5 and 40 moves. "H" is −log2 P(the walk ends at least as good).

**Opposite Nines**

| Board | score | today's bits | one move: P(up), P(down), L_1 | B = 32: L_B, H_B | B = 256: L_B, H_B |
|---|---|---|---|---|---|
| a random board | (1, −23) | 1.61 | 0.393, 0.418, 0.09 | 0.22, 0.72 | 0.49, 1.13 |
| no pair, each 1 away | (0, −8) | 0.81 | 0.333, 0.479, 0.52 | −0.95, 0.44 | −1.31, 0.47 |
| 4 pairs, the rest 3 away | (4, −12) | 9.00 | 0.247, 0.663, 1.42 | 3.05, 1.76 | 5.25, 4.15 |
| 4 pairs, the rest 1 away | (4, −4) | 11.15 | 0.167, 0.701, 2.07 | 3.17, 1.68 | 5.36, 4.04 |
| 7 pairs, the last 1 away | (7, −1) | 22.63 | 0.042, 0.868, 4.38 | 6.67, 2.21 | 9.56, 5.03 |
| all 8 pairs (top) | (8, 0) | 26.58 | 0, 0.938, ∞ | ∞, 2.37 | ∞, 5.18 |

**Magic Eighteen (rows)**

| Board | score | today's bits | one move: P(up), P(down), L_1 | B = 32: L_B, H_B | B = 256: L_B, H_B |
|---|---|---|---|---|---|
| a random board | (0, −27) | 0.15 | 0.478, 0.355, −0.43 | −0.83, 0.42 | −1.76, 0.34 |
| no row, each 1 away | (0, −4) | 2.04 | 0.313, 0.459, 0.55 | −0.08, 0.66 | 0.65, 1.27 |
| 2 rows, the rest 1 away | (2, −2) | 9.28 | 0.167, 0.677, 2.02 | 3.39, 1.65 | 5.69, 4.00 |
| 3 rows, the last 1 away | (3, −1) | 12.45 | 0.083, 0.787, 3.24 | 5.32, 1.98 | 8.11, 4.61 |
| all 4 rows (top) | (4, 0) | 15.60 | 0, 0.892, ∞ | ∞, 2.26 | ∞, 5.04 |

- **L is a compressed and distorted copy of today's bits**: 22.6 bits read 4.4 at one move and 9.6 at 40 moves; the
  top reads ∞ at every scale. Between rules it does not compare: "3 rows, the last 1 away" (12.45 bits) and "7 pairs,
  the last 1 away" (22.63) read 3.2 and 4.4, and both mean only "one fixing move left among 288".
- **H is nearly blind to height**: 1.7 to 2.4 bits at B = 32 for everything from 9 to 27 bits of achievement, and the
  board with the better score can have the smaller H (4 pairs: 1.68 against 1.76). It is hold rarity, and it is rightly
  a correction of a couple of bits.
- **The worse board can have the higher value**: under Opposite Nines the one-move value of "no pair, each 1 away"
  (0.52) is above the random board's (0.09), though its score is lower.

### 9.3 What would change for players

| Candidate | On the beginner grid |
|---|---|
| (a) | Nothing: the same bits, tables, points, logs and replays. |
| (c2) from the birth law | Bits lower by up to half a bit at every level; no visible change in play. |
| (c1) reach | Every rule's ladder compressed by a third or more, differently per rule (brittle rules lose most), so the pool's balance (beginner-pool.md §5) would have to be measured again. Hold rarity would be double counted and would have to go. |
| (b) | The number on an object would stop following the goal card: a better score could show fewer "bits", every finished object would read infinite, and two players' numbers could not be multiplied. Greedy play would chase fragile boards. |

## 10. Migration

- **Coexistence per object type: yes, by construction.** The prior is already per table key. Grid, Int, string and
  cards keep `uniform`; a line type declares `random-play` with its origin and B. A room has one object type, so no
  game mixes priors.
- **Nothing shipped is recalibrated.** Theorem 1 is the proof for the symmetric cost models. The two non-symmetric
  cases (multiply-v1 rooms, Int) keep the uniform law they were shipped with; moving them to random play would be a
  separate decision with its own tables.
- **New for an infinite type:** a spawn function that runs the policy from the origin (it replaces "uniform" in the
  type's interface, where `spawn` is documented as the uniform prior); the sequence-space splitting estimator of §7.3;
  hold tables as today (the noise is already the priced policy); the read-price rule (a complete look costs less than
  the smallest change) checked for the new type.
- **Stored games and replays: nothing breaks.** A replay folds the per-object net bits recorded in the event log and
  never consults a table (docs/replay-design.md); a live game pins its tables. No schema change, so no migration under
  CLAUDE.md's widen, migrate, narrow.
- **If the owner preferred (c1) or (b) on existing types** every table would be regenerated, hold rarity removed or
  redefined, the balance measurements of docs/beginner-pool.md and docs/coordination-incentives.md re-run, and bits
  recorded in old logs would no longer be comparable with new ones (a new log schema would have to mark the change).

## 11. Recommendation

**Value is the rarity of the score under the resting law of priced random play:**

> An object's bits for a rule are minus log2 of the probability that random play at rest holds an object at least
> this good.

1. **Two rules define the law.** A state's energy is the bits it takes to read it. A move's price minus its undo's
   price is the energy it climbs (Kolmogorov's cycle test, added to the invariants every cost model must pass,
   mutation-cost-design.md §5.5).
2. **Shipped types: change nothing.** Their states all read alike and their undo prices are even, so the resting law
   is uniform and the value is today's static bits (§4.3). The exceptions are multiply-v1 and Int's multiply, which
   have no undo; they keep the uniform law they shipped with.
3. **Lines and later infinite types:** choose the code for a number once (it prices reads too), add the read-length
   surcharge to every mutator, and the reference law is π = 2^−(read length) with no origin, no budget and no
   dependence on the lens set (§1.5, §1.6). Spawn objects from π.
4. **Measure rare levels by stitching** (§1.4), which is the shipped splitting estimator; use the level-matrix
   eigenvector only where a price list is allowed to fail the cycle test.
5. **Keep hold rarity** as the perturbation term in the score, keep own × others, and give the local "up versus
   down" its job as annotation and as the statistic "your agent did this for 1/k of what blind play needs" (Kac:
   blind play needs 2^bits moves per visit).
6. **Keep the budgeted law of §4 as the fallback** for a type whose prices are deliberately not confining; it is the
   same construction with teleportation and costs an origin and a B.

**The strongest objection.** With a price list that passes the cycle test, the resting law is whatever read length
was declared: π = 2^−φ, and the mutators' prices, lenses and distances drop out of value entirely. So the proposal
does not let "the practical relevance of our mutator costing decisions" shape value; it proves that only the
difference between a move and its undo can, and then recommends making that difference a declared code. On the grid
this changes nothing at all. A reader may fairly say the random walk has been reduced to a way of saying "choose a
prior over states". The reply: that is what the mathematics allows. The alternatives are (i) let prices be lopsided
on purpose and take π from the eigenvector, which makes pricing shape value, at the cost of currents, a value that
moves whenever a mutator is added, and estimators that need the full eigenproblem (§1.3 shows the effect is a
quarter of a bit on the 325-line board, so little is gained); or (ii) the budgeted law, where even prices do shape
value through path lengths, at the cost of an origin and a budget that each move rule tops by a bit (§8). Both are
worked out here and both are available. The route by which prices *should* reach points is the one already in the
game: energy spent, and hold rarity's horizon.

A second objection, about the object rather than the scoring: integer lines hold too few bits for own × others to
separate players (§1.3, §1.5, §8.1: tops of 2 to 5 bits against the grid's 15 to 27). No scoring fixes that.

**Experiments that would settle what is open** (none needs engine changes):

1. *The code for a number.* Compute the proposed line pool's tops and ladders under the slider code and the doubling
   code (§1.5). Prefer the one under which the pool's order by top bits matches the order on the 325-line board,
   where plain rarity is available as a check.
2. *Cycle test on the proposed price lists* (PR #346's seven and twelve families): list the loops that fail, and the
   smallest change to each family that passes (pivot, turn, drag and stretch are the candidates). Then decide per
   family whether the lopsidedness is wanted.
3. *Stitching against exact values* on the pegboard (6,460 lines, exact solve available) with a non-uniform π, to
   validate the Metropolis-weighted splitting estimator before it is trusted on an infinite type.
4. *Does a surcharge teach?* The read-length surcharge makes "towards simpler numbers" cheaper than "away". Play-test
   whether learners read that as natural (long numbers are dear) or as a hidden tax.
5. *Hold rarity on lines.* Whether m = players − 1 moves of noise separate brittle line rules (an exact equality
   such as m = c) from robust ones, as it separates lattices from lines on the grid.
6. *Richer objects.* Repeat §1.5's table for rational coefficients and for two-line objects, to find the smallest
   object whose rule tops reach 15 bits.

## 12. Decisions for the owner

1. **Value = rarity under the resting law of priced random play** (energy E = −log2 π; no birth state, no budget),
   with the local "up versus down" as annotation only? Recommended: yes.
2. **Must every price list pass the cycle test** ("a move's price minus its undo's price is the energy it climbs")?
   Recommended: yes, as a unit-tested invariant; then value never depends on the lens set and no eigenvector is
   needed. The alternative is to allow lopsided prices on purpose and take π from the eigenvector.
3. **On the finite line boards of PR #346: uniform rarity, or the resting law of the proposed price list?** (A confining
   surcharge there is a third option and reorders the rules, §1.8; not recommended on a finite board.) They differ
   by at most a quarter of a bit on the 325-line board. Recommended: make the list pass the test (then the two
   coincide), or keep uniform and accept that pivot and stretch are lopsided moves.
4. **On unbounded lines: the code for a number** (slider code or doubling code, §1.5). It sets read prices and value
   together. Recommended: the doubling code if numbers are meant to range widely, the slider code if the type should
   stay near small numbers; settle by experiment 1.
5. **Whether lens-switching should earn more than saved energy.** Under the recommendation it earns exactly the
   saved energy and value is lens-independent (§1.6). Recommended: keep it so.
6. **Whether to offer a multiplying mutator on lines**, and if so with its inverse: without one it has no undo, fails
   the cycle test and, under the budgeted law, makes the law heavy-tailed (§8.4).
7. **Whether prices should weigh more on the existing grid.** The principled lever is hold rarity's horizon.
   Recommended: leave as is.
8. **The line object needs more bits** before any scoring can rank players on it: richer coefficients, a compound
   object, or longer tie-break ladders. §1.9: what reaches the grid's 15 to 27 bits is several units per object (four
   to eight lines, or marked points, or crossings), not richer coefficients. A decision for §3A and §3B.
