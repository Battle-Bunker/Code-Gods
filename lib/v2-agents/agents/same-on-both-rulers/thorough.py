# Same on Both Rulers · Thorough
# Main part: where the line meets y = x or y = −x, on as big a number reading the same backwards as possible (ignoring a minus sign). Secondary preference: whichever you were dealt (the biggest number dividing both that number's digits added up and the gradient's whole part).
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


# Palindromes (1, 2 ... 9, 11, 22 ... 99, 101, 111 ...) with an odd, or an even, number of digits: those nearest y, the nearest, and its level.
def pals(y, odd):
    w = str(0 if y <= 0 else whole(y - Fraction(1, 2)))   # y rounded down
    L, h0, out = len(w), int(w[:(len(w) + 1) // 2]), []
    pal = lambda h, n: int(str(h) + str(h)[:n // 2][::-1])   # n digits from the first (n + 1) // 2, h
    lo = lambda n: 10 ** ((n + 1) // 2 - 1)
    hi = lambda n: 10 ** ((n + 1) // 2) - 1
    for n in range(max(1, L - 2), L + 3):   # the longest shorter one, the shortest longer one, and those around y
        if n % 2 == (1 if odd else 0):
            out += [pal(hi(n), n)] if n < L else [pal(lo(n), n)] if n > L else [pal(min(max(h, lo(n)), hi(n)), n) for h in (h0 - 1, h0, h0 + 1)]
    return out

def rung_of(y, odd):   # the nearest (the bigger on a tie, as y rounds)
    w = -1 if y <= 0 else whole(y - Fraction(1, 2))   # whole numbers at or below y are those at or below w
    a = max((t for t in pals(y, odd) if t <= w), default=None)
    b = min((t for t in pals(y, odd) if t > w), default=None)
    return b if a is None or b - y <= y - a else a

def on_rung(y, r):   # on the rung when y rounds to it: its levels of digits (level L needs L(L + 1)/2); else how far from rounding to it
    if whole(y) != r:
        return -(abs(y - r) - Fraction(1, 2))
    D = len(str(r))
    L = next(L for L in range(99) if (L + 1) * (L + 2) // 2 > D)
    return L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1)

def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        y = abs(c)                                     # x = c meets y = x and y = -x at x = c
        main = on_rung(y, rung_of(y, p["digits"] == "odd"))
        return [main] + [None for t in (tie.split(">") if tie else [])]
    if m == p["meets"]:                             # parallel to y = x (or y = -x): it never meets it
        return None
    y = abs(c / (p["meets"] - m))                   # mx + c = meets*x where x = c/(meets - m); its size (a minus sign does not matter)
    rung = rung_of(y, p["digits"] == "odd")
    main = on_rung(y, rung)
    # main: the palindrome with an odd (or even) number of digits that the line's meeting point with y = x (or y = -x) rounds to, ignoring its sign, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "shared-factor":   # a bigger number dividing both the palindrome's digit sum and the gradient's whole part is better
            total, wm = sum(int(ch) for ch in str(rung)), whole(abs(m) - Fraction(1, 2))   # the palindrome's digits added up; the whole part of |m|
            return common(total, wm)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


FAR = 3      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)
LEAVE = []      # lines your agent skips, e.g. [19] or [4, 9]: others may still move them
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
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
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
            tries.append((move("seq.step", k=k), m + k, c - k))   # change the pattern's step, keeping y(1)
            den = 1 - m * k
            if den != 0: tries.append((move("rot.turn", centre=0, turn=k), (m + k) / den, c))   # turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
        # The next palindrome up (the ladder has no top): the smallest one above the meeting point's size, keeping its sign, by a shift or by a tilt.
        if m != p["meets"]:
            x = c / (p["meets"] - m)                     # where the line meets y = meets*x
            s, y = (-1 if x < 0 else 1), abs(x)
            to = s * min(t for t in pals(y, p["digits"] == "odd") if t > y)
            tries.append((move("si.shift", k=to * (p["meets"] - m) - c), m, to * (p["meets"] - m)))   # keep m, move c
            if c != 0:
                tries.append((move("si.tilt", k=p["meets"] - c / to - m), p["meets"] - c / to, c))   # keep c, move m
        tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    tries += shortcuts(m, c, rule.mutators)   # other views the game offers: mirrors, a slide, turns, one intercept moved
    options = score_each(tries, lambda t: (t[0], score(t[1], t[2], p, tie)))   # each step and the score it reaches (fewer on a big line)
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    one = climb(offer, options, score(m, c, p, tie), QUOTES)
    if one or offer.object in PROTECT:
        return one
    # No single step helps: look two steps ahead (each step, then a shift or tilt by 1) and take the first
    # step of the best pair, though it may lower your points for a moment. It weighs the 4 best pairs: a few more small reads.
    # The first steps: the 6 best for your rule (options are tries with their scores, in the same order).
    cands, firsts = [(t, o[1]) for t, o in zip(tries, options) if t[1] is not None], []
    while cands and len(firsts) < 6:
        best = 0
        for i in range(1, len(cands)):
            if better(cands[i][1], cands[best][1]):
                best = i
        firsts.append(cands.pop(best)[0])
    pairs = []
    for plan, m1, c1 in firsts:
        if steps_left() < 0.45 * step_budget():   # a big line: weigh fewer pairs rather than fail
            break
        first = list(plan) if isinstance(plan, (list, tuple)) else [plan]
        for k in (-1, 1):
            pairs.append((first + [move("si.shift", k=k)], score(m1, c1 + k, p, tie)))
            pairs.append((first + [move("si.tilt", k=k)], score(m1 + k, c1, p, tie)))
    two = climb(offer, pairs, score(m, c, p, tie), 4)
    return two[:-1] if two else None
