# Double Gap · Thorough
# Main part: the gap on the y-axis is a whole number, twice the gap on the x-axis. Tie-breaker: the gap shares a factor with the number you divide by.
# What it does: reads the pair once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and takes the change that raises your points most. Your points on a pair are your rarity there times the
# other players' rarity there added up, so a change that suits your rule but spoils the pair for the others can
# lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: change QUOTES = 6 to 2: fewer prices asked, but it may miss a cheaper plan.


# Exact helpers. A line is (a, b, c) (whole numbers) for a*x + b*y + c = 0; a pair is two lines, sorted.
from fractions import Fraction as F
from math import gcd


def line(a, b, c):   # the line in its standard form, or None for no line
    if a == 0 and b == 0:
        return None
    g = gcd(gcd(a, b), c)
    a, b, c = a // g, b // g, c // g
    return (-a, -b, -c) if b < 0 or (b == 0 and a < 0) else (a, b, c)


def pair(L, M):   # the pair sorted, or None when a line is missing or the two are the same
    if L is None or M is None or L == M:
        return None
    return (L, M) if L < M else (M, L)


def nearest(x):   # the whole number nearest x (a half rounds up)
    x = F(x)
    return (2 * x.numerator + x.denominator) // (2 * x.denominator)


def off(x):   # how far x is from a whole number
    return abs(x - nearest(x))


def spf(n):   # the smallest prime factor (1 for 0 and ±1)
    n = abs(n)
    if n < 2:
        return 1
    if n % 2 == 0:
        return 2
    d = 3
    while d * d <= n and d <= 100000:
        if n % d == 0:
            return d
        d += 2
    return n


def omega(n):   # how many prime factors, counting repeats
    n, k, d = abs(n), 0, 2
    if n < 2:
        return 0
    while d * d <= n and d <= 100000:
        while n % d == 0:
            n //= d
            k += 1
        d += 1 if d == 2 else 2
    return k + 1 if n > 1 else k


def common(x, y):   # their greatest common factor (0 if either is 0)
    return 0 if x == 0 or y == 0 else gcd(x, y)


def facts(S):   # what the two equations give together
    (a1, b1, c1), (a2, b2, c2) = S
    D, dot, nx, ny = a1 * b2 - a2 * b1, a1 * a2 + b1 * b2, b1 * c2 - b2 * c1, c1 * a2 - c2 * a1
    s = 1 if (b1 != 0 if b2 == 0 else b1 != 0 and abs(a2) * b1 > abs(a1) * b2) else 0   # the steeper line
    return {"D": D, "dot": dot, "nx": nx, "ny": ny, "s": s, "o": 1 - s, "x": F(nx, D) if D else None, "y": F(ny, D) if D else None}


def yint(L):
    return None if L[1] == 0 else F(-L[2], L[1])


def xint(L):
    return None if L[0] == 0 else F(-L[2], L[0])


def ygap(S):
    return abs(yint(S[0]) - yint(S[1])) if S[0][1] and S[1][1] else None


def score(S, tie):
    # How good is the pair S for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    # main: how far the y-axis gap is from a whole number twice the x-axis gap (closer is better); tie-breaker: the gap shares a factor with the number you divide by
    f = facts(S)
    if any(L[0] == 0 or L[1] == 0 or L[2] == 0 for L in S):   # every intercept, none at (0, 0)
        return None
    g, x = ygap(S), abs(xint(S[0]) - xint(S[1]))
    main = -(abs(g - 2 * x) + off(g))
    return [main, F(spf(nearest(g)) if tie == "gap-prime" else common(nearest(g), f["D"]))]


FAR = 1      # how far one change may go
QUOTES = 6  # at most this many plans are priced (each price is a host call)
TIE = "gap-divisor"   # your rule's tie-breaker
LEAVE = []      # pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this pair alone
        return None
    # A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
    contested(offer, 3)
    v = look(offer, "eqs")   # the two equations: a1*x + b1*y = e1 and a2*x + b2*y = e2
    S = ((int(v["a1"]), int(v["b1"]), -int(v["e1"])), (int(v["a2"]), int(v["b2"]), -int(v["e2"])))   # as lines a*x + b*y + c = 0
    f, tries = facts(S), []   # (plan, pair after): changes tried in the agent's own head
    for i in (0, 1):
        L, M, n = S[i], S[1 - i], str(i + 1)
        for k in range(-FAR, FAR + 1):
            if k == 0:
                continue
            # move a line up or down
            if L[1]:
                tries.append((move("si.shift", line=n, k=k), pair(line(L[0], L[1], L[2] - k * L[1]), M)))
            # make a line steeper or flatter
            if L[1]:
                tries.append((move("si.tilt", line=n, k=k), pair(line(L[0] - k * L[1], L[1], L[2]), M)))
            # slide a line so the crossing moves k steps along the other line
            if f["D"]:
                g = gcd(M[0], M[1])
                dx, dy = k * M[1] // g, -k * M[0] // g
                tries.append((move("pair.slide", line=n, k=k), pair(line(L[0], L[1], L[2] - L[0] * dx - L[1] * dy), M)))
            # add k times the other equation to this one (the answer stays)
            a, b, c = L[0] + k * M[0], L[1] + k * M[1], L[2] + k * M[2]
            if (a or b) and gcd(gcd(a, b), c) == 1:
                tries.append((move("pair.combine", line=n, k=k), pair(line(a, b, c), M)))
        # reflect a line in the other line (the answer stays)
        n2, d = M[0] * M[0] + M[1] * M[1], L[0] * M[0] + L[1] * M[1]
        tries.append((move("pair.reflect", line=n), pair(line(n2 * L[0] - 2 * d * M[0], n2 * L[1] - 2 * d * M[1], n2 * L[2] - 2 * d * M[2]), M)))
        # turn a line a quarter turn about the crossing
        if f["D"]:
            tries.append((move("pair.quarter", line=n), pair(line(-L[1] * f["D"], L[0] * f["D"], L[1] * f["nx"] - L[0] * f["ny"]), M)))
    options = [(plan, score(S2, TIE)) for plan, S2 in tries if S2 is not None]   # each step and the score it reaches
    # A promise: on these pairs, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(S, TIE), QUOTES)
