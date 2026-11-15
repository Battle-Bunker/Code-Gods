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

Measured by `pnpm --filter @workspace/v2-agents pmi -- --variant line-q` (lib/v2-agents/scripts/pmi.ts), 2026-11-15: 128 rules (every committed value function of line-q; 43 dealt in lines-beginner), 5,000,000 draws of the line-q law (tilts 1, 0.75, 0.55, 0.4, 0.3, 1,000,000 each), 1,638,987 accepted, effective sample size 752,681. Depths 4, 6, 8, 10, 12 bits; a depth is read when the joint upper set holds at least 30 effective draws; a depth not read where independence would put at least 300 effective draws in the joint set is an exclusion, shown "≤ bound" (PMI ≤ log2(30 / expected)). Headline: the mean over the depths read (exclusions as their bound). Cells: PMI per depth.

Pairs of different families: 7653. Independent (|PMI| ≤ 1): **3784**; mild (1 to 2): 1012; mild anti (−2 to −1): 651; aligned (> 2): **697**; anti-aligned (< −2): **1278**; unread: 231.
Pairs read at each depth (and exclusions): 4 bits 6793 (629), 6 bits 4955 (0), 8 bits 1440 (0), 10 bits 253 (0), 12 bits 91 (0). A pair unread at a depth is one whose joint upper set is too thin at the sample size; for an independent pair the joint set at t bits has mass 2^(−2t), so depths past about 8 are read only for aligned pairs, and the headline of an aligned pair averages more (and deeper) depths.

### Family matrix (headline PMI, mean over tie-breakers and parameter sets; diagonal: two tie-breakers of one family)

| | CC | DL | EL | ES | EC | FN | LD | MMC | NP | PG | PGr | PL | PS | PSt | PA | R | SOBR | SC | SG | SI | SS | SA | SGr | SAT | SIn | TG | T | TA | WA | WAT | WC | WI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **CC** crossing-check | -0.2 | -1.4 | -5.8 | 0.1 | 0.9 | 0.5 | -0.2 | -0.1 | 0.6 | 0.8 | -4.6 | -1.5 | 0.3 | -1.0 | -0.6 | -0.9 | -0.1 | -2.7 | -2.9 | -0.1 | -0.6 | -0.6 | -4.3 | -6.2 | -3.6 | 1.6 | 0.7 | 0.2 | -1.5 | -2.2 | -0.2 | -1.9 |
| **DL** divisibility-ladder | -1.4 |  | -5.7 | -5.5 | 0.3 | -3.1 | -6.1 | -3.4 | -2.4 | -3.6 | 1.4 | 2.2 | -4.8 | -1.8 | 0.9 | 1.4 | 0.1 | 5.4 | 4.8 | -6.3 | 3.6 | 2.3 | 3.0 | 3.6 | 5.7 | -0.2 | 1.0 | -0.9 | 0.0 | 5.4 | 3.0 | -1.1 |
| **EL** egyptian-line | -5.8 | -5.7 |  | -2.8 | -5.8 | 2.6 | -0.2 | 3.4 | -5.9 | -5.7 | -5.9 | -5.8 | -4.4 | -5.7 | -5.8 | -5.8 | -5.9 | -5.3 | -4.8 | -5.9 | -4.8 | -4.7 | -5.9 | -5.8 | -5.9 | -5.8 | -5.8 | -5.9 | -5.5 | -5.5 | -5.1 | -5.1 |
| **ES** euclid-steps | 0.1 | -5.5 | -2.8 |  | -0.9 | -5.7 | 3.3 | -0.3 | 0.3 | 1.3 | -0.7 | -0.5 | 2.9 | -0.4 | -0.1 | -0.3 | -0.6 | -3.1 | -4.7 | -1.3 | -0.5 | -0.6 | -5.8 | -2.2 | -1.5 | 1.6 | -0.9 | -0.5 | -1.5 | -3.3 | -1.9 | -2.6 |
| **EC** exact-change | 0.9 | 0.3 | -5.8 | -0.9 | 7.3 | -6.4 | -0.2 | -5.9 | 1.2 | 0.0 | -3.2 | -2.0 | 0.3 | 1.0 | 1.6 | 1.7 | -2.1 | -1.2 | 1.0 | 1.3 | 0.9 | 1.0 | -1.0 | -6.4 | -6.5 | -6.4 | 0.1 | 1.9 | 1.0 | -0.5 | 1.7 | 1.0 |
| **FN** farey-neighbours | 0.5 | -3.1 | 2.6 | -5.7 | -6.4 | 3.2 | -0.8 | 2.4 | 1.1 | 0.3 | -3.6 | -6.4 | -3.8 | -1.5 | -3.9 | -6.4 | -0.9 | -5.9 | -3.6 | -0.0 | -0.4 | -0.4 | -4.7 | 0.3 | -6.0 | -0.0 | 0.2 | -2.3 | -6.1 | -2.0 | -4.1 | -2.9 |
| **LD** long-division | -0.2 | -6.1 | -0.2 | 3.3 | -0.2 | -0.8 | 4.3 | 1.0 | 0.3 | 0.1 | -1.2 | 0.3 | 2.0 | -0.6 | -0.1 | -0.4 | -0.4 | -2.5 | -5.2 | -1.6 | -0.8 | -0.9 | -6.3 | -2.0 | -1.2 | 0.2 | -1.0 | -0.2 | -1.4 | -2.8 | -0.4 | -3.5 |
| **MMC** m-meets-c | -0.1 | -3.4 | 3.4 | -0.3 | -5.9 | 2.4 | 1.0 | 5.3 | 0.3 | -0.8 | -3.8 | -6.5 | 0.1 | -2.8 | -4.9 | -6.5 | -1.7 | -6.0 | 1.2 | -1.8 | -1.0 | -1.0 | -2.7 | 0.3 | -6.3 | 0.5 | -1.7 | -3.0 | -6.2 | -3.3 | -3.7 | -2.4 |
| **NP** near-point | 0.6 | -2.4 | -5.9 | 0.3 | 1.2 | 1.1 | 0.3 | 0.3 | 6.0 | 0.2 | -5.0 | -0.9 | 0.4 | -1.0 | 0.1 | -1.4 | -1.9 | -6.0 | -5.5 | 0.1 | 0.1 | 0.1 | -4.7 | -6.6 | -5.3 | 2.4 | -1.3 | 0.8 | -0.4 | -2.4 | -0.5 | -2.1 |
| **PG** pell-gradient | 0.8 | -3.6 | -5.7 | 1.3 | 0.0 | 0.3 | 0.1 | -0.8 | 0.2 | -1.1 | -6.4 | -0.3 | -0.5 | -0.1 | 0.4 | 0.2 | 0.2 | -1.4 | -5.3 | -0.4 | -2.1 | -2.3 | -5.7 | -0.2 | -0.6 | 2.5 | -0.6 | 0.1 | -1.0 | -1.9 | -0.6 | -1.6 |
| **PGr** prime-gradient | -4.6 | 1.4 | -5.9 | -0.7 | -3.2 | -3.6 | -1.2 | -3.8 | -5.0 | -6.4 | -3.5 | -1.5 | -5.0 | 0.2 | 0.2 | -0.8 | -0.6 | -2.3 | 2.7 | 0.8 | -1.4 | -0.6 | 2.5 | -1.8 | 0.5 | -6.5 | -0.8 | -0.2 | -3.3 | 0.5 | -2.4 | 0.9 |
| **PL** prime-landing | -1.5 | 2.2 | -5.8 | -0.5 | -2.0 | -6.4 | 0.3 | -6.5 | -0.9 | -0.3 | -1.5 | -3.1 | -0.0 | 1.0 | 1.7 | 2.4 | 0.5 | 2.1 | 0.4 | 1.2 | 1.7 | 2.2 | -2.1 | -2.5 | 2.5 | -0.1 | 0.6 | -0.8 | 2.3 | -0.3 | 2.1 | 1.1 |
| **PS** prime-slope | 0.3 | -4.8 | -4.4 | 2.9 | 0.3 | -3.8 | 2.0 | 0.1 | 0.4 | -0.5 | -5.0 | -0.0 | 3.5 | -0.3 | -0.0 | 0.1 | 0.0 | -3.3 | -4.5 | -1.5 | -5.6 | -5.4 | -5.1 | -0.6 | -0.7 | 0.5 | -0.1 | 0.0 | -2.7 | -2.4 | -0.7 | -2.8 |
| **PSt** prime-staircase | -1.0 | -1.8 | -5.7 | -0.4 | 1.0 | -1.5 | -0.6 | -2.8 | -1.0 | -0.1 | 0.2 | 1.0 | -0.3 | -1.0 | 1.1 | 1.2 | 1.0 | -1.7 | -1.9 | 0.7 | 0.1 | 0.6 | 0.4 | 0.1 | -0.3 | 0.0 | 0.3 | 0.6 | -0.1 | -0.7 | 0.6 | 0.9 |
| **PA** pythagorean-area | -0.6 | 0.9 | -5.8 | -0.1 | 1.6 | -3.9 | -0.1 | -4.9 | 0.1 | 0.4 | 0.2 | 1.7 | -0.0 | 1.1 | -1.7 | 2.0 | 1.3 | 0.6 | 1.2 | 1.2 | 0.1 | 0.1 | 0.3 | 2.3 | 1.3 | 0.8 | 0.6 | -0.3 | 1.5 | 0.2 | 1.4 | 1.3 |
| **R** ruler | -0.9 | 1.4 | -5.8 | -0.3 | 1.7 | -6.4 | -0.4 | -6.5 | -1.4 | 0.2 | -0.8 | 2.4 | 0.1 | 1.2 | 2.0 | -1.5 | 0.5 | 0.3 | 0.2 | 0.6 | 0.4 | 0.9 | -1.5 | 0.9 | 2.4 | 0.4 | 0.2 | -1.2 | 1.3 | -0.1 | 1.5 | 1.1 |
| **SOBR** same-on-both-rulers | -0.1 | 0.1 | -5.9 | -0.6 | -2.1 | -0.9 | -0.4 | -1.7 | -1.9 | 0.2 | -0.6 | 0.5 | 0.0 | 1.0 | 1.3 | 0.5 | -3.7 | -2.2 | 0.9 | 0.4 | 0.9 | 1.1 | -0.9 | -2.4 | 0.3 | 0.1 | -0.1 | 1.5 | 0.2 | -0.1 | 0.2 | 0.9 |
| **SC** smooth-crossing | -2.7 | 5.4 | -5.3 | -3.1 | -1.2 | -5.9 | -2.5 | -6.0 | -6.0 | -1.4 | -2.3 | 2.1 | -3.3 | -1.7 | 0.6 | 0.3 | -2.2 |  | 1.4 | 0.6 | 6.1 | 3.5 | -2.2 | -0.7 | 6.2 | -0.8 | 0.8 | -6.0 | 5.3 | -0.9 | 3.2 | 1.8 |
| **SG** smooth-gradient | -2.9 | 4.8 | -4.8 | -4.7 | 1.0 | -3.6 | -5.2 | 1.2 | -5.5 | -5.3 | 2.7 | 0.4 | -4.5 | -1.9 | 1.2 | 0.2 | 0.9 | 1.4 |  | 0.9 | 0.9 | 1.7 | 6.2 | 5.5 | 4.1 | -5.4 | 0.9 | 1.1 | -1.8 | 4.3 | 1.4 | 1.1 |
| **SI** smooth-intercept | -0.1 | -6.3 | -5.9 | -1.3 | 1.3 | -0.0 | -1.6 | -1.8 | 0.1 | -0.4 | 0.8 | 1.2 | -1.5 | 0.7 | 1.2 | 0.6 | 0.4 | 0.6 | 0.9 | 8.0 | 1.2 | 0.4 | 1.9 | 3.2 | 2.4 | -0.8 | 1.3 | 0.7 | -0.8 | 0.4 | -0.2 | 0.9 |
| **SS** smooth-square | -0.6 | 3.6 | -4.8 | -0.5 | 0.9 | -0.4 | -0.8 | -1.0 | 0.1 | -2.1 | -1.4 | 1.7 | -5.6 | 0.1 | 0.1 | 0.4 | 0.9 | 6.1 | 0.9 | 1.2 |  | 5.7 | 1.0 | -0.2 | 4.9 | 1.1 | 0.6 | 0.4 | 4.5 | -0.8 | 2.8 | 0.8 |
| **SA** square-area | -0.6 | 2.3 | -4.7 | -0.6 | 1.0 | -0.4 | -0.9 | -1.0 | 0.1 | -2.3 | -0.6 | 2.2 | -5.4 | 0.6 | 0.1 | 0.9 | 1.1 | 3.5 | 1.7 | 0.4 | 5.7 | 5.5 | -0.4 | 0.2 | 3.2 | 1.1 | 0.2 | 0.5 | 3.1 | -0.7 | 2.3 | 0.4 |
| **SGr** steady-gradient | -4.3 | 3.0 | -5.9 | -5.8 | -1.0 | -4.7 | -6.3 | -2.7 | -4.7 | -5.7 | 2.5 | -2.1 | -5.1 | 0.4 | 0.3 | -1.5 | -0.9 | -2.2 | 6.2 | 1.9 | 1.0 | -0.4 | 4.6 | 4.5 | 2.3 | -6.5 | 0.8 | -0.2 | -4.1 | -0.4 | -1.5 | 0.9 |
| **SAT** steep-and-tall | -6.2 | 3.6 | -5.8 | -2.2 | -6.4 | 0.3 | -2.0 | 0.3 | -6.6 | -0.2 | -1.8 | -2.5 | -0.6 | 0.1 | 2.3 | 0.9 | -2.4 | -0.7 | 5.5 | 3.2 | -0.2 | 0.2 | 4.5 |  | -6.6 | 1.4 | -1.4 | 1.1 | -1.8 | 0.9 | -0.3 | 2.2 |
| **SIn** sunken-intercept | -3.6 | 5.7 | -5.9 | -1.5 | -6.5 | -6.0 | -1.2 | -6.3 | -5.3 | -0.6 | 0.5 | 2.5 | -0.7 | -0.3 | 1.3 | 2.4 | 0.3 | 6.2 | 4.1 | 2.4 | 4.9 | 3.2 | 2.3 | -6.6 |  | -0.3 | -0.7 | -2.9 | 4.2 | 2.4 | 4.0 | 2.6 |
| **TG** target-gradient | 1.6 | -0.2 | -5.8 | 1.6 | -6.4 | -0.0 | 0.2 | 0.5 | 2.4 | 2.5 | -6.5 | -0.1 | 0.5 | 0.0 | 0.8 | 0.4 | 0.1 | -0.8 | -5.4 | -0.8 | 1.1 | 1.1 | -6.5 | 1.4 | -0.3 | 6.1 | -0.8 | 0.1 | -0.6 | -2.6 | 0.0 | -2.4 |
| **T** treasure | 0.7 | 1.0 | -5.8 | -0.9 | 0.1 | 0.2 | -1.0 | -1.7 | -1.3 | -0.6 | -0.8 | 0.6 | -0.1 | 0.3 | 0.6 | 0.2 | -0.1 | 0.8 | 0.9 | 1.3 | 0.6 | 0.2 | 0.8 | -1.4 | -0.7 | -0.8 | -2.5 | -0.1 | 0.3 | 0.9 | 0.7 | 0.7 |
| **TA** triangle-area | 0.2 | -0.9 | -5.9 | -0.5 | 1.9 | -2.3 | -0.2 | -3.0 | 0.8 | 0.1 | -0.2 | -0.8 | 0.0 | 0.6 | -0.3 | -1.2 | 1.5 | -6.0 | 1.1 | 0.7 | 0.4 | 0.5 | -0.2 | 1.1 | -2.9 | 0.1 | -0.1 | 1.3 | -0.6 | -0.3 | 1.0 | 0.1 |
| **WA** whole-area | -1.5 | 0.0 | -5.5 | -1.5 | 1.0 | -6.1 | -1.4 | -6.2 | -0.4 | -1.0 | -3.3 | 2.3 | -2.7 | -0.1 | 1.5 | 1.3 | 0.2 | 5.3 | -1.8 | -0.8 | 4.5 | 3.1 | -4.1 | -1.8 | 4.2 | -0.6 | 0.3 | -0.6 | 4.8 | -0.1 | 3.3 | 0.8 |
| **WAT** whole-at-t | -2.2 | 5.4 | -5.5 | -3.3 | -0.5 | -2.0 | -2.8 | -3.3 | -2.4 | -1.9 | 0.5 | -0.3 | -2.4 | -0.7 | 0.2 | -0.1 | -0.1 | -0.9 | 4.3 | 0.4 | -0.8 | -0.7 | -0.4 | 0.9 | 2.4 | -2.6 | 0.9 | -0.3 | -0.1 | -0.1 | -0.9 | 0.3 |
| **WC** whole-crossing | -0.2 | 3.0 | -5.1 | -1.9 | 1.7 | -4.1 | -0.4 | -3.7 | -0.5 | -0.6 | -2.4 | 2.1 | -0.7 | 0.6 | 1.4 | 1.5 | 0.2 | 3.2 | 1.4 | -0.2 | 2.8 | 2.3 | -1.5 | -0.3 | 4.0 | 0.0 | 0.7 | 1.0 | 3.3 | -0.9 | -5.0 | 1.3 |
| **WI** whole-intercept | -1.9 | -1.1 | -5.1 | -2.6 | 1.0 | -2.9 | -3.5 | -2.4 | -2.1 | -1.6 | 0.9 | 1.1 | -2.8 | 0.9 | 1.3 | 1.1 | 0.9 | 1.8 | 1.1 | 0.9 | 0.8 | 0.4 | 0.9 | 2.2 | 2.6 | -2.4 | 0.7 | 0.1 | 0.8 | 0.3 | 1.3 | 0.5 |

### Families by independence (pairs with other families)

| Family | dealt | rules | pairs read | independent | mild ± | aligned | anti-aligned | mean PMI | mean |PMI| |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| long-division | no | 3 | 369 | 266 (72%) | 54 | 6 | 43 | -0.63 | 1.02 |
| treasure | 4/4 | 4 | 489 | 336 (69%) | 113 | 12 | 28 | 0.05 | 0.90 |
| pell-gradient | no | 18 | 1953 | 1253 (64%) | 264 | 160 | 276 | -0.57 | 1.44 |
| triangle-area | no | 10 | 1160 | 744 (64%) | 254 | 64 | 98 | -0.03 | 1.09 |
| smooth-intercept | 4/4 | 4 | 488 | 298 (61%) | 127 | 40 | 23 | 0.16 | 1.12 |
| prime-staircase | 8/10 | 10 | 1160 | 689 (59%) | 271 | 89 | 111 | -0.04 | 1.16 |
| same-on-both-rulers | 4/4 | 4 | 491 | 284 (58%) | 130 | 44 | 33 | 0.14 | 1.16 |
| euclid-steps | no | 1 | 124 | 71 (57%) | 23 | 9 | 21 | -0.43 | 1.52 |
| prime-slope | no | 3 | 365 | 201 (55%) | 55 | 31 | 78 | -0.82 | 1.65 |
| pythagorean-area | 4/4 | 4 | 488 | 265 (54%) | 134 | 58 | 31 | 0.33 | 1.31 |
| target-gradient | no | 2 | 250 | 131 (52%) | 44 | 46 | 29 | -0.01 | 1.68 |
| smooth-square | no | 1 | 125 | 65 (52%) | 23 | 21 | 16 | 0.04 | 1.76 |
| square-area | 2/3 | 3 | 369 | 187 (51%) | 73 | 61 | 48 | -0.10 | 1.67 |
| ruler | 4/4 | 4 | 488 | 245 (50%) | 127 | 65 | 51 | 0.03 | 1.43 |
| whole-crossing | 4/4 | 4 | 488 | 235 (48%) | 148 | 65 | 40 | 0.21 | 1.37 |
| near-point | no | 2 | 250 | 120 (48%) | 40 | 30 | 60 | -0.57 | 1.88 |
| crossing-check | no | 18 | 1952 | 897 (46%) | 510 | 162 | 383 | -0.59 | 1.63 |
| farey-neighbours | no | 2 | 153 | 69 (45%) | 27 | 9 | 48 | -1.30 | 2.13 |
| prime-landing | 4/4 | 4 | 488 | 208 (43%) | 130 | 75 | 75 | -0.15 | 1.56 |
| exact-change | no | 3 | 369 | 153 (41%) | 133 | 38 | 45 | 0.02 | 1.69 |
| whole-at-t | no | 2 | 243 | 99 (41%) | 60 | 16 | 68 | -0.98 | 2.00 |
| prime-gradient | 4/4 | 4 | 488 | 186 (38%) | 62 | 15 | 225 | -2.33 | 2.79 |
| whole-intercept | no | 5 | 601 | 226 (38%) | 156 | 85 | 134 | -0.38 | 2.06 |
| sunken-intercept | no | 1 | 125 | 41 (33%) | 20 | 28 | 36 | -0.52 | 2.56 |
| m-meets-c | no | 2 | 250 | 81 (32%) | 57 | 15 | 97 | -2.06 | 2.59 |
| steep-and-tall | no | 1 | 125 | 38 (30%) | 33 | 18 | 36 | -1.09 | 2.75 |
| divisibility-ladder | 1/1 | 1 | 124 | 30 (24%) | 23 | 26 | 45 | -1.00 | 2.95 |
| smooth-gradient | no | 1 | 123 | 28 (23%) | 34 | 14 | 47 | -1.09 | 2.87 |
| whole-area | no | 2 | 248 | 51 (21%) | 102 | 39 | 56 | -0.44 | 2.11 |
| steady-gradient | no | 3 | 248 | 51 (21%) | 61 | 26 | 110 | -2.04 | 3.30 |
| smooth-crossing | no | 1 | 125 | 17 (14%) | 38 | 23 | 47 | -1.25 | 3.02 |
| egyptian-line | no | 1 | 125 | 3 (2%) | 0 | 4 | 118 | -5.21 | 5.40 |

### Calibration of the value functions against these draws

Every rule's upper sets are within 1 bit of their nominal depth or rarer.

### The 367 rules (Square Area/spf, Whole Crossing/k-spf, Prime Landing/big-prime)

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|

### The six adversaries against each other (rule design measured 6–8.5 bits at depth 8 for several of these pairs, line-rules-v3-proposals.md §A10)

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | smooth-gradient/shared | neither | **1.41** | 1.2 | 1.4 | 1.4 | 1.6 |  | 4355 |
| smooth-crossing/shared | smooth-intercept{"primes":[3,11]}/shared-factor | one | **0.53** | -0.5 | 0.7 | 1.4 |  |  | 1555 |
| smooth-crossing/shared | smooth-intercept{"primes":[3,13]}/shared-factor | one | **0.56** | -0.4 | 0.7 | 1.4 |  |  | 1553 |
| smooth-crossing/shared | smooth-intercept{"primes":[3,17]}/shared-factor | one | **0.48** | -0.4 | 0.7 | 1.1 |  |  | 1553 |
| smooth-crossing/shared | smooth-intercept{"primes":[3,7]}/shared-factor | one | **0.84** | 0.0 | 1.0 | 1.5 |  |  | 2243 |
| smooth-crossing/shared | smooth-square/shared | neither | **6.13** | 2.0 | 4.5 | 6.1 | 8.1 | 9.9 | 9873 |
| smooth-crossing/shared | steep-and-tall/shared | neither | **-0.67** | 0.1 | -0.7 | -1.4 |  |  | 3039 |
| smooth-crossing/shared | sunken-intercept/shared | neither | **6.15** | 2.7 | 4.4 | 6.2 | 7.9 | 9.7 | 16607 |
| smooth-gradient/shared | smooth-intercept{"primes":[3,11]}/shared-factor | one | **0.87** | -0.3 | 1.1 | 1.8 |  |  | 1700 |
| smooth-gradient/shared | smooth-intercept{"primes":[3,13]}/shared-factor | one | **0.88** | -0.3 | 1.1 | 1.8 |  |  | 1713 |
| smooth-gradient/shared | smooth-intercept{"primes":[3,17]}/shared-factor | one | **0.79** | -0.3 | 1.1 | 1.6 |  |  | 1689 |
| smooth-gradient/shared | smooth-intercept{"primes":[3,7]}/shared-factor | one | **0.89** | -0.1 | 1.1 | 1.7 |  |  | 1945 |
| smooth-gradient/shared | smooth-square/shared | neither | **0.91** | 0.8 | 2.1 | -0.1 |  |  | 3314 |
| smooth-gradient/shared | steep-and-tall/shared | neither | **5.54** | 2.1 | 4.0 | 5.6 | 7.2 | 8.8 | 8883 |
| smooth-gradient/shared | sunken-intercept/shared | neither | **4.08** | 2.0 | 3.1 | 4.2 | 4.9 | 6.1 | 12253 |
| smooth-intercept{"primes":[3,11]}/shared-factor | smooth-intercept{"primes":[3,13]}/shared-factor | both | **8.14** | 3.9 | 6.3 | 8.2 | 10.1 | 12.2 | 43631 |
| smooth-intercept{"primes":[3,11]}/shared-factor | smooth-intercept{"primes":[3,17]}/shared-factor | both | **8.11** | 3.9 | 6.4 | 7.9 | 10.2 | 12.2 | 43631 |
| smooth-intercept{"primes":[3,11]}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | both | **7.95** | 3.8 | 6.1 | 7.9 | 9.9 | 12.0 | 37022 |
| smooth-intercept{"primes":[3,11]}/shared-factor | smooth-square/shared | one | **1.25** | -0.1 | 1.5 | 2.4 |  |  | 2503 |
| smooth-intercept{"primes":[3,11]}/shared-factor | steep-and-tall/shared | one | **3.02** | 1.3 | 2.7 | 3.8 | 4.3 |  | 7735 |
| smooth-intercept{"primes":[3,11]}/shared-factor | sunken-intercept/shared | one | **2.11** | 0.0 | 1.3 | 2.3 | 4.7 |  | 4044 |
| smooth-intercept{"primes":[3,13]}/shared-factor | smooth-intercept{"primes":[3,17]}/shared-factor | both | **8.15** | 4.0 | 6.4 | 7.9 | 10.2 | 12.3 | 45349 |
| smooth-intercept{"primes":[3,13]}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | both | **7.98** | 3.8 | 6.1 | 7.9 | 10.0 | 12.0 | 37022 |
| smooth-intercept{"primes":[3,13]}/shared-factor | smooth-square/shared | one | **1.24** | -0.2 | 1.5 | 2.4 |  |  | 2429 |
| smooth-intercept{"primes":[3,13]}/shared-factor | steep-and-tall/shared | one | **3.04** | 1.3 | 2.7 | 3.9 | 4.3 |  | 7830 |
| smooth-intercept{"primes":[3,13]}/shared-factor | sunken-intercept/shared | one | **2.04** | -0.1 | 1.2 | 2.4 | 4.6 |  | 3787 |
| smooth-intercept{"primes":[3,17]}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | both | **7.94** | 3.8 | 6.2 | 7.7 | 10.0 | 12.0 | 37022 |
| smooth-intercept{"primes":[3,17]}/shared-factor | smooth-square/shared | one | **1.13** | -0.2 | 1.5 | 2.1 |  |  | 2352 |
| smooth-intercept{"primes":[3,17]}/shared-factor | steep-and-tall/shared | one | **3.01** | 1.3 | 2.7 | 3.7 | 4.3 |  | 7601 |
| smooth-intercept{"primes":[3,17]}/shared-factor | sunken-intercept/shared | one | **1.87** | -0.1 | 1.1 | 1.9 | 4.6 |  | 3475 |
| smooth-intercept{"primes":[3,7]}/shared-factor | smooth-square/shared | one | **1.35** | -0.0 | 1.6 | 2.5 |  |  | 2639 |
| smooth-intercept{"primes":[3,7]}/shared-factor | steep-and-tall/shared | one | **3.53** | 1.4 | 2.7 | 3.8 | 4.2 | 5.6 | 7793 |
| smooth-intercept{"primes":[3,7]}/shared-factor | sunken-intercept/shared | one | **3.44** | 0.7 | 1.8 | 3.2 | 5.0 | 6.5 | 6265 |
| smooth-square/shared | steep-and-tall/shared | neither | **-0.17** | 0.5 | -0.8 |  |  |  | 4019 |
| smooth-square/shared | sunken-intercept/shared | neither | **4.87** | 0.7 | 3.2 | 4.9 | 6.8 | 8.7 | 6875 |
| steep-and-tall/shared | sunken-intercept/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |

### The six adversaries against the 367 rules

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | square-area/spf | one | **1.30** | 2.1 | 0.5 |  |  |  | 9873 |
| smooth-gradient/shared | square-area/spf | one | **1.05** | 0.8 | 1.3 |  |  |  | 3300 |
| smooth-intercept{"primes":[3,11]}/shared-factor | square-area/spf | both | **0.89** | -0.1 | 1.9 |  |  |  | 2481 |
| smooth-intercept{"primes":[3,13]}/shared-factor | square-area/spf | both | **0.87** | -0.1 | 1.9 |  |  |  | 2407 |
| smooth-intercept{"primes":[3,17]}/shared-factor | square-area/spf | both | **0.86** | -0.1 | 1.8 |  |  |  | 2331 |
| smooth-intercept{"primes":[3,7]}/shared-factor | square-area/spf | both | **0.99** | 0.0 | 2.0 |  |  |  | 2617 |
| smooth-square/shared | square-area/spf | one | **3.84** | 4.0 | 3.7 |  |  |  | 52513 |
| square-area/spf | steep-and-tall/shared | one | **0.39** | 0.5 | 0.3 |  |  |  | 3979 |
| square-area/spf | sunken-intercept/shared | one | **1.05** | 0.8 | 1.3 |  |  |  | 6874 |

### Pairs that read the same prime of the same number

Each rule's prime readings (hand-listed in scripts/pmi.ts READS: the number read, and which prime of it). Pairs of different families sharing a reading:

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|

### Aligned pairs (headline > 2), different families

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-square/shared | square-area/omega | neither | **8.07** | 4.0 | 6.3 | 8.1 | 10.1 | 12.0 | 53135 |
| steady-gradient/gcd-c | whole-intercept/gcd-floor-m | neither | **7.99** | 3.9 | 5.9 | 8.1 | 10.0 | 12.0 | 58757 |
| smooth-gradient/shared | steady-gradient/gcd-c | neither | **7.72** | 4.0 | 6.0 | 7.5 | 9.5 | 11.5 | 35692 |
| smooth-gradient/shared | whole-intercept/gcd-floor-m | neither | **7.67** | 3.9 | 6.0 | 7.5 | 9.5 | 11.5 | 32283 |
| smooth-crossing/shared | whole-intercept/omega | neither | **7.28** | 3.6 | 5.3 | 7.3 | 9.2 | 11.0 | 20845 |
| smooth-crossing/shared | whole-area/gcd-x | neither | **7.28** | 3.9 | 5.6 | 7.3 | 9.0 | 10.6 | 34848 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/difference | neither | **7.22** | 2.0 | 5.3 | 8.0 | 8.9 | 11.8 | 8208 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/share-den | neither | **7.22** | 2.0 | 5.3 | 8.0 | 8.9 | 11.8 | 8208 |
| whole-area/gcd-x | whole-intercept/omega | neither | **6.81** | 3.1 | 5.0 | 6.9 | 8.7 | 10.4 | 23004 |
| whole-area/gcd-den-m | whole-intercept/gcd-den-m | neither | **6.76** | 3.8 | 5.7 | 6.2 | 7.6 | 10.5 | 19884 |
| sunken-intercept/shared | whole-intercept/omega | neither | **6.71** | 3.0 | 4.9 | 6.7 | 8.5 | 10.4 | 24983 |
| smooth-crossing/shared | square-area/omega | neither | **6.44** | 2.1 | 4.4 | 6.0 | 8.9 | 10.8 | 9873 |
| sunken-intercept/shared | whole-area/gcd-x | neither | **6.39** | 2.3 | 4.4 | 6.4 | 8.5 | 10.4 | 20256 |
| square-area/omega | whole-area/gcd-x | neither | **6.36** | 2.4 | 4.5 | 6.1 | 8.6 | 10.2 | 16667 |
| smooth-square/shared | whole-area/gcd-x | neither | **6.16** | 2.3 | 4.6 | 6.2 | 8.0 | 9.7 | 16667 |
| smooth-crossing/shared | sunken-intercept/shared | neither | **6.15** | 2.7 | 4.4 | 6.2 | 7.9 | 9.7 | 16607 |
| smooth-crossing/shared | smooth-square/shared | neither | **6.13** | 2.0 | 4.5 | 6.1 | 8.1 | 9.9 | 9873 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/pell-c | neither | **6.12** | 2.0 | 4.0 | 5.5 | 8.9 | 10.2 | 8208 |
| square-area/omega | whole-intercept/omega | neither | **5.86** | 1.4 | 3.7 | 5.4 | 8.4 | 10.3 | 6954 |
| crossing-check{"k":2,"q":2}/size | smooth-crossing/shared | neither | **5.66** | 1.7 | 3.7 | 5.8 | 7.8 | 9.4 | 6144 |
| divisibility-ladder/next-rung | sunken-intercept/shared | one | **5.66** | 2.2 | 4.4 | 6.3 | 7.1 | 8.3 | 16899 |
| divisibility-ladder/next-rung | whole-area/gcd-x | one | **5.63** | 2.4 | 4.4 | 6.3 | 7.0 | 8.0 | 15783 |
| steady-gradient/gcd-c | steep-and-tall/shared | neither | **5.61** | 2.1 | 4.0 | 5.6 | 7.3 | 9.0 | 16908 |
| steep-and-tall/shared | whole-intercept/gcd-floor-m | neither | **5.60** | 2.0 | 4.1 | 5.6 | 7.3 | 9.0 | 16744 |
| smooth-gradient/shared | steep-and-tall/shared | neither | **5.54** | 2.1 | 4.0 | 5.6 | 7.2 | 8.8 | 8883 |
| divisibility-ladder/next-rung | whole-intercept/omega | one | **5.48** | 3.1 | 4.9 | 6.1 | 6.2 | 7.2 | 20842 |
| smooth-square/shared | whole-intercept/omega | neither | **5.47** | 1.4 | 3.7 | 5.4 | 7.5 | 9.4 | 6954 |
| divisibility-ladder/next-rung | whole-at-t/gcd-c | one | **5.38** | 2.9 | 3.9 | 5.4 | 6.7 | 8.1 | 19343 |
| divisibility-ladder/next-rung | smooth-crossing/shared | one | **5.36** | 2.7 | 4.6 | 5.9 | 6.2 | 7.3 | 12941 |
| whole-at-t/gcd-c | whole-intercept/omega | neither | **5.17** | 2.5 | 3.4 | 4.7 | 6.5 | 8.7 | 13694 |
| square-area/omega | sunken-intercept/shared | neither | **5.16** | 0.8 | 3.3 | 4.9 | 7.5 | 9.3 | 6874 |
| smooth-square/shared | square-area/lpf | one | **5.14** | 4.0 | 5.2 | 5.4 | 5.5 | 5.5 | 52883 |
| crossing-check{"k":2,"q":2}/size | whole-area/gcd-x | neither | **5.10** | 1.2 | 3.1 | 5.1 | 7.1 | 9.1 | 6335 |
| divisibility-ladder/next-rung | steady-gradient/gcd-c | one | **4.91** | 2.7 | 3.9 | 5.2 | 5.9 | 6.8 | 24817 |
| divisibility-ladder/next-rung | whole-intercept/gcd-floor-m | one | **4.90** | 2.7 | 3.9 | 5.1 | 5.9 | 6.8 | 24817 |
| whole-area/gcd-x | whole-crossing{"q":5,"r":3}/shared-factor | one | **4.88** | 2.6 | 3.0 | 4.6 | 6.4 | 7.8 | 10338 |
| smooth-square/shared | sunken-intercept/shared | neither | **4.87** | 0.7 | 3.2 | 4.9 | 6.8 | 8.7 | 6875 |
| sunken-intercept/shared | whole-at-t/gcd-c | neither | **4.87** | 1.9 | 3.1 | 4.5 | 6.4 | 8.4 | 13916 |
| whole-area/gcd-x | whole-crossing{"q":5,"r":2}/shared-factor | one | **4.86** | 2.6 | 3.0 | 4.7 | 6.4 | 7.5 | 10548 |
| smooth-gradient/shared | whole-intercept/omega | neither | **4.82** | 2.8 | 3.9 | 4.9 | 5.8 | 6.8 | 13538 |
| prime-staircase{"ends":9}/shared-factor | whole-intercept/spf | one | **4.82** | -1.7 | 1.6 | 3.5 | 8.8 | 12.0 | 1128 |
| divisibility-ladder/next-rung | smooth-gradient/shared | one | **4.77** | 3.1 | 4.4 | 4.9 | 5.1 | 6.4 | 17058 |
| whole-area/gcd-x | whole-intercept/gcd-den-m | neither | **4.72** | 2.8 | 4.0 | 4.6 | 5.5 | 6.8 | 17572 |
| smooth-gradient/shared | steady-gradient/divisors | neither | **4.66** | 2.8 | 3.7 | 4.7 | 5.5 | 6.6 | 20886 |
| pell-gradient{"D":3,"k":0}/pell-c | target-gradient/gcd-tops | neither | **4.63** | 3.1 | 5.5 | 5.3 |  |  | 20085 |
| steady-gradient/divisors | whole-intercept/gcd-floor-m | neither | **4.57** | 2.2 | 3.4 | 4.6 | 5.7 | 7.0 | 28704 |
| square-area/lpf | whole-area/gcd-x | one | **4.54** | 2.4 | 4.1 | 5.0 | 5.3 | 5.9 | 16667 |
| crossing-check{"k":2,"q":2}/size | divisibility-ladder/next-rung | one | **4.51** | 0.9 | 2.8 | 4.8 | 6.3 | 7.8 | 4270 |
| pell-gradient{"D":3,"k":0}/difference | target-gradient/gcd-tops | neither | **4.51** | 3.1 | 5.5 | 5.0 |  |  | 14662 |
| pell-gradient{"D":3,"k":0}/share-den | target-gradient/gcd-tops | neither | **4.50** | 3.1 | 5.5 | 5.0 |  |  | 14662 |
| pell-gradient{"D":3,"k":0}/pell-c | target-gradient/same-den | neither | **4.49** | 3.1 | 5.2 | 5.2 |  |  | 20085 |
| whole-area/gcd-x | whole-crossing{"q":5,"r":1}/shared-factor | one | **4.45** | 1.9 | 3.0 | 4.2 | 5.9 | 7.2 | 9302 |
| whole-area/gcd-x | whole-crossing{"q":5,"r":4}/shared-factor | one | **4.41** | 1.9 | 3.0 | 4.2 | 6.0 | 7.0 | 9313 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/omega | neither | **4.36** | 0.3 | 2.3 | 4.4 | 6.5 | 8.2 | 2593 |
| pell-gradient{"D":3,"k":0}/difference | target-gradient/same-den | neither | **4.33** | 3.1 | 5.2 | 4.7 |  |  | 14662 |
| pell-gradient{"D":3,"k":0}/share-den | target-gradient/same-den | neither | **4.33** | 3.1 | 5.2 | 4.7 |  |  | 14662 |
| m-meets-c/size | whole-intercept/mc-spf | neither | **4.31** | 0.3 | 3.4 | 5.7 | 7.9 |  | 917 |
| smooth-gradient/shared | whole-at-t/gcd-c | neither | **4.30** | 3.6 | 4.6 | 4.8 | 4.4 | 4.0 | 22478 |
| prime-staircase{"ends":9}/step-back | whole-intercept/spf | one | **4.26** | -1.7 | -0.5 | 3.5 | 8.4 | 11.7 | 1128 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **4.26** | 3.3 | 4.4 | 5.0 |  |  | 24666 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **4.26** | 3.3 | 4.4 | 5.0 |  |  | 24666 |
| sunken-intercept/shared | whole-crossing{"q":5,"r":2}/shared-factor | one | **4.25** | 1.5 | 2.2 | 4.1 | 5.9 | 7.5 | 6225 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **4.24** | 3.3 | 4.4 | 5.0 |  |  | 24666 |
| crossing-check{"k":2,"q":2}/size | sunken-intercept/shared | neither | **4.18** | 0.1 | 2.1 | 4.1 | 6.2 | 8.4 | 3548 |
| steady-gradient/gcd-c | whole-intercept/omega | neither | **4.17** | 2.2 | 3.3 | 4.2 | 5.1 | 6.1 | 18724 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **4.16** | 3.3 | 4.4 | 4.8 |  |  | 24414 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":2,"k":0}/difference | neither | **4.15** | 3.3 | 4.4 | 4.7 |  |  | 24414 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **4.15** | 3.3 | 4.4 | 4.7 |  |  | 24414 |
| sunken-intercept/shared | whole-crossing{"q":5,"r":3}/shared-factor | one | **4.14** | 1.5 | 2.2 | 4.0 | 5.8 | 7.2 | 6119 |
| smooth-gradient/shared | sunken-intercept/shared | neither | **4.08** | 2.0 | 3.1 | 4.2 | 4.9 | 6.1 | 12253 |
| sunken-intercept/shared | whole-intercept/gcd-floor-m | neither | **4.04** | 1.9 | 2.9 | 4.1 | 5.1 | 6.2 | 21927 |
| farey-neighbours/bottoms | m-meets-c/size | neither | **4.00** | 4.0 |  |  |  |  | 664 |
| steady-gradient/gcd-c | sunken-intercept/shared | neither | **4.00** | 1.8 | 2.9 | 4.0 | 5.1 | 6.2 | 19825 |
| farey-neighbours/bottoms | m-meets-c/meetPrime | neither | **3.99** | 4.0 |  |  |  |  | 664 |
| egyptian-line/bottom | m-meets-c/meetPrime | neither | **3.98** | 2.8 | 5.1 |  |  |  | 9877 |
| crossing-check{"k":2,"q":6}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.95** | 3.4 | 4.5 |  |  |  | 23974 |
| euclid-steps/largest-quotient | long-division/m-bottom-spf | neither | **3.92** | 2.9 | 4.9 |  |  |  | 17296 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":6,"k":0}/pell-c | neither | **3.88** | 3.0 | 4.2 | 4.5 |  |  | 20095 |
| same-on-both-rulers{"d":2}/shared-factor | square-area/spf | both | **3.88** | 0.5 | 1.4 | 5.9 | 7.7 |  | 3344 |
| crossing-check{"k":2,"q":6}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **3.87** | 3.2 | 4.5 |  |  |  | 15212 |
| crossing-check{"k":2,"q":6}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **3.87** | 3.2 | 4.5 |  |  |  | 15212 |
| crossing-check{"k":2,"q":6}/size | pell-gradient{"D":3,"k":0}/difference | neither | **3.87** | 3.2 | 4.5 |  |  |  | 15263 |
| crossing-check{"k":2,"q":6}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **3.86** | 3.2 | 4.5 |  |  |  | 15263 |
| prime-staircase{"ends":7}/shared-factor | whole-intercept/spf | one | **3.85** | 3.2 | 5.4 | 3.0 |  |  | 7056 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.84** | 3.0 | 4.1 | 4.3 |  |  | 20437 |
| smooth-square/shared | square-area/spf | one | **3.84** | 4.0 | 3.7 |  |  |  | 52513 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":6,"k":0}/pell-c | neither | **3.83** | 3.0 | 4.0 | 4.5 |  |  | 19883 |
| euclid-steps/largest-quotient | prime-slope/twins | neither | **3.80** | 3.8 |  |  |  |  | 6424 |
| prime-staircase{"ends":1}/shared-factor | whole-intercept/spf | one | **3.79** | 0.0 | 3.8 | 7.6 |  |  | 2011 |
| sunken-intercept/shared | whole-crossing{"q":5,"r":1}/shared-factor | one | **3.79** | 1.2 | 2.1 | 3.5 | 5.3 | 6.8 | 6340 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **3.78** | 3.1 | 4.1 | 4.1 |  |  | 11870 |
| crossing-check{"k":3,"q":4}/whole | near-point/gcd-x | neither | **3.77** | 2.9 | 4.4 | 4.0 |  |  | 7823 |
| crossing-check{"k":2,"q":6}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.76** | 3.4 | 4.5 | 3.4 |  |  | 24225 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":6,"k":0}/difference | neither | **3.76** | 3.1 | 4.1 | 4.1 |  |  | 11870 |
| crossing-check{"k":3,"q":4}/whole | near-point/lattice | neither | **3.75** | 2.8 | 4.4 | 4.0 |  |  | 7861 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **3.74** | 2.7 | 4.0 | 4.5 |  |  | 17783 |
| divisibility-ladder/next-rung | square-area/omega | one | **3.73** | 1.1 | 3.5 | 4.8 | 5.5 |  | 5965 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":6,"k":0}/share-den | neither | **3.73** | 3.1 | 4.0 | 4.1 |  |  | 11704 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.72** | 3.0 | 4.1 | 4.1 |  |  | 20851 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":6,"k":0}/difference | neither | **3.71** | 3.1 | 3.9 | 4.1 |  |  | 11704 |
| sunken-intercept/shared | whole-crossing{"q":5,"r":4}/shared-factor | one | **3.70** | 1.2 | 2.1 | 3.5 | 5.2 | 6.5 | 6505 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | smooth-intercept{"primes":[3,13]}/shared-factor | one | **3.69** | 3.7 |  |  |  |  | 30876 |
| prime-staircase{"ends":3}/shared-factor | smooth-intercept{"primes":[3,13]}/shared-factor | both | **3.69** | 3.7 |  |  |  |  | 30876 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":7,"k":0}/pell-c | neither | **3.68** | 2.7 | 3.9 | 4.5 |  |  | 17400 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.68** | 3.2 | 4.1 |  |  |  | 22693 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **3.68** | 3.2 | 4.1 |  |  |  | 22693 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **3.68** | 3.2 | 4.1 |  |  |  | 22693 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | square-area/spf | both | **3.66** | 0.5 | 1.3 | 5.5 | 7.3 |  | 3352 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | smooth-intercept{"primes":[3,17]}/shared-factor | one | **3.66** | 3.7 |  |  |  |  | 28941 |
| prime-staircase{"ends":3}/shared-factor | smooth-intercept{"primes":[3,17]}/shared-factor | both | **3.66** | 3.7 |  |  |  |  | 28941 |
| steep-and-tall/shared | treasure{"k":3}/shared-factor | one | **3.65** | 0.8 | 2.3 | 3.8 | 5.2 | 6.1 | 5739 |
| divisibility-ladder/next-rung | smooth-square/shared | one | **3.64** | 1.1 | 3.3 | 4.7 | 5.4 |  | 5967 |
| pythagorean-area{"ends":9}/shared-factor | ruler{"ends":9}/shared-factor | both | **3.63** | 2.7 | 4.2 | 3.2 | 4.4 |  | 20729 |
| steady-gradient/gcd-c | whole-at-t/gcd-c | neither | **3.62** | 2.9 | 4.0 | 4.3 | 3.8 | 3.2 | 28674 |
| whole-at-t/gcd-c | whole-intercept/gcd-floor-m | neither | **3.62** | 2.9 | 4.0 | 4.3 | 3.8 | 3.2 | 29154 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":2,"k":0}/difference | neither | **3.60** | 3.0 | 4.1 |  |  |  | 20437 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **3.60** | 3.0 | 4.1 |  |  |  | 20437 |
| euclid-steps/largest-quotient | pell-gradient{"D":7,"k":0}/difference | neither | **3.59** | -0.5 | 3.3 | 8.0 |  |  | 2162 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":8}/legs | one | **3.58** | 2.7 | 4.5 |  |  |  | 18274 |
| divisibility-ladder/next-rung | steep-and-tall/shared | one | **3.57** | 1.5 | 2.6 | 3.6 | 4.5 | 5.7 | 9308 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":8}/even | one | **3.57** | 2.7 | 4.5 |  |  |  | 18274 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | smooth-intercept{"primes":[3,11]}/shared-factor | one | **3.56** | 3.6 |  |  |  |  | 27637 |
| prime-staircase{"ends":3}/shared-factor | smooth-intercept{"primes":[3,11]}/shared-factor | both | **3.56** | 3.6 |  |  |  |  | 27637 |
| prime-staircase{"ends":1}/step-back | whole-intercept/spf | one | **3.55** | 0.1 | 3.4 | 7.2 |  |  | 2294 |
| steep-and-tall/shared | treasure{"k":4}/shared-factor | one | **3.55** | 1.0 | 2.1 | 3.4 | 4.7 | 6.5 | 5495 |
| pell-gradient{"D":1,"k":1}/share-den | target-gradient/gcd-tops | neither | **3.54** | 2.1 | 4.3 | 4.2 |  |  | 11431 |
| pell-gradient{"D":1,"k":1}/difference | target-gradient/gcd-tops | neither | **3.54** | 2.1 | 4.3 | 4.2 |  |  | 11431 |
| smooth-intercept{"primes":[3,7]}/shared-factor | steep-and-tall/shared | one | **3.53** | 1.4 | 2.7 | 3.8 | 4.2 | 5.6 | 7793 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":2,"k":0}/difference | neither | **3.49** | 3.2 | 4.1 | 3.1 |  |  | 22690 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **3.49** | 3.2 | 4.1 | 3.1 |  |  | 22690 |
| prime-staircase{"ends":7}/step-back | whole-intercept/spf | one | **3.49** | 2.1 | 5.4 | 3.0 |  |  | 7056 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-intercept{"primes":[3,13]}/shared-factor | one | **3.47** | 3.5 |  |  |  |  | 30876 |
| prime-staircase{"ends":3}/step-back | smooth-intercept{"primes":[3,13]}/shared-factor | both | **3.47** | 3.5 |  |  |  |  | 30876 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":12}/legs | one | **3.46** | 2.5 | 4.2 | 3.7 |  |  | 17625 |
| prime-landing{"ends":9,"side":-1}/shared-factor | prime-staircase{"ends":9}/step-back | both | **3.46** | 1.9 | 3.4 | 3.4 | 5.1 |  | 14658 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":12}/even | one | **3.44** | 2.4 | 4.2 | 3.8 |  |  | 17625 |
| prime-staircase{"ends":7}/shared-factor | whole-intercept/mc-spf | one | **3.44** | 1.7 | 4.0 | 4.7 |  |  | 1343 |
| smooth-intercept{"primes":[3,7]}/shared-factor | sunken-intercept/shared | one | **3.44** | 0.7 | 1.8 | 3.2 | 5.0 | 6.5 | 6265 |
| crossing-check{"k":2,"q":2}/size | whole-crossing{"q":5,"r":4}/shared-factor | one | **3.44** | 1.8 | 2.7 | 3.8 | 5.5 |  | 5202 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-intercept{"primes":[3,17]}/shared-factor | one | **3.44** | 3.4 |  |  |  |  | 28941 |
| prime-staircase{"ends":3}/step-back | smooth-intercept{"primes":[3,17]}/shared-factor | both | **3.44** | 3.4 |  |  |  |  | 28941 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/twins | neither | **3.42** | 3.4 |  |  |  |  | 5205 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/twins | neither | **3.42** | 3.4 |  |  |  |  | 5205 |
| smooth-crossing/shared | whole-crossing{"q":5,"r":2}/shared-factor | one | **3.42** | 2.8 | 2.6 | 3.7 | 4.5 |  | 8193 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.40** | 3.2 | 4.1 | 2.9 |  |  | 22690 |
| crossing-check{"k":3,"q":4}/size | near-point/gcd-x | neither | **3.40** | 1.8 | 4.4 | 4.1 |  |  | 7829 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | one | **3.39** | 3.4 |  |  |  |  | 22341 |
| prime-staircase{"ends":3}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | both | **3.39** | 3.4 |  |  |  |  | 22341 |
| crossing-check{"k":2,"q":2}/size | whole-crossing{"q":5,"r":3}/shared-factor | one | **3.39** | 1.9 | 2.4 | 3.7 | 5.5 |  | 4500 |
| smooth-crossing/shared | whole-crossing{"q":5,"r":3}/shared-factor | one | **3.39** | 2.8 | 2.6 | 3.6 | 4.6 |  | 7967 |
| crossing-check{"k":3,"q":4}/size | near-point/lattice | neither | **3.39** | 1.8 | 4.4 | 4.0 |  |  | 7867 |
| square-area/lpf | sunken-intercept/shared | one | **3.38** | 0.8 | 2.9 | 3.9 | 4.4 | 4.9 | 6874 |
| prime-landing{"ends":9}/shared-factor | prime-staircase{"ends":9}/step-back | both | **3.37** | 1.9 | 3.0 | 3.4 | 5.2 |  | 14790 |
| smooth-crossing/shared | whole-area/gcd-den-m | neither | **3.37** | 3.2 | 3.3 | 3.5 | 3.5 |  | 14501 |
| exact-change/big-piles | whole-crossing{"q":5,"r":1}/shared-factor | one | **3.37** | 2.2 | 3.0 | 4.9 |  |  | 5885 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-intercept{"primes":[3,11]}/shared-factor | one | **3.34** | 3.3 |  |  |  |  | 27637 |
| prime-staircase{"ends":3}/step-back | smooth-intercept{"primes":[3,11]}/shared-factor | both | **3.34** | 3.3 |  |  |  |  | 27637 |
| steep-and-tall/shared | whole-intercept/omega | neither | **3.31** | 1.3 | 2.3 | 3.3 | 4.3 | 5.3 | 8927 |
| steady-gradient/divisors | steep-and-tall/shared | neither | **3.31** | 1.3 | 2.3 | 3.4 | 4.3 | 5.3 | 13964 |
| pythagorean-area{"ends":3}/shared-factor | ruler{"ends":3}/shared-factor | both | **3.29** | 2.5 | 1.7 | 4.1 | 4.9 |  | 12361 |
| pythagorean-area{"ends":3}/shared-factor | triangle-area{"A":4}/even | one | **3.28** | 3.4 | 3.2 |  |  |  | 27375 |
| pythagorean-area{"ends":3}/shared-factor | triangle-area{"A":4}/legs | one | **3.28** | 3.3 | 3.2 |  |  |  | 27375 |
| crossing-check{"k":2,"q":2}/size | whole-crossing{"q":5,"r":2}/shared-factor | one | **3.27** | 1.7 | 2.4 | 3.8 | 5.1 |  | 4101 |
| prime-staircase{"ends":1}/shared-factor | square-area/spf | both | **3.27** | 0.8 | 0.2 | 4.7 | 7.3 |  | 5218 |
| prime-landing{"ends":9,"side":-1}/shared-factor | prime-staircase{"ends":9}/shared-factor | both | **3.25** | 1.9 | 2.4 | 3.4 | 5.3 |  | 14669 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **3.24** | 2.7 | 3.7 |  |  |  | 18467 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":7,"k":0}/difference | neither | **3.22** | 2.7 | 3.7 |  |  |  | 17256 |
| smooth-crossing/shared | whole-intercept/gcd-den-m | neither | **3.22** | 2.6 | 3.3 | 3.2 | 3.8 |  | 11745 |
| pell-gradient{"D":1,"k":1}/share-den | target-gradient/same-den | neither | **3.22** | 2.1 | 4.0 | 3.5 |  |  | 11431 |
| pell-gradient{"D":1,"k":1}/difference | target-gradient/same-den | neither | **3.22** | 2.1 | 4.0 | 3.5 |  |  | 11431 |
| prime-landing{"ends":1}/shared-factor | ruler{"ends":9}/shared-factor | both | **3.19** | 2.1 | 3.2 | 2.6 | 4.8 |  | 13492 |
| euclid-steps/largest-quotient | pell-gradient{"D":7,"k":0}/share-den | neither | **3.18** | -0.5 | 2.1 | 8.0 |  |  | 2179 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-intercept{"primes":[3,7]}/shared-factor | one | **3.17** | 3.2 |  |  |  |  | 22341 |
| prime-staircase{"ends":3}/step-back | smooth-intercept{"primes":[3,7]}/shared-factor | both | **3.17** | 3.2 |  |  |  |  | 22341 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":18}/legs | one | **3.17** | 2.3 | 4.0 |  |  |  | 16396 |
| long-division/c-period | prime-slope/square-sum | neither | **3.16** | 3.2 |  |  |  |  | 4238 |
| long-division/m-top | prime-slope/square-sum | neither | **3.16** | 3.2 |  |  |  |  | 4238 |
| prime-gradient{"ends":9}/shared-factor | steep-and-tall/shared | one | **3.16** | 2.2 | 3.3 | 4.9 | 2.2 |  | 21976 |
| prime-staircase{"ends":9}/shared-factor | ruler{"ends":7}/shared-factor | both | **3.15** | 1.1 | 1.9 | 3.4 | 6.3 |  | 7292 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":18}/even | one | **3.15** | 2.3 | 4.0 |  |  |  | 16403 |
| pythagorean-area{"ends":1}/shared-factor | ruler{"ends":1}/shared-factor | both | **3.15** | 2.6 | 4.6 | 2.2 |  |  | 18428 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/twins | neither | **3.14** | 3.1 |  |  |  |  | 6695 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/twins | neither | **3.14** | 3.1 |  |  |  |  | 6695 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/twins | neither | **3.14** | 3.1 |  |  |  |  | 6695 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":7,"k":0}/share-den | neither | **3.14** | 2.8 | 3.5 |  |  |  | 18046 |
| crossing-check{"k":2,"q":2}/size | whole-crossing{"q":5,"r":1}/shared-factor | one | **3.14** | 1.9 | 1.8 | 3.4 | 5.5 |  | 5672 |
| smooth-intercept{"primes":[3,7]}/shared-factor | whole-intercept/mc-spf | one | **3.14** | 3.1 |  |  |  |  | 7809 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":5,"k":0}/pell-c | neither | **3.14** | 2.6 | 4.1 | 2.7 |  |  | 14076 |
| exact-change/big-piles | prime-landing{"ends":1}/shared-factor | one | **3.14** | 2.3 | 3.1 | 4.1 |  |  | 11862 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":5,"k":0}/difference | neither | **3.13** | 2.6 | 4.1 | 2.7 |  |  | 13731 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":5,"k":0}/share-den | neither | **3.13** | 2.6 | 4.1 | 2.7 |  |  | 13731 |
| prime-gradient{"ends":9}/shared-factor | steady-gradient/gcd-c | one | **3.13** | 1.8 | 2.6 | 5.0 |  |  | 16988 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":7,"k":0}/difference | neither | **3.13** | 2.7 | 3.5 |  |  |  | 16883 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":12}/even | one | **3.11** | 3.1 |  |  |  |  | 24325 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":12}/legs | one | **3.11** | 3.1 |  |  |  |  | 23013 |
| prime-landing{"ends":1}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **3.11** | 2.3 | 3.9 |  |  |  | 7313 |
| pell-gradient{"D":2,"k":0}/difference | target-gradient/gcd-tops | neither | **3.09** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/share-den | target-gradient/gcd-tops | neither | **3.09** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/pell-c | target-gradient/gcd-tops | neither | **3.09** | 3.1 |  |  |  |  | 22420 |
| prime-landing{"ends":1,"side":-1}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **3.09** | 2.3 | 3.9 |  |  |  | 7171 |
| divisibility-ladder/next-rung | whole-crossing{"q":5,"r":2}/shared-factor | both | **3.09** | 1.9 | 3.4 | 3.9 |  |  | 5343 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | steady-gradient/gcd-c | one | **3.09** | 1.8 | 2.6 | 4.9 |  |  | 17038 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":5,"k":0}/pell-c | neither | **3.08** | 2.6 | 3.9 | 2.7 |  |  | 13924 |
| exact-change/prime-coins | whole-crossing{"q":5,"r":1}/shared-factor | one | **3.08** | 2.1 | 2.5 | 4.7 |  |  | 6262 |
| prime-gradient{"ends":9}/shared-factor | whole-intercept/gcd-floor-m | one | **3.08** | 1.7 | 2.5 | 5.0 |  |  | 16087 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":5,"k":0}/difference | neither | **3.08** | 2.6 | 3.9 | 2.7 |  |  | 13580 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":5,"k":0}/share-den | neither | **3.08** | 2.6 | 3.9 | 2.7 |  |  | 13580 |
| pell-gradient{"D":2,"k":0}/difference | target-gradient/same-den | neither | **3.07** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/share-den | target-gradient/same-den | neither | **3.07** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/pell-c | target-gradient/same-den | neither | **3.07** | 3.1 |  |  |  |  | 22420 |
| prime-landing{"ends":9}/shared-factor | prime-staircase{"ends":9}/shared-factor | both | **3.07** | 1.9 | 2.3 | 3.4 | 4.7 |  | 14824 |
| crossing-check{"k":2,"q":6}/size | target-gradient/same-den | neither | **3.06** | 2.3 | 3.8 |  |  |  | 12131 |
| prime-staircase{"ends":1}/step-back | square-area/spf | both | **3.05** | 0.8 | -0.2 | 4.4 | 7.2 |  | 5566 |
| crossing-check{"k":2,"q":6}/whole | target-gradient/same-den | neither | **3.05** | 2.3 | 3.8 |  |  |  | 11839 |
| prime-staircase{"ends":7}/step-back | whole-intercept/mc-spf | one | **3.04** | 0.5 | 4.0 | 4.6 |  |  | 1343 |
| smooth-intercept{"primes":[3,13]}/shared-factor | steep-and-tall/shared | one | **3.04** | 1.3 | 2.7 | 3.9 | 4.3 |  | 7830 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-intercept/gcd-floor-m | one | **3.03** | 1.7 | 2.5 | 4.9 |  |  | 15817 |
| long-division/m-bottom-spf | prime-slope/square-sum | neither | **3.03** | 3.2 | 2.9 |  |  |  | 4238 |
| crossing-check{"k":1,"q":2}/size | near-point/gcd-x | neither | **3.03** | 2.5 | 3.5 |  |  |  | 14331 |
| crossing-check{"k":1,"q":2}/size | near-point/lattice | neither | **3.02** | 2.5 | 3.5 |  |  |  | 14512 |
| smooth-intercept{"primes":[3,11]}/shared-factor | steep-and-tall/shared | one | **3.02** | 1.3 | 2.7 | 3.8 | 4.3 |  | 7735 |
| smooth-intercept{"primes":[3,11]}/shared-factor | whole-intercept/mc-spf | one | **3.02** | 3.0 |  |  |  |  | 7311 |
| smooth-crossing/shared | whole-crossing{"q":5,"r":1}/shared-factor | one | **3.02** | 2.1 | 2.7 | 3.1 | 4.2 |  | 6914 |
| smooth-intercept{"primes":[3,17]}/shared-factor | steep-and-tall/shared | one | **3.01** | 1.3 | 2.7 | 3.7 | 4.3 |  | 7601 |
| exact-change/big-bill | whole-crossing{"q":5,"r":1}/shared-factor | one | **3.01** | 2.0 | 2.5 | 4.6 |  |  | 6269 |
| divisibility-ladder/next-rung | whole-crossing{"q":5,"r":3}/shared-factor | both | **3.01** | 1.9 | 3.3 | 3.8 |  |  | 5257 |
| pell-gradient{"D":5,"k":0}/difference | target-gradient/same-den | neither | **3.01** | 3.0 |  |  |  |  | 18730 |
| pell-gradient{"D":5,"k":0}/share-den | target-gradient/same-den | neither | **3.01** | 3.0 |  |  |  |  | 18730 |
| prime-landing{"ends":1}/shared-factor | prime-staircase{"ends":1}/step-back | both | **3.00** | 1.8 | 3.4 | 3.8 |  |  | 10734 |
| smooth-intercept{"primes":[3,13]}/shared-factor | whole-intercept/mc-spf | one | **2.99** | 3.0 |  |  |  |  | 7073 |
| smooth-intercept{"primes":[3,17]}/shared-factor | whole-intercept/mc-spf | one | **2.99** | 3.0 |  |  |  |  | 6824 |
| pythagorean-area{"ends":9}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.99** | 1.6 | 3.0 | 4.4 |  |  | 4890 |
| crossing-check{"k":1,"q":2}/whole | near-point/gcd-x | neither | **2.99** | 2.5 | 3.5 |  |  |  | 14514 |
| crossing-check{"k":1,"q":2}/whole | near-point/lattice | neither | **2.99** | 2.5 | 3.5 |  |  |  | 14696 |
| pell-gradient{"D":5,"k":0}/difference | target-gradient/gcd-tops | neither | **2.98** | 3.0 |  |  |  |  | 18049 |
| pell-gradient{"D":5,"k":0}/share-den | target-gradient/gcd-tops | neither | **2.98** | 3.0 |  |  |  |  | 18049 |
| exact-change/big-piles | pythagorean-area{"ends":7}/shared-factor | one | **2.98** | 1.7 | 3.0 | 4.3 |  |  | 7326 |
| crossing-check{"k":3,"q":4}/whole | triangle-area{"A":6}/even | neither | **2.97** | 0.7 | 0.9 | 1.8 | 8.5 |  | 1967 |
| pell-gradient{"D":5,"k":0}/pell-c | target-gradient/same-den | neither | **2.97** | 3.0 |  |  |  |  | 18730 |
| divisibility-ladder/next-rung | whole-crossing{"q":5,"r":4}/shared-factor | both | **2.97** | 1.6 | 3.2 | 4.1 |  |  | 5304 |
| prime-gradient{"ends":9}/shared-factor | smooth-gradient/shared | one | **2.96** | 2.1 | 2.6 | 4.2 |  |  | 9950 |
| prime-gradient{"ends":9}/shared-factor | steady-gradient/divisors | one | **2.96** | 2.2 | 3.3 | 3.4 |  |  | 22045 |
| smooth-crossing/shared | whole-crossing{"q":5,"r":4}/shared-factor | one | **2.96** | 2.1 | 2.6 | 3.1 | 4.1 |  | 6944 |
| divisibility-ladder/next-rung | whole-crossing{"q":5,"r":1}/shared-factor | both | **2.96** | 1.6 | 3.2 | 4.0 |  |  | 5373 |
| prime-staircase{"ends":9}/step-back | ruler{"ends":1}/shared-factor | both | **2.96** | 1.6 | 1.1 | 3.7 | 5.5 |  | 11471 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | steady-gradient/divisors | one | **2.96** | 2.3 | 3.3 | 3.3 |  |  | 22125 |
| euclid-steps/largest-quotient | long-division/c-period | neither | **2.95** | 2.9 |  |  |  |  | 17296 |
| euclid-steps/largest-quotient | long-division/m-top | neither | **2.95** | 2.9 |  |  |  |  | 17296 |
| pythagorean-area{"ends":9}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.94** | 1.6 | 3.0 | 4.3 |  |  | 4878 |
| pythagorean-area{"ends":9}/shared-factor | ruler{"ends":7}/shared-factor | both | **2.94** | 1.9 | 3.0 | 4.0 |  |  | 11202 |
| pell-gradient{"D":5,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.94** | 2.9 |  |  |  |  | 18049 |
| smooth-square/shared | whole-intercept/gcd-den-m | neither | **2.94** | 2.1 | 1.3 | 2.7 | 5.6 |  | 8827 |
| pythagorean-area{"ends":1}/shared-factor | whole-intercept/gcd-den-m | one | **2.93** | 1.7 | 3.1 | 4.0 |  |  | 8805 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | smooth-gradient/shared | one | **2.93** | 2.1 | 2.5 | 4.2 |  |  | 9909 |
| square-area/omega | whole-intercept/gcd-den-m | neither | **2.93** | 2.1 | 1.3 | 2.7 | 5.7 |  | 8823 |
| prime-staircase{"ends":9}/step-back | whole-area/gcd-x | one | **2.93** | 2.3 | 3.5 |  |  |  | 17438 |
| smooth-square/shared | whole-crossing{"q":5,"r":2}/shared-factor | one | **2.92** | 1.2 | 2.7 | 3.3 | 4.5 |  | 3634 |
| crossing-check{"k":2,"q":6}/size | target-gradient/gcd-tops | neither | **2.92** | 2.3 | 3.5 |  |  |  | 12004 |
| crossing-check{"k":2,"q":6}/whole | target-gradient/gcd-tops | neither | **2.91** | 2.3 | 3.5 |  |  |  | 11712 |
| square-area/omega | whole-crossing{"q":5,"r":3}/shared-factor | one | **2.91** | 1.3 | 2.5 | 3.2 | 4.6 |  | 3683 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":5,"k":0}/pell-c | neither | **2.91** | 2.7 | 3.1 |  |  |  | 13424 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":5,"k":0}/difference | neither | **2.91** | 2.7 | 3.1 |  |  |  | 13021 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":5,"k":0}/share-den | neither | **2.91** | 2.7 | 3.1 |  |  |  | 13021 |
| near-point/gcd-x | same-on-both-rulers{"d":2}/shared-factor | one | **2.89** | 2.9 | 2.9 |  |  |  | 19507 |
| prime-landing{"ends":9}/shared-factor | whole-area/gcd-x | one | **2.89** | 2.6 | 3.3 | 2.8 |  |  | 20260 |
| near-point/lattice | same-on-both-rulers{"d":2}/shared-factor | one | **2.89** | 2.9 | 2.9 |  |  |  | 19688 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.88** | 3.0 | 2.8 |  |  |  | 16669 |
| divisibility-ladder/next-rung | prime-staircase{"ends":9}/step-back | both | **2.88** | 2.0 | 3.8 |  |  |  | 12840 |
| exact-change/prime-coins | prime-landing{"ends":1}/shared-factor | one | **2.88** | 2.0 | 2.8 | 3.8 |  |  | 11656 |
| exact-change/big-bill | prime-landing{"ends":1}/shared-factor | one | **2.88** | 2.1 | 2.7 | 3.8 |  |  | 13129 |
| smooth-intercept{"primes":[3,7]}/shared-factor | whole-at-t/gcd-c | one | **2.88** | 0.7 | 2.5 | 3.2 | 5.1 |  | 4090 |
| egyptian-line/bottom | farey-neighbours/bottoms | neither | **2.87** | 2.9 |  |  |  |  | 170 |
| sunken-intercept/shared | whole-intercept/gcd-den-m | neither | **2.87** | 1.6 | 2.4 | 2.8 | 3.6 | 3.9 | 12330 |
| prime-landing{"ends":9,"side":-1}/shared-factor | whole-area/gcd-x | one | **2.86** | 2.6 | 3.2 | 2.8 |  |  | 19945 |
| crossing-check{"k":3,"q":6}/whole | target-gradient/same-den | neither | **2.86** | 2.4 | 3.3 |  |  |  | 12625 |
| smooth-square/shared | whole-crossing{"q":5,"r":3}/shared-factor | one | **2.86** | 1.3 | 2.6 | 3.3 | 4.3 |  | 3683 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/twins | neither | **2.86** | 2.9 |  |  |  |  | 5743 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/twins | neither | **2.86** | 2.9 |  |  |  |  | 5743 |
| smooth-intercept{"primes":[3,7]}/shared-factor | whole-intercept/gcd-floor-m | one | **2.85** | 2.0 | 2.7 | 3.3 | 3.4 |  | 13089 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":18}/even | one | **2.85** | 2.2 | 4.5 | 1.9 |  |  | 13193 |
| prime-landing{"ends":1,"side":-1}/shared-factor | prime-staircase{"ends":1}/step-back | both | **2.85** | 1.6 | 3.1 | 3.9 |  |  | 10212 |
| crossing-check{"k":3,"q":6}/size | target-gradient/same-den | neither | **2.84** | 2.4 | 3.3 |  |  |  | 12443 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/twins | neither | **2.84** | 2.8 |  |  |  |  | 5743 |
| prime-staircase{"ends":9}/step-back | whole-at-t/gcd-c | one | **2.84** | 1.9 | 3.7 |  |  |  | 11613 |
| whole-crossing{"q":5,"r":1}/shared-factor | whole-intercept/omega | one | **2.83** | 1.5 | 1.9 | 2.6 | 3.6 | 4.6 | 5225 |
| steady-gradient/gcd-c | whole-intercept/mc-spf | neither | **2.83** | 3.2 | 3.1 | 2.2 |  |  | 8982 |
| prime-landing{"ends":1,"side":-1}/shared-factor | pythagorean-area{"ends":1}/shared-factor | both | **2.82** | 2.0 | 2.5 | 2.7 | 4.1 |  | 12107 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":18}/legs | one | **2.82** | 2.1 | 4.5 | 1.9 |  |  | 12146 |
| prime-staircase{"ends":9}/shared-factor | pythagorean-area{"ends":1}/shared-factor | both | **2.82** | 1.8 | 2.0 | 2.7 | 4.8 |  | 14585 |
| whole-crossing{"q":5,"r":2}/shared-factor | whole-intercept/omega | one | **2.82** | 2.0 | 2.1 | 3.1 | 4.1 |  | 5338 |
| divisibility-ladder/next-rung | pythagorean-area{"ends":9}/shared-factor | both | **2.81** | 1.6 | 4.0 |  |  |  | 8535 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **2.81** | 3.0 | 4.1 | 1.3 |  |  | 20851 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **2.81** | 3.0 | 4.1 | 1.3 |  |  | 20851 |
| prime-staircase{"ends":9}/step-back | smooth-crossing/shared | one | **2.81** | 2.6 | 3.0 |  |  |  | 13601 |
| pythagorean-area{"ends":9}/shared-factor | steep-and-tall/shared | one | **2.81** | 0.8 | 1.5 | 2.7 | 4.2 | 4.8 | 7552 |
| prime-landing{"ends":1}/shared-factor | ruler{"ends":1}/shared-factor | both | **2.80** | 2.0 | 2.6 | 2.8 | 3.8 |  | 12086 |
| smooth-intercept{"primes":[3,7]}/shared-factor | steady-gradient/gcd-c | one | **2.80** | 1.8 | 2.7 | 3.3 | 3.4 |  | 11385 |
| prime-landing{"ends":9}/shared-factor | sunken-intercept/shared | one | **2.80** | 2.0 | 2.6 | 2.8 | 2.7 | 3.9 | 18858 |
| prime-landing{"ends":9,"side":-1}/shared-factor | sunken-intercept/shared | one | **2.80** | 2.0 | 2.5 | 2.7 | 2.5 | 4.2 | 18641 |
| prime-landing{"ends":9}/shared-factor | smooth-crossing/shared | one | **2.79** | 2.5 | 2.9 | 3.0 |  |  | 12999 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":5,"k":0}/difference | neither | **2.79** | 2.6 | 3.0 |  |  |  | 13623 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":5,"k":0}/share-den | neither | **2.79** | 2.6 | 3.0 |  |  |  | 13623 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/twins | neither | **2.79** | 2.8 |  |  |  |  | 5205 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":5,"k":0}/pell-c | neither | **2.79** | 2.6 | 3.0 |  |  |  | 14025 |
| smooth-square/shared | whole-area/gcd-den-m | neither | **2.79** | 2.4 | 1.7 | 3.4 | 3.6 |  | 9248 |
| pythagorean-area{"ends":7}/shared-factor | ruler{"ends":7}/shared-factor | both | **2.78** | 2.4 | 1.7 | 3.3 | 3.7 |  | 13212 |
| prime-staircase{"ends":1}/shared-factor | same-on-both-rulers{"d":1}/shared-factor | both | **2.78** | -0.1 | 4.0 | 4.5 |  |  | 3567 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.78** | 2.9 | 2.6 |  |  |  | 17241 |
| square-area/omega | whole-area/gcd-den-m | neither | **2.77** | 2.4 | 1.7 | 3.4 | 3.5 |  | 9248 |
| prime-landing{"ends":9}/shared-factor | whole-intercept/omega | one | **2.76** | 2.1 | 2.4 | 3.1 | 3.3 |  | 13066 |
| pell-gradient{"D":1,"k":1}/pell-c | target-gradient/gcd-tops | neither | **2.75** | 2.1 | 4.5 | 1.7 |  |  | 11547 |
| prime-landing{"ends":1}/shared-factor | pythagorean-area{"ends":1}/shared-factor | both | **2.74** | 2.0 | 2.5 | 2.8 | 3.7 |  | 11900 |
| prime-landing{"ends":9}/shared-factor | ruler{"ends":1}/shared-factor | both | **2.74** | 1.8 | 1.4 | 2.8 | 4.8 |  | 12310 |
| square-area/omega | whole-crossing{"q":5,"r":4}/shared-factor | one | **2.74** | 1.2 | 2.2 | 3.0 | 4.6 |  | 4128 |
| same-on-both-rulers{"d":2}/shared-factor | triangle-area{"A":8}/legs | one | **2.74** | 2.3 | 3.2 |  |  |  | 13876 |
| ruler{"ends":9}/shared-factor | square-area/lpf | both | **2.73** | 1.1 | 4.7 | 2.4 |  |  | 6499 |
| same-on-both-rulers{"d":2}/shared-factor | triangle-area{"A":8}/even | one | **2.73** | 2.3 | 3.2 |  |  |  | 14051 |
| egyptian-line/bottom | m-meets-c/size | neither | **2.73** | 2.7 |  |  |  |  | 9301 |
| smooth-intercept{"primes":[3,17]}/shared-factor | whole-intercept/gcd-floor-m | one | **2.73** | 1.8 | 2.7 | 3.3 | 3.1 |  | 11026 |
| prime-landing{"ends":9,"side":-1}/shared-factor | smooth-crossing/shared | one | **2.73** | 2.5 | 2.8 | 2.8 |  |  | 12828 |
| prime-staircase{"ends":1}/shared-factor | same-on-both-rulers{"d":1,"side":-1}/shared-factor | both | **2.72** | -0.1 | 4.0 | 4.3 |  |  | 3586 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":8}/legs | one | **2.72** | 2.3 | 3.2 |  |  |  | 13928 |
| crossing-check{"k":2,"q":2}/size | treasure{"k":3,"side":-1}/shared-factor | one | **2.72** | 1.6 | 1.5 | 2.8 | 4.9 |  | 6693 |
| smooth-intercept{"primes":[3,11]}/shared-factor | whole-at-t/gcd-c | one | **2.72** | 0.4 | 2.4 | 2.9 | 5.2 |  | 3285 |
| smooth-intercept{"primes":[3,11]}/shared-factor | whole-intercept/gcd-floor-m | one | **2.71** | 1.8 | 2.7 | 3.2 | 3.2 |  | 11421 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":8}/even | one | **2.71** | 2.3 | 3.2 |  |  |  | 14104 |
| smooth-intercept{"primes":[3,17]}/shared-factor | steady-gradient/gcd-c | one | **2.70** | 1.7 | 2.6 | 3.3 | 3.1 |  | 10547 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":6,"k":0}/pell-c | neither | **2.70** | 2.9 | 2.5 |  |  |  | 16617 |
| smooth-intercept{"primes":[3,13]}/shared-factor | whole-intercept/gcd-floor-m | one | **2.70** | 1.8 | 2.7 | 3.2 | 3.1 |  | 11190 |
| prime-landing{"ends":9,"side":-1}/shared-factor | whole-intercept/omega | one | **2.69** | 2.1 | 2.3 | 2.9 | 3.4 |  | 12741 |
| prime-staircase{"ends":9}/step-back | ruler{"ends":7}/shared-factor | both | **2.69** | 1.1 | 0.4 | 3.4 | 5.9 |  | 7268 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":6}/legs | one | **2.69** | 2.7 |  |  |  |  | 17935 |
| exact-change/big-bill | pythagorean-area{"ends":7}/shared-factor | one | **2.69** | 1.6 | 2.4 | 4.1 |  |  | 8508 |
| crossing-check{"k":2,"q":2}/size | smooth-intercept{"primes":[3,7]}/shared-factor | one | **2.69** | 0.5 | 1.5 | 3.9 | 4.8 |  | 3096 |
| exact-change/prime-coins | pythagorean-area{"ends":7}/shared-factor | one | **2.68** | 1.4 | 2.5 | 4.1 |  |  | 6970 |
| smooth-intercept{"primes":[3,11]}/shared-factor | steady-gradient/gcd-c | one | **2.68** | 1.7 | 2.6 | 3.2 | 3.2 |  | 10593 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":6}/even | one | **2.68** | 2.7 |  |  |  |  | 17964 |
| ruler{"ends":9}/shared-factor | sunken-intercept/shared | one | **2.67** | 1.8 | 1.9 | 1.9 | 3.0 | 4.8 | 15178 |
| prime-landing{"ends":9,"side":-1}/shared-factor | ruler{"ends":1}/shared-factor | both | **2.67** | 1.8 | 1.5 | 2.8 | 4.6 |  | 12061 |
| smooth-intercept{"primes":[3,13]}/shared-factor | steady-gradient/gcd-c | one | **2.67** | 1.7 | 2.6 | 3.2 | 3.2 |  | 10696 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.67** | 2.6 | 2.8 |  |  |  | 9112 |
| ruler{"ends":7}/shared-factor | triangle-area{"A":18}/legs | one | **2.67** | 2.4 | 2.9 |  |  |  | 14028 |
| crossing-check{"k":3,"q":4}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **2.66** | 3.3 | 2.8 | 1.9 |  |  | 10660 |
| crossing-check{"k":3,"q":4}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **2.66** | 3.3 | 2.8 | 1.9 |  |  | 10660 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.66** | 2.6 | 2.7 |  |  |  | 9112 |
| ruler{"ends":7}/shared-factor | triangle-area{"A":18}/even | one | **2.66** | 2.4 | 2.9 |  |  |  | 14207 |
| prime-staircase{"ends":7}/shared-factor | triangle-area{"A":12}/legs | one | **2.65** | 1.4 | 2.0 | 4.6 |  |  | 3905 |
| smooth-crossing/shared | square-area/lpf | one | **2.65** | 2.1 | 3.2 |  |  |  | 9873 |
| smooth-square/shared | whole-crossing{"q":5,"r":4}/shared-factor | one | **2.65** | 1.1 | 2.3 | 3.1 | 4.2 |  | 4128 |
| square-area/omega | whole-crossing{"q":5,"r":1}/shared-factor | one | **2.64** | 1.2 | 2.2 | 2.9 | 4.3 |  | 4128 |
| whole-crossing{"q":5,"r":3}/shared-factor | whole-intercept/omega | one | **2.64** | 1.9 | 2.0 | 3.0 | 3.7 |  | 5176 |
| smooth-intercept{"primes":[3,13]}/shared-factor | whole-at-t/gcd-c | one | **2.64** | 0.4 | 2.4 | 2.8 | 5.0 |  | 3129 |
| pell-gradient{"D":6,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.63** | 1.9 | 1.9 | 4.2 |  |  | 672 |
| prime-landing{"ends":1,"side":-1}/shared-factor | whole-area/gcd-den-m | one | **2.63** | 2.0 | 3.3 |  |  |  | 7285 |
| prime-staircase{"ends":7}/step-back | triangle-area{"A":12}/even | one | **2.62** | 1.4 | 2.0 | 4.4 |  |  | 7517 |
| exact-change/big-piles | same-on-both-rulers{"d":2}/shared-factor | one | **2.62** | 2.7 | 2.6 |  |  |  | 14632 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.61** | 3.2 | 2.1 |  |  |  | 14439 |
| prime-staircase{"ends":1}/step-back | same-on-both-rulers{"d":1}/shared-factor | both | **2.61** | -0.2 | 3.6 | 4.5 |  |  | 3616 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.61** | 3.2 | 2.0 |  |  |  | 14439 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | whole-intercept/mc-spf | neither | **2.61** | 2.6 |  |  |  |  | 4235 |
| prime-staircase{"ends":3}/shared-factor | whole-intercept/mc-spf | one | **2.61** | 2.6 |  |  |  |  | 4235 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **2.60** | 2.8 | 2.4 |  |  |  | 8260 |
| prime-staircase{"ends":7}/shared-factor | triangle-area{"A":12}/even | one | **2.60** | 1.3 | 2.0 | 4.5 |  |  | 3905 |
| ruler{"ends":3}/shared-factor | whole-intercept/gcd-den-m | one | **2.60** | 1.7 | 2.1 | 3.0 | 3.6 |  | 5874 |
| near-point/gcd-x | target-gradient/same-den | neither | **2.59** | 2.0 | 2.8 | 3.0 |  |  | 9861 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.59** | 2.5 | 2.7 |  |  |  | 9653 |
| prime-landing{"ends":9}/shared-factor | square-area/lpf | both | **2.59** | 1.1 | 3.3 | 3.4 |  |  | 6726 |
| smooth-square/shared | whole-crossing{"q":5,"r":1}/shared-factor | one | **2.59** | 1.1 | 2.3 | 2.9 | 4.0 |  | 4128 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.59** | 3.2 | 2.0 |  |  |  | 14186 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.59** | 2.5 | 2.6 |  |  |  | 9653 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.59** | 3.2 | 2.0 |  |  |  | 14186 |
| near-point/lattice | target-gradient/same-den | neither | **2.58** | 2.0 | 2.8 | 3.0 |  |  | 10062 |
| prime-landing{"ends":9,"side":-1}/shared-factor | square-area/lpf | both | **2.58** | 1.1 | 3.3 | 3.4 |  |  | 6583 |
| prime-staircase{"ends":9}/shared-factor | smooth-crossing/shared | one | **2.57** | 2.6 |  |  |  |  | 13606 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":6,"k":0}/pell-c | neither | **2.57** | 2.8 | 2.3 |  |  |  | 17216 |
| pythagorean-area{"ends":3}/shared-factor | same-on-both-rulers{"d":1}/shared-factor | both | **2.57** | 1.6 | 2.1 | 4.0 |  |  | 8393 |
| ruler{"ends":9}/shared-factor | square-area/spf | both | **2.57** | 1.1 | 4.0 | 2.6 |  |  | 6499 |
| crossing-check{"k":3,"q":4}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **2.57** | 3.3 | 2.8 | 1.7 |  |  | 10660 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.56** | 2.9 | 2.2 |  |  |  | 12394 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.56** | 2.9 | 2.2 |  |  |  | 12394 |
| exact-change/big-bill | same-on-both-rulers{"d":1}/shared-factor | one | **2.56** | 2.6 | 1.8 | 3.3 |  |  | 15625 |
| pell-gradient{"D":6,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.55** | 1.9 | 1.6 | 4.2 |  |  | 672 |
| prime-landing{"ends":1}/shared-factor | whole-area/gcd-den-m | one | **2.55** | 1.9 | 3.2 |  |  |  | 7144 |
| prime-landing{"ends":1,"side":-1}/shared-factor | ruler{"ends":9}/shared-factor | both | **2.55** | 2.1 | 3.2 | 2.4 |  |  | 13260 |
| crossing-check{"k":3,"q":6}/whole | near-point/lattice | neither | **2.55** | 2.4 | 2.7 |  |  |  | 12769 |
| crossing-check{"k":3,"q":6}/whole | near-point/gcd-x | neither | **2.55** | 2.4 | 2.7 |  |  |  | 12552 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":6}/even | one | **2.54** | 2.2 | 2.9 |  |  |  | 13012 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":6}/legs | one | **2.54** | 2.2 | 2.9 |  |  |  | 12807 |
| prime-staircase{"ends":1}/step-back | same-on-both-rulers{"d":1,"side":-1}/shared-factor | both | **2.54** | -0.2 | 3.6 | 4.3 |  |  | 3665 |
| prime-landing{"ends":1,"side":-1}/shared-factor | ruler{"ends":1}/shared-factor | both | **2.53** | 2.0 | 2.5 | 3.1 |  |  | 12002 |
| same-on-both-rulers{"d":2}/shared-factor | triangle-area{"A":6}/even | one | **2.53** | 2.2 | 2.9 |  |  |  | 12972 |
| crossing-check{"k":3,"q":6}/size | near-point/lattice | neither | **2.53** | 2.4 | 2.7 |  |  |  | 12700 |
| prime-staircase{"ends":9}/shared-factor | ruler{"ends":1}/shared-factor | both | **2.53** | 1.6 | 2.4 | 3.7 |  |  | 11488 |
| crossing-check{"k":3,"q":6}/size | near-point/gcd-x | neither | **2.53** | 2.4 | 2.7 |  |  |  | 12483 |
| same-on-both-rulers{"d":2}/shared-factor | triangle-area{"A":6}/legs | one | **2.53** | 2.2 | 2.9 |  |  |  | 12733 |
| exact-change/big-piles | triangle-area{"A":18}/even | neither | **2.53** | 2.0 | 3.1 |  |  |  | 9485 |
| exact-change/big-piles | triangle-area{"A":18}/legs | neither | **2.53** | 2.0 | 3.1 |  |  |  | 9276 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.53** | 2.9 | 2.2 |  |  |  | 12030 |
| prime-landing{"ends":1,"side":-1}/shared-factor | prime-staircase{"ends":1}/shared-factor | both | **2.53** | 1.6 | 2.0 | 3.9 |  |  | 9686 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.53** | 2.9 | 2.2 |  |  |  | 12030 |
| prime-staircase{"ends":9}/step-back | ruler{"ends":9}/shared-factor | both | **2.52** | 1.7 | 3.1 | 2.8 |  |  | 12813 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":12}/legs | one | **2.52** | 2.3 | 2.8 |  |  |  | 13882 |
| prime-landing{"ends":1}/shared-factor | prime-staircase{"ends":1}/shared-factor | both | **2.52** | 1.7 | 2.0 | 3.9 |  |  | 9709 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":6,"k":0}/difference | neither | **2.52** | 2.8 | 2.2 |  |  |  | 8260 |
| prime-staircase{"ends":7}/step-back | triangle-area{"A":12}/legs | one | **2.51** | 1.1 | 2.0 | 4.5 |  |  | 6039 |
| pythagorean-area{"ends":3}/shared-factor | triangle-area{"A":6}/even | one | **2.51** | 2.5 |  |  |  |  | 15052 |
| prime-gradient{"ends":1}/shared-factor | steep-and-tall/shared | one | **2.51** | 2.3 | 3.8 | 1.9 | 1.5 | 3.1 | 20579 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.51** | 2.8 | 2.2 |  |  |  | 16761 |
| prime-staircase{"ends":1}/step-back | ruler{"ends":1}/shared-factor | both | **2.50** | 1.8 | 2.6 | 3.0 |  |  | 11267 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"d":2}/shared-factor | one | **2.50** | 2.2 | 2.8 |  |  |  | 6751 |
| smooth-gradient/shared | square-area/omega | neither | **2.50** | 0.8 | 2.9 | 2.3 | 4.1 |  | 3303 |
| square-area/lpf | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.50** | 1.3 | 3.6 | 2.6 |  |  | 3683 |
| ruler{"ends":7}/shared-factor | triangle-area{"A":8}/legs | one | **2.50** | 1.9 | 3.1 |  |  |  | 9107 |
| ruler{"ends":3}/shared-factor | same-on-both-rulers{"d":1}/shared-factor | both | **2.50** | 0.4 | 3.3 | 3.9 |  |  | 3251 |
| crossing-check{"k":3,"q":2}/whole | near-point/lattice | neither | **2.50** | 2.5 |  |  |  |  | 8405 |
| crossing-check{"k":3,"q":2}/whole | near-point/gcd-x | neither | **2.49** | 2.5 |  |  |  |  | 8248 |
| ruler{"ends":1}/shared-factor | sunken-intercept/shared | one | **2.49** | 1.5 | 1.4 | 1.7 | 3.3 | 4.5 | 12492 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":12}/even | one | **2.49** | 2.2 | 2.7 |  |  |  | 14263 |
| pythagorean-area{"ends":3}/shared-factor | same-on-both-rulers{"d":1,"side":-1}/shared-factor | both | **2.48** | 1.6 | 1.9 | 3.9 |  |  | 8428 |
| ruler{"ends":7}/shared-factor | triangle-area{"A":8}/even | one | **2.48** | 1.9 | 3.1 |  |  |  | 9108 |
| same-on-both-rulers{"d":2}/shared-factor | triangle-area{"A":12}/legs | one | **2.48** | 2.3 | 2.7 |  |  |  | 13701 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/matching-c | neither | **2.48** | 2.5 |  |  |  |  | 7658 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/matching-c | neither | **2.48** | 2.5 |  |  |  |  | 7658 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":18}/legs | one | **2.48** | 2.5 |  |  |  |  | 17625 |
| prime-staircase{"ends":1}/step-back | pythagorean-area{"ends":1}/shared-factor | both | **2.48** | 1.9 | 2.7 | 2.9 |  |  | 12693 |
| pell-gradient{"D":6,"k":0}/pell-c | target-gradient/same-den | neither | **2.47** | 2.5 |  |  |  |  | 12722 |
| pythagorean-area{"ends":3}/shared-factor | triangle-area{"A":6}/legs | one | **2.47** | 2.5 |  |  |  |  | 14433 |
| exact-change/big-bill | ruler{"ends":3}/shared-factor | one | **2.47** | 1.3 | 2.5 | 3.6 |  |  | 6873 |
| prime-landing{"ends":1}/shared-factor | square-area/lpf | both | **2.47** | 0.9 | 3.3 | 3.2 |  |  | 5204 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.47** | 2.8 | 2.2 |  |  |  | 16182 |
| square-area/lpf | whole-intercept/omega | one | **2.47** | 1.4 | 2.7 | 2.9 | 2.8 |  | 6954 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.46** | 3.1 | 1.9 |  |  |  | 13257 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.46** | 3.1 | 1.9 |  |  |  | 13257 |
| m-meets-c/size | smooth-gradient/shared | neither | **2.46** | -0.6 | 1.4 | 3.7 | 5.4 |  | 893 |
| prime-landing{"ends":9,"side":-1}/shared-factor | same-on-both-rulers{"d":2,"side":-1}/shared-factor | both | **2.46** | 0.0 | 0.2 | 4.5 | 5.0 |  | 3515 |
| whole-area/gcd-den-m | whole-intercept/omega | neither | **2.46** | 2.2 | 2.4 | 2.4 | 2.7 |  | 9858 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":6,"k":0}/share-den | neither | **2.45** | 2.6 | 2.3 |  |  |  | 8260 |
| same-on-both-rulers{"d":2}/shared-factor | triangle-area{"A":12}/even | one | **2.45** | 2.2 | 2.7 |  |  |  | 14085 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.45** | 3.1 | 1.8 |  |  |  | 13290 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":18}/even | one | **2.45** | 2.4 |  |  |  |  | 17625 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.45** | 3.1 | 1.8 |  |  |  | 13290 |
| prime-landing{"ends":9,"side":-1}/shared-factor | ruler{"ends":3}/shared-factor | both | **2.45** | 0.5 | 1.8 | 1.8 | 5.6 |  | 4714 |
| divisibility-ladder/next-rung | prime-staircase{"ends":1}/shared-factor | both | **2.44** | 2.4 |  |  |  |  | 15070 |
| square-area/spf | whole-intercept/spf | one | **2.44** | -0.1 | 2.2 | 5.3 |  |  | 1540 |
| prime-landing{"ends":9}/shared-factor | same-on-both-rulers{"d":2}/shared-factor | both | **2.44** | -0.1 | 0.4 | 4.4 | 5.0 |  | 3361 |
| exact-change/prime-coins | same-on-both-rulers{"d":2}/shared-factor | one | **2.43** | 2.4 | 2.5 |  |  |  | 14202 |
| pell-gradient{"D":6,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.43** | 2.4 |  |  |  |  | 12055 |
| pell-gradient{"D":1,"k":1}/pell-c | target-gradient/same-den | neither | **2.43** | 2.1 | 4.2 | 1.0 |  |  | 11547 |
| pythagorean-area{"ends":1}/shared-factor | whole-area/gcd-den-m | one | **2.42** | 1.7 | 3.1 |  |  |  | 7098 |
| prime-staircase{"ends":9}/step-back | whole-intercept/gcd-den-m | one | **2.42** | 1.7 | 3.2 |  |  |  | 10805 |
| square-area/spf | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.42** | 1.3 | 3.5 |  |  |  | 3683 |
| m-meets-c/meetPrime | whole-intercept/mc-spf | neither | **2.42** | 0.3 | 2.2 | 4.8 |  |  | 917 |
| divisibility-ladder/next-rung | prime-landing{"ends":9,"side":-1}/shared-factor | both | **2.41** | 1.3 | 3.5 |  |  |  | 7590 |
| prime-landing{"ends":9}/shared-factor | ruler{"ends":3}/shared-factor | both | **2.41** | 0.5 | 1.8 | 1.8 | 5.6 |  | 4746 |
| prime-gradient{"ends":1}/shared-factor | smooth-gradient/shared | one | **2.41** | 1.7 | 3.1 |  |  |  | 7591 |
| m-meets-c/size | steady-gradient/gcd-c | neither | **2.41** | -0.6 | 1.4 | 3.4 | 5.4 |  | 1667 |
| exact-change/big-bill | triangle-area{"A":18}/even | neither | **2.41** | 1.8 | 3.0 |  |  |  | 11045 |
| exact-change/big-bill | triangle-area{"A":18}/legs | neither | **2.41** | 1.8 | 3.0 |  |  |  | 10806 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | smooth-gradient/shared | one | **2.40** | 1.7 | 3.1 |  |  |  | 7420 |
| m-meets-c/size | whole-intercept/gcd-floor-m | neither | **2.40** | -0.7 | 1.4 | 3.4 | 5.4 |  | 1656 |
| ruler{"ends":3}/shared-factor | triangle-area{"A":6}/legs | one | **2.40** | 2.4 |  |  |  |  | 13078 |
| square-area/omega | whole-crossing{"q":5,"r":2}/shared-factor | one | **2.40** | 1.3 | 2.6 | 3.3 |  |  | 3634 |
| prime-staircase{"ends":9}/shared-factor | whole-intercept/omega | one | **2.39** | 2.4 |  |  |  |  | 15360 |
| ruler{"ends":3}/shared-factor | triangle-area{"A":6}/even | one | **2.39** | 2.4 |  |  |  |  | 13195 |
| prime-landing{"ends":1,"side":-1}/shared-factor | same-on-both-rulers{"d":1,"side":-1}/shared-factor | both | **2.39** | -0.6 | 3.3 | 4.5 |  |  | 2210 |
| prime-staircase{"ends":3,"side":-1}/step-back | whole-intercept/mc-spf | neither | **2.39** | 2.4 |  |  |  |  | 4235 |
| prime-staircase{"ends":3}/step-back | whole-intercept/mc-spf | one | **2.39** | 2.4 |  |  |  |  | 4235 |
| divisibility-ladder/next-rung | ruler{"ends":9}/shared-factor | both | **2.39** | 1.6 | 3.2 |  |  |  | 7984 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.38** | 1.8 | 3.0 |  |  |  | 1157 |
| pell-gradient{"D":2,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.38** | 1.8 | 3.0 |  |  |  | 1157 |
| pell-gradient{"D":2,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.38** | 1.8 | 3.0 |  |  |  | 1157 |
| prime-landing{"ends":9,"side":-1}/shared-factor | ruler{"ends":9}/shared-factor | both | **2.38** | 2.1 | 3.3 | 1.1 | 3.0 |  | 15168 |
| prime-landing{"ends":1,"side":-1}/shared-factor | square-area/lpf | both | **2.38** | 0.9 | 3.3 | 3.0 |  |  | 5135 |
| ruler{"ends":3}/shared-factor | same-on-both-rulers{"d":1,"side":-1}/shared-factor | both | **2.38** | 0.4 | 3.1 | 3.7 |  |  | 3299 |
| prime-staircase{"ends":9}/step-back | whole-area/gcd-den-m | one | **2.38** | 1.6 | 3.1 |  |  |  | 7970 |
| ruler{"ends":9}/shared-factor | smooth-crossing/shared | one | **2.38** | 2.3 | 2.5 |  |  |  | 10729 |
| prime-staircase{"ends":9}/step-back | pythagorean-area{"ends":1}/shared-factor | both | **2.37** | 1.8 | 0.5 | 2.7 | 4.5 |  | 14403 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.37** | 2.7 | 2.0 |  |  |  | 15698 |
| prime-staircase{"ends":7}/step-back | square-area/spf | both | **2.37** | 0.7 | 1.2 | 5.2 |  |  | 4112 |
| square-area/lpf | whole-intercept/spf | one | **2.37** | -0.1 | 2.1 | 5.1 |  |  | 1542 |
| divisibility-ladder/next-rung | square-area/lpf | both | **2.37** | 1.1 | 3.6 |  |  |  | 5964 |
| square-area/spf | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.36** | 1.3 | 3.4 |  |  |  | 3634 |
| ruler{"ends":7}/shared-factor | square-area/spf | both | **2.36** | 0.3 | 4.4 |  |  |  | 2949 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":6,"k":0}/difference | neither | **2.36** | 2.6 | 2.1 |  |  |  | 8260 |
| m-meets-c/size | whole-crossing{"q":5,"r":4}/shared-factor | one | **2.36** | 2.4 |  |  |  |  | 7561 |
| same-on-both-rulers{"d":1}/shared-factor | whole-intercept/spf | one | **2.35** | 0.5 | 2.6 | 4.0 |  |  | 2578 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.35** | 2.7 | 2.0 |  |  |  | 15447 |
| prime-landing{"ends":9,"side":-1}/shared-factor | ruler{"ends":7}/shared-factor | both | **2.35** | 1.1 | 0.5 | 2.4 | 5.4 |  | 7108 |
| exact-change/big-piles | same-on-both-rulers{"d":1}/shared-factor | one | **2.35** | 2.6 | 2.0 | 2.4 |  |  | 12158 |
| m-meets-c/meetPrime | whole-crossing{"q":5,"r":4}/shared-factor | one | **2.34** | 2.3 |  |  |  |  | 7561 |
| prime-landing{"ends":1}/shared-factor | same-on-both-rulers{"d":1}/shared-factor | both | **2.34** | -0.6 | 3.3 | 4.4 |  |  | 2176 |
| prime-staircase{"ends":9}/step-back | whole-intercept/omega | one | **2.34** | 2.4 | 2.3 |  |  |  | 15149 |
| pythagorean-area{"ends":9}/shared-factor | ruler{"ends":1}/shared-factor | both | **2.32** | 1.7 | 2.2 | 3.0 |  |  | 11455 |
| steady-gradient/gcd-c | treasure{"k":3,"side":-1}/shared-factor | one | **2.32** | 0.4 | 1.5 | 2.8 | 4.6 |  | 4296 |
| square-area/lpf | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.32** | 1.3 | 3.6 | 2.1 |  |  | 3634 |
| prime-staircase{"ends":1}/shared-factor | whole-intercept/omega | one | **2.32** | 2.3 |  |  |  |  | 12588 |
| prime-landing{"ends":9}/shared-factor | whole-crossing{"q":5,"r":4}/shared-factor | both | **2.32** | 1.4 | 3.2 |  |  |  | 6062 |
| prime-staircase{"ends":9}/step-back | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.32** | 1.5 | 2.5 | 2.9 |  |  | 5112 |
| pell-gradient{"D":7,"k":0}/difference | whole-intercept/mc-spf | neither | **2.32** | 2.3 |  |  |  |  | 4001 |
| egyptian-line/bottom | farey-neighbours/mediant-x | neither | **2.32** | 2.3 |  |  |  |  | 5995 |
| pythagorean-area{"ends":1}/shared-factor | smooth-crossing/shared | one | **2.32** | 2.0 | 2.6 |  |  |  | 8846 |
| ruler{"ends":9}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.31** | 1.5 | 3.1 |  |  |  | 4646 |
| crossing-check{"k":3,"q":6}/size | prime-slope/twins | neither | **2.31** | 2.3 |  |  |  |  | 3581 |
| exact-change/prime-coins | triangle-area{"A":18}/legs | neither | **2.31** | 1.7 | 2.9 |  |  |  | 8756 |
| prime-landing{"ends":9,"side":-1}/shared-factor | whole-area/gcd-den-m | one | **2.31** | 2.2 | 2.8 | 2.0 |  |  | 9518 |
| exact-change/prime-coins | triangle-area{"A":18}/even | neither | **2.31** | 1.7 | 2.9 |  |  |  | 8919 |
| prime-landing{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":4}/shared-factor | both | **2.31** | 1.4 | 3.2 |  |  |  | 6277 |
| exact-change/big-piles | ruler{"ends":3}/shared-factor | one | **2.31** | 1.4 | 1.9 | 3.6 |  |  | 5919 |
| prime-landing{"ends":9,"side":-1}/shared-factor | pythagorean-area{"ends":1}/shared-factor | both | **2.31** | 1.9 | 0.8 | 1.5 | 5.0 |  | 13169 |
| prime-landing{"ends":9}/shared-factor | ruler{"ends":7}/shared-factor | both | **2.30** | 1.0 | 0.4 | 2.5 | 5.3 |  | 7121 |
| steady-gradient/gcd-c | treasure{"k":4}/shared-factor | one | **2.30** | 0.6 | 1.6 | 2.8 | 4.2 |  | 4272 |
| prime-staircase{"ends":9}/shared-factor | whole-area/gcd-x | one | **2.30** | 2.3 |  |  |  |  | 17444 |
| prime-landing{"ends":9}/shared-factor | whole-area/gcd-den-m | one | **2.30** | 2.2 | 2.7 | 2.0 |  |  | 9486 |
| crossing-check{"k":3,"q":6}/whole | prime-slope/twins | neither | **2.30** | 2.3 |  |  |  |  | 3586 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-intercept/mc-spf | neither | **2.30** | 2.3 |  |  |  |  | 4001 |
| crossing-check{"k":2,"q":6}/whole | prime-slope/twins | neither | **2.29** | 2.3 |  |  |  |  | 3462 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/share-den | neither | **2.29** | 2.3 |  |  |  |  | 199 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/difference | neither | **2.29** | 2.3 |  |  |  |  | 199 |
| divisibility-ladder/next-rung | prime-landing{"ends":9}/shared-factor | both | **2.29** | 1.3 | 3.6 | 2.0 |  |  | 7728 |
| prime-landing{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":1}/shared-factor | both | **2.29** | 1.4 | 3.2 |  |  |  | 5968 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.29** | 2.7 | 1.9 |  |  |  | 15524 |
| prime-landing{"ends":9}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.29** | 2.2 | 2.4 |  |  |  | 7422 |
| steady-gradient/gcd-c | treasure{"k":4,"side":-1}/shared-factor | one | **2.28** | 0.5 | 1.6 | 2.7 | 4.3 |  | 4055 |
| exact-change/big-piles | triangle-area{"A":8}/legs | neither | **2.28** | 1.8 | 2.8 |  |  |  | 7632 |
| treasure{"k":3,"side":-1}/shared-factor | whole-intercept/gcd-floor-m | one | **2.28** | 0.4 | 1.5 | 2.7 | 4.5 |  | 4159 |
| pythagorean-area{"ends":3}/shared-factor | triangle-area{"A":12}/legs | one | **2.28** | 0.9 | 3.6 |  |  |  | 5410 |
| crossing-check{"k":2,"q":6}/size | prime-slope/twins | neither | **2.28** | 2.3 |  |  |  |  | 3475 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/pell-c | neither | **2.28** | 2.3 | 2.3 |  |  |  | 199 |
| exact-change/big-piles | triangle-area{"A":8}/even | neither | **2.28** | 1.8 | 2.7 |  |  |  | 7764 |
| prime-landing{"ends":9}/shared-factor | whole-crossing{"q":5,"r":1}/shared-factor | both | **2.27** | 1.4 | 3.1 |  |  |  | 6278 |
| pythagorean-area{"ends":3}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | both | **2.27** | 0.7 | 1.0 | 3.5 | 4.0 |  | 4271 |
| ruler{"ends":3}/shared-factor | sunken-intercept/shared | one | **2.27** | 0.3 | 1.5 | 1.5 | 3.1 | 4.9 | 5956 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.27** | 2.7 | 1.8 |  |  |  | 15557 |
| crossing-check{"k":3,"q":4}/size | pell-gradient{"D":2,"k":0}/difference | neither | **2.27** | 2.2 | 2.8 | 1.9 |  |  | 10688 |
| crossing-check{"k":3,"q":4}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **2.27** | 2.2 | 2.8 | 1.9 |  |  | 10688 |
| pell-gradient{"D":7,"k":0}/share-den | whole-intercept/mc-spf | neither | **2.27** | 2.3 |  |  |  |  | 4001 |
| ruler{"ends":9}/shared-factor | whole-intercept/omega | one | **2.27** | 1.7 | 1.7 | 2.0 | 3.6 |  | 9264 |
| square-area/spf | whole-area/gcd-x | one | **2.27** | 2.4 | 2.2 |  |  |  | 16667 |
| square-area/lpf | whole-crossing{"q":5,"r":1}/shared-factor | both | **2.26** | 1.2 | 3.3 | 2.3 |  |  | 4128 |
| prime-staircase{"ends":9}/step-back | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.26** | 1.5 | 2.6 | 2.7 |  |  | 5132 |
| pythagorean-area{"ends":3}/shared-factor | steep-and-tall/shared | one | **2.25** | 1.1 | 2.0 | 2.8 | 3.2 |  | 6453 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | ruler{"ends":7}/shared-factor | one | **2.25** | 2.0 | 2.5 |  |  |  | 8467 |
| prime-staircase{"ends":3}/shared-factor | ruler{"ends":7}/shared-factor | both | **2.25** | 2.0 | 2.5 |  |  |  | 8467 |
| treasure{"k":4}/shared-factor | whole-intercept/gcd-floor-m | one | **2.25** | 0.5 | 1.5 | 2.8 | 4.2 |  | 4017 |
| prime-landing{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.25** | 2.1 | 2.4 |  |  |  | 7252 |
| crossing-check{"k":2,"q":4}/whole | prime-slope/twins | neither | **2.25** | 2.2 |  |  |  |  | 3409 |
| whole-crossing{"q":5,"r":4}/shared-factor | whole-intercept/omega | one | **2.25** | 1.5 | 1.8 | 2.5 | 3.2 |  | 5322 |
| prime-staircase{"ends":3,"side":-1}/step-back | ruler{"ends":7}/shared-factor | one | **2.25** | 2.0 | 2.5 |  |  |  | 9747 |
| prime-staircase{"ends":3}/step-back | ruler{"ends":7}/shared-factor | both | **2.25** | 2.0 | 2.5 |  |  |  | 9747 |
| whole-crossing{"q":5,"r":2}/shared-factor | whole-intercept/gcd-den-m | one | **2.25** | 0.3 | 1.7 | 4.8 |  |  | 2108 |
| crossing-check{"k":1,"q":4}/whole | target-gradient/gcd-tops | neither | **2.25** | 2.0 | 2.5 |  |  |  | 8511 |
| prime-landing{"ends":9,"side":-1}/shared-factor | smooth-square/shared | one | **2.24** | 1.0 | 3.0 | 2.8 |  |  | 6583 |
| same-on-both-rulers{"d":1,"side":-1}/shared-factor | whole-intercept/spf | one | **2.24** | 0.5 | 2.5 | 3.7 |  |  | 2601 |
| prime-landing{"ends":9,"side":-1}/shared-factor | square-area/omega | one | **2.24** | 1.0 | 2.9 | 2.8 |  |  | 6583 |
| prime-staircase{"ends":9}/shared-factor | ruler{"ends":3}/shared-factor | both | **2.24** | 0.6 | 2.8 | 3.3 |  |  | 5906 |
| steady-gradient/gcd-c | treasure{"k":3}/shared-factor | one | **2.24** | 0.5 | 1.6 | 2.9 | 4.0 |  | 4412 |
| treasure{"k":4,"side":-1}/shared-factor | whole-intercept/gcd-floor-m | one | **2.23** | 0.5 | 1.5 | 2.7 | 4.3 |  | 3924 |
| prime-landing{"ends":1}/shared-factor | sunken-intercept/shared | one | **2.23** | 1.8 | 2.2 | 1.9 | 3.0 |  | 14407 |
| exact-change/big-bill | prime-landing{"ends":9}/shared-factor | one | **2.23** | 1.8 | 2.7 | 2.3 |  |  | 11648 |
| pythagorean-area{"ends":3}/shared-factor | triangle-area{"A":12}/even | one | **2.22** | 0.8 | 3.6 |  |  |  | 5410 |
| prime-gradient{"ends":1}/shared-factor | steady-gradient/gcd-c | one | **2.22** | 1.6 | 2.9 |  |  |  | 13620 |
| whole-crossing{"q":5,"r":1}/shared-factor | whole-intercept/gcd-den-m | one | **2.22** | 0.1 | 2.0 | 4.5 |  |  | 2272 |
| prime-staircase{"ends":1}/shared-factor | smooth-crossing/shared | one | **2.21** | 2.2 |  |  |  |  | 9866 |
| prime-landing{"ends":9}/shared-factor | ruler{"ends":9}/shared-factor | both | **2.21** | 2.1 | 3.4 | 1.2 |  |  | 15399 |
| divisibility-ladder/next-rung | prime-landing{"ends":1}/shared-factor | both | **2.21** | 1.1 | 3.4 |  |  |  | 6077 |
| crossing-check{"k":2,"q":4}/size | prime-slope/twins | neither | **2.20** | 2.2 |  |  |  |  | 3337 |
| treasure{"k":3}/shared-factor | whole-intercept/gcd-floor-m | one | **2.20** | 0.4 | 1.5 | 2.9 | 4.0 |  | 4161 |
| prime-landing{"ends":9,"side":-1}/shared-factor | pythagorean-area{"ends":9}/shared-factor | both | **2.20** | 2.1 | 3.3 | 1.3 |  |  | 15003 |
| prime-staircase{"ends":1}/shared-factor | whole-area/gcd-x | one | **2.20** | 2.2 |  |  |  |  | 14241 |
| crossing-check{"k":3,"q":6}/whole | target-gradient/gcd-tops | neither | **2.20** | 2.4 | 2.0 |  |  |  | 12585 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | steady-gradient/gcd-c | one | **2.19** | 1.6 | 2.8 |  |  |  | 13486 |
| exact-change/big-bill | triangle-area{"A":12}/even | neither | **2.19** | 1.8 | 2.6 |  |  |  | 10551 |
| prime-staircase{"ends":1}/shared-factor | pythagorean-area{"ends":1}/shared-factor | both | **2.19** | 1.8 | 1.7 | 3.1 |  |  | 11638 |
| crossing-check{"k":2,"q":4}/whole | target-gradient/same-den | neither | **2.19** | 2.3 | 2.1 |  |  |  | 11496 |
| square-area/lpf | whole-crossing{"q":5,"r":4}/shared-factor | both | **2.19** | 1.2 | 3.2 | 2.2 |  |  | 4128 |
| whole-area/gcd-den-m | whole-at-t/gcd-den-m | neither | **2.19** | 2.2 |  |  |  |  | 1079 |
| whole-crossing{"q":5,"r":3}/shared-factor | whole-intercept/gcd-den-m | one | **2.19** | 0.2 | 1.7 | 4.6 |  |  | 2029 |
| exact-change/big-bill | triangle-area{"A":12}/legs | neither | **2.18** | 1.8 | 2.6 |  |  |  | 9849 |
| pythagorean-area{"ends":9}/shared-factor | whole-area/gcd-x | one | **2.18** | 1.8 | 3.1 | 1.6 |  |  | 11649 |
| ruler{"ends":9}/shared-factor | smooth-square/shared | one | **2.18** | 1.1 | 3.3 |  |  |  | 6499 |
| crossing-check{"k":2,"q":4}/whole | m-meets-c/size | neither | **2.18** | 0.3 | 4.1 |  |  |  | 2601 |
| crossing-check{"k":3,"q":6}/size | target-gradient/gcd-tops | neither | **2.18** | 2.4 | 2.0 |  |  |  | 12404 |
| crossing-check{"k":3,"q":4}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **2.18** | 2.2 | 2.8 | 1.6 |  |  | 10688 |
| ruler{"ends":9}/shared-factor | square-area/omega | one | **2.17** | 1.1 | 3.2 |  |  |  | 6499 |
| prime-landing{"ends":1}/shared-factor | square-area/spf | both | **2.17** | 0.9 | 2.3 | 3.3 |  |  | 5204 |
| prime-staircase{"ends":1}/shared-factor | ruler{"ends":3}/shared-factor | both | **2.17** | 0.7 | 2.9 | 2.9 |  |  | 5114 |
| crossing-check{"k":2,"q":4}/size | target-gradient/same-den | neither | **2.17** | 2.3 | 2.1 |  |  |  | 11496 |
| ruler{"ends":9}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.17** | 1.5 | 3.2 | 1.8 |  |  | 4617 |
| divisibility-ladder/next-rung | prime-staircase{"ends":1}/step-back | both | **2.17** | 2.3 | 2.0 |  |  |  | 15070 |
| near-point/gcd-x | target-gradient/gcd-tops | neither | **2.17** | 2.0 | 1.5 | 3.0 |  |  | 9810 |
| prime-staircase{"ends":9}/step-back | pythagorean-area{"ends":9}/shared-factor | both | **2.17** | 1.9 | 3.1 | 1.5 |  |  | 15612 |
| crossing-check{"k":3,"q":2}/size | whole-crossing{"q":5,"r":1}/shared-factor | one | **2.17** | 1.4 | 1.4 | 3.7 |  |  | 4166 |
| crossing-check{"k":2,"q":2}/size | pythagorean-area{"ends":9}/shared-factor | one | **2.17** | 0.6 | 2.5 | 3.4 |  |  | 4227 |
| prime-landing{"ends":9}/shared-factor | smooth-square/shared | one | **2.16** | 1.0 | 3.0 | 2.5 |  |  | 6726 |
| crossing-check{"k":2,"q":4}/size | m-meets-c/size | neither | **2.16** | 0.3 | 4.0 |  |  |  | 2601 |
| whole-crossing{"q":5,"r":4}/shared-factor | whole-intercept/gcd-den-m | one | **2.16** | 0.1 | 1.9 | 4.5 |  |  | 2257 |
| exact-change/prime-coins | triangle-area{"A":12}/even | neither | **2.16** | 1.6 | 2.7 |  |  |  | 8291 |
| crossing-check{"k":1,"q":4}/whole | target-gradient/same-den | neither | **2.16** | 2.0 | 2.3 |  |  |  | 8748 |
| near-point/lattice | target-gradient/gcd-tops | neither | **2.16** | 2.0 | 1.5 | 2.9 |  |  | 10012 |
| prime-staircase{"ends":9}/step-back | square-area/lpf | both | **2.16** | 0.8 | 3.5 |  |  |  | 6115 |
| crossing-check{"k":3,"q":2}/size | exact-change/big-piles | neither | **2.16** | 1.4 | 1.0 | 4.0 |  |  | 5583 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | whole-intercept/gcd-floor-m | one | **2.16** | 1.5 | 2.8 |  |  |  | 13033 |
| prime-landing{"ends":9}/shared-factor | square-area/omega | one | **2.16** | 1.1 | 2.9 | 2.5 |  |  | 6726 |
| ruler{"ends":7}/shared-factor | same-on-both-rulers{"d":2,"side":-1}/shared-factor | both | **2.16** | 1.1 | 1.8 | 3.6 |  |  | 5874 |
| prime-landing{"ends":9}/shared-factor | pythagorean-area{"ends":9}/shared-factor | both | **2.16** | 2.1 | 3.3 | 1.1 |  |  | 15095 |
| exact-change/prime-coins | same-on-both-rulers{"d":1}/shared-factor | one | **2.15** | 2.5 | 1.8 | 2.1 |  |  | 13428 |
| crossing-check{"k":2,"q":4}/size | near-point/lattice | neither | **2.15** | 2.7 | 1.6 |  |  |  | 15837 |
| crossing-check{"k":2,"q":4}/size | near-point/gcd-x | neither | **2.15** | 2.7 | 1.6 |  |  |  | 15580 |
| crossing-check{"k":2,"q":4}/whole | near-point/lattice | neither | **2.15** | 2.6 | 1.7 |  |  |  | 15488 |
| crossing-check{"k":2,"q":4}/whole | near-point/gcd-x | neither | **2.15** | 2.6 | 1.7 |  |  |  | 15231 |
| crossing-check{"k":1,"q":4}/size | target-gradient/gcd-tops | neither | **2.14** | 1.9 | 2.4 |  |  |  | 8655 |
| exact-change/prime-coins | triangle-area{"A":12}/legs | neither | **2.14** | 1.6 | 2.7 |  |  |  | 7564 |
| triangle-area{"A":12}/legs | whole-intercept/spf | neither | **2.14** | 1.8 | 2.0 | 2.6 |  |  | 5149 |
| triangle-area{"A":12}/even | whole-area/gcd-den-m | neither | **2.14** | 1.2 | 0.9 | 4.3 |  |  | 3617 |
| prime-landing{"ends":1,"side":-1}/shared-factor | sunken-intercept/shared | one | **2.13** | 1.8 | 2.2 | 1.8 | 2.8 |  | 14440 |
| prime-staircase{"ends":9}/step-back | smooth-square/shared | one | **2.13** | 0.8 | 3.5 |  |  |  | 6116 |
| crossing-check{"k":1,"q":2}/whole | prime-slope/twins | neither | **2.13** | 2.1 |  |  |  |  | 3228 |
| crossing-check{"k":3,"q":6}/whole | same-on-both-rulers{"d":2}/shared-factor | one | **2.12** | 1.5 | 2.7 |  |  |  | 8289 |
| whole-area/gcd-den-m | whole-crossing{"q":5,"r":2}/shared-factor | one | **2.12** | 1.3 | 2.9 | 2.2 |  |  | 3276 |
| same-on-both-rulers{"d":2}/shared-factor | square-area/lpf | both | **2.12** | 0.5 | -0.2 | 6.0 |  |  | 3344 |
| crossing-check{"k":3,"q":2}/size | exact-change/prime-coins | neither | **2.12** | 1.4 | 1.2 | 3.8 |  |  | 6087 |
| prime-staircase{"ends":9}/step-back | square-area/omega | one | **2.12** | 0.8 | 3.4 |  |  |  | 6115 |
| prime-staircase{"ends":7}/step-back | smooth-crossing/shared | one | **2.11** | 2.1 |  |  |  |  | 7881 |
| crossing-check{"k":2,"q":4}/whole | m-meets-c/meetPrime | neither | **2.11** | 0.3 | 4.0 |  |  |  | 2551 |
| smooth-intercept{"primes":[3,11]}/shared-factor | sunken-intercept/shared | one | **2.11** | 0.0 | 1.3 | 2.3 | 4.7 |  | 4044 |
| crossing-check{"k":1,"q":2}/size | prime-slope/twins | neither | **2.11** | 2.1 |  |  |  |  | 3108 |
| crossing-check{"k":3,"q":2}/size | exact-change/big-bill | neither | **2.11** | 1.3 | 1.4 | 3.6 |  |  | 6259 |
| prime-landing{"ends":1,"side":-1}/shared-factor | square-area/spf | both | **2.11** | 0.9 | 2.4 | 3.1 |  |  | 5135 |
| exact-change/prime-coins | ruler{"ends":3}/shared-factor | one | **2.11** | 1.2 | 1.8 | 3.4 |  |  | 5775 |
| pell-gradient{"D":5,"k":0}/difference | square-area/spf | one | **2.10** | 2.1 |  |  |  |  | 10582 |
| pell-gradient{"D":5,"k":0}/share-den | square-area/spf | one | **2.10** | 2.1 |  |  |  |  | 10582 |
| square-area/spf | whole-intercept/gcd-den-m | one | **2.10** | 2.1 |  |  |  |  | 8823 |
| crossing-check{"k":3,"q":6}/size | same-on-both-rulers{"d":2}/shared-factor | one | **2.10** | 1.5 | 2.7 |  |  |  | 8163 |
| crossing-check{"k":3,"q":2}/whole | exact-change/big-bill | neither | **2.10** | 1.6 | 1.1 | 3.6 |  |  | 4864 |
| prime-slope/twins | target-gradient/gcd-tops | neither | **2.10** | 2.1 |  |  |  |  | 3302 |
| pell-gradient{"D":5,"k":0}/difference | square-area/lpf | one | **2.10** | 2.1 |  |  |  |  | 10598 |
| pell-gradient{"D":5,"k":0}/share-den | square-area/lpf | one | **2.10** | 2.1 |  |  |  |  | 10598 |
| crossing-check{"k":2,"q":4}/size | m-meets-c/meetPrime | neither | **2.10** | 0.2 | 3.9 |  |  |  | 2551 |
| pythagorean-area{"ends":1}/shared-factor | steep-and-tall/shared | one | **2.10** | 0.8 | 1.5 | 3.1 | 3.1 |  | 7212 |
| pell-gradient{"D":5,"k":0}/difference | square-area/omega | neither | **2.09** | 2.1 |  |  |  |  | 10598 |
| pell-gradient{"D":5,"k":0}/share-den | square-area/omega | neither | **2.09** | 2.1 |  |  |  |  | 10598 |
| crossing-check{"k":3,"q":2}/whole | exact-change/prime-coins | neither | **2.09** | 1.7 | 0.8 | 3.8 |  |  | 4849 |
| exact-change/big-piles | ruler{"ends":9}/shared-factor | one | **2.09** | 1.2 | 2.7 | 2.4 |  |  | 6103 |
| prime-staircase{"ends":1}/step-back | smooth-crossing/shared | one | **2.09** | 2.1 | 2.0 |  |  |  | 10194 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **2.09** | 2.0 | 2.1 |  |  |  | 9891 |
| triangle-area{"A":12}/even | whole-intercept/spf | neither | **2.08** | 1.7 | 2.0 | 2.5 |  |  | 5149 |
| crossing-check{"k":3,"q":4}/whole | treasure{"k":3}/shared-factor | one | **2.08** | 2.1 |  |  |  |  | 4795 |
| prime-slope/twins | target-gradient/same-den | neither | **2.08** | 2.1 |  |  |  |  | 3302 |
| ruler{"ends":3}/shared-factor | triangle-area{"A":4}/even | one | **2.08** | 2.1 |  |  |  |  | 10748 |
| prime-landing{"ends":1,"side":-1}/shared-factor | pythagorean-area{"ends":9}/shared-factor | both | **2.07** | 2.1 | 3.2 | 0.9 |  |  | 13739 |
| ruler{"ends":3}/shared-factor | triangle-area{"A":4}/legs | one | **2.07** | 2.1 |  |  |  |  | 10756 |
| pell-gradient{"D":5,"k":0}/pell-c | square-area/spf | one | **2.07** | 2.1 |  |  |  |  | 10582 |
| pell-gradient{"D":5,"k":0}/difference | smooth-square/shared | neither | **2.06** | 2.1 |  |  |  |  | 10608 |
| pell-gradient{"D":5,"k":0}/share-den | smooth-square/shared | neither | **2.06** | 2.1 |  |  |  |  | 10608 |
| prime-landing{"ends":1}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **2.06** | 1.9 | 2.3 |  |  |  | 5451 |
| pell-gradient{"D":5,"k":0}/pell-c | square-area/lpf | one | **2.06** | 2.1 |  |  |  |  | 10598 |
| divisibility-ladder/next-rung | prime-staircase{"ends":7}/step-back | both | **2.06** | 2.1 |  |  |  |  | 8955 |
| crossing-check{"k":2,"q":2}/size | near-point/gcd-x | neither | **2.06** | 2.1 |  |  |  |  | 9829 |
| crossing-check{"k":1,"q":4}/size | target-gradient/same-den | neither | **2.06** | 1.9 | 2.2 |  |  |  | 8892 |
| pell-gradient{"D":5,"k":0}/pell-c | square-area/omega | neither | **2.06** | 2.1 |  |  |  |  | 10598 |
| ruler{"ends":1}/shared-factor | whole-intercept/gcd-den-m | one | **2.05** | 1.4 | 2.1 | 2.6 |  |  | 6701 |
| crossing-check{"k":3,"q":2}/whole | exact-change/big-piles | neither | **2.05** | 1.7 | 0.4 | 4.0 |  |  | 4363 |
| crossing-check{"k":2,"q":2}/whole | near-point/gcd-x | neither | **2.04** | 2.0 |  |  |  |  | 9652 |
| prime-landing{"ends":1,"side":-1}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **2.04** | 1.9 | 2.2 |  |  |  | 5441 |
| prime-staircase{"ends":7}/step-back | whole-area/gcd-x | one | **2.04** | 2.0 |  |  |  |  | 11394 |
| prime-staircase{"ends":7}/shared-factor | pythagorean-area{"ends":3}/shared-factor | both | **2.04** | 1.1 | 1.8 | 3.2 |  |  | 3360 |
| crossing-check{"k":2,"q":2}/size | near-point/lattice | neither | **2.04** | 2.0 |  |  |  |  | 9834 |
| pythagorean-area{"ends":7}/shared-factor | steep-and-tall/shared | one | **2.04** | 0.8 | 1.8 | 2.5 | 3.1 |  | 6076 |
| smooth-intercept{"primes":[3,13]}/shared-factor | sunken-intercept/shared | one | **2.04** | -0.1 | 1.2 | 2.4 | 4.6 |  | 3787 |
| prime-landing{"ends":1}/shared-factor | ruler{"ends":3}/shared-factor | both | **2.04** | 0.9 | 1.8 | 3.4 |  |  | 5145 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/difference | neither | **2.03** | 1.7 | 2.1 | 2.3 |  |  | 8048 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/share-den | neither | **2.03** | 1.7 | 2.1 | 2.3 |  |  | 8048 |
| pythagorean-area{"ends":3}/shared-factor | ruler{"ends":9}/shared-factor | both | **2.03** | 0.3 | -0.5 | 3.4 | 4.9 |  | 4094 |
| crossing-check{"k":2,"q":2}/size | prime-landing{"ends":9}/shared-factor | one | **2.03** | 0.6 | 2.5 | 3.0 |  |  | 4349 |
| crossing-check{"k":2,"q":2}/whole | near-point/lattice | neither | **2.03** | 2.0 |  |  |  |  | 9656 |
| pell-gradient{"D":5,"k":0}/pell-c | smooth-square/shared | neither | **2.03** | 2.0 |  |  |  |  | 10608 |
| crossing-check{"k":2,"q":2}/whole | farey-neighbours/mediant-x | neither | **2.02** | 2.0 |  |  |  |  | 7567 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 8536 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 8536 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 8536 |
| same-on-both-rulers{"d":2}/shared-factor | whole-area/gcd-den-m | one | **2.02** | 0.7 | 1.9 | 3.5 |  |  | 2564 |
| prime-landing{"ends":1,"side":-1}/shared-factor | ruler{"ends":3}/shared-factor | both | **2.02** | 0.9 | 1.8 | 3.3 |  |  | 5176 |
| ruler{"ends":3}/shared-factor | whole-area/gcd-den-m | one | **2.02** | 2.3 | 2.3 | 1.5 |  |  | 6502 |
| triangle-area{"A":12}/legs | whole-area/gcd-den-m | neither | **2.02** | 0.8 | 0.9 | 4.4 |  |  | 2602 |
| prime-landing{"ends":1}/shared-factor | pythagorean-area{"ends":9}/shared-factor | both | **2.02** | 2.1 | 3.2 | 0.7 |  |  | 13759 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 9107 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 9107 |
| crossing-check{"k":2,"q":2}/size | farey-neighbours/mediant-x | neither | **2.02** | 2.0 |  |  |  |  | 7567 |
| exact-change/prime-coins | square-area/spf | one | **2.02** | 0.9 | 3.2 |  |  |  | 4167 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":7,"k":0}/pell-c | neither | **2.01** | 1.9 | 2.1 |  |  |  | 9891 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":18}/even | one | **2.01** | 2.0 | 2.1 |  |  |  | 12846 |
| ruler{"ends":3}/shared-factor | triangle-area{"A":18}/even | one | **2.01** | 1.8 | 2.2 |  |  |  | 10231 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **2.01** | 2.1 | 2.0 |  |  |  | 10440 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | triangle-area{"A":18}/legs | one | **2.01** | 1.9 | 2.1 |  |  |  | 12482 |
| sunken-intercept/shared | whole-area/gcd-den-m | neither | **2.00** | 1.5 | 1.9 | 2.0 | 2.4 | 2.2 | 8910 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | square-area/lpf | both | **2.00** | 0.5 | -0.4 | 5.8 |  |  | 3352 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/matching-c | neither | **2.00** | 2.0 |  |  |  |  | 9107 |

### Anti-aligned pairs (headline < −2), different families

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| farey-neighbours/mediant-x | pythagorean-area{"ends":9}/shared-factor | one | **-7.66** | -7.7 |  |  |  |  | 38 |
| m-meets-c/size | whole-intercept/gcd-den-m | neither | **-7.51** | -7.5 |  |  |  |  | 32 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":9}/shared-factor | one | **-7.39** | -7.4 |  |  |  |  | 38 |
| near-point/lattice | steady-gradient/divisors | neither | **-7.35** | -7.3 |  |  |  |  | 41 |
| near-point/gcd-x | steady-gradient/divisors | neither | **-7.33** | -7.3 |  |  |  |  | 41 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":9}/shared-factor | one | **-7.28** | -7.3 |  |  |  |  | 38 |
| crossing-check{"k":1,"q":4}/whole | near-point/gcd-x | neither | **-7.17** | -7.2 |  |  |  |  | 42 |
| m-meets-c/meetPrime | pythagorean-area{"ends":9}/shared-factor | one | **-7.13** | -7.1 |  |  |  |  | 48 |
| m-meets-c/size | pythagorean-area{"ends":9}/shared-factor | one | **-7.12** | -7.1 |  |  |  |  | 49 |
| crossing-check{"k":2,"q":6}/size | steady-gradient/divisors | neither | **-6.92** | -6.9 |  |  |  |  | 56 |
| crossing-check{"k":2,"q":4}/size | steady-gradient/divisors | neither | **-6.91** | -6.9 |  |  |  |  | 56 |
| crossing-check{"k":2,"q":6}/whole | steady-gradient/divisors | neither | **-6.90** | -6.9 |  |  |  |  | 56 |
| crossing-check{"k":2,"q":4}/whole | steady-gradient/divisors | neither | **-6.90** | -6.9 |  |  |  |  | 56 |
| m-meets-c/meetPrime | whole-intercept/omega | neither | **-6.88** | -6.9 |  |  |  |  | 34 |
| m-meets-c/size | whole-intercept/omega | neither | **-6.87** | -6.9 |  |  |  |  | 34 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":9}/shared-factor | one | **-6.66** | -6.7 |  |  |  |  | 38 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.66** | -6.7 |  |  |  |  | 50 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1}/shared-factor | one | **-6.65** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.64** | -6.6 |  |  |  |  | 52 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.64** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | near-point/lattice | neither | **-6.64** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":4}/legs | one | **-6.64** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.63** | -6.6 |  |  |  |  | 55 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":4}/legs | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | steady-gradient/divisors | neither | **-6.63** | ≤-6.6 |  |  |  |  | 27 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":4}/even | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | m-meets-c/meetPrime | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":8}/even | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | near-point/gcd-x | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient{"ends":1}/shared-factor | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":4}/legs | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | steady-gradient/divisors | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":4}/legs | whole-area/gcd-x | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":4}/even | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | sunken-intercept/shared | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1}/shared-factor | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":8}/even | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1}/shared-factor | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | m-meets-c/size | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":4}/even | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":4}/even | whole-area/gcd-x | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/meetPrime | ruler{"ends":9}/shared-factor | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-area/gcd-x | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | ruler{"ends":9}/shared-factor | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/meetPrime | prime-landing{"ends":9}/shared-factor | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | near-point/lattice | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":6}/even | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | same-on-both-rulers{"d":1,"side":-1}/shared-factor | one | **-6.61** | ≤-6.6 |  |  |  |  | 2 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-intercept/gcd-floor-m | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/gcd-floor-m | neither | **-6.60** | ≤-6.6 |  |  |  |  | 6 |
| m-meets-c/meetPrime | same-on-both-rulers{"d":1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 3 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":8}/legs | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":6}/even | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"d":1,"side":-1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/size | ruler{"ends":9}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 27 |
| m-meets-c/size | whole-area/gcd-x | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | whole-intercept/gcd-floor-m | neither | **-6.60** | ≤-6.6 |  |  |  |  | 5 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/size | prime-landing{"ends":9}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 15 |
| m-meets-c/meetPrime | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":9}/shared-factor | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | steady-gradient/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | steady-gradient/gcd-c | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":8}/legs | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":6}/even | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | ruler{"ends":9}/shared-factor | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/size | same-on-both-rulers{"d":1}/shared-factor | one | **-6.59** | ≤-6.6 |  |  |  |  | 3 |
| crossing-check{"k":1,"q":6}/size | near-point/gcd-x | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area{"ends":1}/shared-factor | triangle-area{"A":6}/legs | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | same-on-both-rulers{"d":1,"side":-1}/shared-factor | one | **-6.59** | ≤-6.6 |  |  |  |  | 1 |
| crossing-check{"k":2,"q":2}/whole | steady-gradient/divisors | neither | **-6.59** | ≤-6.6 |  |  |  |  | 15 |
| exact-change/big-bill | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | whole-intercept/gcd-floor-m | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-intercept/gcd-floor-m | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | steady-gradient/gcd-c | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":1}/shared-factor | triangle-area{"A":4}/legs | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 26 |
| pythagorean-area{"ends":9}/shared-factor | triangle-area{"A":6}/legs | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient{"ends":1}/shared-factor | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | steep-and-tall/shared | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | sunken-intercept/shared | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | steady-gradient/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | steady-gradient/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":1}/shared-factor | triangle-area{"A":4}/even | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":6}/legs | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient{"ends":9}/shared-factor | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/meetPrime | ruler{"ends":1}/shared-factor | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":9}/shared-factor | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":9}/shared-factor | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | steady-gradient/divisors | neither | **-6.57** | ≤-6.6 |  |  |  |  | 26 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/size | ruler{"ends":1}/shared-factor | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | steep-and-tall/shared | neither | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"d":1,"side":-1}/shared-factor | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1}/shared-factor | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | steep-and-tall/shared | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | steep-and-tall/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| steep-and-tall/shared | sunken-intercept/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| ruler{"ends":1}/shared-factor | triangle-area{"A":6}/even | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | steep-and-tall/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":9}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | steep-and-tall/shared | neither | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":9}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":9}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":9}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | steep-and-tall/shared | neither | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/shared-factor | target-gradient/same-den | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| near-point/gcd-x | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":4}/legs | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | target-gradient/same-den | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | target-gradient/same-den | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/whole | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| ruler{"ends":1}/shared-factor | triangle-area{"A":6}/legs | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | steep-and-tall/shared | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| ruler{"ends":7}/shared-factor | triangle-area{"A":4}/legs | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| prime-landing{"ends":9}/shared-factor | steep-and-tall/shared | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pythagorean-area{"ends":7}/shared-factor | triangle-area{"A":4}/even | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient{"ends":9}/shared-factor | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| target-gradient/same-den | whole-intercept/gcd-floor-m | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"k":3,"side":-1}/shared-factor | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| same-on-both-rulers{"d":1}/shared-factor | steep-and-tall/shared | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | steep-and-tall/shared | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| ruler{"ends":7}/shared-factor | triangle-area{"A":4}/even | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/shared-factor | target-gradient/gcd-tops | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/divisors | target-gradient/same-den | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/gcd-c | target-gradient/same-den | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":9}/shared-factor | one | **-6.52** | -6.5 |  |  |  |  | 56 |
| m-meets-c/meetPrime | ruler{"ends":7}/shared-factor | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1}/shared-factor | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1}/shared-factor | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | target-gradient/gcd-tops | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | steep-and-tall/shared | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | target-gradient/gcd-tops | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| same-on-both-rulers{"d":2}/shared-factor | steep-and-tall/shared | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | steep-and-tall/shared | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":9}/shared-factor | one | **-6.52** | -6.5 |  |  |  |  | 56 |
| exact-change/prime-coins | steep-and-tall/shared | neither | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| target-gradient/gcd-tops | whole-intercept/gcd-floor-m | neither | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| m-meets-c/size | ruler{"ends":7}/shared-factor | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| prime-staircase{"ends":7}/step-back | smooth-intercept{"primes":[3,11]}/shared-factor | both | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | steep-and-tall/shared | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":9}/shared-factor | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/divisors | target-gradient/gcd-tops | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/gcd-c | target-gradient/gcd-tops | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | farey-neighbours/mediant-x | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | target-gradient/same-den | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | steady-gradient/divisors | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | steady-gradient/divisors | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | steady-gradient/gcd-c | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | steady-gradient/gcd-c | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| prime-staircase{"ends":7}/step-back | smooth-intercept{"primes":[3,13]}/shared-factor | both | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":9}/shared-factor | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | sunken-intercept/shared | neither | **-6.49** | -6.5 |  |  |  |  | 79 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":9}/shared-factor | target-gradient/same-den | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | target-gradient/same-den | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | steady-gradient/divisors | neither | **-6.49** | ≤-6.5 |  |  |  |  | 11 |
| pell-gradient{"D":2,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| m-meets-c/meetPrime | prime-landing{"ends":1}/shared-factor | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| m-meets-c/meetPrime | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | ruler{"ends":9}/shared-factor | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 28 |
| farey-neighbours/mediant-x | whole-area/gcd-x | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | prime-landing{"ends":9}/shared-factor | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | steady-gradient/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | steady-gradient/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | target-gradient/gcd-tops | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | sunken-intercept/shared | neither | **-6.48** | -6.5 |  |  |  |  | 78 |
| m-meets-c/size | prime-landing{"ends":1}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | same-on-both-rulers{"d":1}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 1 |
| m-meets-c/size | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":9}/shared-factor | target-gradient/gcd-tops | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | target-gradient/gcd-tops | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":9}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":9}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.47** | -6.5 |  |  |  |  | 61 |
| farey-neighbours/mediant-x | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | farey-neighbours/mediant-x | neither | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":9}/shared-factor | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":9}/shared-factor | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":9}/shared-factor | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | ruler{"ends":1}/shared-factor | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | steep-and-tall/shared | neither | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| m-meets-c/meetPrime | ruler{"ends":3}/shared-factor | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| m-meets-c/size | ruler{"ends":3}/shared-factor | one | **-6.42** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":1}/shared-factor | steep-and-tall/shared | one | **-6.41** | ≤-6.4 |  |  |  |  | 0 |
| prime-staircase{"ends":1}/shared-factor | smooth-intercept{"primes":[3,7]}/shared-factor | both | **-6.40** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | smooth-square/shared | neither | **-6.40** | ≤-6.4 |  |  |  |  | 1 |
| euclid-steps/largest-quotient | whole-at-t/gcd-c | neither | **-6.40** | -6.4 |  |  |  |  | 61 |
| farey-neighbours/mediant-x | ruler{"ends":7}/shared-factor | one | **-6.39** | ≤-6.4 |  |  |  |  | 0 |
| m-meets-c/meetPrime | steady-gradient/divisors | neither | **-6.39** | -6.4 |  |  |  |  | 71 |
| prime-slope/matching-c | whole-intercept/gcd-floor-m | neither | **-6.38** | ≤-6.4 |  |  |  |  | 0 |
| m-meets-c/size | steady-gradient/divisors | neither | **-6.38** | -6.4 |  |  |  |  | 71 |
| crossing-check{"k":3,"q":4}/size | steady-gradient/divisors | neither | **-6.38** | ≤-6.4 |  |  |  |  | 12 |
| prime-slope/matching-c | steady-gradient/divisors | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-area/gcd-x | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | steady-gradient/gcd-c | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | square-area/omega | neither | **-6.37** | ≤-6.4 |  |  |  |  | 1 |
| divisibility-ladder/next-rung | smooth-intercept{"primes":[3,11]}/shared-factor | both | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | steep-and-tall/shared | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | square-area/lpf | one | **-6.37** | ≤-6.4 |  |  |  |  | 1 |
| divisibility-ladder/next-rung | pell-gradient{"D":1,"k":1}/pell-c | one | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | square-area/spf | one | **-6.36** | ≤-6.4 |  |  |  |  | 1 |
| farey-neighbours/mediant-x | prime-landing{"ends":1}/shared-factor | one | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | smooth-intercept{"primes":[3,13]}/shared-factor | both | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-6.35** | ≤-6.4 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"k":4,"side":-1}/shared-factor | one | **-6.35** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | m-meets-c/meetPrime | neither | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| prime-gradient{"ends":9}/shared-factor | prime-slope/matching-c | one | **-6.34** | ≤-6.3 |  |  |  |  | 7 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | prime-slope/matching-c | one | **-6.34** | ≤-6.3 |  |  |  |  | 3 |
| divisibility-ladder/next-rung | pell-gradient{"D":1,"k":1}/difference | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":1,"k":1}/share-den | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| prime-slope/matching-c | smooth-intercept{"primes":[3,7]}/shared-factor | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | prime-gradient{"ends":1}/shared-factor | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | steady-gradient/divisors | neither | **-6.34** | -6.3 |  |  |  |  | 74 |
| exact-change/big-piles | sunken-intercept/shared | neither | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | m-meets-c/size | neither | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | prime-staircase{"ends":3}/step-back | both | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | prime-staircase{"ends":3,"side":-1}/step-back | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | steep-and-tall/shared | neither | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | smooth-intercept{"primes":[3,17]}/shared-factor | both | **-6.32** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | smooth-intercept{"primes":[3,7]}/shared-factor | both | **-6.32** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | same-on-both-rulers{"d":1,"side":-1}/shared-factor | one | **-6.32** | ≤-6.3 |  |  |  |  | 0 |
| m-meets-c/meetPrime | sunken-intercept/shared | neither | **-6.31** | -6.3 |  |  |  |  | 75 |
| crossing-check{"k":1,"q":6}/whole | whole-intercept/omega | neither | **-6.31** | -6.3 |  |  |  |  | 49 |
| exact-change/big-piles | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-6.30** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-6.30** | ≤-6.3 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | ruler{"ends":3}/shared-factor | one | **-6.30** | ≤-6.3 |  |  |  |  | 0 |
| m-meets-c/size | sunken-intercept/shared | neither | **-6.30** | -6.3 |  |  |  |  | 76 |
| exact-change/big-piles | prime-gradient{"ends":9}/shared-factor | one | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":3,"k":0}/pell-c | one | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-top | steady-gradient/divisors | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-bottom-spf | steady-gradient/divisors | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/c-period | steady-gradient/divisors | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-top | steady-gradient/gcd-c | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-bottom-spf | steady-gradient/gcd-c | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/c-period | steady-gradient/gcd-c | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | whole-intercept/omega | neither | **-6.27** | -6.3 |  |  |  |  | 49 |
| exact-change/big-piles | steep-and-tall/shared | neither | **-6.27** | ≤-6.3 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | prime-slope/matching-c | neither | **-6.27** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-at-t/gcd-c | neither | **-6.26** | -6.3 |  |  |  |  | 40 |
| crossing-check{"k":2,"q":2}/whole | whole-at-t/gcd-c | neither | **-6.26** | -6.3 |  |  |  |  | 40 |
| exact-change/big-piles | target-gradient/same-den | neither | **-6.26** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":2,"k":0}/share-den | one | **-6.24** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":2,"k":0}/difference | one | **-6.24** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":2,"k":0}/pell-c | one | **-6.24** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-at-t/gcd-c | neither | **-6.23** | ≤-6.2 |  |  |  |  | 0 |
| exact-change/big-piles | target-gradient/gcd-tops | neither | **-6.23** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | whole-at-t/gcd-c | neither | **-6.22** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-at-t/gcd-c | neither | **-6.22** | ≤-6.2 |  |  |  |  | 0 |
| exact-change/big-piles | farey-neighbours/mediant-x | neither | **-6.21** | ≤-6.2 |  |  |  |  | 0 |
| long-division/m-bottom-spf | whole-intercept/gcd-floor-m | neither | **-6.19** | -4.3 | -8.1 |  |  |  | 761 |
| exact-change/big-piles | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-6.19** | ≤-6.2 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":9}/shared-factor | one | **-6.19** | -6.2 |  |  |  |  | 38 |
| crossing-check{"k":1,"q":4}/whole | steady-gradient/divisors | neither | **-6.19** | -6.2 |  |  |  |  | 74 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-6.17** | ≤-6.2 |  |  |  |  | 22 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-6.16** | ≤-6.2 |  |  |  |  | 0 |
| target-gradient/same-den | whole-at-t/gcd-c | neither | **-6.16** | ≤-6.2 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-intercept/gcd-den-m | neither | **-6.15** | ≤-6.2 |  |  |  |  | 29 |
| target-gradient/gcd-tops | whole-at-t/gcd-c | neither | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | whole-at-t/gcd-c | neither | **-6.14** | ≤-6.1 |  |  |  |  | 22 |
| pell-gradient{"D":5,"k":0}/difference | whole-at-t/gcd-c | neither | **-6.14** | ≤-6.1 |  |  |  |  | 22 |
| divisibility-ladder/next-rung | prime-slope/matching-c | one | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-intercept/gcd-den-m | neither | **-6.13** | ≤-6.1 |  |  |  |  | 0 |
| steady-gradient/gcd-c | whole-intercept/gcd-den-m | neither | **-6.13** | ≤-6.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | whole-at-t/gcd-c | neither | **-6.13** | ≤-6.1 |  |  |  |  | 21 |
| pell-gradient{"D":2,"k":0}/share-den | whole-at-t/gcd-c | neither | **-6.12** | ≤-6.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-at-t/gcd-c | neither | **-6.12** | ≤-6.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-6.12** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | prime-staircase{"ends":3}/shared-factor | both | **-6.11** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | prime-staircase{"ends":3,"side":-1}/shared-factor | one | **-6.11** | ≤-6.1 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/shared-factor | prime-slope/matching-c | one | **-6.08** | -6.1 |  |  |  |  | 79 |
| crossing-check{"k":1,"q":2}/whole | smooth-crossing/shared | neither | **-6.06** | ≤-6.1 |  |  |  |  | 1 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | prime-slope/matching-c | one | **-6.06** | -6.1 |  |  |  |  | 80 |
| smooth-crossing/shared | triangle-area{"A":4}/legs | neither | **-6.06** | ≤-6.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":9}/shared-factor | one | **-6.05** | -6.1 |  |  |  |  | 98 |
| divisibility-ladder/next-rung | long-division/m-top | one | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | long-division/m-bottom-spf | one | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | long-division/c-period | one | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":12}/even | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":8}/even | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":4}/even | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| m-meets-c/meetPrime | smooth-crossing/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":9}/shared-factor | one | **-6.04** | -6.0 |  |  |  |  | 97 |
| near-point/lattice | smooth-crossing/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":18}/even | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| m-meets-c/size | smooth-crossing/shared | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | smooth-crossing/shared | neither | **-6.03** | ≤-6.0 |  |  |  |  | 1 |
| m-meets-c/meetPrime | whole-crossing{"q":5,"r":1}/shared-factor | one | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | square-area/spf | one | **-6.02** | -6.0 |  |  |  |  | 93 |
| pell-gradient{"D":3,"k":0}/difference | square-area/spf | one | **-6.02** | -6.0 |  |  |  |  | 93 |
| smooth-crossing/shared | triangle-area{"A":8}/legs | neither | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":6}/even | neither | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| near-point/gcd-x | smooth-crossing/shared | neither | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| m-meets-c/size | whole-crossing{"q":5,"r":1}/shared-factor | one | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | whole-at-t/gcd-c | neither | **-6.01** | ≤-6.0 |  |  |  |  | 2 |
| smooth-crossing/shared | triangle-area{"A":6}/legs | neither | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":18}/legs | neither | **-6.00** | ≤-6.0 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/step-back | smooth-crossing/shared | one | **-5.99** | ≤-6.0 |  |  |  |  | 2 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-crossing/shared | neither | **-5.99** | ≤-6.0 |  |  |  |  | 2 |
| near-point/lattice | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.99** | -6.0 |  |  |  |  | 91 |
| farey-neighbours/mediant-x | sunken-intercept/shared | neither | **-5.99** | -6.0 |  |  |  |  | 87 |
| near-point/gcd-x | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.98** | -6.0 |  |  |  |  | 91 |
| crossing-check{"k":3,"q":6}/whole | whole-intercept/omega | neither | **-5.94** | -5.9 |  |  |  |  | 50 |
| crossing-check{"k":1,"q":2}/whole | egyptian-line/bottom | neither | **-5.94** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":4}/legs | neither | **-5.93** | ≤-5.9 |  |  |  |  | 3 |
| egyptian-line/bottom | pell-gradient{"D":7,"k":0}/share-den | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | whole-intercept/omega | neither | **-5.93** | -5.9 |  |  |  |  | 49 |
| smooth-crossing/shared | triangle-area{"A":12}/legs | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| m-meets-c/meetPrime | pythagorean-area{"ends":1}/shared-factor | one | **-5.93** | -5.9 |  |  |  |  | 85 |
| crossing-check{"k":1,"q":6}/whole | egyptian-line/bottom | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | square-area/lpf | one | **-5.93** | -5.9 |  |  |  |  | 98 |
| pell-gradient{"D":3,"k":0}/difference | square-area/lpf | one | **-5.93** | -5.9 |  |  |  |  | 98 |
| egyptian-line/bottom | triangle-area{"A":12}/even | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":8}/even | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":4}/even | neither | **-5.92** | ≤-5.9 |  |  |  |  | 3 |
| egyptian-line/bottom | near-point/lattice | neither | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1}/shared-factor | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1}/shared-factor | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1}/shared-factor | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing{"q":5,"r":4}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-intercept/gcd-den-m | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | smooth-intercept{"primes":[3,11]}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | exact-change/big-bill | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | sunken-intercept/shared | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | smooth-crossing/shared | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":18}/even | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | egyptian-line/bottom | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pythagorean-area{"ends":1}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | egyptian-line/bottom | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":9}/shared-factor | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| m-meets-c/size | pythagorean-area{"ends":1}/shared-factor | one | **-5.91** | -5.9 |  |  |  |  | 87 |
| egyptian-line/bottom | pell-gradient{"D":7,"k":0}/pell-c | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.90** | -5.9 |  |  |  |  | 55 |
| egyptian-line/bottom | pell-gradient{"D":1,"k":1}/pell-c | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/gcd-floor-m | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pythagorean-area{"ends":9}/shared-factor | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":8}/legs | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":6}/even | neither | **-5.90** | ≤-5.9 |  |  |  |  | 1 |
| egyptian-line/bottom | near-point/gcd-x | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | smooth-intercept{"primes":[3,13]}/shared-factor | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing{"q":5,"r":1}/shared-factor | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":9}/step-back | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/whole | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | ruler{"ends":9}/shared-factor | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | steady-gradient/divisors | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | steady-gradient/divisors | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | steady-gradient/divisors | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-area/gcd-x | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | steady-gradient/gcd-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | steady-gradient/gcd-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | steady-gradient/gcd-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"k":3}/shared-factor | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | egyptian-line/bottom | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | egyptian-line/bottom | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":9}/shared-factor | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"d":1,"side":-1}/shared-factor | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | whole-intercept/gcd-den-m | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"k":3,"side":-1}/shared-factor | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":6,"k":0}/pell-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":1,"k":1}/difference | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":1,"k":1}/share-den | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"d":1}/shared-factor | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":7,"k":0}/difference | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":6}/legs | neither | **-5.88** | ≤-5.9 |  |  |  |  | 1 |
| crossing-check{"k":2,"q":4}/whole | egyptian-line/bottom | neither | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":18}/legs | neither | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-5.88** | ≤-5.9 |  |  |  |  | 3 |
| crossing-check{"k":1,"q":4}/size | egyptian-line/bottom | neither | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"d":2}/shared-factor | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | egyptian-line/bottom | neither | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.87** | -5.9 |  |  |  |  | 110 |
| egyptian-line/bottom | prime-staircase{"ends":3}/step-back | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3,"side":-1}/step-back | neither | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | exact-change/prime-coins | neither | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.87** | -5.9 |  |  |  |  | 108 |
| egyptian-line/bottom | smooth-intercept{"primes":[3,17]}/shared-factor | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":9}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":9}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":9}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | smooth-intercept{"primes":[3,7]}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-area/gcd-den-m | neither | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | ruler{"ends":1}/shared-factor | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":1}/step-back | one | **-5.85** | ≤-5.9 |  |  |  |  | 0 |
| m-meets-c/size | whole-area/gcd-den-m | neither | **-5.85** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | steep-and-tall/shared | neither | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":5,"k":0}/pell-c | neither | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-area/gcd-den-m | neither | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| steady-gradient/gcd-c | whole-area/gcd-den-m | neither | **-5.83** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":3,"k":0}/pell-c | neither | **-5.83** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | target-gradient/same-den | neither | **-5.83** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pythagorean-area{"ends":7}/shared-factor | one | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | whole-intercept/omega | neither | **-5.81** | ≤-5.8 |  |  |  |  | 8 |
| egyptian-line/bottom | triangle-area{"A":12}/legs | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | target-gradient/gcd-tops | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":5,"k":0}/share-den | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":5,"k":0}/difference | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | ruler{"ends":7}/shared-factor | one | **-5.80** | ≤-5.8 |  |  |  |  | 0 |
| prime-slope/matching-c | smooth-crossing/shared | neither | **-5.80** | ≤-5.8 |  |  |  |  | 11 |
| farey-neighbours/mediant-x | prime-staircase{"ends":9}/step-back | one | **-5.80** | -5.8 |  |  |  |  | 94 |
| egyptian-line/bottom | prime-staircase{"ends":7}/step-back | one | **-5.80** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | egyptian-line/bottom | neither | **-5.80** | ≤-5.8 |  |  |  |  | 0 |
| near-point/lattice | whole-intercept/omega | neither | **-5.79** | ≤-5.8 |  |  |  |  | 18 |
| egyptian-line/bottom | pell-gradient{"D":2,"k":0}/share-den | neither | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":2,"k":0}/difference | neither | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":2,"k":0}/pell-c | neither | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | whole-intercept/omega | neither | **-5.78** | ≤-5.8 |  |  |  |  | 25 |
| crossing-check{"k":1,"q":2}/size | whole-intercept/omega | neither | **-5.78** | ≤-5.8 |  |  |  |  | 8 |
| euclid-steps/largest-quotient | steady-gradient/divisors | neither | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | steady-gradient/gcd-c | neither | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/shared-factor | smooth-crossing/shared | one | **-5.77** | ≤-5.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | smooth-crossing/shared | neither | **-5.77** | ≤-5.8 |  |  |  |  | 0 |
| near-point/gcd-x | whole-intercept/omega | neither | **-5.77** | ≤-5.8 |  |  |  |  | 18 |
| egyptian-line/bottom | prime-landing{"ends":1}/shared-factor | one | **-5.77** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | whole-intercept/omega | neither | **-5.77** | ≤-5.8 |  |  |  |  | 23 |
| egyptian-line/bottom | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-5.77** | ≤-5.8 |  |  |  |  | 18 |
| crossing-check{"k":2,"q":6}/whole | whole-intercept/omega | neither | **-5.77** | ≤-5.8 |  |  |  |  | 25 |
| crossing-check{"k":3,"q":2}/whole | steady-gradient/divisors | neither | **-5.76** | ≤-5.8 |  |  |  |  | 11 |
| crossing-check{"k":2,"q":4}/whole | whole-intercept/omega | neither | **-5.75** | ≤-5.8 |  |  |  |  | 23 |
| crossing-check{"k":1,"q":6}/size | steady-gradient/divisors | neither | **-5.75** | -5.8 |  |  |  |  | 117 |
| crossing-check{"k":1,"q":4}/size | whole-intercept/omega | neither | **-5.75** | ≤-5.7 |  |  |  |  | 29 |
| egyptian-line/bottom | prime-staircase{"ends":1}/shared-factor | one | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/step-back | whole-intercept/omega | one | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/step-back | whole-intercept/omega | neither | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-area/gcd-den-m | neither | **-5.73** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | egyptian-line/bottom | neither | **-5.72** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | steady-gradient/divisors | neither | **-5.72** | -5.7 |  |  |  |  | 121 |
| egyptian-line/bottom | treasure{"k":4}/shared-factor | one | **-5.72** | ≤-5.7 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | square-area/omega | neither | **-5.72** | -5.7 |  |  |  |  | 105 |
| pell-gradient{"D":3,"k":0}/difference | square-area/omega | neither | **-5.72** | -5.7 |  |  |  |  | 105 |
| m-meets-c/meetPrime | prime-staircase{"ends":9}/step-back | one | **-5.71** | -5.7 |  |  |  |  | 93 |
| egyptian-line/bottom | ruler{"ends":3}/shared-factor | one | **-5.71** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | prime-staircase{"ends":9}/shared-factor | one | **-5.71** | -5.7 |  |  |  |  | 124 |
| crossing-check{"k":3,"q":2}/whole | steep-and-tall/shared | neither | **-5.71** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"k":4,"side":-1}/shared-factor | one | **-5.70** | ≤-5.7 |  |  |  |  | 0 |
| m-meets-c/size | prime-staircase{"ends":9}/step-back | one | **-5.70** | -5.7 |  |  |  |  | 93 |
| egyptian-line/bottom | pythagorean-area{"ends":3}/shared-factor | one | **-5.70** | ≤-5.7 |  |  |  |  | 2 |
| steady-gradient/divisors | whole-area/gcd-x | neither | **-5.70** | -4.1 | -7.3 |  |  |  | 884 |
| crossing-check{"k":1,"q":2}/whole | prime-staircase{"ends":9}/step-back | one | **-5.70** | -5.7 |  |  |  |  | 124 |
| crossing-check{"k":1,"q":2}/size | prime-staircase{"ends":9}/shared-factor | one | **-5.69** | -5.7 |  |  |  |  | 122 |
| crossing-check{"k":3,"q":4}/size | egyptian-line/bottom | neither | **-5.68** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | prime-staircase{"ends":9}/step-back | one | **-5.68** | -5.7 |  |  |  |  | 122 |
| egyptian-line/bottom | prime-slope/matching-c | neither | **-5.68** | ≤-5.7 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | farey-neighbours/mediant-x | neither | **-5.67** | ≤-5.7 |  |  |  |  | 11 |
| farey-neighbours/mediant-x | whole-intercept/omega | neither | **-5.66** | ≤-5.7 |  |  |  |  | 19 |
| divisibility-ladder/next-rung | pell-gradient{"D":3,"k":0}/share-den | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":3,"k":0}/difference | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | egyptian-line/bottom | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-crossing{"q":5,"r":2}/shared-factor | one | **-5.65** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3}/shared-factor | one | **-5.65** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3,"side":-1}/shared-factor | neither | **-5.65** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | sunken-intercept/shared | neither | **-5.64** | -5.6 |  |  |  |  | 138 |
| m-meets-c/meetPrime | whole-crossing{"q":5,"r":3}/shared-factor | one | **-5.64** | ≤-5.6 |  |  |  |  | 0 |
| m-meets-c/size | whole-crossing{"q":5,"r":2}/shared-factor | one | **-5.64** | ≤-5.6 |  |  |  |  | 0 |
| m-meets-c/size | whole-crossing{"q":5,"r":3}/shared-factor | one | **-5.63** | ≤-5.6 |  |  |  |  | 0 |
| egyptian-line/bottom | exact-change/big-piles | neither | **-5.63** | ≤-5.6 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-area/gcd-den-m | neither | **-5.62** | ≤-5.6 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/step-back | smooth-gradient/shared | one | **-5.62** | -5.6 |  |  |  |  | 58 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-gradient/shared | neither | **-5.62** | -5.6 |  |  |  |  | 58 |
| prime-slope/matching-c | whole-intercept/spf | neither | **-5.60** | ≤-5.6 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | whole-area/gcd-den-m | one | **-5.60** | ≤-5.6 |  |  |  |  | 0 |
| near-point/lattice | prime-gradient{"ends":9}/shared-factor | one | **-5.60** | -5.6 |  |  |  |  | 109 |
| crossing-check{"k":1,"q":4}/whole | whole-intercept/omega | neither | **-5.59** | ≤-5.6 |  |  |  |  | 29 |
| prime-slope/square-sum | smooth-square/shared | neither | **-5.59** | -5.6 |  |  |  |  | 32 |
| smooth-crossing/shared | steady-gradient/divisors | neither | **-5.59** | -4.2 | -7.0 |  |  |  | 583 |
| near-point/gcd-x | prime-gradient{"ends":9}/shared-factor | one | **-5.58** | -5.6 |  |  |  |  | 109 |
| divisibility-ladder/next-rung | whole-intercept/spf | one | **-5.58** | ≤-5.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | smooth-gradient/shared | neither | **-5.56** | ≤-5.6 |  |  |  |  | 0 |
| prime-slope/square-sum | square-area/omega | neither | **-5.56** | -5.6 |  |  |  |  | 32 |
| prime-slope/square-sum | square-area/lpf | one | **-5.56** | -5.6 |  |  |  |  | 32 |
| prime-slope/matching-c | whole-intercept/omega | neither | **-5.55** | ≤-5.6 |  |  |  |  | 0 |
| near-point/lattice | smooth-gradient/shared | neither | **-5.55** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | euclid-steps/largest-quotient | one | **-5.54** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.54** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | square-area/spf | one | **-5.54** | -5.5 |  |  |  |  | 162 |
| pell-gradient{"D":3,"k":0}/share-den | whole-at-t/gcd-c | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-at-t/gcd-c | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-at-t/gcd-c | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| near-point/gcd-x | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing{"q":5,"r":2}/shared-factor | one | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/shared-factor | whole-intercept/omega | one | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | whole-intercept/omega | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | smooth-gradient/shared | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | smooth-gradient/shared | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | smooth-gradient/shared | neither | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1}/shared-factor | one | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1}/shared-factor | one | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | steady-gradient/divisors | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | steady-gradient/divisors | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | sunken-intercept/shared | neither | **-5.49** | -5.5 |  |  |  |  | 138 |
| pell-gradient{"D":6,"k":0}/share-den | steady-gradient/gcd-c | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | steady-gradient/gcd-c | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.47** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":9}/shared-factor | one | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":9}/shared-factor | one | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | square-area/spf | one | **-5.46** | -5.5 |  |  |  |  | 177 |
| smooth-gradient/shared | target-gradient/same-den | neither | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| ruler{"ends":9}/shared-factor | triangle-area{"A":12}/legs | one | **-5.46** | -5.5 |  |  |  |  | 125 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.45** | -5.5 |  |  |  |  | 133 |
| farey-neighbours/mediant-x | pythagorean-area{"ends":1}/shared-factor | one | **-5.44** | -5.4 |  |  |  |  | 122 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.44** | -5.4 |  |  |  |  | 133 |
| smooth-gradient/shared | target-gradient/gcd-tops | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/gcd-den-m | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | smooth-gradient/shared | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | smooth-gradient/shared | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | smooth-gradient/shared | neither | **-5.41** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | smooth-gradient/shared | neither | **-5.41** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.41** | ≤-5.4 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.40** | -5.4 |  |  |  |  | 130 |
| crossing-check{"k":3,"q":2}/whole | whole-at-t/gcd-c | neither | **-5.40** | ≤-5.4 |  |  |  |  | 21 |
| prime-staircase{"ends":7}/shared-factor | smooth-intercept{"primes":[3,11]}/shared-factor | both | **-5.39** | ≤-5.4 |  |  |  |  | 0 |
| prime-staircase{"ends":7}/shared-factor | smooth-intercept{"primes":[3,13]}/shared-factor | both | **-5.38** | ≤-5.4 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.38** | -5.4 |  |  |  |  | 61 |
| square-area/spf | whole-intercept/mc-spf | one | **-5.35** | -5.4 |  |  |  |  | 129 |
| square-area/lpf | whole-intercept/mc-spf | one | **-5.35** | -5.3 |  |  |  |  | 130 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.34** | -5.3 |  |  |  |  | 98 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.34** | -5.3 |  |  |  |  | 98 |
| pell-gradient{"D":7,"k":0}/difference | square-area/omega | neither | **-5.32** | -5.3 |  |  |  |  | 181 |
| egyptian-line/bottom | smooth-crossing/shared | neither | **-5.32** | ≤-5.3 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | square-area/lpf | one | **-5.32** | -5.3 |  |  |  |  | 181 |
| crossing-check{"k":3,"q":4}/size | smooth-gradient/shared | neither | **-5.31** | ≤-5.3 |  |  |  |  | 18 |
| egyptian-line/bottom | whole-crossing{"q":5,"r":1}/shared-factor | one | **-5.31** | ≤-5.3 |  |  |  |  | 2 |
| prime-slope/matching-c | smooth-gradient/shared | neither | **-5.31** | ≤-5.3 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | steady-gradient/divisors | neither | **-5.29** | ≤-5.3 |  |  |  |  | 12 |
| prime-staircase{"ends":3}/shared-factor | smooth-gradient/shared | one | **-5.28** | ≤-5.3 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | smooth-gradient/shared | neither | **-5.28** | ≤-5.3 |  |  |  |  | 0 |
| near-point/lattice | sunken-intercept/shared | neither | **-5.27** | -5.3 |  |  |  |  | 141 |
| near-point/lattice | whole-at-t/gcd-c | neither | **-5.27** | -5.3 |  |  |  |  | 87 |
| pell-gradient{"D":7,"k":0}/pell-c | square-area/omega | neither | **-5.26** | -5.3 |  |  |  |  | 196 |
| near-point/gcd-x | sunken-intercept/shared | neither | **-5.26** | -5.3 |  |  |  |  | 140 |
| pell-gradient{"D":7,"k":0}/pell-c | square-area/lpf | one | **-5.26** | -5.3 |  |  |  |  | 196 |
| divisibility-ladder/next-rung | pell-gradient{"D":6,"k":0}/share-den | one | **-5.25** | ≤-5.3 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | pell-gradient{"D":6,"k":0}/difference | one | **-5.25** | ≤-5.3 |  |  |  |  | 0 |
| near-point/gcd-x | whole-at-t/gcd-c | neither | **-5.25** | -5.3 |  |  |  |  | 87 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.24** | -5.2 |  |  |  |  | 144 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-5.24** | -5.2 |  |  |  |  | 146 |
| crossing-check{"k":3,"q":4}/whole | steep-and-tall/shared | neither | **-5.24** | ≤-5.2 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | smooth-square/shared | neither | **-5.23** | -5.2 |  |  |  |  | 134 |
| pell-gradient{"D":3,"k":0}/difference | smooth-square/shared | neither | **-5.23** | -5.2 |  |  |  |  | 134 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":9}/shared-factor | one | **-5.23** | -5.2 |  |  |  |  | 148 |
| long-division/m-top | smooth-gradient/shared | neither | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| long-division/m-bottom-spf | smooth-gradient/shared | neither | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| long-division/c-period | smooth-gradient/shared | neither | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":9}/shared-factor | one | **-5.22** | -5.2 |  |  |  |  | 151 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":9}/shared-factor | one | **-5.21** | -5.2 |  |  |  |  | 148 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":9}/shared-factor | one | **-5.21** | -5.2 |  |  |  |  | 151 |
| egyptian-line/bottom | pell-gradient{"D":3,"k":0}/share-den | neither | **-5.20** | ≤-5.2 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":3,"k":0}/difference | neither | **-5.20** | ≤-5.2 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.19** | -5.2 |  |  |  |  | 104 |
| square-area/omega | whole-intercept/mc-spf | neither | **-5.19** | -5.2 |  |  |  |  | 133 |
| m-meets-c/meetPrime | prime-staircase{"ends":9}/shared-factor | one | **-5.19** | -5.2 |  |  |  |  | 124 |
| crossing-check{"k":3,"q":2}/whole | smooth-crossing/shared | neither | **-5.19** | ≤-5.2 |  |  |  |  | 2 |
| farey-neighbours/mediant-x | prime-staircase{"ends":9}/shared-factor | one | **-5.19** | -5.2 |  |  |  |  | 135 |
| m-meets-c/size | prime-staircase{"ends":9}/shared-factor | one | **-5.18** | -5.2 |  |  |  |  | 124 |
| crossing-check{"k":2,"q":4}/size | whole-at-t/gcd-c | neither | **-5.18** | -5.2 |  |  |  |  | 93 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-5.16** | -5.2 |  |  |  |  | 113 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":9}/shared-factor | one | **-5.15** | -5.2 |  |  |  |  | 165 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1}/shared-factor | one | **-5.14** | -5.1 |  |  |  |  | 109 |
| egyptian-line/bottom | whole-area/gcd-den-m | neither | **-5.14** | ≤-5.1 |  |  |  |  | 4 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":9}/shared-factor | one | **-5.14** | -5.1 |  |  |  |  | 162 |
| divisibility-ladder/next-rung | prime-staircase{"ends":7}/shared-factor | both | **-5.14** | ≤-5.1 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | whole-at-t/gcd-c | neither | **-5.14** | -5.1 |  |  |  |  | 96 |
| m-meets-c/meetPrime | pythagorean-area{"ends":7}/shared-factor | one | **-5.13** | -5.1 |  |  |  |  | 116 |
| m-meets-c/meetPrime | triangle-area{"A":18}/even | neither | **-5.13** | -5.1 |  |  |  |  | 141 |
| egyptian-line/bottom | whole-intercept/spf | neither | **-5.12** | ≤-5.1 |  |  |  |  | 0 |
| smooth-square/shared | whole-intercept/mc-spf | neither | **-5.12** | -5.1 |  |  |  |  | 140 |
| m-meets-c/size | triangle-area{"A":18}/even | neither | **-5.11** | -5.1 |  |  |  |  | 142 |
| pell-gradient{"D":7,"k":0}/difference | smooth-square/shared | neither | **-5.10** | -5.1 |  |  |  |  | 205 |
| m-meets-c/meetPrime | triangle-area{"A":18}/legs | neither | **-5.10** | -5.1 |  |  |  |  | 141 |
| farey-neighbours/mediant-x | whole-at-t/gcd-c | neither | **-5.09** | -5.1 |  |  |  |  | 66 |
| m-meets-c/size | triangle-area{"A":18}/legs | neither | **-5.08** | -5.1 |  |  |  |  | 142 |
| pell-gradient{"D":2,"k":0}/share-den | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 220 |
| pell-gradient{"D":2,"k":0}/difference | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 220 |
| pell-gradient{"D":2,"k":0}/pell-c | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 220 |
| egyptian-line/bottom | whole-crossing{"q":5,"r":4}/shared-factor | one | **-5.07** | -5.1 |  |  |  |  | 44 |
| egyptian-line/bottom | whole-intercept/omega | neither | **-5.07** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 249 |
| smooth-gradient/shared | whole-intercept/gcd-den-m | neither | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | egyptian-line/bottom | neither | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | smooth-square/shared | neither | **-5.05** | -5.1 |  |  |  |  | 219 |
| pell-gradient{"D":2,"k":0}/share-den | square-area/omega | neither | **-5.04** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/difference | square-area/omega | neither | **-5.04** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/pell-c | square-area/omega | neither | **-5.04** | -5.0 |  |  |  |  | 228 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1}/shared-factor | one | **-5.04** | -5.0 |  |  |  |  | 108 |
| pell-gradient{"D":2,"k":0}/share-den | square-area/lpf | one | **-5.03** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/difference | square-area/lpf | one | **-5.03** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/pell-c | square-area/lpf | one | **-5.03** | -5.0 |  |  |  |  | 228 |
| prime-landing{"ends":9}/shared-factor | steady-gradient/divisors | one | **-5.02** | -3.2 | -5.5 | -6.4 |  |  | 2091 |
| steady-gradient/divisors | whole-crossing{"q":5,"r":2}/shared-factor | one | **-4.98** | -4.0 | -5.9 |  |  |  | 280 |
| crossing-check{"k":3,"q":2}/whole | whole-area/gcd-x | neither | **-4.95** | -5.0 |  |  |  |  | 60 |
| crossing-check{"k":3,"q":2}/size | whole-intercept/mc-spf | neither | **-4.95** | -4.9 |  |  |  |  | 35 |
| crossing-check{"k":3,"q":2}/whole | whole-intercept/omega | neither | **-4.94** | ≤-4.9 |  |  |  |  | 14 |
| egyptian-line/bottom | whole-crossing{"q":5,"r":2}/shared-factor | one | **-4.93** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | steep-and-tall/shared | neither | **-4.93** | -4.9 |  |  |  |  | 118 |
| egyptian-line/bottom | whole-crossing{"q":5,"r":3}/shared-factor | one | **-4.93** | ≤-4.9 |  |  |  |  | 2 |
| crossing-check{"k":3,"q":4}/whole | whole-at-t/gcd-c | neither | **-4.93** | ≤-4.9 |  |  |  |  | 2 |
| farey-neighbours/mediant-x | prime-gradient{"ends":9}/shared-factor | one | **-4.91** | -4.9 |  |  |  |  | 148 |
| crossing-check{"k":1,"q":6}/size | steep-and-tall/shared | neither | **-4.90** | -4.9 |  |  |  |  | 118 |
| crossing-check{"k":3,"q":4}/size | whole-intercept/mc-spf | neither | **-4.88** | -4.9 |  |  |  |  | 30 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-intercept/mc-spf | neither | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/mc-spf | neither | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | whole-intercept/mc-spf | neither | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | smooth-square/shared | neither | **-4.86** | -4.9 |  |  |  |  | 261 |
| pell-gradient{"D":2,"k":0}/difference | smooth-square/shared | neither | **-4.86** | -4.9 |  |  |  |  | 261 |
| pell-gradient{"D":2,"k":0}/pell-c | smooth-square/shared | neither | **-4.86** | -4.9 |  |  |  |  | 261 |
| whole-area/gcd-x | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-4.86** | -4.9 |  |  |  |  | 151 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | square-area/omega | neither | **-4.85** | -4.9 |  |  |  |  | 276 |
| pell-gradient{"D":7,"k":0}/share-den | square-area/lpf | one | **-4.85** | -4.8 |  |  |  |  | 276 |
| crossing-check{"k":2,"q":4}/size | sunken-intercept/shared | neither | **-4.83** | -4.8 |  |  |  |  | 205 |
| pell-gradient{"D":3,"k":0}/share-den | smooth-gradient/shared | neither | **-4.83** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | smooth-gradient/shared | neither | **-4.83** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | whole-at-t/gcd-c | neither | **-4.83** | -4.8 |  |  |  |  | 91 |
| egyptian-line/bottom | smooth-gradient/shared | neither | **-4.83** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | sunken-intercept/shared | neither | **-4.82** | -4.8 |  |  |  |  | 205 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.81** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | treasure{"k":3,"side":-1}/shared-factor | one | **-4.81** | -4.8 |  |  |  |  | 99 |
| prime-landing{"ends":1}/shared-factor | steady-gradient/divisors | one | **-4.81** | -3.0 | -5.4 | -6.0 |  |  | 1876 |
| m-meets-c/meetPrime | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-4.81** | -4.8 |  |  |  |  | 145 |
| prime-staircase{"ends":7}/shared-factor | smooth-crossing/shared | one | **-4.80** | ≤-4.8 |  |  |  |  | 13 |
| crossing-check{"k":1,"q":6}/size | sunken-intercept/shared | neither | **-4.80** | -4.8 |  |  |  |  | 256 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| target-gradient/same-den | whole-intercept/mc-spf | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":6,"k":0}/share-den | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":6,"k":0}/difference | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| m-meets-c/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-4.79** | -4.8 |  |  |  |  | 147 |
| exact-change/prime-coins | m-meets-c/meetPrime | neither | **-4.78** | -4.8 |  |  |  |  | 112 |
| egyptian-line/bottom | smooth-square/shared | neither | **-4.78** | -4.8 |  |  |  |  | 63 |
| target-gradient/gcd-tops | whole-intercept/mc-spf | neither | **-4.78** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | whole-intercept/mc-spf | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | whole-intercept/mc-spf | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| smooth-gradient/shared | whole-area/gcd-den-m | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| exact-change/prime-coins | m-meets-c/size | neither | **-4.77** | -4.8 |  |  |  |  | 112 |
| farey-neighbours/mediant-x | triangle-area{"A":18}/legs | neither | **-4.76** | -4.8 |  |  |  |  | 180 |
| farey-neighbours/mediant-x | whole-intercept/mc-spf | neither | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-4.76** | -4.8 |  |  |  |  | 174 |
| pell-gradient{"D":2,"k":0}/share-den | whole-intercept/mc-spf | neither | **-4.75** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-intercept/mc-spf | neither | **-4.75** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.75** | ≤-4.8 |  |  |  |  | 0 |
| egyptian-line/bottom | square-area/omega | neither | **-4.75** | -4.8 |  |  |  |  | 63 |
| egyptian-line/bottom | square-area/lpf | one | **-4.74** | -4.7 |  |  |  |  | 63 |
| egyptian-line/bottom | square-area/spf | one | **-4.74** | -4.7 |  |  |  |  | 63 |
| crossing-check{"k":3,"q":4}/whole | smooth-crossing/shared | neither | **-4.72** | ≤-4.7 |  |  |  |  | 1 |
| euclid-steps/largest-quotient | smooth-gradient/shared | neither | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-slope/twins | neither | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | smooth-square/shared | neither | **-4.70** | ≤-4.7 |  |  |  |  | 16 |
| pell-gradient{"D":7,"k":0}/share-den | smooth-square/shared | neither | **-4.70** | -4.7 |  |  |  |  | 299 |
| prime-gradient{"ends":1}/shared-factor | prime-slope/twins | one | **-4.70** | ≤-4.7 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | prime-slope/twins | one | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-slope/twins | neither | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":7}/shared-factor | one | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | whole-intercept/gcd-floor-m | neither | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| m-meets-c/meetPrime | prime-staircase{"ends":1}/step-back | one | **-4.68** | -4.7 |  |  |  |  | 144 |
| prime-slope/twins | steady-gradient/divisors | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | steady-gradient/gcd-c | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | square-area/omega | neither | **-4.67** | ≤-4.7 |  |  |  |  | 7 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-slope/twins | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | square-area/lpf | one | **-4.67** | ≤-4.7 |  |  |  |  | 7 |
| pell-gradient{"D":7,"k":0}/difference | prime-slope/twins | neither | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | square-area/spf | one | **-4.66** | ≤-4.7 |  |  |  |  | 7 |
| m-meets-c/size | prime-staircase{"ends":1}/step-back | one | **-4.65** | -4.7 |  |  |  |  | 146 |
| prime-slope/matching-c | whole-intercept/mc-spf | neither | **-4.65** | ≤-4.6 |  |  |  |  | 0 |
| prime-gradient{"ends":9}/shared-factor | prime-slope/twins | one | **-4.64** | ≤-4.6 |  |  |  |  | 0 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | prime-slope/twins | one | **-4.64** | ≤-4.6 |  |  |  |  | 0 |
| divisibility-ladder/next-rung | whole-intercept/mc-spf | one | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | square-area/spf | one | **-4.63** | -4.6 |  |  |  |  | 154 |
| pell-gradient{"D":6,"k":0}/difference | square-area/spf | one | **-4.63** | -4.6 |  |  |  |  | 154 |
| farey-neighbours/mediant-x | triangle-area{"A":18}/even | neither | **-4.62** | -4.6 |  |  |  |  | 195 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-slope/twins | neither | **-4.62** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1}/shared-factor | one | **-4.62** | -4.6 |  |  |  |  | 148 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1}/shared-factor | one | **-4.61** | -4.6 |  |  |  |  | 147 |
| crossing-check{"k":1,"q":6}/whole | sunken-intercept/shared | neither | **-4.60** | -4.6 |  |  |  |  | 288 |
| crossing-check{"k":3,"q":4}/whole | egyptian-line/bottom | neither | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-slope/twins | neither | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-slope/twins | neither | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | sunken-intercept/shared | neither | **-4.58** | -4.6 |  |  |  |  | 266 |
| m-meets-c/meetPrime | prime-staircase{"ends":1}/shared-factor | one | **-4.56** | -4.6 |  |  |  |  | 144 |
| long-division/m-top | whole-intercept/mc-spf | neither | **-4.56** | ≤-4.6 |  |  |  |  | 0 |
| long-division/m-bottom-spf | whole-intercept/mc-spf | neither | **-4.56** | ≤-4.6 |  |  |  |  | 0 |
| long-division/c-period | whole-intercept/mc-spf | neither | **-4.56** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/whole | sunken-intercept/shared | neither | **-4.56** | -4.6 |  |  |  |  | 266 |
| prime-staircase{"ends":7}/shared-factor | whole-intercept/omega | one | **-4.55** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-4.55** | -4.5 |  |  |  |  | 152 |
| m-meets-c/size | prime-staircase{"ends":1}/shared-factor | one | **-4.54** | -4.5 |  |  |  |  | 146 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-4.53** | -4.5 |  |  |  |  | 150 |
| near-point/lattice | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.53** | -4.5 |  |  |  |  | 191 |
| near-point/gcd-x | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.52** | -4.5 |  |  |  |  | 190 |
| whole-at-t/gcd-c | whole-intercept/mc-spf | neither | **-4.50** | ≤-4.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | whole-at-t/gcd-c | neither | **-4.50** | -4.5 |  |  |  |  | 118 |
| crossing-check{"k":3,"q":2}/whole | sunken-intercept/shared | neither | **-4.50** | -4.5 |  |  |  |  | 112 |
| prime-staircase{"ends":3}/shared-factor | whole-at-t/gcd-c | one | **-4.47** | -4.5 |  |  |  |  | 95 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | whole-at-t/gcd-c | neither | **-4.47** | -4.5 |  |  |  |  | 95 |
| prime-slope/matching-c | whole-at-t/gcd-c | neither | **-4.47** | -4.5 |  |  |  |  | 177 |
| near-point/lattice | treasure{"k":3,"side":-1}/shared-factor | one | **-4.47** | -4.5 |  |  |  |  | 156 |
| crossing-check{"k":3,"q":4}/whole | whole-intercept/omega | neither | **-4.47** | ≤-4.5 |  |  |  |  | 17 |
| m-meets-c/meetPrime | triangle-area{"A":12}/even | neither | **-4.45** | -4.5 |  |  |  |  | 202 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.45** | -4.5 |  |  |  |  | 215 |
| prime-landing{"ends":9,"side":-1}/shared-factor | steady-gradient/divisors | one | **-4.45** | -3.3 | -5.6 |  |  |  | 1962 |
| near-point/gcd-x | treasure{"k":3,"side":-1}/shared-factor | one | **-4.45** | -4.5 |  |  |  |  | 156 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.44** | -4.4 |  |  |  |  | 213 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.44** | -4.4 |  |  |  |  | 112 |
| divisibility-ladder/next-rung | prime-slope/twins | one | **-4.44** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | smooth-gradient/shared | neither | **-4.43** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | smooth-gradient/shared | neither | **-4.43** | ≤-4.4 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1}/shared-factor | one | **-4.41** | -4.4 |  |  |  |  | 109 |
| pell-gradient{"D":6,"k":0}/share-den | square-area/omega | neither | **-4.36** | -4.4 |  |  |  |  | 174 |
| pell-gradient{"D":6,"k":0}/difference | square-area/omega | neither | **-4.36** | -4.4 |  |  |  |  | 174 |
| pell-gradient{"D":6,"k":0}/share-den | square-area/lpf | one | **-4.36** | -4.4 |  |  |  |  | 174 |
| pell-gradient{"D":6,"k":0}/difference | square-area/lpf | one | **-4.36** | -4.4 |  |  |  |  | 174 |
| prime-landing{"ends":1,"side":-1}/shared-factor | steady-gradient/divisors | one | **-4.35** | -3.1 | -5.6 |  |  |  | 1792 |
| m-meets-c/meetPrime | triangle-area{"A":12}/legs | neither | **-4.34** | -4.3 |  |  |  |  | 202 |
| prime-slope/twins | whole-at-t/gcd-c | neither | **-4.31** | ≤-4.3 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-crossing{"q":5,"r":1}/shared-factor | one | **-4.31** | -4.3 |  |  |  |  | 298 |
| crossing-check{"k":2,"q":6}/size | whole-at-t/gcd-c | neither | **-4.29** | -4.3 |  |  |  |  | 156 |
| crossing-check{"k":3,"q":2}/size | smooth-gradient/shared | neither | **-4.28** | -4.3 |  |  |  |  | 72 |
| long-division/m-top | whole-intercept/gcd-floor-m | neither | **-4.28** | -4.3 |  |  |  |  | 761 |
| long-division/c-period | whole-intercept/gcd-floor-m | neither | **-4.28** | -4.3 |  |  |  |  | 761 |
| crossing-check{"k":2,"q":6}/whole | whole-at-t/gcd-c | neither | **-4.27** | -4.3 |  |  |  |  | 156 |
| crossing-check{"k":2,"q":2}/whole | whole-area/gcd-den-m | neither | **-4.26** | -4.3 |  |  |  |  | 101 |
| steady-gradient/divisors | whole-crossing{"q":5,"r":4}/shared-factor | one | **-4.26** | -4.3 |  |  |  |  | 307 |
| crossing-check{"k":2,"q":2}/size | whole-area/gcd-den-m | neither | **-4.25** | -4.3 |  |  |  |  | 102 |
| steady-gradient/divisors | whole-crossing{"q":5,"r":3}/shared-factor | one | **-4.23** | -4.2 |  |  |  |  | 265 |
| crossing-check{"k":3,"q":4}/whole | smooth-gradient/shared | neither | **-4.22** | ≤-4.2 |  |  |  |  | 18 |
| crossing-check{"k":3,"q":2}/whole | whole-intercept/mc-spf | neither | **-4.22** | -4.2 |  |  |  |  | 35 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":9}/shared-factor | one | **-4.22** | -4.2 |  |  |  |  | 250 |
| crossing-check{"k":1,"q":4}/whole | near-point/lattice | neither | **-4.20** | -4.2 |  |  |  |  | 210 |
| triangle-area{"A":6}/even | whole-intercept/omega | neither | **-4.19** | -2.8 | -5.6 |  |  |  | 851 |
| triangle-area{"A":6}/legs | whole-intercept/omega | neither | **-4.19** | -2.8 | -5.6 |  |  |  | 842 |
| pell-gradient{"D":3,"k":0}/share-den | whole-intercept/mc-spf | neither | **-4.17** | ≤-4.2 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-intercept/mc-spf | neither | **-4.17** | ≤-4.2 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/mc-spf | neither | **-4.17** | ≤-4.2 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/step-back | whole-at-t/gcd-c | one | **-4.17** | -4.2 |  |  |  |  | 152 |
| prime-staircase{"ends":3,"side":-1}/step-back | whole-at-t/gcd-c | neither | **-4.17** | -4.2 |  |  |  |  | 152 |
| prime-gradient{"ends":1}/shared-factor | prime-slope/square-sum | one | **-4.15** | ≤-4.1 |  |  |  |  | 27 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | prime-slope/square-sum | one | **-4.15** | ≤-4.1 |  |  |  |  | 26 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/square-sum | neither | **-4.14** | ≤-4.1 |  |  |  |  | 1 |
| long-division/m-top | whole-at-t/gcd-c | neither | **-4.13** | -4.1 |  |  |  |  | 237 |
| long-division/m-bottom-spf | whole-at-t/gcd-c | neither | **-4.13** | -4.1 |  |  |  |  | 237 |
| long-division/c-period | whole-at-t/gcd-c | neither | **-4.13** | -4.1 |  |  |  |  | 237 |
| prime-slope/square-sum | steady-gradient/divisors | neither | **-4.13** | ≤-4.1 |  |  |  |  | 0 |
| prime-slope/square-sum | steady-gradient/gcd-c | neither | **-4.13** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | sunken-intercept/shared | neither | **-4.12** | -4.1 |  |  |  |  | 278 |
| euclid-steps/largest-quotient | whole-intercept/gcd-floor-m | neither | **-4.12** | -3.2 | -5.0 |  |  |  | 835 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/square-sum | neither | **-4.12** | ≤-4.1 |  |  |  |  | 1 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/square-sum | neither | **-4.12** | ≤-4.1 |  |  |  |  | 1 |
| pell-gradient{"D":7,"k":0}/difference | prime-slope/square-sum | neither | **-4.12** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | smooth-square/shared | neither | **-4.12** | -4.1 |  |  |  |  | 197 |
| pell-gradient{"D":6,"k":0}/difference | smooth-square/shared | neither | **-4.12** | -4.1 |  |  |  |  | 197 |
| prime-slope/square-sum | square-area/spf | one | **-4.11** | ≤-4.1 |  |  |  |  | 30 |
| whole-area/gcd-den-m | whole-intercept/mc-spf | neither | **-4.11** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.10** | -4.1 |  |  |  |  | 104 |
| prime-gradient{"ends":9}/shared-factor | prime-slope/square-sum | one | **-4.10** | ≤-4.1 |  |  |  |  | 0 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | prime-slope/square-sum | one | **-4.10** | ≤-4.1 |  |  |  |  | 1 |
| crossing-check{"k":1,"q":6}/size | same-on-both-rulers{"d":2}/shared-factor | one | **-4.09** | -4.1 |  |  |  |  | 365 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-4.07** | -4.1 |  |  |  |  | 265 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":9}/shared-factor | one | **-4.07** | -4.1 |  |  |  |  | 292 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/square-sum | neither | **-4.06** | ≤-4.1 |  |  |  |  | 7 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":9}/shared-factor | one | **-4.06** | -4.1 |  |  |  |  | 250 |
| m-meets-c/meetPrime | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.06** | -4.1 |  |  |  |  | 208 |
| euclid-steps/largest-quotient | whole-intercept/mc-spf | neither | **-4.05** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1}/shared-factor | one | **-4.04** | -4.0 |  |  |  |  | 253 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | whole-area/gcd-den-m | one | **-4.04** | -3.5 | -4.5 |  |  |  | 489 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.03** | -4.0 |  |  |  |  | 282 |
| crossing-check{"k":3,"q":4}/whole | sunken-intercept/shared | neither | **-4.02** | -4.0 |  |  |  |  | 113 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/square-sum | neither | **-4.02** | ≤-4.0 |  |  |  |  | 6 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/square-sum | neither | **-4.02** | ≤-4.0 |  |  |  |  | 6 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/square-sum | neither | **-4.02** | ≤-4.0 |  |  |  |  | 6 |
| prime-gradient{"ends":1}/shared-factor | whole-area/gcd-den-m | one | **-4.02** | -3.6 | -4.4 |  |  |  | 488 |
| prime-gradient{"ends":9}/shared-factor | whole-area/gcd-den-m | one | **-4.02** | -4.0 |  |  |  |  | 371 |
| crossing-check{"k":2,"q":4}/size | smooth-crossing/shared | neither | **-4.02** | -4.0 |  |  |  |  | 105 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-4.01** | -4.0 |  |  |  |  | 282 |
| long-division/m-bottom-spf | whole-intercept/omega | neither | **-4.01** | -2.8 | -5.2 |  |  |  | 1253 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-area/gcd-den-m | one | **-4.01** | -4.0 |  |  |  |  | 380 |
| crossing-check{"k":1,"q":4}/size | prime-staircase{"ends":9}/shared-factor | one | **-4.01** | -4.0 |  |  |  |  | 335 |
| crossing-check{"k":2,"q":4}/whole | smooth-crossing/shared | neither | **-4.00** | -4.0 |  |  |  |  | 105 |
| crossing-check{"k":1,"q":4}/size | smooth-crossing/shared | neither | **-4.00** | -4.0 |  |  |  |  | 105 |
| crossing-check{"k":1,"q":4}/size | prime-staircase{"ends":9}/step-back | one | **-3.99** | -4.0 |  |  |  |  | 335 |
| egyptian-line/bottom | prime-slope/twins | neither | **-3.98** | ≤-4.0 |  |  |  |  | 0 |
| prime-gradient{"ends":9}/shared-factor | treasure{"k":4,"side":-1}/shared-factor | both | **-3.96** | -4.7 | -3.3 |  |  |  | 265 |
| crossing-check{"k":3,"q":6}/whole | sunken-intercept/shared | neither | **-3.96** | -4.0 |  |  |  |  | 313 |
| crossing-check{"k":3,"q":6}/size | whole-at-t/gcd-c | neither | **-3.96** | -4.0 |  |  |  |  | 164 |
| m-meets-c/meetPrime | prime-gradient{"ends":9}/shared-factor | one | **-3.95** | -5.0 | -2.9 |  |  |  | 136 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1}/shared-factor | one | **-3.95** | -3.9 |  |  |  |  | 108 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":9}/shared-factor | one | **-3.94** | -3.9 |  |  |  |  | 329 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-3.94** | -3.9 |  |  |  |  | 302 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-3.92** | -3.9 |  |  |  |  | 265 |
| m-meets-c/size | prime-gradient{"ends":9}/shared-factor | one | **-3.92** | -5.0 | -2.9 |  |  |  | 136 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1}/shared-factor | one | **-3.91** | -3.9 |  |  |  |  | 283 |
| divisibility-ladder/next-rung | prime-slope/square-sum | one | **-3.89** | ≤-3.9 |  |  |  |  | 0 |
| triangle-area{"A":8}/even | whole-intercept/omega | neither | **-3.88** | -2.4 | -5.3 |  |  |  | 1040 |
| triangle-area{"A":8}/legs | whole-intercept/omega | neither | **-3.87** | -2.4 | -5.3 |  |  |  | 1028 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":9,"side":-1}/shared-factor | one | **-3.86** | -3.9 |  |  |  |  | 325 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | treasure{"k":4}/shared-factor | both | **-3.86** | -4.6 | -3.1 |  |  |  | 286 |
| crossing-check{"k":1,"q":4}/whole | prime-staircase{"ends":9}/shared-factor | one | **-3.85** | -3.9 |  |  |  |  | 334 |
| crossing-check{"k":1,"q":4}/whole | prime-staircase{"ends":9}/step-back | one | **-3.84** | -3.8 |  |  |  |  | 334 |
| crossing-check{"k":1,"q":4}/whole | smooth-crossing/shared | neither | **-3.84** | -3.8 |  |  |  |  | 105 |
| ruler{"ends":9}/shared-factor | steady-gradient/divisors | one | **-3.84** | -2.8 | -4.9 |  |  |  | 2064 |
| crossing-check{"k":3,"q":6}/whole | whole-at-t/gcd-c | neither | **-3.83** | -3.8 |  |  |  |  | 184 |
| near-point/lattice | prime-staircase{"ends":9}/shared-factor | one | **-3.83** | -3.8 |  |  |  |  | 293 |
| crossing-check{"k":1,"q":6}/whole | smooth-crossing/shared | neither | **-3.82** | -3.8 |  |  |  |  | 137 |
| near-point/lattice | prime-staircase{"ends":9}/step-back | one | **-3.82** | -3.8 |  |  |  |  | 293 |
| near-point/gcd-x | prime-staircase{"ends":9}/shared-factor | one | **-3.82** | -3.8 |  |  |  |  | 291 |
| sunken-intercept/shared | triangle-area{"A":4}/even | neither | **-3.81** | -1.8 | -5.8 |  |  |  | 2674 |
| near-point/gcd-x | prime-staircase{"ends":9}/step-back | one | **-3.80** | -3.8 |  |  |  |  | 291 |
| sunken-intercept/shared | triangle-area{"A":4}/legs | neither | **-3.80** | -1.7 | -5.8 |  |  |  | 2764 |
| crossing-check{"k":3,"q":4}/whole | whole-intercept/mc-spf | neither | **-3.79** | -3.8 |  |  |  |  | 30 |
| crossing-check{"k":1,"q":4}/size | same-on-both-rulers{"d":2}/shared-factor | one | **-3.79** | -3.8 |  |  |  |  | 401 |
| crossing-check{"k":1,"q":6}/size | smooth-crossing/shared | neither | **-3.78** | -3.8 |  |  |  |  | 137 |
| pell-gradient{"D":6,"k":0}/share-den | whole-intercept/mc-spf | neither | **-3.77** | ≤-3.8 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | whole-intercept/mc-spf | neither | **-3.77** | ≤-3.8 |  |  |  |  | 0 |
| near-point/lattice | prime-gradient{"ends":1}/shared-factor | one | **-3.77** | -3.8 |  |  |  |  | 289 |
| near-point/gcd-x | prime-gradient{"ends":1}/shared-factor | one | **-3.75** | -3.8 |  |  |  |  | 288 |
| prime-landing{"ends":9,"side":-1}/shared-factor | triangle-area{"A":4}/even | one | **-3.75** | -3.7 |  |  |  |  | 281 |
| prime-landing{"ends":9,"side":-1}/shared-factor | triangle-area{"A":4}/legs | one | **-3.75** | -3.7 |  |  |  |  | 284 |
| m-meets-c/meetPrime | prime-staircase{"ends":7}/step-back | one | **-3.73** | -4.9 | -2.5 |  |  |  | 121 |
| crossing-check{"k":1,"q":2}/size | prime-staircase{"ends":1}/step-back | one | **-3.72** | -3.7 |  |  |  |  | 364 |
| ruler{"ends":1}/shared-factor | steady-gradient/divisors | one | **-3.71** | -2.8 | -4.7 |  |  |  | 1870 |
| crossing-check{"k":2,"q":2}/whole | whole-intercept/gcd-den-m | neither | **-3.71** | -3.7 |  |  |  |  | 173 |
| crossing-check{"k":1,"q":6}/whole | same-on-both-rulers{"d":2}/shared-factor | one | **-3.70** | -3.7 |  |  |  |  | 455 |
| crossing-check{"k":3,"q":2}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-3.70** | -3.7 |  |  |  |  | 149 |
| prime-gradient{"ends":9}/shared-factor | treasure{"k":3,"side":-1}/shared-factor | both | **-3.69** | -4.3 | -3.1 |  |  |  | 362 |
| crossing-check{"k":2,"q":4}/size | smooth-gradient/shared | neither | **-3.68** | -3.7 |  |  |  |  | 101 |
| crossing-check{"k":1,"q":2}/size | prime-staircase{"ends":1}/shared-factor | one | **-3.68** | -3.7 |  |  |  |  | 346 |
| crossing-check{"k":2,"q":4}/whole | smooth-gradient/shared | neither | **-3.67** | -3.7 |  |  |  |  | 101 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/gcd-den-m | neither | **-3.65** | -3.6 |  |  |  |  | 186 |
| crossing-check{"k":1,"q":4}/whole | same-on-both-rulers{"d":2}/shared-factor | one | **-3.64** | -3.6 |  |  |  |  | 401 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-3.63** | -3.6 |  |  |  |  | 249 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-3.61** | -3.6 |  |  |  |  | 245 |
| prime-landing{"ends":9}/shared-factor | triangle-area{"A":4}/legs | one | **-3.61** | -3.6 |  |  |  |  | 314 |
| crossing-check{"k":1,"q":2}/whole | prime-staircase{"ends":1}/step-back | one | **-3.61** | -3.6 |  |  |  |  | 389 |
| prime-slope/twins | smooth-gradient/shared | neither | **-3.61** | ≤-3.6 |  |  |  |  | 0 |
| prime-landing{"ends":9}/shared-factor | triangle-area{"A":4}/even | one | **-3.61** | -3.6 |  |  |  |  | 312 |
| farey-neighbours/mediant-x | smooth-gradient/shared | neither | **-3.59** | -3.6 |  |  |  |  | 146 |
| pell-gradient{"D":6,"k":0}/share-den | prime-slope/twins | neither | **-3.58** | ≤-3.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-slope/twins | neither | **-3.58** | ≤-3.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | prime-staircase{"ends":1}/shared-factor | one | **-3.56** | -3.6 |  |  |  |  | 370 |
| crossing-check{"k":3,"q":2}/whole | smooth-gradient/shared | neither | **-3.55** | -3.6 |  |  |  |  | 72 |
| m-meets-c/meetPrime | whole-at-t/gcd-den-m | neither | **-3.54** | ≤-3.5 |  |  |  |  | 18 |
| m-meets-c/size | whole-at-t/gcd-den-m | neither | **-3.53** | ≤-3.5 |  |  |  |  | 18 |
| crossing-check{"k":2,"q":2}/whole | whole-at-t/gcd-den-m | neither | **-3.52** | ≤-3.5 |  |  |  |  | 28 |
| steady-gradient/divisors | whole-at-t/gcd-den-m | neither | **-3.51** | ≤-3.5 |  |  |  |  | 0 |
| steady-gradient/gcd-c | whole-at-t/gcd-den-m | neither | **-3.51** | ≤-3.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-3.51** | -3.5 | -3.5 |  |  |  | 373 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-3.50** | -3.5 | -3.5 |  |  |  | 371 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | treasure{"k":3}/shared-factor | both | **-3.50** | -4.1 | -2.9 |  |  |  | 387 |
| crossing-check{"k":1,"q":2}/size | ruler{"ends":9}/shared-factor | one | **-3.48** | -3.5 |  |  |  |  | 363 |
| crossing-check{"k":1,"q":2}/whole | ruler{"ends":9}/shared-factor | one | **-3.46** | -3.5 |  |  |  |  | 376 |
| m-meets-c/size | pythagorean-area{"ends":7}/shared-factor | one | **-3.46** | -5.1 | -1.8 |  |  |  | 117 |
| m-meets-c/size | triangle-area{"A":12}/even | neither | **-3.45** | -4.4 | -2.5 |  |  |  | 204 |
| euclid-steps/largest-quotient | pell-gradient{"D":5,"k":0}/pell-c | neither | **-3.44** | -4.2 | -2.7 |  |  |  | 261 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | treasure{"k":4}/shared-factor | both | **-3.44** | -4.0 | -2.9 |  |  |  | 361 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/square-sum | neither | **-3.43** | ≤-3.4 |  |  |  |  | 7 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/square-sum | neither | **-3.43** | ≤-3.4 |  |  |  |  | 7 |
| egyptian-line/bottom | prime-slope/square-sum | neither | **-3.43** | ≤-3.4 |  |  |  |  | 3 |
| euclid-steps/largest-quotient | pell-gradient{"D":5,"k":0}/difference | neither | **-3.42** | -4.2 | -2.7 |  |  |  | 261 |
| euclid-steps/largest-quotient | pell-gradient{"D":5,"k":0}/share-den | neither | **-3.42** | -4.2 | -2.7 |  |  |  | 261 |
| divisibility-ladder/next-rung | m-meets-c/meetPrime | one | **-3.42** | -3.4 |  |  |  |  | 236 |
| sunken-intercept/shared | triangle-area{"A":6}/even | neither | **-3.42** | -1.3 | -5.5 |  |  |  | 3184 |
| sunken-intercept/shared | triangle-area{"A":6}/legs | neither | **-3.41** | -1.3 | -5.5 |  |  |  | 3147 |
| divisibility-ladder/next-rung | m-meets-c/size | one | **-3.41** | -3.4 |  |  |  |  | 236 |
| crossing-check{"k":1,"q":4}/size | whole-at-t/gcd-c | neither | **-3.41** | -3.4 |  |  |  |  | 241 |
| near-point/gcd-x | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-3.40** | -3.4 |  |  |  |  | 302 |
| m-meets-c/size | triangle-area{"A":12}/legs | neither | **-3.39** | -4.3 | -2.5 |  |  |  | 204 |
| crossing-check{"k":1,"q":6}/size | prime-staircase{"ends":9}/shared-factor | one | **-3.38** | -3.4 |  |  |  |  | 473 |
| crossing-check{"k":1,"q":6}/size | prime-staircase{"ends":9}/step-back | one | **-3.37** | -3.4 |  |  |  |  | 473 |
| m-meets-c/meetPrime | triangle-area{"A":8}/even | neither | **-3.37** | -3.4 |  |  |  |  | 347 |
| crossing-check{"k":1,"q":2}/size | divisibility-ladder/next-rung | one | **-3.37** | -3.4 |  |  |  |  | 229 |
| crossing-check{"k":2,"q":6}/size | prime-landing{"ends":1}/shared-factor | one | **-3.37** | -3.4 |  |  |  |  | 324 |
| exact-change/prime-coins | steady-gradient/divisors | neither | **-3.36** | -2.4 | -4.4 |  |  |  | 1663 |
| crossing-check{"k":2,"q":2}/size | whole-at-t/gcd-den-m | neither | **-3.35** | -3.4 |  |  |  |  | 42 |
| smooth-gradient/shared | whole-intercept/spf | neither | **-3.35** | -3.4 |  |  |  |  | 257 |
| crossing-check{"k":2,"q":6}/whole | prime-landing{"ends":1}/shared-factor | one | **-3.35** | -3.4 |  |  |  |  | 324 |
| crossing-check{"k":3,"q":6}/whole | smooth-crossing/shared | neither | **-3.35** | -3.3 |  |  |  |  | 183 |
| m-meets-c/meetPrime | triangle-area{"A":8}/legs | neither | **-3.35** | -3.3 |  |  |  |  | 346 |
| crossing-check{"k":2,"q":6}/size | smooth-crossing/shared | neither | **-3.34** | -3.3 |  |  |  |  | 188 |
| crossing-check{"k":3,"q":6}/size | smooth-crossing/shared | neither | **-3.33** | -3.3 |  |  |  |  | 183 |
| crossing-check{"k":2,"q":6}/whole | smooth-crossing/shared | neither | **-3.32** | -3.3 |  |  |  |  | 188 |
| crossing-check{"k":1,"q":2}/whole | whole-area/gcd-x | neither | **-3.31** | -3.3 |  |  |  |  | 260 |
| crossing-check{"k":2,"q":4}/size | prime-staircase{"ends":9}/shared-factor | one | **-3.30** | -3.3 |  |  |  |  | 471 |
| crossing-check{"k":1,"q":2}/whole | divisibility-ladder/next-rung | one | **-3.30** | -3.3 |  |  |  |  | 247 |
| ruler{"ends":7}/shared-factor | steady-gradient/divisors | one | **-3.30** | -2.7 | -3.9 |  |  |  | 1611 |
| crossing-check{"k":2,"q":4}/whole | prime-staircase{"ends":9}/shared-factor | one | **-3.29** | -3.3 |  |  |  |  | 471 |
| near-point/lattice | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-3.29** | -3.3 |  |  |  |  | 336 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-3.28** | -3.3 |  |  |  |  | 429 |
| crossing-check{"k":3,"q":6}/whole | prime-landing{"ends":1}/shared-factor | one | **-3.28** | -3.3 |  |  |  |  | 339 |
| crossing-check{"k":1,"q":2}/size | whole-area/gcd-x | neither | **-3.27** | -3.3 |  |  |  |  | 260 |
| crossing-check{"k":3,"q":6}/size | prime-landing{"ends":1}/shared-factor | one | **-3.27** | -3.3 |  |  |  |  | 335 |
| crossing-check{"k":1,"q":6}/whole | prime-staircase{"ends":9}/shared-factor | one | **-3.27** | -3.3 |  |  |  |  | 521 |
| triangle-area{"A":12}/even | whole-intercept/omega | neither | **-3.26** | -2.1 | -4.4 |  |  |  | 1189 |
| crossing-check{"k":1,"q":6}/whole | prime-staircase{"ends":9}/step-back | one | **-3.26** | -3.3 |  |  |  |  | 521 |
| crossing-check{"k":1,"q":4}/whole | whole-at-t/gcd-c | neither | **-3.25** | -3.3 |  |  |  |  | 241 |
| pell-gradient{"D":5,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **-3.24** | -3.2 |  |  |  |  | 541 |
| pell-gradient{"D":5,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **-3.24** | -3.2 |  |  |  |  | 541 |
| crossing-check{"k":1,"q":4}/size | whole-crossing{"q":5,"r":2}/shared-factor | one | **-3.22** | -3.2 |  |  |  |  | 162 |
| prime-gradient{"ends":9}/shared-factor | whole-crossing{"q":5,"r":1}/shared-factor | both | **-3.21** | -2.9 | -3.5 |  |  |  | 491 |
| m-meets-c/size | prime-staircase{"ends":7}/step-back | one | **-3.21** | -4.9 | -1.5 |  |  |  | 122 |
| crossing-check{"k":2,"q":2}/whole | prime-slope/square-sum | neither | **-3.21** | -3.2 |  |  |  |  | 73 |
| triangle-area{"A":12}/legs | whole-intercept/omega | neither | **-3.20** | -2.0 | -4.4 |  |  |  | 1189 |
| farey-neighbours/mediant-x | prime-staircase{"ends":1}/step-back | one | **-3.20** | -4.1 | -2.3 |  |  |  | 203 |
| crossing-check{"k":2,"q":2}/size | prime-slope/square-sum | neither | **-3.20** | -3.2 |  |  |  |  | 74 |
| crossing-check{"k":1,"q":4}/whole | whole-crossing{"q":5,"r":2}/shared-factor | one | **-3.19** | -3.2 |  |  |  |  | 146 |
| prime-gradient{"ends":1}/shared-factor | treasure{"k":4,"side":-1}/shared-factor | both | **-3.18** | -3.9 | -2.5 |  |  |  | 361 |
| m-meets-c/meetPrime | prime-staircase{"ends":7}/shared-factor | one | **-3.17** | -3.8 | -2.5 |  |  |  | 121 |
| triangle-area{"A":4}/even | whole-intercept/omega | neither | **-3.17** | -3.2 |  |  |  |  | 728 |
| farey-neighbours/mediant-x | triangle-area{"A":12}/even | neither | **-3.17** | -3.9 | -2.4 |  |  |  | 297 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":1}/shared-factor | both | **-3.16** | -2.9 | -3.4 |  |  |  | 525 |
| triangle-area{"A":4}/legs | whole-intercept/omega | neither | **-3.14** | -3.1 |  |  |  |  | 749 |
| smooth-intercept{"primes":[3,17]}/shared-factor | whole-intercept/spf | one | **-3.12** | -3.1 |  |  |  |  | 391 |
| crossing-check{"k":3,"q":2}/whole | treasure{"k":4,"side":-1}/shared-factor | one | **-3.12** | -3.1 |  |  |  |  | 249 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1}/shared-factor | one | **-3.12** | -3.5 | -2.7 |  |  |  | 359 |
| m-meets-c/meetPrime | whole-at-t/gcd-c | neither | **-3.12** | -3.1 |  |  |  |  | 308 |
| crossing-check{"k":1,"q":2}/size | whole-crossing{"q":5,"r":2}/shared-factor | one | **-3.12** | -3.1 |  |  |  |  | 186 |
| farey-neighbours/mediant-x | triangle-area{"A":12}/legs | neither | **-3.11** | -3.8 | -2.4 |  |  |  | 297 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1}/shared-factor | one | **-3.10** | -3.5 | -2.7 |  |  |  | 359 |
| divisibility-ladder/next-rung | farey-neighbours/mediant-x | one | **-3.10** | -3.1 |  |  |  |  | 260 |
| sunken-intercept/shared | treasure{"k":3}/shared-factor | one | **-3.10** | -2.7 | -3.5 |  |  |  | 876 |
| prime-gradient{"ends":9}/shared-factor | whole-crossing{"q":5,"r":4}/shared-factor | both | **-3.09** | -2.9 | -3.3 |  |  |  | 528 |
| triangle-area{"A":18}/even | whole-intercept/omega | neither | **-3.09** | -1.6 | -4.6 |  |  |  | 1528 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1}/shared-factor | one | **-3.09** | -3.5 | -2.7 |  |  |  | 382 |
| crossing-check{"k":1,"q":6}/whole | whole-at-t/gcd-c | neither | **-3.08** | -3.1 |  |  |  |  | 329 |
| triangle-area{"A":18}/legs | whole-intercept/omega | neither | **-3.08** | -1.6 | -4.5 |  |  |  | 1516 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1}/shared-factor | one | **-3.08** | -3.5 | -2.7 |  |  |  | 382 |
| euclid-steps/largest-quotient | smooth-crossing/shared | neither | **-3.07** | -3.1 |  |  |  |  | 486 |
| crossing-check{"k":1,"q":6}/size | prime-landing{"ends":1}/shared-factor | one | **-3.07** | -3.5 | -2.6 |  |  |  | 294 |
| crossing-check{"k":1,"q":6}/size | whole-at-t/gcd-c | neither | **-3.07** | -3.1 |  |  |  |  | 324 |
| near-point/lattice | treasure{"k":4,"side":-1}/shared-factor | one | **-3.06** | -3.1 |  |  |  |  | 339 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":4}/shared-factor | both | **-3.06** | -2.9 | -3.2 |  |  |  | 508 |
| near-point/gcd-x | treasure{"k":4,"side":-1}/shared-factor | one | **-3.04** | -3.0 |  |  |  |  | 338 |
| sunken-intercept/shared | treasure{"k":4}/shared-factor | one | **-3.03** | -2.5 | -3.5 |  |  |  | 870 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-3.01** | -3.0 |  |  |  |  | 462 |
| exact-change/big-piles | steady-gradient/divisors | neither | **-2.99** | -2.1 | -3.9 |  |  |  | 1663 |
| sunken-intercept/shared | triangle-area{"A":8}/even | neither | **-2.99** | -1.0 | -4.9 |  |  |  | 3782 |
| farey-neighbours/mediant-x | prime-slope/twins | neither | **-2.99** | -3.0 |  |  |  |  | 95 |
| sunken-intercept/shared | triangle-area{"A":8}/legs | neither | **-2.98** | -1.0 | -4.9 |  |  |  | 3729 |
| long-division/m-bottom-spf | whole-intercept/gcd-den-m | neither | **-2.95** | -3.0 |  |  |  |  | 852 |
| long-division/c-period | whole-intercept/gcd-den-m | neither | **-2.95** | -3.0 |  |  |  |  | 852 |
| ruler{"ends":9}/shared-factor | same-on-both-rulers{"d":2,"side":-1}/shared-factor | both | **-2.95** | -2.7 | -3.1 |  |  |  | 585 |
| crossing-check{"k":1,"q":6}/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.95** | -2.9 |  |  |  |  | 499 |
| farey-neighbours/mediant-x | prime-staircase{"ends":1}/shared-factor | one | **-2.93** | -4.0 | -1.9 |  |  |  | 203 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1}/shared-factor | one | **-2.91** | -3.4 | -2.4 |  |  |  | 377 |
| m-meets-c/size | whole-at-t/gcd-c | neither | **-2.90** | -3.1 | -2.7 |  |  |  | 308 |
| crossing-check{"k":1,"q":6}/whole | prime-landing{"ends":1}/shared-factor | one | **-2.90** | -3.4 | -2.4 |  |  |  | 325 |
| prime-staircase{"ends":3}/shared-factor | whole-area/gcd-x | one | **-2.89** | -2.9 |  |  |  |  | 429 |
| prime-staircase{"ends":3,"side":-1}/shared-factor | whole-area/gcd-x | neither | **-2.89** | -2.9 |  |  |  |  | 429 |
| near-point/lattice | prime-staircase{"ends":1}/step-back | one | **-2.89** | -2.6 | -3.1 |  |  |  | 525 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.89** | -2.9 |  |  |  |  | 515 |
| near-point/gcd-x | prime-staircase{"ends":1}/step-back | one | **-2.89** | -2.6 | -3.1 |  |  |  | 521 |
| long-division/m-bottom-spf | whole-area/gcd-x | neither | **-2.88** | -2.0 | -3.7 |  |  |  | 1228 |
| farey-neighbours/mediant-x | pythagorean-area{"ends":7}/shared-factor | one | **-2.88** | -4.4 | -1.4 |  |  |  | 185 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1}/shared-factor | one | **-2.88** | -3.4 | -2.4 |  |  |  | 368 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **-2.87** | -2.9 |  |  |  |  | 586 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1}/shared-factor | one | **-2.87** | -2.6 | -3.2 |  |  |  | 628 |
| prime-staircase{"ends":3}/step-back | whole-area/gcd-x | one | **-2.87** | -2.9 |  |  |  |  | 533 |
| prime-staircase{"ends":3,"side":-1}/step-back | whole-area/gcd-x | neither | **-2.87** | -2.9 |  |  |  |  | 533 |
| near-point/lattice | prime-staircase{"ends":1}/shared-factor | one | **-2.86** | -3.0 | -2.7 |  |  |  | 412 |
| prime-gradient{"ends":9}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **-2.86** | -3.0 | -2.8 |  |  |  | 435 |
| near-point/gcd-x | prime-staircase{"ends":1}/shared-factor | one | **-2.86** | -3.0 | -2.7 |  |  |  | 408 |
| same-on-both-rulers{"d":1}/shared-factor | steady-gradient/divisors | one | **-2.85** | -1.3 | -4.4 |  |  |  | 2914 |
| m-meets-c/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.85** | -4.0 | -1.7 |  |  |  | 210 |
| m-meets-c/meetPrime | prime-gradient{"ends":1}/shared-factor | one | **-2.85** | -4.0 | -1.7 |  |  |  | 219 |
| farey-neighbours/mediant-x | steady-gradient/gcd-c | neither | **-2.84** | -2.8 |  |  |  |  | 459 |
| long-division/m-top | smooth-intercept{"primes":[3,7]}/shared-factor | one | **-2.84** | -2.8 |  |  |  |  | 730 |
| long-division/m-bottom-spf | smooth-intercept{"primes":[3,7]}/shared-factor | one | **-2.84** | -2.8 |  |  |  |  | 730 |
| long-division/c-period | smooth-intercept{"primes":[3,7]}/shared-factor | one | **-2.84** | -2.8 |  |  |  |  | 730 |
| ruler{"ends":9}/shared-factor | same-on-both-rulers{"d":2}/shared-factor | both | **-2.82** | -2.6 | -3.0 |  |  |  | 633 |
| egyptian-line/bottom | euclid-steps/largest-quotient | neither | **-2.82** | -2.8 |  |  |  |  | 148 |
| m-meets-c/size | prime-gradient{"ends":1}/shared-factor | one | **-2.82** | -4.0 | -1.7 |  |  |  | 219 |
| same-on-both-rulers{"d":1,"side":-1}/shared-factor | steady-gradient/divisors | one | **-2.81** | -1.3 | -4.4 |  |  |  | 2926 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **-2.81** | -2.8 |  |  |  |  | 239 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":6,"k":0}/difference | neither | **-2.81** | -2.8 |  |  |  |  | 239 |
| long-division/m-bottom-spf | smooth-crossing/shared | neither | **-2.79** | -2.8 |  |  |  |  | 682 |
| long-division/c-period | smooth-crossing/shared | neither | **-2.79** | -2.8 |  |  |  |  | 682 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":6,"k":0}/share-den | neither | **-2.79** | -2.8 |  |  |  |  | 247 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":6,"k":0}/difference | neither | **-2.79** | -2.8 |  |  |  |  | 247 |
| crossing-check{"k":1,"q":4}/size | divisibility-ladder/next-rung | one | **-2.78** | -2.8 |  |  |  |  | 351 |
| long-division/c-period | whole-intercept/omega | neither | **-2.78** | -2.8 |  |  |  |  | 1253 |
| farey-neighbours/mediant-x | whole-intercept/gcd-floor-m | neither | **-2.78** | -3.3 | -2.3 |  |  |  | 329 |
| crossing-check{"k":2,"q":4}/size | prime-staircase{"ends":9}/step-back | one | **-2.78** | -3.3 | -2.3 |  |  |  | 471 |
| long-division/m-bottom-spf | whole-intercept/spf | neither | **-2.78** | -2.8 |  |  |  |  | 543 |
| long-division/c-period | whole-intercept/spf | neither | **-2.78** | -2.8 |  |  |  |  | 543 |
| crossing-check{"k":1,"q":4}/size | ruler{"ends":9}/shared-factor | one | **-2.77** | -2.8 |  |  |  |  | 536 |
| m-meets-c/meetPrime | triangle-area{"A":6}/legs | neither | **-2.77** | -2.8 |  |  |  |  | 485 |
| crossing-check{"k":3,"q":6}/size | prime-staircase{"ends":9}/step-back | one | **-2.77** | -2.2 | -3.4 |  |  |  | 894 |
| m-meets-c/meetPrime | triangle-area{"A":6}/even | neither | **-2.77** | -2.8 |  |  |  |  | 495 |
| prime-staircase{"ends":1}/shared-factor | smooth-intercept{"primes":[3,17]}/shared-factor | both | **-2.77** | -2.8 |  |  |  |  | 830 |
| m-meets-c/meetPrime | treasure{"k":3,"side":-1}/shared-factor | one | **-2.76** | -2.8 |  |  |  |  | 404 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1}/shared-factor | one | **-2.76** | -2.5 | -3.0 |  |  |  | 659 |
| crossing-check{"k":2,"q":4}/whole | prime-staircase{"ends":9}/step-back | one | **-2.76** | -3.3 | -2.2 |  |  |  | 471 |
| crossing-check{"k":3,"q":4}/size | steady-gradient/gcd-c | neither | **-2.76** | -2.8 |  |  |  |  | 356 |
| crossing-check{"k":3,"q":2}/whole | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.76** | -2.8 |  |  |  |  | 246 |
| m-meets-c/meetPrime | whole-intercept/spf | neither | **-2.75** | -2.8 |  |  |  |  | 246 |
| crossing-check{"k":3,"q":2}/size | whole-at-t/gcd-den-m | neither | **-2.75** | -2.7 |  |  |  |  | 74 |
| ruler{"ends":3}/shared-factor | steady-gradient/divisors | one | **-2.74** | -2.1 | -3.4 |  |  |  | 1928 |
| prime-gradient{"ends":9}/shared-factor | whole-area/gcd-x | one | **-2.72** | -3.0 | -3.4 | -1.8 |  |  | 1169 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1}/shared-factor | one | **-2.71** | -2.7 |  |  |  |  | 543 |
| crossing-check{"k":1,"q":4}/whole | square-area/spf | one | **-2.71** | -2.7 |  |  |  |  | 414 |
| smooth-intercept{"primes":[3,7]}/shared-factor | whole-at-t/gcd-den-m | one | **-2.70** | -2.7 |  |  |  |  | 96 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.70** | -2.7 |  |  |  |  | 579 |
| exact-change/big-bill | steady-gradient/divisors | neither | **-2.70** | -0.0 | -3.8 | -4.3 |  |  | 7222 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | whole-area/gcd-x | one | **-2.68** | -2.3 | -2.1 | -3.6 |  |  | 1521 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **-2.68** | -2.8 | -2.6 |  |  |  | 493 |
| prime-gradient{"ends":9}/shared-factor | smooth-crossing/shared | one | **-2.67** | -3.0 | -3.3 | -1.6 |  |  | 837 |
| prime-gradient{"ends":1}/shared-factor | whole-area/gcd-x | one | **-2.67** | -2.2 | -2.2 | -3.6 |  |  | 1608 |
| crossing-check{"k":2,"q":6}/size | prime-staircase{"ends":9}/shared-factor | one | **-2.67** | -2.7 |  |  |  |  | 708 |
| crossing-check{"k":1,"q":4}/whole | square-area/lpf | one | **-2.67** | -2.7 |  |  |  |  | 436 |
| crossing-check{"k":1,"q":2}/whole | whole-crossing{"q":5,"r":3}/shared-factor | one | **-2.67** | -3.3 | -2.1 |  |  |  | 172 |
| crossing-check{"k":1,"q":4}/size | whole-area/gcd-x | neither | **-2.66** | -2.7 |  |  |  |  | 439 |
| euclid-steps/largest-quotient | whole-area/gcd-x | neither | **-2.66** | -2.3 | -2.8 | -2.8 |  |  | 919 |
| crossing-check{"k":3,"q":2}/size | steady-gradient/gcd-c | neither | **-2.66** | -2.7 |  |  |  |  | 417 |
| crossing-check{"k":1,"q":4}/whole | square-area/omega | neither | **-2.65** | -2.7 |  |  |  |  | 443 |
| crossing-check{"k":2,"q":6}/whole | prime-staircase{"ends":9}/shared-factor | one | **-2.65** | -2.7 |  |  |  |  | 707 |
| crossing-check{"k":2,"q":4}/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.65** | -2.7 |  |  |  |  | 469 |
| crossing-check{"k":3,"q":2}/whole | prime-staircase{"ends":9}/shared-factor | one | **-2.65** | -2.7 |  |  |  |  | 354 |
| crossing-check{"k":1,"q":6}/whole | divisibility-ladder/next-rung | one | **-2.65** | -2.7 |  |  |  |  | 408 |
| m-meets-c/size | prime-staircase{"ends":7}/shared-factor | one | **-2.65** | -3.8 | -1.5 |  |  |  | 122 |
| pell-gradient{"D":7,"k":0}/share-den | whole-at-t/gcd-c | neither | **-2.65** | -2.6 |  |  |  |  | 602 |
| crossing-check{"k":2,"q":4}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.64** | -2.6 |  |  |  |  | 469 |
| euclid-steps/largest-quotient | smooth-intercept{"primes":[3,7]}/shared-factor | one | **-2.64** | -2.1 | -3.2 |  |  |  | 771 |
| crossing-check{"k":3,"q":2}/whole | prime-staircase{"ends":9}/step-back | one | **-2.64** | -2.6 |  |  |  |  | 354 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-crossing{"q":5,"r":3}/shared-factor | both | **-2.64** | -2.9 | -2.4 |  |  |  | 456 |
| crossing-check{"k":1,"q":4}/whole | ruler{"ends":9}/shared-factor | one | **-2.64** | -2.6 |  |  |  |  | 528 |
| crossing-check{"k":1,"q":4}/whole | divisibility-ladder/next-rung | one | **-2.63** | -2.6 |  |  |  |  | 351 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-2.62** | -2.6 |  |  |  |  | 599 |
| crossing-check{"k":1,"q":6}/size | divisibility-ladder/next-rung | one | **-2.62** | -2.6 |  |  |  |  | 404 |
| crossing-check{"k":1,"q":4}/whole | smooth-square/shared | neither | **-2.62** | -2.6 |  |  |  |  | 473 |
| crossing-check{"k":1,"q":2}/size | whole-crossing{"q":5,"r":3}/shared-factor | one | **-2.61** | -3.2 | -2.0 |  |  |  | 172 |
| crossing-check{"k":3,"q":4}/size | whole-intercept/gcd-floor-m | neither | **-2.61** | -2.6 |  |  |  |  | 407 |
| crossing-check{"k":3,"q":2}/whole | whole-intercept/spf | neither | **-2.61** | -2.2 | -3.0 |  |  |  | 262 |
| pell-gradient{"D":7,"k":0}/difference | whole-at-t/gcd-c | neither | **-2.60** | -2.6 |  |  |  |  | 599 |
| triangle-area{"A":6}/even | whole-area/gcd-x | neither | **-2.59** | -2.6 |  |  |  |  | 433 |
| m-meets-c/meetPrime | pythagorean-area{"ends":3}/shared-factor | one | **-2.58** | -2.8 | -2.4 |  |  |  | 407 |
| crossing-check{"k":3,"q":2}/size | whole-intercept/gcd-floor-m | neither | **-2.58** | -2.6 |  |  |  |  | 449 |
| triangle-area{"A":6}/legs | whole-area/gcd-x | neither | **-2.57** | -2.6 |  |  |  |  | 433 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | whole-area/gcd-x | one | **-2.57** | -3.0 | -3.3 | -1.4 |  |  | 1244 |
| crossing-check{"k":3,"q":4}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.57** | -2.6 |  |  |  |  | 210 |
| crossing-check{"k":1,"q":6}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.57** | -2.6 |  |  |  |  | 615 |
| crossing-check{"k":1,"q":4}/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.56** | -2.6 |  |  |  |  | 505 |
| crossing-check{"k":2,"q":6}/size | prime-staircase{"ends":9}/step-back | one | **-2.56** | -2.7 | -2.5 |  |  |  | 708 |
| euclid-steps/largest-quotient | whole-intercept/omega | neither | **-2.56** | -2.1 | -2.7 | -2.9 |  |  | 1314 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1}/shared-factor | one | **-2.56** | -2.6 |  |  |  |  | 543 |
| m-meets-c/meetPrime | treasure{"k":3}/shared-factor | one | **-2.56** | -2.6 | -2.5 |  |  |  | 448 |
| sunken-intercept/shared | triangle-area{"A":12}/even | neither | **-2.55** | -0.7 | -4.4 |  |  |  | 4294 |
| crossing-check{"k":2,"q":6}/whole | prime-staircase{"ends":9}/step-back | one | **-2.55** | -2.6 | -2.5 |  |  |  | 707 |
| prime-gradient{"ends":9}/shared-factor | whole-crossing{"q":5,"r":2}/shared-factor | both | **-2.55** | -2.8 | -2.3 |  |  |  | 481 |
| crossing-check{"k":2,"q":4}/size | ruler{"ends":9}/shared-factor | one | **-2.55** | -2.1 | -3.0 |  |  |  | 768 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.55** | -2.5 |  |  |  |  | 579 |
| long-division/m-top | whole-intercept/spf | neither | **-2.54** | -2.8 | -2.3 |  |  |  | 543 |
| same-on-both-rulers{"d":2}/shared-factor | steady-gradient/divisors | one | **-2.53** | -1.8 | -3.2 |  |  |  | 2299 |
| long-division/m-top | whole-intercept/omega | neither | **-2.53** | -2.8 | -2.3 |  |  |  | 1253 |
| m-meets-c/size | triangle-area{"A":8}/even | neither | **-2.52** | -3.4 | -1.7 |  |  |  | 349 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1}/shared-factor | one | **-2.51** | -3.0 | -2.0 |  |  |  | 386 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | treasure{"k":3}/shared-factor | both | **-2.51** | -3.2 | -1.8 |  |  |  | 558 |
| m-meets-c/size | triangle-area{"A":8}/legs | neither | **-2.51** | -3.3 | -1.7 |  |  |  | 348 |
| crossing-check{"k":1,"q":4}/whole | whole-area/gcd-x | neither | **-2.51** | -2.5 |  |  |  |  | 439 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | smooth-crossing/shared | one | **-2.51** | -2.4 | -2.6 |  |  |  | 490 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | smooth-crossing/shared | one | **-2.50** | -2.9 | -3.1 | -1.5 |  |  | 894 |
| prime-gradient{"ends":1}/shared-factor | treasure{"k":3,"side":-1}/shared-factor | both | **-2.49** | -3.2 | -1.8 |  |  |  | 589 |
| crossing-check{"k":3,"q":4}/whole | prime-staircase{"ends":9}/shared-factor | one | **-2.49** | -2.5 |  |  |  |  | 305 |
| sunken-intercept/shared | triangle-area{"A":12}/legs | neither | **-2.49** | -0.6 | -4.4 |  |  |  | 4294 |
| crossing-check{"k":1,"q":6}/size | whole-area/gcd-x | neither | **-2.48** | -2.5 |  |  |  |  | 486 |
| crossing-check{"k":3,"q":4}/whole | prime-staircase{"ends":9}/step-back | one | **-2.48** | -2.5 |  |  |  |  | 305 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | steady-gradient/divisors | one | **-2.48** | -1.8 | -3.1 |  |  |  | 2346 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"k":3,"side":-1}/shared-factor | one | **-2.47** | -1.0 | -3.9 |  |  |  | 1423 |
| crossing-check{"k":3,"q":2}/whole | prime-staircase{"ends":7}/step-back | one | **-2.47** | -1.4 | -3.6 |  |  |  | 680 |
| euclid-steps/largest-quotient | whole-intercept/spf | neither | **-2.47** | -2.2 | -2.8 |  |  |  | 546 |
| long-division/m-bottom-spf | steep-and-tall/shared | neither | **-2.46** | -1.8 | -3.1 |  |  |  | 2963 |
| pell-gradient{"D":6,"k":0}/pell-c | smooth-crossing/shared | neither | **-2.46** | -3.2 | -1.7 |  |  |  | 609 |
| crossing-check{"k":3,"q":6}/whole | smooth-gradient/shared | neither | **-2.46** | -2.5 |  |  |  |  | 257 |
| crossing-check{"k":2,"q":4}/whole | ruler{"ends":9}/shared-factor | one | **-2.45** | -1.9 | -3.0 |  |  |  | 836 |
| crossing-check{"k":2,"q":2}/whole | euclid-steps/largest-quotient | neither | **-2.44** | -2.4 |  |  |  |  | 439 |
| crossing-check{"k":2,"q":2}/whole | long-division/m-top | neither | **-2.44** | -2.4 |  |  |  |  | 663 |
| crossing-check{"k":2,"q":2}/whole | long-division/m-bottom-spf | neither | **-2.44** | -2.4 |  |  |  |  | 663 |
| crossing-check{"k":2,"q":2}/whole | long-division/c-period | neither | **-2.44** | -2.4 |  |  |  |  | 663 |
| crossing-check{"k":3,"q":6}/size | smooth-gradient/shared | neither | **-2.44** | -2.4 |  |  |  |  | 257 |
| crossing-check{"k":2,"q":6}/whole | ruler{"ends":9}/shared-factor | one | **-2.44** | -1.8 | -3.0 |  |  |  | 926 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.44** | -2.4 |  |  |  |  | 697 |
| crossing-check{"k":1,"q":4}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.41** | -2.4 |  |  |  |  | 505 |
| target-gradient/same-den | treasure{"k":4,"side":-1}/shared-factor | one | **-2.40** | -1.7 | -3.1 |  |  |  | 980 |
| crossing-check{"k":1,"q":4}/whole | prime-landing{"ends":1}/shared-factor | one | **-2.39** | -2.4 |  |  |  |  | 475 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **-2.39** | -2.4 |  |  |  |  | 535 |
| prime-slope/square-sum | whole-at-t/gcd-c | neither | **-2.39** | -2.4 | -2.3 |  |  |  | 143 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":7,"k":0}/share-den | neither | **-2.38** | -2.4 |  |  |  |  | 541 |
| crossing-check{"k":2,"q":2}/size | euclid-steps/largest-quotient | neither | **-2.38** | -2.4 |  |  |  |  | 468 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.38** | -2.4 |  |  |  |  | 734 |
| crossing-check{"k":3,"q":2}/whole | prime-staircase{"ends":7}/shared-factor | one | **-2.38** | -1.2 | -3.6 |  |  |  | 440 |
| crossing-check{"k":2,"q":2}/size | long-division/m-top | neither | **-2.38** | -2.4 |  |  |  |  | 703 |
| crossing-check{"k":2,"q":2}/size | long-division/m-bottom-spf | neither | **-2.38** | -2.4 |  |  |  |  | 703 |
| crossing-check{"k":2,"q":2}/size | long-division/c-period | neither | **-2.38** | -2.4 |  |  |  |  | 703 |
| divisibility-ladder/next-rung | near-point/lattice | one | **-2.38** | -2.4 |  |  |  |  | 435 |
| prime-staircase{"ends":7}/shared-factor | whole-area/gcd-den-m | one | **-2.37** | -2.5 | -2.3 |  |  |  | 179 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **-2.36** | -2.4 |  |  |  |  | 533 |
| crossing-check{"k":3,"q":2}/whole | whole-crossing{"q":5,"r":3}/shared-factor | one | **-2.36** | -2.8 | -1.9 |  |  |  | 130 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":7,"k":0}/difference | neither | **-2.36** | -2.4 |  |  |  |  | 522 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":7,"k":0}/pell-c | neither | **-2.36** | -2.4 |  |  |  |  | 539 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":7,"k":0}/difference | neither | **-2.36** | -2.4 |  |  |  |  | 527 |
| divisibility-ladder/next-rung | near-point/gcd-x | one | **-2.36** | -2.4 |  |  |  |  | 435 |
| crossing-check{"k":1,"q":6}/whole | whole-area/gcd-x | neither | **-2.36** | -2.4 |  |  |  |  | 550 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-2.35** | -2.3 |  |  |  |  | 354 |
| near-point/lattice | prime-staircase{"ends":7}/step-back | one | **-2.34** | -2.0 | -2.7 |  |  |  | 695 |
| pell-gradient{"D":7,"k":0}/share-den | whole-area/gcd-den-m | neither | **-2.33** | -1.2 | -3.5 |  |  |  | 1368 |
| near-point/gcd-x | prime-staircase{"ends":7}/step-back | one | **-2.33** | -2.0 | -2.7 |  |  |  | 691 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":9}/shared-factor | one | **-2.32** | -2.1 | -2.5 |  |  |  | 740 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"d":2,"side":-1}/shared-factor | one | **-2.32** | -2.3 |  |  |  |  | 459 |
| whole-area/gcd-den-m | whole-intercept/gcd-floor-m | neither | **-2.31** | -1.5 | -3.1 |  |  |  | 1511 |
| prime-slope/square-sum | smooth-crossing/shared | neither | **-2.31** | -2.3 | -2.3 |  |  |  | 244 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"k":4,"side":-1}/shared-factor | one | **-2.31** | -0.7 | -3.9 |  |  |  | 1563 |
| crossing-check{"k":1,"q":4}/size | prime-staircase{"ends":1}/step-back | one | **-2.30** | -2.5 | -2.1 |  |  |  | 724 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-area/gcd-den-m | neither | **-2.30** | -1.2 | -3.4 |  |  |  | 1355 |
| crossing-check{"k":2,"q":6}/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.28** | -2.3 |  |  |  |  | 693 |
| same-on-both-rulers{"d":2}/shared-factor | smooth-crossing/shared | one | **-2.28** | -2.2 | -2.3 |  |  |  | 534 |
| crossing-check{"k":2,"q":6}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.27** | -2.3 |  |  |  |  | 690 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":9}/shared-factor | one | **-2.27** | -2.1 | -2.4 |  |  |  | 729 |
| prime-slope/matching-c | whole-at-t/gcd-den-m | neither | **-2.27** | -2.3 |  |  |  |  | 101 |
| steep-and-tall/shared | whole-area/gcd-den-m | neither | **-2.26** | -1.6 | -2.9 |  |  |  | 1153 |
| crossing-check{"k":1,"q":6}/size | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.26** | -1.5 | -3.0 |  |  |  | 931 |
| near-point/lattice | whole-intercept/gcd-floor-m | neither | **-2.26** | -2.3 |  |  |  |  | 545 |
| farey-neighbours/mediant-x | prime-slope/square-sum | neither | **-2.25** | -2.3 |  |  |  |  | 114 |
| crossing-check{"k":2,"q":6}/size | divisibility-ladder/next-rung | one | **-2.24** | -2.2 |  |  |  |  | 495 |
| near-point/gcd-x | whole-intercept/gcd-floor-m | neither | **-2.24** | -2.2 |  |  |  |  | 545 |
| crossing-check{"k":3,"q":2}/whole | whole-crossing{"q":5,"r":4}/shared-factor | one | **-2.24** | -2.1 | -2.3 |  |  |  | 275 |
| smooth-crossing/shared | whole-intercept/spf | neither | **-2.24** | -2.2 |  |  |  |  | 389 |
| crossing-check{"k":1,"q":4}/size | pythagorean-area{"ends":9}/shared-factor | one | **-2.23** | -2.2 |  |  |  |  | 732 |
| crossing-check{"k":2,"q":6}/whole | divisibility-ladder/next-rung | one | **-2.23** | -2.2 |  |  |  |  | 495 |
| crossing-check{"k":1,"q":4}/size | prime-landing{"ends":1}/shared-factor | one | **-2.22** | -2.2 |  |  |  |  | 585 |
| crossing-check{"k":2,"q":4}/size | pythagorean-area{"ends":9}/shared-factor | one | **-2.21** | -1.7 | -2.7 |  |  |  | 1097 |
| crossing-check{"k":2,"q":4}/whole | prime-landing{"ends":9}/shared-factor | one | **-2.21** | -0.7 | -3.7 |  |  |  | 1866 |
| crossing-check{"k":3,"q":6}/size | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.21** | -2.2 |  |  |  |  | 706 |
| crossing-check{"k":3,"q":6}/whole | prime-landing{"ends":9,"side":-1}/shared-factor | one | **-2.21** | -2.2 |  |  |  |  | 721 |
| crossing-check{"k":2,"q":4}/whole | pythagorean-area{"ends":9}/shared-factor | one | **-2.20** | -1.7 | -2.7 |  |  |  | 1093 |
| crossing-check{"k":1,"q":4}/whole | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.20** | -2.2 |  |  |  |  | 573 |
| pell-gradient{"D":6,"k":0}/share-den | whole-at-t/gcd-c | neither | **-2.20** | -2.2 |  |  |  |  | 429 |
| pell-gradient{"D":6,"k":0}/difference | whole-at-t/gcd-c | neither | **-2.20** | -2.2 |  |  |  |  | 429 |
| crossing-check{"k":1,"q":2}/whole | whole-crossing{"q":5,"r":4}/shared-factor | one | **-2.19** | -2.2 |  |  |  |  | 407 |
| euclid-steps/largest-quotient | steep-and-tall/shared | neither | **-2.19** | -1.0 | -2.4 | -3.1 |  |  | 2529 |
| crossing-check{"k":3,"q":6}/size | prime-staircase{"ends":9}/shared-factor | one | **-2.18** | -2.2 |  |  |  |  | 902 |
| crossing-check{"k":1,"q":4}/size | ruler{"ends":7}/shared-factor | one | **-2.18** | -1.6 | -2.8 |  |  |  | 893 |
| crossing-check{"k":1,"q":6}/whole | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.18** | -1.6 | -2.8 |  |  |  | 943 |
| crossing-check{"k":3,"q":2}/whole | whole-at-t/gcd-den-m | neither | **-2.18** | -2.2 |  |  |  |  | 67 |
| crossing-check{"k":1,"q":4}/whole | prime-staircase{"ends":1}/step-back | one | **-2.18** | -2.4 | -2.0 |  |  |  | 700 |
| crossing-check{"k":1,"q":4}/whole | ruler{"ends":7}/shared-factor | one | **-2.17** | -1.7 | -2.6 |  |  |  | 760 |
| near-point/lattice | prime-staircase{"ends":7}/shared-factor | one | **-2.17** | -1.7 | -2.7 |  |  |  | 465 |
| near-point/gcd-x | prime-staircase{"ends":7}/shared-factor | one | **-2.17** | -1.7 | -2.7 |  |  |  | 460 |
| crossing-check{"k":3,"q":6}/whole | prime-staircase{"ends":9}/step-back | one | **-2.17** | -2.2 |  |  |  |  | 924 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1,"side":-1}/shared-factor | one | **-2.17** | -2.9 | -1.4 |  |  |  | 427 |
| crossing-check{"k":3,"q":6}/whole | prime-staircase{"ends":9}/shared-factor | one | **-2.17** | -2.2 |  |  |  |  | 932 |
| crossing-check{"k":2,"q":4}/size | whole-area/gcd-x | neither | **-2.16** | -2.2 |  |  |  |  | 612 |
| crossing-check{"k":1,"q":2}/size | whole-crossing{"q":5,"r":4}/shared-factor | one | **-2.16** | -2.2 |  |  |  |  | 407 |
| crossing-check{"k":2,"q":6}/size | ruler{"ends":9}/shared-factor | one | **-2.15** | -1.8 | -2.5 |  |  |  | 930 |
| crossing-check{"k":2,"q":4}/whole | whole-area/gcd-x | neither | **-2.15** | -2.1 |  |  |  |  | 612 |
| near-point/lattice | steady-gradient/gcd-c | neither | **-2.14** | -2.1 |  |  |  |  | 596 |
| prime-gradient{"ends":1}/shared-factor | whole-crossing{"q":5,"r":1}/shared-factor | both | **-2.14** | -2.1 | -2.2 |  |  |  | 728 |
| crossing-check{"k":1,"q":4}/size | prime-staircase{"ends":1}/shared-factor | one | **-2.13** | -2.4 | -1.8 |  |  |  | 694 |
| near-point/gcd-x | steady-gradient/gcd-c | neither | **-2.13** | -2.1 |  |  |  |  | 594 |
| m-meets-c/size | whole-intercept/spf | neither | **-2.11** | -2.7 | -1.5 |  |  |  | 249 |
| whole-at-t/gcd-den-m | whole-crossing{"q":5,"r":1}/shared-factor | one | **-2.11** | -1.9 | -2.3 |  |  |  | 101 |
| crossing-check{"k":1,"q":2}/size | ruler{"ends":1}/shared-factor | one | **-2.10** | -1.8 | -2.4 |  |  |  | 851 |
| crossing-check{"k":1,"q":4}/whole | pythagorean-area{"ends":9}/shared-factor | one | **-2.09** | -2.1 |  |  |  |  | 722 |
| crossing-check{"k":3,"q":4}/whole | whole-crossing{"q":5,"r":3}/shared-factor | one | **-2.09** | -1.5 | -2.7 |  |  |  | 253 |
| crossing-check{"k":1,"q":2}/whole | ruler{"ends":1}/shared-factor | one | **-2.09** | -1.8 | -2.4 |  |  |  | 866 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-area/gcd-den-m | neither | **-2.08** | -1.2 | -3.0 |  |  |  | 1355 |
| crossing-check{"k":3,"q":4}/whole | m-meets-c/meetPrime | neither | **-2.08** | -1.8 | -2.3 |  |  |  | 409 |
| prime-staircase{"ends":7}/step-back | smooth-intercept{"primes":[3,17]}/shared-factor | both | **-2.08** | -2.1 |  |  |  |  | 1402 |
| crossing-check{"k":3,"q":6}/whole | ruler{"ends":9}/shared-factor | one | **-2.07** | -1.4 | -2.7 |  |  |  | 1224 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | whole-crossing{"q":5,"r":1}/shared-factor | both | **-2.07** | -2.1 | -2.0 |  |  |  | 738 |
| crossing-check{"k":2,"q":6}/size | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.07** | -1.4 | -2.7 |  |  |  | 1033 |
| crossing-check{"k":1,"q":4}/whole | m-meets-c/meetPrime | neither | **-2.06** | -2.0 | -2.2 |  |  |  | 686 |
| crossing-check{"k":2,"q":6}/whole | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.06** | -1.4 | -2.7 |  |  |  | 1019 |
| farey-neighbours/mediant-x | triangle-area{"A":6}/even | neither | **-2.06** | -1.7 | -2.4 |  |  |  | 938 |
| crossing-check{"k":2,"q":4}/size | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.06** | -2.1 |  |  |  |  | 652 |
| prime-landing{"ends":9}/shared-factor | triangle-area{"A":6}/even | one | **-2.06** | -2.1 |  |  |  |  | 814 |
| euclid-steps/largest-quotient | whole-crossing{"q":5,"r":2}/shared-factor | one | **-2.06** | -2.0 | -2.1 |  |  |  | 556 |
| prime-gradient{"ends":9}/shared-factor | prime-landing{"ends":9}/shared-factor | both | **-2.06** | -2.2 | -2.8 | -1.2 |  |  | 2611 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"k":3}/shared-factor | one | **-2.05** | -0.1 | -4.0 |  |  |  | 2646 |
| farey-neighbours/mediant-x | triangle-area{"A":6}/legs | neither | **-2.05** | -1.7 | -2.4 |  |  |  | 937 |
| crossing-check{"k":2,"q":4}/whole | prime-landing{"ends":1,"side":-1}/shared-factor | one | **-2.05** | -2.0 |  |  |  |  | 652 |
| prime-slope/matching-c | smooth-intercept{"primes":[3,11]}/shared-factor | one | **-2.05** | -2.0 |  |  |  |  | 911 |
| whole-at-t/gcd-c | whole-intercept/gcd-den-m | neither | **-2.05** | -2.0 |  |  |  |  | 1268 |
| prime-landing{"ends":9}/shared-factor | triangle-area{"A":6}/legs | one | **-2.04** | -2.0 |  |  |  |  | 814 |
| long-division/c-period | whole-area/gcd-x | neither | **-2.04** | -2.0 |  |  |  |  | 1228 |
| crossing-check{"k":1,"q":2}/whole | whole-crossing{"q":5,"r":2}/shared-factor | one | **-2.04** | -2.0 |  |  |  |  | 374 |
| crossing-check{"k":1,"q":4}/size | whole-intercept/gcd-floor-m | neither | **-2.04** | -1.3 | -2.7 |  |  |  | 1088 |
| sunken-intercept/shared | triangle-area{"A":18}/even | neither | **-2.03** | -0.2 | -3.9 |  |  |  | 5500 |
| prime-landing{"ends":9,"side":-1}/shared-factor | triangle-area{"A":6}/even | one | **-2.03** | -2.0 |  |  |  |  | 825 |
| crossing-check{"k":1,"q":6}/size | ruler{"ends":9}/shared-factor | one | **-2.03** | -2.2 | -1.8 |  |  |  | 724 |
| crossing-check{"k":1,"q":4}/size | prime-landing{"ends":9}/shared-factor | one | **-2.03** | -1.3 | -2.8 |  |  |  | 1260 |
| sunken-intercept/shared | triangle-area{"A":18}/legs | neither | **-2.02** | -0.2 | -3.9 |  |  |  | 5428 |
| crossing-check{"k":1,"q":2}/whole | pythagorean-area{"ends":9}/shared-factor | one | **-2.02** | -2.4 | -1.6 |  |  |  | 718 |
| near-point/lattice | whole-area/gcd-x | neither | **-2.02** | -2.0 |  |  |  |  | 694 |
| crossing-check{"k":3,"q":2}/whole | prime-landing{"ends":9}/shared-factor | one | **-2.01** | -1.7 | -2.3 |  |  |  | 571 |
| near-point/gcd-x | whole-area/gcd-x | neither | **-2.01** | -2.0 |  |  |  |  | 684 |
| prime-landing{"ends":9,"side":-1}/shared-factor | triangle-area{"A":6}/legs | one | **-2.01** | -2.0 |  |  |  |  | 825 |
| crossing-check{"k":1,"q":6}/size | prime-landing{"ends":9}/shared-factor | one | **-2.01** | -2.0 |  |  |  |  | 818 |
| crossing-check{"k":1,"q":4}/whole | prime-staircase{"ends":1}/shared-factor | one | **-2.00** | -2.3 | -1.7 |  |  |  | 670 |
| triangle-area{"A":8}/even | whole-area/gcd-x | neither | **-2.00** | -2.0 |  |  |  |  | 683 |

### Two tie-breakers of one family (aligned through the shared primary; never seat a family twice)

| Family | pairs | mean headline | min | max |
|---|---:|---:|---:|---:|
| crossing-check | 153 | -0.15 | -6.63 | 7.38 |
| exact-change | 3 | 7.30 | 6.84 | 7.79 |
| farey-neighbours | 1 | 3.21 | 3.21 | 3.21 |
| long-division | 3 | 4.33 | 4.31 | 4.36 |
| m-meets-c | 1 | 5.30 | 5.30 | 5.30 |
| near-point | 1 | 6.00 | 6.00 | 6.00 |
| pell-gradient | 153 | -1.06 | -8.52 | 9.99 |
| prime-gradient | 6 | -3.51 | -6.63 | 2.62 |
| prime-landing | 6 | -3.15 | -6.57 | 3.46 |
| prime-slope | 2 | 3.50 | 3.45 | 3.56 |
| prime-staircase | 45 | -0.97 | -6.58 | 8.45 |
| pythagorean-area | 6 | -1.69 | -6.52 | 1.69 |
| ruler | 6 | -1.51 | -6.31 | 1.62 |
| same-on-both-rulers | 6 | -3.72 | -6.58 | 1.95 |
| smooth-intercept | 6 | 8.05 | 7.94 | 8.15 |
| square-area | 3 | 5.46 | 3.87 | 7.32 |
| steady-gradient | 1 | 4.64 | 4.64 | 4.64 |
| target-gradient | 1 | 6.05 | 6.05 | 6.05 |
| treasure | 6 | -2.50 | -6.58 | 4.79 |
| triangle-area | 45 | 1.34 | -6.66 | 6.09 |
| whole-area | 1 | 4.75 | 4.75 | 4.75 |
| whole-at-t | 1 | -0.06 | -0.06 | -0.06 |
| whole-crossing | 6 | -5.05 | -5.44 | -4.66 |
| whole-intercept | 10 | 0.49 | -4.73 | 4.28 |

### Rules: marginal bits of each upper set (−log2 π(A ≥ t); blank: empty) and effective draws in it

| Rule | dealt | 4 b | 6 b | 8 b | 10 b | 12 b | ESS at 4 b | ESS at 12 b |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| crossing-check{"k":1,"q":2}/size |  | 4.0 | 6.0 | 8.4 | 10.9 |  | 43003 | 0 |
| crossing-check{"k":1,"q":4}/size |  | 4.0 | 6.0 | 9.5 | 10.2 | 11.9 | 41052 | 195 |
| crossing-check{"k":1,"q":6}/size |  | 4.0 | 6.0 | 8.0 | 13.5 | 13.5 | 41555 | 68 |
| crossing-check{"k":2,"q":2}/size |  | 4.0 | 6.0 | 8.0 | 10.1 | 12.1 | 37976 | 655 |
| crossing-check{"k":2,"q":4}/size |  | 4.0 | 6.1 | 7.9 | 11.8 | 12.6 | 42087 | 123 |
| crossing-check{"k":2,"q":6}/size |  | 4.0 | 6.0 | 8.0 | 12.1 | 12.1 | 41955 | 162 |
| crossing-check{"k":3,"q":2}/size |  | 4.1 | 6.0 | 8.0 | 11.7 | 11.7 | 40419 | 214 |
| crossing-check{"k":3,"q":4}/size |  | 4.2 | 6.1 | 8.0 | 13.4 | 13.4 | 37002 | 79 |
| crossing-check{"k":3,"q":6}/size |  | 4.0 | 6.1 | 8.1 | 10.1 | 12.5 | 41713 | 130 |
| crossing-check{"k":1,"q":2}/whole |  | 4.0 | 6.0 | 8.0 |  |  | 44081 | 0 |
| crossing-check{"k":1,"q":4}/whole |  | 4.2 | 6.1 |  |  |  | 37957 | 0 |
| crossing-check{"k":1,"q":6}/whole |  | 4.0 | 6.2 | 8.0 |  |  | 42827 | 0 |
| crossing-check{"k":2,"q":2}/whole |  | 4.0 |  |  |  |  | 37723 | 0 |
| crossing-check{"k":2,"q":4}/whole |  | 4.0 | 6.1 |  |  |  | 41827 | 0 |
| crossing-check{"k":2,"q":6}/whole |  | 4.0 | 6.0 |  |  |  | 41530 | 0 |
| crossing-check{"k":3,"q":2}/whole |  | 4.8 | 6.1 | 8.0 | 9.9 |  | 24670 | 0 |
| crossing-check{"k":3,"q":4}/whole |  | 5.3 | 6.1 | 8.0 | 11.2 |  | 18777 | 0 |
| crossing-check{"k":3,"q":6}/whole |  | 4.0 | 6.2 | 7.9 |  |  | 42413 | 0 |
| divisibility-ladder/next-rung | yes | 4.3 | 7.7 | 11.2 | 11.2 | 12.2 | 47863 | 671 |
| egyptian-line/bottom |  | 4.7 | 8.2 | 8.2 | 10.3 | 13.4 | 21647 | 86 |
| euclid-steps/largest-quotient |  | 4.8 | 8.0 | 8.0 | 11.8 | 11.8 | 38918 | 564 |
| exact-change/big-bill |  | 4.0 | 6.0 | 8.0 | 10.1 | 11.9 | 49221 | 641 |
| exact-change/big-piles |  | 4.3 | 6.7 | 8.4 | 13.3 | 13.3 | 37155 | 155 |
| exact-change/prime-coins |  | 4.0 | 6.2 | 8.2 | 11.7 |  | 42603 | 0 |
| farey-neighbours/bottoms |  | 10.2 | 10.2 | 10.2 | 10.2 |  | 664 | 0 |
| farey-neighbours/mediant-x |  | 4.1 | 6.7 | 8.7 | 10.5 | 13.2 | 32313 | 100 |
| long-division/c-period |  | 4.3 |  |  |  |  | 51472 | 0 |
| long-division/m-bottom-spf |  | 4.3 | 7.8 |  |  |  | 51472 | 0 |
| long-division/m-top |  | 4.3 | 6.5 |  |  |  | 51472 | 0 |
| m-meets-c/meetPrime |  | 4.0 | 6.0 | 8.6 |  |  | 37604 | 0 |
| m-meets-c/size |  | 4.0 | 6.1 | 8.3 | 10.1 | 12.3 | 37449 | 236 |
| near-point/gcd-x |  | 4.0 | 6.0 | 8.0 | 12.5 | 12.5 | 39717 | 150 |
| near-point/lattice |  | 4.0 | 6.0 | 8.0 | 10.1 |  | 40364 | 0 |
| pell-gradient{"D":1,"k":1}/difference |  | 4.0 | 7.3 | 10.5 | 10.5 | 13.5 | 41806 | 142 |
| pell-gradient{"D":2,"k":0}/difference |  | 4.1 | 6.3 | 8.4 | 15.6 | 15.6 | 44969 | 66 |
| pell-gradient{"D":3,"k":0}/difference |  | 4.7 | 6.0 | 8.2 | 10.2 | 16.9 | 29538 | 42 |
| pell-gradient{"D":5,"k":0}/difference |  | 4.1 | 6.5 | 8.1 | 12.4 | 12.4 | 40082 | 262 |
| pell-gradient{"D":6,"k":0}/difference |  | 5.1 | 6.3 | 9.1 | 12.2 | 12.2 | 24908 | 413 |
| pell-gradient{"D":7,"k":0}/difference |  | 4.0 | 7.2 | 12.3 | 12.3 | 12.3 | 45577 | 275 |
| pell-gradient{"D":1,"k":1}/pell-c |  | 4.0 | 6.0 | 7.9 | 10.5 | 11.8 | 42357 | 263 |
| pell-gradient{"D":2,"k":0}/pell-c |  | 4.1 | 6.3 | 8.1 | 10.3 | 15.6 | 44969 | 66 |
| pell-gradient{"D":3,"k":0}/pell-c |  | 4.1 | 6.0 | 8.0 | 10.2 | 12.1 | 40330 | 217 |
| pell-gradient{"D":5,"k":0}/pell-c |  | 4.1 | 6.5 | 8.0 | 10.3 | 12.4 | 41205 | 262 |
| pell-gradient{"D":6,"k":0}/pell-c |  | 4.0 | 6.0 | 8.1 | 10.0 | 12.0 | 42296 | 428 |
| pell-gradient{"D":7,"k":0}/pell-c |  | 4.0 | 6.0 | 8.0 | 10.0 | 12.3 | 46561 | 275 |
| pell-gradient{"D":1,"k":1}/share-den |  | 4.0 | 7.3 | 10.5 | 10.5 | 13.5 | 41806 | 142 |
| pell-gradient{"D":2,"k":0}/share-den |  | 4.1 | 6.3 | 8.4 | 15.6 | 15.6 | 44969 | 66 |
| pell-gradient{"D":3,"k":0}/share-den |  | 4.7 | 6.0 | 8.2 | 10.2 | 16.9 | 29538 | 42 |
| pell-gradient{"D":5,"k":0}/share-den |  | 4.1 | 6.5 | 8.1 | 12.4 | 12.4 | 40082 | 262 |
| pell-gradient{"D":6,"k":0}/share-den |  | 5.1 | 6.0 | 9.1 | 12.2 | 12.2 | 24908 | 413 |
| pell-gradient{"D":7,"k":0}/share-den |  | 4.0 | 6.0 | 12.3 | 12.3 | 12.3 | 47816 | 275 |
| prime-gradient{"ends":1,"side":-1}/shared-factor | yes | 4.0 | 6.1 | 8.4 | 10.0 | 12.0 | 62635 | 725 |
| prime-gradient{"ends":1}/shared-factor | yes | 4.0 | 6.1 | 8.4 | 10.0 | 11.9 | 62822 | 743 |
| prime-gradient{"ends":9,"side":-1}/shared-factor | yes | 4.0 | 6.0 | 8.2 | 10.2 | 12.1 | 67045 | 674 |
| prime-gradient{"ends":9}/shared-factor | yes | 4.0 | 6.0 | 8.2 | 10.2 | 12.2 | 67037 | 625 |
| prime-landing{"ends":1,"side":-1}/shared-factor | yes | 4.1 | 6.0 | 8.0 | 10.3 | 11.9 | 52552 | 547 |
| prime-landing{"ends":1}/shared-factor | yes | 4.1 | 6.0 | 8.0 | 10.3 | 11.9 | 52598 | 601 |
| prime-landing{"ends":9,"side":-1}/shared-factor | yes | 4.0 | 6.1 | 8.1 | 9.9 | 12.0 | 60008 | 669 |
| prime-landing{"ends":9}/shared-factor | yes | 4.0 | 6.1 | 8.1 | 9.9 | 12.0 | 60363 | 656 |
| prime-slope/matching-c |  | 4.2 |  |  |  |  | 39580 | 0 |
| prime-slope/square-sum |  | 6.5 | 6.5 |  |  |  | 9580 | 0 |
| prime-slope/twins |  | 5.9 |  |  |  |  | 13118 | 0 |
| prime-staircase{"ends":1}/shared-factor | yes | 4.2 | 6.5 | 8.4 | 10.0 | 12.4 | 58007 | 164 |
| prime-staircase{"ends":3,"side":-1}/shared-factor |  | 4.3 | 6.0 | 8.2 | 11.8 | 12.0 | 40389 | 192 |
| prime-staircase{"ends":3}/shared-factor | yes | 4.3 | 6.0 | 8.2 | 11.8 | 12.0 | 40389 | 192 |
| prime-staircase{"ends":7}/shared-factor | yes | 5.2 | 6.0 | 8.0 | 10.3 | 13.8 | 27212 | 81 |
| prime-staircase{"ends":9}/shared-factor | yes | 4.0 | 8.2 | 8.2 | 10.4 | 12.3 | 68321 | 430 |
| prime-staircase{"ends":1}/step-back | yes | 4.1 | 6.1 | 8.0 | 10.0 | 11.9 | 61334 | 242 |
| prime-staircase{"ends":3,"side":-1}/step-back |  | 4.0 | 6.0 | 8.2 | 11.8 | 12.0 | 46766 | 198 |
| prime-staircase{"ends":3}/step-back | yes | 4.0 | 6.0 | 8.2 | 11.8 | 12.0 | 46766 | 198 |
| prime-staircase{"ends":7}/step-back | yes | 4.1 | 6.0 | 7.9 | 10.3 | 13.8 | 49990 | 81 |
| prime-staircase{"ends":9}/step-back | yes | 4.0 | 6.1 | 8.2 | 10.0 | 12.0 | 67649 | 537 |
| pythagorean-area{"ends":1}/shared-factor | yes | 4.0 | 6.0 | 8.1 | 10.1 | 11.9 | 57206 | 819 |
| pythagorean-area{"ends":3}/shared-factor | yes | 4.2 | 6.2 | 8.3 | 10.0 | 12.2 | 45901 | 517 |
| pythagorean-area{"ends":7}/shared-factor | yes | 4.1 | 6.4 | 8.0 | 10.1 | 12.1 | 49288 | 554 |
| pythagorean-area{"ends":9}/shared-factor | yes | 4.0 | 6.3 | 8.1 | 10.0 | 12.1 | 59587 | 678 |
| ruler{"ends":1}/shared-factor | yes | 4.1 | 6.0 | 8.1 | 10.0 | 12.0 | 52462 | 641 |
| ruler{"ends":3}/shared-factor | yes | 4.2 | 7.4 | 8.0 | 10.2 | 12.1 | 43223 | 525 |
| ruler{"ends":7}/shared-factor | yes | 4.1 | 6.4 | 8.3 | 10.0 | 11.9 | 44839 | 675 |
| ruler{"ends":9}/shared-factor | yes | 4.0 | 6.0 | 8.3 | 10.0 | 11.9 | 55455 | 760 |
| same-on-both-rulers{"d":1,"side":-1}/shared-factor | yes | 4.0 | 8.5 | 8.5 |  |  | 44049 | 0 |
| same-on-both-rulers{"d":1}/shared-factor | yes | 4.0 | 8.5 | 8.5 | 35.3 |  | 43907 | 0 |
| same-on-both-rulers{"d":2,"side":-1}/shared-factor | yes | 4.0 | 6.0 | 10.5 | 10.5 |  | 46502 | 0 |
| same-on-both-rulers{"d":2}/shared-factor | yes | 4.0 | 6.0 | 10.4 | 10.4 |  | 46501 | 0 |
| smooth-crossing/shared |  | 4.6 | 6.3 | 8.2 | 10.1 | 12.0 | 37973 | 830 |
| smooth-gradient/shared |  | 5.1 | 7.0 | 9.0 | 11.0 | 13.0 | 35692 | 694 |
| smooth-intercept{"primes":[3,11]}/shared-factor | yes | 4.0 | 6.4 | 8.2 | 10.2 | 12.2 | 48646 | 472 |
| smooth-intercept{"primes":[3,13]}/shared-factor | yes | 4.0 | 6.4 | 8.2 | 10.2 | 12.3 | 48179 | 458 |
| smooth-intercept{"primes":[3,17]}/shared-factor | yes | 4.0 | 6.4 | 8.0 | 10.2 | 12.3 | 46641 | 451 |
| smooth-intercept{"primes":[3,7]}/shared-factor | yes | 4.0 | 6.2 | 8.0 | 10.0 | 12.1 | 45529 | 562 |
| smooth-square/shared |  | 4.0 | 6.4 | 8.1 | 10.1 | 12.0 | 54573 | 678 |
| square-area/lpf | yes | 4.0 | 6.4 | 9.2 | 10.6 | 12.4 | 52883 | 483 |
| square-area/omega |  | 4.0 | 6.3 | 8.1 | 11.0 | 12.8 | 53135 | 478 |
| square-area/spf | yes | 4.0 | 6.5 | 9.5 | 11.3 | 12.8 | 52513 | 165 |
| steady-gradient/divisors |  | 4.0 | 6.0 | 8.0 | 10.0 | 12.5 | 79466 | 2251 |
| steady-gradient/gcd-c |  | 4.0 | 6.0 | 8.1 | 10.1 | 12.0 | 67325 | 1805 |
| steady-gradient/x-whole |  |  |  |  |  |  | 0 | 0 |
| steep-and-tall/shared |  | 4.1 | 6.1 | 8.0 | 10.0 | 12.0 | 60578 | 3033 |
| sunken-intercept/shared |  | 4.0 | 6.0 | 8.0 | 9.9 | 12.0 | 79259 | 2985 |
| target-gradient/gcd-tops |  | 4.1 | 6.5 | 8.0 | 11.0 |  | 42934 | 0 |
| target-gradient/same-den |  | 4.1 | 6.3 | 8.0 |  |  | 43626 | 0 |
| treasure{"k":3,"side":-1}/shared-factor | yes | 4.0 | 6.0 | 8.0 | 10.4 | 11.5 | 44339 | 742 |
| treasure{"k":3}/shared-factor | yes | 4.0 | 6.0 | 8.1 | 10.3 | 11.5 | 44638 | 744 |
| treasure{"k":4,"side":-1}/shared-factor | yes | 4.2 | 6.2 | 8.0 | 10.2 | 12.7 | 39567 | 360 |
| treasure{"k":4}/shared-factor | yes | 4.2 | 6.2 | 8.0 | 10.2 | 12.7 | 40043 | 342 |
| triangle-area{"A":12}/even |  | 4.0 | 6.0 | 8.0 | 10.5 |  | 49406 | 0 |
| triangle-area{"A":18}/even |  | 4.0 | 6.2 | 8.1 |  |  | 51222 | 0 |
| triangle-area{"A":4}/even |  | 4.0 | 6.0 | 16.3 |  |  | 47888 | 0 |
| triangle-area{"A":6}/even |  | 4.0 | 6.1 | 8.1 | 11.6 |  | 47719 | 0 |
| triangle-area{"A":8}/even |  | 4.0 | 6.2 | 8.1 |  |  | 49261 | 0 |
| triangle-area{"A":12}/legs |  | 4.1 | 6.0 | 8.0 |  |  | 46669 | 0 |
| triangle-area{"A":18}/legs |  | 4.0 | 6.2 | 8.1 |  |  | 50165 | 0 |
| triangle-area{"A":4}/legs |  | 4.0 | 6.0 |  |  |  | 48381 | 0 |
| triangle-area{"A":6}/legs |  | 4.0 | 6.1 | 8.1 |  |  | 47074 | 0 |
| triangle-area{"A":8}/legs |  | 4.0 | 6.2 |  |  |  | 48236 | 0 |
| whole-area/gcd-den-m |  | 4.8 | 6.7 | 8.4 | 10.4 | 12.4 | 31875 | 551 |
| whole-area/gcd-x |  | 4.0 | 6.0 | 8.0 | 10.0 | 12.0 | 55310 | 2222 |
| whole-at-t/gcd-c |  | 4.4 | 6.1 | 8.0 | 10.0 | 12.0 | 44023 | 640 |
| whole-at-t/gcd-den-m |  | 7.1 | 7.1 | 10.2 | 10.2 | 12.7 | 7187 | 290 |
| whole-crossing{"q":5,"r":1}/shared-factor | yes | 4.6 | 6.0 | 8.1 | 10.7 | 12.1 | 29138 | 397 |
| whole-crossing{"q":5,"r":2}/shared-factor | yes | 5.0 | 6.1 | 8.7 | 11.1 | 12.5 | 24154 | 341 |
| whole-crossing{"q":5,"r":3}/shared-factor | yes | 5.0 | 6.1 | 8.6 | 11.1 | 12.5 | 23959 | 364 |
| whole-crossing{"q":5,"r":4}/shared-factor | yes | 4.6 | 6.0 | 8.2 | 10.8 | 12.0 | 29475 | 395 |
| whole-intercept/gcd-den-m |  | 4.5 | 7.4 | 8.4 | 10.6 | 13.8 | 43682 | 263 |
| whole-intercept/gcd-floor-m |  | 4.0 | 6.0 | 8.1 | 10.1 | 12.0 | 67961 | 1808 |
| whole-intercept/mc-spf |  | 5.7 | 8.8 | 8.8 | 11.6 | 15.6 | 15915 | 38 |
| whole-intercept/omega |  | 4.8 | 6.7 | 8.6 | 10.6 | 12.6 | 49975 | 1242 |
| whole-intercept/spf |  | 4.8 | 6.2 | 8.1 | 11.2 | 12.6 | 30317 | 311 |

<!-- pmi:line-q end -->
