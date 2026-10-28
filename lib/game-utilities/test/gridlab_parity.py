"""Product grid families vs lib/grid-lab: same order, same availability, same canonical forms, same support.

    python3 lib/game-utilities/test/gridlab_parity.py [family_id ...]

For every ported grid family (rewards and penalties):
  - availability (`requires` as Constraint data) equals grid-lab's `Family.available` on all 60 GridTypes;
  - on a covering set of GridTypes: `canonical(p)` equals grid-lab's canonical for every p in the support, and the
    support contains 200 draws of grid-lab's sampler;
  - for 2 param draws per GridType (the same params on both sides), on 300 grids (uniform, grid-lab's exemplar and
    perturbations of it, monochrome and low-entropy grids: tests/test_cards.py `grids_for`), the host evaluator's
    ordinal induces exactly the order of grid-lab's `Family.ordinal` (pairwise comparisons, ties included).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
LAB = os.path.join(os.path.dirname(PKG), "grid-lab")
sys.path.insert(0, LAB)

import numpy as np  # noqa: E402

from gridlab.core import GridType, all_grid_types  # noqa: E402
from gridlab.family import dense_rank  # noqa: E402
from gridlab.rules import by_id, shortlist  # noqa: E402
from tests.test_cards import grids_for  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
DIGITS = "0123456789ABCDEF"
RANKS = "A23456789TJQK"
LETTER = {"red": "R", "orange": "O", "yellow": "Y", "green": "G", "blue": "B", "violet": "V"}


def node(*args):
    subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "fixtures.ts"), *args],
                   cwd=PKG, check=True)


def gtype_of(key: str) -> GridType:
    n, s, c = key[5:-1].split(",")
    return GridType(int(n), s, c)


def wire(g, gt: GridType) -> str:
    sym, col = g.sym.tolist(), g.col.tolist()
    code = (lambda s: RANKS[s % 13] + "SHDC"[s // 13]) if gt.symbols == "cards" else (lambda s: DIGITS[s])
    names = gt.colour_names
    return "/".join(",".join(code(sym[r][c]) + LETTER[names[col[r][c]]] for c in range(gt.N)) for r in range(gt.N))


def norm(x):
    """JSON-normal form of params (numpy scalars and tuples become plain ints and lists; keys sorted)."""
    return json.dumps(x, sort_keys=True, default=lambda v: v.item() if hasattr(v, "item") else list(v))


def main(ids: list[str]) -> int:
    t0 = time.perf_counter()
    node("gridlab", os.path.join(FIX, "gridlab.json"))
    fams = [f for f in json.load(open(os.path.join(FIX, "gridlab.json"))) if not ids or f["family"] in ids]
    errors: list[str] = []
    requests, checks = [], []
    lab_ids = {f.id for f in shortlist()}
    ported = {f["family"] for f in fams}
    if not ids:
        missing = sorted(lab_ids - ported)
        if missing:
            errors.append(f"shortlisted families not ported: {missing}")
    for fx in fams:
        fid = fx["family"]
        try:
            f = by_id(fid)
        except KeyError:
            errors.append(f"{fid}: no grid-lab family with this id")
            continue
        for gt in all_grid_types():
            if f.available(gt) != fx["availability"][gt.key]:
                errors.append(f"{fid} {gt.key}: available {fx['availability'][gt.key]} but grid-lab says {f.available(gt)}")
        for t in fx["types"]:
            gt = gtype_of(t["key"])
            sup = {norm(p) for p in t["support"]}
            for p, c in zip(t["support"], t["canonical"]):
                want = f.canonical(dict(p), gt) if f.canonical is not None else p
                if norm(want) != norm(c):
                    errors.append(f"{fid} {gt.key}: canonical({norm(p)}) = {norm(c)}, grid-lab {norm(want)}")
                    break
            rng = np.random.default_rng(zlib.crc32(f"{fid}|{gt.key}".encode()))
            for _ in range(200):
                p = f.sample(rng, gt)
                if norm(p) not in sup:
                    errors.append(f"{fid} {gt.key}: grid-lab draw {norm(p)} is not in the support")
                    break
            for p in t["draws"]:
                rng = np.random.default_rng(zlib.crc32(f"{fid}|{gt.key}|{norm(p)}".encode()))
                lp = json.loads(norm(p))
                grids = grids_for(f, lp, gt, rng)
                want = f.evaluate_batch(np.stack([g.sym for g in grids]), np.stack([g.col for g in grids]), lp, gt)
                requests.append({"key": gt.key, "args": t["args"], "family": fid, "params": p,
                                 "wires": [wire(g, gt) for g in grids]})
                checks.append((fid, gt, p, grids, want))
    inp, out = os.path.join(FIX, "gridlab-eval-in.json"), os.path.join(FIX, "gridlab-eval-out.json")
    json.dump(requests, open(inp, "w"))
    node("eval", inp, out)
    got_all = json.load(open(out))
    per_family: dict[str, int] = {}
    for (fid, gt, p, grids, want), got in zip(checks, got_all):
        levels = sorted({tuple(v) if isinstance(v, list) else v for v in got})
        index = {v: i for i, v in enumerate(levels)}
        mine = np.array([index[tuple(v) if isinstance(v, list) else v] for v in got])
        (ref,) = dense_rank(want)
        bad = np.nonzero(mine != ref)[0]
        if len(bad):
            diff = np.sign(mine[:, None] - mine[None, :]) != np.sign(ref[:, None] - ref[None, :])
            i, j = (int(x) for x in np.argwhere(diff)[0])
            errors.append(f"{fid} {gt.key} {norm(p)}: order differs: product {got[i]} vs {got[j]}, grid-lab "
                          f"{want[i].tolist()} vs {want[j].tolist()}\n{gt.render(grids[i])}\n--\n{gt.render(grids[j])}")
        else:
            per_family[fid] = per_family.get(fid, 0) + 1
    for e in errors[:15]:
        print("FAIL", e.replace("\n", "\n     "))
    n_short = len([f for f in fams if "shortlist" in f["tags"]])
    n_pen = len([f for f in fams if f["role"] == "penalty"])
    print(f"{len(per_family)}/{len(fams)} grid families ({n_short} shortlisted, {n_pen} penalties, "
          f"{len(fams) - n_short - n_pen} others) match grid-lab on {sum(per_family.values())} draws; "
          f"{len(errors)} problems; {time.perf_counter() - t0:.1f}s")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
