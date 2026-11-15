# Right Angle · Example: the corner's distance is a big prime
# Main part: the lines cross at a right angle at a grid point, y on the dealt ladder. Tie-breaker: the corner's distance is a big prime.
# What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
# that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
# it finds one it leaves you a note, so you can make a deal with that player.
# Try this: add "quarter" to KINDS: a quarter turn keeps the right angle.


def score(L, p):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    floor = lambda v: v // 1   # rounded down
    if f.off_right is None or f.x is None:   # parallel lines never cross: no score
        return None
    main, Yc = ladder(f.y, p["q"], p["r"], f.off_right + dist(f.x))   # a right angle at a grid point, y on your ladder
    t = abs(f.X) + abs(Yc)   # the corner's |x| + |y|
    return [main, spf(t)]   # main: the corner's level: a right angle at a grid point, y on your ladder (higher is better); tie-breaker: a corner whose |x| + |y| has a big smallest prime factor is better


FAR = 3      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["turn","slide","translate"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate
LEAVE = []      # pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this pair alone
        return None
    if saving(offer):   # under 10 s of your income in hand: save up for a move (the game still tells you the pair)
        return None
    # A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
    contested(offer, 3)
    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each
    rule = goal(offer)          # your rule (free)
    p = rule.params
    # Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
    tries = pair_steps(L, FAR, KINDS, [f for f in (p.get("q"), p.get("k")) if f])   # (plan, lines after): moves tried in the agent's own head
    options = [(plan, score(L2, p)) for plan, L2 in tries]   # each move and the score it reaches
    # A promise: on these pairs, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(L, p), QUOTES)
