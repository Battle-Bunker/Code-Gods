#!/usr/bin/env python3
"""Arithmetic check for docs/engine-v2/rule-brainstorm/b-story-lenses.md.

Exact (fractions.Fraction) evaluation of the sixteen story-lens families on the
document's example lines, plus a crude census over small lines: every
non-vertical primitive line a*x + b*y + c0 = 0 with |a|, |c0| <= BOUND and
1 <= b <= BOUND, weighted by 2^-phi (phi = the spec's Q read length), to say
where each family's best lines sit relative to the cheap centre. The census is a
sketch, not the calibration of spec section 7.

Run:  python3 docs/engine-v2/rule-brainstorm/scripts/b_story_lenses.py [--census]
"""
from fractions import Fraction as F
from math import gcd, floor, isqrt, log2
import sys

# ---------------------------------------------------------------- helpers
LADDER = [F(8), F(4), F(2), F(1), F(1, 2), F(1, 4), F(1, 8), F(0)]


WIDE = [F(32), F(16), F(8), F(4), F(2), F(1), F(1, 2), F(0)]


def rung(d, ladder=LADDER):
    """Rung index on the spec's Q distance ladder: 0 (d > 8) .. 8 (d = 0)."""
    return sum(1 for t in ladder if d <= t)


def dZ(x):
    return abs(x - floor(x + F(1, 2)))


def near_pos_int(x):
    """Nearest positive integer, ties to the smaller."""
    if x < 1:
        return 1
    n = floor(x)
    return n + 1 if x - n > F(1, 2) else n


def near_int(x):
    """Nearest integer, ties to the one nearer zero."""
    n = floor(x)
    fr = x - n
    if fr > F(1, 2):
        return n + 1
    if fr < F(1, 2):
        return n
    return n if abs(n) < abs(n + 1) else n + 1


def is_prime(n):
    if n < 2:
        return False
    i = 2
    while i * i <= n:
        if n % i == 0:
            return False
        i += 1
    return True


def d_prime(x):
    """Distance from rational x to the nearest prime (primes are >= 2)."""
    if x <= 2:
        return F(2) - x
    n = floor(x)
    lo = n
    while not is_prime(lo):
        lo -= 1
    hi = n + 1
    while not is_prime(hi):
        hi += 1
    return min(x - lo, hi - x)


def d_sq(x):
    if x <= 0:
        return -x
    r = isqrt(floor(x))
    return min(abs(x - r * r), abs(x - (r + 1) ** 2))


def d_tri(x):
    """Distance to the nearest positive triangular number (1, 3, 6, ...)."""
    if x <= 1:
        return 1 - x
    k = 0
    while (k + 1) * (k + 2) // 2 <= x:
        k += 1
    return min(abs(x - k * (k + 1) // 2), abs(x - (k + 1) * (k + 2) // 2))


def spf(n):
    if n < 2:
        return 1
    i = 2
    while i * i <= n:
        if n % i == 0:
            return i
        i += 1
    return n


def tau(n):
    n = abs(n)
    return sum(1 for i in range(1, n + 1) if n % i == 0) if n else 0


def big_omega(n):
    n, k, i = abs(n), 0, 2
    if n < 2:
        return 0
    while i * i <= n:
        while n % i == 0:
            n //= i
            k += 1
        i += 1
    return k + (1 if n > 1 else 0)


def is_square_int(v):
    return v.denominator == 1 and v >= 0 and isqrt(v.numerator) ** 2 == v.numerator


# ---------------------------------------------------------------- the line
def triple(m, c):
    """Primitive (a, b, c0) of a*x + b*y + c0 = 0 for y = m*x + c, b > 0."""
    b = m.denominator * c.denominator // gcd(m.denominator, c.denominator)
    a, c0 = -m * b, -c * b
    a, c0 = int(a), int(c0)
    g = gcd(gcd(abs(a), b), abs(c0))
    return a // g, b // g, c0 // g


def int_bits(n):
    z = 2 * n if n >= 0 else -2 * n - 1
    return 2 * floor(log2(z + 1)) + 1


def phi(m, c):
    a, b, c0 = triple(m, c)
    return int_bits(a) + int_bits(b) + int_bits(c0)


def show(m, c):
    def q(v):
        return str(v) if v.denominator == 1 else f"{v.numerator}/{v.denominator}"
    s = "y = "
    s += "" if m == 0 else ("x" if m == 1 else "-x" if m == -1 else f"{q(m)}x")
    if c != 0 or m == 0:
        s += (" + " if c >= 0 and m != 0 else (" - " if m != 0 else "")) + q(abs(c) if m != 0 else c)
    return s


WORST = None


def D(label, value, ladder=LADDER):
    return (label, value, rung(value, ladder))          # a distance component, scored by its rung


def N(label, value, score=None):
    return (label, value, value if score is None else score)   # a count or size, scored as is


# ---------------------------------------------------------------- families
def empty_tank(m, c):
    if not (m < 0 and c > 0):
        return WORST, "not a full tank draining"
    t = -c / m
    n = near_pos_int(t)
    return [D("|T - N| (empty at a whole minute)", abs(t - n)),
            N(f"spf(N), N = {n} (capped at 13)", spf(n), min(spf(n), 13)),
            N("den(m) (whole litres a minute; smaller better)", m.denominator, -m.denominator),
            D("dist(c, square) (start volume square)", d_sq(c))], f"T = {t}"


def taxi(m, c, K=5):
    y = m * K + c
    f = near_pos_int(y)
    return [D(f"dist(y({K}), whole)", dZ(y)),
            D("dist(c, whole) (whole pick-up charge)", dZ(c)),
            N(f"tau(F), F = {f} (capped at 12)", tau(f), min(tau(f), 12)),
            N("den(m) (whole pounds a km; smaller better)", m.denominator, -m.denominator)], f"y({K}) = {y}"


def catch_up(m, c, r=4):
    if m == r:
        return WORST, "parallel: they never meet"
    t = c / (r - m)
    n = near_pos_int(t)
    ystar = r * t
    return [D("|t - N| (catch up at a whole hour)", abs(t - n)),
            N("a real chase (c < 0 and m > r)", int(c < 0 and m > r)),
            N("den(m) (smaller better)", m.denominator, -m.denominator),
            N(f"tau(meeting km {near_pos_int(ystar)}) (capped at 12)", tau(near_pos_int(ystar)), min(tau(near_pos_int(ystar)), 12))], f"t = {t}, km = {ystar}"


def same_reading(m, c):
    if m <= 0 or m == 1:
        return WORST, "not a thermometer scale (m must be positive and not 1)"
    f = c / (1 - m)
    n = near_int(f)
    h = abs(m.numerator) + m.denominator
    return [D("dist(agreeing reading, whole)", dZ(f)),
            N(f"Omega(|{n}|) (capped at 6)", big_omega(n), min(big_omega(n), 6)),
            N("height |num m| + den m (smaller better)", h, -h),
            N("agree below zero", int(f < 0))], f"agree at {f}"


def matchsticks(m, c):
    d2 = dZ(m) if m >= 2 else 2 - m
    return [D("|c - 1| (pattern 0 is one stick)", abs(c - 1)),
            D("dist(m, whole >= 2)", d2),
            D("dist(m + 1, prime) (prime-sided shapes)", d_prime(m + 1)),
            D("dist(y(10), prime)", d_prime(10 * m + c))], f"y(10) = {10 * m + c}"


def shopping(m, c):
    a, b, c0 = triple(m, c)
    if not (a > 0 and c0 < 0):
        return WORST, "a price or the budget is not positive"
    C = -c0
    count = sum(1 for x in range(1, C // a + 1) if (C - a * x) > 0 and (C - a * x) % b == 0)
    return [N("some basket exists (x, y >= 1)", int(count > 0)),
            D("dist(A, prime) + dist(B, prime)", d_prime(F(a)) + d_prime(F(b))),
            D("dist(C/(A+B), whole) (an equal basket)", dZ(F(C, a + b))),
            N("number of baskets", count)], f"{a}x + {b}y = {C}"


def fence(m, c):
    if m == 0 or c == 0:
        return WORST, "an intercept is missing"
    p, q = -c / m, c
    if p <= 0 or q <= 0:
        return WORST, "a painter would need negative time"
    t = p * q / (p + q)
    n = near_pos_int(t)
    return [D("|t - N| (finish together at a whole hour)", abs(t - n)),
            D("dist(p, whole) + dist(q, whole)", dZ(p) + dZ(q)),
            N("the painters differ (p != q)", int(p != q)),
            D(f"dist(N = {n}, prime)", d_prime(F(n)))], f"p = {p}, q = {q}, t = {t}"


def ladder(m, c):
    if m == 0 or c == 0:
        return WORST, "no triangle"
    lx, ly = abs(c / m), abs(c)
    h2 = lx * lx + ly * ly
    root = isqrt(floor(h2))
    L = root if abs(h2 - root * root) <= abs(h2 - (root + 1) ** 2) else root + 1
    return [D("dist(foot, whole) + dist(top, whole)", dZ(lx) + dZ(ly)),
            D("dist(length^2, square)", d_sq(h2)),
            D("| |m| - 4 | (the 1-in-4 safety rule)", abs(abs(m) - 4)),
            N(f"Omega(L = {L}) (capped at 6)", big_omega(L), min(big_omega(L), 6))], f"legs {lx}, {ly}, length^2 {h2}"


def plant(m, c):
    ys = [m * x + c for x in range(6)]
    whole = sum(1 for v in ys if v.denominator == 1)
    squares = len({v for v in ys if is_square_int(v)})
    doubling = sum(1 for i in range(6) for j in range(i + 1, 6) if ys[i] > 0 and ys[j] == 2 * ys[i])
    primes = len({v for v in ys if v.denominator == 1 and is_prime(v.numerator)})
    return [N("whole heights among y0..y5", whole),
            N("square heights", squares),
            N("doubling pairs y(j) = 2y(i)", doubling),
            N("prime heights", primes)], "heights " + ", ".join(str(v) for v in ys)


def speeding(m, c, K=3):
    d = c * K + m * K * K / 2
    if not (c >= 0 and m * K + c >= 0 and d > 0):
        return WORST, "the car does not move forwards"
    return [D(f"dist(distance in {K} s, whole)", dZ(d)),
            D("dist(average speed, whole)", dZ(d / K)),
            D("dist(distance, triangular)", d_tri(d)),
            D("|c| (start from rest)", abs(c))], f"distance {d}"


def doubling(m, c):
    errs = sorted(abs(m * n + c - 2 ** n) for n in range(1, 9))
    above = sum(1 for n in range(1, 9) if m * n + c > 2 ** n)
    return [D("nearest week's gap |y(n) - 2^n|", errs[0]),
            D("second week's gap", errs[1]),
            D("dist(m, whole)", dZ(m)),
            N("weeks the steady plan pays more", above)], ""


def ramp(m, c):
    if m == 0:
        return WORST, "flat: no ramp"
    n = 1 / abs(m)
    k = near_pos_int(n)
    return [D("|n - N| (1 up per whole number along)", abs(n - k)),
            D("max(0, 12 - n) (gentle enough)", max(F(0), 12 - n)),
            D("dist(start of ramp, whole metre)", dZ(-c / m)),
            N(f"tau(N = {k}) (capped at 12)", tau(k), min(tau(k), 12))], f"1 in {n}"


def orchard(m, c):
    if m == 0:
        return WORST, "a path along a row is a road, not a walk"
    miss = min(dZ(m * x + c) for x in range(-6, 7))
    pegs = sum(1 for x in range(-6, 7) if (m * x + c).denominator == 1 and abs(m * x + c) <= 6)
    p, q = m.numerator, m.denominator
    edge = dZ(c) + dZ(-c / m)
    return [D("closest miss of a tree, x in -6..6", miss),
            D("dist(p^2 + q^2, square) (trees a whole distance apart)", d_sq(F(p * p + q * q))),
            N("trees on the path in the 13 x 13 orchard", pegs),
            D("dist(c, whole) + dist(x-intercept, whole)", edge)], ""


COINS = [F(1, 100), F(2, 100), F(5, 100), F(1, 10), F(1, 5), F(1, 2), F(1), F(2)]


def savings(m, c, T=100):
    if m == 0:
        return WORST, "never reaches the goal"
    w = (T - c) / m
    n = near_pos_int(w)
    return [D(f"|W - N| (reach {T} in whole weeks)", abs(w - n)),
            D("dist(100m, coin in pence)", min(abs(100 * m - 100 * k) for k in COINS)),
            D(f"dist(N/4, whole) (N = {n}; ends a 4-week month)", dZ(F(n, 4))),
            D("dist(100c, coin in pence)", min(abs(100 * c - 100 * k) for k in COINS))], f"W = {w}"


def shortcut(m, c):
    e = max(abs(c - 32), abs(30 * m + c - 86))
    if m == F(9, 5):
        cross = F(0) if c == 32 else F(30)
    else:
        x0 = (32 - c) / (m - F(9, 5))
        cross = F(0) if (x0.denominator == 1 and 0 <= x0 <= 30) else (
            -x0 if x0 < 0 else x0 - 30 if x0 > 30 else dZ(x0))
    return [D("worst error on 0..30 C (wide ladder)", e, WIDE),
            D("dist(2m, whole) (m whole or a half)", dZ(2 * m)),
            D("dist(c/10, whole) (add a round ten)", dZ(c / 10)),
            D("dist(exactly-right reading, whole in 0..30)", cross)], f"error at 0: {c - 32}, at 30: {30 * m + c - 86}"


def per_minute(m, c, K=10):
    if not (m > 0 and c >= 0):
        return WORST, "not a price plan"
    return [D(f"dist(y({K})/{K}, whole)", dZ((m * K + c) / K)),
            N("connection fee c > 0", int(c > 0)),
            D(f"dist(y({2 * K})/{2 * K}, whole)", dZ((m * 2 * K + c) / (2 * K))),
            N("whole averages for 1..10 minutes", sum(1 for x in range(1, 11) if ((m * x + c) / x).denominator == 1))], ""


FAMILIES = [
    ("Empty Tank", empty_tank, [(F(-7), F(49)), (F(-3), F(21)), (F(-13), F(169)), (F(-3, 4), F(5, 2)), (F(2), F(-6))]),
    ("Taxi Meter (K = 5)", taxi, [(F(2), F(14)), (F(2), F(2)), (F(1, 3), F(1, 2))]),
    ("Catch-Up (r = 4)", catch_up, [(F(6), F(-6)), (F(5), F(-3)), (F(1, 2), F(1, 3))]),
    ("Same Reading", same_reading, [(F(2), F(40)), (F(9, 5), F(32)), (F(1, 2), F(1, 3)), (F(2), F(16)), (F(3), F(-1))]),
    ("Matchstick Chains", matchsticks, [(F(6), F(1)), (F(3), F(1)), (F(1, 2), F(5))]),
    ("Shopping Baskets", shopping, [(F(-2, 3), F(25, 3)), (F(-2, 3), F(5)), (F(-1), F(5)), (F(-2, 3), F(1, 3))]),
    ("Fence Painters", fence, [(F(-2), F(6)), (F(-1), F(4)), (F(-3, 4), F(5, 2))]),
    ("Ladder Against the Wall", ladder, [(F(-4, 3), F(4)), (F(-40, 9), F(40)), (F(-1), F(3)), (F(-63, 16), F(63)), (F(-2, 5), F(7, 3))]),
    ("Plant Diary", plant, [(F(24), F(1)), (F(1), F(1)), (F(1, 3), F(1, 2))]),
    ("Speeding Up (K = 3)", speeding, [(F(2, 3), F(0)), (F(1), F(1)), (F(1, 3), F(1, 5))]),
    ("Steady vs Doubling", doubling, [(F(42), F(-80)), (F(2), F(0)), (F(1, 2), F(7))]),
    ("Wheelchair Ramp", ramp, [(F(1, 12), F(-1, 2)), (F(1, 60), F(-1)), (F(3), F(1))]),
    ("Orchard Walk", orchard, [(F(3, 4), F(0)), (F(1), F(0)), (F(2, 7), F(1, 3))]),
    ("Savings Goal (T = 100)", savings, [(F(1, 2), F(2)), (F(2), F(4)), (F(3), F(1, 3))]),
    ("Mental Shortcut", shortcut, [(F(2), F(30)), (F(9, 5), F(32)), (F(2), F(28)), (F(1), F(50))]),
    ("Price per Minute (K = 10)", per_minute, [(F(3), F(20)), (F(2), F(0)), (F(1, 3), F(7, 2))]),
]


def evaluate(fn, m, c):
    comps, note = fn(m, c)
    if comps is WORST:
        return None, note, None
    return [s for _, _, s in comps], note, comps


def fmt(v):
    if isinstance(v, F):
        return str(v) if v.denominator == 1 else f"{v.numerator}/{v.denominator}"
    return str(v)


def examples():
    for name, fn, lines in FAMILIES:
        print(f"## {name}")
        for m, c in lines:
            score, note, comps = evaluate(fn, m, c)
            print(f"  {show(m, c)}   phi = {phi(m, c)}   {note}")
            if score is None:
                print("    WORST")
                continue
            for label, value, s in comps:
                print(f"    {label}: {fmt(value)} -> {s}")
            print(f"    score {score}")
        print()


def census(bound=16):
    lines = []
    for a in range(-bound, bound + 1):
        for b in range(1, bound + 1):
            for c0 in range(-bound, bound + 1):
                if gcd(gcd(abs(a), b), abs(c0)) != 1:
                    continue
                m, c = F(-a, b), F(-c0, b)
                lines.append((m, c, phi(m, c)))
    total = sum(2.0 ** -p for _, _, p in lines)
    print(f"census: {len(lines)} lines, |a|,|c0| <= {bound}, 1 <= b <= {bound}; weights 2^-phi\n")
    for name, fn, _ in FAMILIES:
        rows = []
        for m, c, p in lines:
            score, _, _ = evaluate(fn, m, c)
            if score is not None:
                rows.append((score, p, m, c))
        top_primary = max(r[0][0] for r in rows)
        prim = [r for r in rows if r[0][0] == top_primary]
        wp = sum(2.0 ** -r[1] for r in prim)
        best = max(r[0] for r in rows)
        bests = [r for r in rows if r[0] == best]
        wb = sum(2.0 ** -r[1] for r in bests)
        cheapest_p = min(prim, key=lambda r: r[1])
        cheapest_b = min(bests, key=lambda r: r[1])
        defined = sum(2.0 ** -r[1] for r in rows) / total
        print(f"{name}: defined on {defined:.0%} of the weight")
        print(f"  primary top {top_primary}: {len(prim)} lines, ~{-log2(wp / total):.1f} bits; cheapest {show(cheapest_p[2], cheapest_p[3])} (phi {cheapest_p[1]})")
        print(f"  best tuple {best}: {len(bests)} lines, ~{-log2(wb / total):.1f} bits; cheapest {show(cheapest_b[2], cheapest_b[3])} (phi {cheapest_b[1]})")


if __name__ == "__main__":
    examples()
    if "--census" in sys.argv:
        census()
