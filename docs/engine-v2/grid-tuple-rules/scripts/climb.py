import numpy as np, math, sys, time
from gridlab import *

INCOME = 2530

def bits_many(f, cal, B, bitsfn):
    tups = f.tuple(np.array(B))
    return [bitsfn(f, cal, tuple(int(t[i]) for t in tups))[0] for i in range(len(B))]

def greedy(f, cal, bitsfn, start, income=INCOME, steps=400):
    s = list(start); spent = 0; seen = {tuple(s)}
    b0 = bits_many(f, cal, [s], bitsfn)[0]; top = b0; path = []
    for _ in range(steps):
        cand = [(n, fee, nb) for n, fee, nb in moves(s) if spent + fee <= income and tuple(nb) not in seen]
        if not cand: break
        bs = bits_many(f, cal, [c[2] for c in cand], bitsfn)
        best = None
        for (n, fee, nb), b in zip(cand, bs):
            g = (b - b0) / fee
            if g > 0 and (best is None or g > best[0]): best = (g, n, fee, nb, b)
        if not best: break
        _, n, fee, s, b0 = best; spent += fee; seen.add(tuple(s)); top = max(top, b0); path.append(n)
    return top, spent, s, path

def anneal(f, cal, score, start, iters=20000, T0=2.0, seed=0):
    """Search for the top of `score` (no energy limit): random cell moves and swaps."""
    rng = random.Random(seed); s = list(start); cur = score(s); best = (cur, s[:])
    for it in range(iters):
        T = T0 * (1 - it / iters) + 1e-3
        nb = s[:]
        if rng.random() < 0.7: i = rng.randrange(16); nb[i] = rng.randrange(10)
        else: i, j = rng.sample(range(16), 2); nb[i], nb[j] = nb[j], nb[i]
        c = score(nb)
        if c >= cur or rng.random() < math.exp((c - cur) / T):
            s, cur = nb, c
            if c > best[0]: best = (c, nb[:])
    return best
