# Stepping Stones · Example: board corners in the biggest group
# Main part: the biggest group you can hop between. Secondary preference: board corners in the biggest group.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
# (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
# a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
# raises your points most (your rarity times the other players').
# Try this: remove the "swap" line: can single steps reach a corner?


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    def near(i):   # the cells touching cell i
        return [j for j in (i - 4, i + 4, i - 1 if i % 4 else -1, i + 1 if i % 4 < 3 else -1) if 0 <= j < 16]
    best = []   # the biggest group (the first found on a tie)
    seen = set()
    for s in range(16):
        if s in seen:
            continue
        group = [s]
        seen.add(s)
        for i in group:   # hop on to touching cells 2 apart
            for j in near(i):
                if j not in seen and abs(b[i] - b[j]) == 2:
                    seen.add(j)
                    group.append(j)
        if len(group) > len(best):
            best = group
    main = len(best)
    return [main, len([i for i in best if i in (0, 3, 12, 15)])]   # main: the cells in the biggest group you can hop between, touching cells 2 apart (more is better); secondary: more of the board's corners in the biggest group is better


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
    options = score_each(tries, lambda t: (t[0], score(t[1], p)))   # each step and the score it reaches (fewer on a big board)
    # A promise: on these boards, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(b, p), QUOTES)
