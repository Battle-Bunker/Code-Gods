"""Do the ecosystem's conclusions survive a change of player model?

    python3 -m gridlab.explore.players.robust --types "5,base10,rgby" --seeds 0:60 \
        --populations engine,greedy,strong,human --settings base,cheap,dear,move_hi,bij_dear

A *population* is a policy mix; each game seats 4 gods drawn iid from it (from an RNG that depends only
on the seed, so a population is played on the same deals in every setting). A *setting* is a design
point (GameConfig / COST_KNOBS overrides on the 100 Hz engine defaults). For each population and
setting it reports dynamism and its parts, welfare, mutator entropy and family fairness, and for each
non-base setting the paired (same seeds) change versus base, so one can read off whether a design
conclusion ("cheaper agents raise dynamism") keeps its sign under every player model.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np

from .tournament import Match, fmt_ci, md_table, mean_ci, run_matches, setting

POPULATIONS = {
    # the engine worker's mixed baseline (experiments.common POLICY_MIXES["mixed"])
    "engine": ("random", "greedy_private", "saver", "greedy_omniscient"),
    "greedy": ("greedy_private",),
    # stronger private-information players from this study
    "strong": ("saver", "k32_bar", "burst", "saver_ridge", "saver_planner"),
    # noisier, more human-like mix: talkers who announce goals, learners, impulsive spenders
    "human": ("talker", "bandit", "random", "afford", "copycat", "listener"),
}

SETTINGS = {
    "base": {},
    "cheap": {"config": {"cost_scale": 0.5}},
    "dear": {"config": {"cost_scale": 2.0}},
    "rich": {"config": {"energy_per_second": 2.0}},
    "move_hi": {"knobs": {"move": 0.7}},
    "bij_dear": {"knobs": {"kind": {"bijective": 2.0}}},
    "global_dear": {"knobs": {"scope": {"global": 2.0}}},
    "metabolic": {"config": {"metabolic_cost": 0.02}},
    "erase15": {"knobs": {"erase": 1.5}},
    "halflife": {"config": {"agent_half_life": 120.0}},
}

KEYS = ["dynamism2", "dynamism", "welfare", "sig_tension_rate", "snap_tension", "climbs_held_accel_per_100s",
        "spirals_per_100_commits", "crossings_per_pair_100s", "durable_lead_changes_per_obj_100s", "mutator_entropy_norm",
        "steal_rate", "energy_unspent_share", "agents"]


def matches_for(gtypes, seeds, mix, G: int = 4):
    out = []
    for gt in gtypes:
        for seed in seeds:
            r = np.random.default_rng([int(seed), 77])
            out.append(Match(gt, int(seed), tuple(str(mix[int(r.integers(len(mix)))]) for _ in range(G))))
    return out


def family_effects(results):
    """Policy-adjusted family mean z (experiments.common.additive_fit)."""
    from ...experiments.common import additive_fit
    rows = [{"family": g["family"], "policy": g["policy"], "z": g["z"], "game": k}
            for k, r in enumerate(results) for g in r["gods"]]
    fam, _ = additive_fit(rows)
    n = defaultdict(int)
    for x in rows:
        n[x["family"]] += 1
    return fam, n


def mutator_shares(results):
    acc = defaultdict(float)
    for r in results:
        for m, v in (r.get("mutator_shares") or {}).items():
            acc[m] += v / len(results)
    return dict(acc)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", default="5,base10,rgby")
    ap.add_argument("--seeds", default="0:60")
    ap.add_argument("--populations", default="engine,greedy,strong,human")
    ap.add_argument("--settings", default="base,cheap,dear,move_hi,bij_dear")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    lo, hi = map(int, a.seeds.split(":"))
    pops, sets = a.populations.split(","), a.settings.split(",")
    res = {}
    for p in pops:
        ms = matches_for(a.types.split(";"), range(lo, hi), POPULATIONS[p])
        for s in sets:
            res[(p, s)] = run_matches(ms, setting(**SETTINGS[s]), a.processes, label=f"{p}/{s}")
    # 1. levels per population x setting
    rows = []
    for p in pops:
        for s in sets:
            rs = res[(p, s)]
            rows.append([p, s] + [fmt_ci(mean_ci([r[k] for r in rs]), 3 if k not in ("welfare", "agents") else 0)
                                  for k in KEYS[:9]])
    print(md_table(["population", "setting"] + KEYS[:9], rows))
    # 2. paired change vs base: does the sign hold across populations?
    if "base" in sets:
        print("\nPaired change vs base (same seeds), mean [95% CI]:\n")
        rows = []
        for s in sets:
            if s == "base":
                continue
            for k in ("dynamism2", "dynamism", "welfare", "snap_tension", "climbs_held_accel_per_100s",
                      "mutator_entropy_norm", "steal_rate"):
                row = [s, k]
                for p in pops:
                    d = [y[k] - x[k] for x, y in zip(res[(p, "base")], res[(p, s)])]
                    m, l, h = mean_ci(d)
                    row.append(f"{m:+.3g} [{l:+.3g}, {h:+.3g}]{'*' if l > 0 or h < 0 else ''}")
                rows.append(row)
        print(md_table(["setting", "metric"] + pops, rows))
    # 3. mutator usage per population (base)
    if "base" in sets:
        ms_ = {p: mutator_shares(res[(p, "base")]) for p in pops}
        allm = sorted(set().union(*[set(v) for v in ms_.values()]), key=lambda m: -np.mean([ms_[p].get(m, 0) for p in pops]))
        print("\nMutator shares of committed applications (base):\n")
        print(md_table(["mutator"] + pops, [[m] + [f"{ms_[p].get(m, 0):.3f}" for p in pops] for m in allm]))
        # 4. family effects: correlation between populations
        fe = {p: family_effects(res[(p, "base")]) for p in pops}
        half = {p: (family_effects(res[(p, "base")][0::2]), family_effects(res[(p, "base")][1::2])) for p in pops}

        def spear(A, B, nmin=4):
            (f1, n1), (f2, n2) = A, B
            common = [f for f in f1 if f in f2 and n1[f] >= nmin and n2[f] >= nmin]
            if len(common) < 5:
                return "–"
            r1 = np.argsort(np.argsort([f1[f] for f in common])); r2 = np.argsort(np.argsort([f2[f] for f in common]))
            return f"{np.corrcoef(r1, r2)[0, 1]:.2f} (n={len(common)})"
        print("\nSpearman correlation of policy-adjusted family mean z between populations (base); diagonal: "
              "split-half (even vs odd seeds) reliability within the population:\n")
        rows = [[p] + [spear(*half[p], nmin=2) if p == q else spear(fe[p], fe[q]) for q in pops] for p in pops]
        print(md_table(["population"] + pops, rows))
    if a.json:
        with open(a.json, "w") as fh:
            json.dump({f"{p}|{s}": {k: [r[k] for r in rs] for k in KEYS} for (p, s), rs in res.items()}, fh)


if __name__ == "__main__":
    main()
