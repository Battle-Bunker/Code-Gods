"""Calibration tests: python3 -m tests.test_calibrate"""
from __future__ import annotations

import math
import shutil
import tempfile
import time
from pathlib import Path

import numpy as np

from gridlab import calibrate as cal
from gridlab.core import Grid, GridType, spawn_batch
from gridlab.family import Draw
from tests.toys import COLOUR_COUNT, COLOUR_COUNT_EST, SYMBOL_SUM, ROW_ALTERNATE, binom_log2_tail

GT7 = GridType(7, "base10", "rgb")
GT5 = GridType(5, "base10", "rgby")


def test_binomial_splitting_deep():
    d = Draw(COLOUR_COUNT_EST, {"colour": 1})
    T = cal.build_table(d, GT7)
    n, p = 49, 1 / 3
    exact = {t: -binom_log2_tail(t, n, p) for t in range(0, n + 1)}
    t40 = min(exact, key=lambda t: abs(exact[t] - 40))
    err = abs(T.surprisal(t40) - exact[t40])
    print(f"  binomial: t={t40} exact {exact[t40]:.2f} est {T.surprisal(t40):.2f} (se {T.stderr(t40):.2f})")
    assert err < 1.0, err
    for t in range(n + 1):
        if exact[t] <= 60 and t in set(T.levels.tolist()):
            assert abs(T.surprisal(t) - exact[t]) < max(1.0, 3 * T.stderr(t)), (t, T.surprisal(t), exact[t])
    assert T.max_observed_bits >= 60


def test_exact_cross_check():
    for gt in (GT5, GT7, GridType(6, "cards", "rainbow6")):
        d = Draw(COLOUR_COUNT, {"colour": 0})
        est = cal.survival(d, gt, use_exact=False)
        ex = cal.survival(d, gt)
        assert ex.exact is not None and est.exact is None
        for t in est.levels.tolist():
            e, s = ex.surprisal(t), est.surprisal(t)
            if e <= 55:
                assert abs(e - s) < max(1.0, 3 * est.stderr(t)), (gt.key, t, e, s)


def test_monotone():
    for f in (COLOUR_COUNT_EST, SYMBOL_SUM, ROW_ALTERNATE):
        for gt in (GT5, GT7):
            T = cal.survival(Draw(f, {"colour": 2}), gt)
            ts = np.arange(int(T.levels[0]) - 3, int(T.levels[-1]) + 6)
            s = T.surprisal(ts)
            assert (s >= 0).all() and (np.diff(s) >= -1e-12).all(), f.id
            # scalar and vector lookups agree
            assert all(abs(T.surprisal(int(t)) - x) < 1e-12 for t, x in zip(ts, s))
            assert T.surprisal(int(T.levels[-1]) + 100) <= T.max_observed_bits + cal.EXTRAP_CAP_BITS


def test_p_value_property():
    """P(s >= k) <= 2^-k on fresh spawns (independent of the calibration seed)."""
    rng = np.random.default_rng(12345)
    n = 1 << 17
    for f in (COLOUR_COUNT_EST, SYMBOL_SUM, ROW_ALTERNATE, COLOUR_COUNT):
        for gt in (GT5, GT7):
            d = Draw(f, {"colour": 0})
            T = cal.survival(d, gt)
            sym, col = spawn_batch(gt, rng, n)
            s = T.surprisal(f.evaluate_batch(sym, col, d.params, gt))
            for k in range(1, 13):
                q = float((s >= k).mean())
                bound = 2.0 ** -k
                assert q <= bound * 1.15 + 3 * math.sqrt(bound / n), (f.id, gt.key, k, q, bound)


def test_determinism_and_orbits():
    d0, d2 = Draw(COLOUR_COUNT_EST, {"colour": 0}), Draw(COLOUR_COUNT_EST, {"colour": 2})
    a, b = cal.build_table(d0, GT5), cal.build_table(d0, GT5)
    assert np.array_equal(a.levels, b.levels) and np.array_equal(a.log2p, b.log2p)
    assert cal.seed_key(d0, GT5) == cal.seed_key(d2, GT5)          # same symmetry orbit
    assert cal.cache_key(d0, GT5) == cal.cache_key(d2, GT5)
    assert cal.seed_key(d0, GT5) != cal.seed_key(d0, GT7)
    assert cal.seed_key(d0, GT5) != cal.seed_key(Draw(SYMBOL_SUM, {}), GT5)
    c = cal.build_table(d0, GT5, salt="x")
    assert not np.array_equal(a.log2p, c.log2p)


def test_cache():
    old = cal.CACHE_DIR
    tmp = Path(tempfile.mkdtemp())
    try:
        cal.CACHE_DIR = tmp
        cal.clear_memory_cache()
        d = Draw(SYMBOL_SUM, {})
        t0 = time.perf_counter(); A = cal.survival(d, GT7); t_build = time.perf_counter() - t0
        assert (tmp / f"{A.key}.pkl").exists()
        assert cal.survival(d, GT7) is A                            # memory hit
        cal.clear_memory_cache()
        t0 = time.perf_counter(); B = cal.survival(d, GT7); t_load = time.perf_counter() - t0
        assert B is not A and np.array_equal(A.log2p, B.log2p) and np.array_equal(A.levels, B.levels)
        assert t_load < t_build
        # parallel precompute (fork pool) on several draws
        cal.clear_memory_cache()
        draws = [Draw(f, {"colour": 0}) for f in (COLOUR_COUNT_EST, ROW_ALTERNATE)] + [d]
        r = cal.precompute(draws, GT5, processes=2)
        assert r["built"] == 3 and r["cached"] == 0
        r = cal.precompute(draws, GT5, processes=2)
        assert r["built"] == 0 and r["cached"] == 3
        print(f"  cache: build {t_build:.2f}s, disk load {t_load * 1e3:.1f}ms")
    finally:
        cal.CACHE_DIR = old
        cal.clear_memory_cache()
        shutil.rmtree(tmp)


def _exact_joint_counts(gt: GridType, a: int, b: int) -> float:
    """log2 P[#colour0 >= a and #colour1 >= b] for a uniform grid (multinomial sum)."""
    n, p = gt.N * gt.N, 1.0 / gt.C
    tot = 0.0
    for k0 in range(a, n + 1):
        for k1 in range(b, n - k0 + 1):
            lg = (math.lgamma(n + 1) - math.lgamma(k0 + 1) - math.lgamma(k1 + 1) - math.lgamma(n - k0 - k1 + 1)
                  + (k0 + k1) * math.log(p) + (n - k0 - k1) * math.log1p(-2 * p))
            tot += math.exp(lg)
    return math.log2(tot)


def test_joint_and_synergy():
    gt = GridType(6, "base10", "rgb")
    di, dj = Draw(COLOUR_COUNT_EST, {"colour": 0}), Draw(COLOUR_COUNT_EST, {"colour": 1})
    # canonical() maps both to colour 0 for the marginal tables, but the joint uses the real params.
    N = gt.N
    col = np.full((N, N), 2, np.uint8)
    col.flat[:16] = 0
    col.flat[16:32] = 1
    x = Grid(np.zeros((N, N)), col)
    sij, se = cal.joint_surprisal(di, dj, gt, x)
    ex = -_exact_joint_counts(gt, 16, 16)
    print(f"  joint: exact {ex:.2f} est {sij:.2f} (se {se:.2f})")
    assert abs(sij - ex) < 1.0, (sij, ex)
    # deep case (exercises splitting on the joint constraint): 18 + 18 cells, a corner of the simplex
    col = np.full((N, N), 2, np.uint8)
    col.flat[:18] = 0
    col.flat[18:] = 1
    xd = Grid(np.zeros((N, N)), col)
    sd, sed = cal.joint_surprisal(di, dj, gt, xd)
    exd = -_exact_joint_counts(gt, 18, 18)
    print(f"  joint (splitting): exact {exd:.2f} est {sd:.2f} (se {sed:.2f})")
    assert abs(sd - exd) < max(1.0, 2 * sed), (sd, exd)
    syn = cal.synergy(di, dj, gt, x)
    assert syn < 0, syn  # competing colours conflict
    # identical draws: s_ij = s_i, synergy = s_i
    si = cal.survival(di, gt).surprisal(16)
    sii, _ = cal.joint_surprisal(di, di, gt, x)
    assert abs(sii - si) < 1.0, (sii, si)


def test_tuple_ordinals():
    """A tuple ordinal calibrates exactly like an int ordinal with the same order: wrapping a toy as
    (count, 0) under the same family id (same seed) gives the identical table; a real tuple family's
    estimated table matches its exact multinomial tail; batch (B, k) lookups agree with scalar ones."""
    from dataclasses import replace
    from gridlab.rules import by_id
    tup_fam = replace(COLOUR_COUNT_EST, ordinal=lambda g, p, gt: (COLOUR_COUNT_EST.ordinal(g, p, gt), 0),
                      batch=lambda s, c, p, gt: np.stack([COLOUR_COUNT_EST.batch(s, c, p, gt),
                                                          np.zeros(len(s), np.int64)], axis=1))
    for gt in (GT5, GT7):
        a = cal.build_table(Draw(COLOUR_COUNT_EST, {"colour": 1}), gt)
        b = cal.build_table(Draw(tup_fam, {"colour": 1}), gt)
        assert b.levels.dtype.kind == "S" and len(a.levels) == len(b.levels)
        assert np.array_equal(a.log2p, b.log2p), gt.key
        for t in range(-1, gt.N * gt.N + 3):
            assert a.surprisal(t) == b.surprisal((t, 0)), (gt.key, t)
        assert b.surprisal((3, 5)) == a.surprisal(3) and b.surprisal((3, -5)) == a.surprisal(2)
    f = by_id("seed3_green_ones")
    d = Draw(f, f.sample(np.random.default_rng(0), GT5))
    est, ex = cal.survival(d, GT5, use_exact=False), cal.survival(d, GT5)
    for t in est.levels[::3]:
        e, s = ex.surprisal(t), est.surprisal(t)
        if e <= 50:
            assert abs(e - s) < max(1.0, 3 * est.stderr(t)), (t, e, s)
    sym, col = spawn_batch(GT5, np.random.default_rng(1), 300)
    u = f.evaluate_batch(sym, col, d.params, GT5)
    assert u.shape == (300, 2)
    vec = est.surprisal(u)
    assert all(abs(vec[i] - est.surprisal(tuple(int(x) for x in u[i]))) < 1e-12 for i in range(300))


def main():
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            t0 = time.perf_counter()
            fn()
            print(f"ok {name} ({time.perf_counter() - t0:.2f}s)")


if __name__ == "__main__":
    main()
