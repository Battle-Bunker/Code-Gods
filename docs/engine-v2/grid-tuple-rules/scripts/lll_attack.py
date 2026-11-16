"""Formula attack: lattice reduction for 'every half near (or on) a multiple of q^e'."""
import sys, numpy as np
from fpylll import IntegerMatrix, LLL, BKZ
from fpylll.algorithms.bkz2 import BKZReduction
from gridlab import readings_cells
from rh2 import RH, calibrate, B, tup_of

def weights(cells):
    W = [[0]*16 for _ in cells]
    for k, cs in enumerate(cells):
        for j, i in enumerate(cs): W[k][i] = 10 ** (len(cs) - 1 - j)
    return W

def attack(q, L, e, layout="halves", tol=None, seed=0, block=20):
    rng = np.random.default_rng(seed)
    cells = readings_cells(layout); W = weights(cells)
    mod = q ** e
    tol = tol if tol is not None else q ** L // 2   # allowed residual
    Sd = max(1, round(2 * tol / 9)) if tol > 0 else 1
    Sc = 1 if tol > 0 else 10 ** 12
    t = [int(x) for x in rng.integers(3, 6, 16)]
    M = max(tol, 1) * 2
    n = 16 + 4 + 1
    A = IntegerMatrix(n, n)
    for i in range(16):
        A[i, i] = Sd
        for k in range(4): A[i, 16 + k] = W[k][i] * Sc
    for k in range(4): A[16 + k, 16 + k] = mod * Sc
    for i in range(16): A[20, i] = -t[i] * Sd
    A[20, 20] = M
    LLL.reduction(A)
    BKZ.reduction(A, BKZ.Param(block_size=block, max_loops=4))
    sols = []
    for r in range(n):
        row = [A[r, c] for c in range(n)]
        if abs(row[20]) != M: continue
        sg = 1 if row[20] == M else -1
        d = [sg * row[i] // Sd + t[i] for i in range(16)]
        if all(0 <= x <= 9 for x in d): sols.append(d)
    return sols

if __name__ == "__main__":
    q, L, layout = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    f = RH(q, L, layout); cal = calibrate(f)
    best = None
    for e in range(L + 2, 18):
        found = 0
        for seed in range(12):
            for d in attack(q, L, e, layout, seed=seed):
                found += 1
                tp = tup_of(f, d)
                if best is None or tp[0] > best[0][0]: best = (tp, d, B(f, cal, d)[0])
        print(f"e={e}: {found} boards; best so far V={best[0][0] if best else None}", flush=True)
        if found == 0 and e > L + 6: break
    print("best", best[0], ''.join(map(str, best[1])), "bits %.1f" % best[2])
