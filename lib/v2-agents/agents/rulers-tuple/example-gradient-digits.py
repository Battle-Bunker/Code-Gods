# Same on Both Rulers (tuple) · Example: the gradient near the palindrome's digit sum
# Main part: the nearest target's size, the bigger the better. Secondary preference: the gradient near the palindrome's digit sum.
# What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
# no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
# the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
# back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
# with that player and put the line in LEAVE to keep it.
# Changing it later costs only what you change. To summon another agent, first move power from your agents to your
# own store (energy moves with it), pay, then share the power out again.
# Try this: remove the "shift" line: only tilts change the gradient.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m == p["meets"]:                              # parallel to y = meets·x: they never meet
        return None
    x = abs(c / (p["meets"] - m))                    # where the line meets y = meets·x, ignoring a minus sign
    n = nearest_palindrome(x, p["digits"] == "odd")         # the palindrome nearest it: bigger is better
    main = n
    return [main, -abs(abs(m) - sum(int(d) for d in str(n)))]   # main: the palindrome with the rule's count of digits nearest where the line meets y = x (or y = -x), the bigger the better; secondary: the gradient's size should be near the palindrome's digits added up


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
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
    m, c, p = v.m, v.c, rule.params
    # A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
    if m == None:
        return climb(offer, [(plan, score(m2, c2, p)) for plan, m2, c2 in tips(offer) if offer.object not in PROTECT or fair(offer, plan)], None, QUOTES)
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
    tries += rounding(m, c) + fractions(m, c)   # fractions: to a whole number and back into halves and thirds
    options = [(plan, score(m2, c2, p)) for plan, m2, c2 in tries]   # each step and the score it reaches
    # A promise: on these lines, only steps that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(m, c, p), QUOTES)
