# Strangers · Naive (for learning)
# Main part: touching strangers in the corner boxes. Tie-breaker: strangers across the corner boxes' borders.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    def gcd(x, y):   # the greatest common divisor
        return gcd(y, x % y) if y else x
    main, ones = 0, 0
    for x in BOXES:
        for i, j in [[0, 1], [2, 3], [0, 2], [1, 3]]:   # each box's four touching pairs
            u, w = b[x[i]], b[x[j]]
            if u > 1 and w > 1 and gcd(u, w) == 1 and abs(u - w) >= 2:   # strangers: like 2 and 5
                main += 1
            if (u == 1 and w > 1) or (w == 1 and u > 1):   # a 1 touching a bigger number
                ones += 1
    across = 0   # touching pairs across the boxes' borders that are strangers
    for i, j in [[1, 2], [5, 6], [9, 10], [13, 14], [4, 8], [5, 9], [6, 10], [7, 11]]:
        if b[i] > 1 and b[j] > 1 and gcd(b[i], b[j]) == 1 and abs(b[i] - b[j]) >= 2:
            across += 1
    return [main, across]   # main: how many touching pairs in the corner boxes are strangers (more is better); tie-breaker: more strangers across the corner boxes' borders is better


FAR = 1      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
BOXES = [[r, r + 1, r + 4, r + 5] for r in (0, 2, 8, 10)]   # the corner boxes' cells: top-left, top-right, bottom-left, bottom-right


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
    top, plans = score(b, p), []
    for plan, b2 in tries:
        s = score(b2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
