# Ruler · Simple
# Main part: distance² from (0, 0) close to a square. Tie-breaker: whichever you were dealt (that whole distance; the gradient close to a prime; the triangle's area close to a square).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: add the seq.step line from the Thorough starter: a third way to change the line.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0:                                      # a flat line: the rule wants a sloping one
        return None
    d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared
    sq = near(d2, square) or 1                      # the square number nearest it (1 at the least)
    main = -abs(d2 - sq)
    far = root(sq)                                  # that square's root: a whole distance
    # main: how far the distance from (0, 0), squared, is from a square number (closer is better)
    if tie == "far":   # a bigger whole distance is better
        return [main, far]
    if tie == "prime-gradient":   # a gradient close to a prime is better
        mp = near(m, prime)                        # the prime nearest the gradient
        return [main, -abs(m - mp)]
    if tie == "square-area":   # a triangle whose area is close to a square number is better
        area = c * c / (2 * abs(m))                # the triangle cut off the axes (none when c = 0)
        return [main, None if c == 0 else -abs(area - near(area, square))]
    return [main]


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
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
    tries += rounding(m, c)   # on a line with fractions: to a whole number, by one part, or stretched
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
