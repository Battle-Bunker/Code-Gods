# Seesaw · Naive (for learning)
# Main part: how far each row (or column) is from balancing, added up. Secondary preference: the balanced seesaws' numbers, added up.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    L = [[4 * k + j if p["axis"] == "rows" else 4 * j + k for j in range(4)] for k in range(4)]   # each seesaw: a row (or column), its cells in order
    O = [[4 * j + k if p["axis"] == "rows" else 4 * k + j for j in range(4)] for k in range(4)]   # the other way
    def lean(l):   # how far its two halves are from balancing
        return abs(b[l[0]] + b[l[1]] - b[l[2]] - b[l[3]])
    main = -sum(lean(l) for l in L)
    return [main, sum(b[l[0]] + b[l[1]] + b[l[2]] + b[l[3]] for l in L if lean(l) == 0)]   # main: how far each row's (or column's) two halves are from balancing, added up (closer is better); secondary: balanced seesaws holding bigger numbers are better


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
    add = lambda i, k: move("cells.add", cell=NAME[i], k=k)   # the move that adds k to cell i
    tries = []                 # (plan, board after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        for i in range(16):   # add k to one cell
            tries.append((add(i, k), edit(b, [i], lambda j: k)))
        for i in range(16):   # move k from one cell to another (their total is kept)
            for i2 in range(i + 1, 16):
                tries.append(([add(i, k), add(i2, -k)], edit(b, [i, i2], lambda j: -k if j else k)))
    top, plans = score(b, p), []
    for plan, b2 in tries:
        s = score(b2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
