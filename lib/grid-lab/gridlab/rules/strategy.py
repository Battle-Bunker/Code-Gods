"""Strategy-lens rules (strategy.md), plus its cross-lens ideas, in ordinal form."""
from __future__ import annotations

from functools import lru_cache

from ._util import *  # noqa: F401,F403
from ._util import unorient, rim_mask, multi_climb
from .seeds import tok_tail_factory


def _dir_canon(p, key="dir", to="→"):
    q = dict(p)
    q[key] = to
    return q


# --- Rainbow Road (lines, wrap by convention) ----------------------------------------------------
def rr_ord(g, p, gtype):
    N, C = gtype.N, gtype.C
    a = orient(g.col, p["dir"]).tolist()
    lines = pairs = 0
    for row in a:
        good = [(row[i + 1] - row[i]) % C == 1 for i in range(N - 1)]
        lines += all(good)
        pairs += sum(good)
    return tup(lines, pairs)


def rr_batch(sym, col, p, gtype):
    C = gtype.C
    a = orient(col, p["dir"]).astype(np.int64)
    good = (a[:, :, 1:] - a[:, :, :-1]) % C == 1
    return tupb(good.all(2).sum(1), good.sum((1, 2)))


def rr_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(np.zeros((N, N)), unorient((r + c) % gtype.C, p["dir"]))


RAINBOW_ROAD = mk(
    id="rainbow_road", name="Rainbow Road", theme="Rows that march round the rainbow",
    requires=req("Spectral"), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"dir": str(rng.choice(DIRS4))},
    summary=lambda p, gt: (f"Count the lines, read {D4_DIR_NAMES[p['dir']]}, where every colour is the next one round "
                           f"the rainbow ({' → '.join(gt.colour_names)} → {gt.colour_names[0]} again)."),
    ordinal=rr_ord, batch=rr_batch, canonical=lambda p, gt: _dir_canon(p), exemplar=rr_exemplar,
    source="catalog#1 (D1, strat#4 line version; wrap on every Spectral set); tie-breaker = rainbow steps",
    tags={"shortlist"})


# --- Border Baron ---------------------------------------------------------------------------
def bb_ord(g, p, gtype):
    N, K = gtype.N, p["K"]
    col = g.col.tolist()
    rid = [[0] * N for _ in range(N)]
    size = []
    for i, comp in enumerate(comps2d(col, [[True] * N for _ in range(N)])):
        for r, c in comp:
            rid[r][c] = i
        size.append(len(comp))
    score = tb = 0
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N and rid[r][c] != rid[r2][c2]:
                    sa, sb = size[rid[r][c]], size[rid[r2][c2]]
                    score += sa >= K and sb >= K
                    tb += min(sa, sb, K)
    return tup(score, tb)


def bb_batch(sym, col, p, gtype):
    K = p["K"]
    allm = np.ones(col.shape, bool)
    lab = label_batch(col.astype(np.int64), allm)
    size = comp_sum(lab, np.ones(col.shape, np.int64), allm)
    score = np.zeros(len(col), np.int64)
    tb = np.zeros(len(col), np.int64)
    for la, lb_, sa, sb in ((lab[:, :, :-1], lab[:, :, 1:], size[:, :, :-1], size[:, :, 1:]),
                            (lab[:, :-1, :], lab[:, 1:, :], size[:, :-1, :], size[:, 1:, :])):
        d = la != lb_
        score += (d & (sa >= K) & (sb >= K)).sum((1, 2))
        tb += (d * np.minimum(np.minimum(sa, sb), K)).sum((1, 2))
    return tupb(score, tb)


def bb_exemplar(p, gtype):
    N, C = gtype.N, gtype.C
    r, c = np.indices((N, N))
    z = np.zeros((N, N))
    comb = np.where((r == 0) | ((c % 2 == 0) & (r < N - 1)), 0, 1)
    cands = [grid(z, c % C), grid(z, (c // 2) % C), grid(z, comb), grid(z, (c >= N // 2).astype(int))]
    return multi_climb(bb_batch, cands, p, gtype, restarts=3)


BORDER_BARON = mk(
    id="border_baron", name="Border Baron", theme="Long borders between big countries",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"K": int(rng.choice([gt.N - 1, gt.N, 2 * gt.N - 2]))},
    summary=lambda p, gt: (f"A country is a patch of touching cells of one colour. Countries of {p['K']} or more cells "
                           "are big. Score a point for every edge where two big countries touch."),
    ordinal=bb_ord, batch=bb_batch, exemplar=bb_exemplar,
    source="catalog#2 (strat#1); tie-breaker = Σ min(size_a, size_b, K) over country borders", tags={"shortlist"})


# --- Conqueror (and Colour Tug-of-War weight) ------------------------------------------------
def cq_w(sym, gtype, weight):
    return vals(sym, gtype) if weight == "value" else np.ones(sym.shape, np.int64)


def cq_ord(g, p, gtype):
    w = gtype.value[g.sym].ravel().tolist() if p["weight"] == "value" else [1] * gtype.N ** 2
    return sum(x * ((c == p["A"]) - (c == p["B"])) for x, c in zip(w, g.col.ravel().tolist()))


def cq_batch(sym, col, p, gtype):
    w = cq_w(sym, gtype, p["weight"])
    return (w * ((col == p["A"]).astype(np.int64) - (col == p["B"]))).sum((1, 2))


@lru_cache(maxsize=None)
def _cq_dist(weight, gtype):
    C = gtype.C
    cell: dict[int, float] = {}
    if weight == "value":
        vs, cnt = np.unique(gtype.value, return_counts=True)
        for v, k in zip(vs.tolist(), cnt.tolist()):
            q = k / gtype.S
            for s, pr in ((v, q / C), (-v, q / C), (0, q * (1 - 2 / C))):
                cell[s] = cell.get(s, 0.0) + pr
    else:
        cell = {1: 1 / C, -1: 1 / C, 0: 1 - 2 / C}
    return dist_conv([cell] * gtype.N ** 2)


CONQUEROR = mk(
    id="conqueror", name="Conqueror", theme="Your army against your enemy",
    requires=req("Valued"), layers={"colour", "symbol"}, camp="clumper",
    sample=lambda rng, gt: dict(zip(("A", "B"), colours(rng, gt, 2)), weight=str(rng.choice(["one", "value"]))),
    summary=lambda p, gt: (f"{cname(gt, p['A']).capitalize()} is your army and {cname(gt, p['B'])} your enemy. Score = "
                           + ("how many army cells minus how many enemy cells." if p["weight"] == "one" else
                              "the total of the army's numbers minus the total of the enemy's numbers.")),
    ordinal=cq_ord, batch=cq_batch, canonical=lambda p, gt: recolour(p, ["A", "B"]),
    exact_log2_tail=lambda t, p, gt: log2_dist_tail(*_cq_dist(p["weight"], gt), int(t)),
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), sym_for_value(gt, vmax(gt))), np.full((gt.N, gt.N), p["A"])),
    source="catalog#5 (D6: strat#3 + arith#9 Tug-of-War as weight=value)", tags={"shortlist"})


# --- Parity Painter ---------------------------------------------------------------------------
def pp_cls(sym, gtype, key):
    if key == "suit":
        s = gtype.suit[sym]
        return (s == 1) | (s == 2)  # red suits wear P
    return gtype.value[sym] % 2 == 0  # even values wear P


def pp_ord(g, p, gtype):
    cls = pp_cls(g.sym, gtype, p["key"]).ravel().tolist()
    tot = 0
    for k, c in zip(cls, g.col.ravel().tolist()):
        want, other = (p["P"], p["Q"]) if k else (p["Q"], p["P"])
        tot += 1 if c == want else -1 if c == other else 0
    return tot


def pp_batch(sym, col, p, gtype):
    cls = pp_cls(sym, gtype, p["key"])
    want = np.where(cls, p["P"], p["Q"])
    other = np.where(cls, p["Q"], p["P"])
    return ((col == want).astype(np.int64) - (col == other)).sum((1, 2))


def pp_tail(t, p, gtype):
    C = gtype.C
    return log2_dist_tail(*_pp_dist(gtype.N ** 2, C), int(t))


@lru_cache(maxsize=None)
def _pp_dist(n, C):
    return dist_conv([{1: 1 / C, -1: 1 / C, 0: 1 - 2 / C}] * n)


def pp_exemplar(p, gtype):
    N = gtype.N
    sym = (np.arange(N * N).reshape(N, N) * 7) % gtype.S
    cls = pp_cls(sym, gtype, p["key"])
    return grid(sym, np.where(cls, p["P"], p["Q"]))


PARITY_PAINTER = mk(
    id="parity_painter", name="Parity Painter", theme="Numbers wear the colour of their kind",
    requires=req("Valued"), layers={"colour", "symbol"}, camp="neutral",
    sample=lambda rng, gt: dict(zip(("P", "Q"), colours(rng, gt, 2)),
                                key="suit" if gt.suit is not None and rng.random() < 0.5 else "parity"),
    summary=lambda p, gt: ((f"Even numbers should wear {cname(gt, p['P'])} and odd numbers {cname(gt, p['Q'])}. "
                            if p["key"] == "parity" else
                            f"Red suits (♥♦) should wear {cname(gt, p['P'])} and black suits (♠♣) {cname(gt, p['Q'])}. ")
                           + "+1 for each cell dressed right, -1 for each wearing the other one's colour."),
    ordinal=pp_ord, batch=pp_batch, canonical=lambda p, gt: recolour(p, ["P", "Q"]),
    exact_log2_tail=pp_tail, exemplar=pp_exemplar,
    source="catalog#8 (D13: strat#10 ±1 scoring; strat's Suited key as key=suit)", tags={"shortlist"})


# --- Mirrormancer --------------------------------------------------------------------------------
def _layer(g_sym, g_col, gtype, layer):
    return g_col.astype(np.int64) if layer == "colour" else rank_key(g_sym, gtype)


def mm_ord(g, p, gtype):
    N = gtype.N
    a = _layer(g.sym, g.col, gtype, p["layer"])
    a = (a if p["axis"] == "LR" else a.T).tolist()
    lines = pairs = 0
    for row in a:
        m = [row[i] == row[N - 1 - i] for i in range(N // 2)]
        lines += all(m)
        pairs += sum(m)
    return tup(lines, pairs)


def mm_batch(sym, col, p, gtype):
    N = gtype.N
    a = _layer(sym, col, gtype, p["layer"])
    if p["axis"] == "TB":
        a = np.swapaxes(a, 1, 2)
    m = a[:, :, :N // 2] == a[:, :, ::-1][:, :, :N // 2]
    return tupb(m.all(2).sum(1), m.sum((1, 2)))


MIRRORMANCER = mk(
    id="mirrormancer", name="Mirrormancer", theme="Lines that read the same both ways",
    requires=req(), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"axis": str(rng.choice(["LR", "TB"])), "layer": str(rng.choice(["colour", "symbol"]))},
    summary=lambda p, gt: (f"Count the {'rows' if p['axis'] == 'LR' else 'columns'} whose "
                           f"{'colours' if p['layer'] == 'colour' else 'symbols'} read the same forwards and backwards."),
    ordinal=mm_ord, batch=mm_batch, canonical=lambda p, gt: _dir_canon(p, "axis", "LR"),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="catalog#15 (D9 lines; cards compare rank); tie-breaker = matching mirror pairs", tags={"shortlist"})


# --- Homebody ------------------------------------------------------------------------------------
def _zone(N, z):
    rim = rim_mask(N)
    return rim if z == "rim" else ~rim


def hb_ord(g, p, gtype):
    Z = _zone(gtype.N, p["zone"]).ravel().tolist()
    return sum((1 if z else -1) for z, c in zip(Z, g.col.ravel().tolist()) if c == p["X"])


def hb_batch(sym, col, p, gtype):
    Z = _zone(gtype.N, p["zone"])
    X = col == p["X"]
    return (X & Z).sum((1, 2)) - (X & ~Z).sum((1, 2))


@lru_cache(maxsize=None)
def _hb_dist(n_in, n_out, C):
    q = 1 / C
    return dist_conv([{1: q, 0: 1 - q}] * n_in + [{-1: q, 0: 1 - q}] * n_out)


def hb_tail(t, p, gtype):
    Z = _zone(gtype.N, p["zone"])
    return log2_dist_tail(*_hb_dist(int(Z.sum()), int((~Z).sum()), gtype.C), int(t))


HOMEBODY = mk(
    id="homebody", name="Homebody", theme="Your colour belongs at home",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"X": colour(rng, gt), "zone": str(rng.choice(["core", "rim"]))},
    summary=lambda p, gt: (f"{cname(gt, p['X']).capitalize()} belongs "
                           f"{'on the outside edge' if p['zone'] == 'rim' else 'in the middle (away from the edge)'}. "
                           f"+1 for each {cname(gt, p['X'])} cell at home, -1 for each one that wandered off."),
    ordinal=hb_ord, batch=hb_batch, canonical=lambda p, gt: recolour(p, ["X"]), exact_log2_tail=hb_tail,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)),
                                np.where(_zone(gt.N, p["zone"]), p["X"], (p["X"] + 1) % gt.C)),
    source="catalog#16 (D5: strat#2; Fence Painter = zone rim)", tags={"shortlist"})


# --- Lone Peak --------------------------------------------------------------------------------------
def lp_ord(g, p, gtype):
    v = gtype.value[g.sym].ravel().tolist()
    c = g.col.ravel().tolist()
    m1 = max(v)
    tops = [i for i, x in enumerate(v) if x == m1]
    score = 0
    if len(tops) == 1 and c[tops[0]] == p["X"]:
        score = m1 - max(x for i, x in enumerate(v) if i != tops[0])
    has = any(c[i] == p["X"] for i in tops)
    return tup(score, int(has))


def lp_batch(sym, col, p, gtype):
    B = len(sym)
    v = vals(sym, gtype).reshape(B, -1)
    c = col.reshape(B, -1)
    srt = np.sort(v, axis=1)
    m1, m2 = srt[:, -1], srt[:, -2]
    at = v == m1[:, None]
    uniq = at.sum(1) == 1
    xtop = (at & (c == p["X"])).any(1)
    score = np.where(uniq & xtop, m1 - m2, 0)
    return tupb(score, xtop)


def lp_exemplar(p, gtype):
    N = gtype.N
    s = np.full((N, N), sym_for_value(gtype, vmin(gtype)))
    s[N // 2, N // 2] = sym_for_value(gtype, vmax(gtype))
    col = np.full((N, N), (p["X"] + 1) % gtype.C)
    col[N // 2, N // 2] = p["X"]
    return grid(s, col)


def lp_tail(t, p, gtype):
    """Exact μ{(gap, has) >= t} for iid cells: order statistics of the values plus the top cell's colour."""
    g, h = t
    if (g, h) <= (0, 0):
        return 0.0
    n, q = gtype.N ** 2, 1.0 / gtype.C
    vs, cnt = np.unique(gtype.value, return_counts=True)
    pv = {int(v): c / gtype.S for v, c in zip(vs, cnt)}
    F = lambda x: sum(pr for v, pr in pv.items() if v <= x)  # noqa: E731
    if g == 0:  # h == 1: some top cell is your colour (which every gap >= 1 also has)
        tot = sum((F(m - 1) + pm) ** n - (F(m - 1) + pm * (1 - q)) ** n for m, pm in pv.items())
    else:       # a unique top of your colour standing at least g above the rest
        tot = sum(n * q * pm * F(m - g) ** (n - 1) for m, pm in pv.items())
    return math.log2(tot) if tot > 0 else float("-inf")


LONE_PEAK = mk(
    id="lone_peak", name="Lone Peak", theme="One mountain towering over everything",
    requires=req("Valued"), layers={"colour", "symbol"}, camp="neutral",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"The biggest number on the grid should be alone and {cname(gt, p['X'])}. Score = how much "
                           "bigger it is than the second biggest. If it is tied or the wrong colour you score 0."),
    ordinal=lp_ord, batch=lp_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=lp_exemplar,
    exact_log2_tail=lp_tail,
    source="catalog#27 (strat#9); tie-breaker = some top cell is your colour", tags={"shortlist"})


# --- Islander -----------------------------------------------------------------------------------------
def isl_ord(g, p, gtype):
    N, X = gtype.N, p["X"]
    col = g.col.tolist()
    isl = iso = 0
    for r in range(N):
        for c in range(N):
            if col[r][c] != X:
                continue
            ns = [col[a][b] for a, b in nbrs4(N, r, c)]
            iso += X not in ns
            isl += ns[0] != X and all(y == ns[0] for y in ns)
    return tup(isl, iso)


def _nbr_stack(col, fill=255):
    return [shift(col, dr, dc, fill) for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1))]


def isl_batch(sym, col, p, gtype):
    X = p["X"]
    nb = [x.astype(np.int64) for x in _nbr_stack(col.astype(np.int64), -1)]
    first = np.where(nb[0] >= 0, nb[0], np.where(nb[1] >= 0, nb[1], nb[2]))  # every cell has >= 2 neighbours
    same = np.ones(col.shape, bool)
    anyx = np.zeros(col.shape, bool)
    for x in nb:
        same &= (x < 0) | (x == first)
        anyx |= x == X
    isX = col == X
    return tupb((isX & same & (first != X)).sum((1, 2)), (isX & ~anyx).sum((1, 2)))


def isl_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(np.zeros((N, N)), np.where((r + c) % 2 == 0, p["X"], (p["X"] + 1) % gtype.C))


ISLANDER = mk(
    id="islander", name="Islander", theme="Polka dots in a one-colour sea",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"A {cname(gt, p['X'])} cell whose neighbours are all one other colour is an island. "
                           "Count your islands."),
    ordinal=isl_ord, batch=isl_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=isl_exemplar,
    source="strat#6 (catalog D2 'dots'); tie-breaker = your cells with no same-colour neighbour")


# --- Rook's Watch ------------------------------------------------------------------------------------
def rw_ord(g, p, gtype):
    N = gtype.N
    s, c = g.sym.tolist(), g.col.tolist()
    tr, tc, hr, hc = set(), set(), set(), set()
    for r in range(N):
        for k in range(N):
            ms, mc = s[r][k] == p["S"], c[r][k] == p["X"]
            if ms and mc:
                tr.add(r); tc.add(k)
            elif ms or mc:
                hr.add(r); hc.add(k)
    return tup(len(tr) + len(tc), len(hr) + len(hc))


def rw_batch(sym, col, p, gtype):
    ms, mc = sym == p["S"], col == p["X"]
    tok, half = ms & mc, ms ^ mc
    cov = tok.any(2).sum(1) + tok.any(1).sum(1)
    hcov = half.any(2).sum(1) + half.any(1).sum(1)
    return tupb(cov, hcov)


def rw_exemplar(p, gtype):
    N = gtype.N
    s = np.full((N, N), (p["S"] + 1) % gtype.S)
    np.fill_diagonal(s, p["S"])
    return grid(s, np.full((N, N), p["X"]))


ROOKS_WATCH = mk(
    id="rooks_watch", name="Rook's Watch", theme="One token watching every row and column",
    requires=req(), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"S": int(rng.integers(gt.S)), "X": colour(rng, gt)},
    summary=lambda p, gt: (f"Your token is a {cname(gt, p['X'])} {sglyph(gt, p['S'])}. Score a point for every row and "
                           "every column that has at least one token in it."),
    ordinal=rw_ord, batch=rw_batch, canonical=lambda p, gt: {"S": 0, "X": 0}, exemplar=rw_exemplar,
    source="strat#11 (catalog D8 coverage temperament); tie-breaker = lines holding a half-token")


# --- Picture Frame (all-or-nothing: deliberately no tie-breaker) -----------------------------------
def pf_ord(g, p, gtype):
    N = gtype.N
    col = g.col.tolist()
    return int(all(col[r][c] == p["X"] for r in range(N) for c in range(N)
                   if r in (0, N - 1) or c in (0, N - 1)))


def pf_batch(sym, col, p, gtype):
    rim = rim_mask(gtype.N)
    return ((col == p["X"]) | ~rim).all((1, 2)).astype(np.int64)


def pf_tail(t, p, gtype):
    if t <= 0:
        return 0.0
    if t == 1:
        return -(4 * gtype.N - 4) * math.log2(gtype.C)
    return float("-inf")


PICTURE_FRAME = mk(
    id="picture_frame", name="Picture Frame", theme="A perfect frame, all or nothing",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"You want every edge cell to be {cname(gt, p['X'])}. All or nothing: one wrong edge cell "
                           "and you score zero."),
    ordinal=pf_ord, batch=pf_batch, canonical=lambda p, gt: recolour(p, ["X"]), exact_log2_tail=pf_tail,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["X"])),
    source="strat#12 (catalog D5 all-or-nothing temperament; holdout, so no tie-breaker)")


# --- Staircase Climber ----------------------------------------------------------------------------
def sc_ord(g, p, gtype):
    a = gtype.value[g.sym]
    a = (a if p["dir"] == "→" else a.T).tolist()
    return sum(row[i + 1] == row[i] + 1 for row in a for i in range(gtype.N - 1))


def sc_batch(sym, col, p, gtype):
    a = vals(sym, gtype)
    if p["dir"] == "↓":
        a = np.swapaxes(a, 1, 2)
    return (a[:, :, 1:] == a[:, :, :-1] + 1).sum((1, 2))


def sc_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    v = vmin(gtype) + (c if p["dir"] == "→" else r)
    return grid(np.vectorize(lambda x: sym_for_value(gtype, int(x)))(v), np.zeros((N, N)))


STAIRCASE = mk(
    id="staircase_climber", name="Staircase Climber", theme="Numbers that go up one step at a time",
    requires=req("Valued", "Ranked"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {"dir": str(rng.choice(["→", "↓"]))},
    summary=lambda p, gt: (f"Score a point every time a number is exactly one more than the one "
                           f"{'to its left' if p['dir'] == '→' else 'above it'}."),
    ordinal=sc_ord, batch=sc_batch, canonical=lambda p, gt: _dir_canon(p), exemplar=sc_exemplar,
    source="strat#8 (catalog D11 'pairs' temperament)")


# --- Lucky Token (generalised Seed 3) -------------------------------------------------------------------
def lt_ord(g, p, gtype):
    s, c = g.sym.ravel().tolist(), g.col.ravel().tolist()
    tok = sum(1 for a, b in zip(s, c) if a == p["S"] and b == p["X"])
    half = sum(1 for a, b in zip(s, c) if (a == p["S"]) != (b == p["X"]))
    return tup(tok, half)


def lt_batch(sym, col, p, gtype):
    ms, mc = sym == p["S"], col == p["X"]
    return tupb((ms & mc).sum((1, 2)), (ms ^ mc).sum((1, 2)))


LUCKY_TOKEN = mk(
    id="lucky_token", name="Lucky Token", theme="Collect your lucky token",
    requires=req(), layers={"colour", "symbol"}, camp="clumper",
    sample=lambda rng, gt: {"S": int(rng.integers(gt.S)), "X": colour(rng, gt)},
    summary=lambda p, gt: (f"Count your tokens: cells showing {sglyph(gt, p['S'])} in {cname(gt, p['X'])}. "
                           "A cell with only the right symbol or only the right colour is a small step."),
    ordinal=lt_ord, batch=lt_batch, canonical=lambda p, gt: {"S": 0, "X": 0},
    exact_log2_tail=tok_tail_factory(lambda p, gt: 1.0 / gt.S),
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), p["S"]), np.full((gt.N, gt.N), p["X"])),
    source="catalog D8 / strat 'sample your colour and your symbol'; tie-breaker = half-tokens",
    tags={"generalised-seed"})


# --- Neighbourhood Vote (strat idea) --------------------------------------------------------------
def nv_ord(g, p, gtype):
    N, X = gtype.N, p["X"]
    col = g.col.tolist()
    tot = 0
    for r in range(N):
        for c in range(N):
            cnt = [0] * gtype.C
            for a, b in nbrs4(N, r, c):
                cnt[col[a][b]] += 1
            tot += all(cnt[X] > cnt[k] for k in range(gtype.C) if k != X)
    return tot


def nv_batch(sym, col, p, gtype):
    X = p["X"]
    nb = _nbr_stack(col.astype(np.int64), -1)
    cnt = [sum((x == k).astype(np.int64) for x in nb) for k in range(gtype.C)]
    ok = np.ones(col.shape, bool)
    for k in range(gtype.C):
        if k != X:
            ok &= cnt[X] > cnt[k]
    return ok.sum((1, 2))


NEIGHBOURHOOD_VOTE = mk(
    id="neighbourhood_vote", name="Neighbourhood Vote", theme="Every cell votes with its neighbours",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"Each cell looks at its neighbours and votes for the colour it sees most. Score a point "
                           f"for every cell that votes {cname(gt, p['X'])} (ties don't vote)."),
    ordinal=nv_ord, batch=nv_batch, canonical=lambda p, gt: recolour(p, ["X"]),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["X"])),
    source="strat cross-lens idea 'Neighbourhood vote'")


# --- Far Apart (centroid distance, strat idea) ------------------------------------------------------
CD_Q = 64


def cd_ord(g, p, gtype):
    N = gtype.N
    col = g.col.tolist()
    A = [(r, c) for r in range(N) for c in range(N) if col[r][c] == p["A"]]
    B = [(r, c) for r in range(N) for c in range(N) if col[r][c] == p["B"]]
    if not A or not B:
        return 0
    na, nb = len(A), len(B)
    num = abs(sum(r for r, _ in A) * nb - sum(r for r, _ in B) * na) + abs(sum(c for _, c in A) * nb - sum(c for _, c in B) * na)
    return (num * CD_Q) // (na * nb)


def cd_batch(sym, col, p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    a, b = col == p["A"], col == p["B"]
    na, nb = a.sum((1, 2)), b.sum((1, 2))
    num = (np.abs((a * r).sum((1, 2)) * nb - (b * r).sum((1, 2)) * na)
           + np.abs((a * c).sum((1, 2)) * nb - (b * c).sum((1, 2)) * na))
    den = np.maximum(na * nb, 1)
    return np.where((na > 0) & (nb > 0), (num * CD_Q) // den, 0)


def cd_exemplar(p, gtype):
    N = gtype.N
    other = next(k for k in range(gtype.C) if k not in (p["A"], p["B"]))
    col = np.full((N, N), other)
    col[0, 0], col[N - 1, N - 1] = p["A"], p["B"]
    return grid(np.zeros((N, N)), col)


FAR_APART = mk(
    id="far_apart", name="Far Apart", theme="Keep two colours as far apart as possible",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: dict(zip(("A", "B"), colours(rng, gt, 2))),
    summary=lambda p, gt: (f"Find the middle of all the {cname(gt, p['A'])} cells and the middle of all the "
                           f"{cname(gt, p['B'])} cells. The further apart (in steps across plus steps down), the better."),
    ordinal=cd_ord, batch=cd_batch, canonical=lambda p, gt: recolour(p, ["A", "B"]), exemplar=cd_exemplar,
    source="strat cross-lens idea 'Distance between centroids' (Manhattan, ×64 floored to an int)")


FAMILIES = [RAINBOW_ROAD, BORDER_BARON, CONQUEROR, PARITY_PAINTER, MIRRORMANCER, HOMEBODY, LONE_PEAK, ISLANDER,
            ROOKS_WATCH, PICTURE_FRAME, STAIRCASE, LUCKY_TOKEN, NEIGHBOURHOOD_VOTE, FAR_APART]
