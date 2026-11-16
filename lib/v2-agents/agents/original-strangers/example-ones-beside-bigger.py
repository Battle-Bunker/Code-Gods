# Strangers · Example: 1s touching a bigger number in their box
# Main part: touching strangers in a box, both bigger than 1. Secondary preference: 1s touching a bigger number in their box.
# What it does: reads the board once (a small read), tries changes in its own head, and takes the one that raises your
# points most (your rarity times the other players'), working on your secondary preference once the main part is set.
# Try this: change FAR = 1 to 3: a cell can drop to 1 in one move, though each move costs more.


def score(B, p):
    # How good is the board B for your rule? [main part, secondary]: bigger is better.
    # B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
    gcd = lambda a, b: a if b == 0 else gcd(b, a % b)   # the biggest number that divides both
    main, ones = 0, 0
    for k in range(B.n):
        for j in range(0, B.n - 1, 2):   # the touching pairs inside the boxes
            for i, o in ((k * B.n + j, k * B.n + j + 1), (j * B.n + k, (j + 1) * B.n + k)):
                a, b = B.v[i], B.v[o]
                if a * b < 2 or gcd(a, b) > 1:
                    continue   # a 0, two 1s, or a shared divisor
                if a == 1 or b == 1:
                    ones += 1
                elif abs(a - b) > 1:
                    main += 1
    return [main, ones]   # main: touching strangers in a 2×2 box, both bigger than 1; secondary: 1s touching a bigger number in their box


FAR = 1      # how far one change of a number may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


class Board:
    def __init__(self, n, v, c, s):
        self.n, self.v, self.c, self.s = n, v, c, s


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this board alone
        return None
    if saving(offer):   # under 10 s of your income in hand: save up for a move
        return None
    contested(offer, 3)   # a tug-of-war burns energy on both sides: tell your owner, who can make a deal
    v = look(offer, "cells")   # the board
    rule = goal(offer)         # your rule (free)
    p = rule.params
    NAME = [k for k in v.keys() if k[0] == "r" and "." not in k]   # the cells' names, r0c0 ..., row by row
    n = round(len(NAME) ** 0.5)
    B = Board(n, [int(v[k]) for k in NAME], [v[k + ".colour"] for k in NAME], [v[k + ".suit"] for k in NAME] if NAME[0] + ".suit" in v.keys() else None)
    tries = []   # (plan, board after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):   # add k to one cell
        for i in range(len(NAME)):
            if k:
                tries.append((move("cells.add", cell=NAME[i], k=k), Board(n, [x + k if j == i else x for j, x in enumerate(B.v)], B.c, B.s)))
    on = sorted(set(B.c))   # the colours on the board: trade two of them everywhere
    for x in on:
        for y in on:
            if x < y:
                tries.append((move("colours.trade", a=x, b=y), Board(n, B.v, [y if z == x else x if z == y else z for z in B.c], B.s)))
    options = [(plan, score(B2, p)) for plan, B2 in tries]   # each change and the score it reaches
    if offer.object in PROTECT:   # a promise kept
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(B, p), QUOTES)
