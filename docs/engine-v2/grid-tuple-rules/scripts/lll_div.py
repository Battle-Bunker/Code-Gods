import sys
from lll_attack import attack
from gridlab import readings_cells
def vq(x, q):
    if x == 0: return 0
    v = 0
    while x % q == 0: x //= q; v += 1
    return v
q, layout = int(sys.argv[1]), sys.argv[2]
cells = readings_cells(layout); best = None
for e in range(4, 18):
    n = 0
    for seed in range(12):
        for d in attack(q, 0, e, layout, tol=0, seed=seed):
            X = [int(''.join(str(d[i]) for i in cs)) for cs in cells]
            if 0 in X: continue
            n += 1; s = sum(vq(x, q) for x in X)
            if best is None or s > best[0]: best = (s, ''.join(map(str, d)), X)
    print(e, n, best and best[0], flush=True)
print("best", best)
