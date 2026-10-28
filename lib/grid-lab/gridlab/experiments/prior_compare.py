"""Rare ≠ hard: calibrate surprisal against the uniform spawn prior (current) or the code-reachable
prior (spawn + 0-4 random cheap programs, gridlab/priors.py), run the SAME games under each, and
compare dynamism and fairness.

    python3 -m gridlab.experiments.prior_compare                       # on the `old` setting
    python3 -m gridlab.experiments.prior_compare --setting new --games 40
    python3 -m gridlab.experiments.prior_compare --discounts            # per-family discount table only

Prints: per-camp reachability discount (bits taken off the body top by the reachable prior),
dynamism headline, policy-adjusted family fairness, camp means, and the structural unfairness.
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ..core import GridType
from ..family import Draw
from ..rules import FAMILIES
from .. import calibrate as cal
from .common import (GTYPES, add_dyn2, family_fairness, god_rows, make_specs, md_table, merge, parse_type,
                     policy_table, run_batch)
from .report import headline_by_type
from .search import structural_unfairness
from .settings import SETTINGS


def discounts(gtypes) -> str:
    from ..priors import reachable_survival
    rows = []
    camp = defaultdict(list)
    for gs in gtypes:
        gt = parse_type(gs)
        rng = np.random.default_rng(0)
        for f in FAMILIES:
            if not f.available(gt):
                continue
            d = Draw(f, f.sample(rng, gt))
            u, r = cal.survival(d, gt), reachable_survival(d, gt)
            l0 = r.meta["body_top"]
            camp[(gs, f.camp)].append(u.surprisal(int(l0)) - r.surprisal(int(l0)))
    for (gs, c), v in sorted(camp.items()):
        rows.append([gs, c, len(v), f"{np.mean(v):.2f}", f"{np.max(v):.2f}"])
    return md_table(["GridType", "camp", "#families", "mean discount (bits)", "max"], rows)


def camp_means(rows) -> dict:
    from ..rules import by_id
    acc = defaultdict(list)
    for r in rows:
        acc[by_id(r["family"]).camp].append(r["z"])
    return {k: (float(np.mean(v)), float(np.std(v) / np.sqrt(len(v)))) for k, v in acc.items()}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.prior_compare", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=60, help="games per GridType")
    ap.add_argument("--seed", type=int, default=300_000)
    ap.add_argument("--setting", default="old", choices=sorted(SETTINGS))
    ap.add_argument("--discounts", action="store_true")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    types = a.types.split(";")
    print("### Reachability discount by camp\n" + discounts(types))
    if a.discounts:
        return
    specs = make_specs(types, a.games, a.seed)
    out = {}
    for prior in ("uniform", "reachable"):
        st = merge(SETTINGS[a.setting], {"prior": prior})
        rs = run_batch(st, specs, a.processes, label=f"prior:{prior}")
        add_dyn2(rs)
        rows = god_rows(rs)
        ff = family_fairness(rows, B=100, min_n=10)
        out[prior] = (rs, rows, ff)
        print(f"\n### prior = {prior}\n" + headline_by_type(rs))
    tab = []
    for prior, (rs, rows, ff) in out.items():
        cm = camp_means(rows)
        pt = policy_table(rows)
        tab.append([prior, f"{np.mean([r['dynamism2'] for r in rs]):.3f}", f"{ff['z_sd']:.3f}", f"{ff['z_sd_excess']:.3f}",
                    f"{ff['share_unfair']:.2f}", f"{structural_unfairness(rows):.3f}",
                    " / ".join(f"{k[:4]} {v[0]:.3f}±{v[1]:.3f}" for k, v in sorted(cm.items())),
                    " / ".join(f"{k} {v['z']:.2f}" for k, v in sorted(pt.items()))])
    print("\n### Comparison (same games)\n" + md_table(
        ["prior", "dyn2", "family z SD", "excess SD", "share unfair", "struct. unfair", "camp mean z", "policy mean z"], tab))
    # paired per-game dyn2 difference
    d = np.array([b["dynamism2"] - a_["dynamism2"] for a_, b in zip(out["uniform"][0], out["reachable"][0])])
    print(f"\npaired Δ dyn2 (reachable − uniform): {d.mean():+.4f} ± {1.96 * d.std() / np.sqrt(len(d)):.4f} (95% CI)")


if __name__ == "__main__":
    main()
