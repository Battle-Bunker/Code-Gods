#!/usr/bin/env python3
"""Checks the worked examples of docs/engine-v2/rule-brainstorm/e-unusual-lenses.md.

Exact arithmetic (fractions). Run: python3 docs/engine-v2/rule-brainstorm/scripts/e_unusual_lenses_check.py
Each section prints the ladder of the example line and, where the document claims a line is the top, a small
brute-force search that supports the claim. Not the engine: a calculator for the brainstorm.
"""
from fractions import Fraction as F
from math import gcd, floor, isqrt
from itertools import combinations

def gen(m, c):
    """primitive (a, b, c0) with b > 0 of a x + b y + c0 = 0 for y = m x + c"""
    m, c = F(m), F(c)
    d = m.denominator * c.denominator // gcd(m.denominator, c.denominator)
    a, b, c0 = int(-m * d), d, int(-c * d)
    g = gcd(gcd(abs(a), b), abs(c0))
    return a // g, b // g, c0 // g

def reflect(m, c, P):
    a, b, c0 = gen(m, c)
    v = F(a * P[0] + b * P[1] + c0, a * a + b * b)
    return (P[0] - 2 * v * a, P[1] - 2 * v * b)

def foot(m, c, P=(0, 0)):
    a, b, c0 = gen(m, c)
    v = F(a * P[0] + b * P[1] + c0, a * a + b * b)
    return (P[0] - v * a, P[1] - v * b)

def dist2_line(m, c, P=(0, 0)):
    a, b, c0 = gen(m, c)
    return F((a * P[0] + b * P[1] + c0) ** 2, a * a + b * b)

def near_int(q):
    q = F(q); f = q - floor(q); return min(f, 1 - f)

def is_prime(n):
    if n != int(n) or n < 2: return False
    n = int(n); return all(n % d for d in range(2, isqrt(n) + 1))

def pegs_on(m, c, lo=-6, hi=6):
    return sum(1 for x in range(lo, hi + 1) if (y := m * x + c).denominator == 1 and lo <= y <= hi)

def show(title, line, ladder):
    print(f"\n== {title}\n   line: {line}\n   ladder: " + " | ".join(f"{k} = {v}" for k, v in ladder))

# ---------------------------------------------------------------- 1 Constellation Mirror
STARS = [(1, 3), (3, -1), (5, 0), (3, 4), (-1, 2), (1, -2)]
def constellation(m, c):
    S = set(STARS)
    twins = sum(1 for s in STARS if (r := reflect(m, c, s)) in S and r != s)
    fixed = sum(1 for s in STARS if m * s[0] + c == s[1])
    return twins, fixed, pegs_on(m, c), -dist2_line(m, c)
m, c = F(1, 2), F(0)
show("1 Constellation Mirror", "y = x/2", zip(["twins", "on mirror", "pegs", "-reach2"], constellation(m, c)))
print("   near miss y = x/2 + 1/2:", constellation(F(1, 2), F(1, 2)))
best = {}
for A, B in combinations(STARS, 2):          # every mirror that swaps two stars is a perpendicular bisector
    dx, dy = B[0] - A[0], B[1] - A[1]
    if dy == 0: continue                      # vertical mirror: not y = mx + c
    mm = F(-dx, dy); cc = F(A[1] + B[1], 2) - mm * F(A[0] + B[0], 2)
    best[(mm, cc)] = constellation(mm, cc)
for k, v in sorted(best.items(), key=lambda kv: kv[1], reverse=True)[:4]:
    print("   bisector y = %sx + %s -> %s" % (k[0], k[1], tuple(map(str, v))))

# ---------------------------------------------------------------- 2 Haga's Fold (paper [0,8]^2)
def fold(m, c):
    lx, ly = reflect(m, c, (0, 0))
    primary = abs(ly - 8) + max(0, -lx, lx - 8)
    yl, yr = c, m * 8 + c                                    # crease ends on the left and right edges
    sides = [8 - yl, lx, yl]                                 # corner triangle (0,yl) (0,8) (lx,8)
    whole = sum(1 for s in sides if s.denominator == 1) if all(s > 0 for s in sides) else 0
    return (lx, ly), -primary, -near_int(lx), whole, -near_int(yr), sides
r = fold(F(-1, 2), F(5))
show("2 Haga's Fold", "y = -x/2 + 5", zip(["landing", "-miss", "-tick", "whole sides", "-right end tick", "triangle"], r))
print("   t=2 (y = -x/4 + 17/4):", [str(x) for x in fold(F(-1, 4), F(17, 4))[1:5]], " t=6:", [str(x) for x in fold(F(-3, 4), F(25, 4))[1:5]])

# ---------------------------------------------------------------- 3 Fair Cut (chessboard [0,8]^2, (i+j) even is dark)
def area_below(m, c, W=8, H=8):
    xs = {F(0), F(W)}
    if m != 0:
        for t in (0, H):
            x = (t - c) / m
            if 0 < x < W: xs.add(x)
    xs = sorted(xs); tot = F(0)
    cl = lambda v: max(F(0), min(F(H), v))
    for u, v in zip(xs, xs[1:]):
        tot += (cl(m * u + c) + cl(m * v + c)) / 2 * (v - u)
    return tot
def through(m, c, n=8):
    dark = light = 0
    for i in range(n):
        for j in range(n):
            vals = [(j + dj) - (m * (i + di) + c) for di in (0, 1) for dj in (0, 1)]
            if min(vals) < 0 < max(vals):
                if (i + j) % 2 == 0: dark += 1
                else: light += 1
    return dark, light
def fair_cut(m, c):
    d, l = through(m, c)
    ends = sum(1 for x in (0, 8) if (y := m * x + c).denominator == 1 and 0 <= y <= 8)
    return -abs(area_below(m, c) - 32), d - l, -(d + l), ends
show("3 Fair Cut", "y = x", zip(["-|below-32|", "dark-light", "-through", "whole ends"], fair_cut(F(1), F(0))))
print("   y = x/2 + 2:", [str(x) for x in fair_cut(F(1, 2), F(2))], "  y = 4:", [str(x) for x in fair_cut(F(0), F(4))],
      "  y = x + 1:", [str(x) for x in fair_cut(F(1), F(1))])
top = max(((fair_cut(F(p, q), 4 - 4 * F(p, q)), F(p, q)) for p in range(-24, 25) for q in range(1, 13)), key=lambda t: t[0])
print("   best line through the centre, |p| <= 24, q <= 12:", [str(x) for x in top[0]], "m =", top[1])

# ---------------------------------------------------------------- 4 Sheep Fence (dots {0..6}^2)
DOTS = [(x, y) for x in range(7) for y in range(7)]
def fence(m, c, N):
    above = sum(1 for (x, y) in DOTS if y > m * x + c)
    on = sum(1 for (x, y) in DOTS if y == m * x + c)
    ds = sorted(dist2_line(m, c, P) for P in DOTS if P[1] != m * P[0] + c)
    return -abs(above - N), -on, ds[0], sum(1 for d in ds if d == ds[0])
show("4 Sheep Fence (N = 10)", "y = x + 5/2", zip(["-|above-10|", "-on", "clear2", "touchers"], fence(F(1), F(5, 2), 10)))
cands = []
for p in range(-6, 7):
    for q in range(1, 7):
        if gcd(abs(p), q) != 1: continue
        for k in range(-200, 200):
            cc = F(k, 4 * q); r = fence(F(p, q), cc, 10)
            if r[0] == 0 and r[1] == 0: cands.append((r, F(p, q), cc))
cands.sort(key=lambda t: t[0], reverse=True)
print("   best fences with 10 above, none on (m = p/q, |p|,q <= 6, c in quarters of 1/q):")
for r, mm, cc in cands[:3]: print("     y = %sx + %s -> clear2 %s, touchers %s" % (mm, cc, r[2], r[3]))

# ---------------------------------------------------------------- 5 Palindrome Path (box (0,6)^2)
def word(m, c, n=6):
    ev = []
    for k in range(1, n):
        y = m * k + c
        if 0 < y < n: ev.append((F(k), "R"))
        if m != 0:
            x = (k - c) / m
            if 0 < x < n: ev.append((x, "U" if m > 0 else "D"))
    ev.sort(); w = []; i = 0
    while i < len(ev):
        if i + 1 < len(ev) and ev[i][0] == ev[i + 1][0]: w.append("X"); i += 2
        else: w.append(ev[i][1]); i += 1
    return "".join(w)
def pal(m, c):
    w = word(m, c); mis = sum(1 for i in range(len(w) // 2) if w[i] != w[-1 - i])
    return w, -mis, len(w), w.count("X"), -(abs(F(m).numerator) + F(m).denominator)
show("5 Palindrome Path", "y = 3x/4 + 3/4", zip(["word", "-mismatch", "length", "corners", "-(p+q)"], pal(F(3, 4), F(3, 4))))
print("   y = x + 1/2:", pal(F(1), F(1, 2))[:3], "  y = x:", pal(F(1), F(0))[:3], "  y = 2x/3 + 1:", pal(F(2, 3), F(1))[:3])
bestp = []
for p in range(-12, 13):
    for q in range(1, 9):
        if p == 0 or gcd(abs(p), q) != 1: continue
        for k in range(-12 * 8, 12 * 8):
            r = pal(F(p, q), F(k, 2 * q))
            if r[1] == 0: bestp.append((r[2], r[3], r[4], str(F(p, q)), str(F(k, 2 * q)), r[0]))
bestp.sort(reverse=True)
print("   longest palindromes found:", bestp[:4])
print("   any palindrome of length >= 10:", any(b[0] >= 10 for b in bestp))

# ---------------------------------------------------------------- 6 Tresillo
def hits(m, c, n0, n1):
    return ["x" if floor(m * n + c) != floor(m * (n - 1) + c) else "." for n in range(n0, n1 + 1)]
def drum(m, c, target="x..x..x."):
    bar = hits(m, c, 1, 8); match = sum(1 for a, b in zip(bar, target) if a == b)
    later = hits(m, c, 9, 32); streak = 0
    for i, h in enumerate(later):
        if h != target[i % 8]: break
        streak += 1
    clean = sum(1 for n in range(1, 9) if bar[n - 1] == "x" and (m * n + c).denominator == 1)
    return "".join(bar), match, streak, clean, -abs(floor(c))
show("6 Tresillo", "y = 3x/8 + 5/8", zip(["bar", "matches", "streak", "clean hits", "-|floor y(0)|"], drum(F(3, 8), F(5, 8))))
print("   y = 2x/5 + 3/5:", drum(F(2, 5), F(3, 5)), "  y = 3x/8 + 7/8:", drum(F(3, 8), F(7, 8)))

# ---------------------------------------------------------------- 7 Trick Shot (table [0,8] x [0,4])
def fold4(t):
    t = F(t) % 8; return t if t <= 4 else 8 - t
def shot(m, c, T=0, B=3):
    y0, y8 = c, 8 * m + c; lo, hi = min(y0, y8), max(y0, y8)
    ks = [k for k in range(floor(lo / 4) - 1, floor(hi / 4) + 2) if lo < 4 * k < hi]
    xs = [(4 * k - c) / m for k in ks] if m != 0 else []
    return fold4(y0), fold4(y8), -abs(fold4(y8) - T), -abs(len(ks) - B), sum(1 for x in xs if x.denominator == 1), -fold4(y0), sorted(xs)
show("7 Trick Shot (pocket 0, three cushions)", "y = 2x", zip(["start", "landing", "-miss", "-|bounces-3|", "whole bounces", "-start height", "bounce xs"], shot(F(2), F(0))))
print("   y = 3x/2 + 1:", [str(v) for v in shot(F(3, 2), F(1))[:6]], "  pocket 2, y = 7x/4:", [str(v) for v in shot(F(7, 4), F(0), T=2)[:6]])

# ---------------------------------------------------------------- 8 One Thread (loom of N pegs)
def loom(m, c, N):
    ends = [(m * n + c) % N for n in range(N)]
    seen, cur = [], F(0)
    while cur.denominator == 1 and cur not in seen:
        seen.append(cur); cur = (m * cur + c) % N
    reached = len({e for e in ends if e.denominator == 1})
    span = lambda n, e: min((e - n) % N, (n - e) % N)
    spans = {span(n, e) for n, e in enumerate(ends)}
    return len(seen), reached, len(spans), -(abs(m) + abs(c)), [int(s) for s in seen]
show("8 One Thread (N = 9)", "y = -2x + 1", zip(["tour", "reached", "thread lengths", "-(|m|+|c|)", "order"], loom(F(-2), F(1), 9)))
print("   y = 4x + 1:", loom(F(4), F(1), 9), "  y = x + 4:", loom(F(1), F(4), 9)[:4], "  y = 3x + 1:", loom(F(3), F(1), 9), "  y = x/2 + 1:", loom(F(1, 2), F(1), 9))
for N in (9, 12):
    tops = sorted(((loom(F(mm), F(cc), N)[:4], mm, cc) for mm in range(-13, 14) for cc in range(-13, 14)), reverse=True)[:4]
    print(f"   N = {N} best integer lines:", [(str(t[0][0]), t[0][1], t[0][2], str(t[0][3]), f"y={t[1]}x+{t[2]}") for t in tops])

# ---------------------------------------------------------------- 9 Homecoming Gear
def gearfam(m, c, T):
    sync = next((n for n in range(1, 61) if (m * n + c).denominator == 1), None)
    if sync is None: return None
    q = F(m).denominator; fm = m - floor(m)
    return sync, -abs(sync - T), -(q - sync), -abs(fm - F(1, 2)), -abs(m * sync + c), [str((m * n + c) % 1) for n in range(1, sync + 1)]
show("9 Homecoming Gear (T = 7)", "y = 3x/7 - 3", zip(["sync", "-|sync-7|", "-(period-sync)", "-|step-1/2|", "-|counter|", "pointer"], gearfam(F(3, 7), F(-3), 7)))
print("   y = x/9 + 2/9:", gearfam(F(1, 9), F(2, 9), 7)[:5], "  y = x/7:", [str(v) for v in gearfam(F(1, 7), F(0), 7)[:5]], "  y = x/2 + 1/3:", gearfam(F(1, 2), F(1, 3), 7))

# ---------------------------------------------------------------- 10 Crate Ramp (floor y = 0, columns 0..5)
def ramp(m, c, N):
    stacks = [max(0, floor(min(m * n + c, m * (n + 1) + c))) for n in range(6)]
    xs = sorted({F(0), F(6)} | ({-c / m} if m != 0 and 0 < -c / m < 6 else set()))
    area = sum((max(F(0), m * u + c) + max(F(0), m * v + c)) / 2 * (v - u) for u, v in zip(xs, xs[1:]))
    touch = sum(1 for x in range(7) if (y := m * x + c).denominator == 1 and y >= 0)
    return -abs(sum(stacks) - N), -(area - sum(stacks)), touch, len(set(stacks)), stacks
show("10 Crate Ramp (N = 10)", "y = x - 1", zip(["-|crates-10|", "-air", "touch", "different stacks", "stacks"], ramp(F(1), F(-1), 10)))
rs = []
for p in range(-40, 41):
    for q in range(1, 9):
        if gcd(abs(p), q) != 1: continue
        for k in range(-40 * q, 40 * q + 1):
            r = ramp(F(p, q), F(k, q), 10)
            if r[0] == 0: rs.append((r[:4], str(F(p, q)), str(F(k, q)), r[4]))
rs.sort(reverse=True)
print("   best N = 10 ramps:", [(str(r[0][1]), r[0][2], r[0][3], f"y={r[1]}x+{r[2]}", r[3]) for r in rs[:4]])
print("   y = 4x/5:", [str(v) for v in ramp(F(4, 5), F(0), 10)])

# ---------------------------------------------------------------- 11 Lamp and Rulers
def lamp(m, c, T):
    if m == 1: return None
    same = c / (1 - m); h = m / (m - 1)
    lands = {m * x + c for x in range(-5, 6) if (m * x + c).denominator == 1}
    return same, h, -abs(same - T), -near_int(h), len(lands), -abs(c)
show("11 Lamp and Rulers (T = 6)", "y = 2x - 6", zip(["same", "lamp height", "-|same-6|", "-height off whole", "whole landings", "-|y(0)|"], lamp(F(2), F(-6), 6)))
print("   y = 3x/2 - 3:", [str(v) for v in lamp(F(3, 2), F(-3), 6)], "  y = x/2 + 3:", [str(v) for v in lamp(F(1, 2), F(3), 6)],
      "  y = -x + 12:", [str(v) for v in lamp(F(-1), F(12), 6)])
print("   Celsius to Fahrenheit y = 9x/5 + 32 (T = -40):", [str(v) for v in lamp(F(9, 5), F(32), -40)])

# ---------------------------------------------------------------- 12 Exact Change
def change(a, b, N, W=3):
    ways = [(x, (N - a * x) // b) for x in range(0, N // a + 1) if (N - a * x) % b == 0] if N >= 0 else []
    single = sum(1 for x, y in ways if x == 0 or y == 0)
    even = int(any(x == y for x, y in ways))
    return -abs(len(ways) - W), -single, even, -N, ways
show("12 Exact Change (W = 3)", "3x + 4y = 35, i.e. y = -3x/4 + 35/4", zip(["-|ways-3|", "-single-coin ways", "even way", "-bill", "ways"], change(3, 4, 35)))
found = sorted(((change(a, b, N)[:4], a, b, N) for a in range(1, 13) for b in range(1, 13) if gcd(a, b) == 1 for N in range(1, 121)), reverse=True)[:3]
print("   best (a, b <= 12, N <= 120):", found)
print("   2x + 3y = 17:", change(2, 3, 17))

# ---------------------------------------------------------------- 13, 14 circle of radius 5
RIM = [(x, y) for x in range(-5, 6) for y in range(-5, 6) if x * x + y * y == 25]
def kiss(m, c):
    r2 = dist2_line(m, c); mid = foot(m, c)
    peg = min((mid[0] - p[0]) ** 2 + (mid[1] - p[1]) ** 2 for p in RIM)
    if m == 0 or c == 0: area = psum = None
    else:
        p, q = -c / m, c; area = abs(p * q) / 2; psum = p + q
    return -abs(r2 - 25), -peg, None if area is None else -area, psum, mid
show("13 Kiss the Circle", "3x + 4y = 25, i.e. y = -3x/4 + 25/4", zip(["-|reach2-25|", "-touch to peg", "-area", "p+q", "touch"], kiss(F(-3, 4), F(25, 4))))
print("   y = 5:", kiss(F(0), F(5))[:4], "  y = -20x/21 + 145/21:", [str(v) for v in kiss(F(-20, 21), F(145, 21))[:4]], "  y = -x + 7:", [str(v) for v in kiss(F(-1), F(7))[:4]])
def kite(m, c):
    a, b, c0 = gen(m, c); r2 = dist2_line(m, c)
    if c0 == 0 or r2 >= 25: return None
    pole = (F(-25 * a, c0), F(-25 * b, c0))
    off = near_int(pole[0]) ** 2 + near_int(pole[1]) ** 2
    rim = sum(1 for p in RIM if a * p[0] + b * p[1] + c0 == 0)
    k2 = pole[0] ** 2 + pole[1] ** 2 - 25
    area = None if m == 0 else abs(c * c / m) / 2
    return pole, -off, rim, -k2, None if area is None else -area
show("14 Tangent Kite", "x + y = 5, i.e. y = -x + 5", zip(["pole", "-pole off peg", "rim pegs", "-kite2", "-area"], kite(F(-1), F(5))))
rows = []
for P, Q in combinations(RIM, 2):
    if P[0] == Q[0]: continue
    mm = F(Q[1] - P[1], Q[0] - P[0]); cc = P[1] - mm * P[0]; k = kite(mm, cc)
    if k and k[1] == 0: rows.append((k[3], k[4], gen(mm, cc), k[0]))
rows.sort(key=lambda r: (r[0], r[1] if r[1] is not None else F(-10**6)), reverse=True)
print("   peg-to-peg chords with the pole on a peg (non-vertical):", len(rows))
for r in rows[:6]: print("     kite2 %s area %s  %sx + %sy + %s = 0  pole (%s, %s)" % (-r[0], None if r[1] is None else -r[1], *r[2], *r[3]))
print("   x + 2y = 5:", [str(v) for v in kite(F(-1, 2), F(5, 2))], "  7x + y = 25:", [str(v) for v in kite(F(-7), F(25))])

# ---------------------------------------------------------------- 15 Plumb Line
def squares_gap(q): r = isqrt(floor(q)); return min(abs(q - r * r), abs((r + 1) ** 2 - q))
def plumb(m, c):
    if c == 0: return None
    f = foot(m, c); off = near_int(f[0]) ** 2 + near_int(f[1]) ** 2
    whole = (1 if c.denominator == 1 else 0) + (1 if m != 0 and (-c / m).denominator == 1 else 0)
    d2 = f[0] ** 2 + f[1] ** 2
    return f, -off, whole, -squares_gap(d2), None if m == 0 else -abs(c * c / m) / 2
show("15 Plumb Line", "x + y = 2, i.e. y = -x + 2", zip(["foot", "-foot off peg", "whole intercepts", "-length2 off square", "-area"], plumb(F(-1), F(2))))
for mm, cc in ((F(-2), F(5)), (F(-2), F(10)), (F(0), F(3)), (F(-4, 3), F(100)), (F(-3, 4), F(25, 4))):
    print("   y = %sx + %s:" % (mm, cc), [str(v) for v in plumb(mm, cc)])

# ---------------------------------------------------------------- 16 Firefly Jar
def firefly(m, c, K=5, J=10):
    h = [F(0)]
    for _ in range(64):
        h.append(m * h[-1] + c)
        if abs(h[-1]) > J: break
    else: return None
    e = len(h) - 1; hops = h[1:]
    whole = sum(1 for v in hops[:K] if v.denominator == 1)
    zig = sum(1 for u, v in zip(hops[:K], hops[1:K]) if u * v < 0)
    return [str(v) for v in hops], -abs(e - K), whole, zig, -abs(hops[-1])
show("16 Firefly Jar (K = 5)", "y = -2x + 1", zip(["hops", "-|escape-5|", "whole hops", "zigzags", "-|last hop|"], firefly(F(-2), F(1))))
ff = []
for p in range(-30, 31):
    for q in range(1, 7):
        for k in range(-30, 31):
            r = firefly(F(p, q), F(k, q))
            if r and r[1] == 0: ff.append((r[1:], str(F(p, q)), str(F(k, q))))
ff.sort(reverse=True)
print("   best (m = p/q, c = k/q, |p|,|k| <= 30, q <= 6):", [(tuple(map(str, f[0])), f"y={f[1]}x+{f[2]}") for f in ff[:3]])
print("   y = x + 11/5:", firefly(F(1), F(11, 5)), "  y = 2x + 1:", firefly(F(2), F(1)))

# ---------------------------------------------------------------- 17 Prime Threads
SIX = [2, 3, 5, 7, 11, 13]
def threads(m, c):
    outs = [m * p + c for p in SIX]
    good = len({o for p, o in zip(SIX, outs) if is_prime(o) and o != p})   # different primes, none left where it was
    extra = sum(1 for x in range(1, 14) if is_prime(m * x + c))
    return good, -max(outs), extra, -abs(c), [str(o) for o in outs]
show("17 Prime Threads", "y = 6x + 1", zip(["prime landings", "-largest", "primes from 1..13", "-|c|", "outputs"], threads(F(6), F(1))))
pt = sorted(((threads(F(mm), F(cc))[:4], mm, cc) for mm in range(-60, 61) for cc in range(-400, 401)), reverse=True)[:3]
print("   best integer lines |m| <= 60, |c| <= 400:", [(tuple(map(str, t[0])), f"y={t[1]}x+{t[2]}") for t in pt])
print("   y = 2x + 1:", threads(F(2), F(1)), "  y = x:", threads(F(1), F(0))[:2], "  y = 17:", threads(F(0), F(17))[:2])

# ---------------------------------------------------------------- 18 Cipher Wheel
def cipher(m, c, plain, target):
    E = lambda k: (m * k + c) % 26
    enc = [E(ord(ch) - 65) for ch in plain]
    out = "".join(chr(65 + int(e)) if e.denominator == 1 else "?" for e in enc)
    right = sum(1 for a, b in zip(out, target) if a == b)
    letters = len({E(k) for k in range(26) if E(k).denominator == 1})
    undo = sum(1 for k in range(26) if E(k).denominator == 1 and E(E(k)) == k)
    return out, right, letters, undo, -(abs(m) + abs(c))
show("18 Cipher Wheel (GIRL -> TRIO)", "y = -x - 1", zip(["writes", "right letters", "letters used", "self-undo", "-(|m|+|c|)"], cipher(F(-1), F(-1), "GIRL", "TRIO")))
for pl, tg in (("GIRL", "TRIO"), ("HOLY", "SLOB"), ("WIZARD", "DRAZIW"), ("COLD", "FROG"), ("HAL", "IBM")):
    tops = sorted(((cipher(F(mm), F(cc), pl, tg)[1:], mm, cc) for mm in range(-13, 14) for cc in range(-13, 14)), reverse=True)[:1]
    print(f"   {pl} -> {tg}: best", [(t[0][0], t[0][1], t[0][2], str(t[0][3]), f"y={t[1]}x+{t[2]}") for t in tops])
print("   y = 25x + 25 on GIRL:", cipher(F(25), F(25), "GIRL", "TRIO"), "  y = 2x + 7 letters used:", cipher(F(2), F(7), "GIRL", "TRIO")[2])

# ---------------------------------------------------------------- 19 Sweet Chord
def ratio(notes):
    d = 1
    for n in notes: d = d * n.denominator // gcd(d, n.denominator)
    ints = [int(n * d) for n in notes]; g = 0
    for i in ints: g = gcd(g, i)
    return [i // g for i in ints]
def chord(m, c, I=F(3, 2)):
    n = [F(1)]
    for _ in range(3): n.append(m * n[-1] + c)
    climbs = int(n[2] > n[1]) + int(n[3] > n[2])
    return ":".join(map(str, ratio(n[:3]))), ":".join(map(str, ratio(n))), -abs(n[1] - I), climbs, -sum(ratio(n[:3])), -sum(ratio(n))
show("19 Sweet Chord (fifth)", "y = x + 1/2", zip(["chord", "four notes", "-|note1 - 3/2|", "climbs", "-rough3", "-rough4"], chord(F(1), F(1, 2))))
print("   y = 3x/2:", chord(F(3, 2), F(0)), "  y = 2x - 1/2:", chord(F(2), F(-1, 2)), "  major third y = x + 1/4:", chord(F(1), F(1, 4), F(5, 4)),
      "  minor y = 3x/2 - 3/10:", chord(F(3, 2), F(-3, 10), F(6, 5)))
sc = sorted(((chord(F(p, q), F(3, 2) - F(p, q))[2:], str(F(p, q))) for p in range(-24, 49) for q in range(1, 13)), reverse=True)[:3]
print("   best lines with note 1 a fifth (m = p/q, q <= 12):", [(tuple(map(str, s[0])), "m=" + s[1]) for s in sc])
