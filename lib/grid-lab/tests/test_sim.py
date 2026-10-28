"""Simulation tests: python3 -m tests.test_sim

Uses the real gridlab.rules / gridlab.program when importable, else the stand-ins in tests/toys.py."""
from __future__ import annotations

import time

import numpy as np

from gridlab.core import GridType
from gridlab.sim import GameConfig, run_game, payoffs
from gridlab.metrics import metrics
from gridlab.policy import POLICIES
from tests.toys import TOY_FAMILIES, toy_random_program

GT = GridType(5, "base10", "rgby")


def providers(real: bool):
    if real:
        try:
            from gridlab.sim import default_families
            from gridlab.program import random_program
            return {"families": default_families(), "program_factory": random_program}
        except ImportError:
            pass
    return {"families": TOY_FAMILIES, "program_factory": toy_random_program}


def small(seed=3, real=False, **kw):
    base = dict(gtype=GT, n_gods=3, length="fixed", fixed_seconds=60.0, planning_seconds=20.0,
                policies=["random", "greedy_private", "saver"], seed=seed, snapshot_interval=0.5)
    base.update(providers(real))
    base.update(kw)
    return GameConfig(**base)


def check_unique(world, ev):
    keys = [g.key for g in world.objects]
    assert len(set(keys)) == len(keys) == world.M, "duplicate objects in world"
    assert set(keys) == world.keys, "key index out of sync"
    S = world.S[:world.M]
    assert np.allclose(S, np.array([world.svec(g) for g in world.objects])), "stale surprisal"
    assert all(world.energy(i) >= -1e-9 for i in range(world.G)), "negative energy"


def test_reproducible(real=False):
    a, b = run_game(small(real=real)), run_game(small(real=real))
    for f in ("c_time", "c_obj", "c_agent", "c_before", "c_after", "a_owner", "a_cost", "final_payoff",
              "snap_payoff", "final_sym", "final_col"):
        assert np.array_equal(getattr(a, f), getattr(b, f)), f
    assert a.families == b.families and a.params == b.params and a.counters == b.counters
    c = run_game(small(seed=4, real=real))
    assert not (len(c.c_time) == len(a.c_time) and np.array_equal(c.c_after, a.c_after))
    assert a.counters["commits"] > 0


def test_uniqueness_throughout(real=False):
    for pol in POLICIES:
        if pol == "idle":
            continue
        log = run_game(small(policies=pol, real=real), hook=check_unique)
        # every commit changed something and every final vector matches the payoff formula
        assert np.allclose(payoffs(log.final_s.astype(float)).sum(0), log.final_payoff, rtol=1e-4, atol=1e-3)
        assert log.counters["commits"] == len(log.c_time)


def test_economy_variants(real=False):
    log = run_game(small(metabolic_cost=0.05, agent_half_life=20.0, real=real), hook=check_unique)
    assert log.counters["attempts"] > 0
    m = metrics(log)
    for k in ("tension_rate", "spirals", "lead_changes", "payoff_gini", "dynamism", "mutator_entropy"):
        assert k in m
    assert 0.0 <= m["dynamism"] <= 1.0
    for dealer in ("uniform", "distinct", "balanced_camps"):
        run_game(small(dealer=dealer, n_gods=5, policies="random", real=real))


def test_throughput(real=False):
    cfg = small(policies="greedy_private", fixed_seconds=300.0, real=real)
    run_game(cfg)  # warm tables
    t0 = time.perf_counter()
    log = run_game(cfg)
    dt = time.perf_counter() - t0
    print(f"  {log.counters['attempts']} interactions in {dt:.2f}s = {log.counters['attempts'] / dt:,.0f}/s "
          f"({log.counters['commits']} commits, {len(log.a_owner)} agents)")


def main():
    real = False
    try:
        from gridlab.sim import default_families
        import gridlab.program  # noqa: F401
        real = bool(default_families())
    except ImportError:
        pass
    for r in ([False, True] if real else [False]):
        print(f"providers: {'real' if r else 'toys'}")
        for name, fn in list(globals().items()):
            if name.startswith("test_") and callable(fn):
                t0 = time.perf_counter()
                fn(real=r)
                print(f"ok {name} ({time.perf_counter() - t0:.2f}s)")


if __name__ == "__main__":
    main()
