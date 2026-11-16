# Set Spotter · Simple
# Your rule: SETs of three in a row.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and takes the change that raises your points most. Your points on a board are your rarity there times the
# other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
# lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: change QUOTES = 4 to 8: more prices compared before it pays.


def score(B, p, tie):
    # How good is the board B for your rule? [main part, secondary]: bigger is better.
    # B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
    main = 0
    for r in range(B.n):
        for c in range(B.n):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                r2, c2 = r + 2 * dr, c + 2 * dc
                if 0 <= r2 < B.n and 0 <= c2 < B.n:
                    a, b, d = r * B.n + c, (r + dr) * B.n + c + dc, r2 * B.n + c2
                    if len({B.c[a], B.c[b], B.c[d]}) != 2 and B.v[b] - B.v[a] == B.v[d] - B.v[b]:
                        main += 1
    # main: SETs of three in a row
    return [main]


FAR = 1      # how far one change of a number may go
QUOTES = 4  # at most this many plans are priced (each price is a host call)
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
    options = [(plan, score(B2, p, tie)) for plan, B2 in tries]   # each change and the score it reaches
    if offer.object in PROTECT:   # a promise kept
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(B, p, tie), QUOTES)
