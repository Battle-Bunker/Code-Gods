"""Paired bootstrap of fairness / usage differences between two presets on the same game specs.

    python3 -m gridlab.explore.mutators.paired --a default --b full --games 600 --seed 1

Resamples game specs (the same indices for both presets) and recomputes, per replicate, the SD across
families of the policy-adjusted mean rank score z (additive fit), the per-game mutator entropy, and the
mean |z - 0.5| over families. Reports the difference b - a with a 95% CI.
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ...experiments import common as C
from .games import run_preset


def _stats(rs, idx, min_n=10):
    rows = []
    for gi in idx:
        r = rs[gi]
        G = r["n_gods"]
        for g in r["gods"]:
            rows.append({"game": gi, "family": g["family"], "policy": g["policy"], "z": (G - g["rank"]) / (G - 1)})
    adj, _ = C.additive_fit(rows, iters=15)
    n = defaultdict(int)
    for r in rows:
        n[r["family"]] += 1
    v = np.array([adj[f] for f in adj if n[f] >= min_n])
    ent = np.mean([rs[gi]["mutator_entropy_norm"] for gi in idx])
    return {"z_sd": float(v.std()), "z_mad": float(np.abs(v - 0.5).mean()), "z_range90": float(np.quantile(v, .9) - np.quantile(v, .1)),
            "entropy": float(ent), "gini": float(np.mean([rs[gi]["payoff_gini"] for gi in idx]))}


def paired(ra, rb, B=300, seed=0):
    n = len(ra)
    base_a, base_b = _stats(ra, range(n)), _stats(rb, range(n))
    rng = np.random.default_rng(seed)
    diffs = defaultdict(list)
    for _ in range(B):
        idx = rng.integers(0, n, n)
        sa, sb = _stats(ra, idx), _stats(rb, idx)
        for k in sa:
            diffs[k].append(sb[k] - sa[k])
    return {k: (base_a[k], base_b[k], base_b[k] - base_a[k], float(np.quantile(v, .025)), float(np.quantile(v, .975)))
            for k, v in diffs.items()}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", default="default")
    ap.add_argument("--b", default="full")
    ap.add_argument("--types", default="5,base10,rgby")
    ap.add_argument("--games", type=int, default=600)
    ap.add_argument("--seed", default="1", help="spec seed(s), comma-separated (pooled)")
    ap.add_argument("--B", type=int, default=300)
    ap.add_argument("--only", default="", help="keep only specs of this GridType (e.g. 6,cards,rainbow6); the spec "
                    "seeds depend on the position of the type in --types, so pass the same --types as the batch")
    a = ap.parse_args(argv)
    specs = [s for sd in a.seed.split(",") for s in C.make_specs(a.types.split(";"), a.games, int(sd), "mixed")]
    if a.only:
        specs = [s for s in specs if s.gtype == a.only]
    ra, rb = run_preset(a.a, specs), run_preset(a.b, specs)
    out = paired(ra, rb, a.B)
    print(f"paired bootstrap over {len(specs)} game specs (seed {a.seed}), {a.B} replicates: {a.b} - {a.a}")
    print("| statistic | " + a.a + " | " + a.b + " | difference [95% CI] |\n|---|---|---|---|")
    for k, (x, y, d, lo, hi) in out.items():
        print(f"| {k} | {x:.3f} | {y:.3f} | {d:+.3f} [{lo:+.3f}, {hi:+.3f}] |")


if __name__ == "__main__":
    main()
