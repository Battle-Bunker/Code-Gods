# The GridType landscape, and beginner defaults

Exploration topic `gridtypes` (branch `claude/gridlab-explore-gridtypes`). Code:
`gridlab/explore/gridtypes/` (`landscape.py`, `games.py`, `analyse.py`). The code base is
`claude/charming-curie-s44esg` at **3614e19**, before PR #7 (tuple ordinals, ESTIMATOR_VERSION 3), so
absolute surprisal values follow the older estimator.

**Shared modules changed: none.** Legibility needs the number of cells each commit changes, which the
`GameLog` does not record. `games.py` captures it by wrapping `World.objects` in a recording list
inside its own worker processes. The simulator commits only through `objects[oi] = new`.

## 0. Summary

| question | answer (evidence below) |
|---|---|
| Beginner default | **Grid(4,base10,rgb)**: digits and three primary colours. Its dynamism is close to 5×5: equal in training (0.533 vs 0.545) and with greedy-only gods (0.518 vs 0.516), and 0.03 lower on held-out seeds. Changes are 1.2–1.3× more legible than on 5×5. Only 5 of 79 families have a ceiling under 12 bits, against 25 of 76 on 3×3. |
| Progression | 4×4 base10 rgb → 5×5 base10 rgby (the current reference) → 6×6 with base12/base16 or cards → 7×7 with rainbow6 for experts. Symbol and colour sets barely change the dynamics, so introduce them for variety and theme, not difficulty. |
| Degenerate | **All of size 3** in competitive play: about 45% of families cap below 16 bits, objects flicker (autocorr 0.13–0.20 vs 0.25 at 5×5), and dynamism2 is lowest. **Grid(3,cards,rainbow6)** is the worst point: 52 symbols on 9 cells, and the lowest dynamism (0.484 training, 0.483 held out) and tension of all 25 types. 7×7 is not "too noisy" in its dynamics: under the mixed policy mix it is the most dynamic, though not with greedy-only gods (§3.5). It is, however, the least legible (each change touches 6 cells, 12% of the grid) and it prices out every global mutator. |
| Retire / add | Retire size 3 as a competitive size, and keep it only for a tutorial with a restricted family pool. Retire nothing else. Symbol and colour sets each move the metrics by less than the seed-to-seed noise. Don't add size 8+: the trend in legibility and global-mutator cost continues the wrong way. |
| What GridType controls | Ceilings, legibility and the mutator mix: the additive model explains 84% of per-game variance in cells-per-change share and 60% of legible-change rate. Dynamism and fairness are governed by the dealt families and policies: GridType explains only 4% of per-game dynamism2, and family unfairness is the same at every size. |

## 1. Method

**Policy-free landscape (all 60 GridTypes).** `python3 -m gridlab.explore.gridtypes.landscape` covers every
family available in every GridType, with the 3 fixed draws per family that
`experiments.common.family_ceiling` uses. For each it calibrates the survival table and records:

- the **ceiling**: surprisal of the family's exemplar, or the deepest calibrated level;
- the number of ordinal levels;
- a spawn's surprisal;
- the **one-cell sensitivity**: P(|Δs| ≥ 1 bit) and E|Δs| when one random cell of a spawn is redrawn.

It also records reference mutator costs and the 4096-program library's cost quantiles against the
economy (100 starting energy, +1 per second). In all, 60 GridTypes and about 14,600 draws were calibrated.

**Games.** `python3 -m gridlab.explore.gridtypes.games` runs 25 GridTypes:

- **20 from a balanced design**: size i × symbol set j with colour set (i + j) mod 3. Every size appears
  4×, every symbol set 5×, and each size and each symbol set meets all three colour sets.
- **5 extra progression and reference points**: 4,base10,rgb; 5,base10,rgb; 5,base10,rgby;
  7,base16,rainbow6; 3,cards,rainbow6.

Setting: `experiments.common.BASE`, the engine defaults as delivered, at the real 100 Hz. That means
energy 100 + 1/s, exponential length with half-life 300 s, the `distinct` dealer and 3–6 gods. Each
god's policy is drawn iid from {random, greedy_private, saver, greedy_omniscient}.

- **Training**: 64 games per type, seed 1 (1600 games).
- **Held out**: 24 games per type, seed 9000000 (600 games).
- **Policy robustness**: 24 all-`greedy_private` games on 6 types.

The specs are common across GridTypes only in their construction, not paired.

**Models.** `python3 -m gridlab.explore.gridtypes.analyse` fits metric ~ C(size) + C(symbols) + C(colours)
by OLS on per-game values. The reference cell is Grid(5,base10,rgby), and SEs are HC1-robust. It reports:

- R² on games and R² on type means;
- the held-out check: correlation between the training model's predicted type means and the held-out
  type means.

**Legibility proxies** (per game; a *god-commit* is one god's surprisal on one committed transformation):

| metric | meaning |
|---|---|
| `cells_mean`, `cells_frac` | cells changed per commit, and that as a share of the grid |
| `vis_rate` | share of god-commits whose surprisal moves ≥ 1 bit (a change a player notices) |
| `flicker_rate` | share of god-commits where it moves between 0.01 and 1 bit (the number twitches; nothing to see) |
| `legible_rate` | share of god-commits with a ≥ 1 bit move caused by a commit touching ≤ 3 cells |
| `legible_share` | `legible_rate / vis_rate`: of the noticeable moves, how many can be traced to a few cells |
| `bits_per_cell` | median \|Δs\| / cells changed, over noticeable moves |
| `vis_per_obj_min` | noticeable moves of one god's number per object per minute |

## 2. Policy-free landscape (all 60 GridTypes)

Marginal means over the full 5×4×3 factorial. The additive model's R² is ≥ 0.94 for every row except
`ceil_cv` (0.83), so the three parameters act almost independently.

| metric | N=3 | N=4 | N=5 | N=6 | N=7 | base10 | base12 | base16 | cards | rgb | rgby | rainbow6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| families available | 78.3 | 81.4 | 81.7 | 81.4 | 81.7 | 81 | 81 | 81 | 80.6 | 78.3 | 81.3 | 83.1 |
| mutators available | 23.9 | 23.9 | 23.9 | 23.9 | 23.9 | 23.7 | 23.7 | 23.7 | 24.7 | 23.2 | 24.2 | 24.2 |
| median family ceiling (bits) | **17.5** | 30.7 | 48.2 | 65.5 | 73.7 | 46.4 | 47.0 | 47.3 | 47.7 | 41.5 | 47.2 | 52.7 |
| 10th-pct family ceiling | **8.0** | 15.5 | 24.9 | 32.1 | 37.5 | 22.0 | 21.8 | 23.6 | 27.1 | 22.9 | 23.9 | 24.1 |
| share of families with ceiling < 16 bits | **0.45** | 0.12 | 0.05 | 0.03 | 0.02 | 0.14 | 0.14 | 0.14 | 0.12 | 0.17 | 0.13 | 0.12 |
| ceiling CV across families | 0.60 | 0.57 | 0.50 | 0.50 | 0.57 | 0.53 | 0.54 | 0.56 | 0.57 | 0.57 | 0.54 | 0.53 |
| P(\|Δs\| ≥ 1) for one random cell (median family) | 0.13 | 0.09 | 0.065 | 0.048 | 0.037 | 0.078 | 0.075 | 0.073 | 0.072 | 0.076 | 0.075 | 0.073 |
| E\|Δs\| for one random cell (bits) | 0.34 | 0.26 | 0.21 | 0.18 | 0.15 | 0.23 | 0.23 | 0.22 | 0.23 | 0.24 | 0.23 | 0.21 |
| ordinal levels (median family) | 11.5 | 24.5 | 41.6 | 60.7 | 76.1 | 42.7 | 42.4 | 42.0 | 44.5 | 42.2 | 42.5 | 43.9 |
| paint one cell (bits) | 14.7 | 15.7 | 16.4 | 16.9 | 17.3 | 16.2 | 16.2 | 16.2 | 16.2 | 15.2 | 16.1 | 17.3 |
| paint whole grid (bits) | 31.8 | 49.3 | 71.6 | **98.9** | **131** | 76.5 | 76.5 | 76.5 | 76.6 | 58.5 | 74.2 | 96.9 |
| whole-grid fill ÷ one-cell paint | 2.1 | 3.1 | 4.4 | 5.8 | 7.5 | 4.6 | 4.6 | 4.6 | 4.6 | 3.8 | 4.5 | 5.5 |
| write whole grid (bits) | 60.5 | 98.7 | 148 | 208 | 278 | 126 | 136 | 153 | 219 | 158 | 159 | 159 |
| library median program cost (bits) | 30.8 | 35.3 | 37.8 | 40.8 | 42.9 | 36.6 | 37.0 | 38.1 | 38.3 | 36.7 | 37.3 | 38.5 |
| library share affordable at start (≤ 100 bits) | 1.00 | 0.96 | 0.90 | 0.83 | 0.79 | 0.91 | 0.90 | 0.90 | 0.88 | 0.91 | 0.90 | 0.88 |
| bits in one object, N²(log₂S + log₂C) | 56 | 99 | 155 | 224 | 304 | 145 | 152 | 164 | 209 | 155 | 166 | 182 |

Readings (none of these depend on policies):

1. **Size drives everything; symbols and colours barely matter.** Families available: 76–84 everywhere.
   - Cards add 4 card families and lose the 4 Numeral ones.
   - rgby/rainbow6 add the Spectral, Mixable and Wheel families (Rainbow Roads, Paint Mixer, Colour Mixer,
     Colour Carousel, Colour Wheel Harmony).
   - Castle Keeper, Swiss Cheese and Connect Four need N ≥ 4; Royal Court needs odd N.
2. **Ceilings.** On 3×3 the median family tops out at 17.5 bits, and 7 of 76 families on Grid(3,base10,rgb)
   cap below 8 bits:

   | family | ceiling (bits) |
   |---|---|
   | Ladder of Numbers | 2.6 |
   | Bridge Builder | 2.9 |
   | Sudoku | 4.1 |
   | Wallpaper Weaver | 4.7 |
   | Tetromino | 5.6 |
   | Lantern Lighter | 5.7 |
   | Homebody | 6.3 |

   A god dealt one of these can never own a hot object. From N = 5 up, most estimated ceilings sit at the
   calibration target (≈ 64–76 bits), so the "fairness" of ceilings at large N is partly an estimator cap.

   Exact-tail families (Green Ones, Lucky Token) have analytic ceilings of 140–300 bits at N ≥ 5. In games
   they peak at about 63–68 bits on 7×7, and their policy-adjusted rank score is only mildly above average
   (0.54–0.68), so the uncapped exact tail is a latent risk rather than an observed one.
3. **Families whose ceiling barely grows with size.** These stay starved at every size, so they are a
   family problem, not a GridType problem:

   | family | ceiling N=3 → N=7 (bits) |
   |---|---|
   | Bridge Builder | 4 → 10 |
   | Ladder of Numbers | 3 → 12 |
   | Lantern Lighter | 6 → 20 |
   | Column Addition | 11 → 25 |
   | Divisibility | 12 → 32 |
   | Sudoku | 3 → 29 |

   The full per-family table is in the generated report.
4. **Economy.**
   - Local and line mutators cost about the same at every size: a cell paint is 15–17 bits, the median
     program 31–43.
   - Global ones scale with N². A whole-grid colour fill costs 32 bits on 3×3 (two cell paints, so a
     monochrome jackpot is cheap) and 131 bits on 7×7, which is more than the 100-bit starting energy.
     A whole-grid write costs 278 bits on 7×7.
   - So on 6×6 and 7×7, global overwrites are unaffordable for the first 30–180 s and rarely worth it after
     (§3.4). On 3×3 everything is affordable at the start (library 100% ≤ 100 bits).
5. **One-cell sensitivity falls with size.** P(noticeable change from one cell) goes 0.13 → 0.037.
   A kid who changes one cell on 3×3 sees their number move about 1 time in 8; on 7×7 about 1 time in 27.
   Bigger grids need more cells changed per noticeable effect.

## 3. Games: what changes across GridTypes

Per-type means, from 64 training games per type. ± is the 95% bootstrap half-width, about ±0.03 for
dynamism2. The full table, with 40+ metrics, is in the generated report (`report.md`). Selected rows:

| GridType | dyn2 | sig. tension | held accel. climbs /100 s | snap autocorr | cells / commit | legible share | bits / cell | noticeable own-number jumps / object / min | global mutators' share (paint+motif+turn_grid+write) |
|---|---|---|---|---|---|---|---|---|---|
| (3,base10,rgb) | 0.501 | 0.199 | 0.51 | 0.13 | 3.3 | 0.57 | 0.87 | 16.9 | 12.4% |
| (3,cards,rainbow6) | 0.484 | 0.126 | 0.51 | 0.15 | 3.2 | 0.59 | 0.90 | 15.1 | 9.5% |
| (4,base10,rgb) | 0.533 | 0.146 | 0.75 | 0.23 | 4.3 | 0.37 | 0.62 | 12.2 | 9.5% |
| (4,base10,rgby) | 0.528 | 0.141 | 1.00 | 0.20 | 4.3 | 0.35 | 0.68 | 12.5 | 10.0% |
| (5,base10,rgby) | 0.545 | 0.129 | 0.79 | 0.26 | 4.7 | 0.31 | 0.57 | 13.8 | 7.9% |
| (6,base16,rainbow6) | 0.589 | 0.101 | 1.32 | 0.40 | 5.4 | 0.22 | 0.47 | 10.4 | 4.5% |
| (7,base16,rainbow6) | 0.583 | 0.081 | 1.37 | 0.44 | 5.8 | 0.21 | 0.44 | 11.8 | 3.3% |
| (7,cards,rgby) | 0.610 | 0.087 | 1.09 | 0.44 | 5.6 | 0.22 | 0.47 | 10.2 | 4.4% |

### 3.1 Models: metric ~ size + symbols + colours

Coefficients are differences from Grid(5,base10,rgby); * means the 95% CI excludes 0. "R² games" is
per-game, "R² means" is on the 25 type means, and "held-out r" is the correlation between the training
model's predictions and the held-out type means (24 games/type, seed 9000000).

| metric | R² (games) | R² type means | held-out r (type means) | size 3 | size 4 | size 6 | size 7 | base12 | base16 | cards | rgb | rainbow6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dynamism2 | 0.04 | 0.77 | 0.77 | -0.0397* | -0.000565 | +0.0126 | +0.0349* | +0.0258* | +0.0167 | +0.0137 | +0.00808 | +0.00378 |
| sig_tension_rate | 0.15 | 0.93 | 0.88 | +0.047* | +0.0254* | -0.0166* | -0.0251* | +0.00363 | +0.0036 | -0.0164* | +0.0133* | -0.0175* |
| durable_lead_changes_per_obj_100s | 0.03 | 0.75 | 0.62 | -0.206* | -0.00214 | +0.0757 | +0.135* | +0.0573 | +0.0378 | -0.0197 | -0.00449 | +0.0174 |
| spirals_per_100_commits | 0.09 | 0.88 | 0.83 | -0.533* | -0.178 | +0.224 | +0.429* | +0.225 | -0.0012 | -0.332* | +0.338* | -0.688* |
| climbs_held_accel_per_100s | 0.03 | 0.80 | 0.64 | -0.342* | +0.0571 | +0.267 | +0.325* | +0.195 | +0.00568 | +0.0228 | +0.0113 | +0.189 |
| crossings_per_pair_100s | 0.05 | 0.87 | 0.69 | +0.781* | +0.179 | -0.0974 | -0.565* | -0.0969 | -0.0884 | +0.0268 | +0.0759 | +0.0343 |
| snap_autocorr | 0.17 | 0.95 | 0.89 | -0.122* | -0.0303 | +0.064* | +0.155* | +0.0313* | +0.0223 | +0.0468* | +0.00943 | +0.032* |
| steal_rate | 0.10 | 0.94 | 0.76 | +0.0136* | +0.00777* | -0.00737* | -0.00738* | +0.00209 | +0.00298 | -0.00332 | +0.0023 | -0.00597* |
| mutator_entropy_norm | 0.21 | 0.95 | 0.83 | +0.034* | +0.0188* | -0.0196* | -0.0311* | -0.00204 | -0.00573 | +0.00202 | -0.00557 | -0.00919* |
| energy_unspent_share | 0.02 | 0.68 | 0.72 | +0.0246* | +0.00855 | -0.00677 | -0.00751 | +0.000306 | -0.000867 | -0.000795 | -0.00217 | -0.0144* |
| cells_mean | 0.59 | 0.99 | 0.99 | -1.56* | -0.548* | +0.835* | +1.1* | +0.00832 | +0.013 | -0.176* | +0.106* | -0.0977 |
| cells_frac | 0.84 | 1.00 | 1.00 | +0.163* | +0.0738* | -0.035* | -0.0705* | -0.00102 | -0.000247 | -0.00836* | +0.0041 | -0.00296 |
| vis_rate | 0.18 | 0.96 | 0.91 | +0.0405* | +0.0182* | -0.0146* | -0.0278* | -0.00103 | +1.23e-05 | -0.0214* | +0.011* | -0.0207* |
| flicker_rate | 0.23 | 0.96 | 0.92 | -0.0585* | -0.0268* | +0.0222* | +0.0354* | +0.00134 | -0.00843 | -0.00531 | +0.0117* | -0.03* |
| legible_rate | 0.60 | 0.99 | 0.99 | +0.0775* | +0.018* | -0.017* | -0.0206* | +0.000715 | -3.3e-05 | -0.00705* | +0.00461* | -0.0088* |
| legible_share | 0.74 | 1.00 | 0.99 | +0.287* | +0.0612* | -0.0704* | -0.0837* | +0.00463 | +0.00325 | +0.00926 | +0.00205 | -0.00736 |
| bits_per_cell | 0.48 | 0.98 | 0.96 | +0.32* | +0.11* | -0.102* | -0.134* | +0.0202 | +0.0266* | +0.0197 | +0.00664 | +0.0112 |
| vis_per_obj_min_own | 0.02 | 0.62 | 0.48 | +1.61* | -0.662 | -0.884 | -1.72* | -0.429 | -0.576 | -1.05 | +1.09 | -0.308 |
| late_progress | 0.06 | 0.86 | 0.85 | -0.00167* | -0.000232 | +0.000858 | +0.00258* | +0.000478 | -0.000388 | +0.00047 | -0.000239 | +0.000808 |
| ceil_spread | 0.10 | 0.92 | 0.62 | -25.1* | -7.15* | +7.5* | +20.9* | +3.64 | -0.532 | -0.541 | +2.24 | +3.65 |
| ceil_rank_corr | 0.00 | 0.38 | 0.44 | -0.0289 | +0.0152 | +0.0159 | +0.00723 | +0.0365 | -0.00758 | +0.00043 | +0.0656 | +0.0662 |
| max_s_peak_mean | 0.12 | 0.92 | 0.88 | -7.47* | -1.72* | +2.74* | +3.69* | +2.2* | +1.43 | -0.108 | +0.676 | +0.374 |

What the models say:

- **Size is the only parameter with large, consistent effects.** Symbol set and colour set coefficients are
  mostly within noise. The exceptions:
  - rainbow6 lowers tension (−0.018), spirals (−0.7 per 100 commits) and noticeable moves, because there
    are more colours and so each colour rule changes less often;
  - cards lower tension (−0.016) and noticeable moves slightly.
- **Dynamism2 rises with size**: −0.040 at N=3, +0.035 at N=7, against a baseline of 0.545. The rise is
  carried by *memory* (snapshot autocorrelation 0.13 → 0.44: objects hold their value), durable lead
  changes and held accelerating climbs. Raw per-commit tension *falls* with size (0.20 → 0.08), because
  each commit touches a smaller share of the grid and so of everyone's rules.
  - Small grids: tense and flickery.
  - Large grids: calm, persistent, with longer climbs.
- **GridType explains little of an individual game.** R² is 0.04 for dynamism2 and 0.03 for climbs, but
  0.77–0.88 of the type means. Whether a game is dynamic depends on the dealt families and policies far more
  than on the GridType, so a GridType choice shifts the average by at most about 0.1 SD of game-to-game
  variation.
- **Legibility is the most GridType-dependent outcome** (R² 0.48–0.84 per game, 0.98–1.00 on means). From
  3×3 to 7×7:
  - legible share falls from 0.57 to 0.21;
  - bits per changed cell halve;
  - cells per commit rise from 3.2 to 6.0;
  - 3×3 commits touch 35% of the grid each, 7×7 commits 12%.

  So "fewer cells change" (good) and "a smaller share of the grid changes" (bad on small grids, where one
  commit rewrites a third of the object) pull in opposite directions. 4×4 is the compromise: 4.3 cells
  (27% of the grid), and still 37% of noticeable moves traceable to ≤ 3 cells.
- **Noticeable jumps are too frequent for a child at 100 Hz, at every size.** A player watching one grid
  sees their own number jump about 10–17 times a minute, and about 35–57 times a minute counting all
  gods' agents. That is set by the interaction rate (about 3.5 hits per object per second), not the
  GridType. For a beginner mode, the interaction rate matters more for legibility than the GridType.
  That is outside this topic, but it is flagged for the integrated tuning.

### 3.2 Stagnation

The engine's `stagnation_frac` is 1.00 in all 1600 training games, at every GridType: at 100 Hz the world
never goes quiet. The failure mode is instead a **treadmill**:

- `churn` = 1 − net/gross salience change is 0.97–0.996;
- in the last 40% of the game, net salience progress is only 0.1–0.8% of the gross movement.

Objects reach their equilibrium within the first minute or two and are then rewritten back and forth. The
treadmill is slightly weaker on large grids (late progress +0.0026 at N=7 vs −0.0017 at N=3, both *),
but it is universal: no GridType escapes it. Fixing it is an economy and mutator question (agent
lifetimes, metabolic costs), not a GridType one.

### 3.3 Fairness across GridTypes

Policy-adjusted family rank score z: 0.5 is fair. All 2200 games:

**Fairness by size**

| group | games | families n≥10 | SD adj z | excess SD | share CI∌0.5 | corr(ceiling, rank score) within game |
|---|---|---|---|---|---|---|
| 3 | 440 | 81 | 0.196 | 0.186 | 0.49 | +0.153 [+0.098, +0.202] |
| 4 | 440 | 82 | 0.193 | 0.183 | 0.51 | +0.163 [+0.108, +0.210] |
| 5 | 528 | 84 | 0.181 | 0.172 | 0.51 | +0.160 [+0.112, +0.207] |
| 6 | 352 | 80 | 0.197 | 0.186 | 0.46 | +0.189 [+0.127, +0.247] |
| 7 | 440 | 83 | 0.196 | 0.186 | 0.52 | +0.181 [+0.133, +0.224] |

**Fairness by symbol set**

| group | games | families n≥10 | SD adj z | excess SD | share CI∌0.5 | corr(ceiling, rank score) within game |
|---|---|---|---|---|---|---|
| base10 | 704 | 82 | 0.185 | 0.178 | 0.56 | +0.159 [+0.124, +0.199] |
| base12 | 440 | 81 | 0.203 | 0.194 | 0.54 | +0.188 [+0.140, +0.240] |
| base16 | 528 | 84 | 0.189 | 0.180 | 0.50 | +0.168 [+0.125, +0.215] |
| cards | 528 | 83 | 0.183 | 0.174 | 0.52 | +0.164 [+0.120, +0.215] |

**Fairness by colour set**

| group | games | families n≥10 | SD adj z | excess SD | share CI∌0.5 | corr(ceiling, rank score) within game |
|---|---|---|---|---|---|---|
| rainbow6 | 704 | 86 | 0.189 | 0.182 | 0.59 | +0.190 [+0.152, +0.234] |
| rgb | 792 | 81 | 0.186 | 0.180 | 0.54 | +0.190 [+0.149, +0.228] |
| rgby | 704 | 82 | 0.188 | 0.182 | 0.57 | +0.122 [+0.080, +0.167] |

- Family unfairness (excess SD of adjusted z ≈ 0.17–0.19) is **the same at every size, symbol set and
  colour set**. GridType choice neither causes nor fixes it.
- Within a game, the god with the higher-ceiling draw tends to rank higher (correlation +0.12 to +0.19,
  CIs exclude 0, about the same everywhere).
- The ceiling explains only part of the family effect: Spearman 0.26 between family ceiling and adjusted
  z on 3×3, 0.32 on 6–7×7.
- On 3×3, Sudoku (ceiling 3.4 bits, adjusted z 0.02), Tetromino (6.7 bits, z 0.11), Quilt Maker (7.6, 0.17)
  and Lantern Lighter (6.1, 0.19) essentially never win. Low ceilings make them dead hands there.

### 3.4 Mutators by GridType

Share of committed applications (%). The full table is in the generated report.

| mutator | N=3 | N=4 | N=5 | N=6 | N=7 | note |
|---|---|---|---|---|---|---|
| turn_grid | 1.5–2.6 | 0.3–1.0 | 0.4–0.9 | 0.0–0.3 | 0.0–0.4 | global bijection; its motion term grows with N² |
| motif | 2.7–3.8 | 1.8–2.9 | 0.5–2.1 | 0.3–0.8 | 0.1–0.6 | 70 bits at 5×5, 168 at 7×7 |
| write | 2.0–2.8 | 1.0–2.7 | 1.3–2.6 | 0.7–2.2 | 0.8–1.7 | |
| paint | 3.3–4.6 | 3.1–4.0 | 2.9–4.4 | 2.6–4.2 | 1.8–3.2 | |
| turn_block | 6.0–7.9 | 8.0–10.7 | 9.2–12.9 | 9.5–13.6 | 11.8–13.9 | local bijections take over |
| shift_line + reverse_line | 12–14 | 15–16 | 16–19 | 18–22 | 19–23 | |

- Mutator entropy (normalised) falls with size: 0.86 on 3×3, 0.79 on 7×7.
- **GridType-specific mutator failures**:
  - `motif` and `turn_grid` are effectively dead (< 0.5%) from 6×6 up;
  - `suit_set` (0.8–1.6%) and `suit_swap` (2.2–3.8%) exist only in card GridTypes and are marginal;
  - `blend` exists only on rgby/rainbow6 (2–3.4%); `tally` is absent on cards.

  No mutator is unused in a GridType where it is available, but global overwrites become decorative on
  large grids.
- **GridType-specific family failures** (policy-free ceilings, confirmed by game rank scores):
  - on 3×3: Ladder of Numbers, Bridge Builder, Sudoku, Wallpaper Weaver, Tetromino, Lantern Lighter and
    Homebody all cap below 7 bits;
  - on 4×4: Sudoku (1 bit on base10 rgb!), Bridge Builder, Ladder of Numbers, Lantern Lighter and Fair
    Weaver cap below 9 bits;
  - Bridge Builder, Ladder of Numbers and Lantern Lighter stay below 20 bits even at 7×7.

### 3.5 Policy robustness and held-out validation

**Held-out seeds** (24 games/type, seed 9000000, 600 games). The training model's predicted type means
correlate with the held-out type means at:

| metric group | held-out r |
|---|---|
| legibility metrics | 0.96–1.00 |
| tension | 0.88 |
| autocorrelation | 0.89 |
| spirals | 0.83 |
| dynamism2 | 0.77 |

Weakly predicted (held-out r < 0.5): rise-and-fall share, hits per object, agents, commits. These are
dominated by noise, so treat their coefficients as unconfirmed.

Held-out dynamism2 by size (95% CI half-width):

| size | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|
| dynamism2 | 0.490 ± 0.023 | 0.538 ± 0.021 | 0.570 ± 0.023 | 0.573 ± 0.023 | 0.604 ± 0.022 |

On held-out seeds, 4×4 sits about 0.03 below 5×5 (training: equal). The deficit of 3×3 is confirmed.

**All-greedy_private gods** (24 games/type, seed 5000, 6 types):

| GridType | dynamism2 | sig. tension | snap autocorr | held accel. climbs /100 s | legible share | mutator entropy | agents | unspent energy |
|---|---|---|---|---|---|---|---|---|
| (3,base10,rgb) | 0.467 ± 0.044 | 0.164 ± 0.031 | 0.15 ± 0.058 | 0.42 ± 0.34 | 0.605 ± 0.032 | 0.867 ± 0.007 | 131 ± 44 | 0.040 ± 0.011 |
| (3,cards,rgb) | 0.468 ± 0.049 | 0.181 ± 0.033 | 0.142 ± 0.059 | 0.33 ± 0.22 | 0.623 ± 0.027 | 0.858 ± 0.015 | 145 ± 46 | 0.051 ± 0.021 |
| (4,base10,rgb) | 0.518 ± 0.046 | 0.156 ± 0.025 | 0.226 ± 0.084 | 0.68 ± 0.41 | 0.396 ± 0.027 | 0.829 ± 0.014 | 179 ± 69 | 0.044 ± 0.019 |
| (5,base10,rgby) | 0.516 ± 0.042 | 0.117 ± 0.022 | 0.225 ± 0.077 | 0.61 ± 0.43 | 0.298 ± 0.027 | 0.818 ± 0.011 | 126 ± 38 | 0.050 ± 0.016 |
| (6,cards,rgb) | 0.558 ± 0.047 | 0.102 ± 0.028 | 0.349 ± 0.085 | 0.91 ± 0.37 | 0.232 ± 0.025 | 0.795 ± 0.016 | 151 ± 50 | 0.037 ± 0.009 |
| (7,base16,rainbow6) | 0.466 ± 0.063 | 0.068 ± 0.020 | 0.334 ± 0.092 | 0.58 ± 0.38 | 0.170 ± 0.023 | 0.764 ± 0.016 | 90.5 ± 26 | 0.051 ± 0.013 |

Under greedy-only play:

- **Robust across policy mixes**:
  - the legibility ordering;
  - the tension gradient (small grids tense, large calm);
  - the autocorrelation gradient;
  - the mutator-entropy gradient;
  - 3×3 being the least dynamic;
  - 4×4 being on par with 5×5 (0.518 vs 0.516).
- **Not robust**: "7×7 is the most dynamic". With greedy gods, Grid(7,base16,rainbow6) drops to 0.466 ± 0.063,
  level with 3×3, while 6×6 cards stays high. The large-grid advantage under the mixed mix comes partly
  from random/saver gods buying many cheap local programs. With greedy gods only, 7×7 gets fewer agents
  (90 vs 126–179) and the lowest tension (0.068).

## 4. Recommendations

1. **Beginner default: Grid(4,base10,rgb).**
   - Digits 0–9 and three primary colours are the most familiar glyphs.
   - 16 cells keeps a change visible: 4.3 cells per commit, 37% of noticeable moves traceable to ≤ 3 cells,
     against 31% on 5×5 rgby.
   - Families still have room to climb: median ceiling 25 bits, 5 families below 12 bits.
   - Dynamism is close to 5×5: within CI in training and greedy-only play, and 0.03 lower on held-out seeds. It is clearly above 3×3 (+0.05) in every set.
   - Pair it with a **beginner dealer exclusion** of the families that are starved at 4×4: `dealer_exclude
     = ["sudoku_scholar", "bridge_builder", "ladder_of_numbers", "lantern_lighter", "fair_weaver"]`, all
     with ceiling < 9 bits on Grid(4,base10,rgb).
2. **Progression.**
   1. Grid(4,base10,rgb);
   2. Grid(5,base10,rgby), the current reference: one more colour, 25 cells;
   3. Grid(6,base12|base16,rgby) or Grid(5,cards,rgby): new glyphs, calmer and more persistent objects;
   4. Grid(7,*,rainbow6) for experts: the most persistent objects (autocorr 0.44) and the most dynamic under
      mixed policies (0.58–0.61), but only about 21% of noticeable moves are traceable, and with greedy-only
      gods its dynamism falls to 3×3 level. 6×6 is the safer "large" default.

   Introduce symbol and colour sets for theme and variety. They do not change difficulty measurably.
3. **Retire size 3 from competitive play.** Keep it as a *tutorial* GridType with a curated pool (families
   with ceiling ≥ 16 bits on that type). It is ceiling-starved (45% of families < 16 bits), flickery
   (autocorr 0.13) and the least dynamic (dyn2 −0.04*). Monochrome jackpots cost two cell paints. Within
   size 3, Grid(3,cards,rainbow6) is the worst: lowest dynamism (0.484) and tension, and 9 cells cannot show a
   52-card alphabet.
4. **Keep 7×7 as an expert option, but don't call it noisy.** The noise is in legibility, not in the dynamics: it has the most
   persistence. Its dynamism depends on the policy mix (high with mixed gods, low with greedy-only), and 6×6 is more robust. Global overwrites (paint grid 131 bits, write grid 278, motif 168) exceed the
   starting energy, so if global mutators should matter on big grids, scale `COST_KNOBS["scope"]["global"]`
   down with N (e.g. × 5/N), or raise starting energy with N². Don't add size 8+.
5. **No symbol or colour value needs retiring or adding** for dynamics or fairness. If the product wants
   fewer options, the redundant ones are base12 and base16: no measurable effect beyond base10, and less
   familiar to children. rainbow6 keeps a distinct family set (Wheel, Mixable) that justifies it.
6. **Family fixes, not GridType fixes**, for starved families: Bridge Builder, Ladder of Numbers, Lantern
   Lighter, Column Addition, Divisibility and Sudoku need a finer tie-breaker (rules worker), or should be
   excluded from GridTypes where their ceiling is below about 16 bits. A dealer rule "exclude families whose
   calibrated ceiling on this GridType is < 16 bits" (`common.low_ceiling_families`) implements this
   generically: it removes about 35 families on 3×3, 10 on 4×4, 4 on 5×5 and 2–3 on 6×6 and 7×7.

## 5. What depends on the simulated policies

- **Policy-free** (§2): families and mutators available, ceilings, one-cell sensitivity, mutator and
  library costs against the economy. These hold for any players.
- **Policy-dependent** (§3, §4): dynamism, tension, climbs, mutator shares, legibility *rates*
  (they depend on which programs are bought) and fairness. The greedy-only check in §3.5 tests how robust
  the GridType ordering is to the policy mix.
- The **noticeable-jumps-per-minute** figure depends on the 100 Hz interaction rate.

## 6. Reproduce

```
cd lib/grid-lab
python3 -m gridlab.explore.gridtypes.landscape                     # 60 GridTypes, ~2 h on 4 cores cold
python3 -m gridlab.explore.gridtypes.games --games 64 --seed 1     # training, ~1.7 h
python3 -m gridlab.explore.gridtypes.games --games 24 --seed 9000000
python3 -m gridlab.explore.gridtypes.games --games 24 --seed 5000 --mix greedy \
    --types "3,base10,rgb;4,base10,rgb;5,base10,rgby;7,base16,rainbow6;3,cards,rgb;6,cards,rgb"
python3 -m gridlab.explore.gridtypes.analyse --games 64 --test-games 24   # writes .cache/explore/gridtypes/report.md
```

Caches live under `.cache/explore/gridtypes/`, which is gitignored.
