# Stepping Coefficients · Naive (for learning)
# Main part: a, b, c going up in equal steps of d. Secondary preference: whichever you were dealt ().
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


# Number helpers for the rule's utility (decimal numbers; past 10^10 the rule gives no score).
import math
LIMIT = 1e10
def num(v):
    return v.numerator / v.denominator
def cube(d):
    return abs(d) * abs(d) * abs(d)
def is_prime_n(n):
    if n < 2 or n != int(n):
        return False
    n = int(n)
    if n % 2 == 0:
        return n == 2
    if n % 3 == 0:
        return n == 3
    i = 5
    while i * i <= n:
        if n % i == 0 or n % (i + 2) == 0:
            return False
        i += 6
    return True
# The nearest whole n >= 1 to x passing ok, stepping by `step` from f (ties: the lower).
def nearest_n(x, ok, f, step, reach):
    while f < 1:
        f += step
    lo = hi = None
    n, i = f, 0
    while n >= 1 and i < reach:
        if ok(n):
            lo = n
            break
        n -= step
        i += 1
    n, i = f + step, 0
    while i < reach:
        if ok(n):
            hi = n
            break
        n += step
        i += 1
    if lo is None:
        return hi
    if hi is None:
        return lo
    return lo if x - lo <= hi - x else hi
def suffix_floor(s, x):
    mod, e = 10 ** len(s), int(s)
    return math.floor((x - e) / mod) * mod + e
def prime_with(s):
    return lambda n: n < LIMIT and n % 10 ** len(s) == int(s) and is_prime_n(n)
def factors_n(n):
    out, x, p = [], abs(math.floor(n + 0.5)), 2
    while p * p <= x:
        while x % p == 0:
            out.append(p)
            x //= p
        p += 1
    if x > 1:
        out.append(x)
    return out

def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    # ax + by + c = 0 in whole numbers sharing no factor, b > 0 (y = mx + c is -m·x + y - c = 0).
    L0 = m.denominator * c.denominator // math.gcd(m.denominator, c.denominator)
    a, b, cc = -m.numerator * (L0 // m.denominator), L0, -c.numerator * (L0 // c.denominator)
    g = math.gcd(math.gcd(abs(a), b), abs(cc))
    a, b, cc = a // g, b // g, cc // g
    top = max(abs(a), abs(b), abs(cc))
    if top >= LIMIT:
        return None
    main = math.log2(top) - 2 * (abs((b - a) - p["k"]) + abs((cc - b) - p["k"]))
    # main: binary digits of the biggest of a, b, c, less twice how far each step is from d
    def tier(t):   # each secondary, in order (None: ranks last)
        return None   # none described (a family with no tie-breakers)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


def agent(offer):
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    if m == None:              # a vertical line has no y = mx + c: skip
        return None
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
