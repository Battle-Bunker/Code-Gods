# Divisibility · Naive (for learning)
# Main part: the powers counted. Tie-breaker: the digits of what is left, added up.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
# board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
# from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    R = [0, 1, 2, 3] if p["layout"] == "halves" else [0, 2, 1, 3]   # the rows (and columns) in reading order: the first two, then the other two
    x = []   # the four readings: two rows (or two columns) as one number
    for by_row in (True, False):
        for k in (0, 1):
            y = 0
            for r in R[2 * k:2 * k + 2]:
                for j in range(4):
                    y = y * 10 + (b[4 * r + j] if by_row else b[4 * j + r])
            x.append(y)
    nums = x if p["lens"] == "powers" else [x[0] - x[1], x[2] - x[3]]   # the numbers counted: the readings, or the rows' and the columns' differences
    main, leftover = 0, 0
    for y in nums:   # count the q's dividing it; what is left: its digits
        if y:
            while y % p["q"] == 0:
                y //= p["q"]
                main += 1
            leftover += sum(int(d) for d in str(abs(y)))
    seen = set()
    for i in range(8):   # a row (or column) holding the same numbers as an earlier one: one off
        k = (i < 4, tuple(sorted(b[4 * i + j] if i < 4 else b[4 * j + i - 4] for j in range(4))))
        if k in seen:
            main -= 1
        seen.add(k)
    return [main, leftover]   # main: the q's dividing the four readings (or the two differences), added up, less the repeated rows and columns (more is better); tie-breaker: what is left after dividing out the q's, its digits added up, bigger is better


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
