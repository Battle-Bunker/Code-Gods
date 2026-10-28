# Synergy atlas and dealer design

Session topic `synergy`, branch `claude/gridlab-explore-synergy`. Code: `gridlab/explore/synergy/`.
**Status.** Done:
- atlases for Grid(5,base10,rgby), Grid(4,base12,rgb) and Grid(6,cards,rainbow6);
- dealer games on training seeds for all three GridTypes;
- the 5×5 held-out validation (seed 9000000) of dealers and exclusion lists.

Pending: one robustness run under the new defaults (0.5 Hz spawns, 80 objects), §3.4.

Exported matrices for the production dealer are in `docs/explore/synergy_matrices/` (§7).

**Shared modules: no changes.** Everything lives in `gridlab/explore/synergy/`. All test suites still
pass, untouched.

**Game setup used for every game below:** `experiments.common.BASE` ("old"). That is the engine
default at 100 Hz, 0.1 Hz spawns, 10 starting objects, the **uniform prior**, exponential length with
a 300 s half-life, 3–6 gods, and per-god policies iid from {random, greedy_private, saver,
greedy_omniscient}. Dealer comparisons are **paired**: every dealer plays the same game specs (seed,
number of gods, policies). The other sessions' new defaults (PR #8) and the self-play prior (PR #17)
were not used. The fairness findings in particular may shrink under the empirical prior, which is
reported to remove most of the clumper bias. §5.3 separates what depends on the prior and the policies
from what does not.

## 1. Measuring synergy

For god i with draw d_i and depth b, U_i(b) = {y : u_i(y) ≥ t_i(b)}, where t_i(b) is the smallest
calibrated level with s_i ≥ b. The atlas entry is

    PMI_ij(b) = s_i(b) + s_j(b) − s_ij(b),    s_ij(b) = −log2 μ(U_i(b) ∩ U_j(b))

with s_i(b), s_j(b) the actual surprisals of the chosen levels (≥ b; coarse rules jump past b).

**Estimator** (`atlas.joint_climb`). The library's `calibrate.joint_surprisal` needs a grid x that sits
at both depths at once, which usually does not exist, so I wrote a new estimator. It runs one adaptive
multilevel-splitting climb per draw pair, from the prior, on φ(y) = min(s_i(y), s_j(y)). Surprisal is
monotone in the ordinal, so {φ ≥ b} = U_i(b) ∩ U_j(b) exactly, and one climb passes all three depths
(8, 16 and 24 bits). It uses 300 particles, one sweep per stage, and the `calibrate.mcmc` kernel. A
climb that stalls or passes 64 bits is **censored**: PMI is then only an upper bound. Most stalls are
real near-exclusions. For example, three complete Rainbow Road columns cap green − red at 13 on 5×5,
so Conqueror (green over red) at 24 bits, which needs ≥ 19, cannot co-occur with them. For camps and
dealers, censored entries are imputed as min(bound, −b).

An earlier design, a "conditional climb" that climbed u_j inside a population of μ|U_i, stalled
whenever U_i is rigid: complete rainbow lines freeze most cells. It is kept in `atlas.climb` for
reference only.

**Validation.**
- Colour-only × symbol-only pairs are independent under the product prior, so their PMI must be 0.
  Chessmaster or Rainbow Road or Border Baron × Full House measure 0.0 ± 0.5 at every depth. Over the
  whole 5×5 atlas, C × S pairs average −0.07 / −0.22 / −1.68 bits at 8 / 16 / 24. The small deep
  deficit comes from families tagged C or S that leak into the other layer through parameters (§2.4).
- Replicate runs with a new seed (50 pairs) differ with an SD of 0.45 / 0.98 / 2.2 bits at 8 / 16 / 24.
  The reported standard error (median 0.44 / 0.70 / 0.91) is honest at 8 and 16 bits and about 2×
  optimistic at 24 bits. Treat 24-bit entries as ±2 bits.
- All-or-nothing rules (Picture Frame: 0 → 32 bits) cannot be climbed by AMS, so their entries are
  reported as unmeasured, not imputed.

**Size and cost.** 2 param draws per family; the full atlas on every available family.
- Grid(5,base10,rgby): 82 families, 151 draws, 11,546 joint climbs, about 3 CPU-hours.
- Grid(4,base12,rgb): 79 families, 146 draws, 10,796 climbs.
- Catalog run: the 14 catalog families × 6 draws, same-family pairs included, 1,653 climbs.
- Grid(6,cards,rainbow6): 83 families, 151 draws, 11,257 climbs.

```
python3 -m gridlab.explore.synergy.atlas --type 5,base10,rgby --draws 2 --processes 4
python3 -m gridlab.explore.synergy.atlas --type 5,base10,rgby --draws 6 --tag catalog --same-family \
    --families seed1_line_painter,seed2_patchwork,seed3_green_ones,stripe_painter,castle_keeper,conqueror,\
border_baron,chessmaster,rainbow_road,mirrormancer,othello_sandwich,straight_shooter,number_bonds,parity_painter
python3 -m gridlab.explore.synergy.camps --type 5,base10,rgby --k 8 --json      # report + family matrix
python3 -m gridlab.explore.synergy.camps --type 5,base10,rgby --tag catalog     # catalog comparison
```

## 2. The atlas (policy-independent findings)

### 2.1 Goals diverge with depth

| Grid(5,base10,rgby) | b = 8 | b = 16 | b = 24 |
|---|---|---|---|
| mean family-pair PMI | −0.38 | −1.86 | −5.24 |
| SD across pairs | 2.1 | 6.0 | 11.5 |
| share > +1 bit (aligned) | 0.14 | 0.25 | 0.27 |
| share < −1 bit (conflict) | 0.21 | 0.39 | 0.51 |
| share exclusive (censored) | 0.01 | 0.08 | 0.23 |

Grid(4,base12,rgb) is the same but stronger: −1.07 / −4.16 / −6.67, with 36% exclusive at 24 bits.
Grid(6,cards,rainbow6) is about half as strong: −0.20 / −0.91 / −2.16, with 5% exclusive. Six colours
means less competition for cells. Alternator × clumper is still the most opposed camp pair there (−4.1
at 24 bits), and only 2 pairs flip.
Near the prior, most pairs are almost independent. Deep goals polarise: a quarter become strongly
aligned and half conflict.

**Alignment can flip with depth, and almost always in one direction: aligned when shallow, exclusive
when deep.** 44 of 2,556 pairs flip sign on 5×5 (16 of 1,081 on 4×4). Examples:
- Conqueror × Colour Mixer: +2.6 → −28 bits.
- Straight Shooter × Magic Window: +2.4 → +4.2 → exclusive.
- Castle Keeper × Stripe Painter: +1.4 → +1.7 → exclusive.

No pair flipped from conflict to alignment. Being friends early does not mean the two goals' best
states are compatible.

### 2.2 Camps: layer competition first, clumper/alternator second

Mean PMI by hand-made label (5×5; ± s.e. over family pairs):

| groups | b = 8 | b = 16 | b = 24 |
|---|---|---|---|
| C × C (colour-only × colour-only) | −1.33 ± 0.17 | −6.06 ± 0.43 | **−14.4 ± 0.7** |
| C × CS | −0.37 | −2.08 | −5.21 |
| C × S | −0.07 | −0.22 | −1.68 |
| CS × CS | −0.19 | −1.25 | −2.34 |
| S × S | −0.13 | −0.39 | −4.89 |
| alternator × clumper | **−1.07 ± 0.09** | **−3.70 ± 0.25** | **−8.42 ± 0.44** |
| alternator × alternator | +0.02 | −0.71 | −4.53 |
| clumper × clumper | −0.06 | −1.13 | −2.32 |

- **The dominant axis is competition for the same layer**, not the hypothesised camps. The leading
  eigenvector of the family matrix (λ = −328) correlates −0.53 with the colour/symbol label and +0.02
  with the camp label. Two colour-only rules almost always fight over the same 25 cells.
- **The clumper/alternator split is real but second** (λ = +181, r(camp) = −0.60). Cross-camp pairs
  are about 4–6 bits worse than within-camp pairs at depth. Clumpers are *not* each other's friends,
  though: clumper × clumper is only −2.3 vs −8.4 cross-camp, because clumpers of different colours
  compete for cells (§2.3).
- **Exactly one tight alliance.** Affinity clustering (average linkage on −W̄) finds one crisp camp:
  Seed 2 Patchwork, Rainbow Road, Rainbow Roads, Rainbow Steps, Robin Hood, Fair Weaver, Quilt Maker,
  Lantern Lighter and Rummy Melder. These are the colour-balancing and spectral alternators, all
  colour-agnostic. Mean PMI inside the camp is **+3.4**, and −4.2 to everyone else. The rest of the
  families form loose blobs with mean inside PMI ≈ 0.
- **Universal allies and universal rivals.**

  | 5×5 role | family | allies (PMI ≥ +2) | rivals (PMI ≤ −2) | mean PMI |
  |---|---|---|---|---|
  | universal ally | Pinwheel | 50 | 8 | +2.2 |
  | universal ally | Set Spotter | – | – | +1.6 |
  | universal ally | Full House | – | – | +1.6 |
  | universal ally | Snap | – | – | +1.4 |
  | universal ally | Looking-Glass | – | – | +1.4 |
  | universal ally | Wallpaper Weaver | – | – | +1.3 |
  | universal ally | Mirrormancer | – | – | +1.1 |
  | universal rival | Tetromino Tamer | 2 | 70 | −8.8 |
  | universal rival | Robin Hood | – | – | −6.9 |

  The allies all reward symmetry, constant symbols or flat structure. Bullseye is the top ally of about
  15 clumpers.

### 2.3 Families are not the unit: the draw decides

With 6 draws per catalog family, Conqueror × Line Painter splits cleanly by colour relation:

| Conqueror (A over B) vs Line Painter colour X | PMI at 8 / 16 / 24 bits |
|---|---|
| A = X (same army) | **+6 / +13 / +21** (nested goals: PMI ≈ s) |
| B = X (X is Conqueror's enemy) | **−23 / −70 / −54** (exclusive) |
| X unrelated to A and B | −2.5 / −17 / −28 |

The catalog's model was "(A,B) vs (C,D) both gain from repainting B → C". In fact two colour clumpers
with *unrelated* colours are strong rivals, because each wants the whole board. Family-level averages
hide a three-way split, so a dealer that wants to *steer* alignment should deal params, not only
families. That needs a small shared change, a params-aware `fixed` dealer (§6).

### 2.4 The hand-made matrix (catalog §3) versus the atlas

Classification per cell, per depth:
- **A**: mean ≥ +1 and ≥ 75% of draw pairs > 0.
- **C**: mean ≤ −1 and ≥ 75% < 0.
- **0**: |mean| < 1 and every draw pair within ±2 / 2.5 / 3.5 bits.
- **M**: anything else.

A pair that is A at one depth and C at another is a "flip".

| run | cells agreeing |
|---|---|
| 5×5, 2 draws | 32 of 105 |
| 5×5, 6 draws (catalog run) | 52 of 105 |
| 4×4, 2 draws | 48 of 105 |
| 6×6 cards, 2 draws | 42 of 105 |

More draws reveal more draw-dependence, which agrees with the catalog's many M cells. Of the 22 "A"
cells, only 2 are A in the atlas, and none of the catalog's "C" cells turned out aligned.

**Where intuition was wrong** (6-draw run unless noted; PMI at 8 / 16 / 24 bits):

| pair | catalog | atlas | PMI | why |
|---|---|---|---|---|
| Border Baron × Castle Keeper | A | **C** | −1.7 / −4.7 / −17.4 | the castle's single wall colour leaves no second big region |
| Conqueror × Line Painter | A | **C** (draw-split) | −5.6 / −16 / −18 | see §2.3: aligned only when colours match |
| Line Painter × Line Painter (different colours) | A | **C** | −3.0 / −9.1 / −21 | same-family diagonal: different colours compete |
| Chessmaster × Othello | A | **C at depth** | −2.7 / −7.9 / −14.9 | checkerboards have no X?X gaps of exactly one |
| Castle Keeper × Chessmaster | A | C at depth | −0.9 / −6.6 / −17.5 | the wall eats the board |
| Othello × Rainbow Road | A | C at depth | −0.9 / −5.0 / exclusive | |
| Border Baron × Rainbow Road | A | M, negative | −1.5 / −2.0 / −3.2 | |
| Castle Keeper × Castle Keeper (different walls) | M | **C** | −1.1 / −8.9 / −18.5 | |
| Castle Keeper × Conqueror | M | **C** | −3.9 / −11 / −22.5 | |
| Conqueror × Stripe Painter (2-draw run) | M | **A** | +3.2 / +8.4 / +13.6 | stripes of the army colour |
| Mirrormancer × Number Bonds (2-draw run) | M | **A** | +1.1 / +3.9 / +8.0 | the flat all-T/2 grid is a palindrome |
| Straight Shooter × Stripe Painter | 0 | **A** | +1.0 / +2.1 / +3.5 | flush bonus: monochrome rows |
| Number Bonds × {Conqueror, Othello, Stripe} | 0 | M | up to ±3.5 | Number Bonds' colour mode couples the layers |
| Seed 2 Patchwork × Straight Shooter | C | **0** | −0.9 / −0.4 / −0.2 | |
| Castle Keeper × Stripe Painter | C | **flip** | +1.4 / +1.7 / exclusive | |

The **diagonal** (same family, different draw) is rarely "A". Mirrormancer × Mirrormancer is +0.4 /
+1.6 / +9.3, which supports the mandala intuition at depth only. Othello × Othello is M (−7.9 at 24
bits), not A.

The **"0" cells** fail mostly because the "symbol" rules (Straight Shooter, Number Bonds) carry colour
couplings: the flush bonus and the colour modes.

## 3. Dealers

Ten dealers (`dealers.py`). Each deals G distinct families; params come from `sim.deal`, dealer
`fixed`. W is the family matrix averaged over depths.

| dealer | rule |
|---|---|
| uniform | distinct families uniformly at random (the engine default, `distinct`) |
| hand_camps | round-robin over clumper / alternator / neutral (= `balanced_camps`) |
| atlas_camps | round-robin over the 8 affinity clusters |
| cross_layer | ≥ 1 colour-only and ≥ 1 symbol-only family |
| ally_rival | every god has ≥ 1 ally (W ≥ +2) and ≥ 1 rival (W ≤ −2) at the table |
| max_var | best of 32 uniform deals by the variance of pairwise W |
| baron | Border Baron always dealt (a structure-feeding parasite) |
| aligned | best of 32 by mean pairwise W (a friendly table) |
| hostile | worst of 32 by mean pairwise W (probe) |
| fair_aligned | best of 32 by mean W − 1.0 × SD over gods of each god's mean W to the table |

```
python3 -m gridlab.explore.synergy.games --type 5,base10,rgby --games 200 --seed 1     # training seeds
python3 -m gridlab.explore.synergy.games --type 5,base10,rgby --games 150 --seed 9000000 \
    --dealers uniform,aligned,ally_rival,fair_aligned,baron [--exclude ...]          # held out
```

### 3.1 Results (training seeds; paired Δ vs uniform; **bold** = 95% CI excludes 0)

Grid(5,base10,rgby), 200 specs per dealer (1,800 games, plus 200 for fair_aligned):

| dealer | dynamism2 | sig. tension | snap tension | held accel. climbs /100 s | leaderboard crossings /pair/100 s | durable object lead changes | hot objects | fairness z_sd_excess |
|---|---|---|---|---|---|---|---|---|
| uniform | 0.546 | 0.133 | 0.290 | 0.93 | 3.01 | 0.92 | 0.83 | 0.172 |
| hand_camps | +0.013 | +0.004 | +0.009 | +0.07 | +0.20 | +0.03 | −0.00 | 0.193 |
| atlas_camps | **−0.029** | **−0.013** | **−0.037** | **−0.19** | **+0.48** | **−0.23** | **−0.09** | 0.211 |
| cross_layer | +0.007 | **−0.015** | −0.003 | +0.07 | −0.04 | −0.04 | +0.01 | 0.183 |
| ally_rival | **+0.023** | **+0.027** | **+0.036** | +0.20 | −0.19 | **+0.12** | **+0.06** | 0.191 |
| max_var | +0.007 | **+0.012** | +0.020 | −0.06 | +0.17 | +0.09 | +0.01 | 0.192 |
| baron | +0.013 | **+0.026** | **+0.042** | −0.05 | +0.24 | +0.04 | +0.03 | 0.202 |
| **aligned** | **+0.056** | **+0.036** | **+0.068** | **+0.30** | **−0.37** | **+0.41** | **+0.11** | 0.188 |
| hostile | −0.013 | −0.001 | −0.008 | **−0.19** | +0.16 | **−0.13** | −0.02 | 0.180 |

Grid(4,base12,rgb), 120 specs per dealer, replicates the ranking:

| dealer | Δ dynamism2 vs uniform (0.524) |
|---|---|
| **aligned** | **+0.046** |
| **fair_aligned** | **+0.039** |
| baron | +0.018 |
| ally_rival | +0.017 |
| hand_camps | +0.016 |
| atlas_camps | −0.005 |

On 4×4, aligned again adds **+0.32 held accelerating climbs** and **+0.36 durable object lead
changes**, and costs **−0.56 leaderboard crossings**. fair_aligned keeps most of the gain with better
fairness (z_sd_excess 0.197 vs 0.227 for aligned).

Grid(6,cards,rainbow6), 120 specs per dealer:

| dealer | Δ dynamism2 vs uniform (0.573) |
|---|---|
| **fair_aligned** | **+0.064** |
| **aligned** | **+0.050** |
| hostile | **−0.030** |
| everything else | within ±0.01 |

fair_aligned also adds +0.67 held accelerating climbs and +0.50 durable lead changes on 6×6.

### 3.1b Held-out validation (Grid(5,base10,rgby), seed 9000000, 150 new specs)

| dealer | dynamism2 | Δ vs uniform | sig. tension Δ | snap tension Δ | durable lead changes Δ | hot objects Δ |
|---|---|---|---|---|---|---|
| uniform | 0.565 | – | – | – | – | – |
| **aligned** | 0.607 | **+0.042** | **+0.035** | **+0.054** | **+0.41** | **+0.083** |
| **fair_aligned** | 0.598 | **+0.033** | **+0.027** | **+0.040** | **+0.36** | **+0.075** |
| ally_rival | 0.569 | +0.004 | **+0.027** | **+0.025** | **+0.18** | +0.020 |
| baron | 0.565 | +0.000 | **+0.024** | **+0.036** | +0.10 | +0.039 |

The friendly-table effect replicates on fresh seeds. ally_rival's dynamism2 gain does not: +0.023 on
training, +0.004 held out. It still raises tension.

### 3.1c fair_aligned vs aligned, head to head

Paired differences, fair_aligned − aligned, mean [95% CI] (`python3 -m gridlab.explore.synergy.compare`):

| run | dynamism2 | snap tension | durable lead changes | z_sd_excess aligned / fair_aligned |
|---|---|---|---|---|
| 5×5 train (200) | −0.005 [−0.019, +0.009] | −0.004 | −0.04 | 0.188 / 0.198 |
| 4×4 train (120) | −0.007 [−0.023, +0.009] | −0.027 [−0.050, −0.003] | −0.10 | 0.228 / 0.197 |
| 6×6 train (120) | +0.015 [−0.005, +0.035] | +0.038 [+0.014, +0.064] | +0.20 [+0.04, +0.37] | 0.191 / 0.197 |
| 5×5 held out (150) | −0.009 [−0.024, +0.006] | −0.013 | −0.05 | 0.189 / 0.212 |

**The two are statistically indistinguishable on dynamism2**, and the SD penalty does not
measurably improve family fairness. fair_aligned is fine to ship, since it is never significantly
worse, but its fairness rationale is not supported by these games. aligned is the simpler equivalent.

atlas_camps is a bad design: several clusters are single families, which round-robin then deals far too
often. Balanced clusters, or k ≈ 3, would be needed.

### 3.2 Does the atlas predict the game?

**Pair level: yes, robustly.**

| Spearman ρ between atlas W and … (95% CI) | 5×5, 16,254 god pairs | 4×4, 11,120 pairs |
|---|---|---|
| in-game correlation of Δs_i, Δs_j | **+0.36** [0.34, 0.37] (W at 8 bits) | **+0.35** |
| correlation of s_i, s_j over snapshot objects | **+0.36** | **+0.36** |
| empirical in-game PMI of {s ≥ 4} | **+0.28** | **+0.31** |
| spirals in which both gods gained | **+0.22** | **+0.18** |

Grid(6,cards,rainbow6) gives the same: Δ-correlation +0.33 and s-correlation +0.32. The 8-bit and 16-bit
atlas predicts best. Gods' typical peak surprisal in these games is 17 bits
(median; IQR 11–31).

**The surprise: atlas conflict does not predict in-game tension.** Pair "opposition" (one god gains
≥ 1 bit while the other loses ≥ 1 in the same commit) is uncorrelated with W, or slightly *positive*
(ρ = +0.04 to +0.08 on 5×5). The mechanism shows in the 5×5 uniform games:

| atlas W of the pair | pairs | Δ-correlation | opposition share | co-rise share | snapshot s-correlation |
|---|---|---|---|---|---|
| < −5 (rivals) | 399 | −0.02 | 0.025 | 0.010 | −0.03 |
| −1 … +1 | 750 | 0.00 | 0.017 | 0.008 | +0.01 |
| > +3 (allies) | 224 | +0.09 | **0.033** | **0.024** | +0.13 |

**Aligned gods work the same objects**, so they collide more and co-climb more. Atlas rivals mostly
occupy *different* objects (niche separation). Tension in play needs contact, and contact comes from
shared attractors. That is why, at game level, friendlier tables give more tension, snapshot tension,
held climbs and dynamism2:

| feature (5×5, 1,800 games) | ρ with dynamism2 | ρ with sig. tension | ρ with crossings |
|---|---|---|---|
| mean W | +0.18 | +0.11 | −0.15 |
| share of ally pairs | +0.19 | +0.22 | −0.17 |

The cost is fewer leaderboard crossings: allies' rankings move together. Variance of W (strong allies
*and* rivals) adds tension (+0.14) and spirals (+0.11) but not dynamism2.

**Translation in one line.** The atlas predicts *who moves together*. Strong anti-alignment predicts
*avoidance*, not fights. Friendly tables produce the cooperative spirals the user asked for and,
through contact, more tension. They do not produce more leaderboard reversals.

## 4. Per-family fairness

Fairness is policy-adjusted mean rank score z, where 0.5 is fair; `experiments.common.family_fairness`,
pooled over all dealers' games. **Whatever the dealer, z_sd_excess is 0.17–0.21**, and 40–50% of the
families have a CI excluding 0.5. Fairness is a property of the families, not of the deal.

| 5×5 | family | z | win ratio |
|---|---|---|---|
| strongest | Snap | 0.92 | 3.7 |
| | Full House | 0.87 | 3.0 |
| | Bullseye | 0.85 | 2.8 |
| | Flush Royale | 0.83 | 2.6 |
| | Pinwheel | 0.82 | 2.7 |
| | Stripe Painter | 0.79 | 2.3 |
| | Mirrormancer | 0.77 | 2.1 |
| | Uno Snake | 0.75 | 1.8 |
| weakest | Tetromino Tamer | 0.07 | 0.00 |
| | Quilt Maker | 0.12 | – |
| | Sudoku Scholar | 0.15 | – |
| | Robin Hood | 0.16 | – |
| | Odds & Evens | 0.17 | – |
| | Lantern Lighter | 0.19 | – |
| | Lone Peak | 0.23 | – |
| | Number Sandwich | 0.23 | – |

On 4×4 the same eight families are the strongest. Snap reaches z = 0.98 with win ratio 4.5, and Full
House 0.91. The weakest are Sudoku Scholar (0.01), Number Sandwich, Odds & Evens, Lantern Lighter,
Tetromino Tamer, Robin Hood, Column Addition and Snake Charmer.

**The atlas explains part of it.** A family's strength correlates with its atlas row mean (ρ = +0.28
on 5×5, +0.19 on 4×4) and with its ceiling (ρ = +0.32). Per god-slot, z correlates with the god's mean
W to its actual table (ρ = +0.12 [0.12, 0.16] on 5×5; +0.14 on 4×4). This follows from the payoff
rule: π_i = s_i × S_−i. A universal ally sits on objects that others also value, so its peer surprisal
is high. A universal rival's best objects are worth nothing to anyone else, so its payoff is near zero
even when its own surprisal is high. The strong families also share a cheap attractor: constant-symbol
or symmetric grids. The atlas says these are everybody's partial allies.

## 5. Recommendations

### 5.1 Dealer

**Recommended: a friendly-table dealer**, `aligned` or `fair_aligned` (best of 32 random distinct
deals by mean pairwise W, optionally minus 1.0 × the SD of the per-god mean W). It is the only design
that raises dynamism2 on every GridType and on held-out seeds:

| run | aligned | fair_aligned |
|---|---|---|
| 5×5 train | +0.056 | +0.051 |
| 4×4 train | +0.046 | +0.039 |
| 6×6 train | +0.050 | +0.064 |
| 5×5 held out | **+0.042** | **+0.033** |

All CIs exclude 0. It works through more contact on shared objects: more snapshot tension, durable
object lead changes, held cooperative climbs and hot objects. The cost is −0.2 to −0.6 leaderboard
crossings per pair per 100 s. The two variants are indistinguishable (§3.1c).

The production branch has adopted `fair_aligned`. That is fine, but do not count on the SD term for
fairness. Fix fairness through the family list (§5.2).

Not recommended:
- `ally_rival`: its dynamism2 gain did not replicate held out, though it raises tension.
- `baron`: adds tension, no dynamism2 gain.
- `cross_layer`, `max_var`, `hand_camps`: within noise of uniform.
- `atlas_camps`: singleton clusters get dealt too often.
- `hostile`: worse everywhere.

### 5.2 Families to exclude or rework (chosen on training seeds, tested held out)

Held-out test (Grid(5,base10,rgby), seed 9000000, 150 specs, same specs with the full and the reduced
pool):

| dealer | pool | dynamism2 | Δ vs full pool (paired) | fairness z_sd_excess |
|---|---|---|---|---|
| uniform | full (82) | 0.565 | – | 0.202 |
| uniform | − weak (71) | 0.577 | +0.012 [−0.004, +0.028] | **0.157** |
| uniform | − weak − strong (65) | 0.573 | +0.009 [−0.008, +0.026] | 0.169 |
| aligned | full | 0.607 | – | 0.189 |
| aligned | − weak | 0.617 | +0.010 [−0.006, +0.025] | 0.191 |
| aligned | − weak − strong | 0.580 | **−0.027 [−0.041, −0.011]** | **0.092** |
| fair_aligned | full | 0.598 | – | 0.212 |
| fair_aligned | − weak | 0.614 | +0.016 [−0.000, +0.032] | 0.184 |
| fair_aligned | − weak − strong | 0.579 | **−0.019 [−0.036, −0.002]** | 0.149 |

The fairness numbers are point estimates. Their game-bootstrap CIs (in `compare.md`) are biased upward
by resampling, so compare them only between rows.

**Exclude the 11 "weak" families.** On fresh seeds this costs no dynamism, and it improves uniform-deal
fairness by about 0.045:

| reason | families |
|---|---|
| ceiling 7–12 bits | Bridge Builder, Ladder of Numbers, Sudoku Scholar, Lantern Lighter |
| binary 0 → 32 bits, unmeasurable | Picture Frame |
| universal rivals | Tetromino Tamer (rival of 70 of 81), Robin Hood, Quilt Maker |
| z ≤ 0.25 on both measured GridTypes | Odds & Evens, Lone Peak, Number Sandwich |

Each can come back after a rework: add a partial-credit tie-breaker, or make the rule colour-agnostic,
then re-measure its atlas row.

**Rework, don't exclude, the attractor families**: Snap, Full House, Flush Royale, Pinwheel, Bullseye,
Stripe Painter (Uno Snake and Mirrormancer are close behind). Excluding them halves the unfairness
under `aligned` (0.19 → 0.09). It also removes a quarter of the friendly-table dynamism gain
(−0.027), because those universal allies are what friendly tables are made of. The better fix is to
weaken their constant-symbol / symmetric attractor so that they stay allies but stop dominating. For
example, require ≥ 2 distinct symbols per scoring line, or score each rank once. Then re-measure.

### 5.3 What depends on what

- **Policy-independent:** the whole atlas (§2): the depth trend, layer competition, the camps, the
  draw-split relations, the catalog comparison, and the low-ceiling and binary flags.
- **Depends on the simulated policies and the uniform prior:** the dealer ranking, the
  tension/alignment mechanism (§3.2) and the family fairness table (§4).
  - The pair-level translation (ρ ≈ +0.35) replicates on two GridTypes.
  - The "aligned tables are livelier" result replicates on two GridTypes.
  - The fairness ranking replicates across GridTypes. Under the self-play prior (PR #17), the
    attractor families' advantage may shrink; this is not tested here.

## 6. Proposed shared change (not made)

Params-aware dealing: `GameConfig.fixed_params: Optional[Sequence[dict]] = None`, used by `sim.deal`
when dealer is `fixed`. §2.3 shows that alignment is decided by draw relations (same army colour:
+21 bits; enemy colour: exclusive). A draw-level dealer could guarantee one exact ally pair and one
exact rival pair per table instead of relying on family averages.

## 7. Exported matrices (for the production dealer)

`docs/explore/synergy_matrices/Grid_<n>_<symbols>_<colours>.uniform.json`, shaped as
`SynergyMatrix {instKey, priorId, families[], w[][], meta}`. w is the depth-averaged family W in bits;
unmeasured pairs are 0 and listed in `meta`. One file each for Grid(5,base10,rgby), Grid(4,base12,rgb)
and Grid(6,cards,rainbow6), all under the uniform prior. The matrices depend only on the rules and the
prior, not on world settings, so the new spawn defaults need no new file. A different prior
(e.g. PR #17's) does. Regenerate with `python3 -m gridlab.explore.synergy.export --type n,sym,col`.
