# Snake · Naive (for learning)
# Your rule: every step along the snake s more, round the clock.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [its score]: bigger is better.
    import math
    top, left, path = p["start"].startswith("top"), p["start"].endswith("left"), []   # the snake's cells, in order
    lane_first, run_first = (top, left) if p["by"] == "rows" else (left, top)
    for k in range(4):
        lane, fwd = (k if lane_first else 3 - k), ((k % 2 == 0) == run_first)
        for j in range(4):
            a = j if fwd else 3 - j
            path.append(4 * lane + a if p["by"] == "rows" else 4 * a + lane)
    main = 0
    for i in range(1, 16):
        m = (b[path[i]] - b[path[i - 1]] - p["s"]) % 10
        main -= min(m, 10 - m)
    return [main]   # each step along the snake s more, round the clock (bigger is better)


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
        for i in range(8):   # add k to every cell of a row or column
            tries.append((move("tally.add", line=LINE[i], k=k), edit(b, LINES[i], lambda j: k)))
    top, plans = score(b, p), []
    for plan, b2 in tries:
        s = score(b2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
