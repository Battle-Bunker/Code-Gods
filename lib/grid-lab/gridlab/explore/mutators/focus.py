"""Per-family paired comparison (pooled specs): Δ adj. z for chosen families with a paired game bootstrap.

    python3 -m gridlab.explore.mutators.focus --a default --b full --seed 1,9000000
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ...experiments import common as C
from .games import run_preset

FOCUS = ["quilt_maker", "lone_peak", "robin_hood", "magic_accountant", "round_numbers", "seed2_patchwork",
         "rummy_melder", "twenty_one", "odds_evens", "lucky_token", "seed3_green_ones", "number_painter",
         "treasure_map", "knight_riders", "conqueror", "fair_weaver", "stripe_painter", "looking_glass",
         "wallpaper_weaver", "snap", "full_house"]


def rows_of(rs, idx):
    out = []
    for gi in idx:
        r = rs[gi]
        G = r["n_gods"]
        for g in r["gods"]:
            out.append({"game": gi, "family": g["family"], "policy": g["policy"], "z": (G - g["rank"]) / (G - 1)})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", default="default")
    ap.add_argument("--b", default="full")
    ap.add_argument("--types", default="5,base10,rgby")
    ap.add_argument("--games", type=int, default=600)
    ap.add_argument("--seed", default="1,9000000")
    ap.add_argument("--B", type=int, default=300)
    a = ap.parse_args(argv)
    specs = [s for sd in a.seed.split(",") for s in C.make_specs(a.types.split(";"), a.games, int(sd), "mixed")]
    ra, rb = run_preset(a.a, specs), run_preset(a.b, specs)
    n = len(specs)
    fa, _ = C.additive_fit(rows_of(ra, range(n)), iters=20)
    fb, _ = C.additive_fit(rows_of(rb, range(n)), iters=20)
    rng = np.random.default_rng(0)
    d = defaultdict(list)
    for _ in range(a.B):
        idx = rng.integers(0, n, n)
        xa, _ = C.additive_fit(rows_of(ra, idx), iters=12)
        xb, _ = C.additive_fit(rows_of(rb, idx), iters=12)
        for f in FOCUS:
            if f in xa and f in xb:
                d[f].append(xb[f] - xa[f])
    print(f"{n} paired specs (seed {a.seed}); adj. z = policy-adjusted mean rank score (0.5 = fair)")
    print(f"| family | {a.a} | {a.b} | Δ [95% CI] |\n|---|---|---|---|")
    for f in FOCUS:
        if f in fa and d[f]:
            v = np.array(d[f])
            print(f"| {f} | {fa[f]:.2f} | {fb[f]:.2f} | {fb[f] - fa[f]:+.2f} [{np.quantile(v, .025):+.2f}, {np.quantile(v, .975):+.2f}] |")


if __name__ == "__main__":
    main()
