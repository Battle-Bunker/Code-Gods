"""Batch runner for the spirals study: variants x game specs -> cached per-game result dicts.

A *variant* is a JSON-able dict (all keys optional):
  name           label
  config         GameConfig overrides on top of experiments.common.OLD_CONFIG (100 Hz engine defaults)
  knobs          COST_KNOBS overrides (applied around each game)
  extend         list of extra mutator ids from explore.spirals.extend to enable
  select_alpha, select_by, tend_all     simx.Ext fields
  tend_prob, tend_mode                  share of library programs offered with a tending clause
  guard_discount  if true, a guarded program's overwrite erasure is charged x its guard's prior pass rate
  tend_aware     policies understand clauses (default: true when any tending is on)

Game specs come from experiments.common.make_specs (same GridType, gods, policies and seeds as the
coordinator's batches, so results pair across variants: common random numbers).

    python3 -m gridlab.explore.spirals.runner --variant base --types 5,base10,rgby --games 40
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import multiprocessing as mp
import os
import pickle
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from ...core import GridType
from ... import calibrate as cal
from ... import mutators as mx
from ...metrics import metrics, episodes, is_spiral
from ...sim import GameConfig, draws_for
from ..spirals import extend as xt
from .simx import Ext, Tended, run_game_x
from .policies import TEND_AWARE

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "explore" / "spirals"
RESULT_VERSION = 4
GTYPES = ["5,base10,rgby", "4,base12,rgb", "6,cards,rainbow6", "7,base16,rainbow6", "3,base10,rgb"]


def parse_type(s: str) -> GridType:
    n, sym, col = s.split(",")
    return GridType(int(n), sym, col)


def _code_hash() -> str:
    """Hash of everything that changes a game's outcome (not the analysis code: bump RESULT_VERSION)."""
    h = hashlib.sha256()
    g = ROOT / "gridlab"
    here = Path(__file__).parent
    files = sorted(list(g.glob("*.py")) + list((g / "rules").glob("*.py")) +
                   [here / f for f in ("simx.py", "policies.py", "extend.py")])
    for f in files:
        h.update(f.name.encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


CODE_HASH = _code_hash()


# ------------------------------------------------------------------------------------------------
# knobs and mutator set for a variant
# ------------------------------------------------------------------------------------------------
_KNOBS0 = copy.deepcopy(mx.COST_KNOBS)


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


def configure(v: dict) -> None:
    """Set COST_KNOBS (import-time defaults + overrides) and the active extra mutators for variant v."""
    xt.register()
    k = _merge(_KNOBS0, v.get("knobs", {}))
    on = set(v.get("extend", ()))
    k["disabled"] = sorted(set(k.get("disabled", ())) | {m for m in xt.EXTEND_IDS if m not in on})
    mx.COST_KNOBS.clear()
    mx.COST_KNOBS.update(k)


# ------------------------------------------------------------------------------------------------
# program library
# ------------------------------------------------------------------------------------------------
LIB_SIZE = 4096
_LIB: dict = {}


def _guarded_cost(prog, gt) -> float:
    """Program cost with the guard discount: every step's erasure term x the guard's prior pass rate."""
    t = prog.cost_terms(gt)
    q = prog.guard.pass_rate(gt) if prog.guard.kind is not None else 1.0
    tot = t["agent_base"] + t["guard"] + t["ratchet"]
    for s in prog.steps:
        tt = s.mutator.terms(s.params, gt)
        e = tt["erase"] * (q if prog.guard.kind is not None else 1.0)
        tot += tt["mult"] * (tt["base"] + tt["describe"] + e + tt["move"] + tt["measure"])
    return float(tot)


def library(gt: GridType, v: dict) -> tuple[list, np.ndarray]:
    """Deterministic library of LIB_SIZE programs for variant v. The base programs depend only on the
    GridType and the available mutator set, so variants that change prices or clauses share them."""
    from ...program import random_program
    tag = json.dumps({"gt": gt.key, "knobs": mx.COST_KNOBS, "tp": v.get("tend_prob", 0.0), "tm": v.get("tend_mode"),
                      "gd": bool(v.get("guard_discount")), "pk": v.get("program_kwargs", {}), "n": LIB_SIZE,
                      "code": CODE_HASH}, sort_keys=True, default=str)
    key = hashlib.sha256(tag.encode()).hexdigest()[:32]
    if key in _LIB:
        return _LIB[key]
    path = CACHE / "programs" / f"{key}.pkl"
    if path.exists():
        with open(path, "rb") as fh:
            _LIB[key] = pickle.load(fh)
        return _LIB[key]
    rng = np.random.default_rng(int(hashlib.sha256(f"lib|{gt.key}".encode()).hexdigest()[:16], 16))
    trng = np.random.default_rng(int(hashlib.sha256(f"tend|{gt.key}".encode()).hexdigest()[:16], 16))
    pk = v.get("program_kwargs", {})
    progs, seen = [], set()
    for _ in range(20 * LIB_SIZE):
        p = random_program(rng, gt, **pk)
        if p.key in seen:
            continue
        seen.add(p.key)
        progs.append(p)
        if len(progs) == LIB_SIZE:
            break
    costs = np.array([_guarded_cost(p, gt) if v.get("guard_discount") else float(p.cost(gt)) for p in progs])
    tp, tm = v.get("tend_prob", 0.0), v.get("tend_mode")
    if tp and tm:
        flip = trng.random(len(progs)) < tp
        progs = [Tended(p, tm) if f else p for p, f in zip(progs, flip)]
        costs = np.array([c + (Tended(p, tm).cost(gt) - p.cost(gt) if f else 0.0)
                          for c, p, f in zip(costs, [getattr(q, "prog", q) for q in progs], flip)])
    _LIB[key] = (progs, costs)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "wb") as fh:
        pickle.dump(_LIB[key], fh, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, path)
    return _LIB[key]


# ------------------------------------------------------------------------------------------------
# one game
# ------------------------------------------------------------------------------------------------
def config_for(v: dict, spec) -> GameConfig:
    from ...experiments.common import OLD_CONFIG
    kw = dict(OLD_CONFIG)
    kw.update(v.get("config", {}))
    pk = dict(kw.pop("policy_kwargs", {}) or {})
    return GameConfig(gtype=parse_type(spec.gtype), n_gods=spec.n_gods, policies=list(spec.policies),
                      seed=spec.seed, policy_kwargs=pk, **kw)


def ext_for(v: dict, gt: GridType) -> Ext:
    tending = bool(v.get("tend_all") or (v.get("tend_prob") and v.get("tend_mode")))
    aware = v.get("tend_aware", tending)
    return Ext(select_alpha=v.get("select_alpha", 0.0), select_by=v.get("select_by", "salience"),
               tend_all=v.get("tend_all"), library=library(gt, v), policy_map=TEND_AWARE if aware else {})


def play(v: dict, spec, keep_programs: bool = False, hook=None, commit_hook=None):
    """(log, tables, cfg) for one game under variant v."""
    configure(v)
    cfg = config_for(v, spec)
    cfg.keep_programs = keep_programs
    draws = draws_for(cfg)
    tables = [cal.survival(d, cfg.gtype) for d in draws]
    log = run_game_x(cfg, ext_for(v, cfg.gtype), hook=hook, tables=tables, commit_hook=commit_hook)
    return log, tables, cfg


def snapshot_feedback(log) -> dict:
    """Human-timescale feedback from the 5 s snapshots: per object, consecutive salience changes
    Δ1 = σ(t+5) - σ(t), Δ2 = σ(t+10) - σ(t+5).
      snap_autocorr5   pooled correlation of Δ1 and Δ2 (> 0: a rise tends to be followed by a rise)
      snap_accel5      share of 3-snapshot windows with Δ1 >= 2 bits and Δ2 >= Δ1 (rising faster)
      snap_climb5      share of windows with Δ1 >= 2 and Δ2 >= 2 (two rising steps in a row)"""
    ser = defaultdict(dict)
    for t, (ids, S) in enumerate(zip(log.snap_objs, log.snap_s)):
        for o, v in zip(ids.tolist(), S.sum(1).tolist()):
            ser[o][t] = v
    a, b = [], []
    for o, d in ser.items():
        ts = sorted(d)
        for t in ts:
            if t + 1 in d and t + 2 in d:
                a.append(d[t + 1] - d[t]); b.append(d[t + 2] - d[t + 1])
    a, b = np.array(a), np.array(b)
    out = {"snap_autocorr5": float(np.corrcoef(a, b)[0, 1]) if len(a) > 3 and a.std() > 0 and b.std() > 0 else 0.0}
    n = max(len(a), 1)
    out["snap_accel5"] = float(((a >= 2) & (b >= a)).sum() / n)
    out["snap_climb5"] = float(((a >= 2) & (b >= 2)).sum() / n)
    return out


def _pairs(G):
    return [(i, j) for i in range(G) for j in range(i + 1, G)]


def result(log, tables) -> dict:
    """metrics(log) (incl. ep_/fb_/tn_) plus what the condition analysis needs."""
    m = metrics(log)
    m.pop("spiral_len_hist", None)
    G = log.n_gods
    K = len(log.c_time)
    fams = list(log.families)
    m["n_gods"] = G
    m["params"] = list(log.params)
    m["counters"] = dict(log.counters)
    eps_ = episodes(log)
    sp = [e for e in eps_ if is_spiral(e)]
    owner = log.a_owner[log.c_agent].astype(int) if K else np.zeros(0, int)
    d = (log.c_after - log.c_before).astype(float) if K else np.zeros((0, G))
    # who benefits together in spirals (pairs of god slots), who contributes, what mutators drive them
    co = np.zeros((G, G))
    contrib = np.zeros(G)
    benef = np.zeros(G)
    mut_sp, mut_all = Counter(), Counter()
    for k in range(K):
        for mid in log.a_mutators[log.c_agent[k]]:
            mut_all[mid] += 1
    order = np.lexsort((np.arange(K), log.c_obj)) if K else np.zeros(0, int)
    pos = {int(c): q for q, c in enumerate(order)}
    for e in sp:
        a, b = pos[e["first"]], pos[e["last"]]
        ks = order[a:b + 1]
        dv = d[ks].sum(0)
        bs = np.flatnonzero(dv >= 1)
        for i in bs:
            benef[i] += 1
            for j in bs:
                if i < j:
                    co[i, j] += 1
        up = ks[d[ks].sum(1) >= 0.5]
        for i in set(owner[up].tolist()):
            contrib[i] += 1
        for kk in up:
            for mid in log.a_mutators[log.c_agent[kk]]:
                mut_sp[mid] += 1
    theft = np.zeros((G, G))
    if K:
        ar = np.arange(K)
        od = d[ar, owner]
        for k in np.flatnonzero(od >= 2):
            for j in np.flatnonzero(d[k] <= -2):
                if j != owner[k]:
                    theft[owner[k], j] += 1
    # incentive check: commits binned by the peers' salience S_-o of the object (o = committing owner):
    # mean Δs_o (what the owner gets) and mean ΔS_-o (what the owner does to everyone else's view)
    inc = {}
    if K:
        ar = np.arange(K)
        Sb = log.c_before.astype(float)
        peer_b = Sb.sum(1) - Sb[ar, owner]
        od = d[ar, owner]
        pd = d.sum(1) - od
        bins = np.searchsorted([4.0, 8.0, 16.0, 32.0, 64.0], peer_b, side="right")
        for bi in range(6):
            sel = bins == bi
            inc[str(bi)] = [int(sel.sum()), float(od[sel].sum()), float(pd[sel].sum())]
    m["incentive_bins"] = inc
    m.update(snapshot_feedback(log))
    m["pair_spirals"] = [[fams[i], fams[j], float(co[i, j])] for i, j in _pairs(G)]
    m["pair_theft"] = [[fams[i], fams[j], float(theft[i, j] + theft[j, i])] for i, j in _pairs(G)]
    m["god_spiral_benefit"] = benef.tolist()
    m["god_spiral_contrib"] = contrib.tolist()
    m["mut_spiral"] = dict(mut_sp)
    m["mut_all"] = dict(mut_all)
    m["top_spirals"] = [{k: (round(x, 2) if isinstance(x, float) else x) for k, x in e.items()}
                        for e in sorted(sp, key=lambda e: -e["gain"])[:5]]
    ranks = log.final_ranks()
    m["gods"] = [{"family": fams[i], "policy": log.policies[i], "rank": int(ranks[i]),
                  "payoff": float(log.final_payoff[i]), "spent": float(log.spent[i]),
                  "agents": int((log.a_owner == i).sum()),
                  "tended": int(sum(1 for a, o in enumerate(log.a_owner) if o == i and log.a_tend[a]))}
                 for i in range(G)]
    return m


# ------------------------------------------------------------------------------------------------
# batches
# ------------------------------------------------------------------------------------------------
def vkey(v: dict, spec) -> str:
    blob = json.dumps({"v": {k: x for k, x in v.items() if k != "name"}, "spec": [spec.gtype, spec.seed, list(spec.policies)],
                       "code": CODE_HASH, "rv": RESULT_VERSION}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:40]


def _rpath(key: str) -> Path:
    return CACHE / "games" / key[:2] / f"{key}.json"


def _jsonable(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


_JOBS: list = []


def _worker(i):
    v, spec, key = _JOBS[i]
    t0 = time.perf_counter()
    log, tables, cfg = play(v, spec)
    r = result(log, tables)
    r.update({"wall": time.perf_counter() - t0, "seed": spec.seed, "spec_policies": list(spec.policies), "key": key,
              "variant": v.get("name", "")})
    p = _rpath(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=_jsonable)
    os.replace(tmp, p)
    return i, r


def prepare(v: dict, specs, processes: int = 4) -> None:
    configure(v)
    by = defaultdict(list)
    for s in specs:
        by[s.gtype].extend(draws_for(config_for(v, s)))
    for gt, ds in by.items():
        g = parse_type(gt)
        cal.precompute(ds, g, processes=processes)
        library(g, v)


def run(v: dict, specs, processes: int = 4, verbose: bool = True) -> list[dict]:
    global _JOBS
    keys = [vkey(v, s) for s in specs]
    out = [None] * len(specs)
    todo = []
    for i, k in enumerate(keys):
        p = _rpath(k)
        if p.exists():
            try:
                out[i] = json.loads(p.read_text())
                continue
            except Exception:
                pass
        todo.append(i)
    if todo:
        t0 = time.perf_counter()
        prepare(v, [specs[i] for i in todo], processes)
        _JOBS = [(v, specs[i], keys[i]) for i in todo]
        done = 0
        if processes > 1 and len(todo) > 1:
            with mp.get_context("fork").Pool(processes) as pool:
                for j, r in pool.imap_unordered(_worker, range(len(todo)), chunksize=1):
                    out[todo[j]] = r
                    done += 1
                    if verbose and (done % 40 == 0 or done == len(todo)):
                        print(f"  [{v.get('name', '?')}] {done}/{len(todo)} games ({time.perf_counter() - t0:.0f}s)", flush=True)
        else:
            for j in range(len(todo)):
                out[todo[j]] = _worker(j)[1]
        _JOBS = []
    return out


def specs_for(types, games, seed=1, mix="mixed", gods=(3, 4, 5, 6)):
    from ...experiments.common import make_specs
    return make_specs(types, games, seed, mix, gods)


def main(argv=None):
    from .variants import VARIANTS
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--variant", default="base")
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=40)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    specs = specs_for(a.types.split(";"), a.games, a.seed, a.mix)
    for name in a.variant.split(","):
        rs = run(VARIANTS[name], specs, a.processes)
        from .analyse import headline
        print(headline({name: rs}))


if __name__ == "__main__":
    main()
