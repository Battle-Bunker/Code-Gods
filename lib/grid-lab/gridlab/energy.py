"""Per-agent energy economy: the summon / per-act split of Program.cost and the pointwise cost of one act.

Design (docs/agent-energy.md has the derivation and the results):

* **Summon** pays the *description* part of an agent's price, `summon_bits(P)` = agent base + every
  step's tool naming and parameter description + the guard's kind and description + the ratchet
  surcharge, all after the scope/kind multipliers. It is what it costs to write the program down.
* **Each act** pays the *runtime* part: decision (measurement) + erasure + motion. `analytic_act_bits(P)`
  is the expected value today's price formula assigns to it, so summon_bits + analytic_act_bits = cost.
* The **pointwise** cost of one act on one object, `act(P, x)`, has expectation equal to those terms
  over the prior (verified by tests/test_agent_energy.py):

  - decision = −log2 p(a), the self-information of the action a taken. For the guard, a = pass/fail with
    p from the analytic pass rate q (expectation H_b(q), today's guard term). For a relative-target
    (line*) step, a = the line selected, with p estimated on REF reference spawns by add-½
    (Krichevsky–Trofimov) smoothing over the 2N lines, so an unseen line costs log2((REF + N)/½),
    not infinity. Expectation: the plug-in entropy of the selection, ≤ today's log2 2N.
  - erasure = log2 |f⁻¹(f(x))|, the size of the preimage of the result given the action, under the uniform
    prior. For a deterministic f and uniform X, E[log2 |f⁻¹(f(X))|] = H(X | f(X)) = H(X) − H(f(X)), which
    is exactly the Shannon erasure the price formula uses, so the pointwise version is unbiased by
    construction. Constant overwrites (paint, write, pattern, motif, fold, key, suit_set) erase the same
    bits on every input; data-dependent maps erase what they actually merge (recolour: 1 bit per
    output-B cell; stamp/tally: the symbol bits of the cells they rewrite; sort: log2 of the multinomial
    of the line's multiset; majority: log2 #lines with that plurality; blend: log2(C−2) per eligible
    cell; flatten: log2(h^n − (h−1)^n) for n lowered cells and h = hi − lo).
  - motion = move · (b_col · Ē_col · d_col(x) + b_sym · Ē_sym · d_sym(x)) / N², with d the cells this act
    actually changed in each layer and Ē the price formula's expected count. Thermodynamic length: the
    dissipation of a protocol is its speed times the distance it actually travels, and the speed
    (Ē/N², how much of the object the program is built to move) is fixed by the program. Linear in
    d(x), so E[motion] = move · b · Ē² / N², today's quadratic term.

  All terms carry the step's scope/kind multiplier and the COST_KNOBS weights, as in Mutator.cost.
* **Failed or no-op acts** (guard false, nothing changed, or rejected as a duplicate) pay the decision
  bits only.
* `ActProfile.expected` is the expected charge per act at the prior under those rules: H_b(q) +
  q · mean over REF reference spawns of (line* bits + erasure + motion if the steps changed anything).
  The step part is measured with the guard ignored (an approximation for guards correlated with the
  steps). It is the eligibility threshold and the policies' cost-per-act estimate.

Profiles are cached in memory per (program, GridType, knob fingerprint); `library_profiles` builds and
disk-caches them for a whole program library (the policies' candidate catalogue) in a fork pool.
"""
from __future__ import annotations

import hashlib
import json
import math
import multiprocessing as mp
import os
import pickle
import zlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

from .core import Grid, GridType, spawn
from . import mutators as mu
from .mutators import COST_KNOBS, line_scores, region_mask

REF = 96                  # reference spawns per GridType for the expected cost and the line* frequencies
KT = 0.5                  # add-½ smoothing of the line* selection frequencies
Q_FLOOR = 1e-9            # guard pass rates are clamped to [Q_FLOOR, 1 − Q_FLOOR]
ENERGY_VERSION = 1
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "energy"
log2 = math.log2


# ------------------------------------------------------------------------------------------------
# summon / act split of Program.cost
# ------------------------------------------------------------------------------------------------
def split_terms(prog, gt: GridType) -> tuple[float, float]:
    """(summon_bits, analytic_act_bits): the description and runtime parts of prog.cost(gt); they sum to it."""
    t = prog.cost_terms(gt)
    g = prog.guard.cost_terms(gt)
    desc = t["agent_base"] + t["ratchet"] + g["base"] + g["describe"]
    act = g["measure"]
    for st in prog.steps:
        m = st.mutator.terms(st.params, gt)
        desc += m["mult"] * (m["base"] + m["describe"])
        act += m["mult"] * (m["erase"] + m["move"] + m["measure"])
    return float(desc), float(act)


def naming_bits(prog, gt: GridType) -> float:
    """The description bits of what the program does (each step's tool naming + parameters, and the guard's
    kind + parameters), i.e. summon_bits minus the agent base and the ratchet surcharge. Charged again on
    every act as decision bits when GameConfig.agent_act_naming > 0 (an experimental variant)."""
    t = prog.cost_terms(gt)
    return split_terms(prog, gt)[0] - t["agent_base"] - t["ratchet"]


def summon_bits(prog, gt: GridType) -> float:
    return split_terms(prog, gt)[0]


def analytic_act_bits(prog, gt: GridType) -> float:
    return split_terms(prog, gt)[1]


# ------------------------------------------------------------------------------------------------
# pointwise pieces
# ------------------------------------------------------------------------------------------------
def _feature(mid: str, p: dict, gt: GridType):
    """The line-score feature a line* step maximises (mirrors mutators.py)."""
    if mid == "paint":
        k = p["colour"]
        return lambda x: line_scores(x.col == k)
    if mid == "recolour":
        b = p["pair"][1]
        return lambda x: line_scores(x.col == b)
    if mid == "write":
        s = p["symbol"]
        return lambda x: line_scores(x.sym == s)
    if mid == "majority_line":
        return mu._majority_feature(gt)
    raise ValueError(f"{mid} has no relative target")


def selection(step, g: Grid, gt: GridType) -> Optional[int]:
    """Index (rows 0..N-1, columns N..2N-1) of the line a line* step picks on g; None for absolute regions."""
    p = step.params
    if p.get("kind") != "line*":
        return None
    return int(np.argmax(_feature(step.mutator_id, p, gt)(g)))


def _mask(p: dict, gt: GridType, sel: Optional[int]) -> np.ndarray:
    if sel is not None:
        return mu.line_mask(sel, gt.N)
    if "kind" in p and p["kind"] in mu.REGION_SCOPE:
        return region_mask(p["kind"], p.get("region", ()), gt.N)
    if "line" in p and isinstance(p["line"], tuple):
        return region_mask("line", p["line"], gt.N)
    return region_mask("all", (), gt.N)


@lru_cache(maxsize=None)
def _plurality_counts(N: int, C: int) -> np.ndarray:
    """Number of the C^N lines whose plurality (lowest index wins ties) is each colour."""
    idx = np.arange(C ** N, dtype=np.int64)
    digits = np.stack([(idx // C ** t) % C for t in range(N)], axis=1)
    counts = np.stack([(digits == k).sum(1) for k in range(C)], axis=1)
    return np.bincount(counts.argmax(1), minlength=C).astype(np.float64)


@lru_cache(maxsize=None)
def _lgfact(n: int) -> float:
    return math.lgamma(n + 1) / math.log(2)


def pointwise_erasure(step, g: Grid, y: Grid, gt: GridType, sel: Optional[int] = None) -> float:
    """log2 |f⁻¹(y)| for one step f (given its action): bits of g destroyed in producing y. Unweighted
    (no knobs, no multipliers). In "hartley" erasure mode the analytic (worst-case) term is returned."""
    mid, p = step.mutator_id, step.params
    m = step.mutator
    if m.bijective:
        return 0.0
    if COST_KNOBS["erasure"] != "shannon":
        return float(m.terms_fn(p, gt).erase)
    if mid in ("paint", "pattern_line", "motif", "write", "write_ramp", "paint_by_key", "mirror_fold", "suit_set"):
        return float(m.terms_fn(p, gt).erase)   # constant overwrite: the same bits on every input
    mask = _mask(p, gt, sel)
    if mid == "recolour":
        return float((mask & (y.col == p["pair"][1])).sum())
    if mid == "stamp":
        return float((mask & (g.col == p["colour"])).sum()) * log2(gt.S)
    if mid == "tally":
        return float((mask & (g.col != p["colour"])).sum()) * log2(gt.S)
    if mid == "blend":
        a, b, _ = p["recipe"]
        el = mask & (g.col != a) & (g.col != b) & mu._neigh_has(g.col, a) & mu._neigh_has(g.col, b)
        return float(el.sum()) * mu._lg(gt.C - 2)
    if mid == "sort_line":
        ax, i = p["line"]
        s, c = mu._line_view(g.sym, ax, i).astype(np.int64), mu._line_view(g.col, ax, i).astype(np.int64)
        _, mult = np.unique(s * gt.C + c, return_counts=True)
        return _lgfact(gt.N) - sum(_lgfact(int(k)) for k in mult)
    if mid == "majority_line":
        k = int(y.col[mask][0])
        return log2(_plurality_counts(gt.N, gt.C)[k])
    if mid == "flatten":
        r = gt.rank[g.sym.astype(np.int64)]
        rr = r[mask]
        hi, lo = int(rr.max()), int(rr.min())
        n = int((mask & (r != hi)).sum())          # cells whose output rank is lo (incl. the original lows)
        h = hi - lo
        if n == 0 or h <= 0:
            return 0.0
        # preimage: ranks in [lo, hi) for those n cells, at least one of them equal to lo
        return n * log2(h) + (log2(1 - ((h - 1) / h) ** n) if h > 1 else 0.0)
    raise ValueError(f"no pointwise erasure for {mid}")


def pointwise_motion(step, g: Grid, y: Grid, gt: GridType) -> float:
    """(b_col · Ē_col · d_col + b_sym · Ē_sym · d_sym) / N² for this act (unweighted)."""
    t = step.mutator.terms_fn(step.params, gt)
    dc = int((y.col != g.col).sum()) if t.dcol else 0
    ds = int((y.sym != g.sym).sum()) if t.dsym else 0
    return (log2(gt.C) * t.dcol * dc + log2(gt.S) * t.dsym * ds) / gt.N ** 2


def _mult(step, gt: GridType) -> float:
    K = COST_KNOBS
    return K["scope"][step.mutator.scope_of(step.params, gt)] * K["kind"]["bijective" if step.mutator.bijective else "overwrite"]


# ------------------------------------------------------------------------------------------------
# profiles
# ------------------------------------------------------------------------------------------------
@dataclass
class ActProfile:
    expected: float          # expected charge per act at the prior (the eligibility threshold)
    q: float                 # guard pass rate (1 for unguarded)
    sel_bits: tuple          # per step: None, or an array of −log2 p(line) over the 2N lines (weighted)
    analytic: float          # today's per-application terms (for comparison)
    summon: float            # description bits
    p_change: float          # share of reference acts (guard ignored) that changed the object


_PROF: dict = {}
_REF: dict = {}


def _knob_fp() -> str:
    return json.dumps(COST_KNOBS, sort_keys=True, default=str)


def reference_grids(gt: GridType) -> list[Grid]:
    if gt not in _REF:
        rng = np.random.default_rng(zlib.crc32(("energy-ref:" + gt.key).encode()))
        _REF[gt] = [spawn(gt, rng) for _ in range(REF)]
    return _REF[gt]


def _steps_raw(prog, g: Grid, gt: GridType):
    """Run the steps (no guard) on g: (result, [selection per step], erasure, motion), weighted."""
    K = COST_KNOBS
    sels, er, mo = [], 0.0, 0.0
    x = g
    for st in prog.steps:
        sel = selection(st, x, gt)
        sels.append(sel)
        y = st.apply(x, gt)
        if y is not None:
            k = _mult(st, gt)
            er += k * K["erase"] * pointwise_erasure(st, x, y, gt, sel)
            mo += k * K["move"] * pointwise_motion(st, x, y, gt)
            x = y
    return x, sels, er, mo


def _build_profile(prog, gt: GridType) -> ActProfile:
    K = COST_KNOBS
    refs = reference_grids(gt)
    runs = [_steps_raw(prog, g, gt) for g in refs]
    nL = 2 * gt.N
    sel_bits = []
    for i, st in enumerate(prog.steps):
        if st.params.get("kind") != "line*":
            sel_bits.append(None)
            continue
        cnt = np.bincount([r[1][i] for r in runs], minlength=nL).astype(float)
        p = (cnt + KT) / (len(runs) + KT * nL)
        sel_bits.append(_mult(st, gt) * K["measure"] * -np.log2(p))
    q = 1.0 if prog.guard.kind is None else min(max(prog.guard.pass_rate(gt), Q_FLOOR), 1 - Q_FLOOR)
    tot, changed = 0.0, 0
    for g, (y, sels, er, mo) in zip(refs, runs):
        b = sum(float(sb[s]) for sb, s in zip(sel_bits, sels) if sb is not None)
        if y != g:
            b += er + mo
            changed += 1
        tot += b
    hb = 0.0 if q >= 1.0 else -(q * log2(q) + (1 - q) * log2(1 - q))
    summon, analytic = split_terms(prog, gt)
    return ActProfile(expected=float(K["measure"] * hb + q * tot / len(refs)), q=float(q),
                      sel_bits=tuple(sel_bits), analytic=analytic, summon=summon, p_change=changed / len(refs))


def profile(prog, gt: GridType) -> ActProfile:
    k = (prog.key, gt, _knob_fp())
    v = _PROF.get(k)
    if v is None:
        v = _PROF[k] = _build_profile(prog, gt)
    return v


# ------------------------------------------------------------------------------------------------
# one act
# ------------------------------------------------------------------------------------------------
def act(prog, g: Grid, gt: GridType, prof: Optional[ActProfile] = None) -> tuple[Optional[Grid], float, float, float]:
    """Apply prog to g once: (result or None, decision bits, erasure bits, motion bits), weighted.
    The caller charges decision always, and erasure + motion only if the result is committed."""
    prof = prof or profile(prog, gt)
    K = COST_KNOBS
    dec = 0.0
    if prog.guard.kind is not None:
        ok = prog.guard.check(g, gt)
        dec = K["measure"] * -log2(prof.q if ok else 1 - prof.q)
        if not ok:
            return None, dec, 0.0, 0.0
    y, sels, er, mo = _steps_raw(prog, g, gt)
    dec += sum(float(sb[s]) for sb, s in zip(prof.sel_bits, sels) if sb is not None)
    if y == g:
        return None, dec, 0.0, 0.0
    return y, dec, er, mo


# ------------------------------------------------------------------------------------------------
# library profiles (disk cache, fork pool)
# ------------------------------------------------------------------------------------------------
_LJOBS: list = []


def _lib_worker(rng_):
    lo, hi = rng_
    progs, gt = _LJOBS[0]
    return lo, [_build_profile(p, gt) for p in progs[lo:hi]]


def library_profiles(gt: GridType, progs: list, processes: int = 1, tag: str = "") -> list[ActProfile]:
    """Profiles for every program of a library, cached on disk by (tag, GridType, knobs, version) and
    registered in the in-memory cache so `profile` hits."""
    global _LJOBS
    key = hashlib.sha256(f"{tag}|{gt.key}|{len(progs)}|{_knob_fp()}|{ENERGY_VERSION}|{REF}".encode()).hexdigest()[:32]
    path = CACHE_DIR / f"{key}.pkl"
    out = None
    if path.exists():
        try:
            with open(path, "rb") as fh:
                out = pickle.load(fh)
        except Exception:
            out = None
    if out is None:
        if processes > 1:
            _LJOBS = [(progs, gt)]
            chunk = max(1, len(progs) // (processes * 8))
            parts = [(i, min(i + chunk, len(progs))) for i in range(0, len(progs), chunk)]
            out = [None] * len(progs)
            with mp.get_context("fork").Pool(processes) as pool:
                for lo, ps in pool.imap_unordered(_lib_worker, parts):
                    out[lo:lo + len(ps)] = ps
            _LJOBS = []
        else:
            out = [_build_profile(p, gt) for p in progs]
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(f".tmp{os.getpid()}")
            with open(tmp, "wb") as fh:
                pickle.dump(out, fh, protocol=pickle.HIGHEST_PROTOCOL)
            os.replace(tmp, path)
        except Exception:
            pass
    fp = _knob_fp()
    for p, pr in zip(progs, out):
        _PROF[(p.key, gt, fp)] = pr
    return out
