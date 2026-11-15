# Divide By · Example: the answer's numerators add up to a number with a big smallest prime factor
# Main part: the number you divide by on your powers. Secondary preference: the answer's numerators add up to a number with a big smallest prime factor.
# What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
# that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
# it finds one it leaves you a note, so you can make a deal with that player.
# Try this: add "slide" to KINDS: it moves the answer, and so the numerators.


def score(L, p):
    # How good are the two lines L for your rule? [main part, secondary]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    if f.x is None:   # parallel lines never cross: no score
        return None
    main = power_ladder(p["k"], lambda t: abs(abs(f.D) - t))   # the number you divide by on k, k^3, k^6, ...
    nx, ny = f.x * f.D, f.y * f.D   # the answer's numerators
    return [main, spf(abs(nx) + abs(ny))]   # main: the level of the number you divide by on k, k³, k⁶, … (higher is better); secondary: numerators adding up to a number with a big smallest prime factor are better


FAR = 3      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["combine","turn","stretch"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
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
