"""Results for docs/open-agents.md.

    PYTHONHASHSEED=0 python3 -m gridlab.openagents.evaluate --only costs,weights,kraft,randomness,evasion,attack
    PYTHONHASHSEED=0 python3 -m gridlab.openagents.evaluate --only secondlaw,search,fairness
    PYTHONHASHSEED=0 python3 -m gridlab.openagents.evaluate --only games --games 8 --processes 4
    PYTHONHASHSEED=0 python3 -m gridlab.openagents.evaluate --only vectors      # writes test_vectors.json

All numbers are for Grid(5,base10,rgby) unless --type says otherwise. Prices are cached (.cache/openagents).
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import multiprocessing as mp
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from ..core import GridType, spawn
from ..family import Draw
from .. import calibrate as cal
from ..agentlang.astbytes import ast_bytes
from .api import Move, all_moves, apply_moves
from .astbits import (CONST_KINDS, P_EXT, Q_MOVE, ast_bits, float_bits, gamma_bits, load_tables, sample_program,
                      string_bits)
from .examples import ATTACK, EXAMPLES, PROBES, TEMPLATES, attack, colour_fill, example
from .measure import (CACHE_DIR, PRICING, SplitMix64, decision_deterministic, decision_randomized, entropy_stats,
                      naming_bits, price, reference, src_hash)
from .sandbox import HASH_DETERMINISTIC, CompiledAgent, Owner, derive_seed

log2 = math.log2
GT = GridType(5, "base10", "rgby")
OWNER_FAMILY = "seed1_line_painter"
FAMILIES = ["seed1_line_painter", "conqueror", "mirrormancer", "staircase_climber", "rainbow_road", "lucky_token",
            "snap", "young_tableau", "treasure_map", "homebody", "chessmaster", "number_bonds"]
GAME_DIR = CACHE_DIR / "games"
APPS = 150          # applications an agent gets in a typical 300 s, 20 Hz game (for lifetime yields)


def owner(fid: str, gt: GridType, seed: int = 1) -> Owner:
    from ..rules import by_id
    f = by_id(fid)
    d = Draw(f, f.sample(np.random.default_rng(seed), gt))
    return Owner(d, cal.survival(d, gt))


def md(rows: list, head: list) -> str:
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for r in rows:
        out.append("| " + " | ".join(f"{x:.1f}" if isinstance(x, float) else str(x) for x in r) + " |")
    return "\n".join(out)


def _price_job(job):
    name, src, gtkey, fam, pricing = job
    gt = _gt(gtkey)
    o = owner(fam, gt) if (fam and "score" in src) else None
    t = time.time()
    r = price(src, gt, o, pricing)
    r = {k: v for k, v in r.items() if k != "samples"}
    r["seconds"] = time.time() - t
    return name, r


def _gt(key: str) -> GridType:
    n, s, c = key.split(",")
    return GridType(int(n), s, c)


def _key(gt: GridType) -> str:
    return f"{gt.N},{gt.symbols},{gt.colours}"


def price_many(items: list, gt: GridType, fam: str = OWNER_FAMILY, pricing=None, processes: int = 4) -> dict:
    """{name: price} for (name, source) items, in parallel (each process warms its own caches)."""
    jobs = [(n, s, _key(gt), fam, pricing or {}) for n, s in items]
    reference(gt, PRICING)                  # warm the shared reference corpus before forking
    if processes > 1 and len(jobs) > 1:
        with mp.get_context("fork").Pool(processes) as pool:
            res = pool.map(_price_job, jobs, chunksize=1)
    else:
        res = [_price_job(j) for j in jobs]
    return dict(res)


# ------------------------------------------------------------------------------------------------
# 1. the cost table
# ------------------------------------------------------------------------------------------------
PROGRAM_EQUIV = {
    "paint_one_row": ("paint", {"kind": "line", "region": (0, 2), "colour": 0}),
    "fill_grid": ("paint", {"kind": "all", "region": (), "colour": 0}),
    "paint_best_line": ("paint", {"kind": "line*", "region": (), "colour": 0}),
    "recolour_tool": ("recolour", {"kind": "all", "region": (), "pair": (3, 0)}),
}


def sec_costs(gt: GridType, processes: int) -> dict:
    from ..program import Program, Step
    from ..agentlang.pricing import price as dsl_price
    from ..agentlang.elab import elaborate
    from ..agentlang.examples import example as dsl_example, EXAMPLES as DSL_EXAMPLES
    from ..agentlang.evaluate import owner as dsl_owner
    items = [(n, example(n, gt)) for n in EXAMPLES]
    pr = price_many(items, gt, processes=processes)
    rows, data = [], {}
    dsl_own = dsl_owner(OWNER_FAMILY, gt)
    for n, src in items:
        r = pr[n]
        kind = EXAMPLES[n][0]
        prog = ""
        if n in PROGRAM_EQUIV:
            mid, p = PROGRAM_EQUIV[n]
            prog = round(Program(steps=(Step.make(mid, p),)).cost(gt), 1)
        dsl = ""
        if n in DSL_EXAMPLES:
            try:
                dsl = round(dsl_price(elaborate(dsl_example(n, gt), gt), gt, dsl_own)["total"], 1)
            except Exception:  # noqa: BLE001
                dsl = ""
        lines = len([l for l in src.splitlines() if l.strip()])
        rows.append([n, kind, lines, r["description"], r["decision"], r["binding"], r["erase"], r["motion"],
                     r["ratchet_per_app"], r["per_application_bits"], r["summon_bits"] + r["per_application_bits"],
                     prog, dsl, ast_bytes(src), int(round(r["steps_mean"])), round(r["kt"], 1)])
        data[n] = {k: r[k] for k in ("description", "description_parts", "decision", "binding", "estimates", "erase",
                                     "motion", "ratchet", "ratchet_per_app", "summon_bits", "per_application_bits",
                                     "randomized", "steps_mean", "kt", "error_rate", "seconds")}
    head = ["agent", "kind", "lines", "description = summon", "decision", "bound", "erase", "motion", "ratchet/app",
            "per application", "summon + 1 application", "Program", "PR #10 language", "ast-bytes", "steps", "Kt"]
    parts = md([[n, *(round(pr[n]["description_parts"][k], 1) for k in ("structure", "names", "literals", "moves")),
                 round(pr[n]["description"], 1)] for n, _ in items],
               ["agent", "structure", "names", "literals", "moves", "total"])
    return {"table": md(rows, head), "parts": parts, "data": data}


# ------------------------------------------------------------------------------------------------
# 2. weights, ast-bytes and Kraft
# ------------------------------------------------------------------------------------------------
def sec_weights(gt: GridType) -> dict:
    rows, xs, ys = [], [], []
    for n in EXAMPLES:
        src = example(n, gt)
        c, u, b = (ast_bits(src, gt, s)["total"] for s in ("corpus", "uniform", "ast-bytes"))
        ab = ast_bytes(src)
        assert abs(b - 8 * ab) < 1e-9, (n, b, ab)
        rows.append([n, c, u, f"{100 * (1 - c / u):.0f}%", ab, f"{c / ab:.2f}"])
        xs.append(ab)
        ys.append(c)
    xs, ys = np.array(xs, float), np.array(ys, float)
    slope, icpt = np.polyfit(xs, ys, 1)
    r = float(np.corrcoef(xs, ys)[0, 1])
    return {"table": md(rows, ["agent", "ast-bits (corpus)", "ast-bits (uniform)", "corpus saves", "ast-bytes",
                               "corpus bits per ast-byte"]),
            "fit": f"corpus bits ≈ {slope:.2f} · ast-bytes + {icpt:.1f} (r = {r:.3f}); ast-bytes scheme = 8 × ast-bytes exactly"}


def kraft_check(scheme: str, n: int = 4000, seed: int = 1, max_nodes: int = 150) -> dict:
    rng = np.random.default_rng(seed)
    st = Counter()
    seen, mass, worst = set(), 0.0, 0.0
    sizes = []
    for _ in range(n):
        tree, lp = sample_program(rng, GT, scheme, max_nodes)
        if tree is None:
            st["overflow / not canonical"] += 1
            continue
        try:
            src = ast.unparse(tree)
            t2 = ast.parse(src)
        except Exception:  # noqa: BLE001
            st["not valid Python"] += 1
            continue
        if ast.dump(t2) != ast.dump(tree):
            st["not valid Python"] += 1
            continue
        try:
            b = ast_bits(src, GT, scheme)["total"]
        except Exception:  # noqa: BLE001
            st["unencodable"] += 1
            continue
        worst = max(worst, abs(b + lp))
        st["round trip"] += 1
        sizes.append(sum(1 for _ in ast.walk(t2)))
        k = ast.dump(t2)
        if k not in seen:
            seen.add(k)
            mass += 2.0 ** lp
    return {"samples": n, **st, "distinct": len(seen), "max |L - (-log2 p)|": worst,
            "sum 2^-L over distinct": mass, "mean nodes": float(np.mean(sizes)) if sizes else 0.0}


def distribution_sums(gt: GridType) -> dict:
    """Every finite distribution of the model sums to 1 (Kraft with equality at each choice point)."""
    out = {}
    for scheme in ("corpus", "uniform"):
        T = load_tables(scheme)
        worst = 0.0
        for cls, fields in T.classes.items():
            for f, k in fields:
                if k["k"] == "node":
                    for m in ("one", "opt", "seq", "seq_opt", "implied_opt"):
                        worst = max(worst, abs(sum(T.node_dist(cls, f, k["cat"], m).values()) - 1))
        for d in [T.ext, T.attr, T.kwarg, T.modpath, *T.modattr.values()]:
            worst = max(worst, abs(sum(d.values()) - 1))
        worst = max(worst, abs(sum(T.small("const_kind", CONST_KINDS).values()) - 1))
        out[scheme] = worst
    g = sum(2.0 ** -gamma_bits(n) for n in range(1, 1 << 16))
    return {"max |Σp - 1| per choice point": out, "Σ_{n<2^16} 2^-γ(n)": g}


def sec_kraft(gt: GridType) -> dict:
    return {"sums": distribution_sums(gt), "corpus": kraft_check("corpus"), "uniform": kraft_check("uniform")}


# ------------------------------------------------------------------------------------------------
# 3. randomness: seeded + charged I, versus forbidden
# ------------------------------------------------------------------------------------------------
RANDOM_BLUE = """\
import random

def agent(grid):
    blue = [cell for cell in grid.cells if cell.colour == "{B}"]
    return [paint(random.choice(blue), "{A}")] if blue else []
"""


def exact_I_random_blue(gt: GridType, refs: list) -> float:
    """I(X; A) for RANDOM_BLUE on the reference grids, exactly: A is uniform over the blue cells of X."""
    B = gt.C - 1
    p: dict = defaultdict(float)
    hx = []
    for g in refs:
        cells = [tuple(x) for x in np.argwhere(g.col == B)]
        if not cells:
            p[()] += 1 / len(refs)
            hx.append(0.0)
            continue
        for c in cells:
            p[c] += 1 / (len(refs) * len(cells))
        hx.append(log2(len(cells)))
    H = -sum(v * log2(v) for v in p.values() if v > 0)
    return H - float(np.mean(hx))


def sec_randomness(gt: GridType, processes: int) -> dict:
    o_items = [("random_row", example("random_row", gt)), ("hashed_row", example("hashed_row", gt)),
               ("random_blue_cell", colour_fill(RANDOM_BLUE, gt)), ("random_improver", example("random_improver", gt))]
    rows = []
    seeded = price_many(o_items, gt, processes=processes)
    forb = price_many(o_items, gt, pricing={"randomness": "forbidden"}, processes=processes)
    for n, _ in o_items:
        s, f = seeded[n], forb[n]
        rows.append([n, s["randomized"], round(s.get("H_A", s["H"]["mm"]), 2), round(s.get("H_A_given_X", 0.0), 2),
                     round(s.get("I_plugin", s["decision"]), 2), round(s.get("I_shuffle", 0.0), 2), s["decision"],
                     s["binding"], s["per_application_bits"],
                     "does nothing" if f["error_rate"] > 0.99 else round(f["per_application_bits"], 1)])
    # estimator bias check on an agent whose I is known exactly
    refs, _ = reference(gt, PRICING)
    truth = exact_I_random_blue(gt, refs)
    bias = []
    for R in (2, 4, 8, 16, 32):
        r = price(colour_fill(RANDOM_BLUE, gt), gt, None, {"replicates": R, "n_self": 0})
        bias.append([R, round(r.get("I_plugin", float("nan")), 3), round(r.get("I_shuffle", float("nan")), 3),
                     round(r["estimates"]["mutual"], 3), round(truth, 3), r["binding"]])
    return {"table": md(rows, ["agent", "randomized", "H(A)", "H(A|X)", "I plug-in", "shuffle bias", "decision charged",
                               "bound", "per application (seeded)", "per application (forbidden)"]),
            "bias": md(bias, ["seeds per grid R", "I plug-in", "mean I on shuffled labels", "I shuffle-corrected",
                              "exact I (no self states)", "binding"])}


# ------------------------------------------------------------------------------------------------
# 4. evasion probes and statelessness
# ------------------------------------------------------------------------------------------------
def sec_evasion(gt: GridType) -> dict:
    rows = []
    rng = np.random.default_rng(5)
    grids = [spawn(gt, rng) for _ in range(64)]
    for n, src in PROBES.items():
        src = colour_fill(src, gt)
        a = CompiledAgent(src, gt)
        meas = [tuple(a.run(g, derive_seed("measure", gt.key, i, 0)).moves) for i, g in enumerate(grids)]
        play = [tuple(a.run(g, derive_seed("play", 7, i)).moves) for i, g in enumerate(grids)]
        again = [tuple(a.run(g, derive_seed("measure", gt.key, i, 0)).moves) for i, g in enumerate(grids)]
        acts_m, acts_p = Counter(meas), Counter(play)
        err = Counter(a.run(grids[0]).error or "ok" for _ in range(1))
        r = price(src, gt, None)
        rows.append([n, len(acts_m), len(acts_p), meas == again,
                     f"{sum(acts_m[k] for k in acts_m if k) / len(grids):.2f} / {sum(acts_p[k] for k in acts_p if k) / len(grids):.2f}",
                     round(r["decision"], 2), r["randomized"], list(err)[0][:40]])
    return {"table": md(rows, ["probe", "distinct actions (measure)", "distinct actions (play)",
                               "repeatable", "acting rate measure / play", "decision charged", "randomized",
                               "run status"])}


# ------------------------------------------------------------------------------------------------
# 5. the structured-grid attack
# ------------------------------------------------------------------------------------------------
def sec_attack(gt: GridType, processes: int) -> dict:
    items = [(f"T{t}", attack(gt, t)) for t in (11, 12, 13, 14, 15)]
    pr = price_many(items, gt, processes=processes)
    rows = []
    for n, _ in items:
        r = pr[n]
        bc = r["by_component"]
        rows.append([n[1:], bc["uniform"]["decision"], bc["structured"]["decision"], bc["game"]["decision"],
                     r["decision"], r["binding"], r["erase"]])
    return {"table": md(rows, ["threshold", "decision on uniform only", "structured", "game states",
                               "charged (mixture)", "bound", "erasure"])}


# ------------------------------------------------------------------------------------------------
# 6. the generalised second law with feedback (Sagawa–Ueda) as a bound on created surprisal
# ------------------------------------------------------------------------------------------------
def dv_bound(K: float) -> float:
    """min over λ in (0,1) of (K + log2 1/(1-λ)) / λ: the most expected surprisal a map whose output
    distribution ν has KL(ν‖μ) ≤ K can create, for ANY utility (Donsker–Varadhan with E_μ 2^{λs} ≤ 1/(1-λ))."""
    lam = np.linspace(1e-4, 1 - 1e-4, 20000)
    return float(np.min((K + np.log2(1 / (1 - lam))) / lam))


def sec_secondlaw(gt: GridType, processes: int, n: int = 512) -> dict:
    """For agents × owner families: E_{x~μ}[s_u(agent(x))] against the bound dv_bound(erasure + I), where
    erasure and I are what the agent is charged per application, measured on the uniform component."""
    rng = np.random.default_rng(99)
    X = [spawn(gt, rng) for _ in range(n)]
    owners = {}
    for fid in FAMILIES:
        try:
            owners[fid] = owner(fid, gt)
        except Exception:  # noqa: BLE001
            pass
    agents = [(nm, example(nm, gt)) for nm in EXAMPLES if nm != "full_greedy"]
    agents.append(("random_blue_cell", colour_fill(RANDOM_BLUE, gt)))
    agents.append(("attack13", attack(gt, 13)))
    rows, viol, checks, tight = [], 0, 0, []
    base = {fid: np.array([o.score(x, gt) for x in X]) for fid, o in owners.items()}
    for nm, src in agents:
        uses = "score" in src
        fams = list(owners) if not uses else ["seed1_line_painter", "conqueror", "rainbow_road", "number_bonds"]
        for bound_fid in (fams if uses else [None]):
            own = owners[bound_fid] if uses else None
            r = price(src, gt, own)
            u = r["by_component"]["uniform"]
            K = u["erase"] + u["decision"]
            B = dv_bound(K)
            a = CompiledAgent(src, gt)
            Y = [a.run(x, derive_seed("secondlaw", i), own).grid for i, x in enumerate(X)]
            worst = None
            for fid in (fams if not uses else [bound_fid]):
                o = owners[fid]
                s = np.array([o.score(y, gt) for y in Y])
                m, se = float(s.mean()), float(s.std(ddof=1) / math.sqrt(n))
                checks += 1
                if m - 2 * se > B:
                    viol += 1
                tight.append(m / B if B > 0 else 0)
                if worst is None or m - B > worst[1] - worst[2]:
                    worst = (fid, m, B, se, float(base[fid].mean()))
            rows.append([nm + (f" [{bound_fid}]" if uses else ""), round(u["erase"], 1), round(u["decision"], 2),
                         round(K, 1), round(worst[2], 1), worst[0], round(worst[1], 2), round(worst[3], 2),
                         round(worst[1] - worst[4], 2)])
    return {"table": md(rows, ["agent", "erasure (uniform)", "I (uniform)", "K = erasure + I", "bound B(K)",
                               "family closest to the bound", "E[s] after", "± s.e.", "Δ = E[s after] − E[s before]"]),
            "summary": f"{checks} (agent, family) pairs; {viol} exceed the bound by more than 2 s.e.; "
                       f"largest E[s]/B(K) = {max(tight):.2f}"}


# ------------------------------------------------------------------------------------------------
# 7. does search dominate? yields by owner family
# ------------------------------------------------------------------------------------------------
def _yield_job(job):
    fid, gtkey, ss, as_ = job
    gt = _gt(gtkey)
    from ..agentlang.pricing import game_states
    from ..policy import program_library
    from ..program import random_program
    from .examples import template_instances
    states = game_states(gt, 64)
    try:
        o = owner(fid, gt)
    except Exception:  # noqa: BLE001
        return fid, None
    base = np.array([o.score(g, gt) for g in states])

    def gain(fn):
        return float(np.mean([o.score(fn(g, i), gt) for i, g in enumerate(states)]) - base.mean())

    progs, pcosts = program_library(gt, random_program, 4096)
    idx = np.random.default_rng(0).choice(len(progs), 512, replace=False)
    best_prog = max((APPS * gain(lambda g, i, p=progs[k]: p.run(g, gt)) / pcosts[k], k) for k in idx)
    out = {"program": (best_prog[0], progs[best_prog[1]].describe(gt))}
    for name, kind, src in template_instances(gt):
        r = price(src, gt, o if "score" in src else None)
        a = CompiledAgent(src, gt)
        g = gain(lambda x, i: a.run(x, derive_seed("yield", i), o if "score" in src else None).grid)
        life = r["summon_bits"] * ss + APPS * r["per_application_bits"] * as_
        y = APPS * g / max(life, 1e-9)
        prev = out.get(kind)
        if prev is None or y > prev[0]:
            out[kind] = (y, name, g, r["summon_bits"], r["per_application_bits"])
    return fid, out


def sec_search(gt: GridType, processes: int, ss: float = 1.0, as_: float = 0.01) -> dict:
    jobs = [(f, _key(gt), ss, as_) for f in FAMILIES]
    reference(gt, PRICING)
    with mp.get_context("fork").Pool(processes) as pool:
        res = pool.map(_yield_job, jobs, chunksize=1)
    rows = []
    for fid, out in res:
        if out is None:
            continue
        r = [fid, round(out["program"][0], 1)]
        for k in ("fixed", "relative", "conditional", "random", "search"):
            v = out.get(k)
            r.append("–" if v is None else f"{v[0]:.1f}" + (f" ({v[1]})" if k in ("search", "random") else ""))
        s = out.get("search")
        r.append("–" if s is None else f"{s[2]:.2f} / {s[3]:.0f} / {s[4]:.1f}")
        rows.append(r)
    return {"table": md(rows, ["owner family", "best of 512 Programs", "fixed", "relative", "conditional",
                               "random", "search (best template)",
                               "best search: gain per application / summon bits / per-application bits"]),
            "note": f"lifetime yield = {APPS} × mean Δ owner surprisal per application on game states / "
                    f"(summon × {ss} + {APPS} × per-application × {as_}); Programs: {APPS} × Δ / cost"}


# ------------------------------------------------------------------------------------------------
# 8. fairness: computing a target versus naming it
# ------------------------------------------------------------------------------------------------
def named_source(mv: Move) -> str:
    args = ", ".join(f"{k}={v!r}" for k, v in mv.params.items())
    return f'def agent(grid):\n    return [move("{mv.mid}", {args})]\n'


def sec_fairness(gt: GridType, families=("seed1_line_painter", "conqueror", "rainbow_road", "lucky_token",
                                         "treasure_map", "homebody")) -> dict:
    from ..agentlang.pricing import game_states
    states = game_states(gt, 64)
    rows = []
    for fid in families:
        o = owner(fid, gt)
        src = example("greedy_paint", gt)
        r = price(src, gt, o, keep_samples=True)
        acts = [a[0] for a in r["samples"]["actions"]]
        top = Counter(acts).most_common(1)[0][0]
        named = named_source(top[0]) if top else 'def agent(grid):\n    return []\n'
        rn = price(named, gt, None)
        a, b = CompiledAgent(src, gt), CompiledAgent(named, gt)
        base = np.mean([o.score(x, gt) for x in states])
        ga = float(np.mean([o.score(a.run(x, 0, o).grid, gt) for x in states]) - base)
        gb = float(np.mean([o.score(b.run(x).grid, gt) for x in states]) - base)
        e_name = float(np.mean([naming_bits(x, gt) for x in acts]))
        share = Counter(acts).most_common(1)[0][1] / len(acts)
        rows.append([fid, f"{top[0].mid} {dict(top[0].params)}"[:48], f"{100 * share:.0f}%",
                     r["description"], rn["description"], r["decision"], round(e_name, 1),
                     r["per_application_bits"], rn["per_application_bits"], round(ga, 2), round(gb, 2)])
    return {"table": md(rows, ["owner", "most common greedy choice", "share", "summon: search", "summon: named",
                               "decision: search", "E[naming bits]", "per app: search", "per app: named",
                               "gain/app: search", "gain/app: named"])}


# ------------------------------------------------------------------------------------------------
# 9. games
# ------------------------------------------------------------------------------------------------
CONDITIONS = {
    "off": {},
    "mix": {"open_agents": "mix", "open_share": 0.5},
    "only": {"open_agents": "only"},
    "asym01": {"open_agents": "mix", "open_share": 0.5, "open_gods": (0, 1)},
    "asym23": {"open_agents": "mix", "open_share": 0.5, "open_gods": (2, 3)},
}
POLICY_SETS = {"greedy": "greedy_private",
               "mixed": ["random", "greedy_private", "saver", "greedy_omniscient"]}


def _game_job(job):
    cond, pset, seed, gtkey, extra = job
    gt = _gt(gtkey)
    spec = {**CONDITIONS[cond], **(extra if CONDITIONS[cond] else {})}
    key = hashlib.sha256(json.dumps([cond, pset, seed, gtkey, spec, src_hash(), "v1"], default=str).encode()
                         ).hexdigest()[:24]
    path = GAME_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    from ..metrics import metrics
    from ..sim import GameConfig, run_game, payoffs
    cfg = GameConfig(gtype=gt, n_gods=4, policies=POLICY_SETS[pset], length="fixed", fixed_seconds=300.0,
                     seed=seed, **spec)
    t = time.time()
    log = run_game(cfg)
    m = metrics(log)
    own = log.a_owner[log.c_agent] if len(log.c_agent) else np.zeros(0, int)
    pb, pa = payoffs(log.c_before), payoffs(log.c_after)
    dpi = pa[np.arange(len(own)), own] - pb[np.arange(len(own)), own] if len(own) else np.zeros(0)
    per_agent = np.zeros(len(log.a_owner))
    np.add.at(per_agent, log.c_agent, dpi)
    commits = np.bincount(log.c_agent, minlength=len(log.a_owner)) if len(log.c_agent) else np.zeros(len(log.a_owner))
    lab = defaultdict(lambda: {"agents": 0, "cost": 0.0, "gain": 0.0, "commits": 0, "attempts": 0})
    for a, l in enumerate(log.a_label):
        d = lab[l]
        d["agents"] += 1
        d["cost"] += float(log.a_cost[a])
        d["gain"] += float(per_agent[a])
        d["commits"] += int(commits[a])
        d["attempts"] += int(log.a_attempts[a])
    out = {"cond": cond, "pset": pset, "seed": seed, "seconds": time.time() - t,
           "metrics": {k: m[k] for k in ("dynamism", "tension_rate", "spirals_per_100_commits", "lead_changes_per_100s",
                                         "welfare", "payoff_gini", "mutator_entropy_norm", "n_summons",
                                         "summon_cost_mean")},
           "final_payoff": [float(x) for x in log.final_payoff], "ranks": [int(x) for x in log.final_ranks()],
           "by_label": dict(lab), "labels": Counter(log.a_label),
           "counters": {k: float(v) for k, v in log.counters.items()}}
    GAME_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".tmp{os.getpid()}")
    tmp.write_text(json.dumps(out))
    os.replace(tmp, path)
    return out


def sec_games(gt: GridType, n_games: int, processes: int, conds=None, psets=None, extra=None) -> dict:
    from ..agentlang.pricing import game_states, reference_grids
    conds = conds or list(CONDITIONS)
    psets = psets or list(POLICY_SETS)
    extra = extra or {}
    jobs = [(c, p, 2000 + s, _key(gt), extra) for p in psets for s in range(n_games) for c in conds]
    reference_grids(gt)
    game_states(gt, 64)
    with mp.get_context("fork").Pool(processes) as pool:
        res = pool.map(_game_job, jobs, chunksize=1)
    by = defaultdict(list)
    for r in res:
        by[(r["cond"], r["pset"])].append(r)
    keys = ["dynamism", "tension_rate", "spirals_per_100_commits", "lead_changes_per_100s", "welfare", "payoff_gini",
            "mutator_entropy_norm", "summon_cost_mean"]
    rows = []
    for p in psets:
        for c in conds:
            rs = by[(c, p)]
            if not rs:
                continue
            row = [p, c, len(rs)]
            for k in keys:
                v = np.array([r["metrics"][k] for r in rs], float)
                row.append(f"{v.mean():.3g} ± {v.std(ddof=1) / math.sqrt(len(v)):.2g}" if len(v) > 1 else f"{v.mean():.3g}")
            share = np.mean([1 - r["labels"].get("program", 0) / max(1, sum(r["labels"].values())) for r in rs])
            app = np.mean([r["counters"].get("open_app_energy", 0.0) for r in rs])
            row += [f"{100 * share:.0f}%", f"{app:.0f}"]
            rows.append(row)
    table = md(rows, ["policies", "condition", "games"] + keys + ["open share of summons", "energy on applications"])
    lab = defaultdict(lambda: {"agents": 0, "cost": 0.0, "gain": 0.0, "commits": 0, "attempts": 0})
    for rs in by.values():
        for r in rs:
            for k, v in r["by_label"].items():
                for f in lab[k]:
                    lab[k][f] += v[f]
    lrow = [[k, v["agents"], v["cost"] / max(v["agents"], 1), v["commits"] / max(v["attempts"], 1),
             v["gain"] / max(v["commits"], 1), v["gain"] / max(v["agents"], 1)]
            for k, v in sorted(lab.items(), key=lambda kv: -kv[1]["agents"]) if v["agents"] >= 5]
    ltable = md(lrow, ["agent", "summoned", "mean summon cost", "commit rate", "owner payoff per commit",
                       "owner payoff per agent"])
    arows = []
    for p in psets:
        a01 = {r["seed"]: r for r in by[("asym01", p)]}
        a23 = {r["seed"]: r for r in by[("asym23", p)]}
        diffs, wins, n = [], 0, 0
        for s in sorted(set(a01) & set(a23)):
            ra, rb = a01[s]["ranks"], a23[s]["ranks"]
            for g in range(4):
                with_o = ra[g] if g in (0, 1) else rb[g]
                without = rb[g] if g in (0, 1) else ra[g]
                diffs.append(without - with_o)
            for r, gods in ((a01[s], (0, 1)), (a23[s], (2, 3))):
                wins += int(np.argmax(r["final_payoff"])) in gods
                n += 1
        if diffs:
            d = np.array(diffs, float)
            arows.append([p, len(d), f"{d.mean():+.2f} ± {d.std(ddof=1) / math.sqrt(len(d)):.2f}", f"{100 * wins / n:.0f}%"])
    atable = md(arows, ["policies", "god-games", "rank gain from open agents (+ = better)",
                        "games won by an open-agent god (50% = no edge)"])
    return {"table": table, "labels": ltable, "asymmetric": atable,
            "seconds": float(sum(r["seconds"] for r in res))}


# ------------------------------------------------------------------------------------------------
# 10. test vectors for a port
# ------------------------------------------------------------------------------------------------
VECTOR_PROGRAMS = {
    "empty_agent": "def agent(grid):\n    return []\n",
    "one_paint": 'def agent(grid):\n    return [paint_row(2, "red")]\n',
    "same_move_raw": 'def agent(grid):\n    return [move("paint", kind="line", region=(0, 2), colour=0)]\n',
    "same_move_area": 'def agent(grid):\n    return [paint(row(2), red)]\n',
    "renamed": 'def agent(g):\n    return [paint_row(2, "red")]\n',
    "computed_row": 'def agent(grid):\n    i = 2\n    return [paint_row(i, "red")]\n',
    "loop": 'def agent(grid):\n    return [paint(c, "red") for c in grid.cells if c.colour == "blue"]\n',
    "import_random": 'import random\n\ndef agent(grid):\n    return [paint_row(random.randrange(grid.size), "red")]\n',
    "from_import": 'from collections import Counter\n\ndef agent(grid):\n    return [paint_row(0, Counter(c.colour for c in grid.cells).most_common(1)[0][0])]\n',
    "helper_after": 'def agent(grid):\n    return helper(grid)\n\ndef helper(grid):\n    return []\n',
    "global_counter": 'n = 0\n\ndef agent(grid):\n    global n\n    n += 1\n    return []\n',
    "lambda_max": 'def agent(grid):\n    big = max(grid.cells, key=lambda c: c.value)\n    return [paint(big, "red")]\n',
    "literals": 'x = [0, 1, 255, -3, 1.5, "hi", "red", b"ab", True, None, ...]\n\ndef agent(grid):\n    return []\n',
    "fstring": 'def agent(grid):\n    s = f"{grid.size}x{grid.size!r}"\n    return []\n',
    "walrus_comp": 'def agent(grid):\n    if any((k := c.value) > 8 for c in grid.cells):\n        return [write(everything, k)]\n    return []\n',
    "class_def": 'class A:\n    x = 1\n\n    def f(self):\n        return self.x\n\ndef agent(grid):\n    return []\n',
    "greedy": 'def agent(grid):\n    best = max(moves("paint"), key=score)\n    return [best] if score(best) > score() else []\n',
}


def estimator_vectors() -> list:
    gt = GT
    pr = lambda r, c, k: Move("paint", {"kind": "cell", "region": (r, c), "colour": k})   # noqa: E731
    out = []
    cases = {
        "constant": [(pr(0, 0, 0),)] * 8,
        "two_way": [(pr(0, 0, 0),)] * 4 + [(pr(0, 1, 0),)] * 4,
        "sets": [(pr(0, 0, 0), pr(0, 1, 0)), (pr(0, 0, 0),), (pr(0, 1, 0),), ()] * 2,
        "spread": [(pr(i // 5, i % 5, 0),) for i in range(16)],
    }
    for name, acts in cases.items():
        d = decision_deterministic(acts, gt, 0.5)
        out.append({"case": name, "actions": [[m.key for m in a] for a in acts],
                    "joint": d["estimates"]["joint"] if math.isfinite(d["estimates"]["joint"]) else "inf",
                    "positional": d["estimates"]["positional"],
                    "set": d["estimates"]["set"] if math.isfinite(d["estimates"]["set"]) else "inf",
                    "naming": d["estimates"]["naming"], "decision": d["bits"], "binding": d["binding"]})
    rows = [[(pr(0, i % 2, 0),) for _ in range(4)] for i in range(6)]
    rows += [[(pr(0, j % 2, 0),) for j in range(4)] for _ in range(6)]
    d = decision_randomized(rows, gt, 0.5, 32, 12345)
    out.append({"case": "randomized_half", "actions_by_grid": [[[m.key for m in a] for a in r] for r in rows],
                "shuffles": 32, "shuffle_seed": 12345, "H_A_given_X": d["H_A_given_X"], "I_plugin": d["I_plugin"],
                "I_shuffle": d["I_shuffle"], "decision": d["bits"], "binding": d["binding"]})
    return out


def sec_vectors(gt: GridType) -> dict:
    progs = {}
    for name, src in VECTOR_PROGRAMS.items():
        e = {"source": src}
        for scheme in ("corpus", "uniform"):
            r = ast_bits(src, GT, scheme)
            e[scheme] = {k: round(r[k], 6) for k in ("structure", "names", "literals", "moves", "total")}
        e["ast_bytes"] = ast_bytes(src)
        progs[name] = e
    codes = {"gamma": {str(n): gamma_bits(n) for n in (1, 2, 3, 4, 7, 8, 255, 256, 1000)},
             "string": {s: string_bits(s) for s in ("", "a", "red", "hi\n", "é")},
             "float": {repr(v): float_bits(v) for v in (0.0, 1.5, 1e-05, 123456.789)}}
    sm = SplitMix64(12345)
    rng = {"splitmix64_seed_12345_first4": [sm.next() for _ in range(4)],
           "permutation_8_seed_1": SplitMix64(1).permutation(8)}
    seeds = {"derive_seed('measure', 'Grid(5,base10,rgby)', 0, 0)": derive_seed("measure", GT.key, 0, 0),
             "derive_seed('play', 7, 0)": derive_seed("play", 7, 0)}
    from ..agentlang.pricing import probe_grids, reference_grids, game_states
    U, S = reference_grids(GT)
    Gm = game_states(GT, 64)
    hexg = lambda g: g.sym.tobytes().hex() + ":" + g.col.tobytes().hex()   # noqa: E731
    fixtures = {"gtype": GT.key, "uniform": [hexg(g) for g in U], "structured": [hexg(g) for g in S],
                "game": [hexg(g) for g in Gm], "probes": [hexg(g) for g in probe_grids(GT, 24)]}
    out = {"version": "ast-bits-v1", "constants": {"P_EXT": P_EXT, "Q_MOVE": Q_MOVE}, "programs": progs,
           "codes": codes, "rng": rng, "seeds": seeds, "estimators": estimator_vectors()}
    here = Path(__file__).resolve().parent
    (here / "test_vectors.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    (here / "reference_grids_5_base10_rgby.json").write_text(json.dumps(fixtures) + "\n")
    rows = [[n, e["corpus"]["total"], e["uniform"]["total"], e["ast_bytes"]] for n, e in progs.items()]
    return {"table": md(rows, ["program", "ast-bits (corpus)", "ast-bits (uniform)", "ast-bytes"])}


# ------------------------------------------------------------------------------------------------
def main():
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        os.execv(sys.executable, [sys.executable] + sys.orig_argv[1:])
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--only", default="costs,weights,kraft,randomness,evasion,attack,secondlaw,search,fairness")
    ap.add_argument("--games", type=int, default=8)
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--conds", default="")
    ap.add_argument("--psets", default="")
    ap.add_argument("--summon-scale", type=float, default=1.0)
    ap.add_argument("--app-scale", type=float, default=0.01)
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    gt = _gt(a.type)
    out = {}
    for sec in a.only.split(","):
        t = time.time()
        if sec == "costs":
            out[sec] = sec_costs(gt, a.processes)
        elif sec == "weights":
            out[sec] = sec_weights(gt)
        elif sec == "kraft":
            out[sec] = sec_kraft(gt)
        elif sec == "randomness":
            out[sec] = sec_randomness(gt, a.processes)
        elif sec == "evasion":
            out[sec] = sec_evasion(gt)
        elif sec == "attack":
            out[sec] = sec_attack(gt, a.processes)
        elif sec == "secondlaw":
            out[sec] = sec_secondlaw(gt, a.processes)
        elif sec == "search":
            out[sec] = sec_search(gt, a.processes, a.summon_scale, a.app_scale)
        elif sec == "fairness":
            out[sec] = sec_fairness(gt)
        elif sec == "games":
            extra = {"open_summon_scale": a.summon_scale, "open_app_scale": a.app_scale}
            out[sec] = sec_games(gt, a.games, a.processes, a.conds.split(",") if a.conds else None,
                                 a.psets.split(",") if a.psets else None, extra)
        elif sec == "vectors":
            out[sec] = sec_vectors(gt)
        print(f"\n## {sec} ({time.time() - t:.0f} s)\n", flush=True)
        for k, v in out[sec].items():
            if isinstance(v, str):
                print(v, "\n")
            elif k != "data":
                print(k, json.dumps(v, indent=1, default=str)[:3000], "\n")
        sys.stdout.flush()
    if a.json:
        Path(a.json).write_text(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
