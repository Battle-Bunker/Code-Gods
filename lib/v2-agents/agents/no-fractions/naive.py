# No Fractions · Naive (for learning)
# Main part: the number you divide by is the dealt one. Tie-breaker: whichever you were dealt (the answer's distance is a big prime; the answer's distance shares a factor with the steeper gradient).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    if f.x is None:   # parallel lines never cross: no score
        return None
    main = -abs(abs(f.D) - p["k"])
    # main: how far the number you divide by is from your number k (closer is better)
    if tie == "answer-prime":   # |X| + |Y| with a big smallest prime factor is better
        return [main, spf(abs(f.X) + abs(f.Y))]
    if tie == "answer-gradient":   # |X| + |Y| sharing a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(abs(f.X) + abs(f.Y), abs(f.ms) // 1)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["combine","turn"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter


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
