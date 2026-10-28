# Grid Lab engine: calibration, simulation, policies, metrics

Owner: engine worker. Code: `gridlab/calibrate.py`, `gridlab/sim.py`, `gridlab/policy.py`,
`gridlab/metrics.py`, `gridlab/run.py`. Tests: `python3 -m tests.test_calibrate`,
`python3 -m tests.test_sim` (`tests/toys.py` has stand-in families and mutators).
Names follow SPEC §2. "GridType" (`gtype`) is the object type, never "room" (SPEC §4).

## 1. Calibration: ordinal -> surprisal

For god i with utility function u_i, the **survival function** is G_i(t) = μ{u_i ≥ t} under the
uniform spawn prior μ of the GridType, and **surprisal** is s_i(x) = −log₂ G_i(u_i(x)).
`survival(draw, gtype)` returns a `Survival` table.

An ordinal is an int or a fixed-length tuple of ints compared lexicographically (`family.py`). The
table stores each ordinal as its **key** (`family.ordinal_keys`): int64 for int ordinals, and for
k-tuples a `S{8k+1}` byte string (each component big-endian with the sign bit flipped, plus a
trailing 0x01 so numpy never strips NULs). Byte order equals tuple order, so `np.unique`,
`searchsorted`, `>=` and `bisect` work unchanged and nothing needs bounds. Lookups accept an
ordinal, its key, a `(B,)` / `(B, k)` batch from `evaluate_batch`, or an array of keys.


| API | Meaning |
|---|---|
| `.levels` | strictly increasing ordinal keys seen during estimation |
| `.log2p` | log₂ G at each level (non-increasing, ≤ 0) |
| `.stderr_bits` | standard error of each level's surprisal, in bits |
| `.log2_tail(t)`, `.surprisal(t)` | lookups, scalar or vectorised over arrays |
| `.stderr(t)` | standard error at t |
| `.max_observed_bits` | surprisal of the deepest level estimated |
| `.exact` | set when the family's `exact_log2_tail` backs the lookups |

### 1.1 Estimator (ESTIMATOR_VERSION = 2; 2 = tuple ordinals keyed by value, 1 = `lex`-packed ints)

1. **Body (Monte Carlo).** `n_mc = 2^16` prior samples, evaluated with `family.evaluate_batch` in
   chunks of 2^14. Every distinct ordinal with at least `min_mc_count = 256` samples at or above it
   becomes a level with p̂ = count/n. Binomial standard error in bits: √((1−p)/(np)) / ln 2. At the
   deepest MC level this is ≤ 0.09 bits.
2. **Tail (adaptive multilevel splitting).** 1000 particles are drawn from the MC samples above the
   deepest MC level, so they are exact draws from μ|{u ≥ ℓ₀}. Each stage:
   * picks the next level ℓ' among distinct particle values > ℓ, with survival fraction f closest to
     p₀ = ½ on a log scale. Ordinals are discrete and often tied, so f varies around p₀;
   * records every distinct value in (ℓ, ℓ'] with log₂ G = log₂ G(ℓ) + log₂ f_v;
   * kills the particles below ℓ', clones random survivors into their slots, and runs N² MCMC steps;
   * stops when −log₂ G ≥ `target_bits` = 64, or when no particle can rise above ℓ after 3 extra
     rounds of MCMC (the ordinal's maximum, or a level the kernel cannot reach). The final
     population's remaining distinct values are recorded too, so tables usually go to about 70–75 bits.
3. **MCMC kernel.** Each step proposes, cycling, one of: (a) resample one uniformly chosen cell's
   symbol and colour; (b) its symbol only; (c) its colour only; (d) swap two uniformly chosen cells.
   Each proposal is symmetric under the product-uniform prior, so "accept iff u stays ≥ level" is
   Metropolis for μ restricted to {u ≥ level}, and that restricted prior is invariant. Proposal (a)
   is the canonical kernel. (b) to (d) speed up mixing in level sets where changing a whole cell is
   rarely accepted, such as arrangements with a fixed count of each colour.
4. **Exact tails.** If the family provides `exact_log2_tail`, lookups use it (memoised). The estimator
   still runs for the cross-check: `survival(draw, gtype, use_exact=False)`.
5. **Standard error.** Ideal-mixing AMS variance is Σ_stages (1−f)/(f·n), plus the MC variance of
   the starting level, converted to bits². The splitting part is multiplied by `SE_INFLATION = 1.6`
   as a margin for slow mixing.

**Lookup rule.** `log2_tail(t)` uses the largest level ≤ t. An unseen ordinal between two levels
gets the lower level's (smaller) surprisal, which is conservative: it never claims more bits than a
level supports. Below the smallest level the surprisal is 0.

**Extrapolation above the highest level** (the ordinal was never seen during estimation): s(max
level) + 1 bit per further *known* distinct ordinal up to t, minimum +1 and capped at
`EXTRAP_CAP_BITS = 4` extra. The only known ordinal above the levels is u(exemplar), when the family
has an exemplar. The table usually reaches 64+ bits, and 2^-64 is beyond anything a game produces by
chance, so this cap rarely matters. It is only there so an object built deliberately above the
estimated range scores slightly more than the deepest level, by a bounded amount.

### 1.2 Error behaviour (measured)

Binomial toy (count of one colour on Grid(7,base10,rgb), exact tail known), 24 independent seeds:

| t | exact bits | bias | sd | RMSE | reported se (mean) |
|---|---|---|---|---|---|
| 30 | 14.1 | +0.04 | 0.14 | 0.15 | 0.24 |
| 35 | 24.1 | +0.02 | 0.17 | 0.17 | 0.37 |
| 40 | 37.6 | +0.01 | 0.28 | 0.28 | 0.53 |
| 43 | 47.8 | −0.05 | 0.46 | 0.46 | 0.66 |
| 46 | 60.4 | −0.02 | 0.49 | 0.50 | 0.86 |

The estimate is unbiased to within 0.05 bits, and the error grows roughly as √depth: about 0.3 bits
at 2^-40 and 0.5 bits at 2^-60. With the 1.6 inflation, the reported se is about 1.7× the observed
spread, so it is conservative. On the rules worker's seed families with exact tails
(`seed3_green_ones`), the estimate and the exact tail agree to within 0.24 bits on Grid(5,base10,rgby),
0.57 bits on Grid(7,cards,rainbow6), and 1.17 bits on Grid(3,base16,rgb). On that last GridType the
discrepancy is at a deep level resolved by only a few particles. The p-value property
P(s ≥ k) ≤ 2^-k holds on fresh spawns: the ratio P(s ≥ k)·2^k is 0.65–1.2 for k = 1…9 across all
seed families and GridTypes (ties make it < 1; the occasional > 1 is sampling noise at about 2^-9).

Failure modes:
* **Kernel cannot reach a level.** If the high set is disconnected under single-cell moves and swaps,
  splitting stops early and max_observed_bits is low. Extrapolation then gives +1 to +4 bits.
  `meta["stopped_early"]` (target_bits not reached) and `meta["top_reached"]` (the exemplar's ordinal
  is among the levels) tell the cases apart: stopped early at the true top is fine, but stopped early
  without reaching the top means the kernel got stuck. On Grid(5,base10,rgby), 35 of the 54 tables stop
  early at their true top, and only `robin_hood` (60 bits) and `lone_peak` (54 bits) stop short of
  their exemplar's ordinal.
* **Binary all-or-nothing rules** (e.g. `picture_frame`, P = 4^-16) have no intermediate levels, so
  splitting cannot climb at all. They need `exact_log2_tail`, which they have.
* **Plateaus.** A big mass on one value just above ℓ makes f small for one stage. The estimate stays
  unbiased but has a higher se, and the se reports it.

### 1.3 Determinism, symmetry, caching

* Seed = sha256(canonical JSON of {family id, `family.canonical(params, gtype)`, gtype.key,
  ESTIMATOR_VERSION}). `hashlib`, never `hash()`. Draws in one symmetry orbit share a seed and a table.
* Cache key = sha256(seed key, budget, hash of the source file(s) defining `ordinal`/`batch`).
  Editing a rules file therefore recomputes its tables, and no stale table is served.
* Caching happens in memory (`_MEM`) and on disk at `lib/grid-lab/.cache/survival/<key>.pkl`
  (gitignored; plain dict of numpy arrays).
  Disk load ≈ 0.1 ms.
* `precompute(draws, gtype, processes=4)` builds missing tables in a fork pool. `gridlab.run` calls
  it for every draw of every game before simulating.
* Families without a vectorised `batch` get `SLOW_BUDGET` (2^14 MC, 300 particles, 0.6 sweeps,
  48-bit target), because each evaluation is a Python call.

### 1.4 Joint surprisal and synergy

`joint_surprisal(draw_i, draw_j, gtype, x) -> (s_ij, se)`, with s_ij = −log₂ μ(U_i(x) ∩ U_j(x)).
If the intersection is shallow (≥ 64 hits among 2^16 prior samples), MC answers directly.
Otherwise AMS runs on φ(y) = min(s_i(u_i(y))/s_i(x), s_j(u_j(y))/s_j(x)) up to φ = 1, and the
exact intersection indicator is then applied to the final particles. The set {φ ≥ 1} contains the
intersection, so this final step is a valid last level. The joint uses 2000 particles: on a
multinomial corner case (18 + 18 cells of two colours on 6×6 rgb, exact 23.98 bits) it estimates
24.6 ± 0.9. `synergy(...) = s_i + s_j − s_ij`. Competing colour counts give strongly negative
synergy (conflict). Identical draws give s_ij = s_i.

### 1.5 Calibration time per table (1 core)

| Family | Grid(5,base10,rgby) | Grid(7,cards,rainbow6) | Grid(3,base16,rgb) |
|---|---|---|---|
| toy colour count | 0.10 s | 0.22 s | – |
| toy symbol sum | 0.33 s | 0.73 s | – |
| seed1_line_painter | 0.53 s | 1.70 s | 0.10 s |
| seed2_patchwork | 9.3 s | 28 s | 0.77 s |
| seed3_green_ones | 0.40 s | 1.05 s | 0.06 s |

Cost ≈ (2^16 + stages × N² × 1000) grid evaluations, and is dominated by `evaluate_batch`.
Patchwork's component labelling is the outlier (noted in NOTES.md).

## 2. Simulation (`sim.py`)

`run_game(GameConfig) -> GameLog`. Fixed-step interaction loop with event interleaving:

* **Planning** (t ∈ [−planning_seconds, 0), default 60 s): starting objects exist, energy accrues
  from the start (as in engine.ts, where energy is measured from `createdAt`), and gods decide every
  `decision_interval`. No interactions happen.
* **Running** (t ∈ [0, duration)), with duration ~ Exp(mean = half_life/ln 2), or fixed:
  * an interaction every 1/`interaction_rate_hz` seconds while there are agents: a uniform object
    and a uniform agent over all gods' agents. `Program.apply` runs, and the result is committed
    unless it is `None` or equal to an existing object (including itself). On a commit, every god's
    ordinal of the new grid is evaluated, looked up in its table, and written to the surprisal
    matrix S (objects × gods). Only the changed row is recomputed;
  * Poisson spawns at `spawn_rate_hz`, redrawn on collision;
  * staggered decisions per god every `decision_interval` (default 2 s);
  * snapshots every `snapshot_interval` (default 5 s).
* **Economy knobs**: `starting_energy`, `energy_per_second`, `cost_scale` (multiplies
  `Program.cost`), `max_agents` (200/god). Alternative designs: `metabolic_cost` (energy per
  application attempt; an agent whose owner cannot pay is skipped) and `agent_half_life`
  (exponential agent lifetimes).
* **Dealers**: `distinct` (default: no family repeats while possible), `uniform` (iid),
  `balanced_camps` (round-robin over clumper/alternator/neutral camps), `fixed`.
* **Rate scaling**: the real engine caps interactions at 100 Hz, and the default here is 20 Hz.
  Dynamics depend on interactions per energy unit and per agent. To mimic 100 Hz at 20 Hz, divide
  energy income and starting energy by 5. Metrics normalised per commit do not depend on the rate.
* **Determinism**: one `SeedSequence(seed)` is split into dealer, world (picks, spawns, `apply`),
  game length and per-policy streams. Tables are seed-independent. Same seed gives a bit-identical
  log (tested).
* **GameLog** stores, in compact numpy form: commits (time, object id, agent id, before/after
  surprisal vectors in float32), agents (owner, summon time, cost, mutator ids, attempts), spawns,
  snapshots (per-god total payoff, per-object ids and surprisal vectors), the final world (grids,
  S, payoffs, energy) and counters (attempts, None results, duplicates, commits, summons). Mutator
  ids per commit come from joining c_agent to a_mutators. A 300 s, 4-god game takes about 0.3 MB.

## 3. Policies (`policy.py`)

Disclosure rule: a god sees its own draw and table and, per object, its own surprisal and the peer
surprisal S_−i (the sum of the others). It never sees an individual opponent's function.

Value model: an agent hits uniformly random objects, so for a candidate program P,
d(P) = mean over a sample of ≤ `M_eval` = 24 current objects of Δπ_i (0 when P(x) is None or a
duplicate), and V(P) = d · apps · discount, with apps = rate · E[remaining] / (A+1).
E[remaining] = half-life mean for exponential games (memoryless), the true remainder for fixed ones.
yield = V / cost. All candidate results are stacked and scored in one `evaluate_batch` per family.

| Policy | Behaviour |
|---|---|
| `random` | each decision, with p = 0.5, one random program if affordable |
| `greedy_private` | K = 12 candidates; among affordable ones, the best yield using exact own surprisal and peer surprisal held fixed: Δπ = (s_i(y) − s_i(x))·S_−i(x). Summons if yield > 0, else saves and backs off (skips up to 4 decisions). `learn=True` rescales estimates by realised/predicted payoff of its own agents, shrunk toward 1. |
| `greedy_omniscient` | as greedy, but scores y with every god's table: Δπ_i = π_i(y) − π_i(x). An upper bound standing in for perfect negotiation. |
| `cooperative` | omniscient, maximises Δ Σ_j π_j (welfare). An upper bound standing in for perfect cooperation. |
| `saver` | waits until energy ≥ 60% of starting energy, K = 32, summons only if the best yield > 0 and ≥ the 75th percentile of its own past best yields |
| `idle` | never summons (baseline) |

**Program library.** A program's cost runs a closure probe for guarded and multi-step programs,
about 3.5 ms. Pricing 12 fresh candidates at every decision took 85% of the game time. Policies
therefore draw candidates from `policy.program_library(gtype, factory, 4096)`: 4096 distinct
`random_program`s with precomputed costs, seeded from sha256(GridType, factory source, COST_KNOBS,
LIB_VERSION), and cached in memory and under `.cache/programs/` (6 s to build once per GridType, 20 ms
to load). Draws from it are as random as `random_program` itself. `GameConfig.program_library = 0`
restores fresh sampling, which is also used automatically when `program_kwargs` are given. The
change made long games about 20× faster.

Per-policy parameters are passed through `GameConfig.policy_kwargs`, e.g. `{"K": 16}` for all
policies, or `{"saver": {"q": 0.9}}` for one.

## 4. Metrics (`metrics.py`)

`metrics(log) -> dict`. The definitions are in the module docstring. In summary:

* **tension_rate**: share of commits that raise some god's surprisal and lower another's.
  **harmony_rate**: share where some rise and none fall.
* **cooperative spirals** (SPEC §2): maximal runs of consecutive commits on one object with
  salience rising at every step, length ≥ 2, by ≥ 2 owners. Reported: count, per-100-commit rate,
  length mean/max/histogram, maximum salience gain, and the share of spirals of length ≥ 3 whose
  increments have a positive slope (acceleration).
* **lead_changes**: changes of the total-payoff argmax across snapshots. **payoff_spread** (max−min),
  **payoff_gini**, **welfare** (Σ Π_i).
* **object_volatility**: mean over objects of the std of per-commit change in Σ_i π_i(x).
* **t_stagnation / stagnation_frac**: start of the final run of 10 s windows with < 5% of the peak
  window's |Δ salience|. **late_activity**: share of |Δ salience| in the last 20% of the game.
* **mutator_shares / mutator_entropy / mutator_entropy_norm** over committed applications.
* **family_rank / policy_rank**: final rank per god, to aggregate fairness across many games.
* **dynamism** ∈ [0, 1] = 0.25·tension_rate + 0.20·sq(spirals per 100 commits) +
  0.20·sq(lead changes per 100 s) + 0.20·min(1, late_activity/0.2) + 0.15·mutator_entropy_norm,
  with sq(x) = x/(1+x). It rewards conflict, cooperative spirals, changing leaders, a world still
  moving at the end, and varied mutators. The weights are in `DYNAMISM_WEIGHTS`.

## 5. CLI

```
python3 -m gridlab.run --type 5,base10,rgby --gods 4 --games 20 --policy greedy_private --seed 1
python3 -m gridlab.run --type 5,base10,rgby --gods 4 --games 8 --policy random,greedy_private,saver,greedy_omniscient --trace
```

Other flags: `--dealer`, `--rate`, `--length fixed --seconds 300`, `--half-life`, `--energy`,
`--eps`, `--cost-scale`, `--metabolic`, `--agent-half-life`, `--policy-kwargs JSON`, `--processes`,
`--json out.json`, and `--toys` (stand-in families and mutators).

## 6. Throughput (measured, this container: 4 cores)

All numbers use real rules and programs, 4 gods, and fixed 300 s games at 20 Hz (6001 interactions,
about 5000 commits per game). Tables and the program library were warm unless stated.

**Simulation, one process** (interactions/s; wall time per 300 s game):

| Policy | Grid(5,base10,rgby) | Grid(7,cards,rainbow6) |
|---|---|---|
| random | 10,400 (0.58 s) | ≈ 4,000 (≈ 1.5 s) |
| greedy_private | 7,100 (0.85 s) | 5,400 (1.11 s) |
| greedy_omniscient | 6,600 (0.91 s) | 5,400 (1.12 s) |
| cooperative | 6,900 (0.86 s) | 5,200 (1.15 s) |
| saver (K = 32) | 2,900 (2.07 s) | 2,900 (2.06 s) |

The 7×7 random figure is an estimate. The measured 1,016/s included the one-time program library
build, and a warm profiled game took about 1.5 s. Per-commit cost is dominated by the rules'
`ordinal` calls (G per commit; component-labelling rules are the slowest). Policy cost is dominated
by `Program.apply` on K × M_eval candidate results.

**Batch CLI, 4 processes**: `--games 20 --policy greedy_private` (exponential length, mean 433 s):
20 games in 7.8 s wall, 22,600 interactions/s aggregate. A mixed-policy batch of 40 games
(random/greedy_private/saver/greedy_omniscient) took 13.9 s, at 18,900 interactions/s. Thousands of
games therefore take minutes once tables are warm.

**Calibration** (single table, one core; fork pool of 4 for whole batches):

| GridType | tables (one draw per available family) | wall, 4 procs | per table median / mean / max |
|---|---|---|---|
| Grid(5,base10,rgby) | 54 | 19.9 s | 0.42 s / 1.24 s / 9.5 s (seed2_patchwork) |
| Grid(7,cards,rainbow6) | 69 | 165 s | 2.5 s / 9.2 s / 74 s (swiss_cheese, border_baron) |

Tables are cached by key, so each (family, canonical params, GridType) is paid once. A disk hit takes
about 0.1 ms. Shared symmetry orbits (`canonical`) cut the table count further.

**Rough budget for 1000 games on one GridType**: about 1–3 min to calibrate every reachable draw
(a few hundred tables), plus about 1 min of simulation on 4 cores.
