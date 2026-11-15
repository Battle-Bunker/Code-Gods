# Smooth Intercept · Naive (for learning)
# Main part: the y-intercept made of as many of the dealt primes as possible. Tie-breaker: whichever you were dealt (the factor that number plus 1 shares with the gradient's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    a = abs(c)
    s = near_made_of(a, p["primes"])               # the nearest rung: made only of the rule's primes
    main = -abs(a - s)                              # off every rung: below them all
    if a == s:                                      # on a rung: the dealt primes multiplied (omega), in levels
        omega, level = len(factors(s)), 0
        while (level + 1) * (level + 2) // 2 <= omega:   # level L needs L(L + 1)/2 of them
            level += 1
        main = level + (omega - level * (level + 1) // 2 + Fraction(1, 2 + s)) / (level + 1)
    # main: how many of the rule's primes the y-intercept (ignoring sign) is made of, in levels that each need one more than the last (more is better: a ladder with no top; of two with as many, the smaller), else minus how far it is from the nearest such number
    if tie == "shared-factor":   # take the number just after that number: a bigger number dividing both it and the gradient's whole part is better
        wm = whole((2 * m - 1) / 2)                # the gradient's whole part (rounded down)
        return [main, common(s + 1, wm)]
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
        f = k + 1 if k > 0 else k - 1
        tries.append((move("mach.stretch", f=f), m * f, c * f))   # multiply every output by f (m and c both)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
