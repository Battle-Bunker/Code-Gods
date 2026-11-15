# Ruler · Naive (for learning)
# Main part: distance² from (0, 0) on as big a product of two same-length primes as possible. Tie-breaker: whichever you were dealt (the smaller prime times the gradient squared close to the bigger prime; the first non-prime stepping from the smaller prime by the y-intercept's whole part, as nearly prime as possible; the height at x = the smaller prime, rounded down, divisible by the bigger prime many times).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


# Two different primes with the same number of digits whose product is n (143 = 11 x 13): (p, q), else None. Exact up
# to 20 digits (Pollard's rho finds a factor); past that rho gives up after 16384 steps, as the game's does.
def rho(n, c, budget):
    x = y = 2
    done = 0
    while done < budget:
        x0, y0, prod = x, y, 1
        for _ in range(32):
            x = (x * x + c) % n
            y = (y * y + c) % n
            y = (y * y + c) % n
            prod = prod * abs(x - y) % n
        g = common(prod, n) if prod else n
        if g == 1:
            done += 32
            continue
        if g == n:
            x, y = x0, y0
            for _ in range(32):
                x = (x * x + c) % n
                y = (y * y + c) % n
                y = (y * y + c) % n
                g = common(x - y, n) if x != y else n
                if g != 1:
                    break
        return None if g in (1, n) else g
    return None

def pq(n):
    n = int(n)
    if n < 6:
        return None
    def pair(a):
        s, t = sorted((a, n // a))
        return (s, t) if s != t and len(str(s)) == len(str(t)) and prime(s) and prime(t) else None
    for d in range(2, 2000):                    # its smallest prime factor
        if n % d == 0:
            return pair(d)
    if n < 4000000 or prime(n):
        return None
    if n < 10000000000:
        d = 2001
        while d * d <= n:
            if n % d == 0:
                return pair(d)
            d += 2
        return None
    exact = len(str(n)) <= 20
    for c in range(1, 65 if exact else 2):
        g = rho(n, c, float("inf") if exact else 16384)
        if g is not None:
            return pair(g)
    return None

# The rung: the product ending in `ends` that d2 rounds down to, else the nearest one's window (the lower on a tie; past
# 14 digits the nearest other number ending in `ends`, as the game grades it). (that number, its primes or None, main)
def rung_of(d2, ends):
    x = d2 - Fraction(1, 2)
    n0 = whole(x)                               # d2 rounded down
    level = lambda n: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(n, 10 ** D)) / (L + 1))(len(str(n)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(n))))   # levels of digits: level L needs L(L + 1)/2
    if n0 > 0 and n0 % 10 == ends and pq(n0):
        return n0, pq(n0), level(n0)
    f = whole(x - Fraction(1, 2))               # x rounded down
    lo = f - (f - ends) % 10
    hi = lo + 10
    nearer = lambda a, b: x - a <= b - x        # a (below x) at least as near as b (above)
    if len(str(n0)) > 14:
        lo -= 10 if lo == n0 else 0
        hi += 10 if hi == n0 else 0
        n = lo if nearer(lo, hi) else hi
    else:
        while True:
            below = lo >= 6 and nearer(lo, hi)
            n = lo if below else hi
            if pq(n):
                break
            if below:
                lo -= 10
            else:
                hi += 10
    return n, pq(n), -(abs(x - n) - Fraction(1, 2))

# The smallest prime factor of n (n itself when prime), as the game finds it: rho splits n until every part is prime.
def smallest(n):
    for d in range(2, 2000):
        if n % d == 0:
            return d
    if prime(n):
        return n
    exact = len(str(n)) <= 20
    for c in range(1, 65 if exact else 2):
        g = rho(n, c, float("inf") if exact else 16384)
        if g is not None:
            return min(smallest(g), smallest(n // g))
    return n

# p, p + w, p + 2w, ... (p the smaller prime, w the y-intercept's whole part): the first that is not prime, its smallest
# prime factor (0 when w is 0 or 256 steps stay prime); None without the two primes.
def near_miss(two, c):
    if two is None:
        return None
    w = whole(abs(c) - Fraction(1, 2))          # |c| rounded down
    for j in range(1, 257 if w > 0 else 1):
        if not prime(two[0] + j * w):
            return smallest(two[0] + j * w)
    return 0

# The height at x = p, rounded down (its size): how many times q divides it (0 for 0); None without the two primes.
def at_index(two, m, c):
    if two is None:
        return None
    h, j = whole(abs(m * two[0] + c) - Fraction(1, 2)), 0
    while h > 0 and h % two[1] == 0:
        h, j = h // two[1], j + 1
    return j

def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        rung, two, main = rung_of(c * c, p["ends"])        # its distance from (0, 0) is |c|
        return [main] + [None for t in (tie.split(">") if tie else [])]
    d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared
    rung, two, main = rung_of(d2, p["ends"])         # the product it rounds down to (or the nearest one's window), its two primes
    # main: the product of two different same-length primes ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "closeness":   # the smaller prime times the gradient squared, as close as possible to the bigger prime (never equal: the closer the better, without end)
            return None if two is None else -abs(two[0] * m * m - two[1])
        if t == "near-miss":   # from the smaller prime, keep adding the y-intercept's whole part: the first number that is not prime should have as big a smallest prime factor as possible
            return near_miss(two, c)
        if t == "reading-at-index":   # the height at x = the smaller prime, rounded down: divisible by the bigger prime as many times as possible
            return at_index(two, m, c)
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
        t0, u, r = [(3, 4, 5), (4, 3, 5), (5, 12, 13), (12, 5, 13)][(abs(k) - 1) % 4]; t = t0 if k > 0 else -t0; du = u - m * t
        if du != 0: tries.append((move("rot.turn", centre="origin", turn=Fraction(t, u)), (m * u + t) / du, c * r / du))   # turn the line about (0, 0) by the angle whose tangent is t/u (its distance from (0, 0) stays)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
