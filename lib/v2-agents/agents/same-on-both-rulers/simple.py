# Same on Both Rulers · Simple
# Main part: the unchanged number close to T. Tie-breaker: whichever you were dealt (the gradient far from 1; |c| close to a prime; different whole numbers among y(−5) … y(5); the lamp's height close to whole; the gradient's smallest prime factor; the gradient's largest prime factor).
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
    if m is None:              # the vertical line x = c
        main = -abs(c - p["T"])                        # x = c meets y = x at c
        return [main, None]
    if m == 1:                                      # x 1: no number stays unchanged
        return None
    fixed = c / (1 - m)                             # where y = mx + c meets y = x
    main = -abs(fixed - p["T"])
    # main: how far the number the machine leaves unchanged is from T (closer is better)
    if tie == "steep":   # a gradient far from 1 is better
        return [main, abs(m - 1)]
    if tie == "prime-start":   # a y-intercept (ignoring sign) close to a prime is better
        start = abs(c)                             # the y-intercept, ignoring its sign
        return [main, -abs(start - near(start, prime))]
    if tie == "whole-values":   # more different whole numbers among y(-5) ... y(5) is better
        wholes = {m * x + c for x in range(-5, 6) if (m * x + c).denominator == 1}   # y(-5) ... y(5)
        return [main, len(wholes)]
    if tie == "whole-lamp":   # a lamp height close to a whole number is better
        lamp = m / (m - 1)                         # the lamp's height m/(m - 1)
        return [main, -abs(lamp - whole(lamp))]
    if tie == "m-spf":   # the gradient's smallest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[0] if fm else 1]
    if tie == "m-gpf":   # the gradient's largest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[-1] if fm else 1]
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
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    if m == None:              # a vertical line (x = k): tip it into y = mx + c, or slide it sideways
        m, c = None, look(offer, "crossing").x0   # where it stands: score(None, k) reads the line x = k
        tries += vertical(offer, FAR)   # its tips into y = mx + c and its slides sideways
    else:
        for k in range(-FAR, FAR + 1):
            if k == 0:
                continue
            tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
            tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
