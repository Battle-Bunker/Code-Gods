"""Calibration: ordinal utility -> surprisal (bits) via the survival function under the prior.

    G(t) = μ{u >= t},   s(t) = -log2 G(t),   μ = uniform spawn prior of the gtype.

Estimator (ESTIMATOR_VERSION below; see docs/engine.md for error behaviour):

  * Body: plain Monte Carlo with `family.evaluate_batch` on `n_mc` prior samples. Every distinct
    ordinal seen with at least `min_mc_count` samples at or above it gets an MC level.
  * Tail: adaptive multilevel splitting (AMS). Particles start as the MC samples above the deepest
    MC level. Each stage picks the next level so that about `p0` of the particles survive, kills the
    rest, clones survivors, and runs an MCMC kernel that leaves the prior restricted to {u >= level}
    invariant. Each kernel step proposes one of (a) resample one random cell uniformly (symbol and
    colour), (b) resample one cell's symbol, (c) resample one cell's colour, (d) swap two cells. All
    four are symmetric proposals under the product-uniform prior, so "accept iff u stays >= level"
    is exactly Metropolis on μ|{u >= level}. Stops at `target_bits` (default 64) or when no particle
    can climb (the ordinal's maximum has been reached or is unreachable by the kernel).
  * Exact: if the family supplies `exact_log2_tail`, lookups use it (estimation still possible via
    `survival(..., use_exact=False)`, which the tests use for the cross-check).
  * Lookup: `log2_tail(t)` uses the largest level <= t (conservative: never claims more bits than an
    observed level supports). Below the smallest level: 0 bits.
  * Extrapolation above the highest observed level: s(max level) + 1 bit per further *known*
    distinct ordinal (the family's exemplar, if any) up to and including t, minimum 1, capped at
    EXTRAP_CAP_BITS extra. Since s_max is usually >= 60 bits this almost never matters in play.

Determinism: the RNG seed is sha256(family id, canonical params, gtype.key, ESTIMATOR_VERSION).
Draws in one symmetry orbit (same `family.canonical(params)`) share a table. The cache key adds the
budget and a hash of the family's source file, so editing a rule invalidates its tables.
Tables are cached in memory and under lib/grid-lab/.cache/survival/.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import math
import multiprocessing as mp
import os
import pickle
from bisect import bisect_right
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, Optional, Sequence

import numpy as np

from .core import Grid, GridType
from .family import Draw, Family

ESTIMATOR_VERSION = 1
EXTRAP_CAP_BITS = 4.0
LN2 = math.log(2.0)
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "survival"
# Correlation between cloned AMS particles makes the ideal-mixing variance formula optimistic when
# the kernel mixes slowly. On the binomial toy (24 seeds, docs/engine.md) the raw formula already
# matches the observed spread; 1.6 is a safety margin for rules whose level sets mix worse.
SE_INFLATION = 1.6


@dataclass(frozen=True)
class Budget:
    n_mc: int = 1 << 16
    min_mc_count: int = 256
    n_particles: int = 1000
    p0: float = 0.5
    sweeps: float = 1.0          # MCMC steps per stage = ceil(sweeps * N * N)
    target_bits: float = 64.0
    max_stages: int = 400
    max_stuck: int = 3


DEFAULT_BUDGET = Budget()
JOINT_BUDGET = Budget(n_particles=2000, target_bits=80.0)
# Families without a vectorised `batch` evaluate one Python call per grid: use a smaller budget.
SLOW_BUDGET = Budget(n_mc=1 << 14, min_mc_count=128, n_particles=300, sweeps=0.6, target_bits=48.0)


# ------------------------------------------------------------------------------------------------
# keys
# ------------------------------------------------------------------------------------------------
def _jsonable(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (set, frozenset)):
        return sorted(_jsonable(x) for x in o)
    if isinstance(o, Grid):
        return o.key.hex()
    return repr(o)


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, default=_jsonable, separators=(",", ":"))


def canonical_params(draw: Draw, gtype: GridType) -> dict:
    f = draw.family
    return f.canonical(draw.params, gtype) if f.canonical is not None else draw.params


def seed_key(draw: Draw, gtype: GridType) -> str:
    """sha256 of (family id, canonical params, gtype key, estimator version): seeds the estimator."""
    payload = canonical_json({"family": draw.family.id, "params": canonical_params(draw, gtype),
                              "gtype": gtype.key, "estimator": ESTIMATOR_VERSION})
    return hashlib.sha256(payload.encode()).hexdigest()


_SRC_HASH: dict[str, str] = {}


def _source_hash(f: Family) -> str:
    out = []
    for fn in (f.ordinal, f.batch):
        if fn is None:
            continue
        try:
            path = inspect.getsourcefile(fn)
        except TypeError:
            path = None
        if not path:
            out.append(getattr(fn, "__qualname__", "?"))
            continue
        if path not in _SRC_HASH:
            try:
                _SRC_HASH[path] = hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]
            except OSError:
                _SRC_HASH[path] = "nofile"
        out.append(_SRC_HASH[path])
    return ",".join(out)


def budget_for(f: Family) -> Budget:
    return DEFAULT_BUDGET if f.batch is not None else SLOW_BUDGET


def cache_key(draw: Draw, gtype: GridType, budget: Budget | None = None) -> str:
    budget = budget or budget_for(draw.family)
    payload = canonical_json({"seed": seed_key(draw, gtype), "budget": asdict(budget),
                              "src": _source_hash(draw.family)})
    return hashlib.sha256(payload.encode()).hexdigest()


def rng_from(hexkey: str) -> np.random.Generator:
    return np.random.default_rng(int(hexkey[:32], 16))


# ------------------------------------------------------------------------------------------------
# Survival table
# ------------------------------------------------------------------------------------------------
class Survival:
    """Survival function G(t) = μ{u >= t} as a step table over observed ordinals.

    levels: strictly increasing int64 ordinals; log2p: log2 G(level), non-increasing, <= 0;
    stderr_bits: standard error of -log2p in bits at each level (0 where exact)."""

    def __init__(self, key: str, levels, log2p, stderr_bits, extra_levels=(), meta=None,
                 exact: Optional[Callable[[int], float]] = None):
        self.key = key
        self.levels = np.asarray(levels, dtype=np.int64)
        self.log2p = np.minimum.accumulate(np.minimum(np.asarray(log2p, dtype=np.float64), 0.0))
        self.stderr_bits = np.asarray(stderr_bits, dtype=np.float64)
        self.extra_levels = np.asarray(sorted(int(x) for x in extra_levels if x > self.levels[-1]),
                                       dtype=np.int64)
        self.meta = dict(meta or {})
        self.exact = exact
        self._exact_memo: dict[int, float] = {}
        self._lv = self.levels.tolist()
        self._lp = self.log2p.tolist()
        self._ex = self.extra_levels.tolist()

    # --- lookups ---------------------------------------------------------------------------------
    @property
    def max_observed_bits(self) -> float:
        return float(-self.log2p[-1])

    @property
    def floor_bits(self) -> float:
        return self.max_observed_bits

    def _scalar_log2(self, t: int) -> float:
        if self.exact is not None:
            v = self._exact_memo.get(t)
            if v is None:
                v = min(0.0, float(self.exact(t)))
                self._exact_memo[t] = v
            return v
        lv = self._lv
        if t > lv[-1]:
            j = bisect_right(self._ex, t - 1) if self._ex else 0  # extras strictly below t
            return self._lp[-1] - min(1.0 + j, EXTRAP_CAP_BITS)
        i = bisect_right(lv, t) - 1
        return 0.0 if i < 0 else self._lp[i]

    def log2_tail(self, t):
        """log2 μ{u >= t}; scalar or array."""
        if isinstance(t, int):
            return self._scalar_log2(t)
        if np.ndim(t) == 0:
            return self._scalar_log2(int(t))
        t = np.asarray(t, dtype=np.int64)
        if self.exact is not None:
            return np.array([self._scalar_log2(int(x)) for x in t.ravel()]).reshape(t.shape)
        i = np.searchsorted(self.levels, t, side="right") - 1
        out = np.where(i < 0, 0.0, self.log2p[np.clip(i, 0, None)])
        above = t > self.levels[-1]
        if above.any():
            j = np.searchsorted(self.extra_levels, t[above], side="left")
            out[above] = self.log2p[-1] - np.minimum(1.0 + j, EXTRAP_CAP_BITS)
        return out

    def surprisal(self, t):
        """Bits, >= 0, non-decreasing in t; scalar or array."""
        if isinstance(t, int):
            return 0.0 - self._scalar_log2(t)
        v = self.log2_tail(t)
        return 0.0 - v if np.ndim(v) == 0 else 0.0 - np.asarray(v)

    def stderr(self, t) -> float:
        """Standard error (bits) of the surprisal at ordinal t (0 when exact)."""
        if self.exact is not None:
            return 0.0
        i = bisect_right(self._lv, int(t)) - 1
        return 0.0 if i < 0 else float(self.stderr_bits[min(i, len(self._lv) - 1)])

    def __repr__(self):
        return (f"Survival({self.meta.get('family', '?')}, {len(self.levels)} levels, "
                f"max {self.max_observed_bits:.1f} bits{', exact' if self.exact else ''})")

    # --- persistence -------------------------------------------------------------------------------
    def to_dict(self) -> dict:
        return {"key": self.key, "levels": self.levels, "log2p": self.log2p, "stderr_bits": self.stderr_bits,
                "extra_levels": self.extra_levels, "meta": self.meta}

    @classmethod
    def from_dict(cls, d: dict, exact=None) -> "Survival":
        return cls(d["key"], d["levels"], d["log2p"], d["stderr_bits"], d["extra_levels"], d["meta"], exact)


# ------------------------------------------------------------------------------------------------
# MCMC kernel and adaptive multilevel splitting (generic over a score function)
# ------------------------------------------------------------------------------------------------
ScoreFn = Callable[[np.ndarray, np.ndarray], np.ndarray]


def mcmc(score: ScoreFn, sym: np.ndarray, col: np.ndarray, vals: np.ndarray, level, gtype: GridType,
         rng: np.random.Generator, steps: int) -> float:
    """In-place Metropolis on μ restricted to {score >= level}. Returns the acceptance rate."""
    n, N = len(sym), gtype.N
    flat_s, flat_c = sym.reshape(n, N * N), col.reshape(n, N * N)
    ar = np.arange(n)
    acc = 0
    for k in range(steps):
        kind = k % 4
        ps, pc = flat_s.copy(), flat_c.copy()
        cell = rng.integers(0, N * N, n)
        if kind == 0 or kind == 1:
            ps[ar, cell] = rng.integers(0, gtype.S, n, dtype=np.uint8)
        if kind == 0 or kind == 2:
            pc[ar, cell] = rng.integers(0, gtype.C, n, dtype=np.uint8)
        if kind == 3:
            other = rng.integers(0, N * N, n)
            ps[ar, cell], ps[ar, other] = flat_s[ar, other], flat_s[ar, cell]
            pc[ar, cell], pc[ar, other] = flat_c[ar, other], flat_c[ar, cell]
        pv = score(ps.reshape(n, N, N), pc.reshape(n, N, N))
        ok = pv >= level
        flat_s[ok], flat_c[ok], vals[ok] = ps[ok], pc[ok], pv[ok]
        acc += int(ok.sum())
    return acc / max(1, n * steps)


def _pick_level(vals: np.ndarray, level, p0: float):
    """Next level among distinct particle values > level, survival fraction closest to p0 (log scale)."""
    above = vals[vals > level]
    if above.size == 0:
        return None, None, None
    w = np.unique(above)
    frac = (vals[None, :] >= w[:, None]).mean(axis=1) if w.size <= 4096 else \
        np.array([(vals >= x).mean() for x in w])
    k = int(np.argmin(np.abs(np.log(frac) - math.log(p0))))
    return w, frac, k


def split(score: ScoreFn, sym: np.ndarray, col: np.ndarray, vals: np.ndarray, level, log2_level: float,
          var_level: float, gtype: GridType, rng: np.random.Generator, budget: Budget,
          target=None, record: bool = True):
    """Adaptive multilevel splitting from particles distributed as μ|{score >= level}.

    Returns (levels, log2p, var_bits2, final_state) where var_bits2 is the variance (bits^2) of each
    level's estimate under the ideal-mixing approximation (sum of (1-f)/(f n) over stages, / ln2^2).
    If `target` is given, levels are clamped to it and splitting stops on reaching it."""
    n = len(sym)
    steps = max(4, int(math.ceil(budget.sweeps * gtype.N * gtype.N)))
    out_l, out_p, out_v = [], [], []
    stuck = 0
    for _stage in range(budget.max_stages):
        if -log2_level >= budget.target_bits or (target is not None and level >= target):
            break
        w, frac, k = _pick_level(vals, level, budget.p0)
        if w is None:
            stuck += 1
            if stuck > budget.max_stuck:
                break
            mcmc(score, sym, col, vals, level, gtype, rng, steps * 2)
            continue
        stuck = 0
        if target is not None and w[k] > target:
            k = int(np.searchsorted(w, target, side="left"))
            if k >= len(w):
                k = len(w) - 1
            new_level = target
            f = float((vals >= target).mean())
        else:
            new_level, f = w[k], float(frac[k])
        if record:
            for j in range(k + 1):
                fj = float(frac[j]) if not (target is not None and j == k) else f
                out_l.append(w[j] if j < k or target is None else new_level)
                out_p.append(log2_level + math.log2(fj))
                out_v.append(var_level + (1 - fj) / (fj * n) / LN2 ** 2)
        log2_level += math.log2(f)
        var_level += (1 - f) / (f * n) / LN2 ** 2
        level = new_level
        alive = np.flatnonzero(vals >= level)
        dead = np.flatnonzero(vals < level)
        if dead.size:
            src = alive[rng.integers(0, alive.size, dead.size)]
            sym[dead], col[dead], vals[dead] = sym[src], col[src], vals[src]
        mcmc(score, sym, col, vals, level, gtype, rng, steps)
    if record and target is None:
        # Deepest population: record its remaining distinct values (fractions >= 1/n).
        w = np.unique(vals[vals > level])
        for x in w:
            fj = float((vals >= x).mean())
            out_l.append(x)
            out_p.append(log2_level + math.log2(fj))
            out_v.append(var_level + (1 - fj) / (fj * n) / LN2 ** 2)
    return out_l, out_p, out_v, (sym, col, vals, level, log2_level, var_level)


# ------------------------------------------------------------------------------------------------
# Table construction
# ------------------------------------------------------------------------------------------------
def _score_fn(draw: Draw, gtype: GridType, params=None) -> ScoreFn:
    f, p = draw.family, (draw.params if params is None else params)
    return lambda s, c: f.evaluate_batch(s, c, p, gtype)


def _mc_samples(score: ScoreFn, gtype: GridType, rng: np.random.Generator, n: int, chunk: int = 1 << 14):
    N = gtype.N
    S = np.empty((n, N, N), np.uint8)
    C = np.empty((n, N, N), np.uint8)
    V = np.empty(n, np.int64)
    for a in range(0, n, chunk):
        b = min(n, a + chunk)
        S[a:b] = rng.integers(0, gtype.S, (b - a, N, N), dtype=np.uint8)
        C[a:b] = rng.integers(0, gtype.C, (b - a, N, N), dtype=np.uint8)
        V[a:b] = score(S[a:b], C[a:b])
    return S, C, V


def build_table(draw: Draw, gtype: GridType, budget: Budget | None = None, salt: str = "") -> Survival:
    """Estimate the survival table for a draw (no caching; deterministic from seed_key).
    `salt` perturbs the seed for replicate runs (error studies); tables in play never use it."""
    import time
    t0 = time.perf_counter()
    budget = budget or budget_for(draw.family)
    skey = seed_key(draw, gtype)
    rng = rng_from(hashlib.sha256((skey + salt).encode()).hexdigest() if salt else skey)
    params = canonical_params(draw, gtype)
    score = _score_fn(draw, gtype, params)
    S, C, V = _mc_samples(score, gtype, rng, budget.n_mc)
    n = budget.n_mc
    w, counts = np.unique(V, return_counts=True)
    tail_counts = np.cumsum(counts[::-1])[::-1]
    p = tail_counts / n
    body = tail_counts >= budget.min_mc_count
    levels = list(w[body])
    log2p = list(np.log2(p[body]))
    var = list(((1 - p[body]) / (p[body] * n)) / LN2 ** 2)
    k0 = int(np.flatnonzero(body)[-1])
    l0 = w[k0]
    idx = np.flatnonzero(V >= l0)
    npart = budget.n_particles
    if idx.size >= npart:
        pick = rng.choice(idx, npart, replace=False)
        presteps = 0
    else:
        pick = idx[rng.integers(0, idx.size, npart)]
        presteps = int(math.ceil(2 * gtype.N * gtype.N))
    ps, pc, pv = S[pick].copy(), C[pick].copy(), V[pick].copy()
    del S, C
    if presteps:
        mcmc(score, ps, pc, pv, l0, gtype, rng, presteps)
    tl, tp, tv, fin = split(score, ps, pc, pv, l0, float(log2p[-1]), float(var[-1]), gtype, rng, budget)
    stages_used = len(tl)
    levels += tl
    log2p += tp
    var += tv
    extra, top = [], None
    if draw.family.exemplar is not None:
        try:
            ex = draw.family.exemplar(params, gtype)
            top = int(draw.family.ordinal(ex, params, gtype))
            extra.append(top)
        except Exception:  # exemplar is optional and advisory
            pass
    lv = np.asarray(levels, dtype=np.int64)
    order = np.argsort(lv, kind="stable")
    lv, lp, se = lv[order], np.asarray(log2p)[order], np.sqrt(np.asarray(var)[order])
    keep = np.r_[lv[1:] != lv[:-1], True]  # dedupe (keep the deepest-stage estimate)
    lv, lp, se = lv[keep], lp[keep], se[keep]
    se = np.where(np.arange(len(lv)) <= int(np.searchsorted(lv, l0)), se, se * SE_INFLATION)
    meta = {"family": draw.family.id, "params": canonical_json(params), "gtype": gtype.key,
            "estimator": ESTIMATOR_VERSION, "seed_key": skey, "budget": asdict(budget),
            "mc_levels": int(body.sum()), "split_levels": stages_used,
            # True when splitting stopped before target_bits: the ordinal's maximum was reached, or the
            # kernel found no way up (e.g. a binary all-or-nothing rule: supply exact_log2_tail).
            "stopped_early": bool(-fin[4] < budget.target_bits),
            # Whether the exemplar's ordinal (the family's claimed maximum) appears among the levels
            # (None without an exemplar). stopped_early and not top_reached = the kernel got stuck.
            "top_reached": None if top is None else bool(top <= int(max(levels))),
            "seconds": time.perf_counter() - t0}
    return Survival(cache_key(draw, gtype, budget), lv, lp, se, extra, meta)


# ------------------------------------------------------------------------------------------------
# Cache + public API
# ------------------------------------------------------------------------------------------------
_MEM: dict[str, Survival] = {}


def _exact_fn(draw: Draw, gtype: GridType):
    f = draw.family
    if f.exact_log2_tail is None:
        return None
    p = canonical_params(draw, gtype)
    return lambda t: f.exact_log2_tail(t, p, gtype)


def _disk_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.pkl"


def _load(key: str) -> dict | None:
    path = _disk_path(key)
    if path.exists():
        try:
            with open(path, "rb") as fh:
                return pickle.load(fh)
        except Exception:
            return None
    return None


def _save(key: str, table: Survival) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _disk_path(key).with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "wb") as fh:
        pickle.dump(table.to_dict(), fh, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, _disk_path(key))


def survival(draw: Draw, gtype: GridType, use_exact: bool = True, budget: Budget | None = None,
             cache: bool = True) -> Survival:
    """The draw's survival table (memory cache -> disk cache -> estimate)."""
    key = cache_key(draw, gtype, budget)
    exact = _exact_fn(draw, gtype) if use_exact else None
    mk = key + (":exact" if exact else "")
    if cache and mk in _MEM:
        return _MEM[mk]
    d = _load(key) if cache else None
    if d is not None:
        table = Survival.from_dict(d, exact)
    else:
        table = build_table(draw, gtype, budget)
        if cache:
            _save(key, table)
        table.exact = exact
    if cache:
        _MEM[mk] = table
    return table


def clear_memory_cache() -> None:
    _MEM.clear()


_POOL_JOBS: list = []


def _pool_build(i: int):
    draw, gtype, budget = _POOL_JOBS[i]
    t = build_table(draw, gtype, budget)
    _save(t.key, t)
    return t.key, t.meta.get("seconds", 0.0)


def precompute(draws: Sequence[Draw], gtype: GridType, processes: int = 4, budget: Budget | None = None) -> dict:
    """Build every missing table for `draws` in parallel (fork pool), then load them into memory.
    Returns {"built": n, "cached": n, "seconds": [per-table build seconds]}."""
    global _POOL_JOBS
    todo, seen, cached = [], set(), 0
    for d in draws:
        k = cache_key(d, gtype, budget)
        if k in seen:
            continue
        seen.add(k)
        if k in _MEM or _MEM.get(k + ":exact") or _disk_path(k).exists():
            cached += 1
            continue
        todo.append((d, gtype, budget))
    secs = []
    if todo:
        _POOL_JOBS = todo
        if processes > 1 and len(todo) > 1:
            ctx = mp.get_context("fork")
            with ctx.Pool(min(processes, len(todo))) as pool:
                for _k, s in pool.imap_unordered(_pool_build, range(len(todo))):
                    secs.append(s)
        else:
            for i in range(len(todo)):
                secs.append(_pool_build(i)[1])
        _POOL_JOBS = []
    for d in draws:
        survival(d, gtype, budget=budget)
    return {"built": len(todo), "cached": cached, "seconds": secs}


# ------------------------------------------------------------------------------------------------
# Joint surprisal and synergy
# ------------------------------------------------------------------------------------------------
def joint_surprisal(draw_i: Draw, draw_j: Draw, gtype: GridType, x: Grid, budget: Budget | None = None,
                    tables: tuple[Survival, Survival] | None = None) -> tuple[float, float]:
    """s_ij(x) = -log2 μ(U_i(x) ∩ U_j(x)) with U_k(x) = {y : u_k(y) >= u_k(x)}. Returns (bits, stderr).

    MC when the intersection is shallow (>= 64 hits in n_mc samples); otherwise AMS on the score
    φ(y) = min(s_i(u_i(y)) / s_i(x), s_j(u_j(y)) / s_j(x)) up to φ = 1, then the exact
    intersection indicator among the final particles (the φ >= 1 set contains the intersection)."""
    budget = budget or JOINT_BUDGET
    Ti, Tj = tables or (survival(draw_i, gtype), survival(draw_j, gtype))
    ti, tj = draw_i.ordinal(x, gtype), draw_j.ordinal(x, gtype)
    si, sj = Ti.surprisal(ti), Tj.surprisal(tj)
    if si <= 0.0:
        return sj, Tj.stderr(tj)
    if sj <= 0.0:
        return si, Ti.stderr(ti)
    key = hashlib.sha256(canonical_json({"i": seed_key(draw_i, gtype), "j": seed_key(draw_j, gtype),
                                         "x": x.key.hex(), "v": ESTIMATOR_VERSION}).encode()).hexdigest()
    rng = rng_from(key)
    fi, fj = _score_fn(draw_i, gtype), _score_fn(draw_j, gtype)

    def hit(s, c):
        return (fi(s, c) >= ti) & (fj(s, c) >= tj)

    def phi(s, c):
        return np.minimum(Ti.surprisal(fi(s, c)) / si, Tj.surprisal(fj(s, c)) / sj)

    S, C, _ = _mc_samples(lambda s, c: np.zeros(len(s), np.int64), gtype, rng, budget.n_mc)
    h = hit(S, C)
    nh = int(h.sum())
    n = budget.n_mc
    if nh >= 64:
        p = nh / n
        return -math.log2(p), math.sqrt((1 - p) / (p * n)) / LN2
    PV = phi(S, C)
    w, counts = np.unique(PV, return_counts=True)
    tc = np.cumsum(counts[::-1])[::-1]
    k0 = int(np.flatnonzero(tc >= budget.min_mc_count)[-1])
    l0 = float(w[k0])
    p0 = tc[k0] / n
    idx = np.flatnonzero(PV >= l0)
    pick = idx[rng.integers(0, idx.size, budget.n_particles)] if idx.size < budget.n_particles else \
        rng.choice(idx, budget.n_particles, replace=False)
    ps, pc, pv = S[pick].copy(), C[pick].copy(), PV[pick].copy()
    mcmc(phi, ps, pc, pv, l0, gtype, rng, gtype.N * gtype.N)
    _, _, _, (ps, pc, pv, lev, lg, var) = split(phi, ps, pc, pv, l0, math.log2(p0), (1 - p0) / (p0 * n) / LN2 ** 2,
                                                gtype, rng, budget, target=1.0, record=False)
    if lev < 1.0:  # could not reach φ = 1: report the deepest bound reached + 1 bit
        return -lg + 1.0, float("inf")
    for _ in range(3):
        f = float(hit(ps, pc).mean())
        if f > 0:
            break
        mcmc(phi, ps, pc, pv, 1.0, gtype, rng, gtype.N * gtype.N)
    if f <= 0:
        f = 0.5 / len(ps)
    lg += math.log2(f)
    var += (1 - f) / (f * len(ps)) / LN2 ** 2
    return -lg, math.sqrt(var) * SE_INFLATION


def synergy(draw_i: Draw, draw_j: Draw, gtype: GridType, x: Grid, **kw) -> float:
    """s_i + s_j - s_ij (pointwise mutual information of the two upper contour sets), bits."""
    Ti, Tj = survival(draw_i, gtype), survival(draw_j, gtype)
    si, sj = Ti.surprisal(draw_i.ordinal(x, gtype)), Tj.surprisal(draw_j.ordinal(x, gtype))
    sij, _ = joint_surprisal(draw_i, draw_j, gtype, x, tables=(Ti, Tj), **kw)
    return si + sj - sij
