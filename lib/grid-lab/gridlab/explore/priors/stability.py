"""Production stability of each prior: how far do tables move when nothing about the rules changes?

    python3 -m gridlab.explore.priors.stability --type 4,base12,rgb --priors reach2,levin,mix.5_reach2

For a set of families (one fixed draw each) and each prior, the mean |Δs| (bits) between a reference
table and a perturbed one, at the ordinals of held-out grids that occur in games (and at the exemplar):

  seed       same everything, an independent sampler seed (pure estimator noise)
  library    an independently drawn 4096-program library (same mutators and knobs): the prior depends
             on which programs happen to be in the catalogue
  knob       COST_KNOBS["move"] 0.35 -> 0.50: a routine economy retune re-prices programs, which moves
             the cheap set (reach) or the weights (beta, levin)
The uniform prior moves only under `seed` (its tables do not depend on programs or costs at all).
"""
from __future__ import annotations

import argparse

import numpy as np

from ...core import GridType
from ... import calibrate as cal
from ...experiments import common as C
from . import latent as la
from .measure import family_draws, parse_type, top_ordinal
from .validate import md

FAMS = ["conqueror", "rainbow_road", "mirrormancer", "lucky_token", "stripe_painter", "seed1_line_painter",
        "number_bonds", "homebody", "chessmaster", "castle_keeper", "straight_shooter", "full_house"]


def _library(gt: GridType, seed: int, size: int = 4096):
    from ...program import random_program
    rng = np.random.default_rng(seed)
    progs, seen = [], set()
    while len(progs) < size:
        p = random_program(rng, gt)
        if p.key not in seen:
            seen.add(p.key)
            progs.append(p)
    return progs, np.array([p.cost(gt) for p in progs])


def run(gt: GridType, priors, processes: int = 4) -> str:
    draws = family_draws(gt, set(FAMS))
    from .empirical import played_grids
    RS, RC = played_grids(gt)
    rng = np.random.default_rng(3)
    pick = rng.choice(len(RS), min(2000, len(RS)), replace=False)
    RS, RC = RS[pick], RC[pick]
    ords = [np.asarray(d.family.evaluate_batch(RS, RC, cal.canonical_params(d, gt), gt), np.int64) for d in draws]
    lib2 = _library(gt, 12345)
    rows = []
    for pr in priors:
        spec = la.get_spec(pr)
        ref = [la.survival(d, gt, spec) if not spec.is_uniform else cal.survival(d, gt) for d in draws]
        variants = {}
        if spec.is_uniform:
            variants["seed"] = [cal.build_table(d, gt, salt="stab") for d in draws]
        else:
            variants["seed"] = [la.build_table(d, gt, spec, salt="stab") for d in draws]
            law2 = la.program_law(gt, spec, library=lib2)
            variants["library"] = [la.build_table(d, gt, spec, law=law2) for d in draws]
            C.apply_knobs({"move": 0.5})
            try:
                la._LAWS.clear()
                law3 = la.program_law(gt, spec)
                variants["knob"] = [la.build_table(d, gt, spec, law=law3) for d in draws]
            finally:
                C.apply_knobs({})
                la._LAWS.clear()
        for vname, tabs in variants.items():
            dg, dt = [], []
            for d, t0, t1, o in zip(draws, ref, tabs, ords):
                dg.append(np.abs(np.asarray(t1.surprisal(o), float) - np.asarray(t0.surprisal(o), float)).mean())
                top = top_ordinal(d, gt, cal.survival(d, gt))
                dt.append(abs(t1.surprisal(top) - t0.surprisal(top)))
            rows.append([pr, vname, f"{np.mean(dg):.3f}", f"{np.max(dg):.2f}", f"{np.mean(dt):.2f}", f"{np.max(dt):.2f}"])
        print(f"  {pr} done", flush=True)
    return (f"Stability on {gt.key}: {len(draws)} families, {len(RS)} held-out game grids\n\n" +
            md(["prior", "perturbation", "mean |Δs| on game grids", "max family mean", "mean |Δs| at ceiling",
                "max at ceiling"], rows))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.stability")
    ap.add_argument("--type", default="4,base12,rgb")
    ap.add_argument("--priors", default="uniform,reach2,beta.25,levin,mix.5_reach2")
    a = ap.parse_args(argv)
    print(run(parse_type(a.type), a.priors.split(",")))


if __name__ == "__main__":
    main()
