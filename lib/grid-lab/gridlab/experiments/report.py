"""Printing helpers shared by the experiment scripts: markdown tables for a batch of results."""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from .common import (HEADLINE, add_dyn2, boot_ci, ceilings, ci_str, family_fairness, god_rows, md_table,
                     mutator_table, policy_table, sparkline, summary)

DYN_KEYS = ["dynamism", "dynamism2", "snap_autocorr", "snap_tension", "climbs_held_per_100s",
            "climbs_held_accel_per_100s", "durable_lead_changes_per_obj_100s", "crossings_per_pair_100s",
            "lead_changes_late", "rise_fall_share", "obj_hot_share", "churn", "snap_churn", "stagnation_frac",
            "hits_per_obj_s", "steal_rate", "mutator_entropy_norm", "agents", "commits"]


def headline_by_type(results: list[dict], keys=DYN_KEYS) -> str:
    add_dyn2(results)
    types = sorted(set(r["gtype"] for r in results), key=lambda s: (len(s), s))
    rows = []
    for k in keys:
        row = [k]
        for t in types + ["all"]:
            v = [r[k] for r in results if (t == "all" or r["gtype"] == t)]
            p, lo, hi = boot_ci(v, B=300)
            row.append(f"{p:.3g} ± {(hi - lo) / 2:.2g}")
        rows.append(row)
    return md_table(["metric"] + [t.replace("Grid", "") for t in types] + ["all"], rows)


def fairness_tables(results: list[dict], top: int = 12, min_n: int = 10) -> str:
    rows = god_rows(results)
    ff = family_fairness(rows, B=200, min_n=min_n)
    ce = ceilings(results)
    cf = defaultdict(list)
    for (gt, f), c in ce.items():
        cf[f].append(c)
    fam = sorted(((v["adj_z"], k, v) for k, v in ff["families"].items() if v["n"] >= min_n), reverse=True)
    out = [f"families with >= {min_n} god-slots: {ff['n_families']}; SD of policy-adjusted mean z "
           f"{ff['z_sd']:.3f} (excess over noise {ff['z_sd_excess']:.3f}); share whose 95% CI excludes 0.5: "
           f"{ff['share_unfair']:.2f}", ""]
    hdr = ["family", "n", "adj. mean z [95% CI]", "win ratio", "ceiling bits"]
    sel = fam[:top] + ([("…",) * 3] if len(fam) > 2 * top else []) + fam[-top:] if len(fam) > 2 * top else fam
    tab = []
    for x in sel:
        if x[0] == "…":
            tab.append(["…"] * 5)
            continue
        z, k, v = x
        tab.append([k, v["n"], f"{v['adj_z']:.2f} [{v['lo']:.2f}, {v['hi']:.2f}]", f"{v['win_ratio']:.2f}",
                    f"{np.mean(cf[k]):.0f}"])
    out.append(md_table(hdr, tab))
    pt = policy_table(rows)
    out += ["", md_table(["policy", "god-slots", "mean z [95% CI]", "win ratio"],
                         [[p, v["n"], f"{v['z']:.3f} [{v['lo']:.3f}, {v['hi']:.3f}]", f"{v['win_ratio']:.2f}"]
                          for p, v in sorted(pt.items(), key=lambda kv: -kv[1]["z"])])]
    return "\n".join(out)


def mutator_tables(results: list[dict]) -> str:
    mt = mutator_table(results)
    rows = [[k, f"{v['share']:.3f}", f"{v['useful']:.2f}", v["n_families_2pct"],
             ", ".join(f"{f} {s:.2f}" for f, s in v["top_families"][:3])] for k, v in mt.items()]
    return md_table(["mutator", "share of commits", "owner-useful", "#families ≥2%", "top users (share of family's commits)"], rows)


def trajectory_examples(results: list[dict], n: int = 3) -> str:
    out = []
    for r in results[:n]:
        out.append(f"{r['gtype']} seed {r['seed']} ({r['duration']:.0f}s): ")
        P = np.array(r["traj_payoff"])
        for i, g in enumerate(r["gods"]):
            out.append(f"   {g['family'][:22]:22s} {g['policy'][:10]:10s} rank {g['rank']}  "
                       f"{sparkline(P[:, i]) if len(P) else ''}")
    return "\n".join(out)


def full_report(results: list[dict], title: str = "") -> str:
    parts = [f"## {title}" if title else "", f"{len(results)} games", "",
             "### dynamism (mean ± 95% CI half-width)", headline_by_type(results), "",
             "### fairness", fairness_tables(results), "", "### mutators", mutator_tables(results)]
    return "\n".join(parts)
