#!/usr/bin/env python3
"""Graded two-rung rules for ../d-number-theory.md section 6 (the owner's rules of 14 November).

A dealt rule is ONE graded primary plus ONE graded secondary (never a third component, never a yes/no).  For ten
families this script takes the primary and each alternative secondary, scores every line of

    the box |a|, |b|, |c| <= 64   and   every whole line y = mx + c with |m|, |c| <= 600,

and prints, for the primary alone and for each (primary, secondary) pair: the number of attainable levels among lines
of height <= 16, 32 and 64, the value V = -log2 pi(score >= level) of the best level enumerated, and the median and
largest number of bits between adjacent levels.  pi is 2^-(read length) / Z as in d_number_theory_ladders.py.

Standard library only, deterministic, about four minutes:   python3 d_graded_two_rung.py [family-key]
"""
import sys
from bisect import bisect_left
from fractions import Fraction as Fr
from math import gcd, isqrt, log2

import d_number_theory_ladders as d

is_prime, tau, rad, aliquot, cf = d.is_prime, d.tau, d.rad, d.aliquot, d.cf
WORST = -10 ** 9          # an undefined secondary sorts below every defined one

POWERS = sorted({k ** e for k in range(2, 3200) for e in range(2, 24) if k ** e < 10 ** 7} | {1})

def dist_whole(x):        # distance from x >= 0 to the nearest whole number >= 1
    n = max(1, int(x + Fr(1, 2)))
    return abs(x - n), n

def dist_prime(x):        # distance from a rational to the nearest prime
    n = max(2, int(x))
    lo = n
    while not is_prime(lo):
        lo -= 1
        if lo < 2:
            lo = None
            break
    hi = n + 1 if lo is not None else 2
    while not is_prime(hi):
        hi += 1
    cands = [abs(x - p) for p in (lo, hi) if p is not None]
    return min(cands)

def dist_square(x):       # distance from a rational >= 0 to the nearest square number
    r = isqrt(int(x))
    return min(abs(x - r * r), abs(x - (r + 1) ** 2)), (r if abs(x - r * r) <= abs(x - (r + 1) ** 2) else r + 1)

def dist_power(n):
    i = bisect_left(POWERS, n)
    return min(abs(n - POWERS[j]) for j in (i - 1, i) if 0 <= j < len(POWERS))

def slope(a, b):
    g = gcd(a, b)
    return -a // g, b // g

def icpt(b, c):
    g = gcd(abs(c), b)
    return -c // g, b // g

# ---- each family: f(a, b, c) -> None or (primary, [secondaries]); every value is a number, bigger is better
def parade(a, b, c):
    sc = d.s_parade(a, b, c)
    if sc is None:
        return None
    R, B, tw, _ = sc
    m = -a if b == 1 else 0
    c0 = -c // b
    terms = [c0 + m * n for n in range(R)]
    return R, [B, tw, terms[-1], -dist_prime(Fr(sum(terms)))]
parade.sec = ["primes going backwards (count)", "primes of the run with a twin (count)", "last prime of the run (size)",
              "sum of the run: distance to the nearest prime"]

def divis(a, b, c):
    if b != 1 or c == 0:
        return None
    m, c0 = -a, -c
    K = 1
    while c0 % (K + 1) == 0:
        K += 1
    qs = [abs(m + c0 // n) for n in range(1, K + 1)]
    xi = -dist_whole(abs(Fr(c0, m)))[0] if m else WORST
    return K, [sum(1 for q in qs if is_prime(q)), xi, tau(abs(c0)), -dist_prime(Fr(abs(m)))]
divis.sec = ["prime quotients y(n)/n (count)", "x-intercept: distance to the nearest whole number",
             "factors of the y-intercept (count)", "gradient: distance to the nearest prime"]

def squares(a, b, c):
    if b == 0:
        return None
    hits = []
    for n in range(13):
        num = -(a * n + c)
        if num >= 0 and num % b == 0 and d.is_square(num // b):
            hits.append((n, num // b))
        if a == 0:
            break
    if not hits:
        return None
    pos = {n for n, _ in hits}
    row = max(k for n in pos for k in (1, 2, 3, 4) if all(n + j in pos for j in range(k)))
    g = 0
    for _, v in hits:
        g = gcd(g, v)
    return len(hits), [row, sum(1 for _, v in hits if is_prime(isqrt(v))), max(v for _, v in hits), -g]
squares.sec = ["squares in neighbouring columns (longest run)", "squares with a prime root (count)",
               "largest square in the table (size)", "common factor of the squares (smallest)"]

def corner(a, b, c):
    if a == 0 or b == 0 or c == 0:
        return None
    X, Y = Fr(abs(c), abs(a)), Fr(abs(c), b)
    dx, xn = dist_whole(X)
    dy, yn = dist_whole(Y)
    return -(dx + dy), [tau(xn * yn), -gcd(xn, yn), -dist_square(X * Y / 2)[0], -dist_square(X * X + Y * Y)[0]]
corner.sec = ["factors of (nearest whole legs multiplied) (count)", "common factor of the nearest whole legs (smallest)",
              "triangle area: distance to the nearest square number",
              "hypotenuse squared: distance to the nearest square number"]

def pyth(a, b, c):
    if a == 0 or b == 0 or c == 0:
        return None
    X, Y = Fr(abs(c), abs(a)), Fr(abs(c), b)
    h2 = X * X + Y * Y
    dh, root = dist_square(h2)
    return -dh, [-(dist_whole(X)[0] + dist_whole(Y)[0]), root, -dist_prime(Fr(root)), -dist_whole(X * Y / 2)[0]]
pyth.sec = ["the two legs: total distance to whole numbers", "the nearest whole hypotenuse (size)",
            "the nearest whole hypotenuse: distance to a prime", "area: distance to the nearest whole number"]

def stair(a, b, c):
    if a == 0 or b == 0:
        return None
    M, D = slope(a, b)
    big, small = max(abs(M), D), min(abs(M), D)
    qs = cf(big, small)
    K = len(qs)
    r, s = icpt(b, c)
    return K, [sum(1 for i in range(K) if qs[i] == qs[K - 1 - i]), -dist_prime(Fr(big)), sum(qs),
               -abs(abs(M * s - D * r) - 1)]
stair.sec = ["cut sizes that match their mirror position (count)", "larger of rise and run: distance to a prime",
             "squares cut in total (count)", "cross-difference of gradient and y-intercept: distance to 1"]

def digits2(M, D):
    if not (D <= M < 2 * D):
        return 0
    G, k = 1, 1
    while (M * 10 ** k) // D == d.ROOT2[k]:
        G += 1; k += 1
    return G

def root(a, b, c):
    if b == 0 or a >= 0:
        return None
    M, D = slope(a, b)
    G = digits2(M, D)
    if G == 0:
        return None
    r, s = icpt(b, c)
    return G, [-abs(M * M - 2 * D * D), -D, digits2(r, s), -abs(abs(M * s - D * r) - 1)]
root.sec = ["top squared against twice bottom squared (difference)", "denominator of the gradient (smallest)",
            "digits of the y-intercept that also agree with root 2 (count)",
            "cross-difference of gradient and y-intercept: distance to 1"]

def period(D):
    while D % 2 == 0:
        D //= 2
    while D % 5 == 0:
        D //= 5
    return 0 if D == 1 else d.ord10(D)

def decimal(a, b, c):
    if b == 0 or a == 0:
        return None
    M, D = slope(a, b)
    L = period(D)
    if L == 0:
        return None
    r, s = icpt(b, c)
    y1 = Fr(M, D) + Fr(r, s)
    return L, [-D, period(s), -abs(y1 - round(y1)), -abs(M)]
decimal.sec = ["denominator of the gradient (smallest)", "repeating block of the y-intercept (length)",
               "y(1): distance to the nearest whole number", "numerator of the gradient (smallest)"]

def amic(a, b, c):
    if b != 1:
        return None
    m, c0 = -a, -c
    if m < 2 or c0 < 2:
        return None
    P = abs(aliquot(m) - c0) + abs(aliquot(c0) - m)
    return -P, [min(m, c0), abs(m - c0), -(tau(m) + tau(c0)), -(dist_prime(Fr(m)) + dist_prime(Fr(c0)))]
amic.sec = ["the smaller of the two numbers (size)", "difference of the two numbers (size)",
            "factors of the two numbers in total (fewest)", "the two numbers: total distance to primes"]

def abc(a, b, c):
    if a <= 0 or b <= 0 or c >= 0:
        return None
    C = -c
    return -abs(a + b - C), [Fr(C, rad(a) * rad(b) * rad(C)), -(dist_power(a) + dist_power(b) + dist_power(C)), C,
                             -len(set(p for n in (a, b, C) for p, _ in d.factor(n)))]
abc.sec = ["c divided by the product of the different primes in a, b, c (size)",
           "a, b, c: total distance to perfect powers", "c (size)", "different primes in a, b, c (fewest)"]

FAMS = [("parade", "Prime Parade", "primes in a row from y(0) (count)", parade),
        ("div", "Divisibility Ladder", "n = 1, 2, 3, ... with y(n) a multiple of n (count)", divis),
        ("squares", "Square Steps", "square numbers among y(0)..y(12) (count)", squares),
        ("corner", "Whole Corner", "the two intercept distances: total distance to whole numbers", corner),
        ("pyth", "Pythagoras' Corner", "hypotenuse squared: distance to the nearest square number", pyth),
        ("stair", "Euclid's Staircase", "square sizes cut from the rise-by-run rectangle (count)", stair),
        ("root", "Root Hunter", "leading digits of the gradient agreeing with root 2 (count)", root),
        ("dec", "Cyclic Decimal", "repeating block of the gradient (length)", decimal),
        ("amic", "Amicable Line", "factor sums of m and c against each other (total difference)", amic),
        ("abc", "ABC Line", "a + b against c (difference)", abc)]

def lines(H, G):
    for a in range(-H, H + 1):
        for b in range(0, H + 1):
            if b == 0 and a <= 0:
                continue
            g = gcd(abs(a), b)
            for c in range(-H, H + 1):
                if g == 1 or gcd(g, abs(c)) == 1:
                    yield a, b, c, max(abs(a), b, abs(c))
    for m in range(-G, G + 1):
        for c in range(-G, G + 1):
            if max(abs(m), abs(c)) > H:
                yield -m, 1, -c, max(abs(m), abs(c))

def ladder(rows, key):
    """rows: (weight, height, score...).  Returns levels at heights 16/32/64, all levels, top V, median and max step."""
    acc = {}
    seen = {16: set(), 32: set(), 64: set()}
    for r in rows:
        k = key(r)
        acc[k] = acc.get(k, 0.0) + r[0]
        for h in seen:
            if r[1] <= h:
                seen[h].add(k)
    ks = sorted(acc, reverse=True)
    V, cum = [], 0.0
    for k in ks:
        cum += acc[k]
        V.append(-log2(cum / Z))
    V.reverse()                                  # ascending in value
    steps = sorted(V[i + 1] - V[i] for i in range(len(V) - 1))
    return (len(seen[16]), len(seen[32]), len(seen[64]), len(ks), V[-1],
            steps[len(steps) // 2] if steps else 0.0, steps[-1] if steps else 0.0, ks[0])

def main():
    global Z
    only = sys.argv[1] if len(sys.argv) > 1 else None
    d.build_tables(700)
    Z = sum(2.0 ** -d.phi(a, b, c) for a, b, c, h in lines(64, 0))
    print(f"Z = {Z:.5f}; lines: box 64 and whole lines to 600")
    for key, name, pcard, f in FAMS:
        if only not in (None, key):
            continue
        rows = []
        for a, b, c, h in lines(64, 600):
            r = f(a, b, c)
            if r is not None:
                rows.append((2.0 ** -d.phi(a, b, c), h, r[0], r[1]))
        p = ladder(rows, lambda r: r[2])
        print(f"\n== {name}: primary = {pcard}")
        print("   rule                                                              levels at H=16/32/64   all   top V   median step  largest step   best score")
        print(f"   {'primary alone':<64} {p[0]:>6}/{p[1]}/{p[2]:<8} {p[3]:>6}  {p[4]:6.1f}  {p[5]:10.2f}  {p[6]:12.2f}   {p[7]}")
        for j, sname in enumerate(f.sec):
            q = ladder(rows, lambda r: (r[2], r[3][j]))
            print(f"   + {sname:<62} {q[0]:>6}/{q[1]}/{q[2]:<8} {q[3]:>6}  {q[4]:6.1f}  {q[5]:10.2f}  {q[6]:12.2f}   ({q[7][0]}, {q[7][1]})")

if __name__ == "__main__":
    main()
