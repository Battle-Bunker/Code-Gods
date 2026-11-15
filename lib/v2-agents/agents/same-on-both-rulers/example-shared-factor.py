# Same on Both Rulers · Example: the biggest number dividing both the palindrome's digit sum and the y-intercept's whole part
# Main part: the unchanged number on as big a palindrome as possible. Tie-breaker: the biggest number dividing both the palindrome's digit sum and the y-intercept's whole part.
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: remove the "tilt" line: a turn keeps the y-intercept and moves the unchanged number; can it still find a palindrome?


# Palindromes starting and ending in the digit d (d, dd, d0d, d1d, ...): those nearest y, the nearest, and its level.
def pals(y, d):
    w = str(0 if y <= 0 else whole(y - Fraction(1, 2)))   # y rounded down
    L = len(w)
    pal = lambda h, n: int(str(h) + str(h)[:n // 2][::-1])   # n digits from the first (n + 1) // 2, h
    lo = lambda n: d * 10 ** ((n - 1) // 2)
    hi = lambda n: lo(n) + 10 ** ((n - 1) // 2) - 1
    h0 = int(w[:(L + 1) // 2])
    out = [pal(lo(L + 1), L + 1)] + [pal(min(max(h, lo(L)), hi(L)), L) for h in (h0 - 1, h0, h0 + 1)]
    return out + [pal(hi(L - 1), L - 1)] if L > 1 else out

def rung_of(y, d):   # the nearest (the smaller on a tie)
    w = -1 if y <= 0 else whole(y - Fraction(1, 2))   # whole numbers at or below y are those at or below w
    a = max((t for t in pals(y, d) if t <= w), default=None)
    b = min((t for t in pals(y, d) if t > w), default=None)
    return b if a is None or b - y < y - a else a

def on_rung(y, r):   # on the rung when y rounds to it: its levels of digits (level L needs L(L + 1)/2); else how far from rounding to it
    if whole(y) != r:
        return -(abs(y - r) - Fraction(1, 2))
    D = len(str(r))
    L = next(L for L in range(99) if (L + 1) * (L + 2) // 2 > D)
    return L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1)

def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        y = p.get("side", 1) * c                        # x = c meets y = x at c
        main = on_rung(y, rung_of(y, p["d"]))
        return [main, None]
    if m == 1:                                      # parallel to y = x: no number stays unchanged
        return None
    y = p.get("side", 1) * c / (1 - m)              # the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)
    rung = rung_of(y, p["d"])
    main = on_rung(y, rung)
    total, wc = sum(int(ch) for ch in str(rung)), whole(abs(c) - Fraction(1, 2))   # the palindrome's digits added up; the whole part of |c|
    return [main, common(total, wc)]   # main: the palindrome starting and ending in d (d, dd, d0d, ...) that the number the machine leaves unchanged rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one; tie-breaker: a bigger number dividing both the palindrome's digit sum and the y-intercept's whole part is better


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this line alone
        return None
    if saving(offer):   # under 10 s of your income in hand: save up for a move (the game still tells you the line)
        return None
    # A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
    contested(offer, 3)
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p = v.m, v.c, rule.params
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    if m == None:              # a vertical line (x = k): tip it into y = mx + c, or slide it sideways
        m, c = None, look(offer, "crossing").x0   # where it stands: score(None, k) reads the line x = k
        tries += vertical(offer, FAR)   # its tips into y = mx + c and its slides sideways
    else:
        for k in range(-FAR, FAR + 1):
            if k == 0:
                continue
            tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
            tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
            den = 1 - m * k
            if den != 0: tries.append((move("rot.turn", centre=0, turn=k), (m + k) / den, c))   # turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
        # The next palindrome up (the ladder has no top): the smallest one above the unchanged number, by a shift or by a tilt.
        if m != 1:
            s = p.get("side", 1)
            y = s * c / (1 - m)                          # the unchanged number (minus it on the mirror)
            to = s * min(t for t in pals(y, p["d"]) if t > y)
            tries.append((move("si.shift", k=to * (1 - m) - c), m, to * (1 - m)))   # keep m, move c
            if c != 0:
                tries.append((move("si.tilt", k=1 - c / to - m), 1 - c / to, c))   # keep c, move m
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p), QUOTES)
