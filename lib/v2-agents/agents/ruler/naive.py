# Ruler · Naive (for learning)
# Main part: distance² from (0, 0) on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the first non-prime stepping from that prime by the y-intercept's whole part, as nearly prime as possible; the gradient squared close to that prime; the height at x = that prime, rounded down, ending in that prime repeated; the factor that prime minus 1 shares with the y-intercept's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


# Pollard's rho (x -> x^2 + c mod n, from 2), batches of 32 steps between gcds: a proper factor of n, or None, as the game's.
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

# p, p + w, p + 2w, ... (p the prime, w the y-intercept's whole part): the first that is not prime, its smallest prime
# factor (0 when w is 0 or 256 steps stay prime).
def near_miss(p, c):
    p, w = int(p), whole(abs(c) - Fraction(1, 2))   # |c| rounded down
    for j in range(1, 257 if w > 0 else 1):
        if not prime(p + j * w):
            return smallest(p + j * w)
    return 0

# The height at x = p, rounded down (its size): how many of its last digits follow p written again and again.
def at_index(p, m, c):
    h, ps, j = str(whole(abs(m * p + c) - Fraction(1, 2))), str(int(p)), 0
    while h != "0" and j < len(h) and h[-1 - j] == ps[-1 - j % len(ps)]:
        j += 1
    return j

def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        d2 = c * c                                      # its distance from (0, 0), squared
        x = d2 - Fraction(1, 2)
        rung = near(x, prime, p["ends"])
        gap = abs(x - rung)
        level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
        main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
        return [main] + [None for t in (tie.split(">") if tie else [])]
    d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared
    x = d2 - Fraction(1, 2)                         # d2 rounds down to n when x rounds to n (ties up)
    rung = near(x, prime, p["ends"])                # the prime ending in p["ends"] nearest there: the rung
    gap = abs(x - rung)                             # on the rung when d2 rounds down to it
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the prime ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "near-miss":   # from that prime, keep adding the y-intercept's whole part: the first number that is not prime should have as big a smallest prime factor as possible
            return near_miss(rung, c)
        if t == "closeness":   # the gradient squared, as close as possible to that prime (never equal: the closer the better, without end)
            return -abs(m * m - rung)
        if t == "reading-at-index":   # the height at x = that prime, rounded down, should end in that prime written again and again, as many digits as possible
            return at_index(rung, m, c)
        if t == "shared-factor":   # that prime minus 1 and the y-intercept's whole part: a bigger factor shared is better
            wc = whole((2 * abs(c) - 1) / 2)          # the y-intercept's whole part, ignoring its sign
            return common(rung - 1, wc)
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
