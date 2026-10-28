"""Appendix table for docs/explore/mutators.md: per family, default vs a proposal preset, landscape + games.

    python3 -m gridlab.explore.mutators.tables --type 5,base10,rgby --a default --b full --games 600 --seed 1
"""
from __future__ import annotations

import argparse

from ...experiments import common as C
from ...experiments.common import parse_type
from . import libyield as LY
from .games import fairness, run_preset
from .landscape import load_or_run
from .report import family_summary, md


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--a", default="default")
    ap.add_argument("--b", default="full")
    ap.add_argument("--games", type=int, default=600)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args(argv)
    gt = parse_type(a.type)
    FA, FB = (family_summary(load_or_run(gt, p, allow_old=True)) for p in (a.a, a.b))
    LA = LY.family_table(LY.load_or_run(gt, a.a))
    specs = C.make_specs([a.type], a.games, a.seed, "mixed")
    ZA, ZB = (fairness(run_preset(p, specs))["families"] for p in (a.a, a.b))
    rows = []
    for f in sorted(FA, key=lambda f: FA[f]["route"]):
        A, B = FA[f], FB[f]
        za, zb = ZA.get(f), ZB.get(f)
        rows.append([f, f"{A['ceil']:.0f}",
                     f"{A['route']:.2f} {A['game']['tool']}", f"{B['route']:.2f} {B['game']['tool']}",
                     f"{A['rival']['best']:.2f}/{B['rival']['best']:.2f}" if "rival" in A else "-",
                     f"{A['jack_rate0.75']:.2f}/{B['jack_rate0.75']:.2f}",
                     f"{LA[f]['lib_bestK']:.3f}" if f in LA else "-",
                     "-" if za is None else f"{za['adj_z']:.2f}", "-" if zb is None else f"{zb['adj_z']:.2f}"])
    print(md(["family", "ceil (bits)", f"route yield, tool ({a.a})", f"route yield, tool ({a.b})",
              "theft yield a/b", "jackpot rate a/b", "library best-of-12 (a)", f"game z ({a.a})", f"game z ({a.b})"], rows))


if __name__ == "__main__":
    main()
