# m Meets c: the gap c - m closes three ways; price each route and make the cheapest.
def agent(offer):
    v = look(offer, "si")
    gap = v.c - v.m
    if gap == 0:
        return None
    routes = [
        move("si.shift", k=-gap),              # move c down to m
        move("si.tilt", k=gap),                # move m up to c
    ]
    half = gap / 2
    if half.denominator == 1:
        routes.append(move("seq.step", k=half))   # both meet half way
    return cheapest(offer, routes)
