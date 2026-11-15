# Prime Gradient · Naive (for learning)
# Main part: the gradient rounding to as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both that prime plus 1 and the y-intercept's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2
    s = p.get("side", 1)
    x = s * m                                       # the gradient, or minus it on the mirror
    rung = near(x, prime, p["ends"])                # the prime ending in p["ends"] nearest: the rung
    if rung is None:                                # none within 10,000: hopeless
        return None
    gap = abs(x - rung)                             # on the rung when it rounds there (within 1/2, ties up)
    main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the prime ending in the rule's digit the gradient rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "shared-factor":   # take the number just after that prime: a bigger number dividing both it and the y-intercept's whole part is better
            wc = whole(abs(c) - Fraction(1, 2))           # the y-intercept's whole part, ignoring sign
            return common(rung + 1, wc)
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
        den = 1 - m * k
        if den != 0: tries.append((move("rot.turn", centre=0, turn=k), (m + k) / den, c))   # turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
