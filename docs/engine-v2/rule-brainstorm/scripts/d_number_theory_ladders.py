#!/usr/bin/env python3
"""Numeric check of the sixteen layered rule families of ../d-number-theory.md.

Standard library only, deterministic, about three minutes.  Usage:

    python3 d_number_theory_ladders.py            # everything, box H = 64 (the committed .out.txt)
    python3 d_number_theory_ladders.py 32         # a smaller box
    python3 d_number_theory_ladders.py 64 parade  # one family (keys are in FAMILIES)

A line is the primitive integer triple (a, b, c) of a*x + b*y + c = 0 with b > 0, or b = 0 and a > 0 (spec 12.1).
Its read length is phi = int(a) + int(b) + int(c) with the spec's Elias-gamma integer code (spec 2.3, 12.2) and the
reference law is pi(line) = 2^-phi / Z, the resting law of a price list that passes the cycle test.  For every family
the script computes a lexicographic score (a tuple, bigger is better), the level of each line on the family's ladder
(the number of rung thresholds the score meets), and V_i = -log2 pi(level >= i).  The mass of a rung comes from:

  B    the box: every line with |a|, |b|, |c| <= H;
  E    a family-specific exact enumeration that contains every line of the rung up to a much larger height (whole
       lines, whole intercepts, root pairs, Pythagorean normals, ...; each generator says what it covers);
  S    for rungs that read the gradient only: the exact marginal weight of every gradient p/q with p, q <= H3.  A rung
       is trusted only while its cheapest gradient is below H3 / 8;
  C+S  S plus an enumeration of the rungs of the same family that also read c;
  W    no enumeration reaches the rung: a witness line gives the proved bound V <= E(witness) = phi + log2 Z, and V is
       extrapolated along the family's own measured line of V against E(cheapest line of the rung).

Z is taken from the box (the mass outside H = 64 is about 3 * 2^-7.4, i.e. 0.03 bits).
"""
import sys
import time
from math import gcd, isqrt, log2
from fractions import Fraction as Fr
from functools import lru_cache

# ---------------------------------------------------------------------------------------------- codes (spec 2.3)
def int_bits(n):
    z = 2 * n + 1 if n >= 0 else -2 * n
    return 2 * (z.bit_length() - 1) + 1

def phi(a, b, c):
    return int_bits(a) + int_bits(b) + int_bits(c)

def canon(a, b, c):
    g = gcd(gcd(abs(a), abs(b)), abs(c))
    a, b, c = a // g, b // g, c // g
    if b < 0 or (b == 0 and a < 0):
        a, b, c = -a, -b, -c
    return a, b, c

def line_mc(m, c):
    """y = m x + c with rational m, c."""
    m, c = Fr(m), Fr(c)
    L = m.denominator * c.denominator
    return canon(int(m * L), -L, int(c * L))

def line_int(p, q):
    """x/p + y/q = 1."""
    p, q = Fr(p), Fr(q)
    L = p.numerator * q.numerator
    return canon(int(L / p), int(L / q), -L)

# ---------------------------------------------------------------------------------------------- arithmetic
SIEVE_N = 12_000_000
_s = bytearray([1]) * SIEVE_N
_s[0] = _s[1] = 0
for _p in range(2, isqrt(SIEVE_N) + 1):
    if _s[_p]:
        _s[_p * _p::_p] = bytearray(len(range(_p * _p, SIEVE_N, _p)))
PRIMES = [i for i in range(SIEVE_N) if _s[i]]

def is_prime(n):
    if n < SIEVE_N:
        return n >= 2 and _s[n] == 1
    for p in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2; r += 1
    for a in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True

@lru_cache(maxsize=1 << 20)
def factor(n):
    out, m = [], n
    for p in PRIMES:
        if p * p > m:
            break
        if m % p == 0:
            e = 0
            while m % p == 0:
                m //= p; e += 1
            out.append((p, e))
    if m > 1:
        out.append((m, 1))
    return tuple(out)

TAUT = []

def tau(n):
    if n < len(TAUT):
        return TAUT[n]
    t = 1
    for _, e in factor(n):
        t *= e + 1
    return t

def rad(n):
    r = 1
    for p, _ in factor(n):
        r *= p
    return r

def sigma(n):
    s = 1
    for p, e in factor(n):
        s *= (p ** (e + 1) - 1) // (p - 1)
    return s

ALIQ = []

def aliquot(n):          # sum of the proper divisors
    if n < len(ALIQ):
        return ALIQ[n]
    return sigma(n) - n

def build_tables(N):
    """Divisor counts and sums of proper divisors below N, by sieve."""
    if len(TAUT) >= N:
        return
    t = [0] * N; a = [0] * N
    for d in range(1, N):
        for m in range(d, N, d):
            t[m] += 1
        for m in range(2 * d, N, d):
            a[m] += d
    TAUT[:] = t; ALIQ[:] = a

def is_square(n):
    if n < 0:
        return False
    r = isqrt(n)
    return r * r == n

def is_power(n):         # a perfect power k^e, e >= 2 (1 counts)
    if n == 1:
        return True
    for e in range(2, n.bit_length() + 1):
        r = round(n ** (1.0 / e))
        for k in (r - 1, r, r + 1):
            if k > 1 and k ** e == n:
                return True
    return False

def cf(p, q):
    out = []
    while q:
        out.append(p // q)
        p, q = q, p % q
    return out

def sqfree_part(n):
    s = 1
    for p, e in factor(n):
        if e & 1:
            s *= p
    return s

@lru_cache(maxsize=None)
def ord10(d):            # multiplicative order of 10 modulo d (gcd(d, 10) = 1, d > 1)
    k = d
    for p, _ in factor(d):
        k = k // p * (p - 1)                 # Euler's phi(d); the order divides it
    for q, _ in factor(k):
        while k % q == 0 and pow(10, k // q, d) == 1:
            k //= q
    return k

def full_reptend(p):     # is 10 a primitive root of the prime p?
    return all(pow(10, (p - 1) // q, p) != 1 for q, _ in factor(p - 1))

ROOT2 = [isqrt(2 * 10 ** (2 * k)) for k in range(60)]   # floor(sqrt2 * 10^k)

# ---------------------------------------------------------------------------------------------- the families
# every score function takes the canonical triple and returns None (level 0) or a tuple, bigger is better.

def s_parade(a, b, c):
    """Prime Parade: (R, B, twins, sum prime)."""
    if b == 0 or c % b:
        return None
    c0 = -c // b
    if not is_prime(c0):
        return None
    m = -a if b == 1 else 0
    R = 1
    if m:
        t = c0 + m
        while is_prime(t):
            R += 1; t += m
    B = 0
    if m:
        t = c0 - m
        while is_prime(abs(t)):
            B += 1; t -= m
    tw = s = 0
    t = c0
    for _ in range(R):
        if is_prime(t + 2) or is_prime(t - 2):
            tw += 1
        s += t; t += m
    return (R, B, tw, 1 if is_prime(s) else 0)

def s_squares(a, b, c):
    """Square Steps: (Q, three in a row, prime roots, coprime)."""
    if b == 0:
        return None
    hits = []
    for n in range(13):
        num = -(a * n + c)
        if num >= 0 and num % b == 0 and is_square(num // b):
            hits.append((n, num // b))
        if a == 0:
            break
    Q = len(hits)
    if Q == 0:
        return None
    pos = {n for n, _ in hits}
    three = 1 if any(n + 1 in pos and n + 2 in pos for n in pos) else 0
    pr = sum(1 for _, v in hits if is_prime(isqrt(v)))
    g = 0
    for _, v in hits:
        g = gcd(g, v)
    return (Q, three, pr, 1 if (Q >= 2 and g == 1) else 0)

def s_rect(a, b, c):
    """Rectangle Field: (whole legs, coprime, tau(area), -|X - Y|)."""
    if a == 0 or b == 0 or c == 0:
        return None
    W = (c % a == 0) + (c % b == 0)
    if W < 2:
        return (W,) if W else None
    X, Y = abs(c // a), abs(c // b)
    if gcd(X, Y) != 1:
        return (2, 0)
    return (2, 1, tau(X) * tau(Y), -abs(X - Y))

def stair_core(M, D):
    big, small = (M, D) if M >= D else (D, M)
    qs = cf(big, small)
    K = len(qs)
    pal = 1 if K >= 2 and qs == qs[::-1] else 0
    return K, pal, (1 if pal and is_prime(big) else 0)

def s_stair(a, b, c):
    """Euclid's Staircase: (K, palindrome, prime, c is a Farey neighbour of m)."""
    if b == 0 or a == 0:
        return None
    g = gcd(a, b)
    M, D = -a // g, b // g
    K, pal, pb = stair_core(abs(M), D)
    far = 0
    if pb:
        g2 = gcd(abs(c), b)
        far = 1 if abs(M * (b // g2) - D * (-c // g2)) == 1 else 0
    return (K, pal, pb, far)

def root_core(M, D):
    if not (D <= M < 2 * D):
        return None
    G, k = 1, 1
    while (M * 10 ** k) // D == ROOT2[k]:
        G += 1; k += 1
    return G, -abs(M * M - 2 * D * D)

def s_root(a, b, c):
    """Root Hunter: (G, -|M^2 - 2 D^2|, c Farey neighbour, c Pell)."""
    if b == 0 or a >= 0:
        return None
    g = gcd(a, b)
    M, D = -a // g, b // g
    r = root_core(M, D)
    if r is None:
        return None
    G, pell = r
    far = cp = 0
    if pell == -1:
        g2 = gcd(abs(c), b)
        Cn, Cd = -c // g2, b // g2
        far = 1 if abs(M * Cd - D * Cn) == 1 else 0
        cp = 1 if far and abs(Cn * Cn - 2 * Cd * Cd) == 1 else 0
    return (G, pell, far, cp)

def pharaoh_core(M, D):
    if not (0 < M < D):
        return None
    dens, m, d = [], M, D
    while m:
        n = -(-d // m)
        dens.append(n)
        m, d = m * n - d, d * n
        g = gcd(m, d)
        m, d = m // g, d // g
    return len(dens), sum(1 for n in dens if is_prime(n)), -(D - M), dens[0]

def s_pharaoh(a, b, c):
    """Pharaoh's Gradient: (E, prime denominators, -(D - M), c is the first unit fraction)."""
    if b == 0 or a >= 0:
        return None
    g = gcd(a, b)
    r = pharaoh_core(-a // g, b // g)
    if r is None:
        return None
    E, pd, gap, first = r
    return (E, pd, gap, 1 if -c * first == b else 0)

def s_abc(a, b, c):
    """ABC Line: (-|a + b - C|, C / rad(abC), perfect powers, C)."""
    if a <= 0 or b <= 0 or c >= 0:
        return None
    C = -c
    P = -abs(a + b - C)
    if P:
        return (P,)
    return (0, Fr(C, rad(a) * rad(b) * rad(C)), is_power(a) + is_power(b) + is_power(C), C)

def s_coin(a, b, c):
    """Coin Line: (unpayable, -(F - C), prime coins, F prime, F)."""
    if a < 2 or b < 2 or c >= 0 or gcd(a, b) != 1:
        return None
    C = -c
    F = a * b - a - b
    if C > F:
        return None
    if C != F:
        x = C
        while x >= 0:
            if x % b == 0:
                return None
            x -= a
    return (1, -(F - C), is_prime(a) + is_prime(b), 1 if is_prime(F) else 0, F)

def s_amic(a, b, c):
    """Amicable Line: (-P, m != c, both odd, min(m, c))."""
    if b != 1:
        return None
    m, c0 = -a, -c
    if m < 2 or c0 < 2:
        return None
    P = abs(aliquot(m) - c0) + abs(aliquot(c0) - m)
    return (-P, 1 if m != c0 else 0, 1 if (m & 1 and c0 & 1) else 0, min(m, c0))

def s_div(a, b, c):
    """Divisibility Ladder: (K, prime quotients, pairwise coprime, whole x-intercept)."""
    if b != 1 or c == 0:
        return None
    m, c0 = -a, -c
    K = 1
    while c0 % (K + 1) == 0:
        K += 1
    qs = [abs(m + c0 // n) for n in range(1, K + 1)]
    pq = sum(1 for q in qs if is_prime(q))
    cop = 1
    for i in range(K):
        for j in range(i):
            if gcd(qs[i], qs[j]) != 1:
                cop = 0
    return (K, pq, cop, 1 if (m and c0 % m == 0) else 0)

def s_feed(a, b, c):
    """Prime Feedback: (R, backward primes, prime gradient, last prime)."""
    if b == 0:
        return None
    x, seen, R, last = 1, set(), 0, 0
    while R < 80:
        num = -(a * x + c)
        if num % b:
            break
        x = num // b
        if x in seen or not is_prime(x):
            break
        seen.add(x); R += 1; last = x
    if R == 0:
        return None
    B, x = 0, 1
    while a and B < 80:
        num = -(b * x + c)
        if num % a:
            break
        x = num // a
        if x in seen or not is_prime(x):
            break
        seen.add(x); B += 1
    return (R, B, 1 if (b == 1 and is_prime(abs(a))) else 0, last)

def s_cong(a, b, c):
    """Congruent Corner: (rational hypotenuse, -dist(area, whole), squarefree, prime, area)."""
    if a == 0 or b == 0 or c == 0:
        return None
    if not is_square(a * a + b * b):
        return None
    A = Fr(c * c, 2 * abs(a) * b)
    near = max(1, round(A))
    d = abs(A - near)
    if d:
        return (1, -d)
    A = int(A)
    sf = 1 if sqfree_part(A) == A else 0
    return (1, 0, sf, 1 if is_prime(A) else 0, A)

def s_dec(a, b, c):
    """Cyclic Decimal: (period, full period, c a different rotation, m + c whole)."""
    if b == 0 or a == 0:
        return None
    g = gcd(a, b)
    M, D = -a // g, b // g
    Dp = D
    while Dp % 2 == 0:
        Dp //= 2
    while Dp % 5 == 0:
        Dp //= 5
    if Dp == 1:
        return None
    L = ord10(Dp)
    full = 1 if L == D - 1 else 0
    rot = midy = 0
    if full:
        g2 = gcd(abs(c), b)
        Cn, Cd = -c // g2, b // g2
        rot = 1 if (Cd == D and (Cn - M) % D) else 0
        midy = 1 if (rot and (Cn + M) % D == 0) else 0
    return (L, full, rot, midy)

def r2_square(d):        # lattice points on the circle of radius d about the origin
    r = 4
    for p, e in factor(d):
        if p % 4 == 1:
            r *= 2 * e + 1
    return r

def s_circ(a, b, c):
    """Circle Kiss: (tangency grade, touching point a peg, pegs on the circle, radius)."""
    if a == 0 or b == 0 or c == 0:
        return None
    N = a * a + b * b
    h = isqrt(N)
    if h * h != N:
        return None
    if c % h:
        return (1,)
    d = abs(c) // h
    if d % h:
        return (2, 0)
    return (2, 1, r2_square(d), d)

def s_chord(a, b, c):
    """Parabola Chord: (whole crossings, prime crossings, prime gradient, 2p + 1 prime, p)."""
    if b == 0:
        return None
    disc = a * a - 4 * b * c
    if disc < 0:
        return None
    r = isqrt(disc)
    if r * r != disc:
        return None
    roots = set()
    for s in (r, -r):
        if (-a + s) % (2 * b) == 0:
            roots.add((-a + s) // (2 * b))
    if not roots:
        return None
    if len(roots) == 1:
        return (1,)
    r1, r2 = sorted(roots)
    pc = is_prime(r1) + is_prime(r2)
    if pc < 2:
        return (2, pc)
    mp = 1 if is_prime(r1 + r2) else 0
    return (2, 2, mp, 1 if (mp and is_prime(2 * r2 + 1)) else 0, r2)

# ---------------------------------------------------------------------------------------------- enumerations (E)
def gen_grid(H2):
    for m in range(-H2, H2 + 1):
        for c in range(-H2, H2 + 1):
            yield (-m, 1, -c, 1)

def gen_abc(N):
    for a in range(1, N + 1):
        for b in range(1, N + 1):
            if gcd(a, b) == 1:
                yield (a, b, -(a + b), 1)

def gen_coin(P):
    for a in range(2, P // 2 + 1):
        for b in range(2, P // a + 1):
            if gcd(a, b) == 1:
                yield (a, b, -(a * b - a - b), 1)

def gen_amic(N, D):
    for m in range(2, N + 1):
        s = aliquot(m)
        for c in range(max(2, s - D), s + D + 1):
            yield (-m, 1, -c, 1)

def pyth_pairs(L):
    """Every (a, b) with a, b >= 1, a^2 + b^2 a square, a, b <= L (both orders)."""
    u = 2
    while u * u <= 1.5 * L:                # max(x, y) >= u^2 / sqrt(2)
        for v in range(1, u):
            if (u - v) % 2 == 1 and gcd(u, v) == 1:
                x, y = u * u - v * v, 2 * u * v
                k = 1
                while k * max(x, y) <= L:
                    yield (k * x, k * y, k)
                    yield (k * y, k * x, k)
                    k += 1
        u += 1

def gen_pyth(L, CMAX):
    """Whole legs and whole hypotenuse: legs (X, Y) any Pythagorean pair, as x/X + y/Y = 1."""
    for X, Y, _ in pyth_pairs(L):
        g = gcd(X, Y)
        if X * Y // g <= CMAX:
            yield (Y // g, X // g, -(X * Y // g), 4)

def gen_hyperbola(N):
    """x/X + y/Y = 1 with positive whole X, Y and X * Y <= N (four sign choices, equal read length)."""
    for X in range(1, N + 1):
        for Y in range(1, N // X + 1):
            g = gcd(X, Y)
            yield (Y // g, X // g, -(X * Y // g), 4)

def gen_rect_coprime(N):
    """Whole coprime legs with X * Y <= N: every line of the coprime Rectangle Field rungs of height <= N."""
    build_tables(N + 1)
    for X in range(1, N + 1):
        for Y in range(1, N // X + 1):
            if gcd(X, Y) == 1:
                yield (Y, X, -X * Y, 4)

def gen_amic_exact(N):
    """Every perfect number and amicable pair below N."""
    build_tables(N + 1)
    for m in range(2, N + 1):
        c = ALIQ[m]
        if 2 <= c <= N and ALIQ[c] == m:
            yield (-m, 1, -c, 1)

def gen_parade_long(step, MMAX, CMAX, need):
    """Whole lines with gradient a multiple of `step` and at least `need` primes from y(0)."""
    s = _s
    for m in range(step, MMAX + 1, step):
        for c in PRIMES:
            if c > CMAX:
                break
            if s[c + m] and s[c + 2 * m] and all(is_prime(c + m * n) for n in range(3, need)):
                yield (-m, 1, -c, 1)
        # falling runs: y(0) is the largest prime
        for c in PRIMES:
            if c > CMAX:
                break
            if c > (need - 1) * m and s[c - m] and s[c - 2 * m] and all(is_prime(c - m * n) for n in range(3, need)):
                yield (m, 1, -c, 1)

def gen_parade_7():
    yield from gen_parade_long(210, 30030, 10 ** 6, 7)
    for m in range(30, 10 ** 6 + 1, 30):          # the only other way: the run starts at the prime 7
        if m % 210 and all(is_prime(7 + m * n) for n in range(1, 7)):
            yield (-m, 1, -7, 1)

def gen_parade_11():
    yield from gen_parade_long(2310, 10 ** 6, 10 ** 6, 11)

def gen_dec_c(N):
    """Cyclic Decimal, the rungs that read c: D a full-period prime, m = M/D, c = C/D, C not congruent to M."""
    for D in PRIMES:
        if D > N:
            break
        if D in (2, 5) or not full_reptend(D):
            continue
        K = 40 if D <= 1000 else 6
        for M in range(-K, K + 1):
            if M % D == 0:
                continue
            cs = set(range(-K, K + 1)) | {-M - D, -M + D}
            for C in cs:
                if C % D and (C - M) % D:
                    yield (-M, D, -C, 1)

BOX_H = [64]

def gen_grid_and_box(H2):
    """Integer lines to height H2, and every other line of the box."""
    yield from gen_grid(H2)
    H = BOX_H[0]
    for a in range(-H, H + 1):
        for b in range(2, H + 1):
            gab = gcd(abs(a), b)
            for c in range(-H, H + 1):
                if gab == 1 or gcd(gab, abs(c)) == 1:
                    yield (a, b, c, 1)

def gen_cong(L, CMAX):
    """Rational hypotenuse and whole area: (a, b) a Pythagorean pair, 2ab | c^2."""
    for a, b, _ in pyth_pairs(L):
        n = 2 * a * b
        s = sqfree_part(n)
        step = s * isqrt(n // s)
        c = step
        while c <= CMAX:
            if gcd(gcd(a, b), c) == 1:
                yield (a, b, -c, 4)        # signs of a and of c
            c += step

def gen_circ(HH, CMAX):
    """Tangent to a whole-number circle at a peg: (a, b) primitive Pythagorean with hypotenuse h, c = h^2 k."""
    for a, b, k in pyth_pairs(HH):
        if k != 1:
            continue
        h2 = a * a + b * b
        c = h2
        while c <= CMAX:
            yield (a, b, -c, 4)
            c += h2

def gen_roots(R):
    for r1 in range(-R, R + 1):
        for r2 in range(r1 + 1, R + 1):
            yield (-(r1 + r2), 1, r1 * r2, 1)

# ---------------------------------------------------------------------------------------------- witnesses (W)
def wit_stair():
    out, f = [], [1, 1]
    while f[-1] < 10 ** 6:
        f.append(f[-1] + f[-2])
    for i in range(2, len(f) - 1):
        out.append(line_mc(Fr(f[i + 1], f[i]), 0))
    # even palindromes with prime numerator (Smith), and the previous convergent as c
    def val(qs):
        p0, p1, q0, q1 = 1, qs[0], 0, 1
        for x in qs[1:]:
            p0, p1, q0, q1 = p1, x * p1 + p0, q1, x * q1 + q0
        return p1, q1, p0, q0
    import itertools
    for half in range(1, 8):
        best = None
        for qs in itertools.product((1, 2, 3), repeat=half):
            if qs[0] < 2:
                continue
            full = list(qs) + list(qs[::-1])
            p, q, pp, qq = val(full)
            if p < 10 ** 6 and is_prime(p):
                L = line_mc(Fr(p, q), Fr(pp, qq))
                if max(map(abs, L)) <= 10 ** 6 and (best is None or phi(*L) < phi(*best)):
                    best = L
                L0 = line_mc(Fr(p, q), 0)
                out.append(L0)
        if best:
            out.append(best)
    return out

def wit_root():
    out, p, q, pp, qq = [], 3, 2, 1, 1
    while p < 10 ** 6:
        out.append(line_mc(Fr(p, q), 0))
        L = line_mc(Fr(p, q), Fr(pp, qq))
        if max(map(abs, L)) <= 10 ** 6:
            out.append(L)
        p, q, pp, qq = 2 * p + pp, 2 * q + qq, p, q
    return out

def wit_pharaoh():
    out = [line_mc(Fr(n, d), c) for n, d, c in ((5, 6, Fr(1, 2)), (41, 42, Fr(1, 2)), (1805, 1806, Fr(1, 2)),
                                                (1805, 1806, 0))]
    best = {}
    for M in range(2, 21):
        for D in range(M + 1, 401):
            if gcd(M, D) == 1:
                E = pharaoh_core(M, D)[0]
                e = int_bits(M) + int_bits(D)
                if E >= 8 and (E not in best or e < best[E][0]):
                    best[E] = (e, M, D)
    return out + [line_mc(Fr(M, D), 0) for _, M, D in best.values()]

def wit_abc():
    """Triples a + b = C <= 10^6 in which b or C is very powerful (n / rad(n) >= 200) and a <= 2000."""
    N = 10 ** 6
    radt = [1] * (N + 1)
    for p in PRIMES:
        if p > N:
            break
        for m in range(p, N + 1, p):
            radt[m] *= p
    S = [n for n in range(2, N + 1) if n >= 200 * radt[n]]
    out = []
    for n in S:
        for a in range(1, 2001):
            for b, C in ((n, n + a), (n - a, n)):
                if b > a and C <= N and gcd(a, b) == 1 and radt[a] * radt[b] * radt[C] * 8 <= C:
                    out.append((a, b, -C)); out.append((b, a, -C))
    return out

def wit_feed():
    out = []
    s = _s
    for m in range(-120, 121):
        if m == 0:
            continue
        for c in range(max(-100000, 2 - m), 100001):
            if s[m + c]:
                x = m * (m + c) + c
                if is_prime(x):
                    x = m * x + c
                    if is_prime(x) and is_prime(m * x + c) and is_prime(m * (m * x + c) + c):
                        out.append((-m, 1, -c))
    return out

def wit_cong():
    return [(104329, 23400, -251940), (288, 175, -840), (40, 9, -60)]

def wit_dec():
    out = []
    for D in [7, 17, 19, 23, 29, 47, 59, 61, 97, 257, 509, 983] + [1000 * 2 ** k + 1 for k in range(1, 10)]:
        p = D
        while not (is_prime(p) and full_reptend(p)):
            p += 1
        out.append(line_mc(Fr(-1, p), Fr(1, p)))
        out.append(line_mc(Fr(1, p), 0))
    return out

def wit_circ():
    return [(3, 4, -5 * d) for d in (5, 25, 65, 325, 1105, 5525, 27625, 32045, 160225)]

def gen_chord_top():
    """Every line of the top Parabola Chord rungs with p < 500000: crossings at 2 and p, p + 2 and 2p + 1 prime."""
    for p in range(3, 500_000, 2):
        if is_prime(p) and is_prime(p + 2) and is_prime(2 * p + 1):
            yield (-(p + 2), 1, 2 * p, 1)

def gen_div(MM, CMAX):
    """Divisibility Ladder, K >= 7: whole m, c a non-zero multiple of 420."""
    for m in range(-MM, MM + 1):
        for c in range(420, CMAX + 1, 420):
            yield (-m, 1, -c, 1)
            yield (-m, 1, c, 1)

def wit_squares():
    out = []
    for m in range(1, 3000):
        for r in range(0, 60):
            L = (-m, 1, -r * r)
            sc = s_squares(*L)
            if sc and sc[0] >= 5:
                out.append(L)
    return out

# ---------------------------------------------------------------------------------------------- the registry
def R(*ts):
    return [t if isinstance(t, tuple) else (t,) for t in ts]

FAMILIES = [
    # key, name, score, rungs, ext (generator factory, first rung index it covers), slope core, witnesses
    dict(key="parade", name="Prime Parade", score=s_parade,
         rungs=R(1, 2, 3, 4, 5, (5, 2), (5, 4), 6, (6, 2), (6, 4), 7, (7, 2), 8, 9, 10, 11, 12, 13),
         ext=[(lambda: gen_grid(1000), (2,)), (gen_parade_7, (7,)), (gen_parade_11, (11,))]),
    dict(key="squares", name="Square Steps", score=s_squares,
         rungs=R(1, 2, 3, 4, 5, (5, 1), 6, (6, 1, 5, 1), 7),
         ext=[(lambda: gen_grid(1000), (4,))], wit=wit_squares),
    dict(key="rect", name="Rectangle Field", score=s_rect,
         rungs=R(1, 2, (2, 1), (2, 1, 4), (2, 1, 6), (2, 1, 8), (2, 1, 12), (2, 1, 16), (2, 1, 24), (2, 1, 32),
                 (2, 1, 48), (2, 1, 64), (2, 1, 96), (2, 1, 128), (2, 1, 192), (2, 1, 240)),
         ext=[(lambda: gen_hyperbola(100000), (2,)), (lambda: gen_rect_coprime(10 ** 6), (2, 1))]),
    dict(key="stair", name="Euclid's Staircase", score=s_stair,
         rungs=R(1, 2, (2, 1), 3, (3, 1), 4, (4, 1), (4, 1, 1), (4, 1, 1, 1), 5, (5, 1), 6, (6, 1), (6, 1, 1),
                 (6, 1, 1, 1), 7, 8, (8, 1), (8, 1, 1), (8, 1, 1, 1), 9, 10, (10, 1, 1), 11, 12, (12, 1, 1), 13, 14,
                 16, 20, 24, 28),
         slope=(lambda M, D: stair_core(abs(M), D), 3, 2000), wit=wit_stair),
    dict(key="root", name="Root Hunter", score=s_root,
         rungs=R(1, 2, (2, -1), 3, (3, -2), (3, -1), (3, -1, 1), (3, -1, 1, 1), 4, 5, (5, -1), (5, -1, 1, 1), 6,
                 (6, -1), (6, -1, 1, 1), 7, (7, -1), (7, -1, 1, 1), 8, 9, 10, 11, 12),
         slope=(root_core, 2, 2000), wit=wit_root),
    dict(key="pyth", name="Pythagoras' Corner", score=None,
         rungs=R(1, 2, 3, (3, 1), (3, 1, 1), (3, 1, 1, 13), (3, 1, 1, 17), (3, 1, 1, 29), (3, 1, 1, 41),
                 (3, 1, 1, 61), (3, 1, 1, 89), (3, 1, 1, 113), (3, 1, 1, 181), (3, 1, 1, 257), (3, 1, 1, 353),
                 (3, 1, 1, 509), (3, 1, 1, 709), (3, 1, 1, 1009), (3, 1, 1, 1409), (3, 1, 1, 2003),
                 (3, 1, 1, 2801), (3, 1, 1, 4001), (3, 1, 1, 5501), (3, 1, 1, 7001)),
         ext=[(lambda: gen_pyth(340000, 10 ** 6), (3,))]),
    dict(key="pharaoh", name="Pharaoh's Gradient", score=s_pharaoh,
         rungs=R(1, (1, 1), 2, (2, 2), (2, 2, -1), (2, 2, -1, 1), 3, (3, 2), (3, 3), (3, 3, -1), (3, 3, -1, 1), 4,
                 (4, 3), (4, 4), (4, 4, -1), (4, 4, -1, 1), 5, (5, 4), 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16),
         slope=(lambda M, D: (lambda r: None if r is None else r[:3])(pharaoh_core(M, D)), 3, 160), wit=wit_pharaoh),
    dict(key="abc", name="ABC Line", score=s_abc,
         rungs=R(-8, -4, -2, -1, 0, (0, Fr(1, 2)), (0, Fr(3, 5)), (0, Fr(4, 5)), (0, Fr(101, 100)), (0, Fr(3, 2)),
                 (0, 2), (0, 3), (0, 4), (0, 8), (0, 16), (0, 24), (0, 48)),
         ext=[(lambda: gen_abc(2000), (0,))], wit=wit_abc),
    dict(key="coin", name="Coin Line", score=s_coin,
         rungs=R(1, (1, 0), (1, 0, 2), (1, 0, 2, 1)) + [(1, 0, 2, 1, 12 * 2 ** k) for k in range(0, 17)],
         ext=[(lambda: gen_coin(10 ** 6), (1, 0))]),
    dict(key="amic", name="Amicable Line", score=s_amic,
         rungs=R(-30, -10, -3, -2, -1, 0, (0, 0, 0, 28), (0, 1), (0, 1, 0, 1184), (0, 1, 0, 2620), (0, 1, 0, 5020), (0, 1, 0, 10744),
                 (0, 1, 1), (0, 1, 1, 67095), (0, 1, 1, 100485), (0, 1, 1, 522405),
                 (0, 1, 1, 802725)),
         ext=[(lambda: gen_amic(20000, 30), (-30,)), (lambda: gen_amic_exact(10 ** 6), (0,))]),
    dict(key="div", name="Divisibility Ladder", score=s_div,
         rungs=R(1, 2, 3, 4, (4, 2), (4, 4), 6, (6, 2), (6, 3), 7, 8, 10, 12, 15, 16),
         ext=[(lambda: gen_grid(1000), (1,)), (lambda: gen_div(400, 10 ** 6), (7,))]),
    dict(key="feed", name="Prime Feedback", score=s_feed,
         rungs=R(1, 2, 3, (3, 1), 4, (4, 1), 5, 6, 7, 8, 9, 10, 11, 12),
         ext=[(lambda: gen_grid_and_box(1000), (3,))], wit=wit_feed),
    dict(key="cong", name="Congruent Corner", score=s_cong,
         rungs=R(1, (1, Fr(-1, 4)), (1, Fr(-1, 8)), (1, 0), (1, 0, 1), (1, 0, 1, 1), (1, 0, 1, 1, 7),
                 (1, 0, 1, 1, 13)),
         ext=[(lambda: gen_cong(20000, 10 ** 6), (1, 0))], wit=wit_cong),
    dict(key="dec", name="Cyclic Decimal", score=s_dec,
         rungs=R(1, 2, 3, 6, (6, 1), (6, 1, 1), (6, 1, 1, 1), 12, 16, (16, 1), (16, 1, 1, 1), 22, (22, 1), 46,
                 (46, 1), (46, 1, 1, 1), 96, (96, 1), (96, 1, 1, 1), 192, (256, 1), (508, 1), (982, 1),
                 (982, 1, 1, 1)) + [(1000 * 2 ** k, 1, 1, 1) for k in range(1, 10)],
         slope=(None, 2, 1200), wit=wit_dec),
    dict(key="circ", name="Circle Kiss", score=s_circ,
         rungs=R(1, 2, (2, 1), (2, 1, 20), (2, 1, 36), (2, 1, 60), (2, 1, 108), (2, 1, 180), (2, 1, 252),
                 (2, 1, 324), (2, 1, 540)),
         ext=[(lambda: gen_circ(1000, 10 ** 6), (2, 1))], wit=wit_circ),
    dict(key="chord", name="Parabola Chord", score=s_chord,
         rungs=R(1, 2, (2, 1), (2, 2), (2, 2, 1), (2, 2, 1, 1)) + [(2, 2, 1, 1, 10 * 2 ** k) for k in range(0, 16)],
         ext=[(lambda: gen_roots(700), (2,)), (gen_chord_top, (2, 2, 1, 1))]),
]

def s_pyth(a, b, c):
    """Pythagoras' Corner: (whole sides, primitive, prime hypotenuse, hypotenuse)."""
    if a == 0 or b == 0 or c == 0:
        return None
    N = a * a + b * b
    r = isqrt(N)
    T = (c % a == 0) + (c % b == 0) + (1 if (r * r == N and (abs(c) * r) % (abs(a) * b) == 0) else 0)
    if T < 3:
        return (T,) if T else None
    X, Y = abs(c // a), abs(c // b)
    h = abs(c) * r // (abs(a) * b)
    if gcd(X, Y) != 1:
        return (3, 0)
    return (3, 1, 1 if is_prime(h) else 0, h)

def dec_core(M, D):
    Dp = D
    while Dp % 2 == 0:
        Dp //= 2
    while Dp % 5 == 0:
        Dp //= 5
    if Dp == 1:
        return None
    L = ord10(Dp)
    return L, (1 if L == D - 1 else 0)

for f in FAMILIES:
    if f["key"] == "pyth":
        f["score"] = s_pyth
    if f["key"] == "dec":
        f["slope"] = (dec_core, 2, 2000)
        f["ctier"] = lambda: gen_dec_c(10 ** 6)

def level(rungs, sc):
    n = 0
    for t in rungs:
        if sc >= t:
            n += 1
        else:
            break
    return n

# ---------------------------------------------------------------------------------------------- the run
def main():
    H = int(sys.argv[1]) if len(sys.argv) > 1 else 64
    BOX_H[0] = H
    only = sys.argv[2] if len(sys.argv) > 2 else None
    fams = [f for f in FAMILIES if only in (None, f["key"])]
    for f in fams:
        n = len(f["rungs"]) + 1
        f["bm"] = [0.0] * n; f["bc"] = [0] * n
        f["sm"] = [0.0] * n
        f["best"] = [None] * n            # cheapest line seen at exactly this level: (phi, line)

    def note(f, lvl, L):
        e = phi(*L)
        if f["best"][lvl] is None or e < f["best"][lvl][0]:
            f["best"][lvl] = (e, L)

    T0 = time.time()
    # --- B: the box
    wt = {n: 2.0 ** -int_bits(n) for n in range(-H, H + 1)}
    Z = 0.0
    nlines = 0
    for a in range(-H, H + 1):
        for b in range(0, H + 1):
            if b == 0 and a <= 0:
                continue
            gab = gcd(abs(a), b)
            wab = wt[a] * wt[b]
            for c in range(-H, H + 1):
                if gab != 1 and gcd(gab, abs(c)) != 1:
                    continue
                w = wab * wt[c]
                Z += w; nlines += 1
                for f in fams:
                    sc = f["score"](a, b, c)
                    if sc is None:
                        continue
                    lv = level(f["rungs"], sc)
                    if lv:
                        f["bm"][lv] += w; f["bc"][lv] += 1
                        note(f, lv, (a, b, c))
    print(f"box H = {H}: {nlines} lines, Z = {Z:.5f} ({-log2(Z):.3f} bits), entropy of a line: ", end="")
    ent = 0.0
    for a in range(-H, H + 1):
        for b in range(0, H + 1):
            if b == 0 and a <= 0:
                continue
            gab = gcd(abs(a), b)
            for c in range(-H, H + 1):
                if gab != 1 and gcd(gab, abs(c)) != 1:
                    continue
                ent += wt[a] * wt[b] * wt[c] * (phi(a, b, c) + log2(Z))
    print(f"{ent / Z:.2f} bits")

    print(f"  [box done {time.time() - T0:.0f} s]", file=sys.stderr)
    # --- E: exact enumerations of the upper rungs
    for f in fams:
        if "ext" not in f:
            continue
        f["tiers"] = []
        n = len(f["rungs"])
        t0 = time.time()
        for gen, first in f["ext"]:
            lo = f["rungs"].index(first) + 1
            em = [0.0] * (n + 2); ec = [0] * (n + 2)
            for a, b, c, mult in gen():
                sc = f["score"](a, b, c)
                if sc is None:
                    continue
                lv = level(f["rungs"], sc)
                if lv >= lo:
                    em[lv] += mult * 2.0 ** -phi(a, b, c); ec[lv] += mult
                    note(f, lv, (a, b, c))
            f["tiers"].append((lo, em, ec))
        f["ext_lv"] = f["tiers"][0][0]
        print(f"  [{f['key']}: enumeration {time.time() - t0:.0f} s]", file=sys.stderr)

    # --- S: gradient-only rungs from the exact marginal weight of each gradient
    KMAX = 8
    CB = 1 << 14
    sc_k = [0.0] * (KMAX + 1)
    for k in range(1, KMAX + 1):
        s = 0.5 if k == 1 else 0.0                    # c = 0 (one bit), only when k = 1
        for c in range(1, CB):
            if gcd(c, k) == 1:
                s += 2 * 2.0 ** -int_bits(c)
        phik = sum(1 for j in range(1, k + 1) if gcd(j, k) == 1) / k
        sc_k[k] = s + phik * 2.0 ** -(CB.bit_length() - 1 + 1)   # tail: |c| >= 2^J has mass 2^-(J+1)
    for f in fams:
        if "slope" not in f:
            continue
        core, ncomp, H3 = f["slope"]
        f["srungs"] = [i + 1 for i, t in enumerate(f["rungs"]) if len(t) <= ncomp]
        srung_t = [f["rungs"][i - 1] for i in f["srungs"]]
        for D in range(1, H3 + 1):
            for Mabs in range(1, H3 + 1):
                if gcd(Mabs, D) != 1:
                    continue
                w = 0.0
                for k in range(1, KMAX + 1):
                    w += 2.0 ** -(int_bits(k * Mabs) + int_bits(k * D)) * sc_k[k]
                for M in (Mabs, -Mabs):
                    sc = core(M, D)
                    if sc is None:
                        continue
                    lv = level(srung_t, tuple(sc))
                    if lv:
                        f["sm"][f["srungs"][lv - 1]] += w
                        full = level(f["rungs"], tuple(sc) + (0,) * 3)
                        note(f, full, (-M, D, 0))
        f["cm"] = None
        if "ctier" in f:
            f["cm"] = [0.0] * (len(f["rungs"]) + 2)
            for a, b, c, mult in f["ctier"]():
                sc = f["score"](a, b, c)
                if sc is None:
                    continue
                lv = level(f["rungs"], sc)
                if lv and lv not in f["srungs"]:
                    f["cm"][lv] += mult * 2.0 ** -phi(a, b, c)
                    note(f, lv, (a, b, c))

    print(f"  [gradient stage done {time.time() - T0:.0f} s]", file=sys.stderr)
    # --- W: witnesses
    for f in fams:
        f["wbest"] = [None] * (len(f["rungs"]) + 1)
        if "wit" not in f:
            continue
        t0 = time.time()
        wl = f["wit"]()
        print(f"  [{f['key']}: witnesses {time.time() - t0:.0f} s]", file=sys.stderr)
        for L in wl:
            L = canon(*L)
            sc = f["score"](*L)
            if sc is None:
                continue
            lv = level(f["rungs"], sc)
            e = phi(*L)
            if lv and (f["wbest"][lv] is None or e < f["wbest"][lv][0]):
                f["wbest"][lv] = (e, L, sc)

    # --- combine
    lz = log2(Z)
    summary = []
    for f in fams:
        n = len(f["rungs"])
        ext_lv = f.get("ext_lv", n + 2)
        tiers = f.get("tiers", [])
        # exact upper masses, tier by tier: a tier is trusted from its first rung up to the next tier's first rung
        ue = [0.0] * (n + 2); cnt_e = [0] * (n + 2)
        for t in range(len(tiers) - 1, -1, -1):
            lo, em, ec = tiers[t]
            hi = tiers[t + 1][0] if t + 1 < len(tiers) else n + 1
            for i in range(hi - 1, lo - 1, -1):
                ue[i] = ue[i + 1] + em[i]; cnt_e[i] = ec[i]
        srungs = set(f.get("srungs", []))
        # upper masses
        ub = [0.0] * (n + 2); us = [0.0] * (n + 2)
        for i in range(n, 0, -1):
            ub[i] = ub[i + 1] + f["bm"][i]
        acc = 0.0
        for i in sorted(srungs, reverse=True):
            acc += f["sm"][i]; us[i] = acc
        # cheapest line with level >= i
        cheapest = [None] * (n + 2)
        for i in range(n, 0, -1):
            cands = [x for x in (cheapest[i + 1], f["best"][i],
                                 None if f["wbest"][i] is None else f["wbest"][i][:2]) if x]
            cheapest[i] = min(cands) if cands else None
        H3 = f["slope"][2] if "slope" in f else 0
        cm = f.get("cm")
        rows, gaps = [], []
        for i in range(1, n + 1):
            if i >= ext_lv:
                mass, src = ue[i], "E"
            else:
                mass, src = ub[i] - ub[min(ext_lv, n + 1)] + (ue[ext_lv] if ext_lv <= n else 0.0), "B"
            if i in srungs:
                # trusted only while the enumeration reaches well above the cheapest gradient of the rung
                ok = cheapest[i] is not None and max(map(abs, cheapest[i][1])) * 8 <= H3
                mass, src = (us[i], "S") if ok else (0.0, "W")
            elif srungs:
                j = min((r for r in srungs if r > i), default=None)
                hi = j if j else n + 1
                local = sum(cm[i:hi]) if cm else sum(f["bm"][i:hi])
                mass, src = (local + (us[j] if j else 0.0), "C+S" if cm else "B+S") if local > 0 else (0.0, "W")
            V = -log2(mass / Z) if mass > 0 else None
            emin = None if cheapest[i] is None else cheapest[i][0] + lz
            if V is not None and emin is not None:
                V = min(V, emin)
                if i >= 2:
                    gaps.append(emin - V)
            rows.append([i, f["rungs"][i - 1], src, V, emin, cheapest[i]])
        rows = [r for r in rows if r[3] is not None or r[4] is not None]
        gaps.sort()
        gap = gaps[len(gaps) // 2] if gaps else 0.0
        # W rungs: extrapolate along the family's own measured line of V against E(cheapest)
        meas = [r for r in rows if r[3] is not None and r[0] >= 2]
        rho = 1.0
        if len(meas) >= 4:
            a, b = meas[len(meas) // 2], meas[-1]
            if b[4] - a[4] >= 4:
                rho = min(1.0, max(0.5, (b[3] - a[3]) / (b[4] - a[4])))
        last = None
        for r in rows:
            if r[3] is not None:
                last = r
            else:
                r[2] = "W"
                r[3] = r[4] - gap if last is None else min(r[4] - gap, last[3] + rho * (r[4] - last[4]))
        for k in range(len(rows) - 2, -1, -1):          # an estimate may not exceed a later measured value
            if rows[k][2] == "W" and rows[k + 1][3] < rows[k][3]:
                rows[k][3] = rows[k + 1][3]
        print(f"\n== {f['name']} ({f['key']})   median gap E(cheapest) - V = {gap:.1f} bits; "
              f"W rungs extrapolated with dV/dE = {rho:.2f}")
        if "ext" in f and ext_lv <= n and ub[ext_lv] > 0:
            print(f"   check: the box holds {100 * ub[ext_lv] / ue[ext_lv]:.1f}% of the enumerated mass of rung {ext_lv}+")
        print("   rung  threshold                  src   V bits   step   E(cheapest)  cheapest line (a, b, c)   lines at this level")
        steps, prev, top, mtop = [], 0.0, None, 0.0
        for i, t, src, V, emin, ch in rows:
            V = max(V, prev)
            cnt = cnt_e[i] if (src == "E") else (f["bc"][i] if src == "B" else "")
            tt = "(" + ", ".join(str(x) for x in t) + ")"
            print(f"   {i:>4}  {tt:<26} {src:>3}  {V:7.2f}  {V - prev:5.2f}   {emin:9.2f}    {ch[1] if ch else ''}   {cnt}")
            steps.append(V - prev); prev = V; top = (i, V, src, ch)
            if src != "W":
                mtop = V
        live = [x for x in steps if x >= 0.25]
        big = max(steps[1:]) if len(steps) > 1 else 0.0
        mean = sum(live) / len(live)
        sd = (sum((x - mean) ** 2 for x in live) / len(live)) ** 0.5
        summary.append((f["name"], len(live), mtop, top[1], top[2], big, mean, sd / mean))

    print("\n== summary.  top = bits at the highest rung that a line of height <= 10^6 reaches (src W = estimate);")
    print("   live rungs = rungs worth at least a quarter of a bit more than the rung below")
    print("   family                 live rungs  measured top   top  src  mean step  largest step  step sd/mean")
    for name, nr, mtop, top, src, big, mean, cv in sorted(summary, key=lambda r: -r[3]):
        print(f"   {name:<22} {nr:>10}  {mtop:12.1f}  {top:5.1f}  {src:>3}  {mean:9.2f}  {big:12.2f}  {cv:12.2f}")
    print("\n   by smoothness (largest single step, ascending):")
    for name, nr, mtop, top, src, big, mean, cv in sorted(summary, key=lambda r: r[5]):
        print(f"   {name:<22} largest step {big:5.2f}, mean {mean:5.2f}, sd/mean {cv:4.2f}, top {top:5.1f}")

EXAMPLES = {
    "parade": line_mc(30, 7), "squares": line_mc(24, 1), "rect": line_int(8, 15),
    "stair": line_mc(Fr(13, 5), Fr(5, 2)), "root": line_mc(Fr(17, 12), Fr(7, 5)), "pyth": line_int(20, 21),
    "pharaoh": line_mc(Fr(41, 42), Fr(1, 2)), "abc": (3, 125, -128), "coin": (5, 7, -23),
    "amic": line_mc(220, 284), "div": line_mc(-1, 12), "feed": line_mc(2, 9), "cong": (40, 9, -60),
    "dec": line_mc(Fr(-1, 7), Fr(1, 7)), "circ": (3, 4, -325), "chord": line_mc(13, -22),
}

def examples():
    print("\n== the example line of each family: score, level, read length")
    for f in FAMILIES:
        L = canon(*EXAMPLES[f["key"]])
        sc = f["score"](*L)
        print(f"   {f['name']:<22} {str(L):<22} score ({', '.join(str(x) for x in sc)})   level {level(f['rungs'], sc)}"
              f" of {len(f['rungs'])}   phi = {phi(*L)} bits")

if __name__ == "__main__":
    main()
    if len(sys.argv) <= 2:
        examples()
