# Mirrormancer · Thorough
# Main part: every row reads the same backwards. Tie-breaker: 0s on the board.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and finds the cheapest change to the best board for your rule. Your points on a board are your rarity there
# times the other players' rarity there added up, so once its energy is below RESERVE it only pays for a change worth
# a point per ⚡ (the bits it gains you times the others' bits), keeping the rest for boards where points count. It
# notes a tug-of-war for you (so you can make a deal) and never spends more than a quarter of its energy on one move.
# Try this: change QUOTES = 6 to 2: fewer prices asked, but it may miss a cheaper plan.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
    main = 0
    for r in range(0, 16, 4):   # each row: its ends' gap and its middle's gap
        main -= abs(b[r] - b[r + 3]) + abs(b[r + 1] - b[r + 2])
    return [main, b.count(0)]   # main: how far each row is from reading the same backwards, added up (closer is better); tie-breaker: more 0s is better


FAR = 2      # how far one change may go
QUOTES = 6  # at most this many plans are priced (each price is a host call)
RESERVE = 300  # below this much ⚡, only pay for changes that add points (see the end)
LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
TARGET = None   # a board every player agreed on, its 16 digits row by row, e.g. "9779855879979779": boards go there and stay
SETTLE = []     # the boards to settle at TARGET, e.g. [2, 5]; [] means every board


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
    add = lambda i, k: move("cells.add", cell=NAME[i], k=k)   # the move that adds k to cell i
    tries = []                 # (plan, board after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        for i in range(16):   # add k to one cell
            tries.append((add(i, k), edit(b, [i], lambda j: k)))
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
    # A promise: on these boards, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        plans = [plan for plan in plans[:QUOTES] if fair(offer, plan)]
    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best
    if plan is None:           # nothing better (or nothing allowed): skip
        return None
    cost, e = price(offer, plan), energy(offer)
    if cost > e / 4:   # too dear (more than a quarter of its energy on one move): keep the energy for more turns
        return None
    # Your points on a board are your rarity there times the other players' rarity there, added up. So what this
    # change is worth is the bits it gains you (+1: a small gain still counts for something) times the
    # others' bits (+1: a board nobody else wants yet is worth a little). Below RESERVE ⚡ it only pays for a change
    # worth at least 1 point per ⚡ (when the game does not say what boards are worth, worth is None: it pays).
    w = worth(offer)
    if w and e < RESERVE and (rarity(offer, top) - w.mine + 1) * (w.others + 1) < cost:
        return None
    return plan
