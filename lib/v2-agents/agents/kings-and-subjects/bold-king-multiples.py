# Kings and Subjects · Bold
# Main part: every corner box's king equals his subjects. Secondary preference: kings that are a multiple of the smallest number in their box.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and takes the change that raises your points most. Your points on a board are your rarity there times the
# other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
# lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: change FAR = 2 to 1: single steps, the same price per step, but more turns to get there.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    main = 0
    kings = []
    for x in BOXES:   # each corner box
        v = [b[i] for i in x]
        m = max(v)   # the king
        main -= 20 if v.count(m) > 1 else abs(2 * m - sum(v))   # the king against his subjects added up; a tied biggest is no king, 20 off
        if v.count(m) == 1:   # a king: his cell, his number, the smallest in his box
            kings.append((x[v.index(m)], m, min(v)))
    return [main, len([1 for i, m, s in kings if s >= 1 and m % s == 0])]   # main: how far each corner box's biggest number is from the other three added up, added up (closer is better); secondary: more kings that are a multiple of the smallest number in their box is better


FAR = 2      # how far one change may go
QUOTES = 6  # at most this many plans are priced (each price is a host call)
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
        if k * k < 4:          # only steps of 2 (each costs two single steps)
            continue
        for i in range(16):   # move k from one cell to another (their total is kept)
            for i2 in range(i + 1, 16):
                tries.append(([move("cells.add", cell=NAME[i], k=k), move("cells.add", cell=NAME[i2], k=-k)], edit(b, [i, i2], lambda j: -k if j else k)))
    options = [(plan, score(b2, p)) for plan, b2 in tries]   # each step and the score it reaches
    # A promise: on these boards, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(b, p), QUOTES)
