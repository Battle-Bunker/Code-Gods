# Prime Gradient · Naive (for learning)
# Main part: gradient close to the dealt prime. Tie-breaker: whichever you were dealt (the size of that prime; the y-intercept close to such a prime too; the y-intercept's smallest prime factor; the y-intercept's largest prime factor).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    s = p.get("side", 1)                           # 1, or -1 on the mirror: minus a prime
    nearest = near(s * m, prime, p["ends"])         # the prime ending in p["ends"] nearest the gradient (times s)
    if nearest is None:                             # none within 10,000: hopeless
        return None
    main = -abs(s * m - nearest)
    # main: how far the gradient is from the nearest prime ending in the rule's digit (closer is better)
    if tie == "prime":   # a bigger prime is better
        return [main, nearest]
    if tie == "cPrime":   # a y-intercept close to such a prime too is better
        cp = near(s * c, prime, p["ends"])         # the prime ending in p["ends"] nearest the y-intercept (times s)
        return [main, -abs(s * c - cp)]
    if tie == "c-spf":   # the y-intercept's smallest prime factor big is better
        fc = factors(c) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fc[0] if fc else 1]
    if tie == "c-gpf":   # the y-intercept's largest prime factor big is better
        fc = factors(c) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fc[-1] if fc else 1]
    return [main]


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
        tries.append((move("si.tilt", k=k), m + k, c) if den == 0 else (move("rot.turn", centre=0, turn=k), (m + k) / den, c))   # turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
