# Smooth Intercept · Bold
# Main part: the y-intercept on as big a number of the dealt primes as possible. Tie-breaker: whichever you were dealt (the factor that number plus 1 shares with the gradient's whole part).
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
    a = abs(c)
    s = near(a, lambda n: n >= 2 and all(f in p["primes"] for f in factors(n)))   # the nearest rung
    if s is None:                                   # none within 10,000: hopeless
        return None
    main = a if a == s else -abs(a - s)             # on a rung: the rung; else below every rung
    # main: the y-intercept's size itself when it is made only of the rule's primes (bigger is better: a ladder with no top), else minus how far it is from the nearest such number
    if tie == "shared-factor":   # take the number just after that number: a bigger number dividing both it and the gradient's whole part is better
        wm = whole((2 * m - 1) / 2)                # the gradient's whole part (rounded down)
        return [main, common(s + 1, wm)]
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
    # A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
    if m == None:
        return climb(offer, [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tips(offer) if offer.object not in PROTECT or fair(offer, plan)], None, QUOTES)
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))     # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))      # make it steeper or flatter
        for j in range(-FAR, FAR + 1):                         # both at once
            if j != 0:
                tries.append(([move("si.shift", k=k), move("si.tilt", k=j)], m + j, c + k))
    # The next rung up (the ladder has no top): one jump away from 0 through the valley between, priced by its size.
    up = -1 if c < 0 else 1
    below = near(abs(c), lambda n: n >= 2 and all(f in p["primes"] for f in factors(n)))
    if below is not None:
        t = below + 1
        for _ in range(3000):
            if all(f in p["primes"] for f in factors(t)):
                tries.append((move("si.shift", k=up * t - c), m, up * t))
                break
            t += 1
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
