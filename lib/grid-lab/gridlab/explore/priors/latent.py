"""Prior specs and the latent-space sampler for calibrating against non-uniform reference priors.

A **code prior** ρ is the law of y = P_k ∘ … ∘ P_1(x) under the *latent* prior

    π(x, k, P_1..P_K) = μ(x) · q(k) · Π_j w(P_j)

where μ is the uniform spawn prior, q a law on k ∈ {0..K}, and w a law on the GridType's program
library (the same 4096 priced programs the policies draw from). Slots j > k are auxiliary: they are
drawn from w but not applied. Then ρ{u >= t} = π{u∘Φ >= t} with Φ(x, k, P) = P_k∘…∘P_1(x).

Splitting's MCMC kernel is invariant for μ restricted to a level set, but not for ρ: ρ has no
tractable density. The trick is to split on the latent space instead, where the prior is a product
and every coordinate has a simple invariant move. Each kernel step proposes one of:

  (a)-(d)  the engine's four cell moves on x (resample a cell, its symbol, its colour; swap two
           cells), symmetric under μ;
  (e)      redraw one program slot from w (an independence proposal from the slot's own prior);
  (f)      redraw k from q (likewise);
  (g)      swap two program slots (the slots are exchangeable under π).

Each proposal leaves π invariant before the constraint, so "accept iff u(Φ(·)) >= level" is
Metropolis for π restricted to {u∘Φ >= level}, and adaptive multilevel splitting on the latent space
estimates ρ's survival function exactly as the engine's splitting does for μ. With K = 0 it reduces
to the engine's estimator (validate.py checks that, an exact toy and brute-force Monte Carlo).

Program weights w (PriorSpec.weights):
  flat   uniform over library programs costing <= cmax (the library is drawn from random_program, so
         this is the random-agent prior, ≈ 2^-D in description length): "what random cheap code makes"
  beta   ∝ 2^(-beta·cost) over the library (a tempered Levin weight)
  levin  the exact Kraft weight 2^-cost(P) over ALL programs, by importance weights 2^-cost / r(P)
         on the library (r = random_program's sampling law); q(k) ∝ Z^k with Z = Σ_P 2^-cost(P).
         This is the Solomonoff/Levin mixture: rarity is "the fewest bits of code plus luck".
`lam` adds mass to k = 0, mixing in the uniform prior: (c) in the brief.

Determinism: pools and tables are seeded from sha256(spec, GridType, library tag, family seed key)
and cached under .cache/explore_priors/.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import pickle
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Optional, Sequence

import numpy as np

from ...core import Grid, GridType
from ...family import Draw
from ... import calibrate as cal

LATENT_VERSION = 2
CACHE = Path(__file__).resolve().parents[3] / ".cache" / "explore_priors"
LN2 = math.log(2.0)


# ------------------------------------------------------------------------------------------------
# specs
# ------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class PriorSpec:
    name: str
    K: int = 0                    # max programs applied after the spawn
    weights: str = "flat"         # "flat" | "beta" | "levin"
    beta: float = 0.0
    cmax: float = 1e9             # hard cost budget (flat / beta)
    k_dist: str = "uniform"       # "uniform" on 0..K | "levin" (q(k) ∝ Z^k)
    lam: float = 0.0              # extra mass on k = 0: q' = lam·δ0 + (1-lam)·q
    lib_size: int = 4096

    @property
    def key(self) -> str:
        d = asdict(self)
        d.pop("name")
        return json.dumps(d, sort_keys=True)

    @property
    def is_uniform(self) -> bool:
        return self.K == 0 or self.lam >= 1.0


SPECS: dict[str, PriorSpec] = {s.name: s for s in [
    PriorSpec("uniform"),
    # (b) code-reachable: k uniform on 0..K random cheap programs (cost <= 30), as gridlab/priors.py
    PriorSpec("reach1", K=1, cmax=30.0),
    PriorSpec("reach2", K=2, cmax=30.0),
    PriorSpec("reach4", K=4, cmax=30.0),
    # (b) tempered Levin weights 2^-beta·cost over the whole library
    PriorSpec("beta.25", K=2, weights="beta", beta=0.25),
    PriorSpec("beta.5", K=2, weights="beta", beta=0.5),
    # (b) the exact Levin/Solomonoff mixture (Kraft weights 2^-cost, q(k) ∝ Z^k)
    PriorSpec("levin", K=3, weights="levin", k_dist="levin"),
    # (c) mixtures with the uniform prior
    PriorSpec("mix.5_reach2", K=2, cmax=30.0, lam=0.5),
    PriorSpec("mix.9_reach2", K=2, cmax=30.0, lam=0.9),
]}


def get_spec(s) -> PriorSpec:
    return s if isinstance(s, PriorSpec) else SPECS[s]


# ------------------------------------------------------------------------------------------------
# program weights
# ------------------------------------------------------------------------------------------------
def _log2_r(prog, gt: GridType) -> float:
    """log2 of random_program's probability of drawing `prog` (default kwargs)."""
    from ...program import STEP_WEIGHTS, GUARD_KINDS
    from ...mutators import available, _describe_bits
    w = np.array(STEP_WEIGHTS, float)
    w /= w.sum()
    lp = math.log2(w[len(prog.steps) - 1])
    nm = len(available(gt))
    for s in prog.steps:
        lp += -math.log2(nm) - s.mutator.describe_bits(s.params, gt)
    if prog.guard.kind is None:
        lp += math.log2(0.7)
    else:
        lp += math.log2(0.3) - math.log2(len(GUARD_KINDS)) - _describe_bits(GUARD_KINDS[prog.guard.kind],
                                                                              prog.guard.params, gt)
    return lp


@dataclass
class ProgramLaw:
    """The library, the slot law w and the k law q for one (GridType, spec)."""
    gtype: GridType
    spec: PriorSpec
    progs: list
    costs: np.ndarray
    w: np.ndarray
    q: np.ndarray
    tag: str
    Z: float = float("nan")      # Levin: Σ_P 2^-cost(P)
    cw: np.ndarray = field(default=None)

    def __post_init__(self):
        self.cw = np.cumsum(self.w)
        self.cw[-1] = 1.0

    def draw_progs(self, rng: np.random.Generator, size) -> np.ndarray:
        return np.searchsorted(self.cw, rng.random(size), side="right").astype(np.int32)

    def draw_k(self, rng: np.random.Generator, size) -> np.ndarray:
        return np.searchsorted(np.cumsum(self.q), rng.random(size), side="right").clip(0, len(self.q) - 1).astype(np.int8)

    @property
    def ess(self) -> float:
        return float(1.0 / np.sum(self.w ** 2))


_LAWS: dict = {}


def program_law(gtype: GridType, spec, library=None) -> ProgramLaw:
    """Slot law w and k law q for a spec over the policies' program library (or `library` =
    (programs, costs), e.g. an independently drawn one for stability checks)."""
    spec = get_spec(spec)
    from ...policy import program_library
    from ...sim import default_program_factory
    progs, costs = library or program_library(gtype, default_program_factory(), spec.lib_size)
    costs = np.asarray(costs, float)
    k = (gtype, spec.key, len(progs), float(np.sum(costs)), id(library) if library else 0)
    if k in _LAWS:
        return _LAWS[k]
    K = spec.K
    Z = float("nan")
    if spec.weights == "flat":
        w = (costs <= spec.cmax).astype(float)
    elif spec.weights == "beta":
        w = np.where(costs <= spec.cmax, 2.0 ** (-spec.beta * (costs - costs.min())), 0.0)
    elif spec.weights == "levin":
        lr = np.array([_log2_r(p, gtype) for p in progs])
        lw = -costs - lr                      # log2 (2^-cost / r)
        Z = float(np.mean(2.0 ** lw))         # importance estimate of Σ_P 2^-cost(P)
        w = 2.0 ** (lw - lw.max())
    else:
        raise ValueError(spec.weights)
    w = w / w.sum() if w.sum() > 0 else np.full(len(costs), 1.0 / len(costs))
    if spec.k_dist == "uniform":
        q = np.full(K + 1, 1.0 / (K + 1))
    elif spec.k_dist == "levin":
        q = Z ** np.arange(K + 1)
        q /= q.sum()
    else:
        raise ValueError(spec.k_dist)
    if spec.lam:
        q = (1 - spec.lam) * q
        q[0] += spec.lam
    tag = hashlib.sha256(f"{gtype.key}|{spec.key}|{float(np.sum(costs)):.6f}|{len(progs)}|{LATENT_VERSION}|"
                         f"{progs[0].key}|{progs[-1].key}".encode()).hexdigest()
    law = ProgramLaw(gtype, spec, progs, costs, w, q, tag, Z)
    _LAWS[k] = law
    return law


# ------------------------------------------------------------------------------------------------
# latent states
# ------------------------------------------------------------------------------------------------
class Latent:
    """A batch of latent states (x, k, slots) with their program chains and outputs y = Φ(state)."""

    def __init__(self, law: ProgramLaw, xs, xc, kk, idx):
        self.law, self.gt = law, law.gtype
        self.xs, self.xc = xs, xc
        self.kk, self.idx = kk, idx
        n, N = len(xs), self.gt.N
        self.ys, self.yc = np.empty_like(xs), np.empty_like(xc)
        self.chains: list = [None] * n
        for i in range(n):
            self.chains[i] = self._chain(Grid(xs[i], xc[i]), idx[i], int(kk[i]))
            self.ys[i], self.yc[i] = self.chains[i][-1].sym, self.chains[i][-1].col

    def _chain(self, g: Grid, slots, k: int, start=None, j0: int = 0) -> list:
        ch = [g] if start is None else list(start[:j0 + 1])
        progs, gt = self.law.progs, self.gt
        for j in range(j0, k):
            ch.append(progs[int(slots[j])].run(ch[-1], gt))
        return ch

    @classmethod
    def sample(cls, law: ProgramLaw, rng: np.random.Generator, n: int) -> "Latent":
        gt = law.gtype
        xs = rng.integers(0, gt.S, (n, gt.N, gt.N), dtype=np.uint8)
        xc = rng.integers(0, gt.C, (n, gt.N, gt.N), dtype=np.uint8)
        kk = law.draw_k(rng, n)
        idx = law.draw_progs(rng, (n, max(law.spec.K, 1)))
        return cls(law, xs, xc, kk, idx)

    def take(self, sel: np.ndarray) -> "Latent":
        out = Latent.__new__(Latent)
        out.law, out.gt = self.law, self.gt
        out.xs, out.xc, out.kk, out.idx = self.xs[sel].copy(), self.xc[sel].copy(), self.kk[sel].copy(), self.idx[sel].copy()
        out.ys, out.yc = self.ys[sel].copy(), self.yc[sel].copy()
        out.chains = [self.chains[int(i)] for i in sel]
        return out

    def copy_from(self, dst: np.ndarray, src: np.ndarray) -> None:
        for a in ("xs", "xc", "kk", "idx", "ys", "yc"):
            arr = getattr(self, a)
            arr[dst] = arr[src]
        for d, s in zip(dst, src):
            self.chains[int(d)] = self.chains[int(s)]


def mcmc_latent(score, L: Latent, vals: np.ndarray, level, rng: np.random.Generator, steps: int) -> float:
    """In-place Metropolis on π restricted to {score(Φ) >= level}. Returns the acceptance rate."""
    gt, law = L.gt, L.law
    n, N = len(L.xs), gt.N
    K = law.spec.K
    kinds = [0, 4, 1, 5, 2, 4, 3, 6] if K > 0 else [0, 1, 2, 3]
    ar = np.arange(n)
    acc = 0
    for st in range(steps):
        kind = kinds[st % len(kinds)]
        new_chain = [None] * n
        if kind <= 3:
            fs, fc = L.xs.reshape(n, N * N).copy(), L.xc.reshape(n, N * N).copy()
            cell = rng.integers(0, N * N, n)
            if kind in (0, 1):
                fs[ar, cell] = rng.integers(0, gt.S, n, dtype=np.uint8)
            if kind in (0, 2):
                fc[ar, cell] = rng.integers(0, gt.C, n, dtype=np.uint8)
            if kind == 3:
                other = rng.integers(0, N * N, n)
                fs[ar, cell], fs[ar, other] = L.xs.reshape(n, N * N)[ar, other], L.xs.reshape(n, N * N)[ar, cell]
                fc[ar, cell], fc[ar, other] = L.xc.reshape(n, N * N)[ar, other], L.xc.reshape(n, N * N)[ar, cell]
            pxs, pxc = fs.reshape(n, N, N), fc.reshape(n, N, N)
            pk, pidx = L.kk, L.idx
            changed = np.flatnonzero((pxs != L.xs).any((1, 2)) | (pxc != L.xc).any((1, 2)))
            for i in changed:
                new_chain[i] = L._chain(Grid(pxs[i], pxc[i]), pidx[i], int(pk[i]))
        else:
            pxs, pxc = L.xs, L.xc
            pk, pidx = L.kk.copy(), L.idx.copy()
            if kind == 4:      # redraw one slot (among the active ones when k > 0)
                kmax = np.maximum(L.kk.astype(int), 1)
                j = (rng.random(n) * kmax).astype(int)
                pidx[ar, j] = law.draw_progs(rng, n)
                changed = np.flatnonzero((j < L.kk) & (pidx[ar, j] != L.idx[ar, j]))
                for i in changed:
                    new_chain[i] = L._chain(None, pidx[i], int(pk[i]), start=L.chains[i], j0=int(j[i]))
            elif kind == 5:    # redraw k
                pk = law.draw_k(rng, n)
                changed = np.flatnonzero(pk != L.kk)
                for i in changed:
                    k0, k1 = int(L.kk[i]), int(pk[i])
                    if k1 < k0:
                        new_chain[i] = L.chains[i][:k1 + 1]
                    else:
                        new_chain[i] = L._chain(None, pidx[i], k1, start=L.chains[i], j0=k0)
            else:              # swap two slots
                a = rng.integers(0, K, n)
                b = rng.integers(0, K, n)
                pidx[ar, a], pidx[ar, b] = L.idx[ar, b], L.idx[ar, a]
                lo = np.minimum(a, b)
                changed = np.flatnonzero((lo < L.kk) & (pidx[ar, lo] != L.idx[ar, lo]))
                for i in changed:
                    new_chain[i] = L._chain(None, pidx[i], int(pk[i]), start=L.chains[i], j0=int(lo[i]))
        if len(changed) == 0:
            if kind >= 4:      # auxiliary-only changes are always accepted
                L.kk[:], L.idx[:] = pk, pidx
            acc += n
            continue
        ys = np.stack([new_chain[i][-1].sym for i in changed])
        yc = np.stack([new_chain[i][-1].col for i in changed])
        pv = score(ys, yc)
        ok = pv >= level
        okc = changed[ok]
        # unchanged particles (outputs identical) are accepted trivially
        same = np.ones(n, bool)
        same[changed] = False
        upd = np.concatenate([np.flatnonzero(same), okc])
        if kind <= 3:
            L.xs[upd], L.xc[upd] = pxs[upd], pxc[upd]
        else:
            L.kk[upd], L.idx[upd] = pk[upd], pidx[upd]
        for t_, i in enumerate(changed):
            if ok[t_]:
                L.chains[i] = new_chain[i]
        L.ys[okc], L.yc[okc], vals[okc] = ys[ok], yc[ok], pv[ok]
        acc += int(len(upd))
    return acc / max(1, n * steps)


# ------------------------------------------------------------------------------------------------
# pools (body Monte Carlo, shared by every family of a GridType) and splitting
# ------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class LBudget:
    n_pool: int = 1 << 16
    min_count: int = 128
    n_particles: int = 1000
    p0: float = 0.5
    sweeps: float = 0.75        # cell moves per stage ≈ sweeps·N² (program moves are interleaved 1:1)
    target_bits: float = 64.0
    max_stages: int = 300
    max_stuck: int = 3


DEFAULT_LBUDGET = LBudget()
_POOLS: dict = {}


def _save(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "wb") as fh:
        pickle.dump(obj, fh, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, path)


def pool(gtype: GridType, spec, n: int = DEFAULT_LBUDGET.n_pool, salt: str = "", law=None) -> Latent:
    """n latent samples from π (deterministic, cached on disk without chains)."""
    law = law or program_law(gtype, spec)
    tag = hashlib.sha256(f"{law.tag}|pool|{n}|{salt}".encode()).hexdigest()
    if tag in _POOLS:
        return _POOLS[tag]
    path = CACHE / "pools" / f"{tag[:32]}.pkl"
    rng = np.random.default_rng(int(tag[:16], 16))
    if path.exists():
        with open(path, "rb") as fh:
            d = pickle.load(fh)
        L = Latent.__new__(Latent)
        L.law, L.gt = law, gtype
        for k_, v in d.items():
            setattr(L, k_, v)
        L.chains = None           # rebuilt lazily for the particles that need them
    else:
        L = Latent.sample(law, rng, n)
        L.chains = None
        _save(path, {k_: getattr(L, k_) for k_ in ("xs", "xc", "kk", "idx", "ys", "yc")})
    _POOLS[tag] = L
    return L


def _particles_from_pool(P: Latent, sel: np.ndarray) -> Latent:
    out = Latent.__new__(Latent)
    out.law, out.gt = P.law, P.gt
    out.xs, out.xc, out.kk, out.idx = P.xs[sel].copy(), P.xc[sel].copy(), P.kk[sel].copy(), P.idx[sel].copy()
    out.ys, out.yc = P.ys[sel].copy(), P.yc[sel].copy()
    out.chains = [out._chain(Grid(out.xs[i], out.xc[i]), out.idx[i], int(out.kk[i])) for i in range(len(sel))]
    return out


def _pick_level(vals, level, p0):
    above = vals[vals > level]
    if above.size == 0:
        return None, None, None
    w = np.unique(above)
    frac = (vals[None, :] >= w[:, None]).mean(axis=1) if w.size <= 4096 else np.array([(vals >= x).mean() for x in w])
    k = int(np.argmin(np.abs(np.log(frac) - math.log(p0))))
    return w, frac, k


def split_latent(score, L: Latent, vals, level, log2_level, var_level, rng, budget: LBudget):
    n, N = len(vals), L.gt.N
    steps = max(8, int(math.ceil(2 * budget.sweeps * N * N)))
    out_l, out_p, out_v = [], [], []
    stuck = 0
    acc_hist = []
    for _ in range(budget.max_stages):
        if -log2_level >= budget.target_bits:
            break
        w, frac, k = _pick_level(vals, level, budget.p0)
        if w is None:
            stuck += 1
            if stuck > budget.max_stuck:
                break
            acc_hist.append(mcmc_latent(score, L, vals, level, rng, steps * 2))
            continue
        stuck = 0
        for j in range(k + 1):
            fj = float(frac[j])
            out_l.append(w[j])
            out_p.append(log2_level + math.log2(fj))
            out_v.append(var_level + (1 - fj) / (fj * n) / LN2 ** 2)
        f = float(frac[k])
        log2_level += math.log2(f)
        var_level += (1 - f) / (f * n) / LN2 ** 2
        level = w[k]
        alive = np.flatnonzero(vals >= level)
        dead = np.flatnonzero(vals < level)
        if dead.size:
            src = alive[rng.integers(0, alive.size, dead.size)]
            L.copy_from(dead, src)
            vals[dead] = vals[src]
        acc_hist.append(mcmc_latent(score, L, vals, level, rng, steps))
    wv = np.unique(vals[vals > level])
    for x in wv:
        fj = float((vals >= x).mean())
        out_l.append(x)
        out_p.append(log2_level + math.log2(fj))
        out_v.append(var_level + (1 - fj) / (fj * n) / LN2 ** 2)
    return out_l, out_p, out_v, (level, log2_level, acc_hist)


def recipe_summary(L: Latent, vals: np.ndarray, top: int = 3) -> dict:
    """What the deepest particles are made of: share with k >= 1 and the commonest programs."""
    from collections import Counter
    hi = vals >= vals.max()
    c = Counter()
    for i in np.flatnonzero(hi):
        for j in range(int(L.kk[i])):
            c[int(L.idx[i, j])] += 1
    gt = L.gt
    return {"share_k_ge1": float((L.kk[hi] >= 1).mean()) if hi.any() else 0.0,
            "mean_k": float(L.kk.mean()),
            "top_programs": [(L.law.progs[p].describe(gt), round(float(L.law.costs[p]), 1), n_)
                             for p, n_ in c.most_common(top)]}


def build_table(draw: Draw, gtype: GridType, spec, budget: LBudget = DEFAULT_LBUDGET, salt: str = "",
                law: Optional[ProgramLaw] = None) -> cal.Survival:
    """Survival table of `draw` under the code prior `spec`, by latent-space splitting (no caching).
    `law` overrides the library-derived program law (validation toys)."""
    t0 = time.perf_counter()
    law = law or program_law(gtype, spec)
    spec = law.spec
    skey = cal.seed_key(draw, gtype)
    rng = np.random.default_rng(int(hashlib.sha256(f"{skey}|{law.tag}|{salt}".encode()).hexdigest()[:16], 16))
    params = cal.canonical_params(draw, gtype)
    f = draw.family
    score = lambda s, c: f.evaluate_batch(s, c, params, gtype)
    P = pool(gtype, spec, budget.n_pool, salt=salt, law=law)
    V = np.asarray(score(P.ys, P.yc), np.int64)
    n = len(V)
    w, counts = np.unique(V, return_counts=True)
    tc = np.cumsum(counts[::-1])[::-1]
    p = tc / n
    body = tc >= budget.min_count
    levels = list(w[body])
    log2p = list(np.log2(p[body]))
    var = list(((1 - p[body]) / (p[body] * n)) / LN2 ** 2)
    l0 = w[int(np.flatnonzero(body)[-1])]
    body_bits = -float(log2p[-1])
    idx = np.flatnonzero(V >= l0)
    m = budget.n_particles
    pick = rng.choice(idx, m, replace=False) if idx.size >= m else idx[rng.integers(0, idx.size, m)]
    L = _particles_from_pool(P, pick)
    vals = V[pick].copy()
    if idx.size < m:
        mcmc_latent(score, L, vals, l0, rng, 2 * gtype.N * gtype.N)
    tl, tp, tv, fin = split_latent(score, L, vals, l0, float(log2p[-1]), float(var[-1]), rng, budget)
    levels += tl
    log2p += tp
    var += tv
    extra, top = [], None
    if f.exemplar is not None:
        try:
            top = int(f.ordinal(f.exemplar(params, gtype), params, gtype))
            extra.append(top)
        except Exception:
            pass
    lv = np.asarray(levels, np.int64)
    order = np.argsort(lv, kind="stable")
    lv, lp, se = lv[order], np.asarray(log2p)[order], np.sqrt(np.asarray(var)[order])
    keep = np.r_[lv[1:] != lv[:-1], True]
    lv, lp, se = lv[keep], lp[keep], se[keep]
    se = np.where(np.arange(len(lv)) <= int(np.searchsorted(lv, l0)), se, se * cal.SE_INFLATION)
    meta = {"family": f.id, "gtype": gtype.key, "prior": spec.name, "spec": spec.key, "latent": LATENT_VERSION,
            "body_bits": body_bits, "body_top": int(l0),
            "stopped_early": bool(-fin[1] < budget.target_bits),
            "top_reached": None if top is None else bool(top <= int(lv.max())),
            "acc_mean": float(np.mean(fin[2])) if fin[2] else float("nan"),
            "acc_min": float(np.min(fin[2])) if fin[2] else float("nan"),
            "recipe": recipe_summary(L, vals), "seconds": time.perf_counter() - t0,
            "q": law.q.tolist(), "ess": law.ess, "Z": law.Z}
    key = hashlib.sha256(f"{cal.cache_key(draw, gtype)}|{law.tag}|{asdict(budget)}|{salt}".encode()).hexdigest()
    return cal.Survival(key, lv, lp, se, extra, meta)


# ------------------------------------------------------------------------------------------------
# cached public API
# ------------------------------------------------------------------------------------------------
_MEM: dict = {}


def table_key(draw: Draw, gtype: GridType, spec, budget: LBudget = DEFAULT_LBUDGET) -> str:
    law = program_law(gtype, spec)
    return hashlib.sha256(f"{cal.cache_key(draw, gtype)}|{law.tag}|{asdict(budget)}".encode()).hexdigest()


def survival(draw: Draw, gtype: GridType, spec, budget: LBudget = DEFAULT_LBUDGET) -> cal.Survival:
    """Survival table under prior `spec` (a PriorSpec or a name in SPECS). Uniform -> the engine's table."""
    spec = get_spec(spec)
    if spec.is_uniform:
        return cal.survival(draw, gtype)
    key = table_key(draw, gtype, spec, budget)
    if key in _MEM:
        return _MEM[key]
    path = CACHE / "tables" / key[:2] / f"{key}.pkl"
    if path.exists():
        try:
            with open(path, "rb") as fh:
                t = cal.Survival.from_dict(pickle.load(fh))
            t = patch_top(t, draw, gtype, spec, budget)
            _MEM[key] = t
            return t
        except Exception:
            pass
    t = build_table(draw, gtype, spec, budget)
    t.key = key
    _save(path, t.to_dict())
    t = patch_top(t, draw, gtype, spec, budget)
    _MEM[key] = t
    return t


PATCH_VERSION = 1


def patch_top(t: cal.Survival, draw: Draw, gtype: GridType, spec, budget: LBudget = DEFAULT_LBUDGET) -> cal.Survival:
    """Fix the top of a table where splitting cannot climb (all-or-nothing rules such as Picture Frame):
      * pool values above every level with >= 8 hits become Monte Carlo levels (count / n_pool);
      * if the family's best ordinal is still above every level and the uniform tail is exact, it gets
        min(s_μ(top) - log2 q0, max(s_last + 1, log2(n_pool / 3))): the mixture bound
        ρ >= q0·μ caps it, and zero hits in n_pool samples make p > 3/n implausible (95%).
    Deterministic; applied when a table is served (cached tables stay as estimated)."""
    law = program_law(gtype, spec)
    P = pool(gtype, spec, budget.n_pool)
    params = cal.canonical_params(draw, gtype)
    f = draw.family
    V = np.asarray(f.evaluate_batch(P.ys, P.yc, params, gtype), np.int64)
    n = len(V)
    lv, lp, se = list(t.levels), list(t.log2p), list(t.stderr_bits)
    w, c = np.unique(V[V > t.levels[-1]], return_counts=True)
    tc = np.cumsum(c[::-1])[::-1]
    added = 0
    for x, k in zip(w, tc):
        if k >= 8:
            lv.append(int(x))
            lp.append(min(lp[-1], math.log2(k / n)))
            se.append(math.sqrt((1 - k / n) / k) / LN2)
            added += 1
    meta = dict(t.meta, patch=PATCH_VERSION, patched_levels=added)
    top = None
    if f.exemplar is not None:
        try:
            top = int(f.ordinal(f.exemplar(params, gtype), params, gtype))
        except Exception:
            top = None
    if top is not None and top > lv[-1] and f.exact_log2_tail is not None:
        su = -float(f.exact_log2_tail(top, params, gtype))
        bits = min(su - math.log2(law.q[0]), max(-lp[-1] + 1, math.log2(n / 3)))
        lv.append(top)
        lp.append(min(lp[-1], -bits))
        se.append(float("nan"))
        meta["top_bounded"] = True
    if len(lv) == len(t.levels):
        return t
    return cal.Survival(t.key, lv, lp, se, t.extra_levels, meta)


_JOBS: list = []


def _job(i):
    d, gt, spec, b = _JOBS[i]
    t = survival(d, gt, spec, b)
    return i, t.meta.get("seconds", 0.0)


def precompute(draws: Sequence[Draw], gtype: GridType, spec, processes: int = 4,
               budget: LBudget = DEFAULT_LBUDGET, verbose: bool = False) -> int:
    """Build missing tables in a fork pool. Returns the number built."""
    import multiprocessing as mp
    global _JOBS
    spec = get_spec(spec)
    if spec.is_uniform:
        cal.precompute(list(draws), gtype, processes=processes)
        return 0
    pool(gtype, spec, budget.n_pool)       # build the shared pool once, before forking
    seen, jobs = set(), []
    for d in draws:
        k = table_key(d, gtype, spec, budget)
        if k in seen or k in _MEM or (CACHE / "tables" / k[:2] / f"{k}.pkl").exists():
            continue
        seen.add(k)
        jobs.append((d, gtype, spec, budget))
    if not jobs:
        return 0
    _JOBS = jobs
    t0 = time.perf_counter()
    if processes > 1 and len(jobs) > 1:
        with mp.get_context("fork").Pool(processes) as p:
            for j, (i, s) in enumerate(p.imap_unordered(_job, range(len(jobs)))):
                if verbose and (j + 1) % 10 == 0:
                    print(f"    [{spec.name} {gtype.key}] {j + 1}/{len(jobs)} tables ({time.perf_counter() - t0:.0f}s)",
                          flush=True)
    else:
        for i in range(len(jobs)):
            _job(i)
    _JOBS = []
    return len(jobs)
