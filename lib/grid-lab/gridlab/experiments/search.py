"""Search around the edges of the design: one-at-a-time sensitivity, then random search with
successive halving over the joint knob space, scored by the objective in common.objective.

    python3 -m gridlab.experiments.search sweep                  # one knob at a time from `old`
    python3 -m gridlab.experiments.search halving --n 32         # random search + successive halving
    python3 -m gridlab.experiments.search front                  # print the Pareto front of everything run

All candidates are evaluated on the same training specs (common random numbers; spec seed 200000,
disjoint from the baseline's seed 1 and the held-out seed 9000000), so differences between
candidates are paired. Every evaluated point is appended to .cache/experiments/search-points.jsonl.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
from pathlib import Path

import numpy as np

from .common import (BASE, CACHE, GTYPES, add_dyn2, family_fairness, god_rows, make_specs, md_table, merge,
                     mutator_table, policy_table, run_batch)

TRAIN_SEED = 200_000
POINTS = CACHE / "search-points.jsonl"

# knob -> candidate values (first value = the old default)
SPACE: dict = {
    "config.cost_scale": [1.0, 0.5, 2.0, 4.0],
    "config.starting_energy": [100.0, 50.0, 200.0],
    "config.energy_per_second": [1.0, 0.5, 2.0],
    "config.metabolic_cost": [0.0, 0.002, 0.005, 0.01, 0.02],
    "config.agent_half_life": [None, 60.0, 150.0, 400.0],
    "config.max_agents": [200, 40, 12],
    "config.spawn_rate_hz": [0.1, 0.25, 0.5],
    "config.starting_objects": [10, 20, 40],
    "config.dealer": ["distinct", "balanced_camps"],
    "knobs.move": [0.35, 0.15, 0.7, 1.2],
    "knobs.erasure": ["shannon", "hartley"],
    "knobs.scope.global": [1.0, 1.5, 2.5],
    "knobs.kind.bijective": [1.0, 0.5, 2.0],
    "exclude_low_ceiling": [0.0, 20.0],
    "knobs.disabled": [["flatten"], []],
}
# the interaction rate is a room setting rather than part of the ecosystem; swept separately
RATE_VALUES = [100.0, 50.0, 20.0, 10.0]


def point_to_setting(pt: dict) -> dict:
    over: dict = {}
    for k, v in pt.items():
        if k == "exclude_low_ceiling":
            if v:
                over["exclude_low_ceiling"] = v
            continue
        parts = k.split(".")
        d = over
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = v
    return merge(BASE, over)


def structural_unfairness(rows: list[dict]) -> float:
    """SD across god-slots of the part of z explained by family *features* (camp, ceiling bits,
    layer count, whether symbols matter), after removing policy effects: unfairness along known axes,
    estimable from far fewer games than per-family dispersion."""
    if not rows:
        return 0.0
    from ..rules import by_id
    pols = sorted(set(r["policy"] for r in rows))
    camps = ["alternator", "clumper", "neutral"]
    X, y = [], []
    for r in rows:
        f = by_id(r["family"])
        x = [1.0] + [float(r["policy"] == p) for p in pols[1:]]
        feat = [float(f.camp == c) for c in camps[1:]] + [min(r["ceil"], 80) / 80.0, len(f.layers) / 3.0,
                                                          float("symbol" in f.layers)]
        X.append(x + feat)
        y.append(r["z"])
    X, y = np.array(X), np.array(y)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    k = 1 + len(pols) - 1
    fitted = X[:, k:] @ beta[k:]
    return float(fitted.std())


def evaluate(pt: dict, specs, label: str = "", processes: int = 4) -> dict:
    st = point_to_setting(pt)
    rs = run_batch(st, specs, processes, label=label, verbose=False)
    add_dyn2(rs)
    rows = god_rows(rs)
    pt_tab = policy_table(rows)
    mt = mutator_table(rs)
    pz = [v["z"] for v in pt_tab.values()]
    su = structural_unfairness(rows)
    unused = sum(1 for v in mt.values() if v["n_families_2pct"] == 0)
    dyn = np.array([r["dynamism2"] for r in rs])
    out = {"point": pt, "n": len(rs), "dyn2": float(dyn.mean()), "dyn2_se": float(dyn.std() / math.sqrt(len(dyn))),
           "dyn1": float(np.mean([r["dynamism"] for r in rs])),
           "struct_unfair": su, "policy_range": float(max(pz) - min(pz)),
           "policy_z": {p: round(v["z"], 3) for p, v in pt_tab.items()},
           "unused_mutators": unused,
           "autocorr": float(np.mean([r["snap_autocorr"] for r in rs])),
           "climbs_held": float(np.mean([r["climbs_held_per_100s"] for r in rs])),
           "durable_leads": float(np.mean([r["durable_lead_changes_per_obj_100s"] for r in rs])),
           "crossings": float(np.mean([r["crossings_per_pair_100s"] for r in rs])),
           "hits": float(np.mean([r["hits_per_obj_s"] for r in rs])),
           "wall": float(np.sum([r["wall_seconds"] for r in rs]))}
    out["J"] = score(out)
    with open(POINTS, "a") as fh:
        fh.write(json.dumps({**out, "label": label}, default=str) + "\n")
    return out


def score(o: dict) -> float:
    """J = dyn2 - 1.0*max(0, struct_unfair - 0.03) - 0.5*max(0, policy_range - 0.15) - 0.01*unused."""
    return (o["dyn2"] - 1.0 * max(0.0, o["struct_unfair"] - 0.03) - 0.5 * max(0.0, o["policy_range"] - 0.15)
            - 0.01 * o["unused_mutators"])


def fmt(o: dict) -> list:
    return [f"{o['J']:.3f}", f"{o['dyn2']:.3f}±{o['dyn2_se']:.3f}", f"{o['struct_unfair']:.3f}",
            f"{o['policy_range']:.3f}", o["unused_mutators"], f"{o['autocorr']:.2f}", f"{o['climbs_held']:.2f}",
            f"{o['durable_leads']:.2f}", f"{o['crossings']:.2f}", f"{o['hits']:.2f}"]


HDR = ["J", "dyn2", "struct. unfair", "policy range", "unused mut.", "autocorr", "held climbs/100s",
       "durable leads", "crossings", "hits/obj/s"]


def sweep(n_per_type: int, processes: int) -> None:
    specs = make_specs(GTYPES, n_per_type, TRAIN_SEED)
    base = evaluate({}, specs, "sweep:old", processes)
    rows = [["old", "-"] + fmt(base)]
    print(md_table(["knob", "value"] + HDR, rows), flush=True)
    items = [(k, v) for k, vals in SPACE.items() for v in vals[1:]] + [("config.interaction_rate_hz", r)
                                                                      for r in RATE_VALUES[1:]]
    for k, v in items:
        o = evaluate({k: v}, specs, f"sweep:{k}={v}", processes)
        rows.append([k, str(v)] + fmt(o))
        print("| " + " | ".join(str(x) for x in rows[-1]) + " |", flush=True)


def sample_point(rng: np.random.Generator) -> dict:
    pt = {}
    for k, vals in SPACE.items():
        pt[k] = vals[int(rng.integers(len(vals)))]
    return pt


def halving(n: int, rungs: list[int], processes: int, seed: int, seeds_from: list[dict] | None = None) -> list[dict]:
    rng = np.random.default_rng(seed)
    pts = [dict(p) for p in (seeds_from or [])]
    while len(pts) < n:
        pts.append(sample_point(rng))
    for ri, per in enumerate(rungs):
        specs = make_specs(GTYPES, per, TRAIN_SEED)
        res = [evaluate(p, specs, f"halving:r{ri}:{i}", processes) for i, p in enumerate(pts)]
        res.sort(key=lambda o: -o["J"])
        print(f"\n#### rung {ri}: {len(pts)} points x {len(specs)} games")
        print(md_table(["#"] + HDR + ["point (changes from old)"],
                       [[i] + fmt(o) + [diff_str(o["point"])] for i, o in enumerate(res)]), flush=True)
        keep = max(1, len(pts) // 3) if ri < len(rungs) - 1 else len(pts)
        pts = [o["point"] for o in res[:keep]]
    return res


def diff_str(pt: dict) -> str:
    out = []
    for k, v in pt.items():
        if k in SPACE and v == SPACE[k][0]:
            continue
        out.append(f"{k.split('.', 1)[-1]}={v}")
    return ", ".join(out) or "(old)"


def load_points() -> list[dict]:
    if not POINTS.exists():
        return []
    return [json.loads(l) for l in open(POINTS)]


def pareto(points: list[dict], keys=(("dyn2", 1), ("struct_unfair", -1), ("policy_range", -1))) -> list[dict]:
    front = []
    for p in points:
        dominated = False
        for q in points:
            if q is p:
                continue
            ge = all(s * q[k] >= s * p[k] for k, s in keys)
            gt = any(s * q[k] > s * p[k] for k, s in keys)
            if ge and gt:
                dominated = True
                break
        if not dominated:
            front.append(p)
    return sorted(front, key=lambda o: -o["dyn2"])


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.search", description=__doc__.split("\n")[0])
    ap.add_argument("mode", choices=["sweep", "halving", "front"])
    ap.add_argument("--per-type", type=int, default=8, help="sweep: games per GridType")
    ap.add_argument("--n", type=int, default=27, help="halving: initial random points")
    ap.add_argument("--rungs", default="4,12,32", help="halving: games per GridType at each rung")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--min-games", type=int, default=100, help="front: only points evaluated on >= this many games")
    a = ap.parse_args(argv)
    if a.mode == "sweep":
        sweep(a.per_type, a.processes)
    elif a.mode == "halving":
        halving(a.n, [int(x) for x in a.rungs.split(",")], a.processes, a.seed)
    else:
        pts = [p for p in load_points() if p["n"] >= a.min_games]
        uniq = {}
        for p in pts:
            uniq[(json.dumps(p["point"], sort_keys=True, default=str), p["n"])] = p
        fr = pareto(list(uniq.values()))
        print(md_table(HDR + ["games", "point"], [fmt(o) + [o["n"], diff_str(o["point"])] for o in fr]))


if __name__ == "__main__":
    main()
