# Divisibility Ladder · Example: the gradient's smallest prime factor
# Main part: a run of n dividing y(n). Tie-breaker: the gradient's smallest prime factor.
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
# back again and again) scores nothing for either of you: it walks away from one and leaves you a note so you can
# talk to that player. It never spends more than a quarter of its energy on one move.
# Try this: change FAR = 6 to 12: the run needs c a multiple of 27720, so big jumps help.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if c == 0:                                      # through (0, 0): the rule wants a line that is not
        return None
    main = 0
    for n in range(1, 13):                          # the run of n dividing y(n)
        y = m * n + c
        if y.denominator != 1 or y.numerator % n != 0:
            break
        main += 1
    fm = factors(m) or []                           # the gradient's prime factors ([] for 0, 1, -1)
    return [min(main, 11), fm[0] if fm else 1]   # main: how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better); tie-breaker: the gradient's smallest prime factor big is better


FAR = 6      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
SPEND = 0.25    # never spend more than a quarter of your energy on one move


def agent(offer):
    # A tug-of-war (another player taking back your gains on this line, 3 times lately) only burns energy on
    # both sides: leave the line, with a note telling your owner to talk to that player.
    if contested(offer, 3):
        return None
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
