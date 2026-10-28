"""Prelude parity: the generated Python prelude, the generated JS prelude and lib/grid-lab's kid.py
must answer every kid-API read helper identically on the same grids, and both preludes must encode
mutator calls to the same bytes.

    python3 test/parity.py        (from lib/game-types; regenerates the fixture with node first)
"""
import builtins
import json
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "..", "grid-lab"))

from gridlab import core, kid  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "prelude-parity.json")
os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "parity-fixture.ts"), FIXTURE],
               check=True, cwd=ROOT)
with open(FIXTURE) as f:
    data = json.load(f)


def digest(g, next_colour, mix):
    """Mirror of JS_DIGEST in parity-fixture.ts over the snake_case Python API."""
    def pos(c):
        return None if c is None else [c.row, c.col]

    def many(cs):
        return [pos(c) for c in cs]

    def opt(c, name):
        try:
            return getattr(c, name)
        except AttributeError:
            return None

    dirs = ["left", "right", "up", "down", "up_left", "up_right", "down_left", "down_right"]
    return {
        "size": g.size, "palette": list(g.palette),
        "cells": [[c.row, c.col, c.symbol, c.value, c.colour, c.on_edge, opt(c, "suit"), opt(c, "is_picture")] for c in g.cells],
        "links": [[pos(getattr(c, d)) for d in dirs] + [many(c.neighbours), many(c.surrounding)] for c in g.cells],
        "rows": [many(r) for r in g.rows], "columns": [many(r) for r in g.columns],
        "diagonals": [many(r) for r in g.diagonals], "edge": many(g.edge_cells),
        "lookup": [g.cell(c.row, c.col) is c for c in g.cells],
        "quarter": [pos(g.quarter_turn(c)) for c in g.cells],
        "reachEdge": many(g.reachable(g.edge_cells, through=lambda c: c.colour != g.palette[0])),
        "reachOne": many(g.reachable(g.cell(0, 0), lambda c: c.value % 2 == 0)),
        "regionsColour": [many(r) for r in g.regions(lambda a, b: a.colour == b.colour)],
        "regionsValue": [many(r) for r in g.regions(lambda a, b: a.value == b.value)],
        "next": [next_colour(p) for p in g.palette],
        "mix": [[a, b, mix(a, b)] for a in g.palette for b in g.palette] if mix else None,
    }


PY_BUILTINS = set(dir(builtins))
checked = 0
for case in data["cases"]:
    a = case["args"]
    gtype = core.GridType(a["size"], a["symbols"], a["colours"])
    assert sorted(case["classes"]) == sorted(gtype.caps - {"Finite"}), (case["key"], case["classes"], gtype.caps)

    ns = {"__name__": "prelude"}
    exec(compile(case["python"], "<prelude %s>" % case["key"], "exec"), ns)
    public = [n for n in ns if not n.startswith("_")]
    assert not set(public) & PY_BUILTINS, ("prelude shadows builtins", set(public) & PY_BUILTINS)
    for name in re.findall(r"^(\w+)\s*=|^def (\w+)|^class (\w+)", case["python"], re.M):
        name = next(x for x in name if x)
        assert not name.startswith("_") or re.match(r"^__?[A-Z0-9_]+$|^__[a-z_]+$", name), ("private name style", name)
    mixable = "Mixable" in case["classes"]
    assert ("mix" in ns) == mixable and "next_colour" in ns, case["key"]

    lab = kid.card_globals(gtype)
    for gcase in case["grids"]:
        n = a["size"]
        lab_grid = core.Grid(np.array(gcase["sym"]).reshape(n, n), np.array(gcase["col"]).reshape(n, n))
        assert gtype.render(lab_grid)  # the lab can display it
        mine = digest(ns["__decode"](gcase["wire"]), ns["next_colour"], ns.get("mix"))
        ref = digest(kid.Grid.from_lab(lab_grid, gtype), lab["next_colour"], lab.get("mix"))
        for k in ref:
            assert mine[k] == ref[k], ("python prelude vs kid.py", case["key"], gcase["wire"], k, mine[k], ref[k])
            assert gcase["js"][k] == ref[k], ("js prelude vs kid.py", case["key"], gcase["wire"], k, gcase["js"][k], ref[k])
        checked += 1

    for sample, js_text in zip(data["callSamples"], case["calls"]):
        py_text = ns["__encode_calls"](sample)
        assert py_text == js_text, ("__encode_calls differs", sample, py_text, js_text)
        assert py_text.isascii() and json.loads(py_text) is not None

# Frozen component tables agree with lib/grid-lab/gridlab/core.py.
for sid, s in data["components"]["symbols"].items():
    g = core.GridType(5, sid, "rgb")
    assert s["count"] == g.S and s["values"] == g.value.tolist() and s["ranks"] == g.rank.tolist(), sid
    assert s["glyphs"] == [g.glyph(i) for i in range(g.S)], sid
    if g.suit is not None:
        assert s["suits"] == g.suit.tolist() and s["faces"] == g.face.tolist(), sid
for cid, c in data["components"]["colours"].items():
    g = core.GridType(5, "base10", cid)
    assert tuple(c["names"]) == core.COLOUR_NAMES[cid] and tuple(c["letters"]) == core.COLOUR_LETTERS[cid], cid
    mixes = {tuple(sorted((c["names"][x], c["names"][y]))): c["names"][z] for x, y, z in c["mixes"]}
    assert mixes == {tuple(sorted(k)): v for k, v in core.MIXES[cid].items()}, cid
    assert g.mix_table.tolist() == [[next((z for x, y, z in c["mixes"] if {x, y} == {i, j} and i != j), -1)
                                     for j in range(g.C)] for i in range(g.C)], cid

print("parity ok: %d instantiations, %d grids, %d call samples" % (len(data["cases"]), checked, len(data["callSamples"])))
