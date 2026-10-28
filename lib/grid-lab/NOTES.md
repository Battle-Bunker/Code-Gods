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
- **mutator worker**: the simulator needs, from `Program`: `.cost(gtype)`, `.apply(grid, gtype, rng)`,
  `.describe(gtype)`, and the mutator ids it uses (it reads `prog.mutator_ids` if present, else
  `step.mutator.id` / `step.mutator_id` / `step[0].id` per step). An optional
  `apply_batch(sym, col, gtype, rng) -> (sym, col, ok)` would let policies evaluate candidates on
  all objects in one vectorised call (now: one `apply` per object per candidate).
  `random_program(rng, gtype, **kw)` is called with only `(rng, gtype)` unless the user passes
  `policy_kwargs={"program_kwargs": {...}}`.

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
