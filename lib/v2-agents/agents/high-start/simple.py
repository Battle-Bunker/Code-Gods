# High Start · Simple
# Main part: the gentler line crosses the y-axis on your pattern. Secondary preference: whichever you were dealt (the y-intercepts' gap near a multiple of your number; the crossing's x near a multiple of your number; that y-intercept plus the crossing's x has a big smallest prime factor; that y-intercept, without its factors of your number, shares a factor with the steeper gradient).
# What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
# no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
# times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
# can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: add a move from the Thorough starter's KINDS and compare.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, secondary]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    floor = lambda v: v // 1   # rounded down
    core = lambda n: core(abs(int(n)) // p["q"]) if n and abs(int(n)) % p["q"] == 0 else abs(int(n))   # without its factors of q
    if f.cg is None or f.mg is None:   # the gentler line is upright: no score
        return None
    main, H = valuation_ladder(f.cg, p["q"], p["r"])   # the y-intercept on your ladder
    # main: the level of the gentler line's y-intercept on your ladder (higher is better)
    if tie == "start-echo":   # the gap between the y-intercepts near a multiple of q to the power one above your level is better
        return [main, None if f.ygap is None else -off_multiple(f.ygap, p["q"] ** (level_of(main, p["q"]) + 1))]
    if tie == "start-crossing":   # a crossing whose x is near a multiple of q to the power one above your level is better
        return [main, None if f.x is None else -off_multiple(f.x, p["q"] ** (level_of(main, p["q"]) + 1))]
    if tie == "start-prime":   # that y-intercept plus the crossing's x with a big smallest prime factor is better
        return [main, None if f.x is None else spf(abs(H) + abs(whole(f.x)))]
    if tie == "start-steep":   # that y-intercept (without its factors of q) sharing a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(core(H), abs(f.ms) // 1)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["shift","tilt","stretch"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
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
    p, tie = rule.params, rule.tie_breaker
    # Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
    tries = pair_steps(L, FAR, KINDS, [f for f in (p.get("q"), p.get("k")) if f])   # (plan, lines after): moves tried in the agent's own head
    options = [(plan, score(L2, p, tie)) for plan, L2 in tries]   # each move and the score it reaches
    # A promise: on these pairs, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(L, p, tie), QUOTES)
