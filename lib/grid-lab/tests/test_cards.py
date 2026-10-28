"""Kid card tests: python3 -m tests.test_cards  [family_id ...]

For every shortlisted family × every GridType where it is available, and 2 param draws each:
  - `card_source` renders a short, readable program (header comment with emoji + name, no imports,
    no numpy) that defines `utility(grid)` and runs in the gridlab.kid sandbox;
  - on 300 random and structured grids, the card's return values induce exactly the same order as
    the family's internal ordinal: same pairwise comparisons, ties included;
  - the card returns a consistent kind (int, or tuples of one length) and is deterministic.
"""
from __future__ import annotations

import os
import re
import sys
import time
import zlib
from multiprocessing import Pool

import numpy as np

from gridlab.core import Grid, all_grid_types, spawn_batch
from gridlab.family import dense_rank
from gridlab.kid import Grid as KidGrid, load_card
from gridlab.rules import by_id, shortlist

N_RANDOM = 200
N_GRIDS = 300
DRAWS = 2
MAX_LINES = 60
MAX_WIDTH = 110


def _seed(*parts) -> int:
    return zlib.crc32("|".join(map(str, parts)).encode())


def grids_for(f, p, gt, rng) -> list[Grid]:
    """200 uniform grids plus 100 structured ones: the exemplar and its perturbations, low-entropy grids
    (2 colours, 2-3 symbols) that make ties and rare events common, and monochrome grids."""
    N = gt.N
    S, C = spawn_batch(gt, rng, N_RANDOM)
    out = [Grid(a, b) for a, b in zip(S, C)]
    if f.exemplar is not None:
        e = f.exemplar(p, gt)
        out.append(e)
        for _ in range(30):
            s, c = e.sym.copy(), e.col.copy()
            for _ in range(int(rng.integers(1, N + 1))):
                r, k = rng.integers(N, size=2)
                if rng.random() < 0.5:
                    s[r, k] = rng.integers(gt.S)
                else:
                    c[r, k] = rng.integers(gt.C)
            out.append(Grid(s, c))
    for k in range(min(gt.C, 3)):
        out.append(Grid(np.full((N, N), rng.integers(gt.S), np.uint8), np.full((N, N), k, np.uint8)))
    while len(out) < N_GRIDS:
        cs = rng.choice(gt.C, 2, replace=False)
        ss = rng.choice(gt.S, int(rng.integers(2, 4)), replace=False)
        out.append(Grid(rng.choice(ss, (N, N)), rng.choice(cs, (N, N))))
    return out[:N_GRIDS]


def check_source(src: str, f, where: str) -> None:
    lines = src.splitlines()
    assert re.match(r"^# \S+ .+", lines[0]), f"{where}: header must be '# <emoji> <name>'"
    head = [ln for ln in lines if ln.startswith("#")]
    assert len(head) <= 5, f"{where}: header longer than 4 lines of explanation"
    assert "def utility(grid):" in src, f"{where}: no utility(grid)"
    for bad in ("import", "numpy", "np.", "lambda", "global ", "random", "time"):
        assert bad not in src.replace("# ", ""), f"{where}: card uses {bad!r}"
    assert len(lines) <= MAX_LINES, f"{where}: card has {len(lines)} lines"
    assert max(len(ln) for ln in lines) <= MAX_WIDTH, f"{where}: line wider than {MAX_WIDTH}"


def _as_value(v, where):
    if isinstance(v, tuple):
        assert all(isinstance(x, int) and not isinstance(x, bool) for x in v), f"{where}: tuple of non-ints {v!r}"
        return v
    assert isinstance(v, int) and not isinstance(v, bool), f"{where}: utility returned {type(v).__name__} {v!r}"
    return v


def check_family(fid: str) -> tuple[str, int, float, list[str]]:
    f = by_id(fid)
    t0 = time.perf_counter()
    errors: list[str] = []
    n = 0
    for gt in all_grid_types():
        if not f.available(gt):
            continue
        rng = np.random.default_rng(_seed(f.id, gt.key))
        for _ in range(DRAWS):
            p = f.sample(rng, gt)
            where = f"{f.id} {gt.key} {p}"
            try:
                src = f.card_source(p, gt)
                check_source(src, f, where)
                utility = load_card(src, gt)
                grids = grids_for(f, p, gt, rng)
                kid = [KidGrid.from_lab(g, gt) for g in grids]
                got = [_as_value(utility(k), where) for k in kid]
                kinds = {len(v) if isinstance(v, tuple) else 0 for v in got}
                assert len(kinds) == 1, f"{where}: card mixes return kinds {kinds}"
                assert utility(kid[0]) == got[0], f"{where}: card is not deterministic"
                want = f.evaluate_batch(np.stack([g.sym for g in grids]), np.stack([g.col for g in grids]), p, gt)
                levels = sorted(set(got))
                card_rank = np.array([levels.index(v) for v in got])
                (rule_rank,) = dense_rank(want)
                bad = np.nonzero(card_rank != rule_rank)[0]
                if len(bad):
                    # report one disagreeing pair
                    i = int(bad[0])
                    j = int(np.nonzero((np.sign(card_rank - card_rank[i]) != np.sign(rule_rank - rule_rank[i])))[0][0])
                    raise AssertionError(
                        f"{where}: order differs.\n card {got[i]!r} vs {got[j]!r}; rule {want[i].tolist()} vs "
                        f"{want[j].tolist()}\n{gt.render(grids[i])}\n--\n{gt.render(grids[j])}\n{src}")
                n += 1
            except AssertionError as ex:
                errors.append(str(ex))
            except Exception as ex:  # noqa: BLE001
                errors.append(f"{where}: {type(ex).__name__}: {ex}")
    return fid, n, time.perf_counter() - t0, errors


def main(argv):
    t0 = time.perf_counter()
    ids = argv or [f.id for f in shortlist()]
    assert len(shortlist()) == 31 and all(f.card_source is not None for f in shortlist())
    failed = 0
    with Pool(min(len(ids), os.cpu_count() or 2)) as pool:
        for fid, n, dt, errs in pool.imap_unordered(check_family, ids):
            status = "ok" if not errs else "FAIL"
            print(f"{status:4s} {fid:24s} {n:3d} draws  {dt:6.1f}s")
            for e in errs[:3]:
                print("     " + e.replace("\n", "\n     "))
            failed += bool(errs)
    print(f"{len(ids) - failed}/{len(ids)} cards match their rules in {time.perf_counter() - t0:.1f}s")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
