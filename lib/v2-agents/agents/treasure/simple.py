# Treasure · Simple
# Main part: y(k) on as big a coin pile as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both the pile's height and the gradient's whole part).
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
    level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2
    s = p.get("side", 1)
    y = s * (m * p["k"] + c)                         # y(k) = m*k + c, or minus it on the mirror
    T = lambda h: h * (h + 1) // 2                   # the coin pile h coins high: h(h + 1)/2
    hf = 1 if y < 1 else (root(8 * whole(y - Fraction(1, 2)) + 1) - 1) // 2   # the biggest pile's height up to y(k)
    lo, hi = T(hf), T(hf + 1)
    rung, height = (hi, hf + 1) if hi - y < y - lo else (lo, hf)   # the coin pile nearest y(k) (the smaller on a tie): the rung
    gap = abs(y - rung)                              # on the rung when it rounds there (within 1/2, ties up)
    main = level(rung) if 2 * gap < 1 or rung - y == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the coin pile (1, 3, 6, 10, ...) y(k) rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "shared-factor":   # the pile is n coins high: a bigger number dividing both n and the gradient's whole part is better
            wm = whole(abs(m) - Fraction(1, 2))             # the whole part of the gradient's size
            return common(height, wm)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


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
    # The next pile up (the ladder has no top): the coin pile just above y(k), by a shift or by a tilt.
    s = p.get("side", 1)
    yk = m * p["k"] + c
    h = 0 if s * yk < 1 else (root(8 * whole(s * yk) + 1) - 1) // 2   # the biggest pile's height up to y(k)
    d = s * Fraction((h + 1) * (h + 2), 2) - yk      # how far y(k) must move to the next pile
    tries.append((move("si.shift", k=d), m, c + d))
    tries.append((move("si.tilt", k=d / p["k"]), m + d / p["k"], c))
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p, tie), QUOTES)
