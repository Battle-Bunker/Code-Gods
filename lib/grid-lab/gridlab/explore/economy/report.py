"""Detailed curves for a few settings: usefulness by agent age, the world over time as agents accumulate,
and per-policy economy (who acts, who hoards)."""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ...experiments import common as C
from .econ_sim import AGE_EDGES

AGE_LABELS = ["0-15", "15-30", "30-60", "60-120", "120-240", "240-480", "480+"]


def _pool(rs, key):
    """Attempt-weighted pooled ratio curves from per-game lists."""
    return np.array([r[key] for r in rs], float)


def detail(by_setting: dict) -> str:
    out = []
    # usefulness by age (pooled over games: owner-up commits / attempts)
    rows = []
    for name, rs in by_setting.items():
        att = np.sum([r["att_by_age"] for r in rs], 0)
        up = np.sum([np.array(r["up_rate_by_age"]) * np.array(r["att_by_age"]) for r in rs], 0)
        rows.append([name] + [f"{u / a:.4f}" if a > 500 else "-" for u, a in zip(up, att)]
                    + [f"{np.nanmean([r['useful_life_ratio'] for r in rs]):.2f}",
                       f"{np.nanmean([r['idle_tail_s'] for r in rs]):.0f}",
                       f"{np.nanmean([r['lifespan_mean'] for r in rs]):.0f}"])
    out.append("### owner-improving commits per attempt, by agent age (s)\n")
    out.append(C.md_table(["setting"] + AGE_LABELS + ["useful-life ratio", "idle tail (s)", "lifespan (s)"], rows))
    # over time
    out.append("\n### the world over time (60 s bins, pooled; games still running in that bin)\n")
    for name, rs in by_setting.items():
        att = np.sum([r["bin_att"] for r in rs], 0)[:12]
        live = np.sum([np.array(r["bin_live"]) * np.array(r["bin_att"]) for r in rs], 0)[:12]
        succ = np.sum([np.array(r["bin_success"]) * np.array(r["bin_att"]) for r in rs], 0)[:12]
        upa = np.sum([np.array(r["bin_up_per_att"]) * np.array(r["bin_att"]) for r in rs], 0)[:12]
        absa = np.sum([np.array(r["bin_abs_per_att"]) * np.array(r["bin_att"]) for r in rs], 0)[:12]
        ngames = [sum(1 for r in rs if r["duration"] > 60 * k) for k in range(12)]
        hdr = ["metric"] + [f"{60 * k}-{60 * (k + 1)}" for k in range(12)]
        f = lambda x: [f"{v / max(a, 1):.3g}" for v, a in zip(x, att)]
        out.append(f"**{name}**\n")
        out.append(C.md_table(hdr, [["games"] + [str(g) for g in ngames], ["live agents"] + f(live),
                                    ["commits/attempt"] + f(succ), ["owner-up/attempt"] + f(upa),
                                    ["|Δ salience|/attempt"] + f(absa)]))
        out.append("")
    # per policy economy
    rows = []
    for name, rs in by_setting.items():
        acc = defaultdict(lambda: defaultdict(list))
        for r in rs:
            tot = sum(g["attempts"] for g in r["gods"]) or 1
            for g in r["gods"]:
                a = acc[g["policy"]]
                a["act"].append(g["attempts"] / tot)
                a["agents"].append(g["agents"])
                a["unspent"].append(g["energy"] / max(g["energy"] + g["spent"], 1e-9))
                a["win"].append(float(g["rank"] == 1))
                a["z"].append((r["n_gods"] - g["rank"]) / (r["n_gods"] - 1))
        for p in sorted(acc):
            a = acc[p]
            rows.append([name, p] + [f"{np.mean(a[k]):.3f}" for k in ("z", "win", "act", "agents", "unspent")])
    out.append("### per policy\n")
    out.append(C.md_table(["setting", "policy", "mean z", "win share", "attempt share", "agents summoned",
                           "unspent energy share"], rows))
    return "\n".join(out)
