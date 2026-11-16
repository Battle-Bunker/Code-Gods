# Prime Landing · Thorough
# Main part: where the line lands on the x-axis, on as big a dealt prime as possible. Secondary preference: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
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
        level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
        x = p.get("side", 1) * c                      # it stands on the x-axis at x = c (minus that, on the mirror)
        landing = near(x, prime, p["ends"])             # the rung nearest there
        gap = abs(x - landing)
        main = level(landing) if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
        return [main] + [None for t in (tie.split(">") if tie else [])]
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    if m == 0:                                      # a flat line never lands: the worst score
        return None
    x = p.get("side", 1) * (-c / m)                # where y = mx + c lands on the x-axis (minus that, on the mirror)
    landing = near(x, prime, p["ends"])             # the prime ending in p["ends"] nearest there: the rung
    gap = abs(x - landing)                          # on the rung when it rounds there (within 1/2, ties up)
    main = level(landing) if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "shared-factor":   # take the number just before that prime: a bigger number dividing both it and the y-intercept's whole part is better
            wc = whole((2 * c - 1) / 2)                # the y-intercept's whole part (rounded down)
            return common(landing - 1, wc)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 3      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines your agent skips, e.g. [19] or [4, 9]: it does not act on them (others still may)
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
        # Rungs (the ladder has no top): the nearest prime ending in p["ends"], if the line does not round there yet, and
        # the next one beyond it. For each, the simplest gradient that lands there keeping c, and the simplest
        # y-intercept that lands there keeping m: anywhere that rounds to the rung will do.
        if m != 0 and c != 0:
            s = p.get("side", 1)
            here = near(s * (-c / m), prime, p["ends"])
            t, nxt = here + 10, None
            for _ in range(100):
                if prime(t):
                    nxt = t
                    break
                t += 10
            for r in (here, nxt):
                if r is None:
                    continue
                a, b = s * (r - Fraction(49, 100)), s * (r + Fraction(49, 100))   # landings that round to r
                m2, c2 = simplest(-c / a, -c / b), simplest(-m * a, -m * b)
                if m2 != m:
                    tries.append((move("si.tilt", k=m2 - m), m2, c))
                if c2 != c:
                    tries.append((move("si.shift", k=c2 - c), m, c2))
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
