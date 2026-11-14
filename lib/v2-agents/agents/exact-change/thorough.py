# Exact Change · Thorough
# Main part: ways to pay close to the target. Tie-breaker: whichever you were dealt (the smaller pile in every way; the bill; both coins close to primes).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m >= 0:                                      # a coin worth -m*b: the line must go downhill
        return None
    X = -c / m                                      # where the line meets y = 0: x goes no further
    if X >= 100001:                                 # too many ways to count: no score
        return None
    b = m.denominator * Fraction(m.denominator, c.denominator).denominator   # the coin b: b*m and b*c whole
    ways = [x for x in range(X // 1 + 1) if (m * x + c).denominator == 1]   # the line's whole points with x, y >= 0
    main = -abs(len(ways) - p["ways"])
    # main: how far the number of ways to pay is from the target (closer is better)
    if tie == "big-piles":   # a bigger smaller pile, in every way to pay, is better
        if not ways:                               # no way to pay: no piles
            return [main, None]
        y = m * ways[-1] + c                       # the fewest coins of b
        return [main, min(ways[0], y)]
    if tie == "big-bill":   # a bigger bill N = b·c is better
        return [main, c * b]
    if tie == "prime-coins":   # both coins (a = -b·m and b) close to primes is better
        off = lambda x: abs(x - near(x, prime))    # how far x is from the nearest prime
        return [main, -(off(-m * b) + off(b))]
    return [main]


FAR = 3      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
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
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    # A promise: on these lines, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        plans = [plan for plan in plans[:QUOTES] if fair(offer, plan)]
    # Contested (another player's move lowered your points here): only moves that raise your own points.
    if hurt(offer):
        plans = [plan for plan in plans[:QUOTES] if pays(offer, plan, top)]
    if not plans:
        return None
    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best
    return plan
