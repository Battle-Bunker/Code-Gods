# Power Area · Naive (for learning)
# Main part: the power of k nearest the area, the higher the better. Secondary preference: whichever you were dealt (how close the area is to that power; how close the area over the x-crossing is to a multiple of k).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m == 0 or c == 0:                             # no triangle with the axes
        return None
    x = c * c / (2 * abs(m))                         # the area the line cuts off the axes
    j, at, K = 0, 1, p["k"]
    while at * K <= x:                               # the powers of k at or below the area
        at, j = at * K, j + 1
    if at * K - x <= x - at:                         # the nearer of the two (the higher on a tie)
        at, j = at * K, j + 1
    n, main = at, j                                  # the power of k nearest the area: the higher, the better
    # main: the power of k nearest the area the line cuts off the axes, the higher the better
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "closeness":   # how close the reading is to that target: nearer is better
            return -abs(x - n)
        if t == "per-crossing":   # the area over the x-crossing should be near a multiple of k
            return -to_multiple(x / abs(c / m), p["k"])
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
