"""Head-to-head comparisons from cached dealer games (run after games.py).

    python3 -m gridlab.explore.synergy.compare

1. fair_aligned − aligned, paired per spec, on every run (training and held out).
2. Exclusion lists on held-out seeds: the same specs and dealer with the full pool vs a reduced pool
   (paired dynamism2 difference), and family fairness (z_sd_excess with a bootstrap CI over games).
"""
from __future__ import annotations

import numpy as np

from ...experiments import common as C
from ...rules import FAMILIES
from .atlas import parse_type
from .dealers import FamilyMatrix
from .games import run_dealers, paired_diff

WEAK = "tetromino_tamer,quilt_maker,robin_hood,sudoku_scholar,odds_evens,lantern_lighter,lone_peak,number_sandwich," \
       "picture_frame,bridge_builder,ladder_of_numbers".split(",")
STRONG = "snap,full_house,bullseye,flush_royale,pinwheel,stripe_painter".split(",")
RUNS = [("5,base10,rgby", 200, 1, {}), ("4,base12,rgb", 120, 1, {}), ("6,cards,rainbow6", 120, 1, {}),
        ("5,base10,rgby", 150, 9000000, {})]
KEYS = ["dynamism2", "sig_tension_rate", "snap_tension", "climbs_held_accel_per_100s", "crossings_per_pair_100s",
        "durable_lead_changes_per_obj_100s"]


def results(gt, n, seed, excl=(), dealers=("uniform", "aligned", "fair_aligned"), config=None):
    fm = FamilyMatrix(gt)
    pool = [f.id for f in FAMILIES if f.available(parse_type(gt)) and f.id not in set(excl)]
    specs = C.make_specs([gt], n, seed, "mixed")
    return run_dealers(gt, specs, list(dealers), fm, pool, config or {}, verbose=False)


def zsd_ci(rs, B=40, seed=0):
    rng = np.random.default_rng(seed)
    pt = C.family_fairness(C.god_rows(rs), B=30)["z_sd_excess"]
    bs = []
    for _ in range(B):
        pick = rng.integers(0, len(rs), len(rs))
        bs.append(C.family_fairness(C.god_rows([rs[i] for i in pick]), B=10)["z_sd_excess"])
    return pt, float(np.quantile(bs, .025)), float(np.quantile(bs, .975))


def main():
    print("### fair_aligned − aligned (paired per spec; mean [95% CI])\n")
    print("| run | " + " | ".join(KEYS) + " | z_sd_excess aligned / fair_aligned |")
    print("|---|" + "---|" * (len(KEYS) + 1))
    for gt, n, seed, cfg in RUNS:
        r = results(gt, n, seed, config=cfg)
        cells = []
        for k in KEYS:
            p, lo, hi = paired_diff([x[k] for x in r["fair_aligned"]], [x[k] for x in r["aligned"]])
            cells.append(f"{p:+.3f} [{lo:+.3f}, {hi:+.3f}]")
        za = C.family_fairness(C.god_rows(r["aligned"]), B=30)["z_sd_excess"]
        zf = C.family_fairness(C.god_rows(r["fair_aligned"]), B=30)["z_sd_excess"]
        print(f"| {parse_type(gt).key} seed {seed} (n={n}) | " + " | ".join(cells) + f" | {za:.3f} / {zf:.3f} |")
    print("\n### Exclusions on held-out seeds (Grid(5,base10,rgby), seed 9000000, 150 specs)\n")
    print("| dealer | pool | dynamism2 | Δ vs full pool (paired) | z_sd_excess [95% CI] |")
    print("|---|---|---|---|---|")
    full = results("5,base10,rgby", 150, 9000000, dealers=("uniform", "aligned", "fair_aligned"))
    for name, ex in (("full", ()), ("− weak (11)", WEAK), ("− weak − strong (17)", WEAK + STRONG)):
        r = full if not ex else results("5,base10,rgby", 150, 9000000, ex)
        for d in ("uniform", "aligned", "fair_aligned"):
            v = [x["dynamism2"] if "dynamism2" in x else C.dynamism2(x) for x in r[d]]
            b = [C.dynamism2(x) for x in full[d]]
            p, lo, hi = paired_diff([C.dynamism2(x) for x in r[d]], b)
            z = zsd_ci(r[d])
            print(f"| {d} | {name} | {np.mean([C.dynamism2(x) for x in r[d]]):.3f} | "
                  f"{'–' if not ex else f'{p:+.3f} [{lo:+.3f}, {hi:+.3f}]'} | {z[0]:.3f} [{z[1]:.3f}, {z[2]:.3f}] |")


if __name__ == "__main__":
    main()
