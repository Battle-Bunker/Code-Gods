# Opposite Nines · Naive (for learning)
# Main part: every cell and its opposite add up to the target. Secondary preference: each number and its mirror in the row add up to the target.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    main = 0
    for i in range(8):   # cell i and its opposite, 15 - i
        main -= abs(b[i] + b[15 - i] - p["T"])
    return [main, -sum(abs(b[r] + b[r + 3] - p["T"]) + abs(b[r + 1] + b[r + 2] - p["T"]) for r in range(0, 16, 4))]   # main: how far each cell and its opposite are from adding up to T, added up (closer is better); secondary: each number and its mirror in the row adding up closer to T is better


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
        for i in range(8):   # move k from a cell to its opposite, a half turn away (their total is kept)
            tries.append((move("turn.balance", pair="pair" + str(i), k=k), edit(b, [i, 15 - i], lambda j: -k if j else k)))
    top, plans = score(b, p), []
    for plan, b2 in tries:
        s = score(b2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
