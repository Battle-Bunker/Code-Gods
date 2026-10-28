"""Tournament machinery for policy mixes: cached, parallel games with common random numbers.

A `Match` is (GridType, seed, policies). Two matches with the same GridType and seed deal the same
utility functions to the same seats and see the same spawns and game length, so comparing policy
assignments on shared seeds controls for deal luck (paired comparisons).

Each game result is `experiments.common.ext_metrics(log, tables)` plus `dynamism2`, per-god extras
(`share` = Π_i / mean_j Π_j, `z` = (G − rank)/(G − 1)) and SmartPolicy diagnostics, cached as one JSON
per game under .cache/explore_players/ keyed by (setting, match, code hash of gridlab/*.py, rules and
this package's policies.py and features.py).
"""
from __future__ import annotations

import hashlib
import json
import multiprocessing as mp
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from . import policies as P  # registers presets
from ... import calibrate as cal
from ...sim import GameConfig, draws_for, run_game
from ...experiments.common import (BASE, apply_knobs, dynamism2, ext_metrics, merge, parse_type, _jsonable)
from .prep import prepare as prep_tables

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "explore_players"
RESULT_VERSION = 2

# The engine defaults at the real engine's 100 Hz (experiments.common.BASE = setting "old").
DEFAULT_SETTING = BASE


@dataclass(frozen=True)
class Match:
    gtype: str
    seed: int
    policies: tuple

    @property
    def n_gods(self) -> int:
        return len(self.policies)


def _code_hash() -> str:
    h = hashlib.sha256()
    g = ROOT / "gridlab"
    pl = g / "explore" / "players"
    files = sorted(list(g.glob("*.py")) + list((g / "rules").glob("*.py")) +
                   [pl / "policies.py", pl / "features.py"])
    for f in files:
        h.update(f.name.encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


CODE_HASH = _code_hash()


def config_for(st: dict, m: Match) -> GameConfig:
    kw = dict(st.get("config", {}))
    pk = dict(kw.pop("policy_kwargs", {}) or {})
    return GameConfig(gtype=parse_type(m.gtype), n_gods=m.n_gods, policies=list(m.policies), seed=m.seed,
                      policy_kwargs=pk, **kw)


def key_of(st: dict, m: Match) -> str:
    blob = json.dumps({"s": st, "m": asdict(m), "code": CODE_HASH, "v": RESULT_VERSION}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:40]


def _path(k: str) -> Path:
    return CACHE / "games" / k[:2] / f"{k}.json"


def liar_draws(cfg: GameConfig):
    """False goals any 'lie' announcer in this game would post (so their tables can be prebuilt)."""
    out = []
    draws = draws_for(cfg)
    for i, name in enumerate(cfg.policy_list()):
        cls = P.POLICIES.get(name)
        pre = getattr(cls, "preset", {}) if cls else {}
        if pre.get("announce") == "lie" and pre.get("chat") == "goal":
            out.append(P.fake_draw(cfg.seed, i, cfg.gtype, draws[i].family.id, cfg.families))
    return out


def prepare(st: dict, cfgs: Sequence[GameConfig], processes: int = 4):
    by: dict = {}
    for c in cfgs:
        by.setdefault(c.gtype, []).append(c)
    for gt, cs in by.items():
        ds = [d for c in cs for d in draws_for(c)] + [d for c in cs for d in liar_draws(c)]
        cal.precompute(ds, gt, processes=processes)
        from ...policy import program_library
        from ...sim import default_program_factory
        program_library(gt, default_program_factory(), 4096)


_JOBS: list = []


def play(st: dict, m: Match) -> dict:
    cfg = config_for(st, m)
    t0 = time.perf_counter()
    draws = draws_for(cfg)
    tables = [cal.survival(d, cfg.gtype) for d in draws]
    pstats: dict = {}

    def hook(world, ev):
        if ev == "end":
            for g, pol in getattr(world, "_players", {}).items():
                pstats[g] = pol.summary()

    log = run_game(cfg, hook=hook, tables=tables)
    r = ext_metrics(log, tables)
    r["dynamism2"] = dynamism2(r)
    pay = np.array([g["payoff"] for g in r["gods"]], float)
    mean = pay.mean()
    G = len(pay)
    for i, g in enumerate(r["gods"]):
        g["share"] = float(pay[i] / mean) if mean > 0 else 1.0
        g["z"] = (G - g["rank"]) / (G - 1)
        g["pstats"] = pstats.get(i, {})
    r["welfare"] = float(pay.sum())
    r["wall_seconds"] = time.perf_counter() - t0
    r["match"] = asdict(m)
    return r


def _worker(i: int):
    st, m, k = _JOBS[i]
    r = play(st, m)
    p = _path(k)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=_jsonable)
    os.replace(tmp, p)
    return i, r


def run_matches(matches: Sequence[Match], st: dict | None = None, processes: int = 4, label: str = "",
                verbose: bool = True) -> list[dict]:
    global _JOBS
    st = DEFAULT_SETTING if st is None else st
    keys = [key_of(st, m) for m in matches]
    out: list = [None] * len(matches)
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
        apply_knobs(st.get("knobs", {}))
        try:
            prepare(st, [config_for(st, matches[i]) for i in todo], processes)
            _JOBS = [(st, matches[i], keys[i]) for i in todo]
            t0 = time.perf_counter()
            done = 0
            if processes > 1 and len(todo) > 1:
                with mp.get_context("fork").Pool(processes, maxtasksperchild=50) as pool:
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
            apply_knobs({})
    return out


def setting(**over) -> dict:
    return merge(DEFAULT_SETTING, over)


# ------------------------------------------------------------------------------------------------
# statistics helpers
# ------------------------------------------------------------------------------------------------
def mean_ci(x, B: int = 1000, seed: int = 0) -> tuple[float, float, float]:
    """(mean, lo, hi) with a percentile bootstrap 95% interval."""
    x = np.asarray(x, float)
    if x.size == 0:
        return (float("nan"),) * 3
    r = np.random.default_rng(seed)
    bs = x[r.integers(0, len(x), (B, len(x)))].mean(1)
    return float(x.mean()), float(np.quantile(bs, 0.025)), float(np.quantile(bs, 0.975))


def fmt_ci(t, d: int = 2) -> str:
    m, lo, hi = t
    return f"{m:.{d}f} [{lo:.{d}f}, {hi:.{d}f}]"


def md_table(header, rows) -> str:
    out = ["| " + " | ".join(map(str, header)) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)
