# Prime Staircase · Bold
# Main part: a run of different primes from y(0). Tie-breaker: whichever you were dealt (the first prime; the last prime of the run; the first non-prime term close to a prime; y(−1) close to a prime).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.


def score(m, c, p, tie):
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
    # main: how many different primes the pattern y(0), y(1), ... starts with (more is better)
    if tie == "first-prime":   # a bigger first prime is better
        return [min(main, 6), run[0] if run else 0]
    if tie == "last-prime":   # a bigger last prime is better
        return [min(main, 6), run[-1] if run else 0]
    if tie == "near-miss":   # the first term that is not prime should be close to a prime
        far = None if miss is None else abs(miss)
        return [min(main, 6), None if far is None else -abs(far - near(far, prime))]
    if tie == "step-back":   # y(-1) close to a prime is better
        back = abs(c - m)                               # y(-1), ignoring its sign
        return [min(main, 6), -abs(back - near(back, prime))]
    return [main]


FAR = 6      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)


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
        tries.append((move("si.shift", k=k), m, c + k))     # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))      # make it steeper or flatter
        for j in range(-FAR, FAR + 1):                         # both at once
            if j != 0:
                tries.append(([move("si.shift", k=k), move("si.tilt", k=j)], m + j, c + k))
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
