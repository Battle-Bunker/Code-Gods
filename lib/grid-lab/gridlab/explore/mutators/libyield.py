"""Policy-relevant yield: what the simulator's gods can actually find.

    python3 -m gridlab.explore.mutators.libyield --type 5,base10,rgby [--preset NAME]

The landscape (landscape.py) searches exhaustively for the best route; the simulated policies instead draw
K = 12 candidates per decision from a fixed library of 4096 random programs (policy.program_library). For
every family draw this applies the whole library to the held-out 'game' states and reports
  lib_best     the best library program's yield (held-out),
  lib_bestK    E[max yield among K random library programs] (what one greedy decision sees; K = 12),
  lib_pos      share of library programs with positive yield,
and, per mutator, the share of the yield-weighted top programs that use it.
"""
from __future__ import annotations

import argparse
import multiprocessing as mp
import pickle
import time
from collections import defaultdict

import numpy as np

from ... import calibrate as cal
from ...core import Grid, GridType
from . import states as ST
from .landscape import _ctx_states, _split, surprisal
from .variants import install_preset, preset_tag

_G: dict = {}


def _apply_lib(progs, sym, col, gt):
    P, n = len(progs), len(sym)
    Ys = np.empty((P, n) + sym.shape[1:], sym.dtype)
    Yc = np.empty_like(np.empty((P, n) + col.shape[1:], col.dtype))
    grids = [Grid(a, b) for a, b in zip(sym, col)]
    for i, p in enumerate(progs):
        for j, g in enumerate(grids):
            y = p.run(g, gt)
            Ys[i, j], Yc[i, j] = y.sym, y.col
    return Ys, Yc


def _expected_max_of_k(y: np.ndarray, K: int) -> float:
    """E[max of K draws without replacement] from the empirical values y (exact order-statistic formula)."""
    y = np.sort(y)
    n = len(y)
    if K >= n:
        return float(y[-1])
    # P(max = y_(i)) = C(i-1, K-1)/C(n, K), i = 1..n (1-based rank)
    from math import lgamma, exp
    def lc(a, b):
        return lgamma(a + 1) - lgamma(b + 1) - lgamma(a - b + 1)
    tot = lc(n, K)
    w = np.array([exp(lc(i - 1, K - 1) - tot) if i >= K else 0.0 for i in range(1, n + 1)])
    return float((w * y).sum())


def _work(i):
    draw = _G["draws"][i]
    gt, X, Y, costs, mids = _G["gt"], _G["X"], _G["Y"], _G["costs"], _G["mids"]
    table = cal.survival(draw, gt)
    s0 = surprisal(draw, table, X[0], X[1], gt)
    S1 = surprisal(draw, table, Y[0], Y[1], gt)
    tr, te = _split(len(s0))
    d = (S1 - s0[None])[:, te].mean(1)
    y = d / costs
    top = np.argsort(-y)[:40]
    use = defaultdict(float)
    for j in top:
        for m in mids[j]:
            use[m] += max(y[j], 0) / len(mids[j])
    return i, {"family": draw.family.id, "lib_best": float(y.max()), "lib_bestK": _expected_max_of_k(np.maximum(y, 0), 12),
               "lib_pos": float((y > 0.005).mean()), "use": dict(use)}


def run(gt: GridType, preset: str = "default", k: int = 3, processes: int = 4) -> dict:
    from ...policy import program_library
    from ...sim import default_program_factory
    install_preset(preset)
    t0 = time.time()
    draws = ST.draws_for_type(gt, k)
    cal.precompute(draws, gt, processes=processes)
    progs, costs = program_library(gt, default_program_factory(), 4096)
    ctx = _ctx_states(gt, 64, 64, 8)
    fs, fc = ctx["fresh"]
    ms, mc = ctx["mid"]
    gs = np.concatenate([fs, ms])
    gc = np.concatenate([fc, mc])
    Ys, Yc = _apply_lib(progs, gs, gc, gt)
    print(f"[libyield] {gt.key} {preset}: library applied ({time.time() - t0:.0f}s)", flush=True)
    _G.update(gt=gt, draws=draws, X=(gs, gc), Y=(Ys, Yc), costs=np.asarray(costs), mids=[p.mutator_ids for p in progs])
    out = [None] * len(draws)
    with mp.get_context("fork").Pool(processes) as pool:
        for i, r in pool.imap_unordered(_work, range(len(draws))):
            out[i] = r
    install_preset("default")
    return {"gtype": gt.key, "preset": preset, "draws": out, "seconds": time.time() - t0}


def load_or_run(gt: GridType, preset: str = "default", k: int = 3, **kw) -> dict:
    p = ST.CACHE / f"libyield-{gt.key}-{preset}-{preset_tag(preset)[:10]}-k{k}.pkl"
    if p.exists():
        with open(p, "rb") as fh:
            return pickle.load(fh)
    out = run(gt, preset, k, **kw)
    ST.CACHE.mkdir(parents=True, exist_ok=True)
    with open(p, "wb") as fh:
        pickle.dump(out, fh)
    return out


def family_table(R: dict) -> dict:
    by = defaultdict(list)
    for r in R["draws"]:
        by[r["family"]].append(r)
    return {f: {k: float(np.mean([x[k] for x in rs])) for k in ("lib_best", "lib_bestK", "lib_pos")} for f, rs in by.items()}


if __name__ == "__main__":
    from ...experiments.common import parse_type
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--preset", default="default")
    a = ap.parse_args()
    R = load_or_run(parse_type(a.type), a.preset)
    F = family_table(R)
    v = np.array([x["lib_bestK"] for x in F.values()])
    print(f"lib_bestK median {np.median(v):.3f}, p10 {np.quantile(v, .1):.3f}, p90 {np.quantile(v, .9):.3f}, "
          f"SD log2 {np.log2(np.maximum(v, 1e-3)).std():.2f}")
    for f, x in sorted(F.items(), key=lambda kv: kv[1]["lib_bestK"]):
        print(f"{f:28s} bestK {x['lib_bestK']:.3f}  best {x['lib_best']:.3f}  pos {x['lib_pos']:.2f}")
