# Prime Gradient: look at y = mx + c, find the nearest prime to the gradient, tilt to it.
def agent(offer):
    m = look(offer, "si").m
    if m is None:                              # a vertical line has no gradient
        return None
    p = near(m, prime)
    if p == m:                                 # already prime: nothing to do
        return None
    return [move("si.tilt", k=p - m)]
