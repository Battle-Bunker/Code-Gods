"""Grid mutator parity: lib/game-types (TS) against lib/grid-lab/gridlab/mutators.py.

Run from the repo root:  python3 lib/game-types/test/mutator_parity.py
The TS side (test/mutator_parity.dump.ts) samples params and grids in all 60 GridTypes and records
its apply results and cost terms; this script replays every case through gridlab and requires:
  * the same available mutator set in every GridType;
  * identical apply results (TS "unchanged" == gridlab None);
  * identical deterministic cost terms within 1e-9 bits: base (log2 #available), D, M, scope;
  * the same analytic terms (erase, expected changed cells), except sort_line's fixed-seed Monte
    Carlo, compared within 3%;
  * TS pointwise erasure ≥ 0 (0 for bijections), and the mean pointwise sort erasure over spawns
    ≈ gridlab's analytic value.
Plain asserts; exits non-zero on failure.
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "lib", "grid-lab"))

from gridlab.core import Grid, GridType  # noqa: E402
from gridlab.mutators import _sort_stats, available, by_id  # noqa: E402

FREE_REGION = ("line*", "core", "all")


def tup(x):
    return tuple(tup(v) for v in x) if isinstance(x, list) else x


def to_gridlab(m, p):
    q = {k: tup(v) for k, v in p.items()}
    if q.get("kind") in FREE_REGION and any(f.name == "region" for f in m.fields):
        q["region"] = ()
    return q


def main():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "cases.json")
        subprocess.run(["node", "--experimental-strip-types", "--no-warnings",
                        os.path.join(ROOT, "lib", "game-types", "test", "mutator_parity.dump.ts"), out], check=True)
        with open(out) as fh:
            types = json.load(fh)
    n = 0
    for t in types:
        a = t["args"]
        gt = GridType(a["size"], a["symbols"], a["colours"])
        N = gt.N
        assert [m.id for m in available(gt)] == t["available"], (gt.key, t["available"])
        sh = _sort_stats(gt)[0]
        assert abs(t["sortMean"] - sh) < 0.03 * sh + 0.05, (gt.key, t["sortMean"], sh)
        for c in t["cases"]:
            m = by_id(c["id"])
            p = to_gridlab(m, c["p"])
            g = Grid(np.array(c["sym"]).reshape(N, N), np.array(c["col"]).reshape(N, N))
            y = m.apply(g, p, gt)
            ctx = (gt.key, c["id"], c["p"])
            if c["out"] in (None, "same"):
                assert y is None, ctx
            else:
                assert y is not None, ctx
                assert y.sym.reshape(-1).tolist() == c["out"]["sym"] and y.col.reshape(-1).tolist() == c["out"]["col"], ctx
            terms = m.terms(p, gt)
            tf = m.terms_fn(p, gt)
            assert abs(terms["base"] - c["base"]) < 1e-9, (ctx, terms["base"], c["base"])
            assert abs(terms["describe"] - c["describe"]) < 1e-9, (ctx, terms["describe"], c["describe"])
            assert abs(terms["measure"] - c["measure"]) < 1e-9, (ctx, terms["measure"], c["measure"])
            assert terms["scope"] == c["scope"], (ctx, terms["scope"], c["scope"])
            if c["id"] == "sort_line":
                assert abs(tf.erase - c["erase"]) <= 0.03 * tf.erase, (ctx, tf.erase, c["erase"])
                assert abs(tf.dcol - c["dcol"]) <= 0.03 * tf.dcol + 1e-9, (ctx, tf.dcol, c["dcol"])
            else:
                for k in ("erase", "dcol", "dsym"):
                    assert abs(getattr(tf, k) - c[k]) < 1e-9, (ctx, k, getattr(tf, k), c[k])
            assert c["pointwise"] >= 0 and (not m.bijective or c["pointwise"] == 0), ctx
            n += 1
    print(f"ok: {n} grid mutator cases match gridlab across {len(types)} grid types")


if __name__ == "__main__":
    main()
