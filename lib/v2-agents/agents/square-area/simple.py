# Square Area · Simple
# Main part: the triangle's area on as big a square ending in d as possible. Tie-breaker: whichever you were dealt (the factor that square's root plus 1 shares with the x-crossing's whole part).
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
    if m == 0 or c == 0:                            # no triangle: the worst score
        return None
    legX, legY = abs(c / m), abs(c)                 # the triangle's base and height
    area = legX * legY / 2
    fl = whole(area) if p.get("round") else whole((2 * area - 1) / 2)   # the area rounded down (to the nearest, for near)
    s, K = root(fl), p["ends"]                      # its whole square root, rounded down
    lo, hi = s, s + 1                               # the nearest roots at or below s, and above, whose squares end in p["ends"]
    while lo >= 1 and lo * lo % 10 != K:
        lo -= 1
    while hi * hi % 10 != K:
        hi += 1
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    a = Fraction(-1, 2) if p.get("round") else 0   # the window of r² is [r² + a, r² + a + 1)
    below, above = area - (lo * lo + 1 + a), hi * hi + a - area   # past the window below, up to the one above
    on = lo == s and s >= 1 and s * s == fl          # the area rounds to s², a square ending in p["ends"]: a rung
    r = lo if on or (lo >= 1 and below <= above) else hi   # that number (on a rung), else the nearest window's
    main = level(fl) if on else -(below if r == lo else above)
    # main: the square ending in the rule's digit that the triangle's area rounds down (or to the nearest) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from rounding to one
    if tie == "shared-factor":   # that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
        wx = whole((2 * legX - 1) / 2)               # the x-crossing's whole part, ignoring its sign
        return [main, common(r + 1, wx)]
    return [main]


FAR = 2      # how far one change may go
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
    # The next rung up (the ladder has no top): the next square ending in p["ends"] above the area, aiming
    # at the middle of its window (r² ± 1/2), by a shift that keeps the gradient (c² = 2|m|·area, to the nearest half) or
    # a tilt that keeps the y-intercept (|m| = c²/(2·area), to the nearest half, third or quarter).
    if m != 0 and c != 0:
        s0 = root(whole((c * c / abs(m) - 1) / 2))   # √(the area rounded down), rounded down
        r = s0 + 1                                 # the next root above it whose square ends in p["ends"]
        while r * r % 10 != p["ends"]:
            r += 1
        mid = r * r + (0 if p.get("round") else Fraction(1, 2))   # the middle of its window
        h0 = root(whole(8 * abs(m) * mid))        # 2·√(2|m|·mid), rounded down: c to the nearest half
        for h in (h0, h0 + 1):
            c2 = (-1 if c < 0 else 1) * Fraction(h, 2)
            tries.append((move("si.shift", k=c2 - c), m, c2))
        for d in (2, 3, 4):
            m2 = (-1 if m < 0 else 1) * Fraction(whole(d * (c * c / (2 * mid))), d)
            if m2 != 0:
                tries.append((move("si.tilt", k=m2 - m), m2, c))
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
