from tally import *
import collections
EDGES = [rowcells(0), rowcells(3), colcells(0), colcells(3)]
class PrimeEdge(PrimeRow):
    """Best of the four edge lines (top/bottom row, left/right column): the edge whose bits are highest."""
    def bits(s, b):
        best = None
        for L in EDGES:
            s.cells = L; r = s._bits(b)
            if best is None or r[0] > best[0]: best = r
        return best
    def _bits(s, b):
        cells = s.cells; S = sum(b[i] for i in cells); p, lo, hi = s.target(S)
        bi = max(cells, key=lambda i: (b[i], -i))
        cross = [L for L in EDGES if bi in L and L != cells]
        cross = cross[0] if cross else (colcells(bi % N) if cells in (rowcells(0), rowcells(3)) else rowcells(bi // N))
        C = sum(b[i] for i in cross); d, e = abs(S - p), abs(C - p)
        lv = -math.log2(max(1 - ROWC[lo - 1] if lo > 0 else 1.0, 1e-300))
        basin = P_between(ROWC, lo, hi)
        cl = -math.log2(max(P_between(ROWC, max(lo, p - d), min(hi, p + d)) / basin, 1e-300))
        t = p - b[bi]; th = -math.log2(max(P_between(THREEC, t - e, t + e), 1e-300)) if t + e >= 0 else 0.0
        return lv + cl + th, (lv, cl, th)
def phi(b, a): return sum(v ** a for v in b)
def knocks(f, b, a):
    b0 = f.bits(b)[0]; p0 = phi(b, a); rows = []
    for n, fee, nb in moves(b, (1, -1)):
        dp = phi(nb, a) - p0; kept = f.bits(nb)[0] / b0
        rows.append((n.split()[0][:5], dp, kept))
    side = [r for r in rows if abs(r[1]) < 1e-9]
    dmg = [r for r in rows if r[2] < 0.75]
    sdmg = [r for r in dmg if abs(r[1]) < 1e-9]
    down = [r for r in dmg if r[1] < -1e-9]
    return len(rows), len(side), len(dmg), len(sdmg), len(down), (st_med([r[2] for r in sdmg]) if sdmg else None), collections.Counter(r[0] for r in sdmg)
def st_med(x): return round(stt.median(x), 2)
boards = {"131 top-left": [119,2,6,4, 3,2,1,3, 6,1,0,1, 3,2,2,0], "271": [250,10,8,3, 9,0,1,0, 6,3,2,0, 2,0,0,0]}
for nm, f in (("Prime Rows (top row)", PrimeRow(0, 1)), ("Prime Edges (best edge)", PrimeEdge(0, 1))):
    for bn, b in boards.items():
        for a in (1, 0.5):
            n, side, dmg, sdmg, down, med, kinds = knocks(f, b, a)
            print(flush=True, *[f"{nm} {bn} α={a}: bits {f.bits(b)[0]:.1f}; cheap moves {n}, sideways in φ {side}; damaging (<75% kept) {dmg}, of them sideways {sdmg} (median kept {med}, {dict(kinds)}), downhill {down}"])
