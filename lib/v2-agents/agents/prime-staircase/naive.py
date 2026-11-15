# Prime Staircase · Naive (for learning)
# Main part: a run of different dealt primes from y(0). Tie-breaker: whichever you were dealt (the factor the run's last prime minus 1 shares with its first prime minus 1; y(−1) close to such a prime).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
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
    # main: how many different primes ending in the rule's digit the pattern y(0), y(1), ... starts with (more is better: a ladder with no top), plus a little for the term that breaks the run being near such a prime
    if tie == "shared-factor":   # the run's last prime minus 1 sharing a bigger factor with its first prime minus 1 is better (it starts again when the run grows)
        return [main, common(run[-1] - 1, run[0] - 1) if len(run) >= 2 else 0]
    if tie == "step-back":   # y(-1) (ignoring sign) close to such a prime is better
        back = abs(c - m)                          # y(-1), ignoring its sign
        return [main, -abs(back - near(back, prime, p["ends"]))]
    return [main]


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


def agent(offer):
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    if m == None:              # a vertical line has no y = mx + c: skip
        return None
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
