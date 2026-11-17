# Free energy versus cheapest route: a toy measurement (17 November, Melbourne)

Trial only: `lib/v2-linear/scripts/free-energy.ts` (about six minutes in Node). No engine or game change. Labels:
**by construction**, **seen narrowly** (this toy, these parameters), **guess**.

## The claim tested (the coordinator's)

Under the cost law cost(x → y) = −log2 p(y | x), with p the passive jiggle, a route costs the surprise of that route.
For a goal G = {u ≥ u*}: MIN(x) = the cheapest route's cost = −log2 of the most likely single route into G;
SUM_T(x) = −log2 P(the jiggle from x is in G at some tick ≤ T). SUM ≤ MIN, and the gap is the log of the number of
comparably likely routes.

## The toy

- One whole number n in [0, 2^18). Height H(n) = log2(1 + n), quantised to bins of 1/16 bit (289 bins).
- Each act, with probability 0.7, is **additive**: propose a bin offset from a bell curve one bit wide (cut at ±4
  bits) and land uniformly in that bin. With probability 0.3 it **multiplies or divides** by a factor f from 2 to
  1024, drawn with probability ∝ 2^−(Elias gamma length of f). Multiplying past the cap, or dividing when f does not
  divide n, stays put.
- Gravity is a Metropolis acceptance. So the chain is exactly reversible, with resting law ∝ 2^(−λ·H̃), where λ = 1.5
  and H̃ is the quantised height. λ must exceed 1 for Σ(1 + n)^−λ to converge; 1.5 is the coordinator's choice.
- Rules: Power Hug (k = 3); Prime Hug on primes ending in 1; Multiples (k = 7, the owner's formula); bigger is better.
- Starts: every x of the same size as the reference, i.e. ⌊log2(1 + x)⌋ = 12 (4,096 starts). A goal's threshold u* is
  a quantile of u over those starts. Energy = the mean over starts of the bits.
- Exact work:
  - SUM_T by dynamic programming. One exact step over the whole space takes 38 ms.
  - MIN by relaxing route costs to a fixed point.
  - A discounted version, −log2 E[2^(−q·τ)], where τ is the first tick in G.

## 1 and 4. Exact results (seen narrowly; mean bits over the 4,096 starts)

| Rule | Goal | Share of the space in G | MIN | SUM T=1 | 4 | 16 | 64 | 256 | Discount q=1 | q=0.25 | q=0.05 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Power Hug | median | 4.4e-2 | 3.43 | 0.87 | 0.24 | 0.03 | 0.00 | 0.00 | 1.08 | 0.39 | 0.10 |
| Power Hug | top 10% | 1.1e-2 | 8.70 | 3.62 | 1.65 | 0.38 | 0.03 | 0.00 | 3.52 | 1.57 | 0.48 |
| Power Hug | top 1% | 1.4e-3 | 12.80 | 7.40 | 4.76 | 1.69 | 0.22 | 0.00 | 6.92 | 3.66 | 1.26 |
| Power Hug | best (3^8 exactly) | 1.5e-5 | 14.12 | 14.05 | 12.39 | 11.02 | 9.99 | 9.46 | 14.25 | 12.32 | 10.81 |
| Power Hug | 3^8 within 1 (near) | 5.7e-5 | 13.72 | 11.94 | 9.67 | 7.07 | 5.09 | 3.98 | 11.75 | 8.90 | 6.30 |
| Power Hug | 3^11 only (rare) | 3.8e-6 | 31.72 | ∞ | 25.38 | 20.32 | 17.86 | 17.12 | 27.83 | 22.60 | 19.21 |
| Prime Hug (1) | median | 4.2e-1 | 3.10 | 0.75 | 0.14 | 0.00 | 0.00 | 0.00 | 0.97 | 0.31 | 0.07 |
| Prime Hug (1) | top 1% | 2.1e-2 | 13.98 | 7.30 | 5.38 | 3.70 | 2.59 | 2.21 | 7.34 | 5.15 | 3.46 |
| Multiples (7) | median | 1.9e-1 | 3.28 | 0.79 | 0.17 | 0.00 | 0.00 | 0.00 | 1.00 | 0.33 | 0.08 |
| Multiples (7) | top 1% | 5.5e-3 | 13.16 | 7.64 | 5.76 | 3.96 | 2.58 | 1.90 | 7.70 | 5.47 | 3.57 |
| Multiples (7) | best | 1.0e-3 | 13.72 | 11.06 | 8.84 | 7.02 | 5.76 | 5.14 | 10.92 | 8.55 | 6.71 |
| Bigger is better | median | 0.98 | 3.12 | 1.09 | 0.54 | 0.32 | 0.25 | 0.21 | 1.34 | 0.68 | 0.38 |
| Bigger is better | best | 0.97 | 6.23 | 2.47 | 1.28 | 0.76 | 0.58 | 0.50 | 2.92 | 1.53 | 0.86 |
| (any rule) | one trophy {6561} | 3.8e-6 | 14.12 | 14.12 | 12.51 | 11.22 | 10.26 | 9.74 | 14.35 | 12.48 | 11.05 |
| (any rule) | eight trophies 6561 + 37j | 3.1e-5 | 14.09 | 11.18 | 9.56 | 8.28 | 7.32 | 6.80 | 11.41 | 9.53 | 8.10 |

The script also prints the Prime Hug and Multiples rows for top 10% and best, which are omitted here.

- **SUM_T has no natural horizon.** On a finite reversible chain it tends to 0 as T grows (by construction). Here it
  slides for every goal (seen narrowly). Rare goals slide slowly, by about a bit per factor of four in T; common goals
  collapse to 0 by T = 64. So T is a free dial that sets the whole scale.
- **The discounted form is the better behaved one.** It is a fixed point, so there is no horizon to choose. With q = 1
  bit per tick it tracks MIN when there is one route (14.35 against 14.12 for one trophy). It drops by log2 of the
  number of comparable targets when there are many (11.41 against 14.09 for eight trophies, about log2 8 = 3 bits).
  MIN cannot see that difference. A guess at a principled q: the bits to name a move, which every act pays anyway.
- **Properties wanted** (seen narrowly, q = 1):
  - Bigger is better scores about 1 to 3 bits, against MIN's 3 to 6. It is not 0, because half the starts sit below
    the reference and must climb.
  - Sparser goals score higher in every rule.
  - Near is cheaper than exact by about 2.5 bits.
  - More trophies score lower, by about the log of their number.

## 2. Plain simulation (seen narrowly: Node on this machine, 6,600 steps per ms, T = 16)

Walks for a 2% standard error on one start's bits follow n ≈ (1 − P) / (P · (0.02 · E · ln 2)²):

| Energy E (bits) | Walks for 2% | ms | Measured over 20 repeats |
|---|---|---|---|
| 4.9 | 6.3e3 | 15 | 1.8% (4.92 against exact 4.91) |
| 10.2 | 5.7e4 | 140 | 1.7% (10.12 against 10.15) |
| 20.1 | 1.5e7 | 36,000 | not run |
| 32.6 | 3.3e10 | 8e7 | not run |

Plain simulation works to about 10 bits per start inside a commit's budget, and no further.

**One batch gives the whole curve** P(max u reached ≥ u*). Its bits rise with u* by construction, because a bigger
u* asks for a subset of the same walks. From start 5,000, one batch of 20,000 walks matched the exact SUM_16 within
0.15 bits at every threshold the batch could see: 0.05, 0.36, 1.55, 7.07 and 11.29 bits, against exact 0.05, 0.35,
1.54, 6.95 and 11.16. The rare goal (exact 20.7 bits) was never hit, so the curve reads ∞ there.

## 3. Importance sampling toward one rare target (seen narrowly)

The goal was G = {3^11}, with T = 16. The proposal was a 50/50 mix of the true jiggle and a crude rule-specific move:
step one bit toward the target's bin, and land exactly on 3^11 once in its bin. Each walk was reweighted by
Π p / (½p + ½h).

| Start | Exact SUM_16 | IS mean of 10 runs | Relative sd of P per run | Walks per run | ms per run |
|---|---|---|---|---|---|
| 5,000 | 20.68 | 21.43 | 1.2 | 20,000 | 32 |
| 300 | 26.20 | 27.10 | 2.4 | 20,000 | 43 |
| 20 | 32.19 | 44.35 | 2.6 | 20,000 | 41 |

The estimator is unbiased in P by construction, but its weights are heavy-tailed. Typical runs come out 0.7 to 12 bits
dear, and the spread between runs is over 100%. **A crude proposal does not suffice.** A good proposal needs an
estimate of the cost-to-go in every state, the Doob transform (guess), and that is the search MIN already does.

## 5. Recommendation (guess)

Define energy as the discounted SUM: −log2 E[2^(−q·τ)], with q the naming bits of an act. It is universal, and the
heuristics then only steer sampling. It adds the bits of "many ways in", which MIN misses. It has no horizon to tune.
Bigger is better comes out near 0.

What breaks is computation in the real game. Exact dynamic programming needs an enumerable state space; a line has two
unbounded rationals. Plain simulation reaches about 10 bits. Above that, the variance of importance sampling depends
entirely on the proposal: an unguided one gives a 12-bit error at 32 bits.

A tractable hybrid (guess): energy ≈ MIN − log2(count of near-MIN routes into G). The heuristics enumerate the targets
and their route costs, and the log-sum-exp over them is the discounted SUM's leading term. This is exact in the
single-route limit (14.35 against 14.12 above).

How this could be wrong:
- One toy with one parameter and one start size, and kernel shapes chosen by me.
- In two dimensions, and with real rule geometry, the number of routes may matter far more or far less.
- The q = 1 fit to MIN may be a coincidence of this kernel.
- Plain-simulation timings are Node on this machine, not the Convex runtime.

# Cheapest route by search, with no horizon (17 November, the redirect)

The owner: "I don't like the need for a horizon dial. Can we estimate the cheapest route using heuristic aided random
search without a horizon dial?" So the target is MIN: the cheapest route, in bits of surprise, from a same-size start
into {u ≥ u*}.

The script is `lib/v2-linear/scripts/free-energy-search.ts`, which takes about six minutes. It uses the same toy as
above; the toy itself now lives in `free-energy-toy.ts`. Each act names its kind, so an additive act and a
multiplicative act are separate edges. Exact MIN comes from relaxing route costs over the whole space.

## 1. Universal search (built; numbers seen narrowly, Node on this machine)

The search is Dijkstra on the bits of surprise, starting from the start state. It evaluates u on each settled state
and stops at the first one with u ≥ u*. Nothing in it is rule-specific. It does use the kernel's own structure, which
is generic:

- An additive act depends only on the height bin it starts from, so the first settled state of each bin expands its
  additive moves once, as a block.
- Multiples and divisors are generated lazily, in order of cost.

**Exactness.** Over 200 starts on each of 14 goals, the search agreed with exact MIN within 1.4·10⁻¹⁴ (exact by
construction once it stops). When the budget runs out at radius r, MIN ≥ r is certified.

| Answer (bits) | Routes | Median states settled | Median ms |
|---|---|---|---|
| 0–5 | 128 | 2 | 0.01 |
| 5–10 | 629 | 3 | 0.01 |
| 10–15 | 1,360 | 3,427 | 0.83 |
| 15–20 | 39 | 7,401 | 1.74 |
| 30–40 (3^11) | 200 | 175,867 | 374 |

The time grows at about 2^(c/2) in the answer c, from 13 to 32 bits. The radius certified with no goal anywhere
(median of 30 starts) was:

| Time | Radius certified | States settled |
|---|---|---|
| 1 ms | 18 bits | 19k |
| 10 ms | 20 bits | 26k |
| 100 ms | 27 bits | 71k |

## 2. Sampled routes (seen narrowly)

Each start ran jiggle walks, and every walk stopped once its own cost passed the best route found so far. The table
gives the mean of (best found − exact MIN) over 100 starts.

| Goal | Exact | 10 walks | 100 | 1,000 |
|---|---|---|---|---|
| Prime Hug, best (dense goal) | 14.66 | +29.8 | +1.0 | +0.39 |
| Multiples, best | 13.65 | +35.2 | +30 | +11.1 |
| Power Hug, best (4 states) | 14.16 | none found | none | 77 of 100 starts found none |
| 3^11 only | 31.66 | none | none | none |

Sampling from the jiggle finds a goal at a rate of about 2^−(surprise), so it only works for dense goals. Its bias
always points upward and shrinks as walks are added.

## 3. Heuristics as aids (built; seen narrowly)

A rule lists candidate goal states: its anchors, ±2. A route to each candidate is priced in closed form: 1 to 8 equal
additive strides, optionally with one multiply or divide (f ≤ 64) at the start or the end. The search then runs
seeded with that bound, and stops as soon as its frontier reaches the bound.

- **The aids never raised an estimate.** The estimate is the minimum of the search and the bound (by construction),
  and in tests 0 of 2,800 routes came out below the exact value.
- **For exact-target goals the candidates alone were exact.** Power Hug's best, the near 3^8 goal, and the 3^11-only
  goal all had a heuristic mean equal to exact MIN. Certifying that answer is what costs (at 2,000 states the bracket
  stays open).
- **For common goals the candidates were poor and the search was cheap.** The median goal's bound was 6.7 against an
  exact 3.5, and the search fixed every one.
- **Rare target 3^11 from smaller starts**, at a budget of 2,000 states:

  | Start size | Exact | Search alone | With heuristic |
  |---|---|---|---|
  | 12 bits | 31.8 | [13.6, ∞] | [13.6, 31.8], exact |
  | 8 bits | 40.7 | [17.9, ∞] | [17.9, 47.2] |
  | 4 bits | 52.5 | [29.6, ∞] | [29.6, ∞] |

  The coded routes (one shortcut) miss the chains of multiplies these starts need. A richer route list would close
  the gap.

## 4. The state's energy

Energy = the mean over stratified same-size starts of the best route found (the upper bound), reporting the certified
share beside it. The table gives 5 repeats per row, with the heuristic plus 2,000 states per start.

| Goal | Exact | K = 1,000: mean (sd) | K = 5,000: mean (sd) | Certified share | ms per estimate at K = 1,000 |
|---|---|---|---|---|---|
| Power Hug, median | 3.43 | 3.45 (0.085) | 3.42 (0.034) | 100% | 326 |
| Power Hug, best | 14.12 | 14.11 (0.008) | 14.12 (0.003) | 0% | 853 |
| Prime Hug, best | 14.66 | 14.66 (0.006) | 14.66 (0.002) | 0% | 1,856 |
| Multiples, best | 13.72 | 13.73 (0.013) | 13.72 (0.006) | 30% | 2,156 |
| Bigger is better, best | 6.23 | 6.23 (0.003) | 6.23 (0.001) | 100% | 148 |
| 3^8 within 1 (near) | 13.72 | 13.72 (0.013) | 13.72 (0.002) | 21% | 1,250 |
| 3^11 only | 31.72 | 31.72 (0.008) | 31.72 (0.002) | 0% | 625 |

- **The spread between repeats** is at most 2.5% (median goals at K = 1,000) and under 0.1% for rare goals. Stratified
  starts make the size class nearly deterministic here.
- **The upper bounds were exact even where uncertified.** So the clean report is the upper bound plus the certified
  share; the bracket's lower end mostly measures the search budget.
- **The time is far over a commit's budget**: 0.15 to 2 s per estimate at K = 1,000 in Node. Spending 2,000 states on
  each of 1,000 starts is the cost. Almost all of it goes on certifying, and certifying does not change the number.

## 5. Behaviour (seen narrowly)

- **Sparser goals score higher**: medians about 3 bits, best about 14, 3^11 about 32.
- **Near is modestly cheaper than exact**: 13.72 against 14.12.
- **Bigger is better does not score about 0** under MIN: 3.1 bits at the median, 6.2 at the best. The cheapest act at
  12 bits pays about 6 bits of landing (the digits of where it lands), and half the starts must act. Under MIN, the
  floor of every energy is the price of one act at that size. The discounted SUM above did not have this floor (about
  1 bit).

## Verdict (guess)

"Energy = the mean of the cheapest route found by cost-ordered search, heuristics as optional aids" is exact, needs no
horizon, never overstates through its aids, and its average over stratified starts is stable to about 1%. As a game
measure it is tractable only with heuristics doing nearly all the work:

- Use the heuristic route list as the estimate.
- Spend a small per-start search budget, about 50 to 200 states, to catch the cheap common-goal routes the list
  misses.
- Report the certified share rather than paying for certification.

What breaks:

- Real lines have two unbounded rational parameters, and their bins are not this regular, so the per-bin expansion
  trick may not carry over.
- Rare goals rely entirely on the route list being complete, as the 8- and 4-bit starts show.
- MIN carries a floor of one act's price, so bigger is better is not 0. Either subtract the size class's cheapest-act
  price, or accept the floor.
- Node timings scaled to the Convex runtime are unknown.
