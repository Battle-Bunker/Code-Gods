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
