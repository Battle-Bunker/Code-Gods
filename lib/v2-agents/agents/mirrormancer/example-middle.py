# Mirrormancer · Example: the middle columns' total
# Main part: every row reads the same backwards. Tie-breaker: the middle columns' total.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
# (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
# a note, so you can make a deal with that player. Where another player keeps lowering your points, it only makes
# changes that keep them.
# Try this: remove the "line" line: can it raise the middle without a whole row at once?


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    main = 0
    for r in range(0, 16, 4):   # each row: its ends' gap and its middle's gap
        main -= abs(b[r] - b[r + 3]) + abs(b[r + 1] - b[r + 2])
    return [main, b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14]]   # main: how far each row is from reading the same backwards, added up (closer is better); tie-breaker: bigger middle columns are better


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
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
    if offer.object in LEAVE:   # a deal: leave this board alone
        return None
    # A tug-of-war (another player taking back your gains on this board, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the board instead gives it away: try it and compare.)
    contested(offer, 3)
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
    # A promise: on these boards, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        plans = [plan for plan in plans[:QUOTES] if fair(offer, plan)]
    # Contested (another player's move lowered your points here): only moves that keep your own points.
    if hurt(offer):
        plans = [plan for plan in plans[:QUOTES] if pays(offer, plan, top)]
    if not plans:   # nothing better (or nothing that keeps your points): skip
        return None
    return cheapest(offer, plans[:QUOTES])   # the cheapest of the best
