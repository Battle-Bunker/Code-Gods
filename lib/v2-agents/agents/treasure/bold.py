# Treasure · Bold
# Main part: y(k) close to T. Tie-breaker: whichever you were dealt (different primes among y(1) … y(8); the gradient close to a prime; the y-intercept close to a square; the gradient's smallest prime factor; the gradient's largest prime factor).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change FAR = 4 to 2: shorter steps, cheaper moves.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    main = -abs(m * p["k"] + c - p["T"])           # y(k) = m*k + c
    # main: how far y(k) is from T (closer is better)
    if tie == "prime-terms":   # more different primes among y(1) ... y(8) is better
        primes = {m * x + c for x in range(1, 9) if prime(m * x + c)}   # y(1) ... y(8)
        return [main, len(primes)]
    if tie == "prime-gradient":   # a gradient close to a prime is better
        mp = near(m, prime)                        # the prime nearest the gradient
        return [main, -abs(m - mp)]
    if tie == "square-start":   # a y-intercept close to a square number is better
        sq = near(c, square)                       # the square number nearest the y-intercept (0 below it)
        return [main, -abs(c - sq)]
    if tie == "m-spf":   # the gradient's smallest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[0] if fm else 1]
    if tie == "m-gpf":   # the gradient's largest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[-1] if fm else 1]
    return [main]


FAR = 4      # how far one change may go
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
        tries.append((move("si.shift", k=k), m, c + k))     # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))      # make it steeper or flatter
        for j in range(-FAR, FAR + 1):                         # both at once
            if j != 0:
                tries.append(([move("si.shift", k=k), move("si.tilt", k=j)], m + j, c + k))
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
