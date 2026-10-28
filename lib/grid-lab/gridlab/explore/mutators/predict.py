"""Which static measure predicts per-family game outcomes?

    python3 -m gridlab.explore.mutators.predict --preset default --games 600 --seed 1

Spearman correlation across families between the policy-adjusted mean rank score z from games
(gridlab.experiments.common.family_fairness) and: the landscape route yield, the library best-of-12 yield
(libyield.py), the calibrated ceiling, and their products.
"""
from __future__ import annotations

import argparse

import numpy as np

from ...experiments import common as C
from ...experiments.common import parse_type
from . import libyield as LY
from .games import fairness, run_preset
from .landscape import load_or_run
from .report import family_summary


def spearman(a, b) -> float:
    ra = np.argsort(np.argsort(a))
    rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def boot_spearman(a, b, B=1000, seed=0):
    r = np.random.default_rng(seed)
    a, b = np.asarray(a), np.asarray(b)
    v = [spearman(a[i], b[i]) for i in (r.integers(0, len(a), len(a)) for _ in range(B))]
    return spearman(a, b), float(np.quantile(v, .025)), float(np.quantile(v, .975))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--preset", default="default")
    ap.add_argument("--landscape", default=None, help="landscape preset (default: same)")
    ap.add_argument("--games", type=int, default=600)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args(argv)
    gt = parse_type(a.type)
    specs = C.make_specs([a.type], a.games, a.seed, "mixed")
    ff = fairness(run_preset(a.preset, specs))["families"]
    lp = a.landscape or a.preset.replace("+recipes", "")
    F = family_summary(load_or_run(gt, lp, allow_old=True))
    LYt = LY.family_table(LY.load_or_run(gt, lp))
    fams = [f for f in ff if f in F and f in LYt and ff[f]["n"] >= 10]
    z = np.array([ff[f]["adj_z"] for f in fams])
    meas = {"landscape route yield": [F[f]["route"] for f in fams],
            "landscape 1-step yield": [F[f]["one"] for f in fams],
            "library best-of-12 yield": [LYt[f]["lib_bestK"] for f in fams],
            "library share of positive programs": [LYt[f]["lib_pos"] for f in fams],
            "calibrated ceiling (bits)": [F[f]["ceil"] for f in fams],
            "route yield × ceiling": [F[f]["route"] * F[f]["ceil"] for f in fams],
            "library best-of-12 × ceiling": [LYt[f]["lib_bestK"] * F[f]["ceil"] for f in fams]}
    print(f"{len(fams)} families with >= 10 god-slots; {a.games} games, preset {a.preset}, seed {a.seed}")
    print("| predictor | Spearman ρ with adj. z [95% CI] |\n|---|---|")
    for k, v in meas.items():
        p, lo, hi = boot_spearman(v, z)
        print(f"| {k} | {p:+.2f} [{lo:+.2f}, {hi:+.2f}] |")


if __name__ == "__main__":
    main()
