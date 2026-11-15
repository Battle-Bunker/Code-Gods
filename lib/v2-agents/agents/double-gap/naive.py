# Gap Ratio · Naive (for learning)
# Main part: the y-intercepts' gap whole and your power times the x-intercepts' gap. Tie-breaker: whichever you were dealt (the number you divide by shares a factor with your next power; the y-intercepts' gap near a multiple of your next power).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    if f.ygap is None or f.xgap is None or f.origin:   # no gaps, or a line through (0, 0): no score
        return None
    main = power_ladder(p["k"], lambda t: dist(f.ygap) + abs(f.ygap - t * f.xgap))
    lv = level_of(main, p["k"]); N = p["k"] ** (lv * (lv + 1) // 2 + 1)   # your power reached, times k
    # main: the gaps' level: the y-intercepts' gap whole and k, k³, k⁶, … times the x-intercepts' gap (higher is better)
    if tie == "gap-divisor":   # the number you divide by sharing a big factor with k times your power reached is better
        return [main, common(f.D, N)]
    if tie == "gap-step":   # a y-intercepts' gap near a multiple of k times your power reached (not 0) is better
        return [main, -off_multiple(f.ygap, N)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["shift","tilt","stretch"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom


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
