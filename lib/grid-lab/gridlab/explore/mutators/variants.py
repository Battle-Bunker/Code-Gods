"""Cost-knob presets and mutator variants for the landscape probe and the validation games.

Nothing in the shared modules is edited. A preset is
  {"knobs": COST_KNOBS overrides, "variant": name of a mutator-set variant (or None)}.
`install_preset(name)` resets COST_KNOBS to its import-time defaults, applies the overrides, and
installs the variant by swapping Mutator objects in gridlab.mutators (MUTATORS, _BY_ID, the
availability cache). The knobs carry an "explore_variant" tag so every program-cost cache and the
policy program library (both keyed by the COST_KNOBS JSON) see a different key per preset.

Presets are filled in as the study goes (see docs/explore/mutators.md).
"""
from __future__ import annotations

import copy
import hashlib
import json

from ... import mutators as MU

_DEFAULT_KNOBS = copy.deepcopy(MU.COST_KNOBS)
_DEFAULT_MUTATORS = list(MU.MUTATORS)

VARIANTS: dict = {}          # name -> function(list[Mutator]) -> list[Mutator]
PRESETS: dict = {
    "default": {"knobs": {}, "variant": None},
}


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _set_mutators(ms: list) -> None:
    MU.MUTATORS[:] = ms
    MU._BY_ID.clear()
    MU._BY_ID.update({m.id: m for m in ms})
    MU._available.cache_clear()


def preset_tag(name: str) -> str:
    spec = PRESETS[name]
    h = hashlib.sha256(json.dumps(spec, sort_keys=True, default=str).encode())
    import inspect
    for v in _variant_list(spec):  # the variants' own source (edits elsewhere in this file do not re-key)
        fn = VARIANTS[v]
        h.update(inspect.getsource(fn).encode())
        for dep in getattr(fn, "deps", ()):
            if isinstance(dep, str):
                h.update(dep.encode())
            elif callable(dep) or inspect.ismodule(dep):
                h.update(inspect.getsource(dep).encode())
            else:
                h.update(json.dumps(dep, sort_keys=True, default=str).encode())
    return h.hexdigest()[:16]


def install_preset(name: str) -> None:
    spec = PRESETS[name]
    knobs = _merge(_DEFAULT_KNOBS, spec.get("knobs", {}))
    if name != "default":
        knobs["explore_variant"] = f"{name}:{preset_tag(name)}"
    MU.COST_KNOBS.clear()
    MU.COST_KNOBS.update(knobs)
    ms = list(_DEFAULT_MUTATORS)
    _unpatch_program()
    for v in _variant_list(spec):
        ms = VARIANTS[v](ms)
    _set_mutators(ms)


def _variant_list(spec) -> list:
    v = spec.get("variant")
    return [] if not v else ([v] if isinstance(v, str) else list(v))


# program-level patches (Program.ratchet_bits), undone by every install_preset
from ... import program as PG  # noqa: E402
_ORIG_RATCHET = PG.Program.ratchet_bits


def _unpatch_program() -> None:
    PG.Program.ratchet_bits = _ORIG_RATCHET


def setting_for(name: str, base: dict | None = None) -> dict:
    """An experiments.common setting dict for a preset (the knobs, tagged)."""
    from ...experiments.common import BASE, merge
    st = merge(base or BASE, {})
    install_preset(name)
    st["knobs"] = {k: v for k, v in MU.COST_KNOBS.items()}
    st["explore_preset"] = name
    install_preset("default")
    return st


# ================================================================================================
# Variant "structured": erasure and motion priced at a mixture of the prior and game-like states
# ================================================================================================
# docs/mutators.md §6.4: E is computed at the prior μ, but agents act on structured objects. Under a
# uniform prior, Shannon erasure equals the mean POINTWISE erasure e(x) = log2 |f^{-1}(f(x))|, so the
# natural state-dependent price is E_ρ = E_{x~ρ}[e(x)] with ρ = (1-w)·μ + w·ν, ν a reference pool of
# structured states (exemplars of every family, lightly perturbed, plus objects seen in simulated
# games). For unconditional overwrites (paint, write, motif, fold, ...) e(x) is constant, so nothing
# changes. For conditional maps it is:
#   recolour a->b   1 bit per region cell that is a or b
#   stamp k->s      log2 S per region cell of colour k
#   tally X         log2 S per region cell not X
#   blend a+b->ch   log2(C-2) per region cell touching both parents and not a parent
#   sort_line       log2 multinomial(counts of the line)
# The motion term likewise uses the expected cells changed under ρ (bijections included: a global
# colour swap moves 2n/C cells at the prior but all n cells of a two-colour jackpot).
STRUCT_W = {"w": 0.5, "pool": 192}
_REF: dict = {}
_SCACHE: dict = {}


def reference_pool(gt):
    k = (gt, STRUCT_W["pool"])
    if k not in _REF:
        import numpy as np
        from . import states as ST
        n = STRUCT_W["pool"]
        fs, fc = ST.foreign(gt, n // 2)
        try:
            ms, mc = ST.midgame(gt)
            pick = ST.rng_of("refpool", gt.key).permutation(len(ms))[:n - n // 2]
            ms, mc = ms[pick], mc[pick]
        except Exception:
            ms, mc = ST.foreign(gt, n - n // 2)
        _REF[k] = (np.concatenate([fs, ms]), np.concatenate([fc, mc]))
    return _REF[k]


def _pointwise_erasure(mid, p, gt, S, Cc):
    import math
    import numpy as np
    from ...mutators import region_mask, resolve_mask, _neigh_has, line_scores
    from ...core import Grid
    B = len(S)
    if mid == "recolour":
        a, b = p["pair"]
        out = np.empty(B)
        for i in range(B):
            m = resolve_mask(p, gt, Grid(S[i], Cc[i]), lambda x: line_scores(x.col == b))
            out[i] = float((m & ((Cc[i] == a) | (Cc[i] == b))).sum())
        return out
    if mid == "stamp":
        m = region_mask(p["kind"], p["region"], gt.N)
        return (Cc[:, m] == p["colour"]).sum(1) * math.log2(gt.S)
    if mid == "tally":
        m = region_mask(p["kind"], p["region"], gt.N)
        return (Cc[:, m] != p["colour"]).sum(1) * math.log2(gt.S)
    if mid == "blend":
        a, b, ch = p["recipe"]
        m = region_mask(p["kind"], p["region"], gt.N)
        out = np.empty(B)
        for i in range(B):
            c = Cc[i]
            q = m & (c != a) & (c != b) & _neigh_has(c, a) & _neigh_has(c, b)
            out[i] = q.sum() * math.log2(max(gt.C - 2, 2))
        return out
    if mid == "sort_line":
        ax, li = p["line"]
        out = np.empty(B)
        for i in range(B):
            s = S[i][li, :] if ax == 0 else S[i][:, li]
            c = Cc[i][li, :] if ax == 0 else Cc[i][:, li]
            key = s.astype(np.int64) * gt.C + c
            _, cnt = np.unique(key, return_counts=True)
            out[i] = (math.lgamma(len(key) + 1) - sum(math.lgamma(x + 1) for x in cnt)) / math.log(2)
        return out
    return None


def _structured_stats(m, p, gt):
    """(mean pointwise erasure or None, mean colour cells changed, mean symbol cells changed) on ν."""
    import numpy as np
    from ...core import Grid
    key = (m.id, repr(sorted(p.items(), key=str)), gt)
    if key not in _SCACHE:
        S, Cc = reference_pool(gt)
        dc = ds = 0.0
        for i in range(len(S)):
            y = m.apply_fn(Grid(S[i], Cc[i]), p, gt)
            if y is not None:
                dc += float((y.col != Cc[i]).sum())
                ds += float((y.sym != S[i]).sum())
        e = _pointwise_erasure(m.id, p, gt, S, Cc)
        _SCACHE[key] = (None if e is None else float(np.mean(e)), dc / len(S), ds / len(S))
    return _SCACHE[key]


def _structured_variant(ms: list) -> list:
    import dataclasses
    from ...mutators import Terms
    w = STRUCT_W["w"]
    out = []
    for m in ms:
        def tf(p, gt, _m=m, _f=m.terms_fn):
            t = _f(p, gt)
            e_nu, dc_nu, ds_nu = _structured_stats(_m, p, gt)
            e = t.erase if e_nu is None else (1 - w) * t.erase + w * e_nu
            if _m.layer == "suit":       # suit changes are counted in dsym by the base terms; keep them
                return Terms(erase=e, dcol=t.dcol, dsym=t.dsym, measure=t.measure, scope=t.scope)
            return Terms(erase=e, dcol=(1 - w) * t.dcol + w * dc_nu, dsym=(1 - w) * t.dsym + w * ds_nu,
                         measure=t.measure, scope=t.scope)
        out.append(dataclasses.replace(m, terms_fn=tf))
    return out


_structured_variant.deps = (_pointwise_erasure, _structured_stats, reference_pool, STRUCT_W)
VARIANTS["structured"] = _structured_variant
PRESETS["structured"] = {"knobs": {}, "variant": "structured"}


# ================================================================================================
# Knob presets screened with reprice.py (single-step, exact) before full landscape / game runs
# ================================================================================================
def _kp(name, **knobs):
    PRESETS[name] = {"knobs": knobs, "variant": None}


_kp("move0.7", move=0.7)
_kp("move1.0", move=1.0)
_kp("move1.5", move=1.5)
_kp("step0.5", step_base=0.5)
_kp("step0.25", step_base=0.25)
_kp("agent0", agent_base=0.0)
_kp("global1.25", scope={"global": 1.25})
_kp("global1.5", scope={"global": 1.5})
_kp("bij1.5", kind={"bijective": 1.5})
_kp("bij2", kind={"bijective": 2.0})
_kp("hartley", erasure="hartley")
_kp("describe0.5", describe=0.5)
_kp("erase0.8", erase=0.8)
_kp("erase1.25", erase=1.25)


# ================================================================================================
# Variant "composite": price a multi-step program's erasure as a whole
# ================================================================================================
# The program cost adds per-step erasures computed at the prior. A later conditional step runs on the
# earlier step's OUTPUT, not on the prior: "paint the whole grid green, then stamp 1 on every green cell"
# is a constant fill of both layers (133 bits of erasure at Grid(5,base10,rgby)) but is priced
# 50 + 25/4·log2 10 = 71 bits; write-all alone costs more (83). The landscape finds this route as the
# best one for Lucky Token, Seed 3, Number Painter, Treasure Map, Knight Riders (yield 1.25 vs median 0.42).
# Fix: a program pays at least the cells it pins in ONE application (the same pinned-bits probe that the
# ratchet surcharge uses for the closure): surcharge = max(0, pinned(P(x)) - Σ_steps E_step). For one
# unguarded step pinned <= E, so single steps are unchanged; guards lower the pin rate and are spared.
def _composite_ratchet(self, gt):
    base = _ORIG_RATCHET(self, gt)
    if len(self.steps) < 2:
        return base
    probes = PG._probe_grids(gt)
    one = [self.run(x, gt) for x in probes]
    pinned = PG._pinned_bits(one, gt)
    e = sum(s.mutator.terms(s.params, gt)["erase"] for s in self.steps)
    return base + max(0.0, pinned - e) / max(MU.COST_KNOBS.get("ratchet", 1.0), 1e-9)


def _composite_variant(ms: list) -> list:
    PG.Program.ratchet_bits = _composite_ratchet
    return ms


_composite_variant.deps = (_composite_ratchet,)
VARIANTS["composite"] = _composite_variant
PRESETS["composite"] = {"knobs": {}, "variant": ["composite"]}


# ================================================================================================
# Variant "worstmove": bijections pay motion for the most they can move, not the prior average
# ================================================================================================
# A bijection erases nothing, so motion is its only substantive price. At the prior a global colour
# swap moves 2n/C cells; on the jackpots it is bought to steal (a monochrome Conqueror grid) it moves all
# n. Pricing motion at the worst case over the GridType's states (Hartley-style, like
# COST_KNOBS["erasure"]="hartley" does for erasure) charges theft what it can do. Computed as the max
# over a probe pool (prior spawns + structured reference pool + constant grids) of cells changed.
def _worst_pool(gt):
    import numpy as np
    from ...core import spawn_batch
    k = ("worst", gt)
    if k not in _REF:
        S, C = reference_pool(gt)
        s2, c2 = spawn_batch(gt, np.random.default_rng(5), 64)
        cs = np.array([np.full((gt.N, gt.N), v % gt.S, S.dtype) for v in range(gt.C * 2)])
        cc = np.array([np.full((gt.N, gt.N), v % gt.C, C.dtype) for v in range(gt.C * 2)])
        # two-colour halves (stripe/feud-like jackpots)
        r = np.indices((gt.N, gt.N))[0]
        hc = np.array([np.where(r < gt.N // 2, a, b).astype(C.dtype) for a in range(gt.C) for b in range(gt.C) if a != b])
        hs = np.array([np.where(r < gt.N // 2, a, b).astype(S.dtype) for a in range(min(gt.S, 4)) for b in range(min(gt.S, 4)) if a != b])
        n = min(len(hc), len(hs))
        _REF[k] = (np.concatenate([S, s2, cs, hs[:n]]), np.concatenate([C, c2, cc, hc[:n]]))
    return _REF[k]


_WCACHE: dict = {}


def _worst_changed(m, p, gt):
    from ...core import Grid
    key = (m.id, repr(sorted(p.items(), key=str)), gt)
    if key not in _WCACHE:
        S, C = _worst_pool(gt)
        dc = ds = 0.0
        for a, b in zip(S, C):
            y = m.apply_fn(Grid(a, b), p, gt)
            if y is not None:
                dc = max(dc, float((y.col != b).sum()))
                ds = max(ds, float((y.sym != a).sum()))
        _WCACHE[key] = (dc, ds)
    return _WCACHE[key]


def _worstmove_variant(ms: list) -> list:
    import dataclasses
    from ...mutators import Terms
    out = []
    for m in ms:
        if not m.bijective:
            out.append(m)
            continue

        def tf(p, gt, _m=m, _f=m.terms_fn):
            t = _f(p, gt)
            dc, ds = _worst_changed(_m, p, gt)
            return Terms(erase=t.erase, dcol=max(t.dcol, dc), dsym=max(t.dsym, ds), measure=t.measure, scope=t.scope)
        out.append(dataclasses.replace(m, terms_fn=tf))
    return out


_worstmove_variant.deps = (_worst_pool, _worst_changed, reference_pool)
VARIANTS["worstmove"] = _worstmove_variant
PRESETS["worstmove"] = {"knobs": {}, "variant": ["worstmove"]}


# ================================================================================================
# Variant "extra": the candidate mutators of newmuts.py (tile, unclash, crown, balance)
# ================================================================================================
def _extra_variant(ms: list, which=("tile", "unclash", "crown", "balance")) -> list:
    from .newmuts import NEW_MUTATORS
    have = {m.id for m in ms}
    return ms + [NEW_MUTATORS[k] for k in which if k not in have]


from . import newmuts as _NM  # noqa: E402
_extra_variant.deps = (_NM,)
VARIANTS["extra"] = _extra_variant
PRESETS["extra"] = {"knobs": {}, "variant": ["extra"]}
PRESETS["composite+worstmove"] = {"knobs": {}, "variant": ["composite", "worstmove"]}
PRESETS["full"] = {"knobs": {}, "variant": ["extra", "composite", "worstmove"]}


# full proposal + scope/move knob variants (screened with reprice.py --base full)
for _g in (1.25, 1.5):
    PRESETS[f"full+global{_g}"] = {"knobs": {"scope": {"global": _g}}, "variant": ["extra", "composite", "worstmove"]}
for _m in (0.7, 1.0):
    PRESETS[f"full+move{_m}"] = {"knobs": {"move": _m}, "variant": ["extra", "composite", "worstmove"]}
