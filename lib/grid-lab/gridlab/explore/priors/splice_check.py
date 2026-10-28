"""How good is gridlab/priors.py's spliced tail? (Monte Carlo body + uniform tail shape)

    python3 -m gridlab.explore.priors.splice_check --type 5,base10,rgby

gridlab/priors.py estimates the code-reachable prior (k ~ U{0..4} cheap programs, cost <= 30) by
Monte Carlo on a 2^17 pool and, beyond the deepest pool level, splices on the uniform table's
shape: log2 ρ{u >= t} ≈ log2 ρ{u >= ℓ0} + log2 μ{u >= t} - log2 μ{u >= ℓ0}. latent.py's `reach4`
is the same prior, estimated by latent-space splitting all the way down. This compares them at the
uniform table's levels nearest 16, 24, 32, 48 bits and at the family's ceiling.
"""
from __future__ import annotations

import argparse

import numpy as np

from ... import calibrate as cal
from . import latent as la
from .measure import family_draws, parse_type, top_ordinal
from .validate import md


def run(gt, processes=4) -> str:
    from ...priors import reachable_survival, reachable_pool
    draws = family_draws(gt)
    la.precompute(draws, gt, "reach4", processes=processes)
    reachable_pool(gt)
    rows, gaps = [], []
    for d in draws:
        u = cal.survival(d, gt)
        r = la.survival(d, gt, "reach4")
        s = reachable_survival(d, gt)
        cells = []
        for target in (16, 24, 32, 48):
            j = np.flatnonzero(-u.log2p >= target)
            if not len(j):
                cells.append("")
                continue
            t = int(u.levels[j[0]])
            cells.append(f"{s.surprisal(t):.0f} / {r.surprisal(t):.0f}")
        top = top_ordinal(d, gt, u)
        gap = s.surprisal(top) - r.surprisal(top)
        gaps.append(gap)
        rows.append([d.family.id, f"{u.surprisal(top):.0f}"] + cells + [f"{s.surprisal(top):.0f} / {r.surprisal(top):.0f}",
                                                                      f"{gap:+.1f}"])
    rows.sort(key=lambda x: -float(x[-1]))
    g = np.array(gaps)
    head = (f"{gt.key}: spliced (gridlab/priors.py) vs latent splitting (reach4), bits, {len(draws)} families. "
            f"Splice − latent at the ceiling: mean {g.mean():+.1f}, median {np.median(g):+.1f}, "
            f"> +5 bits for {int((g > 5).sum())} families, < −5 for {int((g < -5).sum())}\n\n")
    return head + md(["family", "uniform ceiling", "@16 splice/latent", "@24", "@32", "@48", "ceiling splice/latent",
                      "gap"], rows)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.splice_check")
    ap.add_argument("--type", default="5,base10,rgby")
    a = ap.parse_args(argv)
    print(run(parse_type(a.type)))


if __name__ == "__main__":
    main()
