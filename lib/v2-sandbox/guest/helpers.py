# Helpers for agents, in plain words. Runs after codegods.py as part of the act's trusted prelude.
# The same names do the same things in TypeScript (helpers.js); lib/v2-agents/test/parity.test.ts checks it.
#
#   look(offer, rep)             what the line looks like in one view ("si", "seq", ...). Costs a little energy to
#                                read, once per act: looking again at the same view is free.
#   peek(offer, rep, name, args) one number of a view, e.g. peek(offer, "seq", "term", {"n": 3}).
#   goal(offer)                  your rule: its family, its numbers and the sentence on its card. Free.
#   progress(offer)              how well the line does on your rule now: level and top of the whole ladder; main
#                                and tiebreak (the score's parts, bigger is better); layers: each part's own
#                                level and top. Costs what reading your rule's views costs.
#   move(mutator, **args)        one change, e.g. move("si.tilt", k=1). A plan is a list of moves.
#   price(offer, plan)           the energy the plan would cost, or None when it is not allowed. Nothing changes.
#   cheapest(offer, plans)       of several plans (often the same change through different views), the cheapest
#                                allowed one, as a list of moves; None when none is allowed. One host call per plan.
#   energy(offer)                the energy your agent has.
#   prime(n), square(n)          is n a whole number that is prime / a perfect square? Anything else: False.
#                                (prime is exact below 3*10^24, and quick for any size.)
#   near(x, test)                the whole number nearest to x that passes the test, e.g. near(m, prime).
#                                The test gets a plain whole number. On a tie the smaller one; None if none
#                                within 10,000.
#   whole(x)                     the whole number nearest to x (a half rounds up).
#   root(n)                      the whole square root of n, rounded down (root(50) is 7).
#   factors(n)                   the prime factors of n, smallest first, with repeats: factors(12) is [2, 2, 3];
#                                [] for 0, 1 and -1. (Past 10,000 a leftover factor counts as prime.)
#   better(a, b)                 is score a better than score b? Scores are lists of parts compared in order, bigger
#                                is better; None is the worst score and a None part is the worst part.
#
# These run in the trusted prelude, outside the step count, so each does a bounded amount of work.
from fractions import Fraction
from math import isqrt as _isqrt


def _as_plan(plan):
    return list(plan) if isinstance(plan, (list, tuple)) else [plan]


def _whole(n):
    if isinstance(n, bool):
        return None
    if isinstance(n, int):
        return n
    if isinstance(n, Fraction):
        return n.numerator if n.denominator == 1 else None
    if isinstance(n, float):
        return int(n) if n.is_integer() else None
    return None


def look(offer, rep, site=None):
    return offer.view(rep, site)


def peek(offer, rep, name, args=None, site=None):
    return offer.element(rep, name, args, site)


def goal(offer):
    return offer.my_rule()


def progress(offer):
    s = offer.my_score()
    score = s.score

    def part(i):
        return None if score is None or i >= len(score) else score[i]

    return Record({"level": s.level, "top": s.top, "main": part(0), "tiebreak": part(1), "layers": s.layers,
                   "score": score, "terms": s.terms})


def move(mutator, site=0, **args):
    return call(mutator, site=site, **args)


def price(offer, plan):
    q = offer.quote(_as_plan(plan))
    return q.charge if q.valid else None


def cheapest(offer, plans):
    best, best_price = None, float("inf")
    for plan in plans:
        p = price(offer, plan)
        if p is not None and p < best_price:
            best, best_price = _as_plan(plan), p
    return best


def energy(offer):
    return offer.budget().energy


_WITNESSES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41)


def prime(n):
    # Miller-Rabin with the first thirteen primes as witnesses: exact below 3.3*10^24, and a fixed amount of work.
    x = _whole(n)
    if x is None or x < 2:
        return False
    for p in _WITNESSES:
        if x % p == 0:
            return x == p
    if x < 1681:                       # no prime factor up to 41, below 41 squared
        return True
    d, s = x - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in _WITNESSES:
        y = pow(a, d, x)
        if y == 1 or y == x - 1:
            continue
        for _ in range(s - 1):
            y = y * y % x
            if y == x - 1:
                break
        else:
            return False
    return True


def square(n):
    x = _whole(n)
    if x is None or x < 0:
        return False
    r = _isqrt(x)
    return r * r == x


def whole(x):
    return int((Fraction(x) + Fraction(1, 2)) // 1)


def root(n):
    x = _whole(n)
    if x is None or x < 0:
        return None
    return _isqrt(x)


def factors(n):
    x = _whole(n)
    if x is None:
        return None
    x = abs(x)
    out, d = [], 2
    while d * d <= x and d <= 10000:
        while x % d == 0:
            out.append(d)
            x //= d
        d += 1 if d == 2 else 2
    if x > 1:
        out.append(x)
    return out


def better(a, b):
    if a is None:
        return False
    if b is None:
        return True
    for x, y in zip(a, b):
        if x is None and y is None:
            continue
        if x is None:
            return False
        if y is None:
            return True
        if Fraction(x) != Fraction(y):
            return Fraction(x) > Fraction(y)
    return len(a) > len(b)


def near(x, test):
    v = Fraction(x)
    floor = v.numerator // v.denominator
    ceil = floor if floor == v else floor + 1
    low_first = v - floor <= ceil - v      # the nearer side is the same at every distance
    for d in range(10001):
        lo, hi = floor - d, ceil + d
        for n in ((lo, hi) if low_first else (hi, lo)):
            if test(n):
                return n
    return None
