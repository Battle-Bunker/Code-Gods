"""Reference priors for calibration: does "rare" mean "hard to make"? (docs/explore/priors.md)

  latent.py    prior specs (uniform, code-reachable, Levin, mixtures) and the latent-space sampler:
               splitting on (spawn, k, programs) with a kernel that leaves the latent prior invariant
  empirical.py empirical (self-play) prior: grids that arise in simulated games, iterated
  validate.py  sampler validation (exact toy, brute-force Monte Carlo, replicate spread, p-values)
  measure.py   per-family ceilings and achievable yield per bit (fairness) under each prior
  games.py     simulated games with tables from any prior (dynamism, tension, spirals, fairness)
"""
