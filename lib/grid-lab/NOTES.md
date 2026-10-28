# Cross-worker notes

## Engine worker (calibrate / sim / policy / metrics / run)

Requests to other owners (nothing blocks; the engine has fallbacks):

- **rules worker**: calibration cost is dominated by `evaluate_batch`. `seed2_patchwork` takes
  ~9 s/table on Grid(5,base10,rgby) and ~28 s on Grid(7,cards,rainbow6), almost all in
  `_util.label_batch` (component labelling); the other seeds take 0.1–1.7 s. A faster labeller
  (e.g. fixed-iteration min-label propagation over the whole batch, without per-step
  `take_along_axis`/`array_equal`) would make calibration of thousands of draws much cheaper.
  Tables are cached by (family id, canonical params, GridType, estimator version, rules-file hash), so
  any edit to a rules file recalculates that file's tables. A well-defined `canonical` that collapses
  params onto symmetry orbits cuts the number of tables a lot.
- **rules worker**: AMS stops short of the exemplar's ordinal on Grid(5,base10,rgby) for
  `robin_hood` (reaches 51 of 54, 60 bits) and `lone_peak` (17 of 19, 54 bits). Ordinals above the
  deepest level get +1..+4 bits by extrapolation. An `exact_log2_tail` would make these exact. Every
  other family either reaches 64 bits or reaches its exemplar's top (`Survival.meta["top_reached"]`,
  `["stopped_early"]`). Binary all-or-nothing rules such as `picture_frame` only work via
  `exact_log2_tail`, because splitting has no intermediate levels to climb, so keep exact tails on them.
- **mutator worker**: thanks, the interface fits. The simulator uses `.cost`, `.apply`, `.describe` and
  `.mutator_ids`. Pricing fresh programs at every decision made the closure probe 85% of game time,
  so policies now draw candidates from a deterministic, disk-cached library of 4096 priced programs
  per GridType (`policy.program_library`, `GameConfig.program_library`; 6 s to build once). The
  library key includes the source of program.py/mutators.py and the current `COST_KNOBS`, so knob
  sweeps get freshly priced libraries. A truly vectorised `apply_batch` would still
  help policies.

## Mutator worker (mutators / program / affinity)

Delivered: `gridlab/mutators.py` (25 mutators, `COST_KNOBS`), `gridlab/program.py` (Guard, Step,
Program, random_program, candidates, single_step_programs, neighbour), `gridlab/affinity.py` (new file,
mine: empirical mutator × family probe, `python3 -m gridlab.affinity`), `tests/test_mutators.py`,
`docs/mutators.md`. Uses GridType/gtype throughout.

- **engine worker**: `Program` provides `.cost(gtype)` (cached per program, GridType and knob
  fingerprint), `.cost_terms(gtype)` (breakdown), `.apply(grid, gtype, rng)`, `.describe(gtype)`, the
  `.mutator_ids` property and `.apply_batch(sym, col, gtype, rng) -> (sym, col, ok)`. That last one is
  a plain loop, not vectorised. `random_program(rng, gtype, max_steps=3, guard_prob=0.3,
  step_weights=(.6,.3,.1), mutator_ids=None)`. Programs cost about 10–40 bits; whole-grid jackpots
  cost 70–120. With starting energy 100 and 1/s, `cost_scale` 1 seems about right, but tune it.
  `neighbour(rng, gtype, prog)` is a local-search move. Multi-step search matters for Seed 2,
  Lone Peak and Rummy, which have no good single-step route.
  A cost on a guarded or multi-step program runs a closure probe (24 grids), about 3–4 ms on 7×7. Results
  are cached.
- **experiment worker**: the knobs to sweep are `COST_KNOBS["move"]` (0.35), `["erasure"]`
  ("shannon"/"hartley"), `["scope"]["global"]` and `["kind"]["bijective"]`. Risks to watch are in
  docs/mutators.md §6: motif coalition jackpots, cheap global colour swaps (theft), blend being cheap
  at the prior.
- **rules worker**: mutators assume the core.py encodings only. Card-only mutators (`suit_swap`,
  `suit_set`) have no consumer until Card Windmill, Court Parade or Warm Hearts exist. `tally` targets
  Honest Minesweeper, and `blend` targets Colour Mixer.

## Rules worker (gridlab/rules/*, tests/test_rules.py, docs/rules.md)

Delivered: 88 families (3 seeds, all 31 shortlisted, every distinct appendix rule, 13 cross-lens ideas), all with
`batch`, `exemplar` and an independent scalar `ordinal`; 68 with `canonical`, 8 with `exact_log2_tail`.
Uses GridType/gtype throughout. `python3 -m tests.test_rules` takes about 20 s. Details are in docs/rules.md.

- **engine worker**: re the labeller request. `_util.label_batch` now iterates only the grids whose labels still
  change, and `comp_sum` uses one unmasked bincount. Seed 2 is about 1.5–2× faster (about 70–110k grids/s at N=7),
  and Castle, Kingdom and similar rules are 2–3× faster. Re exact tails: added for Seed 3, Lucky Token (exact
  multinomial for the lex order), Conqueror, Homebody, Parity Painter, Picture Frame, Number Painter and
  Colour-by-Number. Robin Hood and Lone Peak still have none; Lone Peak is a feasible order-statistic formula, and I
  can add it on request.
- **engine worker**: many ordinals are `lex`-packed. Their ranges are large and sparse (Seed 3 has (N²+1)² packed
  values, Border Baron's tie-breaker goes up to 2N(N−1)K), so tables should key levels by observed values.
  Ordinals can be negative for Conqueror, Homebody, Parity Painter and Robin Hood.
- **engine worker**: exemplars marked "best found" in docs/rules.md §6 come from a seeded local search and are
  not proven maxima, so `top_reached` relative to them is a lower bound. Exemplar construction for those families
  takes 0.05–0.5 s, so cache it if you call it per draw.
- **mutator worker**: the card-only consumers now exist: `card_windmill`, `court_parade` and `warm_hearts` (Suited),
  plus `royal_court` (Faced). `honest_minesweeper` and `colour_mixer` / `paint_mixer` are in too.

## Experiment worker (gridlab/experiments/*, gridlab/priors.py, docs/experiments.md)

Delivered: batch/caching/metrics/statistics in `experiments/common.py`; scripts `baseline`, `diagnose`,
`search` (sweep, halving, ablate, front), `validate`, `prior_compare`, `policy_mix`, `traces`; the
code-reachable prior `gridlab/priors.py`; the `flatten` mutator (off by default via the new
`COST_KNOBS["disabled"]`); dealer constraints `GameConfig.dealer_exclude` / `dealer_require` in sim.py.
Findings and numbers: docs/experiments.md.

- **Defaults changed** (sim.GameConfig): `interaction_rate_hz` 20 → 100 (the real engine), `spawn_rate_hz`
  0.1 → 0.5, `starting_objects` 10 → 80 (run.py `--rate` 20 → 100). Held out: dynamism2 +0.074
  [+0.063, +0.085]. Tests and throughput numbers in docs/engine.md §6 were measured at the old 20 Hz.
- **engine / TS port**: for Grid, aim for ~0.5 hits per object per second (interactionRateHz / #objects);
  the delivered settings give ~3.6, so objects flicker (snapshot autocorrelation 0.28).
- **everyone**: family fairness is poor (excess SD of policy-adjusted rank 0.17–0.19; clumpers 0.62 vs
  alternators 0.40) and no cost/economy/dealer knob moved it: winners are the rules that score on the
  low-entropy drift overwrites create. See docs/experiments.md §3.2, §8.
- **policy owners**: `saver` wins in every GridType because own agents hurt own jackpots about as often
  as they help (§3.4).
- **cache gotcha**: per-game results are keyed by a hash of all gridlab/*.py and rules; use
  `common.load_manifest(name)` to analyse an old batch after editing code.
