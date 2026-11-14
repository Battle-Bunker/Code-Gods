# Stepping Stones · Naive (for learning)
# Main part: the biggest group you can hop between. Tie-breaker: the cells outside the biggest group, added up.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    def near(i):   # the cells touching cell i
        return [j for j in (i - 4, i + 4, i - 1 if i % 4 else -1, i + 1 if i % 4 < 3 else -1) if 0 <= j < 16]
    best = []   # the biggest group (the first found on a tie)
    seen = set()
    for s in range(16):
        if s in seen:
            continue
        group = [s]
        seen.add(s)
        for i in group:   # hop on to touching cells 2 apart
            for j in near(i):
                if j not in seen and abs(b[i] - b[j]) == 2:
                    seen.add(j)
                    group.append(j)
        if len(group) > len(best):
            best = group
    main = len(best)
    return [main, -sum(b[i] for i in range(16) if i not in best)]   # main: the cells in the biggest group you can hop between, touching cells 2 apart (more is better); tie-breaker: smaller numbers outside the biggest group are better


FAR = 1      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


def edit(b, cells, f):
    # The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
    # (such a move is not allowed, and an unchanged board is never better).
    out = list(b)
    for j in range(len(cells)):
        out[cells[j]] += f(j)
    return out if all(0 <= x <= 9 for x in out) else b


def agent(offer):
    v = look(offer, "cells")   # the board
    rule = goal(offer)         # your rule (free)
    p = rule.params
    NAME = list(v.keys())[:16]   # the cells' names, r0c0 ... r3c3, row by row
    b = [int(v[n]) for n in NAME]   # their 16 numbers
    tries = []                 # (plan, board after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        for i in range(16):   # add k to one cell
            tries.append((move("cells.add", cell=NAME[i], k=k), edit(b, [i], lambda j: k)))
    for i in range(16):   # swap two cells (the same as moving their difference from one to the other)
        for i2 in range(i + 1, 16):
            d = b[i2] - b[i]
            tries.append((move("cells.swap", a=NAME[i], b=NAME[i2]), edit(b, [i, i2], lambda j: -d if j else d)))
    top, plans = score(b, p), []
    for plan, b2 in tries:
        s = score(b2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
