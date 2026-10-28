"""Baseline: a large batch of full games under the engine defaults (real 100 Hz rate and economy).

    python3 -m gridlab.experiments.baseline                       # 5 GridTypes x 160 games, mixed policies
    python3 -m gridlab.experiments.baseline --games 40 --types 5,base10,rgby
    python3 -m gridlab.experiments.baseline --mix greedy          # all greedy_private
    python3 -m gridlab.experiments.baseline --setting old         # the delivered defaults (see below)
    python3 -m gridlab.experiments.baseline --setting new         # the recommended defaults

Games are 3-6 gods, per-god policies iid from the mix, exponential length (half-life 300 s), dealer
"distinct". Results are cached per game (.cache/experiments/games/) and the whole batch is summarised
to .cache/experiments/baseline-<setting>-<mix>.json.
"""
from __future__ import annotations

import argparse

from .common import GTYPES, make_specs, run_batch, save_json, add_dyn2
from .report import full_report, trajectory_examples
from .settings import SETTINGS


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.baseline", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(GTYPES), help="';'-separated GridTypes")
    ap.add_argument("--games", type=int, default=160, help="games per GridType")
    ap.add_argument("--seed", type=int, default=1, help="spec seed (1 = training seeds, 9000000 = held out)")
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--setting", default="old", choices=sorted(SETTINGS))
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    specs = make_specs(a.types.split(";"), a.games, a.seed, a.mix)
    rs = run_batch(SETTINGS[a.setting], specs, a.processes, label=f"baseline/{a.setting}/{a.mix}")
    add_dyn2(rs)
    print(full_report(rs, f"Baseline: setting {a.setting}, policy mix {a.mix}"))
    print("\n### example leaderboard trajectories (total payoff)")
    print(trajectory_examples(rs, 3))
    save_json(f"baseline-{a.setting}-{a.mix}-{a.seed}", {"n": len(rs), "keys": [r["key"] for r in rs]})


if __name__ == "__main__":
    main()
