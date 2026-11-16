from tally import *
import collections
from edges import phi
rng = np.random.default_rng(42)
U = rng.random((1_000_000, 16)); V = np.floor(1 / (1 - U)) - 1
S4 = np.sort(V, axis=1)[:, -4:].sum(1).astype(np.int64)
CAP = 3000
pm = np.bincount(np.minimum(S4, CAP), minlength=CAP + 1)[:CAP].astype(float) / len(S4)
# analytic tail beyond CAP: P(S4>=s) ~ c/s, fitted at CAP
c = (S4 >= CAP).mean() * CAP
def tail(s): return 1.0 if s <= 0 else (pm[s:].sum() + (S4 >= CAP).mean() if s < CAP else c / s)
def between(a, b):
    a = max(a, 0); tot = 0.0
    for s in range(a, b + 1): tot += pm[s] if s < CAP else c / s - c / (s + 1)
    return tot
class PrimeBig4(PrimeRow):
    """Total of the board's four biggest numbers -> nearest prime ending in k. Third: the row holding the biggest number totals near p."""
    def tuple(s, b):
        S = sum(sorted(b)[-4:]); p, lo, hi = s.target(S); bi = max(range(16), key=lambda i: (b[i], -i))
        C = sum(b[i] for i in rowcells(bi // N)); return p, abs(S - p), abs(C - p), (S, lo, hi, b[bi], C)
    def bits(s, b):
        p, d, e, (S, lo, hi, big, C) = s.tuple(b)
        lv = -math.log2(max(tail(lo), 1e-300)); basin = between(lo, hi)
        cl = -math.log2(max(between(max(lo, p - d), min(hi, p + d)) / basin, 1e-300))
        t = p - big; th = -math.log2(max(P_between(THREEC, t - e, t + e), 1e-300)) if t + e >= 0 else 0.0
        return lv + cl + th, (lv, cl, th)
f = PrimeBig4(0, 1)
boards = {"131": [119,2,6,4, 3,2,1,3, 6,1,0,1, 3,2,2,0], "271": [250,10,8,3, 9,0,1,0, 6,3,2,0, 2,0,0,0]}
# retune third/primary to exact: put the four biggest = row 1 so totals match
for bn, b in boards.items():
    p, d, e, info = f.tuple(b); tot, parts = f.bits(b)
    b0 = tot; rows = []
    for n, fee, nb in moves(b, (1, -1)):
        dp = phi(nb, 1) - phi(b, 1); rows.append((n.split()[0][:5], dp, f.bits(nb)[0] / b0))
    side = [r for r in rows if abs(r[1]) < 1e-9]; dmg = [r for r in rows if r[2] < 0.75]
    sd = [r for r in dmg if abs(r[1]) < 1e-9]; down = [r for r in dmg if r[1] < 0]
    print(f"board {bn}: top-4 total {info[0]} -> {p} off {d}; row of biggest totals {info[4]} off {e}; bits {tot:.1f} {[round(x,1) for x in parts]}", flush=True)
    print(f"  cheap moves {len(rows)}, sideways {len(side)}; damaging {len(dmg)}: sideways {len(sd)} {dict(collections.Counter(r[0] for r in sd))} median kept {stt.median([r[2] for r in sd]) if sd else '-'}, downhill {len(down)}; median kept over all sideways {stt.median([r[2] for r in side]):.2f}, worst {min(r[2] for r in side):.2f}", flush=True)
bs = sorted(f.bits(draw_board(rng))[0] for _ in range(3000)); print("law draws median %.1f p90 %.1f p99 %.1f" % (bs[1500], bs[2700], bs[2970]))
