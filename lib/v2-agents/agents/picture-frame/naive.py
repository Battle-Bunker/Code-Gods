# Picture Frame · Naive (for learning)
# Your rule: your colour and your symbol on the edge, a clear middle.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(B, p, tie):
    # How good is the board B for your rule? [main part, secondary]: bigger is better.
    # B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
    def glyph(i):
        if B.s:
            return ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][B.v[i] - 1] + {"spades": "♠", "hearts": "♥", "diamonds": "♦", "clubs": "♣"}[B.s[i]]
        return "0123456789ABCDEF"[B.v[i]]
    main = 0
    for i in range(B.n * B.n):
        hits = (B.c[i] == p["colour"]) + (glyph(i) == p["symbol"])
        if hits:
            r, c = i // B.n, i % B.n
            edge = r == 0 or c == 0 or r == B.n - 1 or c == B.n - 1
            main += (1 if edge else -1) * (4 if hits == 2 else 1)
    # main: your colour and symbol on the edge, a clear middle
    return [main]


FAR = 1      # how far one change of a number may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


class Board:
    def __init__(self, n, v, c, s):
        self.n, self.v, self.c, self.s = n, v, c, s


def agent(offer):
    v = look(offer, "cells")   # the board
    rule = goal(offer)         # your rule (free)
    p, tie = rule.params, rule.tie_breaker
    NAME = [k for k in v.keys() if k[0] == "r" and "." not in k]   # the cells' names, r0c0 ..., row by row
    n = round(len(NAME) ** 0.5)
    B = Board(n, [int(v[k]) for k in NAME], [v[k + ".colour"] for k in NAME], [v[k + ".suit"] for k in NAME] if NAME[0] + ".suit" in v.keys() else None)
    tries = []   # (plan, board after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):   # add k to one cell
        for i in range(len(NAME)):
            if k:
                tries.append((move("cells.add", cell=NAME[i], k=k), Board(n, [x + k if j == i else x for j, x in enumerate(B.v)], B.c, B.s)))
    for i in range(len(NAME)):   # swap two cells' colours
        for j in range(i + 1, len(NAME)):
            if B.c[i] != B.c[j]:
                c = list(B.c)
                c[i], c[j] = B.c[j], B.c[i]
                tries.append((move("cells.swap", a=NAME[i], b=NAME[j], what="colours"), Board(n, B.v, c, B.s)))
    top, plans = score(B, p, tie), []
    for plan, B2 in tries:
        s = score(B2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
