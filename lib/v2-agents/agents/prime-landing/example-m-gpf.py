# Prime Landing · Example: the gradient's largest prime factor
# Main part: the y-intercept close to a prime. Tie-breaker: the gradient's largest prime factor.
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and change the agent to keep it. It never spends more than a quarter of its energy on one move.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change FAR = 8 to 16: tilting never moves the y-intercept, so the landing stays.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    landing = near(c, prime)                        # the prime nearest the y-intercept
    main = -abs(c - landing)
    fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fm[-1] if fm else 1]   # main: how far the y-intercept is from the nearest prime (closer is better); tie-breaker: the gradient's largest prime factor big is better


FAR = 8      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
SPEND = 0.25    # never spend more than a quarter of your energy on one move
LEAVE = []      # lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
    # A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
    contested(offer, 3)
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p = v.m, v.c, rule.params
    if m == None:              # a vertical line has no y = mx + c: skip
        return None
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
    top, plans = score(m, c, p), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    if not plans:
        return None
    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best
    if plan is None or price(offer, plan) > energy(offer) * SPEND:   # too dear: keep the energy for more turns
        return None
    return plan
