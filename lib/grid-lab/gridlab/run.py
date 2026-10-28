"""CLI: run a batch of games and print a summary table.

    python3 -m gridlab.run --type 5,base10,rgby --gods 4 --games 20 --policy greedy_private --seed 1
    python3 -m gridlab.run --type 5,base10,rgby --gods 4 --policy random,greedy_private,saver,greedy_omniscient --trace

--policy takes one name (all gods) or a comma list (one per god). --trace prints an ASCII trace of
the first game (leaderboard, the most salient objects rendered, their surprisal vectors).
--toys uses the test stand-in families/mutators (tests/toys.py) instead of gridlab.rules/program.
"""
from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import sys
import time
from collections import defaultdict

import numpy as np

from .core import GridType
from . import calibrate as cal
from .sim import GameConfig, run_game, draws_for
from .metrics import metrics

_JOBS: list = []


def _run(i: int):
    t0 = time.perf_counter()
    log = run_game(_JOBS[i])
    m = metrics(log)
    m["wall_seconds"] = time.perf_counter() - t0
    m["seed"] = _JOBS[i].seed
    return m


def parse_type(s: str) -> GridType:
    n, sym, col = s.split(",")
    return GridType(int(n), sym, col)


def build_configs(a) -> list[GameConfig]:
    gt = parse_type(a.type)
    pol = a.policy.split(",")
    pol = pol[0] if len(pol) == 1 else pol
    extra = {}
    if a.toys:
        sys.path.insert(0, ".")
        from tests.toys import TOY_FAMILIES, toy_random_program
        extra = {"families": TOY_FAMILIES, "program_factory": toy_random_program}
    pk = json.loads(a.policy_kwargs) if a.policy_kwargs else {}
    return [GameConfig(gtype=gt, n_gods=a.gods, dealer=a.dealer, policies=pol, seed=a.seed + k,
                       interaction_rate_hz=a.rate, length=a.length, fixed_seconds=a.seconds,
                       half_life_seconds=a.half_life, starting_energy=a.energy, energy_per_second=a.eps,
                       cost_scale=a.cost_scale, metabolic_cost=a.metabolic, agent_half_life=a.agent_half_life,
                       policy_kwargs=pk, **extra)
            for k in range(a.games)]


def trace(cfg: GameConfig, every: float = 30.0, n_objects: int = 3) -> None:
    gt = cfg.gtype
    state = {"next": 0.0}

    def hook(w, ev):
        if ev == "snapshot" and w.t + 1e-9 < state["next"]:
            return
        state["next"] = w.t + every
        S = w.S[:w.M]
        P = (S * (S.sum(1, keepdims=True) - S)).sum(0)
        print(f"\n=== t = {w.t:7.1f}s  objects {w.M}  agents {len(w.agents)}  ({ev}) ===")
        for i in np.argsort(-P):
            d = w.draws[i]
            print(f"  god {i}  {d.family.id:28s} {cfg.policy_list()[i]:18s} payoff {P[i]:10.1f}  "
                  f"energy {w.energy(i):6.1f}  agents {w.own_count[i]:3d}")
        sal = S.sum(1)
        for oi in np.argsort(-sal)[:n_objects]:
            print(f"  object #{w.obj_ids[oi]}  salience {sal[oi]:.1f}  s = [{', '.join(f'{x:.1f}' for x in S[oi])}]")
            for line in gt.render(w.objects[oi]).splitlines():
                print("     " + line)

    print(f"Trace: {gt.key}, seed {cfg.seed}")
    log = run_game(cfg, hook=hook)
    m = metrics(log)
    print(f"\nduration {log.duration:.1f}s  commits {m['commits']}  tension {m['tension_rate']:.2f}  "
          f"spirals {m['spirals']}  lead changes {m['lead_changes']}  dynamism {m['dynamism']:.3f}")
    for i, d in enumerate(log.families):
        print(f"  god {i} {d}: {log.params[i]}")


def summarise(ms: list[dict]) -> None:
    hdr = f"{'seed':>5} {'dur':>6} {'commit':>6} {'agents':>6} {'winner':28} {'tension':>7} {'spiral':>6} " \
          f"{'leadΔ':>5} {'gini':>5} {'stag':>5} {'dyn':>5} {'wall':>5}"
    print(hdr)
    print("-" * len(hdr))
    for m in ms:
        win = min(m["family_rank"], key=lambda x: x[1])[0]
        print(f"{m['seed']:>5} {m['duration']:6.0f} {m['commits']:6d} {m['agents']:6d} {win[:28]:28} "
              f"{m['tension_rate']:7.2f} {m['spirals']:6d} {m['lead_changes']:5d} {m['payoff_gini']:5.2f} "
              f"{m['stagnation_frac']:5.2f} {m['dynamism']:5.3f} {m['wall_seconds']:5.1f}")
    keys = ["duration", "commits", "agents", "tension_rate", "spirals", "spiral_len_mean", "spiral_accelerating",
            "lead_changes", "payoff_gini", "payoff_spread", "welfare", "object_volatility", "stagnation_frac",
            "mutator_entropy_norm", "final_salience_max", "dynamism", "wall_seconds"]
    print("\nmean ± sd over games:")
    for k in keys:
        v = np.array([m[k] for m in ms], float)
        print(f"  {k:22s} {v.mean():10.3f} ± {v.std():8.3f}")
    fr, pr = defaultdict(list), defaultdict(list)
    for m in ms:
        for f, r in m["family_rank"]:
            fr[f].append(r)
        for p, r in m["policy_rank"]:
            pr[p].append(r)
    print("\nper-family final rank (mean, wins/games):")
    for f, rs in sorted(fr.items(), key=lambda kv: np.mean(kv[1])):
        print(f"  {f:30s} {np.mean(rs):5.2f}  {sum(r == 1 for r in rs)}/{len(rs)}")
    if len(pr) > 1:
        print("per-policy final rank (mean, wins/games):")
        for p, rs in sorted(pr.items(), key=lambda kv: np.mean(kv[1])):
            print(f"  {p:30s} {np.mean(rs):5.2f}  {sum(r == 1 for r in rs)}/{len(rs)}")
    mu = defaultdict(float)
    for m in ms:
        for k, v in m["mutator_shares"].items():
            mu[k] += v / len(ms)
    if mu:
        print("mutator usage shares (top 10): " + ", ".join(f"{k} {v:.2f}" for k, v in
                                                           sorted(mu.items(), key=lambda kv: -kv[1])[:10]))


def main(argv=None) -> None:
    global _JOBS
    ap = argparse.ArgumentParser(prog="gridlab.run", description=__doc__.split("\n")[0])
    ap.add_argument("--type", default="5,base10,rgby", help="GridType as size,symbols,colours")
    ap.add_argument("--gods", type=int, default=4)
    ap.add_argument("--games", type=int, default=20)
    ap.add_argument("--policy", default="greedy_private")
    ap.add_argument("--policy-kwargs", default="", help='JSON, e.g. \'{"K": 16, "saver": {"q": 0.9}}\'')
    ap.add_argument("--dealer", default="distinct", choices=["distinct", "uniform", "balanced_camps"])
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--rate", type=float, default=20.0, help="interaction rate Hz")
    ap.add_argument("--length", default="exponential", choices=["exponential", "fixed"])
    ap.add_argument("--seconds", type=float, default=300.0, help="fixed game length")
    ap.add_argument("--half-life", type=float, default=300.0)
    ap.add_argument("--energy", type=float, default=100.0)
    ap.add_argument("--eps", type=float, default=1.0, help="energy per second")
    ap.add_argument("--cost-scale", type=float, default=1.0)
    ap.add_argument("--metabolic", type=float, default=0.0)
    ap.add_argument("--agent-half-life", type=float, default=None)
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--trace", action="store_true")
    ap.add_argument("--toys", action="store_true")
    ap.add_argument("--json", default="", help="write per-game metrics to this file")
    a = ap.parse_args(argv)
    cfgs = build_configs(a)
    t0 = time.perf_counter()
    draws = [d for c in cfgs for d in draws_for(c)]
    pre = cal.precompute(draws, cfgs[0].gtype, processes=a.processes)
    print(f"calibration: {pre['built']} tables built, {pre['cached']} cached "
          f"({time.perf_counter() - t0:.1f}s; mean {np.mean(pre['seconds']) if pre['seconds'] else 0:.2f}s/table)")
    if cfgs[0].program_library:
        from .policy import program_library
        from .sim import default_program_factory
        t2 = time.perf_counter()
        program_library(cfgs[0].gtype, cfgs[0].program_factory or default_program_factory(),
                        cfgs[0].program_library)
        print(f"program library: {cfgs[0].program_library} programs ({time.perf_counter() - t2:.1f}s)")
    if a.trace:
        trace(cfgs[0])
        print()
    t1 = time.perf_counter()
    _JOBS = cfgs
    if a.processes > 1 and len(cfgs) > 1:
        with mp.get_context("fork").Pool(a.processes) as pool:
            ms = pool.map(_run, range(len(cfgs)))
    else:
        ms = [_run(i) for i in range(len(cfgs))]
    wall = time.perf_counter() - t1
    summarise(ms)
    ints = sum(m["n_attempts"] for m in ms)
    print(f"\n{len(ms)} games in {wall:.1f}s wall ({a.processes} processes): "
          f"{ints / wall:,.0f} interactions/s aggregate")
    if a.json:
        with open(a.json, "w") as fh:
            json.dump(ms, fh, default=lambda o: o.item() if hasattr(o, "item") else str(o))


if __name__ == "__main__":
    main()
