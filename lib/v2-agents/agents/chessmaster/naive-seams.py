# Chessmaster · Naive (for learning)
# Main part: little chessboards of your two colours. Secondary preference: places your two colours touch.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(B, p):
    # How good is the board B for your rule? [main part, secondary]: bigger is better.
    # B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
    opp = lambda i, j: (B.c[i] == p["a"] and B.c[j] == p["b"]) or (B.c[i] == p["b"] and B.c[j] == p["a"])
    right = lambda i: i + 1 if i % B.n < B.n - 1 else -1
    down = lambda i: i + B.n if i + B.n < B.n * B.n else -1
    main, seams = 0, 0
    for i in range(B.n * B.n):
        for o in (right(i), down(i)):
            if o >= 0 and opp(i, o):
                seams += 1
        if right(i) >= 0 and down(i) >= 0 and opp(i, right(i)) and opp(i, down(i)) and B.c[down(i) + 1] == B.c[i]:
            main += 1
    return [main, seams]   # main: 2×2 chessboards of your two colours; secondary: places your two colours touch


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
    for i in range(len(NAME)):   # swap two cells' colours
        for j in range(i + 1, len(NAME)):
            if B.c[i] != B.c[j]:
                c = list(B.c)
                c[i], c[j] = B.c[j], B.c[i]
                tries.append((move("cells.swap", a=NAME[i], b=NAME[j], what="colours"), Board(n, B.v, c, B.s)))
    top, plans = score(B, p), []
    for plan, B2 in tries:
        s = score(B2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
