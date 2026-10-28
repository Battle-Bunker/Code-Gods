"""Simulated games calibrated against any reference prior (policy-dependent findings).

    python3 -m gridlab.explore.priors.games --types "5,base10,rgby;4,base12,rgb" --games 80 \
        --priors uniform,reach2,levin,mix.5_reach2,emp:0.5:1

Same game specs (common random numbers: GridType, gods, policies, seeds) under every prior, on the
engine defaults (`experiments.common.BASE`, 100 Hz, mixed policies). Reports per prior: dynamism2 and
its parts (tension, spirals/climbs, standings), family fairness (policy-adjusted z, excess SD), and
paired differences against the uniform prior with 95% bootstrap CIs over games.

Results are cached per game under .cache/explore_priors/games/ keyed by (prior, setting, spec, code hash).
Prior names: anything in latent.SPECS, or `emp:<lam>:<iteration>` (empirical.py).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import Sequence

import numpy as np

from ...experiments import common as C
from ...sim import run_game, draws_for
from . import latent as la

GAMES = la.CACHE / "games"
_HERE = Path(__file__).resolve().parent
_OWN_HASH = hashlib.sha256(b"".join((_HERE / f).read_bytes() for f in ("latent.py", "empirical.py", "games.py"))
                           ).hexdigest()[:12]


# ------------------------------------------------------------------------------------------------
# table providers
# ------------------------------------------------------------------------------------------------
def provider(prior: str):
    """(tag, table(draw, gtype), precompute(draws, gtype, processes)) for a prior name."""
    if prior.startswith("emp"):
        from . import empirical
        return empirical.provider(prior)
    spec = la.get_spec(prior)
    return (spec.key, lambda d, gt: la.survival(d, gt, spec),
            lambda ds, gt, proc: la.precompute(ds, gt, spec, processes=proc, verbose=True))


# ------------------------------------------------------------------------------------------------
# batch runner
# ------------------------------------------------------------------------------------------------
_JOBS: list = []
SNAP_GRIDS_PER_GAME = 300


def _key(prior_tag: str, st: dict, spec: C.GameSpec, collect: bool) -> str:
    blob = json.dumps({"p": prior_tag, "s": st, "spec": [spec.gtype, spec.seed, list(spec.policies)],
                       "code": C.CODE_HASH, "own": _OWN_HASH, "mv": C.METRICS_VERSION, "c": collect},
                      sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:40]


def _worker(i):
    prior, st, spec, key, collect = _JOBS[i]
    tag, table, _ = provider(prior)
    cfg = C.config_for(st, spec)
    t0 = time.perf_counter()
    draws = draws_for(cfg)
    tables = [table(d, cfg.gtype) for d in draws]
    snaps = []

    def hook(world, event):
        if event == "snapshot" and world.objects:
            snaps.append((np.stack([g.sym for g in world.objects]), np.stack([g.col for g in world.objects])))

    log = run_game(cfg, tables=tables, hook=hook if collect else None)
    r = C.ext_metrics(log, tables)
    r["wall_seconds"] = time.perf_counter() - t0
    r["seed"] = spec.seed
    r["spec_policies"] = list(spec.policies)
    r["prior"] = prior
    r["ceil_v"] = 2
    p = GAMES / key[:2] / f"{key}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    if collect and snaps:
        S = np.concatenate([s for s, _ in snaps])
        Cc = np.concatenate([c for _, c in snaps])
        rng = np.random.default_rng(spec.seed)
        pick = rng.choice(len(S), min(SNAP_GRIDS_PER_GAME, len(S)), replace=False)
        np.savez_compressed(p.with_suffix(".npz"), sym=S[pick], col=Cc[pick])
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=C._jsonable)
    os.replace(tmp, p)
    return i, r


def run_batch(prior: str, specs: Sequence[C.GameSpec], st: dict = C.BASE, processes: int = 4,
              collect: bool = False, verbose: bool = True) -> list[dict]:
    """Per-game results for every spec with tables from `prior` (cached). With collect=True, also
    stores up to SNAP_GRIDS_PER_GAME snapshot grids per game (load them with `collected`)."""
    global _JOBS
    tag, table, pre = provider(prior)
    keys = [_key(tag, st, s, collect) for s in specs]
    out: list = [None] * len(specs)
    todo = []
    for i, k in enumerate(keys):
        p = GAMES / k[:2] / f"{k}.json"
        if p.exists():
            try:
                out[i] = json.loads(p.read_text())
                continue
            except Exception:
                pass
        todo.append(i)
    if todo:
        C.apply_knobs(st.get("knobs", {}))
        try:
            by_type = defaultdict(list)
            for i in todo:
                cfg = C.config_for(st, specs[i])
                by_type[cfg.gtype].extend(draws_for(cfg))
            from ...policy import program_library
            from ...sim import default_program_factory
            for gt, ds in by_type.items():
                C.cal.precompute(ds, gt, processes=processes)
                program_library(gt, default_program_factory(), 4096)
                pre(ds, gt, processes)
            _JOBS = [(prior, st, specs[i], keys[i], collect) for i in todo]
            t0 = time.perf_counter()
            with mp.get_context("fork").Pool(processes) as pool:
                for n_, (j, r) in enumerate(pool.imap_unordered(_worker, range(len(todo)), chunksize=1)):
                    out[todo[j]] = r
                    if verbose and ((n_ + 1) % 40 == 0 or n_ + 1 == len(todo)):
                        print(f"  [{prior}] {n_ + 1}/{len(todo)} games ({time.perf_counter() - t0:.0f}s)", flush=True)
            _JOBS = []
        finally:
            C.apply_knobs({})
    C.add_dyn2(out)
    for r, s in zip(out, specs):
        r["_key"] = _key(tag, st, s, collect)
    return out


def collected(results) -> tuple[np.ndarray, np.ndarray]:
    S, Cc = [], []
    for r in results:
        p = GAMES / r["_key"][:2] / f"{r['_key']}.npz"
        if p.exists():
            z = np.load(p)
            S.append(z["sym"])
            Cc.append(z["col"])
    return np.concatenate(S), np.concatenate(Cc)


# ------------------------------------------------------------------------------------------------
# summaries
# ------------------------------------------------------------------------------------------------
KEYS = ["dynamism2", "dynamism", "snap_tension", "sig_tension_rate", "durable_lead_changes_per_obj_100s",
        "climbs_held_accel_per_100s", "climbs_per_100s", "spirals_per_100_commits", "crossings_per_pair_100s",
        "rise_fall_share", "snap_autocorr", "obj_hot_share", "obj_peak_salience_mean", "steal_rate",
        "mutator_entropy_norm", "payoff_gini", "top_object_share", "energy_unspent_share", "commits"]


def paired(a: list[dict], b: list[dict], k: str, B: int = 1000) -> tuple[float, float, float]:
    d = np.array([y[k] - x[k] for x, y in zip(a, b)], float)
    rng = np.random.default_rng(0)
    bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(B)]
    return float(d.mean()), float(np.quantile(bs, 0.025)), float(np.quantile(bs, 0.975))


def compare(results: dict, base: str = "uniform") -> str:
    from .validate import md
    pr = list(results)
    rows = []
    for k in KEYS:
        row = [k]
        for p in pr:
            v = np.array([r[k] for r in results[p]], float)
            row.append(f"{v.mean():.3g}")
        for p in pr:
            if p == base:
                continue
            m, lo, hi = paired(results[base], results[p], k)
            star = "*" if lo > 0 or hi < 0 else ""
            row.append(f"{m:+.3g} [{lo:+.2g}, {hi:+.2g}]{star}")
        rows.append(row)
    t1 = md(["metric"] + [f"mean {p}" for p in pr] + [f"Δ {p} − {base} (95% CI)" for p in pr if p != base], rows)
    frows = []
    for p in pr:
        rws = C.god_rows(results[p])
        ff = C.family_fairness(rws, B=100, min_n=8)
        cm = defaultdict(list)
        from ...rules import by_id
        for r in rws:
            cm[by_id(r["family"]).camp].append(r["z"])
        pt = C.policy_table(rws)
        worst = sorted(((v["adj_z"], k) for k, v in ff["families"].items() if v["n"] >= 8))
        frows.append([p, f"{ff['z_sd']:.3f}", f"{ff['z_sd_excess']:.3f}", f"{ff['share_unfair']:.2f}", ff["n_families"],
                      " ".join(f"{k[:4]} {np.mean(v):.3f}" for k, v in sorted(cm.items())),
                      " ".join(f"{k[:6]} {v['z']:.2f}" for k, v in sorted(pt.items())),
                      ", ".join(f"{k} {z:.2f}" for z, k in worst[:2]) + " … " + ", ".join(f"{k} {z:.2f}" for z, k in worst[-2:])])
    t2 = md(["prior", "family z SD", "excess SD", "share unfair", "families (n>=8)", "camp mean z", "policy mean z",
             "lowest … highest adj z"], frows)
    return t1 + "\n\n" + t2


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.games")
    ap.add_argument("--types", default="5,base10,rgby;4,base12,rgb")
    ap.add_argument("--games", type=int, default=80)
    ap.add_argument("--seed", type=int, default=700_000)
    ap.add_argument("--priors", default="uniform,reach2,levin,mix.5_reach2")
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    types = a.types.split(";")
    specs = C.make_specs(types, a.games, a.seed, mix=a.mix)
    res = {}
    for p in a.priors.split(","):
        res[p] = run_batch(p, specs, processes=a.processes)
    print(f"### {len(specs)} games ({a.games} per GridType: {', '.join(types)}), seeds from {a.seed}, policies {a.mix}\n")
    print(compare(res))
    for gs in types:
        sub = {p: [r for r, s in zip(v, specs) if s.gtype == gs] for p, v in res.items()}
        print(f"\n#### {gs}\n")
        print(compare(sub))
    if a.json:
        Path(a.json).write_text(json.dumps({p: [{k: r.get(k) for k in KEYS + ["gtype", "seed"]} for r in v]
                                            for p, v in res.items()}))


if __name__ == "__main__":
    main()
