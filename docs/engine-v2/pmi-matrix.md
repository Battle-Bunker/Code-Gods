# PMI matrix of the line rules (owner decision 39)

The owner (decision 39): "I also want the meaningfulness of adding others bits before multiplying our own to come from all
rules being approximately perpendicular value vectors in the configuration space such that two other players with 20
bits represents an object that's as rare and hard to reach as 40 bits." Decision 40 adds that two players at 20 each on
one object should be hard "because their rules should naturally pull against each other (be roughly perpendicular)
without clever coordination", and decision 41 asks for parameterised families so that two randomly drawn rules tend to be
perpendicular.

This page measures how far the line-q rules are from that, pair by pair, and proposes how the dealer should use it.
Analysis only: no game logic changed. The measured tables at the end are generated and are re-run as is when the line-q
values are regenerated (a law change and tail refits are coming):

    pnpm --filter @workspace/v2-agents pmi            # about 5 minutes on 4 cores; --dry prints without writing

It writes the tables below, `docs/engine-v2/scripts/pmi-line-q.json` (every rule pair, every depth: PMI, effective joint
draws, the error of the joint estimate) and `lib/v2-agents/src/pmi.gen.ts`, the compact table behind
`pairPmi(variant, a, b)` in `@workspace/v2-agents/pure` for the dealer.

## Method

For rules A and B and a depth t bits,

    PMI(t) = log2 π(A ≥ t ∧ B ≥ t) − log2 π(A ≥ t) − log2 π(B ≥ t)  =  bits_A + bits_B − bits_joint,

where "A ≥ t" is the upper set of lines whose bits under A's committed value function are at least t. PMI 0 is the owner's
perpendicular: an object worth t to each of two players is as rare as one worth 2t to one. PMI > 0 (aligned): one
structure is paid twice, so a pair of players at 20 bits each is cheaper than 40 bits. PMI < 0 (anti-aligned): the two
are hard to hold together.

- **Rules:** every committed value function of line-q (`lib/v2-valuation/values/line-q`): the dealt beginner pool
  (`lines-beginner`, 40 rules) and the undealt candidates of `rational.ts` and `rational2.ts` (the six adversaries
  included), 101 rules in 32 families; Pell Gradient carries six parameter sets.
- **Draws:** the line-q law (`lineLaw(lineQ).draw`) under the tilted mixture of `lib/v2-valuation` value.ts
  (`VALUE_CONFIG.tilts` 1, 0.75, 0.55, 0.4, 0.3), weights p/q_mix self-normalised exactly as the sampled oracle, one
  million draws per tilt. Every rule is read on the same draws (parallel workers, one rule per task).
- **Depths:** 4, 6, 8, 10 and 12 bits. A depth is read only when the joint upper set holds at least 30 effective draws
  ((Σw)²/Σw²); otherwise the cell is blank. **Headline:** the mean PMI over the depths read.
- **Classes** (on the headline): independent |PMI| ≤ 1; mild 1 to 2 (or −1 to −2); aligned > 2; anti-aligned < −2.
- **Matrix by family pair:** the mean of the rule pairs' headlines over tie-breakers (and parameter sets); the diagonal
  is two tie-breakers of one family.

Caveats. (1) For an independent pair the joint set at t bits has mass about 2^(−2t), so at this sample size depths
past about 8 are read only for aligned pairs; an aligned pair's headline averages deeper depths, where alignment is
larger, so headlines are not strictly comparable between aligned and independent pairs (the JSON has every depth). (2)
Values are certified to about 18 bits; what matters here is the 4–12 bit range, well inside. (3) The table is keyed by
"family/tieBreaker"; Pell Gradient's six parameter sets are averaged in the key (the JSON has each).

Exclusions. A depth with no joint draws where independence would have put at least 300 effective draws in the joint set
is not a thin sample but an exclusion. It is shown as "≤ bound": PMI ≤ log2(30 / expected), at most −3.3. It counts in
the headline as its bound. Example: Steep and Tall × Sunken Intercept, which want the y-intercept far above and far below
zero.

## Findings (measured 15 November; numbers from the tables below)

1. **The rules are far from perpendicular.** Of 4,795 rule pairs of different families: independent 1,606 (33%), mild
   1,266, aligned 1,009 (21%), anti-aligned 554 (12%), unread 360. In the **dealt beginner pool** (40 rules, 10
   families, 715 pairs of different families): independent 236 (33%), mild 243, **aligned 176 (25%)**, anti-aligned 60.
   Two tie-breakers of one family are always aligned (family diagonal 1.7 to 8.1 bits). The owner's "20 + 20 bits is as
   rare as 40" holds for only a third of pairs.
2. **Two value functions in the dealt pool are not calibrated to the current line-q law. This is a bug, reported here and
   not fixed (analysis only).** A survival value function must have π(A ≥ t) ≤ 2^−t. **Treasure** (all five tie-breakers)
   falls 5.7 bits short and **Ruler** (all three) 6.2 to 7.1 bits short. The cause is vertical lines (b = 0, about 30% of
   the law's accepted mass). Treasure gives x = 1/3 or x = 1/4 about 8.4 bits, and Ruler gives x = 18 12.9 bits (distance
   18, a whole square). So a player dealt either can score 8 to 13 bits on almost any vertical line. Their value files
   were made before the law put mass on verticals, or with another vertical score. Their PMIs are therefore not at the
   nominal depths: Treasure's strong anti-alignment with nearly everything (−2 to −6) and Ruler's independence partly
   reflect this. Regenerate their values (the coming regeneration should) and re-run this script.
3. **The c-is-prime cluster is the largest aligned block in the dealt pool.** These rules all read "the y-intercept (y(0))
   is near a prime": Prime Landing (main), Prime Staircase (y(0) is the first prime), Prime Gradient/cPrime and its c-spf
   and c-gpf, Pythagorean Area/prime-height and Same on Both Rulers/prime-start. Their pairs run 2.5 to 6 bits: Prime
   Landing/big-prime × Prime Staircase/first-prime 5.85, Prime Landing × Prime Staircase family mean 5.0, Prime
   Gradient/cPrime × Prime Landing/prime-gradient 5.0, Prime Gradient/c-gpf × Square Area/lpf 6.15, and Prime
   Gradient/prime × Whole Crossing/m-spf 6.04.
4. **The smooth/gcd cluster (undealt) is the most aligned overall.** It holds the adversaries Smooth Crossing, Smooth
   Intercept, Smooth Square, Smooth Gradient and Sunken Intercept, the gcd tie-breakers (Whole Intercept/gcd-*, Whole
   Area/gcd-*, Whole Crossing/gcd-c, Steady Gradient/gcd-c) and Divisibility Ladder. Pairs run 4 to 8.4 bits. Smooth
   Crossing × Smooth Intercept is 8.39 (8.3 at depth 8, against §A10's 8.5). Smooth Square × Square Area/omega is 8.10.
   These rules all reward "the line is simple" (a small bottom number and coefficients rich in small primes), the shared
   hidden variable §A10 named.
5. **The six adversaries are aligned with each other, as rule design measured.** Of their 15 pairs, 12 are aligned
   (2.06 to 8.39; about 6.0 for Crossing × Square, Intercept × Square, Crossing × Sunken and Intercept × Sunken; 5.77 for
   Gradient × Steep and Tall). Two are mild (Steep and Tall with Crossing and with Intercept, 1.87). Steep and Tall ×
   Sunken Intercept is an exclusion (≤ −5.6). This agrees with §A10's 6
   to 8.5 at depth 8 (here 6.0 to 8.3 at depth 8 for the same pairs). **Against the 367 rules** the adversaries are mostly
   mild or independent:
   - Whole Crossing/k-spf: 0.1 to 1.2;
   - Prime Landing/big-prime: 0.0 to 1.3, except Steep and Tall 2.72 and an exclusion with Sunken Intercept (≤ −6.0);
   - Square Area/spf: 1.4 to 2.6, except Smooth Square 5.17, which shares Square Area's primary.
6. **The 367 rules are nearly independent in rarity.** Square Area/spf × Whole Crossing/k-spf is 0.04, × Prime
   Landing/big-prime 1.08, and Whole Crossing/k-spf × Prime Landing/big-prime 2.43. The 14 November failure (y = −2x +
   734) was not shared rarity in π's 4 to 12 bit range. It was a shared unbounded hill: one prime p climbing all three
   rules together, far past where π has mass. **PMI of upper sets does not see shared ladders.** Use it beside the tension
   table (src/tension.gen.ts, unopposedDirections), not instead of it.
7. **Reading the same prime of the same number is aligned when a main term shares the reading, and close to independent
   when only tie-breakers do.**
   - Pairs sharing "c near a prime" through a main run 2.5 to 5.9.
   - Pairs sharing only a tie-breaker's m-spf or m-gpf run 0.2 to 1.2 (Divisibility Ladder, Same on Both Rulers, Prime
     Landing, Whole Crossing, Treasure). On rational lines spf(m) is defined only for whole m, so the shared reading is a
     thin tie-breaker event.
   - Prime Gradient/c-spf × Whole Intercept/mc-spf is 5.89. Both read spf of c and require whole numbers.
8. **Families near-independent of most others** (share of their cross pairs with |PMI| ≤ 1):
   - Ruler 64% (subject to finding 2);
   - Same on Both Rulers 51%;
   - Sunken Intercept, Crossing Check, Whole Area, Smooth Square, Whole Crossing, Near the Point, Target Gradient and
     Square Area, 36 to 42%.

   **The least independent:** Egyptian Line, Smooth Gradient, Farey Neighbours (5 to 12%, aligned with the "simple
   line" cluster), Steady Gradient (15%) and Treasure (13%, anti-aligned; see finding 2).

## Implications

**Pairs never to seat together** (the strongest aligned blocks; every pair with headline > 2 is refused by the proposed
dealer below):

- any two tie-breakers of one family;
- Prime Landing × Prime Staircase (every tie-breaker pair is 3.6 to 5.9);
- Prime Gradient/cPrime, c-spf or c-gpf × Prime Landing (2.3 to 5.0) and × Prime Staircase (2.4 to 4.0);
- Prime Gradient/c-gpf × Square Area/lpf (6.15);
- Prime Gradient/prime × Whole Crossing/m-spf (6.04);
- among the undealt candidates: Smooth Crossing × Smooth Intercept (8.4); Smooth Square × Square Area (5.2 to 8.1, sharing the primary);
  Smooth Crossing or Smooth Intercept × Smooth Square, Sunken Intercept, Whole Area/gcd-x or Whole Crossing/gcd-c (6 to
  7.7); Smooth Gradient × Steady Gradient/gcd-c, Whole Intercept/gcd-floor-m or Steep and Tall (5.8 to 8.1).

The full list is the "Aligned pairs" table below and `pairPmi(...).class === "aligned"`.

**What the pool needs.** This is for rule design, which is redesigning the pool to decisions 39 and 41.

- **Break the c-is-prime cluster.** Five dealt families read "y(0) near a prime". Decision 41's qualifiers fit exactly:
  give each prime reading its own random filter (a prime ≡ k mod 10, a prime of the form 4n + 1, a twin, a prime in a
  given range), so the shared upper set shrinks to an intersection of qualifiers.
- **Spread readings over different numbers.** §A10 measured rules that each read one coordinate of ax + by + c = 0 and
  one prime's exponent as near-perpendicular (0 to 1.5 bits). Here "same prime, different number" pairs are mostly
  independent and "same number, same reading" pairs are aligned.
- **Retire smoothness and gcd tie-breakers as the adversary mechanism, or qualify them.** Every rule that rewards "simple
  line" (small b, small-prime-rich coefficients) loads on one hidden variable, so the six adversaries pay twice with each
  other and with every gcd tie-breaker. A smooth rule should be smooth over a parameter set of primes, such as
  {3, 7, 11}-smooth, with sets disjoint between dealt rules.
- **Fix Treasure's and Ruler's values on vertical lines** (finding 2) before reading their columns.
- **Target:** at least 50% of random 4-player tables with every pair independent (|PMI| ≤ 1). Today it is 1%.

**Proposed dealer rule** (for the server's deal.ts; `pairPmi` from `@workspace/v2-agents/pure`):

1. Never seat two rules of the same family.
2. **Hard threshold: no seated pair with pairPmi > 2** (class "aligned"). Treat a pair the table does not hold (null) as
   1.5 (mild). Among all tables that satisfy this, deal one **uniformly at random**. Do not optimise toward the
   most-independent table: a fixed best table is a fixed point (the metastable section of CLAUDE.md), and the threshold
   alone keeps the variety.
3. If no table of the requested size satisfies rule 2, deal the table with the smallest maximum pair PMI, never above 4,
   and log it.
4. Anti-aligned pairs are allowed: they are decision 30's tension. Exclusions (pairPmi < −4) are refused at
   two-player tables only, where each player's points are their bits times the other's, so mutually exclusive rules leave
   every object near zero for both.
5. Tighten the threshold from 2 to 1 (class "independent" only) once the redesigned pool lets at least half of random
   4-player tables pass.

Feasibility on today's dealt pool (random tables of distinct families, from the JSON):

| Table size | max PMI ≤ 2 | max PMI ≤ 1 | without Ruler and Treasure: ≤ 2 | ≤ 1 |
|---|---:|---:|---:|---:|
| 2 | 75% | 54% | 62% | 34% |
| 3 | 44% | 14% | 23% | 3% |
| 4 | 20% | 1% | 5% | 0% |

So threshold 2 is workable for 2 to 3 players today. At 4 players it leans heavily on Ruler and Treasure, whose
independence is partly the finding 2 artefact. Threshold 1 needs the redesigned pool.

## Measured: line-q

<!-- pmi:line-q begin (generated by lib/v2-agents/scripts/pmi.ts; do not edit by hand) -->

Measured by `pnpm --filter @workspace/v2-agents pmi -- --variant line-q` (lib/v2-agents/scripts/pmi.ts), 2026-11-15: 101 rules (every committed value function of line-q; 40 dealt in lines-beginner), 5,000,000 draws of the line-q law (tilts 1, 0.75, 0.55, 0.4, 0.3, 1,000,000 each), 809,151 accepted, effective sample size 362,541. Depths 4, 6, 8, 10, 12 bits; a depth is read when the joint upper set holds at least 30 effective draws; a depth not read where independence would put at least 300 effective draws in the joint set is an exclusion, shown "≤ bound" (PMI ≤ log2(30 / expected)). Headline: the mean over the depths read (exclusions as their bound). Cells: PMI per depth.

Pairs of different families: 4795. Independent (|PMI| ≤ 1): **1606**; mild (1 to 2): 937; mild anti (−2 to −1): 329; aligned (> 2): **1009**; anti-aligned (< −2): **554**; unread: 360.
Pairs read at each depth (and exclusions): 4 bits 4256 (179), 6 bits 3241 (35), 8 bits 1052 (40), 10 bits 241 (0), 12 bits 89 (0). A pair unread at a depth is one whose joint upper set is too thin at the sample size; for an independent pair the joint set at t bits has mass 2^(−2t), so depths past about 8 are read only for aligned pairs, and the headline of an aligned pair averages more (and deeper) depths.

### Family matrix (headline PMI, mean over tie-breakers and parameter sets; diagonal: two tie-breakers of one family)

| | CC | DL | EL | ES | EC | FN | LD | MMC | NP | PG | PGr | PL | PS | PSt | PA | R | SOBR | SC | SG | SI | SS | SA | SGr | SAT | SIn | TG | T | TA | WA | WAT | WC | WI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **CC** crossing-check | 7.0 | -0.6 |  | 1.7 | 2.0 | 1.5 | 0.6 | -0.5 | 3.2 | 2.8 | 1.6 | 0.6 | 2.1 | 0.3 | 0.6 | -0.1 | -0.9 | 0.2 | -0.5 | -0.0 | 0.8 | 0.8 | -2.9 | 0.5 | -1.6 | 3.5 | -5.3 | 1.2 | 0.9 | -0.3 | -1.2 | -0.4 |
| **DL** divisibility-ladder | -0.6 | 7.9 |  | -5.2 | 1.7 |  | -5.1 | 0.4 | -1.4 | -0.4 | 2.2 | 0.4 | -4.5 | 1.8 | 1.3 | -1.3 | 0.9 | 4.7 | 5.2 | 4.8 | 3.0 | 2.4 | 3.9 | 3.9 | 5.5 | 0.7 | -1.3 | 1.2 | 3.6 | 4.7 | 1.9 | 2.1 |
| **EL** egyptian-line |  |  |  |  |  |  | 1.9 | 6.0 |  |  |  |  |  |  |  |  |  |  |  |  | 1.5 | 1.8 |  | 3.8 |  |  | -3.5 |  | 2.0 |  | -1.1 |  |
| **ES** euclid-steps | 1.7 | -5.2 |  |  | -0.4 | 0.8 | 2.5 | -1.0 | 0.8 | 2.0 | 1.0 | -0.9 | 2.3 | -2.2 | -0.1 | -2.7 | -1.2 | -2.7 | -4.4 | -3.1 | 1.9 | 2.0 | -4.7 | -1.6 | -2.1 | 2.0 | -3.7 | -0.1 | -0.5 | -1.8 | -1.8 | -2.1 |
| **EC** exact-change | 2.0 | 1.7 |  | -0.4 | 7.1 |  | 0.4 |  | 1.8 | 1.1 | -4.7 | 2.4 | 1.2 | 2.8 | 2.8 | -0.3 | 3.0 | 1.6 | 2.6 | 1.5 | 1.7 | 2.2 | 1.1 | -4.5 | -5.0 | -4.5 | -3.1 | 2.6 | 2.2 | 0.3 | 1.7 | 2.2 |
| **FN** farey-neighbours | 1.5 |  |  | 0.8 |  |  |  |  | 1.5 | 2.7 | 3.4 | 2.9 | 2.4 | 3.9 | 1.8 | 0.8 | -1.6 |  | 0.1 |  |  |  | -0.7 | 3.1 | 0.1 | 2.1 | -1.3 | 2.4 |  | 1.7 |  | 1.7 |
| **LD** long-division | 0.6 | -5.1 | 1.9 | 2.5 | 0.4 |  | 4.1 | 1.4 | 0.3 | 0.5 | 0.1 | -1.1 | 1.6 | -3.0 | 0.7 | -1.3 | -1.2 | -0.6 | -4.4 | -2.3 | 1.1 | 1.1 | -4.7 | 0.5 | -1.6 | 0.4 | -4.1 | 0.7 | 1.0 | -3.5 | -0.5 | -3.3 |
| **MMC** m-meets-c | -0.5 | 0.4 | 6.0 | -1.0 |  |  | 1.4 | 7.2 | 1.5 | 0.2 | 1.8 | 1.3 | 0.8 | 1.0 | 0.4 | 0.5 | -1.6 |  | 2.3 |  | 1.8 | 1.7 | 0.7 | 2.7 | -1.6 | 1.4 | -3.8 | 1.3 | 1.2 | -1.9 | 0.2 | 0.7 |
| **NP** near-point | 3.2 | -1.4 |  | 0.8 | 1.8 | 1.5 | 0.3 | 1.5 | 7.1 | 1.2 | 1.7 | 1.8 | 1.6 | 1.6 | 1.3 | -0.9 | 0.7 | 0.4 | -1.1 | -0.1 | 0.5 | 0.5 | -3.1 | 1.7 | -3.3 | 2.6 | -6.3 | 1.5 | 0.6 | 0.3 | -0.5 | -1.0 |
| **PG** pell-gradient | 2.8 | -0.4 |  | 2.0 | 1.1 | 2.7 | 0.5 | 0.2 | 1.2 | 3.4 | 2.6 | 0.0 | 2.8 | 0.1 | 1.0 | -0.5 | -0.1 | 0.5 | -0.0 | 0.3 | 0.2 | 0.3 | -2.5 | 0.6 | -0.0 | 3.5 | -4.1 | 1.2 | 0.7 | 0.2 | -0.3 | 0.7 |
| **PGr** prime-gradient | 1.6 | 2.2 |  | 1.0 | -4.7 | 3.4 | 0.1 | 1.8 | 1.7 | 2.6 | 5.6 | 2.7 | 2.0 | 2.7 | 2.4 | -0.4 | 0.6 | 2.0 | 1.4 | 2.1 | 2.6 | 2.7 | 0.2 | 3.3 | 1.6 | 3.3 | -1.3 | 2.2 | 1.6 | 0.7 | 1.7 | 2.5 |
| **PL** prime-landing | 0.6 | 0.4 |  | -0.9 | 2.4 | 2.9 | -1.1 | 1.3 | 1.8 | 0.0 | 2.7 | 4.9 | 0.1 | 5.0 | 2.2 | -0.1 | 2.8 | 1.0 | 1.1 | 0.6 | 0.2 | 0.2 | 1.3 | 2.9 | -6.0 | 0.5 | -1.2 | 2.1 | 0.1 | 1.0 | 0.4 | 1.6 |
| **PS** prime-slope | 2.1 | -4.5 |  | 2.3 | 1.2 | 2.4 | 1.6 | 0.8 | 1.6 | 2.8 | 2.0 | 0.1 | 4.8 | -0.3 | 1.3 | -0.5 | 0.1 | -0.2 | -3.7 | -0.2 | -0.4 | -0.8 | -4.0 | 0.9 | 0.1 | 2.9 | -3.9 | 1.4 | 0.0 | -1.4 | 0.5 | 0.5 |
| **PSt** prime-staircase | 0.3 | 1.8 |  | -2.2 | 2.8 | 3.9 | -3.0 | 1.0 | 1.6 | 0.1 | 2.7 | 5.0 | -0.3 | 8.1 | 3.2 | -0.3 | 2.5 | 2.1 | 2.3 | 2.1 | 0.4 | 0.3 | 1.4 | 2.7 | -2.8 | 0.5 | -2.3 | 2.6 | 1.1 | 2.0 | 0.3 | 1.7 |
| **PA** pythagorean-area | 0.6 | 1.3 |  | -0.1 | 2.8 | 1.8 | 0.7 | 0.4 | 1.3 | 1.0 | 2.4 | 2.2 | 1.3 | 3.2 | 6.9 | 0.3 | 1.0 | 1.9 | 2.6 | 1.9 | 1.4 | 1.3 | 1.3 | 2.7 | -0.3 | 1.4 | -2.8 | 4.5 | 1.9 | 0.2 | 1.3 | 1.8 |
| **R** ruler | -0.1 | -1.3 |  | -2.7 | -0.3 | 0.8 | -1.3 | 0.5 | -0.9 | -0.5 | -0.4 | -0.1 | -0.5 | -0.3 | 0.3 | 3.9 | 1.4 | -1.7 | 1.1 | -1.7 | -1.2 | -1.1 | -0.8 | -0.3 | -2.0 | -0.2 | 1.1 | 0.9 | -0.5 | -1.5 | 0.2 | -0.1 |
| **SOBR** same-on-both-rulers | -0.9 | 0.9 |  | -1.2 | 3.0 | -1.6 | -1.2 | -1.6 | 0.7 | -0.1 | 0.6 | 2.8 | 0.1 | 2.5 | 1.0 | 1.4 | 6.4 | 0.9 | 1.1 | 0.9 | 0.2 | 0.5 | -0.8 | 0.3 | -0.7 | 0.4 | -1.0 | 0.6 | 1.0 | -0.1 | 1.1 | 1.3 |
| **SC** smooth-crossing | 0.2 | 4.7 |  | -2.7 | 1.6 |  | -0.6 |  | 0.4 | 0.5 | 2.0 | 1.0 | -0.2 | 2.1 | 1.9 | -1.7 | 0.9 |  | 3.1 | 8.4 | 6.0 | 4.1 | 0.1 | 1.9 | 6.0 | 1.3 | -1.2 | 1.4 | 6.0 | 0.4 | 3.6 | 3.8 |
| **SG** smooth-gradient | -0.5 | 5.2 |  | -4.4 | 2.6 | 0.1 | -4.4 | 2.3 | -1.1 | -0.0 | 1.4 | 1.1 | -3.7 | 2.3 | 2.6 | 1.1 | 1.1 | 3.1 |  | 3.2 | 2.9 | 3.0 | 6.6 | 5.8 | 4.5 | 0.4 | -1.4 | 2.9 | 2.6 | 1.4 | 2.3 | 4.7 |
| **SI** smooth-intercept | -0.0 | 4.8 |  | -3.1 | 1.5 |  | -2.3 |  | -0.1 | 0.3 | 2.1 | 0.6 | -0.2 | 2.1 | 1.9 | -1.7 | 0.9 | 8.4 | 3.2 |  | 6.0 | 4.1 | 0.7 | 1.9 | 6.0 | 1.3 | -1.1 | 1.4 | 6.0 | 0.5 | 2.9 | 3.9 |
| **SS** smooth-square | 0.8 | 3.0 | 1.5 | 1.9 | 1.7 |  | 1.1 | 1.8 | 0.5 | 0.2 | 2.6 | 0.2 | -0.4 | 0.4 | 1.4 | -1.2 | 0.2 | 6.0 | 2.9 | 6.0 |  | 6.6 | 2.0 | 2.1 | 4.2 | 0.9 | -2.5 | 1.2 | 5.5 | 0.2 | 1.6 | 1.8 |
| **SA** square-area | 0.8 | 2.4 | 1.8 | 2.0 | 2.2 |  | 1.1 | 1.7 | 0.5 | 0.3 | 2.7 | 0.2 | -0.8 | 0.3 | 1.3 | -1.1 | 0.5 | 4.1 | 3.0 | 4.1 | 6.6 | 6.3 | 2.1 | 2.4 | 2.9 | 1.0 | -2.5 | 1.2 | 4.7 | -0.2 | 1.3 | 1.5 |
| **SGr** steady-gradient | -2.9 | 3.9 |  | -4.7 | 1.1 | -0.7 | -4.7 | 0.7 | -3.1 | -2.5 | 0.2 | 1.3 | -4.0 | 1.4 | 1.3 | -0.8 | -0.8 | 0.1 | 6.6 | 0.7 | 2.0 | 2.1 | 5.0 | 4.7 | 2.8 | -2.3 | -2.6 | 1.4 | 1.2 | 0.7 | 0.3 | 3.4 |
| **SAT** steep-and-tall | 0.5 | 3.9 | 3.8 | -1.6 | -4.5 | 3.1 | 0.5 | 2.7 | 1.7 | 0.6 | 3.3 | 2.9 | 0.9 | 2.7 | 2.7 | -0.3 | 0.3 | 1.9 | 5.8 | 1.9 | 2.1 | 2.4 | 4.7 |  | -5.6 | 2.2 | -0.9 | 2.7 | 1.3 | 0.5 | 1.2 | 3.3 |
| **SIn** sunken-intercept | -1.6 | 5.5 |  | -2.1 | -5.0 | 0.1 | -1.6 | -1.6 | -3.3 | -0.0 | 1.6 | -6.0 | 0.1 | -2.8 | -0.3 | -2.0 | -0.7 | 6.0 | 4.5 | 6.0 | 4.2 | 2.9 | 2.8 | -5.6 |  | 0.4 | -4.5 | -0.5 | 4.2 | 4.0 | 3.0 | 3.8 |
| **TG** target-gradient | 3.5 | 0.7 |  | 2.0 | -4.5 | 2.1 | 0.4 | 1.4 | 2.6 | 3.5 | 3.3 | 0.5 | 2.9 | 0.5 | 1.4 | -0.2 | 0.4 | 1.3 | 0.4 | 1.3 | 0.9 | 1.0 | -2.3 | 2.2 | 0.4 | 7.1 | -3.4 | 1.4 | 1.0 | 0.3 | -0.1 | 0.8 |
| **T** treasure | -5.3 | -1.3 | -3.5 | -3.7 | -3.1 | -1.3 | -4.1 | -3.8 | -6.3 | -4.1 | -1.3 | -1.2 | -3.9 | -2.3 | -2.8 | 1.1 | -1.0 | -1.2 | -1.4 | -1.1 | -2.5 | -2.5 | -2.6 | -0.9 | -4.5 | -3.4 | 3.9 | -2.7 | -2.7 | -1.2 | -1.2 | -1.7 |
| **TA** triangle-area | 1.2 | 1.2 |  | -0.1 | 2.6 | 2.4 | 0.7 | 1.3 | 1.5 | 1.2 | 2.2 | 2.1 | 1.4 | 2.6 | 4.5 | 0.9 | 0.6 | 1.4 | 2.9 | 1.4 | 1.2 | 1.2 | 1.4 | 2.7 | -0.5 | 1.4 | -2.7 | 6.0 | 1.7 | 0.3 | 1.2 | 1.8 |
| **WA** whole-area | 0.9 | 3.6 | 2.0 | -0.5 | 2.2 |  | 1.0 | 1.2 | 0.6 | 0.7 | 1.6 | 0.1 | 0.0 | 1.1 | 1.9 | -0.5 | 1.0 | 6.0 | 2.6 | 6.0 | 5.5 | 4.7 | 1.2 | 1.3 | 4.2 | 1.0 | -2.7 | 1.7 | 6.3 | 1.1 | 2.6 | 1.9 |
| **WAT** whole-at-t | -0.3 | 4.7 |  | -1.8 | 0.3 | 1.7 | -3.5 | -1.9 | 0.3 | 0.2 | 0.7 | 1.0 | -1.4 | 2.0 | 0.2 | -1.5 | -0.1 | 0.4 | 1.4 | 0.5 | 0.2 | -0.2 | 0.7 | 0.5 | 4.0 | 0.3 | -1.2 | 0.3 | 1.1 | 0.7 | -0.3 | 1.6 |
| **WC** whole-crossing | -1.2 | 1.9 | -1.1 | -1.8 | 1.7 |  | -0.5 | 0.2 | -0.5 | -0.3 | 1.7 | 0.4 | 0.5 | 0.3 | 1.3 | 0.2 | 1.1 | 3.6 | 2.3 | 2.9 | 1.6 | 1.3 | 0.3 | 1.2 | 3.0 | -0.1 | -1.2 | 1.2 | 2.6 | -0.3 | 2.3 | 2.4 |
| **WI** whole-intercept | -0.4 | 2.1 |  | -2.1 | 2.2 | 1.7 | -3.3 | 0.7 | -1.0 | 0.7 | 2.5 | 1.6 | 0.5 | 1.7 | 1.8 | -0.1 | 1.3 | 3.8 | 4.7 | 3.9 | 1.8 | 1.5 | 3.4 | 3.3 | 3.8 | 0.8 | -1.7 | 1.8 | 1.9 | 1.6 | 2.4 | 3.0 |

### Families by independence (pairs with other families)

| Family | dealt | rules | pairs read | independent | mild ± | aligned | anti-aligned | mean PMI | mean |PMI| |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ruler | 3/3 | 3 | 288 | 183 (64%) | 84 | 6 | 15 | -0.25 | 0.85 |
| same-on-both-rulers | 6/6 | 6 | 552 | 283 (51%) | 180 | 78 | 11 | 0.51 | 1.07 |
| prime-landing | 5/5 | 5 | 465 | 234 (50%) | 96 | 120 | 15 | 0.91 | 1.43 |
| pell-gradient | no | 18 | 1431 | 696 (49%) | 330 | 250 | 155 | 0.35 | 1.48 |
| m-meets-c | no | 2 | 168 | 79 (47%) | 52 | 19 | 18 | 0.38 | 1.39 |
| long-division | no | 3 | 282 | 122 (43%) | 91 | 6 | 63 | -0.79 | 1.65 |
| sunken-intercept | no | 1 | 95 | 40 (42%) | 12 | 23 | 20 | 0.05 | 2.44 |
| crossing-check | no | 2 | 192 | 77 (40%) | 53 | 43 | 19 | 0.52 | 1.75 |
| prime-staircase | 4/4 | 4 | 373 | 141 (38%) | 73 | 121 | 38 | 1.04 | 1.84 |
| whole-area | no | 2 | 192 | 72 (38%) | 58 | 50 | 12 | 1.30 | 1.78 |
| smooth-square | no | 1 | 97 | 36 (37%) | 28 | 26 | 7 | 1.15 | 1.77 |
| whole-crossing | 3/5 | 5 | 445 | 165 (37%) | 137 | 105 | 38 | 0.62 | 1.71 |
| near-point | no | 2 | 194 | 71 (37%) | 79 | 26 | 18 | 0.35 | 1.60 |
| prime-slope | no | 3 | 282 | 103 (37%) | 53 | 87 | 39 | 0.47 | 1.80 |
| target-gradient | no | 2 | 192 | 70 (36%) | 31 | 71 | 20 | 1.08 | 1.97 |
| square-area | 3/3 | 3 | 285 | 102 (36%) | 93 | 69 | 21 | 0.97 | 1.60 |
| smooth-intercept | no | 1 | 94 | 33 (35%) | 31 | 26 | 4 | 1.38 | 1.98 |
| smooth-crossing | no | 1 | 94 | 31 (33%) | 34 | 27 | 2 | 1.54 | 1.99 |
| whole-at-t | no | 2 | 178 | 57 (32%) | 56 | 44 | 21 | 0.18 | 1.92 |
| steep-and-tall | no | 1 | 99 | 31 (31%) | 24 | 40 | 4 | 1.39 | 2.02 |
| divisibility-ladder | 4/4 | 4 | 360 | 104 (29%) | 123 | 84 | 49 | 0.56 | 2.22 |
| euclid-steps | no | 1 | 97 | 26 (27%) | 33 | 12 | 26 | -0.45 | 2.02 |
| whole-intercept | no | 5 | 425 | 113 (27%) | 107 | 155 | 50 | 1.12 | 2.17 |
| pythagorean-area | 3/3 | 3 | 288 | 73 (25%) | 125 | 75 | 15 | 1.27 | 1.61 |
| triangle-area | no | 2 | 194 | 40 (21%) | 94 | 50 | 10 | 1.30 | 1.64 |
| exact-change | no | 3 | 273 | 56 (21%) | 78 | 103 | 36 | 0.93 | 2.06 |
| prime-gradient | 4/4 | 4 | 374 | 70 (19%) | 121 | 172 | 11 | 1.61 | 2.09 |
| steady-gradient | no | 3 | 186 | 27 (15%) | 56 | 38 | 65 | -0.34 | 2.71 |
| treasure | 5/5 | 5 | 470 | 59 (13%) | 123 | 0 | 288 | -2.57 | 2.64 |
| farey-neighbours | no | 2 | 92 | 11 (12%) | 31 | 50 | 0 | 1.75 | 2.13 |
| smooth-gradient | no | 1 | 94 | 6 (6%) | 38 | 38 | 12 | 1.25 | 2.55 |
| egyptian-line | no | 1 | 19 | 1 (5%) | 8 | 4 | 6 | 0.65 | 2.76 |

### Calibration of the value functions against these draws

A value function made from the line-q law has −log2 π(A ≥ t) ≥ t (bits are survival). These rules fall more than 1 bit short at some depth: their committed values overstate rarity under the current law, so their upper sets (and PMIs) are not at the nominal depths; regenerate their values. ruler/far (-7.1 bits; at 4/6/8/10/12: 2.6/3.5/3.7/3.8/4.9); ruler/prime-gradient (-6.2 bits; at 4/6/8/10/12: 2.6/3.5/3.7/3.8/12.0); ruler/square-area (-6.2 bits; at 4/6/8/10/12: 2.6/3.4/3.7/3.8/12.3); treasure/m-spf (-5.7 bits; at 4/6/8/10/12: 1.7/2.0/2.3/6.2/7.6); treasure/square-start (-5.7 bits; at 4/6/8/10/12: 1.7/2.0/2.3/6.2/7.4); treasure/m-gpf (-5.7 bits; at 4/6/8/10/12: 1.7/2.0/2.3/6.2/7.6); treasure/prime-terms (-5.7 bits; at 4/6/8/10/12: 1.7/2.0/2.3/6.2/7.4); treasure/prime-gradient (-5.7 bits; at 4/6/8/10/12: 1.7/2.0/2.3/6.2/7.6).

### The 367 rules (Square Area/spf, Whole Crossing/k-spf, Prime Landing/big-prime)

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| square-area/spf | whole-crossing/k-spf | both | **0.04** | -0.7 | 0.8 |  |  |  | 1132 |
| prime-landing/big-prime | square-area/spf | both | **1.08** | -1.0 | 0.9 | 3.3 |  |  | 1787 |
| prime-landing/big-prime | whole-crossing/k-spf | both | **2.43** | 1.5 | 1.6 | 4.3 |  |  | 4066 |

### The six adversaries against each other (rule design measured 6–8.5 bits at depth 8 for several of these pairs, line-rules-v3-proposals.md §A10)

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | smooth-gradient/shared | neither | **3.13** | 2.9 | 3.2 | 3.2 |  |  | 4429 |
| smooth-crossing/shared | smooth-intercept/shared | neither | **8.39** | 4.7 | 6.5 | 8.3 | 10.2 | 12.2 | 14652 |
| smooth-crossing/shared | smooth-square/shared | neither | **6.04** | 1.8 | 4.0 | 6.3 | 7.9 | 10.1 | 3725 |
| smooth-crossing/shared | steep-and-tall/shared | neither | **1.87** | 2.0 | 2.1 | 1.5 |  |  | 4530 |
| smooth-crossing/shared | sunken-intercept/shared | neither | **5.97** | 2.5 | 4.2 | 5.9 | 7.7 | 9.5 | 7072 |
| smooth-gradient/shared | smooth-intercept/shared | neither | **3.24** | 3.2 | 3.2 | 3.2 |  |  | 5852 |
| smooth-gradient/shared | smooth-square/shared | neither | **2.89** | 1.8 | 2.9 | 4.0 |  |  | 3398 |
| smooth-gradient/shared | steep-and-tall/shared | neither | **5.77** | 2.0 | 4.1 | 6.0 | 7.5 | 9.2 | 4940 |
| smooth-gradient/shared | sunken-intercept/shared | neither | **4.50** | 2.6 | 3.5 | 4.4 | 5.6 | 6.4 | 8011 |
| smooth-intercept/shared | smooth-square/shared | neither | **6.04** | 1.8 | 4.0 | 6.3 | 7.9 | 10.1 | 3734 |
| smooth-intercept/shared | steep-and-tall/shared | neither | **1.87** | 2.0 | 2.1 | 1.5 |  |  | 4531 |
| smooth-intercept/shared | sunken-intercept/shared | neither | **5.99** | 2.7 | 4.2 | 5.9 | 7.7 | 9.5 | 7885 |
| smooth-square/shared | steep-and-tall/shared | neither | **2.06** | 1.9 | 2.7 | 1.6 |  |  | 11621 |
| smooth-square/shared | sunken-intercept/shared | neither | **4.25** | -0.1 | 2.2 | 4.5 | 6.3 | 8.3 | 2234 |
| steep-and-tall/shared | sunken-intercept/shared | neither | **-5.56** | ≤-5.6 |  |  |  |  | 0 |

### The six adversaries against the 367 rules

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | square-area/spf | one | **2.60** | 1.7 | 3.9 | 2.2 |  |  | 3725 |
| smooth-crossing/shared | whole-crossing/k-spf | one | **0.83** | 2.5 | -0.8 |  |  |  | 4198 |
| prime-landing/big-prime | smooth-crossing/shared | one | **1.21** | 1.2 |  |  |  |  | 3604 |
| smooth-gradient/shared | square-area/spf | one | **2.58** | 1.7 | 2.7 | 3.3 |  |  | 3435 |
| smooth-gradient/shared | whole-crossing/k-spf | one | **1.19** | 1.1 | 1.3 |  |  |  | 1672 |
| prime-landing/big-prime | smooth-gradient/shared | one | **1.26** | 1.3 |  |  |  |  | 3844 |
| smooth-intercept/shared | square-area/spf | one | **2.60** | 1.7 | 3.9 | 2.2 |  |  | 3734 |
| smooth-intercept/shared | whole-crossing/k-spf | one | **0.78** | 2.4 | -0.8 |  |  |  | 3802 |
| prime-landing/big-prime | smooth-intercept/shared | one | **0.88** | 0.9 |  |  |  |  | 2680 |
| smooth-square/shared | square-area/spf | one | **5.17** | 4.0 | 5.9 | 5.6 |  |  | 51387 |
| smooth-square/shared | whole-crossing/k-spf | one | **0.12** | -0.7 | 0.9 |  |  |  | 1109 |
| prime-landing/big-prime | smooth-square/shared | one | **0.02** | -1.0 | 1.0 |  |  |  | 1749 |
| square-area/spf | steep-and-tall/shared | one | **2.33** | 1.9 | 2.6 | 2.5 |  |  | 11860 |
| steep-and-tall/shared | whole-crossing/k-spf | one | **0.61** | 1.1 | 0.1 |  |  |  | 3657 |
| prime-landing/big-prime | steep-and-tall/shared | one | **2.72** | 1.7 | 3.6 | 2.9 |  |  | 11866 |
| square-area/spf | sunken-intercept/shared | one | **1.42** | -0.1 | 2.0 | 2.4 |  |  | 2248 |
| sunken-intercept/shared | whole-crossing/k-spf | one | **0.77** | 1.0 | 0.6 |  |  |  | 3316 |
| prime-landing/big-prime | sunken-intercept/shared | one | **-6.02** | ≤-6.0 |  |  |  |  | 0 |

### Pairs that read the same prime of the same number

Each rule's prime readings (hand-listed in scripts/pmi.ts READS: the number read, and which prime of it). Pairs of different families sharing a reading:

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| prime-gradient/c-spf | whole-intercept/mc-spf | one | **5.89** | 2.3 | 5.3 | 7.2 | 8.8 |  | 800 |
| prime-landing/big-prime | prime-staircase/first-prime | both | **5.85** | 3.5 | 6.2 | 7.0 | 6.7 |  | 8419 |
| prime-landing/m-spf | whole-intercept/mc-spf | one | **5.74** | 1.7 | 5.2 | 7.3 | 8.8 |  | 727 |
| prime-landing/prime-gradient | prime-staircase/first-prime | both | **5.25** | 3.5 | 5.6 | 6.6 |  |  | 8419 |
| prime-landing/m-spf | prime-staircase/first-prime | both | **5.09** | 3.6 | 5.5 | 6.2 |  |  | 8419 |
| prime-gradient/cPrime | prime-landing/prime-gradient | both | **5.01** | 1.3 | 5.3 | 8.5 |  |  | 7375 |
| prime-landing/m-gpf | prime-staircase/first-prime | both | **4.95** | 3.5 | 5.5 | 5.8 |  |  | 8419 |
| prime-landing/next-prime | prime-staircase/first-prime | both | **4.54** | 3.6 | 5.5 |  |  |  | 8419 |
| prime-gradient/cPrime | prime-landing/m-spf | both | **4.33** | 0.9 | 4.9 | 7.2 |  |  | 5645 |
| prime-gradient/c-spf | prime-landing/prime-gradient | both | **4.28** | 0.9 | 4.9 | 7.1 |  |  | 5659 |
| whole-crossing/m-spf | whole-intercept/mc-spf | one | **3.98** | 3.9 | 3.2 | 4.8 |  |  | 877 |
| prime-gradient/cPrime | prime-staircase/first-prime | both | **3.93** | 1.7 | 3.6 | 6.5 |  |  | 2171 |
| prime-gradient/cPrime | prime-landing/m-gpf | both | **3.93** | 0.8 | 4.9 | 6.1 |  |  | 5445 |
| prime-gradient/c-gpf | prime-landing/prime-gradient | both | **3.86** | 0.8 | 4.9 | 5.9 |  |  | 5463 |
| prime-gradient/c-spf | whole-intercept/spf | one | **3.66** | 1.1 | 2.9 | 4.5 | 6.2 |  | 3315 |
| prime-staircase/first-prime | pythagorean-area/prime-height | both | **3.15** | 2.3 | 2.8 | 4.3 |  |  | 3054 |
| divisibility-ladder/m-prime | prime-gradient/c-gpf | both | **3.10** | 0.7 | 3.8 | 4.8 |  |  | 3529 |
| prime-landing/next-prime | same-on-both-rulers/prime-start | both | **3.06** | 3.0 | 3.1 |  |  |  | 21706 |
| prime-staircase/first-prime | same-on-both-rulers/prime-start | both | **3.02** | 2.7 | 3.3 |  |  |  | 4225 |
| prime-landing/prime-gradient | pythagorean-area/prime-height | both | **2.97** | 1.7 | 3.4 | 3.8 |  |  | 9211 |
| prime-gradient/prime | prime-landing/prime-gradient | both | **2.97** | 0.8 | 3.2 | 4.9 |  |  | 5533 |
| prime-landing/m-spf | same-on-both-rulers/prime-start | both | **2.97** | 3.0 |  |  |  |  | 21820 |
| prime-landing/m-gpf | same-on-both-rulers/prime-start | both | **2.96** | 3.0 |  |  |  |  | 21810 |
| prime-landing/m-spf | same-on-both-rulers/m-spf | both | **2.95** | 3.0 |  |  |  |  | 21352 |
| prime-landing/m-gpf | same-on-both-rulers/m-gpf | both | **2.94** | 2.9 |  |  |  |  | 21330 |
| prime-gradient/cPrime | prime-landing/big-prime | both | **2.88** | 0.8 | 3.2 | 4.7 |  |  | 5598 |
| prime-landing/big-prime | same-on-both-rulers/prime-start | both | **2.82** | 2.9 | 3.4 | 2.1 |  |  | 21836 |
| prime-gradient/cPrime | pythagorean-area/prime-height | both | **2.54** | 1.4 | 2.5 | 3.7 |  |  | 5511 |
| prime-landing/big-prime | pythagorean-area/prime-height | both | **2.46** | 1.6 | 2.9 | 2.9 |  |  | 8771 |
| prime-landing/prime-gradient | same-on-both-rulers/prime-start | both | **2.35** | 2.9 | 1.8 |  |  |  | 21706 |
| divisibility-ladder/m-prime | prime-gradient/prime | both | **2.19** | 0.6 | 2.3 | 3.8 |  |  | 3116 |
| divisibility-ladder/m-prime | prime-gradient/c-spf | both | **2.11** | 0.4 | 3.8 |  |  |  | 2494 |
| prime-landing/next-prime | pythagorean-area/prime-height | both | **1.93** | 1.7 | 2.2 |  |  |  | 8749 |
| divisibility-ladder/m-prime | prime-gradient/cPrime | both | **1.88** | 0.7 | 3.1 |  |  |  | 2993 |
| prime-landing/m-gpf | pythagorean-area/prime-height | both | **1.88** | 1.7 | 2.1 |  |  |  | 9259 |
| prime-landing/m-spf | pythagorean-area/prime-height | both | **1.88** | 1.7 | 2.1 |  |  |  | 9051 |
| prime-gradient/cPrime | prime-landing/next-prime | both | **1.69** | 0.8 | 2.6 |  |  |  | 5278 |
| same-on-both-rulers/m-spf | whole-intercept/mc-spf | one | **1.23** | 1.2 | 1.2 |  |  |  | 585 |
| divisibility-ladder/m-spf | same-on-both-rulers/m-spf | both | **1.21** | 0.8 | 0.9 | 1.9 |  |  | 3206 |
| pythagorean-area/prime-height | same-on-both-rulers/prime-start | both | **1.11** | 1.3 | 0.9 |  |  |  | 6978 |
| ruler/prime-gradient | treasure/prime-gradient | both | **1.07** | 0.9 | 1.1 | 0.2 | 2.1 |  | 28944 |
| divisibility-ladder/m-gpf | same-on-both-rulers/m-gpf | both | **0.83** | 0.8 | 0.8 | 0.9 |  |  | 3206 |
| divisibility-ladder/m-prime | prime-landing/prime-gradient | both | **0.62** | 0.6 |  |  |  |  | 2773 |
| divisibility-ladder/m-spf | whole-crossing/m-spf | both | **0.49** | 0.7 | 0.3 |  |  |  | 1088 |
| divisibility-ladder/m-gpf | prime-landing/m-gpf | both | **0.35** | 0.4 |  |  |  |  | 2725 |
| divisibility-ladder/m-spf | prime-landing/m-spf | both | **0.21** | 0.2 |  |  |  |  | 2184 |
| prime-landing/prime-gradient | ruler/prime-gradient | both | **0.06** | 0.9 | 0.5 | -1.3 |  |  | 10941 |
| prime-gradient/cPrime | same-on-both-rulers/prime-start | both | **-0.02** | -0.0 |  |  |  |  | 3163 |
| prime-gradient/c-spf | ruler/prime-gradient | both | **-0.25** | -0.0 | 0.7 | -1.5 |  |  | 5244 |
| prime-gradient/c-gpf | ruler/prime-gradient | both | **-0.28** | -0.0 | 0.7 | -1.5 |  |  | 5313 |
| prime-gradient/cPrime | ruler/prime-gradient | both | **-0.35** | 0.0 | 0.1 | -1.2 |  |  | 5497 |
| prime-gradient/prime | ruler/prime-gradient | both | **-0.67** | -0.1 | -1.2 |  |  |  | 4972 |
| prime-landing/prime-gradient | treasure/prime-gradient | both | **-0.71** | 0.4 | -1.8 |  |  |  | 14176 |
| prime-landing/m-spf | treasure/m-spf | both | **-0.77** | 0.4 | -1.9 |  |  |  | 13585 |
| prime-landing/m-gpf | treasure/m-gpf | both | **-0.78** | 0.3 | -1.9 |  |  |  | 13253 |
| prime-landing/m-spf | whole-crossing/m-spf | both | **-0.88** | -2.1 | 0.4 |  |  |  | 212 |
| prime-gradient/cPrime | treasure/prime-gradient | both | **-0.91** | -0.0 | -1.8 |  |  |  | 10198 |
| same-on-both-rulers/m-spf | treasure/m-spf | both | **-0.98** | 0.4 | 0.5 | ≤-3.8 |  |  | 12324 |
| same-on-both-rulers/m-gpf | treasure/m-gpf | both | **-1.00** | 0.3 | 0.5 | ≤-3.8 |  |  | 12057 |
| treasure/m-spf | whole-intercept/mc-spf | one | **-1.00** | -0.2 | -1.8 |  |  |  | 804 |
| prime-gradient/c-spf | treasure/prime-gradient | both | **-1.00** | -0.1 | -1.9 |  |  |  | 9550 |
| same-on-both-rulers/m-spf | whole-crossing/m-spf | both | **-1.06** | -1.1 |  |  |  |  | 473 |
| divisibility-ladder/m-gpf | treasure/m-gpf | both | **-1.30** | -0.5 | -2.1 |  |  |  | 4505 |
| divisibility-ladder/m-spf | treasure/m-spf | both | **-1.31** | -0.5 | -2.1 |  |  |  | 4505 |
| divisibility-ladder/m-prime | treasure/prime-gradient | both | **-1.33** | -0.6 | -2.1 |  |  |  | 5454 |
| prime-gradient/c-gpf | treasure/prime-gradient | both | **-1.53** | -0.1 | -1.9 | -2.6 |  |  | 9581 |
| prime-gradient/prime | treasure/prime-gradient | both | **-1.64** | -0.2 | -2.6 | -2.1 |  |  | 9114 |
| divisibility-ladder/m-prime | ruler/prime-gradient | both | **-1.80** | -0.8 | -1.2 | -3.4 |  |  | 3164 |
| treasure/m-spf | whole-crossing/m-spf | both | **-1.91** | -0.3 | -3.5 |  |  |  | 1926 |
| divisibility-ladder/m-spf | whole-intercept/mc-spf | one |  |  |  |  |  |  | 0 |

### Aligned pairs (headline > 2), different families

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | smooth-intercept/shared | neither | **8.39** | 4.7 | 6.5 | 8.3 | 10.2 | 12.2 | 14652 |
| steady-gradient/gcd-c | whole-intercept/gcd-floor-m | neither | **8.24** | 4.9 | 6.5 | 8.0 | 10.0 | 11.9 | 18004 |
| smooth-gradient/shared | steady-gradient/gcd-c | neither | **8.11** | 5.0 | 6.6 | 8.0 | 9.4 | 11.5 | 19497 |
| smooth-square/shared | square-area/omega | one | **8.10** | 4.0 | 6.0 | 8.3 | 10.1 | 12.1 | 51387 |
| smooth-gradient/shared | whole-intercept/gcd-floor-m | neither | **8.07** | 4.9 | 6.5 | 8.0 | 9.6 | 11.4 | 16884 |
| smooth-crossing/shared | whole-crossing/gcd-c | neither | **7.70** | 4.8 | 5.9 | 7.5 | 9.2 | 11.0 | 17989 |
| smooth-intercept/shared | whole-crossing/gcd-c | neither | **7.66** | 4.6 | 5.9 | 7.5 | 9.2 | 11.0 | 14668 |
| whole-area/gcd-x | whole-crossing/gcd-c | neither | **7.54** | 3.5 | 5.8 | 7.6 | 9.5 | 11.4 | 13258 |
| smooth-crossing/shared | whole-area/gcd-x | neither | **7.36** | 3.5 | 5.8 | 7.5 | 9.1 | 11.0 | 12351 |
| smooth-intercept/shared | whole-area/gcd-x | neither | **7.36** | 3.5 | 5.8 | 7.5 | 9.1 | 11.0 | 12377 |
| prime-landing/big-prime | whole-intercept/spf | one | **7.23** | 1.7 | 5.1 | 7.6 | 9.3 | 12.4 | 4963 |
| smooth-intercept/shared | whole-intercept/omega | neither | **6.77** | 3.4 | 4.8 | 6.6 | 8.5 | 10.5 | 12444 |
| whole-at-t/gcd-c | whole-intercept/omega | neither | **6.72** | 3.2 | 4.9 | 6.6 | 8.5 | 10.4 | 13522 |
| smooth-crossing/shared | whole-intercept/omega | neither | **6.71** | 3.1 | 4.8 | 6.6 | 8.5 | 10.5 | 9361 |
| sunken-intercept/shared | whole-at-t/gcd-c | neither | **6.65** | 2.7 | 4.5 | 6.6 | 8.6 | 10.8 | 10422 |
| sunken-intercept/shared | whole-intercept/omega | neither | **6.61** | 3.0 | 4.8 | 6.6 | 8.4 | 10.2 | 13703 |
| whole-area/gcd-den-m | whole-intercept/gcd-den-m | neither | **6.54** | 3.0 | 5.8 | 7.4 | 7.7 | 8.8 | 3574 |
| square-area/omega | whole-area/gcd-x | one | **6.49** | 3.4 | 4.2 | 6.4 | 8.0 | 10.5 | 38739 |
| smooth-square/shared | whole-area/gcd-x | neither | **6.44** | 3.5 | 4.3 | 6.5 | 8.1 | 9.9 | 38739 |
| smooth-square/shared | square-area/lpf | one | **6.42** | 4.0 | 6.0 | 7.2 | 7.5 | 7.4 | 51387 |
| whole-crossing/gcd-c | whole-intercept/omega | neither | **6.40** | 3.1 | 4.5 | 6.3 | 8.1 | 10.0 | 10285 |
| egyptian-line/bottom | m-meets-c/meetPrime | neither | **6.30** | 6.6 | 6.6 | 5.6 |  |  | 769 |
| sunken-intercept/shared | whole-crossing/gcd-c | neither | **6.19** | 2.6 | 4.0 | 6.0 | 8.2 | 10.2 | 7893 |
| whole-area/gcd-x | whole-intercept/omega | neither | **6.16** | 2.2 | 4.4 | 6.2 | 8.0 | 9.9 | 10438 |
| prime-gradient/c-gpf | square-area/lpf | both | **6.15** | 1.2 | 4.2 | 6.1 | 8.9 | 10.3 | 6734 |
| smooth-crossing/shared | square-area/omega | one | **6.15** | 1.7 | 3.9 | 6.2 | 7.8 | 11.0 | 3725 |
| smooth-intercept/shared | square-area/omega | one | **6.15** | 1.7 | 3.9 | 6.2 | 7.8 | 11.0 | 3734 |
| divisibility-ladder/steep | smooth-gradient/shared | one | **6.07** | 3.8 | 4.8 | 6.6 | 7.0 | 8.2 | 13174 |
| prime-gradient/prime | whole-crossing/m-spf | both | **6.04** | 2.3 | 5.0 | 7.5 | 9.4 |  | 2261 |
| smooth-crossing/shared | smooth-square/shared | neither | **6.04** | 1.8 | 4.0 | 6.3 | 7.9 | 10.1 | 3725 |
| smooth-intercept/shared | smooth-square/shared | neither | **6.04** | 1.8 | 4.0 | 6.3 | 7.9 | 10.1 | 3734 |
| divisibility-ladder/steep | whole-intercept/gcd-floor-m | one | **6.04** | 3.8 | 4.5 | 6.1 | 7.3 | 8.5 | 14025 |
| divisibility-ladder/steep | steady-gradient/gcd-c | one | **6.02** | 3.8 | 4.5 | 6.1 | 7.1 | 8.6 | 14025 |
| square-area/omega | whole-crossing/gcd-c | one | **6.00** | 1.7 | 3.9 | 6.2 | 7.8 | 10.4 | 4018 |
| smooth-intercept/shared | sunken-intercept/shared | neither | **5.99** | 2.7 | 4.2 | 5.9 | 7.7 | 9.5 | 7885 |
| smooth-crossing/shared | sunken-intercept/shared | neither | **5.97** | 2.5 | 4.2 | 5.9 | 7.7 | 9.5 | 7072 |
| smooth-square/shared | whole-crossing/gcd-c | neither | **5.95** | 1.8 | 4.0 | 6.3 | 7.9 | 9.8 | 4018 |
| prime-gradient/c-spf | whole-intercept/mc-spf | one | **5.89** | 2.3 | 5.3 | 7.2 | 8.8 |  | 800 |
| whole-area/gcd-x | whole-intercept/gcd-den-m | neither | **5.88** | 3.0 | 4.7 | 6.3 | 7.0 | 8.4 | 3574 |
| crossing-check/whole | pell-gradient{"D":2,"k":0}/difference | neither | **5.87** | 4.7 | 5.4 | 7.4 | 5.9 |  | 7885 |
| prime-landing/big-prime | prime-staircase/first-prime | both | **5.85** | 3.5 | 6.2 | 7.0 | 6.7 |  | 8419 |
| steep-and-tall/shared | whole-intercept/gcd-floor-m | neither | **5.85** | 1.9 | 4.1 | 6.1 | 7.8 | 9.3 | 5142 |
| steady-gradient/gcd-c | steep-and-tall/shared | neither | **5.83** | 2.0 | 4.1 | 6.1 | 7.6 | 9.4 | 5274 |
| prime-landing/big-prime | prime-staircase/last-prime | both | **5.81** | 3.5 | 6.2 | 7.0 | 6.6 |  | 8419 |
| divisibility-ladder/m-gpf | whole-intercept/gcd-floor-m | one | **5.80** | 4.0 | 4.3 | 5.4 | 7.6 | 7.7 | 14025 |
| divisibility-ladder/m-gpf | steady-gradient/gcd-c | one | **5.80** | 4.0 | 4.3 | 5.4 | 7.4 | 7.9 | 14025 |
| sunken-intercept/shared | whole-area/gcd-x | neither | **5.80** | 1.4 | 3.8 | 5.8 | 7.9 | 10.0 | 6670 |
| smooth-gradient/shared | steep-and-tall/shared | neither | **5.77** | 2.0 | 4.1 | 6.0 | 7.5 | 9.2 | 4940 |
| prime-landing/m-spf | whole-intercept/mc-spf | one | **5.74** | 1.7 | 5.2 | 7.3 | 8.8 |  | 727 |
| smooth-gradient/shared | whole-crossing/gcd-num-m | neither | **5.73** | 4.0 | 4.3 | 6.0 | 6.4 | 8.0 | 2919 |
| egyptian-line/bottom | m-meets-c/size | neither | **5.64** | 5.6 | 5.6 |  |  |  | 769 |
| divisibility-ladder/m-spf | whole-intercept/omega | one | **5.63** | 3.6 | 4.9 | 5.9 | 6.8 | 7.0 | 15061 |
| steady-gradient/gcd-c | whole-crossing/gcd-num-m | neither | **5.63** | 3.9 | 4.0 | 5.6 | 6.5 | 8.1 | 2923 |
| whole-crossing/gcd-num-m | whole-intercept/gcd-floor-m | neither | **5.60** | 4.0 | 4.0 | 5.6 | 6.3 | 8.1 | 3068 |
| divisibility-ladder/m-prime | whole-crossing/gcd-c | one | **5.56** | 2.4 | 4.0 | 5.6 | 7.4 | 8.4 | 5881 |
| crossing-check/size | pell-gradient{"D":2,"k":0}/difference | neither | **5.55** | 3.8 | 5.4 | 7.5 |  |  | 7913 |
| crossing-check/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **5.55** | 3.4 | 5.4 | 7.4 | 5.9 |  | 8138 |
| divisibility-ladder/m-gpf | sunken-intercept/shared | one | **5.54** | 2.8 | 4.0 | 5.5 | 6.9 | 8.5 | 9627 |
| square-area/lpf | whole-area/gcd-x | one | **5.53** | 3.4 | 4.2 | 5.9 | 7.0 | 7.1 | 38739 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/difference | neither | **5.52** | 2.4 | 3.7 | 4.7 | 7.1 | 9.6 | 10510 |
| crossing-check/size | pell-gradient{"D":2,"k":0}/share-den | neither | **5.52** | 3.7 | 5.4 | 7.5 |  |  | 15008 |
| divisibility-ladder/steep | whole-intercept/omega | one | **5.52** | 3.5 | 4.9 | 5.8 | 6.5 | 6.8 | 15988 |
| divisibility-ladder/m-spf | sunken-intercept/shared | one | **5.49** | 2.8 | 4.1 | 5.5 | 7.2 | 8.0 | 9627 |
| prime-gradient/c-gpf | whole-intercept/mc-spf | one | **5.49** | 2.3 | 5.3 | 7.1 | 7.3 |  | 800 |
| divisibility-ladder/m-prime | sunken-intercept/shared | one | **5.47** | 2.5 | 4.0 | 5.7 | 7.0 | 8.2 | 9861 |
| prime-staircase/first-prime | whole-intercept/spf | one | **5.47** | 3.6 | 5.0 | 7.3 | 6.0 |  | 4963 |
| prime-landing/m-gpf | prime-staircase/last-prime | both | **5.47** | 3.5 | 5.5 | 5.8 | 7.0 |  | 8419 |
| prime-staircase/last-prime | whole-intercept/spf | one | **5.42** | 3.6 | 5.0 | 7.3 | 5.8 |  | 4963 |
| divisibility-ladder/m-spf | whole-crossing/gcd-c | one | **5.41** | 2.7 | 3.9 | 5.2 | 7.0 | 8.2 | 5639 |
| divisibility-ladder/steep | sunken-intercept/shared | one | **5.36** | 2.7 | 4.0 | 5.4 | 6.7 | 7.9 | 10236 |
| divisibility-ladder/m-gpf | smooth-gradient/shared | one | **5.36** | 4.0 | 4.5 | 5.7 | 7.2 |  | 13174 |
| divisibility-ladder/m-gpf | whole-crossing/gcd-c | one | **5.36** | 2.7 | 3.8 | 4.9 | 6.5 | 8.8 | 5639 |
| pell-gradient{"D":3,"k":0}/difference | target-gradient/same-den | neither | **5.33** | 3.0 | 5.8 | 7.2 |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/share-den | target-gradient/same-den | neither | **5.33** | 3.0 | 5.8 | 7.2 |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/pell-c | target-gradient/same-den | neither | **5.33** | 3.0 | 5.8 | 7.2 |  |  | 11277 |
| divisibility-ladder/steep | whole-crossing/gcd-c | one | **5.29** | 3.1 | 3.8 | 4.9 | 6.6 | 8.0 | 7531 |
| prime-landing/prime-gradient | prime-staircase/first-prime | both | **5.25** | 3.5 | 5.6 | 6.6 |  |  | 8419 |
| prime-landing/prime-gradient | prime-staircase/last-prime | both | **5.25** | 3.5 | 5.6 | 6.6 |  |  | 8419 |
| divisibility-ladder/m-gpf | whole-intercept/omega | one | **5.24** | 3.6 | 4.9 | 5.9 | 6.6 |  | 15061 |
| crossing-check/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **5.23** | 3.4 | 5.4 | 6.5 | 5.6 |  | 8243 |
| divisibility-ladder/m-prime | whole-area/gcd-x | one | **5.23** | 1.8 | 4.1 | 5.4 | 7.1 | 7.8 | 6994 |
| divisibility-ladder/m-prime | whole-intercept/omega | one | **5.23** | 3.4 | 4.9 | 6.0 | 6.6 |  | 15671 |
| divisibility-ladder/m-spf | whole-intercept/gcd-floor-m | one | **5.20** | 4.0 | 4.2 | 5.0 | 6.0 | 6.8 | 14025 |
| crossing-check/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **5.20** | 3.7 | 5.4 | 6.5 |  |  | 14984 |
| divisibility-ladder/m-spf | steady-gradient/gcd-c | one | **5.18** | 4.0 | 4.2 | 5.0 | 5.7 | 7.0 | 14025 |
| smooth-gradient/shared | whole-intercept/omega | neither | **5.17** | 3.1 | 4.1 | 5.1 | 6.2 | 7.4 | 10443 |
| smooth-square/shared | square-area/spf | one | **5.17** | 4.0 | 5.9 | 5.6 |  |  | 51387 |
| whole-crossing/gcd-num-m | whole-intercept/omega | neither | **5.16** | 3.2 | 3.8 | 5.5 | 5.8 | 7.4 | 3526 |
| divisibility-ladder/m-prime | steady-gradient/gcd-c | one | **5.16** | 3.0 | 4.2 | 4.8 | 6.6 | 7.2 | 10100 |
| divisibility-ladder/m-prime | whole-intercept/gcd-floor-m | one | **5.16** | 3.0 | 4.2 | 4.8 | 6.8 | 7.0 | 10100 |
| prime-landing/prime-gradient | prime-staircase/step-back | both | **5.14** | 3.5 | 5.0 | 6.9 |  |  | 8419 |
| prime-landing/m-spf | prime-staircase/near-miss | both | **5.13** | 2.6 | 6.3 | 6.5 |  |  | 12226 |
| divisibility-ladder/m-spf | whole-area/gcd-x | one | **5.11** | 2.2 | 4.0 | 5.1 | 6.7 | 7.6 | 7293 |
| prime-landing/m-spf | prime-staircase/first-prime | both | **5.09** | 3.6 | 5.5 | 6.2 |  |  | 8419 |
| prime-landing/m-spf | prime-staircase/last-prime | both | **5.09** | 3.6 | 5.5 | 6.2 |  |  | 8419 |
| square-area/lpf | whole-crossing/gcd-c | one | **5.09** | 1.7 | 3.9 | 5.8 | 6.9 | 7.1 | 4018 |
| prime-landing/m-gpf | prime-staircase/near-miss | both | **5.08** | 2.5 | 6.3 | 6.4 |  |  | 12226 |
| divisibility-ladder/m-gpf | whole-area/gcd-x | one | **5.05** | 2.2 | 3.9 | 4.8 | 6.2 | 8.2 | 7293 |
| prime-gradient/cPrime | prime-landing/prime-gradient | both | **5.01** | 1.3 | 5.3 | 8.5 |  |  | 7375 |
| prime-landing/prime-gradient | prime-staircase/near-miss | both | **5.01** | 2.5 | 6.3 | 6.2 |  |  | 12226 |
| pell-gradient{"D":3,"k":0}/difference | target-gradient/gcd-tops | neither | **5.01** | 3.0 | 5.1 | 7.0 |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/share-den | target-gradient/gcd-tops | neither | **5.01** | 3.0 | 5.1 | 7.0 |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/pell-c | target-gradient/gcd-tops | neither | **5.01** | 3.0 | 5.1 | 6.9 |  |  | 11277 |
| smooth-gradient/shared | steady-gradient/divisors | neither | **5.00** | 3.2 | 4.1 | 5.0 | 6.0 | 6.6 | 10948 |
| divisibility-ladder/m-prime | smooth-intercept/shared | one | **4.98** | 2.7 | 4.4 | 5.8 | 7.1 |  | 6987 |
| divisibility-ladder/steep | whole-area/gcd-x | one | **4.97** | 2.6 | 3.8 | 4.8 | 6.3 | 7.4 | 9175 |
| prime-landing/m-gpf | prime-staircase/first-prime | both | **4.95** | 3.5 | 5.5 | 5.8 |  |  | 8419 |
| steady-gradient/divisors | whole-intercept/gcd-floor-m | neither | **4.94** | 3.1 | 4.0 | 4.8 | 6.1 | 6.8 | 10420 |
| whole-crossing/gcd-c | whole-intercept/gcd-den-m | neither | **4.94** | 4.0 | 4.4 | 5.2 | 5.5 | 5.7 | 3760 |
| divisibility-ladder/m-prime | smooth-crossing/shared | one | **4.92** | 2.4 | 4.4 | 5.8 | 7.1 |  | 5513 |
| prime-landing/m-spf | prime-staircase/step-back | both | **4.90** | 3.6 | 4.8 | 6.4 |  |  | 8419 |
| smooth-intercept/shared | whole-intercept/gcd-den-m | neither | **4.89** | 4.3 | 4.6 | 5.4 | 5.3 |  | 4588 |
| divisibility-ladder/m-prime | whole-at-t/gcd-c | one | **4.89** | 3.2 | 4.2 | 5.8 | 6.3 |  | 13924 |
| divisibility-ladder/m-spf | smooth-intercept/shared | one | **4.88** | 3.0 | 4.3 | 5.4 | 6.7 |  | 7194 |
| smooth-crossing/shared | whole-crossing/gcd-num-m | neither | **4.88** | 4.3 | 4.6 | 5.5 | 5.2 |  | 4621 |
| square-area/omega | whole-intercept/omega | one | **4.87** | 0.5 | 2.6 | 5.0 | 6.7 | 9.6 | 3038 |
| divisibility-ladder/m-spf | whole-at-t/gcd-c | one | **4.86** | 2.9 | 4.3 | 5.5 | 6.7 |  | 9945 |
| smooth-crossing/shared | whole-intercept/gcd-den-m | neither | **4.83** | 4.0 | 4.6 | 5.4 | 5.3 |  | 3534 |
| smooth-intercept/shared | whole-crossing/gcd-num-m | neither | **4.81** | 4.0 | 4.6 | 5.5 | 5.2 |  | 3553 |
| divisibility-ladder/m-prime | smooth-gradient/shared | one | **4.80** | 3.0 | 4.5 | 5.1 | 6.6 |  | 9548 |
| divisibility-ladder/m-spf | smooth-crossing/shared | one | **4.80** | 2.7 | 4.3 | 5.4 | 6.7 |  | 5262 |
| prime-landing/big-prime | prime-staircase/step-back | both | **4.79** | 3.5 | 5.4 | 5.4 |  |  | 8419 |
| sunken-intercept/shared | whole-crossing/gcd-num-m | neither | **4.79** | 2.6 | 3.3 | 5.0 | 5.9 | 7.2 | 2865 |
| prime-landing/m-gpf | prime-staircase/step-back | both | **4.74** | 3.5 | 4.8 | 5.9 |  |  | 8419 |
| steady-gradient/gcd-c | whole-intercept/omega | neither | **4.73** | 3.1 | 3.9 | 4.7 | 5.5 | 6.5 | 11138 |
| prime-landing/next-prime | prime-staircase/step-back | both | **4.72** | 3.6 | 5.9 |  |  |  | 8419 |
| smooth-intercept/shared | whole-area/gcd-den-m | neither | **4.71** | 3.5 | 5.0 | 5.1 | 5.3 |  | 12377 |
| divisibility-ladder/steep | smooth-intercept/shared | one | **4.71** | 3.4 | 4.2 | 5.0 | 6.2 |  | 8837 |
| smooth-crossing/shared | whole-area/gcd-den-m | neither | **4.70** | 3.5 | 5.0 | 5.1 | 5.3 |  | 12351 |
| divisibility-ladder/m-gpf | whole-at-t/gcd-c | one | **4.70** | 2.9 | 4.3 | 5.5 | 6.0 |  | 9945 |
| smooth-square/shared | whole-intercept/omega | neither | **4.69** | 0.5 | 2.7 | 4.9 | 6.7 | 8.5 | 3037 |
| prime-landing/m-gpf | whole-intercept/mc-spf | one | **4.67** | 1.7 | 5.2 | 7.2 |  |  | 727 |
| divisibility-ladder/steep | steep-and-tall/shared | one | **4.67** | 1.5 | 3.0 | 5.2 | 5.9 | 7.8 | 5240 |
| divisibility-ladder/steep | smooth-crossing/shared | one | **4.65** | 3.2 | 4.2 | 5.0 | 6.2 |  | 7061 |
| farey-neighbours/mediant-x | prime-gradient/cPrime | one | **4.65** | 2.9 | 5.6 | 5.4 |  |  | 433 |
| whole-area/gcd-x | whole-crossing/gcd-num-m | neither | **4.64** | 3.0 | 4.4 | 5.0 | 5.2 | 5.6 | 3565 |
| divisibility-ladder/m-gpf | smooth-intercept/shared | one | **4.63** | 3.0 | 4.3 | 5.0 | 6.2 |  | 7194 |
| prime-landing/big-prime | whole-intercept/mc-spf | one | **4.56** | 1.6 | 4.4 | 6.1 | 6.1 |  | 727 |
| divisibility-ladder/m-spf | smooth-gradient/shared | one | **4.56** | 4.0 | 4.4 | 4.9 | 4.9 |  | 13174 |
| divisibility-ladder/m-gpf | smooth-crossing/shared | one | **4.55** | 2.7 | 4.2 | 5.0 | 6.2 |  | 5262 |
| prime-landing/next-prime | prime-staircase/first-prime | both | **4.54** | 3.6 | 5.5 |  |  |  | 8419 |
| prime-landing/next-prime | prime-staircase/last-prime | both | **4.54** | 3.6 | 5.5 |  |  |  | 8419 |
| divisibility-ladder/steep | whole-at-t/gcd-c | one | **4.54** | 2.8 | 4.3 | 5.5 | 5.6 |  | 9945 |
| smooth-square/shared | whole-area/gcd-den-m | neither | **4.53** | 3.5 | 4.4 | 4.7 | 5.5 |  | 38739 |
| smooth-gradient/shared | sunken-intercept/shared | neither | **4.50** | 2.6 | 3.5 | 4.4 | 5.6 | 6.4 | 8011 |
| whole-crossing/k-spf | whole-intercept/spf | one | **4.49** | 1.7 | 2.8 | 6.0 | 7.5 |  | 3007 |
| sunken-intercept/shared | whole-intercept/gcd-floor-m | neither | **4.48** | 2.6 | 3.5 | 4.3 | 5.7 | 6.3 | 9128 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/share-den | neither | **4.47** | 2.4 | 3.7 | 4.7 | 7.1 |  | 10510 |
| pythagorean-area/prime-height | triangle-area/even | one | **4.47** | 3.8 | 5.1 |  |  |  | 31887 |
| pythagorean-area/slanted-square | triangle-area/even | one | **4.47** | 3.9 | 5.1 |  |  |  | 32220 |
| square-area/omega | whole-area/gcd-den-m | one | **4.47** | 3.4 | 4.3 | 4.7 | 5.5 |  | 38739 |
| pythagorean-area/whole-legs | triangle-area/even | one | **4.47** | 3.8 | 5.1 |  |  |  | 31608 |
| whole-area/gcd-den-m | whole-crossing/gcd-c | neither | **4.45** | 3.5 | 4.8 | 4.9 | 5.0 | 4.1 | 13258 |
| pythagorean-area/prime-height | triangle-area/legs | one | **4.45** | 3.8 | 5.1 |  |  |  | 31979 |
| pythagorean-area/slanted-square | triangle-area/legs | one | **4.45** | 3.8 | 5.1 |  |  |  | 32312 |
| prime-landing/big-prime | prime-staircase/near-miss | both | **4.44** | 2.5 | 5.5 | 5.4 |  |  | 12226 |
| pythagorean-area/whole-legs | triangle-area/legs | one | **4.44** | 3.8 | 5.1 |  |  |  | 31700 |
| m-meets-c/size | whole-intercept/mc-spf | neither | **4.43** | 2.7 | 2.7 | 5.1 | 7.3 |  | 154 |
| steady-gradient/gcd-c | sunken-intercept/shared | neither | **4.43** | 2.6 | 3.4 | 4.3 | 5.5 | 6.3 | 8579 |
| square-area/omega | sunken-intercept/shared | one | **4.38** | -0.1 | 2.1 | 4.6 | 6.4 | 9.0 | 2245 |
| prime-gradient/c-spf | prime-landing/m-spf | both | **4.35** | 0.3 | 4.5 | 5.8 | 6.8 |  | 3962 |
| prime-gradient/cPrime | prime-landing/m-spf | both | **4.33** | 0.9 | 4.9 | 7.2 |  |  | 5645 |
| prime-gradient/prime | whole-intercept/mc-spf | one | **4.30** | 2.3 | 4.5 | 6.1 |  |  | 800 |
| farey-neighbours/mediant-x | prime-landing/prime-gradient | one | **4.28** | 2.4 | 4.9 | 5.5 |  |  | 433 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/pell-c | neither | **4.28** | 2.3 | 3.5 | 4.5 | 6.8 |  | 10555 |
| prime-gradient/c-spf | prime-landing/prime-gradient | both | **4.28** | 0.9 | 4.9 | 7.1 |  |  | 5659 |
| smooth-square/shared | sunken-intercept/shared | neither | **4.25** | -0.1 | 2.2 | 4.5 | 6.3 | 8.3 | 2234 |
| prime-staircase/first-prime | whole-intercept/mc-spf | one | **4.21** | 3.6 | 4.3 | 4.8 |  |  | 727 |
| prime-staircase/last-prime | whole-intercept/mc-spf | one | **4.21** | 3.6 | 4.3 | 4.8 |  |  | 727 |
| divisibility-ladder/m-gpf | whole-crossing/gcd-num-m | one | **4.21** | 3.2 | 3.6 | 3.8 | 6.2 |  | 2599 |
| divisibility-ladder/steep | whole-crossing/gcd-num-m | one | **4.21** | 3.1 | 3.6 | 4.3 | 5.9 |  | 2599 |
| steady-gradient/gcd-c | whole-intercept/mc-spf | neither | **4.20** | 4.2 | 4.2 |  |  |  | 1764 |
| pell-gradient{"D":2,"k":0}/difference | target-gradient/same-den | neither | **4.13** | 3.0 | 5.2 |  |  |  | 5910 |
| pell-gradient{"D":2,"k":0}/share-den | target-gradient/same-den | neither | **4.12** | 3.0 | 5.2 |  |  |  | 11467 |
| pell-gradient{"D":2,"k":0}/pell-c | target-gradient/same-den | neither | **4.12** | 3.0 | 5.2 |  |  |  | 11388 |
| divisibility-ladder/m-spf | whole-crossing/gcd-num-m | one | **4.11** | 3.2 | 3.8 | 3.9 | 5.5 |  | 2599 |
| prime-gradient/cPrime | whole-intercept/mc-spf | one | **4.07** | 2.2 | 3.7 | 6.3 |  |  | 800 |
| prime-staircase/step-back | whole-intercept/spf | one | **4.06** | 3.6 | 4.1 | 4.4 |  |  | 4963 |
| smooth-square/shared | whole-intercept/gcd-den-m | neither | **4.05** | 2.0 | 4.0 | 4.4 | 5.8 |  | 1398 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/twins | neither | **4.05** | 2.7 | 5.4 |  |  |  | 5953 |
| prime-gradient/c-spf | prime-staircase/first-prime | both | **4.02** | 0.9 | 3.1 | 5.1 | 6.9 |  | 1268 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/twins | neither | **4.01** | 2.6 | 5.4 |  |  |  | 5953 |
| pell-gradient{"D":1,"k":1}/pell-c | target-gradient/same-den | neither | **4.01** | 1.6 | 4.7 | 5.7 |  |  | 5768 |
| pell-gradient{"D":1,"k":1}/difference | target-gradient/same-den | neither | **4.00** | 1.6 | 4.7 | 5.7 |  |  | 5399 |
| pell-gradient{"D":1,"k":1}/share-den | target-gradient/same-den | neither | **4.00** | 1.6 | 4.7 | 5.7 |  |  | 5667 |
| square-area/omega | whole-intercept/gcd-den-m | one | **3.99** | 1.9 | 3.9 | 4.4 | 5.7 |  | 1401 |
| square-area/omega | whole-crossing/gcd-num-m | one | **3.99** | 2.0 | 4.0 | 4.4 | 5.6 |  | 1410 |
| square-area/lpf | whole-area/gcd-den-m | one | **3.98** | 3.4 | 4.3 | 3.9 | 4.3 |  | 38739 |
| whole-crossing/m-spf | whole-intercept/mc-spf | one | **3.98** | 3.9 | 3.2 | 4.8 |  |  | 877 |
| prime-staircase/near-miss | whole-intercept/spf | one | **3.97** | 3.3 | 4.3 | 4.3 |  |  | 9997 |
| prime-gradient/c-spf | target-gradient/gcd-tops | one | **3.95** | 3.0 | 4.9 |  |  |  | 13389 |
| prime-gradient/c-gpf | target-gradient/gcd-tops | one | **3.95** | 3.0 | 4.9 |  |  |  | 13657 |
| prime-gradient/cPrime | target-gradient/gcd-tops | one | **3.95** | 3.0 | 4.9 |  |  |  | 13675 |
| crossing-check/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.95** | 3.9 | 4.7 | 3.2 |  |  | 10183 |
| prime-gradient/c-gpf | smooth-square/shared | one | **3.94** | 1.2 | 4.3 | 5.2 | 5.0 |  | 6704 |
| prime-gradient/cPrime | prime-staircase/first-prime | both | **3.93** | 1.7 | 3.6 | 6.5 |  |  | 2171 |
| prime-gradient/cPrime | prime-staircase/last-prime | both | **3.93** | 1.7 | 3.6 | 6.5 |  |  | 2171 |
| prime-gradient/cPrime | prime-landing/m-gpf | both | **3.93** | 0.8 | 4.9 | 6.1 |  |  | 5445 |
| divisibility-ladder/m-prime | whole-crossing/gcd-num-m | one | **3.93** | 2.4 | 3.6 | 4.1 | 5.7 |  | 2123 |
| farey-neighbours/mediant-x | prime-staircase/first-prime | one | **3.92** | 2.9 | 3.5 | 5.3 |  |  | 182 |
| farey-neighbours/mediant-x | prime-staircase/last-prime | one | **3.92** | 2.9 | 3.5 | 5.3 |  |  | 182 |
| prime-gradient/c-gpf | whole-intercept/spf | one | **3.90** | 0.9 | 2.9 | 4.4 | 7.4 |  | 3182 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/twins | neither | **3.90** | 2.6 | 5.2 |  |  |  | 5953 |
| prime-landing/prime-gradient | whole-intercept/mc-spf | one | **3.88** | 1.6 | 3.7 | 6.3 |  |  | 727 |
| prime-gradient/cPrime | prime-staircase/step-back | both | **3.87** | 1.7 | 3.1 | 6.8 |  |  | 2171 |
| prime-gradient/c-gpf | prime-landing/prime-gradient | both | **3.86** | 0.8 | 4.9 | 5.9 |  |  | 5463 |
| prime-gradient/c-gpf | square-area/omega | both | **3.85** | 1.2 | 4.2 | 5.1 | 4.9 |  | 6794 |
| divisibility-ladder/m-gpf | steep-and-tall/shared | one | **3.85** | 1.5 | 2.9 | 4.8 | 6.2 |  | 4845 |
| prime-gradient/cPrime | steep-and-tall/shared | one | **3.84** | 2.4 | 5.3 |  |  |  | 12730 |
| farey-neighbours/mediant-x | pell-gradient{"D":6,"k":0}/pell-c | neither | **3.84** | 3.5 | 4.2 |  |  |  | 591 |
| egyptian-line/bottom | steep-and-tall/shared | neither | **3.83** | 3.8 |  |  |  |  | 1341 |
| prime-staircase/near-miss | whole-intercept/mc-spf | one | **3.82** | 3.2 | 4.4 |  |  |  | 1518 |
| farey-neighbours/mediant-x | prime-staircase/step-back | one | **3.82** | 2.9 | 2.9 | 5.7 |  |  | 182 |
| square-area/spf | whole-area/gcd-x | one | **3.82** | 3.4 | 4.1 | 3.9 |  |  | 38739 |
| pell-gradient{"D":2,"k":0}/difference | target-gradient/gcd-tops | neither | **3.80** | 3.0 | 4.6 |  |  |  | 5910 |
| pell-gradient{"D":2,"k":0}/share-den | target-gradient/gcd-tops | neither | **3.79** | 3.0 | 4.6 |  |  |  | 11467 |
| prime-gradient/cPrime | prime-staircase/near-miss | both | **3.79** | 1.1 | 4.1 | 6.2 |  |  | 3991 |
| pell-gradient{"D":2,"k":0}/pell-c | target-gradient/gcd-tops | neither | **3.79** | 3.0 | 4.6 |  |  |  | 11388 |
| crossing-check/whole | pell-gradient{"D":3,"k":0}/difference | neither | **3.78** | 4.1 | 4.7 | 2.5 |  |  | 10183 |
| smooth-square/shared | whole-crossing/gcd-num-m | neither | **3.78** | 2.0 | 4.1 | 4.1 | 5.0 |  | 1409 |
| crossing-check/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **3.78** | 4.1 | 4.7 | 2.5 |  |  | 10183 |
| farey-neighbours/mediant-x | prime-staircase/near-miss | one | **3.75** | 2.5 | 3.8 | 5.0 |  |  | 357 |
| prime-gradient/c-gpf | whole-crossing/gcd-c | one | **3.73** | 1.1 | 3.6 | 4.6 | 5.6 |  | 2843 |
| whole-area/gcd-x | whole-crossing/k-gpf | one | **3.71** | 1.6 | 3.6 | 4.5 | 5.1 |  | 7155 |
| crossing-check/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.71** | 3.1 | 4.7 | 3.2 |  |  | 11033 |
| square-area/spf | whole-area/gcd-den-m | one | **3.69** | 3.4 | 4.3 | 3.4 |  |  | 38739 |
| pell-gradient{"D":1,"k":1}/pell-c | target-gradient/gcd-tops | neither | **3.69** | 1.6 | 3.9 | 5.5 |  |  | 5768 |
| pell-gradient{"D":1,"k":1}/difference | target-gradient/gcd-tops | neither | **3.68** | 1.6 | 3.9 | 5.5 |  |  | 5399 |
| pell-gradient{"D":1,"k":1}/share-den | target-gradient/gcd-tops | neither | **3.67** | 1.6 | 3.9 | 5.5 |  |  | 5667 |
| prime-gradient/c-spf | whole-intercept/spf | one | **3.66** | 1.1 | 2.9 | 4.5 | 6.2 |  | 3315 |
| smooth-gradient/shared | whole-intercept/mc-spf | neither | **3.65** | 4.2 | 3.1 |  |  |  | 1650 |
| crossing-check/whole | target-gradient/same-den | neither | **3.63** | 2.7 | 4.6 | 3.6 |  |  | 5341 |
| prime-slope/twins | target-gradient/same-den | neither | **3.63** | 2.4 | 4.8 |  |  |  | 5333 |
| farey-neighbours/mediant-x | pell-gradient{"D":5,"k":0}/pell-c | neither | **3.62** | 3.5 | 3.7 |  |  |  | 616 |
| steep-and-tall/shared | whole-intercept/omega | neither | **3.62** | 1.2 | 2.6 | 3.7 | 4.9 | 5.7 | 5832 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/twins | neither | **3.62** | 2.5 | 4.7 |  |  |  | 4292 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/twins | neither | **3.62** | 2.5 | 4.7 |  |  |  | 4292 |
| prime-landing/prime-gradient | steep-and-tall/shared | one | **3.61** | 1.9 | 5.3 |  |  |  | 12618 |
| prime-landing/next-prime | prime-staircase/near-miss | both | **3.60** | 2.6 | 4.6 |  |  |  | 12226 |
| crossing-check/size | target-gradient/same-den | neither | **3.59** | 2.6 | 4.6 | 3.6 |  |  | 7043 |
| smooth-crossing/shared | square-area/lpf | one | **3.58** | 1.7 | 3.9 | 5.1 |  |  | 3725 |
| smooth-intercept/shared | square-area/lpf | one | **3.58** | 1.7 | 3.9 | 5.1 |  |  | 3734 |
| prime-gradient/c-spf | steep-and-tall/shared | one | **3.58** | 2.2 | 5.0 |  |  |  | 11254 |
| divisibility-ladder/m-prime | smooth-square/shared | one | **3.57** | 0.1 | 2.7 | 5.4 | 6.0 |  | 2188 |
| divisibility-ladder/m-prime | square-area/omega | both | **3.57** | 0.0 | 2.6 | 5.5 | 6.2 |  | 2195 |
| farey-neighbours/mediant-x | pell-gradient{"D":5,"k":0}/share-den | neither | **3.55** | 3.6 |  |  |  |  | 616 |
| farey-neighbours/mediant-x | pell-gradient{"D":5,"k":0}/difference | neither | **3.55** | 3.6 |  |  |  |  | 616 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/twins | neither | **3.54** | 2.4 | 4.7 |  |  |  | 4292 |
| farey-neighbours/mediant-x | target-gradient/gcd-tops | neither | **3.52** | 2.6 | 4.5 |  |  |  | 337 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/square-sum | neither | **3.52** | 3.5 |  |  |  |  | 4179 |
| steady-gradient/divisors | steep-and-tall/shared | neither | **3.52** | 1.2 | 2.6 | 3.6 | 4.8 | 5.5 | 5263 |
| prime-gradient/c-gpf | square-area/spf | both | **3.51** | 1.2 | 4.1 | 5.2 |  |  | 6807 |
| divisibility-ladder/steep | square-area/omega | both | **3.51** | 0.9 | 2.4 | 4.3 | 6.5 |  | 3264 |
| prime-landing/prime-gradient | whole-intercept/spf | one | **3.50** | 1.7 | 4.4 | 4.4 |  |  | 4963 |
| crossing-check/size | pell-gradient{"D":3,"k":0}/difference | neither | **3.49** | 3.1 | 4.7 | 2.6 |  |  | 10217 |
| crossing-check/size | pell-gradient{"D":3,"k":0}/share-den | neither | **3.49** | 3.1 | 4.7 | 2.6 |  |  | 10217 |
| divisibility-ladder/m-spf | steep-and-tall/shared | one | **3.48** | 1.5 | 2.9 | 4.4 | 5.2 |  | 4845 |
| smooth-gradient/shared | square-area/omega | one | **3.47** | 1.7 | 2.8 | 5.0 | 4.4 |  | 3431 |
| prime-gradient/c-gpf | whole-area/gcd-x | one | **3.46** | 1.1 | 3.4 | 4.1 | 5.1 |  | 6518 |
| divisibility-ladder/m-prime | steep-and-tall/shared | one | **3.46** | 1.2 | 3.2 | 3.4 | 6.1 |  | 5057 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/matching-c | neither | **3.46** | 3.5 | 3.4 |  |  |  | 4179 |
| farey-neighbours/mediant-x | pell-gradient{"D":7,"k":0}/pell-c | neither | **3.45** | 3.4 |  |  |  |  | 555 |
| prime-landing/m-gpf | whole-intercept/spf | one | **3.45** | 1.7 | 4.2 | 4.4 |  |  | 4963 |
| farey-neighbours/mediant-x | prime-gradient/c-spf | one | **3.44** | 2.8 | 3.0 | 4.5 |  |  | 394 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/matching-c | neither | **3.44** | 2.7 | 4.2 |  |  |  | 5953 |
| m-meets-c/meetPrime | prime-gradient/cPrime | one | **3.44** | 0.8 | 3.7 | 5.8 |  |  | 247 |
| farey-neighbours/mediant-x | pell-gradient{"D":6,"k":0}/share-den | neither | **3.42** | 3.4 |  |  |  |  | 591 |
| farey-neighbours/mediant-x | pell-gradient{"D":6,"k":0}/difference | neither | **3.42** | 3.4 |  |  |  |  | 591 |
| farey-neighbours/mediant-x | pell-gradient{"D":7,"k":0}/share-den | neither | **3.40** | 3.4 |  |  |  |  | 597 |
| divisibility-ladder/steep | smooth-square/shared | one | **3.40** | 1.0 | 2.5 | 3.8 | 6.4 |  | 3247 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/matching-c | neither | **3.40** | 2.6 | 4.2 |  |  |  | 5953 |
| sunken-intercept/shared | whole-intercept/gcd-den-m | neither | **3.38** | 2.5 | 3.0 | 3.8 | 4.2 |  | 3313 |
| exact-change/big-bill | whole-intercept/gcd-floor-m | neither | **3.37** | 2.6 | 3.1 | 3.2 | 4.5 |  | 4233 |
| prime-landing/m-spf | whole-intercept/spf | one | **3.37** | 1.7 | 4.2 | 4.2 |  |  | 4963 |
| exact-change/big-piles | same-on-both-rulers/whole-values | one | **3.37** | 3.2 | 3.1 | 3.8 |  |  | 6062 |
| square-area/lpf | whole-crossing/k-gpf | both | **3.36** | 0.0 | 1.9 | 4.3 | 7.3 |  | 2227 |
| farey-neighbours/mediant-x | pell-gradient{"D":7,"k":0}/difference | neither | **3.36** | 3.4 |  |  |  |  | 499 |
| whole-crossing/gcd-num-m | whole-intercept/mc-spf | neither | **3.36** | 3.4 | 3.4 |  |  |  | 324 |
| prime-landing/m-spf | steep-and-tall/shared | one | **3.36** | 1.7 | 5.0 |  |  |  | 11129 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/matching-c | neither | **3.35** | 2.6 | 4.1 |  |  |  | 5953 |
| crossing-check/whole | target-gradient/gcd-tops | neither | **3.35** | 2.8 | 3.9 | 3.4 |  |  | 5339 |
| crossing-check/whole | near-point/lattice | neither | **3.34** | 2.8 | 4.1 | 3.1 |  |  | 5623 |
| exact-change/big-piles | same-on-both-rulers/prime-start | one | **3.34** | 3.2 | 3.0 | 3.8 |  |  | 6042 |
| exact-change/big-piles | same-on-both-rulers/m-gpf | one | **3.33** | 3.1 | 3.1 | 3.8 |  |  | 5803 |
| exact-change/big-piles | same-on-both-rulers/m-spf | one | **3.32** | 3.1 | 3.1 | 3.8 |  |  | 5803 |
| exact-change/big-piles | same-on-both-rulers/steep | one | **3.31** | 3.2 | 3.2 | 3.5 |  |  | 6111 |
| crossing-check/size | target-gradient/gcd-tops | neither | **3.31** | 2.6 | 3.9 | 3.4 |  |  | 7042 |
| exact-change/big-piles | prime-staircase/first-prime | one | **3.30** | 3.3 | 3.3 |  |  |  | 1203 |
| exact-change/big-piles | prime-staircase/last-prime | one | **3.30** | 3.3 | 3.3 |  |  |  | 1203 |
| crossing-check/size | near-point/lattice | neither | **3.29** | 2.7 | 4.1 | 3.1 |  |  | 7544 |
| exact-change/big-piles | whole-crossing/gcd-num-m | neither | **3.29** | 2.9 | 2.9 | 4.1 |  |  | 653 |
| m-meets-c/meetPrime | prime-landing/prime-gradient | one | **3.29** | 0.3 | 3.7 | 5.9 |  |  | 247 |
| exact-change/big-piles | same-on-both-rulers/whole-lamp | one | **3.29** | 3.0 | 3.0 | 3.8 |  |  | 5656 |
| farey-neighbours/mediant-x | pell-gradient{"D":3,"k":0}/share-den | neither | **3.28** | 3.8 | 2.7 |  |  |  | 606 |
| farey-neighbours/mediant-x | pell-gradient{"D":3,"k":0}/difference | neither | **3.27** | 3.8 | 2.7 |  |  |  | 606 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient/cPrime | one | **3.27** | 3.0 | 3.5 |  |  |  | 12117 |
| prime-gradient/c-gpf | whole-crossing/gcd-num-m | one | **3.26** | 1.8 | 4.4 | 3.6 |  |  | 1429 |
| prime-slope/twins | target-gradient/gcd-tops | neither | **3.26** | 2.4 | 4.1 |  |  |  | 5333 |
| steep-and-tall/shared | whole-crossing/gcd-num-m | neither | **3.25** | 2.0 | 3.1 | 3.9 | 4.0 |  | 1946 |
| exact-change/big-bill | steady-gradient/gcd-c | neither | **3.25** | 2.4 | 3.0 | 3.2 | 4.4 |  | 3494 |
| smooth-gradient/shared | smooth-intercept/shared | neither | **3.24** | 3.2 | 3.2 | 3.2 |  |  | 5852 |
| prime-staircase/step-back | pythagorean-area/slanted-square | both | **3.24** | 2.3 | 2.6 | 4.7 |  |  | 3054 |
| exact-change/big-bill | whole-area/gcd-den-m | neither | **3.23** | 1.4 | 3.4 | 3.6 | 4.5 |  | 3077 |
| prime-staircase/near-miss | pythagorean-area/slanted-square | both | **3.23** | 2.2 | 3.3 | 4.1 |  |  | 8265 |
| smooth-intercept/shared | whole-intercept/gcd-floor-m | neither | **3.23** | 3.4 | 3.2 | 3.3 | 3.1 |  | 7108 |
| square-area/spf | whole-crossing/gcd-c | one | **3.22** | 1.7 | 3.9 | 4.1 |  |  | 4018 |
| prime-staircase/near-miss | pythagorean-area/whole-legs | both | **3.22** | 2.2 | 3.3 | 4.1 |  |  | 7957 |
| prime-staircase/step-back | pythagorean-area/whole-legs | both | **3.21** | 2.3 | 2.6 | 4.8 |  |  | 2887 |
| exact-change/big-piles | whole-area/gcd-den-m | neither | **3.21** | 2.3 | 3.4 | 3.9 |  |  | 1981 |
| prime-staircase/near-miss | pythagorean-area/prime-height | both | **3.20** | 2.3 | 3.3 | 4.0 |  |  | 8265 |
| square-area/omega | steady-gradient/gcd-c | one | **3.20** | 1.7 | 2.4 | 4.2 | 4.4 |  | 3611 |
| farey-neighbours/mediant-x | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.20** | 3.7 | 2.7 |  |  |  | 606 |
| prime-staircase/step-back | pythagorean-area/prime-height | both | **3.20** | 2.3 | 2.6 | 4.7 |  |  | 3054 |
| farey-neighbours/mediant-x | steep-and-tall/shared | neither | **3.18** | 3.0 | 3.8 | 2.8 |  |  | 496 |
| exact-change/big-piles | whole-intercept/gcd-den-m | neither | **3.18** | 3.0 | 3.0 | 3.6 |  |  | 673 |
| prime-slope/matching-c | whole-crossing/gcd-num-m | neither | **3.18** | 2.5 | 3.9 |  |  |  | 1541 |
| prime-staircase/first-prime | pythagorean-area/slanted-square | both | **3.17** | 2.3 | 2.8 | 4.4 |  |  | 3054 |
| prime-staircase/last-prime | pythagorean-area/slanted-square | both | **3.17** | 2.3 | 2.8 | 4.4 |  |  | 3054 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/twins | neither | **3.17** | 3.5 | 2.8 |  |  |  | 4179 |
| exact-change/big-piles | prime-staircase/near-miss | one | **3.16** | 2.2 | 4.1 |  |  |  | 1709 |
| prime-staircase/first-prime | pythagorean-area/whole-legs | both | **3.16** | 2.3 | 2.8 | 4.4 |  |  | 2887 |
| prime-staircase/last-prime | pythagorean-area/whole-legs | both | **3.16** | 2.3 | 2.8 | 4.4 |  |  | 2887 |
| exact-change/big-piles | pythagorean-area/whole-legs | one | **3.16** | 2.7 | 3.6 |  |  |  | 2359 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/matching-c | neither | **3.15** | 2.5 | 3.8 |  |  |  | 4292 |
| prime-staircase/first-prime | pythagorean-area/prime-height | both | **3.15** | 2.3 | 2.8 | 4.3 |  |  | 3054 |
| prime-staircase/last-prime | pythagorean-area/prime-height | both | **3.15** | 2.3 | 2.8 | 4.3 |  |  | 3054 |
| exact-change/big-piles | pythagorean-area/slanted-square | one | **3.15** | 2.7 | 3.6 |  |  |  | 2359 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/matching-c | neither | **3.15** | 2.5 | 3.8 |  |  |  | 4292 |
| pell-gradient{"D":2,"k":0}/difference | whole-at-t/gcd-den-m | neither | **3.15** | 2.9 | 3.4 |  |  |  | 179 |
| smooth-intercept/shared | steady-gradient/gcd-c | neither | **3.14** | 3.2 | 3.2 | 3.2 | 3.0 |  | 5937 |
| exact-change/big-piles | pythagorean-area/prime-height | one | **3.14** | 2.7 | 3.6 |  |  |  | 2359 |
| euclid-steps/largest-quotient | long-division/m-bottom-spf | neither | **3.14** | 2.3 | 3.3 | 3.9 |  |  | 14936 |
| exact-change/big-piles | prime-staircase/step-back | one | **3.14** | 3.3 | 3.0 |  |  |  | 1203 |
| prime-gradient/c-spf | prime-landing/m-gpf | both | **3.14** | 0.2 | 4.5 | 4.7 |  |  | 3776 |
| whole-crossing/gcd-c | whole-intercept/gcd-floor-m | neither | **3.14** | 2.9 | 3.1 | 3.2 | 3.3 |  | 5175 |
| m-meets-c/size | steady-gradient/gcd-c | neither | **3.13** | 1.8 | 1.8 | 3.5 | 5.5 |  | 467 |
| smooth-crossing/shared | smooth-gradient/shared | neither | **3.13** | 2.9 | 3.2 | 3.2 |  |  | 4429 |
| m-meets-c/size | whole-intercept/gcd-floor-m | neither | **3.13** | 1.7 | 1.8 | 3.5 | 5.5 |  | 467 |
| smooth-crossing/shared | whole-intercept/gcd-floor-m | neither | **3.13** | 2.9 | 3.2 | 3.3 | 3.1 |  | 4790 |
| crossing-check/whole | near-point/gcd-x | neither | **3.12** | 2.9 | 4.0 | 2.5 |  |  | 5623 |
| pythagorean-area/slanted-square | whole-intercept/mc-spf | one | **3.11** | 3.0 | 3.2 |  |  |  | 1306 |
| whole-area/gcd-den-m | whole-intercept/omega | neither | **3.11** | 2.2 | 3.4 | 3.5 | 3.3 |  | 10438 |
| divisibility-ladder/m-prime | prime-gradient/c-gpf | both | **3.10** | 0.7 | 3.8 | 4.8 |  |  | 3529 |
| pythagorean-area/prime-height | whole-intercept/mc-spf | one | **3.10** | 3.0 | 3.2 |  |  |  | 1299 |
| prime-gradient/c-gpf | prime-landing/m-spf | both | **3.10** | 0.2 | 4.5 | 4.6 |  |  | 3776 |
| steady-gradient/gcd-c | whole-crossing/gcd-c | neither | **3.09** | 2.9 | 3.1 | 3.2 | 3.2 |  | 4804 |
| exact-change/big-piles | whole-intercept/mc-spf | neither | **3.09** | 3.1 | 3.1 |  |  |  | 313 |
| prime-slope/matching-c | target-gradient/same-den | neither | **3.09** | 2.4 | 3.7 |  |  |  | 5333 |
| prime-gradient/c-spf | whole-crossing/gcd-num-m | one | **3.07** | 1.8 | 4.4 |  |  |  | 1327 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/matching-c | neither | **3.07** | 2.4 | 3.8 |  |  |  | 4292 |
| smooth-crossing/shared | steady-gradient/gcd-c | neither | **3.07** | 2.9 | 3.1 | 3.3 | 3.0 |  | 4442 |
| prime-gradient/c-spf | prime-staircase/near-miss | both | **3.07** | 0.8 | 3.7 | 4.7 |  |  | 3405 |
| prime-landing/next-prime | same-on-both-rulers/whole-lamp | both | **3.07** | 3.0 | 3.1 |  |  |  | 21112 |
| prime-landing/m-gpf | steady-gradient/divisors | one | **3.07** | 0.4 | 2.9 | 4.0 | 5.0 |  | 4420 |
| whole-at-t/gcd-den-m | whole-crossing/gcd-num-m | neither | **3.07** | 3.1 | 3.1 | 2.9 |  |  | 130 |
| pell-gradient{"D":7,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **3.06** | 1.9 | 3.3 | 4.0 |  |  | 257 |
| crossing-check/size | near-point/gcd-x | neither | **3.06** | 2.7 | 3.9 | 2.5 |  |  | 7545 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient/c-spf | one | **3.06** | 3.1 |  |  |  |  | 5910 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient/c-spf | one | **3.06** | 3.1 |  |  |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient/c-spf | one | **3.06** | 3.1 |  |  |  |  | 10429 |
| pythagorean-area/whole-legs | whole-intercept/mc-spf | one | **3.06** | 2.9 | 3.2 |  |  |  | 1206 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/difference | neither | **3.06** | 3.1 |  |  |  |  | 91 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient/c-spf | one | **3.06** | 3.1 |  |  |  |  | 13185 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient/c-spf | one | **3.06** | 3.1 |  |  |  |  | 13185 |
| prime-landing/next-prime | same-on-both-rulers/prime-start | both | **3.06** | 3.0 | 3.1 |  |  |  | 21706 |
| exact-change/big-bill | whole-crossing/gcd-num-m | neither | **3.05** | 2.3 | 3.0 | 3.8 |  |  | 1194 |
| prime-gradient/c-spf | prime-staircase/last-prime | both | **3.05** | 0.9 | 3.1 | 5.1 |  |  | 1268 |
| prime-landing/next-prime | same-on-both-rulers/steep | both | **3.05** | 3.0 | 3.1 |  |  |  | 21605 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.05** | 2.6 | 3.6 | 3.0 |  |  | 7515 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient/c-spf | one | **3.05** | 3.0 |  |  |  |  | 11684 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient/c-spf | one | **3.05** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient/c-spf | one | **3.05** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient/c-spf | one | **3.04** | 3.0 |  |  |  |  | 13294 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient/c-gpf | one | **3.04** | 3.0 |  |  |  |  | 5910 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient/c-gpf | one | **3.04** | 3.0 |  |  |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient/c-gpf | one | **3.04** | 3.0 |  |  |  |  | 10429 |
| prime-landing/next-prime | same-on-both-rulers/m-gpf | both | **3.04** | 3.0 | 3.1 |  |  |  | 21218 |
| prime-landing/next-prime | same-on-both-rulers/m-spf | both | **3.04** | 3.0 | 3.1 |  |  |  | 21218 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient/c-gpf | one | **3.04** | 3.0 |  |  |  |  | 13185 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient/c-gpf | one | **3.04** | 3.0 |  |  |  |  | 13185 |
| square-area/omega | whole-intercept/gcd-floor-m | one | **3.04** | 1.7 | 2.5 | 4.2 | 3.8 |  | 3447 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient/prime | one | **3.03** | 3.0 |  |  |  |  | 5910 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient/prime | one | **3.03** | 3.0 |  |  |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient/prime | one | **3.03** | 3.0 |  |  |  |  | 10429 |
| crossing-check/whole | prime-slope/twins | neither | **3.03** | 2.9 | 3.1 |  |  |  | 2980 |
| smooth-gradient/shared | whole-crossing/gcd-c | neither | **3.03** | 2.9 | 3.2 | 3.1 | 2.9 |  | 4790 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient/prime | one | **3.03** | 3.0 |  |  |  |  | 13185 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient/prime | one | **3.03** | 3.0 |  |  |  |  | 13185 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient/c-gpf | one | **3.03** | 3.0 |  |  |  |  | 11684 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient/c-gpf | one | **3.03** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient/c-gpf | one | **3.03** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient/c-gpf | one | **3.03** | 3.0 |  |  |  |  | 13294 |
| divisibility-ladder/m-gpf | square-area/omega | both | **3.02** | 1.1 | 2.3 | 3.9 | 4.8 |  | 3264 |
| exact-change/big-bill | pythagorean-area/slanted-square | one | **3.02** | 2.5 | 3.5 |  |  |  | 6392 |
| divisibility-ladder/steep | steady-gradient/divisors | one | **3.02** | 2.1 | 2.3 | 3.3 | 2.8 | 4.6 | 8621 |
| prime-staircase/first-prime | same-on-both-rulers/prime-start | both | **3.02** | 2.7 | 3.3 |  |  |  | 4225 |
| prime-staircase/last-prime | same-on-both-rulers/prime-start | both | **3.02** | 2.7 | 3.3 |  |  |  | 4225 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient/prime | one | **3.01** | 3.0 |  |  |  |  | 11684 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient/prime | one | **3.01** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient/prime | one | **3.01** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient/prime | one | **3.01** | 3.0 |  |  |  |  | 12372 |
| prime-gradient/c-gpf | sunken-intercept/shared | one | **3.01** | 0.8 | 2.8 | 3.8 | 4.7 |  | 5175 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient/prime | one | **3.01** | 3.0 |  |  |  |  | 13294 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient/prime | one | **3.01** | 3.0 |  |  |  |  | 13238 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient/cPrime | one | **3.01** | 3.0 |  |  |  |  | 5910 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient/cPrime | one | **3.01** | 3.0 |  |  |  |  | 10429 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient/cPrime | one | **3.01** | 3.0 |  |  |  |  | 10429 |
| exact-change/big-bill | pythagorean-area/whole-legs | one | **3.01** | 2.5 | 3.5 |  |  |  | 6219 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient/cPrime | one | **3.01** | 3.0 |  |  |  |  | 13185 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient/cPrime | one | **3.01** | 3.0 |  |  |  |  | 13185 |
| exact-change/big-bill | pythagorean-area/prime-height | one | **3.00** | 2.5 | 3.5 |  |  |  | 6294 |
| prime-landing/next-prime | same-on-both-rulers/whole-values | both | **3.00** | 3.0 | 3.0 |  |  |  | 21581 |
| prime-staircase/first-prime | same-on-both-rulers/steep | both | **3.00** | 2.7 | 3.3 |  |  |  | 4141 |
| prime-staircase/last-prime | same-on-both-rulers/steep | both | **3.00** | 2.7 | 3.3 |  |  |  | 4141 |
| prime-landing/prime-gradient | pythagorean-area/whole-legs | both | **3.00** | 1.6 | 3.5 | 3.9 |  |  | 9054 |
| prime-gradient/c-spf | target-gradient/same-den | one | **3.00** | 3.0 |  |  |  |  | 13413 |
| prime-landing/prime-gradient | pythagorean-area/slanted-square | both | **3.00** | 1.6 | 3.5 | 3.9 |  |  | 9202 |
| triangle-area/even | whole-intercept/mc-spf | neither | **3.00** | 2.9 | 3.1 |  |  |  | 1182 |
| prime-staircase/first-prime | same-on-both-rulers/whole-lamp | both | **3.00** | 2.7 | 3.3 |  |  |  | 3895 |
| prime-staircase/last-prime | same-on-both-rulers/whole-lamp | both | **3.00** | 2.7 | 3.3 |  |  |  | 3895 |
| pell-gradient{"D":7,"k":0}/difference | whole-at-t/gcd-den-m | neither | **3.00** | 1.7 | 3.3 | 4.0 |  |  | 218 |
| whole-area/gcd-den-m | whole-at-t/gcd-den-m | neither | **3.00** | 2.0 | 4.0 |  |  |  | 327 |
| prime-gradient/c-gpf | target-gradient/same-den | one | **2.99** | 3.0 |  |  |  |  | 13680 |
| pell-gradient{"D":5,"k":0}/difference | target-gradient/gcd-tops | neither | **2.99** | 3.0 |  |  |  |  | 13043 |
| pell-gradient{"D":5,"k":0}/share-den | target-gradient/gcd-tops | neither | **2.99** | 3.0 |  |  |  |  | 13043 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/pell-c | neither | **2.99** | 3.0 |  |  |  |  | 95 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient/cPrime | one | **2.99** | 3.0 |  |  |  |  | 11684 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient/cPrime | one | **2.99** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient/cPrime | one | **2.99** | 3.0 |  |  |  |  | 12965 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient/cPrime | one | **2.99** | 3.0 |  |  |  |  | 12372 |
| pell-gradient{"D":5,"k":0}/difference | target-gradient/same-den | neither | **2.99** | 3.0 |  |  |  |  | 13066 |
| pell-gradient{"D":5,"k":0}/share-den | target-gradient/same-den | neither | **2.99** | 3.0 |  |  |  |  | 13066 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient/cPrime | one | **2.99** | 3.0 |  |  |  |  | 13294 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient/cPrime | one | **2.99** | 3.0 |  |  |  |  | 13238 |
| exact-change/big-bill | same-on-both-rulers/whole-values | one | **2.99** | 1.9 | 3.0 | 4.0 |  |  | 6847 |
| smooth-gradient/shared | square-area/lpf | one | **2.99** | 1.8 | 2.8 | 4.4 |  |  | 3415 |
| crossing-check/whole | whole-at-t/gcd-den-m | neither | **2.99** | 2.4 | 2.8 | 3.8 |  |  | 137 |
| whole-area/gcd-den-m | whole-crossing/gcd-num-m | neither | **2.99** | 3.0 | 3.2 | 3.1 | 2.7 |  | 3565 |
| smooth-crossing/shared | whole-crossing/k-gpf | one | **2.99** | 3.0 |  |  |  |  | 8478 |
| pell-gradient{"D":5,"k":0}/pell-c | target-gradient/same-den | neither | **2.99** | 3.0 |  |  |  |  | 13195 |
| whole-crossing/k-gpf | whole-intercept/spf | one | **2.99** | 1.1 | 3.1 | 4.7 |  |  | 2634 |
| exact-change/big-piles | prime-landing/big-prime | one | **2.99** | 2.5 | 3.4 |  |  |  | 3690 |
| prime-gradient/cPrime | target-gradient/same-den | one | **2.98** | 3.0 |  |  |  |  | 13698 |
| prime-staircase/first-prime | same-on-both-rulers/m-gpf | both | **2.98** | 2.7 | 3.3 |  |  |  | 3997 |
| prime-staircase/first-prime | same-on-both-rulers/m-spf | both | **2.98** | 2.7 | 3.3 |  |  |  | 3997 |
| prime-staircase/last-prime | same-on-both-rulers/m-gpf | both | **2.98** | 2.7 | 3.3 |  |  |  | 3997 |
| prime-staircase/last-prime | same-on-both-rulers/m-spf | both | **2.98** | 2.7 | 3.3 |  |  |  | 3997 |
| exact-change/big-bill | same-on-both-rulers/steep | one | **2.98** | 2.0 | 3.1 | 3.9 |  |  | 6897 |
| triangle-area/legs | whole-intercept/mc-spf | neither | **2.98** | 2.9 | 3.1 |  |  |  | 1208 |
| euclid-steps/largest-quotient | prime-slope/square-sum | neither | **2.97** | 3.0 |  |  |  |  | 7554 |
| euclid-steps/largest-quotient | prime-slope/twins | neither | **2.97** | 3.0 |  |  |  |  | 7554 |
| prime-landing/prime-gradient | pythagorean-area/prime-height | both | **2.97** | 1.7 | 3.4 | 3.8 |  |  | 9211 |
| square-area/lpf | sunken-intercept/shared | one | **2.97** | -0.1 | 2.1 | 4.2 | 5.7 |  | 2239 |
| prime-gradient/prime | prime-landing/prime-gradient | both | **2.97** | 0.8 | 3.2 | 4.9 |  |  | 5533 |
| prime-landing/m-spf | same-on-both-rulers/prime-start | both | **2.97** | 3.0 |  |  |  |  | 21820 |
| exact-change/big-piles | prime-landing/m-spf | one | **2.97** | 2.6 | 3.4 |  |  |  | 3662 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/share-den | neither | **2.97** | 3.0 |  |  |  |  | 91 |
| prime-gradient/c-spf | prime-staircase/step-back | both | **2.97** | 0.9 | 2.6 | 5.4 |  |  | 1268 |
| pell-gradient{"D":6,"k":0}/share-den | prime-slope/matching-c | neither | **2.97** | 2.7 | 3.2 |  |  |  | 6483 |
| pell-gradient{"D":6,"k":0}/difference | prime-slope/matching-c | neither | **2.97** | 2.7 | 3.2 |  |  |  | 6483 |
| prime-landing/m-spf | same-on-both-rulers/steep | both | **2.97** | 3.0 |  |  |  |  | 21739 |
| prime-landing/m-spf | same-on-both-rulers/whole-lamp | both | **2.97** | 3.0 |  |  |  |  | 21225 |
| prime-landing/next-prime | whole-intercept/spf | one | **2.97** | 1.8 | 4.2 |  |  |  | 4963 |
| m-meets-c/meetPrime | steep-and-tall/shared | neither | **2.96** | 3.9 | 3.0 | 2.0 |  |  | 2178 |
| farey-neighbours/bottoms | steep-and-tall/shared | neither | **2.96** | 3.0 |  |  |  |  | 93 |
| exact-change/big-piles | prime-landing/m-gpf | one | **2.96** | 2.6 | 3.4 |  |  |  | 3659 |
| prime-landing/m-gpf | same-on-both-rulers/prime-start | both | **2.96** | 3.0 |  |  |  |  | 21810 |
| exact-change/big-bill | same-on-both-rulers/prime-start | one | **2.95** | 2.0 | 2.9 | 4.0 |  |  | 6829 |
| near-point/gcd-x | pell-gradient{"D":2,"k":0}/pell-c | neither | **2.95** | 2.5 | 3.4 | 3.0 |  |  | 7098 |
| square-area/spf | whole-crossing/gcd-num-m | one | **2.95** | 2.0 | 3.9 |  |  |  | 1410 |
| divisibility-ladder/m-spf | prime-gradient/c-gpf | both | **2.95** | 1.1 | 3.6 | 4.2 |  |  | 3308 |
| prime-staircase/first-prime | same-on-both-rulers/whole-values | both | **2.95** | 2.7 | 3.2 |  |  |  | 4141 |
| prime-staircase/last-prime | same-on-both-rulers/whole-values | both | **2.95** | 2.7 | 3.2 |  |  |  | 4141 |
| exact-change/big-bill | whole-intercept/gcd-den-m | neither | **2.95** | 2.3 | 3.1 | 3.4 |  |  | 1227 |
| prime-landing/m-gpf | same-on-both-rulers/whole-lamp | both | **2.95** | 3.0 |  |  |  |  | 21216 |
| prime-landing/m-gpf | same-on-both-rulers/steep | both | **2.95** | 3.0 |  |  |  |  | 21717 |
| prime-landing/m-spf | same-on-both-rulers/m-gpf | both | **2.95** | 3.0 |  |  |  |  | 21352 |
| prime-landing/m-spf | same-on-both-rulers/m-spf | both | **2.95** | 3.0 |  |  |  |  | 21352 |
| exact-change/big-bill | same-on-both-rulers/m-gpf | one | **2.95** | 1.9 | 3.0 | 4.0 |  |  | 6605 |
| pell-gradient{"D":7,"k":0}/share-den | prime-slope/matching-c | neither | **2.95** | 2.6 | 3.3 |  |  |  | 6146 |
| steep-and-tall/shared | whole-intercept/mc-spf | neither | **2.95** | 1.9 | 4.0 |  |  |  | 758 |
| exact-change/big-bill | prime-staircase/step-back | one | **2.95** | 3.0 | 2.9 |  |  |  | 3033 |
| exact-change/big-bill | same-on-both-rulers/m-spf | one | **2.94** | 1.9 | 3.0 | 4.0 |  |  | 6605 |
| square-area/lpf | whole-crossing/gcd-num-m | one | **2.94** | 2.0 | 4.0 | 2.9 |  |  | 1409 |
| exact-change/big-bill | prime-landing/big-prime | one | **2.94** | 1.9 | 3.3 | 3.6 |  |  | 6202 |
| prime-landing/m-gpf | same-on-both-rulers/m-gpf | both | **2.94** | 2.9 |  |  |  |  | 21330 |
| prime-landing/m-gpf | same-on-both-rulers/m-spf | both | **2.94** | 2.9 |  |  |  |  | 21330 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.93** | 1.9 | 3.0 | 3.9 |  |  | 232 |
| prime-landing/m-spf | same-on-both-rulers/whole-values | both | **2.93** | 2.9 |  |  |  |  | 21715 |
| prime-gradient/prime | target-gradient/gcd-tops | one | **2.93** | 2.9 |  |  |  |  | 13043 |
| prime-gradient/prime | target-gradient/same-den | one | **2.93** | 2.9 |  |  |  |  | 13066 |
| prime-gradient/c-gpf | smooth-intercept/shared | one | **2.93** | 1.3 | 3.6 | 3.9 |  |  | 3281 |
| prime-landing/m-gpf | same-on-both-rulers/whole-values | both | **2.92** | 2.9 |  |  |  |  | 21692 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient/c-spf | one | **2.92** | 2.9 |  |  |  |  | 10429 |
| prime-gradient/c-gpf | steep-and-tall/shared | one | **2.91** | 2.2 | 5.0 | 1.6 |  |  | 11784 |
| exact-change/big-piles | triangle-area/even | neither | **2.91** | 2.7 | 3.1 |  |  |  | 2065 |
| square-area/spf | whole-intercept/gcd-den-m | one | **2.91** | 1.9 | 3.9 |  |  |  | 1401 |
| exact-change/big-bill | same-on-both-rulers/whole-lamp | one | **2.91** | 1.8 | 2.9 | 4.0 |  |  | 6465 |
| exact-change/big-bill | smooth-gradient/shared | neither | **2.90** | 2.4 | 3.0 | 3.2 |  |  | 3254 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient/c-gpf | one | **2.90** | 2.9 |  |  |  |  | 10429 |
| prime-gradient/c-spf | pythagorean-area/whole-legs | both | **2.89** | 1.2 | 3.0 | 4.4 |  |  | 5058 |
| prime-gradient/c-spf | pythagorean-area/slanted-square | both | **2.89** | 1.2 | 3.0 | 4.4 |  |  | 5058 |
| prime-slope/matching-c | whole-at-t/gcd-den-m | neither | **2.89** | 2.9 |  |  |  |  | 272 |
| prime-slope/square-sum | whole-at-t/gcd-den-m | neither | **2.89** | 2.9 |  |  |  |  | 272 |
| prime-slope/twins | whole-at-t/gcd-den-m | neither | **2.89** | 2.9 |  |  |  |  | 272 |
| sunken-intercept/shared | whole-crossing/k-gpf | one | **2.89** | 1.5 | 2.7 | 3.2 | 4.1 |  | 6360 |
| smooth-gradient/shared | smooth-square/shared | neither | **2.89** | 1.8 | 2.9 | 4.0 |  |  | 3398 |
| smooth-gradient/shared | triangle-area/legs | neither | **2.89** | 2.4 | 2.6 | 3.6 |  |  | 5300 |
| prime-gradient/cPrime | prime-landing/big-prime | both | **2.88** | 0.8 | 3.2 | 4.7 |  |  | 5598 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient/prime | one | **2.88** | 2.9 |  |  |  |  | 10429 |
| exact-change/big-piles | triangle-area/legs | neither | **2.88** | 2.7 | 3.1 |  |  |  | 2069 |
| smooth-gradient/shared | triangle-area/even | neither | **2.87** | 2.4 | 2.6 | 3.6 |  |  | 5165 |
| pell-gradient{"D":5,"k":0}/share-den | prime-slope/matching-c | neither | **2.87** | 2.8 | 2.9 |  |  |  | 6490 |
| pell-gradient{"D":5,"k":0}/difference | prime-slope/matching-c | neither | **2.87** | 2.8 | 2.9 |  |  |  | 6490 |
| pell-gradient{"D":5,"k":0}/share-den | prime-slope/square-sum | neither | **2.86** | 2.8 | 2.9 |  |  |  | 6490 |
| pell-gradient{"D":5,"k":0}/difference | prime-slope/square-sum | neither | **2.86** | 2.8 | 2.9 |  |  |  | 6490 |
| exact-change/big-piles | whole-intercept/gcd-floor-m | neither | **2.86** | 2.9 | 2.8 | 3.0 |  |  | 1719 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient/cPrime | one | **2.86** | 2.9 |  |  |  |  | 10429 |
| prime-gradient/c-spf | pythagorean-area/prime-height | both | **2.85** | 1.2 | 3.0 | 4.4 |  |  | 5069 |
| square-area/lpf | whole-intercept/gcd-den-m | one | **2.85** | 2.0 | 3.9 | 2.7 |  |  | 1398 |
| square-area/lpf | whole-intercept/omega | one | **2.85** | 0.5 | 2.6 | 4.0 | 4.3 |  | 3037 |
| long-division/m-bottom-spf | prime-slope/square-sum | neither | **2.85** | 1.3 | 4.4 |  |  |  | 2894 |
| prime-landing/m-gpf | steep-and-tall/shared | one | **2.84** | 1.7 | 5.0 | 1.8 |  |  | 11665 |
| prime-staircase/step-back | same-on-both-rulers/prime-start | both | **2.84** | 2.7 | 2.9 |  |  |  | 4225 |
| exact-change/big-bill | whole-intercept/mc-spf | neither | **2.84** | 2.6 | 3.0 |  |  |  | 643 |
| farey-neighbours/mediant-x | triangle-area/legs | neither | **2.84** | 3.0 | 2.6 | 3.0 |  |  | 558 |
| prime-gradient/prime | steep-and-tall/shared | one | **2.83** | 2.1 | 3.6 | 2.8 |  |  | 11688 |
| farey-neighbours/mediant-x | prime-gradient/c-gpf | one | **2.83** | 2.6 | 3.0 |  |  |  | 355 |
| prime-landing/big-prime | same-on-both-rulers/whole-lamp | both | **2.83** | 2.9 | 3.4 | 2.1 |  |  | 21241 |
| prime-staircase/step-back | same-on-both-rulers/steep | both | **2.82** | 2.7 | 2.9 |  |  |  | 4141 |
| prime-gradient/c-gpf | smooth-crossing/shared | one | **2.82** | 1.0 | 3.6 | 3.9 |  |  | 2412 |
| prime-staircase/step-back | same-on-both-rulers/whole-lamp | both | **2.82** | 2.7 | 3.0 |  |  |  | 3895 |
| prime-landing/big-prime | same-on-both-rulers/m-spf | both | **2.82** | 2.9 | 3.4 | 2.2 |  |  | 21348 |
| prime-landing/big-prime | same-on-both-rulers/steep | both | **2.82** | 2.9 | 3.4 | 2.2 |  |  | 21735 |
| prime-gradient/c-gpf | whole-crossing/m-spf | both | **2.82** | 2.3 | 2.7 | 3.4 |  |  | 2261 |
| prime-landing/big-prime | same-on-both-rulers/prime-start | both | **2.82** | 2.9 | 3.4 | 2.1 |  |  | 21836 |
| farey-neighbours/mediant-x | pell-gradient{"D":2,"k":0}/difference | neither | **2.81** | 2.6 | 3.1 |  |  |  | 160 |
| prime-staircase/first-prime | steep-and-tall/shared | one | **2.81** | 2.1 | 3.7 | 2.6 |  |  | 3091 |
| prime-staircase/last-prime | steep-and-tall/shared | one | **2.81** | 2.1 | 3.7 | 2.6 |  |  | 3091 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-slope/matching-c | neither | **2.81** | 2.7 | 2.9 |  |  |  | 6122 |
| prime-landing/big-prime | same-on-both-rulers/m-gpf | both | **2.81** | 2.9 | 3.4 | 2.1 |  |  | 21348 |
| prime-staircase/step-back | same-on-both-rulers/m-gpf | both | **2.81** | 2.7 | 2.9 |  |  |  | 3997 |
| prime-staircase/step-back | same-on-both-rulers/m-spf | both | **2.81** | 2.7 | 2.9 |  |  |  | 3997 |
| pell-gradient{"D":5,"k":0}/share-den | prime-slope/twins | neither | **2.81** | 2.8 |  |  |  |  | 6490 |
| pell-gradient{"D":5,"k":0}/difference | prime-slope/twins | neither | **2.81** | 2.8 |  |  |  |  | 6490 |
| exact-change/big-bill | prime-staircase/near-miss | one | **2.80** | 1.8 | 4.0 | 2.6 |  |  | 3697 |
| prime-gradient/c-gpf | pythagorean-area/whole-legs | both | **2.80** | 1.2 | 3.0 | 4.2 |  |  | 5031 |
| prime-landing/big-prime | same-on-both-rulers/whole-values | both | **2.80** | 2.9 | 3.3 | 2.2 |  |  | 21710 |
| exact-change/big-bill | triangle-area/even | neither | **2.80** | 2.5 | 3.1 |  |  |  | 5848 |
| prime-gradient/c-gpf | pythagorean-area/slanted-square | both | **2.80** | 1.2 | 3.0 | 4.2 |  |  | 5031 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/difference | neither | **2.79** | 2.7 | 3.6 | 2.2 |  |  | 4120 |
| farey-neighbours/mediant-x | triangle-area/even | neither | **2.79** | 3.0 | 2.6 | 2.8 |  |  | 544 |
| m-meets-c/size | prime-gradient/cPrime | one | **2.79** | -0.2 | 2.7 | 5.9 |  |  | 247 |
| prime-landing/prime-gradient | triangle-area/legs | one | **2.79** | 1.5 | 3.2 | 3.6 |  |  | 8403 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-slope/twins | neither | **2.78** | 2.8 |  |  |  |  | 6490 |
| exact-change/big-piles | smooth-gradient/shared | neither | **2.78** | 2.7 | 2.8 | 2.9 |  |  | 1394 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/matching-c | neither | **2.78** | 2.2 | 3.4 |  |  |  | 4179 |
| prime-staircase/near-miss | steep-and-tall/shared | one | **2.78** | 1.1 | 4.4 |  |  |  | 4587 |
| exact-change/big-bill | triangle-area/legs | neither | **2.78** | 2.5 | 3.1 |  |  |  | 5956 |
| prime-staircase/step-back | same-on-both-rulers/whole-values | both | **2.78** | 2.7 | 2.9 |  |  |  | 4141 |
| prime-landing/prime-gradient | triangle-area/even | one | **2.77** | 1.5 | 3.3 | 3.5 |  |  | 8258 |
| farey-neighbours/mediant-x | prime-landing/m-spf | one | **2.77** | 1.2 | 4.3 |  |  |  | 218 |
| prime-gradient/c-spf | smooth-square/shared | one | **2.77** | 1.3 | 4.3 |  |  |  | 6651 |
| farey-neighbours/mediant-x | prime-landing/m-gpf | one | **2.77** | 1.2 | 4.3 |  |  |  | 218 |
| divisibility-ladder/m-gpf | prime-gradient/c-gpf | both | **2.76** | 1.1 | 3.3 | 3.9 |  |  | 3308 |
| prime-gradient/c-gpf | pythagorean-area/prime-height | both | **2.76** | 1.2 | 3.0 | 4.1 |  |  | 5041 |
| farey-neighbours/bottoms | prime-slope/matching-c | neither | **2.76** | 2.8 |  |  |  |  | 55 |
| farey-neighbours/bottoms | prime-slope/square-sum | neither | **2.76** | 2.8 |  |  |  |  | 55 |
| farey-neighbours/bottoms | prime-slope/twins | neither | **2.76** | 2.8 |  |  |  |  | 55 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/matching-c | neither | **2.76** | 2.2 | 3.3 |  |  |  | 4179 |
| exact-change/big-piles | steady-gradient/gcd-c | neither | **2.75** | 2.7 | 2.7 | 2.9 |  |  | 1420 |
| steady-gradient/gcd-c | triangle-area/legs | neither | **2.75** | 2.4 | 2.7 | 3.1 |  |  | 5583 |
| steady-gradient/gcd-c | whole-crossing/m-spf | one | **2.75** | 2.3 | 3.2 |  |  |  | 1933 |
| triangle-area/legs | whole-intercept/gcd-floor-m | neither | **2.75** | 2.4 | 2.7 | 3.1 |  |  | 5576 |
| steady-gradient/gcd-c | triangle-area/even | neither | **2.74** | 2.4 | 2.7 | 3.1 |  |  | 5436 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/share-den | neither | **2.74** | 2.5 | 3.6 | 2.2 |  |  | 7251 |
| whole-crossing/m-spf | whole-intercept/gcd-floor-m | one | **2.74** | 2.3 | 3.2 |  |  |  | 1933 |
| triangle-area/even | whole-intercept/gcd-floor-m | neither | **2.74** | 2.4 | 2.7 | 3.1 |  |  | 5456 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.74** | 1.5 | 3.4 | 3.3 |  |  | 179 |
| near-point/gcd-x | pell-gradient{"D":2,"k":0}/difference | neither | **2.73** | 2.7 | 3.3 | 2.2 |  |  | 4099 |
| prime-landing/big-prime | steep-and-tall/shared | one | **2.72** | 1.7 | 3.6 | 2.9 |  |  | 11866 |
| steep-and-tall/shared | target-gradient/gcd-tops | neither | **2.72** | 2.1 | 3.3 |  |  |  | 9523 |
| exact-change/prime-coins | prime-landing/big-prime | one | **2.72** | 0.7 | 3.5 | 4.0 |  |  | 4330 |
| pell-gradient{"D":6,"k":0}/share-den | prime-slope/twins | neither | **2.72** | 2.7 |  |  |  |  | 6483 |
| pell-gradient{"D":6,"k":0}/difference | prime-slope/twins | neither | **2.72** | 2.7 |  |  |  |  | 6483 |
| whole-area/gcd-x | whole-intercept/gcd-floor-m | neither | **2.71** | 2.5 | 3.0 | 2.7 | 2.6 |  | 6468 |
| prime-slope/matching-c | target-gradient/gcd-tops | neither | **2.71** | 2.4 | 3.0 |  |  |  | 5333 |
| exact-change/big-piles | square-area/spf | one | **2.71** | 0.9 | 2.9 | 4.3 |  |  | 714 |
| prime-gradient/c-spf | square-area/lpf | both | **2.71** | 1.2 | 4.2 |  |  |  | 6681 |
| steep-and-tall/shared | triangle-area/legs | neither | **2.71** | 2.0 | 2.8 | 3.4 |  |  | 8587 |
| smooth-square/shared | steady-gradient/gcd-c | neither | **2.71** | 1.8 | 2.5 | 3.2 | 3.4 |  | 3575 |
| prime-gradient/c-spf | square-area/omega | both | **2.71** | 1.2 | 4.2 |  |  |  | 6744 |
| exact-change/big-piles | square-area/lpf | one | **2.71** | 1.0 | 2.9 | 4.2 |  |  | 714 |
| exact-change/prime-coins | whole-crossing/gcd-num-m | neither | **2.70** | 1.2 | 3.0 | 3.9 |  |  | 889 |
| crossing-check/whole | prime-slope/matching-c | neither | **2.70** | 2.9 | 2.5 |  |  |  | 2980 |
| pythagorean-area/slanted-square | smooth-gradient/shared | one | **2.70** | 2.5 | 2.6 | 3.0 |  |  | 5807 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/square-sum | neither | **2.70** | 2.7 |  |  |  |  | 5953 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-slope/twins | neither | **2.70** | 2.7 |  |  |  |  | 6122 |
| exact-change/prime-coins | same-on-both-rulers/whole-values | one | **2.69** | 1.1 | 3.2 | 3.8 |  |  | 6319 |
| pell-gradient{"D":7,"k":0}/difference | whole-crossing/m-spf | one | **2.69** | 2.7 |  |  |  |  | 2600 |
| crossing-check/size | whole-at-t/gcd-den-m | neither | **2.69** | 1.4 | 2.8 | 3.9 |  |  | 137 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient/prime | one | **2.69** | 3.0 | 2.4 |  |  |  | 12117 |
| prime-gradient/c-spf | square-area/spf | both | **2.69** | 1.2 | 4.1 |  |  |  | 6758 |
| smooth-gradient/shared | whole-area/gcd-x | neither | **2.69** | 2.4 | 3.1 | 2.8 | 2.4 |  | 5927 |
| pell-gradient{"D":2,"k":0}/difference | whole-intercept/gcd-den-m | neither | **2.68** | 2.5 | 2.9 |  |  |  | 1003 |
| pythagorean-area/whole-legs | steep-and-tall/shared | one | **2.68** | 2.0 | 2.7 | 3.4 |  |  | 8876 |
| steep-and-tall/shared | triangle-area/even | neither | **2.68** | 2.0 | 2.8 | 3.3 |  |  | 8387 |
| exact-change/big-bill | square-area/spf | one | **2.68** | 0.9 | 2.8 | 4.3 |  |  | 2428 |
| pythagorean-area/slanted-square | steep-and-tall/shared | one | **2.68** | 2.0 | 2.6 | 3.4 |  |  | 9035 |
| prime-staircase/near-miss | triangle-area/legs | one | **2.67** | 2.2 | 3.2 | 2.7 |  |  | 7707 |
| steady-gradient/gcd-c | whole-area/gcd-x | neither | **2.67** | 2.4 | 3.0 | 2.7 | 2.6 |  | 6040 |
| exact-change/big-bill | prime-staircase/first-prime | one | **2.67** | 3.0 | 3.2 | 1.8 |  |  | 3033 |
| exact-change/big-bill | prime-staircase/last-prime | one | **2.67** | 3.0 | 3.2 | 1.8 |  |  | 3033 |
| farey-neighbours/mediant-x | whole-intercept/spf | neither | **2.67** | 2.9 | 2.5 |  |  |  | 356 |
| prime-staircase/near-miss | whole-area/gcd-den-m | one | **2.67** | 0.7 | 3.1 | 4.2 |  |  | 2571 |
| prime-gradient/c-gpf | prime-landing/m-gpf | both | **2.67** | 0.1 | 4.5 | 3.4 |  |  | 3643 |
| exact-change/prime-coins | same-on-both-rulers/steep | one | **2.67** | 1.1 | 3.2 | 3.6 |  |  | 6361 |
| exact-change/prime-coins | same-on-both-rulers/prime-start | one | **2.66** | 1.1 | 3.1 | 3.8 |  |  | 6292 |
| exact-change/big-bill | square-area/lpf | one | **2.66** | 0.9 | 2.8 | 4.2 |  |  | 2393 |
| exact-change/prime-coins | same-on-both-rulers/m-gpf | one | **2.65** | 1.0 | 3.1 | 3.8 |  |  | 6069 |
| near-point/gcd-x | pell-gradient{"D":2,"k":0}/share-den | neither | **2.65** | 2.5 | 3.3 | 2.2 |  |  | 6834 |
| divisibility-ladder/m-gpf | steady-gradient/divisors | one | **2.65** | 2.3 | 2.1 | 3.1 | 3.1 |  | 8621 |
| exact-change/prime-coins | same-on-both-rulers/m-spf | one | **2.65** | 1.0 | 3.1 | 3.8 |  |  | 6069 |
| prime-staircase/first-prime | triangle-area/legs | one | **2.65** | 2.3 | 2.7 | 3.0 |  |  | 2922 |
| prime-staircase/last-prime | triangle-area/legs | one | **2.65** | 2.3 | 2.7 | 3.0 |  |  | 2922 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-crossing/m-spf | one | **2.65** | 2.6 |  |  |  |  | 2600 |
| near-point/lattice | target-gradient/same-den | neither | **2.65** | 3.1 | 3.0 | 1.8 |  |  | 12494 |
| near-point/gcd-x | target-gradient/gcd-tops | neither | **2.65** | 3.1 | 2.9 | 2.0 |  |  | 12083 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.64** | 1.6 | 3.0 | 3.4 |  |  | 192 |
| pythagorean-area/prime-height | steep-and-tall/shared | one | **2.64** | 2.0 | 2.6 | 3.3 |  |  | 8950 |
| pell-gradient{"D":6,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.64** | 2.6 | 2.7 |  |  |  | 9698 |
| near-point/gcd-x | target-gradient/same-den | neither | **2.64** | 3.1 | 3.0 | 1.8 |  |  | 12138 |
| m-meets-c/size | prime-landing/prime-gradient | one | **2.64** | -0.7 | 2.7 | 5.9 |  |  | 247 |
| pell-gradient{"D":5,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.63** | 3.0 | 2.3 |  |  |  | 13172 |
| prime-gradient/c-spf | triangle-area/legs | one | **2.63** | 1.2 | 2.8 | 4.0 |  |  | 4862 |
| prime-staircase/near-miss | triangle-area/even | one | **2.63** | 2.2 | 3.2 | 2.5 |  |  | 7588 |
| prime-staircase/near-miss | whole-intercept/gcd-den-m | one | **2.63** | 2.0 | 3.2 |  |  |  | 1375 |
| pell-gradient{"D":7,"k":0}/share-den | prime-slope/square-sum | neither | **2.62** | 2.6 |  |  |  |  | 6146 |
| pell-gradient{"D":7,"k":0}/share-den | prime-slope/twins | neither | **2.62** | 2.6 |  |  |  |  | 6146 |
| exact-change/big-bill | prime-landing/m-gpf | one | **2.62** | 2.0 | 3.2 |  |  |  | 6893 |
| exact-change/prime-coins | same-on-both-rulers/whole-lamp | one | **2.62** | 1.0 | 3.1 | 3.8 |  |  | 5923 |
| m-meets-c/meetPrime | prime-gradient/c-spf | one | **2.61** | 0.8 | 3.3 | 3.7 |  |  | 247 |
| square-area/lpf | whole-intercept/gcd-floor-m | one | **2.61** | 1.7 | 2.5 | 3.7 |  |  | 3432 |
| exact-change/prime-coins | prime-staircase/first-prime | one | **2.61** | 1.5 | 3.4 | 2.9 |  |  | 1621 |
| exact-change/prime-coins | prime-staircase/last-prime | one | **2.61** | 1.5 | 3.4 | 2.9 |  |  | 1621 |
| crossing-check/whole | prime-gradient/cPrime | one | **2.61** | 2.6 |  |  |  |  | 4780 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/square-sum | neither | **2.61** | 2.6 |  |  |  |  | 5953 |
| square-area/lpf | steady-gradient/gcd-c | one | **2.61** | 1.7 | 2.4 | 3.7 |  |  | 3592 |
| prime-gradient/c-gpf | whole-crossing/k-gpf | both | **2.61** | -0.1 | 1.6 | 3.0 | 5.9 |  | 1956 |
| prime-staircase/first-prime | triangle-area/even | one | **2.61** | 2.3 | 2.7 | 2.8 |  |  | 2893 |
| prime-staircase/last-prime | triangle-area/even | one | **2.61** | 2.3 | 2.7 | 2.8 |  |  | 2893 |
| smooth-crossing/shared | square-area/spf | one | **2.60** | 1.7 | 3.9 | 2.2 |  |  | 3725 |
| smooth-intercept/shared | square-area/spf | one | **2.60** | 1.7 | 3.9 | 2.2 |  |  | 3734 |
| pell-gradient{"D":6,"k":0}/share-den | target-gradient/gcd-tops | neither | **2.60** | 2.6 |  |  |  |  | 10229 |
| pell-gradient{"D":6,"k":0}/difference | target-gradient/gcd-tops | neither | **2.60** | 2.6 |  |  |  |  | 10229 |
| pell-gradient{"D":6,"k":0}/share-den | target-gradient/same-den | neither | **2.60** | 2.6 |  |  |  |  | 10252 |
| pell-gradient{"D":6,"k":0}/difference | target-gradient/same-den | neither | **2.60** | 2.6 |  |  |  |  | 10252 |
| exact-change/big-bill | prime-landing/m-spf | one | **2.60** | 2.0 | 3.2 |  |  |  | 6427 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-slope/matching-c | neither | **2.60** | 2.1 | 3.0 |  |  |  | 4370 |
| pythagorean-area/whole-legs | smooth-gradient/shared | one | **2.59** | 2.5 | 2.6 | 2.7 |  |  | 5457 |
| pell-gradient{"D":6,"k":0}/pell-c | target-gradient/same-den | neither | **2.59** | 2.6 |  |  |  |  | 9721 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient/c-spf | one | **2.59** | 3.0 | 2.1 |  |  |  | 12372 |
| prime-gradient/c-spf | triangle-area/even | one | **2.59** | 1.2 | 2.8 | 3.8 |  |  | 4730 |
| exact-change/prime-coins | whole-intercept/gcd-den-m | neither | **2.59** | 1.3 | 3.1 | 3.5 |  |  | 898 |
| ruler/far | whole-crossing/k-gpf | both | **2.59** | 1.7 | 2.3 | 2.5 | 2.6 | 3.8 | 10558 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/square-sum | neither | **2.59** | 2.6 |  |  |  |  | 5953 |
| prime-gradient/cPrime | whole-crossing/gcd-num-m | one | **2.59** | 1.7 | 3.4 |  |  |  | 1327 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient/c-gpf | one | **2.58** | 3.0 | 2.1 |  |  |  | 12372 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-crossing/m-spf | one | **2.58** | 2.6 |  |  |  |  | 2600 |
| smooth-gradient/shared | square-area/spf | one | **2.58** | 1.7 | 2.7 | 3.3 |  |  | 3435 |
| prime-staircase/step-back | whole-intercept/mc-spf | one | **2.58** | 3.6 | 1.6 |  |  |  | 727 |
| pythagorean-area/prime-height | smooth-gradient/shared | one | **2.58** | 2.6 | 2.6 | 2.6 |  |  | 5734 |
| pell-gradient{"D":7,"k":0}/difference | prime-slope/matching-c | neither | **2.58** | 1.9 | 3.3 |  |  |  | 3497 |
| prime-gradient/cPrime | pythagorean-area/slanted-square | both | **2.58** | 1.4 | 2.6 | 3.8 |  |  | 5501 |
| prime-gradient/c-gpf | triangle-area/legs | one | **2.57** | 1.1 | 2.8 | 3.8 |  |  | 4805 |
| crossing-check/size | prime-slope/twins | neither | **2.57** | 2.0 | 3.2 |  |  |  | 3010 |
| prime-gradient/c-gpf | prime-staircase/first-prime | both | **2.57** | 0.7 | 3.1 | 3.9 |  |  | 1067 |
| prime-gradient/c-gpf | prime-staircase/last-prime | both | **2.57** | 0.7 | 3.1 | 3.9 |  |  | 1067 |
| prime-gradient/cPrime | pythagorean-area/whole-legs | both | **2.57** | 1.4 | 2.5 | 3.8 |  |  | 5451 |
| farey-neighbours/mediant-x | prime-gradient/prime | one | **2.57** | 2.6 |  |  |  |  | 334 |
| divisibility-ladder/steep | prime-gradient/c-gpf | both | **2.57** | 1.0 | 2.9 | 3.7 |  |  | 3529 |
| pythagorean-area/slanted-square | steady-gradient/gcd-c | one | **2.57** | 2.5 | 2.4 | 2.7 |  |  | 6093 |
| prime-gradient/c-gpf | prime-staircase/near-miss | both | **2.56** | 0.6 | 3.7 | 3.4 |  |  | 3002 |
| prime-staircase/step-back | steep-and-tall/shared | one | **2.56** | 2.1 | 3.0 |  |  |  | 3091 |
| prime-slope/matching-c | whole-intercept/gcd-den-m | neither | **2.55** | 2.6 |  |  |  |  | 1582 |
| divisibility-ladder/steep | whole-area/gcd-den-m | one | **2.55** | 2.6 |  |  |  |  | 9175 |
| pythagorean-area/slanted-square | whole-intercept/gcd-floor-m | one | **2.55** | 2.5 | 2.4 | 2.7 |  |  | 6133 |
| pell-gradient{"D":3,"k":0}/share-den | whole-intercept/gcd-den-m | neither | **2.54** | 1.6 | 2.8 | 3.2 |  |  | 1139 |
| pell-gradient{"D":7,"k":0}/share-den | target-gradient/gcd-tops | neither | **2.54** | 2.5 |  |  |  |  | 9923 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/square-sum | neither | **2.54** | 2.5 |  |  |  |  | 4292 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/square-sum | neither | **2.54** | 2.5 |  |  |  |  | 4292 |
| pell-gradient{"D":7,"k":0}/share-den | target-gradient/same-den | neither | **2.54** | 2.5 |  |  |  |  | 9945 |
| pell-gradient{"D":3,"k":0}/difference | whole-intercept/gcd-den-m | neither | **2.54** | 1.6 | 2.8 | 3.2 |  |  | 1139 |
| prime-staircase/step-back | triangle-area/legs | one | **2.54** | 2.3 | 2.1 | 3.2 |  |  | 2922 |
| pell-gradient{"D":6,"k":0}/share-den | whole-crossing/m-spf | one | **2.54** | 2.5 |  |  |  |  | 2600 |
| pell-gradient{"D":6,"k":0}/difference | whole-crossing/m-spf | one | **2.54** | 2.5 |  |  |  |  | 2600 |
| prime-gradient/cPrime | pythagorean-area/prime-height | both | **2.54** | 1.4 | 2.5 | 3.7 |  |  | 5511 |
| exact-change/big-piles | prime-landing/next-prime | one | **2.53** | 2.6 | 2.5 |  |  |  | 3511 |
| prime-gradient/c-gpf | triangle-area/even | one | **2.53** | 1.1 | 2.8 | 3.7 |  |  | 4679 |
| ruler/far | whole-crossing/k-spf | both | **2.53** | 1.9 | 2.4 | 2.5 | 2.4 | 3.4 | 10175 |
| divisibility-ladder/m-spf | exact-change/big-piles | one | **2.53** | 2.2 | 1.9 | 3.4 |  |  | 1488 |
| near-point/lattice | target-gradient/gcd-tops | neither | **2.53** | 3.1 | 2.5 | 2.0 |  |  | 12440 |
| pell-gradient{"D":7,"k":0}/difference | whole-intercept/mc-spf | neither | **2.52** | 2.5 |  |  |  |  | 797 |
| exact-change/big-piles | near-point/gcd-x | neither | **2.52** | 1.9 | 3.1 |  |  |  | 1764 |
| prime-gradient/c-spf | whole-crossing/m-spf | both | **2.51** | 2.4 | 2.7 | 2.4 |  |  | 2261 |
| sunken-intercept/shared | whole-area/gcd-den-m | neither | **2.51** | 1.4 | 2.8 | 3.0 | 2.8 |  | 6670 |
| pell-gradient{"D":7,"k":0}/share-den | whole-crossing/m-spf | one | **2.51** | 2.5 |  |  |  |  | 2600 |
| m-meets-c/meetPrime | prime-landing/m-spf | one | **2.51** | 0.3 | 3.3 | 3.9 |  |  | 247 |
| prime-gradient/prime | prime-landing/m-spf | both | **2.50** | 0.2 | 2.9 | 4.5 |  |  | 3871 |
| prime-staircase/step-back | triangle-area/even | one | **2.50** | 2.3 | 2.2 | 3.0 |  |  | 2893 |
| exact-change/big-piles | prime-landing/prime-gradient | one | **2.50** | 2.5 |  |  |  |  | 3511 |
| prime-staircase/step-back | whole-intercept/gcd-floor-m | one | **2.50** | 2.5 |  |  |  |  | 2014 |
| pell-gradient{"D":7,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.50** | 2.5 |  |  |  |  | 8809 |
| pell-gradient{"D":7,"k":0}/pell-c | target-gradient/same-den | neither | **2.50** | 2.5 |  |  |  |  | 8832 |
| smooth-square/shared | whole-intercept/gcd-floor-m | neither | **2.50** | 1.7 | 2.6 | 3.2 |  |  | 3419 |
| farey-neighbours/bottoms | near-point/gcd-x | neither | **2.49** | 2.5 |  |  |  |  | 58 |
| m-meets-c/size | smooth-gradient/shared | neither | **2.49** | 1.8 | 1.9 | 3.8 |  |  | 466 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/twins | neither | **2.49** | 2.2 | 2.8 |  |  |  | 4179 |
| prime-landing/big-prime | pythagorean-area/whole-legs | both | **2.49** | 1.6 | 2.9 | 3.0 |  |  | 8615 |
| divisibility-ladder/m-gpf | square-area/lpf | both | **2.49** | 1.1 | 2.3 | 4.0 |  |  | 3255 |
| prime-landing/big-prime | pythagorean-area/slanted-square | both | **2.48** | 1.6 | 2.9 | 3.0 |  |  | 8762 |
| divisibility-ladder/m-spf | square-area/lpf | both | **2.48** | 1.1 | 2.3 | 4.0 |  |  | 3255 |
| smooth-intercept/shared | whole-intercept/spf | neither | **2.48** | 2.5 |  |  |  |  | 4120 |
| divisibility-ladder/steep | square-area/lpf | both | **2.48** | 0.9 | 2.4 | 4.1 |  |  | 3255 |
| pell-gradient{"D":7,"k":0}/difference | target-gradient/gcd-tops | neither | **2.48** | 2.5 |  |  |  |  | 8374 |
| m-meets-c/size | steep-and-tall/shared | neither | **2.48** | 2.9 | 2.0 | 2.5 |  |  | 2190 |
| pell-gradient{"D":7,"k":0}/difference | target-gradient/same-den | neither | **2.48** | 2.5 |  |  |  |  | 8397 |
| pythagorean-area/whole-legs | steady-gradient/gcd-c | one | **2.47** | 2.4 | 2.4 | 2.5 |  |  | 5750 |
| pell-gradient{"D":2,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.47** | 1.5 | 3.4 |  |  |  | 179 |
| same-on-both-rulers/m-spf | whole-intercept/spf | one | **2.47** | 1.6 | 3.1 | 2.7 |  |  | 4394 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/twins | neither | **2.46** | 2.2 | 2.8 |  |  |  | 4179 |
| same-on-both-rulers/whole-lamp | whole-intercept/spf | one | **2.46** | 1.6 | 3.2 | 2.7 |  |  | 4202 |
| pythagorean-area/prime-height | steady-gradient/gcd-c | one | **2.46** | 2.5 | 2.4 | 2.4 |  |  | 6020 |
| prime-landing/big-prime | pythagorean-area/prime-height | both | **2.46** | 1.6 | 2.9 | 2.9 |  |  | 8771 |
| same-on-both-rulers/m-gpf | whole-intercept/spf | one | **2.46** | 1.6 | 3.1 | 2.6 |  |  | 4394 |
| same-on-both-rulers/prime-start | whole-intercept/spf | one | **2.46** | 1.6 | 3.1 | 2.6 |  |  | 4456 |
| crossing-check/whole | pell-gradient{"D":5,"k":0}/difference | neither | **2.46** | 3.8 | 1.3 | 2.2 |  |  | 10631 |
| farey-neighbours/bottoms | near-point/lattice | neither | **2.46** | 2.5 |  |  |  |  | 58 |
| prime-landing/m-spf | triangle-area/legs | one | **2.46** | 1.5 | 1.9 | 3.9 |  |  | 8291 |
| pythagorean-area/whole-legs | whole-intercept/gcd-floor-m | one | **2.45** | 2.4 | 2.4 | 2.5 |  |  | 5788 |
| prime-gradient/cPrime | smooth-square/shared | one | **2.45** | 1.2 | 3.7 |  |  |  | 6830 |
| same-on-both-rulers/steep | whole-intercept/spf | one | **2.45** | 1.6 | 3.1 | 2.6 |  |  | 4388 |
| prime-slope/square-sum | target-gradient/gcd-tops | neither | **2.45** | 2.4 |  |  |  |  | 5333 |
| prime-gradient/c-gpf | prime-staircase/step-back | both | **2.45** | 0.7 | 2.6 | 4.1 |  |  | 1067 |
| prime-gradient/prime | prime-landing/m-gpf | both | **2.45** | 0.1 | 2.9 | 4.4 |  |  | 3897 |
| smooth-gradient/shared | whole-area/gcd-den-m | neither | **2.45** | 2.4 |  |  |  |  | 5927 |
| crossing-check/whole | pell-gradient{"D":5,"k":0}/share-den | neither | **2.45** | 3.8 | 1.3 | 2.2 |  |  | 10631 |
| prime-slope/square-sum | target-gradient/same-den | neither | **2.45** | 2.4 |  |  |  |  | 5333 |
| farey-neighbours/mediant-x | target-gradient/same-den | neither | **2.45** | 2.6 | 2.3 |  |  |  | 337 |
| pythagorean-area/prime-height | whole-intercept/gcd-floor-m | one | **2.44** | 2.5 | 2.4 | 2.4 |  |  | 6059 |
| prime-gradient/cPrime | triangle-area/legs | one | **2.44** | 1.3 | 2.5 | 3.5 |  |  | 5306 |
| same-on-both-rulers/whole-lamp | whole-crossing/k-spf | both | **2.44** | 1.6 | 3.3 | 2.5 |  |  | 4149 |
| pythagorean-area/slanted-square | whole-intercept/gcd-den-m | one | **2.44** | 2.0 | 2.9 |  |  |  | 1498 |
| farey-neighbours/mediant-x | whole-intercept/gcd-den-m | neither | **2.44** | 2.4 | 2.4 |  |  |  | 70 |
| same-on-both-rulers/whole-values | whole-intercept/spf | one | **2.44** | 1.6 | 3.1 | 2.7 |  |  | 4394 |
| divisibility-ladder/m-spf | square-area/omega | both | **2.44** | 1.1 | 2.3 | 3.9 |  |  | 3264 |
| pythagorean-area/whole-legs | whole-intercept/gcd-den-m | one | **2.44** | 2.0 | 2.9 |  |  |  | 1498 |
| prime-landing/big-prime | whole-crossing/k-spf | both | **2.43** | 1.5 | 1.6 | 4.3 |  |  | 4066 |
| same-on-both-rulers/m-spf | whole-crossing/k-spf | both | **2.43** | 1.5 | 3.2 | 2.5 |  |  | 4149 |
| divisibility-ladder/m-prime | square-area/lpf | both | **2.43** | 0.0 | 2.6 | 4.6 |  |  | 2189 |
| target-gradient/gcd-tops | whole-crossing/gcd-num-m | neither | **2.43** | 1.8 | 3.2 | 2.2 |  |  | 1449 |
| exact-change/prime-coins | whole-area/gcd-den-m | neither | **2.43** | 0.3 | 3.5 | 3.6 |  |  | 2043 |
| same-on-both-rulers/m-gpf | whole-crossing/k-spf | both | **2.42** | 1.5 | 3.2 | 2.5 |  |  | 4149 |
| same-on-both-rulers/prime-start | whole-crossing/k-spf | both | **2.42** | 1.6 | 3.2 | 2.5 |  |  | 4251 |
| divisibility-ladder/m-gpf | smooth-square/shared | one | **2.42** | 1.1 | 2.4 | 3.7 |  |  | 3247 |
| divisibility-ladder/m-spf | smooth-square/shared | one | **2.42** | 1.1 | 2.4 | 3.7 |  |  | 3247 |
| long-division/m-bottom-spf | prime-slope/matching-c | neither | **2.42** | 1.3 | 3.5 |  |  |  | 2894 |
| pythagorean-area/prime-height | whole-intercept/gcd-den-m | one | **2.42** | 2.0 | 2.9 |  |  |  | 1498 |
| pell-gradient{"D":6,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.42** | 1.6 | 3.2 |  |  |  | 196 |
| pell-gradient{"D":6,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.42** | 1.6 | 3.2 |  |  |  | 196 |
| same-on-both-rulers/whole-values | whole-crossing/k-spf | both | **2.42** | 1.5 | 3.2 | 2.6 |  |  | 4284 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-intercept/mc-spf | neither | **2.42** | 2.4 |  |  |  |  | 797 |
| prime-gradient/cPrime | triangle-area/even | one | **2.41** | 1.3 | 2.6 | 3.3 |  |  | 5181 |
| prime-landing/m-spf | triangle-area/even | one | **2.41** | 1.6 | 2.0 | 3.7 |  |  | 8157 |
| prime-slope/square-sum | whole-crossing/gcd-num-m | neither | **2.41** | 2.5 | 2.3 |  |  |  | 1541 |
| prime-gradient/c-spf | smooth-intercept/shared | one | **2.41** | 1.2 | 3.6 |  |  |  | 2778 |
| divisibility-ladder/m-spf | exact-change/big-bill | one | **2.41** | 2.0 | 2.0 | 3.2 |  |  | 3504 |
| prime-gradient/c-spf | whole-at-t/gcd-den-m | one | **2.40** | 2.4 |  |  |  |  | 415 |
| pythagorean-area/slanted-square | whole-crossing/gcd-num-m | one | **2.40** | 1.9 | 2.9 |  |  |  | 1461 |
| steady-gradient/gcd-c | whole-area/gcd-den-m | neither | **2.40** | 2.4 |  |  |  |  | 6040 |
| pythagorean-area/whole-legs | whole-crossing/gcd-num-m | one | **2.40** | 2.0 | 2.8 |  |  |  | 1461 |
| smooth-crossing/shared | whole-intercept/spf | neither | **2.40** | 2.4 |  |  |  |  | 3758 |
| farey-neighbours/mediant-x | prime-landing/big-prime | one | **2.40** | 1.2 | 3.6 |  |  |  | 218 |
| square-area/omega | steep-and-tall/shared | one | **2.40** | 1.9 | 2.6 | 2.7 |  |  | 11838 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/square-sum | neither | **2.39** | 2.4 |  |  |  |  | 4292 |
| prime-gradient/cPrime | square-area/lpf | both | **2.39** | 1.2 | 3.6 |  |  |  | 6859 |
| steep-and-tall/shared | whole-intercept/spf | neither | **2.39** | 1.1 | 2.5 | 3.6 |  |  | 3749 |
| prime-gradient/cPrime | square-area/omega | both | **2.39** | 1.2 | 3.6 |  |  |  | 6928 |
| same-on-both-rulers/steep | whole-crossing/k-spf | both | **2.39** | 1.5 | 3.2 |  |  |  | 4246 |
| prime-slope/square-sum | whole-intercept/gcd-den-m | neither | **2.39** | 2.6 | 2.2 |  |  |  | 1582 |
| prime-gradient/c-gpf | whole-intercept/omega | one | **2.39** | 0.9 | 3.0 | 3.3 |  |  | 4730 |
| prime-gradient/c-gpf | whole-at-t/gcd-den-m | one | **2.39** | 2.4 |  |  |  |  | 415 |
| exact-change/prime-coins | prime-staircase/near-miss | one | **2.38** | 0.4 | 4.2 | 2.5 |  |  | 2175 |
| pythagorean-area/prime-height | whole-crossing/gcd-num-m | one | **2.38** | 2.0 | 2.8 |  |  |  | 1461 |
| sunken-intercept/shared | whole-intercept/mc-spf | neither | **2.38** | 2.6 | 2.2 |  |  |  | 1275 |
| whole-area/gcd-den-m | whole-crossing/k-gpf | one | **2.38** | 1.6 | 2.6 | 2.7 | 2.6 |  | 7155 |
| prime-gradient/cPrime | square-area/spf | both | **2.38** | 1.2 | 3.5 |  |  |  | 6942 |
| whole-crossing/gcd-c | whole-intercept/mc-spf | neither | **2.37** | 2.4 | 2.4 |  |  |  | 593 |
| prime-gradient/c-spf | prime-landing/big-prime | both | **2.37** | 0.2 | 2.8 | 4.2 |  |  | 3954 |
| prime-gradient/prime | whole-at-t/gcd-den-m | one | **2.37** | 2.4 |  |  |  |  | 415 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-at-t/gcd-den-m | neither | **2.37** | 1.8 | 3.0 |  |  |  | 232 |
| triangle-area/legs | whole-area/gcd-den-m | neither | **2.37** | 1.0 | 2.9 | 3.2 |  |  | 3245 |
| pell-gradient{"D":6,"k":0}/share-den | whole-intercept/mc-spf | neither | **2.37** | 2.4 |  |  |  |  | 797 |
| pell-gradient{"D":6,"k":0}/difference | whole-intercept/mc-spf | neither | **2.37** | 2.4 |  |  |  |  | 797 |
| prime-staircase/first-prime | smooth-gradient/shared | one | **2.37** | 2.4 |  |  |  |  | 1657 |
| prime-staircase/last-prime | smooth-gradient/shared | one | **2.37** | 2.4 |  |  |  |  | 1657 |
| prime-staircase/step-back | smooth-gradient/shared | one | **2.37** | 2.4 |  |  |  |  | 1657 |
| prime-staircase/step-back | steady-gradient/gcd-c | one | **2.36** | 2.4 |  |  |  |  | 1759 |
| whole-at-t/gcd-c | whole-intercept/spf | neither | **2.36** | 3.2 | 1.5 |  |  |  | 9546 |
| prime-landing/prime-gradient | same-on-both-rulers/prime-start | both | **2.35** | 2.9 | 1.8 |  |  |  | 21706 |
| prime-gradient/cPrime | whole-at-t/gcd-den-m | one | **2.35** | 2.4 |  |  |  |  | 415 |
| exact-change/prime-coins | square-area/spf | one | **2.35** | -1.1 | 3.0 | 5.2 |  |  | 753 |
| farey-neighbours/mediant-x | pythagorean-area/whole-legs | one | **2.35** | 3.0 | 1.7 |  |  |  | 543 |
| exact-change/big-piles | whole-crossing/k-spf | one | **2.35** | 2.3 | 2.4 |  |  |  | 1492 |
| square-area/lpf | steep-and-tall/shared | one | **2.35** | 1.9 | 2.6 | 2.5 |  |  | 11729 |
| farey-neighbours/mediant-x | pythagorean-area/slanted-square | one | **2.34** | 2.9 | 1.8 |  |  |  | 543 |
| pell-gradient{"D":5,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.34** | 2.3 |  |  |  |  | 316 |
| pell-gradient{"D":5,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.34** | 2.3 |  |  |  |  | 316 |
| m-meets-c/meetPrime | near-point/lattice | neither | **2.34** | 2.3 |  |  |  |  | 585 |
| exact-change/big-piles | whole-intercept/spf | neither | **2.34** | 2.3 | 2.4 |  |  |  | 1474 |
| pell-gradient{"D":7,"k":0}/share-den | whole-intercept/mc-spf | neither | **2.34** | 2.3 |  |  |  |  | 797 |
| triangle-area/even | whole-area/gcd-den-m | neither | **2.34** | 1.0 | 3.0 | 3.0 |  |  | 3245 |
| pythagorean-area/slanted-square | whole-area/gcd-den-m | one | **2.33** | 1.4 | 3.3 |  |  |  | 4300 |
| square-area/spf | steep-and-tall/shared | one | **2.33** | 1.9 | 2.6 | 2.5 |  |  | 11860 |
| prime-gradient/c-gpf | prime-landing/big-prime | both | **2.33** | 0.1 | 2.8 | 4.1 |  |  | 4018 |
| farey-neighbours/mediant-x | pythagorean-area/prime-height | one | **2.33** | 3.0 | 1.7 |  |  |  | 543 |
| pythagorean-area/whole-legs | whole-area/gcd-den-m | one | **2.32** | 1.4 | 3.2 |  |  |  | 4300 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.32** | 2.3 |  |  |  |  | 316 |
| triangle-area/even | whole-intercept/gcd-den-m | neither | **2.31** | 1.8 | 2.8 |  |  |  | 1324 |
| prime-staircase/first-prime | whole-at-t/gcd-c | one | **2.31** | 2.3 |  |  |  |  | 2318 |
| prime-staircase/last-prime | whole-at-t/gcd-c | one | **2.31** | 2.3 |  |  |  |  | 2318 |
| prime-staircase/step-back | whole-at-t/gcd-c | one | **2.31** | 2.3 |  |  |  |  | 2318 |
| pythagorean-area/prime-height | whole-area/gcd-den-m | one | **2.30** | 1.4 | 3.2 |  |  |  | 4300 |
| exact-change/prime-coins | prime-staircase/step-back | one | **2.30** | 1.5 | 3.1 |  |  |  | 1621 |
| prime-landing/prime-gradient | same-on-both-rulers/whole-values | both | **2.30** | 2.9 | 1.7 |  |  |  | 21581 |
| triangle-area/legs | whole-intercept/gcd-den-m | neither | **2.30** | 1.8 | 2.8 |  |  |  | 1342 |
| exact-change/prime-coins | pythagorean-area/whole-legs | one | **2.30** | 1.1 | 3.5 |  |  |  | 3411 |
| ruler/prime-gradient | whole-crossing/k-spf | both | **2.29** | 1.9 | 2.4 | 2.5 | 2.4 |  | 10186 |
| ruler/square-area | whole-crossing/k-spf | both | **2.29** | 1.9 | 2.3 | 2.5 | 2.4 |  | 10175 |
| pell-gradient{"D":1,"k":1}/difference | whole-at-t/gcd-den-m | neither | **2.29** | 1.9 | 2.7 |  |  |  | 229 |
| exact-change/prime-coins | pythagorean-area/slanted-square | one | **2.29** | 1.0 | 3.5 |  |  |  | 3411 |
| divisibility-ladder/m-spf | prime-gradient/prime | both | **2.28** | 1.0 | 2.4 | 3.5 |  |  | 3116 |
| m-meets-c/meetPrime | whole-intercept/mc-spf | neither | **2.28** | 2.3 | 2.3 |  |  |  | 57 |
| exact-change/prime-coins | pythagorean-area/prime-height | one | **2.28** | 1.1 | 3.5 |  |  |  | 3411 |
| prime-staircase/near-miss | whole-at-t/gcd-den-m | one | **2.27** | 2.0 | 2.6 |  |  |  | 307 |
| ruler/prime-gradient | whole-crossing/k-gpf | both | **2.27** | 1.7 | 2.3 | 2.5 | 2.6 |  | 10579 |
| ruler/square-area | whole-crossing/k-gpf | both | **2.27** | 1.7 | 2.3 | 2.5 | 2.6 |  | 10558 |
| prime-gradient/c-spf | smooth-crossing/shared | one | **2.27** | 1.0 | 3.6 |  |  |  | 2117 |
| egyptian-line/bottom | long-division/m-top | neither | **2.27** | 1.7 | 2.8 |  |  |  | 452 |
| triangle-area/even | whole-crossing/gcd-num-m | neither | **2.26** | 1.8 | 2.7 |  |  |  | 1284 |
| exact-change/big-bill | whole-intercept/spf | neither | **2.26** | 1.7 | 2.3 | 2.7 |  |  | 2947 |
| prime-landing/prime-gradient | whole-at-t/gcd-den-m | one | **2.26** | 1.5 | 3.1 |  |  |  | 319 |
| euclid-steps/largest-quotient | long-division/m-top | neither | **2.25** | 2.3 |  |  |  |  | 14936 |
| euclid-steps/largest-quotient | long-division/c-period | neither | **2.25** | 2.3 |  |  |  |  | 14936 |
| crossing-check/whole | exact-change/big-piles | neither | **2.25** | 2.3 | 2.3 |  |  |  | 862 |
| whole-crossing/gcd-c | whole-intercept/spf | neither | **2.25** | 2.4 | 2.1 |  |  |  | 4185 |
| triangle-area/legs | whole-crossing/gcd-num-m | neither | **2.25** | 1.8 | 2.7 |  |  |  | 1305 |
| pell-gradient{"D":1,"k":1}/share-den | whole-at-t/gcd-den-m | neither | **2.25** | 1.8 | 2.7 |  |  |  | 231 |
| crossing-check/size | prime-slope/matching-c | neither | **2.24** | 2.0 | 2.5 |  |  |  | 3010 |
| square-area/spf | whole-intercept/gcd-floor-m | one | **2.24** | 1.7 | 2.4 | 2.6 |  |  | 3451 |
| square-area/spf | steady-gradient/gcd-c | one | **2.23** | 1.7 | 2.4 | 2.6 |  |  | 3618 |
| prime-staircase/first-prime | smooth-intercept/shared | one | **2.23** | 2.2 |  |  |  |  | 1399 |
| prime-staircase/last-prime | smooth-intercept/shared | one | **2.23** | 2.2 |  |  |  |  | 1399 |
| prime-staircase/step-back | smooth-intercept/shared | one | **2.23** | 2.2 |  |  |  |  | 1399 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient/c-spf | one | **2.23** | 3.0 | 1.4 |  |  |  | 12117 |
| divisibility-ladder/m-spf | prime-gradient/c-spf | both | **2.23** | 0.9 | 3.6 |  |  |  | 2494 |
| prime-gradient/c-spf | whole-area/gcd-x | one | **2.23** | 1.0 | 3.4 |  |  |  | 5927 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient/c-gpf | one | **2.22** | 3.0 | 1.4 |  |  |  | 12117 |
| near-point/gcd-x | prime-landing/m-spf | one | **2.22** | 2.2 |  |  |  |  | 8976 |
| divisibility-ladder/m-gpf | whole-area/gcd-den-m | one | **2.22** | 2.2 |  |  |  |  | 7293 |
| divisibility-ladder/m-spf | whole-area/gcd-den-m | one | **2.22** | 2.2 |  |  |  |  | 7293 |
| exact-change/prime-coins | whole-intercept/mc-spf | neither | **2.21** | 1.3 | 3.2 |  |  |  | 375 |
| divisibility-ladder/m-prime | prime-staircase/first-prime | both | **2.21** | 2.2 |  |  |  |  | 1990 |
| divisibility-ladder/m-prime | prime-staircase/last-prime | both | **2.21** | 2.2 |  |  |  |  | 1990 |
| divisibility-ladder/m-prime | prime-staircase/step-back | both | **2.21** | 2.2 |  |  |  |  | 1990 |
| near-point/lattice | prime-landing/m-spf | one | **2.21** | 2.2 |  |  |  |  | 9133 |
| near-point/gcd-x | prime-landing/m-gpf | one | **2.21** | 2.2 |  |  |  |  | 8969 |
| euclid-steps/largest-quotient | target-gradient/same-den | neither | **2.20** | 1.9 | 1.8 | 2.9 |  |  | 7508 |
| divisibility-ladder/m-gpf | exact-change/big-bill | one | **2.20** | 2.0 | 1.9 | 2.7 |  |  | 3504 |
| crossing-check/whole | exact-change/prime-coins | neither | **2.20** | 2.2 | 2.2 |  |  |  | 2760 |
| prime-staircase/first-prime | smooth-crossing/shared | one | **2.20** | 2.2 |  |  |  |  | 1342 |
| prime-staircase/last-prime | smooth-crossing/shared | one | **2.20** | 2.2 |  |  |  |  | 1342 |
| prime-staircase/step-back | smooth-crossing/shared | one | **2.20** | 2.2 |  |  |  |  | 1342 |
| crossing-check/whole | pell-gradient{"D":6,"k":0}/pell-c | neither | **2.20** | 3.0 | 1.4 |  |  |  | 6029 |
| near-point/lattice | prime-landing/m-gpf | one | **2.20** | 2.2 |  |  |  |  | 9125 |
| divisibility-ladder/m-prime | prime-gradient/prime | both | **2.19** | 0.6 | 2.3 | 3.8 |  |  | 3116 |
| pell-gradient{"D":6,"k":0}/share-den | prime-slope/square-sum | neither | **2.18** | 2.7 | 1.6 |  |  |  | 6483 |
| pell-gradient{"D":6,"k":0}/difference | prime-slope/square-sum | neither | **2.18** | 2.7 | 1.6 |  |  |  | 6483 |
| prime-landing/prime-gradient | whole-intercept/gcd-den-m | one | **2.18** | 1.0 | 3.3 |  |  |  | 1183 |
| divisibility-ladder/steep | exact-change/big-piles | one | **2.18** | 2.4 | 1.7 | 2.4 |  |  | 1696 |
| smooth-square/shared | whole-crossing/k-gpf | one | **2.18** | 0.1 | 2.0 | 3.5 | 3.2 |  | 2226 |
| crossing-check/whole | pell-gradient{"D":1,"k":1}/difference | neither | **2.18** | 2.3 | 2.3 | 2.0 |  |  | 3450 |
| crossing-check/whole | pell-gradient{"D":5,"k":0}/pell-c | neither | **2.17** | 3.8 | 0.5 | 2.2 |  |  | 10663 |
| crossing-check/whole | pell-gradient{"D":1,"k":1}/share-den | neither | **2.17** | 2.3 | 2.3 | 2.0 |  |  | 3611 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/square-sum | neither | **2.17** | 2.2 |  |  |  |  | 4179 |
| pell-gradient{"D":5,"k":0}/share-den | whole-intercept/gcd-den-m | neither | **2.17** | 1.9 | 1.8 | 2.8 |  |  | 1709 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/square-sum | neither | **2.16** | 2.2 |  |  |  |  | 4179 |
| target-gradient/gcd-tops | whole-at-t/gcd-den-m | neither | **2.16** | 1.8 | 2.5 |  |  |  | 242 |
| pell-gradient{"D":5,"k":0}/difference | whole-intercept/gcd-den-m | neither | **2.16** | 1.9 | 1.8 | 2.8 |  |  | 1709 |
| divisibility-ladder/steep | exact-change/big-bill | one | **2.16** | 2.0 | 1.9 | 2.5 |  |  | 3696 |
| crossing-check/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **2.16** | 3.1 | 1.2 |  |  |  | 6876 |
| crossing-check/whole | pell-gradient{"D":6,"k":0}/difference | neither | **2.16** | 3.1 | 1.2 |  |  |  | 6876 |
| exact-change/big-bill | prime-landing/next-prime | one | **2.15** | 1.9 | 2.4 |  |  |  | 5955 |
| pell-gradient{"D":7,"k":0}/difference | smooth-gradient/shared | neither | **2.15** | 2.2 |  |  |  |  | 3617 |
| divisibility-ladder/m-gpf | exact-change/big-piles | one | **2.15** | 2.2 | 1.8 | 2.5 |  |  | 1488 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient/c-spf | one | **2.15** | 3.0 | 1.3 |  |  |  | 13238 |
| pell-gradient{"D":3,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.15** | 2.0 | 2.3 |  |  |  | 200 |
| farey-neighbours/mediant-x | prime-landing/next-prime | one | **2.15** | 1.3 | 3.0 |  |  |  | 218 |
| euclid-steps/largest-quotient | pell-gradient{"D":2,"k":0}/difference | neither | **2.14** | 2.1 | 1.5 | 2.8 |  |  | 3676 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-slope/square-sum | neither | **2.14** | 2.1 |  |  |  |  | 4370 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-slope/twins | neither | **2.14** | 2.1 |  |  |  |  | 4370 |
| pell-gradient{"D":3,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.14** | 2.0 | 2.3 |  |  |  | 200 |
| m-meets-c/meetPrime | target-gradient/gcd-tops | neither | **2.14** | 2.2 | 2.2 | 2.1 |  |  | 539 |
| farey-neighbours/mediant-x | pell-gradient{"D":2,"k":0}/share-den | neither | **2.14** | 1.2 | 3.1 |  |  |  | 160 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-intercept/mc-spf | neither | **2.14** | 2.5 | 1.8 |  |  |  | 797 |
| prime-landing/big-prime | triangle-area/even | one | **2.14** | 1.5 | 2.8 |  |  |  | 7908 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-intercept/gcd-den-m | neither | **2.14** | 1.5 | 2.8 | 2.2 |  |  | 1139 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient/c-gpf | one | **2.14** | 3.0 | 1.3 |  |  |  | 13238 |
| pell-gradient{"D":7,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **2.13** | 2.1 |  |  |  |  | 3909 |
| divisibility-ladder/m-gpf | prime-gradient/prime | both | **2.13** | 1.0 | 1.9 | 3.5 |  |  | 3116 |
| crossing-check/size | pell-gradient{"D":5,"k":0}/difference | neither | **2.13** | 2.9 | 1.3 | 2.2 |  |  | 10666 |
| pythagorean-area/slanted-square | whole-intercept/spf | one | **2.13** | 1.8 | 2.4 |  |  |  | 5084 |
| exact-change/big-piles | whole-area/gcd-x | neither | **2.12** | 2.3 | 1.9 |  |  |  | 1981 |
| prime-gradient/c-spf | whole-crossing/gcd-c | one | **2.12** | 1.0 | 3.6 | 1.8 |  |  | 2331 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **2.12** | 2.1 |  |  |  |  | 3999 |
| prime-landing/big-prime | triangle-area/legs | one | **2.12** | 1.5 | 2.8 |  |  |  | 8042 |
| pythagorean-area/whole-legs | whole-intercept/spf | one | **2.12** | 1.9 | 2.4 |  |  |  | 4984 |
| crossing-check/size | pell-gradient{"D":5,"k":0}/share-den | neither | **2.12** | 2.9 | 1.3 | 2.2 |  |  | 10666 |
| pythagorean-area/prime-height | whole-intercept/spf | one | **2.12** | 1.9 | 2.4 |  |  |  | 5077 |
| pythagorean-area/whole-legs | whole-crossing/k-spf | both | **2.12** | 1.9 | 2.4 |  |  |  | 5032 |
| pell-gradient{"D":1,"k":1}/difference | whole-crossing/gcd-num-m | neither | **2.12** | 1.6 | 2.4 | 2.4 |  |  | 1421 |
| near-point/gcd-x | prime-slope/matching-c | neither | **2.11** | 1.8 | 2.4 |  |  |  | 2971 |
| farey-neighbours/mediant-x | pell-gradient{"D":2,"k":0}/pell-c | neither | **2.11** | 1.2 | 3.0 |  |  |  | 160 |
| exact-change/prime-coins | prime-landing/m-spf | one | **2.11** | 0.8 | 3.4 |  |  |  | 4477 |
| exact-change/big-piles | smooth-crossing/shared | neither | **2.11** | 3.4 | 0.8 |  |  |  | 2290 |
| square-area/omega | whole-crossing/k-gpf | both | **2.11** | 0.0 | 1.9 | 3.4 | 3.1 |  | 2230 |
| divisibility-ladder/m-prime | prime-gradient/c-spf | both | **2.11** | 0.4 | 3.8 |  |  |  | 2494 |
| pell-gradient{"D":7,"k":0}/pell-c | smooth-gradient/shared | neither | **2.11** | 2.1 |  |  |  |  | 3617 |
| exact-change/big-piles | smooth-intercept/shared | neither | **2.11** | 3.4 | 0.8 |  |  |  | 2275 |
| exact-change/prime-coins | whole-intercept/gcd-floor-m | neither | **2.10** | 0.9 | 2.9 | 2.5 |  |  | 1945 |
| crossing-check/whole | pell-gradient{"D":1,"k":1}/pell-c | neither | **2.10** | 2.3 | 2.3 | 1.8 |  |  | 3681 |
| pythagorean-area/prime-height | whole-crossing/k-spf | both | **2.10** | 1.8 | 2.4 |  |  |  | 5032 |
| prime-landing/prime-gradient | target-gradient/gcd-tops | one | **2.10** | 0.4 | 3.1 | 2.8 |  |  | 3710 |
| crossing-check/size | exact-change/big-piles | neither | **2.10** | 1.9 | 2.3 |  |  |  | 1215 |
| pell-gradient{"D":1,"k":1}/share-den | whole-crossing/gcd-num-m | neither | **2.09** | 1.5 | 2.4 | 2.4 |  |  | 1455 |
| smooth-gradient/shared | whole-intercept/spf | neither | **2.09** | 2.1 |  |  |  |  | 3712 |
| pell-gradient{"D":7,"k":0}/difference | steady-gradient/gcd-c | neither | **2.09** | 2.1 |  |  |  |  | 3617 |
| crossing-check/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **2.09** | 3.0 | 1.2 |  |  |  | 6436 |
| pythagorean-area/slanted-square | whole-crossing/k-spf | both | **2.09** | 1.9 | 2.3 |  |  |  | 5135 |
| target-gradient/same-den | whole-at-t/gcd-den-m | neither | **2.09** | 1.8 | 2.3 |  |  |  | 242 |
| prime-landing/next-prime | steep-and-tall/shared | one | **2.09** | 1.6 | 2.6 |  |  |  | 10613 |
| sunken-intercept/shared | whole-intercept/spf | neither | **2.08** | 2.5 | 1.7 |  |  |  | 7459 |
| exact-change/prime-coins | prime-landing/m-gpf | one | **2.08** | 0.7 | 3.4 |  |  |  | 4406 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **2.08** | 2.1 |  |  |  |  | 4052 |
| prime-slope/twins | whole-crossing/gcd-num-m | neither | **2.08** | 2.5 | 1.6 |  |  |  | 1541 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.07** | 1.9 | 2.3 |  |  |  | 200 |
| divisibility-ladder/m-gpf | prime-gradient/c-spf | both | **2.07** | 0.9 | 3.3 |  |  |  | 2494 |
| exact-change/prime-coins | square-area/lpf | one | **2.07** | -1.1 | 3.0 | 4.3 |  |  | 753 |
| farey-neighbours/mediant-x | prime-slope/matching-c | neither | **2.07** | 2.1 |  |  |  |  | 161 |
| farey-neighbours/mediant-x | prime-slope/square-sum | neither | **2.07** | 2.1 |  |  |  |  | 161 |
| farey-neighbours/mediant-x | prime-slope/twins | neither | **2.07** | 2.1 |  |  |  |  | 161 |
| smooth-square/shared | target-gradient/gcd-tops | neither | **2.07** | 0.8 | 3.4 |  |  |  | 4367 |
| smooth-square/shared | steep-and-tall/shared | neither | **2.06** | 1.9 | 2.7 | 1.6 |  |  | 11621 |
| prime-landing/prime-gradient | same-on-both-rulers/whole-lamp | both | **2.06** | 2.9 | 1.2 |  |  |  | 21112 |
| m-meets-c/meetPrime | prime-gradient/c-gpf | one | **2.06** | 0.8 | 3.3 |  |  |  | 248 |
| exact-change/big-piles | whole-crossing/gcd-c | neither | **2.05** | 3.4 | 0.7 |  |  |  | 2348 |
| exact-change/prime-coins | triangle-area/even | neither | **2.05** | 1.0 | 3.1 |  |  |  | 3059 |
| exact-change/big-bill | whole-crossing/k-spf | one | **2.05** | 1.7 | 2.4 |  |  |  | 2959 |
| pell-gradient{"D":7,"k":0}/pell-c | steady-gradient/gcd-c | neither | **2.05** | 2.0 |  |  |  |  | 3617 |
| euclid-steps/largest-quotient | pell-gradient{"D":7,"k":0}/difference | neither | **2.05** | 1.5 | 1.6 | 3.1 |  |  | 5459 |
| whole-area/gcd-x | whole-at-t/gcd-den-m | neither | **2.04** | 2.0 | 2.2 | 2.0 |  |  | 327 |
| pell-gradient{"D":6,"k":0}/pell-c | smooth-gradient/shared | neither | **2.04** | 2.0 |  |  |  |  | 3617 |
| prime-staircase/near-miss | smooth-gradient/shared | one | **2.04** | 2.0 |  |  |  |  | 3526 |
| pell-gradient{"D":6,"k":0}/share-den | whole-intercept/gcd-den-m | neither | **2.04** | 1.5 | 2.6 |  |  |  | 1345 |
| pell-gradient{"D":6,"k":0}/difference | whole-intercept/gcd-den-m | neither | **2.04** | 1.5 | 2.6 |  |  |  | 1345 |
| pell-gradient{"D":6,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **2.04** | 2.0 |  |  |  |  | 4072 |
| pell-gradient{"D":6,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **2.04** | 2.0 |  |  |  |  | 4072 |
| pell-gradient{"D":1,"k":1}/difference | whole-intercept/gcd-den-m | neither | **2.03** | 2.4 | 1.6 | 2.2 |  |  | 1971 |
| prime-landing/prime-gradient | same-on-both-rulers/steep | both | **2.03** | 2.9 | 1.1 |  |  |  | 21605 |
| prime-landing/prime-gradient | same-on-both-rulers/m-gpf | both | **2.03** | 2.9 | 1.2 |  |  |  | 21218 |
| prime-landing/prime-gradient | same-on-both-rulers/m-spf | both | **2.03** | 2.9 | 1.2 |  |  |  | 21218 |
| pell-gradient{"D":7,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **2.03** | 2.0 |  |  |  |  | 4161 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-slope/matching-c | neither | **2.03** | 2.8 | 1.3 |  |  |  | 6490 |
| pell-gradient{"D":3,"k":0}/share-den | whole-crossing/gcd-num-m | neither | **2.03** | 2.6 | 1.5 |  |  |  | 1710 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-slope/square-sum | neither | **2.03** | 2.8 | 1.3 |  |  |  | 6490 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-slope/square-sum | neither | **2.02** | 2.7 | 1.4 |  |  |  | 6122 |
| pell-gradient{"D":3,"k":0}/difference | whole-crossing/gcd-num-m | neither | **2.02** | 2.6 | 1.4 |  |  |  | 1710 |
| euclid-steps/largest-quotient | square-area/spf | one | **2.02** | 1.7 | 2.3 |  |  |  | 15390 |
| prime-gradient/c-spf | prime-slope/matching-c | one | **2.02** | 2.0 |  |  |  |  | 3997 |
| prime-gradient/c-spf | prime-slope/square-sum | one | **2.02** | 2.0 |  |  |  |  | 3997 |
| prime-gradient/c-spf | prime-slope/twins | one | **2.02** | 2.0 |  |  |  |  | 3997 |
| square-area/omega | target-gradient/gcd-tops | one | **2.02** | 0.8 | 3.3 |  |  |  | 4486 |
| square-area/lpf | target-gradient/gcd-tops | one | **2.02** | 0.8 | 3.3 |  |  |  | 4433 |
| exact-change/prime-coins | triangle-area/legs | neither | **2.02** | 1.0 | 3.0 |  |  |  | 3092 |
| exact-change/big-piles | smooth-square/shared | neither | **2.02** | 1.0 | 3.0 |  |  |  | 714 |
| exact-change/big-piles | near-point/lattice | neither | **2.02** | 2.1 | 1.9 |  |  |  | 1879 |
| crossing-check/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **2.02** | 2.7 | 1.3 |  |  |  | 5082 |
| near-point/gcd-x | prime-gradient/c-spf | one | **2.02** | 1.7 | 2.3 |  |  |  | 5256 |
| prime-staircase/first-prime | whole-crossing/k-spf | both | **2.02** | 0.6 | 1.5 | 3.9 |  |  | 639 |
| prime-staircase/last-prime | whole-crossing/k-spf | both | **2.02** | 0.6 | 1.5 | 3.9 |  |  | 639 |
| pell-gradient{"D":1,"k":1}/share-den | whole-intercept/gcd-den-m | neither | **2.01** | 2.3 | 1.6 | 2.2 |  |  | 2018 |
| m-meets-c/meetPrime | smooth-gradient/shared | neither | **2.01** | 1.8 | 1.7 | 2.5 |  |  | 225 |
| square-area/spf | target-gradient/gcd-tops | one | **2.01** | 0.8 | 3.2 |  |  |  | 4494 |
| near-point/gcd-x | prime-gradient/c-gpf | one | **2.01** | 1.7 | 2.3 |  |  |  | 5246 |
| pell-gradient{"D":2,"k":0}/share-den | whole-intercept/gcd-den-m | neither | **2.00** | 1.1 | 2.9 |  |  |  | 1003 |
| exact-change/big-piles | whole-crossing/k-gpf | one | **2.00** | 2.0 | 1.6 | 2.4 |  |  | 1644 |
| prime-gradient/c-gpf | prime-slope/matching-c | one | **2.00** | 2.0 |  |  |  |  | 3997 |
| prime-gradient/c-gpf | prime-slope/square-sum | one | **2.00** | 2.0 |  |  |  |  | 3997 |
| prime-gradient/c-gpf | prime-slope/twins | one | **2.00** | 2.0 |  |  |  |  | 3997 |

### Anti-aligned pairs (headline < −2), different families

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| near-point/gcd-x | treasure/m-spf | one | **-6.43** | ≤-7.9 | ≤-5.0 |  |  |  | 0 |
| near-point/gcd-x | treasure/square-start | one | **-6.43** | ≤-7.9 | ≤-5.0 |  |  |  | 0 |
| near-point/gcd-x | treasure/prime-gradient | one | **-6.42** | ≤-7.9 | ≤-5.0 |  |  |  | 0 |
| near-point/gcd-x | treasure/m-gpf | one | **-6.42** | ≤-7.8 | ≤-5.0 |  |  |  | 0 |
| near-point/gcd-x | treasure/prime-terms | one | **-6.42** | ≤-7.8 | ≤-5.0 |  |  |  | 0 |
| near-point/lattice | treasure/m-spf | one | **-6.26** | ≤-7.9 | ≤-4.6 |  |  |  | 0 |
| near-point/lattice | treasure/square-start | one | **-6.26** | ≤-7.9 | ≤-4.6 |  |  |  | 0 |
| near-point/lattice | treasure/prime-gradient | one | **-6.25** | ≤-7.9 | ≤-4.6 |  |  |  | 0 |
| near-point/lattice | treasure/m-gpf | one | **-6.25** | ≤-7.9 | ≤-4.6 |  |  |  | 0 |
| near-point/lattice | treasure/prime-terms | one | **-6.25** | ≤-7.9 | ≤-4.6 |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-at-t/gcd-c | neither | **-6.18** | -6.2 |  |  |  |  | 58 |
| pell-gradient{"D":1,"k":1}/difference | whole-at-t/gcd-c | neither | **-6.09** | -6.1 |  |  |  |  | 58 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-at-t/gcd-c | neither | **-6.02** | -6.0 |  |  |  |  | 65 |
| prime-landing/big-prime | sunken-intercept/shared | one | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| prime-landing/prime-gradient | sunken-intercept/shared | one | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| prime-landing/m-gpf | sunken-intercept/shared | one | **-5.99** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check/whole | treasure/m-gpf | one | **-5.98** | -6.4 | ≤-5.6 |  |  |  | 91 |
| crossing-check/whole | treasure/prime-terms | one | **-5.98** | -6.4 | ≤-5.6 |  |  |  | 91 |
| crossing-check/whole | treasure/prime-gradient | one | **-5.97** | -6.4 | ≤-5.6 |  |  |  | 92 |
| prime-landing/m-spf | sunken-intercept/shared | one | **-5.97** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check/whole | treasure/square-start | one | **-5.97** | -6.4 | ≤-5.6 |  |  |  | 93 |
| prime-landing/next-prime | sunken-intercept/shared | one | **-5.94** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check/whole | treasure/m-spf | one | **-5.92** | -6.3 | ≤-5.6 |  |  |  | 103 |
| prime-slope/twins | whole-at-t/gcd-c | neither | **-5.77** | -5.8 |  |  |  |  | 53 |
| prime-slope/square-sum | whole-at-t/gcd-c | neither | **-5.77** | -5.8 |  |  |  |  | 53 |
| prime-slope/matching-c | whole-at-t/gcd-c | neither | **-5.77** | -5.8 |  |  |  |  | 53 |
| long-division/m-bottom-spf | whole-at-t/gcd-c | neither | **-5.74** | -5.7 |  |  |  |  | 114 |
| long-division/m-top | whole-at-t/gcd-c | neither | **-5.74** | -5.7 |  |  |  |  | 114 |
| long-division/c-period | whole-at-t/gcd-c | neither | **-5.74** | -5.7 |  |  |  |  | 114 |
| crossing-check/size | steady-gradient/divisors | neither | **-5.73** | -5.7 |  |  |  |  | 38 |
| prime-landing/next-prime | whole-intercept/omega | one | **-5.64** | ≤-5.6 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | whole-at-t/gcd-c | neither | **-5.57** | -5.6 |  |  |  |  | 119 |
| steep-and-tall/shared | sunken-intercept/shared | neither | **-5.56** | ≤-5.6 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":1,"k":1}/pell-c | one | **-5.56** | ≤-5.6 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-5.55** | ≤-5.6 |  |  |  |  | 10 |
| pell-gradient{"D":2,"k":0}/share-den | whole-at-t/gcd-c | neither | **-5.54** | ≤-5.5 |  |  |  |  | 10 |
| divisibility-ladder/m-prime | pell-gradient{"D":1,"k":1}/share-den | one | **-5.54** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | euclid-steps/largest-quotient | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| exact-change/prime-coins | steep-and-tall/shared | neither | **-5.48** | ≤-5.5 |  |  |  |  | 0 |
| exact-change/prime-coins | target-gradient/same-den | neither | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| exact-change/prime-coins | target-gradient/gcd-tops | neither | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient/cPrime | one | **-5.45** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | long-division/m-bottom-spf | one | **-5.45** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | long-division/m-top | one | **-5.45** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | long-division/c-period | one | **-5.45** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":1,"k":1}/difference | one | **-5.45** | ≤-5.4 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient/prime | one | **-5.43** | ≤-5.4 |  |  |  |  | 0 |
| exact-change/prime-coins | sunken-intercept/shared | neither | **-5.42** | ≤-5.4 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient/c-gpf | one | **-5.42** | ≤-5.4 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient/c-spf | one | **-5.40** | ≤-5.4 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":1,"k":1}/pell-c | one | **-5.24** | ≤-5.2 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":1,"k":1}/share-den | one | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| divisibility-ladder/steep | euclid-steps/largest-quotient | one | **-5.19** | ≤-5.2 |  |  |  |  | 0 |
| prime-staircase/near-miss | whole-intercept/omega | one | **-5.16** | ≤-5.2 |  |  |  |  | 0 |
| long-division/m-top | treasure/m-gpf | one | **-5.14** | -3.3 | -6.9 |  |  |  | 2414 |
| long-division/m-top | treasure/prime-terms | one | **-5.14** | -3.3 | -6.9 |  |  |  | 2414 |
| divisibility-ladder/steep | long-division/m-bottom-spf | one | **-5.14** | ≤-5.1 |  |  |  |  | 0 |
| divisibility-ladder/steep | long-division/m-top | one | **-5.14** | ≤-5.1 |  |  |  |  | 0 |
| divisibility-ladder/steep | long-division/c-period | one | **-5.14** | ≤-5.1 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":1,"k":1}/difference | one | **-5.13** | ≤-5.1 |  |  |  |  | 0 |
| long-division/m-top | treasure/prime-gradient | one | **-5.12** | -3.3 | -6.9 |  |  |  | 2483 |
| pell-gradient{"D":5,"k":0}/pell-c | treasure/m-gpf | one | **-5.11** | -2.8 | -7.5 |  |  |  | 1866 |
| pell-gradient{"D":5,"k":0}/pell-c | treasure/square-start | one | **-5.11** | -2.7 | -7.5 |  |  |  | 1904 |
| long-division/m-top | treasure/square-start | one | **-5.11** | -3.3 | -6.9 |  |  |  | 2505 |
| pell-gradient{"D":5,"k":0}/pell-c | treasure/prime-terms | one | **-5.10** | -2.8 | -7.4 |  |  |  | 1866 |
| pell-gradient{"D":5,"k":0}/pell-c | treasure/m-spf | one | **-5.09** | -2.7 | -7.5 |  |  |  | 1979 |
| long-division/m-top | treasure/m-spf | one | **-5.08** | -3.2 | -6.9 |  |  |  | 2595 |
| divisibility-ladder/m-prime | whole-intercept/spf | one | **-5.08** | ≤-5.1 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":1,"k":1}/pell-c | one | **-5.08** | ≤-5.1 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":1,"k":1}/pell-c | one | **-5.08** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | treasure/prime-gradient | one | **-5.07** | -2.7 | -7.4 |  |  |  | 1892 |
| divisibility-ladder/m-spf | pell-gradient{"D":1,"k":1}/share-den | one | **-5.05** | ≤-5.1 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":1,"k":1}/share-den | one | **-5.05** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | steady-gradient/divisors | neither | **-5.04** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | euclid-steps/largest-quotient | one | **-5.02** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | euclid-steps/largest-quotient | one | **-5.02** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | steady-gradient/divisors | neither | **-5.01** | ≤-5.0 |  |  |  |  | 0 |
| steady-gradient/divisors | target-gradient/same-den | neither | **-5.01** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | steady-gradient/divisors | neither | **-5.01** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | steady-gradient/divisors | neither | **-5.01** | ≤-5.0 |  |  |  |  | 0 |
| steady-gradient/divisors | target-gradient/gcd-tops | neither | **-5.01** | ≤-5.0 |  |  |  |  | 0 |
| near-point/lattice | steady-gradient/divisors | neither | **-4.99** | ≤-5.0 |  |  |  |  | 21 |
| pell-gradient{"D":1,"k":1}/share-den | steady-gradient/divisors | neither | **-4.99** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | steady-gradient/divisors | neither | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | long-division/m-bottom-spf | one | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | long-division/m-bottom-spf | one | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | long-division/m-top | one | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | long-division/m-top | one | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | long-division/c-period | one | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | long-division/c-period | one | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | steady-gradient/divisors | neither | **-4.97** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":1,"k":1}/difference | one | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":1,"k":1}/difference | one | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | steady-gradient/divisors | neither | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | steady-gradient/divisors | neither | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| near-point/gcd-x | steady-gradient/divisors | neither | **-4.95** | ≤-5.0 |  |  |  |  | 21 |
| pell-gradient{"D":5,"k":0}/pell-c | steady-gradient/divisors | neither | **-4.94** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | steady-gradient/divisors | neither | **-4.92** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | steady-gradient/divisors | neither | **-4.92** | ≤-4.9 |  |  |  |  | 0 |
| long-division/m-bottom-spf | steady-gradient/divisors | neither | **-4.91** | ≤-4.9 |  |  |  |  | 0 |
| long-division/m-top | steady-gradient/divisors | neither | **-4.91** | ≤-4.9 |  |  |  |  | 0 |
| long-division/c-period | steady-gradient/divisors | neither | **-4.91** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | steady-gradient/divisors | neither | **-4.90** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | steady-gradient/divisors | neither | **-4.90** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | steady-gradient/divisors | neither | **-4.85** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check/whole | steady-gradient/divisors | neither | **-4.79** | -4.8 |  |  |  |  | 38 |
| divisibility-ladder/m-prime | prime-slope/twins | one | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-slope/square-sum | one | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-slope/matching-c | one | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | steady-gradient/divisors | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| divisibility-ladder/steep | whole-intercept/spf | one | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check/size | treasure/square-start | one | **-4.73** | -3.9 | ≤-5.6 |  |  |  | 601 |
| crossing-check/size | treasure/m-gpf | one | **-4.73** | -3.9 | ≤-5.6 |  |  |  | 600 |
| crossing-check/size | treasure/prime-gradient | one | **-4.73** | -3.9 | ≤-5.6 |  |  |  | 601 |
| crossing-check/size | treasure/prime-terms | one | **-4.73** | -3.9 | ≤-5.6 |  |  |  | 600 |
| exact-change/big-bill | steep-and-tall/shared | neither | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check/size | treasure/m-spf | one | **-4.72** | -3.9 | ≤-5.6 |  |  |  | 613 |
| exact-change/big-bill | target-gradient/same-den | neither | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | target-gradient/gcd-tops | neither | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient/cPrime | one | **-4.70** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient/prime | one | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | sunken-intercept/shared | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient/c-gpf | one | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient/c-spf | one | **-4.65** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | steady-gradient/divisors | neither | **-4.62** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | steady-gradient/divisors | neither | **-4.62** | ≤-4.6 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | whole-intercept/spf | one | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | whole-intercept/spf | one | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| sunken-intercept/shared | treasure/square-start | one | **-4.57** | -3.3 | -7.1 | ≤-3.3 |  |  | 1563 |
| sunken-intercept/shared | treasure/prime-gradient | one | **-4.57** | -3.3 | -7.1 | ≤-3.3 |  |  | 1559 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure/m-gpf | one | **-4.55** | -3.5 | -5.6 |  |  |  | 1570 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure/prime-terms | one | **-4.55** | -3.5 | -5.6 |  |  |  | 1570 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-intercept/gcd-floor-m | neither | **-4.55** | ≤-4.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure/prime-gradient | one | **-4.55** | -3.5 | -5.6 |  |  |  | 1595 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure/square-start | one | **-4.54** | -3.4 | -5.6 |  |  |  | 1621 |
| pell-gradient{"D":1,"k":1}/pell-c | steady-gradient/gcd-c | neither | **-4.53** | ≤-4.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-intercept/gcd-floor-m | neither | **-4.53** | ≤-4.5 |  |  |  |  | 0 |
| sunken-intercept/shared | treasure/prime-terms | one | **-4.52** | -3.3 | -6.9 | ≤-3.3 |  |  | 1555 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure/m-spf | one | **-4.52** | -3.4 | -5.6 |  |  |  | 1670 |
| long-division/m-bottom-spf | whole-intercept/gcd-floor-m | neither | **-4.51** | -4.5 |  |  |  |  | 278 |
| long-division/m-top | whole-intercept/gcd-floor-m | neither | **-4.51** | -4.5 |  |  |  |  | 278 |
| long-division/c-period | whole-intercept/gcd-floor-m | neither | **-4.51** | -4.5 |  |  |  |  | 278 |
| pell-gradient{"D":1,"k":1}/share-den | steady-gradient/gcd-c | neither | **-4.51** | ≤-4.5 |  |  |  |  | 0 |
| sunken-intercept/shared | treasure/m-gpf | one | **-4.49** | -3.3 | -6.8 | ≤-3.3 |  |  | 1555 |
| sunken-intercept/shared | treasure/m-spf | one | **-4.49** | -3.3 | -6.8 | ≤-3.3 |  |  | 1579 |
| pell-gradient{"D":2,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-4.49** | ≤-4.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | steady-gradient/gcd-c | neither | **-4.48** | ≤-4.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | smooth-gradient/shared | neither | **-4.47** | ≤-4.5 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | steady-gradient/gcd-c | neither | **-4.47** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-slope/twins | one | **-4.46** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-slope/square-sum | one | **-4.46** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-slope/matching-c | one | **-4.46** | ≤-4.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | smooth-gradient/shared | neither | **-4.45** | ≤-4.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | treasure/m-gpf | one | **-4.45** | -3.5 | -5.4 |  |  |  | 1558 |
| pell-gradient{"D":1,"k":1}/share-den | treasure/prime-terms | one | **-4.45** | -3.5 | -5.4 |  |  |  | 1558 |
| pell-gradient{"D":1,"k":1}/difference | treasure/m-gpf | one | **-4.44** | -3.4 | -5.4 |  |  |  | 1461 |
| pell-gradient{"D":1,"k":1}/difference | treasure/prime-terms | one | **-4.44** | -3.4 | -5.4 |  |  |  | 1461 |
| pell-gradient{"D":1,"k":1}/share-den | treasure/prime-gradient | one | **-4.44** | -3.4 | -5.4 |  |  |  | 1580 |
| pell-gradient{"D":1,"k":1}/difference | treasure/prime-gradient | one | **-4.44** | -3.4 | -5.4 |  |  |  | 1483 |
| pell-gradient{"D":1,"k":1}/difference | whole-intercept/gcd-floor-m | neither | **-4.44** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | smooth-gradient/shared | neither | **-4.43** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | treasure/square-start | one | **-4.43** | -3.4 | -5.4 |  |  |  | 1606 |
| pell-gradient{"D":1,"k":1}/difference | treasure/square-start | one | **-4.43** | -3.4 | -5.4 |  |  |  | 1509 |
| pell-gradient{"D":2,"k":0}/share-den | smooth-gradient/shared | neither | **-4.42** | ≤-4.4 |  |  |  |  | 0 |
| long-division/m-bottom-spf | steady-gradient/gcd-c | neither | **-4.42** | ≤-4.4 |  |  |  |  | 0 |
| long-division/m-top | steady-gradient/gcd-c | neither | **-4.42** | ≤-4.4 |  |  |  |  | 0 |
| long-division/c-period | steady-gradient/gcd-c | neither | **-4.42** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | steady-gradient/gcd-c | neither | **-4.42** | ≤-4.4 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | smooth-gradient/shared | neither | **-4.42** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | treasure/m-spf | one | **-4.41** | -3.4 | -5.4 |  |  |  | 1655 |
| pell-gradient{"D":1,"k":1}/difference | treasure/m-spf | one | **-4.40** | -3.4 | -5.4 |  |  |  | 1556 |
| long-division/m-bottom-spf | smooth-gradient/shared | neither | **-4.37** | ≤-4.4 |  |  |  |  | 0 |
| long-division/m-top | smooth-gradient/shared | neither | **-4.37** | ≤-4.4 |  |  |  |  | 0 |
| long-division/c-period | smooth-gradient/shared | neither | **-4.37** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | smooth-gradient/shared | neither | **-4.36** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | treasure/m-gpf | one | **-4.30** | -2.8 | -5.8 |  |  |  | 1841 |
| pell-gradient{"D":5,"k":0}/share-den | treasure/m-gpf | one | **-4.30** | -2.8 | -5.8 |  |  |  | 1841 |
| pell-gradient{"D":5,"k":0}/difference | treasure/square-start | one | **-4.30** | -2.8 | -5.8 |  |  |  | 1880 |
| pell-gradient{"D":5,"k":0}/share-den | treasure/square-start | one | **-4.30** | -2.8 | -5.8 |  |  |  | 1880 |
| pell-gradient{"D":5,"k":0}/difference | treasure/prime-terms | one | **-4.29** | -2.8 | -5.8 |  |  |  | 1841 |
| pell-gradient{"D":5,"k":0}/share-den | treasure/prime-terms | one | **-4.29** | -2.8 | -5.8 |  |  |  | 1841 |
| divisibility-ladder/m-spf | prime-slope/twins | one | **-4.29** | ≤-4.3 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-slope/square-sum | one | **-4.29** | ≤-4.3 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-slope/matching-c | one | **-4.29** | ≤-4.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-slope/twins | one | **-4.29** | ≤-4.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-slope/square-sum | one | **-4.29** | ≤-4.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-slope/matching-c | one | **-4.29** | ≤-4.3 |  |  |  |  | 0 |
| m-meets-c/size | treasure/m-spf | one | **-4.28** | -3.5 | ≤-5.1 |  |  |  | 153 |
| m-meets-c/size | treasure/square-start | one | **-4.28** | -3.5 | ≤-5.1 |  |  |  | 153 |
| m-meets-c/size | treasure/prime-gradient | one | **-4.28** | -3.5 | ≤-5.1 |  |  |  | 152 |
| m-meets-c/size | treasure/m-gpf | one | **-4.28** | -3.4 | ≤-5.1 |  |  |  | 152 |
| pell-gradient{"D":5,"k":0}/difference | treasure/m-spf | one | **-4.27** | -2.7 | -5.8 |  |  |  | 1955 |
| pell-gradient{"D":5,"k":0}/share-den | treasure/m-spf | one | **-4.27** | -2.7 | -5.8 |  |  |  | 1955 |
| m-meets-c/size | treasure/prime-terms | one | **-4.27** | -3.4 | ≤-5.1 |  |  |  | 152 |
| pell-gradient{"D":5,"k":0}/difference | treasure/prime-gradient | one | **-4.26** | -2.8 | -5.7 |  |  |  | 1867 |
| pell-gradient{"D":5,"k":0}/share-den | treasure/prime-gradient | one | **-4.26** | -2.8 | -5.7 |  |  |  | 1867 |
| prime-slope/twins | steady-gradient/divisors | neither | **-4.23** | ≤-4.2 |  |  |  |  | 0 |
| prime-slope/square-sum | steady-gradient/divisors | neither | **-4.23** | ≤-4.2 |  |  |  |  | 0 |
| prime-slope/matching-c | steady-gradient/divisors | neither | **-4.23** | ≤-4.2 |  |  |  |  | 0 |
| near-point/lattice | whole-intercept/omega | neither | **-4.22** | -4.2 |  |  |  |  | 101 |
| pell-gradient{"D":2,"k":0}/difference | whole-at-t/gcd-c | neither | **-4.20** | ≤-4.2 |  |  |  |  | 10 |
| near-point/gcd-x | whole-intercept/omega | neither | **-4.18** | -4.2 |  |  |  |  | 101 |
| divisibility-ladder/m-prime | pell-gradient{"D":2,"k":0}/difference | one | **-4.16** | ≤-4.2 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | treasure/m-gpf | one | **-4.11** | -3.3 | -4.9 |  |  |  | 762 |
| pell-gradient{"D":2,"k":0}/difference | treasure/prime-terms | one | **-4.11** | -3.3 | -4.9 |  |  |  | 762 |
| square-area/spf | whole-crossing/m-spf | both | **-4.11** | ≤-4.1 |  |  |  |  | 0 |
| square-area/omega | whole-crossing/m-spf | both | **-4.10** | ≤-4.1 |  |  |  |  | 0 |
| whole-at-t/gcd-c | whole-crossing/m-spf | one | **-4.10** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | treasure/square-start | one | **-4.09** | -3.3 | -4.9 |  |  |  | 781 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-crossing/m-spf | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| square-area/lpf | whole-crossing/m-spf | both | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | treasure/prime-gradient | one | **-4.09** | -3.3 | -4.9 |  |  |  | 773 |
| target-gradient/same-den | whole-crossing/m-spf | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| target-gradient/gcd-tops | whole-crossing/m-spf | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| prime-staircase/step-back | sunken-intercept/shared | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| prime-staircase/last-prime | sunken-intercept/shared | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| prime-staircase/first-prime | sunken-intercept/shared | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | treasure/m-spf | one | **-4.08** | -3.2 | -4.9 |  |  |  | 806 |
| pell-gradient{"D":1,"k":1}/share-den | whole-crossing/m-spf | one | **-4.07** | ≤-4.1 |  |  |  |  | 0 |
| smooth-square/shared | whole-crossing/m-spf | one | **-4.06** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-crossing/m-spf | one | **-4.05** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | whole-crossing/m-spf | one | **-4.05** | ≤-4.0 |  |  |  |  | 0 |
| prime-slope/square-sum | treasure/m-gpf | one | **-4.04** | -2.8 | -5.3 |  |  |  | 1357 |
| euclid-steps/largest-quotient | whole-crossing/m-spf | one | **-4.04** | ≤-4.0 |  |  |  |  | 0 |
| prime-slope/square-sum | treasure/prime-terms | one | **-4.03** | -2.8 | -5.3 |  |  |  | 1357 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-crossing/m-spf | one | **-4.02** | ≤-4.0 |  |  |  |  | 0 |
| prime-slope/square-sum | treasure/prime-gradient | one | **-4.02** | -2.8 | -5.3 |  |  |  | 1381 |
| prime-slope/square-sum | treasure/square-start | one | **-4.01** | -2.7 | -5.3 |  |  |  | 1411 |
| prime-slope/twins | treasure/m-gpf | one | **-4.00** | -2.8 | -5.2 |  |  |  | 1357 |
| prime-slope/twins | treasure/prime-terms | one | **-4.00** | -2.8 | -5.2 |  |  |  | 1357 |
| pell-gradient{"D":5,"k":0}/difference | whole-crossing/m-spf | one | **-4.00** | ≤-4.0 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | whole-crossing/m-spf | one | **-4.00** | ≤-4.0 |  |  |  |  | 0 |
| prime-slope/twins | treasure/prime-gradient | one | **-3.99** | -2.8 | -5.2 |  |  |  | 1381 |
| long-division/m-bottom-spf | whole-crossing/m-spf | one | **-3.99** | ≤-4.0 |  |  |  |  | 0 |
| long-division/m-top | whole-crossing/m-spf | one | **-3.99** | ≤-4.0 |  |  |  |  | 0 |
| long-division/c-period | whole-crossing/m-spf | one | **-3.99** | ≤-4.0 |  |  |  |  | 0 |
| prime-slope/square-sum | treasure/m-spf | one | **-3.98** | -2.7 | -5.3 |  |  |  | 1470 |
| pell-gradient{"D":1,"k":1}/difference | whole-crossing/m-spf | one | **-3.98** | ≤-4.0 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | treasure/m-gpf | one | **-3.98** | -2.9 | -5.1 |  |  |  | 1448 |
| pell-gradient{"D":3,"k":0}/pell-c | treasure/prime-terms | one | **-3.97** | -2.9 | -5.1 |  |  |  | 1448 |
| prime-slope/twins | treasure/square-start | one | **-3.97** | -2.7 | -5.2 |  |  |  | 1411 |
| pell-gradient{"D":3,"k":0}/pell-c | treasure/square-start | one | **-3.97** | -2.9 | -5.1 |  |  |  | 1470 |
| pell-gradient{"D":6,"k":0}/pell-c | treasure/m-gpf | one | **-3.97** | -2.4 | -5.5 |  |  |  | 2095 |
| pell-gradient{"D":6,"k":0}/pell-c | treasure/square-start | one | **-3.96** | -2.4 | -5.5 |  |  |  | 2125 |
| pell-gradient{"D":3,"k":0}/pell-c | treasure/prime-gradient | one | **-3.96** | -2.9 | -5.0 |  |  |  | 1462 |
| pell-gradient{"D":3,"k":0}/pell-c | treasure/m-spf | one | **-3.95** | -2.9 | -5.1 |  |  |  | 1517 |
| crossing-check/size | whole-at-t/gcd-c | neither | **-3.95** | -4.0 |  |  |  |  | 109 |
| prime-slope/twins | treasure/m-spf | one | **-3.94** | -2.7 | -5.2 |  |  |  | 1470 |
| pell-gradient{"D":6,"k":0}/pell-c | treasure/m-spf | one | **-3.94** | -2.4 | -5.5 |  |  |  | 2204 |
| pell-gradient{"D":6,"k":0}/pell-c | treasure/prime-terms | one | **-3.94** | -2.4 | -5.4 |  |  |  | 2095 |
| pell-gradient{"D":6,"k":0}/pell-c | treasure/prime-gradient | one | **-3.93** | -2.4 | -5.4 |  |  |  | 2116 |
| pell-gradient{"D":7,"k":0}/pell-c | treasure/m-gpf | one | **-3.92** | -2.5 | -5.4 |  |  |  | 1965 |
| euclid-steps/largest-quotient | whole-intercept/gcd-floor-m | neither | **-3.92** | -2.3 | -5.5 |  |  |  | 473 |
| pell-gradient{"D":7,"k":0}/pell-c | treasure/square-start | one | **-3.91** | -2.5 | -5.4 |  |  |  | 2007 |
| pell-gradient{"D":3,"k":0}/difference | treasure/m-gpf | one | **-3.90** | -2.7 | -5.1 |  |  |  | 1448 |
| pell-gradient{"D":3,"k":0}/difference | treasure/prime-terms | one | **-3.90** | -2.7 | -5.1 |  |  |  | 1448 |
| pell-gradient{"D":3,"k":0}/share-den | treasure/m-gpf | one | **-3.90** | -2.7 | -5.1 |  |  |  | 1448 |
| pell-gradient{"D":3,"k":0}/share-den | treasure/prime-terms | one | **-3.90** | -2.7 | -5.1 |  |  |  | 1448 |
| pell-gradient{"D":3,"k":0}/difference | treasure/square-start | one | **-3.90** | -2.7 | -5.1 |  |  |  | 1470 |
| pell-gradient{"D":3,"k":0}/share-den | treasure/square-start | one | **-3.90** | -2.7 | -5.1 |  |  |  | 1470 |
| pell-gradient{"D":7,"k":0}/pell-c | treasure/prime-terms | one | **-3.90** | -2.5 | -5.3 |  |  |  | 1965 |
| pell-gradient{"D":7,"k":0}/pell-c | treasure/m-spf | one | **-3.89** | -2.4 | -5.4 |  |  |  | 2092 |
| pell-gradient{"D":3,"k":0}/difference | treasure/prime-gradient | one | **-3.89** | -2.7 | -5.0 |  |  |  | 1462 |
| pell-gradient{"D":3,"k":0}/share-den | treasure/prime-gradient | one | **-3.88** | -2.7 | -5.0 |  |  |  | 1462 |
| pell-gradient{"D":7,"k":0}/pell-c | treasure/prime-gradient | one | **-3.88** | -2.5 | -5.3 |  |  |  | 1996 |
| pell-gradient{"D":3,"k":0}/difference | treasure/m-spf | one | **-3.88** | -2.7 | -5.1 |  |  |  | 1517 |
| pell-gradient{"D":3,"k":0}/share-den | treasure/m-spf | one | **-3.88** | -2.7 | -5.1 |  |  |  | 1517 |
| long-division/m-bottom-spf | treasure/m-gpf | one | **-3.86** | -3.3 | -4.4 |  |  |  | 2414 |
| long-division/m-bottom-spf | treasure/prime-terms | one | **-3.86** | -3.3 | -4.4 |  |  |  | 2414 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-crossing/m-spf | one | **-3.85** | ≤-3.8 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":2,"k":0}/difference | one | **-3.85** | ≤-3.8 |  |  |  |  | 0 |
| long-division/m-bottom-spf | treasure/prime-gradient | one | **-3.84** | -3.3 | -4.4 |  |  |  | 2483 |
| pell-gradient{"D":6,"k":0}/difference | treasure/m-gpf | one | **-3.84** | -2.5 | -5.2 |  |  |  | 2134 |
| pell-gradient{"D":6,"k":0}/share-den | treasure/m-gpf | one | **-3.84** | -2.5 | -5.2 |  |  |  | 2134 |
| pell-gradient{"D":6,"k":0}/difference | treasure/square-start | one | **-3.83** | -2.5 | -5.2 |  |  |  | 2168 |
| pell-gradient{"D":6,"k":0}/share-den | treasure/square-start | one | **-3.83** | -2.5 | -5.2 |  |  |  | 2168 |
| steady-gradient/divisors | whole-crossing/k-gpf | one | **-3.82** | -3.8 |  |  |  |  | 285 |
| long-division/m-bottom-spf | treasure/square-start | one | **-3.82** | -3.3 | -4.4 |  |  |  | 2505 |
| pell-gradient{"D":6,"k":0}/difference | treasure/prime-terms | one | **-3.81** | -2.5 | -5.1 |  |  |  | 2134 |
| pell-gradient{"D":6,"k":0}/share-den | treasure/prime-terms | one | **-3.81** | -2.5 | -5.1 |  |  |  | 2134 |
| pell-gradient{"D":6,"k":0}/difference | treasure/m-spf | one | **-3.81** | -2.4 | -5.2 |  |  |  | 2252 |
| pell-gradient{"D":6,"k":0}/share-den | treasure/m-spf | one | **-3.81** | -2.4 | -5.2 |  |  |  | 2252 |
| prime-slope/matching-c | treasure/m-gpf | one | **-3.80** | -2.8 | -4.8 |  |  |  | 1357 |
| pell-gradient{"D":7,"k":0}/share-den | treasure/m-gpf | one | **-3.80** | -2.5 | -5.1 |  |  |  | 2214 |
| pell-gradient{"D":6,"k":0}/difference | treasure/prime-gradient | one | **-3.80** | -2.5 | -5.1 |  |  |  | 2158 |
| pell-gradient{"D":6,"k":0}/share-den | treasure/prime-gradient | one | **-3.80** | -2.5 | -5.1 |  |  |  | 2158 |
| prime-slope/matching-c | treasure/prime-terms | one | **-3.80** | -2.8 | -4.8 |  |  |  | 1357 |
| long-division/m-bottom-spf | treasure/m-spf | one | **-3.80** | -3.2 | -4.4 |  |  |  | 2595 |
| pell-gradient{"D":7,"k":0}/share-den | treasure/square-start | one | **-3.80** | -2.5 | -5.1 |  |  |  | 2258 |
| prime-slope/matching-c | treasure/prime-gradient | one | **-3.78** | -2.8 | -4.8 |  |  |  | 1381 |
| pell-gradient{"D":7,"k":0}/difference | treasure/m-gpf | one | **-3.78** | -2.4 | -5.1 |  |  |  | 1965 |
| prime-staircase/step-back | whole-intercept/omega | one | **-3.78** | ≤-3.8 |  |  |  |  | 0 |
| prime-staircase/last-prime | whole-intercept/omega | one | **-3.78** | ≤-3.8 |  |  |  |  | 0 |
| prime-staircase/first-prime | whole-intercept/omega | one | **-3.78** | ≤-3.8 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | treasure/prime-terms | one | **-3.78** | -2.5 | -5.1 |  |  |  | 2214 |
| pell-gradient{"D":7,"k":0}/difference | treasure/square-start | one | **-3.78** | -2.4 | -5.1 |  |  |  | 2007 |
| pell-gradient{"D":7,"k":0}/share-den | treasure/m-spf | one | **-3.77** | -2.4 | -5.1 |  |  |  | 2350 |
| pell-gradient{"D":2,"k":0}/share-den | treasure/m-gpf | one | **-3.77** | -2.6 | -4.9 |  |  |  | 1703 |
| pell-gradient{"D":2,"k":0}/share-den | treasure/prime-terms | one | **-3.77** | -2.6 | -4.9 |  |  |  | 1703 |
| pell-gradient{"D":2,"k":0}/share-den | treasure/square-start | one | **-3.77** | -2.6 | -4.9 |  |  |  | 1721 |
| pell-gradient{"D":7,"k":0}/share-den | treasure/prime-gradient | one | **-3.77** | -2.5 | -5.1 |  |  |  | 2246 |
| prime-slope/matching-c | treasure/square-start | one | **-3.77** | -2.7 | -4.8 |  |  |  | 1411 |
| pell-gradient{"D":2,"k":0}/share-den | treasure/m-spf | one | **-3.76** | -2.6 | -4.9 |  |  |  | 1742 |
| pell-gradient{"D":7,"k":0}/difference | treasure/prime-terms | one | **-3.76** | -2.4 | -5.1 |  |  |  | 1965 |
| pell-gradient{"D":2,"k":0}/share-den | treasure/prime-gradient | one | **-3.76** | -2.6 | -4.9 |  |  |  | 1714 |
| pell-gradient{"D":7,"k":0}/difference | treasure/m-spf | one | **-3.75** | -2.4 | -5.1 |  |  |  | 2092 |
| prime-slope/matching-c | treasure/m-spf | one | **-3.75** | -2.7 | -4.8 |  |  |  | 1470 |
| euclid-steps/largest-quotient | treasure/m-gpf | one | **-3.75** | -2.8 | -4.6 |  |  |  | 3124 |
| pell-gradient{"D":7,"k":0}/difference | treasure/prime-gradient | one | **-3.75** | -2.4 | -5.1 |  |  |  | 1996 |
| euclid-steps/largest-quotient | treasure/prime-terms | one | **-3.75** | -2.8 | -4.6 |  |  |  | 3124 |
| prime-slope/twins | steady-gradient/gcd-c | neither | **-3.74** | ≤-3.7 |  |  |  |  | 0 |
| prime-slope/square-sum | steady-gradient/gcd-c | neither | **-3.74** | ≤-3.7 |  |  |  |  | 0 |
| prime-slope/matching-c | steady-gradient/gcd-c | neither | **-3.74** | ≤-3.7 |  |  |  |  | 0 |
| crossing-check/whole | whole-intercept/omega | neither | **-3.73** | -3.7 |  |  |  |  | 74 |
| euclid-steps/largest-quotient | treasure/prime-gradient | one | **-3.73** | -2.8 | -4.6 |  |  |  | 3197 |
| euclid-steps/largest-quotient | treasure/square-start | one | **-3.72** | -2.8 | -4.6 |  |  |  | 3244 |
| whole-area/gcd-den-m | whole-intercept/mc-spf | neither | **-3.71** | -3.7 |  |  |  |  | 60 |
| whole-area/gcd-x | whole-intercept/mc-spf | neither | **-3.71** | -3.7 |  |  |  |  | 60 |
| pell-gradient{"D":3,"k":0}/share-den | whole-crossing/m-spf | one | **-3.70** | ≤-3.7 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-crossing/m-spf | one | **-3.70** | ≤-3.7 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | treasure/m-spf | one | **-3.70** | -2.8 | -4.6 |  |  |  | 3351 |
| prime-slope/twins | smooth-gradient/shared | neither | **-3.69** | ≤-3.7 |  |  |  |  | 0 |
| prime-slope/square-sum | smooth-gradient/shared | neither | **-3.69** | ≤-3.7 |  |  |  |  | 0 |
| prime-slope/matching-c | smooth-gradient/shared | neither | **-3.69** | ≤-3.7 |  |  |  |  | 0 |
| target-gradient/same-den | treasure/m-gpf | one | **-3.68** | -2.5 | -4.9 |  |  |  | 2074 |
| divisibility-ladder/m-spf | pell-gradient{"D":2,"k":0}/difference | one | **-3.68** | ≤-3.7 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":2,"k":0}/difference | one | **-3.68** | ≤-3.7 |  |  |  |  | 0 |
| target-gradient/same-den | treasure/prime-terms | one | **-3.68** | -2.5 | -4.9 |  |  |  | 2074 |
| target-gradient/same-den | treasure/square-start | one | **-3.67** | -2.5 | -4.9 |  |  |  | 2115 |
| target-gradient/same-den | treasure/prime-gradient | one | **-3.66** | -2.5 | -4.9 |  |  |  | 2102 |
| target-gradient/same-den | treasure/m-spf | one | **-3.66** | -2.4 | -4.9 |  |  |  | 2200 |
| steady-gradient/divisors | whole-crossing/k-spf | one | **-3.63** | -3.6 |  |  |  |  | 216 |
| pell-gradient{"D":2,"k":0}/pell-c | treasure/m-gpf | one | **-3.63** | -2.6 | -5.0 | ≤-3.3 |  |  | 1729 |
| pell-gradient{"D":2,"k":0}/pell-c | treasure/square-start | one | **-3.63** | -2.6 | -5.0 | ≤-3.3 |  |  | 1747 |
| pell-gradient{"D":2,"k":0}/pell-c | treasure/prime-terms | one | **-3.63** | -2.6 | -5.0 | ≤-3.3 |  |  | 1729 |
| long-division/m-bottom-spf | prime-staircase/step-back | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/m-bottom-spf | prime-staircase/last-prime | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/m-bottom-spf | prime-staircase/first-prime | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/m-top | prime-staircase/step-back | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/m-top | prime-staircase/last-prime | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/m-top | prime-staircase/first-prime | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/c-period | prime-staircase/step-back | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/c-period | prime-staircase/last-prime | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| long-division/c-period | prime-staircase/first-prime | one | **-3.63** | -3.6 |  |  |  |  | 161 |
| pell-gradient{"D":2,"k":0}/pell-c | treasure/m-spf | one | **-3.63** | -2.6 | -5.0 | ≤-3.3 |  |  | 1772 |
| pell-gradient{"D":2,"k":0}/pell-c | treasure/prime-gradient | one | **-3.62** | -2.6 | -5.0 | ≤-3.3 |  |  | 1740 |
| pell-gradient{"D":2,"k":0}/difference | steady-gradient/divisors | neither | **-3.62** | ≤-3.6 |  |  |  |  | 0 |
| long-division/m-bottom-spf | whole-intercept/omega | neither | **-3.59** | -3.6 |  |  |  |  | 770 |
| long-division/c-period | whole-intercept/omega | neither | **-3.59** | -3.6 |  |  |  |  | 770 |
| long-division/m-bottom-spf | whole-intercept/spf | neither | **-3.56** | -3.6 |  |  |  |  | 413 |
| long-division/m-top | whole-intercept/spf | neither | **-3.56** | -3.6 |  |  |  |  | 413 |
| long-division/c-period | whole-intercept/spf | neither | **-3.56** | -3.6 |  |  |  |  | 413 |
| long-division/m-top | whole-intercept/omega | neither | **-3.53** | -3.6 | -3.5 |  |  |  | 770 |
| egyptian-line/bottom | treasure/m-spf | one | **-3.53** | ≤-3.5 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure/square-start | one | **-3.52** | ≤-3.5 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure/prime-gradient | one | **-3.52** | ≤-3.5 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure/prime-terms | one | **-3.52** | ≤-3.5 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure/m-gpf | one | **-3.52** | ≤-3.5 |  |  |  |  | 0 |
| exact-change/prime-coins | treasure/prime-gradient | one | **-3.48** | -3.2 | -3.3 | -4.0 |  |  | 1786 |
| exact-change/prime-coins | treasure/prime-terms | one | **-3.41** | -3.2 | -3.2 | -3.8 |  |  | 1750 |
| exact-change/prime-coins | treasure/square-start | one | **-3.41** | -3.1 | -3.2 | -3.8 |  |  | 1815 |
| exact-change/big-piles | steep-and-tall/shared | neither | **-3.38** | ≤-3.4 |  |  |  |  | 0 |
| exact-change/prime-coins | treasure/m-gpf | one | **-3.38** | -3.2 | -3.2 | -3.7 |  |  | 1750 |
| exact-change/big-piles | target-gradient/same-den | neither | **-3.36** | ≤-3.4 |  |  |  |  | 0 |
| exact-change/big-piles | target-gradient/gcd-tops | neither | **-3.36** | ≤-3.4 |  |  |  |  | 0 |
| exact-change/big-piles | prime-gradient/cPrime | one | **-3.35** | ≤-3.4 |  |  |  |  | 0 |
| long-division/c-period | treasure/prime-terms | one | **-3.35** | -3.3 |  |  |  |  | 2414 |
| long-division/c-period | treasure/m-gpf | one | **-3.35** | -3.3 |  |  |  |  | 2414 |
| exact-change/prime-coins | treasure/m-spf | one | **-3.33** | -3.1 | -3.2 | -3.7 |  |  | 1868 |
| exact-change/big-piles | prime-gradient/prime | one | **-3.33** | ≤-3.3 |  |  |  |  | 0 |
| near-point/lattice | sunken-intercept/shared | neither | **-3.32** | -3.3 |  |  |  |  | 251 |
| m-meets-c/meetPrime | treasure/m-spf | one | **-3.32** | -2.5 | ≤-4.1 |  |  |  | 143 |
| m-meets-c/meetPrime | treasure/square-start | one | **-3.31** | -2.5 | ≤-4.1 |  |  |  | 143 |
| long-division/c-period | treasure/prime-gradient | one | **-3.31** | -3.3 |  |  |  |  | 2483 |
| m-meets-c/meetPrime | treasure/prime-gradient | one | **-3.31** | -2.5 | ≤-4.1 |  |  |  | 143 |
| m-meets-c/meetPrime | treasure/m-gpf | one | **-3.31** | -2.5 | ≤-4.1 |  |  |  | 143 |
| m-meets-c/meetPrime | treasure/prime-terms | one | **-3.31** | -2.5 | ≤-4.1 |  |  |  | 143 |
| near-point/gcd-x | sunken-intercept/shared | neither | **-3.28** | -3.3 |  |  |  |  | 251 |
| long-division/c-period | treasure/square-start | one | **-3.28** | -3.3 |  |  |  |  | 2505 |
| long-division/c-period | treasure/m-spf | one | **-3.23** | -3.2 |  |  |  |  | 2595 |
| steady-gradient/divisors | treasure/m-spf | one | **-3.23** | -0.9 | ≤-5.5 |  |  |  | 3126 |
| steady-gradient/divisors | treasure/square-start | one | **-3.22** | -0.9 | ≤-5.5 |  |  |  | 3123 |
| steady-gradient/divisors | treasure/prime-gradient | one | **-3.22** | -0.9 | ≤-5.5 |  |  |  | 3119 |
| steady-gradient/divisors | treasure/m-gpf | one | **-3.22** | -0.9 | ≤-5.5 |  |  |  | 3118 |
| steady-gradient/divisors | treasure/prime-terms | one | **-3.22** | -0.9 | ≤-5.5 |  |  |  | 3118 |
| exact-change/big-bill | treasure/prime-gradient | one | **-3.21** | -2.3 | -3.3 | -4.0 |  |  | 1934 |
| target-gradient/gcd-tops | treasure/m-gpf | one | **-3.19** | -2.5 | -3.9 |  |  |  | 2073 |
| target-gradient/gcd-tops | treasure/prime-terms | one | **-3.19** | -2.5 | -3.9 |  |  |  | 2073 |
| target-gradient/gcd-tops | treasure/square-start | one | **-3.18** | -2.5 | -3.9 |  |  |  | 2114 |
| target-gradient/gcd-tops | treasure/prime-gradient | one | **-3.16** | -2.5 | -3.9 |  |  |  | 2101 |
| target-gradient/gcd-tops | treasure/m-spf | one | **-3.14** | -2.4 | -3.9 |  |  |  | 2198 |
| exact-change/big-bill | treasure/prime-terms | one | **-3.14** | -2.4 | -3.2 | -3.8 |  |  | 1895 |
| exact-change/big-bill | treasure/square-start | one | **-3.14** | -2.3 | -3.3 | -3.8 |  |  | 1963 |
| exact-change/big-bill | treasure/m-gpf | one | **-3.08** | -2.4 | -3.2 | -3.7 |  |  | 1895 |
| euclid-steps/largest-quotient | smooth-intercept/shared | neither | **-3.06** | -1.0 | -5.1 |  |  |  | 1044 |
| exact-change/big-bill | treasure/m-spf | one | **-3.04** | -2.3 | -3.2 | -3.7 |  |  | 2020 |
| crossing-check/whole | whole-at-t/gcd-c | neither | **-3.02** | -3.0 |  |  |  |  | 109 |
| near-point/lattice | whole-crossing/m-spf | one | **-2.99** | -3.0 |  |  |  |  | 70 |
| near-point/gcd-x | whole-crossing/m-spf | one | **-2.95** | -3.0 |  |  |  |  | 70 |
| m-meets-c/size | steady-gradient/divisors | neither | **-2.92** | -2.9 |  |  |  |  | 49 |
| steady-gradient/divisors | whole-crossing/gcd-c | neither | **-2.89** | -1.9 | -3.9 |  |  |  | 563 |
| smooth-crossing/shared | steady-gradient/divisors | neither | **-2.87** | -1.9 | -3.9 |  |  |  | 520 |
| pythagorean-area/slanted-square | treasure/prime-gradient | both | **-2.86** | -1.7 | -4.0 |  |  |  | 3811 |
| pythagorean-area/whole-legs | treasure/prime-gradient | both | **-2.86** | -1.7 | -4.0 |  |  |  | 3714 |
| pythagorean-area/whole-legs | treasure/prime-terms | both | **-2.85** | -1.7 | -4.0 |  |  |  | 3679 |
| pythagorean-area/slanted-square | treasure/prime-terms | both | **-2.85** | -1.7 | -4.0 |  |  |  | 3777 |
| pythagorean-area/prime-height | treasure/prime-gradient | both | **-2.84** | -1.7 | -4.0 |  |  |  | 3800 |
| pythagorean-area/prime-height | treasure/prime-terms | both | **-2.83** | -1.7 | -4.0 |  |  |  | 3765 |
| pythagorean-area/whole-legs | treasure/m-gpf | both | **-2.82** | -1.7 | -3.9 |  |  |  | 3679 |
| pythagorean-area/slanted-square | treasure/m-gpf | both | **-2.82** | -1.7 | -3.9 |  |  |  | 3777 |
| exact-change/big-piles | treasure/prime-gradient | one | **-2.81** | -1.2 | -3.3 | -3.9 |  |  | 1733 |
| pythagorean-area/whole-legs | treasure/square-start | both | **-2.81** | -1.7 | -3.9 |  |  |  | 3725 |
| pythagorean-area/prime-height | treasure/m-gpf | both | **-2.81** | -1.7 | -3.9 |  |  |  | 3765 |
| pythagorean-area/slanted-square | treasure/square-start | both | **-2.80** | -1.7 | -3.9 |  |  |  | 3822 |
| pythagorean-area/prime-height | treasure/square-start | both | **-2.79** | -1.7 | -3.9 |  |  |  | 3810 |
| square-area/lpf | treasure/m-gpf | both | **-2.78** | -1.7 | -2.9 | -3.7 |  |  | 4695 |
| euclid-steps/largest-quotient | prime-staircase/last-prime | one | **-2.78** | -1.7 | -3.8 |  |  |  | 307 |
| euclid-steps/largest-quotient | prime-staircase/first-prime | one | **-2.78** | -1.7 | -3.8 |  |  |  | 307 |
| crossing-check/whole | sunken-intercept/shared | neither | **-2.77** | -2.8 |  |  |  |  | 218 |
| pythagorean-area/whole-legs | treasure/m-spf | both | **-2.75** | -1.7 | -3.8 |  |  |  | 3827 |
| crossing-check/size | whole-crossing/m-spf | one | **-2.75** | -2.8 |  |  |  |  | 77 |
| pythagorean-area/slanted-square | treasure/m-spf | both | **-2.75** | -1.7 | -3.8 |  |  |  | 3923 |
| exact-change/big-piles | treasure/prime-terms | one | **-2.74** | -1.2 | -3.3 | -3.8 |  |  | 1696 |
| euclid-steps/largest-quotient | smooth-crossing/shared | neither | **-2.74** | -0.6 | -4.9 |  |  |  | 1392 |
| treasure/prime-gradient | triangle-area/even | one | **-2.74** | -1.8 | -3.7 |  |  |  | 3514 |
| pythagorean-area/prime-height | treasure/m-spf | both | **-2.74** | -1.7 | -3.8 |  |  |  | 3911 |
| treasure/prime-gradient | triangle-area/legs | one | **-2.73** | -1.8 | -3.7 |  |  |  | 3616 |
| exact-change/big-piles | treasure/square-start | one | **-2.73** | -1.2 | -3.3 | -3.8 |  |  | 1761 |
| treasure/m-gpf | whole-area/gcd-den-m | one | **-2.73** | -1.3 | -2.7 | -4.1 |  |  | 5439 |
| prime-staircase/step-back | treasure/square-start | both | **-2.73** | -1.2 | -4.3 |  |  |  | 1571 |
| prime-staircase/step-back | treasure/m-gpf | both | **-2.73** | -1.2 | -4.3 |  |  |  | 1565 |
| treasure/prime-terms | whole-area/gcd-den-m | one | **-2.73** | -1.3 | -2.7 | -4.1 |  |  | 5439 |
| prime-staircase/step-back | treasure/prime-terms | both | **-2.72** | -1.2 | -4.3 |  |  |  | 1565 |
| prime-staircase/step-back | treasure/prime-gradient | both | **-2.72** | -1.2 | -4.3 |  |  |  | 1570 |
| treasure/square-start | whole-area/gcd-den-m | one | **-2.72** | -1.3 | -2.7 | -4.1 |  |  | 5550 |
| treasure/prime-gradient | whole-area/gcd-den-m | one | **-2.72** | -1.3 | -2.7 | -4.1 |  |  | 5508 |
| prime-staircase/step-back | treasure/m-spf | both | **-2.72** | -1.2 | -4.3 |  |  |  | 1596 |
| treasure/m-spf | whole-area/gcd-den-m | one | **-2.72** | -1.3 | -2.7 | -4.1 |  |  | 5666 |
| euclid-steps/largest-quotient | ruler/far | one | **-2.70** | -0.7 | -2.6 | -4.8 |  |  | 5268 |
| exact-change/big-piles | treasure/m-gpf | one | **-2.69** | -1.2 | -3.2 | -3.6 |  |  | 1696 |
| treasure/prime-terms | triangle-area/even | one | **-2.69** | -1.8 | -3.6 |  |  |  | 3482 |
| euclid-steps/largest-quotient | whole-crossing/gcd-c | neither | **-2.68** | -0.6 | -4.7 |  |  |  | 1517 |
| treasure/prime-terms | triangle-area/legs | one | **-2.68** | -1.8 | -3.6 |  |  |  | 3582 |
| treasure/square-start | triangle-area/even | one | **-2.68** | -1.8 | -3.6 |  |  |  | 3523 |
| treasure/square-start | triangle-area/legs | one | **-2.68** | -1.8 | -3.6 |  |  |  | 3625 |
| whole-at-t/gcd-c | whole-intercept/gcd-den-m | neither | **-2.68** | -2.7 |  |  |  |  | 213 |
| square-area/lpf | treasure/prime-terms | both | **-2.67** | -1.7 | -2.9 | -3.4 |  |  | 4695 |
| ruler/far | whole-crossing/gcd-c | one | **-2.66** | 0.2 | -3.4 | -4.8 |  |  | 3307 |
| treasure/m-gpf | triangle-area/even | one | **-2.65** | -1.8 | -3.5 |  |  |  | 3482 |
| ruler/prime-gradient | whole-crossing/gcd-c | one | **-2.65** | 0.2 | -3.4 | -4.8 |  |  | 3309 |
| square-area/lpf | treasure/square-start | both | **-2.65** | -1.7 | -2.9 | -3.4 |  |  | 4816 |
| euclid-steps/largest-quotient | ruler/prime-gradient | one | **-2.65** | -0.6 | -2.5 | -4.8 |  |  | 5313 |
| treasure/m-gpf | triangle-area/legs | one | **-2.65** | -1.8 | -3.5 |  |  |  | 3582 |
| whole-at-t/gcd-c | whole-crossing/k-gpf | one | **-2.65** | -1.6 | -3.7 |  |  |  | 1031 |
| ruler/square-area | whole-crossing/gcd-c | one | **-2.65** | 0.2 | -3.4 | -4.8 |  |  | 3308 |
| euclid-steps/largest-quotient | whole-intercept/omega | neither | **-2.65** | -1.7 | -3.5 |  |  |  | 1292 |
| exact-change/big-piles | treasure/m-spf | one | **-2.64** | -1.1 | -3.2 | -3.6 |  |  | 1816 |
| euclid-steps/largest-quotient | ruler/square-area | one | **-2.64** | -0.7 | -2.5 | -4.8 |  |  | 5271 |
| treasure/m-gpf | whole-area/gcd-x | one | **-2.64** | -1.3 | -1.9 | -4.7 |  |  | 5439 |
| treasure/prime-gradient | whole-area/gcd-x | one | **-2.64** | -1.3 | -1.9 | -4.7 |  |  | 5508 |
| prime-landing/next-prime | whole-crossing/m-spf | both | **-2.64** | -2.6 |  |  |  |  | 122 |
| square-area/lpf | treasure/prime-gradient | both | **-2.64** | -1.7 | -2.9 | -3.3 |  |  | 4783 |
| treasure/m-spf | triangle-area/even | one | **-2.63** | -1.8 | -3.5 |  |  |  | 3616 |
| square-area/omega | treasure/m-gpf | both | **-2.63** | -1.7 | -2.9 | -3.3 |  |  | 4725 |
| treasure/m-spf | triangle-area/legs | one | **-2.63** | -1.7 | -3.5 |  |  |  | 3722 |
| same-on-both-rulers/whole-values | steady-gradient/divisors | one | **-2.63** | -1.8 | -3.4 |  |  |  | 1408 |
| square-area/omega | treasure/prime-terms | both | **-2.63** | -1.7 | -2.9 | -3.3 |  |  | 4725 |
| treasure/m-spf | whole-area/gcd-x | one | **-2.61** | -1.3 | -1.8 | -4.7 |  |  | 5666 |
| treasure/square-start | whole-area/gcd-x | one | **-2.61** | -1.3 | -1.8 | -4.7 |  |  | 5550 |
| treasure/prime-terms | whole-area/gcd-x | one | **-2.60** | -1.3 | -1.8 | -4.7 |  |  | 5439 |
| smooth-square/shared | treasure/m-gpf | one | **-2.60** | -1.7 | -2.9 | -3.3 |  |  | 4665 |
| smooth-square/shared | treasure/prime-terms | one | **-2.60** | -1.7 | -2.9 | -3.3 |  |  | 4665 |
| prime-landing/m-spf | whole-intercept/omega | one | **-2.59** | -2.6 |  |  |  |  | 594 |
| same-on-both-rulers/prime-start | steady-gradient/divisors | one | **-2.59** | -1.8 | -3.4 |  |  |  | 1401 |
| same-on-both-rulers/steep | steady-gradient/divisors | one | **-2.58** | -1.8 | -3.4 |  |  |  | 1408 |
| square-area/lpf | treasure/m-spf | both | **-2.57** | -1.6 | -2.8 | -3.3 |  |  | 4947 |
| same-on-both-rulers/m-spf | steady-gradient/divisors | one | **-2.56** | -1.8 | -3.3 |  |  |  | 1408 |
| same-on-both-rulers/m-gpf | steady-gradient/divisors | one | **-2.56** | -1.8 | -3.3 |  |  |  | 1408 |
| ruler/far | whole-at-t/gcd-c | one | **-2.55** | -1.2 | -3.9 |  |  |  | 2771 |
| same-on-both-rulers/whole-lamp | steady-gradient/divisors | one | **-2.55** | -1.8 | -3.3 |  |  |  | 1395 |
| ruler/prime-gradient | whole-at-t/gcd-c | one | **-2.54** | -1.2 | -3.9 |  |  |  | 2798 |
| ruler/square-area | whole-at-t/gcd-c | one | **-2.54** | -1.2 | -3.9 |  |  |  | 2771 |
| square-area/omega | treasure/prime-gradient | both | **-2.49** | -1.7 | -2.9 | -2.9 |  |  | 4814 |
| crossing-check/whole | whole-crossing/k-gpf | one | **-2.48** | -2.5 |  |  |  |  | 153 |
| square-area/omega | treasure/square-start | both | **-2.48** | -1.7 | -2.9 | -2.9 |  |  | 4846 |
| m-meets-c/meetPrime | whole-intercept/omega | neither | **-2.47** | -2.5 |  |  |  |  | 32 |
| crossing-check/whole | divisibility-ladder/m-prime | one | **-2.47** | -2.5 |  |  |  |  | 138 |
| long-division/m-bottom-spf | smooth-intercept/shared | neither | **-2.46** | -2.5 |  |  |  |  | 637 |
| long-division/c-period | smooth-intercept/shared | neither | **-2.46** | -2.5 |  |  |  |  | 637 |
| ruler/far | steady-gradient/divisors | one | **-2.45** | -1.4 | -3.6 |  |  |  | 2833 |
| smooth-square/shared | treasure/prime-gradient | one | **-2.45** | -1.7 | -2.9 | -2.8 |  |  | 4753 |
| smooth-square/shared | treasure/square-start | one | **-2.45** | -1.6 | -2.9 | -2.8 |  |  | 4785 |
| egyptian-line/bottom | whole-crossing/k-gpf | one | **-2.44** | -2.4 |  |  |  |  | 31 |
| square-area/omega | treasure/m-spf | both | **-2.44** | -1.6 | -2.8 | -2.9 |  |  | 4979 |
| m-meets-c/size | same-on-both-rulers/prime-start | one | **-2.44** | -2.4 |  |  |  |  | 89 |
| m-meets-c/size | same-on-both-rulers/steep | one | **-2.44** | -2.4 |  |  |  |  | 89 |
| m-meets-c/size | same-on-both-rulers/m-spf | one | **-2.43** | -2.4 |  |  |  |  | 89 |
| m-meets-c/size | same-on-both-rulers/m-gpf | one | **-2.43** | -2.4 |  |  |  |  | 89 |
| ruler/prime-gradient | steady-gradient/divisors | one | **-2.41** | -1.3 | -3.5 |  |  |  | 2873 |
| m-meets-c/size | same-on-both-rulers/whole-lamp | one | **-2.41** | -2.4 |  |  |  |  | 89 |
| square-area/lpf | whole-intercept/mc-spf | one | **-2.41** | -2.4 |  |  |  |  | 110 |
| smooth-square/shared | treasure/m-spf | one | **-2.41** | -1.6 | -2.8 | -2.8 |  |  | 4904 |
| smooth-square/shared | whole-intercept/mc-spf | neither | **-2.38** | -2.4 |  |  |  |  | 110 |
| ruler/square-area | steady-gradient/divisors | one | **-2.37** | -1.4 | -3.4 |  |  |  | 2834 |
| square-area/spf | treasure/m-gpf | both | **-2.31** | -1.7 | -2.9 |  |  |  | 4730 |
| square-area/spf | treasure/prime-terms | both | **-2.30** | -1.7 | -2.9 |  |  |  | 4730 |
| square-area/spf | whole-intercept/mc-spf | one | **-2.30** | -2.3 |  |  |  |  | 116 |
| square-area/spf | treasure/prime-gradient | both | **-2.30** | -1.7 | -2.9 |  |  |  | 4818 |
| square-area/omega | whole-intercept/mc-spf | one | **-2.30** | -2.3 |  |  |  |  | 116 |
| m-meets-c/size | whole-intercept/omega | neither | **-2.29** | -2.3 |  |  |  |  | 74 |
| square-area/spf | treasure/square-start | both | **-2.28** | -1.7 | -2.9 |  |  |  | 4851 |
| treasure/square-start | whole-crossing/k-gpf | both | **-2.24** | 0.0 | -2.3 | -4.4 |  |  | 5656 |
| square-area/spf | treasure/m-spf | both | **-2.22** | -1.6 | -2.8 |  |  |  | 4983 |
| prime-staircase/last-prime | treasure/m-gpf | both | **-2.20** | -1.2 | -3.2 |  |  |  | 1565 |
| prime-staircase/first-prime | treasure/m-gpf | both | **-2.20** | -1.2 | -3.2 |  |  |  | 1565 |
| prime-staircase/last-prime | treasure/m-spf | both | **-2.20** | -1.2 | -3.2 |  |  |  | 1596 |
| prime-staircase/first-prime | treasure/m-spf | both | **-2.20** | -1.2 | -3.2 |  |  |  | 1596 |
| prime-staircase/last-prime | treasure/prime-terms | both | **-2.20** | -1.2 | -3.2 |  |  |  | 1565 |
| prime-staircase/first-prime | treasure/prime-terms | both | **-2.20** | -1.2 | -3.2 |  |  |  | 1565 |
| prime-staircase/last-prime | treasure/square-start | both | **-2.19** | -1.2 | -3.2 |  |  |  | 1571 |
| prime-staircase/first-prime | treasure/square-start | both | **-2.19** | -1.2 | -3.2 |  |  |  | 1571 |
| prime-staircase/last-prime | treasure/prime-gradient | both | **-2.19** | -1.2 | -3.2 |  |  |  | 1570 |
| prime-staircase/first-prime | treasure/prime-gradient | both | **-2.19** | -1.2 | -3.2 |  |  |  | 1570 |
| treasure/prime-gradient | whole-intercept/gcd-floor-m | one | **-2.18** | -0.5 | -1.9 | -4.1 |  |  | 3859 |
| treasure/prime-terms | whole-intercept/gcd-floor-m | one | **-2.18** | -0.5 | -1.9 | -4.1 |  |  | 3855 |
| steady-gradient/gcd-c | treasure/prime-gradient | one | **-2.18** | -0.5 | -1.9 | -4.1 |  |  | 3819 |
| steady-gradient/gcd-c | treasure/prime-terms | one | **-2.18** | -0.5 | -1.9 | -4.1 |  |  | 3816 |
| euclid-steps/largest-quotient | prime-landing/big-prime | one | **-2.15** | -0.6 | -3.7 |  |  |  | 3653 |
| prime-gradient/c-spf | steady-gradient/divisors | one | **-2.15** | -2.1 |  |  |  |  | 538 |
| prime-staircase/near-miss | treasure/prime-terms | both | **-2.15** | -1.6 | -2.6 |  |  |  | 3362 |
| prime-staircase/near-miss | treasure/prime-gradient | both | **-2.14** | -1.6 | -2.6 |  |  |  | 3389 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-crossing/k-gpf | one | **-2.14** | -0.6 | -3.7 |  |  |  | 1529 |
| euclid-steps/largest-quotient | sunken-intercept/shared | neither | **-2.11** | -0.7 | -2.2 | -3.4 |  |  | 3113 |
| ruler/far | whole-intercept/omega | one | **-2.10** | -0.8 | -2.0 | -3.5 |  |  | 3938 |
| prime-landing/m-gpf | whole-intercept/omega | one | **-2.09** | -2.1 |  |  |  |  | 1315 |
| prime-staircase/near-miss | treasure/m-gpf | both | **-2.08** | -1.6 | -2.5 |  |  |  | 3362 |
| ruler/prime-gradient | whole-intercept/omega | one | **-2.08** | -0.8 | -1.9 | -3.5 |  |  | 3959 |
| prime-staircase/near-miss | treasure/square-start | both | **-2.08** | -1.6 | -2.5 |  |  |  | 3397 |
| prime-staircase/near-miss | treasure/m-spf | both | **-2.08** | -1.6 | -2.5 |  |  |  | 3453 |
| ruler/square-area | whole-intercept/omega | one | **-2.07** | -0.8 | -1.9 | -3.5 |  |  | 3939 |
| long-division/m-top | smooth-intercept/shared | neither | **-2.06** | -2.5 | -1.7 |  |  |  | 637 |
| prime-landing/next-prime | treasure/square-start | both | **-2.06** | 0.4 | -4.5 |  |  |  | 13070 |
| prime-landing/next-prime | treasure/m-gpf | both | **-2.05** | 0.4 | -4.5 |  |  |  | 13001 |
| prime-landing/next-prime | treasure/prime-gradient | both | **-2.05** | 0.4 | -4.5 |  |  |  | 13041 |
| prime-landing/next-prime | treasure/prime-terms | both | **-2.05** | 0.4 | -4.5 |  |  |  | 13001 |
| prime-landing/next-prime | treasure/m-spf | both | **-2.05** | 0.4 | -4.5 |  |  |  | 13219 |
| treasure/m-gpf | whole-intercept/gcd-den-m | one | **-2.04** | -0.7 | -2.3 | -3.1 |  |  | 1676 |
| treasure/square-start | whole-intercept/gcd-den-m | one | **-2.03** | -0.7 | -2.3 | -3.1 |  |  | 1694 |
| treasure/prime-terms | whole-intercept/gcd-den-m | one | **-2.03** | -0.7 | -2.3 | -3.1 |  |  | 1676 |
| treasure/prime-gradient | whole-intercept/gcd-den-m | one | **-2.03** | -0.7 | -2.3 | -3.1 |  |  | 1686 |
| treasure/m-spf | whole-intercept/gcd-den-m | one | **-2.02** | -0.6 | -2.3 | -3.1 |  |  | 1730 |
| treasure/m-gpf | whole-intercept/spf | one | **-2.01** | -0.6 | -3.4 |  |  |  | 4263 |
| treasure/m-spf | whole-intercept/spf | one | **-2.01** | -0.6 | -3.4 |  |  |  | 4322 |
| treasure/prime-gradient | whole-intercept/spf | one | **-2.00** | -0.6 | -3.4 |  |  |  | 4275 |

### Two tie-breakers of one family (aligned through the shared primary; never seat a family twice)

| Family | pairs | mean headline | min | max |
|---|---:|---:|---:|---:|
| crossing-check | 1 | 7.03 | 7.03 | 7.03 |
| divisibility-ladder | 6 | 7.92 | 7.74 | 8.14 |
| exact-change | 3 | 7.08 | 6.80 | 7.26 |
| long-division | 3 | 4.07 | 4.02 | 4.09 |
| m-meets-c | 1 | 7.19 | 7.19 | 7.19 |
| near-point | 1 | 7.13 | 7.13 | 7.13 |
| pell-gradient | 153 | 3.45 | 0.11 | 8.65 |
| prime-gradient | 6 | 5.63 | 4.94 | 7.68 |
| prime-landing | 10 | 4.91 | 4.01 | 6.72 |
| prime-slope | 3 | 4.83 | 4.77 | 4.88 |
| prime-staircase | 6 | 8.10 | 7.76 | 8.33 |
| pythagorean-area | 3 | 6.94 | 6.93 | 6.95 |
| ruler | 3 | 3.92 | 3.38 | 4.88 |
| same-on-both-rulers | 15 | 6.41 | 5.50 | 8.23 |
| square-area | 3 | 6.34 | 5.19 | 7.67 |
| steady-gradient | 1 | 5.00 | 5.00 | 5.00 |
| target-gradient | 1 | 7.13 | 7.13 | 7.13 |
| treasure | 10 | 3.93 | 3.92 | 3.95 |
| triangle-area | 1 | 5.99 | 5.99 | 5.99 |
| whole-area | 1 | 6.29 | 6.29 | 6.29 |
| whole-at-t | 1 | 0.69 | 0.69 | 0.69 |
| whole-crossing | 10 | 2.28 | -0.56 | 5.93 |
| whole-intercept | 9 | 3.01 | 1.23 | 5.39 |

### Rules: marginal bits of each upper set (−log2 π(A ≥ t); blank: empty) and effective draws in it

| Rule | dealt | 4 b | 6 b | 8 b | 10 b | 12 b | ESS at 4 b | ESS at 12 b |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| crossing-check/size |  | 4.2 | 6.0 | 8.1 | 10.6 | 14.1 | 20131 | 27 |
| crossing-check/whole |  | 5.1 | 6.0 | 8.0 | 9.9 |  | 13201 | 0 |
| divisibility-ladder/m-gpf | yes | 4.5 | 6.1 | 8.1 | 10.4 | 13.0 | 22691 | 212 |
| divisibility-ladder/m-prime | yes | 4.0 | 6.0 | 8.4 | 10.7 | 12.3 | 24459 | 223 |
| divisibility-ladder/m-spf | yes | 4.5 | 6.1 | 8.1 | 11.0 | 12.1 | 22691 | 270 |
| divisibility-ladder/steep | yes | 4.3 | 6.0 | 8.0 | 10.0 | 11.9 | 24647 | 342 |
| egyptian-line/bottom |  | 8.4 | 8.4 | 8.4 | 9.9 | 11.8 | 1588 | 464 |
| euclid-steps/largest-quotient |  | 4.0 | 6.2 | 8.2 | 10.0 | 11.8 | 38669 | 740 |
| exact-change/big-bill |  | 4.9 | 6.1 | 8.1 | 10.1 | 12.3 | 18736 | 254 |
| exact-change/big-piles |  | 6.2 | 6.2 | 8.6 | 10.4 |  | 6992 | 0 |
| exact-change/prime-coins |  | 4.1 | 6.3 | 8.2 | 10.3 |  | 20918 | 0 |
| farey-neighbours/bottoms |  | 11.7 | 11.7 | 11.7 | 11.7 | 13.8 | 191 | 60 |
| farey-neighbours/mediant-x |  | 8.7 | 8.7 | 8.7 | 11.0 | 12.8 | 971 | 88 |
| long-division/c-period |  | 4.1 |  |  |  |  | 39740 | 0 |
| long-division/m-bottom-spf |  | 4.1 | 9.0 | 9.0 |  |  | 39740 | 0 |
| long-division/m-top |  | 4.1 | 6.0 |  |  |  | 39740 | 0 |
| m-meets-c/meetPrime |  | 7.5 | 7.5 | 8.0 | 10.7 |  | 2263 | 0 |
| m-meets-c/size |  | 6.5 | 6.5 | 8.0 | 10.3 | 11.9 | 4560 | 157 |
| near-point/gcd-x |  | 4.0 | 6.6 | 7.9 | 10.0 |  | 22795 | 0 |
| near-point/lattice |  | 4.0 | 7.0 | 7.9 | 10.0 |  | 23308 | 0 |
| pell-gradient{"D":1,"k":1}/difference |  | 4.1 | 6.6 | 8.2 | 10.6 | 13.0 | 25822 | 130 |
| pell-gradient{"D":2,"k":0}/difference |  | 5.4 | 6.0 | 9.1 | 10.4 | 13.8 | 11730 | 87 |
| pell-gradient{"D":3,"k":0}/difference |  | 4.4 | 6.0 | 9.1 | 11.4 | 14.7 | 20695 | 60 |
| pell-gradient{"D":5,"k":0}/difference |  | 4.1 | 7.7 | 8.0 | 12.1 | 12.1 | 26244 | 168 |
| pell-gradient{"D":6,"k":0}/difference |  | 4.0 | 6.4 | 10.3 | 10.3 | 12.6 | 26027 | 194 |
| pell-gradient{"D":7,"k":0}/difference |  | 4.1 | 6.5 | 8.4 | 12.5 | 12.5 | 23486 | 130 |
| pell-gradient{"D":1,"k":1}/pell-c |  | 4.0 | 6.4 | 8.0 | 10.3 | 16.6 | 27801 | 15 |
| pell-gradient{"D":2,"k":0}/pell-c |  | 4.0 | 6.0 | 7.9 | 9.7 |  | 22567 | 0 |
| pell-gradient{"D":3,"k":0}/pell-c |  | 4.2 | 6.0 | 8.1 | 10.2 | 15.1 | 22372 | 45 |
| pell-gradient{"D":5,"k":0}/pell-c |  | 4.1 | 6.0 | 8.1 | 10.1 |  | 26580 | 0 |
| pell-gradient{"D":6,"k":0}/pell-c |  | 4.0 | 6.1 | 8.1 | 10.3 | 12.1 | 24850 | 249 |
| pell-gradient{"D":7,"k":0}/pell-c |  | 4.1 | 6.3 | 8.3 | 11.7 |  | 24342 | 0 |
| pell-gradient{"D":1,"k":1}/share-den |  | 4.0 | 6.6 | 8.2 | 10.6 |  | 27177 | 0 |
| pell-gradient{"D":2,"k":0}/share-den |  | 4.0 | 6.0 | 9.1 | 10.4 |  | 22761 | 0 |
| pell-gradient{"D":3,"k":0}/share-den |  | 4.4 | 6.0 | 9.1 | 11.4 | 15.7 | 20695 | 26 |
| pell-gradient{"D":5,"k":0}/share-den |  | 4.1 | 7.7 | 7.9 |  |  | 26244 | 0 |
| pell-gradient{"D":6,"k":0}/share-den |  | 4.0 | 6.4 | 7.9 | 10.3 | 12.6 | 26027 | 194 |
| pell-gradient{"D":7,"k":0}/share-den |  | 4.0 | 6.5 | 8.4 |  |  | 26701 | 0 |
| prime-gradient/c-gpf | yes | 4.0 | 7.0 | 8.5 | 11.3 | 12.6 | 29371 | 213 |
| prime-gradient/c-spf | yes | 4.0 | 7.0 | 8.5 | 10.1 | 13.3 | 28595 | 70 |
| prime-gradient/cPrime | yes | 4.0 | 7.5 | 9.0 |  |  | 29679 | 0 |
| prime-gradient/prime | yes | 4.0 | 6.3 | 8.7 | 10.5 | 13.4 | 29819 | 70 |
| prime-landing/big-prime | yes | 3.5 | 6.3 | 8.7 | 10.3 | 13.4 | 37749 | 80 |
| prime-landing/m-gpf | yes | 3.5 | 7.1 | 8.6 | 11.5 | 12.7 | 36649 | 179 |
| prime-landing/m-spf | yes | 3.6 | 7.1 | 8.7 | 10.2 | 13.4 | 35986 | 65 |
| prime-landing/next-prime | yes | 3.6 | 6.1 |  |  |  | 34988 | 0 |
| prime-landing/prime-gradient | yes | 3.5 | 7.4 | 9.1 |  |  | 37054 | 0 |
| prime-slope/matching-c |  | 4.8 | 6.6 |  |  |  | 16224 | 0 |
| prime-slope/square-sum |  | 4.8 | 7.9 |  |  |  | 16224 | 0 |
| prime-slope/twins |  | 4.8 | 7.3 |  |  |  | 16224 | 0 |
| prime-staircase/first-prime | yes | 5.4 | 6.2 | 8.3 | 9.9 | 12.4 | 8419 | 105 |
| prime-staircase/last-prime | yes | 5.4 | 6.2 | 8.3 | 10.0 | 12.1 | 8419 | 137 |
| prime-staircase/near-miss | yes | 4.1 | 6.3 | 8.0 | 10.7 | 12.8 | 24665 | 77 |
| prime-staircase/step-back | yes | 5.4 | 5.9 | 8.7 | 10.8 | 13.4 | 8419 | 57 |
| pythagorean-area/prime-height | yes | 4.0 | 6.0 | 8.0 | 10.0 |  | 36122 | 0 |
| pythagorean-area/slanted-square | yes | 4.0 | 6.0 | 8.1 | 9.9 | 12.6 | 36453 | 112 |
| pythagorean-area/whole-legs | yes | 4.0 | 6.0 | 8.1 | 9.8 |  | 35843 | 0 |
| ruler/far | yes | 2.6 | 3.5 | 3.7 | 3.8 | 4.9 | 60684 | 12499 |
| ruler/prime-gradient | yes | 2.6 | 3.5 | 3.7 | 3.8 | 12.0 | 60979 | 206 |
| ruler/square-area | yes | 2.6 | 3.4 | 3.7 | 3.8 | 12.3 | 60733 | 113 |
| same-on-both-rulers/m-gpf | yes | 3.5 | 5.7 | 7.4 | 12.3 | 13.6 | 33688 | 48 |
| same-on-both-rulers/m-spf | yes | 3.5 | 5.7 | 7.4 | 12.3 | 12.3 | 33688 | 103 |
| same-on-both-rulers/prime-start | yes | 3.5 | 5.7 | 7.4 | 11.6 | 12.5 | 33954 | 77 |
| same-on-both-rulers/steep | yes | 3.5 | 5.7 | 7.5 | 11.5 | 12.8 | 33972 | 87 |
| same-on-both-rulers/whole-lamp | yes | 3.5 | 5.7 | 7.4 |  |  | 33177 | 0 |
| same-on-both-rulers/whole-values | yes | 3.5 | 5.6 | 7.5 | 10.6 |  | 34782 | 0 |
| smooth-crossing/shared |  | 4.9 | 6.5 | 8.3 | 10.2 | 12.2 | 17989 | 412 |
| smooth-gradient/shared |  | 5.1 | 7.0 | 8.8 | 10.8 | 12.9 | 19497 | 391 |
| smooth-intercept/shared |  | 4.9 | 6.5 | 8.3 | 10.2 | 12.2 | 18016 | 412 |
| smooth-square/shared |  | 4.0 | 6.1 | 8.4 | 10.2 | 12.2 | 51387 | 345 |
| square-area/lpf | yes | 4.0 | 6.0 | 8.4 | 11.3 | 12.5 | 51792 | 255 |
| square-area/omega | yes | 4.0 | 6.0 | 8.3 | 10.1 | 13.1 | 52210 | 232 |
| square-area/spf | yes | 4.0 | 5.9 | 8.4 | 11.4 | 13.3 | 52303 | 84 |
| steady-gradient/divisors |  | 4.6 | 6.1 | 8.1 | 10.1 | 12.0 | 24706 | 660 |
| steady-gradient/gcd-c |  | 5.0 | 6.6 | 8.0 | 10.0 | 12.1 | 20813 | 803 |
| steady-gradient/x-whole |  |  |  |  |  |  | 0 | 0 |
| steep-and-tall/shared |  | 4.0 | 6.0 | 8.1 | 10.1 | 12.1 | 40870 | 1043 |
| sunken-intercept/shared |  | 4.0 | 6.0 | 7.9 | 10.1 | 12.1 | 33363 | 696 |
| target-gradient/gcd-tops |  | 4.0 | 6.1 | 8.0 | 10.5 | 12.9 | 25502 | 111 |
| target-gradient/same-den |  | 4.0 | 6.8 | 8.2 | 11.1 |  | 25606 | 0 |
| treasure/m-gpf | yes | 1.7 | 2.0 | 2.3 | 6.2 | 7.6 | 100465 | 1557 |
| treasure/m-spf | yes | 1.7 | 2.0 | 2.3 | 6.2 | 7.6 | 101522 | 1563 |
| treasure/prime-gradient | yes | 1.7 | 2.0 | 2.3 | 6.2 | 7.6 | 100823 | 1556 |
| treasure/prime-terms | yes | 1.7 | 2.0 | 2.3 | 6.2 | 7.4 | 100465 | 1806 |
| treasure/square-start | yes | 1.7 | 2.0 | 2.3 | 6.2 | 7.4 | 101002 | 1802 |
| triangle-area/even |  | 4.0 | 6.0 | 8.0 |  |  | 33793 | 0 |
| triangle-area/legs |  | 4.0 | 6.0 | 8.2 |  |  | 34688 | 0 |
| whole-area/gcd-den-m |  | 4.0 | 6.8 | 8.3 | 10.1 | 12.1 | 47673 | 553 |
| whole-area/gcd-x |  | 4.0 | 6.1 | 8.0 | 10.0 | 12.0 | 47673 | 1033 |
| whole-at-t/gcd-c |  | 4.0 | 6.0 | 8.0 | 10.0 | 12.2 | 24509 | 349 |
| whole-at-t/gcd-den-m |  | 9.2 | 9.2 | 9.2 | 12.2 | 12.2 | 1326 | 259 |
| whole-crossing/gcd-c |  | 4.8 | 6.1 | 8.0 | 10.0 | 11.9 | 19615 | 798 |
| whole-crossing/gcd-num-m |  | 6.6 | 6.6 | 9.3 | 10.1 | 12.2 | 7844 | 497 |
| whole-crossing/k-gpf | yes | 4.4 | 7.3 | 8.6 | 10.4 | 13.8 | 25138 | 133 |
| whole-crossing/k-spf | yes | 4.5 | 6.0 | 9.4 | 10.6 | 12.6 | 19571 | 148 |
| whole-crossing/m-spf | yes | 5.5 | 7.1 | 8.6 | 10.6 | 12.0 | 7644 | 107 |
| whole-intercept/gcd-den-m |  | 6.6 | 6.6 | 9.2 | 10.1 | 12.1 | 7923 | 520 |
| whole-intercept/gcd-floor-m |  | 5.0 | 6.6 | 8.0 | 10.3 | 11.9 | 21111 | 857 |
| whole-intercept/mc-spf |  | 7.6 | 7.6 | 10.8 | 10.8 | 13.6 | 3117 | 69 |
| whole-intercept/omega |  | 4.3 | 6.1 | 8.0 | 10.0 | 12.0 | 27482 | 466 |
| whole-intercept/spf |  | 4.5 | 7.5 | 9.3 | 10.7 | 12.4 | 19555 | 150 |

<!-- pmi:line-q end -->
