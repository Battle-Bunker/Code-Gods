# Column Addition · Naive (for learning)
# Main part: right columns in the run from the right-hand end. Secondary preference: right columns anywhere in the sum.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    A, B, S = 4 * p["top"], 4 * p["top"] + 4, 4 * p["top"] + 8   # the first cells of the two rows added, and of the answer row
    right, ok, carry = [0] * 4, [False] * 4, 0   # each column's right digit, and whether the answer shows it
    for j in (3, 2, 1, 0):   # the written sum, from the right-hand end
        t = b[A + j] + b[B + j] + carry
        right[j], ok[j], carry = t % 10, t % 10 == b[S + j], t // 10
    blank = all(b[A + j] == 0 for j in range(4))   # a top row of 0s: nothing counts
    main = 0
    for j in (3, 2, 1, 0):   # right columns in a run from the right-hand end
        if blank or not ok[j]:
            break
        main += 1
    return [main, 0 if blank else sum(ok)]   # main: the right columns of the written sum in a run from the right-hand end (more is better); secondary: more right columns anywhere in the sum is better


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
