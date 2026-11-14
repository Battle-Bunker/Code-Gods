"""Measurements behind docs/brainstorm/linear-equations-content.md (design only; no engine code).

python3 docs/brainstorm/linear-equations-measure.py      # about 10 s

1. The whole-number board (y = mx + c, m in -6..6, c in -12..12; pegs in [-6,6]^2): for each candidate rule,
   its top set, top bits under the uniform measure, the mean energy (W + 0.05 W^2 per call) of the cheapest
   path from a random line to the top with every whole-number mutator, and with the slope-intercept pair
   (shift, tilt) only; then pair and triple ceilings (max geometric mean of share of top bits).
2. The pegboard (every line through >= 2 pegs of [-W,W]^2): counts.
3. Turning about a peg: Farey-sequence steps against Farey-graph hops.
"""
import collections, heapq, itertools, math
from fractions import Fraction as F
from math import gcd

M, C, W = 6, 12, 6
LINES = [(m, c) for m in range(-M, M + 1) for c in range(-C, C + 1)]
IDX = set(LINES)
PRIMES = [p for p in range(2, 200) if all(p % d for d in range(2, int(p ** .5) + 1))]
dprime = lambda x: min(abs(x - p) for p in PRIMES)
pegs = lambda m, c: [x for x in range(-W, W + 1) if abs(m * x + c) <= W]

RULES = {
    "Prime Gradient": lambda m, c: -dprime(m),
    "Triangle Area 8": lambda m, c: -999 if m == 0 else -abs(F(c * c, 2 * abs(m)) - 8),
    "m Meets c": lambda m, c: -abs(m - c),
    "Sequence Contains 12": lambda m, c: -min(abs(m * n + c - 12) for n in range(1, 11)),
    "Peg Count 4": lambda m, c: -abs(len(pegs(m, c)) - 4),
    "Prime Run": lambda m, c: len({m * n + c for n in range(1, 7) if m * n + c in PRIMES}),
    "Feed Zero Square": lambda m, c: -min(abs(c - s) for s in (0, 1, 4, 9, 16)),
    "Taxi Meter (3 km, 11)": lambda m, c: -abs(3 * m + c - 11),
    "Crossing Check (k=1, q=4)": lambda m, c: -999 if m == 0 else -abs(m + c - F(4 - c, m)),
    "Ring 3": lambda m, c: -abs(abs(c) / math.sqrt(1 + m * m) - 3),
}
EIGHT = list(RULES)[:8]

L1, L2, LMAG = math.log2(3), 2.543, 2.185   # slider, Z^2 (L1 word metric), magnitude (x k)
FAMILIES = 7
LW = math.log2(FAMILIES)
energy = lambda w: w + 0.05 * w * w


def calls(m, c, allow):
    out = []
    if "shift" in allow: out += [((m, c + k), LW + L1 * abs(k)) for k in range(-24, 25) if k]
    if "tilt" in allow: out += [((m + k, c), LW + L1 * abs(k)) for k in range(-12, 13) if k]
    if "step" in allow: out += [((m + k, c - k), LW + L1 * abs(k)) for k in range(-12, 13) if k]
    if "pivot" in allow:
        pg = pegs(m, c)
        out += [((m + k, c - k * x0), LW + math.log2(len(pg)) + L1 * abs(k))
                for x0 in pg for k in range(-12, 13) if k]
    if "translate" in allow:
        out += [((m, c + v - m * u), LW + L2 * (abs(u) + abs(v)))
                for u in range(-6, 7) for v in range(-12, 13) if u or v]
    if "reflect" in allow: out += [(n, LW + math.log2(3)) for n in [(-m, -c), (-m, c), (m, -c)]]
    if "stretch" in allow: out += [((k * m, k * c), LW + LMAG * math.log2(abs(k))) for k in (-4, -3, -2, 2, 3, 4)]
    best = {}
    for n, w in out:
        if n in IDX and n != (m, c):
            best[n] = min(best.get(n, 1e9), energy(w))
    return best


ALL = {"shift", "tilt", "step", "pivot", "translate", "reflect", "stretch"}
SI = {"shift", "tilt"}


def cost_to(top, allow):
    rev = collections.defaultdict(dict)
    for a in LINES:
        for b, e in calls(*a, allow).items():
            rev[b][a] = e
    d = {l: 0.0 for l in top}
    pq = [(0.0, l) for l in top]
    while pq:
        e, l = heapq.heappop(pq)
        if e > d[l]: continue
        for a, w in rev[l].items():
            if e + w < d.get(a, 1e9):
                d[a] = e + w
                heapq.heappush(pq, (e + w, a))
    return sum(d.get(l, 1e9) for l in LINES) / len(LINES)


N = len(LINES)
share = {}
print(f"whole-number board: {N} lines; {FAMILIES} mutator families")
print(f"{'rule':28s} {'top':>7s} {'bits':>5s} {'E(all)':>7s} {'E(si)':>6s}")
for name, f in RULES.items():
    sc = {l: f(*l) for l in LINES}
    vals = list(sc.values())
    best = max(vals)
    top = {l for l in LINES if sc[l] == best}
    bits = {l: -math.log2(sum(v >= sc[l] for v in vals) / N) for l in LINES}
    tb = max(bits.values())
    share[name] = {l: bits[l] / tb for l in LINES}
    print(f"{name:28s} {len(top):3d}/{N} {tb:5.2f} {cost_to(top, ALL):7.1f} {cost_to(top, SI):6.1f}")

pairs = [(max(math.sqrt(share[a][l] * share[b][l]) for l in LINES), a, b) for a, b in itertools.combinations(EIGHT, 2)]
print(f"pairs of the eight: {sum(c > .999 for c, _, _ in pairs)}/{len(pairs)} have a line topping both; "
      f"lowest ceiling {min(pairs)[0]:.2f} ({min(pairs)[1]} x {min(pairs)[2]})")
tri = [max((share[a][l] * share[b][l] * share[c][l]) ** (1 / 3) for l in LINES)
       for a, b, c in itertools.combinations(EIGHT, 3)]
print(f"triples of the eight: {sum(t > .999 for t in tri)}/{len(tri)} topped by one line; "
      f"mean ceiling {sum(tri) / len(tri):.2f}; lowest {min(tri):.2f}")

for w in (5, 6, 10):
    P = [(x, y) for x in range(-w, w + 1) for y in range(-w, w + 1)]
    lines = collections.Counter()
    for (x1, y1), (x2, y2) in itertools.combinations(P, 2):
        a, b = y2 - y1, x1 - x2
        c = a * x1 + b * y1
        g = gcd(gcd(abs(a), abs(b)), abs(c)) or 1
        a, b, c = a // g, b // g, c // g
        if a < 0 or (a == 0 and b < 0): a, b, c = -a, -b, -c
        lines[(a, b, c)] += 1
    two = sum(1 for v in lines.values() if v == 1)
    print(f"pegboard [-{w},{w}]^2: {len(lines)} lines ({math.log2(len(lines)):.1f} bits), "
          f"{len({(a, b) for a, b, _ in lines})} directions, {two / len(lines):.0%} through exactly two pegs, "
          f"max |c| {max(abs(c) for _, _, c in lines)}")

D = sorted({(b, a) for a in range(-2 * W, 2 * W + 1) for b in range(0, 2 * W + 1)
            if (a, b) != (0, 0) and gcd(abs(a), b) == 1 and (b > 0 or a == 1)},
           key=lambda v: math.atan2(v[1], v[0]) if v[0] > 0 else math.pi / 2)
pos = {d: i for i, d in enumerate(D)}
nb = {d: [e for e in D if e != d and abs(d[0] * e[1] - d[1] * e[0]) == 1] for d in D}


def farey_code(s, t):
    dist, pq = {s: 0.0}, [(0.0, s)]
    while pq:
        e, u = heapq.heappop(pq)
        if u == t: return e
        if e > dist[u]: continue
        for v in nb[u]:
            w = e + math.log2(len(nb[u]) + 1)
            if w < dist.get(v, 1e9):
                dist[v] = w
                heapq.heappush(pq, (w, v))


print(f"directions on the [-{W},{W}]^2 pegboard: {len(D)}; mean Farey-graph degree "
      f"{sum(map(len, nb.values())) / len(D):.1f}")
for label, a, b in [("1 -> -1", (1, 1), (1, -1)), ("-2 -> -4/3", (1, -2), (3, -4)), ("0 -> vertical", (1, 0), (0, 1)),
                    ("2 -> 3", (1, 2), (1, 3)), ("2 -> -1/2", (1, 2), (2, -1))]:
    k = abs(pos[a] - pos[b])
    k = min(k, len(D) - k)
    print(f"  turn {label}: {k} sequence steps = {L1 * k:.1f} bits; Farey graph {farey_code(a, b):.1f} bits")
