# Helpers for agents, in plain words. Runs after codegods.py as part of the act's trusted prelude.
# The same names do the same things in TypeScript (helpers.js); lib/v2-agents/test/parity.test.ts checks it.
#
#   look(offer, rep)             what the line looks like in one view ("si", "seq", ...). Costs a little energy to
#                                read, once per act: looking again at the same view is free.
#   peek(offer, rep, name, args) one number of a view, e.g. peek(offer, "seq", "term", {"n": 3}).
#   goal(offer)                  your rule: its family, its numbers and the sentence on its card, and the object
#                                it scores ("line", "grid"). Free.
#   progress(offer)              how well the line does on your rule now: main and tiebreak (the score's parts,
#                                bigger is better), and bits (what that score is worth, its rarity; None when the
#                                game does not say). Costs what reading your rule's views costs.
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
#   smooth(n)                    is n made only by multiplying 2s, 3s, 5s and 7s (1 included; the sign ignored)?
#                                e.g. near(x, smooth).
#   shared(a, b)                 how many prime factors whole numbers a and b share, counting repeats (the factors of
#                                their greatest common factor); 0 when either is 0.
#   root(n)                      the whole square root of n, rounded down (root(50) is 7).
#   factors(n)                   the prime factors of n, smallest first, with repeats: factors(12) is [2, 2, 3];
#                                [] for 0, 1 and -1. (Past 10,000 a leftover factor counts as prime.)
#   better(a, b)                 is score a better than score b? Scores are lists of parts compared in order, bigger
#                                is better; None is the worst score and a None part is the worst part.
#   worth(offer)                 what this line is worth to you now: mine (your rarity), others (the other players'
#                                rarity added up) and points (mine x others). None when the game does not say.
#   rarity(offer, score)         the rarity your rule gives a score (from your own score function); 0 when the game
#                                does not say. Free.
#   recent(offer)                the latest moves on this line you may see, newest last: .mine, .points_before, .points_after.
#   pushback(offer)              how many times lately someone else's move took back points your agent had just won
#                                on this line (a tug-of-war).
#   fair(offer, plan)            True when the plan would not lower the other players' rarity on this line, added up
#                                (True when the game does not say). Costs a small read each time.
#   rounding(m, c)               for a line y = mx + c with a fraction in it (rational lines): the steps that bring the
#                                gradient or the y-intercept to the whole number below or above, nudge it by one part
#                                (±1/d), or stretch the line by a denominator d; each (plan, m after, c after). [] when
#                                both are whole numbers.
#   fractions(m, c)              steps into fractions on a line y = mx + c: shift or tilt by ±1/2, ±1/3, ±2/3, or stretch
#                                by 1/2, 2/3 or 3/2; each (plan, m after, c after) ([] on a vertical line).
#   tips(offer)                  on a vertical line (x = k: no y = mx + c), the moves that tip it into one: mirror across
#                                y = x (to y = k) or nudge b up by 1 or 2; each (plan, m after, c after). A small read.
#                                [] on any other line.
#   climb(offer, options, now, most)
#                                the step that raises your points here most (your rarity × the others' rarity, added
#                                up), from options [(plan, score it reaches), ...]; None when none does. It weighs the
#                                `most` options best for your rule (all when left out), a small read each. now is your
#                                score here; without the game's values it takes the step best for your rule instead.
#   note(offer, text)            leave your owner a short note (they read it in the act log). At most 3 a turn.
#   contested(offer, times)      True when pushback(offer) has reached times; it then leaves your owner a note naming
#                                the tug-of-war and suggesting a deal with the other player.
#
# These run in the trusted prelude, outside the step count, so each does a bounded amount of work.
from fractions import Fraction
import functools as _functools
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

    return Record({"main": part(0), "tiebreak": part(1), "bits": s.bits, "layers": s.layers,
                   "score": score, "terms": s.terms})


def move(mutator, site=0, **args):
    return call(mutator, site=site, **args)


_last_cheapest = [None, None, None]   # the offer, the plan cheapest() returned, and its price


def price(offer, plan):
    if plan is _last_cheapest[1] and offer is _last_cheapest[0]:   # just quoted: no second call
        return _last_cheapest[2]
    q = offer.quote(_as_plan(plan))
    return q.charge if q.valid else None


def cheapest(offer, plans):
    best, best_price = None, float("inf")
    for plan in plans:
        p = price(offer, plan)
        if p is not None and p < best_price:
            best, best_price = _as_plan(plan), p
    _last_cheapest[:] = [offer, best, best_price if best is not None else None]
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


def smooth(n):
    x = _whole(n)
    if x is None or x == 0:
        return False
    x = abs(x)
    for p in (2, 3, 5, 7):
        while x % p == 0:
            x //= p
    return x == 1


def shared(a, b):
    x, y = _whole(a), _whole(b)
    if x is None or y is None or x == 0 or y == 0:
        return 0
    x, y = abs(x), abs(y)
    while y:
        x, y = y, x % y
    k, d = 0, 2
    while d * d <= x and d <= 100000:
        while x % d == 0:
            x //= d
            k += 1
        d += 1 if d == 2 else 2
    return k + 1 if x > 1 else k


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


def worth(offer):
    try:
        return offer.worth()
    except HostError:
        return None


def rounding(m, c):
    out = []
    if not isinstance(m, Fraction) or not isinstance(c, Fraction):
        return out
    parts = []
    if c.denominator != 1:
        for to in (Fraction(c.numerator // c.denominator), Fraction(c.numerator // c.denominator + 1)):
            out.append((call("si.shift", k=to - c), m, to))
        for k in (Fraction(1, c.denominator), Fraction(-1, c.denominator)):
            out.append((call("si.shift", k=k), m, c + k))
        parts.append(c.denominator)
    if m.denominator != 1:
        for to in (Fraction(m.numerator // m.denominator), Fraction(m.numerator // m.denominator + 1)):
            out.append((call("si.tilt", k=to - m), to, c))
        for k in (Fraction(1, m.denominator), Fraction(-1, m.denominator)):
            out.append((call("si.tilt", k=k), m + k, c))
        if m.denominator != c.denominator:
            parts.append(m.denominator)
    for d in parts:
        out.append((call("mach.stretch", f=Fraction(d)), m * d, c * d))
    return out


def fractions(m, c):
    out = []
    if not isinstance(m, Fraction) or not isinstance(c, Fraction):
        return out
    for k in (Fraction(1, 2), Fraction(-1, 2), Fraction(1, 3), Fraction(-1, 3), Fraction(2, 3), Fraction(-2, 3)):
        out.append((call("si.shift", k=k), m, c + k))
        out.append((call("si.tilt", k=k), m + k, c))
    for f in (Fraction(1, 2), Fraction(2, 3), Fraction(3, 2)):
        out.append((call("mach.stretch", f=f), m * f, c * f))
    return out


def tips(offer):
    try:
        g = offer.view("gen")
    except HostError:
        return []
    a, b, c = g.a, g.b, g.c
    if not isinstance(a, Fraction) or not isinstance(c, Fraction) or b != 0 or a == 0:
        return []
    return [
        (call("cart.mirror", axis="diagonal"), Fraction(0), -c / a),
        (call("gen.nudge", which="b", k=1), -a, -c),
        (call("gen.nudge", which="b", k=2), -a / 2, -c / 2),
    ]


def climb(offer, options, now, most=None):
    options = sorted(options, key=_functools.cmp_to_key(lambda a, b: -1 if better(a[1], b[1]) else 1 if better(b[1], a[1]) else 0))
    if most is not None:
        options = options[:most]
    w = worth(offer)
    best = None
    if w is None:   # the best step for your rule that beats now and is allowed
        for plan, s in options:
            if not better(s, now):
                break
            if price(offer, plan) is not None:
                return _as_plan(plan)
        return None
    value = w.mine * w.others
    for plan, s in options:
        try:
            o = offer.others_after(_as_plan(plan))
        except HostError:
            continue
        if o.after is None:   # not allowed (e.g. another object is in that state)
            continue
        v = rarity(offer, s) * o.after
        if v > value + 1e-9:
            value, best = v, plan
    return None if best is None else _as_plan(best)


def fair(offer, plan):
    try:
        o = offer.others_after(_as_plan(plan))
        return o.after is None or o.after >= o.before
    except HostError:
        return True


def recent(offer):
    try:
        return offer.recent()
    except HostError:
        return []


def pushback(offer):
    count, gained = 0, False
    for m in recent(offer):
        if m.mine:
            gained = m.points_after > m.points_before
        elif gained and m.points_after < m.points_before:
            count, gained = count + 1, False
    return count


def note(offer, text):
    try:
        return offer.note(text)
    except HostError:
        return False


def contested(offer, times):
    if pushback(offer) < times:
        return False
    noun = offer.my_rule().object   # "line", "grid": the game's own word (free)
    note(offer, f"Tug-of-war on {noun} {offer.object}: another player keeps pulling it back. Make a deal with them; to keep your agent off it, add {offer.object} to \"leaves these {noun}s alone\" under your agent.")
    return True


def rarity(offer, s):
    try:
        return offer.rarity(s)
    except HostError:
        return 0


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
        if type(x) is int and type(y) is int:   # the common case, without fractions
            if x != y:
                return x > y
            continue
        if Fraction(x) != Fraction(y):
            return Fraction(x) > Fraction(y)
    return len(a) > len(b)


_PRIME, _SQUARE = prime, square     # the helpers themselves, even if an agent reuses the names


def near(x, test):
    v = Fraction(x)
    # Exact for any size where the answer is known in closed form: below 2 the nearest prime is 2; squares by root.
    if test is _PRIME and v <= 2:
        return 2
    if test is _SQUARE:
        if v <= 0:
            return 0
        r = _isqrt(v.numerator // v.denominator)
        lo, hi = r * r, (r + 1) * (r + 1)
        return hi if hi - v < v - lo else lo
    floor = v.numerator // v.denominator
    ceil = floor if floor == v else floor + 1
    low_first = v - floor <= ceil - v      # the nearer side is the same at every distance
    for d in range(10001):
        lo, hi = floor - d, ceil + d
        for n in ((lo, hi) if low_first else (hi, lo)):
            if test(n):
                return n
    return None
