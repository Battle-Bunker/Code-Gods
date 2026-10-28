"""Cached parallel batches of economy games on paired specs.

A setting is experiments.common's setting dict plus an "econ" dict of Econ fields:
    {"config": {GameConfig overrides}, "knobs": {COST_KNOBS overrides}, "prior": "uniform", "econ": {...}}
`esetting(config=..., econ=...)` builds one from the engine defaults at 100 Hz (common.BASE).

Spec mixes: "four" = 4 gods, one each of random / greedy_private / saver / cooperative, seat order
shuffled per game (every game is a head-to-head of the four policies); "iid" = 3-6 gods with iid
policies from the same four; any experiments.common.POLICY_MIXES name also works (iid, 3-6 gods).

Results are cached one JSON per game under .cache/explore-economy/games/, keyed by sha256(setting,
spec, a pinned code version; see ECODE).
"""
from __future__ import annotations

import hashlib
import json
import multiprocessing as mp
import os
import time
from pathlib import Path
from typing import Sequence

import numpy as np

from ...experiments import common as C
from .econ_metrics import econ_metrics
from .econ_sim import Econ, run_econ_game

CACHE = C.ROOT / ".cache" / "explore-economy"
FOUR = ("random", "greedy_private", "saver", "cooperative")
TRAIN_SEED = 500_000
HELD_OUT = 9_500_000
EVERSION = 1


def _code_hash() -> str:
    h = hashlib.sha256(C.CODE_HASH.encode())
    for f in sorted(Path(__file__).parent.glob("*.py")):
        if f.name in ("study.py", "report.py", "selftest.py"):
            continue
        h.update(f.name.encode())
        h.update(f.read_bytes())
    h.update((C.ROOT / "gridlab" / "experiments" / "common.py").read_bytes())
    return h.hexdigest()[:16]


# Pinned: new Econ knobs default to off and selftest checks Econ() == gridlab.sim.run_game, so adding knobs
# does not change cached results. Bump EVERSION (or re-pin to _code_hash()) when existing semantics change.
ECODE = "a58c90ddfbfa324d"


def esetting(config: dict | None = None, econ: dict | None = None, knobs: dict | None = None) -> dict:
    st = C.merge(C.BASE, {"config": config or {}, "knobs": knobs or {}})
    st["econ"] = {k: v for k, v in (econ or {}).items()}
    return st


def make_specs(gtypes: Sequence[str], n_per_type: int, seed0: int, mix: str = "four") -> list:
    if mix != "four":
        if mix == "iid":
            C.POLICY_MIXES.setdefault("econ_iid", FOUR)
            mix = "econ_iid"
        return C.make_specs(gtypes, n_per_type, seed0, mix)
    out = []
    for t, gt in enumerate(gtypes):
        for k in range(n_per_type):
            seed = seed0 + 100_000 * t + k
            r = np.random.default_rng([seed, 11])
            out.append(C.GameSpec(gt, seed, tuple(FOUR[i] for i in r.permutation(4))))
    return out


def game_key(st: dict, spec) -> str:
    blob = json.dumps({"s": st, "spec": [spec.gtype, spec.seed, list(spec.policies)], "code": ECODE,
                       "v": EVERSION}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:40]


def _path(key: str) -> Path:
    return CACHE / "games" / key[:2] / f"{key}.json"


_JOBS: list = []


def run_one(st: dict, spec) -> tuple[dict, object]:
    cfg = C.config_for(st, spec)
    draws = C.draws_for(cfg)
    tables = C.tables_for(st, cfg, draws)
    log = run_econ_game(cfg, Econ(**st.get("econ", {})), tables=tables)
    r = C.ext_metrics(log, tables)
    r.update(econ_metrics(log))
    for g, e in zip(r["gods"], r.pop("gods_econ")):
        g.update(e)
    r["dynamism2"] = C.dynamism2(r)
    return r, log


def _worker(i: int):
    st, spec, key = _JOBS[i]
    t0 = time.perf_counter()
    r, _ = run_one(st, spec)
    r["wall_seconds"] = time.perf_counter() - t0
    r["seed"] = spec.seed
    r["spec_policies"] = list(spec.policies)
    r["key"] = key
    for k in ("traj_mean_s", "top_spirals", "mut_family", "summons_family"):
        r.pop(k, None)
    p = _path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=C._jsonable)
    os.replace(tmp, p)
    return i, r


def run_batch(st: dict, specs: Sequence, processes: int = 4, label: str = "", verbose: bool = True) -> list[dict]:
    global _JOBS
    keys = [game_key(st, s) for s in specs]
    out: list = [None] * len(specs)
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
        try:
            cfgs = [C.config_for(st, specs[i]) for i in todo]
            C.prepare(st, cfgs, processes, verbose)
            _JOBS = [(st, specs[i], keys[i]) for i in todo]
            t0 = time.perf_counter()
            done = 0
            if processes > 1 and len(todo) > 1:
                with mp.get_context("fork").Pool(processes) as pool:
                    for j, r in pool.imap_unordered(_worker, range(len(todo)), chunksize=1):
                        out[todo[j]] = r
                        done += 1
                        if verbose and (done % 100 == 0 or done == len(todo)):
                            print(f"  [{label}] {done}/{len(todo)} games ({time.perf_counter() - t0:.0f}s)", flush=True)
            else:
                for j in range(len(todo)):
                    out[todo[j]] = _worker(j)[1]
            _JOBS = []
        finally:
            C.apply_knobs({})
    return out
