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
