"""Games-kids-know lens rules (games.md), plus its cross-lens ideas, in ordinal form.

games.md convention: `suit` is the printed suit in card grid types and the cell's colour otherwise.
"""
from __future__ import annotations

from functools import lru_cache

from ._util import *  # noqa: F401,F403
from ._util import multi_climb, plateau_search

DIRS2 = [(0, 1), (1, 0)]
DIRS4D = [(0, 1), (1, 0), (1, 1), (1, -1)]


def _cells_in(N, r, c):
    return 0 <= r < N and 0 <= c < N


def _sg(gtype, v):
    return np.vectorize(lambda x: sym_for_value(gtype, int(x)))(np.asarray(v))


# --- Rummy Melder ------------------------------------------------------------------------------------
def rm_ord(g, p, gtype):
    N = gtype.N
    tr = (lambda a: a) if p["dir"] == "rows" else (lambda a: a.T)
    rk, v = tr(rank_key(g.sym, gtype)).tolist(), tr(vals(g.sym, gtype)).tolist()
    su = tr(suits(g.sym, g.col, gtype)).tolist()
    score = half = 0
    for r in range(N):
        mel = [False] * N
        for i in range(N - 2):
            a, b, c = range(i, i + 3)
            st = rk[r][a] == rk[r][b] == rk[r][c] and len({su[r][a], su[r][b], su[r][c]}) == 3
            rn = v[r][b] == v[r][a] + 1 and v[r][c] == v[r][b] + 1 and su[r][a] == su[r][b] == su[r][c]
            if st or rn:
                mel[a] = mel[b] = mel[c] = True
        score += sum(v[r][i] for i in range(N) if mel[i])
        for i in range(N - 1):
            half += (rk[r][i] == rk[r][i + 1] and su[r][i] != su[r][i + 1]) or \
                    (v[r][i + 1] == v[r][i] + 1 and su[r][i] == su[r][i + 1])
    return lex((score, N * N * vmax(gtype) + 1), (half, N * (N - 1) + 1))


def rm_batch(sym, col, p, gtype):
    N = gtype.N
    rk, v, su = (lines_rc(x, p["dir"]) for x in (rank_key(sym, gtype), vals(sym, gtype), suits(sym, col, gtype)))
    a, b, c = (slice(0, N - 2), slice(1, N - 1), slice(2, N))
    st = (rk[:, :, a] == rk[:, :, b]) & (rk[:, :, b] == rk[:, :, c]) & (su[:, :, a] != su[:, :, b]) \
        & (su[:, :, b] != su[:, :, c]) & (su[:, :, a] != su[:, :, c])
    rn = (v[:, :, b] == v[:, :, a] + 1) & (v[:, :, c] == v[:, :, b] + 1) & (su[:, :, a] == su[:, :, b]) & (su[:, :, b] == su[:, :, c])
    w = st | rn
    mel = np.zeros(v.shape, bool)
    for k in range(3):
        mel[:, :, k:k + N - 2] |= w
    half = ((rk[:, :, 1:] == rk[:, :, :-1]) & (su[:, :, 1:] != su[:, :, :-1])) | \
           ((v[:, :, 1:] == v[:, :, :-1] + 1) & (su[:, :, 1:] == su[:, :, :-1]))
    return lexb(((v * mel).sum((1, 2)), N * N * vmax(gtype) + 1), (half.sum((1, 2)), N * (N - 1) + 1))


def rm_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    pos = c if p["dir"] == "rows" else r
    if gtype.suit is not None:
        return grid((pos % 4) * 13 + 12, np.zeros((N, N)))
    return grid(np.full((N, N), vmax(gtype)), pos % gtype.C)


RUMMY_MELDER = mk(
    id="rummy_melder", name="Rummy Melder", theme="Sets and runs, like rummy",
    requires=req("Valued", "Ranked"), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"dir": str(rng.choice(LINE_AXES))},
    summary=lambda p, gt: (f"Look at every 3 cells in a {'row' if p['dir'] == 'rows' else 'column'}. Three of the same "
                           f"number in three different {'suits' if gt.symbols == 'cards' else 'colours'} is a set; three "
                           f"counting up in one {'suit' if gt.symbols == 'cards' else 'colour'} is a run. Every cell in a "
                           "set or run scores its number."),
    ordinal=rm_ord, batch=rm_batch, canonical=lambda p, gt: {"dir": "rows"}, exemplar=rm_exemplar,
    source="catalog#3 (games#4; suits = colours outside cards); tie-breaker = half-melds (adjacent pairs)",
    tags={"shortlist"})


# --- Othello Sandwich (gap-1) ----------------------------------------------------------------------------
def os_ord(g, p, gtype):
    N, X = gtype.N, p["X"]
    col = g.col.tolist()
    s = 0
    for dr, dc in (DIRS4D if p["diag"] else DIRS2):
        for r in range(N):
            for c in range(N):
                r2, c2 = r + 2 * dr, c + 2 * dc
                if _cells_in(N, r2, c2) and col[r][c] == X and col[r + dr][c + dc] != X and col[r2][c2] == X:
                    s += 1
    return s


def os_batch(sym, col, p, gtype):
    X = col == p["X"]
    s = 0
    for dr, dc in (DIRS4D if p["diag"] else DIRS2):
        nx = ~shift(X, dr, dc, True)
        s = s + (X & nx & shift(X, 2 * dr, 2 * dc, False)).sum((1, 2))
    return s


def os_exemplar(p, gtype):
    N, X = gtype.N, p["X"]
    o = (X + 1) % gtype.C
    r, c = np.indices((N, N))
    z = np.zeros((N, N))
    cands = [grid(z, np.where((r + c) % 2 == 0, X, o)), grid(z, np.where(c % 2 == 0, X, o)),
             grid(z, np.where((r % 2 == 0) | (c % 2 == 0), X, o))]
    g = multi_climb(os_batch, [best_of(os_ord, cands, p, gtype)], p, gtype, restarts=3)
    return plateau_search(os_batch, g, p, gtype)


OTHELLO = mk(
    id="othello_sandwich", name="Othello Sandwich", theme="Capture cells between two of yours",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt), "diag": bool(rng.random() < 0.5)},
    summary=lambda p, gt: (f"Every single cell of another colour trapped between two {cname(gt, p['X'])} cells in a line "
                           f"(across or down{', or diagonally' if p['diag'] else ''}) is captured: one point each."),
    ordinal=os_ord, batch=os_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=os_exemplar,
    source="catalog#7 (games#7 with the catalog fix: exactly one cell between)", tags={"shortlist"})


# --- Honest Minesweeper ---------------------------------------------------------------------------------
def ms_ord(g, p, gtype):
    N, X = gtype.N, p["X"]
    col, v = g.col.tolist(), gtype.value[g.sym].tolist()
    s = 0
    for r in range(N):
        for c in range(N):
            if col[r][c] == X:
                continue
            m = sum(col[a][b] == X for a, b in nbrs8(N, r, c))
            s += v[r][c] if v[r][c] == m else 0
    return s


def _count8(mask):
    return sum(shift(mask, dr, dc, False).astype(np.int64) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc)


def ms_batch(sym, col, p, gtype):
    X = col == p["X"]
    m = _count8(X)
    v = vals(sym, gtype)
    return (v * (~X & (v == m))).sum((1, 2))


def ms_exemplar(p, gtype):
    N, X = gtype.N, p["X"]
    o = (X + 1) % gtype.C
    r, c = np.indices((N, N))
    have = set(gtype.value.tolist())
    cands = []
    for mine in ((r % 2 == 0), (c % 2 == 0), (r % 2 == 1), ((r + c) % 2 == 0), ((r % 2 == 0) & (c % 2 == 0)),
                 ((r % 3 == 1) & (c % 3 == 1)), ((r % 3 != 1) | (c % 3 != 1))):
        cnt = _count8(mine[None])[0]
        v = np.where(np.isin(cnt, list(have)), cnt, vmax(gtype))
        cands.append(grid(_sg(gtype, v), np.where(mine, X, o)))
    return best_of(ms_ord, cands, p, gtype)


MINESWEEPER = mk(
    id="honest_minesweeper", name="Honest Minesweeper", theme="Numbers that count the mines around them",
    requires=req("Valued"), layers={"colour", "symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"Your {cname(gt, p['X'])} cells are mines. Every other cell whose number says exactly how many "
                           "mines touch it (corners too) scores that number."),
    ordinal=ms_ord, batch=ms_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=ms_exemplar,
    source="catalog#20 (games#9)", tags={"shortlist"})


# --- Bingo Caller -----------------------------------------------------------------------------------------
def _bingo_lines(N):
    L = [[(r, c) for c in range(N)] for r in range(N)] + [[(r, c) for r in range(N)] for c in range(N)]
    return L + [[(i, i) for i in range(N)], [(i, N - 1 - i) for i in range(N)]]


def bi_ord(g, p, gtype):
    N = gtype.N
    k = rank_key(g.sym, gtype).tolist()
    called = set(p["called"])
    dab = [[k[r][c] in called or (N % 2 == 1 and r == c == N // 2) for c in range(N)] for r in range(N)]
    return sum(map(sum, dab)) + N * sum(all(dab[r][c] for r, c in ln) for ln in _bingo_lines(N))


def bi_batch(sym, col, p, gtype):
    N = gtype.N
    dab = np.isin(rank_key(sym, gtype), p["called"])
    if N % 2:
        dab[:, N // 2, N // 2] = True
    lines = dab.all(2).sum(1) + dab.all(1).sum(1) + np.diagonal(dab, axis1=1, axis2=2).all(1) \
        + np.diagonal(dab[:, :, ::-1], axis1=1, axis2=2).all(1)
    return dab.sum((1, 2)) + N * lines


def bi_sample(rng, gtype):
    k = -(-gtype.ranks // 3)
    return {"called": sorted(int(x) for x in rng.choice(gtype.ranks, k, replace=False))}


BINGO = mk(
    id="bingo_caller", name="Bingo Caller", theme="Dab your called numbers",
    requires=req(), layers={"symbol", "position"}, camp="neutral",
    sample=bi_sample,
    summary=lambda p, gt: ("Your called numbers are " + ", ".join(sglyph(gt, s) for s in p["called"])
                           + (" (any suit)" if gt.symbols == "cards" else "") + ". Dab every cell showing one"
                           + (" (the centre is a free space)" if gt.N % 2 else "")
                           + f". Each dab is a point; a full row, column or long diagonal is BINGO for {gt.N} more."),
    ordinal=bi_ord, batch=bi_batch, canonical=lambda p, gt: {"called": list(range(len(p["called"])))},
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), p["called"][0]), np.zeros((gt.N, gt.N))),
    source="catalog#21 (games#11; cards call ranks)", tags={"shortlist"})


# --- Sudoku Scholar ---------------------------------------------------------------------------------------
def su_ord(g, p, gtype):
    N = gtype.N
    k = rank_key(g.sym, gtype).tolist()
    if N <= 4:
        return int(all(len({k[r][c] for r, c in ln}) == N for ln in _bingo_lines(N)))
    ls = [list(r) for r in k] if p["dir"] != "cols" else []
    if p["dir"] != "rows":
        ls += [[k[r][c] for r in range(N)] for c in range(N)]
    ok = sum(len(set(l)) == N for l in ls)
    return lex((ok, 2 * N + 1), (sum(len(set(l)) for l in ls), 2 * N * N + 1))


def _distinct(L):
    s = np.sort(L, axis=-1)
    return 1 + (s[..., 1:] != s[..., :-1]).sum(-1)


def su_batch(sym, col, p, gtype):
    N = gtype.N
    k = rank_key(sym, gtype)
    if N <= 4:
        L = np.concatenate([k, np.swapaxes(k, 1, 2), np.diagonal(k, axis1=1, axis2=2)[:, None],
                            np.diagonal(k[:, :, ::-1], axis1=1, axis2=2)[:, None]], axis=1)
        return (_distinct(L) == N).all(1).astype(np.int64)
    d = _distinct(lines_rc(k, p["dir"]))
    return lexb(((d == N).sum(1), 2 * N + 1), (d.sum(1), 2 * N * N + 1))


def su_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    if N == 3:
        k = r * 3 + c
    elif N == 4:
        k = np.array([[0, 1, 2, 3], [2, 3, 0, 1], [3, 2, 1, 0], [1, 0, 3, 2]])
    else:
        k = (r + c) % N
    return grid(k, np.zeros((N, N)))


SUDOKU = mk(
    id="sudoku_scholar", name="Sudoku Scholar", theme="No number twice in a line",
    requires=req(), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"dir": str(rng.choice(["rows", "cols", "both"]))},
    summary=lambda p, gt: (("All or nothing: you score only if no number appears twice in any row, column or long "
                            "diagonal." if gt.N <= 4 else
                            "Score a point for every " + {"rows": "row", "cols": "column", "both": "row and column"}[p["dir"]]
                            + " where no number appears twice; more different numbers is better.")
                           + (" Cards compare rank only." if gt.symbols == "cards" else "")),
    ordinal=su_ord, batch=su_batch,
    canonical=lambda p, gt: {"dir": "both" if gt.N <= 4 or p["dir"] == "both" else "rows"},
    exemplar=su_exemplar,
    source="catalog#22 (games#10; N<=4 all-or-nothing over rows, cols and diagonals: no tie-breaker; "
           "N>=5 Latin bonus is monotone so dropped; tie-breaker = distinct symbols per line)", tags={"shortlist"})


# --- Full House ---------------------------------------------------------------------------------------------
def fh_ord(g, p, gtype):
    k = rank_key(g.sym, gtype)
    s = 0
    for ln in (k if p["dir"] == "rows" else k.T).tolist():
        for x in set(ln):
            n = ln.count(x)
            s += n * (n - 1) // 2
    return s


def fh_batch(sym, col, p, gtype):
    N = gtype.N
    L = lines_rc(rank_key(sym, gtype), p["dir"])
    s = 0
    for i in range(N):
        for j in range(i + 1, N):
            s = s + (L[:, :, i] == L[:, :, j]).sum(1)
    return s


FULL_HOUSE = mk(
    id="full_house", name="Full House", theme="Rows read like poker hands",
    requires=req(), layers={"symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"dir": str(rng.choice(LINE_AXES))},
    summary=lambda p, gt: (f"Read each {'row' if p['dir'] == 'rows' else 'column'} like a poker hand. Every pair of "
                           "matching numbers in it scores a point (three of a kind = 3, four of a kind = 6)."),
    ordinal=fh_ord, batch=fh_batch, canonical=lambda p, gt: {"dir": "rows"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="catalog#23 (games#1)", tags={"shortlist"})


# --- Flush Royale -------------------------------------------------------------------------------------------
def fl_ord(g, p, gtype):
    N = gtype.N
    su, v = suits(g.sym, g.col, gtype), vals(g.sym, gtype)
    score = plur = 0
    for ls, lv in zip(su.tolist() + su.T.tolist(), v.tolist() + v.T.tolist()):
        plur += max(ls.count(x) for x in ls)
        if len(set(ls)) == 1:
            straight = len(set(lv)) == N and max(lv) - min(lv) == N - 1
            score += sum(lv) * (3 if straight else 1)
    return lex((score, 6 * N * N * vmax(gtype) + 1), (plur, 2 * N * N + 1))


def fl_batch(sym, col, p, gtype):
    N = gtype.N
    su, v = lines_rc(suits(sym, col, gtype), "both"), lines_rc(vals(sym, gtype), "both")
    flush = (su == su[:, :, :1]).all(2)
    straight = (_distinct(v) == N) & (v.max(2) - v.min(2) == N - 1)
    score = (flush * v.sum(2) * np.where(straight, 3, 1)).sum(1)
    K = 4 if gtype.suit is not None else gtype.C
    plur = np.max(np.stack([(su == k).sum(2) for k in range(K)]), axis=0).sum(1)
    return lexb((score, 6 * N * N * vmax(gtype) + 1), (plur, 2 * N * N + 1))


def fl_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    hi = vmax(gtype)
    v1 = (hi - N + 1) + (r + c) % N
    return best_of(fl_ord, [grid(_sg(gtype, v1), np.zeros((N, N))),
                            grid(np.full((N, N), sym_for_value(gtype, hi)), np.zeros((N, N)))], p, gtype)


FLUSH_ROYALE = mk(
    id="flush_royale", name="Flush Royale", theme="Lines all in one suit",
    requires=req("Valued", "Ranked"), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: (f"A row or column whose cells are all one {'suit' if gt.symbols == 'cards' else 'colour'} is a "
                           "flush and scores the total of its numbers; if its numbers are also a straight (all in a run, "
                           "any order) it scores triple."),
    ordinal=fl_ord, batch=fl_batch, exemplar=fl_exemplar,
    source="games#2 (catalog D7 'whole lines' kept as its own family); tie-breaker = Σ per-line suit plurality")


# --- Twenty-One ---------------------------------------------------------------------------------------------
def _bj(sym, gtype):
    if gtype.symbols == "cards":
        rk = gtype.rank[sym].astype(np.int64)
        return np.where(rk >= 9, 10, rk + 1), rk == 0
    return vals(sym, gtype), np.zeros(sym.shape, bool)


def tw_ord(g, p, gtype):
    T = p["T"]
    v, ace = _bj(g.sym, gtype)
    s = 0
    for lv, la in zip(v.tolist() + v.T.tolist(), ace.tolist() + ace.T.tolist()):
        t = sum(lv)
        if any(la) and t + 10 <= T:
            t += 10
        if t <= T:
            s += t + (T if t == T else 0)
    return s


def tw_batch(sym, col, p, gtype):
    T = p["T"]
    v, ace = _bj(sym, gtype)
    t = lines_rc(v, "both").sum(2)
    a = lines_rc(ace, "both").any(2)
    t = np.where(a & (t + 10 <= T), t + 10, t)
    return np.where(t <= T, t + np.where(t == T, T, 0), 0).sum(1)


def tw_sample(rng, gtype):
    N = gtype.N
    if gtype.symbols == "cards":
        return {"T": 21}
    return {"T": int(rng.integers(2 * N, round(0.7 * N * (gtype.S - 1)) + 1))}


def tw_exemplar(p, gtype):
    from .arithmetic import base_row, circulant
    N = gtype.N
    if gtype.symbols == "cards":
        v = circulant(base_row(N, p["T"], 2, 10))
        return grid(v - 1, np.zeros((N, N)))
    v = circulant(base_row(N, p["T"], vmin(gtype), vmax(gtype)))
    return grid(v, np.zeros((N, N)))


TWENTY_ONE = mk(
    id="twenty_one", name="Twenty-One", theme="Get close to your target without going bust",
    requires=req("Valued"), layers={"symbol", "position"}, camp="neutral",
    sample=tw_sample,
    summary=lambda p, gt: (f"Each row and column is a blackjack hand: add it up"
                           + (" (J, Q, K count 10; an ace counts 11 unless that busts)" if gt.symbols == "cards" else "")
                           + f". A hand of {p['T']} or less scores its total, exactly {p['T']} scores {p['T']} more, "
                             "and going over scores nothing."),
    ordinal=tw_ord, batch=tw_batch, exemplar=tw_exemplar,
    source="games#5 (cards T=21 with soft ace; number grid types sample T)")


# --- Go Fish Books ------------------------------------------------------------------------------------------
def _nuniq4(a, b, d, e):
    return 1 + (b != a) + ((d != a) & (d != b)) + ((e != a) & (e != b) & (e != d))


def gf_ord(g, p, gtype):
    N, R = gtype.N, p["r"]
    k = rank_key(g.sym, gtype).tolist()
    su = suits(g.sym, g.col, gtype).tolist()
    need = 4 if gtype.suit is not None else min(4, gtype.C)
    score = part = 0
    for r in range(N - 1):
        for c in range(N - 1):
            cells = [(r, c), (r, c + 1), (r + 1, c), (r + 1, c + 1)]
            n = sum(k[x][y] == R for x, y in cells)
            part += n
            if n == 4:
                score += 2 if len({su[x][y] for x, y in cells}) >= need else 1
    return lex((score, 2 * (N - 1) ** 2 + 1), (part, 4 * (N - 1) ** 2 + 1))


def gf_batch(sym, col, p, gtype):
    N = gtype.N
    m = rank_key(sym, gtype) == p["r"]
    su = suits(sym, col, gtype)
    need = 4 if gtype.suit is not None else min(4, gtype.C)
    q = [x[:, :-1, :-1] for x in (m, su)], [x[:, :-1, 1:] for x in (m, su)], \
        [x[:, 1:, :-1] for x in (m, su)], [x[:, 1:, 1:] for x in (m, su)]
    n = q[0][0].astype(np.int64) + q[1][0] + q[2][0] + q[3][0]
    full = n == 4
    nu = _nuniq4(q[0][1], q[1][1], q[2][1], q[3][1])
    score = (full * np.where(nu >= need, 2, 1)).sum((1, 2))
    return lexb((score, 2 * (N - 1) ** 2 + 1), (n.sum((1, 2)), 4 * (N - 1) ** 2 + 1))


def gf_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    if gtype.suit is not None:
        return grid((2 * (r % 2) + c % 2) * 13 + p["r"], np.zeros((N, N)))
    col = 2 * (r % 2) + c % 2 if gtype.C >= 4 else (r + c) % 3
    return grid(np.full((N, N), p["r"]), col)


GO_FISH = mk(
    id="go_fish_books", name="Go Fish Books", theme="2×2 blocks of your fish",
    requires=req(), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"r": int(rng.integers(gt.ranks))},
    summary=lambda p, gt: (f"Your fish is {sglyph(gt, p['r'])}{' (any suit)' if gt.symbols == 'cards' else ''}. Every 2×2 "
                           f"block of four of them is a book (1 point), or a perfect book (2 points) if they are all "
                           f"different {'suits' if gt.symbols == 'cards' else 'colours'}."),
    ordinal=gf_ord, batch=gf_batch, canonical=lambda p, gt: {"r": 0}, exemplar=gf_exemplar,
    source="games#6 (RGB perfect = all 3 colours); tie-breaker = fish cells summed over 2×2 windows")


# --- Set Spotter ------------------------------------------------------------------------------------------------
def st_ord(g, p, gtype):
    N = gtype.N
    col, v = g.col.tolist(), gtype.value[g.sym].tolist()
    s = 0
    for dr, dc in (DIRS4D if p["diag"] else DIRS2):
        for r in range(N):
            for c in range(N):
                r2, c2 = r + 2 * dr, c + 2 * dc
                if not _cells_in(N, r2, c2):
                    continue
                cs = {col[r][c], col[r + dr][c + dc], col[r2][c2]}
                a, b, e = v[r][c], v[r + dr][c + dc], v[r2][c2]
                s += len(cs) != 2 and b - a == e - b
    return s


def st_batch(sym, col, p, gtype):
    N = gtype.N
    v = vals(sym, gtype)
    c = col.astype(np.int64)
    s = 0
    for dr, dc in (DIRS4D if p["diag"] else DIRS2):
        ok = valid(N, 2 * dr, 2 * dc)
        c1, c2 = shift(c, dr, dc, -1), shift(c, 2 * dr, 2 * dc, -2)
        v1, v2 = shift(v, dr, dc, 0), shift(v, 2 * dr, 2 * dc, 0)
        same = (c == c1) & (c1 == c2)
        diff = (c != c1) & (c1 != c2) & (c != c2)
        s = s + (ok & (same | diff) & (v1 - v == v2 - v1)).sum((1, 2))
    return s


SET_SPOTTER = mk(
    id="set_spotter", name="Set Spotter", theme="Three in a line that make a SET",
    requires=req("Valued"), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"diag": bool(rng.random() < 0.5)},
    summary=lambda p, gt: ("Three cells in a line (across or down" + (", or diagonally" if p["diag"] else "")
                           + ") are a SET if their colours are all the same or all different AND their numbers are all "
                             "the same or evenly spaced (like 2, 5, 8). Each SET scores a point."),
    ordinal=st_ord, batch=st_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="games#12")


# --- Knight Riders ------------------------------------------------------------------------------------------------
KN = [(1, 2), (2, 1), (2, -1), (1, -2)]


def kr_ord(g, p, gtype):
    N = gtype.N
    s, c = g.sym.tolist(), g.col.tolist()
    t = 0
    for r in range(N):
        for k in range(N):
            for dr, dc in KN:
                r2, k2 = r + dr, k + dc
                if _cells_in(N, r2, k2) and s[r][k] == s[r2][k2] and c[r][k] == c[r2][k2] \
                        and (p["X"] is None or c[r][k] == p["X"]):
                    t += 1
    return t


def kr_batch(sym, col, p, gtype):
    t = 0
    s16 = sym.astype(np.int64)
    c16 = col.astype(np.int64)
    for dr, dc in KN:
        ok = (s16 == shift(s16, dr, dc, -1)) & (c16 == shift(c16, dr, dc, -1))
        if p["X"] is not None:
            ok &= c16 == p["X"]
        t = t + ok.sum((1, 2))
    return t


KNIGHT_RIDERS = mk(
    id="knight_riders", name="Knight Riders", theme="Twins a knight's jump apart",
    requires=req(), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt) if rng.random() < 0.5 else None},
    summary=lambda p, gt: ("Every pair of cells a chess knight's jump apart that are exact twins (same symbol and same "
                           "colour" + (f", and {cname(gt, p['X'])}" if p["X"] is not None else "") + ") scores a point."),
    ordinal=kr_ord, batch=kr_batch, canonical=lambda p, gt: recolour(p, ["X"]),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["X"] or 0)),
    source="games#13 (full card identity)")


# --- Uno Snake --------------------------------------------------------------------------------------------------
@lru_cache(maxsize=None)
def _snake_order(N, axis):
    out = []
    for i in range(N):
        for j in range(N):
            jj = N - 1 - j if i % 2 else j
            out.append(i * N + jj if axis == "rows" else jj * N + i)
    return np.array(out)


def un_ord(g, p, gtype):
    o = _snake_order(gtype.N, p["axis"]).tolist()
    k, c = rank_key(g.sym, gtype).ravel().tolist(), g.col.ravel().tolist()
    best = run = 1
    for a, b in zip(o, o[1:]):
        run = run + 1 if (c[a] == c[b] or k[a] == k[b]) else 1
        best = max(best, run)
    return best


def un_batch(sym, col, p, gtype):
    o = _snake_order(gtype.N, p["axis"])
    k = rank_key(sym, gtype).reshape(len(sym), -1)[:, o]
    c = col.reshape(len(col), -1)[:, o]
    link = (k[:, 1:] == k[:, :-1]) | (c[:, 1:] == c[:, :-1])
    run = np.ones(len(sym), np.int64)
    best = run.copy()
    for i in range(link.shape[1]):
        run = np.where(link[:, i], run + 1, 1)
        best = np.maximum(best, run)
    return best


UNO_SNAKE = mk(
    id="uno_snake", name="Uno Snake", theme="A zig-zag walk where every step matches",
    requires=req(), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"axis": str(rng.choice(LINE_AXES))},
    summary=lambda p, gt: ("Walk the grid like a Snakes & Ladders board ("
                           + ("left to right, then back, down the rows" if p["axis"] == "rows" else "down, then back up, across the columns")
                           + "). Each step must match the colour or the number, like Uno. Score your longest unbroken walk."),
    ordinal=un_ord, batch=un_batch, canonical=lambda p, gt: {"axis": "rows"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="games#14")


# --- Court Parade -------------------------------------------------------------------------------------------------
def cp_ord(g, p, gtype):
    N = gtype.N
    rk, su, col = gtype.rank[g.sym], gtype.suit[g.sym], g.col
    score = pairs = 0
    for R, S, C in ((rk.tolist(), su.tolist(), col.tolist()), (rk.T.tolist(), su.T.tolist(), col.T.tolist())):
        for r in range(N):
            for i in range(N - 1):
                okp = S[r][i] == S[r][i + 1] and (p["suit"] is None or S[r][i] == p["suit"]) \
                    and (R[r][i], R[r][i + 1]) in ((10, 11), (11, 12))
                pairs += okp
            for i in range(N - 2):
                ok = (R[r][i], R[r][i + 1], R[r][i + 2]) == (10, 11, 12) and S[r][i] == S[r][i + 1] == S[r][i + 2] \
                    and (p["suit"] is None or S[r][i] == p["suit"]) \
                    and (not p["match"] or C[r][i] == C[r][i + 1] == C[r][i + 2])
                if ok:
                    score += 1
                    if i > 0 and R[r][i - 1] == 0 and S[r][i - 1] == S[r][i]:
                        score += 1
    return lex((score, 4 * N * N + 1), (pairs, 2 * N * N + 1))


def cp_batch(sym, col, p, gtype):
    N = gtype.N
    rk, su, c = (lines_rc(x.astype(np.int64), "both") for x in (gtype.rank[sym], gtype.suit[sym], col))
    sp = (lambda x: x == p["suit"]) if p["suit"] is not None else (lambda x: np.ones(x.shape, bool))
    pr = (su[:, :, 1:] == su[:, :, :-1]) & sp(su[:, :, :-1]) & (
        ((rk[:, :, :-1] == 10) & (rk[:, :, 1:] == 11)) | ((rk[:, :, :-1] == 11) & (rk[:, :, 1:] == 12)))
    a, b, d = slice(0, N - 2), slice(1, N - 1), slice(2, N)
    ok = (rk[:, :, a] == 10) & (rk[:, :, b] == 11) & (rk[:, :, d] == 12) & (su[:, :, a] == su[:, :, b]) \
        & (su[:, :, b] == su[:, :, d]) & sp(su[:, :, a])
    if p["match"]:
        ok &= (c[:, :, a] == c[:, :, b]) & (c[:, :, b] == c[:, :, d])
    grand = np.zeros(ok.shape, bool)
    grand[:, :, 1:] = ok[:, :, 1:] & (rk[:, :, :N - 3] == 0) & (su[:, :, :N - 3] == su[:, :, 1:N - 2])
    return lexb((ok.sum((1, 2)) + grand.sum((1, 2)), 4 * N * N + 1), (pr.sum((1, 2)), 2 * N * N + 1))


def cp_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    s = 0 if p["suit"] is None else p["suit"]
    return grid(s * 13 + np.array([0, 10, 11, 12])[(r + c) % 4], np.zeros((N, N)))


COURT_PARADE = mk(
    id="court_parade", name="Court Parade", theme="J, Q, K of one suit marching in a line",
    requires=req("Suited", "Faced"), layers={"symbol", "colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"suit": None if rng.random() < 0.5 else int(rng.integers(4)), "match": bool(rng.random() < 0.3)},
    summary=lambda p, gt: ("A Jack, Queen and King of the same suit"
                           + (f" ({'♠♥♦♣'[p['suit']]})" if p["suit"] is not None else "")
                           + " standing in that order (left to right or top to bottom)"
                           + (" and all one colour" if p["match"] else "")
                           + " is a parade; with its Ace just before the Jack it's a grand parade worth double."),
    ordinal=cp_ord, batch=cp_batch,
    canonical=lambda p, gt: {"suit": None if p["suit"] is None else 0, "match": p["match"]},
    exemplar=cp_exemplar,
    source="games#15 (+5 units rescaled to counts); tie-breaker = J→Q / Q→K pairs")


# --- King's Court (games idea) ----------------------------------------------------------------------------------
def kc_ord(g, p, gtype):
    N = gtype.N
    k, col = rank_key(g.sym, gtype).tolist(), g.col.tolist()
    return sum(sum(col[a][b] != col[r][c] for a, b in nbrs8(N, r, c))
               for r in range(N) for c in range(N) if k[r][c] == p["r"])


def kc_batch(sym, col, p, gtype):
    m = rank_key(sym, gtype) == p["r"]
    c = col.astype(np.int64)
    d = sum(((shift(c, dr, dc, -1) != c) & valid(gtype.N, dr, dc)).astype(np.int64)
            for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc)
    return (d * m).sum((1, 2))


def kc_exemplar(p, gtype):
    N, C = gtype.N, gtype.C
    r, c = np.indices((N, N))
    s = np.full((N, N), p["r"])
    cands = [grid(s, x % C) for x in (2 * (r % 2) + c % 2, r + c, r + 2 * c, 2 * r + c)]
    return multi_climb(kc_batch, [best_of(kc_ord, cands, p, gtype)], p, gtype, restarts=0)


KINGS_COURT = mk(
    id="kings_court", name="King's Court", theme="Your symbol surrounded by every other colour",
    requires=req(), layers={"colour", "symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"r": int(rng.integers(gt.ranks))},
    summary=lambda p, gt: (f"Every {sglyph(gt, p['r'])}{' (any suit)' if gt.symbols == 'cards' else ''} scores a point for "
                           "each of its 8 neighbours (corners too) that is a different colour from it."),
    ordinal=kc_ord, batch=kc_batch, canonical=lambda p, gt: {"r": 0}, exemplar=kc_exemplar,
    source="games cross-lens idea 'King's court' (a diagonal-inclusive Seed 2 cousin)")


# --- Connect Four (games idea) --------------------------------------------------------------------------------------
def c4_ord(g, p, gtype):
    N = gtype.N
    col = g.col.tolist()
    sup = [[all(col[k][c] == p["X"] for k in range(r, N)) for c in range(N)] for r in range(N)]
    w = 0
    for dr, dc in DIRS4D:
        for r in range(N):
            for c in range(N):
                cells = [(r + i * dr, c + i * dc) for i in range(4)]
                if all(_cells_in(N, a, b) and sup[a][b] for a, b in cells):
                    w += 1
    return lex((w, 4 * N * N + 1), (sum(map(sum, sup)), N * N + 1))


def c4_batch(sym, col, p, gtype):
    N = gtype.N
    sup = np.logical_and.accumulate((col == p["X"])[:, ::-1, :], axis=1)[:, ::-1, :]
    w = 0
    for dr, dc in DIRS4D:
        ok = sup.copy()
        for i in range(1, 4):
            ok &= shift(sup, i * dr, i * dc, False)
        w = w + ok.sum((1, 2))
    return lexb((w, 4 * N * N + 1), (sup.sum((1, 2)), N * N + 1))


CONNECT_FOUR = mk(
    id="connect_four", name="Connect Four", theme="Four in a row, stacked from the bottom",
    requires=req(min_size=4), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"Your counters are {cname(gt, p['X'])} and they fall to the bottom: a counter only stands if "
                           f"everything below it is {cname(gt, p['X'])} too. Score every four-in-a-row of standing counters "
                           "(across, down or diagonal)."),
    ordinal=c4_ord, batch=c4_batch, canonical=lambda p, gt: recolour(p, ["X"]),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["X"])),
    source="games cross-lens idea 'Connect Four with gravity'; tie-breaker = standing counters")


FAMILIES = [RUMMY_MELDER, OTHELLO, MINESWEEPER, BINGO, SUDOKU, FULL_HOUSE, FLUSH_ROYALE, TWENTY_ONE, GO_FISH,
            SET_SPOTTER, KNIGHT_RIDERS, UNO_SNAKE, COURT_PARADE, KINGS_COURT, CONNECT_FOUR]
