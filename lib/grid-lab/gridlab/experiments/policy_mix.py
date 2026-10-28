"""Robustness to the simulated players: run old and new settings under alternative policy mixes
(all greedy_private; greedy + cooperative; learning greedy + saver + random) and check that the
before/after conclusions keep their sign.

    python3 -m gridlab.experiments.policy_mix                      # mixes greedy, coop, learners
    python3 -m gridlab.experiments.policy_mix --mixes greedy --games 30
"""
from __future__ import annotations

import argparse

import numpy as np

from .common import GTYPES, add_dyn2, family_fairness, god_rows, make_specs, md_table, policy_table, run_batch
from .search import structural_unfairness
from .settings import SETTINGS

KEYS = ["dynamism2", "snap_autocorr", "climbs_held_per_100s", "durable_lead_changes_per_obj_100s",
        "crossings_per_pair_100s", "rise_fall_share", "churn", "hits_per_obj_s"]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.policy_mix", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=40, help="games per GridType")
    ap.add_argument("--seed", type=int, default=400_000)
    ap.add_argument("--mixes", default="greedy,coop,learners")
    ap.add_argument("--settings", default="old,new")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    rows = []
    for mix in a.mixes.split(","):
        specs = make_specs(a.types.split(";"), a.games, a.seed, mix)
        per = {}
        for sname in a.settings.split(","):
            rs = run_batch(SETTINGS[sname], specs, a.processes, label=f"{mix}/{sname}")
            add_dyn2(rs)
            gr = god_rows(rs)
            ff = family_fairness(gr, B=60, min_n=10)
            pt = policy_table(gr)
            per[sname] = rs
            rows.append([mix, sname] + [f"{np.mean([r[k] for r in rs]):.3g}" for k in KEYS] +
                        [f"{ff['z_sd_excess']:.3f}", f"{structural_unfairness(gr):.3f}",
                         " / ".join(f"{k} {v['z']:.2f}" for k, v in sorted(pt.items()))])
        if len(per) == 2:
            o, n = per.values()
            d = np.array([y["dynamism2"] - x["dynamism2"] for x, y in zip(o, n)])
            rows.append([mix, "paired Δ dyn2", f"{d.mean():+.3f} ± {1.96 * d.std() / np.sqrt(len(d)):.3f}"] +
                        [""] * (len(KEYS) + 2))
    print(md_table(["mix", "setting"] + KEYS + ["family excess SD", "struct. unfair", "policy mean z"], rows))


if __name__ == "__main__":
    main()
