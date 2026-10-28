"""Spirals exploration: the forked simulator matches gridlab.sim when its prototypes are off, the extend
mutators are idempotent overwrites with sane prices, and the sharpened metrics behave on toy paths.

    cd lib/grid-lab && python3 -m tests.test_spirals
"""
import time

import numpy as np

from gridlab.core import GridType, Grid, spawn
from gridlab.sim import GameConfig, run_game
from gridlab.metrics import _upswings, spiral_metrics
from gridlab.explore.spirals import extend as xt
from gridlab.explore.spirals.simx import Ext, run_game_x


def test_fork_identical():
    cfg = GameConfig(gtype=GridType(4, "base12", "rgb"), n_gods=3, length="fixed", fixed_seconds=40,
                     policies=["random", "greedy_private", "saver"], seed=5)
    a, b = run_game(cfg), run_game_x(cfg, Ext())
    for k in ("c_time", "c_obj", "c_agent", "c_before", "c_after", "final_payoff", "a_cost"):
        assert np.array_equal(getattr(a, k), getattr(b, k)), k
    assert a.counters["commits"] == b.counters["commits"]


def test_extend_idempotent_and_priced():
    xt.register()
    for gt in (GridType(5, "base10", "rgby"), GridType(4, "cards", "rgb"), GridType(3, "base16", "rainbow6"),
               GridType(7, "base12", "rainbow6")):
        rng = np.random.default_rng(1)
        for m in xt.EXTEND:
            if not m.available(gt):
                continue
            for p in m.space(gt):
                c = m.cost(p, gt)
                assert 4 < c < 80, (m.id, p, c)
                for _ in range(60):
                    g = spawn(gt, rng)
                    # bias towards structure: copy a line so runs exist
                    s, col = g.sym.copy(), g.col.copy()
                    col[0, :] = col[0, 0]
                    col[1, : gt.N - 1] = (np.arange(gt.N - 1) + col[1, 0]) % gt.C
                    g = Grid(s, col)
                    y = m.apply(g, p, gt)
                    if y is not None:
                        assert m.apply(y, p, gt) is None, (m.id, p, gt.key)


def test_upswings():
    v = np.array([0, 1, 3, 2.5, 6, 9, 4, 5, 20, 21])
    ups = _upswings(v, tol_min=2.0, tol_frac=0.25, report=4.0)
    assert ups[0][:2] == (0, 5), ups
    assert ups[-1][:2] == (6, 9) and ups[-1][2], ups


def test_spiral_metrics_run():
    cfg = GameConfig(gtype=GridType(4, "base12", "rgb"), n_gods=3, length="fixed", fixed_seconds=60,
                     interaction_rate_hz=50.0, seed=2)
    log = run_game(cfg)
    m = spiral_metrics(log)
    assert m["ep_spiral_excess"] > 0 and 0 <= m["tn_recovered"] <= 1


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            t0 = time.perf_counter()
            fn()
            print(f"ok {name} ({time.perf_counter() - t0:.2f}s)")
