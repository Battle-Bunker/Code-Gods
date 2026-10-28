"""Economy and agent lifecycle exploration (docs/explore/economy.md).

  econ_sim   run_econ_game: gridlab.sim.run_game plus gas, refunds, lifetimes, charges, crowding tax,
             income loops and per-agent / per-snapshot economy logs
  econ_metrics  lifecycle, accumulation, runaway and energy metrics on top of experiments.common.ext_metrics
  batch      cached parallel batches of econ games on paired specs
  study      the experiment CLI (sweeps, interactions, validation)
"""
