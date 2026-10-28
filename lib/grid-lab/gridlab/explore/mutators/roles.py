"""Mutator roles: for how many families is each mutator the best tool, per context (landscape single steps).

    python3 -m gridlab.explore.mutators.roles --type 5,base10,rgby --presets default,full
"""
from __future__ import annotations

import argparse

from .landscape import load_or_run
from .report import family_summary, md, mutator_summary


def roles(gt, preset):
    L = load_or_run(gt, preset, allow_old=True)
    F = family_summary(L)
    out = {}
    for ctx in ("game", "near", "rival", "foreign"):
        ms = mutator_summary(L, F, ctx)
        for m, v in ms.items():
            out.setdefault(m, {})[ctx] = len(v["best_for"])
    return out


if __name__ == "__main__":
    from ...experiments.common import parse_type
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--presets", default="default,full")
    a = ap.parse_args()
    gt = parse_type(a.type)
    R = {p: roles(gt, p) for p in a.presets.split(",")}
    ms = list(dict.fromkeys(m for p in R for m in R[p]))
    rows = []
    for m in ms:
        row = [m]
        for p in R:
            v = R[p].get(m)
            row.append("-" if v is None else " / ".join(str(v[c]) for c in ("game", "near", "rival", "foreign")))
        rows.append(row)
    print(f"#families for which the mutator is the best single-step tool: game / near / rival / foreign ({gt.key})")
    print(md(["mutator"] + list(R), rows))
