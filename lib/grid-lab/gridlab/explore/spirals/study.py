"""The spirals study: run variants on paired game specs and print the report tables.

    python3 -m gridlab.explore.spirals.study --variants base,sel+1,tend_pay --games 40          # training seeds
    python3 -m gridlab.explore.spirals.study --variants base,tend_pay --games 40 --seed 9000000   # held out
    python3 -m gridlab.explore.spirals.study --conditions --games 40                            # pairs / mutators

All results are cached per game under .cache/explore/spirals/games/ (see runner.py).
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np

from . import analyse as A
from .runner import GTYPES, run, specs_for
from .variants import VARIANTS

SHORT = ["ep_spirals_per_100s", "ep_spirals_accel_per_100s", "ep_spirals_held_per_100s", "ep_spiral_excess",
         "ep_spiral_gain_mean", "ep_spiral_retention_mean", "fb_autocorr", "fb_drift_16", "fb_drift_32",
         "tn_event_rate", "tn_theft_rate", "tn_counter", "tn_reversal_rate", "final_salience_mean",
         "welfare_per_obj", "payoff_gini", "lead_changes_per_100s", "tend_reject_share"]


def incentive_table(rs: list) -> str:
    names = ["0-4", "4-8", "8-16", "16-32", "32-64", "64+"]
    acc = np.zeros((6, 3))
    for r in rs:
        for k, (n, a, b) in r.get("incentive_bins", {}).items():
            acc[int(k)] += (n, a, b)
    rows = []
    tot = acc[:, 0].sum()
    for i, nm in enumerate(names):
        n, a, b = acc[i]
        if n:
            rows.append([nm, f"{n / tot:.3f}", f"{a / n:+.2f}", f"{b / n:+.2f}"])
    return A.md(["peers' salience S_-o before", "share of commits", "mean Δs_owner", "mean ΔS_-o (others)"], rows)


def conditions(rs: list, top: int = 12) -> str:
    out = []
    pt = A.pair_table(rs, "pair_spirals", min_n=3)
    out.append("### family pairs that spiral together (spirals both gain >= 1 bit in, per 100 s; co-dealt games)")
    out.append(A.md(["pair", "games", "per 100 s"], [[f"{a} + {b}", n, f"{x:.2f}"] for (a, b), n, x in pt[:top]]))
    out.append("\n... and the least:")
    out.append(A.md(["pair", "games", "per 100 s"], [[f"{a} + {b}", n, f"{x:.2f}"] for (a, b), n, x in pt[-6:]]))
    th = A.pair_table(rs, "pair_theft", min_n=3)
    out.append("\n### family pairs with the most theft (owner +2, other -2; per 100 s)")
    out.append(A.md(["pair", "games", "per 100 s"], [[f"{a} + {b}", n, f"{x:.1f}"] for (a, b), n, x in th[:top]]))
    fs = A.family_spiral(rs)
    rows = sorted(((f, n, b, c) for f, (n, b, c) in fs.items() if n >= 4), key=lambda x: -x[2])
    out.append("\n### families: spirals benefited from / contributed to per god slot per 100 s")
    out.append(A.md(["family", "slots", "benefits", "contributes"], [[f, n, f"{b:.2f}", f"{c:.2f}"] for f, n, b, c in rows[:top]]
                    + [["…", "", "", ""]] + [[f, n, f"{b:.2f}", f"{c:.2f}"] for f, n, b, c in rows[-6:]]))
    ml = A.mutator_lift(rs)
    out.append("\n### mutators: spiral lift (share of spiral up-steps / share of commits)")
    out.append(A.md(["mutator", "commit share", "lift"], [[m, f"{s:.3f}", f"{l:.2f}"] for m, s, l in ml]))
    out.append("\n### incentive: what an owner's commit does, by how salient the object already is to the others")
    out.append(incentive_table(rs))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", default="base")
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=40)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--conditions", action="store_true")
    ap.add_argument("--full", action="store_true", help="all metrics, not the short list")
    ap.add_argument("--bytype", default="", help="comma list of metrics to break down by GridType")
    a = ap.parse_args(argv)
    specs = specs_for(a.types.split(";"), a.games, a.seed, a.mix)
    names = a.variants.split(",")
    batches = {n: run(VARIANTS[n], specs, a.processes) for n in names}
    keys = A.KEYS if a.full else SHORT
    print(f"\n## {len(specs)} games per variant (seed {a.seed}, mix {a.mix})\n")
    print(A.headline(batches, keys))
    base = batches[names[0]]
    for n in names[1:]:
        print(f"\n### paired: {n} - {names[0]}\n")
        print(A.paired(base, batches[n], keys))
    for k in [x for x in a.bytype.split(",") if x]:
        print(f"\n### {k} by GridType\n")
        rows = []
        types = sorted(set(r["gtype"] for r in base))
        for t in types:
            rows.append([t] + [A.fmt(*A.boot([A.derive(r).get(k) for r in batches[n] if r["gtype"] == t])) for n in names])
        print(A.md(["GridType"] + names, rows))
    if a.conditions:
        for n in names:
            print(f"\n## conditions: {n}\n")
            print(conditions(batches[n]))


if __name__ == "__main__":
    main()
