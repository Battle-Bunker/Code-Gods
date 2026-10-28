"""Economy / lifecycle experiments.

    python3 -m gridlab.explore.economy.study sweep  [--per-type 24] [--only gas,charges]
    python3 -m gridlab.explore.economy.study run    --settings old,rec [--per-type 40] [--seed 500000]
    python3 -m gridlab.explore.economy.study validate --a old --b rec [--per-type 60]   (held-out seeds)
    python3 -m gridlab.explore.economy.study detail --settings old,rec                   (curves by age/time)

Specs are paired across settings (common random numbers). Training spec seed 500000; held-out 9500000.
Every summary row is appended to .cache/explore-economy/points.jsonl.
"""
from __future__ import annotations

import argparse
import json
import math

import numpy as np

from ...experiments import common as C
from .batch import CACHE, FOUR, HELD_OUT, TRAIN_SEED, esetting, make_specs, run_batch
from .designs import NAMED, SWEEP

POINTS = CACHE / "points.jsonl"

COLS = [("dyn2", "dynamism2"), ("leadL", "lead_changes_late"), ("cross", "crossings_per_pair_100s"),
        ("tens", "sig_tension_rate"), ("climb", "climbs_held_per_100s"), ("stag", "stagnation_frac"),
        ("late", "late_activity"), ("live", "live_mean"), ("uLife", "useful_life_ratio"),
        ("tau25", "tau_25"), ("hold25", "hold_25"), ("lshare", "leader_share_final"), ("unspent", "energy_unspent_share")]


def nanmean(v):
    v = np.array([x for x in v if x is not None], float)
    v = v[np.isfinite(v)]
    return float(v.mean()) if v.size else float("nan")


def summarise(rs: list[dict], base: list[dict] | None = None) -> dict:
    out = {k: nanmean([r.get(m) for r in rs]) for k, m in COLS}
    d = np.array([r["dynamism2"] for r in rs])
    out["dyn2_se"] = float(d.std() / math.sqrt(len(d)))
    if base is not None:
        dd = np.array([r["dynamism2"] - b["dynamism2"] for r, b in zip(rs, base)])
        out["d_dyn2"], out["d_dyn2_ci"] = float(dd.mean()), float(1.96 * dd.std() / math.sqrt(len(dd)))
    rows = C.god_rows(rs)
    pt = C.policy_table(rows)
    out["pz"] = {p: round(v["z"], 3) for p, v in pt.items()}
    out["pz_ci"] = {p: (round(v["lo"], 3), round(v["hi"], 3)) for p, v in pt.items()}
    out["pwin"] = {p: round(v["win_ratio"], 2) for p, v in pt.items()}
    z = list(out["pz"].values())
    out["prange"] = float(max(z) - min(z)) if z else 0.0
    out["n"] = len(rs)
    return out


def score(o: dict) -> float:
    """J = dyn2 - 0.5 * max(0, policy z range - 0.15): dynamic, and no policy dominates."""
    return o["dyn2"] - 0.5 * max(0.0, o["prange"] - 0.15)


HDR = ["setting", "J", "dyn2", "Δdyn2 vs base"] + [k for k, _ in COLS[1:]] + ["policy z (rand/greedy/saver/coop)", "range", "win ratio saver"]


def row(name: str, o: dict) -> list:
    pz = " / ".join(f"{o['pz'].get(p, float('nan')):.2f}" for p in FOUR)
    d = f"{o['d_dyn2']:+.3f}±{o['d_dyn2_ci']:.3f}" if "d_dyn2" in o else "-"
    return ([name, f"{score(o):.3f}", f"{o['dyn2']:.3f}", d] + [f"{o[k]:.3g}" for k, _ in COLS[1:]]
            + [pz, f"{o['prange']:.2f}", f"{o['pwin'].get('saver', float('nan')):.2f}"])


def log_point(name: str, st: dict, o: dict, seed: int) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    with open(POINTS, "a") as fh:
        fh.write(json.dumps({"name": name, "seed": seed, "setting": {"config": st["config"], "econ": st["econ"]},
                             **o, "J": score(o)}, default=str) + "\n")


def evaluate(names_settings, per_type: int, seed: int, processes: int, mix: str = "four", base_name: str = "old"):
    specs = make_specs(C.GTYPES, per_type, seed, mix)
    base_rs = run_batch(NAMED[base_name], specs, processes, label=base_name)
    print(C.md_table(HDR, []), flush=True)
    res = {}
    for name, st in names_settings:
        rs = base_rs if name == base_name else run_batch(st, specs, processes, label=name, verbose=False)
        o = summarise(rs, base_rs)
        res[name] = (o, rs)
        log_point(name, st, o, seed)
        print("| " + " | ".join(str(x) for x in row(name, o)) + " |", flush=True)
    return res, base_rs


TABLE_HDR = ["setting", "n", "Δdyn2 [95% CI]", "dyn2", "lead chg late", "crossings", "held climbs", "tau25",
             "live agents", "useful-life", "unspent", "z random", "z greedy", "z saver [CI]", "z coop", "range"]


def points_table(seed: int, names=None) -> str:
    """Latest logged summary per setting for one spec seed, in logging order."""
    pts = {}
    if POINTS.exists():
        for l in open(POINTS):
            p = json.loads(l)
            if p["seed"] == seed and (names is None or any(p["name"] == n or p["name"].startswith(n + "=") for n in names)):
                pts[p["name"]] = p
    rows = []
    for n, o in pts.items():
        z = o["pz"]
        lo, hi = o["pz_ci"].get("saver", (float("nan"),) * 2)
        rows.append([n, o["n"], f"{o.get('d_dyn2', 0):+.3f} ± {o.get('d_dyn2_ci', 0):.3f}", f"{o['dyn2']:.3f}",
                     f"{o['leadL']:.1f}", f"{o['cross']:.2f}", f"{o['climb']:.2f}", f"{o['tau25']:.2f}",
                     f"{o['live']:.0f}", f"{o['uLife']:.2f}", f"{o['unspent']:.2f}", f"{z.get('random', 0):.2f}",
                     f"{z.get('greedy_private', 0):.2f}", f"{z.get('saver', 0):.2f} [{lo:.2f}, {hi:.2f}]",
                     f"{z.get('cooperative', 0):.2f}", f"{o['prange']:.2f}"])
    return C.md_table(TABLE_HDR, rows)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.economy.study")
    ap.add_argument("mode", choices=["sweep", "run", "validate", "detail", "table"])
    ap.add_argument("--per-type", type=int, default=24)
    ap.add_argument("--seed", type=int, default=TRAIN_SEED)
    ap.add_argument("--only", default="")
    ap.add_argument("--settings", default="old")
    ap.add_argument("--a", default="old")
    ap.add_argument("--b", default="rec")
    ap.add_argument("--mix", default="four")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    if a.mode == "sweep":
        groups = [g for g in SWEEP if not a.only or g in a.only.split(",")]
        items = [("old", NAMED["old"])] + [(n, st) for g in groups for n, st in SWEEP[g]]
        evaluate(items, a.per_type, a.seed, a.processes, a.mix)
    elif a.mode == "run":
        names = a.settings.split(",")
        evaluate([(n, NAMED[n]) for n in names], a.per_type, a.seed, a.processes, a.mix, base_name=names[0])
    elif a.mode == "validate":
        evaluate([(a.a, NAMED[a.a]), (a.b, NAMED[a.b])], a.per_type, HELD_OUT if a.seed == TRAIN_SEED else a.seed,
                 a.processes, a.mix, base_name=a.a)
    elif a.mode == "table":
        print(points_table(a.seed, a.only.split(",") if a.only else None))
    else:
        from .report import detail
        names = a.settings.split(",")
        specs = make_specs(C.GTYPES, a.per_type, a.seed, a.mix)
        print(detail({n: run_batch(NAMED[n], specs, a.processes, label=n) for n in names}))


if __name__ == "__main__":
    main()
