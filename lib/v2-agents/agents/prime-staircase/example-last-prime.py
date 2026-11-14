# Prime Staircase · Example: the last prime of the run
# Main part: a run of different primes from y(0). Tie-breaker: the last prime of the run.
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: remove the "step" line and see whether it still finds long runs.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    run, stopped, miss = [], False, None            # miss: the first term that is not prime
    for n in range(12):                             # y(0) ... y(11)
        t = m * n + c
        is_prime = prime(t)
        if not stopped and is_prime and t not in run:
            run.append(t)                           # the different primes it starts with
        else:
            stopped = True
        if not is_prime and miss is None:
            miss = t
    main = len(run)
    return [min(main, 6), run[-1] if run else 0]   # main: how many different primes the pattern y(0), y(1), ... starts with (more is better); tie-breaker: a bigger last prime is better


FAR = 6      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


def agent(offer):
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p = v.m, v.c, rule.params
    if m == None:              # a vertical line has no y = mx + c: skip
        return None
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
        tries.append((move("seq.step", k=k), m + k, c - k))   # change the pattern's step, keeping y(1)
    top, plans = score(m, c, p), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
