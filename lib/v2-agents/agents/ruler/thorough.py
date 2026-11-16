# Ruler · Thorough
# Main part: distance² from (0, 0) on as big a dealt prime as possible. Secondary preference: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        d2 = c * c                                      # its distance from (0, 0), squared
        x = d2 - Fraction(1, 2)
        rung = near(x, prime, p["ends"])
        gap = abs(x - rung)
        level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
        main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
        return [main] + [None for t in (tie.split(">") if tie else [])]
    d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared
    x = d2 - Fraction(1, 2)                         # d2 rounds down to n when x rounds to n (ties up)
    rung = near(x, prime, p["ends"])                # the prime ending in p["ends"] nearest there: the rung
    gap = abs(x - rung)                             # on the rung when d2 rounds down to it
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the prime ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "shared-factor":   # that prime minus 1 and the y-intercept's whole part: a bigger factor shared is better
            wc = whole((2 * abs(c) - 1) / 2)          # the y-intercept's whole part, ignoring its sign
            return common(rung - 1, wc)
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
            t0, u, r = [(3, 4, 5), (4, 3, 5), (5, 12, 13), (12, 5, 13)][(abs(k) - 1) % 4]; t = t0 if k > 0 else -t0; du = u - m * t
            if du != 0: tries.append((move("rot.turn", centre="origin", turn=Fraction(t, u)), (m * u + t) / du, c * r / du))   # turn the line about (0, 0) by the angle whose tangent is t/u (its distance from (0, 0) stays)
        # The next rung up (the ladder has no top): the next prime ending in p["ends"] above the distance², aiming at the middle
        # of its window (t + 1/2), by a shift that keeps the gradient (c² = (m² + 1)·d², to the nearest half) or a tilt that
        # keeps the y-intercept (m² = c²/d² − 1, to the nearest half, third or quarter): the climb keeps whichever lands.
        m1 = m * m + 1
        t = near(c * c / m1, prime, p["ends"]) + 10
        for _ in range(100):
            if prime(t):
                mid = t + Fraction(1, 2)                # the middle of its window
                h0 = root(whole(4 * m1 * mid))         # 2·√((m² + 1)·mid), rounded down: c to the nearest half
                for h in (h0, h0 + 1):
                    c2 = (-1 if c < 0 else 1) * Fraction(h, 2)
                    tries.append((move("si.shift", k=c2 - c), m, c2))
                s2 = c * c / mid - 1                    # the gradient squared that puts the line there, keeping c
                if s2 > 0:
                    for d in (2, 3, 4):
                        m2 = (-1 if m < 0 else 1) * Fraction(root(whole(d * d * s2)), d)
                        if m2 != m:
                            tries.append((move("si.tilt", k=m2 - m), m2, c))
                break
            t += 10
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = score_each(tries, lambda t: (t[0], score(t[1], t[2], p, tie)))   # each step and the score it reaches (fewer on a big line)
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
        if steps_left() < 0.45 * step_budget():   # a big line: weigh fewer pairs rather than fail
            break
        first = list(plan) if isinstance(plan, (list, tuple)) else [plan]
        for k in (-1, 1):
            pairs.append((first + [move("si.shift", k=k)], score(m1, c1 + k, p, tie)))
            pairs.append((first + [move("si.tilt", k=k)], score(m1 + k, c1, p, tie)))
    two = climb(offer, pairs, score(m, c, p, tie), 4)
    return two[:-1] if two else None
