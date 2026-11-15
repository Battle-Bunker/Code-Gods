# No Fractions · Bold
# Main part: the number you divide by is 1. Tie-breaker: whichever you were dealt (the answer's distance is a big prime; the answer's distance shares a factor with the steeper gradient).
# What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
# no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
# times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
# can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
# Try this: change FAR = 4 to 2: shorter steps, cheaper moves.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    if f.x is None:   # parallel lines never cross: no score
        return None
    main = -(abs(f.D) - 1)
    # main: how far the number you divide by is from 1 (closer is better)
    if tie == "answer-prime":   # |X| + |Y| with a big smallest prime factor is better
        return [main, spf(abs(f.X) + abs(f.Y))]
    if tie == "answer-gradient":   # |X| + |Y| sharing a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(abs(f.X) + abs(f.Y), abs(f.ms) // 1)]
    return [main]


FAR = 4      # how far one move may go
QUOTES = 12  # at most this many plans are priced (each price is a host call)
KINDS = ["combine","turn"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter
LEAVE = []      # pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
PROTECT = []    # pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off


def agent(offer):
    if offer.object in LEAVE:   # a deal: leave this pair alone
        return None
    # A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
    # sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
    contested(offer, 3)
    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each
    rule = goal(offer)          # your rule (free)
    p, tie = rule.params, rule.tie_breaker
    tries = pair_steps(L, FAR, KINDS)   # (plan, lines after): moves tried in the agent's own head
    options = [(plan, score(L2, p, tie)) for plan, L2 in tries]   # each move and the score it reaches
    # A promise: on these pairs, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(L, p, tie), QUOTES)
