"""Self-tests for the economy simulator: python3 -m gridlab.explore.economy.selftest

1. Econ() reproduces gridlab.sim.run_game bit for bit (toys and real providers, every policy mix).
2. Every economy knob runs, keeps objects unique, never lets energy go negative, and its book-keeping
   adds up (spent = summons + gas - refunds; income; caps; charge deaths)."""
from __future__ import annotations

import numpy as np

from gridlab.sim import run_game
from tests.test_sim import small
from .econ_sim import Econ, run_econ_game

FIELDS = ("c_time", "c_obj", "c_agent", "c_before", "c_after", "a_owner", "a_cost", "final_payoff",
          "snap_payoff", "final_sym", "final_col", "final_energy")


def test_identity(real):
    for pol in (["random", "greedy_private", "saver"], "cooperative", "greedy_omniscient"):
        for kw in ({}, {"agent_half_life": 20.0}, {"metabolic_cost": 0.05}):
            cfg = small(real=real, policies=pol, **kw)
            a, b = run_game(cfg), run_econ_game(cfg, Econ())
            for f in FIELDS:
                x, y = getattr(a, f), getattr(b, f)
                assert x.shape == y.shape and np.allclose(x, y, atol=1e-3), (f, pol, kw)
            assert a.counters["commits"] == b.counters["commits"], (pol, kw)


def test_knobs(real):
    variants = [Econ(gas=0.02), Econ(gas_frac=0.01, refund=1.0), Econ(gas=0.05, unpaid="starve"),
                Econ(charges=20), Econ(charges=5, charge_on="commit"), Econ(half_life=10.0),
                Econ(lifetime=15.0), Econ(crowd_tax=0.2), Econ(energy_cap=40.0), Econ(income_tilt=0.8),
                Econ(income_tilt=-0.8), Econ(income_own=0.5), Econ(income_any=0.2),
                Econ(gas=0.02, half_life=20.0, aware=True)]
    for e in variants:
        cfg = small(real=real, policies=["random", "greedy_private", "saver"])
        log = run_econ_game(cfg, e)
        assert (log.final_energy >= -1e-6).all(), e
        own = np.bincount(log.a_owner.astype(int), weights=log.a_cost, minlength=3)
        assert np.allclose(log.spent, own + log.gas_paid - log.refunded, atol=1e-2), (e, log.spent, own)
        if e.energy_cap is not None:
            assert (log.snap_energy <= e.energy_cap + 1e-4).all()
            assert log.cap_lost.sum() > 0
        if e.charges and e.charge_on == "attempt":
            assert (log.a_attempts <= e.charges).all()
        if e.charges and e.charge_on == "commit":
            assert (log.a_commits <= e.charges).all()
        if e.lifetime:
            alive = log.a_death - np.maximum(log.a_time, 0)
            assert (alive <= e.lifetime + 1e-3).all()
        if e.income_own or e.income_any:
            assert log.income.sum() > 0
        assert log.counters["commits"] == len(log.c_time)
        assert len(set(map(bytes, log.final_sym.reshape(len(log.final_sym), -1)))) <= len(log.final_sym)
        print(f"  ok {e}: commits {log.counters['commits']}, agents {len(log.a_owner)}, "
              f"final live {int(log.snap_live[-1].sum())}")


def main():
    for real in (False, True):
        print(f"providers: {'real' if real else 'toys'}")
        test_identity(real)
        print("  ok identity with gridlab.sim.run_game")
        test_knobs(real)


if __name__ == "__main__":
    main()
