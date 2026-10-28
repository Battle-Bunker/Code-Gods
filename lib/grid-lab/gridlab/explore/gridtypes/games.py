"""Full simulated games over a sample of GridTypes, with legibility metrics on top of the shared
experiment metrics (gridlab.experiments.common.ext_metrics).

    python3 -m gridlab.explore.gridtypes.games                       # SAMPLE x 64 games, seed 1 (training)
    python3 -m gridlab.explore.gridtypes.games --seed 9000000 --games 32   # held-out seeds
    python3 -m gridlab.explore.gridtypes.games --types "3,base10,rgb;5,cards,rainbow6" --games 16
    python3 -m gridlab.explore.gridtypes.games --mix greedy          # all greedy_private gods

Setting: the engine defaults as delivered (gridlab.experiments.common.BASE: 100 Hz, energy 100 + 1/s,
exponential length with half-life 300 s, dealer "distinct"), 3-6 gods, per-god policies iid from the
mix. Results are cached one JSON per game under .cache/explore/gridtypes/games/.

Legibility metrics (per game; "god-commit" = one god's surprisal on one committed transformation):
  cells_mean / cells_frac   cells changed per commit (either layer) / as a share of the N² cells
  small_share               share of commits that change <= 2 cells
  move_rate                 share of god-commits where the god's surprisal changes at all (> 0.01 bit)
  vis_rate                  share of god-commits with |Δs| >= 1 bit (a change a player would notice)
  flicker_rate              share of god-commits with 0.01 < |Δs| < 1 bit (number moves, nothing visible)
  legible_rate              share of god-commits with |Δs| >= 1 bit made by a commit changing <= 3 cells
                            (a change the player can see on the grid AND attribute to a few cells)
  legible_share             legible_rate / vis_rate
  bits_per_cell             median of |Δs| / cells over god-commits with |Δs| >= 1
  vis_per_obj_min           visible (>= 1 bit) changes of a god's surprisal per object per minute: how often
                            a player watching one grid sees their own number jump
  vis_per_obj_min_own       the same, counting only changes made by the god's own agents
"""
from __future__ import annotations

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import time
from pathlib import Path

import numpy as np

from ...experiments import common as C
from ... import sim

OUT = C.ROOT / ".cache" / "explore" / "gridtypes"
TAG = "gridtypes-v1"


def sample_types() -> list[str]:
    """20 GridTypes from a balanced design (size i, symbol set j, colour set (i + j) mod 3: every size
    4x with all 3 colour sets, every symbol set 5x with all 3 colour sets), plus 5 progression /
    reference points."""
    sizes, syms, cols = (3, 4, 5, 6, 7), ("base10", "base12", "base16", "cards"), ("rgb", "rgby", "rainbow6")
    out = [f"{n},{s},{cols[(i + j) % 3]}" for i, n in enumerate(sizes) for j, s in enumerate(syms)]
    for extra in ("4,base10,rgb", "5,base10,rgb", "5,base10,rgby", "7,base16,rainbow6", "3,cards,rainbow6"):
        if extra not in out:
            out.append(extra)
    return out


SAMPLE = sample_types()


class _RecList(list):
    """world.objects with a recorder: the simulator commits by `objects[oi] = new` only."""
    __slots__ = ("rec",)

    def __setitem__(self, i, new):
        old = list.__getitem__(self, i)
        ds = old.sym != new.sym
        dc = old.col != new.col
        self.rec.append((int((ds | dc).sum()), int(ds.sum()), int(dc.sum())))
        list.__setitem__(self, i, new)


_REC: list = []
_orig_init = sim.World.__init__


def _patched_init(self, *a, **kw):
    _orig_init(self, *a, **kw)
    lst = _RecList()
    lst.rec = _REC
    self.objects = lst


def legibility(log, rec: list) -> dict:
    K, G, N2 = len(log.c_time), log.n_gods, log.gtype.N ** 2
    assert len(rec) == K, (len(rec), K)
    out = {}
    if not K:
        return {k: 0.0 for k in ("cells_mean", "cells_frac", "small_share", "sym_cells_mean", "col_cells_mean",
                                 "move_rate", "vis_rate", "flicker_rate", "legible_rate", "legible_share",
                                 "bits_per_cell", "vis_per_obj_min", "vis_per_obj_min_own")}
    cells = np.array([r[0] for r in rec], float)
    out["cells_mean"] = float(cells.mean())
    out["cells_med"] = float(np.median(cells))
    out["cells_frac"] = float((cells / N2).mean())
    out["small_share"] = float((cells <= 2).mean())
    out["sym_cells_mean"] = float(np.mean([r[1] for r in rec]))
    out["col_cells_mean"] = float(np.mean([r[2] for r in rec]))
    d = np.abs(log.c_after.astype(float) - log.c_before.astype(float))
    mv, vis = d > 0.01, d >= 1.0
    small = (cells <= 3)[:, None]
    out["move_rate"] = float(mv.mean())
    out["vis_rate"] = float(vis.mean())
    out["flicker_rate"] = float((mv & ~vis).mean())
    out["legible_rate"] = float((vis & small).mean())
    out["legible_share"] = float((vis & small).sum() / max(vis.sum(), 1))
    bpc = (d / np.maximum(cells, 1)[:, None])[vis]
    out["bits_per_cell"] = float(np.median(bpc)) if bpc.size else 0.0
    T = max(float(log.duration), 1e-9)
    Mmean = float(np.mean([len(o) for o in log.snap_objs])) if log.snap_objs else 1.0
    out["vis_per_obj_min"] = float(vis.sum() / G / max(Mmean, 1) / (T / 60))
    owner = log.a_owner[log.c_agent].astype(int)
    own_vis = vis[np.arange(K), owner]
    out["vis_per_obj_min_own"] = float(own_vis.sum() / G / max(Mmean, 1) / (T / 60))
    # how visible are the big moves of a god's own number: |Δs| >= 4 bits share with <= 3 cells
    big = d >= 4
    out["big_legible_share"] = float((big & small).sum() / max(big.sum(), 1))
    return out


_JOBS: list = []


def _key(st, spec) -> str:
    return hashlib.sha256((TAG + C.game_key(st, spec)).encode()).hexdigest()[:40]


def _path(key: str) -> Path:
    return OUT / "games" / key[:2] / f"{key}.json"


def _worker(i: int):
    global _REC
    st, spec, key = _JOBS[i]
    cfg = C.config_for(st, spec)
    t0 = time.perf_counter()
    draws = sim.draws_for(cfg)
    tables = C.tables_for(st, cfg, draws)
    _REC.clear()
    sim.World.__init__ = _patched_init
    try:
        log = sim.run_game(cfg, tables=tables)
    finally:
        sim.World.__init__ = _orig_init
    r = C.ext_metrics(log, tables)
    r.update(legibility(log, list(_REC)))
    _REC.clear()
    r["wall_seconds"] = time.perf_counter() - t0
    r["seed"] = spec.seed
    r["spec_policies"] = list(spec.policies)
    r["key"] = key
    r["dynamism2"] = C.dynamism2(r)
    p = _path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=C._jsonable)
    os.replace(tmp, p)
    return i, r


def run(types, games: int, seed: int, mix: str = "mixed", processes: int = 4, st=None, verbose=True) -> list[dict]:
    global _JOBS
    st = st or C.BASE
    specs = C.make_specs(types, games, seed, mix)
    keys = [_key(st, s) for s in specs]
    out = [None] * len(specs)
    todo = []
    for i, k in enumerate(keys):
        p = _path(k)
        if p.exists():
            try:
                with open(p) as fh:
                    out[i] = json.load(fh)
                continue
            except Exception:
                pass
        todo.append(i)
    if todo:
        C.apply_knobs(st.get("knobs", {}))
        cfgs = [C.config_for(st, specs[i]) for i in todo]
        C.prepare(st, cfgs, processes, verbose)
        # biggest grids first so the pool's tail is short
        todo.sort(key=lambda i: -C.parse_type(specs[i].gtype).N)
        _JOBS = [(st, specs[i], keys[i]) for i in todo]
        t0 = time.perf_counter()
        with mp.get_context("fork").Pool(processes) as pool:
            for n, (j, r) in enumerate(pool.imap_unordered(_worker, range(len(todo)), chunksize=1), 1):
                out[todo[j]] = r
                if verbose and (n % 50 == 0 or n == len(todo)):
                    print(f"  [games] {n}/{len(todo)} ({time.perf_counter() - t0:.0f}s)", flush=True)
        _JOBS = []
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.gridtypes.games")
    ap.add_argument("--types", default=";".join(SAMPLE))
    ap.add_argument("--games", type=int, default=64)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    rs = run(a.types.split(";"), a.games, a.seed, a.mix, a.processes)
    by = {}
    for r in rs:
        by.setdefault(r["gtype"], []).append(r)
    for k, v in by.items():
        print(f"{k:26s} n={len(v):3d} dyn2 {np.mean([x['dynamism2'] for x in v]):.3f} "
              f"cells {np.mean([x['cells_mean'] for x in v]):5.2f} vis {np.mean([x['vis_rate'] for x in v]):.3f} "
              f"legible {np.mean([x['legible_rate'] for x in v]):.3f} stag {np.mean([x['stagnation_frac'] for x in v]):.2f}")


if __name__ == "__main__":
    main()
