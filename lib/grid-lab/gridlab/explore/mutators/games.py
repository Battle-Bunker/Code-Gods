"""Validate presets in full simulated games (paired specs, common random numbers).

    python3 -m gridlab.explore.mutators.games --presets default,NAME --types 5,base10,rgby --games 600 --seed 1
    python3 -m gridlab.explore.mutators.games ... --seed 9000000      # held-out specs

Engine defaults at 100 Hz (experiments.common.BASE), mixed policies, 3-6 gods, dealer 'distinct'.
Per preset it reports
  * family fairness: policy-adjusted mean rank score z (0.5 = fair) per family with a game-bootstrap 95% CI,
    the SD of z across families and its excess over sampling noise, and the share of families whose CI
    excludes 0.5; win ratio = wins / Σ 1/G;
  * mutator usage: entropy of committed applications (normalised by log #mutators), the number of
    mutators with >= 1% of commits, and per mutator the number of families that use it for >= 2% of
    their commits;
  * dynamism headline metrics (from experiments.common), for regressions.
Results are cached per game by experiments.common.run_batch (key includes the preset's tagged knobs).
"""
from __future__ import annotations

import argparse
import json
import math
from collections import Counter

import numpy as np

from ...experiments import common as C
from .variants import PRESETS, install_preset, setting_for

C.apply_knobs({})     # capture the import-time knobs before any preset is installed


def run_preset(name: str, specs, processes: int = 4, mix_label: str = "") -> list[dict]:
    st = setting_for(name)
    install_preset(name)          # mutator variant must be live in the parent before the fork pool
    try:
        rs = C.run_batch(st, specs, processes, label=f"{name}{mix_label}")
    finally:
        install_preset("default")
    C.add_dyn2(rs)
    return rs


def usage(rs: list[dict]) -> dict:
    tot = Counter()
    for r in rs:
        for f, dct in r["mut_family"].items():
            for mid, v in dct.items():
                tot[mid] += v[0]
    n = sum(tot.values())
    p = np.array([v / n for v in tot.values()]) if n else np.zeros(0)
    H = float(-(p * np.log(p)).sum()) if n else 0.0
    mt = C.mutator_table(rs)
    return {"entropy": H, "entropy_norm": H / math.log(max(len(tot), 2)), "n_used_1pct": int((p >= 0.01).sum()),
            "shares": {k: v / n for k, v in tot.most_common()}, "table": mt,
            "game_entropy_norm": float(np.mean([r["mutator_entropy_norm"] for r in rs]))}


def fairness(rs: list[dict], min_n: int = 10) -> dict:
    rows = C.god_rows(rs)
    return C.family_fairness(rows, B=300, min_n=min_n)


def compare(names, rs_by: dict, focus=()) -> str:
    out = []
    hdr = ["metric"] + list(names)
    rows = []
    ff = {n: fairness(rs_by[n]) for n in names}
    us = {n: usage(rs_by[n]) for n in names}
    rows.append(["families with ≥10 slots"] + [ff[n]["n_families"] for n in names])
    rows.append(["SD of adj. z across families"] + [f"{ff[n]['z_sd']:.3f}" for n in names])
    rows.append(["  excess over noise"] + [f"{ff[n]['z_sd_excess']:.3f}" for n in names])
    rows.append(["share of families with CI excluding 0.5"] + [f"{ff[n]['share_unfair']:.2f}" for n in names])
    rows.append(["mutator entropy (pooled, norm.)"] + [f"{us[n]['entropy_norm']:.3f}" for n in names])
    rows.append(["mutator entropy (per game, norm.)"] + [f"{us[n]['game_entropy_norm']:.3f}" for n in names])
    rows.append(["mutators with ≥1% of commits"] + [us[n]["n_used_1pct"] for n in names])
    rows.append(["mutators used ≥2% by ≥3 families"] + [sum(1 for v in us[n]["table"].values()
                                                           if v["n_families_2pct"] >= 3) for n in names])
    for k in ("dynamism", "dynamism2", "sig_tension_rate", "spirals_per_100_commits", "climbs_held_per_100s",
              "steal_rate", "steal_bij_share", "lead_changes_per_100s", "payoff_gini", "commits", "agents"):
        vals = []
        for n in names:
            p, lo, hi = C.boot_ci([r.get(k, np.nan) for r in rs_by[n]], B=300)
            vals.append(f"{p:.3g} ± {(hi - lo) / 2:.2g}")
        rows.append([k] + vals)
    out.append(C.md_table(hdr, rows))
    out.append("")
    # per-family table for the extremes and the focus families
    base = ff[names[0]]["families"]
    fams = sorted(base, key=lambda f: base[f]["adj_z"])
    pick = list(dict.fromkeys(fams[:8] + fams[-8:] + [f for f in focus if f in base]))
    rows = []
    for f in pick:
        row = [f]
        for n in names:
            v = ff[n]["families"].get(f)
            row.append("-" if v is None else f"{v['adj_z']:.2f} [{v['lo']:.2f},{v['hi']:.2f}] w{v['win_ratio']:.2f} n{v['n']}")
        rows.append(row)
    out.append(C.md_table(["family (adj. z [95% CI], win ratio, slots)"] + list(names), rows))
    out.append("")
    rows = []
    allm = sorted(set().union(*[us[n]["shares"] for n in names]), key=lambda m: -us[names[0]]["shares"].get(m, 0))
    for m in allm:
        rows.append([m] + [f"{100 * us[n]['shares'].get(m, 0):.1f}% / {us[n]['table'].get(m, {}).get('n_families_2pct', 0)}"
                           for n in names])
    out.append(C.md_table(["mutator (share of commits / #families ≥2%)"] + list(names), rows))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--presets", default="default")
    ap.add_argument("--types", default="5,base10,rgby")
    ap.add_argument("--games", type=int, default=400)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--focus", default="seed2_patchwork,lone_peak,rummy_melder,conqueror,rainbow_road,"
                                        "stripe_painter,chessmaster,border_baron,fair_weaver,colour_mixer")
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    names = a.presets.split(",")
    for n in names:
        assert n in PRESETS, n
    specs = C.make_specs(a.types.split(";"), a.games, a.seed, a.mix)
    rs_by = {n: run_preset(n, specs, a.processes, f"/{a.mix}/{a.seed}") for n in names}
    print(f"## {len(specs)} games per preset: types {a.types}, mix {a.mix}, spec seed {a.seed}\n")
    print(compare(names, rs_by, a.focus.split(",")))
    if a.json:
        with open(a.json, "w") as fh:
            json.dump({n: {"fair": fairness(rs_by[n]), "usage": usage(rs_by[n])} for n in names}, fh, default=str)


if __name__ == "__main__":
    main()
