# Pythagorean Area · Example: the factor that prime minus 1 shares with the slanted side squared
# Main part: the triangle's area on as big a dealt prime as possible. Tie-breaker: the factor that prime minus 1 shares with the slanted side squared.
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change FAR = 3 to 2: a smaller shift keeps the area on its prime more often, and still moves the slanted side.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0 or c == 0:                            # no triangle: the worst score
        return None
    legX, legY = abs(c / m), abs(c)                 # the triangle's base and height
    area = legX * legY / 2
    x = area - Fraction(1, 2)                       # the area rounds down to n when x rounds to n (ties up)
    rung = near(x, prime, p["ends"])                # the prime ending in p["ends"] nearest there: the rung
    gap = abs(x - rung)                             # on the rung when the area rounds down to it
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    side2 = legX * legX + legY * legY            # the slanted side, squared (Pythagoras)
    ws = whole((2 * side2 - 1) / 2)              # its whole part (rounded down)
    return [main, common(rung - 1, ws)]   # main: the prime ending in the rule's digit that the triangle's area rounds down to, in levels of digits each needing more than the last (bigger is better: a ladder with no top), else minus how far the area is from rounding down to one; tie-breaker: that prime minus 1 and the slanted side squared (rounded down): a bigger factor shared is better


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
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
    # The next rung up (the ladder has no top): the next prime ending in p["ends"] above the area, aiming at the middle of
    # its window (area t + 1/2), by a shift that keeps the gradient (c² = 2|m|·area, to the nearest half) or a tilt that
    # keeps the y-intercept (|m| = c²/(2·area), to the nearest half, third or quarter): the climb keeps whichever lands.
    if m != 0 and c != 0:
        area = c * c / (2 * abs(m))
        t = near(area, prime, p["ends"]) + 10
        for _ in range(100):
            if prime(t):
                mid = t + Fraction(1, 2)            # the middle of its window
                r = root(whole(8 * abs(m) * mid))   # 2·√(2|m|·mid), rounded down: c to the nearest half
                for h in (r, r + 1):
                    c2 = (-1 if c < 0 else 1) * Fraction(h, 2)
                    tries.append((move("si.shift", k=c2 - c), m, c2))
                for d in (2, 3, 4):
                    m2 = (-1 if m < 0 else 1) * Fraction(whole(d * (c * c / (2 * mid))), d)
                    if m2 != 0:
                        tries.append((move("si.tilt", k=m2 - m), m2, c))
                break
            t += 10
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p), QUOTES)
