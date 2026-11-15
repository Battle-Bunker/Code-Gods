# Far Crossing · Naive (for learning)
# Main part: the steeper line crosses the x-axis at a whole number. Tie-breaker: the steeper line crosses the x-axis far to the right.
# What it does: reads the pair once, tries changes in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think of it. It keeps fighting over a pair
# another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from;
# the other starters fix this.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


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
    # main: how far the steeper line's x-intercept is from a whole number (closer is better); tie-breaker: the steeper line crosses the x-axis far to the right
    f = facts(S)
    r = xint(S[f["s"]])
    if r is None:   # a flat steeper line never meets the x-axis
        return None
    return [-off(r), F(nearest(r) if tie == "far-right" else spf(nearest(r)))]


FAR = 1      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
TIE = "far-right"   # your rule's tie-breaker


def agent(offer):
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
    options = [(plan, score(S2, TIE)) for plan, S2 in tries if S2 is not None]   # each step and the score it reaches
    top, plans = score(S, TIE), []
    for plan, s in options:
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
