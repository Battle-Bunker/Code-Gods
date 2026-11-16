# Prime Intercept · Simple
# Main part: the prime ending in k nearest the y-intercept, the bigger the better. Secondary preference: whichever you were dealt (how close the y-intercept is to that prime; how close the gradient is to 1 over that prime, in doublings).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: add the seq.step line from the Thorough starter: a third way to change the line.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    x = abs(c)                                       # the y-intercept's size
    n = near(x, prime, p["ends"])                    # the prime ending in p["ends"] nearest it: bigger is better
    main = n
    # main: the prime ending in the rule's digit nearest the y-intercept's size, the bigger the better
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "closeness":   # how close the reading is to that target: nearer is better
            return -abs(x - n)
        if t == "gradient-log":   # the gradient's size times the target should be near 1, counted in doublings
            return None if m == 0 else -doublings(m, n)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines your agent skips, e.g. [19] or [4, 9]: others may still move them
PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
    if saving(offer):   # under 10 s of your income in hand: save up for a move (the game still tells you the line)
        return None
    # A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
    contested(offer, 3)
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    # A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
    if m == None:
        return climb(offer, [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tips(offer) if offer.object not in PROTECT or fair(offer, plan)], None, QUOTES)
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = score_each(tries, lambda t: (t[0], score(t[1], t[2], p, tie)))   # each step and the score it reaches (fewer on a big line)
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
