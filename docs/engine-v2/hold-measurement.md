# Is hold already a function of bits?

The owner's question (2026-11-14): does the energy model already make a high-bits state fragile, so that v1's
hold rarity (`archive/engine-v1`, `docs/energy-model.md` §8: payoff bits = −log2 P(U(x) ≥ u ∧ U(x′) ≥ u), x′ = x after
m random mutations) is redundant? This page measures it in v2. Analysis only: no game logic changed.

Script: `lib/v2-agents/scripts/hold-measure.ts` (about 3.5 minutes for everything below:
`node --experimental-strip-types scripts/hold-measure.ts` from `lib/v2-agents`). It prints the per-rule tables that are
summarised here.

## Method

- **Rules:** every dealt (family, params, tie-breaker) with a committed value function: 32 rules of `lines-beginner` on
  line-q, 30 of `lines-whole` on line-z, 24 of `grids-beginner` on grid-4-d10. bits = the rule's value function at
  the state's score; φ = the state's read length (law bits).
- **States:** subset simulation per rule. 240 draws from π (`lineLaw(variant).draw`, or independent cells from
  `cellProbability`), then up to 14 levels: keep the top 20%, and run the walk restricted to {U ≥ u} for 24 steps from
  each kept state. That walk leaves π conditioned on the upper set. So inside any 1-bit bin above u, the states it
  produces follow π conditioned on that bin. Up to 16 distinct states are kept per bits bin 0, 1, …, 18+: 4,960–7,260
  states per variant, reaching 10–28 bits.
- **Noise:** the walk's own kernel. The script steps with a copy of `walkStep` (v2-core `walk.ts`): a uniform mutator,
  a uniform site, arguments ∝ 2^−price, and an uphill step accepted with 2^−Δφ. The copy only also reports which
  mutator was proposed, and the script checks it against `walkStep` on a shared random stream before it starts. One
  move is the kernel run until the state changes. m = 1, 2, 3 moves (players − 1), 64 replicates per state.
- **Per state:** survival s_m = P(U(x_m) ≥ U(x)) and hold_m = −log2 s_m (smoothed (k + ½)/65).
- **Per rule:**
  - Spearman and Pearson correlation of hold with bits.
  - R² of hold on 1-bit bins of bits.
  - The spread of hold inside a bin: IQR and 10–90% width, the median over bins with ≥ 6 states.
  - The share of that within-bin variance that is Monte Carlo noise (delta method, (1 − p)/(R·p·ln²2)).
  - R² of hold on 2-bit bins of φ.
  - The partial correlation of hold with φ given the bits bin, and the R² that φ adds beyond the bits bins.

## Results (median over rules)

| Variant | m | Spearman ρ | Pearson r | R² on bits bins | Within-bin IQR / 10–90% (hold bits) | MC-noise share of within-bin var | R² on φ bins | Partial r(hold, φ \| bits) | ΔR² from φ | States ≥ 10 bits with survival ≥ 0.9 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| line-q | 1 | 0.71 | 0.73 | 0.65 | 0.66 / 1.43 | 0.26 | 0.17 | −0.14 | 0.01 | 3 of 1,160 |
| line-q | 2 | 0.83 | 0.82 | 0.74 | 0.63 / 1.15 | 0.42 | 0.22 | −0.05 | 0.00 | 0 of 1,160 |
| line-q | 3 | 0.86 | 0.85 | 0.77 | 0.76 / 1.52 | 0.55 | 0.21 | −0.06 | 0.00 | 0 of 1,160 |
| line-z | 1 | 0.68 | 0.70 | 0.62 | 0.64 / 1.32 | 0.24 | 0.16 | −0.22 | 0.02 | 26 of 1,156 |
| line-z | 2 | 0.81 | 0.80 | 0.70 | 0.56 / 1.06 | 0.36 | 0.22 | −0.19 | 0.01 | 9 of 1,156 |
| line-z | 3 | 0.84 | 0.83 | 0.74 | 0.78 / 1.45 | 0.44 | 0.23 | −0.20 | 0.01 | 5 of 1,156 |
| grid-4-d10 | 1 | 0.82 | 0.81 | 0.69 | 0.38 / 0.74 | 0.50 | 0.13 | 0.05 | 0.03 | 0 of 3,420 |
| grid-4-d10 | 2 | 0.85 | 0.84 | 0.73 | 0.62 / 1.12 | 0.52 | 0.13 | 0.04 | 0.04 | 0 of 3,420 |
| grid-4-d10 | 3 | 0.87 | 0.85 | 0.75 | 0.79 / 1.49 | 0.59 | 0.14 | 0.14 | 0.04 | 0 of 3,420 |

**Survival by bits bin.** Each cell is the median over rules of a bin's mean survival P(U(x′) ≥ U(x)).

| Variant, m | 0 | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18+ |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| line-q, 1 | 0.98 | 0.58 | 0.45 | 0.39 | 0.29 | 0.23 | 0.19 | 0.21 | 0.18 | 0.21 |
| line-q, 2 | 0.97 | 0.53 | 0.36 | 0.28 | 0.20 | 0.16 | 0.12 | 0.12 | 0.11 | 0.13 |
| line-q, 3 | 0.97 | 0.46 | 0.28 | 0.20 | 0.13 | 0.08 | 0.05 | 0.05 | 0.05 | 0.06 |
| line-z, 1 | 0.99 | 0.49 | 0.42 | 0.32 | 0.27 | 0.19 | 0.23 | 0.28 | 0.21 | 0.32 |
| line-z, 2 | 0.99 | 0.48 | 0.39 | 0.29 | 0.22 | 0.15 | 0.18 | 0.20 | 0.11 | 0.18 |
| line-z, 3 | 0.99 | 0.42 | 0.31 | 0.20 | 0.15 | 0.07 | 0.10 | 0.13 | 0.05 | 0.12 |
| grid, 1 | 0.75 | 0.65 | 0.58 | 0.53 | 0.45 | 0.43 | 0.36 | 0.36 | 0.30 | 0.27 |
| grid, 2 | 0.71 | 0.53 | 0.44 | 0.36 | 0.28 | 0.24 | 0.18 | 0.19 | 0.16 | 0.10 |
| grid, 3 | 0.69 | 0.46 | 0.36 | 0.29 | 0.20 | 0.14 | 0.10 | 0.09 | 0.10 | 0.05 |

On lines, the spread across rules is wide. At 10–12 bits, m = 1, the 10–90% band over rules runs from about 0.01 to
0.5 (the script prints these bands). The highest bins on lines hold only 2–9 rules, so read them loosely.

What this says:

- **Hold is mostly a function of bits.** Survival falls monotonically with bits, ρ ≈ 0.7–0.87 and R² ≈ 0.6–0.77. The
  spread left inside a 1-bit bin is about ±0.7 hold bits (10–90% width ≈ 1.1–1.5), and Monte Carlo noise accounts for
  a quarter to a half of it. The residual that is truly state-specific is under one bit for the typical rule.
- **But the dependence is weak and saturating.** A state at 18 bits has a hold of only about 2 bits at m = 1 and 3–4
  bits at m = 3. On lines, survival stops falling from about 10 bits on (0.2–0.3 at m = 1). A rarer state is not
  proportionally more fragile. So the v1 payoff, bits + hold, would be a slightly concave re-scaling of bits plus a
  bit of noise. It would not be a new signal.
- **Energy adds nothing.** Once bits is known, φ explains ≤ 0.07 more of the variance (median 0.00–0.04). On lines the
  partial correlation is negative, so at equal bits a high-φ state is, if anything, a little *more* robust. On its own,
  φ explains only 0.13–0.23. The fragility does not come from the energy.

## Where hold does not follow bits

Rules with ρ < 0.5 at m = 1:

- line-z: divisibility-ladder/m-spf (0.27, 22 of 123 states ≥ 10 bits survive ≥ 0.9), divisibility-ladder/steep
  (0.16), divisibility-ladder/m-prime (0.40), divisibility-ladder/m-gpf (0.36), ruler/prime-gradient (0.31),
  ruler/square-area (0.34), exact-change/big-bill (0.49).
- line-q: divisibility-ladder/steep (0.23), whole-crossing/k-gpf (0.47), divisibility-ladder/m-gpf (0.44).
- grid: spread-of-three/zeros (0.48). Every other grid rule has ρ ≥ 0.67.

The mechanisms, with examples. A line state is the triple (a, b, c) of a·x + b·y + c = 0. The figures are survival at
m = 1/2/3.

1. **Blind coordinates.** A rule that does not read one coordinate survives every move along it.
   - divisibility-ladder/m-spf (line-z), `4,1,5040` (y = −4x − 5040, 14.4 bits): 1.00/0.97/0.89. Every tilt, pivot,
     stretch and mirror the kernel proposed kept the score.
   - Its neighbour `5,1,5040` at 17.0 bits: 0.17/0.41/0.23.
   - whole-crossing/k-gpf: `2,1,-228` (line-z, 12.6 bits) 0.97/0.81/0.66, and `3,1,-2736` (line-q, 11.7 bits)
     0.97/0.84/0.80. Every tilt kept the score, against 0.11 for `1,1,31` at 18.7 bits.
   - The task's "prime-c state survives any tilt" is exactly this: the kernel moves the coordinate the rule ignores.
2. **Symmetries.** `cart.mirror` maps the upper set of many rules into itself.
   - ruler/prime-gradient `75,1,-75` (line-z, 14.7 bits), 0.75/0.45/0.27: 44 of 44 mirrors kept it, 0 of 13 slides did.
   - divisibility-ladder/steep `255,1,840` (13.0 bits), 0.94/0.66/0.56.
   - On grids, `turn.spin` and `mirror.reverse` play the same part. spread-of-three/zeros `1001/0330/0003/0330`
     (16.3 bits): 0.78/0.58/0.38, against 0.17/0.03/0.02 for another board at 13.8 bits.
3. **Plateaus.** Rules with a coarse score (divisibility ladders, rulers, exact change) put many states on one score.
   The upper set is then fat, and survival depends on where a state sits on its plateau, not on its bits. The same
   effect is what flattens the line curves above 10 bits.

The fragile end comes from rules that read both coordinates sharply, such as treasure/prime-terms on line-q, `6,1,-49` (13.3
bits): 0.00/0.05/0.00.

## Real perturbations (one act of another rule's shipped Simple starter)

About 150 states of rule A, spread across the bits bins. Each was offered three times (three seeds) to the Simple
starter of rule B, with 200 ⚡. The table compares that with one kernel move.

| Variant | A (measured) | B (agent) | States | Acts committed | Survival, agent (all / committed) | Survival, one kernel move | ρ(agent, kernel) | Survival ≥ 10 bits: agent / kernel (states) |
|---|---|---|--:|--:|--:|--:|--:|--:|
| line-z | prime-landing/big-prime | treasure/prime-terms | 147 | 438 of 441 | 1.00 / 1.00 | 0.35 | – | 1.00 / 0.19 (45) |
| line-z | whole-crossing/k-spf | prime-landing/big-prime | 154 | 441 of 462 | 0.34 / 0.31 | 0.41 | 0.29 | 0.16 / 0.21 (58) |
| line-q | square-area/spf | prime-gradient/prime | 144 | 408 of 432 | 0.49 / 0.46 | 0.55 | 0.71 | 0.00 / 0.23 (24) |
| grid | magic-eighteen/first-column | mirrormancer/middle | 152 | 456 of 456 | 0.91 / 0.91 | 0.46 | 0.11 | 0.86 / 0.34 (72) |

Real moves are not kernel noise. Whether A survives B's agent depends on which coordinates B's rule makes it move.
That ranges from never harmed (the Treasure agent leaves every Prime Landing state intact, and the Mirrormancer agent
keeps 86% of rare Magic Eighteen boards) to always harmed (the Prime Gradient agent breaks every Square Area state
at ≥ 10 bits). The rank agreement with kernel survival is 0.11–0.71. A kernel-based hold term would therefore not
measure the fragility that matters in a game, which is fragility to the other players' rules.

## Why: the mathematics, checked against the data

The kernel K is π-reversible: π(x)K(x, y) = π(y)K(y, x). Take an upper set A = {U ≥ u}. The probability flow out of A
equals the flow into it, so the mean escape probability from A under π|A is Q(A^c, A)/π(A). That is the set's
boundary measure over its volume, the conductance. When A is small and scattered, almost all of its kernel
neighbourhood lies outside A, and A is left fast. When A has a small boundary relative to its mass, it is left slowly.
This happens when A is a cylinder along a coordinate the rule ignores, is closed under a symmetry the kernel proposes
(mirror, spin), or is a wide plateau. That is the hold–bits link seen above, and it is also where the link breaks
(section "Where hold does not follow bits").

The confining surcharge makes downhill moves in φ always accepted and uphill moves rare. So high-φ states do drift
down in φ. But φ and the rule's score are different coordinates, and the data show φ adds nothing to hold beyond bits
(ΔR² ≤ 0.07; the partial r is even slightly negative on lines).

The owner's intuition is half right. Fragility does come out of the model without an extra term, but it comes from the
reversibility and locality of the kernel acting on the rule's upper sets, not from the energy. It is mild: about
2 bits of hold at 18 bits of rarity.

## Recommendation

**The hold term is redundant: do not add it to v2's score.** Against the walk's own noise, hold is about 70% a
monotone, concave function of bits. The rest is under one bit of state-specific spread (part of it Monte Carlo noise)
plus rule-specific blind-coordinate and symmetry effects. Against real opponents, it does not predict fragility
anyway. If rewarding robustness ever becomes a goal, the cheaper fix is:

- a fixed concave transform of bits for that purpose (nothing to calibrate);
- or let robustness be priced where it is real, by the other players' moves at the table, which the points formula
  π_i = n_i · Σ_{j≠i} n_j already does.
