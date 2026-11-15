# Uphill · Naive (for learning)
# Main part: rising steps toward the corner. Tie-breaker: numbers smaller than the number in the corner you walk toward.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    right, down = p["corner"][1] == "R", p["corner"][0] == "B"   # which way to walk
    rises = []   # each step toward the corner, along the rows and down the columns: how much it rises
    for i in range(16):
        if i % 4 < 3:
            rises.append(b[i + 1] - b[i] if right else b[i] - b[i + 1])
        if i < 12:
            rises.append(b[i + 4] - b[i] if down else b[i] - b[i + 4])
    main = len([d for d in rises if d > 0])
    return [main, len([x for x in b if x < b[(12 if down else 0) + (3 if right else 0)]])]   # main: the steps along every row and column toward the corner that reach a bigger number (more is better); tie-breaker: more numbers smaller than the one in the corner you walk toward is better


FAR = 1      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LINE, LINES = [], []   # the rows and columns: their names, and their cells
for i in range(4):
    LINE += ["row" + str(i), "col" + str(i)]
    LINES += [[4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3], [i, i + 4, i + 8, i + 12]]


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
        for i in range(8):   # make every step along a row or column bigger by k
            tries.append((move("steps.tilt", line=LINE[i], k=k), edit(b, LINES[i], lambda j: j * k)))
    top, plans = score(b, p), []
    for plan, b2 in tries:
        s = score(b2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
