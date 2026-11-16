"""Scratch lab for grid tuple rules on the 4x4 digit board (law: cell x has prob ∝ 2^(-x/2), x in 0..9)."""
import numpy as np, math, itertools, random

N = 4
P = np.array([2 ** (-0.5 * x) for x in range(10)]); P /= P.sum()
LOG2Z = math.log2(sum(2 ** (-0.5 * x) for x in range(10)))

def draw(n, rng):
    return rng.choice(10, size=(n, 16), p=P).astype(np.int64)

def code_bits(b):
    return sum(0.5 * x + LOG2Z for x in b)

# Halves layout readings (as lib/v2-grid readings.ts): top rows, bottom rows, left cols, right cols.
def readings_cells(layout="halves"):
    half = N // 2; idx = range(N)
    pick = (lambda k: k < half) if layout == "halves" else (lambda k: k % 2 == 0)
    rows = lambda first: [r * N + c for r in idx if pick(r) == first for c in idx]
    cols = lambda first: [r * N + c for c in idx if pick(c) == first for r in idx]
    return [rows(True), rows(False), cols(True), cols(False)]

def read_numbers(B, cells_list):
    """B: (n,16) int array -> (n, k) readings."""
    out = []
    for cells in cells_list:
        x = np.zeros(B.shape[0], dtype=np.int64)
        for i in cells:
            x = x * 10 + B[:, i]
        out.append(x)
    return np.stack(out, axis=1)

def vq(x, q):
    """vectorised q-adic valuation of positive ints (x>0)."""
    v = np.zeros_like(x); y = x.copy()
    m = y > 0
    while True:
        d = m & (y % q == 0)
        if not d.any(): break
        v[d] += 1; y[d] //= q
    return v

# ------------------------------------------------------------------ cheap moves (the grid menu) with fees
def moves(b):
    """Yield (name, fee, new_board) for the grid's cheap moves (amounts ±1, ±2, ±5 as the energy gate)."""
    b = list(b)
    rowsI = [[r * N + c for c in range(N)] for r in range(N)]
    colsI = [[r * N + c for r in range(N)] for c in range(N)]
    lines_ = [("row%d" % r, rowsI[r]) for r in range(N)] + [("col%d" % c, colsI[c]) for c in range(N)]
    boxes_ = [[0, 1, 4, 5], [2, 3, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]]
    def ok(nb): return all(0 <= x <= 9 for x in nb)
    for k in (1, -1, 2, -2, 5, -5):
        fee = (8.67 if k > 0 else 8.17) * abs(k)
        for i in range(16):
            nb = b[:]; nb[i] += k
            if ok(nb): yield ("add r%dc%d %+d" % (i // N, i % N, k), fee, nb)
        for nm, L in lines_:
            nb = b[:]
            for i in L: nb[i] += k
            if ok(nb): yield ("tally %s %+d" % (nm, k), (9.18 if k > 0 else 7.18) * abs(k), nb)
            nb = b[:]
            for j, i in enumerate(L): nb[i] += k * j
            if ok(nb): yield ("tilt %s %+d" % (nm, k), (10.18 if k > 0 else 7.18) * abs(k), nb)
        for bi, L in enumerate(boxes_):
            nb = b[:]
            for i in L: nb[i] += k
            if ok(nb): yield ("box%d %+d" % (bi, k), (8.19 if k > 0 else 6.19) * abs(k), nb)
        for i in range(8):
            o = 15 - i; nb = b[:]; nb[i] -= k; nb[o] += k
            if ok(nb): yield ("balance %d %+d" % (i, k), 7.18 * abs(k), nb)
    for i in range(16):
        for j in range(i + 1, 16):
            if b[i] != b[j]:
                nb = b[:]; nb[i], nb[j] = nb[j], nb[i]; yield ("swap %d %d" % (i, j), 11.17, nb)
    for nm, L in lines_:
        nb = b[:]
        for i, x in zip(L, [b[i] for i in L][::-1]): nb[i] = x
        yield ("reverse %s" % nm, 6.17, nb)
        for j in (1, 2, 3):
            vals = [b[i] for i in L]; vals = vals[-j:] + vals[:-j]; nb = b[:]
            for i, x in zip(L, vals): nb[i] = x
            yield ("rotate %s %d" % (nm, j), 7.75, nb)
    M = [b[r * N:(r + 1) * N] for r in range(N)]
    def flat(m): return [x for row in m for x in row]
    spins = {
        "quarter": [[M[N - 1 - c][r] for c in range(N)] for r in range(N)],
        "half": [[M[N - 1 - r][N - 1 - c] for c in range(N)] for r in range(N)],
        "three-quarters": [[M[c][N - 1 - r] for c in range(N)] for r in range(N)],
        "flip-rows": [row[::-1] for row in M], "flip-cols": M[::-1],
        "transpose": [[M[c][r] for c in range(N)] for r in range(N)],
        "antitranspose": [[M[N - 1 - c][N - 1 - r] for c in range(N)] for r in range(N)],
    }
    for nm, m in spins.items():
        yield ("spin " + nm, 5.98, flat(m))

def cheap_bumps(b):
    """The cheap moves a passing player makes: single moves of size 1 (and swaps, reversals, rotations, spins)."""
    for name, fee, nb in moves(b):
        if any(t in name for t in ("+2", "-2", "+5", "-5")): continue
        yield name, fee, nb
