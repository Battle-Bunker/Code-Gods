# Leading Digits · Simple
# Main part: the leading digits matched. Secondary preference: the digits of the powers' exponents, added up.
# What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
# time) and takes the change that raises your points most. Your points on a board are your rarity there times the
# other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
# lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: add the "trade" line from the Thorough starter: moving an amount from one cell to another keeps their total.


def score(b, p):
    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
    R = [0, 1, 2, 3] if p["layout"] == "halves" else [0, 2, 1, 3]   # the rows (and columns) in reading order: the first two, then the other two
    x = []   # the four readings: two rows (or two columns) as one number
    for by_row in (True, False):
        for k in (0, 1):
            y = 0
            for r in R[2 * k:2 * k + 2]:
                for j in range(4):
                    y = y * 10 + (b[4 * r + j] if by_row else b[4 * j + r])
            x.append(y)
    t = lead(p["b"])   # the starts of b's powers, each to its smallest exponent
    main, exponents = 0, 0
    for y in x:   # its digits matched, and that power's exponent's digits
        s, n = str(y), 0
        while n < len(s) and s[:n + 1] in t:
            n += 1
        main += n
        if n:
            exponents += sum(int(d) for d in str(t[s[:n]]))
    seen = set()
    for i in range(8):   # a row (or column) holding the same numbers as an earlier one: one off
        k = (i < 4, tuple(sorted(b[4 * i + j] if i < 4 else b[4 * j + i - 4] for j in range(4))))
        if k in seen:
            main -= 1
        seen.add(k)
    return [main, exponents]   # main: the leading digits each reading shares with a power of b, added up, less the repeated rows and columns (more is better); secondary: the matched powers' exponents, their digits added up, bigger is better


FAR = 1      # how far one change may go
QUOTES = 4  # at most this many plans are priced (each price is a host call)
LEAVE = []      # boards your agent skips, e.g. [19] or [4, 9]: it does not act on them (others still may)
PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
LEAD = {}   # for each base: every start (its first 1 to 8 digits) of its powers up to the 1000th, to the smallest exponent with it


def lead(base):
    if base not in LEAD:
        t, x = {}, 1   # x: base to the k, exact while short, then its first 40 digits (the first 8 stay exact)
        for k in range(1001):
            s = str(x)[:8]
            for n in range(1, len(s) + 1):
                t.setdefault(s[:n], k)
            x *= base
            if x >= 10 ** 40:
                x //= 10
        LEAD[base] = t
    return LEAD[base]


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
    options = [(plan, score(b2, p)) for plan, b2 in tries]   # each step and the score it reaches
    # A promise: on these boards, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(b, p), QUOTES)
