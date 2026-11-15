# Whole Crossing · Naive (for learning)
# Main part: the x-axis crossing on a ladder of 5s. Tie-breaker: whichever you were dealt (the biggest number dividing both that number after its 5s, plus 1, and the gradient's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        x = c                                          # it stands on the x-axis at x = c
        # The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, ... times t). The nearest such number, any level,
        # in whole numbers: x = n/dd, and every distance is counted in 1/dd.
        n, dd, r = x.numerator, x.denominator, p["r"]
        best, j, s = None, 0, 1
        while True:
            D = dd * s
            t = r + 5 * ((2 * (n - r * D) + 5 * D) // (10 * D))   # the nearest t leaving r at this level (halfway: up)
            if 2 * (t * D - n) == 5 * D and abs(t - 5) <= abs(t):   # halfway: the smaller
                t -= 5
            dist = abs(n - s * t * dd)                  # the nearer wins; on a tie the higher level
            if best is None or dist <= best[2]:
                best = (j, t, dist)
            if s * dd - abs(n) > best[2]:               # every further level is farther
                break
            j, s = j + 1, s * 5
        L = 0
        while (L + 1) * (L + 2) // 2 <= best[0]:      # level L needs L(L + 1)/2 fives (1, 3, 6, 10, ...)
            L += 1
        main = L + Fraction(best[0] - L * (L + 1) // 2, L + 1) if best[2] == 0 else -Fraction(best[2], dd)   # on the ladder: its level; else below them all
        return [main] + [None for t in (tie.split(">") if tie else [])]
    if m == 0:                                      # a flat line never crosses: the worst score
        return None
    x = -c / m                                     # where y = mx + c crosses the x-axis
    # The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, ... times t). The nearest such number, any level,
    # in whole numbers: x = n/dd, and every distance is counted in 1/dd.
    n, dd, r = x.numerator, x.denominator, p["r"]
    best, j, s = None, 0, 1
    while True:
        D = dd * s
        t = r + 5 * ((2 * (n - r * D) + 5 * D) // (10 * D))   # the nearest t leaving r at this level (halfway: up)
        if 2 * (t * D - n) == 5 * D and abs(t - 5) <= abs(t):   # halfway: the smaller
            t -= 5
        dist = abs(n - s * t * dd)                  # the nearer wins; on a tie the higher level
        if best is None or dist <= best[2]:
            best = (j, t, dist)
        if s * dd - abs(n) > best[2]:               # every further level is farther
            break
        j, s = j + 1, s * 5
    L = 0
    while (L + 1) * (L + 2) // 2 <= best[0]:      # level L needs L(L + 1)/2 fives (1, 3, 6, 10, ...)
        L += 1
    main = L + Fraction(best[0] - L * (L + 1) // 2, L + 1) if best[2] == 0 else -Fraction(best[2], dd)   # on the ladder: its level; else below them all
    # main: the level of 5s the line's x-axis crossing holds when it is a whole number leaving r after its 5s are divided out (level L needs L(L + 1)/2 fives; more is better: a ladder with no top), else minus how far it is from the nearest such number
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "shared-factor":   # take that number with its 5s divided out, ignore its sign and add 1: a bigger number dividing both it and the gradient's whole part is better
            t1, wm = abs(best[1]) + 1, whole(abs(m) - Fraction(1, 2))   # |t| + 1, and the gradient's whole part ignoring sign
            return common(t1, wm)
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
