# Grid Lab spec (shared contract for all workers)

Grid Lab is a Python + numpy research simulator for the Code Gods `Grid` object type. It lives in
`lib/grid-lab/`, is run as `cd lib/grid-lab && python3 -m gridlab.<module>`, and has no other
dependencies (no pytest: tests are `python3 -m tests.<name>` scripts using plain `assert`).
Nothing here is wired into the game server yet; it exists to design and validate the rule
ecosystem before porting to TypeScript/Python runtimes.

Background reading (scratchpad, not in repo):
`/tmp/claude-0/-home-user-Code-Gods/8e442ddc-41b4-5c0d-b592-94ebea88a286/scratchpad/grid/`
`catalog.md` (31 shortlisted + appendix rules, interaction matrix, rarity table §2b),
`architecture.md` (capability classes, §10 ordinal outputs and calibration), and the five lens files
`geometry.md arithmetic.md colour.md games.md strategy.md`. Game engine semantics are summarised below.

## 1. Game semantics being simulated (from artifacts/api-server/src/game/engine.ts)

- A world holds unique objects (grids). `startingObjectCount` (10) at start; Poisson spawns at
  `spawnRateHz` (0.1); spawns redraw on collision.
- Each god holds one private utility function (a `Draw`). Gods summon *agents*. Every interaction
  picks a uniformly random object AND a uniformly random agent among ALL gods' agents, applies the
  agent, and commits the result unless it equals any existing object (including itself): then
  nothing happens. Agents never die (max 200 per god). Rate cap 100 Hz.
- Energy: `startingEnergy` 100, accrues `energyPerSecond` 1 (real time); summoning costs the
  agent's complexity once.
- Game length: exponential with half-life `halfLifeSeconds` (300 s); 60 s planning before.
- Final leaderboard: each god's total payoff over all objects present at the end.
NEW in this design: agents are programs built ONLY from per-type *mutators* (no free code);
an agent's cost is the sum of its mutators' bespoke costs, in bits.

## 2. Naming schema (use these names in code, docs and output)

| Symbol | Name | Code name | Meaning | Resonance |
|---|---|---|---|---|
| u_i : T → ℤ | **utility function** (returns an **ordinal utility**) | `ordinal` | Rule output; only its order matters. Ties allowed. | Ordinal utility / utility representation theorem (decision theory) |
| U_i(x) = {y : u_i(y) ≥ u_i(x)} | **upper contour set** | `contour` | Everything at least as good as x for god i. | Microeconomics (preference upper contour sets) |
| μ | **prior** | `prior` | Reference measure: the grid type's uniform spawn distribution. | Bayesian prior / base measure |
| G_i(t) = μ{u_i ≥ t} | **survival function** | `Survival` | Tail mass of god i's ordinal under the prior. | Statistics (survival / complementary CDF) |
| p_i(x) = G_i(u_i(x)) | **tail mass** (a p-value) | `tail` | Chance a random spawn is at least this good. | Hypothesis testing |
| s_i(x) = −log₂ p_i(x) | **surprisal** (bits) | `surprisal` | God i's information score for object x. P(s ≥ k) ≤ 2^−k for every rule. | Shannon self-information |
| S_−i(x) = Σ_{j≠i} s_j(x) | **peer surprisal** | `peer_surprisal` | What everyone else's rules see in x. | |
| π_i(x) = s_i(x) · S_−i(x) | **payoff** (bits²) | `payoff` | God i's score from object x. | Game-theoretic payoff |
| Π_i = Σ_x π_i(x) | **total payoff** | `total_payoff` | Leaderboard value. | |
| Σ_i s_i(x) | **salience** of x | `salience` | Total information all gods see in x. | Salience (Schelling focal points) |
| s_i + s_j − s_ij, with s_ij = −log₂ μ(U_i ∩ U_j) | **synergy** (pointwise mutual information) | `synergy` | >0: i and j's goals co-occur more than chance (aligned); <0 conflict. | Pointwise mutual information |
| d_i : T → ℤ | **penalty** (a defence goal; returns a badness ordinal, higher = worse) | `penalty` | Optional second utility function: what god i wants to stop. Calibrated like u_i. | Loss function |
| h_i(x) = η(−log₂ μ{d_i ≥ d_i(x)}), η(s) = log₂(1+2^(s−1)) − log₂ 1.5 | **penalty bits** (⚠️) | `penalty_bits` | Soft hinge at the median: ≈ 0 for typical grids, strictly increasing. P(h ≥ k) ≤ ⅔·2^−k for every penalty. | Surprisal of the bad event |
| n_i = s_i − w(h_i − E_μ h_i) | **net bits** (signed) | `net_bits` | + for surprisingly good, − for surprisingly bad; = s_i without a defence goal. Monotone in the card. | |
| max(0, Σ_{j≠i} n_j) | **peer care** | `peer_care` | The floored multiplier: π_i = n_i · peer care. "If the others don't care, nobody scores." See docs/defence-goals.md. | |
| cost(m) | **action cost** (bits) | `cost` | Bespoke per-mutator charge, from energy. | MDL / Landauer erasure cost |
| Δπ_i / cost | **yield** | `yield_` | Payoff gained per bit spent. | Efficiency |
| — | **cooperative spiral** | `spiral` | Run of consecutive transformations of one object by ≥2 owners in which salience rises each step. | Positive feedback |
| — | **tension** | `tension` | Share of transformations that raise someone's surprisal while lowering another's. | Zero-sum conflict |

Kid-facing UI labels (proposal): surprisal = "✨ rarity (bits)", payoff = "points", salience = "🔥 hot object",
penalty bits = "⚠️" ("redder than 90% of grids").

## 3. Modules and owners

| File | Owner | Contract |
|---|---|---|
| `gridlab/core.py` | coordinator (done) | `GridType`, `Grid`, `Requires`/`req`, `spawn`, `spawn_batch`, `D4`, `lines`, `neighbours4`, `all_grid_types`. Encodings documented in the module docstring. |
| `gridlab/family.py` | coordinator (done) | `Family`, `Draw`, `lex`. |
| `gridlab/rules/*.py`, `gridlab/rules/__init__.py` | rules worker | `FAMILIES: list[Family]`, `by_id(id)`. All brainstorm rules converted to ordinal form. |
| `gridlab/calibrate.py` | engine worker | `survival(draw, gtype) -> Survival` with `.surprisal(t) -> float` (bits, ≥ 0, non-decreasing in t), `.log2_tail(t)`, `.max_observed_bits`; deterministic (seeded from a stable hash of family id, canonical params, gtype key, estimator version); disk cache under `lib/grid-lab/.cache/` (gitignored). Monte Carlo body + multilevel splitting tail; uses `exact_log2_tail` when provided. |
| `gridlab/mutators.py`, `gridlab/program.py` | mutator worker | `MUTATORS: list[Mutator]`; `Mutator(id, name, summary, requires, sample(rng, gtype)->params, cost(params, gtype)->float bits, apply(grid, params, gtype, rng)->Grid|None)`. `Program(guard, steps)` = an agent, with `.cost(gtype)`, `.apply(grid, gtype, rng)->Grid|None`, `.describe(gtype)`; `random_program(rng, gtype, ...)` and enumeration helpers for policies. |
| `gridlab/sim.py`, `gridlab/policy.py`, `gridlab/metrics.py` | engine worker | `GameConfig` (gtype, gods, dealer, economy knobs, policy names, rates, seed), `run_game(config) -> GameLog`, `metrics(log) -> dict`. Policies choose Programs to summon. |
| `gridlab/experiments/*.py`, `docs/experiments.md` | experiment worker (later) | Batches of games, sweeps, optimisation. |
| `docs/*.md` | each owner for its area | |

Do not edit files you don't own; if you need a change in someone else's file, write a note in
`lib/grid-lab/NOTES.md` under a heading with your role. Do not run git commit/push.

## 4. Terminology: GridType, not room

A **room** is the game lobby where players gather, configure settings and launch games; it is not
a type-level concept. The parameterised object type is a **GridType** (`Grid(5,cards,rgb)`): the
type constructor `Grid` fully applied to its runtime parameters. Code uses `GridType` and the
variable name `gtype`; the full list is `all_grid_types()`. A game's settings select its GridType.
Never use `room`/`Room` for this in Grid Lab code or docs.
