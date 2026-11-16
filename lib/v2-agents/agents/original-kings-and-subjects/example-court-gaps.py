# Kings and Subjects · Example: how far the kings are from their subjects added up
# Main part: boxes whose king equals his subjects added up. Secondary preference: how far the kings are from their subjects added up.
# What it does: reads the board once (a small read), tries changes in its own head, and takes the one that raises your
# points most (your rarity times the other players'), working on your secondary preference once the main part is set.
# Try this: change FAR = 1 to 3: one move can then close a bigger gap between a king and his subjects, at a higher price.


def score(B, p):
    # How good is the board B for your rule? [main part, secondary]: bigger is better.
    # B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
    step = 2 if p["squares"] == "corners" else 1
    main, gap = 0, 0
    for r in range(0, B.n - 1, step):
        for c in range(0, B.n - 1, step):
            i = r * B.n + c
            box = [B.v[i], B.v[i + 1], B.v[i + B.n], B.v[i + B.n + 1]]
            king = max(box)
            if box.count(king) > 1:   # the biggest number twice: no king
                gap += p["noKing"]
                continue
            away = abs(2 * king - sum(box))   # the king against his three subjects added up
            gap += away
            if away == 0:
                main += 1
    return [main, -gap]   # main: 2×2 boxes whose king equals his subjects added up; secondary: how far the kings are from their subjects added up (less is better)


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
