# The reference prior: does "rare" mean "hard"?

Exploration session `priors` (branch `claude/gridlab-explore-priors`). Code: `gridlab/explore/priors/`.

**Shared modules changed: none.** Everything lives in `gridlab/explore/priors/`, and the shared test
suites are untouched. Caches go to `.cache/explore_priors/`, which is gitignored.

## TL;DR

* **Recommendation: keep the uniform spawn prior.** Present it to kids as "how rare is this among
  fresh grids". The cost model already makes "rare" mean "hard". If you instead price difficulty in
  the game's own currency, you get the Levin/Solomonoff "code-reachable" prior, where weight =
  2^−(action cost). In tables and in games it is the uniform prior to within estimator noise:
  * median ceiling discount 0.0 bits;
  * p90 discount 0.8–1.1 bits;
  * rank correlation of per-family yield with uniform 0.99;
  * Δ dynamism2 −0.004 [−0.008, +0.000];
  * Δ family-z SD −0.003 [−0.011, +0.007].

  The reason is the erasure bound in docs/mutators.md. A program making a 2^−k state costs at
  least about k bits, so its Kraft weight 2^−cost buys back no rarity.
* **Cost-blind code priors, (b) and (c), are a weak and unstable lever.** "k random programs costing
  ≤ 30 bits" (reach1/2/4), the 2^−β·cost weights and their mixtures with uniform all behave this way.
  * What they do: they cut 7–20 bits off the ceilings of about 15% of families, nearly all clumpers.
    The reason is that a whole-grid `recolour` (23–26 bits) or a block `stamp` (≈28 bits) counts as
    "free" within the cap. Best yield per bit for clumpers falls 13–25%.
  * Who wins games does not change: the clumper−alternator gap is unchanged (Δ −0.005 [−0.031,
    +0.019]), and so is the family-z SD.
  * Dynamism moves only slightly: dynamism2 −0.006 [−0.011, −0.000], with fewer hot objects and
    slightly less tension.
  * They are fragile: a different 4096-program catalogue or a routine `move` knob retune shifts
    ceilings by up to 13 bits (reach2) or 37 bits (β = ¼).
  * So no, the code-reachable prior does **not** make every utility function fair. It only takes
    bits away from families with cheap structural routes; it cannot give bits to starved families.
    Those (Magic Accountant, Sudoku, Robin Hood, Number Sandwich, Lantern Lighter: best yield
    < 0.06 bits/bit) need rules or mutators, not a different calibration.
* **The empirical, self-play prior (d) is the only prior that changes fairness**, defined as
  ρ = ½·uniform + ½·(grids seen in games).
  * Fairness gains: family-z SD 0.208 → 0.148 (Δ −0.049 [−0.071, −0.025]); clumper−alternator gap
    0.26 → 0.10 (Δ −0.16 [−0.21, −0.12]); share of families with a significantly unfair win rate
    0.41 → 0.22.
  * It converges to a fixed point in two iterations (mean |Δs| per iteration 0.67, then 0.044, then
    0.014 bits).
  * Costs: it halves bit magnitudes (peak salience 43 → 20 bits), so dynamism2 falls −0.098
    [−0.11, −0.087]. Part of that drop is a change of units; the held-out rescaled run separates the
    two (§7). It also depends on the simulated policies, and it changes whenever any rule, mutator
    or policy changes.
  * I would not ship it as the calibration. Use it as a **diagnostic and a design target**: the
    families it moves most are the ones the mutator set over-serves.
* **Sampler.** I built latent-space multilevel splitting, which calibrates any "spawn, then apply k
  programs" prior exactly in principle and is validated four ways (§3). One side result: the
  in-progress `gridlab/priors.py` estimates its tail by splicing on the uniform tail's shape. Against
  the latent splitter on the same prior, that overstates clumper ceilings by up to +21 bits (mean
  +3.6 bits over 82 families; > 5 bits for 21 of them) (§3.5).

## 1. Priors compared

Code priors are the law of y = P_k∘…∘P_1(x), with x a uniform spawn, k ~ q, and the P_j drawn iid
from w over the same 4096-program library the policies use. Programs cost 10–240 bits; the median
is 36.

| name | kind (brief) | q(k) | w(P) |
|---|---|---|---|
| `uniform` | (a) | δ0 | — |
| `reach1`, `reach2`, `reach4` | (b) code-reachable, cost-blind | U{0..K} | uniform over library programs costing ≤ 30 bits (37% of them) |
| `beta.25`, `beta.5` | (b) tempered Levin | U{0..2} | ∝ 2^−β·cost (β = ¼: ESS 958 programs, E_w[cost] 18 bits) |
| `levin` | (b) Solomonoff/Levin | ∝ Z^k, K = 3 (q = .85/.13/.02/.003 at 5×5) | the exact Kraft weight 2^−cost(P) over *all* programs, by importance weights 2^−cost/r(P) on the library (r = random_program's law); Z = Σ_P 2^−cost(P) = 0.146 (5×5), 0.124 (4×4) |
| `mix.5_reach2`, `mix.9_reach2` | (c) | λ·δ0 + (1−λ)·U{0..2} | as reach2 |
| `emp:λ:i` | (d) empirical | — | ρ = λ·μ + (1−λ)·E_i, with E_i = snapshot grids from 40 training games calibrated with `emp:λ:i−1` |

Main GridTypes: Grid(5,base10,rgby) (82 families) and Grid(4,base12,rgb) (79 families). Every family
uses one fixed draw, seeded from the family id.

## 2. The sampler: latent-space multilevel splitting (`latent.py`)

The engine's splitting kernel (resample a cell, its symbol or its colour; swap two cells) leaves μ
restricted to a level set invariant. It does not do the same for a code prior ρ, which has no
tractable density. **Split on the latent space instead.** The latent prior
π(x, k, P_1..P_K) = μ(x)·q(k)·Πw(P_j) is a product, and every coordinate has a simple π-invariant
move:

* the four cell moves on x, which are symmetric under μ;
* redraw one active program slot from w;
* redraw k from q;
* swap two program slots, which are exchangeable.

Slots j > k are auxiliary. Each proposal leaves π invariant before the constraint is applied, so
"accept iff u(Φ(·)) ≥ level" is Metropolis for π restricted to {u∘Φ ≥ level}. Splitting on (x, k, P)
then estimates ρ{u ≥ t} = π{u∘Φ ≥ t} exactly as the engine's splitting estimates μ{u ≥ t}.

The rest of the procedure:

* **Body.** Monte Carlo on a shared 2^16-sample pool per (GridType, prior), down to about 9 bits.
* **Tail.** Splitting with 1000 particles. Each stage runs 0.75·N² cell moves interleaved 1:1 with
  program moves, down to 64 bits. Same SE formula and 1.6 inflation as the engine.
* **Caching.** Program chains are cached per particle, so a slot change re-runs only the programs
  after that slot.
* **Cost.** 3–15 s per table on 4×4 and 5×5; pools take 3–10 s per prior.
* **Recipes.** The deepest particles say how the top is made (`meta["recipe"]`). For example, under
  reach2 the commonest program at Conqueror's top is "Turn every green cell in the whole grid red."
  (26.3 bits).
* **All-or-nothing rules.** Picture Frame gives splitting no intermediate levels. `patch_top`
  promotes pool values with ≥ 8 hits to Monte Carlo levels. Failing that, it bounds the top by
  min(s_μ − log2 q0, max(s_last + 1, log2(n/3))) and flags it (`top_bounded`).

An importance-weighting alternative was rejected. Reweighting uniform-splitting particles by
ρ/μ needs the density ρ(y), which is a sum over all program sequences that can produce y, so it is
intractable. Conditioning on one program sequence at a time and splitting on x (u∘P) works for a
fixed P, but the mixture over about 1500^K sequences has to be sampled too, and that is exactly
what the slot moves do.

## 3. Validation (`python3 -m gridlab.explore.priors.validate`)

### 3.1 Exact toy

The library is 20 programs "paint row/column i red/blue", k ~ U{0..3}, and the score is the number
of red cells on Grid(5,base10,rgby). The exact tail is a mixture of shifted binomials over all
8,421 sequences. Reaching 25 red cells needs three disjoint red rows plus 10 lucky cells, so the
kernel must swap programs. Six seeds:

| t (#red) | exact bits | bias | sd | reported se |
|---|---|---|---|---|
| 18 | 7.47 | +0.02 | 0.08 | 0.08 |
| 20 | 10.71 | +0.03 | 0.09 | 0.21 |
| 22 | 15.54 | +0.02 | 0.20 | 0.30 |
| 24 | 22.63 | +0.00 | 0.14 | 0.46 |
| 25 | 27.65 | −0.09 | 0.43 | 0.61 |

Unbiased to 0.1 bit, and the reported se is conservative.

### 3.2 K = 0 against exact uniform tails

With K = 0 the latent sampler is the engine's estimator. Against exact tails the mean error is
−0.23 to +0.56 bits and the worst level is 1.22 bits off (Seed 3 at 45 bits, reported se 0.38).
The engine's own estimator on the same draws has a worst level of 0.75 bits.

### 3.3 Brute force

2^20 fresh ρ samples on held-out seeds, against the tables at every level beyond the pool body with
≥ 64 hits (9–14 bits). There are 24 (prior, family) cells for reach2, levin and beta.25.

| | value |
|---|---|
| mean differences per cell | −0.22 to +0.38 bits |
| rms z per cell | 0.21–1.81 (Stripe Painter under reach2 is the worst) |
| max \|z\| | 2.41 |

The p-value check, max over families of P_ρ(s ≥ k)·2^k for k = 2…12:

| prior | max ratio |
|---|---|
| reach2 | 0.94–1.29 |
| levin | 0.86–1.10 |
| beta.25 | 0.99–1.19 |

The excess at k = 12 is about the size of the 0.3-bit estimation error.

### 3.4 Replicates

Eight independently seeded pools and splittings per (family, prior):

* **levin:** the spread across seeds is 0.18–0.56 bits, against a reported se of 0.27–0.50.
* **reach2:** the spread is 0.21–0.85 bits, against a reported se of 0.28–0.45. **For reach priors
  the reported se understates the spread by about 2× at 32–40 bits.** The particles concentrate on
  a few programs, which the stage-independence formula ignores. Treat reach-prior se's at depth
  as ×2.

### 3.5 `gridlab/priors.py` (spliced tail) against latent splitting

`python3 -m gridlab.explore.priors.splice_check`. Both estimate the same prior: k ~ U{0..4},
programs ≤ 30 bits. The splice is Monte Carlo body plus the uniform tail's shape, and it agrees in
the body (± 1 bit at 16 bits). Beyond the body it cannot see that deep levels are reachable by code:

| family (Grid(5,base10,rgby)) | uniform ceiling | splice @24 / latent @24 | splice ceiling / latent ceiling |
|---|---|---|---|
| Gravity | 50 | 24 / 19 | 48 / 28 |
| Conqueror | 50 | 24 / 18 | 48 / 28 |
| Kingdom | 49 | 23 / 18 | 46 / 27 |
| Uno Snake | 39 | 23 / 20 | 37 / 24 |
| Lone Peak | 55 | 26 / 23 | 55 / 42 |
| Full House | 67 | 23 / 21 | 66 / 57 |

Over 82 families the splice is +3.6 bits high on average, and more than 5 bits high for 21 of them.
If the coordinator's experiments use `prior="reachable"`, they are measuring roughly a third of the
reach prior's real effect on clumpers.

## 4. Why the Levin prior equals the uniform prior here (theory, policy-free)

For any program P, utility u and level t, the mixture contains P's pushforward with weight
2^−cost(P). So

  s_Levin(t) ≤ min( s_μ(t) − log2 q0,  min_P [ cost(P) + s_{μ∘P⁻¹}(t) ] ).

The discount over uniform is the rarity a program buys in excess of its cost. For a deterministic
map, μ(P⁻¹U) ≤ |U|·max_y|P⁻¹(y)|/|Ω|, so the rarity bought is at most the Hartley erasure
log2 max|P⁻¹(y)|. Mutators are priced at at least the Shannon erasure, plus description and motion.
So the discount is bounded by the Shannon–Hartley gap of conditional maps such as `recolour` and
`stamp`. The DV bound in docs/mutators.md §1(b) is the expected-value version of the same fact.

Measured: median discount 0.0 bits and p90 0.8–1.1 bits. Ceiling medians are 25.1 vs 25.4 (4×4)
and 43.3 vs 44.1 (5×5).

**The cost model already says "rare = hard".** The brief's 2^−40 to 2^−80 monochrome and
constant-symbol states are reached by edits that are not cheap: a whole-grid paint costs 71 bits
(5×5) and a whole-grid write costs 120.

The cost-blind reach prior counts difficulty in programs, not bits. So it charges again for
difficulty that action costs already charge. Three whole-grid recolours make a monochrome RGBY grid
for 3 × 26.3 = 79 bits of energy, which is fair against 50 bits of rarity. Under reach2 the same
grid also loses 20 bits of rarity.

## 5. Per-family ceilings and yield per bit (policy-free; `measure.py`, `summarize.py`)

Definitions:

* **Ceiling:** the surprisal of the family's best known grid, capped at 64 bits (the samplers' depth).
* **Best yield:** max over the 4096 library programs of mean Δs / cost. The program is chosen on 64
  training grids and scored on 64 held-out grids.
* **Contexts:** fresh spawns, and *played* grids (snapshot grids from 40 uniform-calibrated games).

Fresh-spawn context:

| Grid(5,base10,rgby) | ceiling median | p90 discount | best yield median | SD log2 yield | Gini | camp median yield clum / alt / neut | clum/alt | rank corr vs uniform |
|---|---|---|---|---|---|---|---|---|
| uniform | 44.1 | 0 | 0.270 | 1.47 | 0.38 | 0.428 / 0.248 / 0.206 | 1.73 | 1 |
| reach2 | 38.7 | 8.8 | 0.265 | 1.39 | 0.36 | 0.372 / 0.242 / 0.210 | 1.54 | 0.96 |
| reach4 | 38.0 | 12.3 | 0.257 | 1.36 | 0.35 | 0.332 / 0.233 / 0.199 | 1.42 | 0.95 |
| beta.25 | 38.5 | 15.8 | 0.248 | 1.34 | 0.34 | 0.331 / 0.228 / 0.196 | 1.46 | 0.96 |
| levin | 43.3 | 1.1 | 0.271 | 1.47 | 0.38 | 0.434 / 0.250 / 0.205 | 1.74 | 0.99 |
| mix.5_reach2 | 38.6 | 9.6 | 0.267 | 1.40 | 0.36 | 0.383 / 0.246 / 0.209 | 1.55 | 0.96 |

| Grid(4,base12,rgb) | ceiling median | p90 discount | best yield median | SD log2 yield | Gini | clum / alt / neut | clum/alt | rank corr |
|---|---|---|---|---|---|---|---|---|
| uniform | 25.4 | 0 | 0.295 | 1.61 | 0.33 | 0.441 / 0.260 / 0.202 | 1.70 | 1 |
| reach2 | 23.8 | 7.2 | 0.294 | 1.55 | 0.30 | 0.361 / 0.235 / 0.199 | 1.54 | 0.96 |
| beta.25 | 21.7 | 15.5 | 0.270 | 1.46 | 0.26 | 0.321 / 0.235 / 0.198 | 1.36 | 0.90 |
| levin | 25.1 | 0.8 | 0.297 | 1.61 | 0.33 | 0.437 / 0.260 / 0.202 | 1.68 | 0.99 |

In the played-grid context the picture is the same. The camp ratio clum/alt goes 1.62 → 1.30 under
reach2 (5×5), and 1.52 → 1.12 under beta.25 (4×4). SD log2 yield falls by at most 0.17.

Readings:

* **Who gets discounted.** The top discounts under reach2 are all clumpers.
  * 5×5: Conqueror, Kingdom, Connect Four, Gravity and Flag Bearer each lose 18–20 bits. The
    deepest particles' commonest program is "Turn every X cell in the whole grid red", at 26.3 bits.
  * 4×4: Set Spotter, Times Table Territory and Snap lose 10–11 bits, mainly via "Stamp s on every
    red cell in the 3×3 square" (28.3 bits). Conqueror and Kingdom lose 7–8 bits via whole-grid
    recolour (23.3 bits).

  These are the conditional overwrites that docs/mutators.md §6 risk 4 flags as priced at the prior.
  Under `erasure = "hartley"` they cost 38.8 (recolour, 5×5) and 48–50 bits (stamp 3×3).
* **What no prior changes.** The low end of the yield distribution stays where it is. Magic
  Accountant (0.003), Sudoku Scholar (0.013), Robin Hood (0.030), Number Sandwich (0.032), Quilt
  Maker (0.043) and Lantern Lighter (0.061) are starved because no mutator makes their structure
  efficiently. A prior can only lower bits, and these families have none to lower. The yield
  spread (SD log2 yield 1.3–1.6) is dominated by this tail under every prior.
* **Tool diversity.** 16–17 distinct mutators are some family's best tool under every prior, so the
  prior does not change which mutators are useful.

## 6. In-game effects (policy-dependent; `games.py`, `fairdiff.py`)

The setup:

* 200 paired games: 100 each on Grid(5,base10,rgby) and Grid(4,base12,rgb), seeds 700000+.
* Engine defaults at 100 Hz (`experiments.common.BASE`).
* 3–6 gods per game, with policies mixed from random / greedy_private / saver / greedy_omniscient.
* The same specs under every prior. Δ = prior − uniform, with a paired game-bootstrap 95% CI;
  `*` marks a CI that excludes 0.

| metric | uniform | reach2 | beta.25 | levin | mix.5_reach2 | emp:0.5:1 |
|---|---|---|---|---|---|---|
| dynamism2 | 0.541 | −0.006 [−0.011, −0.000]* | −0.006 [−0.012, −0.000]* | −0.004 [−0.008, +0.000] | −0.005 [−0.010, +0.000] | −0.098 [−0.11, −0.087]* |
| dynamism (v1) | 0.725 | +0.000 | −0.003 | −0.003 | +0.000 | +0.012 [+0.005, +0.019]* |
| snap_tension | 0.275 | −0.009* | −0.010* | −0.002 | −0.005* | −0.099* |
| held accelerating climbs /100 s | 0.98 | −0.04 | −0.00 | −0.01 | −0.03 | −0.54* |
| spirals /100 commits | 8.62 | −0.01 | +0.02 | −0.01 | −0.00 | +0.12* |
| leaderboard crossings /pair/100 s | 3.24 | +0.00 | −0.01 | +0.05 | +0.03 | +0.42 [+0.17, +0.66]* |
| objects ≥ 20 bits (obj_hot_share) | 0.80 | −0.018* | −0.027* | −0.002 | −0.007 | −0.43* |
| peak object salience (bits) | 43.3 | −5.3* | −8.6* | −0.5 | −3.5* | −22.9* |
| payoff Gini | 0.251 | −0.012* | −0.013* | −0.003 | −0.004 | −0.081* |

Fairness, by paired game bootstrap with 300 resamples:

| prior | family z SD (policy-adjusted) | Δ (95% CI) | clumper − alternator mean z | Δ (95% CI) |
|---|---|---|---|---|
| uniform | 0.208 | — | 0.261 | — |
| reach2 | 0.206 | −0.002 [−0.012, +0.010] | 0.255 | −0.005 [−0.031, +0.019] |
| beta.25 | 0.206 | +0.000 [−0.012, +0.012] | 0.256 | −0.005 [−0.038, +0.022] |
| levin | 0.205 | −0.003 [−0.011, +0.007] | 0.259 | −0.000 [−0.022, +0.019] |
| mix.5_reach2 | 0.203 | −0.003 [−0.014, +0.006] | 0.256 | −0.005 [−0.030, +0.019] |
| emp:0.5:1 | 0.148 | −0.049 [−0.071, −0.025] | 0.097 | −0.161 [−0.209, −0.115] |

Excess family SD (beyond sampling noise, `common.family_fairness`) is 0.188 under uniform; reach2,
beta.25, levin and mix.5_reach2 give 0.182–0.187 and emp:0.5:1 gives 0.113. The share of families
whose CI excludes fair is 0.41 under uniform and 0.22 under emp.

What this shows:

* **Code priors.** Discounting clumper jackpots by 5–9 bits of peak salience does not change who
  wins. In the games clumpers win through everyday commits, not jackpots, and the same cheap moves
  stay just as useful (rank correlation of yields 0.96).
* **The empirical prior.** It compresses whatever games routinely make: on held-out game grids,
  p99 surprisal falls 18 → 7 bits. Payoffs flatten across families. Scale-free signals of
  dynamism *rise*: leaderboard crossings, spirals per commit and dynamism v1. The threshold-based
  dynamism2 falls, because its components count objects ≥ 20 bits, 2-bit tension steps and 8-bit
  climbs. §7 separates the change of units from a real change.

## 7. Empirical prior: fixed point and held-out confirmation

### Fixed point (`python3 -m gridlab.explore.priors.empirical`)

Grid(4,base12,rgb), λ = ½, 40 training games per iteration on seeds 900000+, 3037 held-out
reference grids:

| iteration | mean s on reference grids | p99 s | mean \|Δs\| vs previous | max family mean \|Δs\| | training dyn2 |
|---|---|---|---|---|---|
| 0 (uniform) | 1.76 | 18.2 | — | — | 0.516 |
| 1 | 1.18 | 6.6 | 0.670 | 5.25 | 0.406 |
| 2 | 1.19 | 6.9 | 0.044 | 0.18 | 0.411 |
| 3 | 1.19 | 6.9 | 0.014 | 0.05 | 0.419 |
| 4 | 1.19 | 6.9 | 0.016 | 0.06 | 0.415 |

It converges (contracts) in two steps; the residual 0.015 bits is Monte Carlo noise of 40 games.
The λ mixture is what makes the map contractive: it bounds s_E ≤ s_μ + 1 and keeps every table
finite.

EMP5_PLACEHOLDER

### Held-out games (`python3 -m gridlab.explore.priors.heldout`)

HELDOUT_PLACEHOLDER

## 8. Stability and determinism (production; `stability.py`)

Grid(4,base12,rgb), 12 families, 2000 held-out game grids. Mean |Δs| on game grids, and at the
ceiling. Perturbations:

* **seed:** an independent sampler seed;
* **library:** an independently drawn 4096-program catalogue;
* **knob:** `COST_KNOBS["move"]` 0.35 → 0.50.

| prior | seed: grids / ceiling (max) | library: grids / ceiling (max) | knob: grids / ceiling (max) |
|---|---|---|---|
| uniform | 0.019 / 0.91 (6.7, above 64 bits) | 0 (no programs) | 0 (no costs) |
| reach2 | 0.021 / 0.67 (1.4) | 0.033 / 2.80 (13.3) | 0.024 / 0.83 (1.7) |
| beta.25 | 0.059 / 3.34 (20.5) | 0.047 / 4.64 (26.8) | 0.033 / 6.18 (37.1) |
| levin | 0.024 / 0.55 (1.4) | 0.027 / 0.69 (1.9) | 0.021 / 0.68 (2.4) |
| mix.5_reach2 | 0.020 / 0.31 (0.8) | 0.032 / 2.86 (16.6) | 0.025 / 0.62 (2.0) |

* **Uniform.** Tables depend only on the rule and the GridType. Exact tails are possible, and 8
  families have them. Tables never move when mutators, costs or the catalogue change.
* **Code priors.** Every table depends on the program catalogue and on `COST_KNOBS`, so retuning an
  economy knob silently re-scores every utility. With β = ¼ that shift reaches 37 bits.
  Determinism holds: everything is seeded from sha256 of the spec, GridType, library and family.
  But the same draw scores differently after any mutator edit, which makes cross-version leaderboards
  meaningless.
* **Empirical prior.** It depends on the policies, dealers and the whole simulator, and must be
  rebuilt after any change. In production it would come from real games, so it shifts as the
  player population learns.
* **Cost to compute.** Uniform tables cost 0.4–10 s, or are exact. Latent tables cost 3–15 s plus a
  shared pool. Empirical tables are free given a pool, but the pool costs 40 games per iteration.

## 9. Explainable to kids?

* **Uniform:** "✨ rarity = how many coin flips in a row you'd need to get a grid this good by
  luck". This is exact, and it is the same for everyone.
* **Levin:** "how many bits of energy *or* luck you'd need to make it". It is the natural "how hard
  is this to make" story, and here it gives the same numbers as uniform, because a gram of energy
  is a bit of luck by construction (erasure pricing). So the uniform story *is* the hardness story.
  Say so in the UI: "Rarity in bits = luck you'd need = energy it would cost to force it."
* **Reach:** "how rare this is among grids that a few random cheap agents make". This needs the
  catalogue, a 30-bit cliff (a 31-bit program counts as luck) and a count of programs, which has no
  unit kids can feel. Not explainable.
* **Empirical:** "how unusual this is compared with grids people make in games". Easy to say, but
  it changes from week to week, and kids would see their score for the same grid drift.

## 10. Recommendations

1. **Production prior: uniform spawn, unchanged.** It is the Levin prior to within about 1 bit at
   p90, and it is stable, exact where proven and explainable. Do not merge a code-reachable prior.
   If `gridlab/priors.py` (`prior="reachable"`) is kept for experiments, replace the spliced tail
   with `explore.priors.latent.survival(draw, gtype, "reach4")`: the splice is up to 21 bits off.
2. **Fix the clumper advantage where the reach prior points, in mutator pricing rather than
   calibration.** The programs that make clumper jackpots "free" under every cost-blind prior are
   conditional overwrites priced at their *prior* (Shannon) erasure: whole-grid `recolour` (23–26
   bits) and block/global `stamp` (≈28 bits). Candidates, for the worker who owns cost knobs:
   * price conditional overwrites at Hartley erasure, which gives recolour-all 38.8 and stamp-3×3
     48 bits on 5×5;
   * or raise `scope.global` for `recolour` only.

   The policy-free yields say this compresses the clum/alt yield ratio. Under reach priors, which
   discount exactly these routes, that ratio drops from 1.7 to 1.4–1.5, and the empirical prior's
   game result shows the camp gap can close from 0.26 to about 0.10. This is a hypothesis for the
   integration run; I did not run games with Hartley pricing here.
3. **Starved families need rules or mutator work, not calibration.** Magic Accountant, Sudoku
   Scholar, Robin Hood, Number Sandwich, Quilt Maker, Tetromino Tamer and Lantern Lighter have best
   yield < 0.06 bits/bit under every prior. Either add a tool, or drop them from the dealer
   (`dealer_exclude`).
4. **Use the empirical prior as a monitoring and design tool, not as the score.** Rebuild it from
   recent games, iterate once (it is at the fixed point after two), and watch:
   * per-family ceiling discounts: a family whose ceiling the games routinely reach is over-served
     by the mutators;
   * the clum − alt gap under emp vs uniform.

   If designers want its fairness in the score anyway, use a mixture with a large uniform share
   (λ ≥ 0.9, §7 held-out) and a rescale that keeps the uniform prior's bit scale. Freeze the pool
   per season so scores don't drift.
5. **If a code prior is ever wanted**, use `levin` (exact Kraft weights) or `mix.9_reach2`, never
   β-tempered weights. β = ¼ is the most unstable: up to 37 bits of shift from a knob retune and
   20 bits of seed noise at the ceiling.

## 11. Reproduce

All commands run from `lib/grid-lab`, on 4 cores. Times are wall-clock on a cold cache.

```
python3 -m gridlab.explore.priors.validate                      # §3, ≈25 min
python3 -m gridlab.explore.priors.measure --type 4,base12,rgb   # §5, ≈30 min (9 priors)
python3 -m gridlab.explore.priors.measure --type 5,base10,rgby  # §5, ≈90 min
python3 -m gridlab.explore.priors.measure --type 5,base10,rgby --context played --priors uniform,reach2,reach4,beta.25,levin,mix.5_reach2
python3 -m gridlab.explore.priors.summarize [--context played]  # §5 tables
python3 -m gridlab.explore.priors.splice_check --type 5,base10,rgby   # §3.5
python3 -m gridlab.explore.priors.games --types "5,base10,rgby;4,base12,rgb" --games 100 --seed 700000 \
    --priors uniform,reach2,beta.25,levin,mix.5_reach2,emp:0.5:1                           # §6, ≈90 min
python3 -m gridlab.explore.priors.fairdiff                       # §6 fairness CIs
python3 -m gridlab.explore.priors.empirical --type 4,base12,rgb --lam 0.5 --iters 4       # §7
python3 -m gridlab.explore.priors.heldout --seed 800000 --games 60 \
    --priors "uniform,levin,mix.5_reach2,emp:0.5:1,emp:0.5:1*2.1,emp:0.9:1,uniform*0.5"   # §7
python3 -m gridlab.explore.priors.stability --type 4,base12,rgb  # §8
```

Caveats:

* There is one draw per family in §5. In-game fairness uses the dealer's random draws.
* The per-GridType fairness tables have only 15–16 families with ≥ 8 god-slots, so the pooled
  numbers above are the ones to trust.
* Every in-game finding depends on the four simulated policies. §4, §5 and §8 do not.
* For reach priors the reported se understates the replicate spread by about 2× at depth (§3.4).
