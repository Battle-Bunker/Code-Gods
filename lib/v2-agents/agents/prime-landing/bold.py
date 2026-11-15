# Prime Landing · Bold
# Main part: where the line lands on the x-axis, on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
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
    if m is None:              # the vertical line x = c
        x = p.get("side", 1) * c                      # it stands on the x-axis at x = c (minus that, on the mirror)
        landing = near(x, prime, p["ends"])             # the rung nearest there
        gap = abs(x - landing)
        main = landing if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
        return [main, None]
    if m == 0:                                      # a flat line never lands: the worst score
        return None
    x = p.get("side", 1) * (-c / m)                # where y = mx + c lands on the x-axis (minus that, on the mirror)
    landing = near(x, prime, p["ends"])             # the prime ending in p["ends"] nearest there: the rung
    gap = abs(x - landing)                          # on the rung when it rounds there (within 1/2, ties up)
    main = landing if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    if tie == "shared-factor":   # take the number just before that prime: a bigger number dividing both it and the y-intercept's whole part is better
        wc = whole((2 * c - 1) / 2)                # the y-intercept's whole part (rounded down)
        return [main, common(landing - 1, wc)]
    return [main]


FAR = 4      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)
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
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    if m == None:              # a vertical line (x = k): tip it into y = mx + c, or slide it sideways
        m, c = None, look(offer, "crossing").x0   # where it stands: score(None, k) reads the line x = k
        tries += vertical(offer, FAR)   # its tips into y = mx + c and its slides sideways
    else:
        for k in range(-FAR, FAR + 1):
            if k == 0:
                continue
            tries.append((move("si.shift", k=k), m, c + k))     # move the line up or down
            tries.append((move("si.tilt", k=k), m + k, c))      # make it steeper or flatter
            for j in range(-FAR, FAR + 1):                         # both at once
                if j != 0:
                    tries.append(([move("si.shift", k=k), move("si.tilt", k=j)], m + j, c + k))
        # The next rung up (the ladder has no top): the next prime ending in p["ends"] beyond where it lands, by a small tilt
        # that keeps the y-intercept (m = -c/X), or by a shift that keeps the gradient (c = -mX).
        if m != 0 and c != 0:
            x = p.get("side", 1) * (-c / m)
            t = near(x, prime, p["ends"]) + 10
            for _ in range(100):
                if prime(t):
                    to = p.get("side", 1) * t          # the landing that rounds to it (minus it, on the mirror)
                    tries.append((move("si.tilt", k=-c / to - m), -c / to, c))
                    tries.append((move("si.shift", k=-m * to - c), m, -m * to))
                    break
                t += 10
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
