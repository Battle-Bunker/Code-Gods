# Prime Staircase · Naive (for learning)
# Main part: a run of different dealt primes from y(0). Tie-breaker: whichever you were dealt (the first prime; the last prime of the run; the first term that breaks the run, close to such a prime; y(−1) close to such a prime).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    run, stopped, miss = [], False, None            # miss: the size of the first term that is not such a prime
    for n in range(12):                             # y(0) ... y(11)
        t = p.get("side", 1) * (m * n + c)        # y(n), or -y(n) on the mirror (minus primes)
        is_prime = prime(t) and t % 10 == p["ends"]
        if not stopped and is_prime and t not in run:
            run.append(t)                           # the different primes ending in p["ends"] it starts with
        else:
            stopped = True
        if not is_prime and miss is None:
            miss = abs(t)
    main = len(run)
    # main: how many different primes ending in the rule's digit the pattern y(0), y(1), ... starts with (more is better)
    if tie == "first-prime":   # a bigger first prime is better
        return [main, run[0] if run else 0]
    if tie == "last-prime":   # a bigger last prime of the run is better
        return [main, run[-1] if run else 0]
    if tie == "near-miss":   # a first term that breaks the run (ignoring sign) close to such a prime is better (none in twelve terms: no tie-breaker)
        return [main, None if miss is None else -abs(miss - near(miss, prime, p["ends"]))]
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
