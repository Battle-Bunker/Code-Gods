# Square Area · Simple
# Main part: the triangle's area on as big a square ending in d as possible. Secondary preference: whichever you were dealt (the factor that square's root plus 1 shares with the x-crossing's whole part).
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
    if m == 0 or c == 0:                            # no triangle: the worst score
        return None
    legX = abs(c / m)                               # the triangle's base
    area = legX * abs(c) / 2
    a = Fraction(-1, 2) if p.get("round") else 0   # the window of r² is [r² + a, r² + a + 1)
    fl = whole(area - a - Fraction(1, 2))           # the area, rounded down (or off)
    s = root(fl)                                    # its whole square root
    r = near(s, lambda n: n > 1 and n * n % 10 == p["ends"])   # the nearest root above 1 whose square ends in p["ends"]
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    w = r * r + a                                   # its window [w, w + 1)
    main = level(fl) if r == s and s * s == fl else -(w - area if area < w else area - w - 1)
    # main: the square above 1 ending in the rule's digit that the triangle's area rounds down (or off) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from the window of the nearest such square's root
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "shared-factor":   # that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
            wx = whole((2 * legX - 1) / 2)               # the x-crossing's whole part, ignoring its sign
            return common(r + 1, wx)
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
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
    # The next rung up (the ladder has no top): the next root above √area whose square ends in p["ends"], by a shift that
    # keeps the gradient and puts the area in the middle of its window (c² = 2|m|·area, to the nearest half).
    if m != 0 and c != 0:
        r = root(whole(c * c / (2 * abs(m)))) + 1
        while r * r % 10 != p["ends"]:
            r += 1
        c2 = (-1 if c < 0 else 1) * Fraction(root(whole(8 * abs(m) * (r * r + (0 if p.get("round") else Fraction(1, 2))))), 2)
        tries.append((move("si.shift", k=c2 - c), m, c2))
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
