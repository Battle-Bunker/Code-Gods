"""Pair alignment between two gods' utility functions, ex ante (no game needed).

`probe_set(gt)`: a fixed set of *structured* grids, built by applying 1-8 random library programs to
spawns (the kind of objects a game produces). For draws i, j:

  rho      Spearman correlation of s_i and s_j over the probe set (> 0 aligned, < 0 opposed)
  co_lift  P(s_j >= 4 | s_i >= 8) / P(s_j >= 4), symmetrised: does structure one god likes carry
           information for the other?
  syn      mean calibrated synergy s_i + s_j - s_ij (gridlab.calibrate.synergy, pointwise mutual
           information of the two upper contour sets) at up to `n_syn` probe grids where both have
           s >= 3. Expensive (one AMS run per grid); used to validate rho/co_lift on a sample.
"""
from __future__ import annotations

import hashlib
import zlib
from functools import lru_cache

import numpy as np

from ...core import Grid, GridType, spawn_batch
from ... import calibrate as cal

N_PROBE = 1536


@lru_cache(maxsize=None)
def probe_set(gt: GridType) -> tuple[np.ndarray, np.ndarray]:
    from ...policy import program_library
    from ...sim import default_program_factory
    progs, _ = program_library(gt, default_program_factory(), 4096)
    rng = np.random.default_rng(zlib.crc32(f"probe|{gt.key}".encode()))
    sym, col = spawn_batch(gt, rng, N_PROBE)
    S, C = sym.copy(), col.copy()
    for b in range(N_PROBE):
        g = Grid(S[b], C[b])
        for _ in range(int(rng.integers(1, 9))):
            y = progs[int(rng.integers(len(progs)))].apply(g, gt)
            if y is not None:
                g = y
        S[b], C[b] = g.sym, g.col
    return S, C


def surprisals(draw, gt: GridType) -> np.ndarray:
    S, C = probe_set(gt)
    t = cal.survival(draw, gt)
    return np.asarray(t.surprisal(draw.family.evaluate_batch(S, C, draw.params, gt)), float)


def _rank(x):
    o = np.argsort(x, kind="stable")
    r = np.empty(len(x))
    r[o] = np.arange(len(x))
    # average ties
    _, inv, cnt = np.unique(x, return_inverse=True, return_counts=True)
    sums = np.bincount(inv, weights=r)
    return (sums / cnt)[inv]


def pair_stats(si: np.ndarray, sj: np.ndarray) -> dict:
    if si.std() == 0 or sj.std() == 0:
        rho = 0.0
    else:
        rho = float(np.corrcoef(_rank(si), _rank(sj))[0, 1])

    def lift(a, b):
        hi = a >= 8
        base = (b >= 4).mean()
        if hi.sum() < 10 or base == 0:
            return float("nan")
        return float((b[hi] >= 4).mean() / base)

    l1, l2 = lift(si, sj), lift(sj, si)
    co = float(np.nanmean([l1, l2])) if not (np.isnan(l1) and np.isnan(l2)) else float("nan")
    return {"rho": rho, "co_lift": co}


def pair_synergy(di, dj, gt: GridType, n_syn: int = 4) -> float:
    S, C = probe_set(gt)
    si, sj = surprisals(di, gt), surprisals(dj, gt)
    both = np.flatnonzero((si >= 3) & (sj >= 3))
    if both.size == 0:
        return float("nan")
    r = np.random.default_rng(int(hashlib.sha256(f"{cal.seed_key(di, gt)}|{cal.seed_key(dj, gt)}".encode()).hexdigest()[:8], 16))
    pick = r.choice(both, min(n_syn, both.size), replace=False)
    return float(np.mean([cal.synergy(di, dj, gt, Grid(S[b], C[b])) for b in pick]))
