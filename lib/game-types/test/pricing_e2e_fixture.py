"""Run Grid Lab's open-agents measure.py on the published reference grids (ratchet off, no self states,
flatten disabled to match our port) and dump every run's moves, its measure.py (erasure, motion) and the
expected prices: the fixture of test/pricing-measure.test.ts.

    git archive origin/claude/gridlab-open-agents lib/grid-lab | tar -x -C /tmp/oa
    cd /tmp/oa/lib/grid-lab && PYTHONHASHSEED=0 python3 <this file> $PWD \
        <game-types>/test/pricing-data/reference_grids_5_base10_rgby.json \
        <game-types>/test/pricing-data/e2e_measure_5_base10_rgby.json

Each run is [wire calls, used_random (0/1), [erasure, motion]].
"""
import json, math, sys
sys.path.insert(0, sys.argv[1])
from gridlab.mutators import COST_KNOBS
COST_KNOBS["disabled"] = ["flatten"]
import numpy as np
from gridlab.core import Grid, GridType
from gridlab.openagents import measure as M
from gridlab.openagents.examples import example
from gridlab.openagents.sandbox import derive_seed

gt = GridType(5, "base10", "rgby")
fx = json.load(open(sys.argv[2]))
def grid(h):
    s, c = h.split(":")
    N = gt.N
    return Grid(np.frombuffer(bytes.fromhex(s), np.uint8).reshape(N, N).copy(), np.frombuffer(bytes.fromhex(c), np.uint8).reshape(N, N).copy())
refs = [grid(h) for comp in ("uniform", "structured", "game") for h in fx[comp]]
comps = [comp for comp in ("uniform", "structured", "game") for _ in fx[comp]]
M.reference = lambda gt, P: (list(refs), list(comps))
M.ratchet_probe = lambda agent, gt, owner, P: (0.0, [], {"mean_len": 1.0, "max_len": 1})

def wire(m):
    def thaw(v):
        return [thaw(x) for x in v] if isinstance(v, tuple) else v
    return [m.mid, {k: thaw(v) for k, v in m.params.items() if not (k == "region" and v == ())}]

def fin(x):
    return None if x == math.inf else x

agents = ["paint_one_row", "fill_grid", "paint_best_line", "reddest_row", "guarded_row", "recolour_tool",
          "recolour_by_hand", "copy_top_colour", "biggest_to_corner", "random_row", "hashed_row"]
extra = {"random_two_cells": """\
import random

def agent(grid):
    a, b = random.sample(range(25), 2)
    return [paint_cell(a // 5, a % 5, "red"), paint_cell(b // 5, b % 5, "blue")] if grid.cell(0, 0).colour == "red" else []
""", "majority_star": """\
def agent(grid):
    return [move("majority_line", kind="line*", region=())]
"""}
out = {"salt": "gridlab-open-agents-v1", "gtype": gt.key, "agents": {}}
for name in agents + list(extra):
    src = extra.get(name) or example(name, gt)
    r = M.price(src, gt, pricing={"ratchet": "off"}, cache=False, keep_samples=True)
    runs = r["samples"]["runs"]
    rec = {"source": src, "randomized": r["randomized"],
           "runs": [[[[wire(m) for m in run.moves], int(bool(run.used_random)), list(M.run_destruction(run.moves, gt))] for run in row] for row in runs],
           "seeds": [[i, j, str(derive_seed("measure", gt.key, i, j))] for i, j in ((0, 0), (1, 0), (5, 3))],
           "decision": r["decision"], "binding": r["binding"], "estimates": {k: fin(v) for k, v in r["estimates"].items()},
           "erase": r["erase"], "motion": r["motion"],
           "by_component": {c: {"decision": v["decision"], "binding": v["binding"]} for c, v in r["by_component"].items()}}
    for k in ("H_A", "H_A_given_X", "I_plugin", "I_shuffle", "I_mm", "I_jackknife"):
        if k in r:
            rec[k] = r[k]
    out["agents"][name] = rec
    print(name, r["randomized"], round(r["decision"], 4), r["binding"], {k: round(v, 3) for k, v in r["estimates"].items()}, round(r["erase"], 3), round(r["motion"], 3), file=sys.stderr)
json.dump(out, open(sys.argv[3], "w"), separators=(",", ":"))
