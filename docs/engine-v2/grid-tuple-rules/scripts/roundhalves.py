import numpy as np, math, sys
from gridlab import *

class RoundHalves:
    """Each half read as an 8-digit number X. T = the nearest nonzero multiple of q^L. Primary: extra q's dividing T (v_q(T)-L), summed.
    Secondary: |X-T| summed (smaller better). Third (a): digits of T/q^v_q(T) summed (bigger better)."""
    def __init__(s, q, L, layout="halves"):
        s.q, s.L, s.m = q, L, q ** L
        s.cells = readings_cells(layout)
    def parts(s, B):
        X = read_numbers(B, s.cells)
        T = np.maximum(((X + s.m // 2) // s.m) * s.m, s.m)  # nearest multiple, nonzero (ties round up)
        v = vq(T // s.m, s.q)
        d = np.abs(X - T)
        left = T // (s.m * s.q ** v)
        return X, T, v, d, left
    def tuple(s, B):
        X, T, v, d, left = s.parts(B)
        ds = np.zeros(B.shape[0], dtype=np.int64); y = left.copy()
        while (y > 0).any(): ds += (y % 10).sum(axis=1); y //= 10
        return v.sum(1), d.sum(1), ds

def calibrate(f, n=400000, seed=1):
    rng = np.random.default_rng(seed)
    B = draw(n, rng)
    X, T, v, d, left = f.parts(B)
    pv = np.bincount(v.ravel(), minlength=12)[:12] / v.size
    # extend geometric beyond observed support
    for j in range(1, 40):
        if j >= len(pv) or pv[j] * v.size < 50:
            pv = np.concatenate([pv[:j], pv[j-1] / f.q ** np.arange(1, 40 - j + 1)]); break
    # level pmf of sum of 4 (independence)
    s = np.array([1.0])
    for _ in range(4): s = np.convolve(s, pv)
    tail = np.cumsum(s[::-1])[::-1]  # P(V>=k)
    # closeness: distance pmf per reading (uniform low digits approx): P(0)=1/m, P(j)=2/m
    h = f.m // 2; pd = np.full(h + 1, 2.0 / f.m); pd[0] = 1.0 / f.m; pd /= pd.sum()
    sd = np.array([1.0])
    for _ in range(4): sd = np.convolve(sd, pd)
    cdf = np.cumsum(sd)
    _, _, th = f.tuple(B)
    ths = np.sort(th)
    return dict(tail=tail, cdf=cdf, ths=ths)

def bits(f, cal, tup):
    V, D, Th = tup
    lv = -math.log2(cal["tail"][V]) if V < len(cal["tail"]) else 99
    cl = -math.log2(cal["cdf"][min(D, len(cal["cdf"]) - 1)])
    k = len(cal["ths"]) - np.searchsorted(cal["ths"], Th, side="left")
    th = -math.log2(max(k, 1) / len(cal["ths"]))
    return lv + cl + th, (lv, cl, th)

if __name__ == "__main__":
    for q, L in [(3, 6), (7, 3), (11, 3), (13, 2)]:
        f = RoundHalves(q, L); cal = calibrate(f)
        print(q, L, "P(V>=k) bits:", [round(-math.log2(x), 1) for x in cal["tail"][:12]])
