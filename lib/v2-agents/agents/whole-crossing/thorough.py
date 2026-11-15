# Whole Crossing · Thorough
# Main part: the x-axis crossing on a ladder of 5s. Tie-breaker: whichever you were dealt (the biggest number dividing both that number after its 5s, plus 1, and the gradient's whole part).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        x = c                                          # it stands on the x-axis at x = c
        # The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, ... times t). The nearest such number, any level,
        # in whole numbers: x = n/dd, and every distance is counted in 1/dd.
        n, dd, r = x.numerator, x.denominator, p["r"]
        best, j, s = None, 0, 1
        while True:
            D = dd * s
            t = r + 5 * ((2 * (n - r * D) + 5 * D) // (10 * D))   # the nearest t leaving r at this level (halfway: up)
            if 2 * (t * D - n) == 5 * D and abs(t - 5) <= abs(t):   # halfway: the smaller
                t -= 5
            dist = abs(n - s * t * dd)                  # the nearer wins; on a tie the higher level
            if best is None or dist <= best[2]:
                best = (j, t, dist)
            if s * dd - abs(n) > best[2]:               # every further level is farther
                break
            j, s = j + 1, s * 5
        L = 0
        while (L + 1) * (L + 2) // 2 <= best[0]:      # level L needs L(L + 1)/2 fives (1, 3, 6, 10, ...)
            L += 1
        main = L + Fraction(best[0] - L * (L + 1) // 2, L + 1) if best[2] == 0 else -Fraction(best[2], dd)   # on the ladder: its level; else below them all
        return [main] + [None for t in (tie.split(">") if tie else [])]
    if m == 0:                                      # a flat line never crosses: the worst score
        return None
    x = -c / m                                     # where y = mx + c crosses the x-axis
    # The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, ... times t). The nearest such number, any level,
    # in whole numbers: x = n/dd, and every distance is counted in 1/dd.
    n, dd, r = x.numerator, x.denominator, p["r"]
    best, j, s = None, 0, 1
    while True:
        D = dd * s
        t = r + 5 * ((2 * (n - r * D) + 5 * D) // (10 * D))   # the nearest t leaving r at this level (halfway: up)
        if 2 * (t * D - n) == 5 * D and abs(t - 5) <= abs(t):   # halfway: the smaller
            t -= 5
        dist = abs(n - s * t * dd)                  # the nearer wins; on a tie the higher level
        if best is None or dist <= best[2]:
            best = (j, t, dist)
        if s * dd - abs(n) > best[2]:               # every further level is farther
            break
        j, s = j + 1, s * 5
    L = 0
    while (L + 1) * (L + 2) // 2 <= best[0]:      # level L needs L(L + 1)/2 fives (1, 3, 6, 10, ...)
        L += 1
    main = L + Fraction(best[0] - L * (L + 1) // 2, L + 1) if best[2] == 0 else -Fraction(best[2], dd)   # on the ladder: its level; else below them all
    # main: the level of 5s the line's x-axis crossing holds when it is a whole number leaving r after its 5s are divided out (level L needs L(L + 1)/2 fives; more is better: a ladder with no top), else minus how far it is from the nearest such number
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "shared-factor":   # take that number with its 5s divided out, ignore its sign and add 1: a bigger number dividing both it and the gradient's whole part is better
            t1, wm = abs(best[1]) + 1, whole(abs(m) - Fraction(1, 2))   # |t| + 1, and the gradient's whole part ignoring sign
            return common(t1, wm)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 3      # how far one change may go
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
            tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
            tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
            tries.append((move("seq.step", k=k), m + k, c - k))   # change the pattern's step, keeping y(1)
            tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
            f = k + 1 if k > 0 else k - 1
            tries.append((move("mach.stretch", f=f), m * f, c * f))   # multiply every output by f (m and c both)
        # The next level up (the ladder has no top): the nearest number with one more 5, by a shift that keeps the gradient.
        if m != 0:
            x, s = -c / m, 5
            while abs(x / s) > 1 and (x / s).denominator == 1:   # one more 5 than x holds
                s *= 5
            to = s * (p["r"] + 5 * whole((x / s - p["r"]) / 5))
            tries.append((move("si.shift", k=-m * to - c), m, -m * to))
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = [(plan, score(m2, c2, p, tie)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    one = climb(offer, options, score(m, c, p, tie), QUOTES)
    if one or offer.object in PROTECT:
        return one
    # No single step helps: look two steps ahead (each step, then a shift or tilt by 1) and take the first
    # step of the best pair, though it may lower your points for a moment. It weighs the 4 best pairs: a few more small reads.
    # The first steps: the 6 best for your rule (options are tries with their scores, in the same order).
    cands, firsts = [(t, o[1]) for t, o in zip(tries, options) if t[1] is not None], []
    while cands and len(firsts) < 6:
        best = 0
        for i in range(1, len(cands)):
            if better(cands[i][1], cands[best][1]):
                best = i
        firsts.append(cands.pop(best)[0])
    pairs = []
    for plan, m1, c1 in firsts:
        first = list(plan) if isinstance(plan, (list, tuple)) else [plan]
        for k in (-1, 1):
            pairs.append((first + [move("si.shift", k=k)], score(m1, c1 + k, p, tie)))
            pairs.append((first + [move("si.tilt", k=k)], score(m1 + k, c1, p, tie)))
    two = climb(offer, pairs, score(m, c, p, tie), 4)
    return two[:-1] if two else None
