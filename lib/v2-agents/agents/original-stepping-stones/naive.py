# Stepping Stones · Naive (for learning)
# Your rule: cells in your biggest group of stepping stones.
# What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
# board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
# Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.


def score(B, p, tie):
    # How good is the board B for your rule? [main part, secondary]: bigger is better.
    # B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
    seen, main = set(), 0
    for s in range(B.n * B.n):
        if s in seen:
            continue
        g = [s]
        seen.add(s)
        for i in g:
            r, c = i // B.n, i % B.n
            for o in (i - B.n if r > 0 else -1, i + B.n if r < B.n - 1 else -1, i - 1 if c > 0 else -1, i + 1 if c < B.n - 1 else -1):
                if o >= 0 and o not in seen and abs(B.v[i] - B.v[o]) == p["hop"]:
                    seen.add(o)
                    g.append(o)
        main = max(main, len(g))
    # main: cells in your biggest group of stepping stones
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
    top, plans = score(B, p, tie), []
    for plan, B2 in tries:
        s = score(B2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
