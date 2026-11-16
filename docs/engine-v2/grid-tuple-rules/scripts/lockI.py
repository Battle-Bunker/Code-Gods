import numpy as np, math
rng = np.random.default_rng(1); N = 4_000_000
U = rng.random((N, 16)); B = (np.floor(1 / (1 - U)) - 1).astype(np.int64)
r1 = B[:, 0:4].sum(1); c1 = B[:, [0, 4, 8, 12]].sum(1)
def I(m, cap=None):
    k = m.sum(); return (-math.log2(k / N), k) if k >= 16 else ("bound (state's φ)", k)
for p, lo, hi, big in [(131, 117, 140, 119), (271, 262, 275, 250)]:
    print(p, "row1>=lo", I(r1 >= lo), "| row1 in basin", I((r1 >= lo) & (r1 <= hi)), "| row1=p", I(r1 == p),
          "| row1=p & col1=p", I((r1 == p) & (c1 == p)), "| r1c1>=big", I(B[:, 0] >= big),
          "| row1>=lo & col1>=lo", I((r1 >= lo) & (c1 >= lo)))
