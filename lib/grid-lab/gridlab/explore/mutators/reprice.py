"""Exact single-step re-pricing of a stored landscape under other cost presets (no re-simulation).

    python3 -m gridlab.explore.mutators.reprice --type 5,base10,rgby --presets default,structured,...

Δs per parameter setting does not depend on prices, so the landscape's stored train/test mean Δs for every
single step can be re-ranked under any preset that keeps the mutator set: per (draw, context, mutator) the
best params by TRAIN yield, its TEST yield. Multi-step programs are not re-priced here (use landscape.py).
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ...core import GridType
from ...program import ALWAYS, Program, Step
from .landscape import load_or_run
from .report import md
from .variants import PRESETS, install_preset

CTXS = ("game", "near", "rival", "foreign")


def bank_costs(L: dict, gt: GridType, preset: str) -> np.ndarray:
    install_preset(preset)
    try:
        return np.array([Program(ALWAYS, (Step.make(L["ids"][k], p),)).cost(gt)
                         for k, p in zip(L["bank_mids"], L["bank_params"])])
    finally:
        install_preset("default")


def single_matrix(L: dict, cost: np.ndarray) -> dict:
    """{ctx: {family: (best yield per mutator, draw-mean)}}"""
    mids = np.asarray(L["bank_mids"])
    nm = len(L["ids"])
    out = {c: defaultdict(list) for c in CTXS}
    for r in L["draws"]:
        for c in CTXS:
            if c not in r["ctx"]:
                continue
            dtr = np.asarray(r["ctx"][c]["dtr_all"], float)
            dte = np.asarray(r["ctx"][c]["dte_all"], float)
            ytr, yte = dtr / cost, dte / cost
            row = np.zeros(nm)
            for k in range(nm):
                sel = np.flatnonzero(mids == k)
                j = sel[int(np.argmax(ytr[sel]))]
                row[k] = yte[j] if ytr[j] > 0 else 0.0
            out[c][r["family"]].append(row)
    return {c: {f: np.mean(v, 0) for f, v in d.items()} for c, d in out.items()}


def summarise(L: dict, M: dict) -> dict:
    ids = L["ids"]
    g = M["game"]
    best = {f: float(v.max()) for f, v in g.items()}
    v = np.array(list(best.values()))
    med = float(np.median(v))
    tools = {f: ids[int(np.argmax(y))] for f, y in g.items()}
    best_any = set(tools.values())
    for c in ("near", "rival", "foreign"):
        best_any |= {ids[int(np.argmax(y))] for y in M[c].values() if y.max() > 0}
    theft = np.array([M["rival"][f].max() for f in M["rival"]])
    return {"median": med, "sd_log2": float(np.log2(np.maximum(v, 1e-3)).std()),
            "share_half_double": float(np.mean((v >= med / 2) & (v <= 2 * med))),
            "p10": float(np.quantile(v, .1)), "p90": float(np.quantile(v, .9)),
            "n_tools_game": len(set(tools.values())), "never_best": sorted(set(ids) - best_any),
            "theft_median": float(np.median(theft)), "theft_ratio": float(np.median(theft) / med),
            "tools": tools, "best": best}


def main(argv=None):
    from ...experiments.common import parse_type
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--presets", default="default")
    ap.add_argument("--draws", type=int, default=3)
    ap.add_argument("--base", default="default", help="landscape preset whose stored Δs are re-priced "
                    "(presets must keep its mutator set)")
    a = ap.parse_args(argv)
    gt = parse_type(a.type)
    L = load_or_run(gt, a.base, a.draws, allow_old=True)
    rows = []
    for p in a.presets.split(","):
        assert p in PRESETS, p
        s = summarise(L, single_matrix(L, bank_costs(L, gt, p)))
        rows.append([p, f"{s['median']:.3f}", f"{s['p10']:.3f}", f"{s['p90']:.3f}", f"{s['sd_log2']:.2f}",
                     f"{s['share_half_double']:.2f}", s["n_tools_game"], f"{s['theft_median']:.2f} ({s['theft_ratio']:.1f}×)",
                     ", ".join(s["never_best"])])
    print(md(["preset", "median 1-step y", "p10", "p90", "SD log2", "share ½-2×", "#tools best (game)",
              "theft median (× build)", "never best in any context"], rows))


if __name__ == "__main__":
    main()
