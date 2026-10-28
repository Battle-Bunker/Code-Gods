"""cost(program, gtype) = description bits + decision bits + destruction bits, measured at summon time.

  description  MDL code length of the program under the language's probabilistic grammar (grammar.py).
  decision     H(action) over a reference distribution of input grids. The action (the moves emitted)
               is a deterministic function of the grid, so H(action) = I(grid; action): the information
               the agent actually uses to pick what it does. Estimated by a Miller–Madow-corrected
               plug-in on fixed-seed samples, capped by two upper bounds: the mean path bits of the
               runs (+ the binary entropy of aborting) and a static bound from the program text.
  destruction  E[erasure + motion] of the moves actually emitted, over the same reference
               distribution, using each mutator's own (prior) erasure and the quadratic motion of the
               whole run's expected changed cells; plus the ratchet surcharge for what repeated
               application converges to (same probe as program.Program.ratchet_bits).

Reference distribution: a mixture of
  * uniform spawns (the prior μ), and
  * structured grids: spawns after 1–3 random cheap Programs (code-reachable states), and
  * the agent's own trajectories: states visited while it is re-applied to the probe grids.
Without the structured part, an agent could behave constantly on random grids and spend its
discrimination only on structured ones for free. All samples are seeded from the GridType, so every
agent is priced on the same grids (common random numbers). CPU is not priced: it is a hard
per-interaction step budget (interp.STEP_LIMIT).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import pickle
import zlib
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

from ..core import Grid, GridType, spawn
from ..mutators import COST_KNOBS, by_id
from .grammar import describe_bits
from .interp import STEP_LIMIT, Owner, _static_cap, n_all_moves, run
from .lang import MOVE, Node

log2 = math.log2
PRICING = {
    "n_uniform": 128,        # uniform spawns
    "n_structured": 64,      # spawns after 1-3 random cheap Programs
    "n_game": 64,            # objects seen in a few short simulated games of Program agents
    "n_self": 32,            # states on the agent's own re-application trajectories
    "struct_max_bits": 40.0, # "cheap": total step cost of the structuring Program
    "probes": 24,            # ratchet probes (program.PROBES)
    "step_limit": STEP_LIMIT,
    "min_coverage": 0.5,     # an entropy estimate with Good–Turing coverage below this is replaced by its bound
}
PRICING_VERSION = 1
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "agentlang"
_MEM: dict = {}


def _knobs_fp() -> str:
    return json.dumps(COST_KNOBS, sort_keys=True, default=str)


def _src_hash() -> str:
    h = hashlib.sha256()
    here = Path(__file__).resolve().parent
    files = [here / f for f in ("lang.py", "grammar.py", "elab.py", "interp.py", "pricing.py")]
    for f in files + [here.parent / "mutators.py", here.parent / "program.py"]:
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


_SRC = None


def src_hash() -> str:
    global _SRC
    if _SRC is None:
        _SRC = _src_hash()
    return _SRC


# ------------------------------------------------------------------------------------------------
# reference distribution
# ------------------------------------------------------------------------------------------------
def _seed(*parts) -> int:
    return zlib.crc32("|".join(map(str, parts)).encode())


def reference_grids(gt: GridType, pricing: dict | None = None) -> tuple[list[Grid], list[Grid]]:
    """(uniform spawns, structured grids), deterministic per GridType and sample sizes."""
    P = {**PRICING, **(pricing or {})}
    key = ("ref", gt, P["n_uniform"], P["n_structured"], P["struct_max_bits"], _knobs_fp())
    if key in _MEM:
        return _MEM[key]
    from ..program import random_program
    rng = np.random.default_rng(_seed("agentlang-ref-uniform", gt.key))
    U = [spawn(gt, rng) for _ in range(P["n_uniform"])]
    rng = np.random.default_rng(_seed("agentlang-ref-structured", gt.key))
    S = []
    while len(S) < P["n_structured"]:
        g = spawn(gt, rng)
        for _ in range(int(rng.integers(1, 4))):
            for _try in range(50):
                prog = random_program(rng, gt, max_steps=2, guard_prob=0.3)
                if sum(s.cost(gt) for s in prog.steps) <= P["struct_max_bits"]:
                    break
            g = prog.run(g, gt)
        S.append(g)
    _MEM[key] = (U, S)
    return U, S


GAME_SEEDS = (7001, 7002, 7003)


def game_states(gt: GridType, n: int) -> list[Grid]:
    """n objects sampled from snapshots of a few short fixed-seed games of Program agents (disk-cached):
    the kind of structured state agents meet in play (painted lines, filled grids, sorted rows, ...)."""
    if n <= 0:
        return []
    key = ("game", gt, n, src_hash())
    if key in _MEM:
        return _MEM[key]
    h = hashlib.sha256(repr(key).encode()).hexdigest()[:24]
    path = CACHE_DIR / f"corpus-{h}.pkl"
    if path.exists():
        try:
            with open(path, "rb") as fh:
                sym, col = pickle.load(fh)
            _MEM[key] = [Grid(a, b) for a, b in zip(sym, col)]
            return _MEM[key]
        except Exception:
            pass
    from ..sim import GameConfig, run_game
    pool, seen = [], set()

    def hook(world, ev):
        if world.t > 0:
            for g in world.objects:
                if g.key not in seen:
                    seen.add(g.key)
                    pool.append(g)

    for seed in GAME_SEEDS:
        cfg = GameConfig(gtype=gt, n_gods=4, length="fixed", fixed_seconds=120.0, planning_seconds=30.0,
                         policies=["random", "greedy_private", "random", "greedy_private"], seed=seed,
                         snapshot_interval=10.0, dealer_exclude=("seed2_patchwork",))
        run_game(cfg, hook=hook)
    rng = np.random.default_rng(_seed("agentlang-ref-game", gt.key))
    idx = rng.choice(len(pool), size=min(n, len(pool)), replace=False)
    out = [pool[i] for i in sorted(idx)]
    _MEM[key] = out
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".tmp{os.getpid()}")
        with open(tmp, "wb") as fh:
            pickle.dump((np.stack([g.sym for g in out]), np.stack([g.col for g in out])), fh)
        os.replace(tmp, path)
    except Exception:
        pass
    return out


def probe_grids(gt: GridType, n: int) -> list[Grid]:
    from ..program import _probe_grids, PROBES
    if n == PROBES:
        return _probe_grids(gt)
    rng = np.random.default_rng(zlib.crc32(("probe:" + gt.key).encode()))
    return [spawn(gt, rng) for _ in range(n)]


# ------------------------------------------------------------------------------------------------
# estimators
# ------------------------------------------------------------------------------------------------
def entropy_stats(keys: list) -> dict:
    """Plug-in and Miller–Madow entropy (bits) of a sample, with standard error and coverage."""
    n = len(keys)
    if n == 0:
        return {"n": 0, "distinct": 0, "plugin": 0.0, "mm": 0.0, "se": 0.0, "coverage": 1.0}
    cnt = np.array(list(Counter(keys).values()), float)
    p = cnt / n
    lp = np.log2(p)
    H = float(-(p * lp).sum())
    m = len(cnt)
    mm = H + (m - 1) / (2 * n * math.log(2))
    var = float((p * lp ** 2).sum() - H ** 2) / n
    f1 = int((cnt == 1).sum())
    return {"n": n, "distinct": m, "plugin": H, "mm": mm, "se": math.sqrt(max(var, 0.0)),
            "coverage": 1.0 - f1 / n}


def hb(q: float) -> float:
    return 0.0 if q <= 0 or q >= 1 else -(q * log2(q) + (1 - q) * log2(1 - q))


def chain_bound(res: list, min_coverage: float) -> tuple[float, int]:
    """Σ over choice sites of H(outcome at that site), ⊥ when the site is not reached.

    The recorded choices determine the action, so H(action) ≤ H(choices) ≤ Σ_sites H(site) by
    subadditivity. Each site has a small alphabet (≤ #branches + 1), so its plug-in estimate is far
    better resolved than the joint entropy of the whole action, which saturates at log2(n samples).
    A site whose estimate has low coverage is charged its maximum, log2(#branches [+1])."""
    n = len(res)
    sites: dict = {}
    for i, r in enumerate(res):
        for site, outcome, br in r.choices or ():
            d = sites.get(site)
            if d is None:
                d = sites[site] = [{}, 0]
            if i not in d[0]:
                d[0][i] = outcome
            d[1] = max(d[1], br)
    total = 0.0
    for outs, br in sites.values():
        missing = n - len(outs)
        keys = list(outs.values()) + [("⊥",)] * missing
        st = entropy_stats(keys)
        cap = log2(br + (1 if missing else 0))
        total += cap if st["coverage"] < min_coverage else min(st["mm"], cap)
    return total, len(sites)


# ------------------------------------------------------------------------------------------------
# static bound on the decision bits (max over paths of Σ log2 #branches)
# ------------------------------------------------------------------------------------------------
def static_bound(prog: Node, gt: GridType) -> float:
    total = log2(n_all_moves(gt))

    def ex(n: Node) -> float:
        """Choice bits recorded while evaluating an expression in the main program."""
        if n is None:
            return 0.0
        t = n.tag
        if t in ("Lambda", "DefRef", "ScoreFn", "Comp", "DefCall"):
            return 0.0          # function context: nothing recorded (results are tainted instead)
        b = sum(ex(k) for k in n.kids if isinstance(k, Node))
        if t == "Best":
            b += log2(max(_static_cap(n.kids[0], gt), 1))
        if t == "DynCall":
            mid, svals = n.val
            from .lang import slots_of
            for s, sv in zip(slots_of(mid), svals):
                if sv[0] == "expr":
                    for f in s.fields:
                        b += _max_field_bits(mid, f.name, gt)
        return b

    def act(e: Node) -> float:
        b = ex(e)
        if e.tag not in ("ConstCall", "DynCall"):
            b += total
        if _may_star(e):
            b += log2(2 * gt.N)
        return b

    def block(stmts) -> float:
        b = 0.0
        for s in stmts:
            t = s.tag
            if t == "Assign":
                b += ex(s.kids[0])
            elif t == "Act":
                b += act(s.kids[0])
            elif t == "If":
                b += ex(s.kids[0]) + 1.0 + max(block(s.kids[1]), block(s.kids[2]) if s.kids[2] else 0.0)
            elif t == "For":
                cap = _static_cap(s.kids[0], gt)
                b += ex(s.kids[0]) + log2(cap + 1) + cap * block(s.kids[1])
        return b

    return block(prog.kids[1]) + 1.0       # + 1 bit: whether the run aborts


def _may_star(e: Node) -> bool:
    if e.tag == "ConstCall":
        return e.val[1].get("kind") == "line*"
    return e.tag != "DynCall" or any(sv[0] == "lit" and sv[1].get("kind") == "line*" for sv in e.val[1])


@lru_cache(maxsize=None)
def _max_field_bits(mid, fname, gt) -> float:
    f = next(x for x in by_id(mid).fields if x.name == fname)
    best = 0.0
    for p in by_id(mid).space(gt):
        # choices of field f given the other params of this setting
        try:
            ch = f.choices(gt, p)
        except Exception:
            ch = None
        if ch:
            best = max(best, log2(len(ch)))
    return best


# ------------------------------------------------------------------------------------------------
# ratchet probe and own trajectories
# ------------------------------------------------------------------------------------------------
def uses_score(prog: Node) -> bool:
    def rec(n):
        if isinstance(n, Node):
            if n.tag in ("Score", "ScoreFn"):
                return True
            return any(rec(k) for k in n.kids)
        if isinstance(n, (tuple, list)):
            return any(rec(k) for k in n)
        return False
    return rec(prog)


def is_single_const(prog: Node) -> bool:
    """One unconditional literal mutator call and nothing else (priced exactly like a 1-step Program)."""
    main = prog.kids[1]
    return (not prog.kids[0] and len(main) == 1 and main[0].tag == "Act" and main[0].kids[0].tag == "ConstCall"
            and main[0].kids[0].val[1].get("kind") != "line*")


def ratchet_and_trajectories(prog: Node, gt: GridType, owner: Optional[Owner], P: dict):
    """(ratchet bits, own-trajectory states, closure stats) from re-applying the agent to probe grids."""
    from ..program import _pinned_bits
    if is_single_const(prog):
        return 0.0, [], {"mean_len": 1.0, "max_len": 1}
    probes = probe_grids(gt, P["probes"])
    cap = 3 * gt.N ** 2 + 8
    one, inf, traj, lens = [], [], [], []
    for x in probes:
        seen, g, path = {x.key}, x, []
        for k in range(cap):
            y = run(prog, gt, g, owner, P["step_limit"], record=False).grid
            if k == 0:
                one.append(y)
            if y == g or y.key in seen:
                g = y
                break
            seen.add(y.key)
            path.append(y)
            g = y
        inf.append(g)
        traj.append(path)
        lens.append(len(path))
    ratchet = max(0.0, _pinned_bits(inf, gt) - _pinned_bits(one, gt))
    states, k = [], 0
    while len(states) < P["n_self"] and any(k < len(t) for t in traj):
        for t in traj:
            if k < len(t) and len(states) < P["n_self"]:
                states.append(t[k])
        k += 1
    return ratchet, states, {"mean_len": float(np.mean(lens)), "max_len": int(max(lens))}


# ------------------------------------------------------------------------------------------------
# the price
# ------------------------------------------------------------------------------------------------
def owner_key(owner: Optional[Owner], gt: GridType) -> Optional[str]:
    if owner is None:
        return None
    from .. import calibrate as cal
    d = owner.draw
    return hashlib.sha256(f"{d.family.id}|{cal.canonical_json(d.params)}|{cal.cache_key(d, gt)}".encode()).hexdigest()


def cost_key(prog: Node, gt: GridType, owner: Optional[Owner], P: dict) -> str:
    ok = owner_key(owner, gt) if uses_score(prog) else None
    payload = json.dumps({"ir": repr(prog.canon()), "gt": gt.key, "owner": ok, "pricing": P,
                          "knobs": _knobs_fp(), "src": src_hash(), "v": PRICING_VERSION}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def price(prog: Node, gt: GridType, owner: Optional[Owner] = None, pricing: dict | None = None,
          cache: bool = True, keep_samples: bool = False) -> dict:
    """The three cost terms (bits) and their diagnostics. Deterministic; cached in memory and on disk."""
    P = {**PRICING, **(pricing or {})}
    if uses_score(prog) and owner is None:
        raise ValueError("this agent calls score(...): price it with its owner's utility")
    key = cost_key(prog, gt, owner, P)
    if cache and key in _MEM and not keep_samples:
        return _MEM[key]
    path = CACHE_DIR / f"{key}.pkl"
    if cache and not keep_samples and path.exists():
        try:
            with open(path, "rb") as fh:
                _MEM[key] = pickle.load(fh)
            return _MEM[key]
        except Exception:
            pass
    out = _price(prog, gt, owner, P, keep_samples)
    if cache and not keep_samples:
        _MEM[key] = out
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(f".tmp{os.getpid()}")
            with open(tmp, "wb") as fh:
                pickle.dump(out, fh, protocol=pickle.HIGHEST_PROTOCOL)
            os.replace(tmp, path)
        except Exception:
            pass
    return out


def _price(prog: Node, gt: GridType, owner: Optional[Owner], P: dict, keep: bool) -> dict:
    K = COST_KNOBS
    desc, per_line, _ = describe_bits(prog, gt)
    U, S = reference_grids(gt, P)
    Gm = game_states(gt, P["n_game"])
    ratchet, own, closure = ratchet_and_trajectories(prog, gt, owner, P)
    refs = U + S + Gm + own
    comp = ["uniform"] * len(U) + ["structured"] * len(S) + ["game"] * len(Gm) + ["self"] * len(own)
    res = [run(prog, gt, x, owner, P["step_limit"], record=True) for x in refs]
    acts = [r.actions for r in res]
    bc, bs, N2 = log2(gt.C), log2(gt.S), gt.N ** 2
    destr = np.array([r.erase + K["move"] * (r.dcol ** 2 * bc + r.dsym ** 2 * bs) / N2 for r in res])
    erase = np.array([r.erase for r in res])
    path = np.array([r.path_bits for r in res])
    abort = np.array([r.aborted for r in res])
    steps = np.array([r.steps for r in res])
    changed = np.array([r.grid != x for r, x in zip(res, refs)])
    H = entropy_stats(acts)
    by_comp = {c: entropy_stats([a for a, k in zip(acts, comp) if k == c])
               for c in ("uniform", "structured", "game", "self")}
    path_bound = float(path.mean()) + hb(float(abort.mean()))
    chain, n_sites = chain_bound(res, P["min_coverage"])
    chain += hb(float(abort.mean()))
    sb = static_bound(prog, gt)
    joint = H["mm"] if H["coverage"] >= P["min_coverage"] else math.inf
    decision = max(0.0, min(joint, chain, path_bound, sb))
    destruction = float(destr.mean()) + K["ratchet"] * ratchet
    out = {
        "description": desc, "decision": decision, "destruction": destruction,
        "total": desc + decision + destruction,
        "erase": float(erase.mean()), "motion": float(destr.mean() - erase.mean()), "ratchet": K["ratchet"] * ratchet,
        "H": H, "H_by_component": by_comp, "path_bound": path_bound, "static_bound": sb,
        "chain_bound": chain, "n_sites": n_sites,
        "binding": ("joint" if decision == joint else "chain" if decision == chain else
                    "path" if decision == path_bound else "static"),
        "abort_rate": float(abort.mean()), "change_rate": float(changed.mean()),
        "steps_mean": float(steps.mean()), "steps_max": int(steps.max()),
        "over_budget": float(np.mean([r.reason == "ran out of steps" for r in res])),
        "per_line": per_line, "closure": closure, "n_ref": len(refs),
    }
    if keep:
        out["samples"] = {"actions": acts, "component": comp, "results": res, "refs": refs}
    return out
