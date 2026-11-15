# Forty-Five · Naive (for learning)
# Main part: 45° at whole x and y, |x| + |y| on your pattern. Tie-breaker: whichever you were dealt (that |x| + |y| shares a factor with the number you divide by; the y-intercepts' gap near a multiple of that |x| + |y|).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    mod1 = lambda n: abs(int(n)) or 1   # |n|, at least 1
    if f.D == 0:   # parallel lines never cross: no score
        return None
    main, S = ladder(abs(f.x) + abs(f.y), p["q"], p["r"], f.off45 + dist(f.x))   # 45 degrees at a grid point, |x| + |y| on your ladder
    # main: the corner's level: 45 degrees at a grid point, |x| + |y| on your ladder (higher is better)
    if tie == "corner-divisor":   # a corner whose |x| + |y| shares a big factor with the number you divide by is better
        return [main, common(S, f.D)]
    if tie == "corner-gap":   # a y-intercepts' gap near a multiple of the corner's |x| + |y| (not 0) is better
        return [main, None if f.ygap is None else -off_multiple(f.ygap, mod1(S))]
    return [main]


FAR = 4      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["turn","slide","translate"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom


def agent(offer):
    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each
    rule = goal(offer)          # your rule (free)
    p, tie = rule.params, rule.tie_breaker
    tries = pair_steps(L, FAR, KINDS)   # (plan, lines after): moves tried in the agent's own head
    top, plans = score(L, p, tie), []
    for plan, L2 in tries:
        s = score(L2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
