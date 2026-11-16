# Same on Both Rulers (tuple) · Naive (for learning)
# Main part: the nearest target's size, the bigger the better. Secondary preference: whichever you were dealt (how close to that target; the gradient near the palindrome's digit sum; the y-intercept near a multiple of 11).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m == p["meets"]:                              # parallel to y = meets·x: they never meet
        return None
    x = abs(c / (p["meets"] - m))                    # where the line meets y = meets·x, ignoring a minus sign
    n = nearest_palindrome(x, p["digits"] == "odd")         # the palindrome nearest it: bigger is better
    main = n
    # main: the palindrome with the rule's count of digits nearest where the line meets y = x (or y = -x), the bigger the better
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "closeness":   # how close the reading is to that target: nearer is better
            return -abs(x - n)
        if t == "gradient-digits":   # the gradient's size should be near the palindrome's digits added up
            return -abs(abs(m) - sum(int(d) for d in str(n)))
        if t == "intercept-multiple":   # the y-intercept's size should be near a multiple of 11
            return -to_multiple(abs(c), 11)
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
