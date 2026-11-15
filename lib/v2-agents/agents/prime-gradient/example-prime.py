# Prime Gradient · Example: the size of that prime
# Main part: gradient close to the dealt prime. Tie-breaker: the size of that prime.
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change FAR = 3 to 2: shorter steps cost less; does it still jump past wider gaps between primes?


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    s = p.get("side", 1)                           # 1, or -1 on the mirror: minus a prime
    nearest = near(s * m, prime, p["ends"])         # the prime ending in p["ends"] nearest the gradient (times s)
    if nearest is None:                             # none within 10,000: hopeless
        return None
    main = -abs(s * m - nearest)
    return [main, nearest]   # main: how far the gradient is from the nearest prime ending in the rule's digit (closer is better); tie-breaker: a bigger prime is better


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
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
    m, c, p = v.m, v.c, rule.params
    # A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
    if m == None:
        return climb(offer, [(plan, score(m2, c2, p)) for plan, m2, c2 in tips(offer) if offer.object not in PROTECT or fair(offer, plan)], None, QUOTES)
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p), QUOTES)
