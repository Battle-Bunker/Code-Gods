"""Shared machinery for the experiment scripts: game specs, settings, cached parallel batches,
extended per-game metrics and fairness statistics.

Vocabulary
  GameSpec   one game *before* any design choice: GridType, seed, number of gods and their policies.
             Specs are drawn from their own RNG, so two settings run on the same specs are paired
             (common random numbers): same GridType, same gods, same policies, same game seed.
  setting    a design point: {"config": GameConfig overrides, "knobs": COST_KNOBS overrides,
             "prior": "uniform" | "reachable"}. `BASE` is the engine default as delivered.
  result     a JSON dict per game = gridlab.metrics.metrics(log) + `ext_metrics` extras.

Caching: results are keyed by sha256(setting, spec, CODE_HASH, METRICS_VERSION) and stored one file
per game under .cache/experiments/games/. CODE_HASH covers the simulator, policies, metrics,
mutators, programs, calibration, priors and the rules, so editing any of them re-runs games.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import multiprocessing as mp
import os
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np

from ..core import GridType
from .. import calibrate as cal
from ..metrics import metrics, spirals
from ..sim import GameConfig, run_game, draws_for, payoffs

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "experiments"
METRICS_VERSION = 5

GTYPES = ["5,base10,rgby", "4,base12,rgb", "6,cards,rainbow6", "7,base16,rainbow6", "3,base10,rgb"]
POLICY_MIXES = {
    "mixed": ("random", "greedy_private", "saver", "greedy_omniscient"),
    "greedy": ("greedy_private",),
    "coop": ("greedy_private", "cooperative"),
    "learners": ("greedy_private_learn", "saver", "random"),
}
# Engine defaults as delivered by the engine worker (docs/engine.md), at the real engine's 100 Hz
# (lib/game-core/src/settings.ts), spelled out so later default changes do not move this point.
OLD_CONFIG = {"interaction_rate_hz": 100.0, "starting_energy": 100.0, "energy_per_second": 1.0, "cost_scale": 1.0,
              "metabolic_cost": 0.0, "agent_half_life": None, "max_agents": 200, "spawn_rate_hz": 0.1,
              "starting_objects": 10, "length": "exponential", "half_life_seconds": 300.0, "planning_seconds": 60.0,
              "dealer": "distinct", "dealer_exclude": [], "dealer_require": [], "decision_interval": 2.0}
OLD_KNOBS = {"step_base": 1.0, "describe": 1.0, "erase": 1.0, "move": 0.35, "measure": 1.0, "ratchet": 1.0,
             "agent_base": 2.0, "guard_base": 1.0, "erasure": "shannon",
             "scope": {"local": 1.0, "line": 1.0, "block": 1.0, "region": 1.0, "global": 1.0},
             "kind": {"bijective": 1.0, "overwrite": 1.0}, "disabled": ["flatten"]}
BASE: dict = {"config": OLD_CONFIG, "knobs": OLD_KNOBS, "prior": "uniform"}


def parse_type(s: str) -> GridType:
    n, sym, col = s.split(",")
    return GridType(int(n), sym, col)


# ------------------------------------------------------------------------------------------------
# specs and settings
# ------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class GameSpec:
    gtype: str
    seed: int
    policies: tuple

    @property
    def n_gods(self) -> int:
        return len(self.policies)


def make_specs(gtypes: Sequence[str], n_per_type: int, seed0: int, mix: str = "mixed",
               gods: Sequence[int] = (3, 4, 5, 6)) -> list[GameSpec]:
    """n_per_type specs per GridType. Gods 3-6 and per-god policies drawn iid from the mix, from an RNG
    that depends only on (seed0, GridType index, game index)."""
    out = []
    pols = POLICY_MIXES[mix]
    for t, gt in enumerate(gtypes):
        for k in range(n_per_type):
            seed = seed0 + 100_000 * t + k
            r = np.random.default_rng([seed, 7])
            G = int(r.choice(gods))
            out.append(GameSpec(gt, seed, tuple(str(pols[int(r.integers(len(pols)))]) for _ in range(G))))
    return out


def merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def setting(**over) -> dict:
    """BASE with overrides: setting(config={...}, knobs={...}, prior=...)."""
    return merge(BASE, over)


_DEFAULT_KNOBS = None


def apply_knobs(knobs: dict) -> None:
    """Reset gridlab.mutators.COST_KNOBS to its import-time defaults, then apply overrides in place."""
    global _DEFAULT_KNOBS
    from .. import mutators
    if _DEFAULT_KNOBS is None:
        _DEFAULT_KNOBS = copy.deepcopy(mutators.COST_KNOBS)
    new = merge(_DEFAULT_KNOBS, knobs or {})
    mutators.COST_KNOBS.clear()
    mutators.COST_KNOBS.update(new)


_CEIL: dict = {}


def family_ceiling(gtype: GridType, family, n: int = 3) -> float:
    """Mean calibrated ceiling (deepest surprisal level, bits) over n fixed draws of a family."""
    k = (gtype.key, family.id)
    if k not in _CEIL:
        from ..family import Draw
        r = np.random.default_rng(int(hashlib.sha256(family.id.encode()).hexdigest()[:8], 16))
        _CEIL[k] = float(np.mean([cal.survival(Draw(family, family.sample(r, gtype)), gtype).max_observed_bits
                                  for _ in range(n)]))
    return _CEIL[k]


def low_ceiling_families(gtype: GridType, thresh: float) -> list[str]:
    from ..rules import FAMILIES
    return sorted(f.id for f in FAMILIES if f.available(gtype) and family_ceiling(gtype, f) < thresh)


def config_for(st: dict, spec: GameSpec) -> GameConfig:
    pol = [p.replace("_learn", "") for p in spec.policies]
    kw = dict(st.get("config", {}))
    if st.get("exclude_low_ceiling"):
        kw["dealer_exclude"] = sorted(set(kw.get("dealer_exclude") or ()) |
                                      set(low_ceiling_families(parse_type(spec.gtype), st["exclude_low_ceiling"])))
    pk = dict(kw.pop("policy_kwargs", {}) or {})
    if any(p.endswith("_learn") for p in spec.policies):
        pk.setdefault("greedy_private", {})["learn"] = True
    return GameConfig(gtype=parse_type(spec.gtype), n_gods=spec.n_gods, policies=pol, seed=spec.seed,
                      policy_kwargs=pk, **kw)


# ------------------------------------------------------------------------------------------------
# code hash and cache
# ------------------------------------------------------------------------------------------------
def _code_hash() -> str:
    h = hashlib.sha256()
    g = ROOT / "gridlab"
    files = sorted(list(g.glob("*.py")) + list((g / "rules").glob("*.py")))
    for f in files:
        h.update(f.name.encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


CODE_HASH = _code_hash()


def game_key(st: dict, spec: GameSpec) -> str:
    blob = json.dumps({"s": st, "spec": asdict(spec), "code": CODE_HASH, "mv": METRICS_VERSION},
                      sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:40]


def _path(key: str) -> Path:
    return CACHE / "games" / key[:2] / f"{key}.json"


def _jsonable(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


# ------------------------------------------------------------------------------------------------
# tables
# ------------------------------------------------------------------------------------------------
def tables_for(st: dict, cfg: GameConfig, draws=None) -> list:
    draws = draws if draws is not None else draws_for(cfg)
    if st.get("prior", "uniform") == "reachable":
        from ..priors import reachable_survival
        return [reachable_survival(d, cfg.gtype, **st.get("prior_kwargs", {})) for d in draws]
    return [cal.survival(d, cfg.gtype) for d in draws]


_PJOBS: list = []


def _prior_build(i):
    from ..priors import reachable_survival
    d, gt, kw = _PJOBS[i]
    reachable_survival(d, gt, **kw)
    return i


def prepare(st: dict, cfgs: Sequence[GameConfig], processes: int = 4, verbose: bool = True) -> None:
    """Build (in parallel) every survival table and program library the configs need."""
    global _PJOBS
    from ..policy import program_library
    from ..sim import default_program_factory
    by_type: dict = defaultdict(list)
    for c in cfgs:
        by_type[c.gtype].extend(draws_for(c))
    for gt, ds in by_type.items():
        t0 = time.perf_counter()
        pre = cal.precompute(ds, gt, processes=processes)
        program_library(gt, default_program_factory(), 4096)
        if st.get("prior", "uniform") == "reachable":
            from ..priors import reachable_pool
            kw = st.get("prior_kwargs", {})
            reachable_pool(gt, **{k: v for k, v in kw.items() if k in ("n_pool", "k_max", "max_cost")})
            seen, jobs = set(), []
            for d in ds:
                k = cal.cache_key(d, gt)
                if k not in seen:
                    seen.add(k)
                    jobs.append((d, gt, kw))
            _PJOBS = jobs
            with mp.get_context("fork").Pool(processes) as pool:
                list(pool.imap_unordered(_prior_build, range(len(jobs))))
            _PJOBS = []
        if verbose and pre["built"]:
            print(f"  [prepare] {gt.key}: {pre['built']} tables built, {pre['cached']} cached "
                  f"({time.perf_counter() - t0:.0f}s)", flush=True)


# ------------------------------------------------------------------------------------------------
# batches
# ------------------------------------------------------------------------------------------------
_JOBS: list = []


def _worker(i: int):
    st, spec, key = _JOBS[i]
    cfg = config_for(st, spec)
    t0 = time.perf_counter()
    draws = draws_for(cfg)
    tables = tables_for(st, cfg, draws)
    log = run_game(cfg, tables=tables)
    r = ext_metrics(log, tables)
    r["wall_seconds"] = time.perf_counter() - t0
    r["seed"] = spec.seed
    r["spec_policies"] = list(spec.policies)
    r["key"] = key
    r["ceil_v"] = 2
    p = _path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=_jsonable)
    os.replace(tmp, p)
    return i, r


def run_batch(st: dict, specs: Sequence[GameSpec], processes: int = 4, label: str = "",
              verbose: bool = True) -> list[dict]:
    """Results for every spec under setting `st` (cached per game; missing games run in a fork pool)."""
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
        apply_knobs(st.get("knobs", {}))
        try:
            cfgs = [config_for(st, specs[i]) for i in todo]
            prepare(st, cfgs, processes, verbose)
            _JOBS = [(st, specs[i], keys[i]) for i in todo]
            t0 = time.perf_counter()
            done = 0
            if processes > 1 and len(todo) > 1:
                with mp.get_context("fork").Pool(processes) as pool:
                    for j, r in pool.imap_unordered(_worker, range(len(todo)), chunksize=1):
                        out[todo[j]] = r
                        done += 1
                        if verbose and (done % 50 == 0 or done == len(todo)):
                            print(f"  [{label}] {done}/{len(todo)} games ({time.perf_counter() - t0:.0f}s)",
                                  flush=True)
            else:
                for j in range(len(todo)):
                    out[todo[j]] = _worker(j)[1]
            _JOBS = []
        finally:
            apply_knobs({})
    stale = [r for r in out if r is not None and not r.get("ceil_v")]
    if stale:
        refresh_ceilings(stale)
        for r in stale:
            r["ceil_v"] = 2
    return out


# ------------------------------------------------------------------------------------------------
# extended per-game metrics
# ------------------------------------------------------------------------------------------------
def _bij_map() -> dict:
    from ..mutators import MUTATORS
    return {m.id: bool(m.bijective) for m in MUTATORS}


def snapshot_dynamics(log, owner: np.ndarray, climb_gain: float = 8.0, climb_len: int = 3) -> dict:
    """Object dynamics as a watcher sees them: each object's surprisal vector at consecutive 5 s
    snapshots (only objects present at both ends of a step).

      snap_autocorr    correlation of an object's salience across one snapshot step (pooled): 1 = values
                       persist, ~0 = the object flickers between unrelated states
      snap_churn       1 - net / gross salience change over snapshot steps
      snap_tension     share of object-steps where some god gains >= 2 bits and another loses >= 2 bits
      snap_coop        share of object-steps where salience rises >= 2 bits and >= 2 gods gain >= 1 bit
      climbs           durable cooperative spirals: maximal runs of >= climb_len consecutive snapshot
                       steps in which the object's salience rises, total gain >= climb_gain bits, with
                       commits by >= 2 owners inside the run; climbs_accel: those whose per-step gains
                       have a positive slope (an accelerating climb)
      hits_per_obj_s   commits per object per second (the boil rate)
    """
    out = {}
    T = max(float(log.duration), 1e-9)
    Mmean = float(np.mean([len(o) for o in log.snap_objs])) if log.snap_objs else 0.0
    K = len(log.c_time)
    out["hits_per_obj_s"] = K / T / max(Mmean, 1.0)
    W = float(log.config.get("snapshot_interval", 5.0))
    own = defaultdict(set)
    if K:
        iv = np.floor(log.c_time / W).astype(int)
        for o, k, w in zip(log.c_obj.tolist(), iv.tolist(), owner.tolist()):
            own[(o, k)].add(w)
    series = defaultdict(list)          # obj -> [(snapshot index, svec)]
    for t, (ids, S) in enumerate(zip(log.snap_objs, log.snap_s)):
        for o, v in zip(ids.tolist(), S):
            series[o].append((t, v.astype(float)))
    a, b, gross, net, tens, coop, nsteps = [], [], 0.0, 0.0, 0, 0, 0
    climbs, accel, climb_gain_tot, held, held_accel = 0, 0, 0.0, 0, 0
    lead_spell_changes, obj_seconds = 0, 0.0
    for o, seq in series.items():
        if len(seq) < 2:
            continue
        ts = np.array([x[0] for x in seq])
        V = np.stack([x[1] for x in seq])
        sal = V.sum(1)
        dV = np.diff(V, axis=0)
        ds = np.diff(sal)
        a.extend(sal[:-1].tolist()); b.extend(sal[1:].tolist())
        gross += float(np.abs(ds).sum()); net += float(ds.sum())
        tens += int(((dV >= 2).any(1) & (dV <= -2).any(1)).sum())
        coop += int(((ds >= 2) & ((dV >= 1).sum(1) >= 2)).sum())
        nsteps += len(ds)
        obj_seconds += W * len(ds)
        # durable leadership: runs (>= 2 snapshots) of one god leading the object with >= 4 bits
        mx = V.max(1)
        ld = np.where(mx >= 4.0, np.argmax(V, 1), -1)
        spells = []
        q = 0
        while q < len(ld):
            r = q
            while r < len(ld) and ld[r] == ld[q]:
                r += 1
            if ld[q] >= 0 and r - q >= 2:
                spells.append(int(ld[q]))
            q = r
        lead_spell_changes += sum(1 for x, y in zip(spells, spells[1:]) if x != y)
        up = ds > 1e-6
        k = 0
        while k < len(up):
            if not up[k]:
                k += 1
                continue
            j = k
            while j < len(up) and up[j]:
                j += 1
            if j - k >= climb_len:
                gain = float(sal[j] - sal[k])
                owners = set()
                for q in range(int(ts[k]), int(ts[j]) + 1):
                    owners |= own.get((o, q), set())
                if gain >= climb_gain and len(owners) >= 2:
                    climbs += 1
                    climb_gain_tot += gain
                    y = ds[k:j]
                    acc = int(np.polyfit(np.arange(len(y)), y, 1)[0] > 0)
                    accel += acc
                    after = sal[j + 1:j + 3]
                    if len(after) == 2 and after.min() >= sal[k] + 0.75 * gain:
                        held += 1
                        held_accel += acc
            k = j
    if len(a) >= 3 and np.std(a) > 1e-9 and np.std(b) > 1e-9:
        out["snap_autocorr"] = float(np.corrcoef(a, b)[0, 1])
    else:
        out["snap_autocorr"] = 0.0
    out["snap_churn"] = float(1 - max(0.0, net) / max(gross, 1e-9)) if gross > 0 else 1.0
    out["snap_tension"] = tens / max(nsteps, 1)
    out["snap_coop"] = coop / max(nsteps, 1)
    out["climbs"] = climbs
    out["climbs_per_100s"] = 100.0 * climbs / T
    out["climbs_accel_per_100s"] = 100.0 * accel / T
    out["climb_gain_mean"] = climb_gain_tot / climbs if climbs else 0.0
    out["climbs_held_per_100s"] = 100.0 * held / T
    out["climbs_held_accel_per_100s"] = 100.0 * held_accel / T
    out["durable_lead_changes_per_obj_100s"] = 100.0 * lead_spell_changes / max(obj_seconds, 1e-9)
    out["snap_steps"] = nsteps
    return out


_EXC: dict = {}


def draw_ceiling(log, i: int, table) -> float:
    """Surprisal (bits) of the family's exemplar (its best known grid) for god i's draw; falls back to
    the table's deepest level. Exact-tail families have few table levels, so max_observed_bits alone
    under-reports them."""
    from ..rules import by_id
    f = by_id(log.families[i])
    params = log.params[i]
    k = (f.id, params, log.gtype.key, getattr(table, "key", ""))
    if k not in _EXC:
        v = float(table.max_observed_bits)
        if f.exemplar is not None:
            try:
                p = json.loads(params)
                p = {kk: (tuple(tuple(x) if isinstance(x, list) else x for x in vv) if isinstance(vv, list) else vv)
                     for kk, vv in p.items()}
                ex = f.exemplar(p, log.gtype)
                v = max(v, float(table.surprisal(int(f.ordinal(ex, p, log.gtype)))))
            except Exception:
                pass
        _EXC[k] = v
    return _EXC[k]


def ext_metrics(log, tables) -> dict:
    """metrics(log) plus: magnitude-aware tension, steals, churn, payoff-trajectory crossings and
    drawdowns, per-object leader changes and peaks, big spirals, time-binned activity, mutator x
    family usage, per-god records (family, policy, rank, ceiling, agents, spend)."""
    m = metrics(log)
    m.pop("spiral_len_hist", None)
    G, K, T = log.n_gods, len(log.c_time), max(float(log.duration), 1e-9)
    m["n_gods"] = G
    d = (log.c_after - log.c_before).astype(float) if K else np.zeros((0, G))
    owner = log.a_owner[log.c_agent].astype(int) if K else np.zeros(0, int)
    ar = np.arange(K)

    # --- tension that matters: >= 1 bit up for one god and >= 1 bit down for another
    if K:
        sig = (d >= 1).any(1) & (d <= -1).any(1)
        Pk, Nk = np.clip(d, 0, None).sum(1), np.clip(-d, 0, None).sum(1)
        m["sig_tension_rate"] = float(sig.mean())
        m["tension_w"] = float(np.minimum(Pk, Nk).sum() / max(np.maximum(Pk, Nk).sum(), 1e-9))
        od = d[ar, owner]
        dd = d.copy()
        dd[ar, owner] = np.inf
        omin = dd.min(1) if G > 1 else np.zeros(K)
        steal = (od >= 2) & (omin <= -2)
        bij = _bij_map()
        abij = np.array([all(bij.get(x, False) for x in ms) for ms in log.a_mutators], bool)
        m["owner_up_rate"] = float((od > 1e-9).mean())
        m["owner_down_rate"] = float((od < -1e-9).mean())
        m["steal_rate"] = float(steal.mean())
        m["steal_bij_share"] = float(abij[log.c_agent][steal].mean()) if steal.any() else 0.0
        m["bij_commit_share"] = float(abij[log.c_agent].mean())
        dsal = d.sum(1)
        m["churn"] = float(1 - max(0.0, dsal.sum()) / max(np.abs(dsal).sum(), 1e-9))
        m["mean_abs_ds"] = float(np.abs(d).sum(1).mean())
    else:
        for k in ("sig_tension_rate", "tension_w", "owner_up_rate", "owner_down_rate", "steal_rate",
                  "steal_bij_share", "bij_commit_share", "mean_abs_ds"):
            m[k] = 0.0
        m["churn"] = 1.0

    # --- leaderboard trajectories (snapshots every 5 s)
    P = log.snap_payoff.astype(float)
    tt = log.snap_time.astype(float)
    cross = 0
    for i in range(G):
        for j in range(i + 1, G):
            s = np.sign(P[:, i] - P[:, j])
            s = s[s != 0]
            cross += int((s[1:] != s[:-1]).sum())
    npairs = max(1, G * (G - 1) // 2)
    m["crossings"] = cross
    m["crossings_per_pair_100s"] = 100.0 * cross / npairs / T
    dds = []
    for i in range(G):
        rm = np.maximum.accumulate(P[:, i]) if len(P) else np.zeros(0)
        ok = rm > 1.0
        dds.append(float(((rm - P[:, i])[ok] / rm[ok]).max()) if ok.any() else 0.0)
    m["drawdown"] = dds
    m["drawdown_mean"] = float(np.mean(dds)) if dds else 0.0
    m["rise_fall_share"] = float(np.mean([x >= 0.25 for x in dds])) if dds else 0.0
    tot = P.sum(1)
    okr = tot > 1e-9
    if okr.sum() >= 3:
        sh = P[okr] / tot[okr, None]
        m["share_volatility"] = float(sh.std(0).mean())
        # leader changes ignoring the first 10% of the game (the opening scramble)
        late = tt[okr] >= 0.1 * T
        lead = np.argmax(P[okr][late], 1)
        m["lead_changes_late"] = int((lead[1:] != lead[:-1]).sum()) if len(lead) > 1 else 0
    else:
        m["share_volatility"], m["lead_changes_late"] = 0.0, 0
    # per-god mean surprisal per object over time: does each god's view of the world rise and fall?
    ms_traj = np.array([S.mean(0) if len(S) else np.zeros(G) for S in log.snap_s]) if log.snap_s else np.zeros((0, G))
    if len(ms_traj) >= 3:
        m["mean_s_sd"] = float(ms_traj.std(0).mean())
        lead = np.argmax(ms_traj, 1)
        m["mean_s_lead_changes"] = int((lead[1:] != lead[:-1]).sum())
        mx = np.array([S.max(0) if len(S) else np.zeros(G) for S in log.snap_s])
        m["max_s_final"] = mx[-1].tolist()
        m["max_s_peak"] = mx.max(0).tolist()
    else:
        m["mean_s_sd"], m["mean_s_lead_changes"] = 0.0, 0
        m["max_s_final"] = m["max_s_peak"] = [0.0] * G
    step = max(1, len(tt) // 60)
    m["traj_t"] = tt[::step].round(1).tolist()
    m["traj_payoff"] = P[::step].round(1).tolist()
    m["traj_mean_s"] = ms_traj[::step].round(2).tolist() if len(ms_traj) else []

    # --- per object: who leads it, how high it climbs, whether it falls back
    obj_lc, obj_peak, obj_drop, obj_n = [], [], [], []
    if K:
        order = np.lexsort((ar, log.c_obj))
        objs = log.c_obj[order]
        bounds = np.flatnonzero(np.r_[True, objs[1:] != objs[:-1], True])
        for a, b in zip(bounds[:-1], bounds[1:]):
            idx = order[a:b]
            A = log.c_after[idx].astype(float)
            sal = A.sum(1)
            mxs = A.max(1)
            ld = np.argmax(A, 1)[mxs >= 4.0]
            obj_lc.append(int((ld[1:] != ld[:-1]).sum()) if len(ld) > 1 else 0)
            pk = float(sal.max())
            obj_peak.append(pk)
            obj_drop.append(float((pk - sal[-1]) / pk) if pk >= 10 else 0.0)
            obj_n.append(len(idx))
    m["obj_lead_changes_per_100c"] = 100.0 * sum(obj_lc) / max(K, 1)
    m["obj_peak_salience_mean"] = float(np.mean(obj_peak)) if obj_peak else 0.0
    m["obj_peak_salience_max"] = float(np.max(obj_peak)) if obj_peak else 0.0
    m["obj_rise_fall_share"] = float(np.mean([x >= 0.5 for x, p in zip(obj_drop, obj_peak) if p >= 10])) \
        if any(p >= 10 for p in obj_peak) else 0.0
    m["obj_hot_share"] = float(np.mean([p >= 20 for p in obj_peak])) if obj_peak else 0.0

    # --- the same objects at a human timescale (5 s snapshots): persistence, durable climbs, tug-of-war
    m.update(snapshot_dynamics(log, owner))

    # --- spirals in more detail
    sp = spirals(log)
    gains = np.array([s["gain"] for s in sp]) if sp else np.zeros(0)
    lens = np.array([s["length"] for s in sp]) if sp else np.zeros(0)
    m["spiral_gain_mean"] = float(gains.mean()) if sp else 0.0
    m["spirals_big"] = int((gains >= 8).sum())
    m["spirals_big_per_100s"] = 100.0 * m["spirals_big"] / T
    m["spirals_long"] = int((lens >= 4).sum())
    accel = 0
    for s in sp:
        if s["length"] >= 3 and s["gain"] >= 4:
            y = np.asarray(s["increments"])
            accel += int(np.polyfit(np.arange(len(y)), y, 1)[0] > 0)
    m["spirals_accel_big"] = accel
    m["spirals_accel_big_per_100s"] = 100.0 * accel / T
    top = sorted(sp, key=lambda s: -s["gain"])[:3]
    m["top_spirals"] = [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in s.items() if k != "increments"}
                        | {"increments": [round(x, 2) for x in s["increments"][:12]]} for s in top]

    # --- time bins (60 s): agents alive, commits, |Δ salience|, net Δ salience, owner-useful share
    W, nb = 60.0, 20
    edges = np.arange(nb + 1) * W
    at = log.a_time.astype(float)
    m["bin_agents"] = [int((at <= e).sum()) for e in edges[1:]]
    if K:
        b = np.minimum((log.c_time / W).astype(int), nb)
        ds = d.sum(1)
        m["bin_commits"] = np.bincount(b, minlength=nb + 1)[:nb].tolist()
        m["bin_abs_dsal"] = np.bincount(b, weights=np.abs(ds), minlength=nb + 1)[:nb].round(1).tolist()
        m["bin_net_dsal"] = np.bincount(b, weights=ds, minlength=nb + 1)[:nb].round(1).tolist()
        m["bin_owner_up"] = np.bincount(b, weights=(d[ar, owner] > 1e-9).astype(float),
                                        minlength=nb + 1)[:nb].tolist()
    else:
        m["bin_commits"] = m["bin_abs_dsal"] = m["bin_net_dsal"] = m["bin_owner_up"] = [0] * nb

    # --- mutator x family usage (owner's family): [commits, owner-up commits, Σ owner Δs, Σ peer Δs]
    fams = list(log.families)
    use: dict = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0, 0.0]))
    if K:
        od = d[ar, owner]
        pdlt = d.sum(1) - od
        for k in range(K):
            f = fams[owner[k]]
            for mid in set(log.a_mutators[log.c_agent[k]]):
                u = use[f][mid]
                u[0] += 1
                u[1] += int(od[k] > 1e-9)
                u[2] += float(od[k])
                u[3] += float(pdlt[k])
    m["mut_family"] = {f: {k: [v[0], v[1], round(v[2], 2), round(v[3], 2)] for k, v in dct.items()}
                       for f, dct in use.items()}
    summ = defaultdict(Counter)
    for a, o in enumerate(log.a_owner.tolist()):
        for mid in set(log.a_mutators[a]):
            summ[fams[o]][mid] += 1
    m["summons_family"] = {f: dict(c) for f, c in summ.items()}
    m["agent_steps_mean"] = float(np.mean([len(x) for x in log.a_mutators])) if log.a_mutators else 0.0

    # --- concentration and per-god records
    Sm = log.final_s.astype(float)
    pi = payoffs(Sm).sum(1) if len(Sm) else np.zeros(0)
    m["top_object_share"] = float(pi.max() / pi.sum()) if pi.sum() > 0 else 0.0
    ranks = log.final_ranks()
    nag = np.bincount(log.a_owner.astype(int), minlength=G) if len(log.a_owner) else np.zeros(G, int)
    gain_own, gain_oth, loss_own, loss_oth = (np.zeros(G) for _ in range(4))
    if K:
        mine = owner[:, None] == np.arange(G)[None, :]
        pos, neg = np.clip(d, 0, None), np.clip(-d, 0, None)
        gain_own, gain_oth = (pos * mine).sum(0), (pos * ~mine).sum(0)
        loss_own, loss_oth = (neg * mine).sum(0), (neg * ~mine).sum(0)
    m["gods"] = [{"family": fams[i], "gain_own": float(gain_own[i]), "gain_others": float(gain_oth[i]),
                  "loss_own": float(loss_own[i]), "loss_others": float(loss_oth[i]), "params": log.params[i], "policy": log.policies[i], "rank": int(ranks[i]),
                  "payoff": float(log.final_payoff[i]), "ceil": draw_ceiling(log, i, tables[i]),
                  "agents": int(nag[i]), "spent": float(log.spent[i]), "energy": float(log.final_energy[i]),
                  "final_mean_s": float(Sm[:, i].mean()) if len(Sm) else 0.0}
                 for i in range(G)]
    m["energy_unspent_share"] = float(np.mean([g["energy"] / max(g["energy"] + g["spent"], 1e-9) for g in m["gods"]]))
    return m


# ------------------------------------------------------------------------------------------------
# statistics
# ------------------------------------------------------------------------------------------------
def boot_ci(x, B: int = 1000, alpha: float = 0.05, seed: int = 0, stat=np.mean) -> tuple[float, float, float]:
    """(point, lo, hi): percentile bootstrap of `stat` over the rows of x."""
    x = np.asarray(x, float)
    if x.size == 0:
        return (float("nan"),) * 3
    r = np.random.default_rng(seed)
    idx = r.integers(0, len(x), (B, len(x)))
    bs = np.array([stat(x[i]) for i in idx]) if stat is not np.mean else x[idx].mean(1)
    return float(stat(x)), float(np.quantile(bs, alpha / 2)), float(np.quantile(bs, 1 - alpha / 2))


def god_rows(results: Sequence[dict]) -> list[dict]:
    """One row per god-slot: game index, GridType, family, policy, G, rank, z = (G-rank)/(G-1), win."""
    rows = []
    for gi, r in enumerate(results):
        G = r["n_gods"]
        for k, g in enumerate(r["gods"]):
            rows.append({"game": gi, "gtype": r["gtype"], "family": g["family"], "policy": g["policy"],
                         "G": G, "rank": g["rank"], "z": (G - g["rank"]) / (G - 1), "win": float(g["rank"] == 1),
                         "fair_win": 1.0 / G, "ceil": g["ceil"], "agents": g["agents"], "slot": k,
                         "payoff": g["payoff"]})
    return rows


def additive_fit(rows: Sequence[dict], factor: str = "family", control: str = "policy", y: str = "z",
                 iters: int = 30) -> tuple[dict, dict]:
    """Backfit y ≈ μ + a[factor] + b[control] (sum-to-zero b weighted by counts). Returns
    ({factor level: μ + a}, {control level: b}): the factor's mean outcome with the control's effect removed."""
    yv = np.array([r[y] for r in rows], float)
    f = [r[factor] for r in rows]
    c = [r[control] for r in rows]
    fl, cl = sorted(set(f)), sorted(set(c))
    fi = np.array([fl.index(v) for v in f]) if rows else np.zeros(0, int)
    ci = np.array([cl.index(v) for v in c]) if rows else np.zeros(0, int)
    a, b = np.zeros(len(fl)), np.zeros(len(cl))
    nf, nc = np.bincount(fi, minlength=len(fl)), np.bincount(ci, minlength=len(cl))
    for _ in range(iters):
        a = np.bincount(fi, weights=yv - b[ci], minlength=len(fl)) / np.maximum(nf, 1)
        b = np.bincount(ci, weights=yv - a[fi], minlength=len(cl)) / np.maximum(nc, 1)
        mb = (b * nc).sum() / max(nc.sum(), 1)
        b -= mb
        a += mb
    return dict(zip(fl, a)), dict(zip(cl, b))


def family_fairness(rows: Sequence[dict], B: int = 200, seed: int = 0, min_n: int = 8) -> dict:
    """Per-family policy-adjusted mean z (0.5 = fair) and win ratio (wins / Σ 1/G), with bootstrap CIs
    over games; plus dispersion summaries over families with >= min_n god-slots."""
    rows = list(rows)
    adj, pol = additive_fit(rows)
    games = sorted(set(r["game"] for r in rows))
    by_game = defaultdict(list)
    for r in rows:
        by_game[r["game"]].append(r)
    rng = np.random.default_rng(seed)
    boots = defaultdict(list)
    for _ in range(B):
        pick = rng.choice(len(games), len(games))
        bs = [r for gi in pick for r in by_game[games[gi]]]
        a, _ = additive_fit(bs, iters=12)
        for k, v in a.items():
            boots[k].append(v)
    n = Counter(r["family"] for r in rows)
    wins = defaultdict(float)
    fair = defaultdict(float)
    for r in rows:
        wins[r["family"]] += r["win"]
        fair[r["family"]] += r["fair_win"]
    fam = {}
    for k in adj:
        bv = np.array(boots[k]) if boots[k] else np.array([adj[k]])
        fam[k] = {"n": n[k], "adj_z": adj[k], "lo": float(np.quantile(bv, 0.025)), "hi": float(np.quantile(bv, 0.975)),
                  "se": float(bv.std()), "win_ratio": wins[k] / max(fair[k], 1e-9), "wins": wins[k]}
    big = {k: v for k, v in fam.items() if v["n"] >= min_n}
    zs = np.array([v["adj_z"] for v in big.values()])
    ses = np.array([v["se"] for v in big.values()])
    var_excess = float(max(0.0, zs.var() - (ses ** 2).mean())) if len(zs) > 1 else 0.0
    out = {"families": fam, "policy_effect": pol,
           "z_sd": float(zs.std()) if len(zs) else 0.0,
           "z_sd_excess": math.sqrt(var_excess),
           "share_unfair": float(np.mean([(v["hi"] < 0.5) or (v["lo"] > 0.5) for v in big.values()])) if big else 0.0,
           "n_families": len(big)}
    return out


def policy_table(rows: Sequence[dict]) -> dict:
    """Per policy: n, mean z, win ratio (wins / Σ 1/G), with game-bootstrap CI on mean z."""
    out = {}
    for p in sorted(set(r["policy"] for r in rows)):
        rs = [r for r in rows if r["policy"] == p]
        z = [r["z"] for r in rs]
        pt, lo, hi = boot_ci(z, B=500)
        out[p] = {"n": len(rs), "z": pt, "lo": lo, "hi": hi,
                  "win_ratio": sum(r["win"] for r in rs) / max(sum(r["fair_win"] for r in rs), 1e-9)}
    return out


def mutator_table(results: Sequence[dict]) -> dict:
    """Per mutator: share of committed applications, owner-useful share, how many families use it
    meaningfully (>= 2% of that family's commits, pooled), and the top families by share."""
    tot = Counter()
    up = Counter()
    fam_tot = defaultdict(Counter)
    for r in results:
        for f, dct in r["mut_family"].items():
            for mid, v in dct.items():
                tot[mid] += v[0]
                up[mid] += v[1]
                fam_tot[f][mid] += v[0]
    allc = sum(tot.values())
    fam_share = {f: {k: v / max(sum(c.values()), 1) for k, v in c.items()} for f, c in fam_tot.items()}
    out = {}
    for mid in sorted(tot, key=lambda k: -tot[k]):
        users = sorted(((s[mid], f) for f, s in fam_share.items() if mid in s), reverse=True)
        out[mid] = {"share": tot[mid] / max(allc, 1), "useful": up[mid] / max(tot[mid], 1),
                    "n_families_2pct": sum(1 for s, _ in users if s >= 0.02),
                    "top_families": [(f, round(s, 3)) for s, f in users[:4]]}
    return out


def ceilings(results: Sequence[dict]) -> dict:
    """(GridType, family) -> mean calibrated ceiling (max observed bits) over the draws seen."""
    acc = defaultdict(list)
    for r in results:
        for g in r["gods"]:
            acc[(r["gtype"], g["family"])].append(g["ceil"])
    return {k: float(np.mean(v)) for k, v in acc.items()}


# ------------------------------------------------------------------------------------------------
# headline numbers and objective
# ------------------------------------------------------------------------------------------------
HEADLINE = ["dynamism", "dynamism2", "sig_tension_rate", "tension_rate", "spirals_per_100_commits",
            "spirals_big_per_100s", "spirals_accel_big_per_100s", "spiral_len_mean", "spiral_gain_mean",
            "lead_changes_per_100s", "lead_changes_late", "crossings_per_pair_100s", "share_volatility",
            "rise_fall_share", "obj_lead_changes_per_100c", "obj_rise_fall_share", "obj_hot_share",
            "obj_peak_salience_mean", "snap_autocorr", "snap_churn", "snap_tension", "snap_coop",
            "climbs_per_100s", "climbs_accel_per_100s", "climbs_held_per_100s", "climbs_held_accel_per_100s",
            "durable_lead_changes_per_obj_100s", "climb_gain_mean", "hits_per_obj_s", "stagnation_frac", "late_activity", "churn", "steal_rate",
            "steal_bij_share", "mutator_entropy_norm", "top_object_share", "payoff_gini", "commits", "agents",
            "energy_unspent_share", "duration"]


def _sq(x: float) -> float:
    return x / (1.0 + x)


# dynamism2: the objective used by the search (docs/experiments.md §2 justifies each term).
DYN2_WEIGHTS = {"tension": 0.20, "spirals": 0.20, "standings": 0.15, "memory": 0.20, "objects": 0.10,
                "liveness": 0.05, "variety": 0.10}


def dynamism2(r: dict) -> float:
    """Per-game dynamism v2 in [0, 1], measured at the 5 s snapshot timescale a watcher sees:
      tension   0.5*sq(durable lead changes per object per 100 s) + 0.5*min(1, snap_tension / 0.3):
                objects change hands between gods for spells of >= 10 s, and 5 s steps where one god
                gains >= 2 bits while another loses >= 2
      spirals   sq(held accelerating climbs per 100 s): >= 3 rising snapshots, >= 8 bits, >= 2 owners,
                rising increments, and the gain still there 10 s later
      standings 0.5*sq(leaderboard crossings per pair per 100 s / 2) + 0.5*share of gods with a >= 25%
                drawdown: leaders change, fortunes rise AND fall
      memory    max(0, snapshot autocorrelation of object salience): values persist rather than flicker
                (contiguous acceleration needs a memory)
      objects   share of objects that reach >= 20 bits of salience
      liveness  min(1, late_activity / 0.2)
      variety   mutator_entropy_norm
    """
    w = DYN2_WEIGHTS
    t = 0.5 * _sq(r["durable_lead_changes_per_obj_100s"]) + 0.5 * min(1.0, r["snap_tension"] / 0.3)
    s = _sq(r["climbs_held_accel_per_100s"])
    st = 0.5 * _sq(r["crossings_per_pair_100s"] / 2.0) + 0.5 * r["rise_fall_share"]
    mem = max(0.0, r["snap_autocorr"])
    ob = r["obj_hot_share"]
    lv = min(1.0, r["late_activity"] / 0.2)
    return (w["tension"] * t + w["spirals"] * s + w["standings"] * st + w["memory"] * mem + w["objects"] * ob
            + w["liveness"] * lv + w["variety"] * r["mutator_entropy_norm"])


def add_dyn2(results: Iterable[dict]) -> None:
    for r in results:
        r["dynamism2"] = dynamism2(r)


def summary(results: Sequence[dict], keys: Sequence[str] = HEADLINE) -> dict:
    add_dyn2(results)
    out = {}
    for k in keys:
        v = [r[k] for r in results if k in r]
        out[k] = boot_ci(v, B=500)
    return out


def fairness_score(results: Sequence[dict]) -> dict:
    rows = god_rows(results)
    ff = family_fairness(rows, B=60)
    pt = policy_table(rows)
    mt = mutator_table(results)
    pol_z = [v["z"] for v in pt.values()]
    return {"z_sd_excess": ff["z_sd_excess"], "z_sd": ff["z_sd"], "share_unfair": ff["share_unfair"],
            "policy_range": float(max(pol_z) - min(pol_z)) if pol_z else 0.0,
            "mutators_used": sum(1 for v in mt.values() if v["n_families_2pct"] >= 1),
            "mutators_total": len(mt), "ff": ff, "pt": pt, "mt": mt}


def objective(results: Sequence[dict]) -> dict:
    """Search objective: mean dynamism2, penalised for unfairness.
        J = dyn2 - 1.0 * max(0, z_sd_excess - 0.05) - 0.5 * max(0, policy_range - 0.15)
            - 0.01 * (#mutators no family uses for >= 2% of its commits)"""
    add_dyn2(results)
    fs = fairness_score(results)
    dyn = float(np.mean([r["dynamism2"] for r in results]))
    unused = fs["mutators_total"] - fs["mutators_used"]
    J = dyn - 1.0 * max(0.0, fs["z_sd_excess"] - 0.05) - 0.5 * max(0.0, fs["policy_range"] - 0.15) - 0.01 * unused
    return {"J": J, "dyn2": dyn, "dyn1": float(np.mean([r["dynamism"] for r in results])),
            "z_sd_excess": fs["z_sd_excess"], "policy_range": fs["policy_range"], "unused_mutators": unused,
            "share_unfair": fs["share_unfair"]}


# ------------------------------------------------------------------------------------------------
# printing
# ------------------------------------------------------------------------------------------------
def md_table(headers: Sequence[str], rows: Iterable[Sequence], floatfmt: str = ".3g") -> str:
    def f(x):
        if isinstance(x, float):
            return format(x, floatfmt)
        return str(x)
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        lines.append("| " + " | ".join(f(x) for x in r) + " |")
    return "\n".join(lines)


def ci_str(t: tuple, fmt: str = ".3f") -> str:
    p, lo, hi = t
    return f"{p:{fmt}} [{lo:{fmt}}, {hi:{fmt}}]"


SPARK = "▁▂▃▄▅▆▇█"


def sparkline(xs: Sequence[float], width: int = 40) -> str:
    xs = np.asarray(xs, float)
    if xs.size == 0:
        return ""
    if xs.size > width:
        idx = np.linspace(0, xs.size - 1, width).round().astype(int)
        xs = xs[idx]
    lo, hi = float(xs.min()), float(xs.max())
    if hi - lo < 1e-12:
        return SPARK[0] * len(xs)
    return "".join(SPARK[int((x - lo) / (hi - lo) * (len(SPARK) - 1))] for x in xs)


def save_json(name: str, obj) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{name}.json"
    with open(p, "w") as fh:
        json.dump(obj, fh, default=_jsonable, indent=1)
    return p


def refresh_ceilings(results: Sequence[dict]) -> None:
    """Recompute each god's `ceil` (exemplar surprisal under the uniform table) in place, for results
    cached before draw_ceiling existed."""
    from ..rules import by_id
    from ..family import Draw
    from ..calibrate import survival

    class _L:  # the bits of a GameLog that draw_ceiling reads
        pass
    for r in results:
        gt = parse_type(r["gtype"][5:-1])
        for g in r["gods"]:
            L = _L()
            L.families, L.params, L.gtype = [g["family"]], [g["params"]], gt
            f = by_id(g["family"])
            p = json.loads(g["params"])
            p = {k: (tuple(tuple(x) if isinstance(x, list) else x for x in v) if isinstance(v, list) else v)
                 for k, v in p.items()}
            try:
                tb = survival(Draw(f, p), gt)
            except Exception:
                continue
            g["ceil"] = draw_ceiling(L, 0, tb)


def load_manifest(name: str):
    """Results of a batch saved with save_json(name, {"keys": [...]}) (or {"a": [...], "b": [...]}),
    read straight from the per-game cache regardless of the current CODE_HASH (to analyse a batch after
    the code has moved on). Returns a list for "keys", else a dict of lists."""
    with open(CACHE / f"{name}.json") as fh:
        man = json.load(fh)

    def load(keys):
        out = []
        for k in keys:
            with open(_path(k)) as fh:
                out.append(json.load(fh))
        stale = [r for r in out if not r.get("ceil_v")]
        if stale:
            refresh_ceilings(stale)
            for r in stale:
                r["ceil_v"] = 2
        return out
    if "keys" in man:
        return load(man["keys"])
    return {k: load(v) for k, v in man.items() if isinstance(v, list)}
