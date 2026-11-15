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
#   near(x, test, k)             the same among positive whole numbers ending in the digit k: near(c, prime, 3) is
#                                the prime ending in 3 nearest c (below the smallest such prime, that prime).
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
#                                others is your agents' own estimate (in a noisy room each player's agents get their
#                                own blur), not the server's count: a note reporting it should say it is an estimate.
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
#   vertical(offer, far)         on a vertical line x = k, its steps: the tips (as tips(offer)) and the slides sideways
#                                by ±1 … ±far and to the nearest whole number, each (plan, None, k after)
#                                (score(None, k) reads x = k). [] on any other line.
#   climb(offer, options, now, most)
#                                the step that raises your points here most (your rarity × the others' rarity, added
#                                up), from options [(plan, score it reaches), ...]; None when none does. It weighs the
#                                `most` options best for your rule (all when left out), a small read each; of those that
#                                do not raise your own rarity it prices only the best two, so an act with nothing to
#                                gain costs little. now is your score here; without the game's values it takes the step
#                                best for your rule instead.
#   saving(offer)                True while the agent holds less than 10 seconds of its income: it should skip the act
#                                (no reads: the game still tells you the line) and save up for a move. Free.
#   allowance(offer)             the most one move should cost now: the agent's energy plus 5 seconds of its income (a
#                                small debt), and at most 15 seconds of its income; without a known income, its energy.
#                                climb never takes a dearer move.
#   note(offer, text)            leave your owner a short note (they read it in the act log). At most 3 a turn.
#   contested(offer, times)      True when pushback(offer) has reached times; it then leaves your owner a note naming
#                                the tug-of-war and suggesting a deal with the other player.
#
# Two lines (an object of two lines, "pairs"):
#   pair_of(offer)               the two lines as [[a, b, c], [a, b, c]] (a*x + b*y + c = 0, whole numbers, in the
#                                game's order), from the eqs view (one full read).
#   solved(L)                    what the two lines give together, each part a number or None where it does not exist:
#                                D (the number you divide by), dot, x and y (the answer), X and Y (the whole numbers
#                                nearest it), ms, cs, rs (the steeper line's gradient, y-intercept and x-intercept),
#                                mg, cg (the gentler line's gradient and y-intercept),
#                                ratio (steeper gradient over the other), ygap, xgap (the gaps between the intercepts),
#                                off_right, off45 (how far from a right angle, from 45 degrees), origin (a line through
#                                (0, 0)).
#   pair_steps(L, far, kinds)    the steps of the given kinds ("shift", "tilt", "stretch", "turn", "slide", "combine",
#                                "reflect", "quarter") on either line, each (plan, lines after); steps the game would
#                                refuse are left out.
#   spf(n), omega(n), common(a, b)  a whole number's smallest prime factor (1 for 0 and +-1), its number of prime
#                                factors counting repeats (0 for 0 and +-1), and the biggest factor a and b share (0 if
#                                either is 0).
#   nearest_leaving(v, q, r, at_least)  the whole number nearest v that leaves r when divided by q (negatives too:
#                                -2 leaves 1 when divided by 3), the smaller on a tie; with at_least, only numbers at
#                                least that far from 0 (a pair rule's dealt remainder).
#   ladder(v, q, r, other, at_least)  a pair rule's residue ladder: (score, n). Level j is met when v is a whole number
#                                leaving r when divided by q, rr (in base q) when divided by q^2, rrr by q^3, ... and
#                                other is 0; score = q^L * (1 + 1/(1 + d)), L the highest level met, d how far from
#                                the next; n = nearest_leaving(v, q, r, at_least).
#   power_ladder(k, off)         the same over k, k^2, k^3, ...: off(t) is how far the state is from the level whose
#                                number is t; returns the score.
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


def _anchor(v, q, r, at_least):
    # The two numbers with the remainder either side of v (moved outwards past |n| < at_least); the lower wins a tie.
    lo = r + q * int((v - r) // q)
    hi = lo + q
    while abs(lo) < at_least:
        lo -= q
    while abs(hi) < at_least:
        hi += q
    return (lo, v - lo) if v - lo <= hi - v else (hi, hi - v)


def _climb(base, off):
    level, d = 0, off(1)
    while level < 4096 and d == 0:
        level += 1
        d = off(level + 1)
    return base ** level * (1 + Fraction(1) / (1 + d))


def nearest_leaving(x, q, r, at_least=0):
    return _anchor(Fraction(x), q, r, at_least)[0]


def ladder(x, q, r, other=0, at_least=0):
    v, o = Fraction(x), Fraction(other)

    def off(j):
        R = 0
        for _ in range(j):
            R = R * q + r
        return o + _anchor(v, q ** j, R, at_least)[1]
    return _climb(q, off), _anchor(v, q, r, at_least)[0]


def power_ladder(k, off):
    return _climb(k, lambda j: Fraction(off(k ** j)))


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


def vertical(offer, far):
    try:
        g = offer.view("gen")
    except HostError:
        return []
    a, b, c = g.a, g.b, g.c
    if not isinstance(a, Fraction) or not isinstance(c, Fraction) or b != 0 or a == 0:
        return []
    x = -c / a
    out = tips(offer) + [(call("cart.slide", u=k, v=0), None, x + k) for k in range(-far, far + 1) if k != 0]
    w = whole(x) - x
    if w != 0:
        out.append((call("cart.slide", u=w, v=0), None, x + w))
    return out


def spf(n):
    x = _whole(n)
    if x is None:
        return None
    x = abs(x)
    if x < 2:
        return 1
    d = 2
    while d * d <= x and d <= 100000:
        if x % d == 0:
            return d
        d += 1 if d == 2 else 2
    return x


def omega(n):
    x = _whole(n)
    if x is None:
        return None
    x = abs(x)
    if x < 2:
        return 0
    k, d = 0, 2
    while d * d <= x and d <= 100000:
        while x % d == 0:
            x //= d
            k += 1
        d += 1 if d == 2 else 2
    return k + 1 if x > 1 else k


def common(a, b):
    x, y = _whole(a), _whole(b)
    if x is None or y is None or x == 0 or y == 0:
        return 0
    return _gcd(x, y)


def _gcd(x, y):
    x, y = abs(x), abs(y)
    while y:
        x, y = y, x % y
    return x


def pair_of(offer):
    v = offer.view("eqs")
    n = lambda k: _whole(getattr(v, k))
    return [[Fraction(n("a1")), Fraction(n("b1")), Fraction(-n("e1"))], [Fraction(n("a2")), Fraction(n("b2")), Fraction(-n("e2"))]]


class _Solved:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def solved(L):
    (a1, b1, c1), (a2, b2, c2) = [[int(x) for x in l] for l in L]
    D, dot, nx, ny = a1 * b2 - a2 * b1, a1 * a2 + b1 * b2, b1 * c2 - b2 * c1, c1 * a2 - c2 * a1
    s = 1 if (b1 != 0 if b2 == 0 else b1 != 0 and abs(a2) * b1 > abs(a1) * b2) else 0
    ln = [(a1, b1, c1), (a2, b2, c2)]
    grad = lambda l: None if l[1] == 0 else Fraction(-l[0], l[1])
    yint = lambda l: None if l[1] == 0 else Fraction(-l[2], l[1])
    xint = lambda l: None if l[0] == 0 else Fraction(-l[2], l[0])
    gap = lambda p, r: None if p is None or r is None else abs(p - r)
    ms, mo = grad(ln[s]), grad(ln[1 - s])
    x = None if D == 0 else Fraction(nx, D)
    y = None if D == 0 else Fraction(ny, D)
    near = lambda v: None if v is None else Fraction((v + Fraction(1, 2)) // 1)
    ad, at = abs(D), abs(dot)
    return _Solved(
        D=Fraction(D), dot=Fraction(dot), x=x, y=y, X=near(x), Y=near(y), ms=ms, cs=yint(ln[s]), rs=xint(ln[s]), mg=mo, cg=yint(ln[1 - s]),
        ratio=None if ms is None or mo is None or mo == 0 else ms / mo,
        ygap=gap(yint(ln[0]), yint(ln[1])), xgap=gap(xint(ln[0]), xint(ln[1])),
        off_right=None if D == 0 else abs(Fraction(dot, D)), off45=Fraction(abs(ad - at), ad + at),
        origin=c1 == 0 or c2 == 0)


def pair_steps(L, far, kinds):
    ln = [[int(x) for x in l] for l in L]

    def norm(a, b, c):
        if a == 0 and b == 0:
            return None
        g = _gcd(_gcd(a, b), c)
        r = [a // g, b // g, c // g]
        if r[1] < 0 or (r[1] == 0 and r[0] < 0):
            r = [-t for t in r]
        return r

    def from_mc(m, k):   # y = m*x + k as a line: -m*x + y - k = 0, cleared of fractions
        m, k = Fraction(m), Fraction(k)
        d = m.denominator * k.denominator // _gcd(m.denominator, k.denominator)
        return norm(-m.numerator * (d // m.denominator), d, -k.numerator * (d // k.denominator))

    def pair(i, l):
        if l is None:
            return None
        two = [l, ln[1]] if i == 0 else [ln[0], l]
        if two[0] == two[1]:
            return None   # the two lines of a pair must be different
        r = sorted(two)
        if r == sorted(ln):
            return None   # no change: the game refuses it
        return [[Fraction(x) for x in t] for t in r]

    D = ln[0][0] * ln[1][1] - ln[1][0] * ln[0][1]
    nx, ny = ln[0][1] * ln[1][2] - ln[1][1] * ln[0][2], ln[0][2] * ln[1][0] - ln[1][2] * ln[0][0]
    out = []
    for i in (0, 1):
        (a, b, c), (ja, jb, jc), line = ln[i], ln[1 - i], str(i + 1)

        def add(plan, l):
            r = pair(i, l)
            if r:
                out.append((plan, r))
        m = None if b == 0 else Fraction(-a, b)
        k0 = None if b == 0 else Fraction(-c, b)
        if "reflect" in kinds:
            n2, d = ja * ja + jb * jb, a * ja + b * jb
            add(call("pair.reflect", line=line), norm(n2 * a - 2 * d * ja, n2 * b - 2 * d * jb, n2 * c - 2 * d * jc))
        if "quarter" in kinds and D != 0:
            add(call("pair.quarter", line=line), norm(-b * D, a * D, b * nx - a * ny))
        for k in range(-far, far + 1):
            if k == 0:
                continue
            if m is not None:
                if "shift" in kinds:
                    add(call("si.shift", line=line, k=k), from_mc(m, k0 + k))
                if "tilt" in kinds:
                    add(call("si.tilt", line=line, k=k), from_mc(m + k, k0))
                if "stretch" in kinds:
                    f = k + 1 if k > 0 else k - 1
                    add(call("mach.stretch", line=line, f=f), from_mc(m * f, k0 * f))
                if "turn" in kinds and D != 0:
                    m2 = m + k
                    add(call("pair.turn", line=line, k=k), from_mc(m2, Fraction(ny, D) - m2 * Fraction(nx, D)))
            if "slide" in kinds and D != 0:
                g = _gcd(ja, jb)
                add(call("pair.slide", line=line, k=k), norm(a, b, c - a * (k * jb // g) - b * (-k * ja // g)))
            if "combine" in kinds:
                A, B, C = a + k * ja, b + k * jb, c + k * jc
                if (A != 0 or B != 0) and _gcd(_gcd(A, B), C) == 1:
                    add(call("pair.combine", line=line, k=k), norm(A, B, C))
    return out


_ALLOWANCE_SECONDS = 15   # a move may cost at most this many seconds of the agent's income


_CREDIT_SECONDS = 5   # it may go this many seconds of income into debt for a move


_SAVE_SECONDS = 10   # below this many seconds of income in hand, an agent saves up rather than reads


def saving(offer):
    b = offer.budget()
    income = getattr(b, "income", None)
    return isinstance(income, (int, float)) and income > 0 and b.energy < _SAVE_SECONDS * income


def allowance(offer):
    b = offer.budget()
    income = getattr(b, "income", None)
    if not (isinstance(income, (int, float)) and income > 0):
        return max(0, b.energy)
    # Its energy plus a few seconds' credit (reads alone can keep a busy agent's balance near 0), at most 15 s of income.
    return min(max(0, b.energy) + _CREDIT_SECONDS * income, _ALLOWANCE_SECONDS * income)


def climb(offer, options, now, most=None):
    options = sorted(options, key=_functools.cmp_to_key(lambda a, b: -1 if better(a[1], b[1]) else 1 if better(b[1], a[1]) else 0))
    if most is not None:
        options = options[:most]
    w = worth(offer)
    if w is None:   # the best step for your rule that beats now and is allowed
        cap = allowance(offer)
        for plan, s in options:
            if not better(s, now):
                break
            p = price(offer, plan)
            if p is not None and p <= cap:
                return _as_plan(plan)
        return None
    value, spare, ranked = w.mine * w.others, 2, []
    for plan, s in options:
        r = rarity(offer, s)   # free
        if r <= 0:   # sorted best first: the rest score no points for you either
            break
        if r <= w.mine + 1e-9:   # your rule cannot rise: price only two such steps
            if spare == 0:
                break
            spare -= 1
        try:
            o = offer.others_after(_as_plan(plan))
        except HostError:
            continue
        if o.after is None:   # not allowed (e.g. another object is in that state)
            continue
        v = r * o.after
        if v > value + 1e-9:
            ranked.append((v, plan))
    # The best step it can pay for within its allowance (its energy, and a few seconds of its income).
    ranked.sort(key=lambda x: -x[0])
    cap = allowance(offer)
    quoted = []
    for _, plan in ranked[:4]:
        p = price(offer, plan)
        if p is not None and p <= cap:
            return _as_plan(plan)
        quoted.append((p, plan))
    # Nothing within it: a bigger step (the next rung of a ladder) paid from energy saved up in hand, no debt.
    saved = offer.budget().energy
    for p, plan in quoted:
        if p is not None and p <= saved:
            return _as_plan(plan)
    return None


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


def near(x, test, ends=None):
    v = Fraction(x)
    if ends is not None:
        # Only positive whole numbers whose last digit is `ends`; below the smallest such prime, that prime.
        first = {0: None, 1: 11, 2: 2, 3: 3, 4: None, 5: 5, 6: None, 7: 7, 8: None, 9: 19}
        if test is _PRIME and ends in first:
            if first[ends] is None:
                return None
            if v <= first[ends]:
                return first[ends]
        inner = test
        test = lambda n: n > 0 and n % 10 == ends and inner(n)
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
