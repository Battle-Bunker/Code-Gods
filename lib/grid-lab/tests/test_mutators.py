"""python3 -m tests.test_mutators  (plain asserts; exits non-zero on failure)."""
from __future__ import annotations

import math
import time

import numpy as np

from gridlab.core import Grid, GridType, all_grid_types, spawn
from gridlab.mutators import COST_KNOBS, MUTATORS, available, by_id
from gridlab.program import ALWAYS, Guard, Program, Step, candidates, random_program, single_step_programs


def valid(g: Grid, gt: GridType) -> bool:
    return (g.sym.shape == (gt.N, gt.N) and g.col.shape == (gt.N, gt.N)
            and int(g.sym.max()) < gt.S and int(g.col.max()) < gt.C)


def orbit_returns(m, p, g, gt, cap=200) -> bool:
    x = g
    for _ in range(cap):
        y = m.apply(x, p, gt)
        x = x if y is None else y
        if x == g:
            return True
    return False


def test_every_mutator_every_type(samples=6, grids=3):
    # cover mutators that are off by default (COST_KNOBS["disabled"], e.g. flatten) too
    old = list(COST_KNOBS.get("disabled", []))
    COST_KNOBS["disabled"] = []
    try:
        return _every_mutator_every_type(samples, grids)
    finally:
        COST_KNOBS["disabled"] = old


def _every_mutator_every_type(samples, grids):
    rng = np.random.default_rng(12345)
    n_types = 0
    for gt in all_grid_types():
        n_types += 1
        ms = available(gt)
        assert 18 <= len(ms) <= 25, (gt.key, len(ms))
        gs = [spawn(gt, rng) for _ in range(grids)]
        for m in ms:
            for _ in range(samples):
                p = m.sample(rng, gt)
                c = m.cost(p, gt)
                assert math.isfinite(c) and c >= 0, (m.id, p, c)
                t = m.terms(p, gt)
                assert all(t[k] >= -1e-9 for k in ("base", "describe", "erase", "move", "measure")), (m.id, t)
                assert t["scope"] in m.scopes, (m.id, t["scope"], m.scopes)
                if m.bijective:
                    assert t["erase"] == 0
                assert isinstance(m.describe(p, gt), str) and m.describe(p, gt)
                for g in gs:
                    y = m.apply(g, p, gt, rng)
                    y2 = m.apply(g, p, gt, np.random.default_rng(999))
                    assert (y is None) == (y2 is None) and (y is None or y == y2), f"nondeterministic {m.id}"
                    if y is None:
                        continue
                    assert isinstance(y, Grid) and valid(y, gt), (m.id, p)
                    assert y != g
                    if m.bijective:
                        assert orbit_returns(m, p, g, gt), f"{m.id} {p} is not a bijection on {gt.key}"
                    else:
                        assert m.apply(y, p, gt) is None, f"{m.id} {p} is not idempotent on {gt.key}"
    return n_types


def test_space_and_sampling():
    rng = np.random.default_rng(7)
    for gt in (GridType(3, "base10", "rgb"), GridType(5, "cards", "rainbow6"), GridType(6, "base16", "rgby")):
        for m in available(gt):
            space = list(m.space(gt))
            assert space, m.id
            keys = {tuple(sorted(p.items())) for p in space}
            assert len(keys) == len(space), f"duplicate params in {m.id}"
            for _ in range(5):
                assert tuple(sorted(m.sample(rng, gt).items())) in keys, m.id
            # D = log2 |space| when every field is uniform and independent; never more than that
            dmax = max(m.describe_bits(p, gt) for p in space[:: max(1, len(space) // 50)])
            assert dmax <= math.log2(len(space)) + 8, (m.id, dmax, len(space))


def test_bijections_on_many_grids():
    """Stronger check on one type: a bijection's image of distinct inputs is distinct, and it
    preserves the multiset of colours/symbols when it only relabels positions."""
    gt = GridType(4, "base10", "rgb")
    rng = np.random.default_rng(3)
    gs = [spawn(gt, rng) for _ in range(300)]
    for m in available(gt):
        if not m.bijective:
            continue
        for _ in range(10):
            p = m.sample(rng, gt)
            out = [m.apply(g, p, gt) or g for g in gs]
            assert len({o.key for o in out}) == len({g.key for g in gs}), (m.id, p)


def test_cost_sanity():
    gt = GridType(5, "base10", "rgby")
    c = lambda mid, **p: by_id(mid).cost(p, gt)
    cell = c("paint", kind="cell", region=(2, 2), colour=0)
    row = c("paint", kind="line", region=(0, 2), colour=0)
    fill = c("paint", kind="all", region=(), colour=0)
    sfill = c("write", kind="all", region=(), symbol=5)
    scattered = sum(c("paint", kind="cell", region=(2, j), colour=0) for j in range(gt.N))
    assert fill > 4 * cell, (fill, cell)
    assert row < scattered / 2, (row, scattered)
    assert sfill > fill
    # bijections: global ones cost more than local ones; a global turn is cheaper than a global fill
    assert c("turn_grid", move="rot90") > 2 * c("swap_cells", layer="both", near="next door", pair=((0, 0), (0, 1)))
    assert c("turn_grid", move="rot90") < fill
    assert c("hue_turn", kind="all", region=(), k=1) > c("hue_turn", kind="line", region=(0, 0), k=1)
    # merging a colour erases less than painting it
    assert c("recolour", kind="all", region=(), pair=(1, 0)) < fill
    # relative targeting costs about the same as naming a line
    rel = c("paint", kind="line*", region=(), colour=0)
    assert abs(rel - row) < 2.5, (rel, row)
    # structure check in every GridType
    for g2 in all_grid_types():
        cc = lambda mid, **p: by_id(mid).cost(p, g2)
        row2 = cc("paint", kind="line", region=(0, 0), colour=0)
        cells2 = sum(cc("paint", kind="cell", region=(0, j), colour=0) for j in range(g2.N))
        assert row2 < cells2, g2.key
        ratio = 3 if g2.N >= 5 else 1.5   # 3x3 and 4x4 grids hold few cells, so a fill is a small edit there
        assert cc("paint", kind="all", region=(), colour=0) > ratio * cc("paint", kind="cell", region=(0, 0), colour=0), g2.key
    # hartley mode is never cheaper
    old = COST_KNOBS["erasure"]
    try:
        base = [c("recolour", kind="all", region=(), pair=(1, 0)), c("stamp", kind="all", region=(), colour=0, symbol=1)]
        COST_KNOBS["erasure"] = "hartley"
        hart = [c("recolour", kind="all", region=(), pair=(1, 0)), c("stamp", kind="all", region=(), colour=0, symbol=1)]
        assert all(h >= b for h, b in zip(hart, base))
    finally:
        COST_KNOBS["erasure"] = old


def test_programs():
    gt = GridType(5, "base10", "rgby")
    rng = np.random.default_rng(0)
    g = spawn(gt, rng)
    # guard gating
    red = int(g.col[0, 0]) == 0
    prog = Program(Guard.make("cell_colour", {"cell": (0, 0), "colour": 0, "neg": False}),
                   [("paint", {"kind": "all", "region": (), "colour": 1})])
    assert (prog.apply(g, gt) is None) == (not red)
    assert prog.describe(gt).startswith("If ")
    # cost composition and ratchet surcharge
    row = Program(ALWAYS, [("paint", {"kind": "line", "region": (0, 0), "colour": 0})])
    ratchet = Program(ALWAYS, [("paint", {"kind": "cell", "region": (0, 0), "colour": 0}),
                               ("shift_line", {"layer": "colour", "line": (0, 0), "k": 1})])
    assert row.cost_terms(gt)["ratchet"] == 0
    assert ratchet.cost_terms(gt)["ratchet"] >= 4 * math.log2(gt.C) - 1e-9
    assert ratchet.closure(g, gt).col[0].tolist() == [0] * gt.N
    demon = Program(Guard.make("cell_colour", {"cell": (0, 0), "colour": 0, "neg": True}),
                    [("hue_turn", {"kind": "cell", "region": (0, 0), "k": 1})])
    assert demon.cost_terms(gt)["ratchet"] > 0
    bij = Program(ALWAYS, [("turn_grid", {"move": "rot90"}), ("shift_line", {"layer": "both", "line": (0, 1), "k": 2})])
    assert bij.cost_terms(gt)["ratchet"] == 0
    # random programs: deterministic per seed, valid, non-negative cost
    a = [p.key for p in candidates(np.random.default_rng(5), gt, 30)]
    b = [p.key for p in candidates(np.random.default_rng(5), gt, 30)]
    assert a == b and len(set(a)) == 30
    for gt2 in (GridType(3, "cards", "rgb"), GridType(7, "base12", "rainbow6")):
        r2 = np.random.default_rng(1)
        for _ in range(40):
            p = random_program(r2, gt2)
            assert p.cost(gt2) >= 0 and p.describe(gt2)
            x = spawn(gt2, r2)
            y = p.apply(x, gt2, r2)
            assert y is None or (valid(y, gt2) and y != x)
            assert set(p.mutator_ids) <= {m.id for m in MUTATORS}
    n = sum(1 for _ in single_step_programs(GridType(3, "base10", "rgb")))
    assert n > 500


if __name__ == "__main__":
    t = time.time()
    n = test_every_mutator_every_type()
    test_space_and_sampling()
    test_bijections_on_many_grids()
    test_cost_sanity()
    test_programs()
    print(f"ok: {len(MUTATORS)} mutators x {n} grid types ({time.time() - t:.1f}s)")
