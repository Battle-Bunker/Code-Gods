"""Landscape for a few families only (no caching of the whole matrix), default vs other presets.

    python3 -m gridlab.explore.mutators.focus_landscape --type 6,cards,rainbow6 --families rummy_melder,lone_peak --presets default,full
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from .landscape import run
from .report import family_summary, md
from . import states as ST

if __name__ == "__main__":
    from ...experiments.common import parse_type
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="6,cards,rainbow6")
    ap.add_argument("--families", default="rummy_melder,lone_peak,seed2_patchwork,card_windmill,quilt_maker,round_numbers")
    ap.add_argument("--presets", default="default,full")
    ap.add_argument("--processes", type=int, default=2)
    a = ap.parse_args()
    gt = parse_type(a.type)
    res = {}
    for p in a.presets.split(","):
        L = run(gt, preset=p, families=a.families.split(","), processes=a.processes, verbose=False)
        F = family_summary(L)
        res[p] = {f: {"route": F[f]["route"], "one": F[f]["one"], "tool": F[f]["game"]["tool"],
                      "desc": F[f].get("route_desc")} for f in F}
    fams = a.families.split(",")
    rows = [[f] + [f"{res[p][f]['route']:.2f} ({res[p][f]['tool']})" if f in res[p] else "-" for p in res] for f in fams]
    print(f"route yield (best tool, 1-step) on {gt.key}")
    print(md(["family"] + list(res), rows))
    for p in res:
        for f in fams:
            if f in res[p]:
                print(p, f, res[p][f]["desc"])
    ST.CACHE.mkdir(parents=True, exist_ok=True)
    with open(ST.CACHE / f"focus-{gt.key}.json", "w") as fh:
        json.dump(res, fh, default=str)
