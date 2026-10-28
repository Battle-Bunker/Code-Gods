"""Policy-free landscape of every GridType: families, mutators, costs against the economy, ceilings
and how jumpy each family's surprisal is under a one-cell change.

    python3 -m gridlab.explore.gridtypes.landscape                 # all 60 GridTypes (~1 h on 4 cores, cold)
    python3 -m gridlab.explore.gridtypes.landscape --types 3,base10,rgb;5,cards,rainbow6
    python3 -m gridlab.explore.gridtypes.landscape --no-calibrate  # skip ceilings/sensitivity (fast)

Output: .cache/explore/gridtypes/landscape.json (one record per GridType), plus a printed summary.

Per GridType:
  n_families, families (ids), camps          what the dealer can deal
  n_mutators, mutators                       what agents can be built from
  cost_*                                     reference step costs (bits): paint cell / row / grid,
                                             write cell / grid; whole-grid fill vs one-cell paint ratio
  lib_cost_q                                 quantiles of the 4096-program library's costs
  lib_affordable_100                         share of library programs costing <= 100 bits (starting energy)
  prior_bits                                 N^2 (log2 S + log2 C): bits in one object
Per (GridType, family), averaged over 3 fixed draws (the draws gridlab.experiments.common.family_ceiling uses):
  ceil        surprisal of the family's exemplar (best known grid), else the deepest calibrated level
  levels      number of distinct ordinal levels in the table (granularity of the surprisal ladder)
  spawn_s     mean surprisal of a fresh spawn;  spawn_pos  P(s >= 1 bit) on a fresh spawn
  flip_any    P(s changes at all) when one random cell of a spawn is redrawn
  flip_vis    P(|Δs| >= 1 bit) for the same one-cell change
  flip_abs    E|Δs| (bits) for the same change
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np

from ...core import GridType, all_grid_types, spawn_batch
from ...family import Draw
from ... import calibrate as cal
from ... import mutators as M

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / ".cache" / "explore" / "gridtypes"


def parse_type(s: str) -> GridType:
    n, sym, col = s.split(",")
    return GridType(int(n), sym, col)


def short(gt: GridType) -> str:
    return f"{gt.N},{gt.symbols},{gt.colours}"


def family_draws(gt: GridType, family, n: int = 3) -> list[Draw]:
    """The same n draws as gridlab.experiments.common.family_ceiling (seeded by the family id)."""
    r = np.random.default_rng(int(hashlib.sha256(family.id.encode()).hexdigest()[:8], 16))
    return [Draw(family, family.sample(r, gt)) for _ in range(n)]


def _cost(mid: str, params: dict, gt: GridType) -> float:
    try:
        return float(M.by_id(mid).cost(params, gt))
    except Exception:
        return float("nan")


def static_record(gt: GridType, with_library: bool = True) -> dict:
    from ...rules import FAMILIES
    fams = [f for f in FAMILIES if f.available(gt)]
    muts = [m.id for m in M.available(gt)]
    rec = {"gtype": short(gt), "N": gt.N, "symbols": gt.symbols, "colours": gt.colours, "S": gt.S, "C": gt.C,
           "n_families": len(fams), "families": [f.id for f in fams],
           "camps": {c: sum(f.camp == c for f in fams) for c in ("clumper", "alternator", "neutral")},
           "n_mutators": len(muts), "mutators": muts,
           "prior_bits": gt.N ** 2 * (math.log2(gt.S) + math.log2(gt.C))}
    rec["cost_paint_cell"] = _cost("paint", {"kind": "cell", "region": (0, 0), "colour": 0}, gt)
    rec["cost_paint_row"] = _cost("paint", {"kind": "line", "region": (0, 0), "colour": 0}, gt)
    rec["cost_paint_grid"] = _cost("paint", {"kind": "all", "region": (), "colour": 0}, gt)
    rec["cost_write_cell"] = _cost("write", {"kind": "cell", "region": (0, 0), "symbol": 0}, gt)
    rec["cost_write_grid"] = _cost("write", {"kind": "all", "region": (), "symbol": 0}, gt)
    rec["fill_over_cell"] = rec["cost_paint_grid"] / rec["cost_paint_cell"]
    # per-mutator median cost over 48 sampled parameter settings
    r = np.random.default_rng(0)
    rec["mutator_cost_median"] = {}
    for m in M.available(gt):
        cs = [float(m.cost(m.sample(r, gt), gt)) for _ in range(48)]
        rec["mutator_cost_median"][m.id] = float(np.median(cs))
    if with_library:
        from ...policy import program_library
        from ...sim import default_program_factory
        progs, costs = program_library(gt, default_program_factory(), 4096)
        rec["lib_cost_q"] = {str(q): float(np.quantile(costs, q)) for q in (0.1, 0.25, 0.5, 0.75, 0.9)}
        rec["lib_affordable_100"] = float((costs <= 100).mean())
        rec["lib_cost_mean"] = float(costs.mean())
        # library programs by first mutator: median cost
        by = {}
        for p, c in zip(progs, costs):
            if len(p.steps) == 1 and p.guard.kind is None:
                by.setdefault(p.steps[0].mutator_id, []).append(float(c))
        rec["lib_single_median"] = {k: float(np.median(v)) for k, v in by.items()}
    return rec


def _ceiling(draw: Draw, gt: GridType, table) -> float:
    v = float(table.max_observed_bits)
    f = draw.family
    if f.exemplar is not None:
        try:
            ex = f.exemplar(draw.params, gt)
            v = max(v, float(table.surprisal(int(f.ordinal(ex, draw.params, gt)))))
        except Exception:
            pass
    return v


def sensitivity(draw: Draw, gt: GridType, table, B: int = 1024, seed: int = 0) -> dict:
    """Surprisal of fresh spawns and its response to redrawing one random cell (symbol and colour)."""
    r = np.random.default_rng(seed)
    sym, col = spawn_batch(gt, r, B)
    s0 = np.asarray(table.surprisal(draw.family.evaluate_batch(sym, col, draw.params, gt)), float)
    s2, c2 = sym.copy(), col.copy()
    rr, cc = r.integers(0, gt.N, B), r.integers(0, gt.N, B)
    s2[np.arange(B), rr, cc] = r.integers(0, gt.S, B)
    c2[np.arange(B), rr, cc] = r.integers(0, gt.C, B)
    s1 = np.asarray(table.surprisal(draw.family.evaluate_batch(s2, c2, draw.params, gt)), float)
    d = np.abs(s1 - s0)
    return {"spawn_s": float(s0.mean()), "spawn_pos": float((s0 >= 1).mean()),
            "flip_any": float((d > 1e-9).mean()), "flip_vis": float((d >= 1).mean()), "flip_abs": float(d.mean())}


def family_records(gt: GridType, processes: int = 4, n_draws: int = 3) -> dict:
    from ...rules import FAMILIES
    fams = [f for f in FAMILIES if f.available(gt)]
    draws = {f.id: family_draws(gt, f, n_draws) for f in fams}
    t0 = time.perf_counter()
    pre = cal.precompute([d for ds in draws.values() for d in ds], gt, processes=processes)
    out = {}
    for f in fams:
        rows = []
        for d in draws[f.id]:
            tb = cal.survival(d, gt)
            row = {"ceil": _ceiling(d, gt, tb), "levels": len(tb.levels)}
            row.update(sensitivity(d, gt, tb))
            rows.append(row)
        out[f.id] = {k: float(np.mean([x[k] for x in rows])) for k in rows[0]}
        out[f.id]["camp"] = f.camp
        out[f.id]["layers"] = sorted(f.layers)
    return {"families": out, "calib_built": pre["built"], "calib_seconds": time.perf_counter() - t0}


def load() -> dict:
    p = OUT / "landscape.json"
    if p.exists():
        with open(p) as fh:
            return json.load(fh)
    return {}


def save(d: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "landscape.json.tmp"
    with open(tmp, "w") as fh:
        json.dump(d, fh, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))
    tmp.replace(OUT / "landscape.json")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.gridtypes.landscape")
    ap.add_argument("--types", default="", help="';'-separated GridTypes (default: all 60)")
    ap.add_argument("--no-calibrate", action="store_true")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--redo", action="store_true")
    a = ap.parse_args(argv)
    gts = [parse_type(s) for s in a.types.split(";")] if a.types else all_grid_types()
    # small grids first: cheap, and the beginner candidates
    gts.sort(key=lambda g: (g.N, g.S, g.C))
    db = load()
    for gt in gts:
        k = short(gt)
        rec = db.get(k, {})
        t0 = time.perf_counter()
        if a.redo or "n_families" not in rec:
            rec.update(static_record(gt))
        if not a.no_calibrate and (a.redo or "families_detail" not in rec):
            fr = family_records(gt, a.processes)
            rec["families_detail"] = fr["families"]
            rec["calib_seconds"] = fr["calib_seconds"]
        db[k] = rec
        save(db)
        fd = rec.get("families_detail", {})
        ce = np.array([v["ceil"] for v in fd.values()]) if fd else np.zeros(0)
        print(f"{gt.key:26s} fams {rec['n_families']:2d} muts {rec['n_mutators']:2d} "
              f"lib50 {rec.get('lib_cost_q', {}).get('0.5', float('nan')):5.1f} "
              f"afford {rec.get('lib_affordable_100', float('nan')):.2f} "
              + (f"ceil med {np.median(ce):5.1f} p10 {np.quantile(ce, .1):5.1f} p90 {np.quantile(ce, .9):5.1f}"
                 if len(ce) else "") + f"  ({time.perf_counter() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
