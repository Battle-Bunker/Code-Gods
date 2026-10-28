"""Alternative calibration priors: "rare" versus "hard to make".

The engine calibrates every utility against the uniform spawn prior μ: s_i(x) = -log2 μ{u_i >= u_i(x)}.
That measures how *rare* a grid is among spawns. It does not measure how *hard* it is to produce with
the mutators gods actually have. A constant-symbol grid is 2^-80 rare for Snap!, but one `write` makes
it. This module builds the alternative **code-reachable prior** ρ: spawn a grid, then apply k random
*cheap* programs to it (k uniform in 0..k_max, each drawn from the GridType's program library among
those costing at most `max_cost` bits). States one or two cheap edits away from a spawn are therefore
common under ρ and score few bits.

`reachable_survival(draw, gtype)` returns a calibrate.Survival built as follows:

  * body: plain Monte Carlo of the ordinal on a cached pool of `n_pool` ρ-samples (shared by every
    family in the GridType), with a level for each distinct ordinal that has >= `min_count` samples at
    or above it;
  * tail: above the deepest body level ℓ0, ρ's tail is not observable by Monte Carlo and ρ has no MCMC
    kernel, so the uniform table's *shape* is spliced on: log2 ρ{u >= t} ≈ log2 ρ{u >= ℓ0} +
    (log2 μ{u >= t} - log2 μ{u >= ℓ0}). In words: rarity beyond what cheap code reaches by chance
    is priced as under the uniform prior.

The resulting surprisal is still a valid p-value *under ρ* in the body (P_ρ(s >= k) <= 2^-k), and it
is monotone in the ordinal everywhere. Caches: pools and tables under .cache/priors/.

    python3 -m gridlab.priors --type 5,base10,rgby        # pool stats + a few families' bits at the top
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pickle
from pathlib import Path

import numpy as np

from .core import Grid, GridType, spawn_batch
from .family import Draw
from . import calibrate as cal

PRIOR_VERSION = 1
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "priors"
_POOLS: dict = {}
_TABLES: dict = {}

DEFAULTS = {"n_pool": 1 << 17, "k_max": 4, "max_cost": 30.0, "min_count": 32}


def _save(path: Path, obj) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "wb") as fh:
        pickle.dump(obj, fh, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, path)


def reachable_pool(gtype: GridType, n_pool: int = DEFAULTS["n_pool"], k_max: int = DEFAULTS["k_max"],
                   max_cost: float = DEFAULTS["max_cost"]) -> tuple[np.ndarray, np.ndarray]:
    """(sym, col) arrays of n_pool samples from the code-reachable prior ρ (deterministic, cached)."""
    from .policy import program_library
    from .program import random_program
    progs, costs = program_library(gtype, random_program, 4096)
    tag = hashlib.sha256(f"{gtype.key}|{n_pool}|{k_max}|{max_cost}|{PRIOR_VERSION}|{len(progs)}|"
                         f"{float(np.sum(costs)):.6f}".encode()).hexdigest()
    if tag in _POOLS:
        return _POOLS[tag]
    path = CACHE_DIR / f"pool-{tag[:32]}.pkl"
    if path.exists():
        with open(path, "rb") as fh:
            _POOLS[tag] = pickle.load(fh)
        return _POOLS[tag]
    rng = np.random.default_rng(int(tag[:16], 16))
    cheap = np.flatnonzero(costs <= max_cost)
    sym, col = spawn_batch(gtype, rng, n_pool)
    ks = rng.integers(0, k_max + 1, n_pool)
    for b in range(n_pool):
        g = Grid(sym[b], col[b])
        for _ in range(int(ks[b])):
            y = progs[int(cheap[rng.integers(len(cheap))])].apply(g, gtype)
            if y is not None:
                g = y
        sym[b], col[b] = g.sym, g.col
    _POOLS[tag] = (sym, col)
    _save(path, _POOLS[tag])
    return _POOLS[tag]


def reachable_survival(draw: Draw, gtype: GridType, **kw) -> cal.Survival:
    """Survival table of `draw` under the code-reachable prior ρ (see module docstring)."""
    o = {**DEFAULTS, **kw}
    ukey = cal.cache_key(draw, gtype)
    key = hashlib.sha256(f"{ukey}|{sorted(o.items())}|{PRIOR_VERSION}".encode()).hexdigest()
    if key in _TABLES:
        return _TABLES[key]
    path = CACHE_DIR / f"tab-{key[:40]}.pkl"
    uni = cal.survival(draw, gtype)
    if path.exists():
        with open(path, "rb") as fh:
            d = pickle.load(fh)
    else:
        sym, col = reachable_pool(gtype, o["n_pool"], o["k_max"], o["max_cost"])
        params = cal.canonical_params(draw, gtype)
        V = draw.family.evaluate_keys(sym, col, params, gtype)  # ordinal keys (ints or tuple keys)
        n = len(V)
        w, counts = np.unique(V, return_counts=True)
        tail = np.cumsum(counts[::-1])[::-1]
        body = tail >= o["min_count"]
        lv = list(w[body])
        lp = list(np.log2(tail[body] / n))
        se = list(np.sqrt((1 - tail[body] / n) / (tail[body])) / cal.LN2)
        l0, p0 = lv[-1], lp[-1]
        u0 = float(uni.log2_tail(l0))
        for t in uni.levels:
            if t > l0:
                lv.append(t)
                lp.append(min(p0, p0 + float(uni.log2_tail(t)) - u0))
                se.append(float(uni.stderr(t)))
        lp = np.minimum.accumulate(np.asarray(lp, float))
        d = {"levels": np.asarray(lv, V.dtype), "log2p": lp, "se": np.asarray(se, float),
             "extra": list(uni.extra_levels) if hasattr(uni, "extra_levels") else [],
             "meta": {"prior": "reachable", **o, "family": draw.family.id, "body_top": l0.item(),
                      "body_bits": -float(p0)}}
        _save(path, d)
    t = cal.Survival(key, d["levels"], d["log2p"], d["se"], d["extra"], d["meta"])
    _TABLES[key] = t
    return t


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.priors", description="Code-reachable prior: pool and tables")
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--families", default="snap,conqueror,rainbow_road,full_house,seed2_patchwork,lone_peak")
    a = ap.parse_args(argv)
    n, s, c = a.type.split(",")
    gt = GridType(int(n), s, c)
    from .rules import by_id
    rng = np.random.default_rng(0)
    print(f"{gt.key}: reachable pool {DEFAULTS}")
    print(f"{'family':24s} {'uniform s(top)':>14s} {'reachable s(top)':>16s} {'body bits':>9s}")
    for fid in a.families.split(","):
        f = by_id(fid)
        if not f.available(gt):
            continue
        d = Draw(f, f.sample(rng, gt))
        u, r = cal.survival(d, gt), reachable_survival(d, gt)
        top = int(u.levels[-1])
        print(f"{fid:24s} {u.surprisal(top):14.1f} {r.surprisal(top):16.1f} {r.meta['body_bits']:9.1f}")


if __name__ == "__main__":
    main()
