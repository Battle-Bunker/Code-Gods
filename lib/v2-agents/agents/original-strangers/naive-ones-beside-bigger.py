# Strangers · Naive (for learning)
# Main part: touching strangers in a box, both bigger than 1. Secondary preference: 1s touching a bigger number in their box.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


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


class Board:
    def __init__(self, n, v, c, s):
        self.n, self.v, self.c, self.s = n, v, c, s


def agent(offer):
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
    top, plans = score(B, p), []
    for plan, B2 in tries:
        s = score(B2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
