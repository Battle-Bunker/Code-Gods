import sys, statistics as st
from roundhalves import RoundHalves as RH0, calibrate as cal0
from gridlab import *
from climb import anneal, greedy

class RH(RH0):
    """third A: leftovers of opposite halves close in doublings (smaller better -> stored negated*100)."""
    def tuple(s, B):
        X, T, v, d, left = s.parts(B)
        lg = np.log2(np.maximum(left, 1).astype(float))
        th = np.abs(lg[:, 0] - lg[:, 1]) + np.abs(lg[:, 2] - lg[:, 3])
        return v.sum(1), d.sum(1), -np.round(th * 100).astype(np.int64)

def calibrate(f):
    c = cal0(f); return c

def bits(f, cal, tup):
    V, D, Th = tup
    lv = -math.log2(cal["tail"][V])
    cl = -math.log2(cal["cdf"][min(D, len(cal["cdf"]) - 1)])
    k = len(cal["ths"]) - np.searchsorted(cal["ths"], Th, side="left")
    th = -math.log2(max(k, 1) / len(cal["ths"]))
    return lv + cl + th, (lv, cl, th)

def tup_of(f, b): return tuple(int(x[0]) for x in f.tuple(np.array([b])))
def B(f, cal, b): return bits(f, cal, tup_of(f, b))

if __name__ == "__main__":
    q, L, layout = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    f = RH(q, L, layout); cal = calibrate(f)
    rng = np.random.default_rng(11)
    # law sample examples
    S = draw(200000, rng); T = f.tuple(S)
    print("law: median V", np.median(T[0]), "share V>=4", (T[0] >= 4).mean())
    # greedy from births
    g = []
    for st_ in draw(8, rng):
        top, spent, s, path = greedy(f, cal, bits, st_); g.append((top, spent, tup_of(f, s), ''.join(map(str, s))))
    print("greedy:", [(round(a, 1), round(b_)) for a, b_, *_ in g])
    print("greedy best:", max(g))
    # SA on primary then on bits
    highs = []
    for k, st_ in enumerate(draw(4, rng)):
        prim = lambda b: tup_of(f, b)[0] - 1e-5 * tup_of(f, b)[1]
        _, s = anneal(f, cal, prim, list(st_), iters=25000, T0=1, seed=k)
        _, s2 = anneal(f, cal, lambda b: B(f, cal, b)[0] if tup_of(f, b)[0] >= tup_of(f, s)[0] else -1, s, iters=8000, T0=0.5, seed=k)
        highs.append(s2)
        tot, parts = B(f, cal, s2)
        print(f"SA high: {''.join(map(str,s2))} tuple {tup_of(f,s2)} bits {tot:.1f} {[round(x,1) for x in parts]} code {code_bits(s2):.1f}")
    # bumps
    by = {}
    for s in highs:
        b0 = B(f, cal, s)[0]
        for name, fee, nb in cheap_bumps(s):
            kind = name.split()[0]
            by.setdefault(kind, []).append(B(f, cal, nb)[0] / b0)
    allk = [x for v in by.values() for x in v]
    print("bump share kept: median all %.2f" % st.median(allk), {k: round(st.median(v), 2) for k, v in by.items()}, "worst", round(min(allk), 2))
