# Leapfrog · Bold
# Main part: each number one apart from the number two cells along. Tie-breaker: prime numbers on the board.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and pays for the cheapest change to the best board for your rule. Your points on a board are your rarity
# there times the other players' rarity there added up, so where another player's move lowered your points it only
# makes changes that keep them (a tug-of-war burns energy on both sides). It notes a tug-of-war for you, so you can
# make a deal: LEAVE, PROTECT and TARGET below are how you keep one.
# Try this: change FAR = 3 to 2: jumps of 2 only, cheaper moves.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    main = 0
    for i in [0, 1, 4, 5, 8, 9, 12, 13]:   # cell i and the cell two along
        main -= abs(abs(b[i] - b[i + 2]) - 1)
    return [main, len([x for x in b if x in (2, 3, 5, 7)])]   # main: how far each number and the number two cells along its row are from one apart, added up (closer is better); tie-breaker: more cells holding 2, 3, 5 or 7 is better


FAR = 3      # how far one change may go
QUOTES = 6  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
TARGET = None   # a board every player agreed on, its 16 digits row by row, e.g. "9779855879979779": boards go there and stay
SETTLE = []     # the boards to settle at TARGET, e.g. [2, 5]; [] means every board
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
    if TARGET is not None and (not SETTLE or offer.object in SETTLE):   # a deal: bring the board to TARGET, then hold it
        return settle(offer, TARGET)
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
        if k * k < 4:          # only jumps of 2 or more
            continue
        for i in range(16):   # move k from one cell to another (their total is kept)
            for i2 in range(i + 1, 16):
                tries.append(([move("cells.add", cell=NAME[i], k=k), move("cells.add", cell=NAME[i2], k=-k)], edit(b, [i, i2], lambda j: -k if j else k)))
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
