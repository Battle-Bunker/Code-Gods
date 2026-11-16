# Column Addition · Example: how far each answer digit is from the right digit, added up
# Main part: right columns in the run from the right-hand end. Secondary preference: how far each answer digit is from the right digit, added up.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
# (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
# a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
# raises your points most (your rarity times the other players').
# Try this: change FAR = 2 to 1: single steps only; do the wrong digits still close in?


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
    return [main, -36 if blank else -sum(abs(b[S + j] - right[j]) for j in range(4))]   # main: the right columns of the written sum in a run from the right-hand end (more is better); secondary: answer digits closer to the right digits is better


FAR = 2      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards your agent skips, e.g. [19] or [4, 9]: others may still move them
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


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
