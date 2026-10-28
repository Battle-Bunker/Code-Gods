"""Price an open agent: summon_bits (description) and per_application_bits (decision + erasure + motion
+ amortised ratchet), measured black-box at summon time (docs/open-agents.md §3–4).

    summon_bits          = ast-bits-v1 description length of the source            paid once, by the god
    per_application_bits = I(grid; action) + E[erasure] + E[motion] + ratchet/len   paid on every application

Decision information is estimated by running the agent, never by reading it:

* the **reference mixture** is the one of docs/agent-language.md §3.2 (uniform spawns, structured
  code-reachable grids, world-like game states, the agent's own re-application trajectories), on fixed
  seeds, so every agent is priced on the same grids;
* each run's **action** is the tuple of moves it returned, with `best_line` resolved to the line it hits;
* a **deterministic** agent (it never drew a random number) has I = H(action). We take the minimum of
  four estimates: the Miller–Madow joint entropy (trusted only when its Good–Turing coverage is
  ≥ 0.5), a positional chain bound H(len) + Σ_positions [H(mutator) + Σ_fields H(field)], a set bound
  Σ_moves H_b(P(move in action)) (valid when every action lists its moves in canonical order without
  repeats, so the action is a function of its move set), and the expected naming length of the action
  under the mutator code (an upper bound on H by source coding). Each component uses Miller–Madow and
  falls back to log2 of its alphabet when its coverage is low;
* a **randomized** agent is re-run with R engine-derived seeds per grid. We estimate
  I = H(A) − H(A|X) with the plug-in on the (grid, seed) table, minus the mean plug-in I of the same
  table with grid labels shuffled (the shuffle correction for limited-sampling bias), clipped to
  [0, the H(A) upper bounds]. Seeds are HMAC(salt, "measure", ...) and play seeds HMAC(salt, "play",
  ...), so the agent cannot tell measurement from play.

Destruction uses each emitted move's prior erasure (mutators.py §1b) and the quadratic motion of the
whole run's expected changed cells, averaged over the mixture (an application that does nothing pays
nothing). The ratchet is the closure surcharge of program.Program.ratchet_bits, amortised over the
mean number of applications the closure takes.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import pickle
from collections import Counter
from pathlib import Path
from typing import Optional

import numpy as np

from ..core import Grid, GridType
from ..mutators import COST_KNOBS, by_id
from .api import all_moves, available, resolve_line_star
from .astbits import ast_bits, gamma_bits
from .sandbox import (HASH_DETERMINISTIC, STEP_LIMIT, CompiledAgent, Owner, RunResult, derive_seed)

log2 = math.log2
PRICING = {
    "n_uniform": 128, "n_structured": 64, "n_game": 64, "n_self": 32,
    "struct_max_bits": 40.0,
    "probes": 24,
    "replicates": 8,          # seeds per grid for an agent that uses randomness
    "shuffles": 32,           # label shuffles for the bias correction of I
    "min_coverage": 0.5,
    "step_limit": STEP_LIMIT,
    "randomness": "seeded",   # "seeded" (charge I = H(A) - H(A|X)) | "forbidden" (random/time raise)
    "ratchet": "amortised",   # "amortised" (ratchet / closure length, per application) | "off" | "full"
    "scheme": "corpus",       # ast-bits-v1 weights: "corpus" | "uniform"
}
PRICING_VERSION = 1
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "openagents"
_MEM: dict = {}
COMPONENTS = ("uniform", "structured", "game", "self")


# ------------------------------------------------------------------------------------------------
# entropy estimators
# ------------------------------------------------------------------------------------------------
def entropy_stats(keys: list) -> dict:
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
    return {"n": n, "distinct": m, "plugin": H, "mm": mm, "se": math.sqrt(max(var, 0.0)),
            "coverage": 1.0 - float((cnt == 1).sum()) / n}


def plugin(keys) -> float:
    n = len(keys)
    if n == 0:
        return 0.0
    c = np.array(list(Counter(keys).values()), float) / n
    return float(-(c * np.log2(c)).sum())


def _component_bits(keys: list, alphabet: int, min_cov: float) -> float:
    st = entropy_stats(keys)
    cap = log2(max(alphabet, 1))
    return cap if st["coverage"] < min_cov else min(st["mm"], cap)


_FIELD_ALPHA: dict = {}


def field_alphabets(gt: GridType) -> dict:
    """Number of distinct values each field name takes over every legal move (+1 for absent)."""
    if gt not in _FIELD_ALPHA:
        vals: dict = {}
        for m in all_moves(gt):
            for k, v in m.params.items():
                vals.setdefault(k, set()).add(v)
        _FIELD_ALPHA[gt] = {k: len(v) + 1 for k, v in vals.items()}
    return _FIELD_ALPHA[gt]


def naming_bits(action: tuple, gt: GridType) -> float:
    """Length of the action written out literally: γ(#moves + 1) + Σ (log2 #mutators + D(move))."""
    k = log2(len(available(gt)))
    return gamma_bits(len(action) + 1) + sum(k + by_id(m.mid).describe_bits(m.params, gt) for m in action)


def decision_deterministic(acts: list, gt: GridType, min_cov: float) -> dict:
    """H(action) of a deterministic agent: min of the joint, positional, set and naming estimates."""
    keys = [tuple(m.key for m in a) for a in acts]
    joint = entropy_stats(keys)
    nmax = max((len(a) for a in acts), default=0)
    fa = field_alphabets(gt)
    nmut = len(available(gt)) + 1
    pos = _component_bits([len(a) for a in acts], nmax + 2, min_cov)
    for p in range(nmax):
        pos += _component_bits([a[p].mid if p < len(a) else None for a in acts], nmut, min_cov)
        for f, alpha in fa.items():
            col = [a[p].params.get(f) if p < len(a) else None for a in acts]
            if any(v is not None for v in col):
                pos += _component_bits(col, alpha, min_cov)
    canonical = all(list(k) == sorted(set(k), key=repr) for k in keys)
    if canonical:
        universe = sorted({m for k in keys for m in k}, key=repr)
        sets = [set(k) for k in keys]
        setb = sum(_component_bits([m in s for s in sets], 2, min_cov) for m in universe)
    else:
        setb = math.inf
    naming = float(np.mean([naming_bits(a, gt) for a in acts])) if acts else 0.0
    j = joint["mm"] if joint["coverage"] >= min_cov else math.inf
    est = {"joint": j, "positional": pos, "set": setb, "naming": naming}
    binding = min(est, key=est.get)
    return {"bits": max(0.0, est[binding]), "binding": binding, "estimates": est, "joint": joint}


class SplitMix64:
    """A tiny portable PRNG (Steele, Lea & Flood 2014) so the shuffle correction is reproducible in any
    language: next() = the SplitMix64 output; permutation(n) = Fisher–Yates from the top, j = next() mod (i+1)."""
    M = (1 << 64) - 1

    def __init__(self, seed: int):
        self.s = seed & self.M

    def next(self) -> int:
        self.s = (self.s + 0x9E3779B97F4A7C15) & self.M
        z = self.s
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & self.M
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & self.M
        return z ^ (z >> 31)

    def permutation(self, n: int) -> list:
        p = list(range(n))
        for i in range(n - 1, 0, -1):
            j = self.next() % (i + 1)
            p[i], p[j] = p[j], p[i]
        return p


def decision_randomized(acts_by_grid: list[list], gt: GridType, min_cov: float, shuffles: int, seed: int) -> dict:
    """I(X; A) = H(A) - H(A|X) from R runs per grid, shuffle-corrected, capped by the H(A) bounds."""
    flat = [a for row in acts_by_grid for a in row]
    det = decision_deterministic(flat, gt, min_cov)      # upper bounds on H(A) (I <= H(A))
    keys = [[tuple(m.key for m in a) for a in row] for row in acts_by_grid]
    allk = [k for row in keys for k in row]
    HA = plugin(allk)
    HAX = float(np.mean([plugin(row) for row in keys]))
    I_plug = HA - HAX
    rng = SplitMix64(seed)
    R = len(keys[0]) if keys else 0
    shuf = []
    arr = list(allk)
    for _ in range(shuffles):
        perm = rng.permutation(len(arr))
        rows = [[arr[perm[i * R + j]] for j in range(R)] for i in range(len(keys))]
        shuf.append(HA - float(np.mean([plugin(r) for r in rows])))
    I_shuf = float(np.mean(shuf)) if shuf else 0.0
    I = max(0.0, I_plug - I_shuf)
    joint = entropy_stats(allk)
    est = dict(det["estimates"])
    est["mutual"] = I if joint["coverage"] >= min_cov else math.inf
    binding = min(est, key=est.get)
    return {"bits": max(0.0, est[binding]), "binding": binding, "estimates": est, "joint": joint,
            "H_A": entropy_stats(allk)["mm"], "H_A_given_X": HAX, "I_plugin": I_plug, "I_shuffle": I_shuf}


# ------------------------------------------------------------------------------------------------
# destruction
# ------------------------------------------------------------------------------------------------
def run_destruction(moves: tuple, gt: GridType) -> tuple[float, float]:
    """(erasure, motion) of one run: Σ prior erasure of its moves, quadratic motion of the run's total."""
    K = COST_KNOBS
    e = dcol = dsym = 0.0
    for m in moves:
        mu = by_id(m.mid)
        t = mu.terms_fn(m.params, gt)
        mult = K["scope"][t.scope] * K["kind"]["bijective" if mu.bijective else "overwrite"]
        e += K["erase"] * float(t.erase) * mult
        dcol += t.dcol
        dsym += t.dsym
    motion = K["move"] * (dcol ** 2 * log2(gt.C) + dsym ** 2 * log2(gt.S)) / gt.N ** 2
    return e, motion


# ------------------------------------------------------------------------------------------------
# running the agent on the reference mixture
# ------------------------------------------------------------------------------------------------
def reference(gt: GridType, P: dict) -> tuple[list, list]:
    from ..agentlang.pricing import game_states, reference_grids
    U, S = reference_grids(gt, {"n_uniform": P["n_uniform"], "n_structured": P["n_structured"],
                                "struct_max_bits": P["struct_max_bits"]})
    Gm = game_states(gt, P["n_game"])
    return list(U) + list(S) + list(Gm), (["uniform"] * len(U) + ["structured"] * len(S) + ["game"] * len(Gm))


def probe_grids(gt: GridType, n: int) -> list:
    from ..agentlang.pricing import probe_grids as pg
    return pg(gt, n)


def ratchet_probe(agent: CompiledAgent, gt: GridType, owner, P: dict) -> tuple[float, list, dict]:
    """(ratchet bits, own-trajectory states, closure stats): re-apply the agent to the probe grids until it
    stops (or revisits a state), charge the cell-layers its closure pins beyond one application."""
    from ..program import _pinned_bits
    probes = probe_grids(gt, P["probes"])
    cap = 3 * gt.N ** 2 + 8
    one, inf, traj, lens = [], [], [], []
    for pi, x in enumerate(probes):
        seen, g, path = {x.key}, x, []
        for k in range(cap):
            y = agent.run(g, derive_seed("ratchet", gt.key, pi, k), owner, P["step_limit"], P["randomness"]).grid
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


def _src_hash() -> str:
    h = hashlib.sha256()
    here = Path(__file__).resolve().parent
    for f in ("api.py", "sandbox.py", "astbits.py", "measure.py", "ast_bits_v1.json"):
        h.update((here / f).read_bytes())
    from ..agentlang.pricing import src_hash
    h.update(src_hash().encode())
    return h.hexdigest()[:16]


_SRC = None


def src_hash() -> str:
    global _SRC
    if _SRC is None:
        _SRC = _src_hash()
    return _SRC


def owner_key(owner: Optional[Owner], gt: GridType) -> Optional[str]:
    if owner is None:
        return None
    from ..agentlang.pricing import owner_key as ok
    return ok(owner, gt)


def cost_key(source: str, gt: GridType, owner, P: dict, calls_score: bool) -> str:
    payload = json.dumps({"src": source, "gt": gt.key, "owner": owner_key(owner, gt) if calls_score else None,
                          "pricing": P, "knobs": json.dumps(COST_KNOBS, sort_keys=True, default=str),
                          "code": src_hash(), "v": PRICING_VERSION}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def price(source: str, gt: GridType, owner: Optional[Owner] = None, pricing: Optional[dict] = None,
          cache: bool = True, keep_samples: bool = False) -> dict:
    """summon_bits, per_application_bits and every diagnostic. Deterministic; cached."""
    P = {**PRICING, **(pricing or {})}
    agent = CompiledAgent(source, gt)
    if agent.calls_score and owner is None:
        raise ValueError("this agent calls score(...): price it with its owner")
    key = cost_key(source, gt, owner, P, agent.calls_score)
    if cache and not keep_samples:
        if key in _MEM:
            return _MEM[key]
        path = CACHE_DIR / f"{key}.pkl"
        if path.exists():
            try:
                with open(path, "rb") as fh:
                    _MEM[key] = pickle.load(fh)
                return _MEM[key]
            except Exception:  # noqa: BLE001
                pass
    out = _price(agent, gt, owner if agent.calls_score else None, P, keep_samples)
    if cache and not keep_samples:
        _MEM[key] = out
        if HASH_DETERMINISTIC:
            try:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                path = CACHE_DIR / f"{key}.pkl"
                tmp = path.with_suffix(f".tmp{os.getpid()}")
                with open(tmp, "wb") as fh:
                    pickle.dump(out, fh, protocol=pickle.HIGHEST_PROTOCOL)
                os.replace(tmp, path)
            except Exception:  # noqa: BLE001
                pass
    return out


def run_mixture(agent: CompiledAgent, gt: GridType, owner, P: dict, refs: list, tag: str = "measure"):
    """Runs on every reference grid: one per grid, then R per grid if any run touched `random`."""
    runs = [[agent.run(x, derive_seed(tag, gt.key, i, 0), owner, P["step_limit"], P["randomness"])]
            for i, x in enumerate(refs)]
    randomized = any(r[0].used_random for r in runs)
    if randomized:
        for i, x in enumerate(refs):
            for j in range(1, P["replicates"]):
                runs[i].append(agent.run(x, derive_seed(tag, gt.key, i, j), owner, P["step_limit"], P["randomness"]))
    return runs, randomized


def _actions(runs: list, refs: list, gt: GridType) -> list:
    return [[tuple(resolve_line_star(m, x, gt) for m in r.moves) for r in row] for row, x in zip(runs, refs)]


def _decision(acts: list, randomized: bool, gt: GridType, P: dict, seed: int) -> dict:
    if randomized:
        return decision_randomized(acts, gt, P["min_coverage"], P["shuffles"], seed)
    return decision_deterministic([row[0] for row in acts], gt, P["min_coverage"])


def _price(agent: CompiledAgent, gt: GridType, owner, P: dict, keep: bool) -> dict:
    d = ast_bits(agent.source, gt, P["scheme"])
    refs, comp = reference(gt, P)
    ratchet, own, closure = ratchet_probe(agent, gt, owner, P)
    refs = refs + own
    comp = comp + ["self"] * len(own)
    runs, randomized = run_mixture(agent, gt, owner, P, refs)
    acts = _actions(runs, refs, gt)
    dec = _decision(acts, randomized, gt, P, derive_seed("shuffle", gt.key))
    destr = np.array([[run_destruction(r.moves, gt) for r in row] for row in runs])   # (n, R, 2)
    erase_i = destr[:, :, 0].mean(axis=1)
    motion_i = destr[:, :, 1].mean(axis=1)
    by_comp = {}
    for c in COMPONENTS:
        idx = [i for i, k in enumerate(comp) if k == c]
        if not idx:
            continue
        sub = [acts[i] for i in idx]
        dc = _decision(sub, randomized, gt, P, derive_seed("shuffle", gt.key, c))
        by_comp[c] = {"decision": dc["bits"], "binding": dc["binding"], "H_plugin": dc["joint"]["plugin"],
                      "erase": float(erase_i[idx].mean()), "motion": float(motion_i[idx].mean()), "n": len(idx)}
    steps = np.array([r.steps for row in runs for r in row])
    errors = [r.error for row in runs for r in row if r.error]
    changed = np.mean([[r.grid != x for r in row] for row, x in zip(runs, refs)])
    erase, motion = float(erase_i.mean()), float(motion_i.mean())
    rmode = P["ratchet"]
    rper = 0.0 if rmode == "off" else ratchet if rmode == "full" else ratchet / max(1.0, closure["mean_len"])
    per_app = dec["bits"] + erase + motion + rper
    out = {
        "description": d["total"], "description_parts": {k: d[k] for k in ("structure", "names", "literals", "moves")},
        "per_line": d["per_line"],
        "decision": dec["bits"], "binding": dec["binding"], "estimates": dec["estimates"],
        "erase": erase, "motion": motion, "ratchet": ratchet, "ratchet_per_app": rper,
        "summon_bits": d["total"], "per_application_bits": per_app,
        "randomized": randomized, "H": dec["joint"], "by_component": by_comp,
        "steps_mean": float(steps.mean()), "steps_max": int(steps.max()),
        "kt": d["total"] + log2(max(1.0, float(steps.mean()))),
        "error_rate": len(errors) / steps.size, "errors": Counter(e.split(":")[0] for e in errors).most_common(3),
        "over_budget": sum(e == "ran out of steps" for e in errors) / steps.size,
        "change_rate": float(changed), "closure": closure, "n_ref": len(refs),
        "uses_score": agent.calls_score,
        "mutators": sorted({m.mid for row in runs for r in row for m in r.moves}),
    }
    for k in ("H_A", "H_A_given_X", "I_plugin", "I_shuffle"):
        if k in dec:
            out[k] = dec[k]
    if keep:
        out["samples"] = {"runs": runs, "refs": refs, "component": comp, "actions": acts}
    return out
