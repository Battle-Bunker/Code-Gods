# Chessmaster · Example: places your two colours touch
# Main part: little chessboards of your two colours. Secondary preference: places your two colours touch.
# What it does: reads the board once (a small read), tries changes in its own head, and takes the one that raises your
# points most (your rarity times the other players'), working on your secondary preference once the main part is set.
# Try this: let it also try trading colours on the whole board (add "colours" moves): a trade can turn a stripe into a chessboard.


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
    for i in range(len(NAME)):   # swap two cells' colours
        for j in range(i + 1, len(NAME)):
            if B.c[i] != B.c[j]:
                c = list(B.c)
                c[i], c[j] = B.c[j], B.c[i]
                tries.append((move("cells.swap", a=NAME[i], b=NAME[j], what="colours"), Board(n, B.v, c, B.s)))
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
