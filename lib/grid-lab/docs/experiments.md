# Grid Lab experiments: how dynamic are the games, and what makes them more so?

Owner: experiment worker. Code: `gridlab/experiments/` (`common.py` holds batches, caching, extended
metrics and statistics; then `baseline.py`, `diagnose.py`, `search.py`, `validate.py`,
`prior_compare.py`, `policy_mix.py`, `traces.py`, `report.py` and `settings.py`). Also
`gridlab/priors.py` (the code-reachable prior), one new mutator `flatten` in `gridlab/mutators.py`,
and dealer constraints in `gridlab/sim.py`. Every script prints markdown tables and caches each game
under `.cache/experiments/games/`. The command lines are in §9.

**Scope note.** The coordinator narrowed this worker to (1) the baseline across GridTypes,
(2) diagnosis and (3) an integrated search over COST_KNOBS, economy and dealer knobs with the
existing policies. Seven parallel sessions own the deep versions of the remaining topics: economy and
agent lifecycle, synergy atlas and dealer, realistic player policies, priors, mutator × rule
fairness, spirals and tension, and the GridType landscape. The prior comparison (§6) is only a quick
check. §8 lists the pending inputs from those sessions.

**Caveat that applies to everything below.** All players are simulated policies (`random`,
`greedy_private`, `saver`, `greedy_omniscient`; one-step lookahead on a random 24-object sample).
The "boil", fairness and policy results depend on these policies. Real players, who plan, focus on
particular objects and react, could change any of them. The robust results are the structural ones:
the hit rate per object, the low-entropy drift and the bijection churn. Each section marks where a
conclusion could flip with real players.

<!-- BODY -->
