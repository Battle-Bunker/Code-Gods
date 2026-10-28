"""Diagnose a batch: why games are static or dynamic, which families are advantaged or starved and
why, which mutators are unused or dominant, theft and churn, and whether play stagnates as agents
accumulate.

    python3 -m gridlab.experiments.diagnose                  # on the baseline batch (old, mixed, seed 1)
    python3 -m gridlab.experiments.diagnose --setting new --seed 9000000

Reads the cached per-game results (runs any missing game). Prints markdown tables.
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ..rules import by_id
from .common import (GTYPES, add_dyn2, ceilings, family_fairness, god_rows, make_specs, md_table, run_batch,
                     save_json)
from .settings import SETTINGS


def spearman(x, y) -> float:
    x, y = np.asarray(x, float), np.asarray(y, float)
    if len(x) < 3:
        return float("nan")
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def game_drivers(rs: list[dict]) -> str:
    """Spearman correlation of per-game dynamism2 (and components) with game features."""
    feats = ["hits_per_obj_s", "agents", "duration", "n_gods", "commits", "churn", "energy_unspent_share",
             "steal_rate", "bij_commit_share", "top_object_share", "agent_steps_mean"]
    targets = ["dynamism2", "snap_autocorr", "climbs_held_per_100s", "durable_lead_changes_per_obj_100s",
               "crossings_per_pair_100s"]
    rows = []
    for f in feats:
        rows.append([f] + [f"{spearman([r[f] for r in rs], [r[t] for r in rs]):+.2f}" for t in targets])
    return md_table(["feature \\ Spearman ρ with"] + targets, rows)


def family_drivers(rs: list[dict]) -> tuple[str, dict]:
    rows = god_rows(rs)
    ff = family_fairness(rows, B=100, min_n=10)
    # per-family features pooled over god-slots
    acc = defaultdict(lambda: defaultdict(list))
    for r in rs:
        for g in r["gods"]:
            a = acc[g["family"]]
            tot_gain = g["gain_own"] + g["gain_others"]
            a["free_ride"].append(g["gain_others"] / tot_gain if tot_gain > 0 else np.nan)
            a["ceil"].append(g["ceil"])
            a["final_mean_s"].append(g["final_mean_s"])
            a["damage"].append(g["loss_others"] / max(g["loss_own"] + g["loss_others"], 1e-9))
            a["agents"].append(g["agents"])
    fams = [k for k, v in ff["families"].items() if v["n"] >= 10]
    z = [ff["families"][k]["adj_z"] for k in fams]
    feat = {}
    for k in fams:
        f = by_id(k)
        a = acc[k]
        feat[k] = {"ceil": np.nanmean(a["ceil"]), "free_ride": np.nanmean(a["free_ride"]),
                   "final_mean_s": np.nanmean(a["final_mean_s"]), "agents": np.nanmean(a["agents"]),
                   "camp": f.camp, "layers": len(f.layers), "symbol": "symbol" in f.layers,
                   "colour": "colour" in f.layers, "position": "position" in f.layers}
    lines = []
    num = ["ceil", "free_ride", "final_mean_s", "agents", "layers"]
    lines.append(md_table(["family feature", "Spearman ρ with adjusted mean z"],
                          [[k, f"{spearman([feat[f][k] for f in fams], z):+.2f}"] for k in num]))
    cat = []
    for key in ("camp", "symbol", "colour", "position"):
        groups = defaultdict(list)
        for f, zz in zip(fams, z):
            groups[str(feat[f][key])].append(zz)
        for gname, v in sorted(groups.items()):
            cat.append([key, gname, len(v), f"{np.mean(v):.3f}", f"{np.std(v) / max(np.sqrt(len(v)), 1):.3f}"])
    lines += ["", md_table(["grouping", "value", "#families", "mean adj z", "se"], cat)]
    order = sorted(fams, key=lambda k: -ff["families"][k]["adj_z"])
    sel = order[:10] + order[-10:]
    lines += ["", md_table(["family", "adj z", "camp", "ceiling", "free-ride share", "final mean s", "agents"],
                           [[k, f"{ff['families'][k]['adj_z']:.2f}", feat[k]["camp"], f"{feat[k]['ceil']:.0f}",
                             f"{feat[k]['free_ride']:.2f}", f"{feat[k]['final_mean_s']:.1f}",
                             f"{feat[k]['agents']:.0f}"] for k in sel])]
    return "\n".join(lines), {"feat": feat, "ff": ff}


def accumulation(rs: list[dict]) -> str:
    """Per 60 s bin: games still running, agents summoned so far, commits/s, owner-useful share,
    gross and net Δ salience per commit."""
    nb = 15
    rows = []
    for b in range(nb):
        live = [r for r in rs if r["duration"] >= (b + 1) * 60]
        if len(live) < 10:
            break
        ag = np.mean([r["bin_agents"][b] for r in live])
        c = np.array([r["bin_commits"][b] for r in live], float)
        up = np.array([r["bin_owner_up"][b] for r in live], float)
        ab = np.array([r["bin_abs_dsal"][b] for r in live], float)
        nt = np.array([r["bin_net_dsal"][b] for r in live], float)
        rows.append([f"{b * 60}-{(b + 1) * 60}", len(live), f"{ag:.0f}", f"{c.mean() / 60:.1f}",
                     f"{up.sum() / max(c.sum(), 1):.3f}", f"{ab.sum() / max(c.sum(), 1):.2f}",
                     f"{nt.sum() / max(c.sum(), 1):+.3f}"])
    return md_table(["window (s)", "games", "agents (all gods)", "commits/s", "owner-useful share",
                     "|Δ salience| / commit", "net Δ salience / commit"], rows)


def mutator_value(rs: list[dict]) -> str:
    """Per mutator: mean owner Δs and peer Δs per commit (is it a builder, a thief or a wrecker?)."""
    tot = defaultdict(lambda: np.zeros(4))
    for r in rs:
        for f, dct in r["mut_family"].items():
            for mid, v in dct.items():
                tot[mid] += np.array(v, float)
    allc = sum(v[0] for v in tot.values())
    rows = []
    for mid, v in sorted(tot.items(), key=lambda kv: -kv[1][0]):
        rows.append([mid, f"{v[0] / allc:.3f}", f"{v[1] / v[0]:.2f}", f"{v[2] / v[0]:+.3f}", f"{v[3] / v[0]:+.3f}"])
    return md_table(["mutator", "commit share", "owner-up share", "owner Δs / commit", "peers Δs / commit"], rows)


def summons_by_cost(rs: list[dict]) -> str:
    agents = defaultdict(int)
    for r in rs:
        for f, c in r["summons_family"].items():
            for mid, n in c.items():
                agents[mid] += n
    tot = sum(agents.values())
    return ", ".join(f"{k} {v / tot:.3f}" for k, v in sorted(agents.items(), key=lambda kv: -kv[1]))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.diagnose", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=160)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--setting", default="old", choices=sorted(SETTINGS))
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    rs = run_batch(SETTINGS[a.setting], make_specs(a.types.split(";"), a.games, a.seed, a.mix), a.processes,
                   label="diagnose")
    add_dyn2(rs)
    print("### What drives per-game dynamism\n" + game_drivers(rs))
    txt, fd = family_drivers(rs)
    print("\n### What drives family advantage\n" + txt)
    print("\n### Accumulation over time\n" + accumulation(rs))
    print("\n### Mutator value per commit\n" + mutator_value(rs))
    print("\n### Agents summoned, share by mutator\n" + summons_by_cost(rs))
    ce = ceilings(rs)
    low = sorted(((v, k) for k, v in ce.items() if v < 20))
    print("\n### Low-ceiling draws (< 20 bits)\n" + ", ".join(f"{k[1]}@{k[0][4:]} {v:.0f}" for v, k in low))
    save_json(f"diagnose-{a.setting}-{a.mix}-{a.seed}", {"feat": fd["feat"], "fam": fd["ff"]["families"]})


if __name__ == "__main__":
    main()
