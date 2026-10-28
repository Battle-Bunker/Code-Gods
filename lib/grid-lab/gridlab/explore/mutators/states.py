"""Draws and starting-state pools for the mutator x family landscape probe.

Every pool is deterministic (seeded from sha256 of its name) and cached under
.cache/explore_mutators/ (gitignored).

  draws_for_type(gt, k)    k fixed draws per available family (same draws in every run)
  fresh(gt, n, tag)        uniform spawns (the prior)
  midgame(gt)              objects observed in simulated games (greedy / mixed policies, engine defaults
                           at 100 Hz), sampled at 5 s snapshots after t = 30 s; deduplicated
  near(draw, gt, n)        the draw's exemplar under 1-4 random single-cell resamples (completion states)
  rival(draw, gt, n)       near-exemplars of OTHER draws of the same family (theft: a Conqueror(B) jackpot
                           seen by a Conqueror(A) god); empty if the family has one orbit
  foreign(gt, n)           near-exemplars of random draws of every family (structure built by others)
"""
from __future__ import annotations

import hashlib
import pickle
from pathlib import Path

import numpy as np

from ...core import Grid, GridType, spawn_batch
from ...family import Draw

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "explore_mutators"


def seed_of(*parts) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:16], 16)


def rng_of(*parts) -> np.random.Generator:
    return np.random.default_rng(seed_of(*parts))


def families_for(gt: GridType) -> list:
    from ...rules import FAMILIES
    return [f for f in FAMILIES if f.available(gt) and f.exemplar is not None] + \
           [f for f in FAMILIES if f.available(gt) and f.exemplar is None]


def draws_for_type(gt: GridType, k: int = 3) -> list[Draw]:
    """k draws per family; draws that are canonically identical are kept (they still differ for theft)."""
    out = []
    for f in families_for(gt):
        r = rng_of("draw", gt.key, f.id)
        for _ in range(k):
            out.append(Draw(f, f.sample(r, gt)))
    return out


def fresh(gt: GridType, n: int, tag: str = "fresh") -> tuple[np.ndarray, np.ndarray]:
    return spawn_batch(gt, rng_of(tag, gt.key), n)


def _perturb(g: Grid, gt: GridType, r: np.random.Generator, k: int) -> Grid:
    sym, col = g.sym.copy(), g.col.copy()
    N = gt.N
    for _ in range(k):
        i, j = int(r.integers(N)), int(r.integers(N))
        if r.random() < 0.5:
            col[i, j] = r.integers(gt.C)
        else:
            sym[i, j] = r.integers(gt.S)
    return Grid(sym, col)


_EX: dict = {}


def exemplar(draw: Draw, gt: GridType) -> Grid | None:
    if draw.family.exemplar is None:
        return None
    k = (draw.family.id, repr(sorted(draw.params.items(), key=str)), gt.key)
    if k not in _EX:
        try:
            _EX[k] = draw.family.exemplar(draw.params, gt)
        except Exception:
            _EX[k] = None
    return _EX[k]


def _stack(grids: list[Grid]) -> tuple[np.ndarray, np.ndarray]:
    if not grids:
        return np.zeros((0,), np.uint8), np.zeros((0,), np.uint8)
    return np.stack([g.sym for g in grids]), np.stack([g.col for g in grids])


def near(draw: Draw, gt: GridType, n: int, kmax: int = 4) -> tuple[np.ndarray, np.ndarray]:
    ex = exemplar(draw, gt)
    if ex is None:
        return _stack([])
    r = rng_of("near", gt.key, draw.family.id, repr(sorted(draw.params.items(), key=str)))
    return _stack([_perturb(ex, gt, r, int(r.integers(1, kmax + 1))) for _ in range(n)])


def rival(draw: Draw, gt: GridType, n: int, kmax: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """Near-exemplars of other draws of the same family whose exemplar differs from this draw's."""
    f = draw.family
    r = rng_of("rival", gt.key, f.id, repr(sorted(draw.params.items(), key=str)))
    mine = exemplar(draw, gt)
    if mine is None:
        return _stack([])
    exs = []
    for _ in range(4 * n):
        p = f.sample(r, gt)
        e = exemplar(Draw(f, p), gt)
        if e is not None and e != mine and draw.ordinal(e, gt) < draw.ordinal(mine, gt):
            exs.append(e)
        if len(exs) >= 8:
            break
    if not exs:
        return _stack([])
    return _stack([_perturb(exs[i % len(exs)], gt, r, int(r.integers(0, kmax + 1))) for i in range(n)])


def foreign(gt: GridType, n: int, kmax: int = 2) -> tuple[np.ndarray, np.ndarray]:
    r = rng_of("foreign", gt.key)
    fams = [f for f in families_for(gt) if f.exemplar is not None]
    out = []
    while len(out) < n:
        f = fams[int(r.integers(len(fams)))]
        e = exemplar(Draw(f, f.sample(r, gt)), gt)
        if e is not None:
            out.append(_perturb(e, gt, r, int(r.integers(0, kmax + 1))))
    return _stack(out)


# ------------------------------------------------------------------------------------------------
# mid-game states from simulated games
# ------------------------------------------------------------------------------------------------
def _mid_game(args):
    gt, seed, per_game = args
    from ...experiments.common import BASE, GameSpec, config_for
    from ...sim import run_game
    r = np.random.default_rng([seed, 11])
    G = int(r.integers(3, 7))
    pols = ("random", "greedy_private", "saver", "greedy_omniscient", "cooperative")
    spec = GameSpec(gt.key.replace("Grid(", "").replace(")", ""), seed,
                    tuple(str(pols[int(r.integers(len(pols)))]) for _ in range(G)))
    cfg = config_for(BASE, spec)
    cfg.length = "fixed"
    cfg.fixed_seconds = float(r.uniform(60, 400))
    seen: list[Grid] = []

    def hook(world, ev):
        if world.t >= 30.0:
            seen.extend(world.objects)
    run_game(cfg, hook=hook)
    uniq = list({g.key: g for g in seen}.values())
    rr = np.random.default_rng([seed, 12])
    pick = rr.permutation(len(uniq))[:per_game]
    return [uniq[i] for i in pick]


def midgame(gt: GridType, games: int = 16, per_game: int = 64, processes: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """Objects sampled from `games` simulated games (mixed policies, engine defaults); cached."""
    path = CACHE / f"midgame-{gt.key}-{games}-{per_game}.pkl"
    if path.exists():
        with open(path, "rb") as fh:
            return pickle.load(fh)
    import multiprocessing as mp
    from ...experiments.common import BASE, GameSpec, config_for, prepare
    from ... import calibrate as cal  # noqa: F401
    seeds = [seed_of("midgame", gt.key, i) % (2 ** 31) for i in range(games)]
    # tables for the dealt draws first (fork pool inside prepare)
    cfgs = []
    for s in seeds:
        r = np.random.default_rng([s, 11])
        G = int(r.integers(3, 7))
        spec = GameSpec(gt.key.replace("Grid(", "").replace(")", ""), s, ("greedy_private",) * G)
        cfgs.append(config_for(BASE, spec))
    prepare(BASE, cfgs, processes, verbose=True)
    with mp.get_context("fork").Pool(processes) as pool:
        res = pool.map(_mid_game, [(gt, s, per_game) for s in seeds])
    grids = list({g.key: g for gs in res for g in gs}.values())
    out = _stack(grids)
    CACHE.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        pickle.dump(out, fh)
    return out
