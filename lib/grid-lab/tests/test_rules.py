"""Rule-family tests: python3 -m tests.test_rules  [family_id ...]

For every family × every GridType where it is available:
  - sampled params are JSON-like and draw only from the GridType's own colours/symbols (indices in range);
  - `ordinal` returns a Python int, or a tuple of Python ints whose length is constant within the
    family (across grids, params and GridTypes), and is deterministic;
  - `batch` agrees with `ordinal` on 200 random grids plus structured grids (exemplar, one-cell
    perturbations of it, monochrome / constant-symbol grids);
  - `canonical` is idempotent and preserves the ordinal's distribution (KS test, loose);
  - the exemplar is a legal grid whose ordinal is >= the max over 2000 random grids;
  - `exact_log2_tail`, where given, is monotone and matches the empirical tail.
Runs families in parallel worker processes.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
import zlib
from multiprocessing import Pool

import numpy as np

from gridlab.core import Grid, all_grid_types, spawn_batch
from gridlab.family import dense_rank, ordinal_keys
from gridlab.rules import FAMILIES, by_id, shortlist

N_AGREE = 200
N_DIST = 2000
KS_C = 2.7  # alpha ~ 1e-6 per comparison: thousands of comparisons, so keep false alarms rare


def _seed(*parts) -> int:
    return zlib.crc32("|".join(map(str, parts)).encode())


def _ks(a: np.ndarray, b: np.ndarray) -> float:
    a, b = dense_rank(a, b)  # tuple ordinals -> ints with the same order
    xs = np.union1d(a, b)
    fa = np.searchsorted(np.sort(a), xs, side="right") / len(a)
    fb = np.searchsorted(np.sort(b), xs, side="right") / len(b)
    return float(np.max(np.abs(fa - fb)))


def _pyords(u: np.ndarray) -> list:
    """Batch ordinals as Python ints or tuples (native comparison)."""
    return [tuple(x) if isinstance(x, list) else x for x in u.tolist()]


def _structured(f, p, gt, rng):
    N = gt.N
    out = []
    if f.exemplar is not None:
        e = f.exemplar(p, gt)
        out.append(e)
        for _ in range(20):
            s, c = e.sym.copy(), e.col.copy()
            r, k = rng.integers(N, size=2)
            if rng.random() < 0.5:
                s[r, k] = rng.integers(gt.S)
            else:
                c[r, k] = rng.integers(gt.C)
            out.append(Grid(s, c))
    for k in range(min(gt.C, 3)):
        out.append(Grid(np.zeros((N, N), np.uint8), np.full((N, N), k, np.uint8)))
        out.append(Grid(np.full((N, N), rng.integers(gt.S), np.uint8), np.full((N, N), k, np.uint8)))
    return out


def _check_params(f, p, gt):
    json.dumps(p)  # JSON-like (no numpy scalars)

    def walk(x):
        if isinstance(x, (list, tuple)):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            for y in x.values():
                walk(y)
        else:
            assert x is None or isinstance(x, (bool, int, str)), (f.id, p, type(x))
    walk(p)


def check_family(fid: str) -> tuple[str, int, float, list[str]]:
    f = by_id(fid)
    t0 = time.perf_counter()
    errors: list[str] = []
    n = 0
    width = None  # tuple length (0 = int ordinal); must be the same in every GridType
    for gt in all_grid_types():
        if not f.available(gt):
            continue
        n += 1
        rng = np.random.default_rng(_seed(f.id, gt.key))
        p = f.sample(rng, gt)
        where = f"{f.id} {gt.key} {p}"
        try:
            _check_params(f, p, gt)
            assert isinstance(f.summary(p, gt), str) and f.summary(p, gt)
            # scalar ordinal: int + deterministic; batch agreement
            s, c = spawn_batch(gt, rng, N_AGREE)
            grids = [Grid(a, b) for a, b in zip(s, c)] + _structured(f, p, gt, rng)
            sc = []
            for g in grids:
                u = f.ordinal(g, p, gt)
                parts = u if isinstance(u, tuple) else (u,)
                assert all(isinstance(x, int) and not isinstance(x, bool) for x in parts), \
                    f"{where}: ordinal type {type(u)} {u!r}"
                w = len(u) if isinstance(u, tuple) else 0
                assert w != 1, f"{where}: use an int, not a 1-tuple"
                if width is None:
                    width = w
                assert w == width, f"{where}: ordinal width {w} != {width} (tuple length must be constant)"
                sc.append(u)
            assert f.ordinal(grids[0], p, gt) == sc[0], f"{where}: nondeterministic"
            S = np.stack([g.sym for g in grids])
            C = np.stack([g.col for g in grids])
            b = f.evaluate_batch(S, C, p, gt)
            assert b.dtype == np.int64 and b.shape == ((len(grids), width) if width else (len(grids),)), \
                f"{where}: batch shape {b.shape}"
            ref = np.array(sc, dtype=np.int64)
            bad = np.nonzero((b != ref).reshape(len(grids), -1).any(1))[0]
            assert len(bad) == 0, f"{where}: batch {b[bad[0]]} != scalar {sc[bad[0]]} on\n{gt.render(grids[bad[0]])}"
            # distribution sample
            s2, c2 = spawn_batch(gt, rng, N_DIST)
            u2 = f.evaluate_batch(s2, c2, p, gt)
            # canonical
            if f.canonical is not None:
                q = f.canonical(p, gt)
                _check_params(f, q, gt)
                assert f.canonical(q, gt) == q, f"{where}: canonical not idempotent ({q})"
                if q != p:
                    s3, c3 = spawn_batch(gt, rng, N_DIST)
                    uq = f.evaluate_batch(s3, c3, q, gt)
                    D = _ks(u2, uq)
                    crit = KS_C * math.sqrt(2 / N_DIST)
                    assert D <= crit, f"{where}: canonical {q} changes the distribution (KS {D:.3f} > {crit:.3f})"
            # exemplar
            if f.exemplar is not None:
                e = f.exemplar(p, gt)
                assert e.sym.shape == (gt.N, gt.N) and e.col.shape == (gt.N, gt.N)
                assert int(e.sym.max()) < gt.S and int(e.col.max()) < gt.C, f"{where}: exemplar out of range"
                ue = f.ordinal(e, p, gt)
                umax = max(_pyords(u2))
                assert ue >= umax, f"{where}: exemplar {ue} < random max {umax}"
            # exact tail
            if f.exact_log2_tail is not None:
                k2 = ordinal_keys(u2)
                prev = 0.0
                for t in sorted(set(_pyords(u2))):
                    lt = f.exact_log2_tail(t, p, gt)
                    assert lt <= prev + 1e-9, f"{where}: exact tail not monotone at {t}"
                    prev = lt
                    emp = float(np.mean(k2 >= ordinal_keys(np.array([t]))[0]))
                    pe = 2.0 ** lt
                    if pe >= 0.01:
                        se = math.sqrt(pe * (1 - pe) / N_DIST)
                        assert abs(emp - pe) <= 5 * se + 1e-3, f"{where}: tail at {t}: exact {pe:.4f} vs emp {emp:.4f}"
                low = tuple([-10 ** 9] * width) if width else -10 ** 9
                assert f.exact_log2_tail(low, p, gt) == 0.0, f"{where}: tail below the minimum must be 0 bits"
        except AssertionError as ex:
            errors.append(str(ex))
        except Exception as ex:  # noqa: BLE001
            errors.append(f"{where}: {type(ex).__name__}: {ex}")
    return fid, n, time.perf_counter() - t0, errors


def test_registry():
    ids = [f.id for f in FAMILIES]
    assert len(ids) == len(set(ids))
    assert len(shortlist()) == 31, len(shortlist())
    assert sum("seed" in f.tags for f in FAMILIES) == 3
    for f in FAMILIES:
        assert f.layers <= {"colour", "symbol", "position"} and f.layers, f.id
        assert f.camp in ("clumper", "alternator", "neutral"), f.id
        assert f.source, f.id
        assert any(f.available(gt) for gt in all_grid_types()), f.id
    for f in shortlist():
        assert f.batch is not None, f.id


def main(argv):
    t0 = time.perf_counter()
    test_registry()
    print("ok test_registry")
    ids = argv or [f.id for f in FAMILIES]
    failed = 0
    with Pool(min(len(ids), os.cpu_count() or 2)) as pool:
        for fid, n, dt, errs in pool.imap_unordered(check_family, ids):
            status = "ok" if not errs else "FAIL"
            print(f"{status:4s} {fid:26s} {n:3d} grid types  {dt:6.1f}s")
            for e in errs[:5]:
                print("     " + e.replace("\n", "\n     "))
            failed += bool(errs)
    print(f"{len(ids) - failed}/{len(ids)} families passed in {time.perf_counter() - t0:.1f}s")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
