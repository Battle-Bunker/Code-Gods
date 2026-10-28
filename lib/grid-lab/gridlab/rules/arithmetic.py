"""Arithmetic & number-pattern lens rules (arithmetic.md), plus its cross-lens ideas, in ordinal form."""
from __future__ import annotations

from ._util import *  # noqa: F401,F403
from ._util import hill_climb, plateau_search, label_links, runs


def _lines_scalar(a, axis):
    """Lists of lines (rows L→R and/or cols T→B) from a 2-D list."""
    N = len(a)
    rows = [list(r) for r in a]
    cols = [[a[r][c] for r in range(N)] for c in range(N)]
    return rows if axis == "rows" else cols if axis == "cols" else rows + cols


def _nlines(N, axis):
    return 2 * N if axis == "both" else N


def _sym_grid(gtype, v):
    return np.vectorize(lambda x: sym_for_value(gtype, int(x)))(np.asarray(v))


def _axis_canon(p, key="axis"):
    q = dict(p)
    if q[key] == "cols":
        q[key] = "rows"
    return q


# --- Straight Shooter ------------------------------------------------------------------------------
def ss_vals(sym, gtype, ace_high):
    v = vals(sym, gtype)
    if ace_high:
        v = np.where(gtype.rank[sym] == 0, 14, v)
    return v


def ss_ord(g, p, gtype):
    N, st = gtype.N, p["step"]
    v = ss_vals(g.sym, gtype, p["ace_high"]).tolist()
    col = g.col.tolist()
    score = pairs = 0
    for lv, lc in zip(_lines_scalar(v, "both"), _lines_scalar(col, "both")):
        L, mono = 1, True
        for i in range(1, N + 1):
            if i < N and lv[i] == lv[i - 1] + st:
                L += 1
                pairs += 1
                mono = mono and lc[i] == lc[i - 1]
            else:
                if L >= 3:
                    score += L * L * (2 if p["flush"] and mono else 1)
                L, mono = 1, True
    return tup(score, pairs)


def ss_batch(sym, col, p, gtype):
    N, st = gtype.N, p["step"]
    v = lines_rc(ss_vals(sym, gtype, p["ace_high"]), "both")
    c = lines_rc(col, "both")
    B = len(sym)
    L = np.ones((B, 2 * N), np.int64)
    mono = np.ones((B, 2 * N), bool)
    score = np.zeros(B, np.int64)
    pairs = np.zeros(B, np.int64)
    for i in range(1, N + 1):
        if i < N:
            ok = v[:, :, i] == v[:, :, i - 1] + st
            pairs += ok.sum(1)
            same = c[:, :, i] == c[:, :, i - 1]
        else:
            ok = np.zeros((B, 2 * N), bool)
            same = ok
        end = ~ok
        w = np.where(p["flush"] & mono, 2, 1)
        score += np.where(end & (L >= 3), L * L * w, 0).sum(1)
        L = np.where(ok, L + 1, 1)
        mono = np.where(ok, mono & same, True)
    return tupb(score, pairs)


def ss_exemplar(p, gtype):
    N = gtype.N
    lo, hi = (2, 14) if p["ace_high"] else (vmin(gtype), vmax(gtype))
    R = hi - lo
    r, c = np.indices((N, N))

    def sg(v):
        v = np.asarray(v)
        if p["ace_high"]:
            return np.where(v == 14, 0, v - 1)  # cards: A high is rank 0 (suit ♠)
        return _sym_grid(gtype, v)
    cands = []
    for v in (lo + r + c, lo + c, lo + np.minimum(r + c, R), lo + (r + c) % (R + 1)):
        if v.max() <= hi:
            s = sg(v)
            if p["step"] == -1:
                s = np.rot90(s, 2)
            cands.append(grid(s, np.zeros((N, N))))
    return best_of(ss_ord, cands, p, gtype)


STRAIGHT_SHOOTER = mk(
    id="straight_shooter", name="Straight Shooter", theme="Rows and columns that count",
    requires=req("Valued", "Ranked"), layers={"symbol", "colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"step": int(rng.choice([1, -1])), "flush": bool(rng.random() < 0.5),
                            "ace_high": bool(gt.symbols == "cards" and rng.random() < 0.5)},
    summary=lambda p, gt: (f"Runs of 3 or more numbers that count {'up' if p['step'] == 1 else 'down'} one at a time "
                           "(left to right, or top to bottom) score their length squared"
                           + (", doubled if the run is all one colour" if p["flush"] else "")
                           + (". Aces are high (Q, K, A counts)." if p["ace_high"] else ".")),
    ordinal=ss_ord, batch=ss_batch, canonical=lambda p, gt: {**p, "step": 1}, exemplar=ss_exemplar,
    source="catalog#9 (D11: arith#2 + games#3; flush and aceHigh); tie-breaker = counting steps", tags={"shortlist"})


# --- Number Bonds ---------------------------------------------------------------------------------------
def nb_ord(g, p, gtype):
    N, T = gtype.N, vmax(gtype) + 1
    v, col = gtype.value[g.sym].tolist(), g.col.tolist()
    s = 0
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N and v[r][c] + v[r2][c2] == T:
                    same = col[r][c] == col[r2][c2]
                    s += p["mode"] == "any" or (p["mode"] == "same") == same
    return s


def nb_batch(sym, col, p, gtype):
    T = vmax(gtype) + 1
    v = vals(sym, gtype)
    s = 0
    for a, b, ca, cb in ((v[:, :, :-1], v[:, :, 1:], col[:, :, :-1], col[:, :, 1:]),
                         (v[:, :-1, :], v[:, 1:, :], col[:, :-1, :], col[:, 1:, :])):
        ok = a + b == T
        if p["mode"] != "any":
            ok &= (ca == cb) == (p["mode"] == "same")
        s = s + ok.sum((1, 2))
    return s


def nb_exemplar(p, gtype):
    N = gtype.N
    half = (vmax(gtype) + 1) // 2
    r, c = np.indices((N, N))
    col = (r + c) % 2 if p["mode"] == "different" else np.zeros((N, N))
    return grid(np.full((N, N), sym_for_value(gtype, half)), col)


NUMBER_BONDS = mk(
    id="number_bonds", name="Number Bonds", theme="Neighbours that make the magic number",
    requires=req("Valued"), layers={"symbol", "colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"mode": str(rng.choice(["any", "same", "different"]))},
    summary=lambda p, gt: (f"Every pair of touching cells whose numbers add up to {vmax(gt) + 1} scores a point"
                           + {"any": ".", "same": ", but only if the two cells are the same colour.",
                              "different": ", but only if the two cells are different colours."}[p["mode"]]),
    ordinal=nb_ord, batch=nb_batch, exemplar=nb_exemplar,
    source="catalog#10 (arith#3; T = V+1, cards 14)", tags={"shortlist"})


# --- Magic Accountant (merged with Row Ranger exact mode) ------------------------------------------------
def ma_dmax(N, axis, gtype):
    return _nlines(N, axis) * N * (vmax(gtype) - vmin(gtype))


def ma_ord(g, p, gtype):
    N, T = gtype.N, p["T"]
    sums = [sum(l) for l in _lines_scalar(gtype.value[g.sym].tolist(), p["axis"])]
    D = ma_dmax(N, p["axis"], gtype)
    return tup(sum(s == T for s in sums), D - sum(abs(s - T) for s in sums))


def ma_batch(sym, col, p, gtype):
    N, T = gtype.N, p["T"]
    s = lines_rc(vals(sym, gtype), p["axis"]).sum(2)
    D = ma_dmax(N, p["axis"], gtype)
    return tupb((s == T).sum(1), D - np.abs(s - T).sum(1))


def ma_sample(rng, gtype):
    N, lo, hi = gtype.N, vmin(gtype), vmax(gtype)
    T = int(np.clip(round(N * (lo + hi) / 2) + int(rng.integers(-N, N + 1)), N * lo, N * hi))
    return {"axis": str(rng.choice(["rows", "cols", "both"])), "T": T}


def base_row(N, T, lo, hi):
    row, rem = [lo] * N, T - N * lo
    for i in range(N):
        add = min(hi - lo, rem)
        row[i] += add
        rem -= add
    return row


def circulant(row):
    N = len(row)
    return np.array([[row[(c + r) % N] for c in range(N)] for r in range(N)])


def ma_exemplar(p, gtype):
    v = circulant(base_row(gtype.N, p["T"], vmin(gtype), vmax(gtype)))
    return grid(_sym_grid(gtype, v), np.zeros((gtype.N, gtype.N)))


def ma_canon(p, gtype):
    q = _axis_canon(p)
    q["T"] = min(p["T"], gtype.N * (vmin(gtype) + vmax(gtype)) - p["T"])  # value reflection v -> lo+hi-v
    return q


MAGIC_ACCOUNTANT = mk(
    id="magic_accountant", name="Magic Accountant", theme="Lines that add up to your magic number",
    requires=req("Valued"), layers={"symbol", "position"}, camp="neutral",
    sample=ma_sample,
    summary=lambda p, gt: (f"Your magic number is {p['T']}. Every "
                           + {"rows": "row", "cols": "column", "both": "row and column"}[p["axis"]]
                           + " whose numbers add up to exactly that scores a point; otherwise closer is better."),
    ordinal=ma_ord, batch=ma_batch, canonical=ma_canon, exemplar=ma_exemplar,
    source="catalog#25 (D10: strat#7 + arith#1 exact mode); tie-breaker = total distance from T", tags={"shortlist"})


# --- Round Numbers (Row Ranger round mode) ------------------------------------------------------------------
def rr_ord(g, p, gtype):
    b = gtype.base
    sums = [sum(l) for l in _lines_scalar(gtype.value[g.sym].tolist(), p["axis"])]
    near = sum(b // 2 - min(s % b, b - s % b) for s in sums)
    return tup(sum(s % b == 0 for s in sums), near)


def rr_batch(sym, col, p, gtype):
    b = gtype.base
    s = lines_rc(vals(sym, gtype), p["axis"]).sum(2)
    m = s % b
    return tupb((m == 0).sum(1), (b // 2 - np.minimum(m, b - m)).sum(1))


ROUND_NUMBERS = mk(
    id="round_numbers", name="Round Numbers", theme="Line totals that end in zero",
    requires=req("Numeral"), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"axis": str(rng.choice(["rows", "cols", "both"]))},
    summary=lambda p, gt: ("Every " + {"rows": "row", "cols": "column", "both": "row and column"}[p["axis"]]
                           + f" whose total is a round number in base {gt.base} (a multiple of {gt.base}) scores a point."),
    ordinal=rr_ord, batch=rr_batch, canonical=lambda p, gt: _axis_canon(p),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="arith#1 Row Ranger round-number mode (catalog D10 mode=round); tie-breaker = closeness to a multiple")


# --- King of the Hill -----------------------------------------------------------------------------------------
def kh_ord(g, p, gtype):
    N = gtype.N
    v, col = gtype.value[g.sym].tolist(), g.col.tolist()
    s = 0
    for r in range(N):
        for c in range(N):
            if col[r][c] != p["X"]:
                continue
            ns = [v[a][b] for a, b in nbrs4(N, r, c)]
            s += all(v[r][c] < x for x in ns) if p["valley"] else all(v[r][c] > x for x in ns)
    return s


def kh_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    ok = col == p["X"]
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        if p["valley"]:
            ok &= v < shift(v, dr, dc, 10 ** 6)
        else:
            ok &= v > shift(v, dr, dc, -10 ** 6)
    return ok.sum((1, 2))


def kh_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    hi, lo = sym_for_value(gtype, vmax(gtype)), sym_for_value(gtype, vmin(gtype))
    top, bot = (lo, hi) if p["valley"] else (hi, lo)
    return grid(np.where((r + c) % 2 == 0, top, bot), np.full((N, N), p["X"]))


KING_OF_THE_HILL = mk(
    id="king_of_the_hill", name="King of the Hill", theme="Mountain tops in your colour",
    requires=req("Valued"), layers={"colour", "symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt), "valley": bool(rng.random() < 0.3)},
    summary=lambda p, gt: (f"A {'valley' if p['valley'] else 'mountain top'} is a {cname(gt, p['X'])} cell whose number is "
                           f"{'smaller' if p['valley'] else 'bigger'} than every touching neighbour. Count them."),
    ordinal=kh_ord, batch=kh_batch,
    canonical=lambda p, gt: {"X": 0, "valley": False},  # value reflection maps valleys to peaks
    exemplar=kh_exemplar, source="catalog#26 (arith#13; valley variant)", tags={"shortlist"})


# --- Divisibility Detective ------------------------------------------------------------------------------------
DIVISORS = {10: [5, 10, 3, 9], 12: [3, 4, 6, 12, 11], 16: [4, 8, 16, 3, 5, 15]}  # m = 2 dropped (catalog #29)


def dd_ord(g, p, gtype):
    b, m = gtype.base, p["m"]
    s = 0
    for ln in _lines_scalar(gtype.value[g.sym].tolist(), p["scope"]):
        x = 0
        for d in ln:
            x = (x * b + d) % m
        s += x == 0
    return s


def dd_batch(sym, col, p, gtype):
    b, m = gtype.base, p["m"]
    L = lines_rc(vals(sym, gtype), p["scope"])
    x = np.zeros(L.shape[:2], np.int64)
    for i in range(gtype.N):
        x = (x * b + L[:, :, i]) % m
    return (x == 0).sum(1)


DIVISIBILITY = mk(
    id="divisibility_detective", name="Divisibility Detective", theme="Rows read as numbers that divide evenly",
    requires=req("Numeral"), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"m": int(rng.choice(DIVISORS[gt.base])), "scope": str(rng.choice(["rows", "both"]))},
    summary=lambda p, gt: (f"Read each row{' (and each column, top to bottom)' if p['scope'] == 'both' else ''} as one big "
                           f"base-{gt.base} number. Score a point for each one that {p['m']} divides exactly."),
    ordinal=dd_ord, batch=dd_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="catalog#29 (arith#14; m=2 dropped)", tags={"shortlist"})


# --- Number Sandwich (Sum Sandwich) -----------------------------------------------------------------------------
def sw_ord(g, p, gtype):
    N = gtype.N
    v, col = gtype.value[g.sym].tolist(), g.col.tolist()
    s = 0
    for lv, lc in zip(_lines_scalar(v, "both"), _lines_scalar(col, "both")):
        for i in range(N - 2):
            a, b, c = lv[i:i + 3]
            if p["mode"] == "sandwich":
                ok, tc = a > 0 and c > 0 and b == a + c, lc[i + 1]
            else:
                ok, tc = a > 0 and b > 0 and c == a + b, lc[i + 2]
            s += ok and (p["X"] is None or tc == p["X"])
    return s


def sw_batch(sym, col, p, gtype):
    L, C = lines_rc(vals(sym, gtype), "both"), lines_rc(col, "both")
    a, b, c = L[:, :, :-2], L[:, :, 1:-1], L[:, :, 2:]
    if p["mode"] == "sandwich":
        ok, tc = (a > 0) & (c > 0) & (b == a + c), C[:, :, 1:-1]
    else:
        ok, tc = (a > 0) & (b > 0) & (c == a + b), C[:, :, 2:]
    if p["X"] is not None:
        ok &= tc == p["X"]
    return ok.sum((1, 2))


def sw_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    X = 0 if p["X"] is None else p["X"]
    cands = [np.where((r + c) % 2 == 0, 1, 2), np.array([1, 1, 2])[(r + c) % 3], np.array([1, 1, 2])[c % 3]]
    if vmax(gtype) >= 8:
        fib = np.array([1, 1, 2, 3, 5, 8, 13])
        cands.append(fib[np.minimum(c, 5 if vmax(gtype) < 13 else 6)])
    gs = [grid(_sym_grid(gtype, v), np.full((N, N), X)) for v in cands]
    return best_of(sw_ord, gs, p, gtype)


NUMBER_SANDWICH = mk(
    id="number_sandwich", name="Number Sandwich", theme="The middle number is the total",
    requires=req("Valued"), layers={"symbol", "colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"mode": str(rng.choice(["sandwich", "fibonacci"])),
                            "X": colour(rng, gt) if rng.random() < 0.5 else None},
    summary=lambda p, gt: (("Three cells in a line where the middle number is the two outside numbers added (like 2 5 3)"
                            if p["mode"] == "sandwich" else
                            "Three cells in a line where the last number is the first two added (like 2 3 5)")
                           + " score a point (no zeros on the outside)"
                           + (f"; the total cell must be {cname(gt, p['X'])}." if p["X"] is not None else ".")),
    ordinal=sw_ord, batch=sw_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=sw_exemplar,
    source="arith#4 Sum Sandwich (renamed per catalog)")


# --- Magic Window ---------------------------------------------------------------------------------------------
def _wlines():
    L = [[(i, 0), (i, 1), (i, 2)] for i in range(3)] + [[(0, i), (1, i), (2, i)] for i in range(3)]
    return L + [[(0, 0), (1, 1), (2, 2)], [(0, 2), (1, 1), (2, 0)]]


def mw_ord(g, p, gtype):
    N = gtype.N
    v, col = gtype.value[g.sym].tolist(), g.col.tolist()
    best = tot = 0
    for r in range(N - 2):
        for c in range(N - 2):
            S = 3 * v[r + 1][c + 1]
            k = 0
            for ln in _wlines():
                xs = [v[r + a][c + b] for a, b in ln]
                k += sum(xs) == S and len(set(xs)) > 1
            if p["X"] is not None and col[r + 1][c + 1] != p["X"]:
                k = 0
            best, tot = max(best, k), tot + k
    return tup(best, tot)


def mw_batch(sym, col, p, gtype):
    N = gtype.N
    v = vals(sym, gtype)
    B = len(sym)
    n = N - 2
    k = np.zeros((B, n, n), np.int64)
    S = 3 * v[:, 1:n + 1, 1:n + 1]
    for ln in _wlines():
        xs = [v[:, a:a + n, b:b + n] for a, b in ln]
        k += ((xs[0] + xs[1] + xs[2]) == S) & ~((xs[0] == xs[1]) & (xs[1] == xs[2]))
    if p["X"] is not None:
        k *= col[:, 1:n + 1, 1:n + 1] == p["X"]
    return tupb(k.reshape(B, -1).max(1), k.sum((1, 2)))


def mw_exemplar(p, gtype):
    N = gtype.N
    v = np.full((N, N), 5)
    v[:3, :3] = [[2, 7, 6], [9, 5, 1], [4, 3, 8]]
    col = np.full((N, N), 0 if p["X"] is None else p["X"])
    return grid(_sym_grid(gtype, v), col)


MAGIC_WINDOW = mk(
    id="magic_window", name="Magic Window", theme="Find a magic square",
    requires=req("Valued"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt) if rng.random() < 0.5 else None},
    summary=lambda p, gt: ("In your best 3×3 window, count the rows, columns and diagonals that add up to three times the "
                           "middle number (all-equal lines don't count). 8 is a perfect magic square"
                           + (f"; the middle cell must be {cname(gt, p['X'])}." if p["X"] is not None else ".")),
    ordinal=mw_ord, batch=mw_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=mw_exemplar,
    source="arith#5; tie-breaker = magic lines summed over all windows")


# --- Times-Table Territory -------------------------------------------------------------------------------------
TT_M = {"base10": [3, 4, 5], "base12": [3, 4, 6], "base16": [3, 4, 5], "cards": [3, 4, 5]}
PRIMES = {2, 3, 5, 7, 11, 13}


def tt_pred(v, m):
    if m == "prime":
        return np.isin(v, list(PRIMES))
    return v % m == 0


def tt_ord(g, p, gtype):
    v = gtype.value[g.sym]
    ok = tt_pred(v, p["m"])
    if p["X"] is not None:
        ok = ok & (g.col == p["X"])
    N = gtype.N
    return max((len(c) for c in comps2d([[0] * N for _ in range(N)], ok.tolist())), default=0)


def tt_batch(sym, col, p, gtype):
    ok = tt_pred(vals(sym, gtype), p["m"])
    if p["X"] is not None:
        ok &= col == p["X"]
    lab = label_batch(np.zeros(sym.shape, np.int64), ok)
    return comp_sum(lab, np.ones(sym.shape, np.int64), ok).reshape(len(sym), -1).max(1)


def tt_exemplar(p, gtype):
    N = gtype.N
    v = 2 if p["m"] == "prime" else (0 if vmin(gtype) == 0 else p["m"])
    return grid(np.full((N, N), sym_for_value(gtype, v)), np.full((N, N), 0 if p["X"] is None else p["X"]))


TIMES_TABLE = mk(
    id="times_table_territory", name="Times-Table Territory", theme="The biggest patch of your times table",
    requires=req("Valued"), layers={"symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"m": (TT_M[gt.symbols] + ["prime"])[int(rng.integers(4))],
                            "X": colour(rng, gt) if rng.random() < 0.5 else None},
    summary=lambda p, gt: ("Find the biggest patch of touching cells whose numbers are all "
                           + ("prime numbers" if p["m"] == "prime" else f"in the {p['m']} times table")
                           + (f" and all {cname(gt, p['X'])}" if p["X"] is not None else "") + ". Its size is your score."),
    ordinal=tt_ord, batch=tt_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=tt_exemplar,
    source="arith#6 (m menu per symbol set, prime variant, colour twist)")


# --- Odds & Evens Chessboard ------------------------------------------------------------------------------------
def oe_ord(g, p, gtype):
    N = gtype.N
    par, col = (gtype.value[g.sym] % 2).tolist(), g.col.tolist()
    s = 0
    for r in range(N - 1):
        for c in range(N - 1):
            a, b, d, e = par[r][c], par[r][c + 1], par[r + 1][c], par[r + 1][c + 1]
            if a == e and b == d and a != b:
                if p["X"] is not None:
                    cells = [(r, c), (r, c + 1), (r + 1, c), (r + 1, c + 1)]
                    if any(par[x][y] == 1 and col[x][y] != p["X"] for x, y in cells):
                        continue
                s += 1
    return s


def oe_batch(sym, col, p, gtype):
    par = vals(sym, gtype) % 2
    a, b, d, e = par[:, :-1, :-1], par[:, :-1, 1:], par[:, 1:, :-1], par[:, 1:, 1:]
    ok = (a == e) & (b == d) & (a != b)
    if p["X"] is not None:
        bad = (par == 1) & (col != p["X"])
        ok &= ~(bad[:, :-1, :-1] | bad[:, :-1, 1:] | bad[:, 1:, :-1] | bad[:, 1:, 1:])
    return ok.sum((1, 2))


def oe_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    v = vmin(gtype) + (r + c) % 2
    return grid(_sym_grid(gtype, v), np.full((N, N), 0 if p["X"] is None else p["X"]))


ODDS_EVENS = mk(
    id="odds_evens", name="Odds & Evens", theme="A chessboard of odd and even numbers",
    requires=req("Valued"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt) if rng.random() < 0.5 else None},
    summary=lambda p, gt: ("Every 2×2 square whose numbers go odd, even / even, odd like a chessboard scores a point"
                           + (f"; its odd numbers must be {cname(gt, p['X'])}." if p["X"] is not None else ".")),
    ordinal=oe_ord, batch=oe_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=oe_exemplar,
    source="arith#7 Odds & Evens Chessboard (colourLock as X)")


# --- Number Painter ------------------------------------------------------------------------------------------------
def np_ord(g, p, gtype):
    v, col = gtype.value[g.sym].ravel().tolist(), g.col.ravel().tolist()
    return sum(a == c + 1 + p["o"] for a, c in zip(v, col))


def np_batch(sym, col, p, gtype):
    return (vals(sym, gtype) == col.astype(np.int64) + 1 + p["o"]).sum((1, 2))


def np_offsets(gtype):
    return list(range(vmin(gtype) - 1, vmax(gtype) - gtype.C + 1))


NUMBER_PAINTER = mk(
    id="number_painter", name="Number Painter", theme="Paint by numbers",
    requires=req("Valued", "Spectral"), layers={"colour", "symbol"}, camp="neutral",
    sample=lambda rng, gt: {"o": int(rng.choice(np_offsets(gt)))},
    summary=lambda p, gt: ("Each colour has a number: " + ", ".join(f"{n}={i + 1 + p['o']}" for i, n in enumerate(gt.colour_names))
                           + ". Score a point for every cell whose number matches its colour."),
    ordinal=np_ord, batch=np_batch, canonical=lambda p, gt: {"o": np_offsets(gt)[0]},
    exact_log2_tail=lambda t, p, gt: log2_binom_tail(gt.N ** 2, 1.0 / len(set(gt.value.tolist())), int(t)),
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), sym_for_value(gt, 1 + p["o"])), np.zeros((gt.N, gt.N))),
    source="arith#8 (offset o; every valid o gives Bin(N², 1/#values))")


# --- Robin Hood ------------------------------------------------------------------------------------------------------
def rh_ord(g, p, gtype):
    sums = [0] * gtype.C
    for a, c in zip(gtype.value[g.sym].ravel().tolist(), g.col.ravel().tolist()):
        sums[c] += a
    return 2 * min(sums) - max(sums)


def rh_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    s = np.stack([(v * (col == k)).sum((1, 2)) for k in range(gtype.C)], 1)
    return 2 * s.min(1) - s.max(1)


def rh_exemplar(p, gtype):
    N, C, lo, hi = gtype.N, gtype.C, vmin(gtype), vmax(gtype)
    col = np.arange(N * N) % C
    T = (N * N // C) * hi
    v = np.zeros(N * N, np.int64)
    for k in range(C):
        idx = np.nonzero(col == k)[0]
        rem = T
        for j, i in enumerate(idx):
            left = len(idx) - j - 1
            x = min(hi, rem - left * lo)
            v[i] = max(lo, x)
            rem -= v[i]
    return grid(_sym_grid(gtype, v.reshape(N, N)), col.reshape(N, N))


ROBIN_HOOD = mk(
    id="robin_hood", name="Robin Hood", theme="Fair shares for every colour",
    requires=req("Valued"), layers={"colour", "symbol"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Add up the numbers of each colour. Your score is the poorest colour's total, minus how far "
                           "the richest colour is ahead of it."),
    ordinal=rh_ord, batch=rh_batch, exemplar=rh_exemplar,
    source="arith#10 with the catalog/arith fix min − (max − min)")


# --- Seesaw ------------------------------------------------------------------------------------------------------------
def sa_imb_scalar(lv, lc, p, N):
    if p["mode"] == "halves":
        h = N // 2
        return sum(lv[:h]) - sum(lv[N - h:])
    return sum(a for a, c in zip(lv, lc) if c == p["X"]) - sum(a for a, c in zip(lv, lc) if c == p["Y"])


def sa_ord(g, p, gtype):
    N = gtype.N
    v, col = gtype.value[g.sym].tolist(), g.col.tolist()
    imb = [abs(sa_imb_scalar(a, b, p, N)) for a, b in zip(_lines_scalar(v, p["scope"]), _lines_scalar(col, p["scope"]))]
    nl = _nlines(N, p["scope"])
    D = nl * N * vmax(gtype)
    return tup(sum(x == 0 for x in imb), D - sum(imb))


def sa_batch(sym, col, p, gtype):
    N = gtype.N
    L, C = lines_rc(vals(sym, gtype), p["scope"]), lines_rc(col, p["scope"])
    if p["mode"] == "halves":
        h = N // 2
        imb = np.abs(L[:, :, :h].sum(2) - L[:, :, N - h:].sum(2))
    else:
        imb = np.abs((L * (C == p["X"])).sum(2) - (L * (C == p["Y"])).sum(2))
    nl = _nlines(N, p["scope"])
    D = nl * N * vmax(gtype)
    return tupb((imb == 0).sum(1), D - imb.sum(1))


def sa_sample(rng, gtype):
    p = {"scope": str(rng.choice(["rows", "cols", "both"])), "mode": str(rng.choice(["halves", "colours"])),
         "X": None, "Y": None}
    if p["mode"] == "colours":
        p["X"], p["Y"] = colours(rng, gtype, 2)
    return p


def sa_exemplar(p, gtype):
    N = gtype.N
    col = np.full((N, N), _third(gtype, p["X"], p["Y"]))
    return grid(np.full((N, N), sym_for_value(gtype, vmax(gtype))), col)


def _third(gtype, *cs):
    return next(k for k in range(gtype.C) if k not in cs)


SEESAW = mk(
    id="seesaw", name="Seesaw", theme="Lines that balance",
    requires=req("Valued"), layers={"symbol", "position"}, camp="clumper",
    sample=sa_sample,
    summary=lambda p, gt: ("Each " + {"rows": "row", "cols": "column", "both": "row and column"}[p["scope"]] + " is a seesaw. "
                           + ("Add up the left half and the right half (skip the middle): if they match it balances."
                              if p["mode"] == "halves" else
                              f"Add up its {cname(gt, p['X'])} numbers and its {cname(gt, p['Y'])} numbers: if they match it balances.")
                           + " Score a point for each balanced one; nearly balanced is better than way off."),
    ordinal=sa_ord, batch=sa_batch, canonical=lambda p, gt: recolour(_axis_canon(p, "scope"), ["X", "Y"]),
    exemplar=sa_exemplar, source="arith#11 (colourSeesaw variant as mode=colours); tie-breaker = total imbalance")


# --- Stepping Stones ---------------------------------------------------------------------------------------------------
def st_menu(gtype):
    m = [1, 2, 3] + ([4] if gtype.symbols == "base16" else [])
    cliff = -(-vmax(gtype) // 2)
    return sorted(set(m + [cliff]))


def st_ord(g, p, gtype):
    N, d = gtype.N, p["d"]
    v = gtype.value[g.sym].tolist()
    seen, best = set(), 0
    for r in range(N):
        for c in range(N):
            if (r, c) in seen:
                continue
            stack, n = [(r, c)], 0
            seen.add((r, c))
            while stack:
                a, b = stack.pop()
                n += 1
                for x, y in nbrs4(N, a, b):
                    if (x, y) not in seen and abs(v[x][y] - v[a][b]) == d:
                        seen.add((x, y)); stack.append((x, y))
            best = max(best, n)
    return best


def st_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    lab = label_links(np.abs(v[:, :, 1:] - v[:, :, :-1]) == p["d"], np.abs(v[:, 1:, :] - v[:, :-1, :]) == p["d"])
    allm = np.ones(sym.shape, bool)
    return comp_sum(lab, np.ones(sym.shape, np.int64), allm).reshape(len(sym), -1).max(1)


def st_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(_sym_grid(gtype, vmin(gtype) + p["d"] * ((r + c) % 2)), np.zeros((N, N)))


STEPPING_STONES = mk(
    id="stepping_stones", name="Stepping Stones", theme="Hop between numbers that differ by your step",
    requires=req("Valued"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"d": int(rng.choice(st_menu(gt)))},
    summary=lambda p, gt: (f"You can hop between touching cells whose numbers differ by exactly {p['d']}. Score the size "
                           "of the biggest group you can reach by hopping."),
    ordinal=st_ord, batch=st_batch, exemplar=st_exemplar,
    source="arith#12 (d menu incl. Cliffhanger ⌈V/2⌉)")


# --- Column Addition ---------------------------------------------------------------------------------------------------
def ca_ord(g, p, gtype):
    N, b, t = gtype.N, gtype.base, p["top"]
    v = gtype.value[g.sym].tolist()
    if not any(v[t]):
        return (0, 0)
    carry, trail, corr, alive = 0, 0, 0, True
    for c in range(N - 1, -1, -1):
        s = v[t][c] + v[t + 1][c] + carry
        ok = s % b == v[t + 2][c]
        corr += ok
        alive = alive and ok
        trail += alive
        carry = s // b
    return tup(trail, corr)


def ca_batch(sym, col, p, gtype):
    N, b, t = gtype.N, gtype.base, p["top"]
    v = vals(sym, gtype)
    B = len(sym)
    carry = np.zeros(B, np.int64)
    trail = np.zeros(B, np.int64)
    corr = np.zeros(B, np.int64)
    alive = np.ones(B, bool)
    for c in range(N - 1, -1, -1):
        s = v[:, t, c] + v[:, t + 1, c] + carry
        ok = s % b == v[:, t + 2, c]
        corr += ok
        alive &= ok
        trail += alive
        carry = s // b
    nz = v[:, t, :].any(1)
    return np.where(nz[:, None], tupb(trail, corr), 0)


def ca_exemplar(p, gtype):
    N, t = gtype.N, p["top"]
    v = np.zeros((N, N), np.int64)
    v[t], v[t + 1], v[t + 2] = 1, 1, 2
    return grid(v, np.zeros((N, N)))


COLUMN_ADDITION = mk(
    id="column_addition", name="Column Addition", theme="Three rows make a written sum",
    requires=req("Numeral"), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"top": int(rng.integers(gt.N - 2))},
    summary=lambda p, gt: (f"Rows {p['top'] + 1} + {p['top'] + 2} should make row {p['top'] + 3}, like a written sum in "
                           f"base {gt.base} (carry when you reach {gt.base}). Score the columns you got right counting from "
                           "the right-hand end (the top row can't be all zeros)."),
    ordinal=ca_ord, batch=ca_batch, canonical=lambda p, gt: {"top": 0}, exemplar=ca_exemplar,
    source="arith#15 (all-zero top row excluded); tie-breaker = correct columns anywhere")


# --- Ladder of Numbers ---------------------------------------------------------------------------------------------------
def ld_ord(g, p, gtype):
    N, b = gtype.N, gtype.base
    v = gtype.value[g.sym].tolist()
    nums = [sum(d * b ** (N - 1 - i) for i, d in enumerate(row)) for row in v]
    if p["dir"] == "up":
        nums = nums[::-1]
    inc = [nums[r] > nums[r - 1] for r in range(1, N)]
    return tup(max((L for _, L in runs(inc)), default=0), sum(inc))


def ld_batch(sym, col, p, gtype):
    N, b = gtype.N, gtype.base
    v = vals(sym, gtype)
    nums = (v * (b ** np.arange(N - 1, -1, -1, dtype=np.int64))).sum(2)
    if p["dir"] == "up":
        nums = nums[:, ::-1]
    inc = nums[:, 1:] > nums[:, :-1]
    run = np.zeros(len(sym), np.int64)
    best = np.zeros(len(sym), np.int64)
    for i in range(N - 1):
        run = np.where(inc[:, i], run + 1, 0)
        best = np.maximum(best, run)
    return tupb(best, inc.sum(1))


def ld_exemplar(p, gtype):
    N = gtype.N
    v = np.zeros((N, N), np.int64)
    v[:, -1] = np.arange(N) if p["dir"] == "down" else np.arange(N)[::-1]
    return grid(v, np.zeros((N, N)))


LADDER = mk(
    id="ladder_of_numbers", name="Ladder of Numbers", theme="Row numbers that keep getting bigger",
    requires=req("Numeral"), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"dir": str(rng.choice(["down", "up"]))},
    summary=lambda p, gt: (f"Read each row as a base-{gt.base} number. Going {p['dir']} the page they should keep getting "
                           "bigger. Score your longest unbroken climb, then the number of rows bigger than the one before."),
    ordinal=ld_ord, batch=ld_batch, canonical=lambda p, gt: {"dir": "down"}, exemplar=ld_exemplar,
    source="arith#16 (catalog: longest streak primary, count of rises as tie-breaker)")


# --- Snap (arith idea) ---------------------------------------------------------------------------------------------------
def sn_ord(g, p, gtype):
    N = gtype.N
    k = rank_key(g.sym, gtype).tolist()
    return sum(1 for r in range(N) for c in range(N) for r2, c2 in ((r, c + 1), (r + 1, c))
               if r2 < N and c2 < N and k[r][c] == k[r2][c2])


def sn_batch(sym, col, p, gtype):
    k = rank_key(sym, gtype)
    return (k[:, :, 1:] == k[:, :, :-1]).sum((1, 2)) + (k[:, 1:, :] == k[:, :-1, :]).sum((1, 2))


SNAP = mk(
    id="snap", name="Snap!", theme="Touching twins",
    requires=req(), layers={"symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "Shout Snap! for every pair of touching cells showing the same symbol" + (
        " (same rank, any suit)." if gt.symbols == "cards" else "."),
    ordinal=sn_ord, batch=sn_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="arith cross-lens idea 'Snap' (cards: rank)")


# --- Young Tableau (arith idea: gradient toward a corner) ------------------------------------------------------------
def _to_br(a, K):
    if K[0] == "T":
        a = a[..., ::-1, :]
    if K[1] == "L":
        a = a[..., :, ::-1]
    return a


def yt_ord(g, p, gtype):
    N = gtype.N
    v = _to_br(gtype.value[g.sym], p["K"]).tolist()
    full = pairs = 0
    for ln in _lines_scalar(v, "both"):
        ok = [ln[i + 1] > ln[i] for i in range(N - 1)]
        full += all(ok)
        pairs += sum(ok)
    return tup(full, pairs)


def yt_batch(sym, col, p, gtype):
    L = lines_rc(_to_br(vals(sym, gtype), p["K"]), "both")
    ok = L[:, :, 1:] > L[:, :, :-1]
    return tupb(ok.all(2).sum(1), ok.sum((1, 2)))


def yt_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    lo, R = vmin(gtype), vmax(gtype) - vmin(gtype)
    v = lo + np.minimum(r + c, R)
    g0 = grid(_to_br(_sym_grid(gtype, v), p["K"]), np.zeros((N, N)))
    choices = [sym_for_value(gtype, x) for x in range(lo, vmax(gtype) + 1)]
    return hill_climb(yt_batch, g0, p, gtype, layers=("symbol",), sym_choices=choices, max_steps=60)


YOUNG_TABLEAU = mk(
    id="young_tableau", name="Uphill", theme="Numbers rise toward your corner",
    requires=req("Valued"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"K": str(rng.choice(["TL", "TR", "BL", "BR"]))},
    summary=lambda p, gt: (f"Numbers should get strictly bigger as you walk toward the "
                           f"{'top' if p['K'][0] == 'T' else 'bottom'}-{'left' if p['K'][1] == 'L' else 'right'} corner, "
                           "along every row and column. Score whole lines first, then single uphill steps."),
    ordinal=yt_ord, batch=yt_batch, canonical=lambda p, gt: {"K": "BR"}, exemplar=yt_exemplar,
    source="arith cross-lens idea 'Gradient / Young tableau' (strict); tie-breaker = uphill steps")


# --- Fillomino (arith idea) ----------------------------------------------------------------------------------------------
def fi_ord(g, p, gtype):
    N = gtype.N
    k, v = rank_key(g.sym, gtype).tolist(), gtype.value[g.sym].tolist()
    s = 0
    for comp in comps2d(k, [[True] * N for _ in range(N)]):
        r, c = comp[0]
        if len(comp) == v[r][c]:
            s += len(comp)
    return s


def fi_batch(sym, col, p, gtype):
    k = rank_key(sym, gtype)
    allm = np.ones(sym.shape, bool)
    size = comp_sum(label_batch(k, allm), np.ones(sym.shape, np.int64), allm)
    return (size == vals(sym, gtype)).sum((1, 2))


def fi_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    one, two = sym_for_value(gtype, 1), sym_for_value(gtype, 2)
    other = sym_for_value(gtype, vmax(gtype))
    # 2-dominoes in a brick pattern separated by 1s, or a 1/other checkerboard.
    brick = np.where(((c + 3 * (r % 2)) % 3) == 2, one, two)
    cands = [grid(np.where((r + c) % 2 == 0, one, other), np.zeros((N, N))), grid(brick, np.zeros((N, N)))]
    choices = [sym_for_value(gtype, x) for x in range(1, 5)]
    return plateau_search(fi_batch, best_of(fi_ord, cands, p, gtype), p, gtype, layers=("symbol",),
                          sym_choices=choices)


FILLOMINO = mk(
    id="fillomino", name="Fillomino", theme="A 3 lives in a group of three",
    requires=req("Valued"), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("A group is a patch of touching cells with the same symbol. Every cell whose group has exactly "
                           "as many cells as its number scores a point."),
    ordinal=fi_ord, batch=fi_batch, exemplar=fi_exemplar,
    source="arith cross-lens idea 'region size = symbol value (Fillomino)'")


# --- Colour–Value Ladder (arith/col idea) ----------------------------------------------------------------------------
def cv_ord(g, p, gtype):
    N = gtype.N
    v, col = gtype.value[g.sym].tolist(), g.col.tolist()
    s = 0
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N:
                    dv, dc = v[r2][c2] - v[r][c], col[r2][c2] - col[r][c]
                    s += (dv > 0) == (dc > 0) and (dv < 0) == (dc < 0)
    return s


def cv_batch(sym, col, p, gtype):
    v, c = vals(sym, gtype), col.astype(np.int64)
    s = 0
    for a, b in (((slice(None), slice(None), slice(1, None)), (slice(None), slice(None), slice(None, -1))),
                 ((slice(None), slice(1, None), slice(None)), (slice(None), slice(None, -1), slice(None)))):
        s = s + (np.sign(v[a] - v[b]) == np.sign(c[a] - c[b])).sum((1, 2))
    return s


COLOUR_VALUE_LADDER = mk(
    id="colour_value_ladder", name="Colour Ladder", theme="Bigger numbers wear later rainbow colours",
    requires=req("Valued", "Spectral"), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("For every pair of touching cells: if one number is bigger, its colour should come later in the "
                           f"rainbow ({', '.join(gt.colour_names)}); if the numbers are equal, the colours should match. "
                           "Each pair that agrees scores a point."),
    ordinal=cv_ord, batch=cv_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="arith 'colour-value ladder' / col 'gradients by value' cross-lens ideas")


FAMILIES = [STRAIGHT_SHOOTER, NUMBER_BONDS, MAGIC_ACCOUNTANT, ROUND_NUMBERS, KING_OF_THE_HILL, DIVISIBILITY,
            NUMBER_SANDWICH, MAGIC_WINDOW, TIMES_TABLE, ODDS_EVENS, NUMBER_PAINTER, ROBIN_HOOD, SEESAW,
            STEPPING_STONES, COLUMN_ADDITION, LADDER, SNAP, YOUNG_TABLEAU, FILLOMINO, COLOUR_VALUE_LADDER]
