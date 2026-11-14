# Spread of Three · Simple
# Main part: every 2×2 square spreads by 3. Tie-breaker: prime numbers on the board.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and finds the cheapest change to the best board for your rule. Your points on a board are your rarity there
# times the other players' rarity there added up, so once its energy is below RESERVE it only pays for a change worth
# a point per ⚡ (the bits it gains you times the others' bits), keeping the rest for boards where points count. It
# notes a tug-of-war for you (so you can make a deal) and never spends more than a quarter of its energy on one move.
# Try this: add the "trade" line from the Thorough starter: moving an amount from one cell to another keeps their total.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    main = 0
    for i in [0, 1, 2, 4, 5, 6, 8, 9, 10]:   # each 2×2 square, by its top-left cell (they overlap)
        v = [b[i], b[i + 1], b[i + 4], b[i + 5]]
        main -= abs(max(v) - min(v) - 3)   # its spread: biggest minus smallest
    return [main, len([x for x in b if x in (2, 3, 5, 7)])]   # main: how far each 2×2 square's spread is from 3, added up (closer is better); tie-breaker: more cells holding 2, 3, 5 or 7 is better


FAR = 2      # how far one change may go
QUOTES = 4  # at most this many plans are priced (each price is a host call)
RESERVE = 300  # below this much ⚡, only pay for changes that add points (see the end)


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
    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best
    if plan is None:           # nothing better (or nothing allowed): skip
        return None
    cost, e = price(offer, plan), energy(offer)
    if cost > e / 4:   # too dear (more than a quarter of its energy on one move): keep the energy for more turns
        return None
    # Your points on a board are your rarity there times the other players' rarity there, added up. So what this
    # change is worth is the bits it gains you (+1: a better board is a step towards the next rung) times the
    # others' bits (+1: a board nobody else wants yet is worth a little). Below RESERVE ⚡ it only pays for a change
    # worth at least 1 point per ⚡ (when the game does not say what boards are worth, worth is None: it pays).
    w = worth(offer)
    if w and e < RESERVE and (rarity(offer, top) - w.mine + 1) * (w.others + 1) < cost:
        return None
    return plan
