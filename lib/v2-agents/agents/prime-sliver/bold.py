# Prime Sliver · Bold
# Main part: the gradient 1 over a high power of the dealt prime p. Secondary preference: whichever you were dealt ().
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change FAR = 4 to 2: shorter steps, cheaper moves.


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
    if m == 0:
        return None                                   # a flat gradient has no bottom worth scoring
    d, e = m.denominator, 0
    while d % p["p"] == 0:                             # how many p's divide the bottom
        d //= p["p"]
        e += 1
    main = e * math.log2(p["p"]) - math.log2(d) - math.log2(abs(m.numerator))
    # main: log2 p for each p dividing the gradient's bottom, less the binary digits of the rest of the bottom and of the top (bigger is better)
    def tier(t):   # each secondary, in order (None: ranks last)
        return None   # none described (a family with no tie-breakers)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 4      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines your agent skips, e.g. [19] or [4, 9]: others may still move them
PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
    if saving(offer):   # under 10 s of your income in hand: save up for a move
        return None
    # A tug-of-war (another player taking back your gains on this line, 3 times lately): tell your owner.
    contested(offer, 3)
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    # (plan, m after, c after): whole-number steps on one lens, tried in the agent's own head
    tries = lens_steps(m, c, FAR)
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most for its price, weighing the QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
