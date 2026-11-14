# Box Totals · Example: 0s on the board
# Main part: every corner box adds up to the target. Tie-breaker: 0s on the board.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
# (another player pulling the board back again and again) scores nothing for either of you: it walks away from one
# and leaves you a note so you can talk to that player. It never spends more than a quarter of its energy on one move.
# Try this: remove the "box" line: is fixing one cell at a time as cheap?


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    main = 0
    for x in BOXES:   # each box: how far its total is from T
        main -= abs(sum(b[i] for i in x) - p["T"])
    return [main, b.count(0)]   # main: how far the corner boxes' totals are from T, added up (closer is better); tie-breaker: more 0s is better


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
SPEND = 0.25    # never spend more than a quarter of your energy on one move
BOXES = [[r, r + 1, r + 4, r + 5] for r in (0, 2, 8, 10)]   # the corner boxes' cells: top-left, top-right, bottom-left, bottom-right


def edit(b, cells, f):
    # The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
    # (such a move is not allowed, and an unchanged board is never better).
    out = list(b)
    for j in range(len(cells)):
        out[cells[j]] += f(j)
    return out if all(0 <= x <= 9 for x in out) else b


def agent(offer):
    # A tug-of-war (another player taking back your gains on this board, 3 times lately) only burns energy on
    # both sides: leave the board, with a note telling your owner to talk to that player.
    if contested(offer, 3):
        return None
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
        for i in range(4):   # add k to every cell of a corner box
            tries.append((move("boxes.add", box="box" + str(i), k=k), edit(b, BOXES[i], lambda j: k)))
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
    if cost > e * SPEND:   # too dear: keep the energy for more turns
        return None
    return plan
