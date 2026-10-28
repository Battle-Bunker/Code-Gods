"""Empirical (self-play) prior: calibrate against the grids that actually arise in simulated games.

    python3 -m gridlab.explore.priors.empirical --type 4,base12,rgb --lam 0.5 --iters 4

    ρ_E = lam·μ + (1 - lam)·E,   E = empirical law of snapshot grids in training games

E is time-weighted (objects are sampled at the 5 s snapshots, up to 300 grids per game) from
EMP_GAMES games per GridType on training seeds (disjoint from every evaluation seed), with the
engine defaults and mixed policies. Its survival function is exact given the uniform table:
ρ_E{u >= t} = lam·μ{u >= t} + (1 - lam)·#{pool grids with u >= t}/n, so no sampler is needed. The
uniform part keeps every grid's surprisal finite and bounds it: s_E <= s_μ - log2 lam.

Fixed point: iteration 0 is the uniform prior; iteration i+1 is built from games calibrated with
iteration i (same training seeds, so the map is deterministic). Prior names: `emp:<lam>:<i>`.
The report shows how far successive tables move (mean |Δs| on held-out game grids) and the
training games' dynamism, so convergence (or a cycle) is visible.
"""
from __future__ import annotations

import argparse
import hashlib
import math
from pathlib import Path

import numpy as np

from ...core import GridType
from ...family import Draw
from ... import calibrate as cal
from . import latent as la

EMP_GAMES = 40
EMP_SEED = 900_000
_POOL: dict = {}
_TAB: dict = {}


def parse(name: str) -> tuple[float, int]:
    _, lam, it = name.split(":")
    return float(lam), int(it)


def _pool_path(gt: GridType, lam: float, it: int) -> Path:
    h = hashlib.sha256(f"{gt.key}|{lam}|{it}|{EMP_GAMES}|{EMP_SEED}".encode()).hexdigest()[:24]
    return la.CACHE / "empirical" / f"pool-{h}.npz"


def pool_for(gt: GridType, lam: float, it: int, processes: int = 4):
    """Snapshot grids from the training games of iteration it-1 (it >= 1)."""
    k = (gt, lam, it)
    if k in _POOL:
        return _POOL[k]
    path = _pool_path(gt, lam, it)
    if path.exists():
        z = np.load(path)
        _POOL[k] = (z["sym"], z["col"])
        return _POOL[k]
    from ...experiments.common import make_specs
    from . import games
    src = "uniform" if it == 1 else f"emp:{lam}:{it - 1}"
    gs = f"{gt.N},{gt.symbols},{gt.colours}"
    specs = make_specs([gs], EMP_GAMES, EMP_SEED)
    res = games.run_batch(src, specs, processes=processes, collect=True)
    S, C = games.collected(res)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, sym=S, col=C)
    _POOL[k] = (S, C)
    return _POOL[k]


def played_grids(gt: GridType):
    """Grids met in uniform-calibrated games (iteration-1 pool), for measure.py's `played` context."""
    return pool_for(gt, 0.5, 1)


def survival(draw: Draw, gt: GridType, lam: float, it: int) -> cal.Survival:
    uni = cal.survival(draw, gt)
    if it == 0:
        return uni
    key = (cal.cache_key(draw, gt), lam, it)
    if key in _TAB:
        return _TAB[key]
    S, C = pool_for(gt, lam, it)
    p = cal.canonical_params(draw, gt)
    V = np.sort(np.asarray(draw.family.evaluate_batch(S, C, p, gt), np.int64))
    n = len(V)
    lv = np.union1d(uni.levels, np.unique(V))
    frac = (n - np.searchsorted(V, lv, side="left")) / n
    gu = 2.0 ** np.asarray(uni.log2_tail(lv), float)
    tail = lam * gu + (1 - lam) * frac
    seu = np.array([uni.stderr(int(t)) for t in lv])
    var = (lam * gu * la.LN2 * seu) ** 2 + (1 - lam) ** 2 * frac * (1 - frac) / n
    se = np.sqrt(var) / (tail * la.LN2)
    meta = {"family": draw.family.id, "prior": f"emp:{lam}:{it}", "pool": n,
            "pool_share_at_top": float(frac[-1])}
    t = cal.Survival(f"emp|{uni.key}|{lam}|{it}", lv, np.log2(tail), se, list(uni.extra_levels), meta)
    _TAB[key] = t
    return t


def provider(name: str):
    lam, it = parse(name)
    tag = f"emp|{lam}|{it}|{EMP_GAMES}|{EMP_SEED}"

    def pre(ds, gt, proc):
        for j in range(1, it + 1):
            pool_for(gt, lam, j, proc)

    return tag, (lambda d, gt: survival(d, gt, lam, it)), pre


def fixed_point(gt: GridType, lam: float, iters: int, processes: int = 4) -> str:
    from .measure import family_draws
    from .validate import md
    from ...experiments.common import make_specs
    from . import games
    draws = family_draws(gt)
    cal.precompute(draws, gt, processes=processes)
    gs = f"{gt.N},{gt.symbols},{gt.colours}"
    # held-out reference grids: snapshot grids from games on other seeds under the uniform prior
    ref_specs = make_specs([gs], 12, EMP_SEED + 50_000)
    RS, RC = games.collected(games.run_batch("uniform", ref_specs, processes=processes, collect=True))
    ords = [np.asarray(d.family.evaluate_batch(RS, RC, cal.canonical_params(d, gt), gt), np.int64) for d in draws]
    rows, prev = [], None
    for it in range(0, iters + 1):
        name = f"emp:{lam}:{it}" if it else "uniform"
        if it:
            pool_for(gt, lam, it, processes)
        tabs = [survival(d, gt, lam, it) for d in draws]
        s = np.stack([np.asarray(t.surprisal(o), float) for t, o in zip(tabs, ords)])   # families x grids
        tr = games.run_batch(name, make_specs([gs], EMP_GAMES, EMP_SEED), processes=processes, collect=True)
        dyn = np.mean([r["dynamism2"] for r in tr])
        ten = np.mean([r["snap_tension"] for r in tr])
        clm = np.mean([r["climbs_held_accel_per_100s"] for r in tr])
        move = float(np.abs(s - prev).mean()) if prev is not None else float("nan")
        movemax = float(np.abs(s - prev).mean(1).max()) if prev is not None else float("nan")
        rows.append([it, f"{s.mean():.2f}", f"{np.quantile(s, 0.99):.1f}", f"{move:.3f}", f"{movemax:.2f}",
                     f"{dyn:.3f}", f"{ten:.3f}", f"{clm:.3f}"])
        prev = s
    return (f"Empirical prior fixed-point iteration on {gt.key}, lam = {lam}, {EMP_GAMES} training games per "
            f"iteration, reference = {len(RS)} held-out snapshot grids × {len(draws)} families\n\n" +
            md(["iteration", "mean s on ref grids", "p99 s", "mean |Δs| vs previous", "max family mean |Δs|",
                "training dyn2", "snap_tension", "held accel climbs/100s"], rows))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.empirical")
    ap.add_argument("--type", default="4,base12,rgb")
    ap.add_argument("--lam", type=float, default=0.5)
    ap.add_argument("--iters", type=int, default=4)
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    n, s, c = a.type.split(",")
    print(fixed_point(GridType(int(n), s, c), a.lam, a.iters, a.processes))


if __name__ == "__main__":
    main()
