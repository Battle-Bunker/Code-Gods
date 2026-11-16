"""Uncapped board prototype: 16 whole numbers >= 0, law P(v) = 1/((v+1)(v+2)) (code ~ 2 log2 v)."""
import numpy as np, math, random, statistics as stt
from sympy import isprime
N = 4; VMAX = 200000
cell = np.array([1.0 / ((v + 1) * (v + 2)) for v in range(VMAX)]); cell /= cell.sum()
def conv_n(p, n, cap=VMAX):
    out = np.array([1.0])
    for _ in range(n): out = np.convolve(out, p)[:cap]
    return out
ROW = conv_n(cell, 4, 60000); ROWC = np.cumsum(ROW)
THREE = conv_n(cell, 3, 60000); THREEC = np.cumsum(THREE)
def draw_board(rng):
    u = rng.random(16); return [int(math.floor(1 / (1 - x)) - 1) for x in u]  # P(v>=k)=1/(k+1)
def code_bits(b): return sum(math.log2((v + 1) * (v + 2)) for v in b)

PR = {}
def primes_ending(k, upto=60000):
    if k not in PR: PR[k] = [p for p in range(2, upto) if p % 10 == k and isprime(p)]
    return PR[k]

def rowcells(r): return [r * N + c for c in range(N)]
def colcells(c): return [r * N + c for r in range(N)]

def P_between(C, a, b):  # P(a <= S <= b)
    a = max(a, 0); b = min(b, len(C) - 1)
    if b < a: return 0.0
    return C[b] - (C[a - 1] if a > 0 else 0.0)

class PrimeRow:
    """Row r's total S. Target: the prime ending in k nearest S. First: the prime (bigger better). Second: |S-p|.
    Third (cross): the column through the row's biggest number totals as close to p as possible."""
    def __init__(s, r=0, k=1): s.r, s.k = r, k; s.ps = primes_ending(k)
    def target(s, S):
        ps = s.ps; i = np.searchsorted(ps, S)
        cands = [ps[j] for j in (i - 1, i) if 0 <= j < len(ps)]
        p = min(cands, key=lambda p: (abs(S - p), -p)); j = ps.index(p)
        lo = (ps[j - 1] + p) // 2 + 1 if j > 0 else 0          # basin of p (ties go to the bigger prime)
        hi = (p + ps[j + 1]) // 2 if j + 1 < len(ps) else 10**9
        if j + 1 < len(ps) and (p + ps[j + 1]) % 2 == 0: hi -= 1
        return p, lo, hi
    def tuple(s, b):
        cells = rowcells(s.r); S = sum(b[i] for i in cells); p, lo, hi = s.target(S)
        bi = max(cells, key=lambda i: (b[i], -i)); col = colcells(bi % N)
        C = sum(b[i] for i in col); return p, abs(S - p), abs(C - p), (S, lo, hi, b[bi], C)
    def bits(s, b):
        p, d, e, (S, lo, hi, big, C) = s.tuple(b)
        lv = -math.log2(max(1 - ROWC[lo - 1] if lo > 0 else 1.0, 1e-300))
        basin = P_between(ROWC, lo, hi)
        cl = -math.log2(max((P_between(ROWC, max(lo, p - d), min(hi, p + d))) / basin, 1e-300))
        # third: the column's other three cells total O, want O near p - big
        t = p - big
        th = -math.log2(max(P_between(THREEC, t - e, t + e), 1e-300)) if t + e >= 0 else 0.0
        return lv + cl + th, (lv, cl, th)

# moves on the uncapped board (fees as the digit board's: ~8.4 per unit add, choices fixed)
def moves(b, amounts=(1, -1, 2, -2, 5, -5)):
    b = list(b)
    lines_ = [("row%d" % r, rowcells(r)) for r in range(N)] + [("col%d" % c, colcells(c)) for c in range(N)]
    boxes_ = [[0, 1, 4, 5], [2, 3, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]]
    ok = lambda nb: all(x >= 0 for x in nb)
    for k in amounts:
        for i in range(16):
            nb = b[:]; nb[i] += k
            if ok(nb): yield ("add r%dc%d %+d" % (i // N + 1, i % N + 1, k), (8.67 if k > 0 else 8.17) * abs(k), nb)
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
            nb = b[:]; nb[i] -= k; nb[15 - i] += k
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
    flat = lambda m: [x for row in m for x in row]
    for nm, m in {"quarter": [[M[N-1-c][r] for c in range(N)] for r in range(N)], "half": [[M[N-1-r][N-1-c] for c in range(N)] for r in range(N)],
                  "flip-rows": [row[::-1] for row in M], "flip-cols": M[::-1], "transpose": [[M[c][r] for c in range(N)] for r in range(N)]}.items():
        yield ("spin " + nm, 5.98, flat(m))

def greedy(f, start, income=2530, steps=2000, amounts=(1, -1, 2, -2, 5, -5)):
    s = list(start); spent = 0; seen = {tuple(s)}; b0 = f.bits(s)[0]; top = b0; trace = [(0, b0)]
    for _ in range(steps):
        best = None
        for n, fee, nb in moves(s, amounts):
            if spent + fee > income or tuple(nb) in seen: continue
            b = f.bits(nb)[0]; g = (b - b0) / fee
            if g > 0 and (best is None or g > best[0]): best = (g, n, fee, nb, b)
        if not best: break
        _, n, fee, s, b0 = best; spent += fee; seen.add(tuple(s)); top = max(top, b0); trace.append((spent, b0))
    return top, spent, s, trace

def show(b): return "/".join(",".join(str(x) for x in b[r*N:(r+1)*N]) for r in range(N))
