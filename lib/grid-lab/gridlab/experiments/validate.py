"""Before/after on held-out seeds: run `old` and `new` (or any two named settings) on the same specs
(spec seed 9000000, never used by the search) and print paired differences with 95% CIs, fairness,
policy balance and mutator usage for both.

    python3 -m gridlab.experiments.validate                     # 5 GridTypes x 100 games, old vs new
    python3 -m gridlab.experiments.validate --a old --b new --games 40
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ..rules import by_id
from .common import (GTYPES, add_dyn2, boot_ci, family_fairness, god_rows, make_specs, md_table, mutator_table,
                     policy_table, run_batch, save_json)
from .report import fairness_tables, headline_by_type, mutator_tables
from .search import structural_unfairness
from .settings import SETTINGS

HELD_OUT = 9_000_000
KEYS = ["dynamism2", "dynamism", "snap_autocorr", "snap_tension", "durable_lead_changes_per_obj_100s",
        "climbs_held_per_100s", "climbs_held_accel_per_100s", "climb_gain_mean", "crossings_per_pair_100s",
        "rise_fall_share", "obj_hot_share", "churn", "snap_churn", "hits_per_obj_s", "steal_rate",
        "mutator_entropy_norm", "agents", "commits", "energy_unspent_share", "stagnation_frac"]


def camp_means(rows):
    acc = defaultdict(list)
    for r in rows:
        acc[by_id(r["family"]).camp].append(r["z"])
    return {k: boot_ci(v, B=300) for k, v in acc.items()}


def compare(ra: list[dict], rb: list[dict], na: str, nb: str) -> str:
    add_dyn2(ra), add_dyn2(rb)
    rows = []
    for k in KEYS:
        a = np.array([r[k] for r in ra], float)
        b = np.array([r[k] for r in rb], float)
        d = b - a
        p, lo, hi = boot_ci(d, B=1000)
        rows.append([k, f"{a.mean():.3g}", f"{b.mean():.3g}", f"{p:+.3g} [{lo:+.3g}, {hi:+.3g}]"])
    out = [md_table(["metric", na, nb, f"paired Δ ({nb} − {na}) [95% CI]"], rows), ""]
    fa, fb = (family_fairness(god_rows(x), B=200, min_n=10) for x in (ra, rb))
    ga, gb = god_rows(ra), god_rows(rb)
    pa, pb = policy_table(ga), policy_table(gb)
    ca, cb = camp_means(ga), camp_means(gb)
    ma, mb = mutator_table(ra), mutator_table(rb)
    fr = [["family z SD (excess over noise)", f"{fa['z_sd']:.3f} ({fa['z_sd_excess']:.3f})",
           f"{fb['z_sd']:.3f} ({fb['z_sd_excess']:.3f})"],
          ["share of families with CI excluding 0.5", f"{fa['share_unfair']:.2f}", f"{fb['share_unfair']:.2f}"],
          ["structural unfairness (camp/ceiling/layers)", f"{structural_unfairness(ga):.3f}", f"{structural_unfairness(gb):.3f}"]]
    for c in sorted(set(ca) | set(cb)):
        fr.append([f"camp {c} mean z", f"{ca[c][0]:.3f} [{ca[c][1]:.3f}, {ca[c][2]:.3f}]",
                   f"{cb[c][0]:.3f} [{cb[c][1]:.3f}, {cb[c][2]:.3f}]"])
    for p in sorted(set(pa) | set(pb)):
        fr.append([f"policy {p} mean z", f"{pa[p]['z']:.3f} [{pa[p]['lo']:.3f}, {pa[p]['hi']:.3f}]",
                   f"{pb[p]['z']:.3f} [{pb[p]['lo']:.3f}, {pb[p]['hi']:.3f}]"])
    fr.append(["mutators used ≥2% by some family", f"{sum(v['n_families_2pct'] > 0 for v in ma.values())}/{len(ma)}",
               f"{sum(v['n_families_2pct'] > 0 for v in mb.values())}/{len(mb)}"])
    out.append(md_table(["fairness", na, nb], fr))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.validate", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=100, help="games per GridType")
    ap.add_argument("--seed", type=int, default=HELD_OUT)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--a", default="old", choices=sorted(SETTINGS))
    ap.add_argument("--b", default="new", choices=sorted(SETTINGS))
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--detail", action="store_true", help="also print the full per-setting reports")
    a = ap.parse_args(argv)
    specs = make_specs(a.types.split(";"), a.games, a.seed, a.mix)
    ra = run_batch(SETTINGS[a.a], specs, a.processes, label=f"validate/{a.a}")
    rb = run_batch(SETTINGS[a.b], specs, a.processes, label=f"validate/{a.b}")
    print(f"## Held-out validation: {a.a} vs {a.b}, {len(specs)} paired games (spec seed {a.seed}, mix {a.mix})\n")
    print(compare(ra, rb, a.a, a.b))
    print(f"\n### {a.b} by GridType\n" + headline_by_type(rb))
    if a.detail:
        for name, rs in ((a.a, ra), (a.b, rb)):
            print(f"\n### {name}: fairness\n" + fairness_tables(rs))
            print(f"\n### {name}: mutators\n" + mutator_tables(rs))
    save_json(f"validate-{a.a}-{a.b}-{a.seed}", {"a": [r["key"] for r in ra], "b": [r["key"] for r in rb]})


if __name__ == "__main__":
    main()
