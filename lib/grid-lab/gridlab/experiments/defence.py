"""Defence-goal experiments (docs/defence-goals.md §9):  python3 -m gridlab.experiments.defence

E1  Do protectors defend?  For every defence family F and seed: F in seat 0 plus three other families
    (distinct, drawn from the 88-family pool by the seed), all greedy_private. Each table is played twice
    with common random numbers: penalties scored, and shadow (logged, not scored). Paired differences of
    the protector's penalty bits, repairs, repair agents, payoff and rank.
E2  World dynamics.  Random deals from the 88-family pool (A) versus deals that include at least one
    defence family (B, scored) and the same deals unscored (B0). Mixed policies. Tension, spirals, lead
    changes, stagnation, gini, dynamism.
E3  Fairness.  Mean rank and win rate per defence family (E1 scored arm) against the 4-god baseline of 2.5
    and 1/4, and the same family's rank in its shadow arm.

All intervals are 95% normal intervals of the mean (paired where stated); n = seeds per cell.
Prints markdown tables; --json writes every game's metrics.
"""
from __future__ import annotations

import argparse
import json
import math
import multiprocessing as mp
import time
from collections import defaultdict

import numpy as np

from ..core import GridType
from .. import calibrate as cal
from ..metrics import metrics
from ..sim import GameConfig, run_game, draws_for
from ..rules import FAMILIES, DEFENCE_FAMILIES

POOL = FAMILIES + DEFENCE_FAMILIES
DEF_IDS = [f.id for f in DEFENCE_FAMILIES]
MIXED = ("random", "greedy_private", "saver", "greedy_omniscient")
_JOBS: list = []


def ci(x) -> tuple[float, float, int]:
    x = np.asarray([v for v in x if v is not None and not (isinstance(v, float) and math.isnan(v))], float)
    if x.size == 0:
        return float("nan"), float("nan"), 0
    h = 1.96 * x.std(ddof=1) / math.sqrt(x.size) if x.size > 1 else float("nan")
    return float(x.mean()), float(h), int(x.size)


def fmt(t, d=2) -> str:
    m, h, n = t
    return f"{m:.{d}f} ± {h:.{d}f}"


def _run(i):
    tag, cfg = _JOBS[i]
    log = run_game(cfg)
    m = metrics(log)
    m.pop("mutator_shares", None)
    m["tag"], m["seed"] = tag, cfg.seed
    return m


def batch(jobs, processes):
    global _JOBS
    _JOBS = jobs
    if processes > 1:
        with mp.get_context("fork").Pool(processes) as pool:
            return pool.map(_run, range(len(jobs)), chunksize=2)
    return [_run(i) for i in range(len(jobs))]


def e1_configs(gt, seeds, seed0, length):
    avail = [f for f in FAMILIES if f.available(gt)]
    out = []
    for F in DEFENCE_FAMILIES:
        if not F.available(gt):
            continue
        for k in range(seeds):
            seed = seed0 + k
            rng = np.random.default_rng([seed, 7])
            base = F.base.id if F.base is not None else ""
            others = [f.id for f in rng.permutation(np.array(avail, dtype=object)) if f.id != base][:3]
            for scored in (True, False):
                cfg = GameConfig(gtype=gt, n_gods=4, dealer="fixed", fixed_families=[F.id, *others], families=POOL,
                                 policies="greedy_private", seed=seed, score_penalties=scored, **length)
                out.append((("E1", F.id, scored), cfg))
    return out


def e2_configs(gt, seeds, seed0, length):
    out = []
    for k in range(seeds):
        seed = seed0 + 10_000 + k
        out.append((("E2", "A"), GameConfig(gtype=gt, n_gods=4, families=FAMILIES, policies=MIXED, seed=seed, **length)))
        for scored in (True, False):
            out.append((("E2", "B" if scored else "B0"),
                        GameConfig(gtype=gt, n_gods=4, families=POOL, dealer_require=[DEF_IDS], policies=MIXED,
                                   seed=seed, score_penalties=scored, **length)))
    return out


def report_e1(ms):
    by = defaultdict(dict)
    for m in ms:
        _, fid, scored = m["tag"]
        by[(fid, m["seed"])][scored] = m
    keys = ["h_auc", "final_h_mean", "damage_by_others", "repair_by_self", "repair_agents", "undone_share"]
    print("\n### E1: protector seat, scored vs shadow (paired by seed)\n")
    print("| family | n | ⚠️ mean h (scored) | (shadow) | Δ h | Δ final h | Δ self-repair bits | "
          "Δ repair agents | undone (scored / shadow) | rank (scored / shadow) |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    rows, pooled = defaultdict(lambda: defaultdict(list)), defaultdict(list)
    for (fid, seed), pair in sorted(by.items()):
        if len(pair) < 2:
            continue
        a, b = pair[True]["defence"][0], pair[False]["defence"][0]
        r = rows[fid]
        for k in keys:
            r[k + "_s"].append(a[k]); r[k + "_u"].append(b[k]); r[k + "_d"].append(a[k] - b[k])
        ra, rb = dict(pair[True]["family_rank"])[fid], dict(pair[False]["family_rank"])[fid]
        r["rank_s"].append(ra); r["rank_u"].append(rb)
        r["win_s"].append(ra == 1); r["win_u"].append(rb == 1)
        for k in keys:
            pooled[k + "_d"].append(a[k] - b[k])
        pooled["rank_s"].append(ra); pooled["rank_u"].append(rb)
    for fid in DEF_IDS:
        if fid not in rows:
            continue
        r = rows[fid]
        n = len(r["rank_s"])
        print(f"| `{fid}` | {n} | {fmt(ci(r['h_auc_s']))} | {fmt(ci(r['h_auc_u']))} | {fmt(ci(r['h_auc_d']))} | "
              f"{fmt(ci(r['final_h_mean_d']))} | {fmt(ci(r['repair_by_self_d']), 0)} | {fmt(ci(r['repair_agents_d']), 1)} | "
              f"{ci(r['undone_share_s'])[0]:.2f} / {ci(r['undone_share_u'])[0]:.2f} | "
              f"{ci(r['rank_s'])[0]:.2f} / {ci(r['rank_u'])[0]:.2f} |")
    print(f"\npooled over {len(pooled['rank_s'])} pairs: Δ h_auc {fmt(ci(pooled['h_auc_d']))}, "
          f"Δ final h {fmt(ci(pooled['final_h_mean_d']))}, Δ self-repair bits {fmt(ci(pooled['repair_by_self_d']), 0)}, "
          f"Δ damage by others {fmt(ci(pooled['damage_by_others_d']), 0)}, Δ repair agents "
          f"{fmt(ci(pooled['repair_agents_d']), 2)}, Δ undone share {fmt(ci(pooled['undone_share_d']), 3)}")
    return rows


def report_e3(rows):
    print("\n### E3: fairness of defence families (E1 tables, 4 greedy gods; fair = rank 2.50, win 0.25)\n")
    print("| family | n | mean rank scored | win rate scored | mean rank shadow | win rate shadow |")
    print("|---|---|---|---|---|---|")
    for fid in DEF_IDS:
        if fid not in rows:
            continue
        r = rows[fid]
        print(f"| `{fid}` | {len(r['rank_s'])} | {fmt(ci(r['rank_s']))} | {fmt(ci(r['win_s']))} | "
              f"{fmt(ci(r['rank_u']))} | {fmt(ci(r['win_u']))} |")


def report_e2(ms):
    keys = ["tension_rate", "harmony_rate", "spirals_per_100_commits", "spiral_len_mean", "lead_changes_per_100s",
            "stagnation_frac", "late_activity", "payoff_gini", "dynamism", "commits", "agents"]
    arms = defaultdict(dict)
    for m in ms:
        arms[m["tag"][1]][m["seed"]] = m
    print("\n### E2: world dynamics (mixed policies)\n")
    print("| metric | A: 88-family pool | B0: with a defence family, unscored | B: scored | B − B0 (paired) |")
    print("|---|---|---|---|---|")
    common = sorted(set(arms["B"]) & set(arms["B0"]))
    for k in keys:
        a = ci([m[k] for m in arms["A"].values()])
        b0 = ci([arms["B0"][s][k] for s in common])
        b = ci([arms["B"][s][k] for s in common])
        d = ci([arms["B"][s][k] - arms["B0"][s][k] for s in common])
        dd = 1 if k in ("commits", "agents") else 3
        print(f"| {k} | {fmt(a, dd)} | {fmt(b0, dd)} | {fmt(b, dd)} | {fmt(d, dd)} |")
    print(f"\nn = {len(arms['A'])} (A), {len(common)} pairs (B, B0)")
    fr = defaultdict(list)
    for s in common:
        for f, r in arms["B"][s]["family_rank"]:
            fr["defence" if f in DEF_IDS else "other"].append(r)
    print("E2 B ranks: " + ", ".join(f"{k} {fmt(ci(v))} (n={len(v)})" for k, v in fr.items()))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.defence")
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--seeds", type=int, default=24, help="seeds per family (E1) and per arm (E2 uses 4x)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--only", default="", help="E1 or E2")
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    n, sym, col = a.type.split(",")
    gt = GridType(int(n), sym, col)
    length = {}
    jobs = []
    if a.only in ("", "E1"):
        jobs += e1_configs(gt, a.seeds, a.seed, length)
    if a.only in ("", "E2"):
        jobs += e2_configs(gt, 4 * a.seeds, a.seed, length)
    t0 = time.perf_counter()
    draws = [d for _, c in jobs for d in draws_for(c)]
    pre = cal.precompute(draws, gt, processes=a.processes)
    print(f"{gt.key}: {len(jobs)} games; calibration {pre['built']} built, {pre['cached']} cached "
          f"({time.perf_counter() - t0:.0f}s)")
    t1 = time.perf_counter()
    ms = batch(jobs, a.processes)
    print(f"simulated in {time.perf_counter() - t1:.0f}s")
    e1 = [m for m in ms if m["tag"][0] == "E1"]
    e2 = [m for m in ms if m["tag"][0] == "E2"]
    if e1:
        report_e3(report_e1(e1))
    if e2:
        report_e2(e2)
    if a.json:
        with open(a.json, "w") as fh:
            json.dump(ms, fh, default=lambda o: o.item() if hasattr(o, "item") else str(o))


if __name__ == "__main__":
    main()
