# Same on Both Rulers · Thorough
# Main part: the unchanged number close to T. Tie-breaker: whichever you were dealt (the gradient's smallest prime factor; the gradient's largest prime factor; the gradient far from 1).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and change the agent to keep it. It never spends more than a quarter of its energy on one move.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 1:                                      # x 1: no number stays unchanged
        return None
    fixed = c / (1 - m)                             # where y = mx + c meets y = x
    main = -abs(fixed - p["T"])
    # main: how far the number the machine leaves unchanged is from T (closer is better)
    if tie == "m-spf":   # the gradient's smallest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[0] if fm else 1]
    if tie == "m-gpf":   # the gradient's largest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[-1] if fm else 1]
    if tie == "steep":   # a gradient far from 1 is better
        return [main, abs(m - 1)]
    return [main]


FAR = 5      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)
SPEND = 0.25    # never spend more than a quarter of your energy on one move


def agent(offer):
    # A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
    contested(offer, 3)
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
        tries.append((move("seq.step", k=k), m + k, c - k))   # change the pattern's step, keeping y(1)
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
        tries.append((move("cart.pivot", x0=p["T"], k=k), m + k, c - k * p["T"]))   # turn the line about its point at x = T (if it crosses y = x there, it still does)
        f = k + 1 if k > 0 else k - 1
        tries.append((move("mach.stretch", f=f), m * f, c * f))   # multiply every output by f (m and c both)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
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
