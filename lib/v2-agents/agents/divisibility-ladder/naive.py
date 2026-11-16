# Divisibility Ladder · Naive (for learning)
# Main part: a run of y-values each divisible by its position: y(1) by 1, y(2) by 2, …. Secondary preference: whichever you were dealt (the factor y(n) shares with n where the run stops).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if c == 0:                                      # through (0, 0): the rule wants a line that is not
        return None
    run, n, y = 0, 1, m + c                         # the run of n dividing y(n); it stops at n, with y = y(n)
    while y.denominator == 1 and y.numerator % n == 0:
        run, n = run + 1, n + 1
        y = m * n + c
    lv = 0
    while (lv + 1) * (lv + 2) // 2 <= run:          # level L needs L(L + 1)/2 of the run (1, 3, 6, 10, ...)
        lv += 1
    main = lv + Fraction(run - lv * (lv + 1) // 2, lv + 1)
    # main: how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better, a ladder with no top; each extra counts for less: level L needs L(L + 1)/2)
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "next-rung":   # where the run stops, at n: a bigger number dividing both n and y(n) is better (0 if y(n) is not whole)
            return common(y, n) if y.denominator == 1 else 0
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
