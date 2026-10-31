# The tail toolkit: computing rare-event probabilities for Code Gods rules

For a future agent who has a new rule (or an old one) and wants its survival function `G(t) = μ{u ≥ t}` without the
sampling estimator. Every tool below is stated, implemented in `lib/game-utilities/src/analytic.ts`, and demonstrated
on a real family whose formula is wired into the family (`analytic`) and verified against the archived Monte Carlo
tables of all 48 Grid shapes (`data/analytic-reference/<family>.json`, `scripts/verify-analytic.ts`). §8 turns the
comparison round and measures the estimator itself, which tells you how much to trust a table you cannot yet derive.
The catalogue of solved families and the "recognise the shape" guide are in `playbook.md` (Opus session); the engine
side is in `architecture.md`.

Notation. A Grid instantiation has N×N = n cells, S symbols, C colours; under μ every cell is an independent uniform
draw from symbols × colours. `p_v` is the mass of value v (digits: 1/S; cards: 1/13 for each of 1..13, since suits
only add symbols of equal value). Bits are `−log2 G`. Ordinals may be lexicographic tuples `(a, b)`: `μ{(A, B) ≥ (a, b)}
= P(A > a) + P(A = a, B ≥ b)`, which `survivalLevels` computes for any finite joint law.

## 0. The one principle: build the law, then read off the survival

The estimator asks "how rare is `u ≥ t`?" level by level. Analytic work asks instead "what is the **law** of `u`?" and
then reads every level off it at once (`survivalLevels(dist)`). A law is a finite map ordinal → mass (`Dist`). The
tools are ways of building laws from independence: a cell's law (`binomial`, `multinomial`), a line's law
(`lineChainCount`), a board's law from lines (`iidSum`), a board's law from rows that interact (`rowTransferCount`), a
law of a maximum (`maxOfEqualMultinomial`), and products of independent laws (`combine`, `pairOrdinal`). When no exact
law is within reach, §7 says which approximations are safe for which part of the curve, and §8 says when to stop and
let the sampler run.

Three habits make a formula trustworthy:
1. **Sum from the rare end.** `survivalLevels` adds masses from the top ordinal down, so `G` at 70 bits is a sum of a
   few tiny terms, not `1 − (almost 1)`. Never compute `G = 1 − F`.
2. **Refuse lost mass.** `survivalLevels` throws unless the total mass is 1 ± 1e-9. A dynamic programme that drops a
   state, or an index past the end of a `Float64Array`, shows up here instead of as a quietly wrong table.
3. **Verify before writing it up.** `scripts/analytic-reference.ts <family> --from <tables>` archives the sampling
   tables, `test/analytic.test.ts` compares, `scripts/verify-analytic.ts` prints the report you paste into the docs.

## 1. Exact maxima and all-or-nothing rules

**Tool.** The top of an ordinal is often a single configuration up to symmetry: count the configurations and divide by
the number of boards. `G(max) = (#boards attaining the max) / (S·C)^n`. This is also the first thing to check against a
table's `meta.topReached` and its top level.

**Picture Frame** (`picture_frame`, `strategy.ts`): `u = 1` iff all 4N−4 edge cells have my colour.
`G(1) = C^−(4N−4)`; the only other level is `G(0) = 1`. Wired as `picture-frame@1`. No sampling estimator can climb an
all-or-nothing rule (there is no intermediate level to split on), which is why this family was exact from the start.

**Lone Peak** (`lone_peak`): `(gap, mine)`. With F the value cdf and q = 1/C,
`μ{≥ (0,1)} = Σ_m [(F(m−1) + p_m)^n − (F(m−1) + p_m (1−q))^n]` (the top value is m and at least one of its cells is
mine) and `μ{≥ (g,1)} = Σ_m n q p_m F(m−g)^(n−1)` for g ≥ 1 (one cell is my m, all others ≤ m−g). Wired as
`lone-peak@1`. grid-lab's cross-check (`test/calibration-gridlab.test.ts`) agrees to 0.00 bits.

**Best Friends' top** (§6): the maximum 2N(N−1) seams needs a two-colour checkerboard: exactly 2 boards' colourings, so
`G(max) = 2 / C^n`: 24.36 bits on 4×4 rgb, 49.00 on 5×5 rgby, 56.06 on 6×6 rgb. The transfer matrix reproduces all
three to the last digit; the tables' tops are 24.6, 51.1 and 55.6.

## 2. Sums of independent per-cell indicators: Binomial, multinomial, lexicographic tuples

**Tool.** If `u = Σ_cells f(cell)` with f depending on one cell only, the summands are iid and `u` is a Binomial
(indicator f) or a multinomial functional (vector f). `binomial(n, p)`; `multinomial(n, ps, counts => ordinal)` for a
tuple built from category counts (enumerates compositions: fine for n ≤ 49 with 3 categories, 1275 levels on 7×7).

**Hated colour** (`hate_colour`, `defence.ts`): `u ~ Binomial(n, 1/C)`. Wired `binomial-cells@1`. 48 shapes, 1316
levels, no unattainable level:

| band (bits) | levels | mean Δ (table − analytic) | RMS Δ | max abs Δ | RMS z |
|---|---|---|---|---|---|
| 0–4 | 429 | 0.000 | 0.011 | 0.07 | 0.42 |
| 4–8 | 146 | 0.001 | 0.069 | 0.26 | 0.94 |
| 8–16 | 189 | 0.015 | 0.186 | 0.66 | 0.66 |
| 16–32 | 251 | 0.076 | 0.322 | 1.29 | 0.70 |
| 32–48 | 157 | 0.244 | 0.621 | 3.31 | 0.99 |
| 48–64 | 94 | 0.417 | 0.814 | 1.87 | 1.10 |
| 64– | 50 | 0.522 | 1.204 | 3.43 | 1.43 |

**Green Ones** (`seed3_green_ones`, `seeds.ts`): `(perfect, halfway)`, each cell perfect with `p₁ = p_v / C`, halfway
with `p₂ = 1/C + p_v − 2 p₁`, else neither: a trinomial; the lexicographic survival from its law. Wired
`trinomial-cells@1`. 48 shapes, 9273 levels, none unattainable; RMS Δ 0.015 / 0.069 / 0.177 / 0.293 / 0.456 / 0.621 /
0.862 bits in the seven bands, mean Δ within ±0.04 everywhere, RMS z 0.55–1.03. grid-lab has an exact tail for this
family and the cross-check test reports our *old sampling* table 6.74 bits off at its top (88.9 bits): the trinomial
agrees with grid-lab, the table was the one in error (§8).

The same two lines solve **Hated number** (`Binomial(n, p_v)`) and **Lucky Token** (trinomial with `p_v = 1/S`);
both are verified on 48 shapes in the scratch run behind this document (max |Δ| 4.2 and 5.0 bits, only above 64 bits)
and left for the playbook to wire.

## 3. Independence, union bounds and inclusion–exclusion

**Tool.** Events on disjoint cell sets are independent under μ. For K independent events of probability q,
`P(at least one) = 1 − (1 − q)^K ≤ K q` (the union bound, tight when K q ≪ 1), and `P(exactly j) = Binomial(K, q)`.
Rows are disjoint cell sets; so are columns; so are the four corners. Within one line, adjacent-pair events are *not*
disjoint but are often still iid (next example).

**Rainbow Road** (`rainbow_road`, `strategy.ts`): `(wholeLines, steps)` over rows. A "step" at position i needs
`colour[i+1] = next(colour[i])`. Given the shared cell `colour[i+1]`, both neighbouring step events need one specific
colour each, so the N−1 indicators along a line are **iid Bernoulli(1/C)** although they overlap: `steps per line ~
Binomial(N−1, 1/C)`, whole line iff all N−1 (`q = C^(1−N)`), and the board is the N-fold iid sum of the per-line pair.
Wired `line-iid-tuple@1`. Union bound sanity check on 5×5 rgby: `P(≥ 1 whole row) ≤ 5 · 4^−4 = 0.0195`; exact
`1 − (1 − 4^−4)^5 = 0.0194`. 48 shapes, 2681 levels, none unattainable, RMS z ≤ 1.21 up to 32 bits; above that the
**tables** drift (§8.2).

## 4. Line patterns: Markov chains and transfer matrices along a line

**Tool.** A statistic of one line of iid cells that depends on neighbours is a functional of a Markov chain; a dynamic
programme over (position, last value, count so far) gives its exact law in O(N · |values|² · counts)
(`lineChainCount(n, valueLaw, step)`). Lines are independent, so the board's law is `iidSum(lineLaw, N)` (repeated
squaring of `combine`). This covers runs, ascents, "same as left", differences by k, and any neighbour test; for a test
of width w keep the last w−1 values as the state.

**Staircase Climber** (`staircase_climber`, `strategy.ts`): count of cells exactly one more than the cell to their
left. Wired `line-chain-sum@1`. 48 shapes, 1053 levels, none unattainable:

| band (bits) | levels | mean Δ | RMS Δ | max abs Δ | RMS z |
|---|---|---|---|---|---|
| 0–4 | 240 | −0.000 | 0.010 | 0.03 | 0.38 |
| 4–8 | 98 | −0.004 | 0.069 | 0.25 | 0.87 |
| 8–16 | 144 | 0.088 | 0.228 | 0.68 | 0.79 |
| 16–32 | 211 | 0.141 | 0.487 | 1.81 | 1.06 |
| 32–48 | 164 | 0.136 | 0.799 | 3.17 | 1.29 |
| 48–64 | 125 | 0.074 | 1.050 | 4.81 | 1.41 |
| 64– | 71 | 0.175 | 1.626 | 4.41 | 1.92 |

Verified in the scratch run and left for the playbook: **Hated repeat row** (one row; state = (set of colours used,
last colour, repeats); max |Δ| 0.69 bits over 48 shapes), **Stripe Painter** (`(stripes, nearly)` needs the sequence
of rows: state = (previous full row's colour or none, stripes, nearly); 3.7 bits max, only above 48 bits),
**Flag Bearer** (per row a multinomial over colour counts gives `(won, lead)`; then `iidSum`), **Full House** (per row
`Σ C(m_v, 2)` from the multinomial of value counts; then `iidSum`; 9.1 bits max, only above 64 bits).

## 5. Maxima of counts: inclusion–exclusion without cancellation

**Tool.** `P(max_i X_i ≥ m)` for multinomial counts is an inclusion–exclusion sum with alternating signs that cancels
catastrophically deep in the tail. Instead run a dynamic programme over categories with state (cells used so far, a
flag "some category already ≥ m"), which adds only positive terms: `P(flag) = n! · Σ Π 1/c_i! · k^−n`
(`maxOfEqualMultinomial(n, k)`; O(k · n² ) per level). The same shape with per-category probabilities handles unequal
masses (cards' values: 13 equal categories; mixed laws: carry `p_i^{c_i}` in the weight).

**Hated takeover** (`hate_takeover`, `defence.ts`): the largest colour count. Wired `multinomial-max@1`. 48 shapes,
1095 levels, none unattainable, RMS z 0.42 / 1.07 / 0.73 / 0.83 / 1.06 / 1.10 / 1.32 by band, max |Δ| 3.3 bits (at
32–48 bits). **Hated symbol takeover** is the same programme with k = S (or 13 for cards): verified, 3.6 bits max,
left for the playbook. The **four corners** (`hate_same_corners`) are small enough for `multinomial(4, …)` directly on
colours and values, combined with `pairOrdinal`.

## 6. Two-dimensional pattern counts: the row-to-row transfer matrix

**Tool.** When a count sums a within-row term `h(row)` and a between-adjacent-rows term `v(row, next)`, the board's law
is exact by a transfer matrix whose state is a whole row (C^N colourings, or S^N symbol rows): carry, per state, the
polynomial in z of the count so far (`rowTransferCount(N, M, h, v, maxCount)`, O(N · M² · maxCount)). This is exact
enumeration organised so that it costs M² instead of M^N. It is feasible to M ≈ 1100 states (about a second at 1024;
`TRANSFER_STATES` in `colour.ts`): colour rules with C^N ≤ 1100 (rgb up to 6×6, rgby to 5×5, rainbow6 to 4×4);
symbol rules only at 4×4 with ≤ 5 values. Beyond that the family returns null and sampling serves the shape; §7 says
why a Poisson substitute is *not* acceptable there.

**Best Friends** (`best_friends`, `colour.ts`): seams between colours A and B over the 2N(N−1) edges; `h` counts the
horizontal seams inside a row, `v` the vertical seams between two rows. Wired `transfer-matrix-rows@1` on 20 of the 48
shapes (null on the rest). 20 shapes, 712 levels, none unattainable:

| shape | levels | max abs Δ | max z | table top / analytic top (bits) |
|---|---|---|---|---|
| Grid(4,base10,rgb) | 23 | 0.46 | 1.3 | 24.6 / 24.4 |
| Grid(4,base16,rgb) | 23 | 1.14 | 2.5 | 23.2 / 24.4 |
| Grid(5,base10,rgb) | 37 | 1.11 | 2.0 | 39.6 / 38.6 |
| Grid(5,base10,rgby) | 40 | 2.15 | 3.0 | 51.1 / 49.0 |
| Grid(5,cards,rgby) | 40 | 0.59 | 0.9 | 48.7 / 49.0 |
| Grid(6,base16,rgb) | 54 | 0.56 | 1.0 | 56.1 / 56.1 |

(the full 20 rows: `scripts/verify-analytic.ts --families best_friends`). Bands: RMS Δ 0.013 / 0.082 / 0.178 / 0.424 /
0.780 / 0.802 bits, RMS z 0.46–1.26. The symbol layer is irrelevant to this rule, and the four symbol sets of each
(N, C) give four independent sampling tables of the same law: they scatter around the one analytic curve as the nominal
se predicts, a free replication test.

**Extending the state.** Connectivity rules (Kingdom, Archipelago, Hated patch) need the state to carry which cells of
the row are connected through the rows above: non-crossing partitions of N cells with colour labels (Catalan(N) ·
colourings), feasible for N ≤ 5 with effort. Nobody has done it here; the sampler serves those families and §8 says it
does so well.

## 7. Approximations: what each is good for, with the evidence

### 7.1 Cramér / exponential tilting (saddlepoint) for sums

For a sum of n iid terms, `P(S ≥ na) ≈ e^{−n H(a)} / ((1 − e^{−θ}) √(2π n σ_θ²))` with `H` the Cramér rate (relative
entropy) and θ the tilt solving the mean equation (Bahadur–Rao). The crude Chernoff bound `e^{−nH}` is off by a
polynomial factor; the saddlepoint correction removes it. For Binomial(49, 1/3) (Hated colour on 7×7 rgb):

| t | exact bits | Chernoff bits | saddlepoint bits | Δ |
|---|---|---|---|---|
| 20 | 2.572 | 0.862 | 2.108 | −0.46 |
| 24 | 5.901 | 3.678 | 5.749 | −0.15 |
| 28 | 10.896 | 8.387 | 10.827 | −0.07 |
| 36 | 26.457 | 23.765 | 26.432 | −0.03 |
| 44 | 51.719 | 49.367 | 51.692 | −0.03 |
| 48 | 71.034 | 69.621 | 70.916 | −0.12 |

Use: a sum whose exact law is too large to enumerate (many categories, long strings) but whose per-term law is known;
the error is < 0.1 bits beyond 8 bits and could be declared `kind: "approx", maxErrorBits: 0.25` from 6 bits up. For
`Dist`-sized problems the exact convolution is cheaper and preferred.

### 7.2 Poisson and Stein–Chen for counts of rare, weakly dependent patterns

If `W = Σ I_e` over patterns e with small `p_e` and local dependence, `W ≈ Poisson(λ = Σ p_e)` and Stein–Chen bounds
the total-variation error by `(1 − e^{−λ})/λ · (b₁ + b₂)`, `b₁ = Σ_e Σ_{f ∈ N_e ∪ {e}} p_e p_f`,
`b₂ = Σ_e Σ_{f ∈ N_e} E[I_e I_f]`. Measured on our families:

| count | λ | b₁ | b₂ | bound on d_TV |
|---|---|---|---|---|
| Best Friends 5×5 rgby | 5.00 | 3.56 | 5.88 | 1.88 (vacuous) |
| Snap 5×5 base10 | 4.00 | 2.28 | 1.88 | 1.02 (vacuous) |
| Snap 4×4 base16 | 1.50 | 0.50 | 0.41 | 0.47 |

The bound is useless at our λ. The *approximation* itself, checked against the tables: Snap's Poisson tail is within
0.5 bits of the sampling tables in the body (0–8 bits) on every shape but **6–9 bits off at the top** (the table's top
is 52–75 bits; Poisson gives 57–227), and Best Friends' Poisson substitute on the 28 large shapes is **37–79 bits off
at the top** (e.g. 6×6 rainbow6: table 74.3, Poisson 172.6 bits). The reason is structural: a bounded count has a
finite maximum attained by a *rigid* configuration (the checkerboard), so its deep tail is "exponential in the number
of forced cells", while the Poisson tail keeps falling like `λ^t / t!` for ever. **Rule:** Poisson is a body
approximation (≤ 8 bits) for rare patterns, never a tail formula, and never an `approx` analytic for a bounded count.
The deep tail of a pattern count is an exact-maximum problem (§1) joined to the body by a transfer matrix (§6) or by
the sampler.

### 7.3 Normal approximation

For the body of a sum with λ or np ≳ 10, the normal law with continuity correction is within ~0.2 bits to about 3 bits
of depth and useless beyond; `Dist` arithmetic replaces it in every case we met. Mentioned only to say: do not use it
for a table.

## 8. The sampling estimator, measured: when a table can be trusted

The estimator (`scripts/estimator.ts`, estimator "mc-ams" version 3) is a 2^15-sample Monte Carlo body down to
~2^−8 (128 hits) and an adaptive multilevel splitting tail (500 particles, p0 = ½, one Metropolis sweep of the
symmetric kernel per stage, 64-bit target), cleaned by weighted isotonic regression and thinned to 0.1 bits. Shipped
tables carry no per-level error; `analytic-verify.ts nominalSe` reconstructs it from the budget: an MC level with
survival G has var(bits) = (1−G)/(G·nMc)/ln²2, each splitting stage adds (1−p0)/(p0·particles)/ln²2 (one stage per bit),
inflated ×1.6 for particle correlation. Pooling the six wired families over 48 shapes (260 tables, 16,130 levels) and,
in the scratch run, 13 families (about 36,000 levels) gives the same picture:

| band (bits) | levels | mean Δ (table − exact) | RMS Δ | max abs Δ | RMS z (nominal se) |
|---|---|---|---|---|---|
| 0–4 | 2809 | 0.001 | 0.013 | 0.08 | 0.48 |
| 4–8 | 1606 | −0.003 | 0.071 | 0.33 | 0.91 |
| 8–16 | 2484 | −0.027 | 0.203 | 0.81 | 0.70 |
| 16–32 | 3661 | 0.013 | 0.387 | 1.87 | 0.83 |
| 32–48 | 2679 | 0.094 | 0.640 | 3.40 | 1.03 |
| 48–64 | 2010 | 0.155 | 0.915 | 7.03 | 1.23 |
| 64– | 881 | 0.127 | 1.277 | 6.98 | 1.53 |

### 8.1 What this says

- **Unbiased to ~0.1 bits** through 48 bits for every family whose level sets the kernel can move through (binomials,
  line sums, maxima, 2-D seams). The clean-up's 1e-6 floor shows in the 0–4 band only as noise.
- **The nominal se is honest to 48 bits** (RMS z 0.5–1.0) and **1.2–1.5× optimistic beyond**: a level at 60 bits
  should be read as ±1 bit, at 70 bits as ±1.5–2 bits, not the ±0.8 the budget implies.
- The thinning (0.1 bits) and `MIN_STEP_BITS` are invisible at this resolution.
- A formula that disagrees with the tables by more than the band's max on *several* shapes below 48 bits is wrong.
  (Every formula in this document first reproduced the body of every shape to 0.01 bits; two scratch formulas that did
  not were wrong and were fixed before anything was written.)

### 8.2 When the table is the one in error

- **All-or-nothing and near-rigid rules** (Picture Frame; Lone Peak's gap): no intermediate levels, the kernel cannot
  climb; the tables were exact from the start.
- **Tuple ordinals whose first component is a rare rigid event.** Rainbow Road's `(wholeLines, steps)`: completing a
  line fixes N cells; the kernel's single-cell moves rarely complete a second line while keeping the first, so the
  particle population under-represents the next level and the table **over-estimates bits by +0.5 at 32–48, +1.1 at
  48–64 and up to 7 bits at the top** (Grid(7,cards,rainbow6): table 64.0, exact 57.0 at (4, 25)). The analytic is
  right, the table is biased, and `meta.stoppedEarly` does not flag it. The same mechanism explains Green Ones' 6.7-bit
  top error (perfect cells are rigid once the count is high) and is the one to suspect in any family whose top
  requires coordinated multi-cell moves: Rainbow Road, Stripe Painter, Full House, Magic Window, Sudoku Scholar.
- **Deep splitting levels in general.** Beyond 64 bits only the final particle population resolves levels; treat the
  last two or three levels of any table as ±2 bits.

### 8.3 How to use this when you cannot derive a formula

1. Trust the body and the moderate tail (≤ 48 bits) of a sampling table to its nominal se.
2. If the rule's top is rigid (a completed line, a full patch, an exact arrangement), compute the top exactly (§1) and
   compare with the table's top: a gap beyond 2 bits means the whole upper tail is biased; a hybrid analytic (exact
   top, sampled body) is not supported today, so the honest choice is to leave the table and record the bias in the
   playbook, or to derive the law.
3. For the planned within-draw fan-out (architecture.md §3.2) re-measure this table with estimator v4 before trusting
   its replicates: the bands above are the acceptance test.

## 9. Int and string types (pointers, not worked here)

- Int domains ≤ 2^20 are enumerated exactly by the estimator already (`EXACT_DOMAIN`). For the full 32-bit range,
  digit statistics (count of a digit, longest run, palindromes, divisibility) are **digit dynamic programmes**: state
  = (position, tight-to-bound flag, the statistic so far), exact and microseconds. The harness's
  `compareWithEnumeration` on `Int(0,9999)` is the test bed: derive on the small range, verify exactly, then lift.
- Strings of length ≤ L over an alphabet are products of iid characters with a random length: the line tools of §4
  apply verbatim with the length mixture on top (`combine` over the length law).

## 10. Checklist for a new analytic

1. Write the law with the toolkit; `survivalLevels` it; give it an id `name@1`.
2. `scripts/analytic-reference.ts <family> --from lib/game-utilities/data/calibration/v1` (and any branch data) **before**
   wiring, so the sampling tables are archived while their keys are current.
3. Wire `analytic` on the family; `pnpm --filter @workspace/game-utilities test` (spawns, enumeration, references).
4. `scripts/verify-analytic.ts --families <family>`; paste the band table into `playbook.md` with one line on what the
   tables got wrong, if anything (§8.2).
5. `pnpm --filter @workspace/game-utilities calibrate`: the family's shipped tables regenerate exactly in a second.
