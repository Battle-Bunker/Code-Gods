# Steep Ratio · Naive (for learning)
# Main part: one line a whole number of times as steep as the other, with the dealt remainder. Tie-breaker: whichever you were dealt (that number shares a factor with the y-intercepts' gap; that number is a big prime).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    if f.ratio is None:   # no ratio of gradients: no score
        return None
    k = nearest_leaving(f.ratio, p["q"], p["r"], 2)   # the whole number of times with your remainder (at least 2 either way)
    main = -abs(f.ratio - k)
    # main: how far the steeper line is from a whole number of times as steep as the other, with your remainder (closer is better)
    if tie == "ratio-gap":   # that number sharing a big factor with the y-intercepts' gap is better
        return [main, None if f.ygap is None else common(k, whole(f.ygap))]
    if tie == "ratio-prime":   # that number with a big smallest prime factor is better
        return [main, spf(k)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["tilt","stretch"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter


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
