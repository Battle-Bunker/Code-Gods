"""Evaluation of the agent language and its pricing (results quoted in docs/agent-language.md).

    python3 -m gridlab.agentlang.evaluate                       # everything, Grid(5,base10,rgby)
    python3 -m gridlab.agentlang.evaluate --only costs,attack   # some sections
    python3 -m gridlab.agentlang.evaluate --games 16 --processes 4

Sections: costs (the example agents), astbytes (vs the MDL code), kraft, search (≤ log2 K and
compute-vs-name), attack, yields (per family, on game states), games (simulated games, by condition).
Game results are cached one JSON per game under .cache/agentlang/games/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import multiprocessing as mp
import os
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from ..core import GridType
from ..family import Draw
from .. import calibrate as cal
from .astbytes import ast_bytes, ast_nodes
from .elab import elaborate, unparse
from .examples import ATTACK, EXAMPLES, TEMPLATES, example
from .grammar import describe_bits, sample_program
from .interp import Owner, all_moves, run
from .pricing import CACHE_DIR, game_states, price, reference_grids, src_hash

log2 = math.log2
GT = GridType(5, "base10", "rgby")
OWNER_FAMILY = "seed1_line_painter"


def owner(fid: str, gt: GridType, seed: int = 1) -> Owner:
    from ..rules import by_id
    f = by_id(fid)
    d = Draw(f, f.sample(np.random.default_rng(seed), gt))
    return Owner(d, cal.survival(d, gt))


def md(rows: list[list], head: list[str]) -> str:
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for r in rows:
        out.append("| " + " | ".join(f"{x:.1f}" if isinstance(x, float) else str(x) for x in r) + " |")
    return "\n".join(out)


# ------------------------------------------------------------------------------------------------
def sec_costs(gt: GridType, fam: str = OWNER_FAMILY) -> dict:
    from ..program import Program, Step, Guard
    own = owner(fam, gt)
    rows, data = [], {}
    prog_equiv = {
        "paint_one_row": Program(steps=(Step.make("paint", {"kind": "line", "region": (0, 2), "colour": 0}),)),
        "fill_grid": Program(steps=(Step.make("paint", {"kind": "all", "region": (), "colour": 0}),)),
        "paint_best_line": Program(steps=(Step.make("paint", {"kind": "line*", "region": (), "colour": 0}),)),
        "recolour_tool": Program(steps=(Step.make("recolour", {"kind": "all", "region": (), "pair": (gt.C - 1, 0)}),)),
        "guarded_row": Program(Guard.make("line_count", {"line": (0, 0), "colour": 0, "m": 3, "neg": False}),
                               (Step.make("paint", {"kind": "line", "region": (0, 0), "colour": 0}),)),
    }
    for name, (kind, _) in EXAMPLES.items():
        src = example(name, gt)
        ir = elaborate(src, gt)
        t = time.time()
        c = price(ir, gt, own)
        dt = time.time() - t
        pe = prog_equiv.get(name)
        pc = pe.cost(gt) if pe is not None else None
        lines = sum(1 for l in src.splitlines() if l.strip() and not l.strip().startswith("#"))
        rows.append([name, kind, lines, c["description"], c["decision"], c["binding"], c["erase"], c["motion"],
                     c["ratchet"], c["total"], "–" if pc is None else round(pc, 1), ast_bytes(src),
                     int(c["steps_mean"])])
        data[name] = {k: c[k] for k in ("description", "decision", "destruction", "erase", "motion", "ratchet", "total",
                                        "binding", "path_bound", "chain_bound", "static_bound", "steps_mean",
                                        "abort_rate", "change_rate")}
        data[name].update({"H_mm": c["H"]["mm"], "H_se": c["H"]["se"], "coverage": c["H"]["coverage"],
                           "ast_bytes": ast_bytes(src), "ast_nodes": ast_nodes(src), "program_cost": pc,
                           "lines": lines, "seconds": dt})
    table = md(rows, ["agent", "kind", "lines", "description", "decision", "bound", "erase", "motion", "ratchet",
                      "total", "Program", "ast-bytes", "steps"])
    # the same search agents for other owners
    fams = ["seed1_line_painter", "conqueror", "mirrormancer", "staircase_climber", "rainbow_road", "lucky_token"]
    srows = []
    for fid in fams:
        try:
            o = owner(fid, gt)
        except Exception:
            continue
        r = [fid]
        for name in ("greedy_paint", "careful_greedy", "row_painter_search", "greedy_swap"):
            c = price(elaborate(example(name, gt), gt), gt, o)
            r.append(f"{c['total']:.0f} ({c['decision']:.1f})")
        srows.append(r)
    stable = md(srows, ["owner family", "greedy_paint", "careful_greedy", "row_painter_search", "greedy_swap"])
    return {"table": table, "by_owner": stable, "data": data}


def sec_astbytes(gt: GridType) -> dict:
    xs, ys = [], []
    for name in EXAMPLES:
        src = example(name, gt)
        xs.append(ast_bytes(src)); ys.append(describe_bits(elaborate(src, gt), gt)[0])
    rng = np.random.default_rng(5)
    rx, ry = [], []
    while len(rx) < 1500:
        p, lp = sample_program(gt, rng, max_nodes=120, max_depth=10)
        src = unparse(p, gt)
        rx.append(ast_bytes(src)); ry.append(-lp)
    xs, ys, rx, ry = map(np.array, (xs, ys, rx, ry))
    fit = lambda x, y: np.polyfit(x, y, 1)
    return {"examples_corr": float(np.corrcoef(xs, ys)[0, 1]), "examples_bits_per_byte": float((ys / xs).mean()),
            "examples_fit": fit(xs, ys).tolist(),
            "random_corr": float(np.corrcoef(rx, ry)[0, 1]), "random_bits_per_byte": float((ry / rx).mean()),
            "random_fit": fit(rx, ry).tolist(), "n_random": len(rx)}


def sec_weights(gt: GridType) -> dict:
    """Description bits under the uniform grammar vs a grammar whose production weights are fitted
    (add-one) on the OTHER example agents (leave-one-out). Mutator choice and literals stay uniform,
    so a literal mutator call keeps the Program step's code."""
    from . import lang
    from .lang import Coder
    from .grammar import walk_program
    from .lang import Ctx
    names = list(EXAMPLES) + [f"t:{k}" for k in TEMPLATES if k not in EXAMPLES]
    srcs = {n: (example(n, gt) if not n.startswith("t:") else
                __import__("gridlab.agentlang.examples", fromlist=["x"]).colour_fill(TEMPLATES[n[2:]][1], gt))
            for n in names}
    irs = {n: elaborate(s, gt) for n, s in srcs.items()}
    events = {}
    for n, ir in irs.items():
        S = Coder(); S.depth = 0
        walk_program(Ctx(gt), ir, S)
        events[n] = [e[1] for e in S.events if isinstance(e[1], tuple) and len(e[1]) == 2 and e[1][0] not in
                     ("mutator", "var", "lit", "field", "colour", "def", "bsize", "llen")]
    rows = []
    saved = dict(lang.WEIGHTS)
    try:
        for n in EXAMPLES:
            cnt = Counter(ev for m, evs in events.items() if m != n for ev in evs)
            lang.WEIGHTS.clear()
            lang.WEIGHTS.update({k: 1.0 + v for k, v in cnt.items()})
            fitted = describe_bits(irs[n], gt)[0]
            lang.WEIGHTS.clear()
            uni = describe_bits(irs[n], gt)[0]
            rows.append([n, uni, fitted, f"{100 * (1 - fitted / uni):.0f}%"])
    finally:
        lang.WEIGHTS.clear()
        lang.WEIGHTS.update(saved)
    return {"table": md(rows, ["agent", "uniform grammar", "fitted grammar (leave-one-out)", "saving"])}


def sec_kraft(gt: GridType) -> dict:
    from ..mutators import _describe_bits, available
    comp = {m.id: sum(2.0 ** -_describe_bits(m.fields, p, gt) for p in m.space(gt)) for m in available(gt)}
    # halting mass within size caps: Σ_{programs within the cap} 2^-bits = P(sampler finishes within the cap)
    from .grammar import walk_program
    from .lang import Ctx, Sampler, _TooBig
    mass = {}
    for cap in (10, 20, 40, 80, 160):
        rng = np.random.default_rng(cap)
        ok, n = 0, 4000
        for _ in range(n):
            S = Sampler(rng, max_nodes=cap, max_depth=10 ** 6)
            try:
                walk_program(Ctx(gt), None, S)
                ok += 1
            except _TooBig:
                pass
            except RecursionError:
                pass
        mass[cap] = ok / n
    return {"field_code_sums": comp, "halting_mass_by_cap": mass}


def sec_search(gt: GridType, fam: str = OWNER_FAMILY) -> dict:
    from ..mutators import by_id
    own = owner(fam, gt)
    rows = []
    specs = {"greedy_paint": len(all_moves(gt, "paint")), "careful_greedy": len(all_moves(gt, "paint")),
             "row_painter_search": gt.N * gt.C, "greedy_swap": 2 * gt.N * (gt.N - 1),
             "two_greedy_steps": len(all_moves(gt, "paint")) ** 2, "full_greedy": sum(
                 len(all_moves(gt, m)) for m in {x.id for x in __import__("gridlab.mutators", fromlist=["x"]).available(gt)})}
    for name, K in specs.items():
        ir = elaborate(example(name, gt), gt)
        c = price(ir, gt, own, keep_samples=True)
        acts = c["samples"]["actions"]
        # naming the chosen move(s) as literal calls: log2 #mutators + D(params) per move
        nm = len(__import__("gridlab.mutators", fromlist=["x"]).available(gt))
        name_bits = []
        for a in acts:
            b = 0.0
            for mv in a:
                mid, items = mv[0], dict(mv[1])
                b += log2(nm) + by_id(mid).describe_bits(items, gt)
            name_bits.append(b)
        rows.append([name, K, log2(K), c["decision"], float(np.mean(name_bits)), c["description"],
                     c["description"] + c["decision"]])
    return {"table": md(rows, ["agent", "K candidates", "log2 K", "decision", "E[naming bits]", "description",
                               "description + decision"])}


def sec_attack(gt: GridType) -> dict:
    rows = []
    for thr in (11, 12, 13, 14, 15):
        src = ATTACK.replace(">= 13", f">= {thr}")
        ir = elaborate(src, gt)
        c = price(ir, gt)
        bc = c["H_by_component"]
        rows.append([thr, bc["uniform"]["mm"], bc["structured"]["mm"], bc["game"]["mm"], c["decision"],
                     c["binding"]])
    return {"table": md(rows, ["threshold", "H uniform only", "H structured", "H game states", "charged (mixture)",
                               "bound"])}


def sec_yields(gt: GridType, families=None, n_states: int = 64) -> dict:
    """Mean gain in the owner's surprisal per bit of cost, on game states, for each language template
    and for the best of 512 library programs."""
    from ..policy import program_library
    from ..program import random_program
    from .agent import LangAgent
    from .examples import template_instances
    from ..rules import FAMILIES
    states = game_states(gt, n_states)
    progs, pcosts = program_library(gt, random_program, 4096)
    idx = np.random.default_rng(0).choice(len(progs), 512, replace=False)
    fams = families or ["seed1_line_painter", "conqueror", "mirrormancer", "staircase_climber", "rainbow_road",
                        "lucky_token", "snap", "young_tableau", "treasure_map", "homebody", "chessmaster",
                        "number_bonds"]
    rows, data = [], {}
    for fid in fams:
        try:
            o = owner(fid, gt)
        except Exception:
            continue
        base = np.array([o.score(g, gt) for g in states])

        def gain(ag_apply):
            ys = [ag_apply(g) for g in states]
            return float(np.mean([o.score(y, gt) for y in ys]) - base.mean())

        best_prog = max(((gain(lambda g, p=progs[i]: p.run(g, gt)) / pcosts[i]), i) for i in idx)
        by_kind = defaultdict(list)
        for name, kind, src in template_instances(gt):
            ag = LangAgent(src, gt, o if "score" in src else None, name, kind)
            by_kind[kind].append((gain(ag.run) / ag.cost(), name))
        r = [fid, round(100 * best_prog[0], 1)]
        for k in ("relative", "conditional", "loop", "fixed", "search"):
            v = max(by_kind.get(k, [(float("nan"), "")]))
            r.append(f"{100 * v[0]:.1f}" + (f" ({v[1]})" if k == "search" else ""))
        rows.append(r)
        data[fid] = r
    return {"table": md(rows, ["owner family", "best of 512 Programs", "relative", "conditional", "loop",
                               "fixed (tool)", "search (best template)"]), "data": data}


def sec_inplay(gt: GridType, seeds=(1000, 1001, 1002, 1003), n_states: int = 400) -> dict:
    """Is the reference mixture representative? Decision bits as priced vs H(action) measured on the
    objects actually present (snapshots) in language-heavy games, for the search templates."""
    from ..sim import GameConfig, run_game
    from .pricing import entropy_stats
    names = ("greedy_paint", "careful_greedy", "careful_greedy_write", "careful_greedy_count_on")
    pairs = []
    for seed in seeds:
        states, box = [], {}

        def hook(w, ev):
            if ev == "snapshot" and w.t > 0:
                states.extend(w.objects)
            if ev == "end":
                box["w"] = w

        run_game(GameConfig(gtype=gt, n_gods=4, policies="greedy_private", length="fixed", fixed_seconds=300.0,
                            seed=seed, agent_language="mix", lang_share=0.9), hook=hook)
        w = box["w"]
        idx = np.random.default_rng(0).choice(len(states), min(n_states, len(states)), replace=False)
        S = [states[i] for i in idx]
        for god in range(4):
            for a in w.lang_libraries[god][0]:
                if a.name in names:
                    acts = [run(a.prog, gt, g, a.owner, record=True).actions for g in S]
                    pairs.append((a.cost_terms()["decision"], entropy_stats(acts)["mm"], a.name,
                                  w.draws[god].family.id))
    arr = np.array([(p[0], p[1]) for p in pairs if p[0] > 0 or p[1] > 0])
    d = arr[:, 1] - arr[:, 0]
    return {"pairs": len(arr), "mean_priced": float(arr[:, 0].mean()), "mean_in_play": float(arr[:, 1].mean()),
            "mean_abs_diff": float(np.abs(d).mean()), "within_1_bit": float((np.abs(d) <= 1).mean()),
            "under_by_more_than_1": float((d > 1).mean()), "max_under": float(d.max()), "max_over": float(-d.min())}


# ------------------------------------------------------------------------------------------------
# games
# ------------------------------------------------------------------------------------------------
CONDITIONS = {
    "off": {},
    "mix": {"agent_language": "mix", "lang_share": 0.5},
    "heavy": {"agent_language": "mix", "lang_share": 0.9},
    "only": {"agent_language": "only"},
    "asym01": {"agent_language": "mix", "lang_share": 0.5, "lang_gods": [0, 1]},
    "asym23": {"agent_language": "mix", "lang_share": 0.5, "lang_gods": [2, 3]},
}
POLICY_SETS = {"greedy": ["greedy_private"] * 4, "mixed": ["random", "greedy_private", "saver", "greedy_omniscient"]}
GAME_DIR = CACHE_DIR / "games"


def _game_job(job):
    cond, pset, seed, gtkey = job
    n, s, c = gtkey.split(",")
    gt = GridType(int(n), s, c)
    key = hashlib.sha256(json.dumps([cond, pset, seed, gtkey, CONDITIONS[cond], src_hash(), "v2"]).encode()).hexdigest()[:24]
    path = GAME_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    from ..metrics import metrics
    from ..sim import GameConfig, run_game, payoffs
    cfg = GameConfig(gtype=gt, n_gods=4, policies=POLICY_SETS[pset], length="fixed", fixed_seconds=300.0,
                     seed=seed, **CONDITIONS[cond])
    t = time.time()
    log = run_game(cfg)
    m = metrics(log)
    # realised owner payoff change caused by each agent (sum over its commits), and per-class totals
    G = log.n_gods
    own = log.a_owner[log.c_agent] if len(log.c_agent) else np.zeros(0, int)
    pb, pa = payoffs(log.c_before), payoffs(log.c_after)
    dpi = pa[np.arange(len(own)), own] - pb[np.arange(len(own)), own] if len(own) else np.zeros(0)
    per_agent = np.zeros(len(log.a_owner))
    np.add.at(per_agent, log.c_agent, dpi)
    commits = np.bincount(log.c_agent, minlength=len(log.a_owner)) if len(log.c_agent) else np.zeros(len(log.a_owner))
    cls = defaultdict(lambda: {"agents": 0, "cost": 0.0, "gain": 0.0, "commits": 0})
    lab_stats = defaultdict(lambda: {"agents": 0, "cost": 0.0, "gain": 0.0, "commits": 0, "attempts": 0})
    for a, lab in enumerate(log.a_label):
        for d in (cls[lab.split(":")[0]], lab_stats[lab]):
            d["agents"] += 1
            d["cost"] += float(log.a_cost[a])
            d["gain"] += float(per_agent[a])
            d["commits"] += int(commits[a])
        lab_stats[lab]["attempts"] += int(log.a_attempts[a])
    out = {"cond": cond, "pset": pset, "seed": seed, "gtype": gtkey, "seconds": time.time() - t,
           "metrics": {k: m[k] for k in ("dynamism", "tension_rate", "harmony_rate", "spirals_per_100_commits",
                                         "spiral_len_mean", "lead_changes_per_100s", "welfare", "payoff_gini",
                                         "late_activity", "mutator_entropy_norm", "n_summons", "n_commits",
                                         "summon_cost_mean", "object_volatility", "stagnation_frac")},
           "families": log.families, "final_payoff": [float(x) for x in log.final_payoff],
           "ranks": [int(x) for x in log.final_ranks()], "classes": dict(cls), "by_label": dict(lab_stats),
           "labels": Counter(log.a_label)}
    GAME_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".tmp{os.getpid()}")
    tmp.write_text(json.dumps(out))
    os.replace(tmp, path)
    return out


def sec_games(gt: GridType, n_games: int, processes: int, conds=None, psets=None) -> dict:
    conds = conds or list(CONDITIONS)
    psets = psets or list(POLICY_SETS)
    jobs = [(c, p, 1000 + s, f"{gt.N},{gt.symbols},{gt.colours}") for p in psets for s in range(n_games) for c in conds]
    # warm the shared caches once in this process (program library, game corpus, survival tables)
    reference_grids(gt); game_states(gt, 64)
    if processes > 1:
        with mp.get_context("fork").Pool(processes) as pool:
            res = pool.map(_game_job, jobs, chunksize=1)
    else:
        res = [_game_job(j) for j in jobs]
    by = defaultdict(list)
    for r in res:
        by[(r["cond"], r["pset"])].append(r)
    keys = ["dynamism", "tension_rate", "spirals_per_100_commits", "lead_changes_per_100s", "welfare",
            "payoff_gini", "late_activity", "mutator_entropy_norm", "n_summons", "summon_cost_mean"]
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
            lang_share = np.mean([1 - r["labels"].get("program", 0) / max(1, sum(r["labels"].values())) for r in rs])
            row.append(f"{100 * lang_share:.0f}%")
            rows.append(row)
    table = md(rows, ["policies", "condition", "games"] + keys + ["lang share of summons"])
    # realised yield by agent class (gain in owner payoff per bit), pooled over language conditions
    crow = []
    for p in psets:
        agg = defaultdict(lambda: {"agents": 0, "cost": 0.0, "gain": 0.0, "commits": 0})
        for c in conds:
            for r in by[(c, p)]:
                for k, v in r["classes"].items():
                    for f in agg[k]:
                        agg[k][f] += v[f]
        for k, v in sorted(agg.items()):
            crow.append([p, k, v["agents"], v["commits"], v["cost"] / max(v["agents"], 1),
                         v["gain"] / max(v["cost"], 1e-9)])
    ctable = md(crow, ["policies", "agent class", "agents", "commits", "mean cost (bits)", "payoff gained per bit"])
    # the same per template (language agents) and for programs
    lab = defaultdict(lambda: {"agents": 0, "cost": 0.0, "gain": 0.0, "commits": 0, "attempts": 0})
    for p in psets:
        for c in conds:
            for r in by[(c, p)]:
                for k, v in r.get("by_label", {}).items():
                    for f in lab[k]:
                        lab[k][f] += v[f]
    lrow = [[k, v["agents"], v["cost"] / max(v["agents"], 1), v["commits"] / max(v["attempts"], 1),
             v["gain"] / max(v["commits"], 1), v["gain"] / max(v["cost"], 1e-9)]
            for k, v in sorted(lab.items(), key=lambda kv: -kv[1]["agents"]) if v["agents"] >= 5]
    ltable = md(lrow, ["agent", "summoned", "mean cost", "commit rate", "owner payoff per commit",
                       "owner payoff per bit"])
    # asymmetric games: rank of the same god with vs without language (paired by seed)
    arows = []
    for p in psets:
        a01 = {r["seed"]: r for r in by[("asym01", p)]}
        a23 = {r["seed"]: r for r in by[("asym23", p)]}
        diffs, wins_lang, n = [], 0, 0
        for s in sorted(set(a01) & set(a23)):
            ra, rb = a01[s]["ranks"], a23[s]["ranks"]
            for g in range(4):
                with_l = ra[g] if g in (0, 1) else rb[g]
                without = rb[g] if g in (0, 1) else ra[g]
                diffs.append(without - with_l)
            for r, gods in ((a01[s], (0, 1)), (a23[s], (2, 3))):
                w = int(np.argmax(r["final_payoff"]))
                wins_lang += w in gods
                n += 1
        if diffs:
            d = np.array(diffs, float)
            arows.append([p, len(d), f"{d.mean():+.2f} ± {d.std(ddof=1) / math.sqrt(len(d)):.2f}",
                          f"{100 * wins_lang / n:.0f}%"])
    atable = md(arows, ["policies", "god-games", "rank gain from language (+ = better)",
                        "games won by a language god (50% = no edge)"])
    return {"table": table, "classes": ctable, "labels": ltable, "asymmetric": atable,
            "seconds": float(sum(r["seconds"] for r in res))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--only", default="costs,astbytes,weights,kraft,search,attack,yields,inplay,games")
    ap.add_argument("--games", type=int, default=16)
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--conds", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    n, s, c = a.type.split(",")
    gt = GridType(int(n), s, c)
    out = {}
    for sec in a.only.split(","):
        t = time.time()
        if sec == "costs":
            out[sec] = sec_costs(gt)
        elif sec == "astbytes":
            out[sec] = sec_astbytes(gt)
        elif sec == "weights":
            out[sec] = sec_weights(gt)
        elif sec == "kraft":
            out[sec] = sec_kraft(gt)
        elif sec == "search":
            out[sec] = sec_search(gt)
        elif sec == "attack":
            out[sec] = sec_attack(gt)
        elif sec == "inplay":
            out[sec] = sec_inplay(gt)
        elif sec == "yields":
            out[sec] = sec_yields(gt)
        elif sec == "games":
            out[sec] = sec_games(gt, a.games, a.processes, a.conds.split(",") if a.conds else None)
        print(f"\n## {sec} ({time.time() - t:.0f} s)\n")
        r = out[sec]
        for k, v in r.items():
            if isinstance(v, str):
                print(v, "\n")
            elif k != "data":
                print(k, json.dumps(v, indent=1, default=str)[:3000])
    if a.json:
        Path(a.json).write_text(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
