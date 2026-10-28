# Cooperative spirals and tension: what makes them, what kills them

Exploration session `spirals` (branch `claude/gridlab-explore-spirals`). Code: `gridlab/explore/spirals/`.
Tests: `python3 -m tests.test_spirals`. Traces: `docs/explore/spirals_traces/`.

## Shared-module changes (minimal, backward compatible)

* **`gridlab/metrics.py`**: new functions `episodes`, `is_spiral`, `spiral_metrics` (plus helpers), and
  `metrics(log, spiral_detail=True)` now also returns `ep_*` / `fb_*` / `tn_*` keys. Every existing key and
  definition is unchanged; `metrics(log, spiral_detail=False)` gives the old dict exactly. Cost: about
  0.2–0.3 s per 10k commits, mostly the 3-repetition permutation null. All four suites still pass
  (`test_rules`, `test_mutators`, `test_calibrate`, `test_sim`).
* Nothing else in a shared module was edited. The prototypes live in a fork of the game loop
  (`explore/spirals/simx.py`). With every prototype off, it is bit-identical to `gridlab.sim.run_game`
  (`tests/test_spirals.py::test_fork_identical`).

## TL;DR

1. **The current ecosystem has no cooperative spirals beyond chance.** Its spirals are *anti*-chance.
   Climbs that two or more owners drive happen at **0.69 ± 0.03×** the rate of a null where each
   object's commits are shuffled. Consecutive salience changes on an object are negatively correlated
   (**−0.15**). Salience is strongly mean-reverting: about +1 bit per commit below 8 bits, but **−1.9 bits per
   commit at 16–32 bits and −5.8 at 32–64**. At 100 Hz each object is changed about 5 times a second, so spirals
   are sub-second blips that keep half their gain. This holds in all 5 GridTypes.
2. **The multiplicative payoff does point every god at salient objects, but in the current world that
   produces collateral destruction, not pile-on construction.** An owner gains a flat +0.5 bits per commit
   whatever the object's salience. What it does to the *others* falls steadily with how salient the object
   already is to them: +0.45 bits below 4 bits, then −1.6 (16–32), −3.0 (32–64) and −5.0 (64+). Making
   salient objects attract more hits (`select_alpha > 0`) makes this a literal pile-on, and **it destroys
   spirals**: held spirals fall 28.5 → 17.7 → 9.9 per 100 s for α = 0, 1, 2.
3. **The single lever that turns this around is a tending clause.** It is an option on an agent: the
   engine commits its result only if it raises the owner's payoff s_o·S_−o on that object. It costs about
   3.6 bits, and gods buy it voluntarily when it is offered. When every program carries it:
   * spirals above chance for the first time (excess **1.03**);
   * drift at 16–32 bits flips to **+1.9**;
   * spiral gain ×1.8 and retention **0.89**;
   * world salience ×2.7 and welfare per object ×5.9;
   * **tension rises**: tension events 0.13 → 0.35 and thefts 0.03 → 0.16 of commits.

   The clause makes the multiplicative payoff *do its job*. A move that raises your surprisal on an object
   others value passes even if it takes some of theirs, which gives grabbing contests on the hottest objects.
   The price is calmer leaderboards: lead changes per 100 s fall 5.7 → 2.3. The world also changes ~10×
   less often, so held spirals *per second* fall slightly (−6 per 100 s held-out), even though each one is
   bigger and lasts.
4. **A balanced design point (recommended):** offer the payoff clause on half the programs and shelter salient
   objects a little (object choice weight (1+σ)^−1). Compared with base on the same 200 games:
   * held spirals **+58%** (28.5 → 45.1 per 100 s);
   * retention 0.50 → 0.81;
   * world salience +77% and welfare per object ×2.6;
   * tension events 0.13 → 0.18;
   * lead changes −36% (5.7 → 3.7);
   * family fairness unchanged.

   The improvement held in every GridType, and **on 200 held-out games**: held spirals +15.1 per 100 s
   [+12.9, +17.5], retention +0.28 [+0.24, +0.31], tension +0.038 [+0.032, +0.043], lead changes
   −1.8 [−2.3, −1.4].
5. **Negative results** (each 200 paired games):
   * **"extend" mutators** (cheap conditional completions of runs and regions): gods use them (12% of
     commits), but they change spirals by < 5% and *worsen* family fairness. Not recommended in this form.
   * **Guard discount** (erasure × pass rate): no effect.
   * **Starting objects 5 or 20, spawn rate**: no effect on spiral structure.
   * **20 Hz instead of 100 Hz**: scales everything down but leaves structure unchanged.
   * **Bijections at 2× price**: a small gain, costs fairness.
   * **Heat-weighted touch** (recently improved objects hit more): more lead changes, no acceleration.
   * **The "do no harm" clause**: makes the game trivially cooperative. Zero tension, 769 commits per
     game, the world freezes.
6. **Contiguous acceleration (convex, autocorrelated growth) did not appear under any mechanism.** Under
   every variant, per-commit increments stay negatively correlated (about −0.15). The levers above change
   the *level* of construction (drift, gain, retention), not its *momentum*. Inside spirals, 55–64% of
   episodes have convex gain (`accel > 0`), but with negative step autocorrelation that is what lumpy
   increments produce, not feedback (a convexity null was not run). The honest reading: spirals here are
   runs of construction in a constructive regime, not self-reinforcing loops. §7 lists what might create true
   momentum.
7. **Who spirals with whom is predictable ex ante.** Pair *co-lift* = P(s_j ≥ 4 | s_i ≥ 8) / P(s_j ≥ 4),
   measured on 1536 structured probe grids:
   * it correlates with the pair's share of a game's spirals (Spearman **+0.31**, n = 1554 god pairs);
   * it agrees with calibrated synergy (`calibrate.synergy`, +0.55 on a 36-pair sample);
   * the most *opposed* quartile by rank correlation steals **2.5×** as often as the middle quartiles.

   A dealer can use co-lift to guarantee at least one aligned pair and one opposed pair per game.

## 1. Metrics (what was weak, what replaced it)

`metrics.spirals` (kept) counts maximal runs of ≥ 2 consecutive salience rises on one object by ≥ 2
owners. At 100 Hz, objects take about 5 commits/s, and a random walk with P(up) ≈ 0.4 produces such runs
constantly. The baseline shows about 10 "spirals" per 100 commits, most of them noise, with no null to
compare against. The new definitions are in the `metrics.py` docstring:

| key | meaning |
|---|---|
| episode | zigzag upswing of an object's salience path σ, from a trough to the running peak. Dips smaller than max(2 bits, 25% of the climb so far) do not end it. Records gain, commits, seconds, up-steps, contributors, **major contributors** (owners supplying ≥ 15% of the positive increments), beneficiaries (gods +1 bit), losers, top_share (largest single step / gain), accel, and retention (share of the gain still there 10 s after the peak). |
| cooperative spiral (`is_spiral`) | episode with gain ≥ 8 bits, ≥ 3 up-steps, **≥ 2 major contributors**, ≥ 2 beneficiaries, top_share ≤ 0.6. The major-contributor rule came from trace 1 (below): a 257-bit "spiral" with 5 contributors was in fact one god's three-step jackpot plus a free rider. |
| `ep_solo_per_100s` | big climbs (≥ 8 bits) driven by one owner |
| `ep_spirals_held_per_100s` | spirals with retention ≥ 0.75 (the ones a player would see on the 5 s timescale) |
| `ep_spiral_excess` | (observed + 1) / (permutation-null + 1): each object's commits are shuffled, carrying owners and surprisal vectors along. > 1 = feedback, < 1 = anti-feedback. |
| `fb_autocorr`, `fb_up_after_up` | lag-1 correlation of Δσ on an object; P(up \| up) − P(up \| down) |
| `fb_drift_<bin>`, `fb_rate_<bin>` | mean Δσ per commit, and commits per object-second, by the object's salience bin (0, 4, 8, 16, 32, 64 bits) |
| `tn_*` | tension events (one god +1 bit and another −1 bit). Recovery of each loser within 20 s, split into **counter** (the loser's own agent restores it) and **incidental**. Theft (owner +2, other −2) and whether the thief's gain survives 20 s. Reversal rate (a ≥ 2-bit change undone within 3 commits = churn). |
| runner extras | incentive bins (owner's Δs_o and the others' ΔS_−o by S_−o before), pair spiral and theft counts, mutator spiral lift, 5 s snapshot autocorrelation |

## 2. Setup

* **Runs.** `python3 -m gridlab.explore.spirals.study --variants <list> --games 40 [--seed 9000000] [--conditions]`.
* **Specs.** `experiments.common.make_specs`: the coordinator's specs, 5 GridTypes × 40, 3–6 gods, policies iid
  from {random, greedy_private, saver, greedy_omniscient}. Engine defaults are `OLD_CONFIG` at **100 Hz**,
  with exponential length and half-life 300 s.
* **Pairing.** Variants share specs, so comparisons are paired by common random numbers. Training uses
  seed 1; held-out uses seed 9 000 000.
* **Program libraries.** Every variant draws from the same 4096-program library per GridType. Only prices
  and clauses change, plus extra mutators for `extend`.
* **Reporting.** ± is the 95% bootstrap CI half-width over 200 games.
* **Policy dependence.** Results marked **[policy]** depend on the simulated gods' value model. Results
  marked **[structural]** do not: they hold for any agents that hit uniformly random objects. With
  clauses, policies get a clause-aware value model (`explore/spirals/policies.py`). Private gods
  approximate every clause by "my surprisal rises".

## 3. Baseline: why there are no spirals

| metric (200 games) | value |
|---|---|
| spirals / 100 s (≥ 2 major contributors) | 104 ± 8 |
| solo big climbs / 100 s | 221 ± 23 |
| held spirals / 100 s | 28.5 ± 3.2 |
| spiral excess over shuffle null | **0.69 ± 0.03** |
| mean spiral gain / retention | 16.1 bits / 0.50 |
| lag-1 autocorrelation of Δσ | **−0.15** |
| drift at σ ∈ [16, 32) / [32, 64) | **−1.94 / −5.84** bits per commit |
| hit rate on objects with σ ≥ 16 relative to σ < 8 | 1.06 (no pile-on) |
| tension events / thefts (share of commits) | 0.13 / 0.03 |
| losers whose loss is recovered within 20 s: by their own agent / by someone else | 0.34 / 0.49 |
| reversal rate | 0.15 |

**Mechanism [structural].** An agent is a fixed map applied to random objects. Most of the 4096 library
programs are bijections or partial overwrites that, applied to a highly structured object, destroy more
than they add. That is the Landauer argument in docs/mutators.md run backwards: a random map cannot add
much information on average, and structured states are a vanishing fraction of the space, so they decay.
The cheap bijections scramble most:
* shift_line, turn_block, reverse_line, swap_colours, hue_turn, swap_cells, swap_symbols and step_rank
  are 61% of commits;
* their spiral lift is 0.70–0.89 (share of spiral up-steps / share of commits);
* the overwrites with lift above 1.3 (majority_line, flatten, paint, write_ramp, write, blend,
  pattern_line, recolour, mirror_fold) are 23% of commits.

**The incentive check [policy].** By the bin of S_−o (the others' salience of the object) before the
commit:

| S_−o before | share of commits | Δs_owner | ΔS_−o (others) |
|---|---|---|---|
| 0–4 | 0.31 | +0.47 | +0.45 |
| 4–8 | 0.25 | +0.50 | +0.02 |
| 8–16 | 0.24 | +0.51 | −0.66 |
| 16–32 | 0.14 | +0.50 | −1.60 |
| 32–64 | 0.05 | +0.58 | −3.03 |
| 64+ | 0.02 | +0.33 | −5.04 |

Yes, with π = s·S_−i every god *wants* to raise its surprisal on objects others value: those gains are
multiplied by S_−i. But agents cannot target objects, and their owners' private value model holds S_−i
fixed. So the pile-on is not one of attention but of *collateral damage*: the richer an object is for
the others, the more each passing commit takes from them.

## 4. Variants (training seeds, 200 paired games each)

| | spirals /100 s | held /100 s | excess | gain | retention | drift 16–32 | final σ̄ | welfare/obj | tension | theft | lead chg /100 s | commits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | 104 | 28.5 | 0.69 | 16.1 | 0.50 | −1.94 | 16.6 | 341 | 0.13 | 0.03 | 5.71 | 36.7k |
| sel+1 (hit ∝ (1+σ)) | 103 | 17.7 | 0.69 | 15.9 | 0.27 | −1.93 | 10.8 | 155 | 0.12 | 0.03 | 6.62 | 37.0k |
| sel+2 | 98 | 9.9 | 0.67 | 15.9 | 0.07 | −1.88 | 6.7 | 76 | 0.12 | 0.03 | 7.90 | 37.4k |
| sel−1 (shelter) | 107 | **43.5** | 0.70 | 16.2 | 0.76 | −1.80 | 22.5 | 519 | 0.13 | 0.03 | 4.50 | 36.3k |
| tend_own (½ library) | 79 | 25.8 | 0.74 | 17.1 | 0.57 | −1.26 | 21.4 | 500 | 0.16 | 0.05 | 4.61 | 21.3k |
| tend_pay (½ library) | 97 | 34.6 | 0.82 | 17.5 | 0.62 | −0.99 | 24.2 | 675 | 0.17 | 0.05 | 4.49 | 21.7k |
| **tend_pay+sel−1** | 96 | **45.1** | 0.82 | 17.4 | **0.81** | −1.00 | 29.4 | 896 | 0.17 | 0.05 | 3.67 | 21.2k |
| tend_pay100 (whole library) | 35 | 23.0 | 1.04 | 28.1 | 0.90 | +1.91 | 45.0 | 1961 | 0.34 | 0.15 | 2.10 | 3.6k |
| all_own (engine rule) | 35 | 18.2 | 0.96 | 21.2 | 0.78 | +0.50 | 32.8 | 1128 | 0.39 | 0.19 | 3.05 | 4.9k |
| **all_pay** (engine rule) | 37 | 23.7 | **1.03** | **28.6** | **0.89** | **+1.93** | **45.6** | **2006** | 0.35 | 0.16 | 2.31 | 3.9k |
| all_pay+sel+1 | 34 | 18.9 | 1.04 | 27.5 | 0.82 | +1.81 | 38.2 | 1560 | 0.35 | 0.16 | 2.29 | 3.5k |
| all_pay+sel−1 | 39 | 27.0 | 1.06 | 28.3 | 0.98 | +1.82 | 49.1 | 2268 | 0.35 | 0.16 | 1.98 | 4.0k |
| all_noharm (engine rule) | 13 | 13.1 | 1.00 | 31.5 | 1.00 | +2.85 | 35.8 | 1188 | **0.00** | 0.00 | 1.16 | 0.8k |
| extend | 97 | 28.4 | 0.70 | 16.8 | 0.52 | −1.78 | 19.0 | 586 | 0.12 | 0.03 | 5.28 | 34.4k |
| tend_pay+extend | 88 | 31.7 | 0.83 | 17.8 | 0.64 | −0.84 | 25.8 | 819 | 0.17 | 0.05 | 4.21 | 19.6k |
| all_pay+extend | 35 | 22.3 | 1.04 | 27.9 | 0.90 | +1.67 | 45.6 | 2092 | 0.35 | 0.16 | 2.14 | 3.6k |
| gdisc (guard discount) | 103 | 28.7 | 0.69 | 16.3 | 0.50 | −1.88 | 16.8 | 323 | 0.13 | 0.03 | 5.40 | 36.5k |
| bij2 (bijections ×2) | 109 | 33.4 | 0.74 | 17.2 | 0.53 | −1.59 | 20.1 | 428 | 0.14 | 0.04 | 4.78 | 31.9k |
| bij2+tend_pay+sel−1 | 90 | 42.4 | 0.82 | 18.8 | 0.81 | −0.74 | 32.5 | 1066 | 0.18 | 0.05 | 3.04 | 18.6k |
| heat (hit ∝ 1 + 0.2·recent gain) | 101 | 24.2 | 0.68 | 15.9 | 0.42 | −1.92 | 12.4 | 193 | 0.12 | 0.03 | 6.46 | 36.9k |
| heat+tend_pay | 94 | 28.9 | 0.81 | 17.5 | 0.53 | −0.96 | 19.9 | 475 | 0.17 | 0.05 | 5.24 | 21.5k |
| obj5 / obj20 | 103 / 108 | 28.0 / 30.6 | 0.69 / 0.69 | | | | 17.0 / 16.1 | | 0.12 / 0.13 | | 6.76 / 4.43 | |
| rate20 (20 Hz) | 21 | 7.5 | 0.68 | 15.6 | 0.57 | −1.90 | 14.7 | 252 | 0.12 | 0.03 | 5.21 | 7.4k |

The full tables with CIs are printed by `study.py`. Typical 95% half-widths: spirals ±7, held ±3,
excess ±0.03, retention ±0.03, drift ±0.35, tension ±0.01, lead changes ±0.5.

**Per GridType** (training seeds; held spirals per 100 s / excess / final σ̄ / lead changes per 100 s):

| GridType | base | tend_pay+sel−1 | all_pay |
|---|---|---|---|
| Grid(5,base10,rgby) | 28.8 / 0.70 / 16.0 / 5.5 | 49.2 / 0.84 / 27.3 / 3.9 | 27.3 / 1.05 / 42.9 / 2.8 |
| Grid(4,base12,rgb) | 23.5 / 0.57 / 11.6 / 6.3 | 36.8 / 0.72 / 20.6 / 3.4 | 21.9 / 0.96 / 33.3 / 2.5 |
| Grid(6,cards,rainbow6) | 36.6 / 0.83 / 23.6 / 4.9 | 52.1 / 0.93 / 40.3 / 3.1 | 22.3 / 1.06 / 58.9 / 1.4 |
| Grid(7,base16,rainbow6) | 33.2 / 0.76 / 22.2 / 4.3 | 49.1 / 0.93 / 41.9 / 3.0 | 25.4 / 1.08 / 65.1 / 2.1 |
| Grid(3,base10,rgb) | 20.4 / 0.56 / 9.4 / 7.5 | 38.2 / 0.69 / 17.0 / 4.8 | 21.4 / 1.00 / 27.6 / 2.7 |

**Fairness** (family rank z = (G − rank)/(G − 1), policy-adjusted, 77 families with ≥ 6 slots; "excess" =
SD beyond sampling noise; experiments.common.family_fairness):

| variant | excess SD of family z | share of families whose CI excludes 0.5 |
|---|---|---|
| base | 0.175 | 0.35 |
| sel−1 | 0.167 | 0.36 |
| tend_pay | 0.161 | 0.29 |
| tend_pay+sel−1 | 0.171 | 0.34 |
| all_pay | 0.158 | 0.36 |
| all_own | 0.149 | 0.32 |
| heat+all_pay | 0.149 | 0.34 |
| extend | **0.191** | **0.44** |
| bij2 | **0.188** | **0.43** |

The clauses are fairness-neutral to slightly positive. Extend and bijection pricing make fairness worse.

### Readings

* **Shelter vs pile-on [structural].** α < 0 helps and α > 0 hurts, with or without clauses. A salient object is
  fragile, so attention is a threat. The game stays lively because sheltering slows *both* building and
  wrecking of salient objects. Lead changes drop 21%, a real cost; it is the main tradeoff in this report.
* **Clauses [policy + structural].** Without a clause, an agent's commit is one random draw of "help or harm".
  With the payoff clause, a commit happens only if the owner's payoff rises, so drift on each owner's own value
  is non-negative, and mixed-alignment gods produce tug-of-war, not decay. Gods buy the clause when it is
  offered: with the whole library offered (tend_pay100) the results match the engine rule. 73% of attempts are
  rejected, so the world changes ~10× less often (3.9k vs 36.7k commits per game). Each change is meaningful,
  and the objects stop boiling. With half the library offered (tend_pay), about a third of attempts are
  rejected.
* **own vs payoff clause.** "Own" (my surprisal must rise) gives the most theft (0.19) and counter-play
  (losers reclaim with their own agents 47% of the time). "Payoff" (my s × others' S must rise) gives bigger,
  longer-held spirals with slightly less theft. In both, under the clause the owner's gain is +2.3 to +2.8 bits
  per commit on objects others value, against +0.5 in base. The others still lose 1.8 to 6 bits there, so the
  hottest objects are contested.
* **"Do no harm" is the trivially cooperative failure** the user warned about: zero tension and 1.2 lead
  changes per 100 s.

## 5. Conditions for spirals

**Family pairs [policy].** Pair *co-lift* (`synergy.py`, 1536 structured probe grids made by 1–8 library
programs each) predicts which pairs spiral together. Across 1636 god pairs in the 200 base games:

| pair alignment | Spearman with pair spirals | with pair's share of the game's spirals | with pair thefts |
|---|---|---|---|
| rank correlation ρ of s_i, s_j | +0.12 | +0.19 | −0.12 |
| co-lift | **+0.32** | **+0.31** | +0.06 |

| ρ quartile | mean ρ | pair spirals /100 s | share of game's spirals | thefts /100 s |
|---|---|---|---|---|
| Q1 (opposed) | −0.16 | 33.6 | 0.24 | **57.1** |
| Q2 | −0.02 | 35.4 | 0.28 | 22.9 |
| Q3 | +0.02 | 32.9 | 0.29 | 18.8 |
| Q4 (aligned) | +0.17 | **44.4** | **0.36** | 32.4 |

Co-lift is validated against calibrated synergy (`gridlab.calibrate.synergy`, s_i + s_j − s_ij at probe grids
where both have s ≥ 3): Spearman +0.55 on 36 pairs, and +0.27 for ρ. Mean synergy in that sample is +0.15 bits.
Aligned pairs (Q4) also steal more than Q2–Q3: they compete for the same structure.

Pairs that spiral most often (3–4 co-dealt games each, so read as examples, not rankings): Mirrormancer + Snap,
Seesaw + Set Spotter, Flush Royale + Pinwheel, Fair Weaver + Snap, Straight Shooter + Stripe Painter, Castle
Keeper + Set Spotter. The pattern is **one colour-layer rule plus one symbol-layer rule whose tops are
compatible** (constant symbols + a colour pattern), or two rules sharing an attractor from catalog §4.2
(stripes, flat symbols). Least: anything with Sudoku Scholar (all-or-nothing, Latin), Parity Painter + Sudoku,
Islander + Sudoku. Families that benefit from spirals most: Set Spotter, Snap, Wallpaper Weaver, Flush Royale,
Seesaw, Uno Snake, Bingo, Mirrormancer, Full House. These are symbol-flat or pattern rules, the "parasites" and
"swing votes" of catalog §4.1. Least: Picture Frame, Sudoku, Colour-Wheel Harmony, Robin Hood, Odds & Evens,
Archipelago: all-or-nothing or tightly constrained rules.

**Keystones in the traces.** Trace 2 and trace 3 show the keystone pattern directly. Treasure Map paints the
whole grid green; that makes Snap's "stamp 5 on every green cell" and Go Fish's "stamp 6 on blue/green" cheap
jackpots, so one god's progress unlocks a cheap step for another. The coupler mutators (`stamp`,
`paint_by_key`, `tally`) are the bridge between colour and symbol rules. `stamp` has spiral lift 1.23 in base.

**Object states [structural].** Spirals start from mid-salience objects (troughs around 3–25 bits) and peak on
the catalog attractors: flat symbols over a colour fill, flat symbols with an alternating colour pattern, a rim
plus a core. Traces 1, 3 and 4 show all-ones/all-zeros symbol layers under green or blue fills.

**Mutators [policy].** Spiral lift (share of spiral up-steps / share of commits), base: majority_line 1.62,
flatten 1.60, paint 1.60, write_ramp 1.60, write 1.56, blend 1.43, pattern_line 1.36, recolour 1.34, mirror_fold
1.31, stamp 1.23. Below 1: every bijection (shift 0.89 … step_rank 0.70, suit_swap 0.66). Overwrites build
spirals; bijections redistribute and, on balance, scramble.

## 6. Tension: healthy vs churn

| | base | tend_pay+sel−1 | all_pay | all_own |
|---|---|---|---|---|
| tension events (share of commits) | 0.13 | 0.18 | 0.35 | 0.39 |
| thefts (share of commits) | 0.03 | 0.05 | 0.16 | 0.19 |
| thief's gain still held 20 s later | 0.23 | 0.39 | **0.63** | 0.49 |
| losses recovered within 20 s | 0.83 | 0.80 | 0.61 | 0.63 |
| … by the loser's own agent (counter-play) | 0.34 | 0.35 | 0.35 | **0.47** |
| … by someone else's edit (incidental) | **0.49** | 0.45 | 0.26 | 0.16 |
| reversal rate (≥ 2-bit change undone in 3 commits) | 0.15 | 0.18 | **0.12** | – |
| commits per object per second | 2.5 | 1.5 | 0.28 | 0.34 |

(CIs: ±0.01–0.03 on every share.)

* **Unhealthy churn** is the base world's boil. Objects change about 2.5×/s on average, faster for the first
  objects, 15% of big changes are undone within 3 commits, and 83% of losses "recover" within 20 s, mostly by
  someone else's random edit (incidental, 0.49), not counter-play. A theft rarely sticks (0.23). Players would
  see flicker, not contests.
* **Healthy tension** shows up under the clauses. Fewer, larger, owner-driven changes; thefts that stick
  (0.63 held after 20 s); losses won back by the loser's own agents rather than by noise (counter 0.35–0.47 vs
  incidental 0.16–0.26); reversal rate down to 0.12. Trace 4 is the
  model: Castle Keeper and Uno Snake fight a green ↔ blue duel over one object for 50 s, while Set Spotter and
  Rook's Watch build on it.
* **What makes theft:** opposed pairs (Q1 ρ, 2.5× the theft) and, under clauses, aligned pairs competing for one
  attractor. **Counters:** the owner's own clause-bearing agents (counter share 0.35–0.47).

## 7. What might create real momentum (not tested)

All mechanisms here change drift, not autocorrelation. Positive autocorrelation needs a commit's success to
raise the *next* commit's expected gain *on the same object*. Ideas:

1. **Clause-bearing agents that remember**: an agent whose last commit on x passed gets a discount, or
   priority, on x. This is real momentum, but it breaks "agents hit uniformly random objects".
2. **Payoff as a function of salience velocity**: score dσ/dt. This changes the fixed payoff, so it is out of
   scope.
3. **Structure-gated extend mutators that only fire *above* a threshold the clause-bearing world reaches**
   (k = N − 1 on 6–7 grids). The extend family as built fires on 20–95% of random spawns, which is too often to
   be a feedback.

## 8. Held-out validation (seed 9 000 000: 200 new games, new deals)

`python3 -m gridlab.explore.spirals.study --variants base,sel-1,tend_pay,tend_pay+sel-1,tend_pay100,all_pay,heat+tend_pay --games 40 --seed 9000000 --full`

Every training conclusion replicates. Paired differences against base on the same held-out specs:

**tend_pay+sel-1**

| metric | base mean | Δ (paired) | 95% CI |
|---|---|---|---|
| ep_spirals_held_per_100s | 28 | **+15.1** | [+12.9, +17.5] |
| ep_spiral_excess | 0.695 | **+0.118** | [+0.0943, +0.143] |
| ep_spiral_retention_mean | 0.483 | **+0.28** | [+0.244, +0.312] |
| fb_drift_16 | -1.89 | **+0.635** | [+0.478, +0.789] |
| final_salience_mean | 15.5 | **+11** | [+9.41, +12.7] |
| welfare_per_obj | 231 | **+422** | [+310, +542] |
| tn_event_rate | 0.125 | **+0.0381** | [+0.0324, +0.0433] |
| tn_theft_rate | 0.0265 | **+0.0135** | [+0.0107, +0.0164] |
| lead_changes_per_100s | 5 | **-1.82** | [-2.3, -1.37] |

**all_pay**

| metric | base mean | Δ (paired) | 95% CI |
|---|---|---|---|
| ep_spirals_held_per_100s | 28 | **-5.96** | [-8.66, -3.17] |
| ep_spiral_excess | 0.695 | **+0.344** | [+0.312, +0.378] |
| ep_spiral_retention_mean | 0.483 | **+0.391** | [+0.356, +0.424] |
| fb_drift_16 | -1.89 | **+3.41** | [+3.02, +3.78] |
| final_salience_mean | 15.5 | **+25.6** | [+23, +28.5] |
| welfare_per_obj | 231 | **+1.42e+03** | [+1.12e+03, +1.76e+03] |
| tn_event_rate | 0.125 | **+0.223** | [+0.207, +0.238] |
| tn_theft_rate | 0.0265 | **+0.125** | [+0.112, +0.14] |
| lead_changes_per_100s | 5 | **-2.95** | [-3.53, -2.41] |


Other held-out values (base / tend_pay+sel−1 / all_pay):
* 5 s snapshot autocorrelation of salience changes: **−0.39 / −0.31 / −0.07** (± 0.02). At a player's
  timescale the payoff clause almost removes mean reversion: objects stop snapping back. It does not create
  positive momentum, though.
* thief's gain held after 20 s: 0.23 / 0.38 / 0.62;
* family-fairness excess SD: 0.179 / 0.172 / 0.157 (79 families); share of families whose CI excludes 0.5:
  0.42 / 0.39 / 0.29;
* policy z, the saver's edge: 0.69 / 0.68 / 0.69. The clauses do not change which policies win.

Note `all_pay` has *fewer* held spirals per 100 s than base (−6), because the world changes ~10× less often.
Per commit and per object it is far more constructive. Which of the two regimes reads better to a player is a
design call. The balanced point (tend_pay+sel−1) raises both spirals per second and their quality.

## 9. Recommendations

1. **Add the payoff tending clause as a purchasable agent option**: "only commit if it raises my points on this
   object". Price it at 1 + log2 3 + 1 ≈ **3.6 bits**: one yes/no measurement against the owner's rule, plus
   reading the peers' aggregate, plus naming the clause. The engine evaluates every rule on every commit anyway.
   Disclosure is unchanged: the god never learns another's function, and the clause uses only s_o and S_−o of
   the result, the same aggregate gods already see per object. Offer it on about **half the catalogue** (or
   price it higher) for the balanced regime. Offer it everywhere, or make it an engine rule, for the
   "constructive, contested" regime (all_pay). Do **not** use a "do no harm" clause.
2. **Shelter salient objects slightly: object choice weight (1 + σ)^−1.** Never weight *towards* salience: α > 0
   is a pile-on that wrecks spirals under every economy tested. If lead changes matter more, use α = −0.5
   (untested midpoint) or none.
3. **Dealer: guarantee ≥ 1 aligned pair (top co-lift) and ≥ 1 opposed pair (bottom ρ) per game.** Co-lift is
   cheap to compute from the calibration tables and a fixed probe set. Prefer pairs of a colour rule with a
   symbol rule whose attractors combine (catalog §4.2), and keep a coupler mutator (stamp, paint_by_key) in the
   catalogue.
4. **Do not ship the extend family as built, or the guard discount.** No spiral effect, and extend harms
   fairness.
5. **Metrics:** use `ep_spirals_held_per_100s`, `ep_spiral_excess` and `fb_drift_16` for spirals, and
   `tn_event_rate` with `tn_reversal_rate` for tension, in the dynamism objective. The old per-commit spiral
   count mostly counts noise.

## Traces

See `docs/explore/spirals_traces/` (each regenerates with the command on its first line). Each shows the
gods' private rules, every commit on the featured object with the owner, Δσ, the surprisal of every god after
it and the agent's kid-readable program, then the grid at several moments (symbol + colour letter).

1. `t1_base_cards.txt`: base, Grid(6,cards,rainbow6). A 257-bit climb over 51 s. Grey noise, then Seed 3 (green
   aces) paints the rim green, stamps A♦ on every green cell, and paints the core green. Mirrormancer (symbol
   palindromes) rides along to 51 bits for free. One owner supplied 96%: this is the case that motivated the
   major-contributor rule. A jackpot with a free rider, not a cooperative spiral.
2. `t2_base_tension.txt`: base, Grid(5,base10,rgby) seed 22. 5 s of the busiest tension window (~20 commits/s on
   one object). Treasure Map's whole-grid green fill lets Snap's "stamp 5 on green" jump Snap to 74 bits: a
   keystone. Within a second Mirrormancer's chessboard and Swiss Cheese's ring swaps halve the object.
3. `t3_allpay_spiral_seed22.txt`: the same 6 gods under the payoff clause. Over 5 s, three major contributors
   (Line Painter, Treasure Map, Go Fish) take it from 54 to 195 bits; 4 gods gain, retention 0.95. Then Treasure
   Map steals green back (−34).
4. `t4_allpay_slow_climb_seed9.txt`: payoff clause, seed 9. A 32 s, 14-commit spiral from 26 to 127 bits: Rook's
   Watch stamps 1s on blue, Uno Snake turns green to blue, Set Spotter writes flat symbols. Castle Keeper keeps
   turning blue back to green (a counter duel), so the object sways 127 → 99 → 127. Cooperative spiral and live
   tension on one object, on a human timescale.
5. `t5_tendpay_shelter_spiral_seed22.txt`: the balanced design (half the catalogue clause-bearing, shelter α = −1)
   on seed 22: a 122-bit, 11 s, 26-commit spiral (47.6 → 169.8) with 3 major contributors (top owner 32%),
   5 of 6 gods gaining, retention 0.96. The most broadly shared climb of the set.
6. `t6_allpay_tension_seed22.txt`: seed 22 under the payoff clause, its busiest tension window.
