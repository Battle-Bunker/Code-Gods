# Grid Lab experiments: how dynamic are the games, and what makes them more so?

Owner: experiment worker. Code: `gridlab/experiments/` (`common.py` batches, caching, metrics and
statistics; `baseline.py`, `diagnose.py`, `search.py`, `validate.py`, `prior_compare.py`,
`policy_mix.py`, `traces.py`, `report.py`, `settings.py`), plus `gridlab/priors.py` (the code-reachable
prior) and one new mutator, `flatten`, in `gridlab/mutators.py`. Every script prints markdown
tables and caches each game under `.cache/experiments/games/`. Each script's `--help` gives its
command line, and the commands are also listed in §9.

<!-- SECTIONS FILLED BELOW -->
