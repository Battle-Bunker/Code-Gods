#!/usr/bin/env python3
"""Verify the families and intersections of docs/engine-v2/rule-brainstorm/c-negotiation.md.

Standalone (no engine): exact rationals, the line-q read length and price list of spec §2.3, §12.2, §12.4.

    python3 -I docs/engine-v2/rule-brainstorm/scripts/negotiation_families.py [section ...]

Sections: families, pairs, triples, claims, negotiations, attacks (default: all).
"""
from __future__ import annotations

import itertools
import math
import sys
from fractions import Fraction as Q

# ---------------------------------------------------------------- number theory

SIEVE_N = 200_000
_sieve = bytearray([1]) * (SIEVE_N + 1)
_sieve[0] = _sieve[1] = 0
for _i in range(2, int(SIEVE_N ** 0.5) + 1):
    if _sieve[_i]:
        _sieve[_i * _i :: _i] = bytearray(len(_sieve[_i * _i :: _i]))


def is_prime(n: int) -> bool:
    if n < 2:
        return False
    if n <= SIEVE_N:
        return bool(_sieve[n])
    return all(n % d for d in range(2, math.isqrt(n) + 1))


def spf(n: int) -> int:
    """Smallest prime factor of |n|; 1 for |n| <= 1 (no prime factor)."""
    n = abs(n)
    if n <= 1:
        return 1
    for d in range(2, math.isqrt(n) + 1):
        if n % d == 0:
            return d
    return n


def big_omega(n: int) -> int:
    """Number of prime factors of |n| with multiplicity; 0 for |n| <= 1."""
    n, k, d = abs(n), 0, 2
    while n > 1 and d * d <= n:
        while n % d == 0:
            n //= d
            k += 1
        d += 1
    return k + (1 if n > 1 else 0)


def tau(n: int) -> int:
    """Number of positive divisors of |n|; 0 for n = 0."""
    n = abs(n)
    if n == 0:
        return 0
    return sum(1 + (d * d != n) for d in range(1, math.isqrt(n) + 1) if n % d == 0)


def nearest_int(x: Q) -> int:
    """Nearest integer, ties toward +infinity (round half up)."""
    return math.floor(x + Q(1, 2))


def dist_int(x: Q) -> Q:
    return abs(x - nearest_int(x))


def is_square_q(x: Q) -> bool:
    if x < 0:
        return False
    n, d = x.numerator, x.denominator
    return math.isqrt(n) ** 2 == n and math.isqrt(d) ** 2 == d


def nearest_square_root(x: Q, at_least: int = 0) -> int:
    """r >= at_least minimising |x - r^2| (ties to the smaller r)."""
    r = max(at_least, math.isqrt(math.floor(x)))
    best = None
    for k in (r - 1, r, r + 1):
        if k < at_least:
            continue
        cand = (abs(x - k * k), k)
        best = cand if best is None or cand < best else best
    return best[1]


def decimal_period(x: Q) -> int:
    """Length of the repeating block of x's decimal expansion (0 if it terminates)."""
    q = x.denominator
    for p in (2, 5):
        while q % p == 0:
            q //= p
    if q == 1:
        return 0
    k, r = 1, 10 % q
    while r != 1:
        r = r * 10 % q
        k += 1
    return k


# ---------------------------------------------------------------- the line (spec §12)
# Non-vertical lines only: (m, c) with y = m x + c. Every family here is undefined on vertical lines.


def gen(m: Q, c: Q) -> tuple[int, int, int]:
    """Primitive (a, b, c0) of a x + b y + c0 = 0 with b > 0 (spec §12.1)."""
    L = m.denominator * c.denominator // math.gcd(m.denominator, c.denominator)
    a, b, c0 = -m * L, Q(L), -c * L
    a, b, c0 = int(a), int(b), int(c0)
    g = math.gcd(math.gcd(abs(a), abs(b)), abs(c0))
    return a // g, b // g, c0 // g


def gamma_bits(n: int) -> int:
    assert n >= 1
    return 2 * (n.bit_length() - 1) + 1


def int_bits(n: int) -> int:
    z = 2 * n if n >= 0 else -2 * n - 1
    return gamma_bits(z + 1)


def nonzero_bits(n: int) -> int:
    assert n != 0
    return 1 + gamma_bits(abs(n))


def rat_bits(x: Q) -> int:
    return int_bits(x.numerator) + gamma_bits(x.denominator)


def nonzero_rat_bits(x: Q) -> int:
    return nonzero_bits(x.numerator) + gamma_bits(x.denominator)


def phi(m: Q, c: Q) -> int:
    """Read length of a line-q line: int(a) + int(b) + int(c) of the primitive triple (spec §12.2)."""
    a, b, c0 = gen(m, c)
    return int_bits(a) + int_bits(b) + int_bits(c0)


def y_at(m: Q, c: Q, x: Q) -> Q:
    return m * x + c


def pegs(m: Q, c: Q) -> list[tuple[int, int]]:
    out = []
    for x in range(-6, 7):
        y = m * x + c
        if y.denominator == 1 and -6 <= y <= 6:
            out.append((x, int(y)))
    return out


def x_intercept(m: Q, c: Q):
    return None if m == 0 else -c / m


def area(m: Q, c: Q):
    if m == 0 or c == 0:
        return None
    return c * c / (2 * abs(m))


# ---------------------------------------------------------------- families
# Each returns None (WORST) or a tuple: (primary, s1, s2, s3), every component "bigger is better".
# TOP[f](score) says whether the primary is at its top rung.

FAM: dict[str, callable] = {}
TOP: dict[str, callable] = {}
NAME: dict[str, str] = {}


def family(key, name, top):
    def deco(fn):
        FAM[key] = fn
        TOP[key] = top
        NAME[key] = name
        return fn

    return deco


at_zero = lambda s: s is not None and s[0] == 0


@family("WL", "Whole Landing", at_zero)
def whole_landing(m, c):
    N = nearest_int(c)
    return (-dist_int(c), spf(N), -m.denominator, len(pegs(m, c)))


@family("WC", "Whole Crossing", at_zero)
def whole_crossing(m, c):
    p = x_intercept(m, c)
    if p is None:
        return None
    P = nearest_int(p)
    return (-dist_int(p), tau(P), -abs(m.numerator), -c.denominator)


@family("SC", "Square Corner", at_zero)
def square_corner(m, c):
    A = area(m, c)
    if A is None:
        return None
    r = nearest_square_root(A, 1)
    p = -c / m
    legs_int = (p.denominator == 1) + (c.denominator == 1)
    h2 = p * p + c * c
    hyp_gap = abs(h2 - nearest_square_root(h2, 0) ** 2)
    return (-abs(A - r * r), big_omega(r), legs_int, -hyp_gap)


@family("FP", "Fixed Point", at_zero)
def fixed_point(m, c):
    if m == 1:
        return None
    X = c / (1 - m)
    return (-dist_int(X), -abs(m + 1), min(abs(nearest_int(X)), 12), -c.denominator)


@family("PT", "Prime Table", lambda s: s is not None and s[0] == 6)
def prime_table(m, c):
    ys = [m * k + c for k in range(6)]
    ps = [int(y) for y in ys if y.denominator == 1 and is_prime(int(y))]
    y6 = m * 6 + c
    return (len(set(ps)), int(y6.denominator == 1 and is_prime(int(y6))), min(ps) if ps else 0, -abs(m))


@family("RU", "Ruler", at_zero)
def ruler(m, c):
    if m == 0:
        return None  # "the line must slope": axis-parallel lines are undefined
    D2 = c * c / (1 + m * m)
    k = nearest_square_root(D2, 1)
    fx, fy = -m * c / (1 + m * m), c / (1 + m * m)
    return (-abs(D2 - k * k), (fx.denominator == 1) + (fy.denominator == 1), min(k, 12), -m.denominator)


@family("PC", "Prime Coefficients", lambda s: s is not None and s[0] == 3)
def prime_coefficients(m, c):
    a, b, c0 = gen(m, c)
    vals = [abs(a), abs(b), abs(c0)]
    primes = {v for v in vals if is_prime(v)}
    return (len(primes), -abs(a + b + c0), min(vals), len(pegs(m, c)))


@family("LD", "Long Division", at_zero)
def long_division(m, c, L=6):
    return (-abs(decimal_period(m) - L), -abs(m.numerator), int(is_prime(m.denominator)), -c.denominator)


@family("HW", "Half-Way House", at_zero)
def half_way(m, c):
    h = m / 2 + c
    H = nearest_int(h)
    return (-dist_int(h), spf(H), -m.denominator, -dist_int(m / 2))


def gatekeeper(gx, gy):
    def fn(m, c):
        return (-abs(m * gx + c - gy), len(pegs(m, c)), -m.denominator, -c.denominator)

    return fn


for _g in [(1, 1), (-1, 0), (2, 5)]:
    family(f"G{_g[0]},{_g[1]}", f"Gatekeeper {_g}", at_zero)(gatekeeper(*_g))


@family("LS", "Long Shot", lambda s: s is not None and s[0] >= 145)
def long_shot(m, c):
    pg = pegs(m, c)
    if len(pg) < 2:
        span = 0
    else:
        (x0, y0), (x1, y1) = pg[0], pg[-1]
        span = (x1 - x0) ** 2 + (y1 - y0) ** 2
    return (span, len(pg), int(c != 0), -m.denominator)


@family("SG", "Steady Gradient", at_zero)
def steady_gradient(m, c):
    M = nearest_int(m)
    return (-dist_int(m), tau(M), -c.denominator, int(M != 0 and (c / M).denominator == 1))


@family("PN", "Pythagorean Normal", at_zero)
def pythagorean_normal(m, c):
    a, b, c0 = gen(m, c)
    if a == 0:
        return None  # both a and b nonzero (a slanted line)
    s = a * a + b * b
    r = nearest_square_root(Q(s), 1)
    return (-abs(s - r * r), r, int(is_prime(abs(c0))), -abs(a + b + c0))


@family("ST", "Square Term", at_zero)
def square_term(m, c):
    ys = [m * n + c for n in range(1, 11)]
    def d(y):
        if y < 0:
            return -y
        r = nearest_square_root(y, 0)
        return abs(y - r * r)
    squares = [y for y in ys if y >= 0 and is_square_q(y) and y.denominator == 1]
    root = max((math.isqrt(int(y)) for y in squares), default=0)
    return (-min(d(y) for y in ys), len(set(squares)), root, -m.denominator)


@family("MP", "Midpoint Peg", at_zero)
def midpoint_peg(m, c):
    if m == 0 or c == 0:
        return None
    p = -c / m
    mx, my = p / 2, c / 2
    return (-(dist_int(mx) + dist_int(my)), int(abs(mx) == abs(my)), min(abs(mx) + abs(my), 12), -m.denominator)


@family("MA", "Matched Pair", at_zero)
def matched_pair(m, c):
    if m == 0:
        return None
    s = abs(m.numerator)
    return (-abs(s - c.denominator), spf(s) if s == c.denominator else 1, int(m.denominator == abs(c.numerator)), -abs(m))


ORDER = ["WL", "WC", "SC", "FP", "PT", "RU", "PC", "LD", "HW", "G1,1", "G-1,0", "G2,5", "LS", "SG", "PN", "ST", "MP", "MA"]


def score(f, m, c):
    try:
        return FAM[f](m, c)
    except ZeroDivisionError:
        return None


def fmt_line(m: Q, c: Q) -> str:
    def f(x):
        return str(x) if x.denominator == 1 else f"{x.numerator}/{x.denominator}"
    if m == 0:
        return f"y = {f(c)}"
    mm = "" if m == 1 else "-" if m == -1 else f(m)
    cc = "" if c == 0 else (f" + {f(c)}" if c > 0 else f" - {f(-c)}")
    return f"y = {mm}x{cc}"


def fmt_score(s):
    if s is None:
        return "WORST"
    return "(" + ", ".join(str(v) for v in s) + ")"


# ---------------------------------------------------------------- the grid


def grid():
    ms, cs = set(), set()
    for den in range(1, 9):
        for num in range(-36, 37):
            ms.add(Q(num, den))
        for num in range(-48, 49):
            cs.add(Q(num, den))
    for num in range(-60, 61):
        ms.add(Q(num))
    for num in range(-160, 161):
        cs.add(Q(num))
    return sorted(ms), sorted(cs)


_GRID_CACHE = None


def tops():
    """For each family, the grid lines at the top of its primary, sorted by read length."""
    global _GRID_CACHE
    if _GRID_CACHE is not None:
        return _GRID_CACHE
    ms, cs = grid()
    res = {f: [] for f in ORDER}
    for m in ms:
        for c in cs:
            for f in ORDER:
                s = score(f, m, c)
                if TOP[f](s):
                    res[f].append((m, c))
    for f in res:
        res[f] = set(res[f])
    _GRID_CACHE = res
    return res


def cheapest(lines, k=1):
    return sorted(lines, key=lambda mc: (phi(*mc), abs(mc[0]) + abs(mc[1]), mc))[:k]


# ---------------------------------------------------------------- mutators and prices (spec §12.4, line-q)

LOG2_9 = math.log2(9)
SMALL_NZ = sorted({Q(n, d) for n in range(-6, 7) if n for d in range(1, 5)}, key=nonzero_rat_bits)
SMALL_INT = sorted({Q(n, d) for n in range(-6, 7) for d in range(1, 5)}, key=rat_bits)


def calls(m: Q, c: Q):
    """Yield (description, base bits, (m', c')) for a sample of cheap calls on y = m x + c."""
    for k in SMALL_NZ:
        yield f"si.shift({k})", LOG2_9 + nonzero_rat_bits(k), (m, c + k)
        yield f"si.tilt({k})", LOG2_9 + nonzero_rat_bits(k), (m + k, c)
        yield f"seq.step({k})", LOG2_9 + nonzero_rat_bits(k), (m + k, c - k)
        for x0 in SMALL_INT[:9]:
            yield f"cart.pivot({x0},{k})", LOG2_9 + rat_bits(x0) + nonzero_rat_bits(k), (m + k, c - k * x0)
        yield f"int.move(q,{k})", LOG2_9 + 1 + nonzero_rat_bits(k), (m * (c + k) / c, c + k) if c != 0 and m != 0 else None
        if m != 0 and c != 0:
            p = -c / m
            if p + k != 0:
                yield f"int.move(p,{k})", LOG2_9 + 1 + nonzero_rat_bits(k), (-c / (p + k), c)
        if k not in (1, -1):
            yield f"mach.stretch({k})", LOG2_9 + nonzero_rat_bits(k), (m * k, c * k)
    for u in SMALL_INT[:9]:
        for v in SMALL_INT[:9]:
            if u == 0 and v == 0:
                continue
            yield f"cart.slide({u},{v})", LOG2_9 + rat_bits(u) + rat_bits(v), (m, c + v - m * u)
    for name, mc in (("x", (-m, -c)), ("y", (-m, c)), ("origin", (m, -c))):
        yield f"cart.mirror({name})", LOG2_9 + 2, mc
    if m != 0:
        yield "cart.mirror(diagonal)", LOG2_9 + 2, (1 / m, -c / m)
    a, b, c0 = gen(m, c)
    for which in range(3):
        for k in range(-6, 7):
            if k == 0:
                continue
            t = [a, b, c0]
            t[which] += k
            if t[1] == 0:
                continue
            yield f"gen.nudge({'abc'[which]},{k})", LOG2_9 + math.log2(3) + nonzero_bits(k), (Q(-t[0], t[1]), Q(-t[2], t[1]))


def priced(m, c):
    base = phi(m, c)
    for desc, bits, res in calls(m, c):
        if res is None or res == (m, c):
            continue
        m2, c2 = res
        yield desc, bits + max(0, phi(m2, c2) - base), (m2, c2)


def cheapest_damage(fams, m, c):
    """Cheapest call that lowers the primary of any family in fams; returns (price, call, line, which)."""
    best = None
    s0 = {f: score(f, m, c) for f in fams}
    for desc, w, (m2, c2) in priced(m, c):
        hit = [f for f in fams if (lambda s: s is None or s[0] < s0[f][0])(score(f, m2, c2))]
        if hit and (best is None or w < best[0]):
            best = (w, desc, (m2, c2), hit)
    return best


def cheapest_ruin(fams, m, c):
    """Cheapest call that lowers the primary of every family in fams."""
    best = None
    s0 = {f: score(f, m, c) for f in fams}
    for desc, w, (m2, c2) in priced(m, c):
        if all((lambda s: s is None or s[0] < s0[f][0])(score(f, m2, c2)) for f in fams):
            if best is None or w < best[0]:
                best = (w, desc, (m2, c2))
    return best


def harmless_cheap_moves(fams, m, c, limit=6.0):
    """Calls priced at most `limit` bits above the cheapest call that leave every primary unharmed."""
    s0 = {f: score(f, m, c) for f in fams}
    ok = []
    for desc, w, (m2, c2) in priced(m, c):
        if w <= LOG2_9 + limit and all(score(f, m2, c2) is not None and score(f, m2, c2)[0] >= s0[f][0] for f in fams):
            ok.append((round(w, 2), desc))
    return sorted(set(ok))[:8]


# ---------------------------------------------------------------- report sections


def sec_families():
    T = tops()
    print("## Families: top-set size on the grid, cheapest top line (read length), its full score")
    for f in ORDER:
        lines = cheapest(T[f], 3)
        print(f"{f:6} {NAME[f]:22} |top|={len(T[f]):6}  " + "; ".join(
            f"{fmt_line(*mc)} [phi {phi(*mc)}] {fmt_score(score(f, *mc))}" for mc in lines))


def sec_pairs():
    T = tops()
    print("## Pairs: |top_i ∩ top_j| on the grid and the cheapest joint line")
    for i, j in itertools.combinations(ORDER, 2):
        both = T[i] & T[j]
        if both:
            mc = cheapest(both)[0]
            print(f"{i:6} {j:6} {len(both):6}  {fmt_line(*mc)} [phi {phi(*mc)}]  {i}={fmt_score(score(i, *mc))} {j}={fmt_score(score(j, *mc))}")
        else:
            print(f"{i:6} {j:6} {0:6}  (none)")


def best_joint(fams, pool, phi_cap=40):
    """Among lines in pool with phi <= cap, the one maximising the sum of normalised secondaries (lexicographic per family)."""
    cands = [mc for mc in pool if phi(*mc) <= phi_cap]
    return cands


def sec_triples():
    T = tops()
    triples = [
        ("WL", "G1,1", "G-1,0"),
        ("WL", "WC", "SC"),
        ("RU", "PN", "WL"),
        ("PT", "WL", "SG"),
        ("WL", "MA", "LD"),
        ("FP", "HW", "WL"),
        ("LS", "SC", "WC"),
    ]
    print("## Triples: pairwise and three-way top intersections (cheapest line each)")
    for t in triples:
        print("triple", t)
        for i, j in itertools.combinations(t, 2):
            both = T[i] & T[j]
            mc = cheapest(both)[0] if both else None
            print(f"   {i}&{j}: {len(both)}  " + (f"{fmt_line(*mc)} [phi {phi(*mc)}]" if mc else "-"))
        all3 = T[t[0]] & T[t[1]] & T[t[2]]
        mc = cheapest(all3)[0] if all3 else None
        print(f"   all three: {len(all3)}  " + (f"{fmt_line(*mc)} [phi {phi(*mc)}]" if mc else "-"))


def sec_pool():
    T = tops()
    print("## The pool of eight: every triple, and the best line for each coalition with the left-out player's score")
    for t in itertools.combinations(TOP8, 3):
        pairs = {(i, j): T[i] & T[j] for i, j in itertools.combinations(t, 2)}
        all3 = T[t[0]] & T[t[1]] & T[t[2]]
        kind = "all three" if all3 else f"{sum(1 for v in pairs.values() if v)} of 3 pairs"
        print(f"{'-'.join(t):12} {kind:12} " + "  ".join(f"{i}&{j}:{len(v)}" for (i, j), v in pairs.items()) + f"  all:{len(all3)}")


def sec_coalitions():
    T = tops()
    triples = [("WL", "HW", "LD"), ("WL", "SC", "RU"), ("WL", "MA", "HW"), ("WL", "G1,1", "G-1,0"), ("WC", "RU", "LD"),
               ("WC", "SC", "LD")]
    print("## Coalitions: for each pair in a triple, the cheap joint line (phi <= 21) that is best for the third")
    for t in triples:
        print("triple", t)
        for pair in itertools.combinations(t, 2):
            third = [f for f in t if f not in pair][0]
            joint = [mc for mc in T[pair[0]] & T[pair[1]] if phi(*mc) <= 21]
            if not joint:
                print(f"   {pair}: none")
                continue
            def key(mc):
                s3 = score(third, *mc)
                return (s3 is not None, s3[0] if s3 else 0, -phi(*mc))
            best = max(joint, key=key)
            print(f"   {pair[0]}+{pair[1]} at {fmt_line(*best)} [phi {phi(*best)}]: "
                  + " ".join(f"{f}={fmt_score(score(f, *best))}" for f in t))


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        global FAILED
        FAILED = True


FAILED = False


def sec_claims():
    """Exact characterisations stated in the document, checked against the grid."""
    T = tops()
    ms, cs = grid()
    universe = [(m, c) for m in ms for c in cs]
    is_int = lambda x: x.denominator == 1
    pyth = lambda m: m != 0 and is_square_q(1 + m * m)
    print("## Claims")
    check("WL ∩ WC = {c ∈ Z, c/m ∈ Z}: integer intercepts on both axes",
          T["WL"] & T["WC"] == {(m, c) for m, c in universe if m != 0 and is_int(c) and is_int(c / m)})
    check("WL ∩ HW = {c ∈ Z, m ∈ 2Z}",
          T["WL"] & T["HW"] == {(m, c) for m, c in universe if is_int(c) and is_int(m / 2)})
    check("G1,1 ∩ G-1,0 = {y = x/2 + 1/2}", T["G1,1"] & T["G-1,0"] == {(Q(1, 2), Q(1, 2))})
    check("WL ∩ G-1,0 = {m = c ∈ Z}", T["WL"] & T["G-1,0"] == {(m, c) for m, c in universe if m == c and is_int(c)})
    check("WL ∩ G1,1 = {c ∈ Z, m = 1 - c}", T["WL"] & T["G1,1"] == {(m, c) for m, c in universe if is_int(c) and m == 1 - c})
    check("PN top = {1 + m^2 a rational square, m != 0}", T["PN"] == {(m, c) for m, c in universe if pyth(m)})
    check("RU top ⊂ PN top", T["RU"] <= T["PN"])
    check("SC ∩ RU = ∅ and SC ∩ PN = ∅ (Fermat: no right triangle with rational sides has square area)",
          not (T["SC"] & T["RU"]) and not (T["SC"] & T["PN"]))
    check("on SC's top the hypotenuse is never a whole square (S3 gap > 0)", all(score("SC", *mc)[3] < 0 for mc in T["SC"]))
    check("WL ∩ RU = {m Pythagorean with hypotenuse ratio h/v, c a nonzero multiple of h}",
          T["WL"] & T["RU"] == {(m, c) for m, c in universe if pyth(m) and c != 0 and is_int(c)
                                and is_int(c / Q(math.isqrt((1 + m * m).numerator)))})
    check("WC ∩ MA = WL ∩ MA (the shared number is forced to 1)", T["WC"] & T["MA"] == T["WL"] & T["MA"])
    check("MA ∩ HW = ∅", not (T["MA"] & T["HW"]))
    check("RU ∩ MA = ∅", not (T["RU"] & T["MA"]))
    check("SC ∩ LD = ∅", not (T["SC"] & T["LD"]))
    check("PC ∩ {WL, WC, SC, RU, PN, MA} = ∅",
          all(not (T["PC"] & T[f]) for f in ("WL", "WC", "SC", "RU", "PN", "MA")))
    check("WC ∩ HW = {m = 2t/(1 - 2P): P the x-intercept, t ∈ Z}",
          T["WC"] & T["HW"] == {(m, c) for m, c in universe if m != 0 and is_int(-c / m)
                                and is_int(m * (1 - 2 * (-c / m)) / 2)})
    check("WL ∩ FP = lines through (0, N) and (X, X)",
          T["WL"] & T["FP"] == {(m, c) for m, c in universe if m != 1 and is_int(c) and is_int(c / (1 - m))})
    check("WL ∩ SC = {c ∈ Z \\ 0, |m| = c^2 / (2 r^2)}",
          T["WL"] & T["SC"] == {(m, c) for m, c in universe if m != 0 and c != 0 and is_int(c)
                                and (c * c / (2 * abs(m))).denominator == 1 and is_square_q(c * c / (2 * abs(m)))})
    ma_sc = sorted([mc for mc in T["MA"] & T["SC"] if abs(mc[0].numerator) > 1], key=lambda mc: phi(*mc))
    print("   MA ∩ SC with shared number > 1:", [fmt_line(*mc) for mc in ma_sc[:4]])
    check("PT top on the grid = {m = ±30, c in {7, 157}} plus their kin",
          all(abs(m) % 30 == 0 and is_int(m) for m, c in T["PT"]))
    check("WL ∩ MA = {c ∈ Z, |num m| = 1}",
          T["WL"] & T["MA"] == {(m, c) for m, c in universe if is_int(c) and m != 0 and abs(m.numerator) == 1})
    check("WL ∩ MA ∩ LD = {c ∈ Z, m = ±1/q, ord_q'(10) = 6}",
          T["WL"] & T["MA"] & T["LD"] == {(m, c) for m, c in universe
                                           if is_int(c) and m != 0 and abs(m.numerator) == 1 and decimal_period(m) == 6})
    check("FP ∩ WL ∩ HW: c ∈ Z, m ∈ 2Z, c/(1-m) ∈ Z",
          T["FP"] & T["WL"] & T["HW"] == {(m, c) for m, c in universe
                                           if m != 1 and is_int(c) and is_int(m / 2) and is_int(c / (1 - m))})
    check("SC ∩ WL ∩ WC: integer legs N, P with |N P| = 2 r^2",
          all(is_int(c) and is_int(c / m) and is_square_q(abs(c * c / m) / 2) for m, c in T["SC"] & T["WL"] & T["WC"]))
    check("MP top = {c ∈ 2Z, p ∈ 2Z} (midpoint of the intercepts is a peg)",
          T["MP"] == {(m, c) for m, c in universe if m != 0 and c != 0 and is_int(c / 2) and is_int(-c / m / 2)})
    check("MP top ⊂ WL ∩ WC", T["MP"] <= T["WL"] & T["WC"])
    check("LS top lines: span^2 >= 145", all(score("LS", *mc)[0] >= 145 for mc in T["LS"]))
    best_st = max(T["ST"], key=lambda mc: (score("ST", *mc)[1], -phi(*mc)))
    print("   most squares among y(1..10):", fmt_line(*best_st), fmt_score(score("ST", *best_st)))


EXAMPLES = {
    "WL": (Q(-1), Q(5)),
    "WC": (Q(1, 3), Q(-4)),
    "SC": (Q(-1, 2), Q(4)),
    "FP": (Q(-1), Q(8)),
    "PT": (Q(30), Q(7)),
    "RU": (Q(-3, 4), Q(25, 4)),
    "PC": (Q(-2, 3), Q(5, 3)),
    "LD": (Q(1, 7), Q(2)),
    "HW": (Q(4), Q(5)),
    "G1,1": (Q(-1), Q(2)),
    "LS": (Q(11, 12), Q(-1, 2)),
    "SG": (Q(6), Q(-12)),
    "PN": (Q(-4, 3), Q(5, 3)),
    "ST": (Q(8), Q(1)),
    "MP": (Q(-1), Q(6)),
    "MA": (Q(3, 5), Q(5, 3)),
}


def sec_examples():
    print("## Example lines, every family's score")
    for f, mc in EXAMPLES.items():
        print(f"{f:6} {fmt_line(*mc):18} phi {phi(*mc):3}  {fmt_score(score(f, *mc))}  pegs={len(pegs(*mc))}")


NEGOTIATIONS = [
    ("WL vs SC (r)", "WL", (Q(-1), Q(7)), "SC", (Q(-1, 2), Q(4)), (Q(-1, 2), Q(7))),
    ("WL vs SC (r=14)", "WL", (Q(-1), Q(7)), "SC", (Q(-1, 2), Q(4)), (Q(-1, 8), Q(7))),
    ("WC vs MA (crossed)", "WC", (Q(1, 3), Q(-4)), "MA", (Q(3, 5), Q(5, 3)), (Q(1, 4), Q(-4))),
    ("RU vs WL (foot)", "RU", (Q(-3, 4), Q(25, 4)), "WL", (Q(-1), Q(7)), (Q(-3, 4), Q(25))),
    ("RU vs WL (cheap)", "RU", (Q(-3, 4), Q(25, 4)), "WL", (Q(-1), Q(7)), (Q(-4, 3), Q(5))),
    ("PT vs HW", "PT", (Q(30), Q(7)), "HW", (Q(4), Q(5)), (Q(60), Q(11))),
    ("FP vs G2,5 (j=2)", "FP", (Q(-1), Q(8)), "G2,5", (Q(1), Q(3)), (Q(-1, 2), Q(6))),
    ("FP vs G2,5 (j=1)", "FP", (Q(-1), Q(8)), "G2,5", (Q(1), Q(3)), (Q(-2), Q(9))),
    # (title, family A, A's ideal, family B, B's ideal, compromise)
    ("LD vs WL", "LD", (Q(1, 7), Q(2, 7)), "WL", (Q(-1), Q(7)), (Q(1, 7), Q(7))),
    ("LS vs SC", "LS", (Q(1), Q(0)), "SC", (Q(-1, 2), Q(4)), (Q(-1, 2), Q(3))),
]


def sec_negotiations():
    print("## Negotiations: each side's ideal, the compromise, and both ladders there")
    for title, fa, la, fb, lb, lc in NEGOTIATIONS:
        print(title)
        for lab, mc in (("A ideal", la), ("B ideal", lb), ("deal", lc)):
            print(f"   {lab:8} {fmt_line(*mc):18} phi {phi(*mc):3}  {fa}={fmt_score(score(fa, *mc))}  {fb}={fmt_score(score(fb, *mc))}")


TOP8 = ["WL", "WC", "SC", "RU", "MA", "HW", "FP", "LD"]
DEFENCES = {
    # family: (family, partner, the joint top line they defend)
    "WL": ("WL", "WC", (Q(-1), Q(5))),
    "WC": ("WC", "WL", (Q(-1), Q(5))),
    "SC": ("SC", "WL", (Q(-2), Q(4))),
    "RU": ("RU", "WL", (Q(-4, 3), Q(5))),
    "MA": ("MA", "WL", (Q(1), Q(5))),
    "HW": ("HW", "WL", (Q(-2), Q(5))),
    "FP": ("FP", "WL", (Q(-1), Q(8))),
    "LD": ("LD", "WL", (Q(1, 7), Q(5))),
}


def cheapest_repair(m2, c2, target):
    best = None
    for desc, w, res in priced(m2, c2):
        if res == target and (best is None or w < best[0]):
            best = (w, desc)
    return best


def sec_attacks():
    print("## Attacks on the top eight (cheapest damaging call on an example top line), and defended joint lines")
    for f in TOP8:
        mc = EXAMPLES[f]
        d = cheapest_damage([f], *mc)
        rep = cheapest_repair(*d[2], mc)
        print(f"{f:6} on {fmt_line(*mc):16} phi {phi(*mc):3} {fmt_score(score(f, *mc))}: cheapest damage {d[0]:.2f} bits by {d[1]} -> {fmt_line(*d[2])} {f}={fmt_score(score(f, *d[2]))}; repair {rep[0]:.2f} by {rep[1]}" if rep else "; no one-call repair")
        safe = harmless_cheap_moves([f], *mc)
        print(f"        harmless cheap calls: {', '.join(f'{x[1]} ({x[0]})' for x in safe)}")
        a, b, jl = DEFENCES[f]
        d1 = cheapest_damage([a], *jl)
        d2 = cheapest_ruin([a, b], *jl)
        rep = cheapest_repair(*d1[2], jl)
        print(f"        defended at {fmt_line(*jl)} with {b} (phi {phi(*jl)}) {a}={fmt_score(score(a, *jl))} {b}={fmt_score(score(b, *jl))}: "
              f"cheapest damage to {a} {d1[0]:.2f} by {d1[1]} -> {fmt_score(score(a, *d1[2]))}, repair {rep[0]:.2f} by {rep[1]}; "
              + (f"cheapest that hurts both {d2[0]:.2f} by {d2[1]}" if d2 else "nothing in the sample hurts both"))


def sec_defend():
    """For each family of the pool: its best-defended cheap top line alone, and with each partner (max over joint lines
    with phi <= 21 of the price of the cheapest call that lowers either primary)."""
    T = tops()
    print("## Defence: the joint line that makes the cheapest damaging call dearest")
    for f in TOP8:
        rows = []
        for partner in [None] + [g for g in TOP8 if g != f]:
            fams = [f] if partner is None else [f, partner]
            pool = T[f] if partner is None else T[f] & T[partner]
            cands = cheapest([mc for mc in pool if phi(*mc) <= 21], 60)
            best = None
            for mc in cands:
                d = cheapest_damage(fams, *mc)
                if d and (best is None or d[0] > best[0][0]):
                    best = (d, mc)
            if best:
                d, mc = best
                rows.append((round(d[0], 2), partner or "alone", fmt_line(*mc), phi(*mc), d[1], ",".join(d[3])))
        rows.sort(reverse=True)
        print(f"{f}:")
        for r in rows:
            print(f"   {r[1]:6} {r[2]:18} phi {r[3]:3}  cheapest damage {r[0]:5} by {r[4]} (hurts {r[5]})")


SECTIONS = {
    "defend": sec_defend,
    "families": sec_families,
    "examples": sec_examples,
    "pairs": sec_pairs,
    "triples": sec_triples,
    "claims": sec_claims,
    "negotiations": sec_negotiations,
    "attacks": sec_attacks,
    "pool": sec_pool,
    "coalitions": sec_coalitions,
}

if __name__ == "__main__":
    want = sys.argv[1:] or list(SECTIONS)
    for s in want:
        SECTIONS[s]()
        print()
    sys.exit(1 if FAILED else 0)
