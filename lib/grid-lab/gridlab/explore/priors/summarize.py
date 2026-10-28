"""Summaries of saved measure.py results (policy-free), for the report.

    python3 -m gridlab.explore.priors.summarize [--types "4,base12,rgb;5,base10,rgby"] [--context spawn]
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from .measure import OUT, fairness_summary, CEIL_CAP
from .validate import md


def spearman(a, b) -> float:
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def load(gkey: str, context: str) -> dict:
    return json.loads((OUT / f"measure-{gkey}-{context}.json").read_text())


def summary(res: dict) -> str:
    pr = list(res["priors"])
    base = res["priors"]["uniform"]
    yb = np.array([r["best"] for r in base])
    cb = np.minimum([r["ceiling"] for r in base], CEIL_CAP)
    rows = []
    for p in pr:
        rs = res["priors"][p]
        s = fairness_summary(rs)
        y = np.array([r["best"] for r in rs])
        c = np.minimum([r["ceiling"] for r in rs], CEIL_CAP)
        disc = cb - c
        cy = s["camp_yield"]
        rows.append([p, f"{s['ceiling_median']:.1f}", f"{np.median(disc):.1f}", f"{np.quantile(disc, 0.9):.1f}",
                     f"{s['yield_median']:.3f}", f"{s['sd_log2_yield']:.2f}", f"{s['gini_yield']:.2f}",
                     f"{cy['clumper']:.3f} / {cy['alternator']:.3f} / {cy['neutral']:.3f}",
                     f"{cy['clumper'] / cy['alternator']:.2f}", f"{spearman(yb, y):.2f}", s["distinct_best_tools"]])
    return md(["prior", "ceiling median (≤64)", "median discount", "p90 discount", "best yield median",
               "SD log2 yield", "Gini yield", "camp median yield clum / alt / neut", "clum/alt", "rank corr vs uniform",
               "distinct best tools"], rows)


def discounts(res: dict, prior: str, top: int = 12) -> str:
    base = res["priors"]["uniform"]
    rs = res["priors"][prior]
    d = []
    for b, r in zip(base, rs):
        d.append((min(b["ceiling"], CEIL_CAP) - min(r["ceiling"], CEIL_CAP), b, r))
    d.sort(key=lambda x: -x[0])
    rows = []
    for disc, b, r in d[:top]:
        rec = (r.get("recipe") or {}).get("top_programs") or []
        rows.append([b["family"], b["camp"][:4], f"{min(b['ceiling'], CEIL_CAP):.0f}", f"{min(r['ceiling'], CEIL_CAP):.0f}",
                     f"{disc:.0f}", f"{b['best']:.3f} → {r['best']:.3f}", (rec[0][0] + f" ({rec[0][1]} bits)") if rec else ""])
    return md(["family", "camp", "uniform ceiling", f"{prior} ceiling", "discount", "best yield", "commonest program in the deepest particles"], rows)


def lowest(res: dict, prior: str = "uniform", n: int = 12) -> str:
    rs = sorted(res["priors"][prior], key=lambda r: r["best"])
    return md(["family", "camp", "best yield", "tool"], [[r["family"], r["camp"][:4], f"{r['best']:.3f}", r["tool"]] for r in rs[:n]])


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.summarize")
    ap.add_argument("--types", default="Grid(4,base12,rgb);Grid(5,base10,rgby)")
    ap.add_argument("--context", default="spawn")
    ap.add_argument("--discount-prior", default="reach2")
    a = ap.parse_args(argv)
    for g in a.types.split(";"):
        try:
            res = load(g, a.context)
        except FileNotFoundError:
            continue
        print(f"### {g}, context {a.context}, {len(res['families'])} families\n")
        print(summary(res) + "\n")
        print(f"Largest discounts under {a.discount_prior}\n\n" + discounts(res, a.discount_prior) + "\n")
        print("Lowest best yields (uniform)\n\n" + lowest(res) + "\n")


if __name__ == "__main__":
    main()
