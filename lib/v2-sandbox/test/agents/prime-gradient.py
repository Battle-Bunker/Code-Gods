# Example 1 (spec §6.6): Prime Gradient, the direct lens. Read si; if m is not prime, tilt by the signed
# distance to the nearest prime (the first one found, on a tie).
def agent(offer):
    m = offer.view("si").m
    if m.denominator != 1: return None          # this agent only handles whole gradients
    m = m.numerator
    p = min((p for p in range(2, abs(m) + 30) if all(p % d for d in range(2, int(p ** .5) + 1))), key=lambda p: abs(p - m))
    return None if p == m else [call("si.tilt", k=p - m)]
