# Round Numbers · Bold
# Main part: how far each row's (or column's) total is from a round number, added up. Secondary preference: rows (or columns) whose total is exactly round.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and takes the change that raises your points most. Your points on a board are your rarity there times the
# other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
# lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: change FAR = 2 to 1: single steps, the same price per step, but more turns to get there.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    tot = [sum(b[4 * k + j] if p["axis"] == "rows" else b[4 * j + k] for j in range(4)) for k in range(4)]   # each row's (or column's) total
    rnd = [(t + 5) // 10 * 10 for t in tot]   # the multiple of 10 nearest each total (one ending in 5: the one above)
    main = -sum(abs(t - r) for t, r in zip(tot, rnd))   # how far each total is from it, added up
    return [main, len([k for k in range(4) if tot[k] == rnd[k]])]   # main: how far each row's (or column's) total is from the nearest multiple of 10, added up (closer is better); secondary: more rows (or columns) adding up to exactly a multiple of 10 is better


FAR = 2      # how far one change may go
QUOTES = 6  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards your agent skips, e.g. [19] or [4, 9]: others may still move them
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
        for i in range(8):   # add k to every cell of a row or column
            tries.append((move("tally.add", line=LINE[i], k=k), edit(b, LINES[i], lambda j: k)))
    options = score_each(tries, lambda t: (t[0], score(t[1], p)))   # each step and the score it reaches (fewer on a big board)
    # A promise: on these boards, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(b, p), QUOTES)
