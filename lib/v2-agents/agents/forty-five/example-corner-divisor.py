# Forty-Five · Example: that |x| + |y| shares a factor with the number you divide by
# Main part: 45° at whole x and y, |x| + |y| on your pattern. Tie-breaker: that |x| + |y| shares a factor with the number you divide by.
# What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
# that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
# it finds one it leaves you a note, so you can make a deal with that player.
# Try this: add "tilt" to KINDS: a new gradient changes the number you divide by.


def score(L, p):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    mod1 = lambda n: abs(int(n)) or 1   # |n|, at least 1
    if f.D == 0:   # parallel lines never cross: no score
        return None
    main, S = ladder(abs(f.x) + abs(f.y), p["q"], p["r"], f.off45 + dist(f.x))   # 45 degrees at a grid point, |x| + |y| on your ladder
    return [main, common(S, f.D)]   # main: the corner's level: 45 degrees at a grid point, |x| + |y| on your ladder (higher is better); tie-breaker: a corner whose |x| + |y| shares a big factor with the number you divide by is better


FAR = 4      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["turn","slide","translate"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
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
    tries = pair_steps(L, FAR, KINDS)   # (plan, lines after): moves tried in the agent's own head
    options = [(plan, score(L2, p)) for plan, L2 in tries]   # each move and the score it reaches
    # A promise: on these pairs, only moves that leave the other players at least as well off.
    if offer.object in PROTECT:
        options = [(plan, s) for plan, s in options if fair(offer, plan)]
    # The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.
    return climb(offer, options, score(L, p), QUOTES)
