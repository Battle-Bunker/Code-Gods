# Prime Staircase · Example: the factor the run's last prime minus 1 shares with its first prime minus 1
# Main part: a run of different dealt primes from y(0). Secondary preference: the factor the run's last prime minus 1 shares with its first prime minus 1.
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: remove the "tilt" line: can moving alone change the factor without breaking the run?


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    run, t = [], c                                  # run: the different primes ending in p["ends"] it starts with
    for n in range(256):                            # y(0), y(1), ...
        t = m * n + c
        if t == near(t, prime, p["ends"]) and t not in run:
            run.append(t)
        else:
            break                                   # t is the first term that breaks the run
    miss = abs(t)                                   # ignoring its sign
    d = abs(miss - near(miss, prime, p["ends"]))
    main = len(run) + Fraction(1) / (2 + d)        # a longer run always wins; a near miss beats a far one
    return [main, common(run[-1] - 1, run[0] - 1) if len(run) >= 2 else 0]   # main: how many different primes ending in the rule's digit the pattern y(0), y(1), ... starts with (more is better: a ladder with no top), plus a little for the term that breaks the run being near such a prime; secondary: the run's last prime minus 1 sharing a bigger factor with its first prime minus 1 is better (it starts again when the run grows)


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
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
        tries.append((move("seq.step", k=k), m + k, c - k))   # change the pattern's step, keeping y(1)
    # The next rung up (the run has no top): steps that are a multiple of 10 (every term keeps its last digit), and the
    # next prime ending in p["ends"] above the start; each one jump, priced by its size.
    for j in range(-3, 4):
        m2 = 10 * (whole(m / 10) + j)
        if m2 != m:
            tries.append((move("si.tilt", k=m2 - m), m2, c))
    t = near(c, prime, p["ends"]) + 10
    for _ in range(100):
        if prime(t):
            tries.append((move("si.shift", k=t - c), m, t))
            break
        t += 10
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p), QUOTES)
