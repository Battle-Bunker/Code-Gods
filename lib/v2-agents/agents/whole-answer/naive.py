# Whole Answer · Naive (for learning)
# Main part: the answer's y on your pattern. Secondary preference: whichever you were dealt (the answer's x near a multiple of its y; the answer's |x| + |y| has a big smallest prime factor; the answer's y, without its factors of your number, shares a factor with the steeper gradient).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, secondary]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    floor = lambda v: v // 1   # rounded down
    mod1 = lambda n: abs(int(n)) or 1   # |n|, at least 1
    core = lambda n: core(abs(int(n)) // p["q"]) if n and abs(int(n)) % p["q"] == 0 else abs(int(n))   # without its factors of q
    if f.x is None:   # parallel lines never cross: no score
        return None
    main, Yv = valuation_ladder(f.y, p["q"], p["r"], dist(f.x))   # y on your ladder, x near a whole number
    # main: the answer's level: whole numbers, y on your ladder (higher is better)
    if tie == "x-multiple":   # an answer whose x is near a multiple of its y (not 0) is better
        return [main, -off_multiple(f.x, mod1(Yv))]
    if tie == "sum-prime":   # an answer whose |x| + |y| has a big smallest prime factor is better
        return [main, spf(abs(f.X) + abs(Yv))]
    if tie == "y-steep":   # y's number (without its factors of q) sharing a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(core(Yv), abs(f.ms) // 1)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["slide","turn","stretch"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom


def agent(offer):
    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each
    rule = goal(offer)          # your rule (free)
    p, tie = rule.params, rule.tie_breaker
    # Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
    tries = pair_steps(L, FAR, KINDS, [f for f in (p.get("q"), p.get("k")) if f])   # (plan, lines after): moves tried in the agent's own head
    top, plans = score(L, p, tie), []
    for plan, L2 in tries:
        s = score(L2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
