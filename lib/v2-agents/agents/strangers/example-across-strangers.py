# Strangers · Example: strangers across the corner boxes' borders
# Main part: touching strangers in the corner boxes. Tie-breaker: strangers across the corner boxes' borders.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
# (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
# a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
# raises your points most (your rarity times the other players').
# Try this: change FAR = 2 to 1: single steps only; does it still find strangers across the borders?


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


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
BOXES = [[r, r + 1, r + 4, r + 5] for r in (0, 2, 8, 10)]   # the corner boxes' cells: top-left, top-right, bottom-left, bottom-right


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
    if saving(offer):   # under 10 s of your income in hand: save up for a move (the game still tells you the board)
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
    for i in range(16):   # swap two cells (the same as moving their difference from one to the other)
        for i2 in range(i + 1, 16):
            d = b[i2] - b[i]
            tries.append((move("cells.swap", a=NAME[i], b=NAME[i2]), edit(b, [i, i2], lambda j: -d if j else d)))
    options = [(plan, score(b2, p)) for plan, b2 in tries]   # each step and the score it reaches
    # A promise: on these boards, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(b, p), QUOTES)
