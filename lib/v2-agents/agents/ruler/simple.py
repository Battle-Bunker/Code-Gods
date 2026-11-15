# Ruler · Simple
# Main part: distance² from (0, 0) on as big a product of two same-length primes as possible. Tie-breaker: whichever you were dealt (the smaller prime times the gradient squared close to the bigger prime).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: add the seq.step line from the Thorough starter: a third way to change the line.


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
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
    if saving(offer):   # under 10 s of your income in hand: save up for a move (the game still tells you the line)
        return None
    # A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
    contested(offer, 3)
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    if m == None:              # a vertical line (x = k): tip it into y = mx + c, or slide it sideways
        m, c = None, look(offer, "crossing").x0   # where it stands: score(None, k) reads the line x = k
        tries += vertical(offer, FAR)   # its tips into y = mx + c and its slides sideways
    else:
        for k in range(-FAR, FAR + 1):
            if k == 0:
                continue
            tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
            tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
            t0, u, r = [(3, 4, 5), (4, 3, 5), (5, 12, 13), (12, 5, 13)][(abs(k) - 1) % 4]; t = t0 if k > 0 else -t0; du = u - m * t
            if du != 0: tries.append((move("rot.turn", centre="origin", turn=Fraction(t, u)), (m * u + t) / du, c * r / du))   # turn the line about (0, 0) by the angle whose tangent is t/u (its distance from (0, 0) stays)
        # The next rung up (the ladder has no top): the next product of two same-length primes ending in p["ends"] above the
        # distance², aiming at the middle of its window (t + 1/2), by a shift that keeps the gradient (c² = (m² + 1)·d², to the
        # nearest half) or a tilt that keeps the y-intercept (m² = c²/d² − 1, to the nearest half, third or quarter).
        m1 = m * m + 1
        t = whole(c * c / m1 - Fraction(1, 2)) + 1    # past the distance², rounded down
        while t % 10 != p["ends"]:
            t += 1
        for _ in range(300):
            if len(str(t)) > 14:
                break
            if pq(t):
                mid = t + Fraction(1, 2)                # the middle of its window
                h0 = root(whole(4 * m1 * mid))         # 2·√((m² + 1)·mid), rounded down: c to the nearest half
                for h in (h0, h0 + 1):
                    c2 = (-1 if c < 0 else 1) * Fraction(h, 2)
                    tries.append((move("si.shift", k=c2 - c), m, c2))
                s2 = c * c / mid - 1                    # the gradient squared that puts the line there, keeping c
                if s2 > 0:
                    for d in (2, 3, 4):
                        m2 = (-1 if m < 0 else 1) * Fraction(root(whole(d * d * s2)), d)
                        if m2 != m:
                            tries.append((move("si.tilt", k=m2 - m), m2, c))
                break
            t += 10
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
