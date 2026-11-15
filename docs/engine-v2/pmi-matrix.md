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

Measured by `pnpm --filter @workspace/v2-agents pmi -- --variant line-q` (lib/v2-agents/scripts/pmi.ts), 2026-11-15: 159 rules (every committed value function of line-q; 74 dealt in lines-beginner), 5,000,000 draws of the line-q law (tilts 1, 0.75, 0.55, 0.4, 0.3, 1,000,000 each), 1,638,987 accepted, effective sample size 752,681. Depths 4, 6, 8, 10, 12 bits; a depth is read when the joint upper set holds at least 30 effective draws; a depth not read where independence would put at least 300 effective draws in the joint set is an exclusion, shown "≤ bound" (PMI ≤ log2(30 / expected)). Headline: the mean over the depths read (exclusions as their bound). Cells: PMI per depth.

Pairs of different families: 11800. Independent (|PMI| ≤ 1): **5618**; mild (1 to 2): 1281; mild anti (−2 to −1): 1393; aligned (> 2): **763**; anti-aligned (< −2): **2449**; unread: 296.
Pairs read at each depth (and exclusions): 4 bits 10475 (1029), 6 bits 7411 (0), 8 bits 1050 (0), 10 bits 252 (0), 12 bits 145 (0). A pair unread at a depth is one whose joint upper set is too thin at the sample size; for an independent pair the joint set at t bits has mass 2^(−2t), so depths past about 8 are read only for aligned pairs, and the headline of an aligned pair averages more (and deeper) depths.

### Family matrix (headline PMI, mean over tie-breakers and parameter sets; diagonal: two tie-breakers of one family)

| | CC | DL | EL | ES | EC | FN | LD | MMC | NP | PG | PGr | PL | PS | PSt | PA | R | SOBR | SC | SG | SI | SS | SA | SGr | SAT | SIn | TG | T | TA | WA | WAT | WC | WI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **CC** crossing-check | -0.2 | -1.5 | -5.8 | 0.1 | 0.9 | 0.5 | -0.2 | -0.1 | 0.6 | 0.8 | -3.9 | -0.8 | 0.3 | 0.1 | 0.4 | 0.6 | -0.8 | -2.7 | -2.9 | -2.7 | -0.6 | -0.6 | -4.3 | -6.2 | -3.6 | 1.6 | -2.9 | 0.2 | -1.5 | -2.2 | -1.5 | -1.9 |
| **DL** divisibility-ladder | -1.5 | 7.8 | -5.8 | -5.7 | 0.7 | -2.9 | -6.2 | -3.1 | -2.4 | -3.7 | 0.9 | 0.8 | -5.0 | -3.9 | 0.0 | -0.6 | 0.8 | 4.7 | 4.7 | 4.7 | 3.1 | 1.9 | 3.1 | 3.9 | 5.1 | -0.3 | -1.1 | 0.3 | -0.4 | 1.2 | 1.7 | -1.3 |
| **EL** egyptian-line | -5.8 | -5.8 |  | -2.8 | -5.8 | 2.6 | -0.2 | 3.4 | -5.9 | -5.7 | -5.9 | -5.8 | -4.4 | -4.9 | -5.9 | -5.9 | -5.9 | -5.3 | -4.8 | -5.3 | -4.8 | -4.7 | -5.9 | -5.8 | -5.9 | -5.8 | -5.9 | -5.9 | -5.5 | -5.5 | -4.9 | -5.1 |
| **ES** euclid-steps | 0.1 | -5.7 | -2.8 |  | -0.9 | -5.7 | 3.3 | -0.3 | 0.3 | 1.3 | -0.5 | -0.7 | 2.9 | -1.4 | -0.6 | -0.6 | -0.4 | -3.1 | -4.7 | -3.0 | -0.5 | -0.6 | -5.8 | -2.2 | -1.5 | 1.6 | -0.6 | -0.5 | -1.5 | -3.3 | -2.0 | -2.6 |
| **EC** exact-change | 0.9 | 0.7 | -5.8 | -0.9 | 7.3 | -6.4 | -0.2 | -5.9 | 1.2 | 0.0 | -3.3 | -2.1 | 0.3 | -0.3 | 1.6 | 1.0 | -1.9 | -1.2 | 1.0 | -1.1 | 0.9 | 1.0 | -1.0 | -6.4 | -6.5 | -6.4 | -1.1 | 1.9 | 1.0 | -0.5 | 1.0 | 1.0 |
| **FN** farey-neighbours | 0.5 | -2.9 | 2.6 | -5.7 | -6.4 | 3.2 | -0.8 | 2.4 | 1.1 | 0.3 | -2.5 | -1.4 | -3.8 | 0.5 | -2.1 | 0.4 | -1.7 | -5.9 | -3.6 | -5.9 | -0.4 | -0.4 | -4.7 | 0.3 | -6.0 | -0.0 | -0.2 | -2.3 | -6.1 | -2.0 | -5.6 | -2.9 |
| **LD** long-division | -0.2 | -6.2 | -0.2 | 3.3 | -0.2 | -0.8 | 4.3 | 1.0 | 0.3 | 0.1 | -1.0 | -0.7 | 2.0 | -1.8 | -0.0 | -0.7 | -0.3 | -2.5 | -5.2 | -2.4 | -0.8 | -0.9 | -6.3 | -2.0 | -1.2 | 0.2 | -1.3 | -0.2 | -1.4 | -2.8 | -1.2 | -3.5 |
| **MMC** m-meets-c | -0.1 | -3.1 | 3.4 | -0.3 | -5.9 | 2.4 | 1.0 | 5.3 | 0.3 | -0.8 | -3.2 | -2.5 | 0.1 | -1.2 | -1.5 | 0.4 | -2.6 | -6.0 | 1.2 | -6.0 | -1.0 | -1.0 | -2.7 | 0.3 | -6.3 | 0.5 | -2.5 | -3.0 | -6.2 | -3.3 | -4.4 | -2.4 |
| **NP** near-point | 0.6 | -2.4 | -5.9 | 0.3 | 1.2 | 1.1 | 0.3 | 0.3 | 6.0 | 0.2 | -4.4 | -1.9 | 0.4 | 0.7 | 0.0 | -0.0 | -2.2 | -6.0 | -5.5 | -6.0 | 0.1 | 0.1 | -4.7 | -6.6 | -5.3 | 2.4 | -6.6 | 0.8 | -0.4 | -2.4 | -1.7 | -2.1 |
| **PG** pell-gradient | 0.8 | -3.7 | -5.7 | 1.3 | 0.0 | 0.3 | 0.1 | -0.8 | 0.2 | -1.1 | -6.3 | -0.2 | -0.5 | -0.2 | -0.0 | 0.2 | 0.1 | -1.4 | -5.3 | -1.4 | -2.1 | -2.3 | -5.7 | -0.2 | -0.6 | 2.5 | -1.1 | 0.1 | -1.0 | -1.9 | -1.2 | -1.6 |
| **PGr** prime-gradient | -3.9 | 0.9 | -5.9 | -0.5 | -3.3 | -2.5 | -1.0 | -3.2 | -4.4 | -6.3 | -0.8 | 0.2 | -4.9 | 0.9 | -0.3 | -0.8 | -1.3 | -2.6 | 2.2 | -2.6 | -0.7 | -1.2 | 2.1 | -2.0 | 0.2 | -6.5 | -2.4 | -0.2 | -3.5 | 0.6 | -1.5 | 0.8 |
| **PL** prime-landing | -0.8 | 0.8 | -5.8 | -0.7 | -2.1 | -1.4 | -0.7 | -2.5 | -1.9 | -0.2 | 0.2 | 2.8 | -0.5 | -4.1 | 1.2 | 0.8 | 1.5 | 1.4 | 0.6 | 1.4 | 0.0 | 0.6 | 0.9 | -2.2 | -2.6 | 0.2 | 0.1 | 1.3 | 0.4 | 0.2 | 1.2 | 1.9 |
| **PS** prime-slope | 0.3 | -5.0 | -4.4 | 2.9 | 0.3 | -3.8 | 2.0 | 0.1 | 0.4 | -0.5 | -4.9 | -0.5 | 3.5 | -1.3 | -0.1 | -0.2 | 0.1 | -3.3 | -4.5 | -3.3 | -5.6 | -5.4 | -5.1 | -0.6 | -0.7 | 0.5 | -1.3 | 0.0 | -2.7 | -2.4 | -1.1 | -2.8 |
| **PSt** prime-staircase | 0.1 | -3.9 | -4.9 | -1.4 | -0.3 | 0.5 | -1.8 | -1.2 | 0.7 | -0.2 | 0.9 | -4.1 | -1.3 | 5.5 | 1.2 | -0.2 | 0.8 | -3.7 | -4.5 | -3.7 | -0.4 | 0.7 | 0.9 | -0.5 | -3.5 | -0.1 | 0.3 | 1.1 | -1.5 | -2.9 | -0.5 | 0.8 |
| **PA** pythagorean-area | 0.4 | 0.0 | -5.9 | -0.6 | 1.6 | -2.1 | -0.0 | -1.5 | 0.0 | -0.0 | -0.3 | 1.2 | -0.1 | 1.2 | 6.0 | 1.0 | 0.9 | -6.0 | 1.3 | -6.0 | 0.4 | 0.4 | -0.0 | 0.9 | -3.4 | -0.3 | -0.9 | 3.2 | -1.2 | -0.3 | -1.1 | 0.0 |
| **R** ruler | 0.6 | -0.6 | -5.9 | -0.6 | 1.0 | 0.4 | -0.7 | 0.4 | -0.0 | 0.2 | -0.8 | 0.8 | -0.2 | -0.2 | 1.0 | 6.0 | 0.9 | -1.2 | 1.5 | -1.2 | 1.3 | 1.3 | -0.5 | 0.5 | 1.0 | 0.4 | 0.8 | 1.0 | 0.8 | 0.2 | 0.9 | 0.6 |
| **SOBR** same-on-both-rulers | -0.8 | 0.8 | -5.9 | -0.4 | -1.9 | -1.7 | -0.3 | -2.6 | -2.2 | 0.1 | -1.3 | 1.5 | 0.1 | 0.8 | 0.9 | 0.9 | -0.7 | -0.3 | 0.4 | -0.3 | 0.6 | 1.0 | -1.6 | -2.5 | -0.4 | 0.8 | -0.0 | 0.6 | 1.1 | 0.1 | 0.9 | 0.6 |
| **SC** smooth-crossing | -2.7 | 4.7 | -5.3 | -3.1 | -1.2 | -5.9 | -2.5 | -6.0 | -6.0 | -1.4 | -2.6 | 1.4 | -3.3 | -3.7 | -6.0 | -1.2 | -0.3 |  | 1.4 | 8.3 | 6.1 | 3.5 | -2.2 | -0.7 | 6.2 | -0.8 | -0.7 | -6.0 | 5.3 | -0.9 | 2.6 | 1.8 |
| **SG** smooth-gradient | -2.9 | 4.7 | -4.8 | -4.7 | 1.0 | -3.6 | -5.2 | 1.2 | -5.5 | -5.3 | 2.2 | 0.6 | -4.5 | -4.5 | 1.3 | 1.5 | 0.4 | 1.4 |  | 1.4 | 0.9 | 1.7 | 6.2 | 5.5 | 4.1 | -5.4 | -1.3 | 1.1 | -1.8 | 4.3 | 1.6 | 1.1 |
| **SI** smooth-intercept | -2.7 | 4.7 | -5.3 | -3.0 | -1.1 | -5.9 | -2.4 | -6.0 | -6.0 | -1.4 | -2.6 | 1.4 | -3.3 | -3.7 | -6.0 | -1.2 | -0.3 | 8.3 | 1.4 |  | 6.1 | 3.5 | -2.1 | -0.7 | 6.2 | -0.8 | -0.8 | -6.0 | 5.3 | -0.9 | 1.9 | 1.8 |
| **SS** smooth-square | -0.6 | 3.1 | -4.8 | -0.5 | 0.9 | -0.4 | -0.8 | -1.0 | 0.1 | -2.1 | -0.7 | 0.0 | -5.6 | -0.4 | 0.4 | 1.3 | 0.6 | 6.1 | 0.9 | 6.1 |  | 5.7 | 1.0 | -0.2 | 4.9 | 1.1 | -0.5 | 0.4 | 4.5 | -0.8 | 1.1 | 0.8 |
| **SA** square-area | -0.6 | 1.9 | -4.7 | -0.6 | 1.0 | -0.4 | -0.9 | -1.0 | 0.1 | -2.3 | -1.2 | 0.6 | -5.4 | 0.7 | 0.4 | 1.3 | 1.0 | 3.5 | 1.7 | 3.5 | 5.7 | 5.5 | -0.4 | 0.2 | 3.2 | 1.1 | -0.7 | 0.5 | 3.1 | -0.7 | 1.2 | 0.4 |
| **SGr** steady-gradient | -4.3 | 3.1 | -5.9 | -5.8 | -1.0 | -4.7 | -6.3 | -2.7 | -4.7 | -5.7 | 2.1 | 0.9 | -5.1 | 0.9 | -0.0 | -0.5 | -1.6 | -2.2 | 6.2 | -2.1 | 1.0 | -0.4 | 4.6 | 4.5 | 2.3 | -6.5 | -3.6 | -0.2 | -4.1 | -0.4 | -1.3 | 0.9 |
| **SAT** steep-and-tall | -6.2 | 3.9 | -5.8 | -2.2 | -6.4 | 0.3 | -2.0 | 0.3 | -6.6 | -0.2 | -2.0 | -2.2 | -0.6 | -0.5 | 0.9 | 0.5 | -2.5 | -0.7 | 5.5 | -0.7 | -0.2 | 0.2 | 4.5 |  | -6.6 | 1.4 | -2.7 | 1.1 | -1.8 | 0.9 | -0.1 | 2.2 |
| **SIn** sunken-intercept | -3.6 | 5.1 | -5.9 | -1.5 | -6.5 | -6.0 | -1.2 | -6.3 | -5.3 | -0.6 | 0.2 | -2.6 | -0.7 | -3.5 | -3.4 | 1.0 | -0.4 | 6.2 | 4.1 | 6.2 | 4.9 | 3.2 | 2.3 | -6.6 |  | -0.3 | -3.3 | -2.9 | 4.2 | 2.4 | 3.2 | 2.6 |
| **TG** target-gradient | 1.6 | -0.3 | -5.8 | 1.6 | -6.4 | -0.0 | 0.2 | 0.5 | 2.4 | 2.5 | -6.5 | 0.2 | 0.5 | -0.1 | -0.3 | 0.4 | 0.8 | -0.8 | -5.4 | -0.8 | 1.1 | 1.1 | -6.5 | 1.4 | -0.3 | 6.1 | -1.2 | 0.1 | -0.6 | -2.6 | -0.9 | -2.4 |
| **T** treasure | -2.9 | -1.1 | -5.9 | -0.6 | -1.1 | -0.2 | -1.3 | -2.5 | -6.6 | -1.1 | -2.4 | 0.1 | -1.3 | 0.3 | -0.9 | 0.8 | -0.0 | -0.7 | -1.3 | -0.8 | -0.5 | -0.7 | -3.6 | -2.7 | -3.3 | -1.2 | 4.0 | -0.5 | -0.1 | -0.2 | 0.1 | -0.9 |
| **TA** triangle-area | 0.2 | 0.3 | -5.9 | -0.5 | 1.9 | -2.3 | -0.2 | -3.0 | 0.8 | 0.1 | -0.2 | 1.3 | 0.0 | 1.1 | 3.2 | 1.0 | 0.6 | -6.0 | 1.1 | -6.0 | 0.4 | 0.5 | -0.2 | 1.1 | -2.9 | 0.1 | -0.5 | 1.3 | -0.6 | -0.3 | -1.0 | 0.1 |
| **WA** whole-area | -1.5 | -0.4 | -5.5 | -1.5 | 1.0 | -6.1 | -1.4 | -6.2 | -0.4 | -1.0 | -3.5 | 0.4 | -2.7 | -1.5 | -1.2 | 0.8 | 1.1 | 5.3 | -1.8 | 5.3 | 4.5 | 3.1 | -4.1 | -1.8 | 4.2 | -0.6 | -0.1 | -0.6 | 4.8 | -0.1 | 1.6 | 0.8 |
| **WAT** whole-at-t | -2.2 | 1.2 | -5.5 | -3.3 | -0.5 | -2.0 | -2.8 | -3.3 | -2.4 | -1.9 | 0.6 | 0.2 | -2.4 | -2.9 | -0.3 | 0.2 | 0.1 | -0.9 | 4.3 | -0.9 | -0.8 | -0.7 | -0.4 | 0.9 | 2.4 | -2.6 | -0.2 | -0.3 | -0.1 | -0.1 | -1.3 | 0.3 |
| **WC** whole-crossing | -1.5 | 1.7 | -4.9 | -2.0 | 1.0 | -5.6 | -1.2 | -4.4 | -1.7 | -1.2 | -1.5 | 1.2 | -1.1 | -0.5 | -1.1 | 0.9 | 0.9 | 2.6 | 1.6 | 1.9 | 1.1 | 1.2 | -1.3 | -0.1 | 3.2 | -0.9 | 0.1 | -1.0 | 1.6 | -1.3 | 2.1 | 1.4 |
| **WI** whole-intercept | -1.9 | -1.3 | -5.1 | -2.6 | 1.0 | -2.9 | -3.5 | -2.4 | -2.1 | -1.6 | 0.8 | 1.9 | -2.8 | 0.8 | 0.0 | 0.6 | 0.6 | 1.8 | 1.1 | 1.8 | 0.8 | 0.4 | 0.9 | 2.2 | 2.6 | -2.4 | -0.9 | 0.1 | 0.8 | 0.3 | 1.4 | 0.5 |

### Families by independence (pairs with other families)

| Family | dealt | rules | pairs read | independent | mild ± | aligned | anti-aligned | mean PMI | mean |PMI| |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ruler | 3/3 | 3 | 465 | 333 (72%) | 112 | 12 | 8 | 0.39 | 0.82 |
| triangle-area | no | 10 | 1470 | 970 (66%) | 341 | 74 | 85 | 0.07 | 1.00 |
| same-on-both-rulers | 12/12 | 12 | 1746 | 1141 (65%) | 367 | 88 | 150 | -0.01 | 1.03 |
| smooth-square | no | 1 | 156 | 98 (63%) | 21 | 20 | 17 | -0.05 | 1.55 |
| long-division | no | 3 | 462 | 290 (63%) | 94 | 6 | 72 | -0.92 | 1.22 |
| pythagorean-area | 3/3 | 3 | 462 | 277 (60%) | 129 | 29 | 27 | 0.18 | 1.10 |
| prime-staircase | 8/8 | 8 | 1188 | 690 (58%) | 241 | 84 | 173 | -0.39 | 1.38 |
| square-area | 3/3 | 3 | 462 | 261 (56%) | 97 | 53 | 51 | -0.16 | 1.53 |
| pell-gradient | no | 18 | 2511 | 1416 (56%) | 511 | 169 | 415 | -0.89 | 1.59 |
| euclid-steps | no | 1 | 155 | 86 (55%) | 33 | 9 | 27 | -0.63 | 1.51 |
| whole-at-t | no | 2 | 299 | 162 (54%) | 46 | 15 | 76 | -0.89 | 1.73 |
| target-gradient | no | 2 | 312 | 169 (54%) | 48 | 48 | 47 | -0.30 | 1.72 |
| prime-landing | 10/10 | 10 | 1470 | 754 (51%) | 391 | 153 | 172 | -0.10 | 1.39 |
| farey-neighbours | no | 2 | 189 | 93 (49%) | 37 | 9 | 50 | -1.01 | 1.66 |
| prime-slope | no | 3 | 456 | 214 (47%) | 104 | 32 | 106 | -1.12 | 1.80 |
| treasure | 20/20 | 20 | 2740 | 1216 (44%) | 844 | 60 | 620 | -1.17 | 1.56 |
| whole-intercept | no | 5 | 756 | 313 (41%) | 188 | 85 | 170 | -0.40 | 2.09 |
| divisibility-ladder | 4/4 | 4 | 611 | 252 (41%) | 115 | 61 | 183 | -0.89 | 2.30 |
| whole-crossing | 3/5 | 5 | 756 | 308 (41%) | 228 | 72 | 148 | -0.35 | 1.81 |
| crossing-check | no | 18 | 2510 | 999 (40%) | 601 | 159 | 751 | -1.03 | 1.85 |
| exact-change | no | 3 | 462 | 179 (39%) | 120 | 56 | 107 | -0.54 | 2.06 |
| prime-gradient | 8/8 | 8 | 1192 | 446 (37%) | 167 | 39 | 540 | -2.15 | 2.57 |
| near-point | no | 2 | 312 | 116 (37%) | 50 | 28 | 118 | -1.59 | 2.54 |
| sunken-intercept | no | 1 | 156 | 54 (35%) | 16 | 22 | 64 | -1.31 | 2.80 |
| whole-area | no | 2 | 310 | 107 (35%) | 103 | 28 | 72 | -0.56 | 1.91 |
| m-meets-c | no | 2 | 312 | 85 (27%) | 60 | 13 | 154 | -1.84 | 2.25 |
| smooth-intercept | no | 1 | 156 | 38 (24%) | 49 | 16 | 53 | -1.27 | 2.71 |
| smooth-crossing | no | 1 | 156 | 37 (24%) | 49 | 17 | 53 | -1.25 | 2.72 |
| steady-gradient | no | 3 | 310 | 70 (23%) | 80 | 26 | 134 | -2.02 | 3.24 |
| steep-and-tall | no | 1 | 156 | 33 (21%) | 49 | 19 | 55 | -1.52 | 3.10 |
| smooth-gradient | no | 1 | 154 | 26 (17%) | 57 | 20 | 51 | -1.00 | 2.71 |
| egyptian-line | no | 1 | 156 | 3 (2%) | 0 | 4 | 149 | -5.30 | 5.45 |

### Calibration of the value functions against these draws

Every rule's upper sets are within 1 bit of their nominal depth or rarer.

### The 367 rules (Square Area/spf, Whole Crossing/k-spf, Prime Landing/big-prime)

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| square-area/spf | whole-crossing/k-spf | both | **2.47** | -0.1 | 2.2 | 5.3 |  |  | 1201 |
| prime-landing{"ends":7,"side":-1}/big-prime | square-area/spf | both | **0.55** | 0.5 | 0.6 |  |  |  | 3583 |
| prime-landing{"ends":7}/big-prime | square-area/spf | both | **0.54** | 0.5 | 0.6 |  |  |  | 3589 |
| prime-landing{"ends":7,"side":-1}/big-prime | whole-crossing/k-spf | both | **1.82** | 0.9 | 2.8 |  |  |  | 2220 |
| prime-landing{"ends":7}/big-prime | whole-crossing/k-spf | both | **1.79** | 0.8 | 2.8 |  |  |  | 2162 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-landing{"ends":7}/big-prime | both | **-0.06** | -0.9 | 0.8 |  |  |  | 1247 |

### The six adversaries against each other (rule design measured 6–8.5 bits at depth 8 for several of these pairs, line-rules-v3-proposals.md §A10)

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | smooth-gradient/shared | neither | **1.41** | 1.2 | 1.4 | 1.4 | 1.6 |  | 4355 |
| smooth-crossing/shared | smooth-intercept/shared | neither | **8.27** | 4.6 | 6.3 | 8.2 | 10.1 | 12.0 | 37913 |
| smooth-crossing/shared | smooth-square/shared | neither | **6.13** | 2.0 | 4.5 | 6.1 | 8.1 | 9.9 | 9873 |
| smooth-crossing/shared | steep-and-tall/shared | neither | **-0.67** | 0.1 | -0.7 | -1.4 |  |  | 3039 |
| smooth-crossing/shared | sunken-intercept/shared | neither | **6.15** | 2.7 | 4.4 | 6.2 | 7.9 | 9.7 | 16607 |
| smooth-gradient/shared | smooth-intercept/shared | neither | **1.42** | 1.3 | 1.4 | 1.4 | 1.6 |  | 4464 |
| smooth-gradient/shared | smooth-square/shared | neither | **0.91** | 0.8 | 2.1 | -0.1 |  |  | 3314 |
| smooth-gradient/shared | steep-and-tall/shared | neither | **5.54** | 2.1 | 4.0 | 5.6 | 7.2 | 8.8 | 8883 |
| smooth-gradient/shared | sunken-intercept/shared | neither | **4.08** | 2.0 | 3.1 | 4.2 | 4.9 | 6.1 | 12253 |
| smooth-intercept/shared | smooth-square/shared | neither | **6.13** | 2.0 | 4.5 | 6.1 | 8.1 | 9.9 | 9882 |
| smooth-intercept/shared | steep-and-tall/shared | neither | **-0.67** | 0.1 | -0.7 | -1.4 |  |  | 3119 |
| smooth-intercept/shared | sunken-intercept/shared | neither | **6.15** | 2.7 | 4.4 | 6.2 | 7.9 | 9.7 | 16754 |
| smooth-square/shared | steep-and-tall/shared | neither | **-0.17** | 0.5 | -0.8 |  |  |  | 4019 |
| smooth-square/shared | sunken-intercept/shared | neither | **4.87** | 0.7 | 3.2 | 4.9 | 6.8 | 8.7 | 6875 |
| steep-and-tall/shared | sunken-intercept/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |

### The six adversaries against the 367 rules

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | square-area/spf | one | **1.30** | 2.1 | 0.5 |  |  |  | 9873 |
| smooth-crossing/shared | whole-crossing/k-spf | one | **-1.91** | -1.9 |  |  |  |  | 386 |
| prime-landing{"ends":7,"side":-1}/big-prime | smooth-crossing/shared | one | **1.48** | 1.6 | 1.4 |  |  |  | 5500 |
| prime-landing{"ends":7}/big-prime | smooth-crossing/shared | one | **1.46** | 1.6 | 1.3 |  |  |  | 5458 |
| smooth-gradient/shared | square-area/spf | one | **1.05** | 0.8 | 1.3 |  |  |  | 3300 |
| smooth-gradient/shared | whole-crossing/k-spf | one | **0.33** | 0.2 | 0.2 | 0.5 |  |  | 1088 |
| prime-landing{"ends":7,"side":-1}/big-prime | smooth-gradient/shared | one | **1.00** | 1.5 | 0.5 |  |  |  | 5136 |
| prime-landing{"ends":7}/big-prime | smooth-gradient/shared | one | **1.27** | 1.6 | 1.0 |  |  |  | 5455 |
| smooth-intercept/shared | square-area/spf | one | **1.30** | 2.1 | 0.5 |  |  |  | 9882 |
| smooth-intercept/shared | whole-crossing/k-spf | one | **-1.92** | -1.9 |  |  |  |  | 385 |
| prime-landing{"ends":7,"side":-1}/big-prime | smooth-intercept/shared | one | **1.48** | 1.6 | 1.4 |  |  |  | 5519 |
| prime-landing{"ends":7}/big-prime | smooth-intercept/shared | one | **1.46** | 1.6 | 1.3 |  |  |  | 5480 |
| smooth-square/shared | square-area/spf | one | **3.84** | 4.0 | 3.7 |  |  |  | 52513 |
| smooth-square/shared | whole-crossing/k-spf | one | **-0.15** | -0.2 |  |  |  |  | 1201 |
| prime-landing{"ends":7,"side":-1}/big-prime | smooth-square/shared | one | **0.43** | 0.4 | 0.4 |  |  |  | 3588 |
| prime-landing{"ends":7}/big-prime | smooth-square/shared | one | **0.34** | 0.4 | 0.2 |  |  |  | 3595 |
| square-area/spf | steep-and-tall/shared | one | **0.39** | 0.5 | 0.3 |  |  |  | 3979 |
| steep-and-tall/shared | whole-crossing/k-spf | one | **-1.14** | -0.8 | -1.5 |  |  |  | 891 |
| prime-landing{"ends":7,"side":-1}/big-prime | steep-and-tall/shared | one | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | steep-and-tall/shared | one | **2.08** | 2.1 | 2.1 |  |  |  | 15351 |
| square-area/spf | sunken-intercept/shared | one | **1.05** | 0.8 | 1.3 |  |  |  | 6874 |
| sunken-intercept/shared | whole-crossing/k-spf | one | **-0.19** | 0.5 | -0.9 |  |  |  | 2666 |
| prime-landing{"ends":7,"side":-1}/big-prime | sunken-intercept/shared | one | **2.39** | 1.9 | 2.9 |  |  |  | 16442 |
| prime-landing{"ends":7}/big-prime | sunken-intercept/shared | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |

### Pairs that read the same prime of the same number

Each rule's prime readings (hand-listed in scripts/pmi.ts READS: the number read, and which prime of it). Pairs of different families sharing a reading:

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| whole-crossing/m-spf | whole-intercept/mc-spf | one | **5.20** | 3.9 | 6.0 | 5.7 |  |  | 4404 |
| prime-landing{"ends":7,"side":-1}/m-spf | whole-intercept/mc-spf | one | **5.02** | 2.1 | 3.2 | 5.9 | 8.9 |  | 4018 |
| prime-landing{"ends":7}/m-spf | whole-intercept/mc-spf | one | **4.88** | 2.0 | 3.1 | 5.8 | 8.6 |  | 3842 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-13,"k":2}/m-spf | both | **3.40** | 0.5 | 1.0 | 4.3 | 7.8 |  | 4112 |
| prime-landing{"ends":7}/m-spf | treasure{"T":13,"k":2}/m-spf | both | **3.20** | 0.6 | 0.8 | 4.0 | 7.5 |  | 4230 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":-13,"k":2}/prime-gradient | both | **3.04** | 0.8 | 1.0 | 3.1 | 7.2 |  | 5223 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":13,"k":2}/prime-gradient | both | **2.84** | 0.9 | 0.8 | 2.8 | 6.8 |  | 5485 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/prime-start | both | **2.61** | 2.1 | 3.1 |  |  |  | 12792 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/prime-start | both | **2.54** | 2.1 | 3.0 |  |  |  | 12110 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/prime-start | both | **2.52** | 2.1 | 2.9 |  |  |  | 12487 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/prime-start | both | **2.51** | 2.1 | 2.9 |  |  |  | 12517 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/prime-start | both | **2.50** | 2.1 | 2.9 |  |  |  | 11115 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/prime-start | both | **2.49** | 1.9 | 3.0 |  |  |  | 10859 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/prime-start | both | **2.48** | 1.9 | 3.0 |  |  |  | 10859 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/prime-start | both | **2.41** | 2.0 | 2.9 |  |  |  | 10381 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/prime-start | both | **2.40** | 1.8 | 3.0 |  |  |  | 10132 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/prime-start | both | **2.40** | 1.8 | 2.9 |  |  |  | 10132 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **2.36** | 0.7 | 4.0 |  |  |  | 1380 |
| prime-landing{"ends":7}/m-spf | treasure{"T":11,"k":2}/m-spf | both | **2.32** | 0.7 | 1.2 | 5.0 |  |  | 4555 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":11,"k":2}/m-gpf | both | **2.31** | 0.7 | 1.2 | 5.0 |  |  | 4555 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/m-spf | both | **2.28** | 1.9 | 2.6 |  |  |  | 10780 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/m-gpf | both | **2.26** | 1.9 | 2.6 |  |  |  | 10923 |
| prime-gradient{"ends":1}/cPrime | prime-staircase{"ends":3}/first-prime | both | **2.26** | 0.6 | 3.9 |  |  |  | 1343 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/m-spf | both | **2.19** | 1.8 | 2.5 |  |  |  | 10052 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/m-gpf | both | **2.18** | 1.8 | 2.5 |  |  |  | 10194 |
| prime-landing{"ends":7,"side":-1}/m-gpf | pythagorean-area/prime-height | both | **2.18** | 1.1 | 1.0 | 4.5 |  |  | 6360 |
| prime-landing{"ends":7,"side":-1}/m-spf | pythagorean-area/prime-height | both | **2.17** | 1.1 | 1.0 | 4.5 |  |  | 6360 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-11,"k":2}/m-spf | both | **2.17** | 0.7 | 1.1 | 4.7 |  |  | 4537 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **2.16** | 0.7 | 1.0 | 4.7 |  |  | 4537 |
| prime-landing{"ends":7}/m-gpf | pythagorean-area/prime-height | both | **2.06** | 1.1 | 0.9 | 4.2 |  |  | 6356 |
| prime-landing{"ends":7}/m-spf | pythagorean-area/prime-height | both | **2.05** | 1.1 | 0.9 | 4.2 |  |  | 6356 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":11,"k":2}/prime-gradient | both | **1.95** | 1.0 | 1.2 | 3.6 |  |  | 5691 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-intercept/mc-spf | one | **1.94** | 1.9 | 0.9 | 3.0 |  |  | 3795 |
| prime-gradient{"ends":1}/c-spf | whole-intercept/mc-spf | one | **1.90** | 1.8 | 0.9 | 3.0 |  |  | 3761 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":-13,"k":2}/m-gpf | both | **1.88** | 0.5 | 0.8 | 4.3 |  |  | 4122 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | pythagorean-area/prime-height | both | **1.88** | 0.8 | 1.2 | 3.6 |  |  | 5985 |
| divisibility-ladder/m-prime | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **1.88** | 1.9 |  |  |  |  | 9615 |
| prime-landing{"ends":7,"side":-1}/m-spf | whole-crossing/m-spf | both | **1.86** | 1.0 | 0.2 | 4.4 |  |  | 1909 |
| prime-landing{"ends":7,"side":-1}/next-prime | pythagorean-area/prime-height | both | **1.86** | 0.9 | 1.0 | 3.7 |  |  | 6026 |
| treasure{"T":11,"k":2}/m-spf | whole-crossing/m-spf | both | **1.79** | 0.4 | 3.2 |  |  |  | 1048 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":-11,"k":2}/prime-gradient | both | **1.79** | 1.0 | 1.1 | 3.2 |  |  | 5605 |
| prime-landing{"ends":7}/prime-gradient | pythagorean-area/prime-height | both | **1.77** | 0.8 | 1.1 | 3.4 |  |  | 5938 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1}/c-gpf | both | **1.74** | 0.9 | 2.6 |  |  |  | 7345 |
| treasure{"T":-11,"k":2}/m-spf | whole-crossing/m-spf | both | **1.73** | 0.3 | 3.1 |  |  |  | 989 |
| prime-landing{"ends":7}/next-prime | pythagorean-area/prime-height | both | **1.73** | 0.8 | 0.9 | 3.4 |  |  | 5970 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":13,"k":2}/m-gpf | both | **1.72** | 0.6 | 0.6 | 4.0 |  |  | 4243 |
| prime-staircase{"ends":3}/first-prime | same-on-both-rulers{"T":6}/prime-start | both | **1.72** | 1.4 | 2.0 |  |  |  | 1725 |
| divisibility-ladder/m-spf | whole-crossing/m-spf | both | **1.65** | 2.2 | 2.0 | 0.8 |  |  | 5410 |
| prime-landing{"ends":7}/m-spf | whole-crossing/m-spf | both | **1.64** | 0.9 | -0.1 | 4.1 |  |  | 1823 |
| prime-staircase{"ends":3}/first-prime | pythagorean-area/prime-height | both | **1.59** | 1.6 |  |  |  |  | 1872 |
| prime-staircase{"ends":3,"side":-1}/first-prime | same-on-both-rulers{"T":-6}/prime-start | both | **1.56** | 1.4 | 1.7 |  |  |  | 1675 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1}/c-spf | both | **1.56** | 0.5 | 2.6 |  |  |  | 5442 |
| prime-staircase{"ends":3,"side":-1}/first-prime | pythagorean-area/prime-height | both | **1.55** | 1.6 |  |  |  |  | 1786 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":-13,"k":2}/m-gpf | both | **1.47** | -1.9 | -1.3 | 2.6 | 6.4 |  | 889 |
| treasure{"T":-13,"k":2}/m-spf | whole-crossing/m-spf | both | **1.43** | 0.5 | 2.4 |  |  |  | 1125 |
| treasure{"T":13,"k":2}/m-spf | whole-crossing/m-spf | both | **1.39** | 0.5 | 2.3 |  |  |  | 1110 |
| pythagorean-area/prime-height | same-on-both-rulers{"T":6}/prime-start | both | **1.16** | 0.5 | 1.8 |  |  |  | 3864 |
| pythagorean-area/prime-height | same-on-both-rulers{"T":-6}/prime-start | both | **1.16** | 0.5 | 1.8 |  |  |  | 3897 |
| divisibility-ladder/m-spf | same-on-both-rulers{"T":-6}/m-spf | both | **1.13** | 0.7 | 1.5 |  |  |  | 4829 |
| divisibility-ladder/m-spf | same-on-both-rulers{"T":6}/m-spf | both | **1.12** | 0.8 | 1.5 |  |  |  | 4889 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1}/prime | both | **1.11** | 0.7 | 1.6 |  |  |  | 6449 |
| same-on-both-rulers{"T":6}/m-spf | treasure{"T":11,"k":2}/m-spf | both | **1.10** | 0.9 | 1.3 |  |  |  | 5375 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1}/cPrime | both | **1.10** | 0.6 | 1.6 |  |  |  | 6182 |
| same-on-both-rulers{"T":6}/m-gpf | treasure{"T":11,"k":2}/m-gpf | both | **1.09** | 0.8 | 1.3 |  |  |  | 5419 |
| divisibility-ladder/m-gpf | same-on-both-rulers{"T":-6}/m-gpf | both | **1.03** | 0.8 | 1.3 |  |  |  | 4573 |
| divisibility-ladder/m-gpf | same-on-both-rulers{"T":6}/m-gpf | both | **1.02** | 0.8 | 1.3 |  |  |  | 4602 |
| prime-landing{"ends":7}/prime-gradient | ruler/prime-gradient | both | **0.99** | 0.2 | 1.8 |  |  |  | 3893 |
| divisibility-ladder/m-prime | prime-landing{"ends":7}/prime-gradient | both | **0.99** | 1.9 | 0.1 |  |  |  | 9609 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-intercept/spf | one | **0.98** | 0.7 | 1.3 |  |  |  | 3653 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":6}/m-gpf | both | **0.84** | 0.7 | 1.0 |  |  |  | 4713 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | ruler/prime-gradient | both | **0.84** | 0.1 | 1.5 |  |  |  | 3783 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":6}/m-spf | both | **0.84** | 0.6 | 1.0 |  |  |  | 4478 |
| prime-landing{"ends":7,"side":-1}/big-prime | pythagorean-area/prime-height | both | **0.83** | 0.8 | 0.9 |  |  |  | 5329 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":6}/prime-start | both | **0.79** | 0.6 | 0.9 |  |  |  | 4555 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7}/m-gpf | both | **0.79** | 0.6 | 0.9 |  |  |  | 6320 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":6}/prime-start | both | **0.77** | 0.6 | 0.9 |  |  |  | 4555 |
| prime-landing{"ends":7}/big-prime | pythagorean-area/prime-height | both | **0.77** | 0.8 | 0.8 |  |  |  | 5281 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7}/m-spf | both | **0.76** | 0.6 | 0.9 |  |  |  | 6320 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7,"side":-1}/m-gpf | both | **0.74** | 0.6 | 0.9 |  |  |  | 6229 |
| prime-gradient{"ends":1}/c-spf | whole-intercept/spf | one | **0.74** | 0.7 | 1.2 | 0.3 |  |  | 3733 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7,"side":-1}/m-spf | both | **0.70** | 0.6 | 0.8 |  |  |  | 6229 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":6}/prime-start | both | **0.70** | 0.4 | 1.0 |  |  |  | 4324 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":6}/prime-start | both | **0.69** | 0.5 | 0.9 |  |  |  | 4219 |
| same-on-both-rulers{"T":-6}/m-spf | treasure{"T":-11,"k":2}/m-spf | both | **0.65** | 0.7 | 0.6 |  |  |  | 4427 |
| same-on-both-rulers{"T":-6}/m-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **0.64** | 0.6 | 0.6 |  |  |  | 4466 |
| divisibility-ladder/m-spf | prime-landing{"ends":7}/m-spf | both | **0.63** | 1.8 | -0.6 |  |  |  | 10156 |
| divisibility-ladder/m-spf | prime-landing{"ends":7,"side":-1}/m-spf | both | **0.61** | 1.9 | -0.6 |  |  |  | 10177 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":-6}/m-spf | both | **0.60** | 0.4 | 0.8 |  |  |  | 3811 |
| ruler/prime-gradient | treasure{"T":11,"k":2}/prime-gradient | both | **0.59** | 0.6 | 0.6 |  |  |  | 3524 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":-6}/m-gpf | both | **0.59** | 0.4 | 0.7 |  |  |  | 4051 |
| same-on-both-rulers{"T":6}/m-spf | whole-crossing/m-spf | both | **0.59** | 0.4 | 0.8 |  |  |  | 1332 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7}/big-prime | both | **0.58** | 0.4 | 0.8 |  |  |  | 5478 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7}/prime-gradient | both | **0.56** | 0.5 | 0.6 |  |  |  | 6414 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7,"side":-1}/big-prime | both | **0.54** | 0.4 | 0.7 |  |  |  | 5459 |
| same-on-both-rulers{"T":6}/m-spf | treasure{"T":13,"k":2}/m-spf | both | **0.54** | 0.5 | 0.5 |  |  |  | 4407 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":-6}/prime-start | both | **0.54** | 0.4 | 0.7 |  |  |  | 4175 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":-6}/prime-start | both | **0.53** | 0.4 | 0.7 |  |  |  | 3863 |
| same-on-both-rulers{"T":-6}/m-spf | whole-crossing/m-spf | both | **0.53** | 0.4 | 0.7 |  |  |  | 1310 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7}/next-prime | both | **0.52** | 0.3 | 0.7 |  |  |  | 5452 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **0.51** | 0.5 | 0.5 |  |  |  | 6365 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":6}/prime-start | both | **0.50** | 0.2 | 0.8 |  |  |  | 3705 |
| same-on-both-rulers{"T":-6}/m-spf | whole-intercept/mc-spf | one | **0.49** | 0.3 | 0.7 |  |  |  | 1242 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":-6}/prime-start | both | **0.49** | 0.4 | 0.6 |  |  |  | 3863 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1,"side":-1}/c-gpf | both | **0.49** | 0.9 | 0.1 |  |  |  | 7254 |
| treasure{"T":11,"k":2}/m-spf | whole-intercept/mc-spf | one | **0.49** | 0.5 |  |  |  |  | 1073 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7,"side":-1}/next-prime | both | **0.46** | 0.3 | 0.7 |  |  |  | 5376 |
| same-on-both-rulers{"T":6}/m-gpf | treasure{"T":13,"k":2}/m-gpf | both | **0.46** | 0.5 | 0.4 |  |  |  | 4503 |
| divisibility-ladder/m-gpf | prime-landing{"ends":7,"side":-1}/m-gpf | both | **0.45** | 1.9 | -1.0 |  |  |  | 9948 |
| same-on-both-rulers{"T":-6}/m-spf | treasure{"T":-13,"k":2}/m-spf | both | **0.44** | 0.3 | 0.6 |  |  |  | 3647 |
| divisibility-ladder/m-gpf | prime-landing{"ends":7}/m-gpf | both | **0.42** | 1.9 | -1.1 |  |  |  | 9932 |
| ruler/prime-gradient | treasure{"T":13,"k":2}/prime-gradient | both | **0.41** | 0.4 | 0.4 |  |  |  | 3316 |
| ruler/prime-gradient | treasure{"T":-11,"k":2}/prime-gradient | both | **0.41** | 0.5 | 0.3 |  |  |  | 3368 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":-6}/prime-start | both | **0.38** | 0.2 | 0.6 |  |  |  | 3480 |
| same-on-both-rulers{"T":-6}/m-gpf | treasure{"T":-13,"k":2}/m-gpf | both | **0.37** | 0.3 | 0.4 |  |  |  | 3769 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":-6}/prime-start | both | **0.37** | 0.1 | 0.7 |  |  |  | 3470 |
| treasure{"T":-11,"k":2}/m-spf | whole-intercept/mc-spf | one | **0.36** | 0.4 |  |  |  |  | 969 |
| ruler/prime-gradient | treasure{"T":-13,"k":2}/prime-gradient | both | **0.34** | 0.4 | 0.3 |  |  |  | 3256 |
| treasure{"T":13,"k":2}/m-spf | whole-intercept/mc-spf | one | **0.31** | 0.3 |  |  |  |  | 974 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1,"side":-1}/c-spf | both | **0.31** | 0.5 | 0.1 |  |  |  | 5415 |
| treasure{"T":-13,"k":2}/m-spf | whole-intercept/mc-spf | one | **0.27** | 0.3 |  |  |  |  | 944 |
| prime-gradient{"ends":1}/cPrime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **0.26** | 0.3 |  |  |  |  | 1055 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-staircase{"ends":3}/first-prime | both | **0.26** | 0.3 |  |  |  |  | 1071 |
| same-on-both-rulers{"T":6}/m-spf | whole-intercept/mc-spf | one | **0.20** | 0.2 | 0.2 |  |  |  | 1174 |
| prime-gradient{"ends":1}/c-gpf | prime-landing{"ends":7}/prime-gradient | both | **0.18** | 0.5 | -0.1 |  |  |  | 6059 |
| prime-gradient{"ends":1}/c-spf | prime-landing{"ends":7}/prime-gradient | both | **0.16** | 0.4 | -0.1 |  |  |  | 5716 |
| prime-gradient{"ends":1}/prime | prime-landing{"ends":7}/prime-gradient | both | **0.12** | 0.4 | -0.1 |  |  |  | 5861 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **0.12** | 0.5 | -0.2 |  |  |  | 6025 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **0.10** | 0.4 | -0.2 |  |  |  | 5660 |
| prime-gradient{"ends":1,"side":-1}/prime | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **0.04** | 0.3 | -0.3 |  |  |  | 5808 |
| same-on-both-rulers{"T":-6}/m-gpf | treasure{"T":11,"k":2}/m-gpf | both | **-0.02** | -0.4 | 0.4 |  |  |  | 2164 |
| prime-gradient{"ends":1}/c-gpf | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **-0.05** | -0.1 | -0.0 |  |  |  | 4266 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-landing{"ends":7}/prime-gradient | both | **-0.05** | -0.1 | 0.0 |  |  |  | 4158 |
| same-on-both-rulers{"T":-6}/m-spf | treasure{"T":11,"k":2}/m-spf | both | **-0.06** | -0.5 | 0.4 |  |  |  | 1998 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-landing{"ends":7}/prime-gradient | both | **-0.10** | -0.2 | 0.0 |  |  |  | 3797 |
| prime-gradient{"ends":1}/c-spf | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **-0.10** | -0.2 | -0.0 |  |  |  | 3885 |
| prime-staircase{"ends":3}/first-prime | same-on-both-rulers{"T":-6}/prime-start | both | **-0.11** | -0.1 |  |  |  |  | 628 |
| prime-gradient{"ends":1}/prime | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **-0.12** | -0.2 | -0.1 |  |  |  | 4281 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":-13,"k":2}/prime-gradient | both | **-0.14** | 0.5 | -0.8 |  |  |  | 4132 |
| prime-landing{"ends":7}/m-spf | treasure{"T":-13,"k":2}/m-spf | both | **-0.14** | -1.9 | -1.1 | 2.6 |  |  | 850 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7,"side":-1}/m-spf | both | **-0.15** | 0.3 | -0.6 |  |  |  | 5135 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7}/m-spf | both | **-0.15** | 0.3 | -0.6 |  |  |  | 5040 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7,"side":-1}/m-gpf | both | **-0.16** | 0.3 | -0.6 |  |  |  | 5135 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7}/m-gpf | both | **-0.16** | 0.3 | -0.6 |  |  |  | 5040 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":-13,"k":2}/prime-gradient | both | **-0.17** | 0.5 | -0.8 |  |  |  | 4157 |
| prime-staircase{"ends":3,"side":-1}/first-prime | same-on-both-rulers{"T":6}/prime-start | both | **-0.17** | -0.2 |  |  |  |  | 590 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1,"side":-1}/prime | both | **-0.17** | 0.7 | -1.0 |  |  |  | 6422 |
| prime-gradient{"ends":1,"side":-1}/prime | prime-landing{"ends":7}/prime-gradient | both | **-0.18** | -0.2 | -0.1 |  |  |  | 4153 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":13,"k":2}/prime-gradient | both | **-0.25** | 0.5 | -1.0 |  |  |  | 4164 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":13,"k":2}/prime-gradient | both | **-0.27** | 0.4 | -1.0 |  |  |  | 4187 |
| prime-gradient{"ends":1,"side":-1}/cPrime | pythagorean-area/prime-height | both | **-0.37** | -0.2 | -0.5 |  |  |  | 3635 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":-13,"k":2}/prime-gradient | both | **-0.40** | 0.6 | -1.4 |  |  |  | 4588 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":13,"k":2}/prime-gradient | both | **-0.43** | 0.6 | -1.5 |  |  |  | 4671 |
| same-on-both-rulers{"T":6}/m-spf | treasure{"T":-13,"k":2}/m-spf | both | **-0.45** | -0.5 | -0.4 |  |  |  | 2065 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":-13,"k":2}/prime-gradient | both | **-0.46** | 0.4 | -1.3 |  |  |  | 4040 |
| prime-gradient{"ends":1}/cPrime | pythagorean-area/prime-height | both | **-0.47** | -0.2 | -0.7 |  |  |  | 3670 |
| divisibility-ladder/m-prime | prime-gradient{"ends":1,"side":-1}/cPrime | both | **-0.48** | 0.6 | -1.6 |  |  |  | 6178 |
| prime-gradient{"ends":1}/prime | treasure{"T":13,"k":2}/prime-gradient | both | **-0.51** | 0.4 | -1.4 |  |  |  | 4088 |
| same-on-both-rulers{"T":6}/m-gpf | treasure{"T":-13,"k":2}/m-gpf | both | **-0.51** | -0.5 | -0.5 |  |  |  | 2135 |
| divisibility-ladder/m-prime | treasure{"T":-13,"k":2}/prime-gradient | both | **-0.53** | -0.5 |  |  |  |  | 1456 |
| divisibility-ladder/m-prime | ruler/prime-gradient | both | **-0.53** | -0.5 |  |  |  |  | 2345 |
| divisibility-ladder/m-prime | treasure{"T":13,"k":2}/prime-gradient | both | **-0.54** | -0.5 |  |  |  |  | 1472 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7,"side":-1}/big-prime | both | **-0.57** | 0.1 | -1.2 |  |  |  | 4609 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7,"side":-1}/next-prime | both | **-0.61** | -0.0 | -1.2 |  |  |  | 4500 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7}/big-prime | both | **-0.64** | 0.1 | -1.3 |  |  |  | 4479 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7}/next-prime | both | **-0.71** | -0.1 | -1.3 |  |  |  | 4362 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | ruler/prime-gradient | both | **-0.72** | -0.7 |  |  |  |  | 2613 |
| same-on-both-rulers{"T":6}/m-spf | treasure{"T":-11,"k":2}/m-spf | both | **-0.74** | -0.6 | -0.9 |  |  |  | 1953 |
| divisibility-ladder/m-gpf | treasure{"T":-13,"k":2}/m-gpf | both | **-0.74** | -0.8 | -0.6 |  |  |  | 1320 |
| divisibility-ladder/m-gpf | treasure{"T":13,"k":2}/m-gpf | both | **-0.74** | -0.9 | -0.6 |  |  |  | 1298 |
| same-on-both-rulers{"T":6}/m-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **-0.76** | -0.6 | -0.9 |  |  |  | 1970 |
| prime-gradient{"ends":1}/c-gpf | ruler/prime-gradient | both | **-0.77** | -0.8 |  |  |  |  | 2519 |
| prime-gradient{"ends":1,"side":-1}/c-spf | ruler/prime-gradient | both | **-0.78** | -0.8 |  |  |  |  | 2406 |
| prime-gradient{"ends":1}/cPrime | same-on-both-rulers{"T":-6}/prime-start | both | **-0.82** | -0.9 | -0.7 |  |  |  | 2837 |
| prime-gradient{"ends":1}/c-spf | ruler/prime-gradient | both | **-0.82** | -0.8 |  |  |  |  | 2317 |
| prime-gradient{"ends":1}/cPrime | prime-landing{"ends":7,"side":-1}/prime-gradient | both | **-0.83** | -0.3 | -1.3 |  |  |  | 3813 |
| prime-gradient{"ends":1,"side":-1}/cPrime | ruler/prime-gradient | both | **-0.85** | -0.8 |  |  |  |  | 2451 |
| divisibility-ladder/m-prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-0.88** | -0.9 |  |  |  |  | 1130 |
| prime-gradient{"ends":1,"side":-1}/prime | ruler/prime-gradient | both | **-0.89** | -0.9 |  |  |  |  | 2430 |
| prime-gradient{"ends":1}/cPrime | ruler/prime-gradient | both | **-0.90** | -0.9 |  |  |  |  | 2349 |
| divisibility-ladder/m-prime | treasure{"T":11,"k":2}/prime-gradient | both | **-0.92** | -0.9 |  |  |  |  | 1112 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-landing{"ends":7}/prime-gradient | both | **-0.93** | -0.4 | -1.5 |  |  |  | 3697 |
| prime-gradient{"ends":1}/prime | ruler/prime-gradient | both | **-0.94** | -0.9 |  |  |  |  | 2348 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-13,"k":2}/prime-gradient | both | **-0.95** | -2.8 | -1.5 | 1.4 |  |  | 575 |
| same-on-both-rulers{"T":-6}/m-spf | treasure{"T":13,"k":2}/m-spf | both | **-0.98** | -0.7 | -1.3 |  |  |  | 1825 |
| divisibility-ladder/m-spf | treasure{"T":13,"k":2}/m-spf | both | **-0.98** | -0.5 | -1.5 |  |  |  | 1811 |
| same-on-both-rulers{"T":-6}/m-gpf | treasure{"T":13,"k":2}/m-gpf | both | **-1.00** | -0.6 | -1.4 |  |  |  | 1990 |
| divisibility-ladder/m-spf | treasure{"T":-13,"k":2}/m-spf | both | **-1.06** | -0.4 | -1.7 |  |  |  | 1871 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":-6}/prime-start | both | **-1.12** | -1.1 | -1.2 |  |  |  | 2687 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":11,"k":2}/prime-gradient | both | **-1.20** | -0.9 | -1.5 |  |  |  | 1750 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":-11,"k":2}/prime-gradient | both | **-1.21** | -0.9 | -1.5 |  |  |  | 1711 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":-11,"k":2}/prime-gradient | both | **-1.22** | -0.9 | -1.5 |  |  |  | 1746 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":11,"k":2}/prime-gradient | both | **-1.22** | -0.9 | -1.5 |  |  |  | 1778 |
| divisibility-ladder/m-spf | treasure{"T":11,"k":2}/m-spf | both | **-1.49** | -0.7 | -2.3 |  |  |  | 1498 |
| divisibility-ladder/m-spf | treasure{"T":-11,"k":2}/m-spf | both | **-1.50** | -0.6 | -2.4 |  |  |  | 1546 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":13,"k":2}/m-spf | both | **-1.60** | -1.9 | -1.3 |  |  |  | 852 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":13,"k":2}/m-gpf | both | **-1.64** | -1.9 | -1.4 |  |  |  | 893 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":11,"k":2}/m-spf | both | **-1.70** | -1.9 | -1.5 |  |  |  | 854 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":11,"k":2}/m-gpf | both | **-1.71** | -1.9 | -1.5 |  |  |  | 854 |
| divisibility-ladder/m-gpf | treasure{"T":11,"k":2}/m-gpf | both | **-1.76** | -1.0 | -2.5 |  |  |  | 1127 |
| prime-landing{"ends":7}/m-spf | treasure{"T":-11,"k":2}/m-spf | both | **-1.82** | -1.9 | -1.8 |  |  |  | 843 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **-1.83** | -1.9 | -1.8 |  |  |  | 843 |
| divisibility-ladder/m-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **-1.83** | -1.0 | -2.7 |  |  |  | 1147 |
| prime-gradient{"ends":1}/prime | treasure{"T":11,"k":2}/prime-gradient | both | **-1.90** | -1.1 | -2.7 |  |  |  | 1631 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":11,"k":2}/prime-gradient | both | **-1.95** | -1.1 | -2.8 |  |  |  | 1616 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.09** | -1.1 | -3.1 |  |  |  | 1586 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":11,"k":2}/prime-gradient | both | **-2.11** | -2.7 | -1.5 |  |  |  | 562 |
| prime-gradient{"ends":1}/cPrime | same-on-both-rulers{"T":6}/prime-start | both | **-2.14** | -1.3 | -3.0 |  |  |  | 2288 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.15** | -1.1 | -3.2 |  |  |  | 1572 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/prime-start | both | **-2.18** | -1.4 | -3.0 |  |  |  | 2192 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.19** | -2.6 | -1.7 |  |  |  | 572 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":13,"k":2}/prime-gradient | both | **-2.22** | -2.7 | -1.7 |  |  |  | 588 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":11,"k":2}/prime-gradient | both | **-3.74** | -3.7 |  |  |  |  | 327 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":11,"k":2}/prime-gradient | both | **-3.84** | -3.8 |  |  |  |  | 296 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-13,"k":2}/prime-gradient | both | **-3.87** | -3.9 |  |  |  |  | 316 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-11,"k":2}/prime-gradient | both | **-3.89** | -3.9 |  |  |  |  | 306 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-13,"k":2}/prime-gradient | both | **-3.90** | -3.9 |  |  |  |  | 299 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":13,"k":2}/prime-gradient | both | **-3.92** | -3.9 |  |  |  |  | 307 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-11,"k":2}/prime-gradient | both | **-3.99** | -4.0 |  |  |  |  | 280 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":13,"k":2}/prime-gradient | both | **-3.99** | -4.0 |  |  |  |  | 282 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":11,"k":2}/prime-gradient | both | **-4.08** | -4.1 |  |  |  |  | 276 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":11,"k":2}/prime-gradient | both | **-4.14** | -4.1 |  |  |  |  | 261 |
| prime-gradient{"ends":1}/prime | treasure{"T":-13,"k":2}/prime-gradient | both | **-4.14** | -4.1 |  |  |  |  | 278 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-13,"k":2}/prime-gradient | both | **-4.16** | -4.2 |  |  |  |  | 272 |
| prime-gradient{"ends":1}/prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-4.17** | -4.2 |  |  |  |  | 270 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-11,"k":2}/prime-gradient | both | **-4.22** | -4.2 |  |  |  |  | 257 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":13,"k":2}/prime-gradient | both | **-4.27** | -4.3 |  |  |  |  | 259 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":13,"k":2}/prime-gradient | both | **-4.30** | -4.3 |  |  |  |  | 250 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.55** | ≤-4.5 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.55** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3}/first-prime | both | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3}/first-prime | both | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.74** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3}/first-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3}/first-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3}/first-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3}/first-prime | both | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | whole-intercept/mc-spf | one | **-4.82** | ≤-4.8 |  |  |  |  | 0 |

### Aligned pairs (headline > 2), different families

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| smooth-crossing/shared | smooth-intercept/shared | neither | **8.27** | 4.6 | 6.3 | 8.2 | 10.1 | 12.0 | 37913 |
| smooth-square/shared | square-area/omega | one | **8.07** | 4.0 | 6.3 | 8.1 | 10.1 | 12.0 | 53135 |
| steady-gradient/gcd-c | whole-intercept/gcd-floor-m | neither | **7.99** | 3.9 | 5.9 | 8.1 | 10.0 | 12.0 | 58757 |
| smooth-gradient/shared | steady-gradient/gcd-c | neither | **7.72** | 4.0 | 6.0 | 7.5 | 9.5 | 11.5 | 35692 |
| smooth-gradient/shared | whole-intercept/gcd-floor-m | neither | **7.67** | 3.9 | 6.0 | 7.5 | 9.5 | 11.5 | 32283 |
| whole-area/gcd-x | whole-crossing/gcd-c | neither | **7.66** | 3.7 | 5.7 | 7.6 | 9.6 | 11.6 | 46974 |
| smooth-crossing/shared | whole-crossing/gcd-c | neither | **7.33** | 4.0 | 5.6 | 7.3 | 9.0 | 10.7 | 37973 |
| smooth-intercept/shared | whole-crossing/gcd-c | neither | **7.33** | 4.0 | 5.6 | 7.3 | 9.0 | 10.7 | 37953 |
| smooth-intercept/shared | whole-intercept/omega | neither | **7.29** | 3.6 | 5.3 | 7.3 | 9.2 | 11.0 | 21186 |
| smooth-crossing/shared | whole-intercept/omega | neither | **7.28** | 3.6 | 5.3 | 7.3 | 9.2 | 11.0 | 20845 |
| smooth-crossing/shared | whole-area/gcd-x | neither | **7.28** | 3.9 | 5.6 | 7.3 | 9.0 | 10.6 | 34848 |
| smooth-intercept/shared | whole-area/gcd-x | neither | **7.28** | 3.9 | 5.6 | 7.3 | 9.0 | 10.6 | 34842 |
| pythagorean-area/slanted-square | triangle-area{"A":6}/even | one | **7.22** | 4.0 | 6.1 | 8.0 | 10.8 |  | 47719 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/difference | neither | **7.22** | 2.0 | 5.3 | 8.0 | 8.9 | 11.8 | 8208 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/share-den | neither | **7.22** | 2.0 | 5.3 | 8.0 | 8.9 | 11.8 | 8208 |
| whole-crossing/gcd-c | whole-intercept/omega | neither | **6.89** | 3.1 | 5.1 | 6.9 | 8.8 | 10.6 | 23879 |
| whole-area/gcd-x | whole-intercept/omega | neither | **6.81** | 3.1 | 5.0 | 6.9 | 8.7 | 10.4 | 23004 |
| whole-area/gcd-den-m | whole-intercept/gcd-den-m | neither | **6.76** | 3.8 | 5.7 | 6.2 | 7.6 | 10.5 | 19884 |
| sunken-intercept/shared | whole-intercept/omega | neither | **6.71** | 3.0 | 4.9 | 6.7 | 8.5 | 10.4 | 24983 |
| sunken-intercept/shared | whole-crossing/gcd-c | neither | **6.61** | 2.5 | 4.6 | 6.6 | 8.7 | 10.7 | 22669 |
| smooth-crossing/shared | square-area/omega | one | **6.44** | 2.1 | 4.4 | 6.0 | 8.9 | 10.8 | 9873 |
| smooth-intercept/shared | square-area/omega | one | **6.44** | 2.1 | 4.4 | 6.0 | 8.9 | 10.8 | 9882 |
| sunken-intercept/shared | whole-area/gcd-x | neither | **6.39** | 2.3 | 4.4 | 6.4 | 8.5 | 10.4 | 20256 |
| square-area/omega | whole-area/gcd-x | one | **6.36** | 2.4 | 4.5 | 6.1 | 8.6 | 10.2 | 16667 |
| prime-landing{"ends":7}/big-prime | whole-intercept/spf | one | **6.35** | 1.6 | 4.4 | 8.1 | 11.2 |  | 5339 |
| prime-landing{"ends":7,"side":-1}/big-prime | whole-intercept/spf | one | **6.35** | 1.6 | 4.4 | 8.1 | 11.2 |  | 5307 |
| square-area/omega | whole-crossing/gcd-c | one | **6.24** | 2.1 | 4.4 | 6.0 | 8.5 | 10.2 | 14367 |
| smooth-square/shared | whole-area/gcd-x | neither | **6.16** | 2.3 | 4.6 | 6.2 | 8.0 | 9.7 | 16667 |
| smooth-crossing/shared | sunken-intercept/shared | neither | **6.15** | 2.7 | 4.4 | 6.2 | 7.9 | 9.7 | 16607 |
| smooth-intercept/shared | sunken-intercept/shared | neither | **6.15** | 2.7 | 4.4 | 6.2 | 7.9 | 9.7 | 16754 |
| smooth-crossing/shared | smooth-square/shared | neither | **6.13** | 2.0 | 4.5 | 6.1 | 8.1 | 9.9 | 9873 |
| smooth-intercept/shared | smooth-square/shared | neither | **6.13** | 2.0 | 4.5 | 6.1 | 8.1 | 9.9 | 9882 |
| euclid-steps/largest-quotient | pell-gradient{"D":1,"k":1}/pell-c | neither | **6.12** | 2.0 | 4.0 | 5.5 | 8.9 | 10.2 | 8208 |
| pythagorean-area/whole-legs | triangle-area{"A":6}/legs | one | **6.04** | 4.0 | 6.1 | 8.1 |  |  | 47074 |
| smooth-square/shared | whole-crossing/gcd-c | neither | **6.03** | 2.0 | 4.5 | 6.1 | 7.9 | 9.7 | 14367 |
| pythagorean-area/whole-legs | triangle-area{"A":6}/even | one | **6.03** | 4.0 | 6.0 | 8.0 |  |  | 47719 |
| pythagorean-area/slanted-square | triangle-area{"A":6}/legs | one | **6.03** | 4.0 | 6.1 | 8.0 |  |  | 47074 |
| pythagorean-area/prime-height | triangle-area{"A":6}/legs | one | **6.00** | 4.0 | 6.0 | 7.9 |  |  | 47047 |
| pythagorean-area/prime-height | triangle-area{"A":6}/even | one | **5.99** | 4.0 | 6.0 | 7.9 |  |  | 47047 |
| square-area/omega | whole-intercept/omega | one | **5.86** | 1.4 | 3.7 | 5.4 | 8.4 | 10.3 | 6954 |
| crossing-check{"k":2,"q":2}/size | whole-crossing/gcd-c | neither | **5.72** | 1.7 | 3.7 | 5.7 | 7.7 | 9.8 | 9041 |
| crossing-check{"k":2,"q":2}/size | smooth-crossing/shared | neither | **5.66** | 1.7 | 3.7 | 5.8 | 7.8 | 9.4 | 6144 |
| crossing-check{"k":2,"q":2}/size | smooth-intercept/shared | neither | **5.66** | 1.7 | 3.7 | 5.8 | 7.8 | 9.4 | 6144 |
| square-area/lpf | whole-crossing/k-gpf | both | **5.66** | 1.1 | 3.5 | 6.3 | 7.7 | 9.7 | 5352 |
| steady-gradient/gcd-c | steep-and-tall/shared | neither | **5.61** | 2.1 | 4.0 | 5.6 | 7.3 | 9.0 | 16908 |
| steep-and-tall/shared | whole-intercept/gcd-floor-m | neither | **5.60** | 2.0 | 4.1 | 5.6 | 7.3 | 9.0 | 16744 |
| smooth-gradient/shared | steep-and-tall/shared | neither | **5.54** | 2.1 | 4.0 | 5.6 | 7.2 | 8.8 | 8883 |
| smooth-square/shared | whole-intercept/omega | neither | **5.47** | 1.4 | 3.7 | 5.4 | 7.5 | 9.4 | 6954 |
| divisibility-ladder/steep | steady-gradient/gcd-c | one | **5.39** | 2.7 | 4.2 | 5.3 | 7.4 | 7.4 | 30734 |
| divisibility-ladder/steep | whole-intercept/gcd-floor-m | one | **5.38** | 2.7 | 4.2 | 5.3 | 7.4 | 7.4 | 30734 |
| divisibility-ladder/steep | smooth-gradient/shared | one | **5.31** | 3.1 | 4.8 | 5.2 | 7.1 | 6.3 | 21946 |
| divisibility-ladder/m-prime | whole-crossing/gcd-c | one | **5.30** | 2.4 | 3.9 | 5.3 | 6.6 | 8.3 | 15718 |
| whole-crossing/k-spf | whole-intercept/spf | one | **5.26** | 2.6 | 4.0 | 5.8 | 8.6 |  | 3959 |
| whole-crossing/m-spf | whole-intercept/mc-spf | one | **5.20** | 3.9 | 6.0 | 5.7 |  |  | 4404 |
| whole-at-t/gcd-c | whole-intercept/omega | neither | **5.17** | 2.5 | 3.4 | 4.7 | 6.5 | 8.7 | 13694 |
| square-area/omega | sunken-intercept/shared | one | **5.16** | 0.8 | 3.3 | 4.9 | 7.5 | 9.3 | 6874 |
| smooth-square/shared | square-area/lpf | one | **5.14** | 4.0 | 5.2 | 5.4 | 5.5 | 5.5 | 52883 |
| divisibility-ladder/m-spf | whole-crossing/gcd-c | one | **5.12** | 2.2 | 3.7 | 4.9 | 6.6 | 8.2 | 16188 |
| divisibility-ladder/m-spf | sunken-intercept/shared | one | **5.11** | 2.1 | 3.8 | 5.1 | 6.6 | 8.1 | 18035 |
| crossing-check{"k":2,"q":2}/size | whole-area/gcd-x | neither | **5.10** | 1.2 | 3.1 | 5.1 | 7.1 | 9.1 | 6335 |
| divisibility-ladder/m-prime | whole-area/gcd-x | one | **5.07** | 2.4 | 3.7 | 5.1 | 6.3 | 7.9 | 15783 |
| divisibility-ladder/m-gpf | sunken-intercept/shared | one | **5.07** | 2.1 | 3.5 | 5.1 | 6.4 | 8.2 | 17571 |
| divisibility-ladder/m-prime | sunken-intercept/shared | one | **5.06** | 2.2 | 3.6 | 5.0 | 6.3 | 8.1 | 16899 |
| divisibility-ladder/m-prime | whole-intercept/omega | one | **5.05** | 3.1 | 4.3 | 5.2 | 5.7 | 7.0 | 20842 |
| divisibility-ladder/m-spf | whole-intercept/omega | one | **5.05** | 2.9 | 4.4 | 5.2 | 5.8 | 6.9 | 21888 |
| divisibility-ladder/m-gpf | whole-intercept/omega | one | **5.05** | 3.0 | 4.3 | 5.2 | 5.7 | 7.0 | 21488 |
| divisibility-ladder/steep | sunken-intercept/shared | one | **5.04** | 2.0 | 3.5 | 5.1 | 6.4 | 8.2 | 18969 |
| divisibility-ladder/steep | whole-intercept/omega | one | **5.02** | 2.9 | 4.3 | 5.2 | 5.7 | 7.1 | 22801 |
| prime-landing{"ends":7,"side":-1}/m-spf | whole-intercept/mc-spf | one | **5.02** | 2.1 | 3.2 | 5.9 | 8.9 |  | 4018 |
| prime-landing{"ends":7,"side":-1}/m-gpf | whole-intercept/mc-spf | one | **5.02** | 2.1 | 3.2 | 5.9 | 8.9 |  | 4018 |
| divisibility-ladder/m-prime | smooth-crossing/shared | one | **5.01** | 2.7 | 4.2 | 5.2 | 5.8 | 7.2 | 12941 |
| divisibility-ladder/m-prime | smooth-intercept/shared | one | **5.01** | 2.7 | 4.2 | 5.2 | 5.8 | 7.2 | 13041 |
| whole-crossing/gcd-num-m | whole-intercept/omega | neither | **5.00** | 2.8 | 3.5 | 4.8 | 6.1 | 7.7 | 11403 |
| divisibility-ladder/m-gpf | whole-crossing/gcd-c | one | **4.99** | 2.3 | 3.2 | 4.9 | 6.3 | 8.3 | 15732 |
| divisibility-ladder/m-gpf | steady-gradient/gcd-c | one | **4.99** | 2.7 | 4.0 | 5.3 | 5.8 | 7.2 | 25863 |
| divisibility-ladder/m-gpf | whole-intercept/gcd-floor-m | one | **4.98** | 2.6 | 4.0 | 5.3 | 5.8 | 7.2 | 25863 |
| divisibility-ladder/steep | whole-crossing/gcd-c | one | **4.92** | 2.2 | 3.1 | 4.9 | 6.1 | 8.3 | 15727 |
| divisibility-ladder/m-spf | whole-area/gcd-x | one | **4.89** | 2.2 | 3.6 | 4.6 | 6.3 | 7.7 | 16254 |
| prime-landing{"ends":7}/m-spf | whole-intercept/mc-spf | one | **4.88** | 2.0 | 3.1 | 5.8 | 8.6 |  | 3842 |
| smooth-square/shared | sunken-intercept/shared | neither | **4.87** | 0.7 | 3.2 | 4.9 | 6.8 | 8.7 | 6875 |
| sunken-intercept/shared | whole-at-t/gcd-c | neither | **4.87** | 1.9 | 3.1 | 4.5 | 6.4 | 8.4 | 13916 |
| divisibility-ladder/m-prime | whole-at-t/gcd-c | one | **4.86** | 2.9 | 3.0 | 5.0 | 5.5 | 7.9 | 19343 |
| prime-landing{"ends":7}/m-gpf | whole-intercept/mc-spf | one | **4.84** | 2.0 | 3.1 | 5.8 | 8.5 |  | 3842 |
| smooth-gradient/shared | whole-intercept/omega | neither | **4.82** | 2.8 | 3.9 | 4.9 | 5.8 | 6.8 | 13538 |
| divisibility-ladder/m-gpf | smooth-gradient/shared | one | **4.80** | 3.0 | 4.6 | 5.2 | 4.9 | 6.3 | 17058 |
| divisibility-ladder/m-gpf | whole-area/gcd-x | one | **4.77** | 2.3 | 3.1 | 4.6 | 6.0 | 7.8 | 15798 |
| divisibility-ladder/m-spf | smooth-crossing/shared | one | **4.76** | 2.6 | 3.9 | 4.6 | 5.7 | 7.1 | 13277 |
| divisibility-ladder/m-spf | smooth-intercept/shared | one | **4.76** | 2.6 | 3.9 | 4.6 | 5.7 | 7.1 | 13375 |
| whole-area/gcd-x | whole-intercept/gcd-den-m | neither | **4.72** | 2.8 | 4.0 | 4.6 | 5.5 | 6.8 | 17572 |
| divisibility-ladder/steep | whole-area/gcd-x | one | **4.70** | 2.2 | 3.0 | 4.6 | 5.9 | 7.9 | 15792 |
| smooth-gradient/shared | steady-gradient/divisors | neither | **4.66** | 2.8 | 3.7 | 4.7 | 5.5 | 6.6 | 20886 |
| divisibility-ladder/m-spf | steady-gradient/gcd-c | one | **4.64** | 2.6 | 3.4 | 5.3 | 5.2 | 6.8 | 26045 |
| smooth-gradient/shared | whole-crossing/gcd-num-m | neither | **4.64** | 2.5 | 3.2 | 4.7 | 5.7 | 7.1 | 6356 |
| divisibility-ladder/m-spf | whole-intercept/gcd-floor-m | one | **4.64** | 2.6 | 3.4 | 5.3 | 5.1 | 6.8 | 26045 |
| prime-staircase{"ends":3}/first-prime | whole-intercept/spf | one | **4.63** | -0.2 | 5.7 | 7.6 | 5.6 |  | 605 |
| prime-staircase{"ends":3}/last-prime | whole-intercept/spf | one | **4.63** | -0.2 | 5.7 | 7.6 | 5.6 |  | 605 |
| pell-gradient{"D":3,"k":0}/pell-c | target-gradient/gcd-tops | neither | **4.63** | 3.1 | 5.5 | 5.3 |  |  | 20085 |
| divisibility-ladder/m-gpf | smooth-crossing/shared | one | **4.62** | 2.6 | 3.4 | 4.6 | 5.2 | 7.2 | 12951 |
| divisibility-ladder/m-gpf | smooth-intercept/shared | one | **4.62** | 2.6 | 3.4 | 4.6 | 5.2 | 7.2 | 13048 |
| divisibility-ladder/steep | whole-at-t/gcd-c | one | **4.61** | 2.9 | 3.3 | 3.3 | 5.6 | 8.0 | 23263 |
| divisibility-ladder/m-gpf | whole-at-t/gcd-c | one | **4.59** | 2.9 | 3.2 | 3.3 | 5.7 | 7.9 | 19832 |
| sunken-intercept/shared | whole-crossing/gcd-num-m | neither | **4.59** | 2.0 | 3.1 | 4.5 | 6.0 | 7.3 | 10861 |
| steady-gradient/divisors | whole-intercept/gcd-floor-m | neither | **4.57** | 2.2 | 3.4 | 4.6 | 5.7 | 7.0 | 28704 |
| whole-crossing/gcd-num-m | whole-intercept/gcd-floor-m | neither | **4.56** | 2.1 | 2.9 | 4.6 | 6.0 | 7.2 | 9362 |
| steady-gradient/gcd-c | whole-crossing/gcd-num-m | neither | **4.56** | 2.0 | 2.9 | 4.7 | 6.0 | 7.2 | 9051 |
| divisibility-ladder/steep | smooth-crossing/shared | one | **4.54** | 2.5 | 3.3 | 4.6 | 5.1 | 7.2 | 12948 |
| divisibility-ladder/steep | smooth-intercept/shared | one | **4.54** | 2.5 | 3.3 | 4.6 | 5.1 | 7.2 | 13060 |
| square-area/lpf | whole-area/gcd-x | one | **4.54** | 2.4 | 4.1 | 5.0 | 5.3 | 5.9 | 16667 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-intercept/spf | one | **4.51** | -0.3 | 5.6 | 7.5 | 5.1 |  | 579 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-intercept/spf | one | **4.51** | -0.3 | 5.6 | 7.5 | 5.1 |  | 579 |
| pell-gradient{"D":3,"k":0}/difference | target-gradient/gcd-tops | neither | **4.51** | 3.1 | 5.5 | 5.0 |  |  | 14662 |
| pell-gradient{"D":3,"k":0}/share-den | target-gradient/gcd-tops | neither | **4.50** | 3.1 | 5.5 | 5.0 |  |  | 14662 |
| pell-gradient{"D":3,"k":0}/pell-c | target-gradient/same-den | neither | **4.49** | 3.1 | 5.2 | 5.2 |  |  | 20085 |
| divisibility-ladder/m-spf | whole-at-t/gcd-c | one | **4.49** | 2.7 | 2.8 | 3.3 | 5.9 | 7.8 | 19343 |
| square-area/lpf | whole-crossing/gcd-c | one | **4.47** | 2.1 | 4.0 | 5.0 | 5.4 | 5.9 | 14367 |
| divisibility-ladder/steep | steep-and-tall/shared | one | **4.44** | 1.6 | 3.3 | 4.2 | 6.6 | 6.5 | 12703 |
| divisibility-ladder/m-prime | steady-gradient/gcd-c | one | **4.37** | 2.7 | 3.5 | 4.2 | 4.8 | 6.7 | 24817 |
| divisibility-ladder/m-spf | smooth-gradient/shared | one | **4.37** | 2.9 | 3.4 | 5.2 | 4.3 | 6.1 | 17119 |
| divisibility-ladder/m-prime | whole-intercept/gcd-floor-m | one | **4.36** | 2.7 | 3.5 | 4.2 | 4.8 | 6.7 | 24817 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/omega | neither | **4.36** | 0.3 | 2.3 | 4.4 | 6.5 | 8.2 | 2593 |
| pell-gradient{"D":3,"k":0}/difference | target-gradient/same-den | neither | **4.33** | 3.1 | 5.2 | 4.7 |  |  | 14662 |
| pell-gradient{"D":3,"k":0}/share-den | target-gradient/same-den | neither | **4.33** | 3.1 | 5.2 | 4.7 |  |  | 14662 |
| m-meets-c/size | whole-intercept/mc-spf | neither | **4.31** | 0.3 | 3.4 | 5.7 | 7.9 |  | 917 |
| divisibility-ladder/m-prime | smooth-gradient/shared | one | **4.31** | 3.1 | 4.2 | 4.1 | 3.9 | 6.2 | 17058 |
| smooth-gradient/shared | whole-at-t/gcd-c | neither | **4.30** | 3.6 | 4.6 | 4.8 | 4.4 | 4.0 | 22478 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **4.26** | 3.3 | 4.4 | 5.0 |  |  | 24666 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **4.26** | 3.3 | 4.4 | 5.0 |  |  | 24666 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **4.24** | 3.3 | 4.4 | 5.0 |  |  | 24666 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | whole-intercept/mc-spf | one | **4.23** | 1.2 | 3.1 | 4.9 | 7.7 |  | 2238 |
| crossing-check{"k":2,"q":2}/size | sunken-intercept/shared | neither | **4.18** | 0.1 | 2.1 | 4.1 | 6.2 | 8.4 | 3548 |
| whole-area/gcd-x | whole-crossing/k-gpf | one | **4.17** | 2.6 | 3.6 | 4.5 | 4.9 | 5.2 | 16661 |
| steady-gradient/gcd-c | whole-intercept/omega | neither | **4.17** | 2.2 | 3.3 | 4.2 | 5.1 | 6.1 | 18724 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **4.16** | 3.3 | 4.4 | 4.8 |  |  | 24414 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":2,"k":0}/difference | neither | **4.15** | 3.3 | 4.4 | 4.7 |  |  | 24414 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **4.15** | 3.3 | 4.4 | 4.7 |  |  | 24414 |
| divisibility-ladder/m-gpf | steep-and-tall/shared | one | **4.10** | 1.5 | 3.2 | 4.2 | 5.5 | 6.1 | 10451 |
| prime-landing{"ends":7}/prime-gradient | whole-intercept/mc-spf | one | **4.10** | 1.1 | 3.0 | 4.8 | 7.5 |  | 2133 |
| whole-crossing/k-gpf | whole-intercept/spf | one | **4.10** | 1.7 | 2.8 | 4.3 | 7.6 |  | 3502 |
| prime-landing{"ends":7,"side":-1}/next-prime | whole-intercept/spf | one | **4.09** | 2.3 | 4.6 | 3.0 | 6.5 |  | 8480 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-intercept/mc-spf | one | **4.09** | 3.2 | 4.5 | 4.5 |  |  | 2130 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-intercept/mc-spf | one | **4.09** | 3.2 | 4.5 | 4.5 |  |  | 2130 |
| smooth-gradient/shared | sunken-intercept/shared | neither | **4.08** | 2.0 | 3.1 | 4.2 | 4.9 | 6.1 | 12253 |
| sunken-intercept/shared | whole-intercept/gcd-floor-m | neither | **4.04** | 1.9 | 2.9 | 4.1 | 5.1 | 6.2 | 21927 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | whole-intercept/spf | one | **4.04** | 2.3 | 4.4 | 3.0 | 6.4 |  | 8629 |
| prime-landing{"ends":7}/prime-gradient | whole-intercept/spf | one | **4.03** | 2.3 | 4.4 | 3.1 | 6.3 |  | 8585 |
| prime-staircase{"ends":3}/first-prime | whole-intercept/mc-spf | one | **4.02** | 3.2 | 4.4 | 4.4 |  |  | 2106 |
| prime-staircase{"ends":3}/last-prime | whole-intercept/mc-spf | one | **4.02** | 3.2 | 4.4 | 4.4 |  |  | 2106 |
| farey-neighbours/bottoms | m-meets-c/size | neither | **4.00** | 4.0 |  |  |  |  | 664 |
| steady-gradient/gcd-c | sunken-intercept/shared | neither | **4.00** | 1.8 | 2.9 | 4.0 | 5.1 | 6.2 | 19825 |
| farey-neighbours/bottoms | m-meets-c/meetPrime | neither | **3.99** | 4.0 |  |  |  |  | 664 |
| prime-landing{"ends":7,"side":-1}/m-gpf | whole-intercept/spf | one | **3.98** | 2.1 | 4.5 | 3.1 | 6.2 |  | 7553 |
| egyptian-line/bottom | m-meets-c/meetPrime | neither | **3.98** | 2.8 | 5.1 |  |  |  | 9877 |
| prime-landing{"ends":7,"side":-1}/m-spf | whole-intercept/spf | one | **3.97** | 2.1 | 4.5 | 3.1 | 6.1 |  | 7553 |
| crossing-check{"k":2,"q":6}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.95** | 3.4 | 4.5 |  |  |  | 23974 |
| prime-landing{"ends":7}/m-gpf | whole-intercept/spf | one | **3.94** | 2.1 | 4.5 | 3.1 | 6.0 |  | 7642 |
| crossing-check{"k":2,"q":2}/size | divisibility-ladder/m-prime | one | **3.93** | 0.9 | 1.3 | 4.7 | 5.1 | 7.6 | 4270 |
| prime-landing{"ends":7}/m-spf | whole-intercept/spf | one | **3.92** | 2.1 | 4.5 | 3.1 | 5.9 |  | 7642 |
| euclid-steps/largest-quotient | long-division/m-bottom-spf | neither | **3.92** | 2.9 | 4.9 |  |  |  | 17296 |
| exact-change/prime-coins | same-on-both-rulers{"T":6}/steep | one | **3.88** | 2.2 | 3.4 | 2.5 | 7.5 |  | 14492 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":6,"k":0}/pell-c | neither | **3.88** | 3.0 | 4.2 | 4.5 |  |  | 20095 |
| crossing-check{"k":2,"q":6}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **3.87** | 3.2 | 4.5 |  |  |  | 15212 |
| crossing-check{"k":2,"q":6}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **3.87** | 3.2 | 4.5 |  |  |  | 15212 |
| crossing-check{"k":2,"q":6}/size | pell-gradient{"D":3,"k":0}/difference | neither | **3.87** | 3.2 | 4.5 |  |  |  | 15263 |
| crossing-check{"k":2,"q":6}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **3.86** | 3.2 | 4.5 |  |  |  | 15263 |
| smooth-crossing/shared | whole-crossing/gcd-num-m | neither | **3.85** | 2.8 | 3.1 | 3.7 | 4.4 | 5.2 | 11307 |
| smooth-intercept/shared | whole-crossing/gcd-num-m | neither | **3.85** | 2.8 | 3.1 | 3.7 | 4.4 | 5.2 | 11301 |
| divisibility-ladder/steep | whole-crossing/gcd-num-m | one | **3.85** | 1.9 | 2.9 | 4.4 | 4.5 | 5.7 | 7857 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.84** | 3.0 | 4.1 | 4.3 |  |  | 20437 |
| smooth-square/shared | square-area/spf | one | **3.84** | 4.0 | 3.7 |  |  |  | 52513 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":6,"k":0}/pell-c | neither | **3.83** | 3.0 | 4.0 | 4.5 |  |  | 19883 |
| euclid-steps/largest-quotient | prime-slope/twins | neither | **3.80** | 3.8 |  |  |  |  | 6424 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **3.78** | 3.1 | 4.1 | 4.1 |  |  | 11870 |
| crossing-check{"k":3,"q":4}/whole | near-point/gcd-x | neither | **3.77** | 2.9 | 4.4 | 4.0 |  |  | 7823 |
| crossing-check{"k":2,"q":6}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **3.76** | 3.4 | 4.5 | 3.4 |  |  | 24225 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":6,"k":0}/difference | neither | **3.76** | 3.1 | 4.1 | 4.1 |  |  | 11870 |
| crossing-check{"k":3,"q":4}/whole | near-point/lattice | neither | **3.75** | 2.8 | 4.4 | 4.0 |  |  | 7861 |
| whole-area/gcd-x | whole-crossing/gcd-num-m | neither | **3.75** | 2.6 | 3.0 | 3.7 | 4.4 | 5.1 | 14470 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **3.74** | 2.7 | 4.0 | 4.5 |  |  | 17783 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":6,"k":0}/share-den | neither | **3.73** | 3.1 | 4.0 | 4.1 |  |  | 11704 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.72** | 3.0 | 4.1 | 4.1 |  |  | 20851 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":6,"k":0}/difference | neither | **3.71** | 3.1 | 3.9 | 4.1 |  |  | 11704 |
| divisibility-ladder/m-gpf | whole-crossing/gcd-num-m | one | **3.69** | 2.0 | 3.1 | 4.4 | 3.4 | 5.7 | 7849 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":7,"k":0}/pell-c | neither | **3.68** | 2.7 | 3.9 | 4.5 |  |  | 17400 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.68** | 3.2 | 4.1 |  |  |  | 22693 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **3.68** | 3.2 | 4.1 |  |  |  | 22693 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **3.68** | 3.2 | 4.1 |  |  |  | 22693 |
| divisibility-ladder/m-spf | whole-crossing/gcd-num-m | one | **3.68** | 1.9 | 3.0 | 4.4 | 3.6 | 5.5 | 7999 |
| pythagorean-area/prime-height | triangle-area{"A":8}/even | one | **3.66** | 3.7 |  |  |  |  | 37565 |
| pythagorean-area/prime-height | triangle-area{"A":8}/legs | one | **3.65** | 3.7 |  |  |  |  | 36557 |
| divisibility-ladder/m-spf | steep-and-tall/shared | one | **3.64** | 1.6 | 2.7 | 4.2 | 4.2 | 5.6 | 10775 |
| pythagorean-area/whole-legs | triangle-area{"A":8}/even | one | **3.63** | 3.6 |  |  |  |  | 37674 |
| pythagorean-area/slanted-square | triangle-area{"A":8}/even | one | **3.63** | 3.6 |  |  |  |  | 37674 |
| pythagorean-area/whole-legs | triangle-area{"A":8}/legs | one | **3.63** | 3.6 |  |  |  |  | 36666 |
| pythagorean-area/slanted-square | triangle-area{"A":8}/legs | one | **3.62** | 3.6 |  |  |  |  | 36666 |
| steady-gradient/gcd-c | whole-at-t/gcd-c | neither | **3.62** | 2.9 | 4.0 | 4.3 | 3.8 | 3.2 | 28674 |
| divisibility-ladder/m-prime | smooth-square/shared | one | **3.62** | 1.1 | 3.3 | 4.2 | 6.0 |  | 5967 |
| whole-at-t/gcd-c | whole-intercept/gcd-floor-m | neither | **3.62** | 2.9 | 4.0 | 4.3 | 3.8 | 3.2 | 29154 |
| divisibility-ladder/m-prime | square-area/omega | both | **3.61** | 1.1 | 3.4 | 4.2 | 5.8 |  | 5965 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":2,"k":0}/difference | neither | **3.60** | 3.0 | 4.1 |  |  |  | 20437 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **3.60** | 3.0 | 4.1 |  |  |  | 20437 |
| euclid-steps/largest-quotient | pell-gradient{"D":7,"k":0}/difference | neither | **3.59** | -0.5 | 3.3 | 8.0 |  |  | 2162 |
| square-area/spf | whole-crossing/k-gpf | both | **3.55** | 1.2 | 2.6 | 4.2 | 6.2 |  | 5352 |
| pell-gradient{"D":1,"k":1}/share-den | target-gradient/gcd-tops | neither | **3.54** | 2.1 | 4.3 | 4.2 |  |  | 11431 |
| pell-gradient{"D":1,"k":1}/difference | target-gradient/gcd-tops | neither | **3.54** | 2.1 | 4.3 | 4.2 |  |  | 11431 |
| prime-landing{"ends":7}/big-prime | whole-crossing/k-gpf | both | **3.52** | 1.3 | 1.9 | 7.4 |  |  | 4872 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":2,"k":0}/difference | neither | **3.49** | 3.2 | 4.1 | 3.1 |  |  | 22690 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **3.49** | 3.2 | 4.1 | 3.1 |  |  | 22690 |
| sunken-intercept/shared | whole-crossing/k-gpf | one | **3.48** | 2.0 | 3.0 | 3.7 | 4.1 | 4.5 | 12696 |
| divisibility-ladder/m-prime | steep-and-tall/shared | one | **3.47** | 1.5 | 3.1 | 3.9 | 3.4 | 5.5 | 9308 |
| divisibility-ladder/m-prime | whole-crossing/gcd-num-m | one | **3.46** | 2.1 | 2.8 | 3.7 | 3.2 | 5.5 | 7839 |
| crossing-check{"k":2,"q":2}/size | divisibility-ladder/m-spf | one | **3.45** | 0.7 | 1.7 | 1.8 | 5.5 | 7.5 | 4358 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/twins | neither | **3.42** | 3.4 |  |  |  |  | 5205 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/twins | neither | **3.42** | 3.4 |  |  |  |  | 5205 |
| prime-staircase{"ends":3,"side":-1}/first-prime | square-area/spf | both | **3.42** | 0.1 | 1.9 | 4.9 | 6.7 |  | 742 |
| prime-staircase{"ends":3,"side":-1}/last-prime | square-area/spf | both | **3.42** | 0.1 | 1.9 | 4.9 | 6.7 |  | 742 |
| smooth-intercept/shared | whole-area/gcd-den-m | neither | **3.40** | 3.2 | 3.3 | 3.5 | 3.7 |  | 14536 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **3.40** | 3.2 | 4.1 | 2.9 |  |  | 22690 |
| crossing-check{"k":3,"q":4}/size | near-point/gcd-x | neither | **3.40** | 1.8 | 4.4 | 4.1 |  |  | 7829 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-13,"k":2}/m-spf | both | **3.40** | 0.5 | 1.0 | 4.3 | 7.8 |  | 4112 |
| crossing-check{"k":3,"q":4}/size | near-point/lattice | neither | **3.39** | 1.8 | 4.4 | 4.0 |  |  | 7867 |
| square-area/lpf | sunken-intercept/shared | one | **3.38** | 0.8 | 2.9 | 3.9 | 4.4 | 4.9 | 6874 |
| smooth-crossing/shared | whole-area/gcd-den-m | neither | **3.37** | 3.2 | 3.3 | 3.5 | 3.5 |  | 14501 |
| crossing-check{"k":2,"q":2}/size | divisibility-ladder/m-gpf | one | **3.33** | 0.8 | 1.1 | 1.8 | 5.3 | 7.7 | 4276 |
| steep-and-tall/shared | whole-intercept/omega | neither | **3.31** | 1.3 | 2.3 | 3.3 | 4.3 | 5.3 | 8927 |
| steady-gradient/divisors | steep-and-tall/shared | neither | **3.31** | 1.3 | 2.3 | 3.4 | 4.3 | 5.3 | 13964 |
| prime-landing{"ends":7}/next-prime | whole-intercept/spf | one | **3.29** | 2.3 | 4.6 | 3.0 |  |  | 8425 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-crossing/m-spf | both | **3.27** | 0.3 | 0.4 | 4.2 | 8.2 |  | 1276 |
| crossing-check{"k":2,"q":2}/size | divisibility-ladder/steep | one | **3.27** | 0.6 | 1.1 | 1.8 | 5.1 | 7.7 | 4270 |
| prime-gradient{"ends":1,"side":-1}/cPrime | whole-crossing/m-spf | both | **3.27** | 0.2 | 0.5 | 4.1 | 8.3 |  | 1229 |
| prime-gradient{"ends":1}/cPrime | whole-crossing/m-spf | both | **3.26** | 0.2 | 0.5 | 4.1 | 8.3 |  | 1247 |
| prime-gradient{"ends":1}/c-spf | whole-crossing/m-spf | both | **3.26** | 0.3 | 0.3 | 4.2 | 8.2 |  | 1286 |
| whole-crossing/gcd-c | whole-intercept/gcd-den-m | neither | **3.25** | 2.4 | 3.2 | 3.4 | 4.1 |  | 15001 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **3.24** | 2.7 | 3.7 |  |  |  | 18467 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-13,"k":2}/prime-gradient | both | **3.24** | 0.6 | 1.1 | 3.9 | 7.3 |  | 4206 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":7,"k":0}/difference | neither | **3.22** | 2.7 | 3.7 |  |  |  | 17256 |
| smooth-crossing/shared | whole-intercept/gcd-den-m | neither | **3.22** | 2.6 | 3.3 | 3.2 | 3.8 |  | 11745 |
| smooth-intercept/shared | whole-intercept/gcd-den-m | neither | **3.22** | 2.6 | 3.3 | 3.2 | 3.8 |  | 11849 |
| pell-gradient{"D":1,"k":1}/share-den | target-gradient/same-den | neither | **3.22** | 2.1 | 4.0 | 3.5 |  |  | 11431 |
| pell-gradient{"D":1,"k":1}/difference | target-gradient/same-den | neither | **3.22** | 2.1 | 4.0 | 3.5 |  |  | 11431 |
| pythagorean-area/slanted-square | triangle-area{"A":4}/even | one | **3.21** | 3.2 |  |  |  |  | 28528 |
| pythagorean-area/whole-legs | triangle-area{"A":4}/even | one | **3.21** | 3.2 |  |  |  |  | 28404 |
| prime-staircase{"ends":3,"side":-1}/first-prime | square-area/lpf | both | **3.21** | 0.1 | 1.9 | 4.8 | 6.1 |  | 743 |
| prime-staircase{"ends":3,"side":-1}/last-prime | square-area/lpf | both | **3.21** | 0.1 | 1.9 | 4.8 | 6.1 |  | 743 |
| pythagorean-area/slanted-square | triangle-area{"A":4}/legs | one | **3.21** | 3.2 |  |  |  |  | 28633 |
| pythagorean-area/whole-legs | triangle-area{"A":4}/legs | one | **3.20** | 3.2 |  |  |  |  | 28509 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":-13,"k":2}/m-spf | both | **3.20** | 0.8 | 0.9 | 3.4 | 7.7 |  | 5126 |
| prime-landing{"ends":7}/m-spf | treasure{"T":13,"k":2}/m-spf | both | **3.20** | 0.6 | 0.8 | 4.0 | 7.5 |  | 4230 |
| pythagorean-area/prime-height | triangle-area{"A":4}/even | one | **3.19** | 3.2 |  |  |  |  | 27275 |
| pythagorean-area/prime-height | triangle-area{"A":4}/legs | one | **3.19** | 3.2 |  |  |  |  | 27380 |
| euclid-steps/largest-quotient | pell-gradient{"D":7,"k":0}/share-den | neither | **3.18** | -0.5 | 2.1 | 8.0 |  |  | 2179 |
| long-division/c-period | prime-slope/square-sum | neither | **3.16** | 3.2 |  |  |  |  | 4238 |
| long-division/m-top | prime-slope/square-sum | neither | **3.16** | 3.2 |  |  |  |  | 4238 |
| divisibility-ladder/m-spf | square-area/omega | both | **3.15** | 0.9 | 2.4 | 4.6 | 4.7 |  | 5979 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/twins | neither | **3.14** | 3.1 |  |  |  |  | 6695 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/twins | neither | **3.14** | 3.1 |  |  |  |  | 6695 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/twins | neither | **3.14** | 3.1 |  |  |  |  | 6695 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":7,"k":0}/share-den | neither | **3.14** | 2.8 | 3.5 |  |  |  | 18046 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":5,"k":0}/pell-c | neither | **3.14** | 2.6 | 4.1 | 2.7 |  |  | 14076 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":5,"k":0}/difference | neither | **3.13** | 2.6 | 4.1 | 2.7 |  |  | 13731 |
| crossing-check{"k":1,"q":6}/whole | pell-gradient{"D":5,"k":0}/share-den | neither | **3.13** | 2.6 | 4.1 | 2.7 |  |  | 13731 |
| divisibility-ladder/steep | square-area/omega | both | **3.13** | 1.0 | 2.5 | 4.6 | 4.5 |  | 6714 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":7,"k":0}/difference | neither | **3.13** | 2.7 | 3.5 |  |  |  | 16883 |
| prime-landing{"ends":7,"side":-1}/next-prime | whole-intercept/mc-spf | one | **3.12** | 1.3 | 3.3 | 4.8 |  |  | 2445 |
| whole-area/gcd-den-m | whole-crossing/gcd-c | neither | **3.11** | 3.0 | 3.1 | 3.2 | 3.3 | 3.0 | 19057 |
| pell-gradient{"D":2,"k":0}/difference | target-gradient/gcd-tops | neither | **3.09** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/share-den | target-gradient/gcd-tops | neither | **3.09** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/pell-c | target-gradient/gcd-tops | neither | **3.09** | 3.1 |  |  |  |  | 22420 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":5,"k":0}/pell-c | neither | **3.08** | 2.6 | 3.9 | 2.7 |  |  | 13924 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":5,"k":0}/difference | neither | **3.08** | 2.6 | 3.9 | 2.7 |  |  | 13580 |
| crossing-check{"k":1,"q":6}/size | pell-gradient{"D":5,"k":0}/share-den | neither | **3.08** | 2.6 | 3.9 | 2.7 |  |  | 13580 |
| pell-gradient{"D":2,"k":0}/difference | target-gradient/same-den | neither | **3.07** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/share-den | target-gradient/same-den | neither | **3.07** | 3.1 |  |  |  |  | 22420 |
| pell-gradient{"D":2,"k":0}/pell-c | target-gradient/same-den | neither | **3.07** | 3.1 |  |  |  |  | 22420 |
| crossing-check{"k":2,"q":6}/size | target-gradient/same-den | neither | **3.06** | 2.3 | 3.8 |  |  |  | 12131 |
| divisibility-ladder/m-spf | smooth-square/shared | one | **3.06** | 0.9 | 2.2 | 4.5 | 4.6 |  | 5982 |
| crossing-check{"k":2,"q":6}/whole | target-gradient/same-den | neither | **3.05** | 2.3 | 3.8 |  |  |  | 11839 |
| divisibility-ladder/m-gpf | square-area/omega | both | **3.05** | 1.0 | 2.1 | 4.6 | 4.5 |  | 6124 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":-13,"k":2}/prime-gradient | both | **3.04** | 0.8 | 1.0 | 3.1 | 7.2 |  | 5223 |
| prime-staircase{"ends":3}/first-prime | square-area/lpf | both | **3.03** | 0.1 | 1.6 | 4.5 | 5.8 |  | 758 |
| prime-staircase{"ends":3}/last-prime | square-area/lpf | both | **3.03** | 0.1 | 1.6 | 4.5 | 5.8 |  | 758 |
| long-division/m-bottom-spf | prime-slope/square-sum | neither | **3.03** | 3.2 | 2.9 |  |  |  | 4238 |
| crossing-check{"k":1,"q":2}/size | near-point/gcd-x | neither | **3.03** | 2.5 | 3.5 |  |  |  | 14331 |
| crossing-check{"k":1,"q":2}/size | near-point/lattice | neither | **3.02** | 2.5 | 3.5 |  |  |  | 14512 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":13,"k":2}/m-spf | both | **3.02** | 0.8 | 0.7 | 3.2 | 7.4 |  | 5379 |
| prime-landing{"ends":7}/m-spf | treasure{"T":13,"k":2}/prime-gradient | both | **3.02** | 0.6 | 0.9 | 3.6 | 6.9 |  | 4333 |
| pell-gradient{"D":7,"k":0}/difference | whole-crossing/m-spf | one | **3.02** | 3.0 |  |  |  |  | 7201 |
| crossing-check{"k":2,"q":2}/size | whole-crossing/k-gpf | one | **3.01** | 0.8 | 2.7 | 4.0 | 4.6 |  | 3232 |
| prime-landing{"ends":7}/next-prime | whole-intercept/mc-spf | one | **3.01** | 1.2 | 3.1 | 4.7 |  |  | 2275 |
| pell-gradient{"D":5,"k":0}/difference | target-gradient/same-den | neither | **3.01** | 3.0 |  |  |  |  | 18730 |
| pell-gradient{"D":5,"k":0}/share-den | target-gradient/same-den | neither | **3.01** | 3.0 |  |  |  |  | 18730 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-crossing/m-spf | one | **3.00** | 3.0 |  |  |  |  | 7201 |
| crossing-check{"k":1,"q":2}/whole | near-point/gcd-x | neither | **2.99** | 2.5 | 3.5 |  |  |  | 14514 |
| crossing-check{"k":1,"q":2}/whole | near-point/lattice | neither | **2.99** | 2.5 | 3.5 |  |  |  | 14696 |
| crossing-check{"k":3,"q":2}/whole | ruler/square-area | one | **2.98** | 0.7 | 1.2 | 3.1 | 6.9 |  | 2473 |
| square-area/omega | whole-crossing/gcd-num-m | one | **2.98** | 2.0 | 1.3 | 3.8 | 4.8 |  | 6833 |
| pell-gradient{"D":5,"k":0}/difference | target-gradient/gcd-tops | neither | **2.98** | 3.0 |  |  |  |  | 18049 |
| pell-gradient{"D":5,"k":0}/share-den | target-gradient/gcd-tops | neither | **2.98** | 3.0 |  |  |  |  | 18049 |
| crossing-check{"k":3,"q":4}/whole | triangle-area{"A":6}/even | neither | **2.97** | 0.7 | 0.9 | 1.8 | 8.5 |  | 1967 |
| pell-gradient{"D":7,"k":0}/share-den | whole-crossing/m-spf | one | **2.97** | 3.0 |  |  |  |  | 7201 |
| pell-gradient{"D":5,"k":0}/pell-c | target-gradient/same-den | neither | **2.97** | 3.0 |  |  |  |  | 18730 |
| euclid-steps/largest-quotient | long-division/c-period | neither | **2.95** | 2.9 |  |  |  |  | 17296 |
| euclid-steps/largest-quotient | long-division/m-top | neither | **2.95** | 2.9 |  |  |  |  | 17296 |
| pell-gradient{"D":5,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.94** | 2.9 |  |  |  |  | 18049 |
| smooth-square/shared | whole-intercept/gcd-den-m | neither | **2.94** | 2.1 | 1.3 | 2.7 | 5.6 |  | 8827 |
| divisibility-ladder/steep | smooth-square/shared | one | **2.93** | 0.9 | 2.0 | 4.5 | 4.3 |  | 6767 |
| square-area/omega | whole-intercept/gcd-den-m | one | **2.93** | 2.1 | 1.3 | 2.7 | 5.7 |  | 8823 |
| crossing-check{"k":2,"q":6}/size | target-gradient/gcd-tops | neither | **2.92** | 2.3 | 3.5 |  |  |  | 12004 |
| divisibility-ladder/m-gpf | smooth-square/shared | one | **2.92** | 1.0 | 1.7 | 4.5 | 4.4 |  | 6136 |
| crossing-check{"k":2,"q":6}/whole | target-gradient/gcd-tops | neither | **2.91** | 2.3 | 3.5 |  |  |  | 11712 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":5,"k":0}/pell-c | neither | **2.91** | 2.7 | 3.1 |  |  |  | 13424 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":5,"k":0}/difference | neither | **2.91** | 2.7 | 3.1 |  |  |  | 13021 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":5,"k":0}/share-den | neither | **2.91** | 2.7 | 3.1 |  |  |  | 13021 |
| exact-change/big-bill | same-on-both-rulers{"T":6}/m-gpf | one | **2.89** | 2.3 | 3.5 |  |  |  | 16493 |
| exact-change/big-bill | same-on-both-rulers{"T":6}/m-spf | one | **2.88** | 2.3 | 3.5 |  |  |  | 16068 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.88** | 3.0 | 2.8 |  |  |  | 16669 |
| exact-change/big-piles | same-on-both-rulers{"T":6}/m-gpf | one | **2.88** | 2.5 | 3.3 |  |  |  | 15409 |
| exact-change/big-piles | same-on-both-rulers{"T":6}/m-spf | one | **2.87** | 2.4 | 3.3 |  |  |  | 15009 |
| egyptian-line/bottom | farey-neighbours/bottoms | neither | **2.87** | 2.9 |  |  |  |  | 170 |
| sunken-intercept/shared | whole-intercept/gcd-den-m | neither | **2.87** | 1.6 | 2.4 | 2.8 | 3.6 | 3.9 | 12330 |
| crossing-check{"k":3,"q":6}/whole | target-gradient/same-den | neither | **2.86** | 2.4 | 3.3 |  |  |  | 12625 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/twins | neither | **2.86** | 2.9 |  |  |  |  | 5743 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/twins | neither | **2.86** | 2.9 |  |  |  |  | 5743 |
| crossing-check{"k":3,"q":6}/size | target-gradient/same-den | neither | **2.84** | 2.4 | 3.3 |  |  |  | 12443 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/twins | neither | **2.84** | 2.8 |  |  |  |  | 5743 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":13,"k":2}/prime-gradient | both | **2.84** | 0.9 | 0.8 | 2.8 | 6.8 |  | 5485 |
| steady-gradient/gcd-c | whole-intercept/mc-spf | neither | **2.83** | 3.2 | 3.1 | 2.2 |  |  | 8982 |
| prime-landing{"ends":7}/m-spf | triangle-area{"A":12}/even | one | **2.82** | 1.4 | 1.7 | 5.3 |  |  | 7849 |
| prime-landing{"ends":7}/m-gpf | triangle-area{"A":12}/even | one | **2.81** | 1.4 | 1.7 | 5.3 |  |  | 7849 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **2.81** | 3.0 | 4.1 | 1.3 |  |  | 20851 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **2.81** | 3.0 | 4.1 | 1.3 |  |  | 20851 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":5,"k":0}/difference | neither | **2.79** | 2.6 | 3.0 |  |  |  | 13623 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":5,"k":0}/share-den | neither | **2.79** | 2.6 | 3.0 |  |  |  | 13623 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/twins | neither | **2.79** | 2.8 |  |  |  |  | 5205 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":5,"k":0}/pell-c | neither | **2.79** | 2.6 | 3.0 |  |  |  | 14025 |
| smooth-square/shared | whole-area/gcd-den-m | neither | **2.79** | 2.4 | 1.7 | 3.4 | 3.6 |  | 9248 |
| exact-change/prime-coins | same-on-both-rulers{"T":6}/whole-values | one | **2.79** | 2.2 | 3.4 | 2.8 |  |  | 14492 |
| prime-gradient{"ends":1}/c-gpf | whole-crossing/m-spf | both | **2.78** | 0.5 | 0.3 | 4.2 | 6.1 |  | 1598 |
| prime-landing{"ends":7}/m-spf | triangle-area{"A":12}/legs | one | **2.78** | 1.3 | 1.7 | 5.3 |  |  | 6991 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.78** | 2.9 | 2.6 |  |  |  | 17241 |
| prime-landing{"ends":7}/m-gpf | triangle-area{"A":12}/legs | one | **2.78** | 1.3 | 1.7 | 5.3 |  |  | 6991 |
| exact-change/big-bill | same-on-both-rulers{"T":6}/whole-values | one | **2.78** | 2.3 | 3.5 | 2.6 |  |  | 16027 |
| exact-change/prime-coins | same-on-both-rulers{"T":6}/m-gpf | one | **2.78** | 2.2 | 3.4 |  |  |  | 14884 |
| pell-gradient{"D":2,"k":0}/pell-c | ruler/prime-gradient | one | **2.77** | 0.3 | 5.3 |  |  |  | 3755 |
| pell-gradient{"D":2,"k":0}/difference | ruler/prime-gradient | one | **2.77** | 0.3 | 5.3 |  |  |  | 3755 |
| pell-gradient{"D":2,"k":0}/share-den | ruler/prime-gradient | one | **2.77** | 0.3 | 5.3 |  |  |  | 3755 |
| pell-gradient{"D":2,"k":0}/pell-c | ruler/square-area | one | **2.77** | 0.3 | 5.3 |  |  |  | 3755 |
| pell-gradient{"D":2,"k":0}/difference | ruler/square-area | one | **2.77** | 0.3 | 5.3 |  |  |  | 3755 |
| pell-gradient{"D":2,"k":0}/share-den | ruler/square-area | one | **2.77** | 0.3 | 5.3 |  |  |  | 3755 |
| exact-change/prime-coins | same-on-both-rulers{"T":6}/m-spf | one | **2.77** | 2.2 | 3.4 |  |  |  | 14512 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-crossing/m-spf | both | **2.77** | 0.5 | 0.4 | 4.2 | 6.0 |  | 1534 |
| triangle-area{"A":12}/legs | whole-crossing/k-spf | one | **2.77** | 2.3 | 2.8 | 3.3 |  |  | 5082 |
| square-area/omega | whole-area/gcd-den-m | one | **2.77** | 2.4 | 1.7 | 3.4 | 3.5 |  | 9248 |
| pell-gradient{"D":1,"k":1}/pell-c | target-gradient/gcd-tops | neither | **2.75** | 2.1 | 4.5 | 1.7 |  |  | 11547 |
| exact-change/big-piles | same-on-both-rulers{"T":6}/prime-start | one | **2.75** | 2.5 | 3.0 |  |  |  | 15222 |
| exact-change/big-piles | same-on-both-rulers{"T":6}/whole-values | one | **2.75** | 2.4 | 3.2 | 2.6 |  |  | 14976 |
| crossing-check{"k":3,"q":4}/whole | pythagorean-area/slanted-square | one | **2.74** | 0.7 | 0.8 | 1.8 | 7.7 |  | 1976 |
| egyptian-line/bottom | m-meets-c/size | neither | **2.73** | 2.7 |  |  |  |  | 9301 |
| exact-change/big-bill | same-on-both-rulers{"T":6}/steep | one | **2.73** | 2.3 | 3.5 | 2.4 |  |  | 16027 |
| prime-gradient{"ends":1}/cPrime | steep-and-tall/shared | one | **2.73** | 2.3 | 3.9 | 1.9 |  |  | 21186 |
| triangle-area{"A":12}/even | whole-crossing/k-spf | one | **2.72** | 2.2 | 2.8 | 3.2 |  |  | 5082 |
| pythagorean-area/prime-height | triangle-area{"A":12}/even | one | **2.72** | 2.7 |  |  |  |  | 19341 |
| exact-change/big-bill | same-on-both-rulers{"T":6}/whole-lamp | one | **2.71** | 2.3 | 3.3 | 2.6 |  |  | 15965 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":6,"k":0}/pell-c | neither | **2.70** | 2.9 | 2.5 |  |  |  | 16617 |
| pythagorean-area/whole-legs | triangle-area{"A":12}/even | one | **2.69** | 2.7 |  |  |  |  | 19449 |
| pythagorean-area/prime-height | triangle-area{"A":12}/legs | one | **2.69** | 2.7 |  |  |  |  | 17834 |
| pythagorean-area/slanted-square | triangle-area{"A":12}/even | one | **2.69** | 2.7 |  |  |  |  | 19449 |
| exact-change/big-piles | same-on-both-rulers{"T":6}/whole-lamp | one | **2.68** | 2.4 | 3.2 | 2.4 |  |  | 14916 |
| prime-landing{"ends":7,"side":-1}/m-gpf | triangle-area{"A":12}/even | one | **2.67** | 1.4 | 1.5 | 5.1 |  |  | 7834 |
| prime-landing{"ends":7,"side":-1}/m-spf | triangle-area{"A":12}/even | one | **2.67** | 1.4 | 1.5 | 5.1 |  |  | 7834 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.67** | 2.6 | 2.8 |  |  |  | 9112 |
| pythagorean-area/whole-legs | triangle-area{"A":12}/legs | one | **2.66** | 2.7 |  |  |  |  | 17943 |
| crossing-check{"k":3,"q":4}/whole | pell-gradient{"D":2,"k":0}/difference | neither | **2.66** | 3.3 | 2.8 | 1.9 |  |  | 10660 |
| crossing-check{"k":3,"q":4}/whole | pell-gradient{"D":2,"k":0}/share-den | neither | **2.66** | 3.3 | 2.8 | 1.9 |  |  | 10660 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.66** | 2.6 | 2.7 |  |  |  | 9112 |
| pythagorean-area/slanted-square | triangle-area{"A":12}/legs | one | **2.66** | 2.7 |  |  |  |  | 17943 |
| exact-change/big-piles | same-on-both-rulers{"T":6}/steep | one | **2.66** | 2.4 | 3.3 | 2.2 |  |  | 14976 |
| smooth-crossing/shared | square-area/lpf | one | **2.65** | 2.1 | 3.2 |  |  |  | 9873 |
| exact-change/prime-coins | same-on-both-rulers{"T":6}/whole-lamp | one | **2.65** | 2.2 | 3.1 | 2.6 |  |  | 14434 |
| smooth-intercept/shared | square-area/lpf | one | **2.65** | 2.1 | 3.2 |  |  |  | 9882 |
| prime-gradient{"ends":1}/prime | steady-gradient/divisors | one | **2.65** | 1.6 | 3.7 |  |  |  | 15065 |
| prime-landing{"ends":7,"side":-1}/m-gpf | triangle-area{"A":12}/legs | one | **2.64** | 1.3 | 1.5 | 5.1 |  |  | 6946 |
| prime-landing{"ends":7,"side":-1}/m-spf | triangle-area{"A":12}/legs | one | **2.64** | 1.3 | 1.5 | 5.1 |  |  | 6946 |
| pell-gradient{"D":6,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.63** | 1.9 | 1.9 | 4.2 |  |  | 672 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/steep | both | **2.63** | 2.1 | 3.1 |  |  |  | 12679 |
| prime-gradient{"ends":1,"side":-1}/prime | steady-gradient/divisors | one | **2.62** | 1.6 | 3.6 |  |  |  | 14986 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/prime-start | both | **2.61** | 2.1 | 3.1 |  |  |  | 12792 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.61** | 3.2 | 2.1 |  |  |  | 14439 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.61** | 3.2 | 2.0 |  |  |  | 14439 |
| prime-staircase{"ends":3,"side":-1}/near-miss | same-on-both-rulers{"T":-6}/whole-values | both | **2.61** | 1.1 | 1.1 | 5.6 |  |  | 4716 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **2.60** | 2.8 | 2.4 |  |  |  | 8260 |
| prime-gradient{"ends":1}/c-gpf | steep-and-tall/shared | one | **2.60** | 2.2 | 3.8 | 1.8 |  |  | 19927 |
| near-point/gcd-x | target-gradient/same-den | neither | **2.59** | 2.0 | 2.8 | 3.0 |  |  | 9861 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.59** | 2.5 | 2.7 |  |  |  | 9653 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.59** | 3.2 | 2.0 |  |  |  | 14186 |
| prime-gradient{"ends":1}/c-spf | steep-and-tall/shared | one | **2.59** | 2.2 | 3.8 | 1.8 |  |  | 18534 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.59** | 2.5 | 2.6 |  |  |  | 9653 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.59** | 3.2 | 2.0 |  |  |  | 14186 |
| near-point/lattice | target-gradient/same-den | neither | **2.58** | 2.0 | 2.8 | 3.0 |  |  | 10062 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":6,"k":0}/pell-c | neither | **2.57** | 2.8 | 2.3 |  |  |  | 17216 |
| exact-change/big-bill | prime-landing{"ends":7}/m-spf | one | **2.57** | 2.2 | 3.0 |  |  |  | 14093 |
| crossing-check{"k":3,"q":4}/whole | pell-gradient{"D":2,"k":0}/pell-c | neither | **2.57** | 3.3 | 2.8 | 1.7 |  |  | 10660 |
| exact-change/big-bill | prime-landing{"ends":7}/next-prime | one | **2.57** | 2.1 | 3.0 |  |  |  | 14275 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/steep | both | **2.56** | 2.1 | 3.1 |  |  |  | 12015 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.56** | 2.9 | 2.2 |  |  |  | 12394 |
| prime-landing{"ends":7}/next-prime | triangle-area{"A":12}/even | one | **2.56** | 1.4 | 1.7 | 4.5 |  |  | 8210 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.56** | 2.9 | 2.2 |  |  |  | 12394 |
| exact-change/big-bill | prime-landing{"ends":7}/m-gpf | one | **2.56** | 2.2 | 3.0 |  |  |  | 14093 |
| prime-staircase{"ends":3}/near-miss | same-on-both-rulers{"T":6}/whole-values | both | **2.56** | 1.1 | 1.1 | 5.5 |  |  | 4730 |
| pell-gradient{"D":6,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.55** | 1.9 | 1.6 | 4.2 |  |  | 672 |
| crossing-check{"k":3,"q":6}/whole | near-point/lattice | neither | **2.55** | 2.4 | 2.7 |  |  |  | 12769 |
| crossing-check{"k":3,"q":6}/whole | near-point/gcd-x | neither | **2.55** | 2.4 | 2.7 |  |  |  | 12552 |
| prime-staircase{"ends":3,"side":-1}/near-miss | same-on-both-rulers{"T":-6}/whole-lamp | both | **2.55** | 1.1 | 1.1 | 5.5 |  |  | 4681 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/whole-lamp | both | **2.54** | 2.1 | 2.9 |  |  |  | 12660 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/prime-start | both | **2.54** | 2.1 | 3.0 |  |  |  | 12110 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/steep | both | **2.54** | 2.1 | 3.0 |  |  |  | 12395 |
| prime-landing{"ends":7}/next-prime | triangle-area{"A":12}/legs | one | **2.53** | 1.3 | 1.7 | 4.6 |  |  | 7318 |
| crossing-check{"k":3,"q":6}/size | near-point/lattice | neither | **2.53** | 2.4 | 2.7 |  |  |  | 12700 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/steep | both | **2.53** | 2.1 | 3.0 |  |  |  | 12397 |
| crossing-check{"k":3,"q":6}/size | near-point/gcd-x | neither | **2.53** | 2.4 | 2.7 |  |  |  | 12483 |
| exact-change/big-piles | triangle-area{"A":18}/even | neither | **2.53** | 2.0 | 3.1 |  |  |  | 9485 |
| exact-change/big-piles | triangle-area{"A":18}/legs | neither | **2.53** | 2.0 | 3.1 |  |  |  | 9276 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.53** | 2.9 | 2.2 |  |  |  | 12030 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.53** | 2.9 | 2.2 |  |  |  | 12030 |
| prime-staircase{"ends":3}/first-prime | steep-and-tall/shared | one | **2.52** | 2.3 | 2.7 |  |  |  | 3861 |
| prime-staircase{"ends":3}/last-prime | steep-and-tall/shared | one | **2.52** | 2.3 | 2.7 |  |  |  | 3861 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/steep | both | **2.52** | 2.1 | 3.0 |  |  |  | 11018 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/prime-start | both | **2.52** | 2.1 | 2.9 |  |  |  | 12487 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":6,"k":0}/difference | neither | **2.52** | 2.8 | 2.2 |  |  |  | 8260 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/steep | both | **2.51** | 1.9 | 3.1 |  |  |  | 10762 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/prime-start | both | **2.51** | 2.1 | 2.9 |  |  |  | 12517 |
| prime-staircase{"ends":3,"side":-1}/near-miss | same-on-both-rulers{"T":-6}/prime-start | both | **2.51** | 1.1 | 1.2 | 5.3 |  |  | 4811 |
| crossing-check{"k":1,"q":2}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.51** | 2.8 | 2.2 |  |  |  | 16761 |
| prime-landing{"ends":7}/prime-gradient | triangle-area{"A":12}/even | one | **2.50** | 1.4 | 1.6 | 4.5 |  |  | 8263 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/steep | both | **2.50** | 1.9 | 3.1 |  |  |  | 10762 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/prime-start | both | **2.50** | 2.1 | 2.9 |  |  |  | 11115 |
| smooth-gradient/shared | square-area/omega | one | **2.50** | 0.8 | 2.9 | 2.3 | 4.1 |  | 3303 |
| crossing-check{"k":3,"q":2}/whole | near-point/lattice | neither | **2.50** | 2.5 |  |  |  |  | 8405 |
| crossing-check{"k":3,"q":2}/whole | near-point/gcd-x | neither | **2.49** | 2.5 |  |  |  |  | 8248 |
| prime-staircase{"ends":3}/near-miss | same-on-both-rulers{"T":6}/whole-lamp | both | **2.49** | 1.1 | 1.1 | 5.3 |  |  | 4706 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/prime-start | both | **2.49** | 1.9 | 3.0 |  |  |  | 10859 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-13,"k":2}/m-spf | both | **2.49** | 0.1 | 2.9 | 4.5 |  |  | 740 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-13,"k":2}/m-spf | both | **2.49** | 0.1 | 2.9 | 4.5 |  |  | 740 |
| prime-staircase{"ends":3,"side":-1}/near-miss | same-on-both-rulers{"T":-6}/steep | both | **2.49** | 1.1 | 1.1 | 5.3 |  |  | 4726 |
| ruler/far | whole-crossing/k-gpf | both | **2.49** | 0.1 | 1.9 | 3.5 | 4.4 |  | 2559 |
| exact-change/big-bill | prime-landing{"ends":7}/big-prime | one | **2.48** | 2.1 | 2.9 |  |  |  | 13005 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/prime-start | both | **2.48** | 1.9 | 3.0 |  |  |  | 10859 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/matching-c | neither | **2.48** | 2.5 |  |  |  |  | 7658 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/matching-c | neither | **2.48** | 2.5 |  |  |  |  | 7658 |
| whole-crossing/gcd-num-m | whole-intercept/mc-spf | neither | **2.48** | 1.5 | 1.9 | 4.1 |  |  | 1562 |
| prime-landing{"ends":7}/prime-gradient | triangle-area{"A":12}/legs | one | **2.48** | 1.3 | 1.6 | 4.5 |  |  | 7374 |
| prime-staircase{"ends":3}/near-miss | same-on-both-rulers{"T":6}/prime-start | both | **2.48** | 1.1 | 1.2 | 5.2 |  |  | 4817 |
| pell-gradient{"D":6,"k":0}/pell-c | target-gradient/same-den | neither | **2.47** | 2.5 |  |  |  |  | 12722 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-13,"k":2}/prime-terms | both | **2.47** | 0.1 | 3.3 | 4.1 |  |  | 763 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-13,"k":2}/prime-terms | both | **2.47** | 0.1 | 3.3 | 4.1 |  |  | 763 |
| crossing-check{"k":1,"q":2}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.47** | 2.8 | 2.2 |  |  |  | 16182 |
| square-area/spf | whole-crossing/k-spf | both | **2.47** | -0.1 | 2.2 | 5.3 |  |  | 1201 |
| square-area/lpf | whole-intercept/omega | one | **2.47** | 1.4 | 2.7 | 2.9 | 2.8 |  | 6954 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":3,"k":0}/difference | neither | **2.46** | 3.1 | 1.9 |  |  |  | 13257 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-13,"k":2}/square-start | both | **2.46** | 0.0 | 2.9 | 4.5 |  |  | 740 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-13,"k":2}/square-start | both | **2.46** | 0.0 | 2.9 | 4.5 |  |  | 740 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":3,"k":0}/share-den | neither | **2.46** | 3.1 | 1.9 |  |  |  | 13257 |
| m-meets-c/size | smooth-gradient/shared | neither | **2.46** | -0.6 | 1.4 | 3.7 | 5.4 |  | 893 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/whole-lamp | both | **2.46** | 2.1 | 2.9 |  |  |  | 12006 |
| exact-change/big-bill | same-on-both-rulers{"T":6}/prime-start | one | **2.46** | 2.3 | 3.3 | 1.8 |  |  | 16294 |
| whole-area/gcd-den-m | whole-intercept/omega | neither | **2.46** | 2.2 | 2.4 | 2.4 | 2.7 |  | 9858 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":6,"k":0}/share-den | neither | **2.45** | 2.6 | 2.3 |  |  |  | 8260 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":3,"k":0}/difference | neither | **2.45** | 3.1 | 1.8 |  |  |  | 13290 |
| smooth-square/shared | whole-crossing/gcd-num-m | neither | **2.45** | 2.0 | 1.0 | 3.1 | 3.7 |  | 6833 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":13,"k":2}/m-spf | both | **2.45** | 0.0 | 3.0 | 4.3 |  |  | 760 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":13,"k":2}/m-spf | both | **2.45** | 0.0 | 3.0 | 4.3 |  |  | 760 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":3,"k":0}/share-den | neither | **2.45** | 3.1 | 1.8 |  |  |  | 13290 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/whole-lamp | both | **2.44** | 2.1 | 2.8 |  |  |  | 12376 |
| square-area/spf | whole-intercept/spf | one | **2.44** | -0.1 | 2.2 | 5.3 |  |  | 1540 |
| prime-gradient{"ends":1}/prime | steep-and-tall/shared | one | **2.44** | 2.2 | 3.1 | 2.0 |  |  | 19640 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/steep | both | **2.44** | 2.0 | 2.9 |  |  |  | 10283 |
| exact-change/big-piles | prime-staircase{"ends":3}/first-prime | one | **2.44** | 2.1 | 2.8 |  |  |  | 2255 |
| exact-change/big-piles | prime-staircase{"ends":3}/last-prime | one | **2.44** | 2.1 | 2.8 |  |  |  | 2255 |
| prime-staircase{"ends":3}/near-miss | same-on-both-rulers{"T":6}/steep | both | **2.44** | 1.1 | 1.1 | 5.1 |  |  | 4740 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/whole-lamp | both | **2.44** | 2.1 | 2.8 |  |  |  | 12387 |
| pell-gradient{"D":6,"k":0}/pell-c | target-gradient/gcd-tops | neither | **2.43** | 2.4 |  |  |  |  | 12055 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-13,"k":2}/m-gpf | both | **2.43** | 0.0 | 2.8 | 4.5 |  |  | 740 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-13,"k":2}/m-gpf | both | **2.43** | 0.0 | 2.8 | 4.5 |  |  | 740 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/whole-values | both | **2.43** | 2.1 | 2.7 |  |  |  | 12678 |
| pell-gradient{"D":1,"k":1}/pell-c | target-gradient/same-den | neither | **2.43** | 2.1 | 4.2 | 1.0 |  |  | 11547 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/whole-lamp | both | **2.43** | 2.1 | 2.8 |  |  |  | 10996 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/steep | both | **2.43** | 1.9 | 3.0 |  |  |  | 10037 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":13,"k":2}/square-start | both | **2.42** | 0.0 | 3.0 | 4.3 |  |  | 760 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":13,"k":2}/square-start | both | **2.42** | 0.0 | 3.0 | 4.3 |  |  | 760 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/steep | both | **2.42** | 1.9 | 3.0 |  |  |  | 10037 |
| prime-landing{"ends":7,"side":-1}/next-prime | triangle-area{"A":12}/even | one | **2.42** | 1.5 | 1.5 | 4.3 |  |  | 8271 |
| square-area/lpf | whole-crossing/k-spf | both | **2.42** | -0.1 | 2.2 | 5.2 |  |  | 1201 |
| m-meets-c/meetPrime | whole-intercept/mc-spf | neither | **2.42** | 0.3 | 2.2 | 4.8 |  |  | 917 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/whole-lamp | both | **2.42** | 1.9 | 2.9 |  |  |  | 10741 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/prime-start | both | **2.41** | 2.0 | 2.9 |  |  |  | 10381 |
| exact-change/big-bill | prime-landing{"ends":7}/prime-gradient | one | **2.41** | 2.0 | 2.9 |  |  |  | 12726 |
| m-meets-c/size | steady-gradient/gcd-c | neither | **2.41** | -0.6 | 1.4 | 3.4 | 5.4 |  | 1667 |
| prime-gradient{"ends":1}/c-gpf | smooth-gradient/shared | one | **2.41** | 1.8 | 3.0 |  |  |  | 7693 |
| exact-change/big-bill | triangle-area{"A":18}/even | neither | **2.41** | 1.8 | 3.0 |  |  |  | 11045 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/whole-lamp | both | **2.41** | 1.9 | 2.9 |  |  |  | 10741 |
| exact-change/big-bill | triangle-area{"A":18}/legs | neither | **2.41** | 1.8 | 3.0 |  |  |  | 10806 |
| prime-landing{"ends":7}/prime-gradient | steep-and-tall/shared | one | **2.41** | 2.3 | 2.6 |  |  |  | 18076 |
| prime-gradient{"ends":1}/c-spf | smooth-gradient/shared | one | **2.40** | 1.8 | 3.0 |  |  |  | 7234 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/prime-start | both | **2.40** | 1.8 | 3.0 |  |  |  | 10132 |
| m-meets-c/size | whole-intercept/gcd-floor-m | neither | **2.40** | -0.7 | 1.4 | 3.4 | 5.4 |  | 1656 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":13,"k":2}/prime-terms | both | **2.40** | 0.1 | 3.2 | 3.9 |  |  | 793 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":13,"k":2}/prime-terms | both | **2.40** | 0.1 | 3.2 | 3.9 |  |  | 793 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | smooth-gradient/shared | one | **2.40** | 1.7 | 3.1 |  |  |  | 7520 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/prime-start | both | **2.40** | 1.8 | 2.9 |  |  |  | 10132 |
| target-gradient/gcd-tops | whole-crossing/gcd-num-m | neither | **2.39** | 1.6 | 2.9 | 2.7 |  |  | 5066 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/m-spf | both | **2.39** | 2.1 | 2.6 |  |  |  | 12695 |
| prime-landing{"ends":7,"side":-1}/next-prime | triangle-area{"A":12}/legs | one | **2.39** | 1.3 | 1.5 | 4.3 |  |  | 7341 |
| prime-gradient{"ends":1,"side":-1}/c-spf | smooth-gradient/shared | one | **2.39** | 1.7 | 3.1 |  |  |  | 7065 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":13,"k":2}/m-gpf | both | **2.39** | 0.0 | 2.9 | 4.3 |  |  | 760 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":13,"k":2}/m-gpf | both | **2.39** | 0.0 | 2.9 | 4.3 |  |  | 760 |
| prime-landing{"ends":7}/next-prime | same-on-both-rulers{"T":6}/m-gpf | both | **2.39** | 2.1 | 2.6 |  |  |  | 12852 |
| prime-landing{"ends":7,"side":-1}/big-prime | sunken-intercept/shared | one | **2.39** | 1.9 | 2.9 |  |  |  | 16442 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-at-t/gcd-den-m | neither | **2.38** | 1.8 | 3.0 |  |  |  | 1157 |
| pell-gradient{"D":2,"k":0}/difference | whole-at-t/gcd-den-m | neither | **2.38** | 1.8 | 3.0 |  |  |  | 1157 |
| pell-gradient{"D":2,"k":0}/share-den | whole-at-t/gcd-den-m | neither | **2.38** | 1.8 | 3.0 |  |  |  | 1157 |
| crossing-check{"k":3,"q":6}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.37** | 2.7 | 2.0 |  |  |  | 15698 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/whole-values | both | **2.37** | 2.1 | 2.7 |  |  |  | 12013 |
| square-area/lpf | whole-intercept/spf | one | **2.37** | -0.1 | 2.1 | 5.1 |  |  | 1542 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":6,"k":0}/difference | neither | **2.36** | 2.6 | 2.1 |  |  |  | 8260 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **2.36** | 0.7 | 4.0 |  |  |  | 1380 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-staircase{"ends":3,"side":-1}/last-prime | both | **2.36** | 0.7 | 4.0 |  |  |  | 1380 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **2.36** | 0.8 | 4.0 |  |  |  | 1380 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **2.36** | 0.8 | 4.0 |  |  |  | 1380 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | triangle-area{"A":12}/even | one | **2.35** | 1.5 | 1.4 | 4.2 |  |  | 8271 |
| crossing-check{"k":3,"q":6}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.35** | 2.7 | 2.0 |  |  |  | 15447 |
| exact-change/big-bill | whole-crossing/k-spf | one | **2.35** | 1.5 | 2.7 | 2.8 |  |  | 3453 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/whole-values | both | **2.35** | 2.1 | 2.6 |  |  |  | 12394 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-13,"k":2}/prime-gradient | both | **2.34** | 0.1 | 2.9 | 4.1 |  |  | 740 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-13,"k":2}/prime-gradient | both | **2.34** | 0.1 | 2.9 | 4.1 |  |  | 740 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/whole-lamp | both | **2.34** | 2.0 | 2.7 |  |  |  | 10273 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/whole-values | both | **2.33** | 2.1 | 2.6 |  |  |  | 12394 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **2.33** | 0.7 | 4.0 |  |  |  | 1380 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **2.33** | 0.7 | 4.0 |  |  |  | 1380 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/m-spf | both | **2.33** | 2.1 | 2.6 |  |  |  | 12032 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/whole-lamp | both | **2.33** | 1.9 | 2.8 |  |  |  | 10027 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | triangle-area{"A":12}/legs | one | **2.32** | 1.3 | 1.4 | 4.3 |  |  | 7339 |
| prime-landing{"ends":7,"side":-1}/next-prime | same-on-both-rulers{"T":-6}/m-gpf | both | **2.32** | 2.1 | 2.6 |  |  |  | 12172 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/whole-lamp | both | **2.32** | 1.9 | 2.8 |  |  |  | 10027 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/whole-values | both | **2.32** | 2.1 | 2.6 |  |  |  | 11017 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/m-spf | both | **2.32** | 2.1 | 2.5 |  |  |  | 12414 |
| pell-gradient{"D":7,"k":0}/difference | whole-intercept/mc-spf | neither | **2.32** | 2.3 |  |  |  |  | 4001 |
| prime-landing{"ends":7}/m-spf | treasure{"T":11,"k":2}/m-spf | both | **2.32** | 0.7 | 1.2 | 5.0 |  |  | 4555 |
| egyptian-line/bottom | farey-neighbours/mediant-x | neither | **2.32** | 2.3 |  |  |  |  | 5995 |
| crossing-check{"k":3,"q":6}/size | prime-slope/twins | neither | **2.31** | 2.3 |  |  |  |  | 3581 |
| exact-change/prime-coins | triangle-area{"A":18}/legs | neither | **2.31** | 1.7 | 2.9 |  |  |  | 8756 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":11,"k":2}/m-spf | both | **2.31** | 0.7 | 1.2 | 5.0 |  |  | 4555 |
| exact-change/prime-coins | triangle-area{"A":18}/even | neither | **2.31** | 1.7 | 2.9 |  |  |  | 8919 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | same-on-both-rulers{"T":-6}/m-gpf | both | **2.31** | 2.1 | 2.5 |  |  |  | 12581 |
| prime-landing{"ends":7}/m-spf | treasure{"T":11,"k":2}/m-gpf | both | **2.31** | 0.7 | 1.2 | 5.0 |  |  | 4555 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/whole-values | both | **2.31** | 1.9 | 2.7 |  |  |  | 10762 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":11,"k":2}/m-gpf | both | **2.31** | 0.7 | 1.2 | 5.0 |  |  | 4555 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":13,"k":2}/prime-gradient | both | **2.30** | 0.0 | 2.9 | 3.9 |  |  | 760 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":13,"k":2}/prime-gradient | both | **2.30** | 0.0 | 2.9 | 3.9 |  |  | 760 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/whole-values | both | **2.30** | 1.9 | 2.7 |  |  |  | 10762 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/m-spf | both | **2.30** | 2.1 | 2.5 |  |  |  | 12411 |
| crossing-check{"k":3,"q":6}/whole | prime-slope/twins | neither | **2.30** | 2.3 |  |  |  |  | 3586 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-intercept/mc-spf | neither | **2.30** | 2.3 |  |  |  |  | 4001 |
| prime-landing{"ends":7}/prime-gradient | same-on-both-rulers{"T":6}/m-gpf | both | **2.29** | 2.1 | 2.5 |  |  |  | 12516 |
| crossing-check{"k":2,"q":6}/whole | prime-slope/twins | neither | **2.29** | 2.3 |  |  |  |  | 3462 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/share-den | neither | **2.29** | 2.3 |  |  |  |  | 199 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/difference | neither | **2.29** | 2.3 |  |  |  |  | 199 |
| crossing-check{"k":2,"q":4}/whole | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.29** | 2.7 | 1.9 |  |  |  | 15524 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/m-spf | both | **2.29** | 2.1 | 2.5 |  |  |  | 11036 |
| exact-change/big-piles | triangle-area{"A":8}/legs | neither | **2.28** | 1.8 | 2.8 |  |  |  | 7632 |
| prime-landing{"ends":7}/big-prime | same-on-both-rulers{"T":6}/m-gpf | both | **2.28** | 2.0 | 2.5 |  |  |  | 11180 |
| crossing-check{"k":2,"q":6}/size | prime-slope/twins | neither | **2.28** | 2.3 |  |  |  |  | 3475 |
| farey-neighbours/bottoms | pell-gradient{"D":1,"k":1}/pell-c | neither | **2.28** | 2.3 | 2.3 |  |  |  | 199 |
| exact-change/big-piles | triangle-area{"A":8}/even | neither | **2.28** | 1.8 | 2.7 |  |  |  | 7764 |
| prime-gradient{"ends":1}/c-gpf | steady-gradient/gcd-c | one | **2.28** | 1.7 | 2.9 |  |  |  | 13958 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/m-spf | both | **2.28** | 1.9 | 2.6 |  |  |  | 10780 |
| crossing-check{"k":2,"q":4}/size | pell-gradient{"D":3,"k":0}/pell-c | neither | **2.27** | 2.7 | 1.8 |  |  |  | 15557 |
| crossing-check{"k":3,"q":4}/size | pell-gradient{"D":2,"k":0}/difference | neither | **2.27** | 2.2 | 2.8 | 1.9 |  |  | 10688 |
| crossing-check{"k":3,"q":4}/size | pell-gradient{"D":2,"k":0}/share-den | neither | **2.27** | 2.2 | 2.8 | 1.9 |  |  | 10688 |
| prime-landing{"ends":7}/m-spf | same-on-both-rulers{"T":6}/m-gpf | both | **2.27** | 1.9 | 2.6 |  |  |  | 10923 |
| pell-gradient{"D":7,"k":0}/share-den | whole-intercept/mc-spf | neither | **2.27** | 2.3 |  |  |  |  | 4001 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/m-spf | both | **2.27** | 1.9 | 2.6 |  |  |  | 10780 |
| exact-change/prime-coins | prime-landing{"ends":7}/next-prime | one | **2.27** | 1.8 | 2.7 |  |  |  | 10497 |
| square-area/spf | whole-area/gcd-x | one | **2.27** | 2.4 | 2.2 |  |  |  | 16667 |
| prime-landing{"ends":7}/m-gpf | same-on-both-rulers{"T":6}/m-gpf | both | **2.26** | 1.9 | 2.6 |  |  |  | 10923 |
| prime-gradient{"ends":1}/cPrime | prime-staircase{"ends":3}/first-prime | both | **2.26** | 0.6 | 3.9 |  |  |  | 1343 |
| prime-gradient{"ends":1}/cPrime | prime-staircase{"ends":3}/last-prime | both | **2.26** | 0.6 | 3.9 |  |  |  | 1343 |
| exact-change/prime-coins | same-on-both-rulers{"T":6}/prime-start | one | **2.26** | 2.2 | 3.2 | 1.4 |  |  | 14710 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-intercept/gcd-floor-m | one | **2.25** | 1.6 | 2.9 |  |  |  | 13693 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | steady-gradient/gcd-c | one | **2.25** | 1.6 | 2.9 |  |  |  | 13794 |
| crossing-check{"k":2,"q":4}/whole | prime-slope/twins | neither | **2.25** | 2.2 |  |  |  |  | 3409 |
| crossing-check{"k":1,"q":4}/whole | target-gradient/gcd-tops | neither | **2.25** | 2.0 | 2.5 |  |  |  | 8511 |
| exact-change/prime-coins | prime-landing{"ends":7}/m-spf | one | **2.25** | 1.8 | 2.7 |  |  |  | 9846 |
| prime-gradient{"ends":1}/c-spf | prime-staircase{"ends":3}/first-prime | both | **2.25** | 0.7 | 3.8 |  |  |  | 1343 |
| prime-gradient{"ends":1}/c-spf | prime-staircase{"ends":3}/last-prime | both | **2.25** | 0.7 | 3.8 |  |  |  | 1343 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/whole-values | both | **2.24** | 2.0 | 2.5 |  |  |  | 10280 |
| exact-change/big-bill | prime-staircase{"ends":3}/first-prime | one | **2.24** | 2.0 | 2.5 |  |  |  | 2770 |
| exact-change/big-bill | prime-staircase{"ends":3}/last-prime | one | **2.24** | 2.0 | 2.5 |  |  |  | 2770 |
| exact-change/prime-coins | whole-crossing/k-spf | one | **2.24** | 1.5 | 2.2 | 3.0 |  |  | 3343 |
| divisibility-ladder/steep | steady-gradient/divisors | one | **2.23** | 2.0 | 1.9 | 1.7 | 3.4 | 2.2 | 26065 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/whole-values | both | **2.23** | 1.9 | 2.6 |  |  |  | 10034 |
| exact-change/prime-coins | prime-landing{"ends":7}/m-gpf | one | **2.23** | 1.8 | 2.6 |  |  |  | 9846 |
| prime-landing{"ends":7}/m-gpf | steep-and-tall/shared | one | **2.23** | 2.3 | 2.1 |  |  |  | 17392 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/whole-values | both | **2.23** | 1.9 | 2.6 |  |  |  | 10034 |
| prime-staircase{"ends":3}/first-prime | whole-crossing/k-spf | both | **2.22** | -1.9 | 3.3 | 5.2 |  |  | 111 |
| prime-staircase{"ends":3}/last-prime | whole-crossing/k-spf | both | **2.22** | -1.9 | 3.3 | 5.2 |  |  | 111 |
| prime-gradient{"ends":1}/c-spf | steady-gradient/gcd-c | one | **2.22** | 1.6 | 2.9 |  |  |  | 12155 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-crossing/k-spf | both | **2.22** | -1.8 | 3.3 | 5.2 |  |  | 114 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-crossing/k-spf | both | **2.22** | -1.8 | 3.3 | 5.2 |  |  | 114 |
| prime-gradient{"ends":1}/c-gpf | prime-staircase{"ends":3}/first-prime | both | **2.22** | 0.6 | 3.8 |  |  |  | 1343 |
| prime-gradient{"ends":1}/c-gpf | prime-staircase{"ends":3}/last-prime | both | **2.22** | 0.6 | 3.8 |  |  |  | 1343 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/m-spf | both | **2.21** | 2.0 | 2.5 |  |  |  | 10301 |
| crossing-check{"k":2,"q":4}/size | prime-slope/twins | neither | **2.20** | 2.2 |  |  |  |  | 3337 |
| prime-landing{"ends":7,"side":-1}/big-prime | same-on-both-rulers{"T":-6}/m-gpf | both | **2.20** | 1.9 | 2.5 |  |  |  | 10446 |
| crossing-check{"k":3,"q":6}/whole | target-gradient/gcd-tops | neither | **2.20** | 2.4 | 2.0 |  |  |  | 12585 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/m-spf | both | **2.19** | 1.8 | 2.5 |  |  |  | 10052 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-intercept/gcd-floor-m | one | **2.19** | 1.5 | 2.9 |  |  |  | 11897 |
| exact-change/big-bill | triangle-area{"A":12}/even | neither | **2.19** | 1.8 | 2.6 |  |  |  | 10551 |
| prime-landing{"ends":7,"side":-1}/m-spf | same-on-both-rulers{"T":-6}/m-gpf | both | **2.19** | 1.8 | 2.5 |  |  |  | 10194 |
| prime-gradient{"ends":1,"side":-1}/c-spf | steady-gradient/gcd-c | one | **2.19** | 1.5 | 2.9 |  |  |  | 12000 |
| crossing-check{"k":2,"q":4}/whole | target-gradient/same-den | neither | **2.19** | 2.3 | 2.1 |  |  |  | 11496 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/m-spf | both | **2.19** | 1.8 | 2.5 |  |  |  | 10052 |
| whole-area/gcd-den-m | whole-at-t/gcd-den-m | neither | **2.19** | 2.2 |  |  |  |  | 1079 |
| exact-change/big-bill | triangle-area{"A":12}/legs | neither | **2.18** | 1.8 | 2.6 |  |  |  | 9849 |
| prime-landing{"ends":7,"side":-1}/m-gpf | same-on-both-rulers{"T":-6}/m-gpf | both | **2.18** | 1.8 | 2.5 |  |  |  | 10194 |
| prime-landing{"ends":7,"side":-1}/m-gpf | pythagorean-area/prime-height | both | **2.18** | 1.1 | 1.0 | 4.5 |  |  | 6360 |
| crossing-check{"k":2,"q":4}/whole | m-meets-c/size | neither | **2.18** | 0.3 | 4.1 |  |  |  | 2601 |
| crossing-check{"k":3,"q":6}/size | target-gradient/gcd-tops | neither | **2.18** | 2.4 | 2.0 |  |  |  | 12404 |
| crossing-check{"k":3,"q":4}/size | pell-gradient{"D":2,"k":0}/pell-c | neither | **2.18** | 2.2 | 2.8 | 1.6 |  |  | 10688 |
| prime-landing{"ends":7,"side":-1}/m-spf | pythagorean-area/prime-height | both | **2.17** | 1.1 | 1.0 | 4.5 |  |  | 6360 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-11,"k":2}/m-spf | both | **2.17** | 0.7 | 1.1 | 4.7 |  |  | 4537 |
| smooth-square/shared | whole-crossing/k-gpf | one | **2.17** | 1.1 | 2.5 | 2.6 | 2.5 |  | 5352 |
| square-area/omega | whole-crossing/k-gpf | both | **2.17** | 1.1 | 2.4 | 2.6 | 2.5 |  | 5352 |
| crossing-check{"k":2,"q":4}/size | target-gradient/same-den | neither | **2.17** | 2.3 | 2.1 |  |  |  | 11496 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":-11,"k":2}/m-spf | both | **2.17** | 0.7 | 1.0 | 4.7 |  |  | 4537 |
| prime-landing{"ends":7}/m-spf | treasure{"T":11,"k":2}/prime-terms | both | **2.17** | 0.8 | 1.2 | 4.6 |  |  | 4667 |
| near-point/gcd-x | target-gradient/gcd-tops | neither | **2.17** | 2.0 | 1.5 | 3.0 |  |  | 9810 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-11,"k":2}/m-gpf | both | **2.17** | 0.7 | 1.0 | 4.7 |  |  | 4537 |
| triangle-area{"A":8}/legs | whole-crossing/k-spf | one | **2.17** | 1.9 | 2.5 |  |  |  | 4106 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":11,"k":2}/prime-terms | both | **2.16** | 0.8 | 1.2 | 4.6 |  |  | 4667 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **2.16** | 0.7 | 1.0 | 4.7 |  |  | 4537 |
| prime-gradient{"ends":1}/prime | smooth-gradient/shared | one | **2.16** | 1.7 | 2.6 |  |  |  | 7550 |
| crossing-check{"k":2,"q":4}/size | m-meets-c/size | neither | **2.16** | 0.3 | 4.0 |  |  |  | 2601 |
| exact-change/prime-coins | triangle-area{"A":12}/even | neither | **2.16** | 1.6 | 2.7 |  |  |  | 8291 |
| crossing-check{"k":1,"q":4}/whole | target-gradient/same-den | neither | **2.16** | 2.0 | 2.3 |  |  |  | 8748 |
| exact-change/prime-coins | prime-landing{"ends":7}/big-prime | one | **2.16** | 1.8 | 2.6 |  |  |  | 9206 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-11,"k":2}/prime-terms | both | **2.16** | 0.2 | 2.2 | 4.0 |  |  | 815 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-11,"k":2}/prime-terms | both | **2.16** | 0.2 | 2.2 | 4.0 |  |  | 815 |
| near-point/lattice | target-gradient/gcd-tops | neither | **2.16** | 2.0 | 1.5 | 2.9 |  |  | 10012 |
| crossing-check{"k":3,"q":2}/size | exact-change/big-piles | neither | **2.16** | 1.4 | 1.0 | 4.0 |  |  | 5583 |
| prime-landing{"ends":7}/m-spf | treasure{"T":11,"k":2}/prime-gradient | both | **2.16** | 0.7 | 1.3 | 4.4 |  |  | 4512 |
| prime-landing{"ends":7,"side":-1}/next-prime | square-area/spf | both | **2.15** | 0.5 | 0.6 | 5.3 |  |  | 4097 |
| prime-landing{"ends":7}/next-prime | treasure{"T":11,"k":2}/m-spf | both | **2.15** | 1.0 | 1.2 | 4.3 |  |  | 5567 |
| crossing-check{"k":2,"q":4}/size | near-point/lattice | neither | **2.15** | 2.7 | 1.6 |  |  |  | 15837 |
| crossing-check{"k":2,"q":4}/size | near-point/gcd-x | neither | **2.15** | 2.7 | 1.6 |  |  |  | 15580 |
| triangle-area{"A":8}/even | whole-crossing/k-spf | one | **2.15** | 1.8 | 2.5 |  |  |  | 4110 |
| crossing-check{"k":2,"q":4}/whole | near-point/lattice | neither | **2.15** | 2.6 | 1.7 |  |  |  | 15488 |
| crossing-check{"k":2,"q":4}/whole | near-point/gcd-x | neither | **2.15** | 2.6 | 1.7 |  |  |  | 15231 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":11,"k":2}/prime-gradient | both | **2.15** | 0.7 | 1.3 | 4.4 |  |  | 4512 |
| square-area/spf | whole-crossing/gcd-c | one | **2.15** | 2.1 | 2.2 |  |  |  | 14367 |
| prime-landing{"ends":7}/next-prime | treasure{"T":11,"k":2}/m-gpf | both | **2.15** | 1.0 | 1.2 | 4.3 |  |  | 5567 |
| exact-change/prime-coins | prime-staircase{"ends":3}/first-prime | one | **2.15** | 1.9 | 2.4 |  |  |  | 2405 |
| exact-change/prime-coins | prime-staircase{"ends":3}/last-prime | one | **2.15** | 1.9 | 2.4 |  |  |  | 2405 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | square-area/spf | both | **2.15** | 0.5 | 0.6 | 5.3 |  |  | 4053 |
| crossing-check{"k":1,"q":4}/size | target-gradient/gcd-tops | neither | **2.14** | 1.9 | 2.4 |  |  |  | 8655 |
| exact-change/prime-coins | triangle-area{"A":12}/legs | neither | **2.14** | 1.6 | 2.7 |  |  |  | 7564 |
| triangle-area{"A":12}/legs | whole-intercept/spf | neither | **2.14** | 1.8 | 2.0 | 2.6 |  |  | 5149 |
| triangle-area{"A":12}/even | whole-area/gcd-den-m | neither | **2.14** | 1.2 | 0.9 | 4.3 |  |  | 3617 |
| exact-change/prime-coins | prime-landing{"ends":7}/prime-gradient | one | **2.13** | 1.7 | 2.5 |  |  |  | 9683 |
| crossing-check{"k":1,"q":2}/whole | prime-slope/twins | neither | **2.13** | 2.1 |  |  |  |  | 3228 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":11,"k":2}/prime-terms | both | **2.13** | 0.3 | 2.1 | 3.9 |  |  | 892 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":11,"k":2}/prime-terms | both | **2.13** | 0.3 | 2.1 | 3.9 |  |  | 892 |
| prime-landing{"ends":7}/next-prime | square-area/spf | both | **2.13** | 0.5 | 0.6 | 5.3 |  |  | 4120 |
| prime-staircase{"ends":3,"side":-1}/first-prime | treasure{"T":-11,"k":2}/square-start | both | **2.13** | 0.2 | 2.4 | 3.8 |  |  | 822 |
| prime-staircase{"ends":3,"side":-1}/last-prime | treasure{"T":-11,"k":2}/square-start | both | **2.13** | 0.2 | 2.4 | 3.8 |  |  | 822 |
| prime-landing{"ends":7}/prime-gradient | square-area/spf | both | **2.13** | 0.5 | 0.6 | 5.3 |  |  | 4091 |
| prime-landing{"ends":7}/m-spf | treasure{"T":11,"k":2}/square-start | both | **2.12** | 0.7 | 1.3 | 4.3 |  |  | 4584 |
| prime-gradient{"ends":1,"side":-1}/prime | smooth-gradient/shared | one | **2.12** | 1.7 | 2.6 |  |  |  | 7383 |
| prime-landing{"ends":7}/m-gpf | treasure{"T":11,"k":2}/square-start | both | **2.12** | 0.7 | 1.3 | 4.3 |  |  | 4584 |
| crossing-check{"k":3,"q":2}/size | exact-change/prime-coins | neither | **2.12** | 1.4 | 1.2 | 3.8 |  |  | 6087 |
| crossing-check{"k":2,"q":4}/whole | m-meets-c/meetPrime | neither | **2.11** | 0.3 | 4.0 |  |  |  | 2551 |
| prime-landing{"ends":7}/m-spf | steep-and-tall/shared | one | **2.11** | 2.3 | 1.9 |  |  |  | 17392 |
| crossing-check{"k":1,"q":2}/size | prime-slope/twins | neither | **2.11** | 2.1 |  |  |  |  | 3108 |
| crossing-check{"k":3,"q":2}/size | exact-change/big-bill | neither | **2.11** | 1.3 | 1.4 | 3.6 |  |  | 6259 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":11,"k":2}/m-spf | both | **2.11** | 1.0 | 1.1 | 4.2 |  |  | 5734 |
| pell-gradient{"D":5,"k":0}/difference | square-area/spf | one | **2.10** | 2.1 |  |  |  |  | 10582 |
| pell-gradient{"D":5,"k":0}/share-den | square-area/spf | one | **2.10** | 2.1 |  |  |  |  | 10582 |
| square-area/spf | whole-intercept/gcd-den-m | one | **2.10** | 2.1 |  |  |  |  | 8823 |
| crossing-check{"k":3,"q":2}/whole | exact-change/big-bill | neither | **2.10** | 1.6 | 1.1 | 3.6 |  |  | 4864 |
| prime-slope/twins | target-gradient/gcd-tops | neither | **2.10** | 2.1 |  |  |  |  | 3302 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":11,"k":2}/m-gpf | both | **2.10** | 1.0 | 1.1 | 4.2 |  |  | 5734 |
| smooth-crossing/shared | whole-crossing/k-gpf | one | **2.10** | 2.1 |  |  |  |  | 8123 |
| pell-gradient{"D":5,"k":0}/difference | square-area/lpf | one | **2.10** | 2.1 |  |  |  |  | 10598 |
| pell-gradient{"D":5,"k":0}/share-den | square-area/lpf | one | **2.10** | 2.1 |  |  |  |  | 10598 |
| crossing-check{"k":2,"q":4}/size | m-meets-c/meetPrime | neither | **2.10** | 0.2 | 3.9 |  |  |  | 2551 |
| prime-staircase{"ends":3}/first-prime | treasure{"T":11,"k":2}/square-start | both | **2.09** | 0.3 | 2.3 | 3.7 |  |  | 899 |
| prime-staircase{"ends":3}/last-prime | treasure{"T":11,"k":2}/square-start | both | **2.09** | 0.3 | 2.3 | 3.7 |  |  | 899 |
| prime-landing{"ends":7,"side":-1}/big-prime | whole-intercept/mc-spf | one | **2.09** | 1.1 | 3.1 |  |  |  | 2174 |
| pell-gradient{"D":5,"k":0}/difference | square-area/omega | one | **2.09** | 2.1 |  |  |  |  | 10598 |
| pell-gradient{"D":5,"k":0}/share-den | square-area/omega | one | **2.09** | 2.1 |  |  |  |  | 10598 |
| crossing-check{"k":3,"q":2}/whole | exact-change/prime-coins | neither | **2.09** | 1.7 | 0.8 | 3.8 |  |  | 4849 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **2.09** | 2.0 | 2.1 |  |  |  | 9891 |
| triangle-area{"A":12}/even | whole-intercept/spf | neither | **2.08** | 1.7 | 2.0 | 2.5 |  |  | 5149 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":6}/whole-lamp | one | **2.08** | 2.4 | 1.4 | 2.4 |  |  | 6491 |
| prime-landing{"ends":7}/big-prime | steep-and-tall/shared | one | **2.08** | 2.1 | 2.1 |  |  |  | 15351 |
| prime-slope/twins | target-gradient/same-den | neither | **2.08** | 2.1 |  |  |  |  | 3302 |
| exact-change/big-bill | whole-crossing/gcd-num-m | neither | **2.08** | 1.2 | 2.1 | 2.9 |  |  | 4176 |
| pell-gradient{"D":5,"k":0}/pell-c | square-area/spf | one | **2.07** | 2.1 |  |  |  |  | 10582 |
| pell-gradient{"D":5,"k":0}/difference | smooth-square/shared | neither | **2.06** | 2.1 |  |  |  |  | 10608 |
| pell-gradient{"D":5,"k":0}/share-den | smooth-square/shared | neither | **2.06** | 2.1 |  |  |  |  | 10608 |
| prime-slope/matching-c | whole-crossing/gcd-num-m | neither | **2.06** | 2.1 |  |  |  |  | 6800 |
| pell-gradient{"D":5,"k":0}/pell-c | square-area/lpf | one | **2.06** | 2.1 |  |  |  |  | 10598 |
| prime-landing{"ends":7}/m-gpf | pythagorean-area/prime-height | both | **2.06** | 1.1 | 0.9 | 4.2 |  |  | 6356 |
| prime-landing{"ends":7,"side":-1}/next-prime | whole-crossing/k-spf | both | **2.06** | 1.2 | 2.9 |  |  |  | 2794 |
| crossing-check{"k":2,"q":2}/size | near-point/gcd-x | neither | **2.06** | 2.1 |  |  |  |  | 9829 |
| crossing-check{"k":1,"q":4}/size | target-gradient/same-den | neither | **2.06** | 1.9 | 2.2 |  |  |  | 8892 |
| pell-gradient{"D":5,"k":0}/pell-c | square-area/omega | one | **2.06** | 2.1 |  |  |  |  | 10598 |
| crossing-check{"k":3,"q":2}/whole | exact-change/big-piles | neither | **2.05** | 1.7 | 0.4 | 4.0 |  |  | 4363 |
| prime-landing{"ends":7}/m-spf | pythagorean-area/prime-height | both | **2.05** | 1.1 | 0.9 | 4.2 |  |  | 6356 |
| prime-staircase{"ends":3}/first-prime | triangle-area{"A":4}/even | one | **2.05** | 2.0 |  |  |  |  | 2625 |
| prime-staircase{"ends":3}/last-prime | triangle-area{"A":4}/even | one | **2.05** | 2.0 |  |  |  |  | 2625 |
| prime-staircase{"ends":3,"side":-1}/first-prime | triangle-area{"A":4}/even | one | **2.05** | 2.0 |  |  |  |  | 2584 |
| prime-staircase{"ends":3,"side":-1}/last-prime | triangle-area{"A":4}/even | one | **2.05** | 2.0 |  |  |  |  | 2584 |
| target-gradient/same-den | whole-crossing/gcd-num-m | neither | **2.04** | 1.6 | 1.8 | 2.7 |  |  | 5059 |
| crossing-check{"k":2,"q":2}/whole | near-point/gcd-x | neither | **2.04** | 2.0 |  |  |  |  | 9652 |
| crossing-check{"k":2,"q":2}/size | near-point/lattice | neither | **2.04** | 2.0 |  |  |  |  | 9834 |
| prime-staircase{"ends":3}/first-prime | triangle-area{"A":4}/legs | one | **2.04** | 2.0 |  |  |  |  | 2626 |
| prime-staircase{"ends":3}/last-prime | triangle-area{"A":4}/legs | one | **2.04** | 2.0 |  |  |  |  | 2626 |
| prime-staircase{"ends":3,"side":-1}/first-prime | triangle-area{"A":4}/legs | one | **2.04** | 2.0 |  |  |  |  | 2584 |
| prime-staircase{"ends":3,"side":-1}/last-prime | triangle-area{"A":4}/legs | one | **2.04** | 2.0 |  |  |  |  | 2584 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/difference | neither | **2.03** | 1.7 | 2.1 | 2.3 |  |  | 8048 |
| near-point/lattice | pell-gradient{"D":2,"k":0}/share-den | neither | **2.03** | 1.7 | 2.1 | 2.3 |  |  | 8048 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-11,"k":2}/prime-terms | both | **2.03** | 0.8 | 1.0 | 4.3 |  |  | 4663 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":-11,"k":2}/prime-terms | both | **2.03** | 0.8 | 1.0 | 4.3 |  |  | 4663 |
| crossing-check{"k":2,"q":2}/whole | near-point/lattice | neither | **2.03** | 2.0 |  |  |  |  | 9656 |
| pell-gradient{"D":5,"k":0}/pell-c | smooth-square/shared | neither | **2.03** | 2.0 |  |  |  |  | 10608 |
| crossing-check{"k":2,"q":2}/whole | farey-neighbours/mediant-x | neither | **2.02** | 2.0 |  |  |  |  | 7567 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 8536 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 8536 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 8536 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-intercept/gcd-floor-m | one | **2.02** | 2.0 |  |  |  |  | 3292 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-intercept/gcd-floor-m | one | **2.02** | 2.0 |  |  |  |  | 3292 |
| prime-gradient{"ends":1}/c-spf | steady-gradient/divisors | one | **2.02** | 1.6 | 2.5 |  |  |  | 13551 |
| triangle-area{"A":12}/legs | whole-area/gcd-den-m | neither | **2.02** | 0.8 | 0.9 | 4.4 |  |  | 2602 |
| prime-landing{"ends":7,"side":-1}/m-spf | treasure{"T":-11,"k":2}/prime-gradient | both | **2.02** | 0.8 | 1.2 | 4.1 |  |  | 4497 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 9107 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/matching-c | neither | **2.02** | 2.0 |  |  |  |  | 9107 |
| prime-landing{"ends":7,"side":-1}/m-gpf | treasure{"T":-11,"k":2}/prime-gradient | both | **2.02** | 0.8 | 1.2 | 4.1 |  |  | 4497 |
| ruler/square-area | triangle-area{"A":4}/legs | one | **2.02** | 1.1 | 2.9 |  |  |  | 7483 |
| ruler/prime-gradient | triangle-area{"A":4}/legs | one | **2.02** | 1.1 | 2.9 |  |  |  | 7474 |
| crossing-check{"k":2,"q":2}/size | farey-neighbours/mediant-x | neither | **2.02** | 2.0 |  |  |  |  | 7567 |
| prime-landing{"ends":7}/next-prime | whole-crossing/k-spf | both | **2.02** | 1.2 | 2.9 |  |  |  | 2717 |
| exact-change/prime-coins | square-area/spf | one | **2.02** | 0.9 | 3.2 |  |  |  | 4167 |
| ruler/square-area | triangle-area{"A":4}/even | one | **2.02** | 1.1 | 2.9 |  |  |  | 7384 |
| ruler/prime-gradient | triangle-area{"A":4}/even | one | **2.02** | 1.1 | 2.9 |  |  |  | 7375 |
| crossing-check{"k":1,"q":4}/size | pell-gradient{"D":7,"k":0}/pell-c | neither | **2.01** | 1.9 | 2.1 |  |  |  | 9891 |
| triangle-area{"A":18}/legs | whole-crossing/k-spf | one | **2.01** | 2.3 | 1.7 |  |  |  | 5352 |
| prime-gradient{"ends":1,"side":-1}/c-spf | steady-gradient/divisors | one | **2.01** | 1.6 | 2.4 |  |  |  | 13494 |
| crossing-check{"k":1,"q":4}/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **2.01** | 2.1 | 2.0 |  |  |  | 10440 |
| prime-landing{"ends":7}/next-prime | treasure{"T":11,"k":2}/prime-terms | both | **2.01** | 1.0 | 1.2 | 3.8 |  |  | 5716 |
| prime-gradient{"ends":1}/c-gpf | steady-gradient/divisors | one | **2.01** | 1.6 | 2.5 |  |  |  | 13959 |
| sunken-intercept/shared | whole-area/gcd-den-m | neither | **2.00** | 1.5 | 1.9 | 2.0 | 2.4 | 2.2 | 8910 |
| prime-landing{"ends":7,"side":-1}/next-prime | treasure{"T":-11,"k":2}/m-spf | both | **2.00** | 1.0 | 1.1 | 3.9 |  |  | 5529 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":6}/prime-start | one | **2.00** | 2.4 | 1.3 | 2.3 |  |  | 6604 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/matching-c | neither | **2.00** | 2.0 |  |  |  |  | 9107 |

### Anti-aligned pairs (headline < −2), different families

| A | B | dealt | headline | 4 b | 6 b | 8 b | 10 b | 12 b | joint ESS at 4 b |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| m-meets-c/size | whole-intercept/gcd-den-m | neither | **-7.51** | -7.5 |  |  |  |  | 32 |
| near-point/lattice | steady-gradient/divisors | neither | **-7.35** | -7.3 |  |  |  |  | 41 |
| near-point/gcd-x | steady-gradient/divisors | neither | **-7.33** | -7.3 |  |  |  |  | 41 |
| crossing-check{"k":1,"q":4}/whole | near-point/gcd-x | neither | **-7.17** | -7.2 |  |  |  |  | 42 |
| crossing-check{"k":2,"q":6}/size | steady-gradient/divisors | neither | **-6.92** | -6.9 |  |  |  |  | 56 |
| crossing-check{"k":2,"q":4}/size | steady-gradient/divisors | neither | **-6.91** | -6.9 |  |  |  |  | 56 |
| crossing-check{"k":2,"q":6}/whole | steady-gradient/divisors | neither | **-6.90** | -6.9 |  |  |  |  | 56 |
| crossing-check{"k":2,"q":4}/whole | steady-gradient/divisors | neither | **-6.90** | -6.9 |  |  |  |  | 56 |
| m-meets-c/meetPrime | whole-intercept/omega | neither | **-6.88** | -6.9 |  |  |  |  | 34 |
| m-meets-c/size | whole-intercept/omega | neither | **-6.87** | -6.9 |  |  |  |  | 34 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-6.77** | -6.8 |  |  |  |  | 37 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-6.74** | -6.7 |  |  |  |  | 37 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-13,"k":2}/square-start | one | **-6.72** | -6.7 |  |  |  |  | 38 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-6.70** | -6.7 |  |  |  |  | 39 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-6.68** | -6.7 |  |  |  |  | 39 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1}/prime | one | **-6.65** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | near-point/lattice | neither | **-6.64** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1}/cPrime | one | **-6.64** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.64** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | whole-crossing/gcd-c | neither | **-6.63** | ≤-6.6 |  |  |  |  | 1 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | steady-gradient/divisors | neither | **-6.63** | ≤-6.6 |  |  |  |  | 27 |
| exact-change/big-bill | m-meets-c/meetPrime | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":4}/legs | whole-crossing/gcd-c | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | near-point/gcd-x | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"T":-6}/m-gpf | one | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | steady-gradient/divisors | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":4}/legs | whole-area/gcd-x | neither | **-6.63** | ≤-6.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | sunken-intercept/shared | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient{"ends":1}/prime | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":12}/even | whole-crossing/gcd-c | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":8}/even | whole-crossing/gcd-c | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | sunken-intercept/shared | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":4}/even | whole-crossing/gcd-c | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1}/prime | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | m-meets-c/size | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient{"ends":1}/cPrime | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | sunken-intercept/shared | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1}/prime | one | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":4}/even | whole-area/gcd-x | neither | **-6.62** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-crossing/gcd-c | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":11,"k":2}/square-start | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":13,"k":2}/square-start | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-landing{"ends":7,"side":-1}/next-prime | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | whole-crossing/gcd-c | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1}/cPrime | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area/slanted-square | whole-crossing/gcd-c | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-area/gcd-x | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1}/c-gpf | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"T":-6}/prime-start | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":13,"k":2}/prime-terms | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1}/cPrime | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area/whole-legs | whole-crossing/gcd-c | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":13,"k":2}/m-gpf | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | near-point/lattice | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":18}/even | whole-crossing/gcd-c | neither | **-6.61** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-intercept/gcd-floor-m | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/gcd-floor-m | neither | **-6.60** | ≤-6.6 |  |  |  |  | 6 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":11,"k":2}/prime-terms | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| m-meets-c/size | whole-crossing/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | whole-crossing/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 1 |
| near-point/lattice | treasure{"T":11,"k":2}/m-spf | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":11,"k":2}/m-gpf | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 27 |
| m-meets-c/size | whole-area/gcd-x | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1}/prime | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1}/prime | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1}/prime | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-13,"k":2}/square-start | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"T":-6}/m-spf | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1}/prime | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":11,"k":2}/square-start | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":1,"k":1}/pell-c | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | whole-intercept/gcd-floor-m | neither | **-6.60** | ≤-6.6 |  |  |  |  | 5 |
| exact-change/big-bill | same-on-both-rulers{"T":-6}/steep | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":13,"k":2}/square-start | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"T":-6}/whole-values | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-13,"k":2}/prime-terms | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-11,"k":2}/square-start | one | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":8}/legs | whole-crossing/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":6}/even | whole-crossing/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | whole-crossing/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | steady-gradient/divisors | neither | **-6.60** | ≤-6.6 |  |  |  |  | 15 |
| pell-gradient{"D":1,"k":1}/pell-c | steady-gradient/gcd-c | neither | **-6.60** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | same-on-both-rulers{"T":-6}/whole-lamp | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | steady-gradient/gcd-c | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-13,"k":2}/m-gpf | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":13,"k":2}/prime-terms | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":13,"k":2}/m-gpf | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":13,"k":2}/prime-gradient | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":13,"k":2}/m-spf | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | near-point/gcd-x | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient{"ends":1}/c-gpf | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | steady-gradient/divisors | neither | **-6.59** | ≤-6.6 |  |  |  |  | 15 |
| pell-gradient{"D":1,"k":1}/difference | whole-intercept/gcd-floor-m | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-intercept/gcd-floor-m | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | steady-gradient/gcd-c | neither | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":11,"k":2}/prime-terms | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":11,"k":2}/m-spf | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":11,"k":2}/m-gpf | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.59** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 26 |
| near-point/lattice | treasure{"T":-11,"k":2}/m-spf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-11,"k":2}/m-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-11,"k":2}/prime-terms | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1}/c-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"T":-6}/m-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-13,"k":2}/square-start | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient{"ends":1}/prime | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":11,"k":2}/prime-gradient | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1}/c-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | steep-and-tall/shared | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":1,"k":1}/difference | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":1,"k":1}/share-den | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-13,"k":2}/prime-terms | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-11,"k":2}/square-start | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | sunken-intercept/shared | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":6}/legs | whole-crossing/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pythagorean-area/prime-height | whole-crossing/gcd-c | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | steady-gradient/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | steady-gradient/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | steady-gradient/divisors | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-13,"k":2}/m-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-13,"k":2}/m-spf | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| triangle-area{"A":18}/legs | whole-crossing/gcd-c | neither | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient{"ends":1}/cPrime | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-13,"k":2}/prime-gradient | one | **-6.58** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":13,"k":2}/prime-gradient | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":13,"k":2}/m-spf | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-landing{"ends":7,"side":-1}/next-prime | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-11,"k":2}/m-spf | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-11,"k":2}/m-gpf | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-11,"k":2}/prime-terms | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"T":-6}/prime-start | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | steady-gradient/divisors | neither | **-6.57** | ≤-6.6 |  |  |  |  | 26 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1}/c-gpf | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":11,"k":2}/prime-gradient | one | **-6.57** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | treasure{"T":-11,"k":2}/prime-gradient | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-13,"k":2}/m-spf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| near-point/lattice | steep-and-tall/shared | neither | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-13,"k":2}/prime-gradient | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| same-on-both-rulers{"T":6}/m-gpf | steep-and-tall/shared | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"T":-6}/m-spf | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":1,"k":1}/pell-c | one | **-6.56** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1}/prime | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"T":-6}/steep | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1}/c-spf | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"T":-6}/whole-values | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/big-bill | steep-and-tall/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| steep-and-tall/shared | sunken-intercept/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| exact-change/prime-coins | same-on-both-rulers{"T":-6}/whole-lamp | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | steep-and-tall/shared | neither | **-6.55** | ≤-6.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | steep-and-tall/shared | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | steep-and-tall/shared | neither | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/prime | steep-and-tall/shared | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1}/cPrime | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-gradient{"ends":1}/c-gpf | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| near-point/gcd-x | treasure{"T":-11,"k":2}/prime-gradient | one | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | steep-and-tall/shared | neither | **-6.55** | ≤-6.5 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | steep-and-tall/shared | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| same-on-both-rulers{"T":6}/prime-start | steep-and-tall/shared | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/cPrime | steep-and-tall/shared | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1}/prime | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/prime | target-gradient/same-den | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| near-point/gcd-x | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | target-gradient/same-den | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":1,"k":1}/difference | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":1,"k":1}/share-den | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1}/cPrime | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/whole | steep-and-tall/shared | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/cPrime | target-gradient/same-den | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/prime | target-gradient/same-den | one | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.54** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | steep-and-tall/shared | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | prime-gradient{"ends":1}/c-spf | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| same-on-both-rulers{"T":6}/m-spf | steep-and-tall/shared | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| target-gradient/same-den | whole-intercept/gcd-floor-m | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| same-on-both-rulers{"T":6}/steep | steep-and-tall/shared | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| same-on-both-rulers{"T":6}/whole-values | steep-and-tall/shared | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/cPrime | target-gradient/same-den | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/last-prime | sunken-intercept/shared | one | **-6.53** | -6.5 |  |  |  |  | 32 |
| prime-staircase{"ends":3,"side":-1}/first-prime | sunken-intercept/shared | one | **-6.53** | -6.5 |  |  |  |  | 32 |
| same-on-both-rulers{"T":6}/whole-lamp | steep-and-tall/shared | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1}/c-spf | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-13,"k":2}/square-start | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":3,"k":0}/pell-c | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | steep-and-tall/shared | neither | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1}/c-spf | one | **-6.53** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-13,"k":2}/prime-terms | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-11,"k":2}/square-start | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/divisors | target-gradient/same-den | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/gcd-c | target-gradient/same-den | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/prime | target-gradient/gcd-tops | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-13,"k":2}/m-gpf | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1}/c-gpf | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | steep-and-tall/shared | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | target-gradient/gcd-tops | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1}/prime | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1}/prime | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | steep-and-tall/shared | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | sunken-intercept/shared | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | sunken-intercept/shared | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | steep-and-tall/shared | neither | **-6.52** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/cPrime | target-gradient/gcd-tops | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/prime | target-gradient/gcd-tops | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-11,"k":2}/m-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-11,"k":2}/m-gpf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | prime-landing{"ends":7,"side":-1}/m-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-11,"k":2}/prime-terms | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | steep-and-tall/shared | neither | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1}/cPrime | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1}/cPrime | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| target-gradient/gcd-tops | whole-intercept/gcd-floor-m | neither | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1}/c-gpf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/cPrime | target-gradient/gcd-tops | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-gpf | target-gradient/same-den | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.51** | ≤-6.5 |  |  |  |  | 0 |
| triangle-area{"A":12}/legs | whole-crossing/gcd-c | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | target-gradient/same-den | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-13,"k":2}/m-spf | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-13,"k":2}/prime-gradient | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/divisors | target-gradient/gcd-tops | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| steady-gradient/gcd-c | target-gradient/gcd-tops | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/big-bill | farey-neighbours/mediant-x | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | target-gradient/same-den | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | steady-gradient/divisors | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | steady-gradient/divisors | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1}/prime | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1}/prime | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1}/prime | one | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | steady-gradient/gcd-c | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | steady-gradient/gcd-c | neither | **-6.50** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | sunken-intercept/shared | neither | **-6.49** | -6.5 |  |  |  |  | 79 |
| exact-change/prime-coins | prime-gradient{"ends":1}/c-spf | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1}/cPrime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1}/cPrime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1}/cPrime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/prime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| steep-and-tall/shared | treasure{"T":-11,"k":2}/prime-gradient | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | steady-gradient/divisors | neither | **-6.49** | ≤-6.5 |  |  |  |  | 11 |
| pell-gradient{"D":2,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-gpf | target-gradient/gcd-tops | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-6.49** | ≤-6.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":3,"k":0}/pell-c | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1}/c-gpf | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1}/c-gpf | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | target-gradient/gcd-tops | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 28 |
| farey-neighbours/mediant-x | whole-area/gcd-x | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":2,"k":0}/share-den | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":2,"k":0}/difference | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":2,"k":0}/pell-c | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | steady-gradient/divisors | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | steady-gradient/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | steady-gradient/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | steady-gradient/gcd-c | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | target-gradient/gcd-tops | neither | **-6.48** | ≤-6.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | sunken-intercept/shared | neither | **-6.48** | -6.5 |  |  |  |  | 78 |
| exact-change/prime-coins | prime-landing{"ends":7,"side":-1}/m-spf | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-6.47** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1}/c-spf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1}/c-gpf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1}/c-gpf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1}/c-gpf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-spf | steep-and-tall/shared | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| exact-change/prime-coins | farey-neighbours/mediant-x | neither | **-6.46** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1}/c-spf | one | **-6.45** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-spf | target-gradient/same-den | one | **-6.45** | ≤-6.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.45** | ≤-6.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-spf | target-gradient/same-den | one | **-6.45** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | steep-and-tall/shared | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | steep-and-tall/shared | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":1,"k":1}/pell-c | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | steep-and-tall/shared | neither | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":2,"k":0}/share-den | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":2,"k":0}/difference | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":2,"k":0}/pell-c | one | **-6.44** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | sunken-intercept/shared | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| exact-change/big-bill | prime-landing{"ends":7,"side":-1}/big-prime | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-spf | target-gradient/gcd-tops | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-spf | target-gradient/gcd-tops | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1}/c-spf | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1}/c-spf | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":1,"k":1}/difference | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":1,"k":1}/share-den | one | **-6.43** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.42** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.42** | ≤-6.4 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-11,"k":2}/square-start | one | **-6.41** | -6.4 |  |  |  |  | 79 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1}/c-spf | one | **-6.41** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1}/c-spf | one | **-6.41** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1}/c-spf | one | **-6.41** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.40** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.40** | ≤-6.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-6.40** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | smooth-square/shared | neither | **-6.40** | ≤-6.4 |  |  |  |  | 1 |
| steady-gradient/divisors | treasure{"T":-11,"k":2}/prime-terms | one | **-6.40** | -6.4 |  |  |  |  | 79 |
| euclid-steps/largest-quotient | whole-at-t/gcd-c | neither | **-6.40** | -6.4 |  |  |  |  | 61 |
| exact-change/prime-coins | prime-landing{"ends":7,"side":-1}/big-prime | one | **-6.39** | ≤-6.4 |  |  |  |  | 0 |
| m-meets-c/meetPrime | steady-gradient/divisors | neither | **-6.39** | -6.4 |  |  |  |  | 71 |
| steady-gradient/divisors | treasure{"T":-11,"k":2}/m-spf | one | **-6.38** | -6.4 |  |  |  |  | 81 |
| steady-gradient/divisors | treasure{"T":-11,"k":2}/m-gpf | one | **-6.38** | -6.4 |  |  |  |  | 81 |
| prime-slope/matching-c | whole-intercept/gcd-floor-m | neither | **-6.38** | ≤-6.4 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-11,"k":2}/prime-gradient | one | **-6.38** | -6.4 |  |  |  |  | 79 |
| m-meets-c/size | steady-gradient/divisors | neither | **-6.38** | -6.4 |  |  |  |  | 71 |
| steady-gradient/divisors | treasure{"T":11,"k":2}/square-start | one | **-6.38** | -6.4 |  |  |  |  | 84 |
| prime-slope/matching-c | whole-crossing/gcd-c | neither | **-6.38** | ≤-6.4 |  |  |  |  | 17 |
| crossing-check{"k":3,"q":4}/size | steady-gradient/divisors | neither | **-6.38** | ≤-6.4 |  |  |  |  | 12 |
| divisibility-ladder/steep | prime-slope/matching-c | one | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | steady-gradient/divisors | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-area/gcd-x | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":3,"k":0}/pell-c | one | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | steady-gradient/gcd-c | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | square-area/omega | one | **-6.37** | ≤-6.4 |  |  |  |  | 1 |
| crossing-check{"k":1,"q":4}/whole | steep-and-tall/shared | neither | **-6.37** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | square-area/lpf | one | **-6.37** | ≤-6.4 |  |  |  |  | 1 |
| steady-gradient/divisors | treasure{"T":11,"k":2}/prime-terms | one | **-6.36** | -6.4 |  |  |  |  | 84 |
| prime-landing{"ends":7,"side":-1}/big-prime | steep-and-tall/shared | one | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3}/near-miss | both | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":1,"k":1}/pell-c | one | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-slope/matching-c | square-area/spf | one | **-6.36** | ≤-6.4 |  |  |  |  | 1 |
| steady-gradient/divisors | treasure{"T":11,"k":2}/m-spf | one | **-6.36** | -6.4 |  |  |  |  | 85 |
| steady-gradient/divisors | treasure{"T":11,"k":2}/m-gpf | one | **-6.36** | -6.4 |  |  |  |  | 85 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3}/near-miss | both | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.36** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3}/near-miss | both | **-6.35** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.35** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3}/near-miss | both | **-6.35** | ≤-6.4 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.35** | ≤-6.4 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-staircase{"ends":3}/near-miss | both | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | m-meets-c/meetPrime | neither | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":11,"k":2}/prime-gradient | one | **-6.34** | -6.3 |  |  |  |  | 84 |
| divisibility-ladder/m-prime | pell-gradient{"D":1,"k":1}/difference | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":1,"k":1}/share-den | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | same-on-both-rulers{"T":-6}/m-gpf | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | prime-gradient{"ends":1}/prime | one | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | steady-gradient/divisors | neither | **-6.34** | -6.3 |  |  |  |  | 74 |
| exact-change/big-piles | sunken-intercept/shared | neither | **-6.34** | ≤-6.3 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":13,"k":2}/prime-terms | one | **-6.33** | -6.3 |  |  |  |  | 86 |
| exact-change/big-piles | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | m-meets-c/size | neither | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-slope/matching-c | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | prime-gradient{"ends":1}/cPrime | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | prime-landing{"ends":7,"side":-1}/next-prime | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":2,"k":0}/share-den | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":2,"k":0}/difference | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":2,"k":0}/pell-c | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | same-on-both-rulers{"T":-6}/prime-start | one | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | steep-and-tall/shared | neither | **-6.33** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | same-on-both-rulers{"T":-6}/m-spf | one | **-6.31** | ≤-6.3 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":13,"k":2}/prime-gradient | one | **-6.31** | -6.3 |  |  |  |  | 86 |
| exact-change/big-piles | same-on-both-rulers{"T":-6}/steep | one | **-6.31** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | same-on-both-rulers{"T":-6}/whole-values | one | **-6.31** | ≤-6.3 |  |  |  |  | 0 |
| m-meets-c/meetPrime | sunken-intercept/shared | neither | **-6.31** | -6.3 |  |  |  |  | 75 |
| exact-change/big-piles | same-on-both-rulers{"T":-6}/whole-lamp | one | **-6.31** | ≤-6.3 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":13,"k":2}/m-spf | one | **-6.31** | -6.3 |  |  |  |  | 87 |
| crossing-check{"k":1,"q":6}/whole | whole-intercept/omega | neither | **-6.31** | -6.3 |  |  |  |  | 49 |
| exact-change/big-piles | prime-gradient{"ends":1}/c-gpf | one | **-6.30** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-staircase{"ends":3}/near-miss | both | **-6.30** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.30** | ≤-6.3 |  |  |  |  | 0 |
| m-meets-c/size | sunken-intercept/shared | neither | **-6.30** | -6.3 |  |  |  |  | 76 |
| divisibility-ladder/steep | long-division/m-top | one | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/steep | long-division/m-bottom-spf | one | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/steep | long-division/c-period | one | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":3,"k":0}/pell-c | one | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-top | steady-gradient/divisors | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-bottom-spf | steady-gradient/divisors | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/c-period | steady-gradient/divisors | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-top | steady-gradient/gcd-c | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/m-bottom-spf | steady-gradient/gcd-c | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| long-division/c-period | steady-gradient/gcd-c | neither | **-6.29** | ≤-6.3 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-13,"k":2}/prime-terms | one | **-6.28** | -6.3 |  |  |  |  | 90 |
| crossing-check{"k":1,"q":6}/size | whole-intercept/omega | neither | **-6.27** | -6.3 |  |  |  |  | 49 |
| exact-change/big-piles | steep-and-tall/shared | neither | **-6.27** | ≤-6.3 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | prime-slope/matching-c | neither | **-6.27** | ≤-6.3 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-at-t/gcd-c | neither | **-6.26** | -6.3 |  |  |  |  | 40 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-11,"k":2}/square-start | one | **-6.26** | -6.3 |  |  |  |  | 51 |
| crossing-check{"k":2,"q":2}/whole | whole-at-t/gcd-c | neither | **-6.26** | -6.3 |  |  |  |  | 40 |
| exact-change/big-piles | target-gradient/same-den | neither | **-6.26** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3}/near-miss | both | **-6.26** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.26** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3}/near-miss | both | **-6.26** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.26** | ≤-6.3 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-13,"k":2}/prime-gradient | one | **-6.25** | -6.3 |  |  |  |  | 90 |
| steady-gradient/divisors | treasure{"T":13,"k":2}/square-start | one | **-6.25** | -6.3 |  |  |  |  | 90 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3}/near-miss | both | **-6.25** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.25** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3}/near-miss | both | **-6.25** | ≤-6.3 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.25** | ≤-6.3 |  |  |  |  | 0 |
| exact-change/big-piles | prime-gradient{"ends":1}/c-spf | one | **-6.25** | ≤-6.2 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-13,"k":2}/m-spf | one | **-6.25** | -6.2 |  |  |  |  | 91 |
| divisibility-ladder/m-spf | long-division/m-top | one | **-6.25** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | long-division/m-bottom-spf | one | **-6.25** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | long-division/c-period | one | **-6.25** | ≤-6.2 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-6.25** | -6.2 |  |  |  |  | 51 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-6.25** | -6.2 |  |  |  |  | 51 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-6.25** | -6.2 |  |  |  |  | 51 |
| divisibility-ladder/m-prime | pell-gradient{"D":2,"k":0}/share-den | one | **-6.24** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":2,"k":0}/difference | one | **-6.24** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":2,"k":0}/pell-c | one | **-6.24** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-at-t/gcd-c | neither | **-6.23** | ≤-6.2 |  |  |  |  | 0 |
| exact-change/big-piles | target-gradient/gcd-tops | neither | **-6.23** | ≤-6.2 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-13,"k":2}/square-start | one | **-6.23** | -6.2 |  |  |  |  | 93 |
| exact-change/big-piles | prime-landing{"ends":7,"side":-1}/m-spf | one | **-6.23** | ≤-6.2 |  |  |  |  | 0 |
| exact-change/big-piles | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-6.23** | ≤-6.2 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-6.22** | -6.2 |  |  |  |  | 51 |
| divisibility-ladder/m-gpf | prime-slope/matching-c | one | **-6.22** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | whole-at-t/gcd-c | neither | **-6.22** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-at-t/gcd-c | neither | **-6.22** | ≤-6.2 |  |  |  |  | 0 |
| exact-change/big-piles | farey-neighbours/mediant-x | neither | **-6.21** | ≤-6.2 |  |  |  |  | 0 |
| long-division/m-bottom-spf | whole-intercept/gcd-floor-m | neither | **-6.19** | -4.3 | -8.1 |  |  |  | 761 |
| divisibility-ladder/m-gpf | prime-staircase{"ends":3}/near-miss | both | **-6.19** | ≤-6.2 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.19** | ≤-6.2 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | steady-gradient/divisors | neither | **-6.19** | -6.2 |  |  |  |  | 74 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-6.17** | ≤-6.2 |  |  |  |  | 22 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3}/near-miss | both | **-6.17** | ≤-6.2 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.17** | ≤-6.2 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3}/near-miss | both | **-6.17** | ≤-6.2 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.17** | ≤-6.2 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-6.16** | ≤-6.2 |  |  |  |  | 0 |
| target-gradient/same-den | whole-at-t/gcd-c | neither | **-6.16** | ≤-6.2 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-intercept/gcd-den-m | neither | **-6.15** | ≤-6.2 |  |  |  |  | 29 |
| exact-change/big-piles | prime-landing{"ends":7,"side":-1}/big-prime | one | **-6.15** | ≤-6.1 |  |  |  |  | 0 |
| target-gradient/gcd-tops | whole-at-t/gcd-c | neither | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | whole-at-t/gcd-c | neither | **-6.14** | ≤-6.1 |  |  |  |  | 22 |
| pell-gradient{"D":5,"k":0}/difference | whole-at-t/gcd-c | neither | **-6.14** | ≤-6.1 |  |  |  |  | 22 |
| divisibility-ladder/m-prime | prime-slope/matching-c | one | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | long-division/m-top | one | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | long-division/m-bottom-spf | one | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | long-division/c-period | one | **-6.14** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/steep | whole-intercept/gcd-den-m | one | **-6.13** | ≤-6.1 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-intercept/gcd-den-m | neither | **-6.13** | ≤-6.1 |  |  |  |  | 0 |
| steady-gradient/gcd-c | whole-intercept/gcd-den-m | neither | **-6.13** | ≤-6.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | whole-at-t/gcd-c | neither | **-6.13** | ≤-6.1 |  |  |  |  | 21 |
| pell-gradient{"D":2,"k":0}/share-den | whole-at-t/gcd-c | neither | **-6.12** | ≤-6.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-at-t/gcd-c | neither | **-6.12** | ≤-6.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-6.12** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-staircase{"ends":3}/near-miss | both | **-6.11** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-staircase{"ends":3,"side":-1}/near-miss | both | **-6.11** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | whole-intercept/gcd-den-m | one | **-6.09** | ≤-6.1 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/prime | prime-slope/matching-c | one | **-6.08** | -6.1 |  |  |  |  | 79 |
| prime-gradient{"ends":1}/cPrime | prime-slope/matching-c | one | **-6.08** | -6.1 |  |  |  |  | 79 |
| crossing-check{"k":1,"q":2}/whole | smooth-intercept/shared | neither | **-6.07** | ≤-6.1 |  |  |  |  | 0 |
| smooth-intercept/shared | triangle-area{"A":4}/legs | neither | **-6.06** | ≤-6.1 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | smooth-crossing/shared | neither | **-6.06** | ≤-6.1 |  |  |  |  | 1 |
| smooth-intercept/shared | triangle-area{"A":12}/even | neither | **-6.06** | ≤-6.1 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":4}/legs | neither | **-6.06** | ≤-6.1 |  |  |  |  | 0 |
| smooth-intercept/shared | triangle-area{"A":8}/even | neither | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/prime | prime-slope/matching-c | one | **-6.05** | -6.1 |  |  |  |  | 80 |
| smooth-intercept/shared | triangle-area{"A":4}/even | neither | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | long-division/m-top | one | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | long-division/m-bottom-spf | one | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | long-division/c-period | one | **-6.05** | ≤-6.1 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":12}/even | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":8}/even | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-gpf | prime-slope/matching-c | one | **-6.05** | -6.0 |  |  |  |  | 79 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-slope/matching-c | one | **-6.05** | -6.0 |  |  |  |  | 80 |
| m-meets-c/meetPrime | smooth-intercept/shared | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":4}/even | neither | **-6.05** | ≤-6.0 |  |  |  |  | 0 |
| near-point/lattice | smooth-intercept/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| pythagorean-area/slanted-square | smooth-intercept/shared | one | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-6.04** | -6.0 |  |  |  |  | 46 |
| m-meets-c/meetPrime | smooth-crossing/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| pythagorean-area/whole-legs | smooth-intercept/shared | one | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| near-point/lattice | smooth-crossing/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| pythagorean-area/slanted-square | smooth-crossing/shared | one | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| smooth-intercept/shared | triangle-area{"A":18}/even | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| m-meets-c/size | smooth-intercept/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | smooth-intercept/shared | neither | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| pythagorean-area/whole-legs | smooth-crossing/shared | one | **-6.04** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":18}/even | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| m-meets-c/size | smooth-crossing/shared | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | smooth-crossing/shared | neither | **-6.03** | ≤-6.0 |  |  |  |  | 1 |
| smooth-intercept/shared | triangle-area{"A":8}/legs | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| smooth-intercept/shared | triangle-area{"A":6}/even | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| near-point/gcd-x | smooth-intercept/shared | neither | **-6.03** | ≤-6.0 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | square-area/spf | one | **-6.02** | -6.0 |  |  |  |  | 93 |
| pell-gradient{"D":3,"k":0}/difference | square-area/spf | one | **-6.02** | -6.0 |  |  |  |  | 93 |
| smooth-crossing/shared | triangle-area{"A":8}/legs | neither | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":6}/even | neither | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| near-point/gcd-x | smooth-crossing/shared | neither | **-6.02** | ≤-6.0 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-slope/matching-c | one | **-6.02** | -6.0 |  |  |  |  | 80 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-6.02** | -6.0 |  |  |  |  | 46 |
| crossing-check{"k":3,"q":4}/size | whole-at-t/gcd-c | neither | **-6.01** | ≤-6.0 |  |  |  |  | 2 |
| smooth-intercept/shared | triangle-area{"A":6}/legs | neither | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| pythagorean-area/prime-height | smooth-intercept/shared | one | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| smooth-intercept/shared | triangle-area{"A":18}/legs | neither | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-13,"k":2}/square-start | one | **-6.01** | -6.0 |  |  |  |  | 47 |
| smooth-crossing/shared | triangle-area{"A":6}/legs | neither | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| pythagorean-area/prime-height | smooth-crossing/shared | one | **-6.01** | ≤-6.0 |  |  |  |  | 0 |
| smooth-crossing/shared | triangle-area{"A":18}/legs | neither | **-6.00** | ≤-6.0 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-spf | prime-slope/matching-c | one | **-5.99** | -6.0 |  |  |  |  | 79 |
| farey-neighbours/mediant-x | sunken-intercept/shared | neither | **-5.99** | -6.0 |  |  |  |  | 87 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-5.98** | -6.0 |  |  |  |  | 48 |
| divisibility-ladder/m-gpf | whole-intercept/gcd-den-m | one | **-5.98** | ≤-6.0 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-slope/matching-c | one | **-5.97** | -6.0 |  |  |  |  | 80 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-5.97** | -6.0 |  |  |  |  | 48 |
| crossing-check{"k":3,"q":6}/whole | whole-intercept/omega | neither | **-5.94** | -5.9 |  |  |  |  | 50 |
| crossing-check{"k":1,"q":2}/whole | egyptian-line/bottom | neither | **-5.94** | ≤-5.9 |  |  |  |  | 0 |
| smooth-intercept/shared | triangle-area{"A":12}/legs | neither | **-5.94** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":4}/legs | neither | **-5.93** | ≤-5.9 |  |  |  |  | 3 |
| egyptian-line/bottom | pell-gradient{"D":7,"k":0}/share-den | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | whole-intercept/omega | neither | **-5.93** | -5.9 |  |  |  |  | 49 |
| smooth-crossing/shared | triangle-area{"A":12}/legs | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | egyptian-line/bottom | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | square-area/lpf | one | **-5.93** | -5.9 |  |  |  |  | 98 |
| pell-gradient{"D":3,"k":0}/difference | square-area/lpf | one | **-5.93** | -5.9 |  |  |  |  | 98 |
| egyptian-line/bottom | triangle-area{"A":12}/even | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":8}/even | neither | **-5.93** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | ruler/square-area | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | ruler/far | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | ruler/prime-gradient | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":4}/even | neither | **-5.92** | ≤-5.9 |  |  |  |  | 3 |
| farey-neighbours/mediant-x | smooth-intercept/shared | neither | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | near-point/lattice | neither | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":6}/m-gpf | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pythagorean-area/slanted-square | one | **-5.92** | ≤-5.9 |  |  |  |  | 1 |
| egyptian-line/bottom | same-on-both-rulers{"T":-6}/m-gpf | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7}/prime-gradient | one | **-5.92** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1}/prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1}/prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1}/prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-intercept/gcd-den-m | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pythagorean-area/whole-legs | one | **-5.91** | ≤-5.9 |  |  |  |  | 1 |
| egyptian-line/bottom | exact-change/big-bill | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | sunken-intercept/shared | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | smooth-crossing/shared | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":18}/even | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | egyptian-line/bottom | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1}/cPrime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1}/cPrime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1}/cPrime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | egyptian-line/bottom | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":7,"k":0}/pell-c | neither | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7}/next-prime | one | **-5.91** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":1,"k":1}/pell-c | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/gcd-floor-m | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7,"side":-1}/next-prime | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":6}/prime-start | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3}/step-back | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":8}/legs | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":6}/even | neither | **-5.90** | ≤-5.9 |  |  |  |  | 1 |
| egyptian-line/bottom | near-point/gcd-x | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":-6}/prime-start | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":11,"k":2}/square-start | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":13,"k":2}/square-start | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-crossing/gcd-c | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":3,"k":0}/share-den | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":3,"k":0}/difference | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/steep | egyptian-line/bottom | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/whole | egyptian-line/bottom | neither | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":13,"k":2}/prime-terms | one | **-5.90** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | steady-gradient/divisors | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | steady-gradient/divisors | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | steady-gradient/divisors | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-area/gcd-x | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | steady-gradient/gcd-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | steady-gradient/gcd-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | steady-gradient/gcd-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":13,"k":2}/m-gpf | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3,"side":-1}/step-back | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | egyptian-line/bottom | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | egyptian-line/bottom | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":6}/m-spf | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | whole-intercept/gcd-den-m | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":6}/steep | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":6}/whole-values | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":-6}/m-spf | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":11,"k":2}/prime-terms | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":11,"k":2}/m-spf | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":11,"k":2}/m-gpf | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":6,"k":0}/pell-c | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":-6}/steep | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":6}/whole-lamp | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":-6}/whole-values | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":1,"k":1}/difference | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":1,"k":1}/share-den | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":7,"k":0}/difference | neither | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | same-on-both-rulers{"T":-6}/whole-lamp | one | **-5.89** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-13,"k":2}/square-start | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":6}/legs | neither | **-5.88** | ≤-5.9 |  |  |  |  | 1 |
| crossing-check{"k":2,"q":4}/whole | egyptian-line/bottom | neither | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | pythagorean-area/prime-height | one | **-5.88** | ≤-5.9 |  |  |  |  | 1 |
| egyptian-line/bottom | treasure{"T":-13,"k":2}/prime-terms | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-11,"k":2}/square-start | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | triangle-area{"A":18}/legs | neither | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1}/c-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1}/c-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1}/c-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-13,"k":2}/m-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | egyptian-line/bottom | neither | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.88** | -5.9 |  |  |  |  | 70 |
| egyptian-line/bottom | treasure{"T":13,"k":2}/prime-gradient | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":13,"k":2}/m-spf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.88** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.87** | -5.9 |  |  |  |  | 69 |
| crossing-check{"k":3,"q":6}/size | egyptian-line/bottom | neither | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-11,"k":2}/m-spf | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-11,"k":2}/m-gpf | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-11,"k":2}/prime-terms | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | exact-change/prime-coins | neither | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":11,"k":2}/prime-gradient | one | **-5.87** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-13,"k":2}/m-spf | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-crossing/k-gpf | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-13,"k":2}/prime-gradient | one | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| m-meets-c/meetPrime | whole-area/gcd-den-m | neither | **-5.86** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":3,"k":0}/share-den | one | **-5.85** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":3,"k":0}/difference | one | **-5.85** | ≤-5.9 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | egyptian-line/bottom | one | **-5.85** | ≤-5.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.85** | -5.9 |  |  |  |  | 71 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.85** | -5.9 |  |  |  |  | 71 |
| m-meets-c/size | whole-crossing/k-gpf | one | **-5.85** | ≤-5.8 |  |  |  |  | 0 |
| m-meets-c/size | whole-area/gcd-den-m | neither | **-5.85** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | treasure{"T":-11,"k":2}/prime-gradient | one | **-5.85** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | steep-and-tall/shared | neither | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":5,"k":0}/pell-c | neither | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| divisibility-ladder/steep | whole-area/gcd-den-m | one | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-area/gcd-den-m | neither | **-5.84** | ≤-5.8 |  |  |  |  | 0 |
| steady-gradient/gcd-c | whole-area/gcd-den-m | neither | **-5.83** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":3,"k":0}/pell-c | neither | **-5.83** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | target-gradient/same-den | neither | **-5.83** | ≤-5.8 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1}/c-spf | one | **-5.82** | ≤-5.8 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1}/c-spf | one | **-5.82** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1}/c-spf | one | **-5.82** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.82** | -5.8 |  |  |  |  | 71 |
| pell-gradient{"D":3,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.82** | ≤-5.8 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.82** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.82** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.82** | -5.8 |  |  |  |  | 71 |
| divisibility-ladder/steep | whole-intercept/spf | one | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | whole-intercept/omega | neither | **-5.81** | ≤-5.8 |  |  |  |  | 8 |
| egyptian-line/bottom | triangle-area{"A":12}/legs | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | target-gradient/gcd-tops | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| prime-slope/matching-c | smooth-intercept/shared | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7}/m-spf | one | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7}/m-gpf | one | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":5,"k":0}/share-den | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":5,"k":0}/difference | neither | **-5.81** | ≤-5.8 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":13,"k":2}/m-gpf | one | **-5.80** | -5.8 |  |  |  |  | 126 |
| prime-slope/matching-c | smooth-crossing/shared | neither | **-5.80** | ≤-5.8 |  |  |  |  | 11 |
| egyptian-line/bottom | prime-landing{"ends":7,"side":-1}/m-spf | one | **-5.80** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-5.80** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | egyptian-line/bottom | neither | **-5.80** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.79** | -5.8 |  |  |  |  | 70 |
| divisibility-ladder/m-spf | whole-area/gcd-den-m | one | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.79** | -5.8 |  |  |  |  | 69 |
| near-point/lattice | whole-intercept/omega | neither | **-5.79** | ≤-5.8 |  |  |  |  | 18 |
| egyptian-line/bottom | pell-gradient{"D":2,"k":0}/share-den | neither | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":2,"k":0}/difference | neither | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":2,"k":0}/pell-c | neither | **-5.79** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/size | whole-intercept/omega | neither | **-5.78** | ≤-5.8 |  |  |  |  | 25 |
| prime-staircase{"ends":3}/near-miss | smooth-intercept/shared | one | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/near-miss | smooth-intercept/shared | one | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | whole-intercept/omega | neither | **-5.78** | ≤-5.8 |  |  |  |  | 8 |
| divisibility-ladder/steep | euclid-steps/largest-quotient | one | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | steady-gradient/divisors | neither | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | steady-gradient/gcd-c | neither | **-5.78** | ≤-5.8 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | whole-intercept/spf | one | **-5.77** | ≤-5.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/near-miss | smooth-crossing/shared | one | **-5.77** | ≤-5.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/near-miss | smooth-crossing/shared | one | **-5.77** | ≤-5.8 |  |  |  |  | 0 |
| near-point/gcd-x | whole-intercept/omega | neither | **-5.77** | ≤-5.8 |  |  |  |  | 18 |
| crossing-check{"k":2,"q":4}/size | whole-intercept/omega | neither | **-5.77** | ≤-5.8 |  |  |  |  | 23 |
| crossing-check{"k":2,"q":6}/whole | whole-intercept/omega | neither | **-5.77** | ≤-5.8 |  |  |  |  | 25 |
| crossing-check{"k":3,"q":2}/whole | whole-crossing/gcd-c | neither | **-5.76** | ≤-5.8 |  |  |  |  | 2 |
| crossing-check{"k":3,"q":2}/whole | steady-gradient/divisors | neither | **-5.76** | ≤-5.8 |  |  |  |  | 11 |
| crossing-check{"k":2,"q":4}/whole | whole-intercept/omega | neither | **-5.75** | ≤-5.8 |  |  |  |  | 23 |
| crossing-check{"k":1,"q":6}/size | steady-gradient/divisors | neither | **-5.75** | -5.8 |  |  |  |  | 117 |
| crossing-check{"k":1,"q":4}/size | whole-intercept/omega | neither | **-5.75** | ≤-5.7 |  |  |  |  | 29 |
| divisibility-ladder/m-gpf | pell-gradient{"D":3,"k":0}/share-den | one | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":3,"k":0}/difference | one | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | egyptian-line/bottom | one | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | euclid-steps/largest-quotient | one | **-5.74** | ≤-5.7 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing/k-gpf | one | **-5.73** | ≤-5.7 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-area/gcd-den-m | neither | **-5.73** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-landing{"ends":7}/big-prime | one | **-5.72** | ≤-5.7 |  |  |  |  | 0 |
| steady-gradient/divisors | treasure{"T":-13,"k":2}/m-gpf | one | **-5.72** | -5.7 |  |  |  |  | 125 |
| crossing-check{"k":1,"q":4}/whole | egyptian-line/bottom | neither | **-5.72** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | steady-gradient/divisors | neither | **-5.72** | -5.7 |  |  |  |  | 121 |
| egyptian-line/bottom | prime-landing{"ends":7,"side":-1}/big-prime | one | **-5.72** | ≤-5.7 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/share-den | square-area/omega | one | **-5.72** | -5.7 |  |  |  |  | 105 |
| pell-gradient{"D":3,"k":0}/difference | square-area/omega | one | **-5.72** | -5.7 |  |  |  |  | 105 |
| crossing-check{"k":3,"q":2}/whole | steep-and-tall/shared | neither | **-5.71** | ≤-5.7 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-area/gcd-x | neither | **-5.70** | -4.1 | -7.3 |  |  |  | 884 |
| divisibility-ladder/m-gpf | whole-area/gcd-den-m | one | **-5.68** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | egyptian-line/bottom | neither | **-5.68** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-slope/matching-c | neither | **-5.68** | ≤-5.7 |  |  |  |  | 0 |
| euclid-steps/largest-quotient | farey-neighbours/mediant-x | neither | **-5.67** | ≤-5.7 |  |  |  |  | 11 |
| divisibility-ladder/m-gpf | whole-intercept/spf | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-intercept/omega | neither | **-5.66** | ≤-5.7 |  |  |  |  | 19 |
| divisibility-ladder/m-prime | pell-gradient{"D":3,"k":0}/share-den | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":3,"k":0}/difference | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | egyptian-line/bottom | one | **-5.66** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3}/near-miss | one | **-5.65** | ≤-5.7 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3,"side":-1}/near-miss | one | **-5.65** | ≤-5.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | sunken-intercept/shared | neither | **-5.64** | -5.6 |  |  |  |  | 138 |
| steady-gradient/divisors | whole-crossing/gcd-c | neither | **-5.64** | -4.2 | -7.1 |  |  |  | 850 |
| egyptian-line/bottom | exact-change/big-piles | neither | **-5.63** | ≤-5.6 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | euclid-steps/largest-quotient | one | **-5.62** | ≤-5.6 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-area/gcd-den-m | neither | **-5.62** | ≤-5.6 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing/gcd-num-m | neither | **-5.61** | ≤-5.6 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-intercept/spf | neither | **-5.60** | ≤-5.6 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | whole-area/gcd-den-m | one | **-5.60** | ≤-5.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | whole-intercept/omega | neither | **-5.59** | ≤-5.6 |  |  |  |  | 29 |
| prime-slope/square-sum | smooth-square/shared | neither | **-5.59** | -5.6 |  |  |  |  | 32 |
| smooth-crossing/shared | steady-gradient/divisors | neither | **-5.59** | -4.2 | -7.0 |  |  |  | 583 |
| treasure{"T":11,"k":2}/square-start | whole-intercept/omega | one | **-5.58** | -5.6 |  |  |  |  | 71 |
| divisibility-ladder/m-prime | whole-intercept/spf | one | **-5.58** | ≤-5.6 |  |  |  |  | 0 |
| treasure{"T":11,"k":2}/prime-terms | whole-intercept/omega | one | **-5.57** | -5.6 |  |  |  |  | 71 |
| treasure{"T":11,"k":2}/m-spf | whole-intercept/omega | one | **-5.57** | -5.6 |  |  |  |  | 71 |
| treasure{"T":11,"k":2}/m-gpf | whole-intercept/omega | one | **-5.57** | -5.6 |  |  |  |  | 71 |
| pell-gradient{"D":7,"k":0}/share-den | smooth-gradient/shared | neither | **-5.56** | ≤-5.6 |  |  |  |  | 0 |
| prime-slope/square-sum | square-area/omega | one | **-5.56** | -5.6 |  |  |  |  | 32 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-11,"k":2}/square-start | one | **-5.56** | -5.6 |  |  |  |  | 61 |
| prime-slope/square-sum | square-area/lpf | one | **-5.56** | -5.6 |  |  |  |  | 32 |
| prime-slope/matching-c | whole-intercept/omega | neither | **-5.55** | ≤-5.6 |  |  |  |  | 0 |
| treasure{"T":11,"k":2}/prime-gradient | whole-intercept/omega | one | **-5.55** | -5.5 |  |  |  |  | 71 |
| near-point/lattice | smooth-gradient/shared | neither | **-5.55** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-5.55** | -5.5 |  |  |  |  | 61 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-5.55** | -5.5 |  |  |  |  | 61 |
| treasure{"T":13,"k":2}/prime-gradient | whole-intercept/omega | one | **-5.54** | -5.5 |  |  |  |  | 67 |
| divisibility-ladder/m-prime | euclid-steps/largest-quotient | one | **-5.54** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.54** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | square-area/spf | one | **-5.54** | -5.5 |  |  |  |  | 162 |
| pell-gradient{"D":3,"k":0}/share-den | whole-at-t/gcd-c | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-at-t/gcd-c | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/pell-c | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-at-t/gcd-c | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/step-back | smooth-gradient/shared | one | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| near-point/gcd-x | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | smooth-gradient/shared | neither | **-5.53** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.53** | -5.5 |  |  |  |  | 84 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-5.52** | -5.5 |  |  |  |  | 61 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-5.52** | -5.5 |  |  |  |  | 62 |
| prime-staircase{"ends":3,"side":-1}/step-back | smooth-gradient/shared | one | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/near-miss | whole-intercept/omega | one | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/near-miss | whole-intercept/omega | one | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.52** | -5.5 |  |  |  |  | 85 |
| pell-gradient{"D":6,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | smooth-gradient/shared | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | smooth-gradient/shared | neither | **-5.52** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | smooth-gradient/shared | neither | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1}/prime | one | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1}/prime | one | **-5.51** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1}/cPrime | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1}/cPrime | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| treasure{"T":-11,"k":2}/square-start | whole-intercept/omega | one | **-5.50** | -5.5 |  |  |  |  | 75 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.50** | ≤-5.5 |  |  |  |  | 0 |
| treasure{"T":-11,"k":2}/m-spf | whole-intercept/omega | one | **-5.49** | -5.5 |  |  |  |  | 75 |
| treasure{"T":-11,"k":2}/m-gpf | whole-intercept/omega | one | **-5.49** | -5.5 |  |  |  |  | 75 |
| treasure{"T":-11,"k":2}/prime-terms | whole-intercept/omega | one | **-5.49** | -5.5 |  |  |  |  | 75 |
| divisibility-ladder/steep | pell-gradient{"D":6,"k":0}/share-den | one | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/steep | pell-gradient{"D":6,"k":0}/difference | one | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | steady-gradient/divisors | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | steady-gradient/divisors | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | sunken-intercept/shared | neither | **-5.49** | -5.5 |  |  |  |  | 138 |
| pell-gradient{"D":6,"k":0}/share-den | steady-gradient/gcd-c | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | steady-gradient/gcd-c | neither | **-5.49** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1}/prime | one | **-5.48** | -5.5 |  |  |  |  | 89 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1}/c-gpf | one | **-5.48** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1}/c-gpf | one | **-5.48** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.47** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.47** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.47** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1}/cPrime | one | **-5.47** | -5.5 |  |  |  |  | 89 |
| treasure{"T":-11,"k":2}/prime-gradient | whole-intercept/omega | one | **-5.47** | -5.5 |  |  |  |  | 75 |
| pell-gradient{"D":3,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | square-area/spf | one | **-5.46** | -5.5 |  |  |  |  | 177 |
| smooth-gradient/shared | target-gradient/same-den | neither | **-5.46** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-5.46** | -5.5 |  |  |  |  | 93 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-5.45** | -5.5 |  |  |  |  | 94 |
| divisibility-ladder/m-spf | pell-gradient{"D":6,"k":0}/share-den | one | **-5.45** | ≤-5.5 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | pell-gradient{"D":6,"k":0}/difference | one | **-5.45** | ≤-5.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.44** | -5.4 |  |  |  |  | 84 |
| smooth-gradient/shared | target-gradient/gcd-tops | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/gcd-den-m | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | smooth-gradient/shared | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | smooth-gradient/shared | neither | **-5.44** | ≤-5.4 |  |  |  |  | 0 |
| treasure{"T":13,"k":2}/square-start | whole-intercept/omega | one | **-5.43** | -5.4 |  |  |  |  | 73 |
| m-meets-c/meetPrime | whole-crossing/k-spf | one | **-5.42** | ≤-5.4 |  |  |  |  | 12 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1}/c-spf | one | **-5.42** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1}/c-spf | one | **-5.42** | ≤-5.4 |  |  |  |  | 0 |
| treasure{"T":13,"k":2}/prime-terms | whole-intercept/omega | one | **-5.42** | -5.4 |  |  |  |  | 73 |
| pell-gradient{"D":6,"k":0}/share-den | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.42** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.42** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | smooth-gradient/shared | neither | **-5.41** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | smooth-gradient/shared | neither | **-5.41** | ≤-5.4 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | smooth-gradient/shared | neither | **-5.41** | ≤-5.4 |  |  |  |  | 0 |
| m-meets-c/size | whole-crossing/k-spf | one | **-5.41** | ≤-5.4 |  |  |  |  | 12 |
| crossing-check{"k":3,"q":2}/whole | whole-at-t/gcd-c | neither | **-5.40** | ≤-5.4 |  |  |  |  | 21 |
| smooth-intercept/shared | steady-gradient/divisors | neither | **-5.39** | -3.8 | -6.9 |  |  |  | 787 |
| m-meets-c/meetPrime | whole-crossing/gcd-num-m | neither | **-5.39** | -5.4 |  |  |  |  | 53 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1}/c-spf | one | **-5.39** | -5.4 |  |  |  |  | 89 |
| m-meets-c/size | whole-crossing/gcd-num-m | neither | **-5.38** | -5.4 |  |  |  |  | 53 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1}/prime | one | **-5.36** | -5.4 |  |  |  |  | 90 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1}/cPrime | one | **-5.36** | -5.4 |  |  |  |  | 89 |
| square-area/spf | whole-intercept/mc-spf | one | **-5.35** | -5.4 |  |  |  |  | 129 |
| square-area/lpf | whole-intercept/mc-spf | one | **-5.35** | -5.3 |  |  |  |  | 130 |
| divisibility-ladder/m-gpf | pell-gradient{"D":6,"k":0}/share-den | one | **-5.34** | ≤-5.3 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | pell-gradient{"D":6,"k":0}/difference | one | **-5.34** | ≤-5.3 |  |  |  |  | 0 |
| egyptian-line/bottom | smooth-intercept/shared | neither | **-5.33** | ≤-5.3 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | square-area/omega | one | **-5.32** | -5.3 |  |  |  |  | 181 |
| egyptian-line/bottom | smooth-crossing/shared | neither | **-5.32** | ≤-5.3 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/difference | square-area/lpf | one | **-5.32** | -5.3 |  |  |  |  | 181 |
| crossing-check{"k":3,"q":4}/size | smooth-gradient/shared | neither | **-5.31** | ≤-5.3 |  |  |  |  | 18 |
| prime-slope/matching-c | smooth-gradient/shared | neither | **-5.31** | ≤-5.3 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing/k-spf | one | **-5.29** | ≤-5.3 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-13,"k":2}/square-start | one | **-5.29** | -5.3 |  |  |  |  | 143 |
| crossing-check{"k":3,"q":4}/whole | whole-crossing/gcd-c | neither | **-5.29** | ≤-5.3 |  |  |  |  | 1 |
| crossing-check{"k":3,"q":4}/whole | steady-gradient/divisors | neither | **-5.29** | ≤-5.3 |  |  |  |  | 12 |
| prime-staircase{"ends":3}/near-miss | smooth-gradient/shared | one | **-5.28** | ≤-5.3 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/near-miss | smooth-gradient/shared | one | **-5.28** | ≤-5.3 |  |  |  |  | 0 |
| near-point/lattice | sunken-intercept/shared | neither | **-5.27** | -5.3 |  |  |  |  | 141 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1}/c-spf | one | **-5.27** | -5.3 |  |  |  |  | 89 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-13,"k":2}/square-start | one | **-5.27** | -5.3 |  |  |  |  | 153 |
| near-point/lattice | whole-at-t/gcd-c | neither | **-5.27** | -5.3 |  |  |  |  | 87 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-13,"k":2}/prime-terms | one | **-5.27** | -5.3 |  |  |  |  | 153 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-13,"k":2}/m-gpf | one | **-5.26** | -5.3 |  |  |  |  | 153 |
| pell-gradient{"D":7,"k":0}/pell-c | square-area/omega | one | **-5.26** | -5.3 |  |  |  |  | 196 |
| near-point/gcd-x | sunken-intercept/shared | neither | **-5.26** | -5.3 |  |  |  |  | 140 |
| steady-gradient/divisors | whole-crossing/k-spf | one | **-5.26** | -5.3 |  |  |  |  | 140 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-13,"k":2}/prime-terms | one | **-5.26** | -5.3 |  |  |  |  | 147 |
| pell-gradient{"D":7,"k":0}/pell-c | square-area/lpf | one | **-5.26** | -5.3 |  |  |  |  | 196 |
| treasure{"T":13,"k":2}/m-spf | whole-intercept/omega | one | **-5.26** | -5.3 |  |  |  |  | 81 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-13,"k":2}/square-start | one | **-5.26** | -5.3 |  |  |  |  | 153 |
| divisibility-ladder/m-prime | pell-gradient{"D":6,"k":0}/share-den | one | **-5.25** | ≤-5.3 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | pell-gradient{"D":6,"k":0}/difference | one | **-5.25** | ≤-5.3 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-5.25** | -5.3 |  |  |  |  | 153 |
| near-point/gcd-x | whole-at-t/gcd-c | neither | **-5.25** | -5.3 |  |  |  |  | 87 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-5.25** | -5.3 |  |  |  |  | 153 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-13,"k":2}/m-spf | one | **-5.25** | -5.2 |  |  |  |  | 153 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-5.24** | -5.2 |  |  |  |  | 153 |
| crossing-check{"k":3,"q":4}/whole | steep-and-tall/shared | neither | **-5.24** | ≤-5.2 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-5.23** | -5.2 |  |  |  |  | 153 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-5.23** | -5.2 |  |  |  |  | 153 |
| treasure{"T":-13,"k":2}/prime-gradient | whole-intercept/omega | one | **-5.23** | -5.2 |  |  |  |  | 73 |
| pell-gradient{"D":3,"k":0}/share-den | smooth-square/shared | neither | **-5.23** | -5.2 |  |  |  |  | 134 |
| pell-gradient{"D":3,"k":0}/difference | smooth-square/shared | neither | **-5.23** | -5.2 |  |  |  |  | 134 |
| long-division/m-top | smooth-gradient/shared | neither | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| long-division/m-bottom-spf | smooth-gradient/shared | neither | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| long-division/c-period | smooth-gradient/shared | neither | **-5.22** | ≤-5.2 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1}/prime | one | **-5.22** | -5.2 |  |  |  |  | 102 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1}/cPrime | one | **-5.22** | -5.2 |  |  |  |  | 101 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1}/prime | one | **-5.22** | -5.2 |  |  |  |  | 101 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1}/cPrime | one | **-5.21** | -5.2 |  |  |  |  | 101 |
| egyptian-line/bottom | pell-gradient{"D":3,"k":0}/share-den | neither | **-5.20** | ≤-5.2 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":3,"k":0}/difference | neither | **-5.20** | ≤-5.2 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | smooth-intercept/shared | neither | **-5.19** | ≤-5.2 |  |  |  |  | 0 |
| square-area/omega | whole-intercept/mc-spf | one | **-5.19** | -5.2 |  |  |  |  | 133 |
| crossing-check{"k":3,"q":2}/whole | smooth-crossing/shared | neither | **-5.19** | ≤-5.2 |  |  |  |  | 2 |
| crossing-check{"k":2,"q":4}/size | whole-at-t/gcd-c | neither | **-5.18** | -5.2 |  |  |  |  | 93 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-5.17** | -5.2 |  |  |  |  | 102 |
| steady-gradient/divisors | whole-crossing/k-gpf | one | **-5.16** | -5.2 |  |  |  |  | 334 |
| treasure{"T":-13,"k":2}/prime-terms | whole-intercept/omega | one | **-5.15** | -5.2 |  |  |  |  | 78 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-13,"k":2}/m-spf | one | **-5.14** | -5.1 |  |  |  |  | 152 |
| egyptian-line/bottom | whole-crossing/k-gpf | one | **-5.14** | ≤-5.1 |  |  |  |  | 5 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-5.14** | -5.1 |  |  |  |  | 152 |
| egyptian-line/bottom | whole-area/gcd-den-m | neither | **-5.14** | ≤-5.1 |  |  |  |  | 4 |
| treasure{"T":-13,"k":2}/square-start | whole-intercept/omega | one | **-5.14** | -5.1 |  |  |  |  | 80 |
| crossing-check{"k":2,"q":4}/whole | whole-at-t/gcd-c | neither | **-5.14** | -5.1 |  |  |  |  | 96 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1}/c-spf | one | **-5.14** | -5.1 |  |  |  |  | 101 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1}/c-spf | one | **-5.13** | -5.1 |  |  |  |  | 101 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1}/c-gpf | one | **-5.13** | -5.1 |  |  |  |  | 106 |
| m-meets-c/meetPrime | triangle-area{"A":18}/even | neither | **-5.13** | -5.1 |  |  |  |  | 141 |
| egyptian-line/bottom | whole-intercept/spf | neither | **-5.12** | ≤-5.1 |  |  |  |  | 0 |
| smooth-square/shared | whole-intercept/mc-spf | neither | **-5.12** | -5.1 |  |  |  |  | 140 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-5.11** | -5.1 |  |  |  |  | 110 |
| m-meets-c/size | triangle-area{"A":18}/even | neither | **-5.11** | -5.1 |  |  |  |  | 142 |
| pell-gradient{"D":7,"k":0}/difference | smooth-square/shared | neither | **-5.10** | -5.1 |  |  |  |  | 205 |
| m-meets-c/meetPrime | triangle-area{"A":18}/legs | neither | **-5.10** | -5.1 |  |  |  |  | 141 |
| farey-neighbours/mediant-x | whole-at-t/gcd-c | neither | **-5.09** | -5.1 |  |  |  |  | 66 |
| smooth-square/shared | whole-crossing/m-spf | one | **-5.09** | ≤-5.1 |  |  |  |  | 0 |
| m-meets-c/size | triangle-area{"A":18}/legs | neither | **-5.08** | -5.1 |  |  |  |  | 142 |
| pell-gradient{"D":2,"k":0}/share-den | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 220 |
| pell-gradient{"D":2,"k":0}/difference | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 220 |
| pell-gradient{"D":2,"k":0}/pell-c | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 220 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-crossing/m-spf | one | **-5.07** | ≤-5.1 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-crossing/m-spf | one | **-5.07** | ≤-5.1 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/omega | neither | **-5.07** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | square-area/spf | one | **-5.07** | -5.1 |  |  |  |  | 249 |
| crossing-check{"k":2,"q":2}/whole | whole-crossing/m-spf | one | **-5.07** | ≤-5.1 |  |  |  |  | 0 |
| smooth-gradient/shared | whole-intercept/gcd-den-m | neither | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | egyptian-line/bottom | neither | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| square-area/omega | whole-crossing/m-spf | both | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-crossing/m-spf | one | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| square-area/lpf | whole-crossing/m-spf | both | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/difference | whole-crossing/m-spf | one | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-crossing/m-spf | one | **-5.06** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | smooth-square/shared | neither | **-5.05** | -5.1 |  |  |  |  | 219 |
| square-area/spf | whole-crossing/m-spf | both | **-5.05** | ≤-5.1 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | square-area/omega | one | **-5.04** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/difference | square-area/omega | one | **-5.04** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/pell-c | square-area/omega | one | **-5.04** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/share-den | square-area/lpf | one | **-5.03** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/difference | square-area/lpf | one | **-5.03** | -5.0 |  |  |  |  | 228 |
| pell-gradient{"D":2,"k":0}/pell-c | square-area/lpf | one | **-5.03** | -5.0 |  |  |  |  | 228 |
| egyptian-line/bottom | whole-crossing/gcd-num-m | neither | **-5.03** | ≤-5.0 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/size | prime-gradient{"ends":1}/c-gpf | one | **-5.02** | -5.0 |  |  |  |  | 107 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-crossing/m-spf | one | **-5.01** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-crossing/m-spf | one | **-5.00** | ≤-5.0 |  |  |  |  | 0 |
| target-gradient/same-den | whole-crossing/m-spf | one | **-5.00** | ≤-5.0 |  |  |  |  | 0 |
| target-gradient/gcd-tops | whole-crossing/m-spf | one | **-4.98** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | whole-crossing/m-spf | one | **-4.98** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | whole-crossing/m-spf | one | **-4.98** | ≤-5.0 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-crossing/m-spf | one | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | whole-crossing/m-spf | one | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-crossing/m-spf | one | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-crossing/m-spf | one | **-4.96** | ≤-5.0 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | whole-area/gcd-x | neither | **-4.95** | -5.0 |  |  |  |  | 60 |
| crossing-check{"k":3,"q":2}/size | whole-intercept/mc-spf | neither | **-4.95** | -4.9 |  |  |  |  | 35 |
| treasure{"T":13,"k":2}/m-gpf | whole-intercept/omega | one | **-4.95** | -4.9 |  |  |  |  | 105 |
| crossing-check{"k":3,"q":2}/whole | whole-intercept/omega | neither | **-4.94** | ≤-4.9 |  |  |  |  | 14 |
| crossing-check{"k":1,"q":6}/whole | steep-and-tall/shared | neither | **-4.93** | -4.9 |  |  |  |  | 118 |
| crossing-check{"k":3,"q":4}/whole | whole-at-t/gcd-c | neither | **-4.93** | ≤-4.9 |  |  |  |  | 2 |
| crossing-check{"k":3,"q":2}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.92** | -4.9 |  |  |  |  | 128 |
| crossing-check{"k":1,"q":6}/size | steep-and-tall/shared | neither | **-4.90** | -4.9 |  |  |  |  | 118 |
| near-point/lattice | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.89** | -4.9 |  |  |  |  | 151 |
| treasure{"T":-13,"k":2}/m-spf | whole-intercept/omega | one | **-4.88** | -4.9 |  |  |  |  | 96 |
| crossing-check{"k":3,"q":4}/size | whole-intercept/mc-spf | neither | **-4.88** | -4.9 |  |  |  |  | 30 |
| near-point/lattice | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.88** | -4.9 |  |  |  |  | 153 |
| near-point/gcd-x | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.88** | -4.9 |  |  |  |  | 151 |
| pell-gradient{"D":1,"k":1}/pell-c | whole-intercept/mc-spf | neither | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/mc-spf | neither | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":13,"k":2}/square-start | one | **-4.87** | -4.9 |  |  |  |  | 157 |
| near-point/gcd-x | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.87** | -4.9 |  |  |  |  | 152 |
| crossing-check{"k":2,"q":2}/whole | whole-intercept/mc-spf | neither | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":13,"k":2}/prime-terms | one | **-4.87** | -4.9 |  |  |  |  | 157 |
| divisibility-ladder/steep | whole-intercept/mc-spf | one | **-4.87** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | smooth-square/shared | neither | **-4.86** | -4.9 |  |  |  |  | 261 |
| pell-gradient{"D":2,"k":0}/difference | smooth-square/shared | neither | **-4.86** | -4.9 |  |  |  |  | 261 |
| pell-gradient{"D":2,"k":0}/pell-c | smooth-square/shared | neither | **-4.86** | -4.9 |  |  |  |  | 261 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":13,"k":2}/m-gpf | one | **-4.86** | -4.9 |  |  |  |  | 157 |
| whole-area/gcd-x | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":13,"k":2}/square-start | one | **-4.86** | -4.9 |  |  |  |  | 157 |
| pell-gradient{"D":1,"k":1}/difference | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":1,"k":1}/share-den | whole-intercept/mc-spf | neither | **-4.86** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | square-area/omega | one | **-4.85** | -4.9 |  |  |  |  | 276 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-4.85** | -4.9 |  |  |  |  | 157 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-4.85** | -4.9 |  |  |  |  | 157 |
| prime-slope/matching-c | whole-crossing/m-spf | one | **-4.85** | ≤-4.9 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | square-area/lpf | one | **-4.85** | -4.8 |  |  |  |  | 276 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":13,"k":2}/prime-gradient | one | **-4.85** | -4.8 |  |  |  |  | 157 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":13,"k":2}/m-spf | one | **-4.85** | -4.8 |  |  |  |  | 157 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-4.83** | -4.8 |  |  |  |  | 157 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":13,"k":2}/m-spf | one | **-4.83** | -4.8 |  |  |  |  | 157 |
| crossing-check{"k":2,"q":4}/size | sunken-intercept/shared | neither | **-4.83** | -4.8 |  |  |  |  | 205 |
| pell-gradient{"D":3,"k":0}/share-den | smooth-gradient/shared | neither | **-4.83** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | smooth-gradient/shared | neither | **-4.83** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | whole-at-t/gcd-c | neither | **-4.83** | -4.8 |  |  |  |  | 91 |
| egyptian-line/bottom | smooth-gradient/shared | neither | **-4.83** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-13,"k":2}/m-gpf | one | **-4.83** | -4.8 |  |  |  |  | 167 |
| divisibility-ladder/m-spf | whole-intercept/mc-spf | one | **-4.82** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | sunken-intercept/shared | neither | **-4.82** | -4.8 |  |  |  |  | 205 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.81** | ≤-4.8 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/size | sunken-intercept/shared | neither | **-4.80** | -4.8 |  |  |  |  | 256 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| target-gradient/same-den | whole-intercept/mc-spf | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":6,"k":0}/share-den | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| egyptian-line/bottom | pell-gradient{"D":6,"k":0}/difference | neither | **-4.80** | ≤-4.8 |  |  |  |  | 0 |
| near-point/lattice | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.79** | -4.8 |  |  |  |  | 161 |
| near-point/gcd-x | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.78** | -4.8 |  |  |  |  | 160 |
| exact-change/prime-coins | m-meets-c/meetPrime | neither | **-4.78** | -4.8 |  |  |  |  | 112 |
| egyptian-line/bottom | smooth-square/shared | neither | **-4.78** | -4.8 |  |  |  |  | 63 |
| target-gradient/gcd-tops | whole-intercept/mc-spf | neither | **-4.78** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/share-den | whole-intercept/mc-spf | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | whole-intercept/mc-spf | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| smooth-gradient/shared | whole-area/gcd-den-m | neither | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| exact-change/prime-coins | m-meets-c/size | neither | **-4.77** | -4.8 |  |  |  |  | 112 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3}/last-prime | both | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3}/first-prime | both | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/last-prime | sunken-intercept/shared | one | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/first-prime | sunken-intercept/shared | one | **-4.77** | ≤-4.8 |  |  |  |  | 0 |
| long-division/m-top | whole-crossing/m-spf | one | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| long-division/m-bottom-spf | whole-crossing/m-spf | one | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| long-division/c-period | whole-crossing/m-spf | one | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | triangle-area{"A":18}/legs | neither | **-4.76** | -4.8 |  |  |  |  | 180 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3}/last-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3}/first-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3}/last-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3}/first-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| farey-neighbours/mediant-x | whole-intercept/mc-spf | neither | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3}/last-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3}/first-prime | both | **-4.76** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/share-den | whole-intercept/mc-spf | neither | **-4.75** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/difference | whole-intercept/mc-spf | neither | **-4.75** | ≤-4.8 |  |  |  |  | 0 |
| pell-gradient{"D":2,"k":0}/pell-c | whole-intercept/mc-spf | neither | **-4.75** | ≤-4.8 |  |  |  |  | 0 |
| near-point/lattice | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.75** | -4.8 |  |  |  |  | 159 |
| egyptian-line/bottom | square-area/omega | one | **-4.75** | -4.8 |  |  |  |  | 63 |
| divisibility-ladder/steep | prime-staircase{"ends":3}/last-prime | both | **-4.75** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-staircase{"ends":3}/first-prime | both | **-4.75** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":13,"k":2}/square-start | one | **-4.75** | -4.7 |  |  |  |  | 178 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1}/prime | one | **-4.75** | -4.7 |  |  |  |  | 89 |
| egyptian-line/bottom | square-area/lpf | one | **-4.74** | -4.7 |  |  |  |  | 63 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1}/cPrime | one | **-4.74** | -4.7 |  |  |  |  | 89 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.74** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/prime-gradient | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.74** | ≤-4.7 |  |  |  |  | 0 |
| near-point/gcd-x | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.74** | -4.7 |  |  |  |  | 158 |
| exact-change/big-bill | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-4.74** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/big-bill | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-4.74** | ≤-4.7 |  |  |  |  | 0 |
| egyptian-line/bottom | square-area/spf | one | **-4.74** | -4.7 |  |  |  |  | 63 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.73** | -4.7 |  |  |  |  | 92 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/next-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.73** | -4.7 |  |  |  |  | 93 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/next-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.73** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-4.72** | -4.7 |  |  |  |  | 178 |
| crossing-check{"k":3,"q":4}/whole | smooth-intercept/shared | neither | **-4.72** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.72** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.72** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":13,"k":2}/square-start | one | **-4.72** | -4.7 |  |  |  |  | 177 |
| crossing-check{"k":3,"q":4}/whole | smooth-crossing/shared | neither | **-4.72** | ≤-4.7 |  |  |  |  | 1 |
| euclid-steps/largest-quotient | smooth-gradient/shared | neither | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/share-den | prime-slope/twins | neither | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | whole-intercept/mc-spf | one | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-staircase{"ends":3}/last-prime | both | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-staircase{"ends":3}/first-prime | both | **-4.71** | ≤-4.7 |  |  |  |  | 0 |
| whole-at-t/gcd-c | whole-crossing/m-spf | one | **-4.70** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | smooth-square/shared | neither | **-4.70** | ≤-4.7 |  |  |  |  | 16 |
| pell-gradient{"D":7,"k":0}/share-den | smooth-square/shared | neither | **-4.70** | -4.7 |  |  |  |  | 299 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":13,"k":2}/prime-gradient | one | **-4.70** | -4.7 |  |  |  |  | 177 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.70** | -4.7 |  |  |  |  | 183 |
| exact-change/prime-coins | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| exact-change/prime-coins | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/prime | prime-slope/twins | one | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.69** | -4.7 |  |  |  |  | 185 |
| prime-gradient{"ends":1}/cPrime | prime-slope/twins | one | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/prime | prime-slope/twins | one | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| pell-gradient{"D":7,"k":0}/pell-c | prime-slope/twins | neither | **-4.69** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | whole-intercept/gcd-floor-m | neither | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.68** | -4.7 |  |  |  |  | 182 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-slope/twins | one | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.68** | -4.7 |  |  |  |  | 183 |
| divisibility-ladder/m-spf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/m-spf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| divisibility-ladder/steep | prime-slope/twins | one | **-4.68** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | steady-gradient/divisors | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | steady-gradient/gcd-c | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | square-area/omega | one | **-4.67** | ≤-4.7 |  |  |  |  | 7 |
| prime-staircase{"ends":3,"side":-1}/last-prime | steep-and-tall/shared | one | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | steep-and-tall/shared | one | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/pell-c | prime-slope/twins | neither | **-4.67** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | square-area/lpf | one | **-4.67** | ≤-4.7 |  |  |  |  | 7 |
| pell-gradient{"D":7,"k":0}/difference | prime-slope/twins | neither | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-13,"k":2}/square-start | one | **-4.66** | -4.7 |  |  |  |  | 192 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3}/last-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3}/last-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/twins | square-area/spf | one | **-4.66** | ≤-4.7 |  |  |  |  | 7 |
| prime-gradient{"ends":1}/c-gpf | prime-slope/twins | one | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1}/c-spf | one | **-4.66** | -4.7 |  |  |  |  | 89 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3}/last-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3}/last-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3}/first-prime | both | **-4.66** | ≤-4.7 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-slope/twins | one | **-4.65** | ≤-4.7 |  |  |  |  | 0 |
| prime-slope/matching-c | whole-intercept/mc-spf | neither | **-4.65** | ≤-4.6 |  |  |  |  | 0 |
| treasure{"T":-13,"k":2}/m-gpf | whole-intercept/omega | one | **-4.65** | -4.6 |  |  |  |  | 116 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-4.64** | -4.6 |  |  |  |  | 195 |
| divisibility-ladder/m-spf | prime-slope/twins | one | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-spf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/m-gpf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-spf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/m-gpf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | whole-intercept/mc-spf | one | **-4.63** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | square-area/spf | one | **-4.63** | -4.6 |  |  |  |  | 154 |
| pell-gradient{"D":6,"k":0}/difference | square-area/spf | one | **-4.63** | -4.6 |  |  |  |  | 154 |
| farey-neighbours/mediant-x | triangle-area{"A":18}/even | neither | **-4.62** | -4.6 |  |  |  |  | 195 |
| pell-gradient{"D":5,"k":0}/pell-c | prime-slope/twins | neither | **-4.62** | ≤-4.6 |  |  |  |  | 0 |
| whole-crossing/m-spf | whole-intercept/gcd-den-m | one | **-4.61** | ≤-4.6 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-spf | prime-slope/twins | one | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-slope/twins | one | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":6}/whole | sunken-intercept/shared | neither | **-4.60** | -4.6 |  |  |  |  | 288 |
| divisibility-ladder/m-gpf | prime-staircase{"ends":3}/last-prime | both | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-staircase{"ends":3}/first-prime | both | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | egyptian-line/bottom | neither | **-4.60** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | whole-crossing/gcd-c | neither | **-4.59** | -4.6 |  |  |  |  | 105 |
| pell-gradient{"D":5,"k":0}/share-den | prime-slope/twins | neither | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| pell-gradient{"D":5,"k":0}/difference | prime-slope/twins | neither | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | prime-gradient{"ends":1}/c-gpf | one | **-4.58** | -4.6 |  |  |  |  | 148 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3}/last-prime | both | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3}/first-prime | both | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/whole | prime-gradient{"ends":1}/c-gpf | one | **-4.58** | -4.6 |  |  |  |  | 147 |
| crossing-check{"k":2,"q":4}/whole | whole-crossing/gcd-c | neither | **-4.58** | -4.6 |  |  |  |  | 105 |
| crossing-check{"k":2,"q":6}/size | sunken-intercept/shared | neither | **-4.58** | -4.6 |  |  |  |  | 266 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3}/last-prime | both | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3}/first-prime | both | **-4.58** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/size | whole-crossing/gcd-c | neither | **-4.57** | -4.6 |  |  |  |  | 105 |
| divisibility-ladder/m-gpf | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.57** | ≤-4.6 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.57** | ≤-4.6 |  |  |  |  | 0 |
| long-division/m-top | whole-intercept/mc-spf | neither | **-4.56** | ≤-4.6 |  |  |  |  | 0 |
| long-division/m-bottom-spf | whole-intercept/mc-spf | neither | **-4.56** | ≤-4.6 |  |  |  |  | 0 |
| long-division/c-period | whole-intercept/mc-spf | neither | **-4.56** | ≤-4.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":6}/whole | sunken-intercept/shared | neither | **-4.56** | -4.6 |  |  |  |  | 266 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-4.56** | -4.6 |  |  |  |  | 201 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-4.56** | -4.6 |  |  |  |  | 201 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.55** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7}/big-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.55** | ≤-4.6 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.55** | ≤-4.5 |  |  |  |  | 0 |
| prime-landing{"ends":7,"side":-1}/big-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.55** | ≤-4.5 |  |  |  |  | 0 |
| prime-slope/matching-c | prime-staircase{"ends":3}/last-prime | one | **-4.53** | ≤-4.5 |  |  |  |  | 0 |
| prime-slope/matching-c | prime-staircase{"ends":3}/first-prime | one | **-4.53** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/m-gpf | prime-slope/twins | one | **-4.52** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-staircase{"ends":3}/last-prime | both | **-4.51** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-staircase{"ends":3}/first-prime | both | **-4.51** | ≤-4.5 |  |  |  |  | 0 |
| prime-slope/matching-c | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-4.51** | ≤-4.5 |  |  |  |  | 0 |
| prime-slope/matching-c | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-4.51** | ≤-4.5 |  |  |  |  | 0 |
| whole-at-t/gcd-c | whole-intercept/mc-spf | neither | **-4.50** | ≤-4.5 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | whole-at-t/gcd-c | neither | **-4.50** | -4.5 |  |  |  |  | 118 |
| crossing-check{"k":3,"q":2}/whole | sunken-intercept/shared | neither | **-4.50** | -4.5 |  |  |  |  | 112 |
| divisibility-ladder/m-prime | prime-staircase{"ends":3,"side":-1}/last-prime | both | **-4.48** | ≤-4.5 |  |  |  |  | 0 |
| divisibility-ladder/m-prime | prime-staircase{"ends":3,"side":-1}/first-prime | both | **-4.48** | ≤-4.5 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/near-miss | whole-at-t/gcd-c | one | **-4.47** | -4.5 |  |  |  |  | 95 |
| prime-staircase{"ends":3,"side":-1}/near-miss | whole-at-t/gcd-c | one | **-4.47** | -4.5 |  |  |  |  | 95 |
| prime-slope/matching-c | whole-at-t/gcd-c | neither | **-4.47** | -4.5 |  |  |  |  | 177 |
| crossing-check{"k":3,"q":4}/whole | whole-intercept/omega | neither | **-4.47** | ≤-4.5 |  |  |  |  | 17 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.46** | -4.5 |  |  |  |  | 199 |
| m-meets-c/meetPrime | triangle-area{"A":12}/even | neither | **-4.45** | -4.5 |  |  |  |  | 202 |
| exact-change/big-piles | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-4.45** | ≤-4.5 |  |  |  |  | 0 |
| exact-change/big-piles | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-4.45** | ≤-4.5 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.45** | -4.4 |  |  |  |  | 198 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.44** | -4.4 |  |  |  |  | 84 |
| divisibility-ladder/m-prime | prime-slope/twins | one | **-4.44** | ≤-4.4 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.43** | -4.4 |  |  |  |  | 85 |
| pell-gradient{"D":6,"k":0}/share-den | smooth-gradient/shared | neither | **-4.43** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | smooth-gradient/shared | neither | **-4.43** | ≤-4.4 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-11,"k":2}/square-start | one | **-4.42** | -4.4 |  |  |  |  | 215 |
| crossing-check{"k":1,"q":4}/whole | whole-crossing/gcd-c | neither | **-4.42** | -4.4 |  |  |  |  | 105 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-11,"k":2}/m-spf | one | **-4.41** | -4.4 |  |  |  |  | 215 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-11,"k":2}/m-gpf | one | **-4.41** | -4.4 |  |  |  |  | 215 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-11,"k":2}/square-start | one | **-4.41** | -4.4 |  |  |  |  | 215 |
| sunken-intercept/shared | treasure{"T":11,"k":2}/square-start | one | **-4.41** | -4.4 |  |  |  |  | 277 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-4.40** | -4.4 |  |  |  |  | 215 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-4.40** | -4.4 |  |  |  |  | 215 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1}/c-gpf | one | **-4.40** | -4.4 |  |  |  |  | 106 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1}/prime | one | **-4.40** | -4.4 |  |  |  |  | 208 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1}/cPrime | one | **-4.40** | -4.4 |  |  |  |  | 207 |
| sunken-intercept/shared | treasure{"T":13,"k":2}/square-start | one | **-4.39** | -4.4 |  |  |  |  | 291 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-11,"k":2}/prime-gradient | one | **-4.39** | -4.4 |  |  |  |  | 215 |
| sunken-intercept/shared | treasure{"T":11,"k":2}/prime-terms | one | **-4.39** | -4.4 |  |  |  |  | 279 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.39** | -4.4 |  |  |  |  | 109 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-4.38** | -4.4 |  |  |  |  | 215 |
| sunken-intercept/shared | treasure{"T":11,"k":2}/prime-gradient | one | **-4.37** | -4.4 |  |  |  |  | 277 |
| pell-gradient{"D":3,"k":0}/share-den | whole-crossing/m-spf | one | **-4.37** | ≤-4.4 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-crossing/m-spf | one | **-4.37** | ≤-4.4 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-crossing/m-spf | one | **-4.37** | ≤-4.4 |  |  |  |  | 0 |
| sunken-intercept/shared | treasure{"T":11,"k":2}/m-spf | one | **-4.37** | -4.4 |  |  |  |  | 284 |
| sunken-intercept/shared | treasure{"T":11,"k":2}/m-gpf | one | **-4.37** | -4.4 |  |  |  |  | 284 |
| sunken-intercept/shared | treasure{"T":13,"k":2}/prime-gradient | one | **-4.36** | -4.4 |  |  |  |  | 295 |
| pell-gradient{"D":6,"k":0}/share-den | square-area/omega | one | **-4.36** | -4.4 |  |  |  |  | 174 |
| pell-gradient{"D":6,"k":0}/difference | square-area/omega | one | **-4.36** | -4.4 |  |  |  |  | 174 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.36** | -4.4 |  |  |  |  | 84 |
| pell-gradient{"D":6,"k":0}/share-den | square-area/lpf | one | **-4.36** | -4.4 |  |  |  |  | 174 |
| pell-gradient{"D":6,"k":0}/difference | square-area/lpf | one | **-4.36** | -4.4 |  |  |  |  | 174 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-4.35** | -4.4 |  |  |  |  | 220 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.35** | -4.3 |  |  |  |  | 234 |
| sunken-intercept/shared | treasure{"T":13,"k":2}/prime-terms | one | **-4.35** | -4.3 |  |  |  |  | 298 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-4.35** | -4.3 |  |  |  |  | 206 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-4.35** | -4.3 |  |  |  |  | 207 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":-11,"k":2}/prime-terms | one | **-4.34** | -4.3 |  |  |  |  | 225 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-4.34** | -4.3 |  |  |  |  | 234 |
| m-meets-c/meetPrime | triangle-area{"A":12}/legs | neither | **-4.34** | -4.3 |  |  |  |  | 202 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.34** | -4.3 |  |  |  |  | 238 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.34** | -4.3 |  |  |  |  | 222 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":13,"k":2}/m-spf | one | **-4.33** | -4.3 |  |  |  |  | 206 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-4.33** | -4.3 |  |  |  |  | 225 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.32** | -4.3 |  |  |  |  | 238 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.32** | -4.3 |  |  |  |  | 220 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":13,"k":2}/m-gpf | one | **-4.32** | -4.3 |  |  |  |  | 206 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":13,"k":2}/prime-terms | one | **-4.32** | -4.3 |  |  |  |  | 206 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":13,"k":2}/prime-terms | both | **-4.31** | -4.3 |  |  |  |  | 251 |
| whole-area/gcd-den-m | whole-crossing/m-spf | one | **-4.31** | ≤-4.3 |  |  |  |  | 0 |
| prime-slope/twins | whole-at-t/gcd-c | neither | **-4.31** | ≤-4.3 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1}/c-spf | one | **-4.31** | -4.3 |  |  |  |  | 208 |
| egyptian-line/bottom | whole-crossing/k-spf | one | **-4.31** | -4.3 |  |  |  |  | 51 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":13,"k":2}/m-spf | one | **-4.30** | -4.3 |  |  |  |  | 206 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":13,"k":2}/prime-gradient | both | **-4.30** | -4.3 |  |  |  |  | 250 |
| crossing-check{"k":2,"q":6}/size | whole-at-t/gcd-c | neither | **-4.29** | -4.3 |  |  |  |  | 156 |
| crossing-check{"k":3,"q":2}/size | smooth-gradient/shared | neither | **-4.28** | -4.3 |  |  |  |  | 72 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":13,"k":2}/prime-terms | both | **-4.28** | -4.3 |  |  |  |  | 260 |
| long-division/m-top | whole-intercept/gcd-floor-m | neither | **-4.28** | -4.3 |  |  |  |  | 761 |
| long-division/c-period | whole-intercept/gcd-floor-m | neither | **-4.28** | -4.3 |  |  |  |  | 761 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1}/prime | one | **-4.27** | -4.3 |  |  |  |  | 90 |
| crossing-check{"k":2,"q":6}/whole | whole-at-t/gcd-c | neither | **-4.27** | -4.3 |  |  |  |  | 156 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1}/cPrime | one | **-4.27** | -4.3 |  |  |  |  | 89 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":13,"k":2}/prime-gradient | both | **-4.27** | -4.3 |  |  |  |  | 259 |
| prime-gradient{"ends":1,"side":-1}/prime | whole-crossing/k-gpf | both | **-4.27** | -3.4 | -5.1 |  |  |  | 543 |
| crossing-check{"k":2,"q":2}/whole | whole-area/gcd-den-m | neither | **-4.26** | -4.3 |  |  |  |  | 101 |
| euclid-steps/largest-quotient | whole-crossing/m-spf | one | **-4.25** | ≤-4.3 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":2}/size | whole-area/gcd-den-m | neither | **-4.25** | -4.3 |  |  |  |  | 102 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-11,"k":2}/prime-terms | both | **-4.25** | -4.2 |  |  |  |  | 257 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-11,"k":2}/square-start | both | **-4.24** | -4.2 |  |  |  |  | 261 |
| crossing-check{"k":3,"q":4}/whole | smooth-gradient/shared | neither | **-4.22** | ≤-4.2 |  |  |  |  | 18 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-11,"k":2}/prime-gradient | both | **-4.22** | -4.2 |  |  |  |  | 257 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1}/prime | one | **-4.22** | -4.2 |  |  |  |  | 238 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1}/cPrime | one | **-4.22** | -4.2 |  |  |  |  | 237 |
| crossing-check{"k":3,"q":2}/whole | whole-intercept/mc-spf | neither | **-4.22** | -4.2 |  |  |  |  | 35 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-11,"k":2}/m-spf | both | **-4.22** | -4.2 |  |  |  |  | 264 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-11,"k":2}/m-gpf | both | **-4.22** | -4.2 |  |  |  |  | 264 |
| crossing-check{"k":3,"q":6}/size | prime-gradient{"ends":1}/c-gpf | one | **-4.22** | -4.2 |  |  |  |  | 225 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":13,"k":2}/square-start | both | **-4.22** | -4.2 |  |  |  |  | 266 |
| sunken-intercept/shared | treasure{"T":13,"k":2}/m-spf | one | **-4.21** | -4.2 |  |  |  |  | 318 |
| pythagorean-area/prime-height | whole-intercept/omega | one | **-4.21** | -2.8 | -5.6 |  |  |  | 839 |
| crossing-check{"k":1,"q":4}/whole | near-point/lattice | neither | **-4.20** | -4.2 |  |  |  |  | 210 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.19** | -4.2 |  |  |  |  | 253 |
| prime-gradient{"ends":1}/prime | treasure{"T":-11,"k":2}/prime-terms | both | **-4.19** | -4.2 |  |  |  |  | 270 |
| crossing-check{"k":3,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.19** | -4.2 |  |  |  |  | 128 |
| prime-gradient{"ends":1}/prime | treasure{"T":-11,"k":2}/square-start | both | **-4.19** | -4.2 |  |  |  |  | 274 |
| triangle-area{"A":6}/even | whole-intercept/omega | neither | **-4.19** | -2.8 | -5.6 |  |  |  | 851 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":13,"k":2}/m-spf | both | **-4.19** | -4.2 |  |  |  |  | 266 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1}/c-spf | one | **-4.19** | -4.2 |  |  |  |  | 89 |
| triangle-area{"A":6}/legs | whole-intercept/omega | neither | **-4.19** | -2.8 | -5.6 |  |  |  | 842 |
| prime-staircase{"ends":3}/last-prime | smooth-intercept/shared | one | **-4.18** | ≤-4.2 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/first-prime | smooth-intercept/shared | one | **-4.18** | ≤-4.2 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.18** | -4.2 |  |  |  |  | 253 |
| prime-staircase{"ends":3}/last-prime | smooth-crossing/shared | one | **-4.18** | ≤-4.2 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/first-prime | smooth-crossing/shared | one | **-4.18** | ≤-4.2 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-4.17** | -4.2 |  |  |  |  | 270 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":13,"k":2}/square-start | both | **-4.17** | -4.2 |  |  |  |  | 278 |
| steady-gradient/divisors | whole-crossing/gcd-num-m | neither | **-4.17** | -2.6 | -4.3 | -5.6 |  |  | 920 |
| pythagorean-area/whole-legs | whole-intercept/omega | one | **-4.17** | -2.7 | -5.6 |  |  |  | 882 |
| pell-gradient{"D":3,"k":0}/share-den | whole-intercept/mc-spf | neither | **-4.17** | ≤-4.2 |  |  |  |  | 0 |
| pell-gradient{"D":3,"k":0}/difference | whole-intercept/mc-spf | neither | **-4.17** | ≤-4.2 |  |  |  |  | 0 |
| egyptian-line/bottom | whole-intercept/mc-spf | neither | **-4.17** | ≤-4.2 |  |  |  |  | 0 |
| pythagorean-area/slanted-square | whole-intercept/omega | one | **-4.17** | -2.7 | -5.6 |  |  |  | 882 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-13,"k":2}/prime-terms | both | **-4.17** | -4.2 |  |  |  |  | 274 |
| prime-gradient{"ends":1}/prime | treasure{"T":-11,"k":2}/m-spf | both | **-4.16** | -4.2 |  |  |  |  | 278 |
| prime-gradient{"ends":1}/prime | treasure{"T":-11,"k":2}/m-gpf | both | **-4.16** | -4.2 |  |  |  |  | 278 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":11,"k":2}/square-start | both | **-4.16** | -4.2 |  |  |  |  | 263 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":11,"k":2}/prime-terms | both | **-4.16** | -4.2 |  |  |  |  | 261 |
| prime-gradient{"ends":1}/prime | treasure{"T":-13,"k":2}/prime-terms | both | **-4.16** | -4.2 |  |  |  |  | 279 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-13,"k":2}/prime-gradient | both | **-4.16** | -4.2 |  |  |  |  | 272 |
| prime-staircase{"ends":3,"side":-1}/last-prime | smooth-intercept/shared | one | **-4.16** | ≤-4.2 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | smooth-intercept/shared | one | **-4.16** | ≤-4.2 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/last-prime | smooth-crossing/shared | one | **-4.15** | ≤-4.1 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | smooth-crossing/shared | one | **-4.15** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.15** | -4.1 |  |  |  |  | 251 |
| prime-gradient{"ends":1}/prime | prime-slope/square-sum | one | **-4.15** | ≤-4.1 |  |  |  |  | 27 |
| prime-gradient{"ends":1}/prime | treasure{"T":-13,"k":2}/prime-gradient | both | **-4.14** | -4.1 |  |  |  |  | 278 |
| near-point/lattice | prime-gradient{"ends":1}/prime | one | **-4.14** | -4.1 |  |  |  |  | 232 |
| prime-gradient{"ends":1}/cPrime | prime-slope/square-sum | one | **-4.14** | ≤-4.1 |  |  |  |  | 27 |
| near-point/lattice | prime-gradient{"ends":1}/cPrime | one | **-4.14** | -4.1 |  |  |  |  | 231 |
| prime-gradient{"ends":1,"side":-1}/prime | prime-slope/square-sum | one | **-4.14** | ≤-4.1 |  |  |  |  | 26 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-4.14** | -4.1 |  |  |  |  | 251 |
| pell-gradient{"D":1,"k":1}/pell-c | prime-slope/square-sum | neither | **-4.14** | ≤-4.1 |  |  |  |  | 1 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":11,"k":2}/prime-gradient | both | **-4.14** | -4.1 |  |  |  |  | 261 |
| prime-gradient{"ends":1,"side":-1}/cPrime | prime-slope/square-sum | one | **-4.13** | ≤-4.1 |  |  |  |  | 26 |
| m-meets-c/meetPrime | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.13** | -4.1 |  |  |  |  | 198 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1}/c-spf | one | **-4.13** | -4.1 |  |  |  |  | 238 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":13,"k":2}/m-spf | both | **-4.13** | -4.1 |  |  |  |  | 280 |
| divisibility-ladder/steep | prime-slope/square-sum | one | **-4.13** | ≤-4.1 |  |  |  |  | 0 |
| near-point/gcd-x | prime-gradient{"ends":1}/prime | one | **-4.13** | -4.1 |  |  |  |  | 231 |
| long-division/m-top | whole-at-t/gcd-c | neither | **-4.13** | -4.1 |  |  |  |  | 237 |
| long-division/m-bottom-spf | whole-at-t/gcd-c | neither | **-4.13** | -4.1 |  |  |  |  | 237 |
| long-division/c-period | whole-at-t/gcd-c | neither | **-4.13** | -4.1 |  |  |  |  | 237 |
| prime-slope/square-sum | steady-gradient/divisors | neither | **-4.13** | ≤-4.1 |  |  |  |  | 0 |
| near-point/gcd-x | prime-gradient{"ends":1}/cPrime | one | **-4.13** | -4.1 |  |  |  |  | 230 |
| prime-slope/square-sum | steady-gradient/gcd-c | neither | **-4.13** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/size | sunken-intercept/shared | neither | **-4.12** | -4.1 |  |  |  |  | 278 |
| euclid-steps/largest-quotient | whole-intercept/gcd-floor-m | neither | **-4.12** | -3.2 | -5.0 |  |  |  | 835 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":11,"k":2}/m-spf | both | **-4.12** | -4.1 |  |  |  |  | 269 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":11,"k":2}/m-gpf | both | **-4.12** | -4.1 |  |  |  |  | 269 |
| pell-gradient{"D":1,"k":1}/difference | prime-slope/square-sum | neither | **-4.12** | ≤-4.1 |  |  |  |  | 1 |
| pell-gradient{"D":1,"k":1}/share-den | prime-slope/square-sum | neither | **-4.12** | ≤-4.1 |  |  |  |  | 1 |
| pell-gradient{"D":7,"k":0}/difference | prime-slope/square-sum | neither | **-4.12** | ≤-4.1 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/share-den | smooth-square/shared | neither | **-4.12** | -4.1 |  |  |  |  | 197 |
| pell-gradient{"D":6,"k":0}/difference | smooth-square/shared | neither | **-4.12** | -4.1 |  |  |  |  | 197 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-13,"k":2}/square-start | both | **-4.11** | -4.1 |  |  |  |  | 283 |
| prime-slope/square-sum | square-area/spf | one | **-4.11** | ≤-4.1 |  |  |  |  | 30 |
| prime-gradient{"ends":1}/c-gpf | prime-slope/square-sum | one | **-4.11** | ≤-4.1 |  |  |  |  | 27 |
| whole-area/gcd-den-m | whole-intercept/mc-spf | neither | **-4.11** | ≤-4.1 |  |  |  |  | 0 |
| m-meets-c/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-4.11** | -4.1 |  |  |  |  | 200 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | prime-slope/square-sum | one | **-4.11** | ≤-4.1 |  |  |  |  | 26 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":11,"k":2}/square-start | both | **-4.10** | -4.1 |  |  |  |  | 278 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":11,"k":2}/prime-terms | both | **-4.10** | -4.1 |  |  |  |  | 276 |
| divisibility-ladder/m-spf | prime-slope/square-sum | one | **-4.09** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-4.08** | -4.1 |  |  |  |  | 102 |
| prime-gradient{"ends":1}/prime | treasure{"T":-13,"k":2}/square-start | both | **-4.08** | -4.1 |  |  |  |  | 293 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":11,"k":2}/prime-gradient | both | **-4.08** | -4.1 |  |  |  |  | 276 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-13,"k":2}/m-spf | both | **-4.07** | -4.1 |  |  |  |  | 288 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-11,"k":2}/square-start | one | **-4.06** | -4.1 |  |  |  |  | 257 |
| pell-gradient{"D":3,"k":0}/pell-c | prime-slope/square-sum | neither | **-4.06** | ≤-4.1 |  |  |  |  | 7 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":11,"k":2}/m-spf | both | **-4.06** | -4.1 |  |  |  |  | 285 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":11,"k":2}/m-gpf | both | **-4.06** | -4.1 |  |  |  |  | 285 |
| prime-gradient{"ends":1}/c-spf | prime-slope/square-sum | one | **-4.06** | ≤-4.1 |  |  |  |  | 27 |
| egyptian-line/bottom | prime-staircase{"ends":3}/last-prime | one | **-4.06** | ≤-4.1 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3}/first-prime | one | **-4.06** | ≤-4.1 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | prime-gradient{"ends":1}/c-gpf | one | **-4.06** | -4.1 |  |  |  |  | 255 |
| prime-gradient{"ends":1,"side":-1}/c-spf | prime-slope/square-sum | one | **-4.05** | ≤-4.1 |  |  |  |  | 26 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-11,"k":2}/m-spf | one | **-4.05** | -4.1 |  |  |  |  | 257 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-11,"k":2}/m-gpf | one | **-4.05** | -4.1 |  |  |  |  | 257 |
| euclid-steps/largest-quotient | whole-intercept/mc-spf | neither | **-4.05** | ≤-4.1 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-area/gcd-den-m | one | **-4.05** | -3.5 | -4.6 |  |  |  | 489 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":11,"k":2}/m-spf | one | **-4.05** | -4.0 |  |  |  |  | 253 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-4.05** | -4.0 |  |  |  |  | 253 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-11,"k":2}/prime-terms | one | **-4.05** | -4.0 |  |  |  |  | 259 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":-11,"k":2}/prime-gradient | one | **-4.03** | -4.0 |  |  |  |  | 257 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-4.03** | -4.0 |  |  |  |  | 253 |
| egyptian-line/bottom | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-4.03** | ≤-4.0 |  |  |  |  | 0 |
| egyptian-line/bottom | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-4.03** | ≤-4.0 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/c-gpf | whole-area/gcd-den-m | one | **-4.02** | -3.6 | -4.5 |  |  |  | 488 |
| crossing-check{"k":3,"q":4}/whole | sunken-intercept/shared | neither | **-4.02** | -4.0 |  |  |  |  | 113 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-area/gcd-den-m | one | **-4.02** | -3.5 | -4.6 |  |  |  | 489 |
| crossing-check{"k":2,"q":4}/size | smooth-intercept/shared | neither | **-4.02** | -4.0 |  |  |  |  | 105 |
| prime-gradient{"ends":1,"side":-1}/cPrime | whole-area/gcd-den-m | one | **-4.02** | -3.5 | -4.5 |  |  |  | 489 |
| pell-gradient{"D":2,"k":0}/share-den | prime-slope/square-sum | neither | **-4.02** | ≤-4.0 |  |  |  |  | 6 |
| pell-gradient{"D":2,"k":0}/difference | prime-slope/square-sum | neither | **-4.02** | ≤-4.0 |  |  |  |  | 6 |
| pell-gradient{"D":2,"k":0}/pell-c | prime-slope/square-sum | neither | **-4.02** | ≤-4.0 |  |  |  |  | 6 |
| prime-gradient{"ends":1}/prime | treasure{"T":-13,"k":2}/m-spf | both | **-4.02** | -4.0 |  |  |  |  | 303 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":13,"k":2}/m-gpf | both | **-4.02** | -4.0 |  |  |  |  | 297 |
| crossing-check{"k":2,"q":4}/size | smooth-crossing/shared | neither | **-4.02** | -4.0 |  |  |  |  | 105 |
| long-division/m-bottom-spf | whole-intercept/omega | neither | **-4.01** | -2.8 | -5.2 |  |  |  | 1253 |
| crossing-check{"k":2,"q":4}/whole | smooth-intercept/shared | neither | **-4.01** | -4.0 |  |  |  |  | 105 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-11,"k":2}/prime-terms | both | **-4.01** | -4.0 |  |  |  |  | 280 |
| prime-staircase{"ends":3}/last-prime | whole-at-t/gcd-c | one | **-4.01** | -4.0 |  |  |  |  | 42 |
| prime-staircase{"ends":3}/first-prime | whole-at-t/gcd-c | one | **-4.01** | -4.0 |  |  |  |  | 42 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-11,"k":2}/square-start | both | **-4.01** | -4.0 |  |  |  |  | 283 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":13,"k":2}/prime-terms | both | **-4.00** | -4.0 |  |  |  |  | 283 |
| crossing-check{"k":2,"q":4}/whole | smooth-crossing/shared | neither | **-4.00** | -4.0 |  |  |  |  | 105 |
| crossing-check{"k":1,"q":4}/size | smooth-intercept/shared | neither | **-4.00** | -4.0 |  |  |  |  | 105 |
| prime-gradient{"ends":1}/prime | whole-crossing/k-gpf | both | **-4.00** | -3.3 | -4.7 |  |  |  | 614 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-4.00** | -4.0 |  |  |  |  | 261 |
| crossing-check{"k":1,"q":4}/size | smooth-crossing/shared | neither | **-4.00** | -4.0 |  |  |  |  | 105 |
| prime-gradient{"ends":1}/c-spf | whole-area/gcd-den-m | one | **-4.00** | -3.5 | -4.5 |  |  |  | 488 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":13,"k":2}/prime-gradient | both | **-3.99** | -4.0 |  |  |  |  | 282 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-11,"k":2}/prime-gradient | both | **-3.99** | -4.0 |  |  |  |  | 280 |
| long-division/m-bottom-spf | whole-crossing/gcd-c | neither | **-3.99** | -2.7 | -5.3 |  |  |  | 1082 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-11,"k":2}/m-spf | both | **-3.98** | -4.0 |  |  |  |  | 286 |
| m-meets-c/meetPrime | prime-gradient{"ends":1}/prime | one | **-3.98** | -4.0 |  |  |  |  | 217 |
| egyptian-line/bottom | prime-slope/twins | neither | **-3.98** | ≤-4.0 |  |  |  |  | 0 |
| prime-gradient{"ends":1}/cPrime | whole-area/gcd-den-m | one | **-3.98** | -3.6 | -4.3 |  |  |  | 488 |
| divisibility-ladder/m-gpf | prime-slope/square-sum | one | **-3.98** | ≤-4.0 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | treasure{"T":11,"k":2}/square-start | one | **-3.97** | -4.0 |  |  |  |  | 268 |
| prime-gradient{"ends":1,"side":-1}/prime | whole-area/gcd-den-m | one | **-3.97** | -3.5 | -4.4 |  |  |  | 489 |
| pell-gradient{"D":6,"k":0}/share-den | whole-crossing/m-spf | one | **-3.97** | ≤-4.0 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | whole-crossing/m-spf | one | **-3.97** | ≤-4.0 |  |  |  |  | 0 |
| m-meets-c/size | prime-gradient{"ends":1}/prime | one | **-3.97** | -4.0 |  |  |  |  | 218 |
| sunken-intercept/shared | treasure{"T":13,"k":2}/m-gpf | one | **-3.97** | -4.0 |  |  |  |  | 372 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":13,"k":2}/m-gpf | both | **-3.97** | -4.0 |  |  |  |  | 312 |
| near-point/gcd-x | same-on-both-rulers{"T":-6}/m-gpf | one | **-3.96** | -4.0 |  |  |  |  | 249 |
| crossing-check{"k":3,"q":6}/whole | sunken-intercept/shared | neither | **-3.96** | -4.0 |  |  |  |  | 313 |
| crossing-check{"k":3,"q":6}/size | whole-at-t/gcd-c | neither | **-3.96** | -4.0 |  |  |  |  | 164 |
| near-point/gcd-x | same-on-both-rulers{"T":-6}/prime-start | one | **-3.95** | -3.9 |  |  |  |  | 249 |
| prime-gradient{"ends":1}/prime | whole-area/gcd-den-m | one | **-3.94** | -3.6 | -4.3 |  |  |  | 488 |
| near-point/gcd-x | same-on-both-rulers{"T":-6}/m-spf | one | **-3.94** | -3.9 |  |  |  |  | 249 |
| near-point/gcd-x | same-on-both-rulers{"T":-6}/steep | one | **-3.94** | -3.9 |  |  |  |  | 249 |
| near-point/gcd-x | same-on-both-rulers{"T":-6}/whole-values | one | **-3.94** | -3.9 |  |  |  |  | 249 |
| near-point/lattice | prime-gradient{"ends":1}/c-spf | one | **-3.94** | -3.9 |  |  |  |  | 251 |
| near-point/gcd-x | same-on-both-rulers{"T":-6}/whole-lamp | one | **-3.93** | -3.9 |  |  |  |  | 249 |
| crossing-check{"k":3,"q":4}/whole | prime-gradient{"ends":1}/c-gpf | one | **-3.93** | -3.9 |  |  |  |  | 107 |
| prime-staircase{"ends":3}/last-prime | whole-intercept/omega | one | **-3.93** | ≤-3.9 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/first-prime | whole-intercept/omega | one | **-3.93** | ≤-3.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-11,"k":2}/square-start | one | **-3.92** | -3.9 |  |  |  |  | 283 |
| near-point/gcd-x | prime-gradient{"ends":1}/c-spf | one | **-3.92** | -3.9 |  |  |  |  | 250 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":13,"k":2}/square-start | both | **-3.92** | -3.9 |  |  |  |  | 298 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":-13,"k":2}/m-gpf | both | **-3.92** | -3.9 |  |  |  |  | 321 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":13,"k":2}/prime-gradient | both | **-3.92** | -3.9 |  |  |  |  | 307 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-13,"k":2}/prime-terms | both | **-3.92** | -3.9 |  |  |  |  | 300 |
| euclid-steps/largest-quotient | whole-crossing/gcd-c | neither | **-3.91** | -3.1 | -4.8 |  |  |  | 727 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-11,"k":2}/prime-terms | both | **-3.91** | -3.9 |  |  |  |  | 306 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-3.91** | -3.9 |  |  |  |  | 283 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-3.91** | -3.9 |  |  |  |  | 283 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-11,"k":2}/square-start | both | **-3.91** | -3.9 |  |  |  |  | 310 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1}/cPrime | one | **-3.91** | -3.9 |  |  |  |  | 284 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1}/prime | one | **-3.91** | -3.9 |  |  |  |  | 286 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-13,"k":2}/prime-gradient | both | **-3.90** | -3.9 |  |  |  |  | 299 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-at-t/gcd-c | one | **-3.90** | -3.9 |  |  |  |  | 43 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-at-t/gcd-c | one | **-3.90** | -3.9 |  |  |  |  | 43 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-intercept/omega | one | **-3.90** | ≤-3.9 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-intercept/omega | one | **-3.90** | ≤-3.9 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1}/cPrime | one | **-3.89** | -3.9 |  |  |  |  | 284 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1}/prime | one | **-3.89** | -3.9 |  |  |  |  | 286 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-11,"k":2}/prime-gradient | both | **-3.89** | -3.9 |  |  |  |  | 306 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":13,"k":2}/m-spf | both | **-3.89** | -3.9 |  |  |  |  | 298 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-3.89** | -3.9 |  |  |  |  | 283 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-11,"k":2}/m-spf | both | **-3.89** | -3.9 |  |  |  |  | 312 |
| divisibility-ladder/m-prime | prime-slope/square-sum | one | **-3.89** | ≤-3.9 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/last-prime | whole-crossing/gcd-num-m | one | **-3.88** | ≤-3.9 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/first-prime | whole-crossing/gcd-num-m | one | **-3.88** | ≤-3.9 |  |  |  |  | 0 |
| triangle-area{"A":8}/even | whole-intercept/omega | neither | **-3.88** | -2.4 | -5.3 |  |  |  | 1040 |
| prime-gradient{"ends":1}/prime | treasure{"T":-13,"k":2}/m-gpf | both | **-3.88** | -3.9 |  |  |  |  | 336 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-13,"k":2}/prime-gradient | both | **-3.87** | -3.9 |  |  |  |  | 316 |
| triangle-area{"A":8}/legs | whole-intercept/omega | neither | **-3.87** | -2.4 | -5.3 |  |  |  | 1028 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-13,"k":2}/square-start | both | **-3.87** | -3.9 |  |  |  |  | 309 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":11,"k":2}/square-start | both | **-3.87** | -3.9 |  |  |  |  | 298 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":11,"k":2}/prime-terms | both | **-3.86** | -3.9 |  |  |  |  | 296 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":13,"k":2}/square-start | both | **-3.86** | -3.9 |  |  |  |  | 323 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-3.86** | -3.9 |  |  |  |  | 294 |
| near-point/lattice | same-on-both-rulers{"T":-6}/m-gpf | one | **-3.85** | -3.9 |  |  |  |  | 277 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1}/prime | one | **-3.85** | -3.9 |  |  |  |  | 306 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1}/cPrime | one | **-3.85** | -3.9 |  |  |  |  | 304 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-crossing/gcd-num-m | one | **-3.85** | ≤-3.9 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-crossing/gcd-num-m | one | **-3.85** | ≤-3.9 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":4}/whole | smooth-intercept/shared | neither | **-3.85** | -3.8 |  |  |  |  | 105 |
| crossing-check{"k":1,"q":4}/whole | smooth-crossing/shared | neither | **-3.84** | -3.8 |  |  |  |  | 105 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":11,"k":2}/prime-gradient | both | **-3.84** | -3.8 |  |  |  |  | 296 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1}/prime | one | **-3.84** | -3.8 |  |  |  |  | 305 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1}/cPrime | one | **-3.84** | -3.8 |  |  |  |  | 303 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-13,"k":2}/square-start | both | **-3.84** | -3.8 |  |  |  |  | 327 |
| near-point/lattice | same-on-both-rulers{"T":-6}/prime-start | one | **-3.84** | -3.8 |  |  |  |  | 277 |
| crossing-check{"k":3,"q":6}/whole | whole-at-t/gcd-c | neither | **-3.83** | -3.8 |  |  |  |  | 184 |
| crossing-check{"k":1,"q":6}/whole | smooth-intercept/shared | neither | **-3.83** | -3.8 |  |  |  |  | 136 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":11,"k":2}/m-spf | both | **-3.83** | -3.8 |  |  |  |  | 304 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":13,"k":2}/prime-terms | both | **-3.83** | -3.8 |  |  |  |  | 324 |
| near-point/lattice | same-on-both-rulers{"T":-6}/m-spf | one | **-3.83** | -3.8 |  |  |  |  | 277 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-13,"k":2}/m-spf | both | **-3.83** | -3.8 |  |  |  |  | 315 |
| near-point/lattice | same-on-both-rulers{"T":-6}/steep | one | **-3.82** | -3.8 |  |  |  |  | 277 |
| near-point/lattice | same-on-both-rulers{"T":-6}/whole-values | one | **-3.82** | -3.8 |  |  |  |  | 277 |
| near-point/lattice | same-on-both-rulers{"T":-6}/whole-lamp | one | **-3.82** | -3.8 |  |  |  |  | 277 |
| crossing-check{"k":1,"q":6}/whole | smooth-crossing/shared | neither | **-3.82** | -3.8 |  |  |  |  | 137 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-3.82** | -3.8 |  |  |  |  | 139 |
| sunken-intercept/shared | triangle-area{"A":4}/even | neither | **-3.81** | -1.8 | -5.8 |  |  |  | 2674 |
| m-meets-c/meetPrime | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-3.81** | -3.8 |  |  |  |  | 246 |
| prime-gradient{"ends":1,"side":-1}/prime | whole-area/gcd-x | one | **-3.80** | -2.5 | -4.5 | -4.5 |  |  | 1318 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":13,"k":2}/square-start | one | **-3.80** | -3.8 |  |  |  |  | 143 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-3.80** | -3.8 |  |  |  |  | 313 |
| sunken-intercept/shared | triangle-area{"A":4}/legs | neither | **-3.80** | -1.7 | -5.8 |  |  |  | 2764 |
| crossing-check{"k":1,"q":6}/size | smooth-intercept/shared | neither | **-3.79** | -3.8 |  |  |  |  | 136 |
| crossing-check{"k":3,"q":4}/whole | whole-intercept/mc-spf | neither | **-3.79** | -3.8 |  |  |  |  | 30 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-3.79** | -3.8 |  |  |  |  | 317 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-3.79** | -3.8 |  |  |  |  | 312 |
| crossing-check{"k":1,"q":6}/size | smooth-crossing/shared | neither | **-3.78** | -3.8 |  |  |  |  | 137 |
| m-meets-c/meetPrime | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-3.78** | -3.8 |  |  |  |  | 246 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-3.78** | -3.8 |  |  |  |  | 196 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-3.78** | -3.8 |  |  |  |  | 315 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":13,"k":2}/square-start | one | **-3.78** | -3.8 |  |  |  |  | 200 |
| pell-gradient{"D":6,"k":0}/share-den | whole-intercept/mc-spf | neither | **-3.77** | ≤-3.8 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | whole-intercept/mc-spf | neither | **-3.77** | ≤-3.8 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":11,"k":2}/square-start | both | **-3.77** | -3.8 |  |  |  |  | 329 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":11,"k":2}/prime-terms | both | **-3.76** | -3.8 |  |  |  |  | 327 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"T":-6}/m-gpf | one | **-3.75** | -3.7 |  |  |  |  | 213 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-13,"k":2}/prime-terms | both | **-3.74** | -3.7 |  |  |  |  | 342 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":11,"k":2}/prime-gradient | both | **-3.74** | -3.7 |  |  |  |  | 327 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"T":-6}/prime-start | one | **-3.74** | -3.7 |  |  |  |  | 211 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"T":-6}/steep | one | **-3.74** | -3.7 |  |  |  |  | 208 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"T":-6}/whole-values | one | **-3.74** | -3.7 |  |  |  |  | 208 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"T":-6}/whole-lamp | one | **-3.74** | -3.7 |  |  |  |  | 208 |
| crossing-check{"k":3,"q":2}/whole | same-on-both-rulers{"T":-6}/m-spf | one | **-3.73** | -3.7 |  |  |  |  | 210 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":11,"k":2}/m-spf | both | **-3.73** | -3.7 |  |  |  |  | 335 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1}/cPrime | one | **-3.73** | -3.7 |  |  |  |  | 311 |
| m-meets-c/meetPrime | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-3.73** | -3.7 |  |  |  |  | 246 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1}/cPrime | one | **-3.73** | -3.7 |  |  |  |  | 321 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1}/prime | one | **-3.72** | -3.7 |  |  |  |  | 316 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-13,"k":2}/prime-terms | one | **-3.72** | -4.2 | -3.3 |  |  |  | 275 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1}/prime | one | **-3.72** | -3.7 |  |  |  |  | 326 |
| crossing-check{"k":2,"q":2}/whole | whole-intercept/gcd-den-m | neither | **-3.71** | -3.7 |  |  |  |  | 173 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-3.71** | -4.2 | -3.2 |  |  |  | 275 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":13,"k":2}/m-spf | both | **-3.70** | -3.7 |  |  |  |  | 347 |
| near-point/lattice | prime-gradient{"ends":1}/c-gpf | one | **-3.70** | -3.7 |  |  |  |  | 296 |
| prime-staircase{"ends":3}/last-prime | smooth-gradient/shared | one | **-3.69** | ≤-3.7 |  |  |  |  | 0 |
| prime-staircase{"ends":3}/first-prime | smooth-gradient/shared | one | **-3.69** | ≤-3.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-11,"k":2}/square-start | one | **-3.68** | -3.7 |  |  |  |  | 348 |
| m-meets-c/meetPrime | prime-landing{"ends":7,"side":-1}/big-prime | one | **-3.68** | -3.7 |  |  |  |  | 226 |
| near-point/gcd-x | prime-gradient{"ends":1}/c-gpf | one | **-3.68** | -3.7 |  |  |  |  | 295 |
| crossing-check{"k":2,"q":4}/size | smooth-gradient/shared | neither | **-3.68** | -3.7 |  |  |  |  | 101 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-11,"k":2}/square-start | one | **-3.68** | -3.7 |  |  |  |  | 343 |
| crossing-check{"k":1,"q":6}/whole | whole-crossing/gcd-c | neither | **-3.67** | -3.7 |  |  |  |  | 228 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-3.67** | -3.7 |  |  |  |  | 348 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-3.67** | -3.7 |  |  |  |  | 348 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-11,"k":2}/m-spf | one | **-3.67** | -3.7 |  |  |  |  | 343 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-11,"k":2}/m-gpf | one | **-3.67** | -3.7 |  |  |  |  | 343 |
| crossing-check{"k":2,"q":4}/whole | smooth-gradient/shared | neither | **-3.67** | -3.7 |  |  |  |  | 101 |
| prime-staircase{"ends":3,"side":-1}/last-prime | smooth-gradient/shared | one | **-3.66** | ≤-3.7 |  |  |  |  | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | smooth-gradient/shared | one | **-3.66** | ≤-3.7 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-3.65** | -3.7 |  |  |  |  | 348 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-13,"k":2}/m-gpf | one | **-3.65** | -4.1 | -3.2 |  |  |  | 280 |
| crossing-check{"k":2,"q":2}/size | whole-intercept/gcd-den-m | neither | **-3.65** | -3.6 |  |  |  |  | 186 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-11,"k":2}/prime-gradient | one | **-3.65** | -3.6 |  |  |  |  | 343 |
| crossing-check{"k":1,"q":6}/size | whole-crossing/gcd-c | neither | **-3.64** | -3.6 |  |  |  |  | 228 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-3.64** | -4.1 | -3.1 |  |  |  | 281 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-3.63** | -3.6 |  |  |  |  | 330 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-3.63** | -3.6 |  |  |  |  | 342 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-3.63** | -3.6 |  |  |  |  | 358 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-3.62** | -3.6 |  |  |  |  | 329 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-11,"k":2}/prime-terms | one | **-3.62** | -3.6 |  |  |  |  | 353 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-3.62** | -3.6 |  |  |  |  | 340 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-13,"k":2}/m-spf | both | **-3.62** | -3.6 |  |  |  |  | 367 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-13,"k":2}/square-start | one | **-3.62** | -3.6 |  |  |  |  | 322 |
| divisibility-ladder/m-spf | m-meets-c/meetPrime | one | **-3.62** | -3.6 |  |  |  |  | 236 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-13,"k":2}/square-start | one | **-3.62** | -3.6 |  |  |  |  | 327 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-3.62** | -3.6 |  |  |  |  | 322 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":-6}/steep | one | **-3.61** | -3.6 |  |  |  |  | 343 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-13,"k":2}/m-gpf | one | **-3.61** | -3.6 |  |  |  |  | 327 |
| same-on-both-rulers{"T":-6}/whole-lamp | steady-gradient/divisors | one | **-3.61** | -2.6 | -4.6 |  |  |  | 1847 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":-6}/m-spf | one | **-3.61** | -3.6 |  |  |  |  | 344 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":-6}/whole-values | one | **-3.61** | -3.6 |  |  |  |  | 343 |
| prime-slope/twins | smooth-gradient/shared | neither | **-3.61** | ≤-3.6 |  |  |  |  | 0 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":-6}/m-gpf | one | **-3.61** | -3.6 |  |  |  |  | 352 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":-6}/whole-lamp | one | **-3.61** | -3.6 |  |  |  |  | 343 |
| divisibility-ladder/m-spf | m-meets-c/size | one | **-3.61** | -3.6 |  |  |  |  | 236 |
| same-on-both-rulers{"T":-6}/prime-start | steady-gradient/divisors | one | **-3.61** | -2.6 | -4.7 |  |  |  | 1891 |
| same-on-both-rulers{"T":-6}/steep | steady-gradient/divisors | one | **-3.60** | -2.6 | -4.6 |  |  |  | 1849 |
| crossing-check{"k":1,"q":2}/size | divisibility-ladder/steep | one | **-3.60** | -3.6 |  |  |  |  | 230 |
| prime-gradient{"ends":1}/prime | smooth-intercept/shared | one | **-3.60** | -2.2 | -5.0 |  |  |  | 1103 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":-6}/prime-start | one | **-3.60** | -3.6 |  |  |  |  | 351 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":-6}/m-gpf | one | **-3.60** | -3.6 |  |  |  |  | 172 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-3.60** | -3.6 |  |  |  |  | 322 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.60** | -3.6 |  |  |  |  | 322 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":11,"k":2}/m-gpf | one | **-3.60** | -4.1 | -3.1 |  |  |  | 254 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-13,"k":2}/m-spf | one | **-3.59** | -3.6 |  |  |  |  | 327 |
| same-on-both-rulers{"T":-6}/whole-values | steady-gradient/divisors | one | **-3.59** | -2.6 | -4.6 |  |  |  | 1849 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.59** | -3.6 |  |  |  |  | 327 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":-6}/prime-start | one | **-3.59** | -3.6 |  |  |  |  | 170 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":-6}/steep | one | **-3.59** | -3.6 |  |  |  |  | 168 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":-6}/whole-values | one | **-3.59** | -3.6 |  |  |  |  | 168 |
| farey-neighbours/mediant-x | smooth-gradient/shared | neither | **-3.59** | -3.6 |  |  |  |  | 146 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":-6}/whole-lamp | one | **-3.59** | -3.6 |  |  |  |  | 168 |
| crossing-check{"k":3,"q":4}/whole | same-on-both-rulers{"T":-6}/m-spf | one | **-3.59** | -3.6 |  |  |  |  | 169 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":11,"k":2}/m-spf | one | **-3.59** | -4.1 | -3.1 |  |  |  | 254 |
| prime-staircase{"ends":3}/near-miss | whole-crossing/gcd-c | one | **-3.58** | -3.6 |  |  |  |  | 247 |
| prime-staircase{"ends":3,"side":-1}/near-miss | whole-crossing/gcd-c | one | **-3.58** | -3.6 |  |  |  |  | 247 |
| pell-gradient{"D":6,"k":0}/share-den | prime-slope/twins | neither | **-3.58** | ≤-3.6 |  |  |  |  | 0 |
| pell-gradient{"D":6,"k":0}/difference | prime-slope/twins | neither | **-3.58** | ≤-3.6 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":11,"k":2}/prime-terms | one | **-3.57** | -4.0 | -3.1 |  |  |  | 262 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-13,"k":2}/m-spf | one | **-3.57** | -4.1 | -3.0 |  |  |  | 276 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":-6}/steep | one | **-3.57** | -3.6 |  |  |  |  | 362 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":-6}/m-spf | one | **-3.57** | -3.6 |  |  |  |  | 362 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":-6}/whole-values | one | **-3.57** | -3.6 |  |  |  |  | 362 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":-6}/m-gpf | one | **-3.57** | -3.6 |  |  |  |  | 371 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":-6}/whole-lamp | one | **-3.57** | -3.6 |  |  |  |  | 362 |
| prime-gradient{"ends":1}/prime | whole-area/gcd-x | one | **-3.57** | -2.4 | -4.7 |  |  |  | 1375 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-3.56** | -4.1 | -3.0 |  |  |  | 277 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":-6}/prime-start | one | **-3.56** | -3.6 |  |  |  |  | 369 |
| crossing-check{"k":3,"q":2}/whole | smooth-gradient/shared | neither | **-3.55** | -3.6 |  |  |  |  | 72 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-13,"k":2}/square-start | one | **-3.55** | -4.2 | -2.9 |  |  |  | 275 |
| prime-gradient{"ends":1}/prime | whole-crossing/gcd-c | one | **-3.54** | -2.3 | -4.7 |  |  |  | 1422 |
| m-meets-c/meetPrime | whole-at-t/gcd-den-m | neither | **-3.54** | ≤-3.5 |  |  |  |  | 18 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.54** | -4.1 | -2.9 |  |  |  | 275 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-13,"k":2}/square-start | one | **-3.53** | -4.2 | -2.9 |  |  |  | 276 |
| crossing-check{"k":1,"q":2}/whole | divisibility-ladder/steep | one | **-3.53** | -3.5 |  |  |  |  | 249 |
| m-meets-c/size | whole-at-t/gcd-den-m | neither | **-3.53** | ≤-3.5 |  |  |  |  | 18 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.52** | -4.1 | -2.9 |  |  |  | 275 |
| crossing-check{"k":2,"q":2}/whole | whole-at-t/gcd-den-m | neither | **-3.52** | ≤-3.5 |  |  |  |  | 28 |
| divisibility-ladder/steep | whole-at-t/gcd-den-m | one | **-3.52** | ≤-3.5 |  |  |  |  | 0 |
| steady-gradient/divisors | whole-at-t/gcd-den-m | neither | **-3.51** | ≤-3.5 |  |  |  |  | 0 |
| prime-gradient{"ends":1,"side":-1}/prime | smooth-intercept/shared | one | **-3.51** | -2.3 | -4.7 |  |  |  | 1082 |
| steady-gradient/gcd-c | whole-at-t/gcd-den-m | neither | **-3.51** | ≤-3.5 |  |  |  |  | 0 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":11,"k":2}/prime-gradient | one | **-3.51** | -4.0 | -3.0 |  |  |  | 254 |
| prime-gradient{"ends":1,"side":-1}/cPrime | whole-crossing/k-gpf | both | **-3.50** | -3.3 | -3.7 |  |  |  | 556 |
| prime-gradient{"ends":1}/prime | smooth-crossing/shared | one | **-3.50** | -2.3 | -4.7 |  |  |  | 1013 |
| same-on-both-rulers{"T":6}/prime-start | steady-gradient/divisors | one | **-3.49** | -2.6 | -4.4 |  |  |  | 1870 |
| same-on-both-rulers{"T":6}/whole-lamp | steady-gradient/divisors | one | **-3.49** | -2.6 | -4.3 |  |  |  | 1825 |
| same-on-both-rulers{"T":6}/steep | steady-gradient/divisors | one | **-3.48** | -2.6 | -4.3 |  |  |  | 1832 |
| crossing-check{"k":2,"q":4}/size | treasure{"T":11,"k":2}/square-start | one | **-3.48** | -4.0 | -3.0 |  |  |  | 269 |
| same-on-both-rulers{"T":6}/whole-values | steady-gradient/divisors | one | **-3.48** | -2.6 | -4.3 |  |  |  | 1832 |
| divisibility-ladder/m-spf | whole-at-t/gcd-den-m | one | **-3.47** | ≤-3.5 |  |  |  |  | 0 |
| exact-change/big-piles | treasure{"T":-13,"k":2}/square-start | one | **-3.47** | -3.5 |  |  |  |  | 324 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-3.46** | -3.5 |  |  |  |  | 348 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1}/prime | one | **-3.46** | -3.5 |  |  |  |  | 299 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-13,"k":2}/prime-terms | one | **-3.45** | -3.5 |  |  |  |  | 354 |
| m-meets-c/size | triangle-area{"A":12}/even | neither | **-3.45** | -4.4 | -2.5 |  |  |  | 204 |
| same-on-both-rulers{"T":-6}/m-spf | steady-gradient/divisors | one | **-3.45** | -2.6 | -4.3 |  |  |  | 1868 |
| euclid-steps/largest-quotient | pell-gradient{"D":5,"k":0}/pell-c | neither | **-3.44** | -4.2 | -2.7 |  |  |  | 261 |
| prime-gradient{"ends":1,"side":-1}/prime | whole-crossing/gcd-c | one | **-3.44** | -2.4 | -4.5 |  |  |  | 1358 |
| pythagorean-area/prime-height | sunken-intercept/shared | one | **-3.44** | -1.3 | -5.5 |  |  |  | 3137 |
| exact-change/big-piles | treasure{"T":-13,"k":2}/prime-terms | one | **-3.44** | -3.4 |  |  |  |  | 333 |
| pell-gradient{"D":3,"k":0}/share-den | prime-slope/square-sum | neither | **-3.43** | ≤-3.4 |  |  |  |  | 7 |
| pell-gradient{"D":3,"k":0}/difference | prime-slope/square-sum | neither | **-3.43** | ≤-3.4 |  |  |  |  | 7 |
| egyptian-line/bottom | prime-slope/square-sum | neither | **-3.43** | ≤-3.4 |  |  |  |  | 3 |
| same-on-both-rulers{"T":-6}/m-gpf | steady-gradient/divisors | one | **-3.43** | -2.5 | -4.3 |  |  |  | 1933 |
| euclid-steps/largest-quotient | pell-gradient{"D":5,"k":0}/difference | neither | **-3.42** | -4.2 | -2.7 |  |  |  | 261 |
| euclid-steps/largest-quotient | pell-gradient{"D":5,"k":0}/share-den | neither | **-3.42** | -4.2 | -2.7 |  |  |  | 261 |
| sunken-intercept/shared | triangle-area{"A":6}/even | neither | **-3.42** | -1.3 | -5.5 |  |  |  | 3184 |
| sunken-intercept/shared | triangle-area{"A":6}/legs | neither | **-3.41** | -1.3 | -5.5 |  |  |  | 3147 |
| crossing-check{"k":1,"q":4}/size | whole-at-t/gcd-c | neither | **-3.41** | -3.4 |  |  |  |  | 241 |
| crossing-check{"k":1,"q":2}/size | divisibility-ladder/m-gpf | one | **-3.41** | -3.4 |  |  |  |  | 239 |
| prime-gradient{"ends":1,"side":-1}/prime | smooth-crossing/shared | one | **-3.40** | -2.4 | -4.4 |  |  |  | 976 |
| exact-change/big-piles | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.39** | -3.4 |  |  |  |  | 337 |
| m-meets-c/size | triangle-area{"A":12}/legs | neither | **-3.39** | -4.3 | -2.5 |  |  |  | 204 |
| pythagorean-area/whole-legs | sunken-intercept/shared | one | **-3.39** | -1.3 | -5.5 |  |  |  | 3278 |
| pythagorean-area/slanted-square | sunken-intercept/shared | one | **-3.38** | -1.3 | -5.5 |  |  |  | 3290 |
| m-meets-c/meetPrime | triangle-area{"A":8}/even | neither | **-3.37** | -3.4 |  |  |  |  | 347 |
| crossing-check{"k":1,"q":2}/size | divisibility-ladder/m-prime | one | **-3.37** | -3.4 |  |  |  |  | 229 |
| exact-change/prime-coins | steady-gradient/divisors | neither | **-3.36** | -2.4 | -4.4 |  |  |  | 1663 |
| divisibility-ladder/m-gpf | whole-at-t/gcd-den-m | one | **-3.36** | ≤-3.4 |  |  |  |  | 0 |
| crossing-check{"k":3,"q":6}/whole | smooth-intercept/shared | neither | **-3.36** | -3.4 |  |  |  |  | 182 |
| crossing-check{"k":2,"q":2}/size | whole-at-t/gcd-den-m | neither | **-3.35** | -3.4 |  |  |  |  | 42 |
| smooth-gradient/shared | whole-intercept/spf | neither | **-3.35** | -3.4 |  |  |  |  | 257 |
| crossing-check{"k":3,"q":6}/whole | smooth-crossing/shared | neither | **-3.35** | -3.3 |  |  |  |  | 183 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":11,"k":2}/m-gpf | both | **-3.35** | -3.8 | -2.9 |  |  |  | 304 |
| m-meets-c/meetPrime | triangle-area{"A":8}/legs | neither | **-3.35** | -3.3 |  |  |  |  | 346 |
| crossing-check{"k":2,"q":6}/size | smooth-intercept/shared | neither | **-3.34** | -3.3 |  |  |  |  | 187 |
| crossing-check{"k":1,"q":2}/whole | divisibility-ladder/m-gpf | one | **-3.34** | -3.3 |  |  |  |  | 258 |
| crossing-check{"k":3,"q":6}/size | smooth-intercept/shared | neither | **-3.34** | -3.3 |  |  |  |  | 182 |
| prime-gradient{"ends":1,"side":-1}/c-spf | treasure{"T":13,"k":2}/m-gpf | both | **-3.34** | -3.7 | -2.9 |  |  |  | 330 |
| crossing-check{"k":2,"q":6}/size | smooth-crossing/shared | neither | **-3.34** | -3.3 |  |  |  |  | 188 |
| crossing-check{"k":2,"q":6}/whole | smooth-intercept/shared | neither | **-3.33** | -3.3 |  |  |  |  | 187 |
| same-on-both-rulers{"T":6}/m-spf | steady-gradient/divisors | one | **-3.33** | -2.6 | -4.0 |  |  |  | 1845 |
| crossing-check{"k":3,"q":6}/size | smooth-crossing/shared | neither | **-3.33** | -3.3 |  |  |  |  | 183 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":13,"k":2}/square-start | one | **-3.33** | -3.3 |  |  |  |  | 393 |
| divisibility-ladder/steep | farey-neighbours/mediant-x | one | **-3.32** | -3.3 |  |  |  |  | 264 |
| prime-gradient{"ends":1}/cPrime | whole-crossing/k-gpf | both | **-3.32** | -3.2 | -3.4 |  |  |  | 622 |
| crossing-check{"k":2,"q":6}/whole | smooth-crossing/shared | neither | **-3.32** | -3.3 |  |  |  |  | 188 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1,"side":-1}/prime | one | **-3.32** | -3.3 |  |  |  |  | 328 |
| same-on-both-rulers{"T":6}/m-gpf | steady-gradient/divisors | one | **-3.31** | -2.6 | -4.0 |  |  |  | 1909 |
| prime-gradient{"ends":1}/prime | whole-crossing/k-spf | both | **-3.31** | -3.3 |  |  |  |  | 272 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-11,"k":2}/m-gpf | both | **-3.31** | -4.0 | -2.6 |  |  |  | 286 |
| prime-gradient{"ends":1}/c-spf | treasure{"T":-13,"k":2}/m-gpf | both | **-3.31** | -3.7 | -2.9 |  |  |  | 347 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":13,"k":2}/prime-gradient | one | **-3.31** | -3.3 | -3.3 |  |  |  | 393 |
| crossing-check{"k":1,"q":2}/whole | whole-area/gcd-x | neither | **-3.31** | -3.3 |  |  |  |  | 260 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":11,"k":2}/m-gpf | both | **-3.30** | -3.7 | -2.9 |  |  |  | 335 |
| crossing-check{"k":1,"q":2}/whole | divisibility-ladder/m-prime | one | **-3.30** | -3.3 |  |  |  |  | 247 |
| exact-change/big-piles | treasure{"T":-13,"k":2}/m-spf | one | **-3.29** | -3.3 |  |  |  |  | 364 |
| prime-gradient{"ends":1,"side":-1}/prime | whole-crossing/k-spf | both | **-3.29** | -3.3 |  |  |  |  | 261 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-3.28** | -3.3 |  |  |  |  | 429 |
| crossing-check{"k":1,"q":2}/size | whole-area/gcd-x | neither | **-3.27** | -3.3 |  |  |  |  | 260 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-11,"k":2}/m-gpf | both | **-3.27** | -3.9 | -2.6 |  |  |  | 312 |
| triangle-area{"A":12}/even | whole-intercept/omega | neither | **-3.26** | -2.1 | -4.4 |  |  |  | 1189 |
| exact-change/prime-coins | treasure{"T":-13,"k":2}/square-start | one | **-3.26** | -3.3 |  |  |  |  | 397 |
| crossing-check{"k":1,"q":4}/whole | whole-at-t/gcd-c | neither | **-3.25** | -3.3 |  |  |  |  | 241 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | treasure{"T":13,"k":2}/m-gpf | both | **-3.25** | -3.6 | -2.9 |  |  |  | 379 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1}/c-spf | one | **-3.24** | -3.7 | -2.8 |  |  |  | 304 |
| pell-gradient{"D":5,"k":0}/share-den | whole-intercept/gcd-floor-m | neither | **-3.24** | -3.2 |  |  |  |  | 541 |
| pell-gradient{"D":5,"k":0}/difference | whole-intercept/gcd-floor-m | neither | **-3.24** | -3.2 |  |  |  |  | 541 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1}/c-spf | one | **-3.24** | -3.7 | -2.8 |  |  |  | 323 |
| exact-change/prime-coins | treasure{"T":-13,"k":2}/prime-terms | one | **-3.23** | -3.2 |  |  |  |  | 406 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-3.23** | -3.9 | -2.6 |  |  |  | 284 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1}/c-spf | one | **-3.23** | -3.7 | -2.7 |  |  |  | 304 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-13,"k":2}/square-start | one | **-3.22** | -3.4 | -3.0 |  |  |  | 401 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1}/c-spf | one | **-3.22** | -3.7 | -2.8 |  |  |  | 323 |
| divisibility-ladder/steep | m-meets-c/meetPrime | one | **-3.22** | -3.6 | -2.8 |  |  |  | 241 |
| prime-gradient{"ends":1}/c-gpf | treasure{"T":-13,"k":2}/m-gpf | both | **-3.22** | -3.5 | -2.9 |  |  |  | 399 |
| m-meets-c/meetPrime | prime-staircase{"ends":3,"side":-1}/step-back | one | **-3.21** | -3.2 |  |  |  |  | 250 |
| crossing-check{"k":2,"q":2}/whole | whole-crossing/gcd-num-m | neither | **-3.21** | -3.2 |  |  |  |  | 198 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-3.21** | -3.7 | -2.7 |  |  |  | 208 |
| crossing-check{"k":2,"q":2}/whole | prime-slope/square-sum | neither | **-3.21** | -3.2 |  |  |  |  | 73 |
| prime-gradient{"ends":1}/cPrime | whole-crossing/k-spf | both | **-3.20** | -3.2 |  |  |  |  | 287 |
| triangle-area{"A":12}/legs | whole-intercept/omega | neither | **-3.20** | -2.0 | -4.4 |  |  |  | 1189 |
| exact-change/prime-coins | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.20** | -3.2 |  |  |  |  | 409 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":13,"k":2}/square-start | one | **-3.20** | -3.2 |  |  |  |  | 386 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":11,"k":2}/prime-terms | one | **-3.20** | -3.9 | -2.5 |  |  |  | 272 |
| crossing-check{"k":2,"q":2}/size | prime-slope/square-sum | neither | **-3.20** | -3.2 |  |  |  |  | 74 |
| prime-gradient{"ends":1,"side":-1}/cPrime | whole-crossing/k-spf | both | **-3.19** | -3.2 |  |  |  |  | 270 |
| crossing-check{"k":2,"q":2}/size | whole-crossing/gcd-num-m | neither | **-3.18** | -3.2 |  |  |  |  | 204 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-3.18** | -3.2 |  |  |  |  | 412 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-3.17** | -3.7 | -2.7 |  |  |  | 151 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-3.17** | -3.2 | -3.2 |  |  |  | 386 |
| triangle-area{"A":4}/even | whole-intercept/omega | neither | **-3.17** | -3.2 |  |  |  |  | 728 |
| farey-neighbours/mediant-x | triangle-area{"A":12}/even | neither | **-3.17** | -3.9 | -2.4 |  |  |  | 297 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-3.16** | -3.2 |  |  |  |  | 419 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-3.16** | -3.7 | -2.7 |  |  |  | 151 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":13,"k":2}/prime-terms | one | **-3.16** | -3.2 |  |  |  |  | 425 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-3.15** | -3.6 | -2.7 |  |  |  | 219 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":11,"k":2}/square-start | one | **-3.15** | -3.9 | -2.4 |  |  |  | 282 |
| crossing-check{"k":2,"q":4}/size | prime-gradient{"ends":1}/c-gpf | one | **-3.14** | -3.5 | -2.8 |  |  |  | 348 |
| triangle-area{"A":4}/legs | whole-intercept/omega | neither | **-3.14** | -3.1 |  |  |  |  | 749 |
| crossing-check{"k":2,"q":6}/size | prime-gradient{"ends":1}/c-gpf | one | **-3.14** | -3.5 | -2.8 |  |  |  | 367 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":13,"k":2}/m-spf | one | **-3.14** | -3.1 |  |  |  |  | 425 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-3.14** | -3.9 | -2.4 |  |  |  | 282 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.14** | -3.4 | -2.9 |  |  |  | 411 |
| crossing-check{"k":2,"q":6}/whole | prime-gradient{"ends":1}/c-gpf | one | **-3.13** | -3.5 | -2.8 |  |  |  | 367 |
| crossing-check{"k":2,"q":4}/whole | prime-gradient{"ends":1}/c-gpf | one | **-3.12** | -3.5 | -2.7 |  |  |  | 348 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":11,"k":2}/square-start | one | **-3.12** | -3.9 | -2.3 |  |  |  | 270 |
| divisibility-ladder/m-gpf | m-meets-c/meetPrime | one | **-3.12** | -3.5 | -2.7 |  |  |  | 236 |
| exact-change/prime-coins | treasure{"T":-13,"k":2}/m-spf | one | **-3.12** | -3.1 |  |  |  |  | 436 |
| m-meets-c/meetPrime | whole-at-t/gcd-c | neither | **-3.12** | -3.1 |  |  |  |  | 308 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":13,"k":2}/m-gpf | one | **-3.12** | -3.1 |  |  |  |  | 436 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":13,"k":2}/m-spf | one | **-3.11** | -3.7 | -2.6 |  |  |  | 208 |
| m-meets-c/meetPrime | prime-landing{"ends":7,"side":-1}/next-prime | one | **-3.11** | -3.1 |  |  |  |  | 348 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-13,"k":2}/square-start | one | **-3.11** | -3.4 | -2.9 |  |  |  | 385 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":11,"k":2}/prime-gradient | one | **-3.11** | -3.9 | -2.3 |  |  |  | 270 |
| farey-neighbours/mediant-x | triangle-area{"A":12}/legs | neither | **-3.11** | -3.8 | -2.4 |  |  |  | 297 |
| divisibility-ladder/m-prime | farey-neighbours/mediant-x | one | **-3.10** | -3.1 |  |  |  |  | 260 |
| triangle-area{"A":18}/even | whole-intercept/omega | neither | **-3.09** | -1.6 | -4.6 |  |  |  | 1528 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-3.09** | -3.8 | -2.4 |  |  |  | 300 |
| crossing-check{"k":1,"q":6}/whole | whole-at-t/gcd-c | neither | **-3.08** | -3.1 |  |  |  |  | 329 |
| prime-gradient{"ends":1,"side":-1}/cPrime | whole-area/gcd-x | one | **-3.08** | -2.4 | -3.7 |  |  |  | 1327 |
| divisibility-ladder/m-gpf | farey-neighbours/mediant-x | one | **-3.08** | -3.1 |  |  |  |  | 288 |
| crossing-check{"k":1,"q":2}/whole | treasure{"T":11,"k":2}/m-spf | one | **-3.08** | -3.8 | -2.4 |  |  |  | 300 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":13,"k":2}/m-spf | one | **-3.08** | -3.7 | -2.5 |  |  |  | 151 |
| triangle-area{"A":18}/legs | whole-intercept/omega | neither | **-3.08** | -1.6 | -4.5 |  |  |  | 1516 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-3.08** | -3.1 |  |  |  |  | 454 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-crossing/k-gpf | both | **-3.07** | -3.2 | -2.9 |  |  |  | 568 |
| euclid-steps/largest-quotient | smooth-crossing/shared | neither | **-3.07** | -3.1 |  |  |  |  | 486 |
| prime-gradient{"ends":1,"side":-1}/cPrime | smooth-intercept/shared | one | **-3.07** | -2.3 | -3.9 |  |  |  | 1074 |
| prime-gradient{"ends":1}/cPrime | whole-area/gcd-x | one | **-3.07** | -2.4 | -3.8 |  |  |  | 1380 |
| crossing-check{"k":1,"q":6}/size | whole-at-t/gcd-c | neither | **-3.07** | -3.1 |  |  |  |  | 324 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-3.06** | -3.1 |  |  |  |  | 461 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":11,"k":2}/m-gpf | one | **-3.06** | -3.8 | -2.3 |  |  |  | 289 |
| crossing-check{"k":1,"q":2}/size | treasure{"T":11,"k":2}/m-spf | one | **-3.05** | -3.8 | -2.3 |  |  |  | 289 |
| m-meets-c/meetPrime | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-3.05** | -3.0 |  |  |  |  | 369 |
| prime-gradient{"ends":1}/cPrime | whole-crossing/gcd-c | one | **-3.03** | -2.3 | -3.8 |  |  |  | 1438 |
| exact-change/big-piles | treasure{"T":-11,"k":2}/square-start | one | **-3.03** | -3.0 |  |  |  |  | 392 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-3.02** | -3.0 |  |  |  |  | 418 |
| prime-gradient{"ends":1,"side":-1}/cPrime | smooth-crossing/shared | one | **-3.02** | -2.3 | -3.7 |  |  |  | 982 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-3.02** | -3.0 |  |  |  |  | 447 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-crossing/k-gpf | both | **-3.02** | -3.1 | -2.9 |  |  |  | 652 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-3.02** | -3.3 | -2.7 |  |  |  | 395 |
| exact-change/big-piles | treasure{"T":-11,"k":2}/m-spf | one | **-3.02** | -3.0 |  |  |  |  | 392 |
| exact-change/big-piles | treasure{"T":-11,"k":2}/m-gpf | one | **-3.02** | -3.0 |  |  |  |  | 392 |
| crossing-check{"k":1,"q":4}/size | divisibility-ladder/steep | one | **-3.02** | -3.0 |  |  |  |  | 354 |
| euclid-steps/largest-quotient | smooth-intercept/shared | neither | **-3.01** | -3.0 |  |  |  |  | 523 |
| exact-change/big-piles | treasure{"T":-11,"k":2}/prime-terms | one | **-3.01** | -3.0 |  |  |  |  | 394 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-crossing/gcd-c | one | **-3.01** | -3.0 |  |  |  |  | 118 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-crossing/gcd-c | one | **-3.01** | -3.0 |  |  |  |  | 118 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-crossing/k-spf | both | **-3.01** | -3.0 | -3.0 |  |  |  | 308 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":13,"k":2}/m-spf | one | **-3.01** | -3.0 |  |  |  |  | 418 |
| exact-change/big-piles | treasure{"T":-11,"k":2}/prime-gradient | one | **-3.00** | -3.0 |  |  |  |  | 392 |
| exact-change/big-piles | steady-gradient/divisors | neither | **-2.99** | -2.1 | -3.9 |  |  |  | 1663 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1}/c-spf | one | **-2.99** | -3.6 | -2.3 |  |  |  | 321 |
| sunken-intercept/shared | triangle-area{"A":8}/even | neither | **-2.99** | -1.0 | -4.9 |  |  |  | 3782 |
| farey-neighbours/mediant-x | prime-slope/twins | neither | **-2.99** | -3.0 |  |  |  |  | 95 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.98** | -3.0 |  |  |  |  | 441 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-crossing/k-spf | both | **-2.98** | -3.0 | -3.0 |  |  |  | 308 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-2.98** | -3.0 |  |  |  |  | 429 |
| sunken-intercept/shared | triangle-area{"A":8}/legs | neither | **-2.98** | -1.0 | -4.9 |  |  |  | 3729 |
| m-meets-c/meetPrime | treasure{"T":-13,"k":2}/prime-terms | one | **-2.98** | -3.0 |  |  |  |  | 345 |
| m-meets-c/meetPrime | treasure{"T":-13,"k":2}/m-gpf | one | **-2.97** | -3.0 |  |  |  |  | 345 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-13,"k":2}/prime-terms | one | **-2.97** | -3.4 | -2.5 |  |  |  | 404 |
| divisibility-ladder/m-prime | m-meets-c/meetPrime | one | **-2.97** | -3.4 | -2.5 |  |  |  | 236 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":6}/m-gpf | one | **-2.97** | -3.0 |  |  |  |  | 401 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1}/c-spf | one | **-2.97** | -3.6 | -2.3 |  |  |  | 311 |
| prime-gradient{"ends":1,"side":-1}/cPrime | whole-crossing/gcd-c | one | **-2.96** | -2.3 | -3.6 |  |  |  | 1384 |
| m-meets-c/meetPrime | treasure{"T":-13,"k":2}/m-spf | one | **-2.96** | -3.0 |  |  |  |  | 345 |
| m-meets-c/size | same-on-both-rulers{"T":6}/m-gpf | one | **-2.96** | -3.0 |  |  |  |  | 401 |
| m-meets-c/meetPrime | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.95** | -3.0 |  |  |  |  | 345 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":6}/prime-start | one | **-2.95** | -3.0 |  |  |  |  | 401 |
| long-division/m-bottom-spf | whole-intercept/gcd-den-m | neither | **-2.95** | -3.0 |  |  |  |  | 852 |
| long-division/c-period | whole-intercept/gcd-den-m | neither | **-2.95** | -3.0 |  |  |  |  | 852 |
| m-meets-c/meetPrime | treasure{"T":-13,"k":2}/square-start | one | **-2.94** | -2.9 |  |  |  |  | 356 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":6}/m-spf | one | **-2.94** | -2.9 |  |  |  |  | 401 |
| m-meets-c/size | same-on-both-rulers{"T":6}/prime-start | one | **-2.94** | -2.9 |  |  |  |  | 401 |
| m-meets-c/meetPrime | prime-landing{"ends":7,"side":-1}/m-spf | one | **-2.94** | -2.9 |  |  |  |  | 369 |
| m-meets-c/meetPrime | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-2.94** | -2.9 |  |  |  |  | 369 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":6}/steep | one | **-2.94** | -2.9 |  |  |  |  | 401 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":6}/whole-values | one | **-2.94** | -2.9 |  |  |  |  | 401 |
| crossing-check{"k":2,"q":6}/size | whole-crossing/gcd-c | neither | **-2.94** | -2.9 |  |  |  |  | 366 |
| prime-staircase{"ends":3}/last-prime | whole-crossing/gcd-c | one | **-2.93** | -2.9 |  |  |  |  | 129 |
| prime-staircase{"ends":3}/first-prime | whole-crossing/gcd-c | one | **-2.93** | -2.9 |  |  |  |  | 129 |
| m-meets-c/size | same-on-both-rulers{"T":6}/m-spf | one | **-2.93** | -2.9 |  |  |  |  | 401 |
| m-meets-c/size | same-on-both-rulers{"T":6}/steep | one | **-2.93** | -2.9 |  |  |  |  | 401 |
| m-meets-c/size | same-on-both-rulers{"T":6}/whole-values | one | **-2.93** | -2.9 |  |  |  |  | 401 |
| crossing-check{"k":2,"q":6}/whole | whole-crossing/gcd-c | neither | **-2.92** | -2.9 |  |  |  |  | 366 |
| exact-change/big-piles | treasure{"T":-13,"k":2}/m-gpf | one | **-2.92** | -2.9 |  |  |  |  | 464 |
| divisibility-ladder/m-prime | m-meets-c/size | one | **-2.91** | -3.4 | -2.4 |  |  |  | 236 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1}/cPrime | one | **-2.90** | -2.9 |  |  |  |  | 485 |
| prime-gradient{"ends":1}/cPrime | smooth-intercept/shared | one | **-2.90** | -2.2 | -3.6 |  |  |  | 1088 |
| m-meets-c/size | whole-at-t/gcd-c | neither | **-2.90** | -3.1 | -2.7 |  |  |  | 308 |
| prime-staircase{"ends":3}/near-miss | whole-area/gcd-x | one | **-2.89** | -2.9 |  |  |  |  | 429 |
| prime-staircase{"ends":3,"side":-1}/near-miss | whole-area/gcd-x | one | **-2.89** | -2.9 |  |  |  |  | 429 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.89** | -2.9 |  |  |  |  | 501 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1}/prime | one | **-2.89** | -2.9 |  |  |  |  | 493 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-2.89** | -2.9 |  |  |  |  | 509 |
| long-division/m-top | prime-staircase{"ends":3}/last-prime | one | **-2.88** | -2.9 |  |  |  |  | 170 |
| long-division/m-top | prime-staircase{"ends":3}/first-prime | one | **-2.88** | -2.9 |  |  |  |  | 170 |
| long-division/m-bottom-spf | prime-staircase{"ends":3}/last-prime | one | **-2.88** | -2.9 |  |  |  |  | 170 |
| long-division/m-bottom-spf | prime-staircase{"ends":3}/first-prime | one | **-2.88** | -2.9 |  |  |  |  | 170 |
| long-division/c-period | prime-staircase{"ends":3}/last-prime | one | **-2.88** | -2.9 |  |  |  |  | 170 |
| long-division/c-period | prime-staircase{"ends":3}/first-prime | one | **-2.88** | -2.9 |  |  |  |  | 170 |
| long-division/m-bottom-spf | whole-area/gcd-x | neither | **-2.88** | -2.0 | -3.7 |  |  |  | 1228 |
| crossing-check{"k":1,"q":6}/whole | divisibility-ladder/steep | one | **-2.88** | -2.9 |  |  |  |  | 413 |
| whole-at-t/gcd-c | whole-crossing/k-spf | one | **-2.88** | -2.2 | -3.6 |  |  |  | 459 |
| prime-gradient{"ends":1}/cPrime | smooth-crossing/shared | one | **-2.88** | -2.2 | -3.5 |  |  |  | 1012 |
| pell-gradient{"D":5,"k":0}/pell-c | whole-intercept/gcd-floor-m | neither | **-2.87** | -2.9 |  |  |  |  | 586 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":13,"k":2}/square-start | one | **-2.87** | -2.5 | -3.2 |  |  |  | 600 |
| m-meets-c/size | prime-landing{"ends":7,"side":-1}/big-prime | one | **-2.86** | -3.6 | -2.1 |  |  |  | 234 |
| crossing-check{"k":1,"q":4}/whole | divisibility-ladder/steep | one | **-2.86** | -2.9 |  |  |  |  | 354 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":13,"k":2}/prime-terms | one | **-2.86** | -2.4 | -3.3 |  |  |  | 635 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1}/c-gpf | one | **-2.86** | -3.4 | -2.3 |  |  |  | 372 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":13,"k":2}/m-gpf | one | **-2.86** | -2.4 | -3.3 |  |  |  | 645 |
| crossing-check{"k":1,"q":2}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.86** | -2.9 |  |  |  |  | 494 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-2.85** | -3.4 | -2.4 |  |  |  | 389 |
| crossing-check{"k":1,"q":6}/size | divisibility-ladder/steep | one | **-2.85** | -2.9 |  |  |  |  | 409 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-13,"k":2}/m-gpf | one | **-2.85** | -3.3 | -2.4 |  |  |  | 431 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-2.84** | -2.8 |  |  |  |  | 529 |
| farey-neighbours/mediant-x | steady-gradient/gcd-c | neither | **-2.84** | -2.8 |  |  |  |  | 459 |
| exact-change/prime-coins | treasure{"T":-13,"k":2}/m-gpf | one | **-2.84** | -2.8 |  |  |  |  | 537 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":6}/whole-lamp | one | **-2.83** | -2.9 | -2.7 |  |  |  | 401 |
| m-meets-c/meetPrime | treasure{"T":13,"k":2}/prime-terms | one | **-2.83** | -3.2 | -2.5 |  |  |  | 296 |
| crossing-check{"k":1,"q":2}/size | prime-gradient{"ends":1}/c-gpf | one | **-2.83** | -3.4 | -2.3 |  |  |  | 363 |
| farey-neighbours/mediant-x | same-on-both-rulers{"T":6}/m-gpf | one | **-2.83** | -2.8 |  |  |  |  | 334 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-11,"k":2}/prime-terms | one | **-2.83** | -2.5 | -3.1 |  |  |  | 632 |
| prime-gradient{"ends":1}/c-spf | whole-crossing/k-gpf | both | **-2.83** | -3.1 | -2.6 |  |  |  | 632 |
| crossing-check{"k":1,"q":4}/size | divisibility-ladder/m-gpf | one | **-2.83** | -2.8 |  |  |  |  | 367 |
| whole-crossing/gcd-num-m | whole-intercept/spf | neither | **-2.82** | -2.6 | -3.1 |  |  |  | 255 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-13,"k":2}/m-spf | one | **-2.82** | -3.4 | -2.3 |  |  |  | 411 |
| m-meets-c/meetPrime | treasure{"T":13,"k":2}/m-gpf | one | **-2.82** | -3.2 | -2.4 |  |  |  | 296 |
| egyptian-line/bottom | euclid-steps/largest-quotient | neither | **-2.82** | -2.8 |  |  |  |  | 148 |
| farey-neighbours/mediant-x | same-on-both-rulers{"T":6}/prime-start | one | **-2.82** | -2.8 |  |  |  |  | 334 |
| prime-staircase{"ends":3}/step-back | whole-at-t/gcd-c | one | **-2.82** | -2.8 |  |  |  |  | 341 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":6,"k":0}/share-den | neither | **-2.81** | -2.8 |  |  |  |  | 239 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":6,"k":0}/difference | neither | **-2.81** | -2.8 |  |  |  |  | 239 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-area/gcd-x | one | **-2.81** | -2.4 | -2.2 | -3.8 |  |  | 1254 |
| prime-staircase{"ends":3,"side":-1}/step-back | whole-at-t/gcd-c | one | **-2.81** | -2.8 |  |  |  |  | 342 |
| farey-neighbours/mediant-x | same-on-both-rulers{"T":6}/m-spf | one | **-2.81** | -2.8 |  |  |  |  | 334 |
| farey-neighbours/mediant-x | same-on-both-rulers{"T":6}/steep | one | **-2.80** | -2.8 |  |  |  |  | 334 |
| farey-neighbours/mediant-x | same-on-both-rulers{"T":6}/whole-values | one | **-2.80** | -2.8 |  |  |  |  | 334 |
| m-meets-c/size | same-on-both-rulers{"T":6}/whole-lamp | one | **-2.80** | -2.9 | -2.7 |  |  |  | 401 |
| m-meets-c/size | treasure{"T":13,"k":2}/prime-terms | one | **-2.80** | -3.2 | -2.4 |  |  |  | 296 |
| long-division/m-bottom-spf | smooth-crossing/shared | neither | **-2.79** | -2.8 |  |  |  |  | 682 |
| long-division/c-period | smooth-crossing/shared | neither | **-2.79** | -2.8 |  |  |  |  | 682 |
| prime-gradient{"ends":1}/c-spf | whole-area/gcd-x | one | **-2.79** | -2.4 | -2.3 | -3.7 |  |  | 1302 |
| m-meets-c/size | treasure{"T":13,"k":2}/m-gpf | one | **-2.79** | -3.2 | -2.4 |  |  |  | 296 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":13,"k":2}/m-spf | one | **-2.79** | -2.4 | -3.2 |  |  |  | 634 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-11,"k":2}/square-start | one | **-2.79** | -2.6 | -2.9 |  |  |  | 603 |
| crossing-check{"k":1,"q":2}/size | divisibility-ladder/m-spf | one | **-2.79** | -2.8 |  |  |  |  | 385 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":6,"k":0}/share-den | neither | **-2.79** | -2.8 |  |  |  |  | 247 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":6,"k":0}/difference | neither | **-2.79** | -2.8 |  |  |  |  | 247 |
| crossing-check{"k":1,"q":4}/size | divisibility-ladder/m-prime | one | **-2.78** | -2.8 |  |  |  |  | 351 |
| long-division/c-period | whole-intercept/omega | neither | **-2.78** | -2.8 |  |  |  |  | 1253 |
| farey-neighbours/mediant-x | whole-intercept/gcd-floor-m | neither | **-2.78** | -3.3 | -2.3 |  |  |  | 329 |
| m-meets-c/meetPrime | pythagorean-area/slanted-square | one | **-2.78** | -2.8 |  |  |  |  | 496 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-11,"k":2}/m-gpf | one | **-2.78** | -2.6 | -3.0 |  |  |  | 612 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":11,"k":2}/m-gpf | one | **-2.78** | -2.5 | -3.0 |  |  |  | 523 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1}/cPrime | one | **-2.78** | -2.8 |  |  |  |  | 551 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":11,"k":2}/prime-terms | one | **-2.78** | -2.5 | -3.0 |  |  |  | 528 |
| m-meets-c/meetPrime | pythagorean-area/whole-legs | one | **-2.78** | -2.8 |  |  |  |  | 496 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":13,"k":2}/square-start | one | **-2.78** | -2.5 | -3.0 |  |  |  | 611 |
| long-division/m-bottom-spf | whole-intercept/spf | neither | **-2.78** | -2.8 |  |  |  |  | 543 |
| long-division/c-period | whole-intercept/spf | neither | **-2.78** | -2.8 |  |  |  |  | 543 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":11,"k":2}/m-spf | one | **-2.77** | -2.5 | -3.0 |  |  |  | 523 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-11,"k":2}/m-spf | one | **-2.77** | -2.6 | -3.0 |  |  |  | 612 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.77** | -2.6 | -2.9 |  |  |  | 603 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-2.77** | -2.5 | -3.0 |  |  |  | 521 |
| m-meets-c/meetPrime | triangle-area{"A":6}/legs | neither | **-2.77** | -2.8 |  |  |  |  | 485 |
| prime-gradient{"ends":1}/c-gpf | whole-crossing/k-gpf | both | **-2.77** | -3.0 | -2.6 |  |  |  | 733 |
| m-meets-c/meetPrime | pythagorean-area/prime-height | one | **-2.77** | -2.8 |  |  |  |  | 485 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-2.77** | -2.4 | -3.1 |  |  |  | 649 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-2.77** | -2.5 | -3.0 |  |  |  | 526 |
| m-meets-c/meetPrime | triangle-area{"A":6}/even | neither | **-2.77** | -2.8 |  |  |  |  | 495 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-2.77** | -2.4 | -3.1 |  |  |  | 657 |
| near-point/lattice | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.77** | -2.8 | -2.8 |  |  |  | 483 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":11,"k":2}/m-spf | one | **-2.76** | -2.5 | -3.0 |  |  |  | 521 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1}/prime | one | **-2.76** | -2.8 |  |  |  |  | 566 |
| crossing-check{"k":3,"q":4}/size | steady-gradient/gcd-c | neither | **-2.76** | -2.8 |  |  |  |  | 356 |
| crossing-check{"k":1,"q":2}/whole | divisibility-ladder/m-spf | one | **-2.76** | -2.8 |  |  |  |  | 404 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1}/cPrime | one | **-2.76** | -2.8 |  |  |  |  | 582 |
| near-point/gcd-x | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.76** | -2.8 | -2.8 |  |  |  | 483 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1}/cPrime | one | **-2.75** | -2.8 |  |  |  |  | 485 |
| m-meets-c/meetPrime | whole-intercept/spf | neither | **-2.75** | -2.8 |  |  |  |  | 246 |
| crossing-check{"k":3,"q":2}/size | whole-at-t/gcd-den-m | neither | **-2.75** | -2.7 |  |  |  |  | 74 |
| m-meets-c/meetPrime | treasure{"T":13,"k":2}/prime-gradient | one | **-2.75** | -3.2 | -2.3 |  |  |  | 296 |
| m-meets-c/meetPrime | prime-gradient{"ends":1}/c-gpf | one | **-2.75** | -3.7 | -1.8 |  |  |  | 255 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-area/gcd-x | one | **-2.75** | -2.2 | -2.2 | -3.8 |  |  | 1521 |
| prime-staircase{"ends":3}/last-prime | whole-area/gcd-x | one | **-2.74** | -2.7 |  |  |  |  | 147 |
| prime-staircase{"ends":3}/first-prime | whole-area/gcd-x | one | **-2.74** | -2.7 |  |  |  |  | 147 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1}/prime | one | **-2.74** | -2.7 |  |  |  |  | 493 |
| m-meets-c/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.74** | -3.8 | -1.7 |  |  |  | 248 |
| m-meets-c/meetPrime | treasure{"T":13,"k":2}/m-spf | one | **-2.74** | -3.2 | -2.3 |  |  |  | 296 |
| m-meets-c/meetPrime | prime-landing{"ends":7}/big-prime | one | **-2.74** | -3.5 | -2.0 |  |  |  | 257 |
| exact-change/prime-coins | treasure{"T":-11,"k":2}/square-start | one | **-2.73** | -2.7 |  |  |  |  | 529 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-2.73** | -2.7 |  |  |  |  | 509 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-2.73** | -3.2 | -2.3 |  |  |  | 414 |
| long-division/m-top | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-2.73** | -2.7 |  |  |  |  | 190 |
| long-division/m-top | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-2.73** | -2.7 |  |  |  |  | 190 |
| long-division/m-bottom-spf | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-2.73** | -2.7 |  |  |  |  | 190 |
| long-division/m-bottom-spf | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-2.73** | -2.7 |  |  |  |  | 190 |
| long-division/c-period | prime-staircase{"ends":3,"side":-1}/last-prime | one | **-2.73** | -2.7 |  |  |  |  | 190 |
| long-division/c-period | prime-staircase{"ends":3,"side":-1}/first-prime | one | **-2.73** | -2.7 |  |  |  |  | 190 |
| prime-gradient{"ends":1,"side":-1}/c-spf | whole-crossing/gcd-c | one | **-2.73** | -2.3 | -2.0 | -3.9 |  |  | 1376 |
| prime-gradient{"ends":1}/c-spf | whole-crossing/gcd-c | one | **-2.73** | -2.2 | -2.1 | -3.9 |  |  | 1434 |
| exact-change/prime-coins | treasure{"T":-11,"k":2}/m-spf | one | **-2.72** | -2.7 |  |  |  |  | 529 |
| exact-change/prime-coins | treasure{"T":-11,"k":2}/m-gpf | one | **-2.72** | -2.7 |  |  |  |  | 529 |
| exact-change/prime-coins | treasure{"T":-11,"k":2}/prime-terms | one | **-2.72** | -2.7 |  |  |  |  | 529 |
| prime-gradient{"ends":1}/c-gpf | whole-area/gcd-x | one | **-2.72** | -2.1 | -2.3 | -3.7 |  |  | 1608 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1}/prime | one | **-2.72** | -2.7 |  |  |  |  | 605 |
| m-meets-c/meetPrime | prime-gradient{"ends":1}/c-spf | one | **-2.72** | -3.7 | -1.8 |  |  |  | 255 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-2.72** | -2.9 | -2.6 |  |  |  | 477 |
| m-meets-c/size | treasure{"T":13,"k":2}/prime-gradient | one | **-2.72** | -3.2 | -2.3 |  |  |  | 296 |
| m-meets-c/size | prime-gradient{"ends":1}/c-gpf | one | **-2.71** | -3.7 | -1.7 |  |  |  | 256 |
| m-meets-c/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.71** | -3.7 | -1.7 |  |  |  | 248 |
| crossing-check{"k":1,"q":4}/whole | square-area/spf | one | **-2.71** | -2.7 |  |  |  |  | 414 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-2.71** | -2.9 | -2.5 |  |  |  | 477 |
| m-meets-c/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-2.71** | -3.8 | -1.6 |  |  |  | 249 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-2.71** | -3.3 | -2.1 |  |  |  | 395 |
| m-meets-c/size | treasure{"T":13,"k":2}/m-spf | one | **-2.71** | -3.2 | -2.2 |  |  |  | 296 |
| m-meets-c/size | prime-landing{"ends":7}/big-prime | one | **-2.71** | -3.5 | -1.9 |  |  |  | 257 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-2.70** | -2.9 | -2.5 |  |  |  | 247 |
| m-meets-c/meetPrime | prime-gradient{"ends":1}/cPrime | one | **-2.70** | -3.7 | -1.7 |  |  |  | 255 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-2.70** | -2.4 | -3.0 |  |  |  | 609 |
| exact-change/prime-coins | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.70** | -2.7 |  |  |  |  | 529 |
| crossing-check{"k":1,"q":6}/whole | divisibility-ladder/m-gpf | one | **-2.70** | -2.7 |  |  |  |  | 424 |
| exact-change/big-bill | steady-gradient/divisors | neither | **-2.70** | -0.0 | -3.8 | -4.3 |  |  | 7222 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":13,"k":2}/m-spf | one | **-2.70** | -2.4 | -3.0 |  |  |  | 646 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":11,"k":2}/square-start | one | **-2.69** | -2.5 | -2.9 |  |  |  | 536 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-2.69** | -2.7 |  |  |  |  | 529 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":11,"k":2}/prime-gradient | one | **-2.69** | -2.5 | -2.9 |  |  |  | 523 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.69** | -2.7 |  |  |  |  | 569 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-2.69** | -2.7 |  |  |  |  | 596 |
| m-meets-c/size | prime-gradient{"ends":1}/c-spf | one | **-2.69** | -3.6 | -1.7 |  |  |  | 256 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":11,"k":2}/square-start | one | **-2.68** | -2.5 | -2.8 |  |  |  | 534 |
| long-division/c-period | whole-crossing/gcd-c | neither | **-2.68** | -2.7 |  |  |  |  | 1082 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-2.68** | -2.5 | -2.8 |  |  |  | 521 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-11,"k":2}/prime-terms | one | **-2.68** | -2.8 | -2.6 |  |  |  | 505 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-2.68** | -2.8 | -2.6 |  |  |  | 351 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":13,"k":2}/prime-terms | one | **-2.67** | -3.1 | -2.3 |  |  |  | 392 |
| prime-gradient{"ends":1}/c-gpf | whole-crossing/k-spf | both | **-2.67** | -3.1 | -2.3 |  |  |  | 315 |
| prime-gradient{"ends":1,"side":-1}/c-gpf | whole-crossing/gcd-c | one | **-2.67** | -2.1 | -2.0 | -3.9 |  |  | 1642 |
| crossing-check{"k":1,"q":4}/whole | divisibility-ladder/m-gpf | one | **-2.67** | -2.7 |  |  |  |  | 367 |
| long-division/m-bottom-spf | smooth-intercept/shared | neither | **-2.67** | -2.7 |  |  |  |  | 785 |
| long-division/c-period | smooth-intercept/shared | neither | **-2.67** | -2.7 |  |  |  |  | 785 |
| m-meets-c/size | prime-gradient{"ends":1}/cPrime | one | **-2.67** | -3.7 | -1.6 |  |  |  | 256 |
| crossing-check{"k":1,"q":6}/size | divisibility-ladder/m-gpf | one | **-2.67** | -2.7 |  |  |  |  | 421 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-2.67** | -3.1 | -2.3 |  |  |  | 390 |
| crossing-check{"k":1,"q":4}/whole | square-area/lpf | one | **-2.67** | -2.7 |  |  |  |  | 436 |
| m-meets-c/size | treasure{"T":-13,"k":2}/prime-terms | one | **-2.67** | -2.9 | -2.4 |  |  |  | 355 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":13,"k":2}/m-gpf | one | **-2.66** | -3.1 | -2.2 |  |  |  | 392 |
| prime-gradient{"ends":1}/c-gpf | whole-crossing/gcd-c | one | **-2.66** | -2.0 | -2.1 | -3.9 |  |  | 1740 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-11,"k":2}/square-start | one | **-2.66** | -2.5 | -2.8 |  |  |  | 581 |
| crossing-check{"k":1,"q":4}/size | whole-area/gcd-x | neither | **-2.66** | -2.7 |  |  |  |  | 439 |
| euclid-steps/largest-quotient | whole-area/gcd-x | neither | **-2.66** | -2.3 | -2.8 | -2.8 |  |  | 919 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-2.66** | -3.1 | -2.2 |  |  |  | 390 |
| m-meets-c/size | treasure{"T":-13,"k":2}/m-gpf | one | **-2.66** | -2.9 | -2.4 |  |  |  | 355 |
| crossing-check{"k":3,"q":2}/size | steady-gradient/gcd-c | neither | **-2.66** | -2.7 |  |  |  |  | 417 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-11,"k":2}/m-gpf | one | **-2.66** | -2.5 | -2.8 |  |  |  | 590 |
| crossing-check{"k":1,"q":4}/whole | square-area/omega | one | **-2.65** | -2.7 |  |  |  |  | 443 |
| crossing-check{"k":1,"q":6}/whole | divisibility-ladder/m-prime | one | **-2.65** | -2.7 |  |  |  |  | 408 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.65** | -2.6 |  |  |  |  | 562 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1,"side":-1}/prime | one | **-2.65** | -2.6 |  |  |  |  | 618 |
| prime-staircase{"ends":3,"side":-1}/last-prime | whole-area/gcd-x | one | **-2.65** | -2.6 |  |  |  |  | 157 |
| prime-staircase{"ends":3,"side":-1}/first-prime | whole-area/gcd-x | one | **-2.65** | -2.6 |  |  |  |  | 157 |
| pell-gradient{"D":7,"k":0}/share-den | whole-at-t/gcd-c | neither | **-2.65** | -2.6 |  |  |  |  | 602 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-11,"k":2}/m-spf | one | **-2.65** | -2.5 | -2.8 |  |  |  | 590 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.64** | -2.5 | -2.8 |  |  |  | 581 |
| prime-gradient{"ends":1}/c-spf | whole-crossing/k-spf | both | **-2.64** | -3.0 | -2.3 |  |  |  | 315 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":-13,"k":2}/square-start | one | **-2.64** | -2.6 |  |  |  |  | 610 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-11,"k":2}/square-start | one | **-2.64** | -2.9 | -2.4 |  |  |  | 477 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":-13,"k":2}/square-start | one | **-2.64** | -2.6 |  |  |  |  | 592 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-2.64** | -3.0 | -2.3 |  |  |  | 240 |
| crossing-check{"k":1,"q":4}/whole | divisibility-ladder/m-prime | one | **-2.63** | -2.6 |  |  |  |  | 351 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1}/c-spf | one | **-2.63** | -3.4 | -1.9 |  |  |  | 292 |
| divisibility-ladder/steep | m-meets-c/size | one | **-2.63** | -3.6 | -1.6 |  |  |  | 241 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":11,"k":2}/square-start | one | **-2.63** | -2.9 | -2.3 |  |  |  | 248 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.63** | -2.9 | -2.4 |  |  |  | 477 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-at-t/gcd-c | neither | **-2.62** | -2.6 |  |  |  |  | 599 |
| crossing-check{"k":1,"q":6}/size | divisibility-ladder/m-prime | one | **-2.62** | -2.6 |  |  |  |  | 404 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.62** | -3.2 | -2.1 |  |  |  | 483 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1}/c-spf | one | **-2.62** | -2.6 |  |  |  |  | 542 |
| crossing-check{"k":1,"q":4}/whole | smooth-square/shared | neither | **-2.62** | -2.6 |  |  |  |  | 473 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":13,"k":2}/prime-gradient | one | **-2.62** | -3.1 | -2.2 |  |  |  | 392 |
| near-point/lattice | prime-landing{"ends":7,"side":-1}/next-prime | one | **-2.62** | -2.6 | -2.6 |  |  |  | 536 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":13,"k":2}/square-start | one | **-2.62** | -3.1 | -2.1 |  |  |  | 392 |
| divisibility-ladder/steep | near-point/lattice | one | **-2.61** | -2.6 |  |  |  |  | 435 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/cPrime | one | **-2.61** | -2.6 |  |  |  |  | 633 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-2.61** | -3.1 | -2.2 |  |  |  | 390 |
| near-point/gcd-x | prime-landing{"ends":7,"side":-1}/next-prime | one | **-2.61** | -2.6 | -2.6 |  |  |  | 535 |
| crossing-check{"k":3,"q":4}/size | whole-intercept/gcd-floor-m | neither | **-2.61** | -2.6 |  |  |  |  | 407 |
| crossing-check{"k":3,"q":2}/whole | whole-intercept/spf | neither | **-2.61** | -2.2 | -3.0 |  |  |  | 262 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":11,"k":2}/square-start | one | **-2.61** | -2.8 | -2.4 |  |  |  | 346 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":13,"k":2}/square-start | one | **-2.61** | -3.1 | -2.1 |  |  |  | 390 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-2.61** | -2.7 | -2.5 |  |  |  | 568 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":13,"k":2}/prime-gradient | one | **-2.61** | -2.5 | -2.7 |  |  |  | 600 |
| near-point/lattice | prime-landing{"ends":7,"side":-1}/big-prime | one | **-2.61** | -2.5 | -2.8 |  |  |  | 534 |
| pell-gradient{"D":7,"k":0}/difference | whole-at-t/gcd-c | neither | **-2.60** | -2.6 |  |  |  |  | 599 |
| pythagorean-area/slanted-square | whole-area/gcd-x | one | **-2.60** | -2.6 |  |  |  |  | 433 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.60** | -3.2 | -2.0 |  |  |  | 459 |
| pythagorean-area/whole-legs | whole-area/gcd-x | one | **-2.60** | -2.6 |  |  |  |  | 433 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-2.60** | -2.8 | -2.4 |  |  |  | 342 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.60** | -2.6 |  |  |  |  | 620 |
| near-point/gcd-x | prime-landing{"ends":7,"side":-1}/big-prime | one | **-2.60** | -2.4 | -2.8 |  |  |  | 533 |
| divisibility-ladder/steep | near-point/gcd-x | one | **-2.60** | -2.6 |  |  |  |  | 435 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":-13,"k":2}/m-spf | one | **-2.60** | -2.6 |  |  |  |  | 601 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.60** | -2.6 |  |  |  |  | 601 |
| divisibility-ladder/steep | whole-crossing/k-spf | both | **-2.59** | -2.6 | -2.6 |  |  |  | 355 |
| triangle-area{"A":6}/even | whole-area/gcd-x | neither | **-2.59** | -2.6 |  |  |  |  | 433 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":13,"k":2}/m-spf | one | **-2.58** | -3.1 | -2.1 |  |  |  | 392 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/prime | one | **-2.58** | -2.6 |  |  |  |  | 655 |
| crossing-check{"k":3,"q":2}/size | whole-intercept/gcd-floor-m | neither | **-2.58** | -2.6 |  |  |  |  | 449 |
| crossing-check{"k":2,"q":6}/whole | treasure{"T":13,"k":2}/m-spf | one | **-2.58** | -3.1 | -2.1 |  |  |  | 390 |
| m-meets-c/size | treasure{"T":-13,"k":2}/m-spf | one | **-2.57** | -2.9 | -2.2 |  |  |  | 355 |
| sunken-intercept/shared | treasure{"T":-11,"k":2}/square-start | one | **-2.57** | -2.6 |  |  |  |  | 754 |
| triangle-area{"A":6}/legs | whole-area/gcd-x | neither | **-2.57** | -2.6 |  |  |  |  | 433 |
| pythagorean-area/prime-height | whole-area/gcd-x | one | **-2.57** | -2.6 |  |  |  |  | 433 |
| sunken-intercept/shared | treasure{"T":-11,"k":2}/prime-terms | one | **-2.57** | -2.6 |  |  |  |  | 749 |
| crossing-check{"k":3,"q":6}/whole | whole-crossing/gcd-c | neither | **-2.56** | -2.6 |  |  |  |  | 454 |
| euclid-steps/largest-quotient | whole-intercept/omega | neither | **-2.56** | -2.1 | -2.7 | -2.9 |  |  | 1314 |
| divisibility-ladder/m-spf | whole-crossing/k-spf | both | **-2.56** | -2.6 |  |  |  |  | 350 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":-13,"k":2}/m-gpf | one | **-2.55** | -2.6 |  |  |  |  | 624 |
| sunken-intercept/shared | triangle-area{"A":12}/even | neither | **-2.55** | -0.7 | -4.4 |  |  |  | 4294 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":-13,"k":2}/prime-terms | one | **-2.55** | -2.5 |  |  |  |  | 622 |
| sunken-intercept/shared | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.55** | -2.5 |  |  |  |  | 749 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":7,"side":-1}/next-prime | one | **-2.54** | -3.2 | -1.9 |  |  |  | 483 |
| sunken-intercept/shared | treasure{"T":-11,"k":2}/m-spf | one | **-2.54** | -2.5 |  |  |  |  | 764 |
| sunken-intercept/shared | treasure{"T":-11,"k":2}/m-gpf | one | **-2.54** | -2.5 |  |  |  |  | 764 |
| crossing-check{"k":3,"q":6}/size | whole-crossing/gcd-c | neither | **-2.54** | -2.5 |  |  |  |  | 454 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":7,"side":-1}/big-prime | one | **-2.54** | -3.0 | -2.1 |  |  |  | 474 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1}/c-gpf | one | **-2.54** | -3.2 | -1.9 |  |  |  | 338 |
| long-division/m-top | whole-intercept/spf | neither | **-2.54** | -2.8 | -2.3 |  |  |  | 543 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.54** | -2.5 |  |  |  |  | 569 |
| m-meets-c/size | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.53** | -2.9 | -2.1 |  |  |  | 355 |
| divisibility-ladder/m-gpf | m-meets-c/size | one | **-2.53** | -3.5 | -1.6 |  |  |  | 236 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":7,"side":-1}/next-prime | one | **-2.53** | -3.2 | -1.9 |  |  |  | 459 |
| long-division/m-top | whole-intercept/omega | neither | **-2.53** | -2.8 | -2.3 |  |  |  | 1253 |
| m-meets-c/size | triangle-area{"A":8}/even | neither | **-2.52** | -3.4 | -1.7 |  |  |  | 349 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":13,"k":2}/square-start | one | **-2.52** | -2.7 | -2.3 |  |  |  | 572 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":7,"side":-1}/big-prime | one | **-2.52** | -3.0 | -2.0 |  |  |  | 452 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-2.52** | -3.0 | -2.1 |  |  |  | 240 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":11,"k":2}/square-start | one | **-2.52** | -2.5 |  |  |  |  | 612 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":11,"k":2}/prime-terms | one | **-2.52** | -2.5 |  |  |  |  | 608 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-2.51** | -2.5 | -2.5 |  |  |  | 611 |
| crossing-check{"k":3,"q":4}/whole | treasure{"T":11,"k":2}/m-spf | one | **-2.51** | -3.0 | -2.0 |  |  |  | 240 |
| m-meets-c/size | triangle-area{"A":8}/legs | neither | **-2.51** | -3.3 | -1.7 |  |  |  | 348 |
| pell-gradient{"D":3,"k":0}/pell-c | whole-crossing/gcd-c | neither | **-2.51** | -1.5 | -2.2 | -3.8 |  |  | 1712 |
| crossing-check{"k":1,"q":4}/whole | whole-area/gcd-x | neither | **-2.51** | -2.5 |  |  |  |  | 439 |
| m-meets-c/size | prime-landing{"ends":7,"side":-1}/next-prime | one | **-2.51** | -3.1 | -1.9 |  |  |  | 358 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1}/c-spf | one | **-2.51** | -2.5 |  |  |  |  | 613 |
| crossing-check{"k":1,"q":4}/size | prime-gradient{"ends":1}/c-gpf | one | **-2.51** | -2.5 |  |  |  |  | 597 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":-13,"k":2}/m-spf | one | **-2.51** | -2.5 |  |  |  |  | 649 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":11,"k":2}/prime-gradient | one | **-2.50** | -2.5 |  |  |  |  | 605 |
| crossing-check{"k":1,"q":4}/whole | whole-crossing/k-gpf | one | **-2.50** | -2.5 |  |  |  |  | 310 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.50** | -2.5 |  |  |  |  | 562 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-11,"k":2}/m-gpf | one | **-2.49** | -2.9 | -2.1 |  |  |  | 481 |
| m-meets-c/size | treasure{"T":-11,"k":2}/prime-terms | one | **-2.49** | -2.3 | -2.7 |  |  |  | 488 |
| m-meets-c/size | treasure{"T":-11,"k":2}/m-gpf | one | **-2.49** | -2.3 | -2.6 |  |  |  | 488 |
| sunken-intercept/shared | triangle-area{"A":12}/legs | neither | **-2.49** | -0.6 | -4.4 |  |  |  | 4294 |
| divisibility-ladder/m-gpf | whole-crossing/k-spf | both | **-2.48** | -2.4 | -2.5 |  |  |  | 352 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-11,"k":2}/m-spf | one | **-2.48** | -2.9 | -2.1 |  |  |  | 481 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":11,"k":2}/m-spf | one | **-2.48** | -2.5 |  |  |  |  | 624 |
| crossing-check{"k":1,"q":4}/size | treasure{"T":11,"k":2}/m-gpf | one | **-2.48** | -2.5 |  |  |  |  | 624 |
| crossing-check{"k":1,"q":6}/size | whole-area/gcd-x | neither | **-2.48** | -2.5 |  |  |  |  | 486 |
| crossing-check{"k":2,"q":6}/size | divisibility-ladder/steep | one | **-2.48** | -2.5 |  |  |  |  | 495 |
| m-meets-c/size | treasure{"T":-11,"k":2}/m-spf | one | **-2.48** | -2.3 | -2.6 |  |  |  | 488 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1}/c-spf | one | **-2.47** | -2.5 |  |  |  |  | 651 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.47** | -2.5 |  |  |  |  | 649 |
| euclid-steps/largest-quotient | whole-intercept/spf | neither | **-2.47** | -2.2 | -2.8 |  |  |  | 546 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1}/c-spf | one | **-2.47** | -2.5 |  |  |  |  | 542 |
| crossing-check{"k":2,"q":6}/whole | divisibility-ladder/steep | one | **-2.47** | -2.5 |  |  |  |  | 495 |
| long-division/m-bottom-spf | steep-and-tall/shared | neither | **-2.46** | -1.8 | -3.1 |  |  |  | 2963 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":-13,"k":2}/prime-terms | one | **-2.46** | -2.5 |  |  |  |  | 670 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-2.46** | -2.8 | -2.1 |  |  |  | 344 |
| pell-gradient{"D":6,"k":0}/pell-c | smooth-crossing/shared | neither | **-2.46** | -3.2 | -1.7 |  |  |  | 609 |
| pell-gradient{"D":6,"k":0}/pell-c | smooth-intercept/shared | neither | **-2.46** | -3.2 | -1.7 |  |  |  | 613 |
| m-meets-c/size | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-2.46** | -2.9 | -2.0 |  |  |  | 377 |
| crossing-check{"k":3,"q":6}/whole | smooth-gradient/shared | neither | **-2.46** | -2.5 |  |  |  |  | 257 |
| m-meets-c/size | prime-landing{"ends":7,"side":-1}/m-spf | one | **-2.46** | -2.9 | -2.0 |  |  |  | 377 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-11,"k":2}/prime-terms | one | **-2.46** | -2.8 | -2.1 |  |  |  | 509 |
| m-meets-c/meetPrime | prime-landing{"ends":7}/next-prime | one | **-2.45** | -3.1 | -1.8 |  |  |  | 364 |
| whole-crossing/k-spf | whole-intercept/omega | one | **-2.45** | -2.5 |  |  |  |  | 454 |
| crossing-check{"k":3,"q":2}/whole | treasure{"T":11,"k":2}/m-spf | one | **-2.45** | -2.8 | -2.1 |  |  |  | 344 |
| crossing-check{"k":1,"q":4}/size | whole-crossing/k-gpf | one | **-2.45** | -2.5 |  |  |  |  | 360 |
| divisibility-ladder/m-gpf | near-point/lattice | one | **-2.45** | -2.4 |  |  |  |  | 441 |
| crossing-check{"k":2,"q":2}/whole | euclid-steps/largest-quotient | neither | **-2.44** | -2.4 |  |  |  |  | 439 |
| crossing-check{"k":1,"q":2}/whole | whole-crossing/k-gpf | one | **-2.44** | -2.4 |  |  |  |  | 333 |
| crossing-check{"k":2,"q":2}/whole | long-division/m-top | neither | **-2.44** | -2.4 |  |  |  |  | 663 |
| crossing-check{"k":2,"q":2}/whole | long-division/m-bottom-spf | neither | **-2.44** | -2.4 |  |  |  |  | 663 |
| crossing-check{"k":2,"q":2}/whole | long-division/c-period | neither | **-2.44** | -2.4 |  |  |  |  | 663 |
| crossing-check{"k":3,"q":6}/size | smooth-gradient/shared | neither | **-2.44** | -2.4 |  |  |  |  | 257 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":-13,"k":2}/m-gpf | one | **-2.43** | -2.4 |  |  |  |  | 688 |
| divisibility-ladder/m-gpf | near-point/gcd-x | one | **-2.43** | -2.4 |  |  |  |  | 441 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.43** | -2.4 |  |  |  |  | 684 |
| m-meets-c/size | prime-landing{"ends":7}/next-prime | one | **-2.42** | -3.0 | -1.8 |  |  |  | 365 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-11,"k":2}/square-start | one | **-2.42** | -2.9 | -1.9 |  |  |  | 481 |
| m-meets-c/meetPrime | prime-landing{"ends":7}/m-gpf | one | **-2.42** | -2.9 | -1.9 |  |  |  | 378 |
| crossing-check{"k":1,"q":2}/size | whole-crossing/k-gpf | one | **-2.41** | -2.4 |  |  |  |  | 331 |
| m-meets-c/meetPrime | prime-landing{"ends":7}/m-spf | one | **-2.41** | -2.9 | -1.9 |  |  |  | 378 |
| crossing-check{"k":1,"q":4}/size | divisibility-ladder/m-spf | one | **-2.41** | -2.4 |  |  |  |  | 507 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.41** | -2.4 |  |  |  |  | 686 |
| crossing-check{"k":1,"q":6}/size | prime-gradient{"ends":1}/c-gpf | one | **-2.40** | -2.4 |  |  |  |  | 668 |
| near-point/lattice | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-2.40** | -2.1 | -2.7 |  |  |  | 664 |
| crossing-check{"k":2,"q":6}/size | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.40** | -2.9 | -1.9 |  |  |  | 481 |
| near-point/lattice | prime-landing{"ends":7,"side":-1}/m-spf | one | **-2.40** | -2.1 | -2.7 |  |  |  | 664 |
| m-meets-c/size | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.40** | -2.3 | -2.5 |  |  |  | 488 |
| near-point/gcd-x | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-2.39** | -2.1 | -2.7 |  |  |  | 664 |
| near-point/gcd-x | prime-landing{"ends":7,"side":-1}/m-spf | one | **-2.39** | -2.1 | -2.7 |  |  |  | 664 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":-6}/m-gpf | one | **-2.39** | -2.4 |  |  |  |  | 558 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":7,"k":0}/share-den | neither | **-2.39** | -2.4 |  |  |  |  | 535 |
| crossing-check{"k":2,"q":4}/size | same-on-both-rulers{"T":-6}/whole-lamp | one | **-2.39** | -2.3 | -2.5 |  |  |  | 802 |
| prime-slope/square-sum | whole-at-t/gcd-c | neither | **-2.39** | -2.4 | -2.3 |  |  |  | 143 |
| m-meets-c/size | prime-landing{"ends":7}/m-gpf | one | **-2.38** | -2.9 | -1.9 |  |  |  | 378 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":7,"k":0}/share-den | neither | **-2.38** | -2.4 |  |  |  |  | 541 |
| crossing-check{"k":2,"q":2}/size | euclid-steps/largest-quotient | neither | **-2.38** | -2.4 |  |  |  |  | 468 |
| m-meets-c/size | same-on-both-rulers{"T":-6}/m-gpf | one | **-2.38** | -2.4 |  |  |  |  | 558 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1}/c-gpf | one | **-2.38** | -2.4 |  |  |  |  | 706 |
| m-meets-c/size | prime-landing{"ends":7}/m-spf | one | **-2.38** | -2.9 | -1.8 |  |  |  | 378 |
| m-meets-c/size | treasure{"T":-11,"k":2}/square-start | one | **-2.38** | -2.3 | -2.5 |  |  |  | 517 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":11,"k":2}/square-start | one | **-2.38** | -2.4 |  |  |  |  | 605 |
| crossing-check{"k":2,"q":2}/size | long-division/m-top | neither | **-2.38** | -2.4 |  |  |  |  | 703 |
| crossing-check{"k":2,"q":2}/size | long-division/m-bottom-spf | neither | **-2.38** | -2.4 |  |  |  |  | 703 |
| crossing-check{"k":2,"q":2}/size | long-division/c-period | neither | **-2.38** | -2.4 |  |  |  |  | 703 |
| divisibility-ladder/m-prime | near-point/lattice | one | **-2.38** | -2.4 |  |  |  |  | 435 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-2.37** | -2.4 |  |  |  |  | 601 |
| m-meets-c/meetPrime | treasure{"T":-11,"k":2}/m-spf | one | **-2.37** | -2.4 |  |  |  |  | 471 |
| m-meets-c/meetPrime | treasure{"T":-11,"k":2}/m-gpf | one | **-2.37** | -2.4 |  |  |  |  | 471 |
| m-meets-c/meetPrime | treasure{"T":-11,"k":2}/prime-terms | one | **-2.37** | -2.4 |  |  |  |  | 471 |
| crossing-check{"k":2,"q":4}/whole | same-on-both-rulers{"T":-6}/whole-lamp | one | **-2.37** | -2.2 | -2.5 |  |  |  | 802 |
| crossing-check{"k":1,"q":6}/whole | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.37** | -2.4 |  |  |  |  | 721 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":-6}/m-spf | one | **-2.37** | -2.4 |  |  |  |  | 556 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":-6}/steep | one | **-2.37** | -2.4 |  |  |  |  | 555 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":7,"k":0}/pell-c | neither | **-2.36** | -2.4 |  |  |  |  | 533 |
| exact-change/big-bill | treasure{"T":-13,"k":2}/square-start | one | **-2.36** | -2.4 |  |  |  |  | 837 |
| m-meets-c/meetPrime | same-on-both-rulers{"T":-6}/whole-values | one | **-2.36** | -2.4 |  |  |  |  | 556 |
| pell-gradient{"D":6,"k":0}/share-den | ruler/far | one | **-2.36** | -0.3 | -4.4 |  |  |  | 1449 |
| crossing-check{"k":2,"q":2}/whole | pell-gradient{"D":7,"k":0}/difference | neither | **-2.36** | -2.4 |  |  |  |  | 522 |
| divisibility-ladder/m-prime | whole-crossing/k-spf | both | **-2.36** | -2.4 |  |  |  |  | 350 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":7,"k":0}/pell-c | neither | **-2.36** | -2.4 |  |  |  |  | 539 |
| crossing-check{"k":2,"q":2}/size | pell-gradient{"D":7,"k":0}/difference | neither | **-2.36** | -2.4 |  |  |  |  | 527 |
| divisibility-ladder/m-prime | near-point/gcd-x | one | **-2.36** | -2.4 |  |  |  |  | 435 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-2.36** | -2.4 |  |  |  |  | 598 |
| crossing-check{"k":1,"q":6}/whole | whole-area/gcd-x | neither | **-2.36** | -2.4 |  |  |  |  | 550 |
| m-meets-c/size | same-on-both-rulers{"T":-6}/m-spf | one | **-2.35** | -2.4 |  |  |  |  | 556 |
| m-meets-c/size | same-on-both-rulers{"T":-6}/steep | one | **-2.35** | -2.4 |  |  |  |  | 555 |
| m-meets-c/size | same-on-both-rulers{"T":-6}/whole-values | one | **-2.35** | -2.4 |  |  |  |  | 556 |
| crossing-check{"k":1,"q":4}/whole | prime-gradient{"ends":1}/c-gpf | one | **-2.35** | -2.4 |  |  |  |  | 597 |
| m-meets-c/meetPrime | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.35** | -2.4 |  |  |  |  | 471 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-crossing/gcd-c | neither | **-2.35** | -3.2 | -1.5 |  |  |  | 887 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":11,"k":2}/m-spf | one | **-2.34** | -2.3 |  |  |  |  | 617 |
| crossing-check{"k":1,"q":4}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-2.34** | -2.3 |  |  |  |  | 617 |
| pell-gradient{"D":7,"k":0}/share-den | whole-area/gcd-den-m | neither | **-2.33** | -1.2 | -3.5 |  |  |  | 1368 |
| divisibility-ladder/m-spf | near-point/lattice | one | **-2.33** | -2.3 |  |  |  |  | 522 |
| crossing-check{"k":2,"q":4}/size | whole-crossing/k-gpf | one | **-2.33** | -2.3 |  |  |  |  | 412 |
| crossing-check{"k":1,"q":2}/whole | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-2.33** | -2.7 | -2.0 |  |  |  | 551 |
| crossing-check{"k":2,"q":4}/whole | whole-crossing/k-gpf | one | **-2.32** | -2.3 |  |  |  |  | 410 |
| prime-slope/square-sum | whole-crossing/gcd-c | neither | **-2.32** | -2.3 | -2.3 |  |  |  | 349 |
| divisibility-ladder/m-spf | near-point/gcd-x | one | **-2.32** | -2.3 |  |  |  |  | 522 |
| m-meets-c/meetPrime | treasure{"T":-11,"k":2}/square-start | one | **-2.31** | -2.3 |  |  |  |  | 500 |
| whole-area/gcd-den-m | whole-intercept/gcd-floor-m | neither | **-2.31** | -1.5 | -3.1 |  |  |  | 1511 |
| prime-slope/square-sum | smooth-intercept/shared | neither | **-2.31** | -2.3 | -2.3 |  |  |  | 244 |
| crossing-check{"k":2,"q":6}/size | divisibility-ladder/m-gpf | one | **-2.31** | -2.3 |  |  |  |  | 504 |
| exact-change/big-bill | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.31** | -2.3 |  |  |  |  | 856 |
| prime-slope/square-sum | smooth-crossing/shared | neither | **-2.31** | -2.3 | -2.3 |  |  |  | 244 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":13,"k":2}/m-gpf | one | **-2.31** | -1.5 | -3.1 |  |  |  | 1122 |
| m-meets-c/meetPrime | treasure{"T":11,"k":2}/prime-terms | one | **-2.31** | -2.3 |  |  |  |  | 500 |
| m-meets-c/meetPrime | treasure{"T":11,"k":2}/m-spf | one | **-2.31** | -2.3 |  |  |  |  | 500 |
| m-meets-c/meetPrime | treasure{"T":11,"k":2}/m-gpf | one | **-2.31** | -2.3 |  |  |  |  | 500 |
| crossing-check{"k":1,"q":2}/size | prime-landing{"ends":7,"side":-1}/m-gpf | one | **-2.30** | -2.7 | -1.9 |  |  |  | 529 |
| pell-gradient{"D":7,"k":0}/pell-c | whole-area/gcd-den-m | neither | **-2.30** | -1.2 | -3.4 |  |  |  | 1355 |
| crossing-check{"k":2,"q":6}/whole | divisibility-ladder/m-gpf | one | **-2.30** | -2.3 |  |  |  |  | 504 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":13,"k":2}/prime-terms | one | **-2.30** | -1.5 | -3.1 |  |  |  | 1156 |
| m-meets-c/size | treasure{"T":11,"k":2}/prime-terms | one | **-2.30** | -2.3 |  |  |  |  | 500 |
| m-meets-c/size | treasure{"T":11,"k":2}/m-spf | one | **-2.30** | -2.3 |  |  |  |  | 500 |
| m-meets-c/size | treasure{"T":11,"k":2}/m-gpf | one | **-2.30** | -2.3 |  |  |  |  | 500 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1}/cPrime | one | **-2.30** | -3.0 | -1.6 |  |  |  | 395 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":13,"k":2}/prime-terms | one | **-2.29** | -2.7 | -1.9 |  |  |  | 581 |
| m-meets-c/meetPrime | treasure{"T":11,"k":2}/prime-gradient | one | **-2.29** | -2.3 |  |  |  |  | 500 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-13,"k":2}/m-gpf | one | **-2.28** | -1.8 | -2.8 |  |  |  | 934 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":13,"k":2}/square-start | both | **-2.28** | -2.8 | -1.8 |  |  |  | 570 |
| crossing-check{"k":3,"q":2}/size | treasure{"T":13,"k":2}/m-gpf | one | **-2.28** | -1.7 | -2.8 |  |  |  | 812 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-11,"k":2}/prime-terms | both | **-2.27** | -2.6 | -1.9 |  |  |  | 578 |
| m-meets-c/size | treasure{"T":11,"k":2}/prime-gradient | one | **-2.27** | -2.3 |  |  |  |  | 500 |
| prime-slope/matching-c | whole-at-t/gcd-den-m | neither | **-2.27** | -2.3 |  |  |  |  | 101 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":13,"k":2}/prime-terms | both | **-2.27** | -2.6 | -1.9 |  |  |  | 612 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-11,"k":2}/m-gpf | both | **-2.26** | -2.6 | -1.9 |  |  |  | 585 |
| farey-neighbours/mediant-x | same-on-both-rulers{"T":6}/whole-lamp | one | **-2.26** | -2.8 | -1.7 |  |  |  | 334 |
| steep-and-tall/shared | whole-area/gcd-den-m | neither | **-2.26** | -1.6 | -2.9 |  |  |  | 1153 |
| crossing-check{"k":2,"q":4}/size | same-on-both-rulers{"T":-6}/m-spf | one | **-2.26** | -2.3 |  |  |  |  | 804 |
| crossing-check{"k":2,"q":4}/size | same-on-both-rulers{"T":-6}/steep | one | **-2.26** | -2.3 |  |  |  |  | 803 |
| crossing-check{"k":2,"q":4}/size | same-on-both-rulers{"T":-6}/whole-values | one | **-2.26** | -2.3 |  |  |  |  | 803 |
| near-point/lattice | whole-intercept/gcd-floor-m | neither | **-2.26** | -2.3 |  |  |  |  | 545 |
| crossing-check{"k":1,"q":4}/whole | divisibility-ladder/m-spf | one | **-2.26** | -2.3 |  |  |  |  | 507 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-11,"k":2}/m-spf | both | **-2.25** | -2.6 | -1.9 |  |  |  | 585 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-2.25** | -2.6 | -1.9 |  |  |  | 606 |
| exact-change/big-bill | treasure{"T":-11,"k":2}/square-start | one | **-2.25** | -2.3 |  |  |  |  | 852 |
| farey-neighbours/mediant-x | prime-slope/square-sum | neither | **-2.25** | -2.3 |  |  |  |  | 114 |
| crossing-check{"k":2,"q":4}/whole | same-on-both-rulers{"T":-6}/m-spf | one | **-2.25** | -2.2 |  |  |  |  | 804 |
| m-meets-c/meetPrime | treasure{"T":11,"k":2}/square-start | one | **-2.25** | -2.2 |  |  |  |  | 530 |
| crossing-check{"k":2,"q":4}/whole | same-on-both-rulers{"T":-6}/steep | one | **-2.25** | -2.2 |  |  |  |  | 803 |
| crossing-check{"k":2,"q":4}/whole | same-on-both-rulers{"T":-6}/whole-values | one | **-2.25** | -2.2 |  |  |  |  | 803 |
| smooth-intercept/shared | whole-intercept/spf | neither | **-2.25** | -2.2 |  |  |  |  | 388 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":13,"k":2}/square-start | one | **-2.25** | -1.5 | -3.0 |  |  |  | 1122 |
| pell-gradient{"D":3,"k":0}/share-den | whole-crossing/gcd-c | neither | **-2.24** | -0.9 | -2.2 | -3.6 |  |  | 1712 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":11,"k":2}/prime-terms | one | **-2.24** | -1.9 | -2.6 |  |  |  | 892 |
| crossing-check{"k":2,"q":6}/size | divisibility-ladder/m-prime | one | **-2.24** | -2.2 |  |  |  |  | 495 |
| near-point/gcd-x | whole-intercept/gcd-floor-m | neither | **-2.24** | -2.2 |  |  |  |  | 545 |
| pell-gradient{"D":3,"k":0}/difference | whole-crossing/gcd-c | neither | **-2.24** | -0.9 | -2.2 | -3.6 |  |  | 1712 |
| target-gradient/same-den | treasure{"T":-13,"k":2}/m-gpf | one | **-2.24** | -2.1 | -2.3 |  |  |  | 751 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":-11,"k":2}/prime-terms | both | **-2.24** | -1.1 | -3.4 |  |  |  | 1581 |
| exact-change/big-bill | treasure{"T":-11,"k":2}/m-spf | one | **-2.24** | -2.2 |  |  |  |  | 852 |
| exact-change/big-bill | treasure{"T":-11,"k":2}/m-gpf | one | **-2.24** | -2.2 |  |  |  |  | 852 |
| smooth-crossing/shared | whole-intercept/spf | neither | **-2.24** | -2.2 |  |  |  |  | 389 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.24** | -1.8 | -2.7 |  |  |  | 934 |
| m-meets-c/size | treasure{"T":11,"k":2}/square-start | one | **-2.24** | -2.2 |  |  |  |  | 530 |
| crossing-check{"k":2,"q":4}/size | same-on-both-rulers{"T":-6}/m-gpf | one | **-2.24** | -2.2 |  |  |  |  | 830 |
| crossing-check{"k":2,"q":6}/whole | divisibility-ladder/m-prime | one | **-2.23** | -2.2 |  |  |  |  | 495 |
| exact-change/big-bill | treasure{"T":-13,"k":2}/prime-terms | one | **-2.23** | -2.2 |  |  |  |  | 896 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":13,"k":2}/m-spf | one | **-2.23** | -1.5 | -2.9 |  |  |  | 1122 |
| exact-change/big-bill | treasure{"T":-11,"k":2}/prime-terms | one | **-2.23** | -2.2 |  |  |  |  | 862 |
| divisibility-ladder/m-spf | farey-neighbours/mediant-x | one | **-2.23** | -2.2 |  |  |  |  | 533 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":13,"k":2}/prime-gradient | both | **-2.22** | -2.7 | -1.7 |  |  |  | 588 |
| crossing-check{"k":2,"q":4}/whole | same-on-both-rulers{"T":-6}/m-gpf | one | **-2.22** | -2.2 |  |  |  |  | 830 |
| crossing-check{"k":2,"q":4}/size | same-on-both-rulers{"T":-6}/prime-start | one | **-2.22** | -2.2 |  |  |  |  | 829 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":11,"k":2}/m-gpf | one | **-2.22** | -1.8 | -2.6 |  |  |  | 922 |
| exact-change/big-bill | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.22** | -2.2 |  |  |  |  | 852 |
| crossing-check{"k":1,"q":2}/size | whole-crossing/gcd-num-m | neither | **-2.22** | -2.1 | -2.4 |  |  |  | 462 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":11,"k":2}/m-spf | one | **-2.21** | -1.8 | -2.6 |  |  |  | 922 |
| crossing-check{"k":2,"q":4}/whole | same-on-both-rulers{"T":-6}/prime-start | one | **-2.21** | -2.2 |  |  |  |  | 829 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":13,"k":2}/m-gpf | both | **-2.20** | -2.5 | -1.9 |  |  |  | 655 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-11,"k":2}/square-start | both | **-2.20** | -2.7 | -1.7 |  |  |  | 572 |
| crossing-check{"k":3,"q":2}/size | treasure{"T":13,"k":2}/m-spf | one | **-2.20** | -1.7 | -2.7 |  |  |  | 802 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-13,"k":2}/m-spf | one | **-2.20** | -1.8 | -2.6 |  |  |  | 934 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-crossing/k-gpf | one | **-2.20** | -2.7 | -1.7 |  |  |  | 756 |
| pell-gradient{"D":6,"k":0}/share-den | whole-at-t/gcd-c | neither | **-2.20** | -2.2 |  |  |  |  | 429 |
| pell-gradient{"D":6,"k":0}/difference | whole-at-t/gcd-c | neither | **-2.20** | -2.2 |  |  |  |  | 429 |
| target-gradient/same-den | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.19** | -2.1 | -2.3 |  |  |  | 751 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":11,"k":2}/prime-terms | both | **-2.19** | -2.7 | -1.7 |  |  |  | 569 |
| pell-gradient{"D":6,"k":0}/difference | ruler/far | one | **-2.19** | -0.3 | -4.1 |  |  |  | 1449 |
| euclid-steps/largest-quotient | steep-and-tall/shared | neither | **-2.19** | -1.0 | -2.4 | -3.1 |  |  | 2529 |
| prime-landing{"ends":7}/prime-gradient | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.19** | -2.6 | -1.7 |  |  |  | 572 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":6}/prime-start | one | **-2.19** | -0.7 | -3.6 |  |  |  | 1933 |
| target-gradient/same-den | treasure{"T":-13,"k":2}/prime-terms | one | **-2.19** | -2.1 | -2.2 |  |  |  | 751 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":-11,"k":2}/prime-terms | both | **-2.18** | -1.1 | -3.2 |  |  |  | 1596 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":13,"k":2}/m-spf | one | **-2.18** | -2.6 | -1.7 |  |  |  | 595 |
| exact-change/big-bill | treasure{"T":-13,"k":2}/m-spf | one | **-2.18** | -2.2 |  |  |  |  | 917 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/prime-start | both | **-2.18** | -1.4 | -3.0 |  |  |  | 2192 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":11,"k":2}/m-gpf | both | **-2.18** | -2.7 | -1.7 |  |  |  | 578 |
| crossing-check{"k":3,"q":2}/whole | whole-at-t/gcd-den-m | neither | **-2.18** | -2.2 |  |  |  |  | 67 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":13,"k":2}/m-spf | both | **-2.18** | -2.6 | -1.7 |  |  |  | 615 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":6}/whole-values | one | **-2.17** | -0.8 | -3.6 |  |  |  | 1878 |
| crossing-check{"k":3,"q":4}/size | treasure{"T":13,"k":2}/m-gpf | one | **-2.17** | -1.7 | -2.7 |  |  |  | 745 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/whole-lamp | both | **-2.17** | -1.4 | -2.9 |  |  |  | 2136 |
| crossing-check{"k":1,"q":4}/size | whole-crossing/gcd-num-m | neither | **-2.17** | -1.7 | -2.6 |  |  |  | 557 |
| euclid-steps/largest-quotient | prime-staircase{"ends":3}/last-prime | one | **-2.17** | -2.2 |  |  |  |  | 182 |
| euclid-steps/largest-quotient | prime-staircase{"ends":3}/first-prime | one | **-2.17** | -2.2 |  |  |  |  | 182 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/steep | both | **-2.17** | -1.4 | -2.9 |  |  |  | 2143 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/whole-values | both | **-2.17** | -1.4 | -2.9 |  |  |  | 2143 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":11,"k":2}/m-spf | both | **-2.17** | -2.7 | -1.7 |  |  |  | 578 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":11,"k":2}/square-start | one | **-2.17** | -1.9 | -2.4 |  |  |  | 892 |
| target-gradient/same-den | treasure{"T":-13,"k":2}/square-start | one | **-2.17** | -2.1 | -2.2 |  |  |  | 751 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":6}/steep | one | **-2.17** | -0.8 | -3.6 |  |  |  | 1877 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":-11,"k":2}/square-start | both | **-2.16** | -1.1 | -3.2 |  |  |  | 1572 |
| crossing-check{"k":2,"q":4}/size | whole-area/gcd-x | neither | **-2.16** | -2.2 |  |  |  |  | 612 |
| target-gradient/same-den | treasure{"T":-13,"k":2}/m-spf | one | **-2.16** | -2.1 | -2.2 |  |  |  | 751 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1,"side":-1}/c-spf | one | **-2.16** | -3.3 | -1.0 |  |  |  | 317 |
| crossing-check{"k":1,"q":2}/whole | whole-crossing/gcd-num-m | neither | **-2.16** | -1.9 | -2.5 |  |  |  | 530 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-2.15** | -1.9 | -2.4 |  |  |  | 904 |
| crossing-check{"k":1,"q":6}/size | treasure{"T":11,"k":2}/prime-gradient | one | **-2.15** | -1.9 | -2.4 |  |  |  | 889 |
| prime-gradient{"ends":1,"side":-1}/cPrime | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.15** | -1.1 | -3.2 |  |  |  | 1572 |
| crossing-check{"k":2,"q":4}/whole | whole-area/gcd-x | neither | **-2.15** | -2.1 |  |  |  |  | 612 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-13,"k":2}/square-start | one | **-2.15** | -1.6 | -2.7 |  |  |  | 1030 |
| near-point/lattice | steady-gradient/gcd-c | neither | **-2.14** | -2.1 |  |  |  |  | 596 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":13,"k":2}/prime-gradient | one | **-2.14** | -1.5 | -2.8 |  |  |  | 1122 |
| prime-gradient{"ends":1}/cPrime | same-on-both-rulers{"T":6}/prime-start | both | **-2.14** | -1.3 | -3.0 |  |  |  | 2288 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":13,"k":2}/square-start | both | **-2.13** | -2.5 | -1.8 |  |  |  | 622 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":6}/prime-start | one | **-2.13** | -0.7 | -3.6 |  |  |  | 1913 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":11,"k":2}/m-gpf | one | **-2.13** | -1.9 | -2.4 |  |  |  | 934 |
| target-gradient/gcd-tops | treasure{"T":-13,"k":2}/m-gpf | one | **-2.13** | -2.1 | -2.1 |  |  |  | 748 |
| near-point/gcd-x | steady-gradient/gcd-c | neither | **-2.13** | -2.1 |  |  |  |  | 594 |
| crossing-check{"k":3,"q":6}/size | divisibility-ladder/steep | one | **-2.12** | -2.1 | -2.2 |  |  |  | 616 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":13,"k":2}/prime-terms | both | **-2.12** | -2.4 | -1.9 |  |  |  | 664 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":6}/whole-values | one | **-2.12** | -0.7 | -3.5 |  |  |  | 1866 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":11,"k":2}/square-start | both | **-2.12** | -2.7 | -1.5 |  |  |  | 562 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":11,"k":2}/m-spf | one | **-2.12** | -1.9 | -2.4 |  |  |  | 934 |
| crossing-check{"k":1,"q":4}/whole | whole-crossing/gcd-num-m | neither | **-2.12** | -1.8 | -2.5 |  |  |  | 491 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-11,"k":2}/prime-terms | both | **-2.11** | -2.3 | -1.9 |  |  |  | 640 |
| prime-landing{"ends":7}/next-prime | treasure{"T":-11,"k":2}/prime-terms | both | **-2.11** | -2.5 | -1.8 |  |  |  | 637 |
| crossing-check{"k":1,"q":2}/size | same-on-both-rulers{"T":6}/steep | one | **-2.11** | -0.7 | -3.5 |  |  |  | 1865 |
| prime-gradient{"ends":1}/cPrime | same-on-both-rulers{"T":6}/whole-lamp | both | **-2.11** | -1.3 | -2.9 |  |  |  | 2218 |
| crossing-check{"k":3,"q":6}/whole | divisibility-ladder/steep | one | **-2.11** | -2.1 | -2.1 |  |  |  | 616 |
| m-meets-c/size | whole-intercept/spf | neither | **-2.11** | -2.7 | -1.5 |  |  |  | 249 |
| prime-gradient{"ends":1}/cPrime | same-on-both-rulers{"T":6}/steep | both | **-2.11** | -1.3 | -2.9 |  |  |  | 2224 |
| prime-gradient{"ends":1}/c-spf | smooth-crossing/shared | one | **-2.11** | -2.2 | -2.0 |  |  |  | 986 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":-11,"k":2}/square-start | both | **-2.11** | -1.1 | -3.1 |  |  |  | 1587 |
| crossing-check{"k":2,"q":6}/size | divisibility-ladder/m-spf | one | **-2.11** | -2.1 |  |  |  |  | 634 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | treasure{"T":11,"k":2}/prime-gradient | both | **-2.11** | -2.7 | -1.5 |  |  |  | 562 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-11,"k":2}/m-gpf | one | **-2.10** | -1.6 | -2.6 |  |  |  | 1043 |
| prime-gradient{"ends":1}/cPrime | same-on-both-rulers{"T":6}/whole-values | both | **-2.10** | -1.3 | -2.9 |  |  |  | 2224 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-11,"k":2}/m-gpf | both | **-2.10** | -2.3 | -1.9 |  |  |  | 648 |
| sunken-intercept/shared | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.10** | -2.1 |  |  |  |  | 992 |
| crossing-check{"k":1,"q":6}/size | whole-crossing/k-gpf | one | **-2.10** | -1.9 | -2.4 |  |  |  | 488 |
| prime-landing{"ends":7}/next-prime | treasure{"T":-11,"k":2}/m-gpf | both | **-2.10** | -2.4 | -1.8 |  |  |  | 644 |
| crossing-check{"k":2,"q":2}/whole | treasure{"T":13,"k":2}/square-start | one | **-2.10** | -2.1 |  |  |  |  | 617 |
| crossing-check{"k":3,"q":6}/size | same-on-both-rulers{"T":-6}/whole-values | one | **-2.10** | -1.5 | -2.7 |  |  |  | 1212 |
| crossing-check{"k":1,"q":4}/size | same-on-both-rulers{"T":-6}/steep | one | **-2.10** | -1.7 | -2.5 |  |  |  | 1010 |
| crossing-check{"k":3,"q":2}/whole | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.10** | -2.2 | -2.0 |  |  |  | 410 |
| crossing-check{"k":2,"q":2}/whole | treasure{"T":13,"k":2}/m-gpf | one | **-2.10** | -2.1 |  |  |  |  | 617 |
| crossing-check{"k":1,"q":4}/size | same-on-both-rulers{"T":-6}/whole-values | one | **-2.10** | -1.7 | -2.5 |  |  |  | 1010 |
| prime-gradient{"ends":1}/c-spf | smooth-intercept/shared | one | **-2.10** | -2.1 | -2.0 |  |  |  | 1058 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-11,"k":2}/m-spf | one | **-2.09** | -1.6 | -2.6 |  |  |  | 1043 |
| prime-gradient{"ends":1,"side":-1}/c-spf | smooth-crossing/shared | one | **-2.09** | -2.3 | -1.9 |  |  |  | 953 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-11,"k":2}/m-spf | both | **-2.09** | -2.3 | -1.9 |  |  |  | 648 |
| prime-landing{"ends":7}/next-prime | treasure{"T":-11,"k":2}/m-spf | both | **-2.09** | -2.4 | -1.7 |  |  |  | 644 |
| sunken-intercept/shared | treasure{"T":-13,"k":2}/square-start | one | **-2.09** | -2.1 |  |  |  |  | 1017 |
| crossing-check{"k":2,"q":6}/whole | divisibility-ladder/m-spf | one | **-2.09** | -2.1 |  |  |  |  | 634 |
| whole-at-t/gcd-c | whole-crossing/gcd-c | neither | **-2.09** | -0.1 | -0.6 | -2.6 | -5.1 |  | 4366 |
| crossing-check{"k":3,"q":4}/size | treasure{"T":13,"k":2}/m-spf | one | **-2.09** | -1.7 | -2.5 |  |  |  | 745 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":11,"k":2}/prime-terms | one | **-2.09** | -2.0 | -2.1 |  |  |  | 834 |
| prime-gradient{"ends":1,"side":-1}/prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.09** | -1.1 | -3.1 |  |  |  | 1586 |
| long-division/m-top | treasure{"T":-13,"k":2}/prime-terms | one | **-2.09** | -1.3 | -2.9 |  |  |  | 2038 |
| crossing-check{"k":1,"q":6}/whole | divisibility-ladder/m-spf | one | **-2.09** | -2.1 |  |  |  |  | 654 |
| ruler/square-area | steady-gradient/divisors | one | **-2.09** | -2.1 |  |  |  |  | 1955 |
| ruler/far | steady-gradient/divisors | one | **-2.09** | -2.1 |  |  |  |  | 1955 |
| ruler/prime-gradient | steady-gradient/divisors | one | **-2.09** | -2.1 |  |  |  |  | 1953 |
| pell-gradient{"D":6,"k":0}/pell-c | whole-area/gcd-den-m | neither | **-2.08** | -1.2 | -3.0 |  |  |  | 1355 |
| crossing-check{"k":3,"q":4}/whole | m-meets-c/meetPrime | neither | **-2.08** | -1.8 | -2.3 |  |  |  | 409 |
| long-division/m-top | treasure{"T":-13,"k":2}/m-gpf | one | **-2.08** | -1.3 | -2.9 |  |  |  | 2038 |
| target-gradient/gcd-tops | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.08** | -2.1 | -2.1 |  |  |  | 748 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":13,"k":2}/prime-gradient | both | **-2.08** | -2.4 | -1.7 |  |  |  | 640 |
| crossing-check{"k":2,"q":2}/whole | treasure{"T":13,"k":2}/prime-gradient | one | **-2.08** | -2.1 |  |  |  |  | 617 |
| crossing-check{"k":2,"q":2}/whole | treasure{"T":13,"k":2}/m-spf | one | **-2.08** | -2.1 |  |  |  |  | 617 |
| crossing-check{"k":3,"q":6}/size | same-on-both-rulers{"T":-6}/prime-start | one | **-2.08** | -1.5 | -2.7 |  |  |  | 1239 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":11,"k":2}/square-start | one | **-2.08** | -1.9 | -2.2 |  |  |  | 904 |
| prime-gradient{"ends":1,"side":-1}/c-spf | smooth-intercept/shared | one | **-2.08** | -2.2 | -1.9 |  |  |  | 1040 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":13,"k":2}/prime-gradient | one | **-2.08** | -2.7 | -1.4 |  |  |  | 554 |
| crossing-check{"k":3,"q":6}/whole | same-on-both-rulers{"T":-6}/whole-values | one | **-2.08** | -1.5 | -2.7 |  |  |  | 1235 |
| crossing-check{"k":2,"q":4}/size | divisibility-ladder/steep | one | **-2.08** | -2.1 | -2.0 |  |  |  | 580 |
| divisibility-ladder/steep | treasure{"T":-11,"k":2}/m-spf | both | **-2.07** | -1.1 | -3.0 |  |  |  | 1134 |
| farey-neighbours/mediant-x | pythagorean-area/prime-height | one | **-2.07** | -1.7 | -2.5 |  |  |  | 937 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-13,"k":2}/prime-terms | one | **-2.07** | -1.5 | -2.6 |  |  |  | 1062 |
| farey-neighbours/mediant-x | pythagorean-area/whole-legs | one | **-2.07** | -1.7 | -2.5 |  |  |  | 951 |
| farey-neighbours/mediant-x | pythagorean-area/slanted-square | one | **-2.07** | -1.7 | -2.4 |  |  |  | 951 |
| crossing-check{"k":1,"q":4}/whole | m-meets-c/meetPrime | neither | **-2.06** | -2.0 | -2.2 |  |  |  | 686 |
| crossing-check{"k":1,"q":6}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-2.06** | -1.9 | -2.2 |  |  |  | 901 |
| divisibility-ladder/steep | treasure{"T":11,"k":2}/m-spf | both | **-2.06** | -1.2 | -2.9 |  |  |  | 1114 |
| farey-neighbours/mediant-x | triangle-area{"A":6}/even | neither | **-2.06** | -1.7 | -2.4 |  |  |  | 938 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":13,"k":2}/m-gpf | both | **-2.06** | -2.3 | -1.9 |  |  |  | 707 |
| crossing-check{"k":2,"q":4}/whole | divisibility-ladder/steep | one | **-2.06** | -2.1 | -2.0 |  |  |  | 580 |
| crossing-check{"k":1,"q":6}/size | divisibility-ladder/m-spf | one | **-2.06** | -2.1 |  |  |  |  | 650 |
| crossing-check{"k":3,"q":6}/whole | same-on-both-rulers{"T":-6}/prime-start | one | **-2.05** | -1.5 | -2.6 |  |  |  | 1263 |
| target-gradient/gcd-tops | treasure{"T":-13,"k":2}/square-start | one | **-2.05** | -2.1 | -2.0 |  |  |  | 748 |
| farey-neighbours/mediant-x | prime-gradient{"ends":1,"side":-1}/c-gpf | one | **-2.05** | -3.1 | -1.0 |  |  |  | 374 |
| crossing-check{"k":3,"q":6}/size | same-on-both-rulers{"T":-6}/steep | one | **-2.05** | -1.5 | -2.6 |  |  |  | 1212 |
| farey-neighbours/mediant-x | triangle-area{"A":6}/legs | neither | **-2.05** | -1.7 | -2.4 |  |  |  | 937 |
| crossing-check{"k":2,"q":4}/size | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.05** | -2.0 | -2.1 |  |  |  | 903 |
| sunken-intercept/shared | treasure{"T":-13,"k":2}/prime-terms | one | **-2.05** | -2.0 |  |  |  |  | 1036 |
| crossing-check{"k":1,"q":4}/size | same-on-both-rulers{"T":-6}/whole-lamp | one | **-2.05** | -1.7 | -2.4 |  |  |  | 1004 |
| whole-at-t/gcd-c | whole-intercept/gcd-den-m | neither | **-2.05** | -2.0 |  |  |  |  | 1268 |
| prime-gradient{"ends":1}/cPrime | treasure{"T":11,"k":2}/prime-terms | both | **-2.04** | -1.1 | -3.0 |  |  |  | 1627 |
| target-gradient/gcd-tops | treasure{"T":-13,"k":2}/m-spf | one | **-2.04** | -2.1 | -2.0 |  |  |  | 748 |
| crossing-check{"k":1,"q":4}/size | same-on-both-rulers{"T":-6}/prime-start | one | **-2.04** | -1.7 | -2.4 |  |  |  | 1032 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":11,"k":2}/prime-terms | both | **-2.04** | -2.4 | -1.7 |  |  |  | 625 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-11,"k":2}/square-start | both | **-2.04** | -2.3 | -1.7 |  |  |  | 634 |
| long-division/c-period | whole-area/gcd-x | neither | **-2.04** | -2.0 |  |  |  |  | 1228 |
| prime-landing{"ends":7}/next-prime | treasure{"T":-11,"k":2}/square-start | both | **-2.04** | -2.5 | -1.6 |  |  |  | 630 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":11,"k":2}/prime-terms | one | **-2.04** | -2.0 | -2.0 |  |  |  | 821 |
| prime-landing{"ends":7,"side":-1}/next-prime | treasure{"T":13,"k":2}/square-start | both | **-2.04** | -2.5 | -1.6 |  |  |  | 677 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-13,"k":2}/square-start | both | **-2.04** | -2.5 | -1.6 |  |  |  | 617 |
| crossing-check{"k":1,"q":4}/size | whole-intercept/gcd-floor-m | neither | **-2.04** | -1.3 | -2.7 |  |  |  | 1088 |
| long-division/m-top | treasure{"T":-13,"k":2}/prime-gradient | one | **-2.03** | -1.3 | -2.8 |  |  |  | 2038 |
| prime-landing{"ends":7,"side":-1}/next-prime | treasure{"T":13,"k":2}/prime-terms | both | **-2.03** | -2.3 | -1.7 |  |  |  | 726 |
| crossing-check{"k":3,"q":6}/size | treasure{"T":13,"k":2}/square-start | one | **-2.03** | -2.7 | -1.3 |  |  |  | 557 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":6}/m-spf | one | **-2.03** | -0.8 | -3.3 |  |  |  | 1882 |
| sunken-intercept/shared | triangle-area{"A":18}/even | neither | **-2.03** | -0.2 | -3.9 |  |  |  | 5500 |
| crossing-check{"k":2,"q":4}/whole | prime-landing{"ends":7,"side":-1}/prime-gradient | one | **-2.03** | -2.0 | -2.1 |  |  |  | 903 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":13,"k":2}/m-spf | both | **-2.03** | -2.3 | -1.7 |  |  |  | 667 |
| crossing-check{"k":3,"q":6}/whole | same-on-both-rulers{"T":-6}/steep | one | **-2.03** | -1.5 | -2.6 |  |  |  | 1235 |
| crossing-check{"k":1,"q":2}/whole | same-on-both-rulers{"T":6}/m-gpf | one | **-2.03** | -0.7 | -3.3 |  |  |  | 1938 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-11,"k":2}/square-start | one | **-2.03** | -1.6 | -2.5 |  |  |  | 1050 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.02** | -2.3 | -1.7 |  |  |  | 634 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":11,"k":2}/m-gpf | both | **-2.02** | -2.4 | -1.7 |  |  |  | 634 |
| crossing-check{"k":3,"q":2}/size | treasure{"T":13,"k":2}/prime-terms | one | **-2.02** | -1.2 | -2.9 |  |  |  | 1099 |
| crossing-check{"k":1,"q":6}/whole | whole-crossing/k-gpf | one | **-2.02** | -1.9 | -2.2 |  |  |  | 488 |
| prime-landing{"ends":7}/next-prime | treasure{"T":-11,"k":2}/prime-gradient | both | **-2.02** | -2.5 | -1.6 |  |  |  | 630 |
| sunken-intercept/shared | triangle-area{"A":18}/legs | neither | **-2.02** | -0.2 | -3.9 |  |  |  | 5428 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/m-spf | both | **-2.02** | -1.4 | -2.6 |  |  |  | 2162 |
| prime-landing{"ends":7}/big-prime | treasure{"T":-13,"k":2}/prime-terms | both | **-2.02** | -2.4 | -1.7 |  |  |  | 661 |
| prime-landing{"ends":7,"side":-1}/big-prime | treasure{"T":11,"k":2}/m-spf | both | **-2.02** | -2.4 | -1.7 |  |  |  | 634 |
| prime-landing{"ends":7,"side":-1}/next-prime | treasure{"T":11,"k":2}/prime-terms | both | **-2.02** | -2.5 | -1.5 |  |  |  | 632 |
| near-point/lattice | whole-area/gcd-x | neither | **-2.02** | -2.0 |  |  |  |  | 694 |
| crossing-check{"k":3,"q":2}/size | treasure{"T":11,"k":2}/prime-terms | one | **-2.01** | -1.3 | -2.7 |  |  |  | 1059 |
| crossing-check{"k":3,"q":6}/size | divisibility-ladder/m-gpf | one | **-2.01** | -1.9 | -2.1 |  |  |  | 620 |
| near-point/gcd-x | whole-area/gcd-x | neither | **-2.01** | -2.0 |  |  |  |  | 684 |
| long-division/m-top | treasure{"T":-13,"k":2}/square-start | one | **-2.01** | -1.3 | -2.8 |  |  |  | 2097 |
| pell-gradient{"D":1,"k":1}/pell-c | treasure{"T":-11,"k":2}/prime-gradient | one | **-2.01** | -1.5 | -2.5 |  |  |  | 1043 |
| prime-gradient{"ends":1,"side":-1}/cPrime | same-on-both-rulers{"T":6}/m-gpf | both | **-2.01** | -1.4 | -2.6 |  |  |  | 2230 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":11,"k":2}/square-start | one | **-2.01** | -2.0 | -2.0 |  |  |  | 839 |
| crossing-check{"k":3,"q":6}/whole | treasure{"T":11,"k":2}/prime-gradient | one | **-2.01** | -2.0 | -2.0 |  |  |  | 821 |
| prime-landing{"ends":7,"side":-1}/next-prime | treasure{"T":11,"k":2}/m-gpf | both | **-2.01** | -2.5 | -1.5 |  |  |  | 642 |
| triangle-area{"A":8}/even | whole-area/gcd-x | neither | **-2.00** | -2.0 |  |  |  |  | 683 |
| crossing-check{"k":3,"q":6}/whole | divisibility-ladder/m-gpf | one | **-2.00** | -1.9 | -2.1 |  |  |  | 623 |

### Two tie-breakers of one family (aligned through the shared primary; never seat a family twice)

| Family | pairs | mean headline | min | max |
|---|---:|---:|---:|---:|
| crossing-check | 153 | -0.15 | -6.63 | 7.38 |
| divisibility-ladder | 6 | 7.79 | 7.58 | 7.99 |
| exact-change | 3 | 7.30 | 6.84 | 7.79 |
| farey-neighbours | 1 | 3.21 | 3.21 | 3.21 |
| long-division | 3 | 4.33 | 4.31 | 4.36 |
| m-meets-c | 1 | 5.30 | 5.30 | 5.30 |
| near-point | 1 | 6.00 | 6.00 | 6.00 |
| pell-gradient | 153 | -1.06 | -8.52 | 9.99 |
| prime-gradient | 28 | -0.85 | -6.62 | 7.92 |
| prime-landing | 45 | 2.82 | -0.25 | 7.94 |
| prime-slope | 2 | 3.50 | 3.45 | 3.56 |
| prime-staircase | 24 | 5.48 | 1.17 | 9.79 |
| pythagorean-area | 3 | 6.01 | 5.97 | 6.04 |
| ruler | 3 | 6.02 | 5.25 | 7.39 |
| same-on-both-rulers | 66 | -0.67 | -6.63 | 8.87 |
| square-area | 3 | 5.46 | 3.87 | 7.32 |
| steady-gradient | 1 | 4.64 | 4.64 | 4.64 |
| target-gradient | 1 | 6.05 | 6.05 | 6.05 |
| treasure | 190 | 3.99 | 3.02 | 8.36 |
| triangle-area | 45 | 1.34 | -6.66 | 6.09 |
| whole-area | 1 | 4.75 | 4.75 | 4.75 |
| whole-at-t | 1 | -0.06 | -0.06 | -0.06 |
| whole-crossing | 10 | 2.11 | -0.95 | 6.97 |
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
| divisibility-ladder/m-gpf | yes | 4.2 | 6.1 | 8.2 | 10.2 | 12.1 | 52045 | 776 |
| divisibility-ladder/m-prime | yes | 4.3 | 6.3 | 8.0 | 10.0 | 12.0 | 47863 | 708 |
| divisibility-ladder/m-spf | yes | 4.1 | 6.7 | 8.2 | 10.4 | 11.9 | 54263 | 801 |
| divisibility-ladder/steep | yes | 4.0 | 6.0 | 8.2 | 10.1 | 12.1 | 60287 | 777 |
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
| prime-gradient{"ends":1,"side":-1}/c-gpf | yes | 4.0 | 6.1 | 8.2 | 10.8 | 12.3 | 61258 | 292 |
| prime-gradient{"ends":1}/c-gpf | yes | 4.0 | 6.1 | 8.2 | 10.9 | 12.4 | 61417 | 266 |
| prime-gradient{"ends":1,"side":-1}/c-spf | yes | 4.1 | 6.1 | 8.2 | 9.8 | 12.3 | 58509 | 206 |
| prime-gradient{"ends":1}/c-spf | yes | 4.1 | 6.1 | 8.2 | 9.9 | 12.4 | 58622 | 195 |
| prime-gradient{"ends":1,"side":-1}/cPrime | yes | 4.0 | 6.1 | 8.0 | 10.1 | 12.0 | 61595 | 282 |
| prime-gradient{"ends":1}/cPrime | yes | 4.0 | 6.2 | 8.1 | 10.1 | 12.1 | 61799 | 271 |
| prime-gradient{"ends":1,"side":-1}/prime | yes | 4.0 | 6.2 | 8.0 | 19.1 | 19.1 | 62600 | 11 |
| prime-gradient{"ends":1}/prime | yes | 4.0 | 6.3 | 8.1 | 19.7 | 19.7 | 62874 | 8 |
| prime-landing{"ends":7,"side":-1}/big-prime | yes | 4.2 | 6.0 | 13.0 | 13.0 | 13.0 | 51398 | 195 |
| prime-landing{"ends":7}/big-prime | yes | 4.2 | 6.0 | 12.9 | 12.9 | 12.9 | 51389 | 195 |
| prime-landing{"ends":7,"side":-1}/m-gpf | yes | 4.1 | 6.1 | 8.9 | 10.3 | 13.3 | 53121 | 182 |
| prime-landing{"ends":7}/m-gpf | yes | 4.1 | 6.1 | 8.8 | 10.2 | 13.2 | 53175 | 190 |
| prime-landing{"ends":7,"side":-1}/m-spf | yes | 4.1 | 6.1 | 8.9 | 10.3 | 13.1 | 53121 | 109 |
| prime-landing{"ends":7}/m-spf | yes | 4.1 | 6.1 | 8.8 | 10.3 | 13.3 | 53175 | 92 |
| prime-landing{"ends":7,"side":-1}/next-prime | yes | 4.0 | 6.2 | 8.1 | 10.4 |  | 54783 | 0 |
| prime-landing{"ends":7}/next-prime | yes | 4.0 | 6.2 | 8.0 | 10.3 |  | 54880 | 0 |
| prime-landing{"ends":7,"side":-1}/prime-gradient | yes | 4.0 | 6.0 | 8.0 | 10.2 | 14.1 | 55057 | 61 |
| prime-landing{"ends":7}/prime-gradient | yes | 4.0 | 6.0 | 8.0 | 10.2 | 14.1 | 55215 | 62 |
| prime-slope/matching-c |  | 4.2 |  |  |  |  | 39580 | 0 |
| prime-slope/square-sum |  | 6.5 | 6.5 |  |  |  | 9580 | 0 |
| prime-slope/twins |  | 5.9 |  |  |  |  | 13118 | 0 |
| prime-staircase{"ends":3,"side":-1}/first-prime | yes | 5.9 | 10.3 | 10.3 | 10.3 | 12.1 | 11576 | 177 |
| prime-staircase{"ends":3}/first-prime | yes | 5.9 | 10.3 | 10.3 | 10.3 | 12.0 | 11758 | 187 |
| prime-staircase{"ends":3,"side":-1}/last-prime | yes | 5.9 | 10.3 | 10.3 | 10.3 | 12.1 | 11576 | 177 |
| prime-staircase{"ends":3}/last-prime | yes | 5.9 | 10.3 | 10.3 | 10.3 | 12.0 | 11758 | 187 |
| prime-staircase{"ends":3,"side":-1}/near-miss | yes | 4.3 | 6.0 | 8.3 | 10.1 | 11.9 | 40389 | 207 |
| prime-staircase{"ends":3}/near-miss | yes | 4.3 | 6.0 | 8.3 | 10.1 | 11.8 | 40389 | 223 |
| prime-staircase{"ends":3,"side":-1}/step-back | yes | 4.0 | 6.0 | 8.1 | 11.8 | 12.1 | 42354 | 181 |
| prime-staircase{"ends":3}/step-back | yes | 4.0 | 6.0 | 8.1 | 11.8 | 12.0 | 42558 | 198 |
| pythagorean-area/prime-height | yes | 4.0 | 6.0 | 8.1 |  |  | 47047 | 0 |
| pythagorean-area/slanted-square | yes | 4.0 | 6.1 | 8.0 | 10.8 |  | 48407 | 0 |
| pythagorean-area/whole-legs | yes | 4.0 | 6.1 | 8.3 |  |  | 48283 | 0 |
| ruler/far | yes | 4.0 | 6.3 | 8.0 | 10.0 | 12.0 | 45683 | 705 |
| ruler/prime-gradient | yes | 4.0 | 8.5 | 8.5 | 10.5 |  | 45646 | 0 |
| ruler/square-area | yes | 4.0 | 8.5 | 8.5 | 10.5 |  | 45683 | 0 |
| same-on-both-rulers{"T":-6}/m-gpf | yes | 4.0 | 6.3 | 10.3 | 10.3 | 13.3 | 49107 | 95 |
| same-on-both-rulers{"T":6}/m-gpf | yes | 4.0 | 6.3 | 10.2 | 10.2 | 13.5 | 49099 | 82 |
| same-on-both-rulers{"T":-6}/m-spf | yes | 4.0 | 6.3 | 10.3 | 10.3 | 13.6 | 48103 | 74 |
| same-on-both-rulers{"T":6}/m-spf | yes | 4.0 | 6.3 | 10.2 | 10.2 | 13.7 | 48145 | 69 |
| same-on-both-rulers{"T":-6}/prime-start | yes | 4.0 | 6.0 | 8.0 | 10.0 |  | 48567 | 0 |
| same-on-both-rulers{"T":6}/prime-start | yes | 4.0 | 6.0 | 8.1 | 9.9 |  | 48608 | 0 |
| same-on-both-rulers{"T":-6}/steep | yes | 4.0 | 6.1 | 8.0 | 9.9 | 12.0 | 48015 | 235 |
| same-on-both-rulers{"T":6}/steep | yes | 4.0 | 6.1 | 8.0 | 10.0 | 12.0 | 48065 | 232 |
| same-on-both-rulers{"T":-6}/whole-lamp | yes | 4.0 | 6.0 | 8.2 |  |  | 47915 | 0 |
| same-on-both-rulers{"T":6}/whole-lamp | yes | 4.0 | 6.0 | 8.2 |  |  | 47956 | 0 |
| same-on-both-rulers{"T":-6}/whole-values | yes | 4.0 | 6.1 | 8.4 |  |  | 48003 | 0 |
| same-on-both-rulers{"T":6}/whole-values | yes | 4.0 | 6.1 | 8.4 |  |  | 48055 | 0 |
| smooth-crossing/shared |  | 4.6 | 6.3 | 8.2 | 10.1 | 12.0 | 37973 | 830 |
| smooth-gradient/shared |  | 5.1 | 7.0 | 9.0 | 11.0 | 13.0 | 35692 | 694 |
| smooth-intercept/shared |  | 4.6 | 6.3 | 8.2 | 10.1 | 12.0 | 38256 | 829 |
| smooth-square/shared |  | 4.0 | 6.4 | 8.1 | 10.1 | 12.0 | 54573 | 678 |
| square-area/lpf | yes | 4.0 | 6.4 | 9.2 | 10.6 | 12.4 | 52883 | 483 |
| square-area/omega | yes | 4.0 | 6.3 | 8.1 | 11.0 | 12.8 | 53135 | 478 |
| square-area/spf | yes | 4.0 | 6.5 | 9.5 | 11.3 | 12.8 | 52513 | 165 |
| steady-gradient/divisors |  | 4.0 | 6.0 | 8.0 | 10.0 | 12.5 | 79466 | 2251 |
| steady-gradient/gcd-c |  | 4.0 | 6.0 | 8.1 | 10.1 | 12.0 | 67325 | 1805 |
| steady-gradient/x-whole |  |  |  |  |  |  | 0 | 0 |
| steep-and-tall/shared |  | 4.1 | 6.1 | 8.0 | 10.0 | 12.0 | 60578 | 3033 |
| sunken-intercept/shared |  | 4.0 | 6.0 | 8.0 | 9.9 | 12.0 | 79259 | 2985 |
| target-gradient/gcd-tops |  | 4.1 | 6.5 | 8.0 | 11.0 |  | 42934 | 0 |
| target-gradient/same-den |  | 4.1 | 6.3 | 8.0 |  |  | 43626 | 0 |
| treasure{"T":-11,"k":2}/m-gpf | yes | 4.0 | 6.1 | 8.7 | 10.2 | 12.6 | 44790 | 115 |
| treasure{"T":-13,"k":2}/m-gpf | yes | 4.0 | 6.1 | 8.4 | 10.8 | 16.1 | 45669 | 16 |
| treasure{"T":11,"k":2}/m-gpf | yes | 4.0 | 6.1 | 8.7 | 10.3 | 12.8 | 45307 | 106 |
| treasure{"T":13,"k":2}/m-gpf | yes | 4.0 | 6.1 | 8.3 | 10.7 | 16.7 | 46110 | 10 |
| treasure{"T":-11,"k":2}/m-spf | yes | 4.0 | 6.1 | 8.7 | 10.3 | 12.7 | 44790 | 109 |
| treasure{"T":-13,"k":2}/m-spf | yes | 4.0 | 6.3 | 8.4 | 10.5 | 16.3 | 45148 | 14 |
| treasure{"T":11,"k":2}/m-spf | yes | 4.0 | 6.1 | 8.7 | 10.4 | 12.8 | 45307 | 99 |
| treasure{"T":13,"k":2}/m-spf | yes | 4.0 | 6.3 | 8.3 | 10.4 | 16.7 | 45588 | 10 |
| treasure{"T":-11,"k":2}/prime-gradient | yes | 4.1 | 6.2 | 8.1 |  |  | 44132 | 0 |
| treasure{"T":-13,"k":2}/prime-gradient | yes | 4.0 | 6.2 | 8.0 | 10.0 |  | 45048 | 0 |
| treasure{"T":11,"k":2}/prime-gradient | yes | 4.0 | 6.2 | 8.1 |  |  | 44685 | 0 |
| treasure{"T":13,"k":2}/prime-gradient | yes | 4.0 | 6.2 | 8.0 | 9.9 |  | 45532 | 0 |
| treasure{"T":-11,"k":2}/prime-terms | yes | 4.0 | 6.1 | 8.3 | 10.6 |  | 44781 | 0 |
| treasure{"T":-13,"k":2}/prime-terms | yes | 4.0 | 6.1 | 8.0 | 10.0 |  | 45718 | 0 |
| treasure{"T":11,"k":2}/prime-terms | yes | 4.0 | 6.1 | 8.2 | 10.6 |  | 45342 | 0 |
| treasure{"T":13,"k":2}/prime-terms | yes | 4.0 | 6.1 | 7.9 | 9.9 |  | 46156 | 0 |
| treasure{"T":-11,"k":2}/square-start | yes | 4.0 | 6.2 | 8.0 |  |  | 45128 | 0 |
| treasure{"T":-13,"k":2}/square-start | yes | 4.0 | 6.2 | 8.4 | 10.0 |  | 45749 | 0 |
| treasure{"T":11,"k":2}/square-start | yes | 4.0 | 6.2 | 8.0 |  |  | 45656 | 0 |
| treasure{"T":13,"k":2}/square-start | yes | 4.0 | 6.2 | 8.3 | 9.9 |  | 46217 | 0 |
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
| whole-crossing/gcd-c |  | 4.0 | 6.1 | 8.0 | 10.0 | 12.0 | 55501 | 1886 |
| whole-crossing/gcd-num-m |  | 4.9 | 6.1 | 8.3 | 10.4 | 12.2 | 33133 | 942 |
| whole-crossing/k-gpf | yes | 4.8 | 6.5 | 9.5 | 10.8 | 12.9 | 38606 | 538 |
| whole-crossing/k-spf | yes | 5.2 | 6.7 | 8.5 | 11.6 | 13.0 | 20655 | 211 |
| whole-crossing/m-spf | yes | 5.5 | 7.4 | 9.1 | 11.4 | 12.9 | 15360 | 119 |
| whole-intercept/gcd-den-m |  | 4.5 | 7.4 | 8.4 | 10.6 | 13.8 | 43682 | 263 |
| whole-intercept/gcd-floor-m |  | 4.0 | 6.0 | 8.1 | 10.1 | 12.0 | 67961 | 1808 |
| whole-intercept/mc-spf |  | 5.7 | 8.8 | 8.8 | 11.6 | 15.6 | 15915 | 38 |
| whole-intercept/omega |  | 4.8 | 6.7 | 8.6 | 10.6 | 12.6 | 49975 | 1242 |
| whole-intercept/spf |  | 4.8 | 6.2 | 8.1 | 11.2 | 12.6 | 30317 | 311 |

<!-- pmi:line-q end -->
