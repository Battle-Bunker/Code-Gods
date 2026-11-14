# Magic Eighteen · Example: prime numbers on the board
# Main part: every row adds up to the target. Tie-breaker: prime numbers on the board.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
# (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
# a note, so you can make a deal with that player. It never spends more than a quarter of its energy on one move.
# Try this: change FAR = 2 to 1: moving 1 from cell to cell is cheapest, but does it still find primes?


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    main = 0
    for r in range(0, 16, 4):   # each row: how far its total is from T
        main -= abs(b[r] + b[r + 1] + b[r + 2] + b[r + 3] - p["T"])
    return [min(main, -4), len([x for x in b if x in (2, 3, 5, 7)])]   # main: how far the rows' totals are from T, added up (closer is better); tie-breaker: more cells holding 2, 3, 5 or 7 is better


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LINE = ["row" + str(i) for i in range(4)] + ["col" + str(i) for i in range(4)]   # rows then columns: their names
LINES = [[4 * i + j for j in range(4)] for i in range(4)] + [[i + 4 * j for j in range(4)] for i in range(4)]   # and their cells


def edit(b, cells, f):
    # The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
    # (such a move is not allowed, and an unchanged board is never better).
    out = list(b)
    for j in range(len(cells)):
        out[cells[j]] += f(j)
    return out if all(0 <= x <= 9 for x in out) else b


def agent(offer):
    # A tug-of-war (another player taking back your gains on this board, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the board instead gives it away: try it and compare.)
    contested(offer, 3)
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
        for i in range(8):   # add k to every cell of a row or column
            tries.append((move("tally.add", line=LINE[i], k=k), edit(b, LINES[i], lambda j: k)))
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
    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best
    if plan is None:           # nothing better (or nothing allowed): skip
        return None
    cost, e = price(offer, plan), energy(offer)
    if cost > e / 4:   # too dear (more than a quarter of its energy on one move): keep the energy for more turns
        return None
    return plan
