#!/usr/bin/env python3
"""Numbers for docs/brainstorm/scoring-by-perturbation.md (design analysis; nothing here is engine code).

    python3 docs/brainstorm/scripts/scoring_by_perturbation.py            # everything (about 13 minutes; part 3 alone takes seconds)
    python3 docs/brainstorm/scripts/scoring_by_perturbation.py lines      # part 1 only
    python3 docs/brainstorm/scripts/scoring_by_perturbation.py grid       # part 2 only
    python3 docs/brainstorm/scripts/scoring_by_perturbation.py stationary # part 3 only (under a minute)

Needs numpy only. Deterministic: the dynamic programmes are exact up to float rounding and a stated truncation
bound; the one Monte Carlo table (grid, a budgeted walk from a state) uses a fixed seed.

Part 1, lines y = m x + c with integer m, c (an infinite state space).
  Mutators, each a family chosen with probability 1/F (log2 F bits). The main tables use the first three; stretch is
  studied apart, because its code is heavy-tailed and a box cannot hold it:
    lift k     c += k              k != 0, argument bits LAM*|k|, LAM = log2 3 (the slider code of energy-model.md 4.5)
    tilt k     m += k              the same code
    slide k    c -= m*k            shift the line k to the right; the same code
    stretch k  (m, c) *= k         |k| >= 2, argument bits LAMX*log2|k| (2*sum_{k>=2} k^-LAMX = 1, so LAMX = 2.185)
  A move's bits W are minus log2 of its probability under the random policy, so the code is Kraft-tight.
  The random walk has an exponentially distributed budget of mean B bits: a move is made if its W fits in what is
  left, otherwise the walk ends. That is the same as weighting a sequence by 2^-((1+s)*W), s = 1/(B ln 2).
Part 2, the beginner grid (4x4 digits, distance-v1): one number moved by k costs 4 + LAM*|k| bits.
"""
import math
import sys
import time

import numpy as np

LAM = math.log2(3)
BETA = 0.05


def zipf_rate():
    """LAMX with 2 * sum_{k>=2} k^-LAMX = 1."""
    def total(lam):
        n = 200000
        head = sum(k ** -lam for k in range(2, n))
        return 2 * (head + n ** (1 - lam) / (lam - 1) + 0.5 * n ** -lam)
    lo, hi = 1.5, 3.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if total(mid) > 1 else (lo, mid)
    return (lo + hi) / 2


LAMX = zipf_rate()


def energy(w):
    """The act price of energy-model.md 4.3."""
    return w + BETA * w * w


SLIDERS = ("lift", "tilt", "slide")
WITH_STRETCH = SLIDERS + ("stretch",)


# ------------------------------------------------------------------------------------------------
# Part 1: lines
# ------------------------------------------------------------------------------------------------

class LineWalk:
    """The sub-stochastic one-move kernel on the box |m|, |c| <= R. Array index [m + R, c + R]."""

    def __init__(self, R, families=SLIDERS, s=0.0, price="bits"):
        self.R, self.N, self.families = R, 2 * R + 1, families
        F = len(families)
        which = math.log2(F)
        kmax = 60

        def weight(w):
            # "bits": the random policy 2^-W tilted by the budget, 2^-((1+s)W). "energy": 2^-(W + BETA W^2), no budget.
            return 2.0 ** -((1 + s) * w) if price == "bits" else 2.0 ** -energy(w)

        self.slider = np.array([weight(which + LAM * k) for k in range(1, kmax + 1)])
        self.slider = self.slider[self.slider > 1e-300]
        ks = np.arange(2, 400001, dtype=float)
        self.zipf = np.array([weight(which + LAMX * math.log2(k)) for k in range(2, R + 1)])
        if price == "bits":
            lam = (1 + s) * LAMX
            self.zipf_total = 2 * (float(np.sum(ks ** -lam)) + 400001.0 ** (1 - lam) / (lam - 1)) * 2.0 ** -((1 + s) * which)
        else:
            self.zipf_total = 2 * float(np.sum(2.0 ** -(which + LAMX * np.log2(ks) + BETA * (which + LAMX * np.log2(ks)) ** 2)))
        sliders = sum(f != "stretch" for f in families)
        self.rho = sliders * 2 * float(self.slider.sum()) + ("stretch" in families) * self.zipf_total

    def _shift(self, v, axis):
        out = np.zeros_like(v)
        n = self.N
        for k, w in enumerate(self.slider, start=1):
            if k >= n:
                break
            if axis == 0:
                out[k:, :] += w * v[:-k, :]
                out[:-k, :] += w * v[k:, :]
            else:
                out[:, k:] += w * v[:, :-k]
                out[:, :-k] += w * v[:, k:]
        return out

    def step(self, v):
        R, n = self.R, self.N
        out = np.zeros_like(v)
        if "tilt" in self.families:
            out += self._shift(v, 0)
        if "lift" in self.families:
            out += self._shift(v, 1)
        if "slide" in self.families:
            out[R, :] += 2 * self.slider.sum() * v[R, :]          # a horizontal line does not move
            for t in range(1, R + 1):
                for row in (R + t, R - t):
                    x, o = v[row], out[row]
                    for k, w in enumerate(self.slider, start=1):
                        d = t * k
                        if d >= n:
                            break
                        o[d:] += w * x[:-d]
                        o[:-d] += w * x[d:]
        if "stretch" in self.families:
            out[R, R] += v[R, R] * (self.zipf_total - 2 * self.zipf.sum())   # y = 0 stays y = 0 for every k > R too
            for k, w in zip(range(2, R + 1), self.zipf):
                r = R // k
                src = v[R - r:R + r + 1, R - r:R + r + 1]
                out[R - k * r:R + k * r + 1:k, R - k * r:R + k * r + 1:k] += w * src            # times k
                out[R - k * r:R + k * r + 1:k, R - k * r:R + k * r + 1:k] += w * src[::-1, ::-1]  # times -k
        return out

    def start(self, origin):
        v = np.zeros((self.N, self.N))
        v[origin[0] + self.R, origin[1] + self.R] = 1.0
        return v

    def terminal(self, origin, tol=1e-10):
        """Where the walk is when its budget runs out: (law inside the box, mass that left the box)."""
        v, acc = self.start(origin), np.zeros((self.N, self.N))
        while v.sum() > tol:
            acc += v
            v = self.step(v)
        mu = (1 - self.rho) * acc
        return mu, max(0.0, 1 - mu.sum())

    def reach(self, origin, mask, tol=1e-10):
        """P(the walk is ever inside `mask` before its budget runs out): (inside the box, mass that left unabsorbed)."""
        v, hit = self.start(origin), 0.0
        lost = 0.0
        while v.sum() > tol:
            hit += float(v[mask].sum())
            v[mask] = 0.0
            before = v.sum()
            v = self.step(v)
            lost += max(0.0, self.rho * before - v.sum())
        return hit, lost


def grid_axes(R):
    m = np.arange(-R, R + 1)[:, None] * np.ones((1, 2 * R + 1), dtype=int)
    c = np.arange(-R, R + 1)[None, :] * np.ones((2 * R + 1, 1), dtype=int)
    return m, c


def prime_distance_table(limit):
    sieve = np.ones(limit + 1, dtype=bool)
    sieve[:2] = False
    for p in range(2, int(limit ** 0.5) + 1):
        if sieve[p]:
            sieve[p * p::p] = False
    primes = np.flatnonzero(sieve)
    return primes


def u_close(m, c):
    """Rule 1, "minimise the difference between m and c": score -|m - c|."""
    return -np.abs(m - c)


def make_u_prime(R):
    primes = prime_distance_table(max(2 * R + 100, 1000))

    def u_prime(m, c):
        """Rule 2, "minimise the distance of the gradient to the nearest prime": score -min_p |m - p|."""
        m = np.asarray(m)
        idx = np.clip(np.searchsorted(primes, m), 1, len(primes) - 1)
        d = np.minimum(np.abs(m - primes[idx - 1]), np.abs(primes[idx] - m))
        return -d
    return u_prime


def bits(p):
    return float("inf") if p <= 0 else 0.0 if p >= 1 else -math.log2(p)


def interval(lo_p, eps):
    """Bits for a probability known to lie in [lo_p, lo_p + eps]."""
    hi, lo = bits(lo_p), bits(min(1.0, lo_p + eps))
    return f"{abs(hi):5.2f}" if hi - lo < 0.005 else f"{lo:5.2f}..{hi:5.2f}"


def lattice_rarity(u, N, state):
    m, c = grid_axes(N)
    U = u(m, c)
    return abs(bits(float((U >= u(*state)).mean())))


def dijkstra_cost(R, origin, mask, families, price):
    """The cheapest route (sum of move prices) from `origin` into `mask`, inside the box."""
    import heapq
    which = math.log2(len(families))
    cost = (lambda w: w) if price == "bits" else energy
    dist = {origin: 0.0}
    heap = [(0.0, origin)]
    while heap:
        d, (m, c) = heapq.heappop(heap)
        if d > dist.get((m, c), 1e18):
            continue
        if mask[m + R, c + R]:
            return d
        nxt = []
        for k in range(1, 25):
            w = cost(which + LAM * k)
            for sgn in (1, -1):
                if "lift" in families:
                    nxt.append((m, c + sgn * k, w))
                if "tilt" in families:
                    nxt.append((m + sgn * k, c, w))
                if "slide" in families and m != 0:
                    nxt.append((m, c - m * sgn * k, w))
        if "stretch" in families:
            for k in range(2, 40):
                w = cost(which + LAMX * math.log2(k))
                nxt += [(m * k, c * k, w), (-m * k, -c * k, w)]
        for mm, cc, w in nxt:
            if abs(mm) <= R and abs(cc) <= R and d + w < dist.get((mm, cc), 1e18):
                dist[(mm, cc)] = d + w
                heapq.heappush(heap, (d + w, (mm, cc)))
    return float("inf")


def one_move(state, u, families=SLIDERS):
    """Exact probabilities that one random move raises / lowers / keeps the rule score (no budget)."""
    m, c = state
    F = len(families)
    u0 = int(u(np.array(m), np.array(c)))
    up = down = 0.0
    for k in range(1, 40):
        p = 3.0 ** -k / F
        for sgn in (1, -1):
            for fam, (mm, cc) in (("lift", (m, c + sgn * k)), ("tilt", (m + sgn * k, c)), ("slide", (m, c - m * sgn * k))):
                if fam in families:
                    u1 = int(u(np.array(mm), np.array(cc)))
                    up, down = up + p * (u1 > u0), down + p * (u1 < u0)
    if "stretch" in families:
        for k in range(2, 20000):
            p = k ** -LAMX / F
            for sgn in (1, -1):
                u1 = int(u(np.array(sgn * k * m), np.array(sgn * k * c)))
                up, down = up + p * (u1 > u0), down + p * (u1 < u0)
    return up, down


def part_lines():
    t0 = time.time()
    R = 256
    origin = (1, 0)                                  # y = x, the identity function
    m, c = grid_axes(R)
    u_prime = make_u_prime(R)
    rules = [("m close to c", u_close), ("gradient near a prime", u_prime)]
    U = {name: u(m, c) for name, u in rules}
    states = [(1, 0), (1, 1), (2, 5), (5, 5), (7, -21), (9, 4), (23, 23), (24, 30), (-6, 10), (0, 0)]
    budgets = [8, 32, 128]

    print("=" * 100)
    print("PART 1. Lines y = m x + c, integer m and c. Origin y = x. Box |m|, |c| <=", R)
    print(f"LAM = {LAM:.5f} bits per slider step; LAMX = {LAMX:.5f} bits per doubling of a stretch")
    print("=" * 100)

    # ---- 1.0 the one-dimensional closed form (tilt only) -----------------------------------------
    print("\n1.0  One mutator (tilt) on the integers: the terminal law is geometric, mu(x) = b * r^-|x| for x != 0.")
    print("     B (mean budget, bits) | rho | rate log2 r from the closed form | rate measured | bits of x = 10, 20")
    for B in budgets:
        s = 1 / (B * math.log(2))
        a = 2.0 ** -((1 + s) * LAM)
        r = ((1 + 3 * a * a) + math.sqrt((1 + 3 * a * a) ** 2 - 16 * a * a)) / (4 * a)
        n = 2001
        v = np.zeros(n)
        v[n // 2] = 1.0
        acc = np.zeros(n)
        rho = 2 * a / (1 - a)
        ker = np.array([a ** k for k in range(1, 60)])
        while v.sum() > 1e-13:
            acc += v
            nv = np.zeros(n)
            for k, w in enumerate(ker, start=1):
                nv[k:] += w * v[:-k]
                nv[:-k] += w * v[k:]
            v = nv
        mu = (1 - rho) * acc
        x0 = n // 2
        measured = math.log2(mu[x0 + 10] / mu[x0 + 11])
        print(f"     {B:4d} | {rho:.4f} | {math.log2(r):.4f} | {measured:.4f} | {bits(mu[x0 + 10]):.2f}, {bits(mu[x0 + 20]):.2f}")

    # ---- 1.1 the measure and the value (a) ---------------------------------------------------------
    mus = {}
    for B in budgets:
        s = 1 / (B * math.log(2))
        walk = LineWalk(R, s=s)
        mus[B] = walk.terminal(origin)
        mu, eps = mus[B]
        ent = -float(np.sum(mu[mu > 0] * np.log2(mu[mu > 0])))
        print(f"\n1.1  B = {B} bits: rho = {walk.rho:.4f} (mean {walk.rho / (1 - walk.rho):.1f} moves); mass outside the box"
              f" eps = {eps:.2e} ({bits(eps) if eps > 0 else float('inf'):.1f} bits); entropy inside {ent:.2f} bits   [{time.time() - t0:.0f}s]")

    print("\n1.2  Candidate (a): bits = -log2 mu_B(score at least as good). 'lo..hi' is the truncation interval.")
    print("     Lattice columns: plain rarity, uniform on |m|, |c| <= N.")
    for name, u in rules:
        print(f"\n     Rule: {name}")
        print("     state (m, c) | score | " + " | ".join(f"(a) B={B:3d}" for B in budgets) + " | N=5  | N=10 | N=20 | N=100")
        for st in states:
            u0 = int(u(np.array(st[0]), np.array(st[1])))
            cells = []
            for B in budgets:
                mu, eps = mus[B]
                cells.append(f"{interval(float(mu[U[name] >= u0].sum()), eps):>11}")
            lat = " | ".join(f"{lattice_rarity(u, N, st):4.2f}" for N in (5, 10, 20, 100))
            print(f"     {str(st):>12} | {u0:5d} | " + " | ".join(cells) + " | " + lat)
        tops = [bits(float(mus[B][0][U[name] >= 0].sum())) for B in budgets]
        print("     top bits by budget: " + ", ".join(f"B={B}: {t:.2f}" for B, t in zip(budgets, tops)))

    print("\n1.3  Single states, B = 32: -log2 mu_B(state); the cheapest route from y = x in bits W and in energy")
    print("     (W + 0.05 W^2 per move); K_E = -log2 of the sum over every route of 2^-energy (no budget).")
    print("     Then the same without the slide mutator (two mutators, 1 bit to say which instead of 1.58).")
    s32 = 1 / (32 * math.log(2))
    fam2 = ("lift", "tilt")
    mu2, eps2 = LineWalk(R, families=fam2, s=s32).terminal(origin)
    mu3, eps3 = mus[32]
    walk_e3, walk_e2 = LineWalk(R, price="energy"), LineWalk(R, families=fam2, price="energy")
    print("     state (m, c) | -log2 mu | cheapest W | cheapest energy | K_E || no slide: -log2 mu | cheapest W | K_E")
    for st in [(1, 0), (1, 1), (5, 5), (7, 0), (7, -21), (7, 21), (3, -30), (23, 23), (12, 36), (-6, 10)]:
        one = np.zeros((2 * R + 1, 2 * R + 1), dtype=bool)
        one[st[0] + R, st[1] + R] = True
        print(f"     {str(st):>12} | {bits(mu3[one][0]):6.2f} | {dijkstra_cost(R, origin, one, SLIDERS, 'bits'):6.2f} |"
              f" {dijkstra_cost(R, origin, one, SLIDERS, 'energy'):6.2f} | {bits(walk_e3.reach(origin, one)[0]):6.2f} ||"
              f" {bits(mu2[one][0]):6.2f} | {dijkstra_cost(R, origin, one, fam2, 'bits'):6.2f} | {bits(walk_e2.reach(origin, one)[0]):6.2f}")
    print("     Rule tops, B = 32:  three mutators / no slide / origin y = 0 instead of y = x")
    mu0, eps0 = LineWalk(R, s=s32).terminal((0, 0))
    for name, _ in rules:
        top = U[name] >= 0
        print(f"       {name}: {interval(float(mu3[top].sum()), eps3)} / {interval(float(mu2[top].sum()), eps2)} / {interval(float(mu0[top].sum()), eps0)}")
    print("     With the stretch mutator added (four mutators), the same box:")
    for B in budgets:
        ws = LineWalk(R, families=WITH_STRETCH, s=1 / (B * math.log(2)))
        mus_, epss = ws.terminal(origin)
        print(f"       B = {B:3d}: mass outside the box = {epss:.3f}; tops: " +
              "; ".join(f"{name} {interval(float(mus_[U[name] >= 0].sum()), epss)}" for name, _ in rules))
    print(f"     [{time.time() - t0:.0f}s]")

    # ---- 1.4 reach (c1) and the budget-free energy reach (c2) ---------------------------------------
    print("\n1.4  Candidates (c): reaching the level at some time, from y = x.")
    print("     reach_B = -log2 P(a budget-B walk is ever at least this good);  hold = (a) - reach;")
    print("     K_E = -log2 sum over first-arrival routes of 2^-energy (no budget);  E_min = the cheapest route's energy.")
    walk_e = LineWalk(R, price="energy")
    print(f"     (energy-priced walk: sum over moves of 2^-energy = {walk_e.rho:.4f})")
    print("     rule (top level) | (a) B=32 | reach B=32 | hold = (a) - reach | reach B=8 | reach B=128 | K_E | E_min")
    for name, u in rules:
        mask = U[name] >= 0
        a32 = float(mus[32][0][mask].sum())
        row = [f"{interval(a32, mus[32][1]):>6}"]
        for B in (32, 8, 128):
            h, lost = LineWalk(R, s=1 / (B * math.log(2))).reach(origin, mask)
            row.append(f"{interval(h, lost):>6}")
            if B == 32:
                row.append(f"{bits(a32) - bits(h):5.2f}")
        he, loste = walk_e.reach(origin, mask)
        row.append(f"{interval(he, loste):>6}")
        row.append(f"{dijkstra_cost(R, origin, mask, SLIDERS, 'energy'):5.2f}")
        print(f"     {name:>22} | " + " | ".join(row))
    print(f"     [{time.time() - t0:.0f}s]")

    # ---- 1.5 local improvability (b) ---------------------------------------------------------------
    print("\n1.5  Candidate (b): from the state itself. One random move: P(up), P(down), log2(P(down)/P(up)).")
    print("     Budgeted from the state (B = 8, 32): P(ends better), P(ends worse), log2 odds, and -log2 P(ends at least as good).")
    far = lambda mm, cc: -u_prime(np.abs(mm), cc)                     # rule 2 with the sign flipped, on |m|: far from every prime
    local_rules = rules + [("|gradient| far from primes (rule 2 flipped)", far)]
    local_states = {"m close to c": [(1, 0), (2, 5), (5, 5), (23, 23), (9, 4)],
                    "gradient near a prime": [(1, 0), (9, 4), (24, 30), (23, 23), (0, 0)],
                    "|gradient| far from primes (rule 2 flipped)": [(12, 0), (9, 4), (26, 0), (93, 0), (120, 0)]}
    Rl = 256
    ml, cl = grid_axes(Rl)
    for name, u in local_rules:
        Ul = u(ml, cl)
        print(f"\n     Rule: {name}")
        print("     state | score | 1 move: up, down, log2 odds | B=8: better, worse, log2 odds, hold bits | B=32: the same | value (a), B=32, from y = x")
        for st in local_states[name]:
            u0 = int(u(np.array(st[0]), np.array(st[1])))
            up, down = one_move(st, u)
            odds = lambda dn, upp: "  inf" if upp <= 1e-9 else f"{math.log2(dn / upp):5.2f}"
            cells = [f"{up:.3g}, {down:.3f}, " + ("  inf" if up <= 0 else f"{math.log2(down / up):5.2f}")]
            for B in (8, 32):
                mu, eps = LineWalk(Rl, s=1 / (B * math.log(2))).terminal(st, tol=1e-7)
                better, worse, same = float(mu[Ul > u0].sum()), float(mu[Ul < u0].sum()), float(mu[Ul == u0].sum())
                cells.append(f"{better:.3f}, {worse:.3f}, {odds(worse, better)}, {bits(better + same):4.2f}")
            Ubig = U[name] if name in U else far(m, c)
            cells.append(f"{interval(float(mus[32][0][Ubig >= u0].sum()), mus[32][1])}")
            print(f"     {str(st):>9} | {u0:4d} | " + " | ".join(cells))
    print(f"     [{time.time() - t0:.0f}s]")


# ------------------------------------------------------------------------------------------------
# Part 2: the beginner grid
# ------------------------------------------------------------------------------------------------

def pair_levels(units, dev_dist):
    """Exact law of (number of units with deviation 0, total deviation) for `units` independent units."""
    law = {(0, 0): 1.0}
    for _ in range(units):
        nxt = {}
        for (n, d), p in law.items():
            for dev, q in dev_dist.items():
                key = (n + (dev == 0), d + dev)
                nxt[key] = nxt.get(key, 0.0) + p * q
        law = nxt
    return law


def survival_bits(law):
    """Today's static bits of a score (n, -D): -log2 P(a uniform board scores at least as well)."""
    keys = sorted(law, key=lambda k: (k[0], -k[1]))
    out, tail = {}, 0.0
    for k in reversed(keys):
        tail += law[k]
        out[k] = bits(tail)
    return out


NINES_DEV = {0: 0.10, **{j: 2 * (10 - j) / 100 for j in range(1, 10)}}


def row_dev():
    counts = {}
    for a in range(10):
        for b in range(10):
            for cc in range(10):
                for d in range(10):
                    dev = abs(a + b + cc + d - 18)
                    counts[dev] = counts.get(dev, 0) + 1e-4
    return counts


def score_nines(boards):
    b = np.asarray(boards)
    dev = np.abs(b[..., :8] + b[..., :7:-1] - 9)
    return (dev == 0).sum(-1), -dev.sum(-1)


def score_eighteen(boards):
    b = np.asarray(boards)
    dev = np.abs(b.reshape(b.shape[:-1] + (4, 4)).sum(-1) - 18)
    return (dev == 0).sum(-1), -dev.sum(-1)


def cmp_scores(n, d, n0, d0):
    return np.sign((n - n0) * 1000 + (d - d0))


def grid_one_move(board, score):
    n0, d0 = score(board)
    up = down = 0.0
    for cell in range(16):
        for k in range(1, 10):
            for sgn in (1, -1):
                v = board[cell] + sgn * k
                if 0 <= v <= 9:
                    b = board.copy()
                    b[cell] = v
                    n, d = score(b)
                    sg = cmp_scores(n, d, n0, d0)
                    p = 3.0 ** -k / 16
                    up, down = up + p * (sg > 0), down + p * (sg < 0)
    return up, down


def grid_budget_walk(board, score, B, rng, walkers=200000):
    """A budget-B walk (exponential, mean B bits; a move costs 4 + LAM |k|) from `board`: P(better), P(worse)."""
    b = np.tile(board, (walkers, 1))
    left = rng.exponential(B, walkers)
    alive = np.ones(walkers, dtype=bool)
    idx = np.arange(walkers)
    while alive.any():
        cell = rng.integers(0, 16, walkers)
        k = rng.geometric(2 / 3, walkers)
        sgn = rng.integers(0, 2, walkers) * 2 - 1
        cost = 4 + LAM * k
        alive &= cost <= left
        left -= cost
        v = b[idx, cell] + sgn * k
        ok = alive & (v >= 0) & (v <= 9)
        b[idx[ok], cell[ok]] = v[ok]
    n0, d0 = score(board)
    n, d = score(b)
    sg = cmp_scores(n, d, n0, d0)
    return float((sg > 0).mean()), float((sg < 0).mean())


def part_grid():
    print("\n" + "=" * 100)
    print("PART 2. The beginner grid: 4x4 digits, one number moved by k costs 4 + 1.585 |k| bits (distance-v1).")
    print("=" * 100)

    # ---- 2.1 the kernel is symmetric, so the uniform law is stationary -----------------------------
    # Kraft-tight: sum over k != 0 of 3^-|k| = 1, so +k and -k each have probability 3^-k; out of range stays.
    P = np.zeros((10, 10))
    for a in range(10):
        for k in range(1, 40):
            for sgn in (1, -1):
                b = a + sgn * k
                P[a, b if 0 <= b <= 9 else a] += 3.0 ** -k
    print("\n2.1  One digit's kernel under distance-v1 noise: rows sum to", np.round(P.sum(1), 12)[0],
          "; symmetric:", bool(np.allclose(P, P.T)), "; uniform stays uniform:", bool(np.allclose(np.full(10, .1) @ P, .1)))
    Pm = np.zeros((10, 10))                                   # multiply-v1's multiply mod 10 (uniform over m in 0, 2..9)
    for a in range(10):
        for mult in (0, 2, 3, 4, 5, 6, 7, 8, 9):
            Pm[a, (a * mult) % 10] += 1 / 9
    st = np.full(10, .1)
    for _ in range(200):
        st = st @ (0.5 * P + 0.5 * Pm)
    print("     With multiply mod 10 mixed in (half the moves) the stationary law of a digit is",
          np.round(st, 3), ": not uniform (multiplying erases).")

    # ---- 2.2 a mini board (two half-turn pairs, 10^4 states), everything exact ---------------------
    which = math.log2(4)
    shape = (10, 10, 10, 10)
    a0, a1, a2, a3 = np.indices(shape)
    dev = np.abs(a0 + a3 - 9) + 0 * a1, np.abs(a1 + a2 - 9)
    n_s, d_s = (dev[0] == 0).astype(int) + (dev[1] == 0), -(dev[0] + dev[1])
    key = n_s * 1000 + d_s

    def kernel(weight):
        K = np.zeros((10, 10))
        for a in range(10):
            for k in range(1, 40):
                for sgn in (1, -1):
                    b = a + sgn * k
                    K[a, b if 0 <= b <= 9 else a] += weight(which + LAM * k)
        return K

    def apply(v, K):
        return sum(np.moveaxis(np.tensordot(v, K, axes=([ax], [0])), -1, ax) for ax in range(4))

    uniform = np.full(shape, 1e-4)
    print("\n2.2  Mini board, two half-turn pairs of digits (10^4 states), Opposite Nines' score, exact.")
    for B in (8, 32, 128):
        s = 1 / (B * math.log(2))
        K = kernel(lambda w: 2.0 ** -((1 + s) * w))
        rho = 4 * K.sum(1)[0]                                # four cells, each chosen with probability 1/4 (inside K)
        v, acc = uniform.copy(), np.zeros(shape)
        while v.sum() > 1e-14:
            acc += v
            v = apply(v, K)
        mu = (1 - rho) * acc
        print(f"     (a) from a uniform birth, B = {B:3d}: largest |mu - uniform| / uniform = {np.abs(mu - 1e-4).max() / 1e-4:.1e}"
              "  -> (a) is today's bits at every level")
    K0 = kernel(lambda w: 2.0 ** -w)                          # the random policy itself, no budget
    print("     The flux identity: today's bits = log2(1 + out / in), out = P(a random move leaves the set | inside),")
    print("     in = P(a random move enters it | outside), both averaged over uniform boards:")
    for level in [(1, -4), (2, 0)]:
        mask = key >= level[0] * 1000 + level[1]
        pa = float(uniform[mask].sum())
        out = float(apply(np.where(mask, uniform, 0.0), K0)[~mask].sum()) / pa
        inn = float(apply(np.where(mask, 0.0, uniform), K0)[mask].sum()) / (1 - pa)
        print(f"       level {level}: out = {out:.4f}, in = {inn:.6f}, log2(1 + out/in) = {math.log2(1 + out / inn):.4f}, today's bits = {bits(pa):.4f}")
    KE = kernel(lambda w: 2.0 ** -energy(w))
    full = sum(2 * 16 * 2.0 ** -energy(4 + LAM * k) for k in range(1, 10))
    print(f"     (full 4x4 board: the sum over one-number moves of 2^-energy is {full:.4f}, so K_E from a uniform birth is"
          f" within {-math.log2(1 - full):.2f} bits below today's bits)")
    rhoE = 4 * KE.sum(1)[0]
    print(f"     energy-priced walk: sum of 2^-energy over one move = {rhoE:.4f}; bound on the gap to today's bits ="
          f" log2 1/(1-rho) = {-math.log2(1 - rhoE):.3f}")
    print("     level (pairs at 9, -deviation) | today's bits | reach B=32 | today - reach (hold) | reach B=128 | K_E (energy, no budget)")
    for level in [(0, -6), (1, -4), (1, -1), (2, 0)]:
        mask = key >= level[0] * 1000 + level[1]
        today = bits(float(uniform[mask].sum()))
        cells = []
        for K_, label in ((kernel(lambda w: 2.0 ** -((1 + 1 / (32 * math.log(2))) * w)), "r32"),
                          (kernel(lambda w: 2.0 ** -((1 + 1 / (128 * math.log(2))) * w)), "r128"), (KE, "ke")):
            v, hit = uniform.copy(), 0.0
            while v.sum() > 1e-14:
                hit += float(v[mask].sum())
                v[mask] = 0.0
                v = apply(v, K_)
            cells.append(bits(hit))
        print(f"     {str(level):>8} | {today:5.2f} | {cells[0]:5.2f} | {today - cells[0]:4.2f} | {cells[1]:5.2f} | {cells[2]:5.2f}")

    # ---- 2.3 the full board: today's bits against the local quantities ------------------------------
    nines = survival_bits(pair_levels(8, NINES_DEV))
    eighteen = survival_bits(pair_levels(4, row_dev()))
    print(f"\n2.3  Full 4x4 board. Today's exact static bits at the top: Opposite Nines {nines[(8, 0)]:.2f},"
          f" Magic Eighteen (rows) {eighteen[(4, 0)]:.2f}")
    rng = np.random.default_rng(20261114)
    rand = np.random.default_rng(3).integers(0, 10, 16)

    def nines_board(done, off):
        """`done` pairs add up to 9; the other pairs are `off` away."""
        b = np.zeros(16, dtype=int)
        for i in range(8):
            b[i] = [3, 7, 1, 4, 6, 2, 5, 8][i]
            b[15 - i] = 9 - b[i] - (0 if i < done else (off if 9 - b[i] - off >= 0 else -off))
        return b

    def eighteen_board(done, off):
        rows = [[9, 2, 3, 4], [5, 5, 1, 7], [6, 6, 6, 0], [8, 1, 4, 5]]
        b = np.array(rows).reshape(16)
        for r in range(done, 4):
            b[4 * r + 2] -= off if b[4 * r + 2] >= off else -off
        return b

    cases = [("Opposite Nines", score_nines, nines, [("a random board", rand), ("no pair, each 1 away", nines_board(0, 1)),
                                                     ("4 pairs, the rest 1 away", nines_board(4, 1)), ("4 pairs, the rest 3 away", nines_board(4, 3)),
                                                     ("7 pairs, the last 1 away", nines_board(7, 1)), ("all 8 pairs (top)", nines_board(8, 0))]),
             ("Magic Eighteen (rows)", score_eighteen, eighteen, [("a random board", rand), ("no row, each 1 away", eighteen_board(0, 1)),
                                                                  ("2 rows, the rest 1 away", eighteen_board(2, 1)), ("3 rows, the last 1 away", eighteen_board(3, 1)),
                                                                  ("all 4 rows (top)", eighteen_board(4, 0))])]
    for name, score, table, boards in cases:
        print(f"\n     {name}")
        print("     board | score | today's bits | 1 move: up, down, log2(down/up) | B=32: better, worse, log2 odds, -log2 P(at least as good) | B=256: the same")
        for label, board in boards:
            n0, d0 = (int(x) for x in score(board))
            up, down = grid_one_move(board, score)
            odds = lambda dn, upp: "  inf" if upp <= 0 else f"{math.log2(max(dn, 1e-12) / upp):5.2f}"
            cells = [f"{up:.4f}, {down:.4f}, {odds(down, up)}"]
            for B in (32, 256):
                better, worse = grid_budget_walk(board, score, B, rng)
                cells.append(f"{better:.4f}, {worse:.4f}, {odds(worse, better)}, {bits(1 - worse):4.2f}")
            print(f"     {label:>26} | ({n0}, {d0:3d}) | {table[(n0, -d0)]:5.2f} | " + " | ".join(cells))


# ------------------------------------------------------------------------------------------------
# Part 3: the stationary law (the owner's direction of 14 Nov: energy = -log2 pi, "inverse PageRank")
# ------------------------------------------------------------------------------------------------

def stationary(P):
    """The stationary law of a row-stochastic matrix (left Perron vector), by a linear solve."""
    n = P.shape[0]
    A = np.vstack([P.T - np.eye(n), np.ones((1, n))])
    b = np.zeros(n + 1)
    b[-1] = 1.0
    return np.linalg.lstsq(A, b, rcond=None)[0]


W_BOARD = [(m, c) for m in range(-6, 7) for c in range(-12, 13)]        # the whole-number board of PR #346: 325 lines
W_INDEX = {s: i for i, s in enumerate(W_BOARD)}
SLIDE2 = 2.543                                                           # Kraft root of the two-dimensional slide code


def w_board_kernel(families, which_bits=math.log2(7)):
    """One priced random move on the 325-line board; a move is made with probability 2^-W, otherwise the line stays.

    The seven families and their prices are those of docs/brainstorm/linear-equations-content.md (PR #346) 4.2.
    A move that would leave the board fails. `pivot` turns the line about one of its n pegs with whole x in -6..6
    and |y| <= 6, and pays log2 n to say which.
    """
    n = len(W_BOARD)
    P = np.zeros((n, n))

    def add(i, target, w):
        j = W_INDEX.get(target)
        if j is not None and j != i:
            P[i, j] += 2.0 ** -w

    for i, (m, c) in enumerate(W_BOARD):
        pegs = [x for x in range(-6, 7) if abs(m * x + c) <= 6]
        for k in range(1, 40):
            for sg in (1, -1):
                kk = sg * k
                w = which_bits + LAM * k
                if "shift" in families:
                    add(i, (m, c + kk), w)
                if "tilt" in families:
                    add(i, (m + kk, c), w)
                if "step" in families:
                    add(i, (m + kk, c - kk), w)
                if "pivot" in families:
                    for x0 in pegs:
                        add(i, (m + kk, c - kk * x0), w + math.log2(len(pegs)))
        if "slide" in families:
            for u in range(-14, 15):
                for v in range(-30, 31):
                    if (u, v) != (0, 0):
                        add(i, (m, c + v - m * u), which_bits + SLIDE2 * (abs(u) + abs(v)))
        if "mirror" in families:
            for target in ((-m, -c), (-m, c), (m, -c)):
                add(i, target, which_bits + LAM)
        if "stretch" in families:
            for k in (2, 3, 4):
                for sg in (1, -1):
                    add(i, (sg * k * m, sg * k * c), which_bits + LAMX * math.log2(k))
    assert P.sum(1).max() <= 1 + 1e-9
    P[np.arange(n), np.arange(n)] += 1 - P.sum(1)
    return P


def part_stationary():
    print("\n" + "=" * 100)
    print("PART 3. The stationary law pi of priced random play: energy E = -log2 pi, value = -log2 pi{score >= level}.")
    print("=" * 100)
    m_arr = np.array([s[0] for s in W_BOARD])
    c_arr = np.array([s[1] for s in W_BOARD])
    u_prime = make_u_prime(64)
    scores = {"Prime Gradient": u_prime(m_arr, c_arr), "m Meets c": -np.abs(m_arr - c_arr)}
    uniform_bits = math.log2(len(W_BOARD))

    # ---- 3.1 the 325-line board, exact ---------------------------------------------------------------
    print(f"\n3.1  The whole-number board (m in -6..6, c in -12..12; 325 lines; uniform energy {uniform_bits:.2f} bits), exact.")
    sets = [("shift, tilt, step, slide, mirror (every move's undo costs the same)", ("shift", "tilt", "step", "slide", "mirror")),
            ("... plus pivot (pays log2 of the line's peg count)", ("shift", "tilt", "step", "slide", "mirror", "pivot")),
            ("... plus stretch: all seven families of PR #346", ("shift", "tilt", "step", "slide", "mirror", "pivot", "stretch"))]
    kept = {}
    for label, fams in sets:
        P = w_board_kernel(fams)
        pi = stationary(P)
        kept[fams] = (P, pi)
        E = -np.log2(pi)
        flux = pi[:, None] * P
        current = np.abs(flux - flux.T).sum() / 2 / (flux.sum() - np.trace(flux))
        tops = ", ".join(f"{name} {bits(float(pi[sc >= 0].sum())):.2f} (uniform {bits(float((sc >= 0).mean())):.2f})" for name, sc in scores.items())
        print(f"\n     {label}")
        print(f"       energy E: min {E.min():.2f}, max {E.max():.2f} bits; share of the probability flow that is a net current: {current:.4f}")
        print(f"       lowest energy: " + ", ".join(f"y = {W_BOARD[i][0]}x + {W_BOARD[i][1]} ({E[i]:.2f})" for i in np.argsort(E)[:4])
              + "; highest: " + ", ".join(f"y = {W_BOARD[i][0]}x + {W_BOARD[i][1]} ({E[i]:.2f})" for i in np.argsort(E)[-3:]))
        print(f"       rule tops, bits under pi: {tops}")
    print("\n     Every level of the two rules, all seven families: score | lines | bits under pi | bits under the uniform law")
    P7, pi7 = kept[sets[2][1]]
    for name, sc in scores.items():
        row = []
        for level in sorted(set(sc.tolist()), reverse=True)[:8]:
            row.append(f"{level}: {int((sc == level).sum())} lines, {bits(float(pi7[sc >= level].sum())):.2f} | {bits(float((sc >= level).mean())):.2f}")
        print(f"       {name}: " + "; ".join(row))

    # ---- 3.2 Kac's lemma -----------------------------------------------------------------------------
    print("\n3.2  Kac's lemma on that board (all seven families): mean number of random moves between visits = 1 / pi(set).")
    for name, sc in scores.items():
        A = sc >= 0
        Q = P7[np.ix_(~A, ~A)]
        h = np.linalg.solve(np.eye(Q.shape[0]) - Q, np.ones(Q.shape[0]))       # mean moves to reach A from outside
        back = 1 + (pi7[A] / pi7[A].sum()) @ (P7[np.ix_(A, ~A)] @ h)
        typical = float((pi7[~A] / pi7[~A].sum()) @ h)
        print(f"       {name}: mean return {back:.3f} moves, 1/pi = {1 / pi7[A].sum():.3f}, log2 = {math.log2(back):.3f} bits;"
              f" mean moves to first reach it from a stationary line outside: {typical:.1f}")
    print("       (a move is attempted at each step; a step that fails or is not drawn leaves the line where it is)")

    # ---- 3.3 stitching levels ------------------------------------------------------------------------
    print("\n3.3  Stitching levels (the owner's procedure), exact on the board. T[i, j] = P(a move from level i lands in level j),")
    print("     the start drawn from pi restricted to level i. The level masses are the stationary law of T.")
    sc = scores["m Meets c"]
    levels = sorted(set(sc.tolist()), reverse=True)
    for label, fams in (sets[0], sets[2]):
        P, pi = kept[fams]
        mass = np.array([pi[sc == l].sum() for l in levels])
        T = np.array([[(pi[sc == a] / pi[sc == a].sum()) @ P[np.ix_(sc == a, sc == b)].sum(1) for b in levels] for a in levels])
        Tu = np.array([[P[np.ix_(sc == a, sc == b)].sum(1).mean() for b in levels] for a in levels])   # samples uniform within a level
        piT, piTu = stationary(T), stationary(Tu)
        ladder = [1.0]
        for i in range(len(levels) - 1):                       # adjacent ratios only: mass[i+1] / mass[i] = T[i, i+1] / T[i+1, i]
            ladder.append(ladder[-1] * T[i, i + 1] / T[i + 1, i])
        ladder = np.array(ladder) / sum(ladder)
        print(f"\n     {label}")
        print(f"       top level: exact {bits(mass[0]):.4f} bits | eigenvector of T {bits(piT[0]):.4f} | adjacent flux ratios only {bits(ladder[0]):.4f}"
              f" | eigenvector of T built from samples uniform within each level {bits(piTu[0]):.4f}")
        print(f"       largest error over all {len(levels)} levels, bits: eigenvector {np.abs(np.log2(piT / mass)).max():.1e};"
              f" adjacent ratios {np.abs(np.log2(ladder / mass)).max():.3f}; uniform-within-level samples {np.abs(np.log2(piTu / mass)).max():.3f}")

    # ---- 3.4 stitching a level no blind walk reaches: Opposite Nines on the 4x4 grid -----------------
    print("\n3.4  Stitching by sampling on the 4x4 grid, Opposite Nines, levels = number of pairs adding to 9 (0..8).")
    print("     40,000 boards drawn uniformly inside each level, one random priced move each; ratios of adjacent levels only.")
    rng = np.random.default_rng(346)
    n_s = 40000
    up, down = np.zeros(9), np.zeros(9)
    for lvl in range(9):
        b = np.zeros((n_s, 16), dtype=int)
        order = np.argsort(rng.random((n_s, 8)), axis=1)                  # which pairs are at 9
        at9 = np.zeros((n_s, 8), dtype=bool)
        np.put_along_axis(at9, order[:, :lvl], True, axis=1)
        a = rng.integers(0, 10, (n_s, 8))
        off = rng.integers(1, 10, (n_s, 8))                               # partner != 9 - a, uniform over the other nine
        partner = np.where(at9, 9 - a, (9 - a + off) % 10)
        b[:, :8], b[:, :7:-1] = a, partner
        cell = rng.integers(0, 16, n_s)
        k = rng.geometric(2 / 3, n_s) * (rng.integers(0, 2, n_s) * 2 - 1)
        v = b[np.arange(n_s), cell] + k
        ok = (v >= 0) & (v <= 9)
        b[np.arange(n_s)[ok], cell[ok]] = v[ok]
        after = score_nines(b)[0]
        up[lvl], down[lvl] = (after == lvl + 1).sum(), (after == lvl - 1).sum()
    logm, var = [0.0], [0.0]
    for lvl in range(8):
        logm.append(logm[-1] + math.log2(up[lvl] / down[lvl + 1]))
        var.append(var[-1] + (1 / up[lvl] + 1 / down[lvl + 1]) / math.log(2) ** 2)
    logm = np.array(logm)
    norm = math.log2(np.sum(2.0 ** logm))
    print("     pairs at 9 | exact bits of 'at least this many' | stitched | one standard error (bits)")
    for lvl in range(9):
        exact = bits(sum(math.comb(8, j) * 0.1 ** j * 0.9 ** (8 - j) for j in range(lvl, 9)))
        est = -math.log2(np.sum(2.0 ** (logm[lvl:] - norm)))
        print(f"       {lvl} | {exact:6.3f} | {est:6.3f} | {math.sqrt(var[lvl]):.3f}")
    print(f"     (the top has probability {0.1 ** 8:.0e}: {n_s * 9:,} blind boards would hold it {n_s * 9 * 0.1 ** 8:.4f} times on average)")

    # ---- 3.5 confining prices on the unbounded lines --------------------------------------------------
    print("\n3.5  Unbounded lines with confining prices: a move pays its base price plus the bits by which the description")
    print("     phi of the line grows; phi(m, c) = len(m) + len(c). Then pi = 2^-phi whatever the mutators.")
    R = 9
    box = [(m, c) for m in range(-R, R + 1) for c in range(-R, R + 1)]
    idx = {s: i for i, s in enumerate(box)}
    codes = {"slider code, len(n) = 1 + 1.585 |n|": lambda n: 1 + LAM * abs(n),
             "doubling code, len(n) = 1.20 + 2 log2(|n| + 1)": lambda n: math.log2(2 * (math.pi ** 2 / 6) - 1) + 2 * math.log2(abs(n) + 1)}
    for label, ln in codes.items():
        phi = np.array([ln(m) + ln(c) for m, c in box])
        results = []
        for surcharge_on_slide in (True, False):
            P = np.zeros((len(box), len(box)))
            for i, (m, c) in enumerate(box):
                for k in range(1, 40):
                    for sg in (1, -1):
                        for fam, t in (("lift", (m, c + sg * k)), ("tilt", (m + sg * k, c)), ("slide", (m, c - m * sg * k))):
                            j = idx.get(t)
                            if j is not None and j != i:
                                extra = max(0.0, phi[j] - phi[i]) if (fam != "slide" or surcharge_on_slide) else 0.0
                                P[i, j] += 2.0 ** -(LAM + LAM * k + extra)
            P[np.arange(len(box)), np.arange(len(box))] += 1 - P.sum(1)
            pi = stationary(P)
            target = 2.0 ** -phi / np.sum(2.0 ** -phi)
            results.append(np.abs(np.log2(pi / target)).max())
        print(f"     {label}: on the box |m|, |c| <= {R}, largest |E - phi| = {results[0]:.1e} bits with the surcharge on every"
              f" mutator; {results[1]:.2f} bits when slide is sold without it (the price list then fails the cycle test)")
    print("\n     Values on the unbounded integer lines under pi = 2^-phi (sums over |m|, |c| <= 3000):")
    N = 3000
    n = np.arange(-N, N + 1)
    up_ = make_u_prime(N)
    dist = -up_(n, n)
    for label, ln in codes.items():
        p1 = np.array([2.0 ** -ln(int(x)) for x in n])
        p1 /= p1.sum()
        ent = -2 * float(np.sum(p1[p1 > 0] * np.log2(p1[p1 > 0])))
        gap = lambda d: float(p1[abs(d):] @ p1[:2 * N + 1 - abs(d)])          # P(m - c = d) for independent m and c
        close = [bits(sum(gap(d) for d in range(-dd, dd + 1))) for dd in (0, 1, 3, 5)]
        prime = [bits(float(p1[dist <= dd].sum())) for dd in (0, 1, 2)]
        E = lambda m, c: -math.log2(p1[N + m]) - math.log2(p1[N + c])
        print(f"     {label}: entropy of a line {ent:.2f} bits")
        print(f"       'm close to c': |m - c| = 0: {close[0]:.2f}; <= 1: {close[1]:.2f}; <= 3: {close[2]:.2f}; <= 5: {close[3]:.2f}")
        print(f"       'gradient near a prime': distance 0: {prime[0]:.2f}; <= 1: {prime[1]:.2f}; <= 2: {prime[2]:.2f}")
        print("       energy of single lines: " + ", ".join(f"y = {m}x + {c}: {E(m, c):.2f}" for m, c in [(0, 0), (1, 0), (1, 1), (5, 5), (7, -21), (23, 23)]))


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "lines"):
        part_lines()
    if what in ("all", "grid"):
        part_grid()
    if what in ("all", "stationary"):
        part_stationary()
