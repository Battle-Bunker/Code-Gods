"""Precompute survival tables and program libraries for the games a tournament will play.

    python3 -m gridlab.explore.players.prep --types "5,base10,rgby;4,base12,rgb" --seeds 0:400 --gods 4
"""
from __future__ import annotations

import argparse
import time

from ... import calibrate as cal
from ...policy import program_library
from ...sim import GameConfig, default_program_factory, draws_for
from ...experiments.common import parse_type


def prepare(gtypes, seeds, n_gods: int = 4, processes: int = 4, extra_draws=None, verbose: bool = True):
    for gs in gtypes:
        gt = parse_type(gs) if isinstance(gs, str) else gs
        t0 = time.perf_counter()
        ds = []
        for s in seeds:
            ds.extend(draws_for(GameConfig(gtype=gt, n_gods=n_gods, seed=s)))
        if extra_draws:
            ds.extend(extra_draws(gt))
        pre = cal.precompute(ds, gt, processes=processes)
        program_library(gt, default_program_factory(), 4096)
        if verbose:
            print(f"[prep] {gt.key}: built {pre['built']}, cached {pre['cached']} ({time.perf_counter() - t0:.0f}s)", flush=True)


def parse_seeds(s: str) -> range:
    a, b = s.split(":")
    return range(int(a), int(b))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", default="5,base10,rgby;4,base12,rgb;6,cards,rainbow6")
    ap.add_argument("--seeds", default="0:400")
    ap.add_argument("--gods", type=int, default=4)
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    prepare(a.types.split(";"), parse_seeds(a.seeds), a.gods, a.processes)


if __name__ == "__main__":
    main()
