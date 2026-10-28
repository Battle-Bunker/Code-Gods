"""Do aligned pairs spiral together and opposed pairs steal? Pair alignment (synergy.py: rho, co_lift)
against per-pair spiral and theft rates from a cached batch, plus calibrated synergy on a sample.

    python3 -m gridlab.explore.spirals.pairs --variant base --games 40 [--syn 30]
"""
from __future__ import annotations

import argparse

import numpy as np

from ...sim import draws_for
from .runner import GTYPES, config_for, configure, run, specs_for, parse_type
from .synergy import pair_stats, pair_synergy, surprisals
from .variants import VARIANTS
from .analyse import md


def rows_for(v, specs, rs):
    configure(v)
    out = []
    for spec, r in zip(specs, rs):
        cfg = config_for(v, spec)
        ds = draws_for(cfg)
        gt = cfg.gtype
        S = [surprisals(d, gt) for d in ds]
        T = max(r["duration"], 1e-9)
        k = 0
        G = len(ds)
        for i in range(G):
            for j in range(i + 1, G):
                st = pair_stats(S[i], S[j])
                out.append({"gtype": spec.gtype, "seed": spec.seed, "i": i, "j": j, "fi": ds[i].family.id, "fj": ds[j].family.id,
                            "spiral": 100 * r["pair_spirals"][k][2] / T, "theft": 100 * r["pair_theft"][k][2] / T,
                            "game_spiral": r["ep_spirals_per_100s"], **st, "di": ds[i], "dj": ds[j]})
                k += 1
    return out


def spearman(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    ok = ~(np.isnan(x) | np.isnan(y))
    x, y = x[ok], y[ok]
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1]), int(ok.sum())


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="base")
    ap.add_argument("--games", type=int, default=40)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--syn", type=int, default=0, help="pairs to validate with calibrated synergy")
    a = ap.parse_args(argv)
    v = VARIANTS[a.variant]
    specs = specs_for(GTYPES, a.games, a.seed)
    rs = run(v, specs)
    rows = rows_for(v, specs, rs)
    # within-game: share of a game's pair-spirals, so game-level activity does not confound
    for r in rows:
        r["spiral_rel"] = r["spiral"] / max(r["game_spiral"], 1e-9)
    print(f"{len(rows)} god pairs in {len(rs)} games")
    tab = []
    for x in ("rho", "co_lift"):
        for y in ("spiral", "spiral_rel", "theft"):
            c, n = spearman([r[x] for r in rows], [r[y] for r in rows])
            tab.append([x, y, f"{c:+.3f}", n])
    print(md(["alignment", "outcome", "Spearman", "n"], tab))
    q = np.quantile([r["rho"] for r in rows], [0.25, 0.5, 0.75])
    tab = []
    for lo, hi, nm in [(-9, q[0], "rho Q1 (most opposed)"), (q[0], q[1], "Q2"), (q[1], q[2], "Q3"), (q[2], 9, "Q4 (most aligned)")]:
        sel = [r for r in rows if lo < r["rho"] <= hi]
        tab.append([nm, f"{np.mean([r['rho'] for r in sel]):+.2f}", f"{np.mean([r['spiral'] for r in sel]):.1f}",
                    f"{np.mean([r['spiral_rel'] for r in sel]):.3f}", f"{np.mean([r['theft'] for r in sel]):.1f}", len(sel)])
    print(md(["quartile", "mean rho", "pair spirals /100 s", "share of game's spirals", "pair thefts /100 s", "n"], tab))
    if a.syn:
        r_ = np.random.default_rng(0)
        pick = r_.choice(len(rows), min(a.syn, len(rows)), replace=False)
        sy, rh, cl = [], [], []
        for p in pick:
            rr = rows[p]
            s = pair_synergy(rr["di"], rr["dj"], parse_type(rr["gtype"]))
            sy.append(s); rh.append(rr["rho"]); cl.append(rr["co_lift"])
        print("calibrated synergy vs rho:", spearman(sy, rh), " vs co_lift:", spearman(sy, cl),
              " vs pair spirals:", spearman(sy, [rows[p]["spiral_rel"] for p in pick]))
        print("synergy sample mean", np.nanmean(sy))


if __name__ == "__main__":
    main()
