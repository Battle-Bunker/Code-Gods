"""Synergy atlas: pointwise mutual information of upper contour sets between every family pair.

For god i with draw d_i and a surprisal depth b, the threshold t_i(b) is the smallest calibrated level
with s_i >= b, and U_i(b) = {y : u_i(y) >= t_i(b)} is the upper contour set "at least b bits good for i".
The atlas entry for draws (i, j) at depths (b_i, b_j) is

    PMI_ij = s_i + s_j - s_ij = log2 μ(U_j | U_i) + s_j,       s_ij = -log2 μ(U_i ∩ U_j)

(SPEC §2 synergy). > 0: the two goals co-occur more than chance (aligned), < 0: they exclude each other.
s_i, s_j are the actual surprisals of the chosen levels (coarse rules can jump past b).

Estimator (joint_climb, used for the atlas): one adaptive-multilevel-splitting climb per unordered
draw pair, from the prior, on φ(y) = min(s_i(y), s_j(y)). Since surprisal is monotone in the ordinal,
{φ >= b} = U_i(b) ∩ U_j(b) exactly, so the climb passes every depth b in turn and records
s_ij(b) = -log2 μ{φ >= b} at the stage that crosses it (MC directly when >= 64 of the prior samples
hit; 2^15 samples). The kernel is calibrate.mcmc (Metropolis on μ restricted to the current level set). A climb that
stalls (no particle can rise) or passes 2·max(depth) + max_cond_bits is censored: s_ij is then a lower
bound and PMI an upper bound.

An earlier estimator, `climb` (kept for reference), conditioned on a population of μ|U_i and climbed
u_j inside it. It stalls when U_i is rigid (e.g. two complete Rainbow Road lines freeze most cells),
which censored about a third of the 24-bit entries; starting from the prior avoids that, because both
constraints tighten together.

Run:  python3 -m gridlab.explore.synergy.atlas --type 5,base10,rgby --draws 2 --processes 4
Results: .cache/explore/synergy/atlas_<gtype>_<tag>.pkl (gitignored); summary JSON via camps.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import multiprocessing as mp
import os
import pickle
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from ...core import GridType
from ...family import Draw, Family
from ... import calibrate as cal

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "explore" / "synergy"
DEPTHS = (8.0, 16.0, 24.0)
SENT = np.int64(-(1 << 62))
ATLAS_VERSION = 1


@dataclass(frozen=True)
class AtlasBudget:
    n_particles: int = 300
    p0: float = 0.5
    sweeps: float = 1.0          # MCMC steps per stage = ceil(sweeps * N^2)
    decorrelate: float = 3.0     # extra sweeps on a population before use
    max_cond_bits: float = 44.0  # stop climbing j beyond this conditional depth (censor)
    max_stages: int = 80


def parse_type(s: str) -> GridType:
    n, sym, col = s.split(",")
    return GridType(int(n), sym, col)


def _h(*parts) -> int:
    return int(hashlib.sha256(json.dumps(parts, default=str, sort_keys=True).encode()).hexdigest()[:15], 16)


def atlas_draws(gtype: GridType, n_draws: int, families: Sequence[Family] | None = None) -> list[Draw]:
    """n_draws param draws per available family (deterministic per family, gtype and index; identical
    params are deduplicated, so parameter-free families get one draw)."""
    if families is None:
        from ...rules import FAMILIES
        families = FAMILIES
    out = []
    for f in families:
        if not f.available(gtype):
            continue
        seen = set()
        for k in range(n_draws * 3):
            if len(seen) >= n_draws:
                break
            p = f.sample(np.random.default_rng(_h("atlas-draw", f.id, gtype.key, k)), gtype)
            pk = cal.canonical_json(p)
            if pk in seen:
                continue
            seen.add(pk)
            out.append(Draw(f, p))
    return out


def thresholds(table: cal.Survival, depths: Sequence[float] = DEPTHS) -> list[tuple[int, float] | None]:
    """[(t, s(t)) | None] per depth: the smallest table level with surprisal >= depth. With an exact
    tail the exemplar's ordinal counts as a level too (binary rules such as Picture Frame have no
    estimated level above 0)."""
    lv = np.asarray(table.levels)
    if table.exact is not None and len(table.extra_levels):
        lv = np.unique(np.r_[lv, table.extra_levels])
    s = np.asarray(table.surprisal(lv), float)
    out = []
    for b in depths:
        k = np.flatnonzero(s >= b - 1e-9)
        out.append((int(lv[k[0]]), float(s[k[0]])) if k.size else None)
    return out


def _steps(gtype: GridType, sweeps: float) -> int:
    return max(4, int(math.ceil(sweeps * gtype.N * gtype.N)))


def population(draw: Draw, gtype: GridType, targets: Sequence[int | None], rng: np.random.Generator,
               budget: AtlasBudget = AtlasBudget()) -> list[tuple[np.ndarray, np.ndarray] | None]:
    """Particle populations distributed as μ|{u >= t} for each (increasing) target t."""
    score = cal._score_fn(draw, gtype)
    n = budget.n_particles
    S, C, V = cal._mc_samples(score, gtype, rng, 1 << 17)
    out: list = [None] * len(targets)
    order = [k for k in np.argsort([t if t is not None else np.inf for t in targets]) if targets[k] is not None]
    if not order:
        return out
    # MC samples answer every target with >= n samples above it exactly; deeper ones split from l0,
    # the deepest level with >= n samples
    w, cnt = np.unique(V, return_counts=True)
    tc = np.cumsum(cnt[::-1])[::-1]
    l0 = w[int(np.flatnonzero(tc >= n)[-1])]
    for k in order:
        t = targets[k]
        if t <= l0:
            ok = np.flatnonzero(V >= t)
            sel = rng.choice(ok, n, replace=False)
            out[k] = (S[sel].copy(), C[sel].copy())
    idx = np.flatnonzero(V >= l0)
    pick = rng.choice(idx, n, replace=False)
    ps, pc, pv = S[pick].copy(), C[pick].copy(), V[pick].copy()
    del S, C, V
    level = l0
    b = cal.Budget(n_particles=n, p0=budget.p0, sweeps=budget.sweeps, target_bits=1e9, max_stages=budget.max_stages)
    dec = _steps(gtype, budget.decorrelate)
    for k in order:
        t = targets[k]
        if t <= l0:
            continue
        if level < t:
            cal.mcmc(score, ps, pc, pv, level, gtype, rng, dec)
            *_, fin = cal.split(score, ps, pc, pv, level, 0.0, 0.0, gtype, rng, b, target=t, record=False)
            ps, pc, pv, level = fin[0], fin[1], fin[2], fin[3]
            if level < t:      # could not reach t
                break
        cal.mcmc(score, ps, pc, pv, t, gtype, rng, dec)
        out[k] = (ps.copy(), pc.copy())
    return out


def climb(pop: tuple[np.ndarray, np.ndarray], draw_i: Draw, t_i: int, draw_j: Draw, targets_j: Sequence[int],
          gtype: GridType, rng: np.random.Generator, budget: AtlasBudget = AtlasBudget()) -> list[tuple[float, bool]]:
    """log2 μ(u_j >= t | u_i >= t_i) for each t in targets_j, from a population of μ|U_i.
    Returns [(log2 value, censored)]; censored means the value is an upper bound."""
    fi, fj = cal._score_fn(draw_i, gtype), cal._score_fn(draw_j, gtype)

    def score(s, c):
        vi = fi(s, c)
        out = np.full(len(s), SENT, np.int64)
        ok = vi >= t_i
        if ok.any():
            out[ok] = fj(s[ok], c[ok])
        return out

    sym, col = pop[0].copy(), pop[1].copy()
    vals = fj(sym, col).astype(np.int64)
    n = len(sym)
    steps = _steps(gtype, budget.sweeps)
    level = SENT + 1
    lg = 0.0
    tj = sorted(set(int(t) for t in targets_j))
    res: dict[int, tuple[float, bool]] = {}
    stuck = 0
    for _stage in range(budget.max_stages):
        # resolve every target the current population already reaches with a large fraction
        for t in tj:
            if t in res:
                continue
            f = float((vals >= t).mean())
            if f >= budget.p0 * 0.999 or (f > 0 and t <= level):
                res[t] = (lg + math.log2(f), False)
        if len(res) == len(tj) or -lg >= budget.max_cond_bits:
            break
        w, frac, k = cal._pick_level(vals, level, budget.p0)
        if w is None:
            stuck += 1
            if stuck > 3:
                break
            cal.mcmc(score, sym, col, vals, level, gtype, rng, steps * 2)
            continue
        stuck = 0
        # resolve targets passed by this stage at their own fraction (lower variance than overshooting)
        for t in tj:
            if t not in res and t <= w[k]:
                f = float((vals >= t).mean())
                res[t] = (lg + math.log2(f), False)
        new, f = w[k], float(frac[k])
        lg += math.log2(f)
        level = new
        alive = np.flatnonzero(vals >= level)
        dead = np.flatnonzero(vals < level)
        if dead.size:
            src = alive[rng.integers(0, alive.size, dead.size)]
            sym[dead], col[dead], vals[dead] = sym[src], col[src], vals[src]
        cal.mcmc(score, sym, col, vals, level, gtype, rng, steps)
    for t in tj:
        if t not in res:
            f = float((vals >= t).mean())
            res[t] = (lg + math.log2(f), False) if f > 0 else (lg + math.log2(1.0 / n), True)
    return [res[int(t)] for t in targets_j]


def joint_climb(draw_i: Draw, draw_j: Draw, Ti: cal.Survival, Tj: cal.Survival, gtype: GridType,
                rng: np.random.Generator, depths: Sequence[float] = DEPTHS, budget: AtlasBudget = AtlasBudget(),
                n_mc: int = 1 << 15) -> list[tuple[float, float, bool] | None]:
    """s_ij(b) = -log2 μ(U_i(b) ∩ U_j(b)) for each depth b, by one AMS climb from the prior on
    φ(y) = min(s_i(y), s_j(y)) (bits): {φ >= b} is exactly U_i(b) ∩ U_j(b), since s is monotone in u.
    Returns per depth (s_ij, stderr_bits, censored) or None when either threshold is missing.
    Censored: the climb stalled or passed max depth; s_ij is then a lower bound (PMI an upper bound)."""
    fi, fj = cal._score_fn(draw_i, gtype), cal._score_fn(draw_j, gtype)
    BIG = 1 << 40

    def phi(s, c):  # surprisal in milli-bits as int64 (ties preserved, cal.split works on ints)
        a = np.asarray(Ti.surprisal(fi(s, c)), float)
        b = np.asarray(Tj.surprisal(fj(s, c)), float)
        return np.minimum(np.round(np.minimum(a, b) * 1000.0), BIG).astype(np.int64)

    ths_i, ths_j = thresholds(Ti, depths), thresholds(Tj, depths)
    want = {}
    for k, b in enumerate(depths):
        if ths_i[k] is not None and ths_j[k] is not None:
            want[k] = int(round(b * 1000.0))  # φ >= b  <=>  φ_milli >= 1000 b (to 0.5 milli-bit)
    out: list = [None] * len(depths)
    if not want:
        return out
    S, C, V = cal._mc_samples(phi, gtype, rng, n_mc)
    n0 = len(V)
    res: dict[int, tuple[float, float, bool]] = {}
    for k, t in want.items():
        h = int((V >= t).sum())
        if h >= 64:
            p = h / n0
            res[k] = (-math.log2(p), math.sqrt((1 - p) / (p * n0)) / cal.LN2, False)
    todo = {k: t for k, t in want.items() if k not in res}
    if todo:
        n = budget.n_particles
        w, cnt = np.unique(V, return_counts=True)
        tc = np.cumsum(cnt[::-1])[::-1]
        k0 = int(np.flatnonzero(tc >= n)[-1])
        level, p0 = int(w[k0]), tc[k0] / n0
        idx = np.flatnonzero(V >= level)
        pick = rng.choice(idx, n, replace=False)
        sym, col, vals = S[pick].copy(), C[pick].copy(), V[pick].copy()
        del S, C, V
        lg = math.log2(p0)
        var = (1 - p0) / (p0 * n0) / cal.LN2 ** 2
        steps = _steps(gtype, budget.sweeps)
        stuck = 0
        cap = max(depths) * 2 + budget.max_cond_bits
        for _stage in range(budget.max_stages * 2):
            for k, t in list(todo.items()):
                f = float((vals >= t).mean())
                if f >= budget.p0 * 0.999:
                    res[k] = (-(lg + math.log2(f)), math.sqrt(var + (1 - f) / (f * n) / cal.LN2 ** 2), False)
                    del todo[k]
            if not todo or -lg >= cap:
                break
            wv, frac, kk = cal._pick_level(vals, level, budget.p0)
            if wv is None:
                stuck += 1
                if stuck > 3:
                    break
                cal.mcmc(phi, sym, col, vals, level, gtype, rng, steps * 2)
                continue
            stuck = 0
            for k, t in list(todo.items()):
                if t <= wv[kk]:
                    f = float((vals >= t).mean())
                    res[k] = (-(lg + math.log2(f)), math.sqrt(var + (1 - f) / (f * n) / cal.LN2 ** 2), False)
                    del todo[k]
            f = float(frac[kk])
            lg += math.log2(f)
            var += (1 - f) / (f * n) / cal.LN2 ** 2
            level = int(wv[kk])
            alive = np.flatnonzero(vals >= level)
            dead = np.flatnonzero(vals < level)
            if dead.size:
                src = alive[rng.integers(0, alive.size, dead.size)]
                sym[dead], col[dead], vals[dead] = sym[src], col[src], vals[src]
            cal.mcmc(phi, sym, col, vals, level, gtype, rng, steps)
        for k, t in todo.items():
            f = float((vals >= t).mean())
            if f > 0:
                res[k] = (-(lg + math.log2(f)), math.sqrt(var + (1 - f) / (f * n) / cal.LN2 ** 2), False)
            else:
                res[k] = (-(lg + math.log2(1.0 / n)), float("inf"), True)
    for k, r in res.items():
        out[k] = (r[0], r[1] * cal.SE_INFLATION if r[1] != float("inf") else r[1], r[2])
    return out


# ------------------------------------------------------------------------------------------------
# whole-GridType atlas (fork pool)
# ------------------------------------------------------------------------------------------------
_G: dict = {}


def _pair_job(job):
    i, j = job
    D, T, gt, bud, depths = _G["draws"], _G["tables"], _G["gtype"], _G["budget"], _G["depths"]
    rng = np.random.default_rng(_h("atlas-joint", cal.seed_key(D[i], gt), cal.seed_key(D[j], gt), _G["salt"],
                                   ATLAS_VERSION))
    t0 = time.perf_counter()
    r = joint_climb(D[i], D[j], T[i], T[j], gt, rng, depths, bud)
    return job, r, time.perf_counter() - t0


def atlas_path(gtype: GridType, tag: str) -> Path:
    return CACHE / f"atlas_{gtype.size}_{gtype.symbols}_{gtype.colours}_{tag}.pkl"


def build_atlas(gtype: GridType, n_draws: int = 2, processes: int = 4, budget: AtlasBudget = AtlasBudget(),
                depths: Sequence[float] = DEPTHS, tag: str = "main", families: Sequence[Family] | None = None,
                salt: str = "", pairs: Sequence[tuple[int, int]] | None = None, same_family: bool = False,
                verbose: bool = True) -> dict:
    """Compute (or resume) the atlas for a GridType: one joint climb per unordered draw pair of
    different families (and of the same family, with `same_family`). `salt` reseeds every climb (replicates); `pairs` restricts to given index pairs.
    Saves partial progress every 1000 climbs."""
    path = atlas_path(gtype, tag)
    CACHE.mkdir(parents=True, exist_ok=True)
    draws = atlas_draws(gtype, n_draws, families)
    t0 = time.perf_counter()
    pre = cal.precompute(draws, gtype, processes=processes)
    if verbose:
        print(f"[atlas] {gtype.key}: {len(draws)} draws, tables built {pre['built']} "
              f"({time.perf_counter() - t0:.0f}s)", flush=True)
    tables = [cal.survival(d, gtype) for d in draws]
    ths = [thresholds(T, depths) for T in tables]
    keys = [cal.seed_key(d, gtype) for d in draws]
    state = None
    if path.exists():
        with open(path, "rb") as fh:
            state = pickle.load(fh)
        if state.get("version") != ATLAS_VERSION or state.get("draw_keys") != keys or state.get("salt") != salt:
            state = None
    if state is None:
        state = {"version": ATLAS_VERSION, "gtype": gtype.key, "n_draws": n_draws, "depths": list(depths),
                 "budget": budget.__dict__, "salt": salt, "draw_keys": keys,
                 "families": [d.family.id for d in draws], "params": [cal.canonical_json(d.params) for d in draws],
                 "raw_params": [d.params for d in draws],
                 "camps": [d.family.camp for d in draws], "layers": [sorted(d.family.layers) for d in draws],
                 "thresholds": ths, "ceiling": [float(T.max_observed_bits) for T in tables],
                 "joint": {}, "seconds": 0.0}
    _G.update(draws=draws, tables=tables, gtype=gtype, budget=budget, depths=list(depths), salt=salt)
    if pairs is None:
        pairs = [(i, j) for i in range(len(draws)) for j in range(i + 1, len(draws))
                 if same_family or draws[i].family.id != draws[j].family.id]
    state["thresholds"] = ths

    def stale(p):
        r = state["joint"].get(tuple(p), "missing")
        if r == "missing":
            return True
        i, j = p
        return any(ths[i][k] is not None and ths[j][k] is not None and (r is None or r[k] is None)
                   for k in range(len(depths)))
    jobs = [p for p in pairs if stale(p)]
    rs = np.random.default_rng(1)
    jobs = [tuple(jobs[k]) for k in rs.permutation(len(jobs))]
    if verbose:
        print(f"[atlas] {len(jobs)} joint climbs to run ({len(state['joint'])} cached)", flush=True)
    t2 = time.perf_counter()
    done = 0
    if jobs:
        with mp.get_context("fork").Pool(processes) as pool:
            for job, r, sec in pool.imap_unordered(_pair_job, jobs, chunksize=4):
                state["joint"][job] = r
                state["seconds"] += sec
                done += 1
                if done % 1000 == 0 or done == len(jobs):
                    _save(state, path)
                    if verbose:
                        el = time.perf_counter() - t2
                        print(f"[atlas] {done}/{len(jobs)} ({el:.0f}s, eta {el / done * (len(jobs) - done):.0f}s)",
                              flush=True)
    _save(state, path)
    return state


def _save(state: dict, path: Path) -> None:
    tmp = path.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "wb") as fh:
        pickle.dump(state, fh, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, path)


def load_atlas(gtype: GridType, tag: str = "main") -> dict:
    with open(atlas_path(gtype, tag), "rb") as fh:
        return pickle.load(fh)


# ------------------------------------------------------------------------------------------------
# reading the atlas
# ------------------------------------------------------------------------------------------------
def pmi_matrix(state: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(PMI, stderr, censored), each (D, D, A) and symmetric: PMI = s_i(b) + s_j(b) - s_ij(b) with the
    actual surprisals of the chosen thresholds. NaN where a threshold is missing or for same-family pairs.
    Censored entries are upper bounds."""
    D, A = len(state["families"]), len(state["depths"])
    P = np.full((D, D, A), np.nan)
    E = np.full((D, D, A), np.nan)
    Cn = np.zeros((D, D, A), bool)
    ths = state["thresholds"]
    # binary draws: one ordinal jump covers every depth (e.g. Picture Frame, 0 -> 32 bits). The climb
    # cannot enter an all-or-nothing contour set, so their censored pairs carry no information.
    dps = state["depths"]
    binary = [len({x[0] for x in t if x}) == 1 and sum(1 for x in t if x) >= 2 and
              max(x[1] for x in t if x) >= dps[1] for t in ths]
    for (i, j), r in state["joint"].items():
        if r is None:
            continue
        for k, x in enumerate(r):
            if x is None or (x[2] and (binary[i] or binary[j])):
                continue
            v = ths[i][k][1] + ths[j][k][1] - x[0]
            P[i, j, k] = P[j, i, k] = v
            E[i, j, k] = E[j, i, k] = x[1]
            Cn[i, j, k] = Cn[j, i, k] = x[2]
    return P, E, Cn


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--draws", type=int, default=2)
    ap.add_argument("--processes", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--particles", type=int, default=400)
    ap.add_argument("--tag", default="main")
    ap.add_argument("--salt", default="")
    ap.add_argument("--same-family", action="store_true", help="also pair draws of the same family")
    ap.add_argument("--families", default="", help="comma-separated family ids (default: all available)")
    a = ap.parse_args(argv)
    fams = None
    if a.families:
        from ...rules import by_id
        fams = [by_id(x) for x in a.families.split(",")]
    st = build_atlas(parse_type(a.type), a.draws, a.processes, AtlasBudget(n_particles=a.particles), tag=a.tag,
                     families=fams, salt=a.salt, same_family=a.same_family)
    P, E, Cn = pmi_matrix(st)
    for k, b in enumerate(st["depths"]):
        ok = ~np.isnan(P[:, :, k])
        print(f"depth {b:g}: pairs {int(ok.sum() // 2)}, PMI median {np.nanmedian(P[:, :, k]):.2f}, "
              f"se median {np.nanmedian(np.where(np.isinf(E[:, :, k]), np.nan, E[:, :, k])):.2f}, "
              f"censored {int(Cn[:, :, k].sum() // 2)}")
    print(f"climb CPU {st['seconds']:.0f}s")


if __name__ == "__main__":
    main()
