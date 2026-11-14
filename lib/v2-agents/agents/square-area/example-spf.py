# Square Area · Example: that square's root's smallest prime factor
# Main part: area close to a square number. Tie-breaker: that square's root's smallest prime factor.
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: add the "stretch" lens from the Thorough starter.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0 or c == 0:                            # no triangle: the worst score
        return None
    area = c * c / (2 * abs(m))
    sq = near(area, square)                         # the square number nearest the area
    if sq is None:                                  # none within 10,000: hopeless
        return None
    main = -abs(area - sq)
    f = factors(root(sq))                           # the prime factors of that square's root
    return [main, f[0] if f else 1]   # main: how far the triangle's area is from a square number (closer is better); tie-breaker: a root whose smallest prime factor is big is better


FAR = 4      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
TARGET = None   # a line every player agreed on, e.g. {"m": -1, "c": 59} for y = -x + 59: lines go there and stay
SETTLE = []     # the lines to settle at TARGET, e.g. [2, 5]; [] means every line


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
    if TARGET is not None and (not SETTLE or offer.object in SETTLE):   # a deal: bring the line to TARGET, then hold it
        return settle(offer, TARGET)
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
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
    top, plans = score(m, c, p), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    # A promise: on these lines, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        plans = [plan for plan in plans[:QUOTES] if fair(offer, plan)]
    if not plans:
        return None
    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best
    return plan
