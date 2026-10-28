"""Colour & visual-pattern lens rules (colour.md), plus its cross-lens ideas, in ordinal form."""
from __future__ import annotations

from ._util import *  # noqa: F401,F403
from ._util import unorient, multi_climb
from .geometry import checker, _seams_scalar, _seams_batch, _recipes, ar_ord  # noqa: F401


def _lines2(a, axis):
    a = a if axis == "rows" else a.T
    return a.tolist()


def _plur(line):
    return max(line.count(x) for x in line)


def _plur_batch(L, C):
    """Per line (B, nl, N) -> plurality count (B, nl)."""
    return np.max(np.stack([(L == k).sum(-1) for k in range(C)]), axis=0)


# --- Stripe Painter (merged with Zebra) --------------------------------------------------------------
def sp_ord(g, p, gtype):
    s, prev, plur = 0, -1, 0
    for ln in _lines2(g.col, p["axis"]):
        solid = len(set(ln)) == 1
        s += solid and ln[0] != prev
        prev = ln[0] if solid else -1
        plur += _plur(ln)
    return tup(s, plur)


def sp_batch(sym, col, p, gtype):
    N = gtype.N
    L = lines_rc(col.astype(np.int64), p["axis"])
    solid = (L == L[:, :, :1]).all(2)
    first = L[:, :, 0]
    s = np.zeros(len(col), np.int64)
    prev = np.full(len(col), -1)
    for i in range(N):
        s += solid[:, i] & (first[:, i] != prev)
        prev = np.where(solid[:, i], first[:, i], -1)
    return tupb(s, _plur_batch(L, gtype.C).sum(1))


def sp_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(np.zeros((N, N)), (r if p["axis"] == "rows" else c) % gtype.C)


STRIPE_PAINTER = mk(
    id="stripe_painter", name="Stripe Painter", theme="A striped flag",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"axis": str(rng.choice(LINE_AXES))},
    summary=lambda p, gt: (f"Every {'row' if p['axis'] == 'rows' else 'column'} painted one solid colour, different from "
                           "the solid stripe next to it, scores a point, like a flag."),
    ordinal=sp_ord, batch=sp_batch, canonical=lambda p, gt: {"axis": "rows"}, exemplar=sp_exemplar,
    source="catalog#17 (D3: col#2 + geo#7 Zebra, col code); tie-breaker = Σ per-line plurality", tags={"shortlist"})


# --- Feuding Families --------------------------------------------------------------------------------
def ff_ord(g, p, gtype):
    N, X, Y = gtype.N, p["X"], p["Y"]
    col = g.col.tolist()
    sx = sy = 0
    for r in range(N):
        for c in range(N):
            ns = [col[a][b] for a, b in nbrs4(N, r, c)]
            sx += col[r][c] == X and Y not in ns
            sy += col[r][c] == Y and X not in ns
    return tup(min(sx, sy), sx + sy)


def _nbr_has(col, k):
    out = np.zeros(col.shape, bool)
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        out |= shift(col, dr, dc, 255) == k
    return out


def ff_batch(sym, col, p, gtype):
    X, Y = p["X"], p["Y"]
    sx = ((col == X) & ~_nbr_has(col, Y)).sum((1, 2))
    sy = ((col == Y) & ~_nbr_has(col, X)).sum((1, 2))
    return tupb(np.minimum(sx, sy), sx + sy)


def ff_exemplar(p, gtype):
    N, X, Y = gtype.N, p["X"], p["Y"]
    Z = next(k for k in range(gtype.C) if k not in (X, Y))
    h = (N - 1) // 2
    r, c = np.indices((N, N))
    col = np.where(r < h, X, np.where(r == h, Z, Y))
    col2 = np.where(r + c < N - 1, X, np.where(r + c == N - 1, Z, Y))
    return multi_climb(ff_batch, [grid(np.zeros((N, N)), col), grid(np.zeros((N, N)), col2)], p, gtype, restarts=0)


FEUDING_FAMILIES = mk(
    id="feuding_families", name="Feuding Families", theme="Two big families that must never touch",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: dict(zip(("X", "Y"), colours(rng, gt, 2))),
    summary=lambda p, gt: (f"You want lots of {cname(gt, p['X'])} and lots of {cname(gt, p['Y'])}, but they must never "
                           "touch. A cell is safe if it doesn't touch the other family; your score is the smaller "
                           "family's safe count."),
    ordinal=ff_ord, batch=ff_batch, canonical=lambda p, gt: recolour(p, ["X", "Y"]), exemplar=ff_exemplar,
    source="catalog#18 (col#11; ×2 dropped); tie-breaker = total safe cells", tags={"shortlist"})


# --- Colour Mixer --------------------------------------------------------------------------------------
def cm_ord(g, p, gtype):
    N, P1, M, P2 = gtype.N, p["P1"], p["M"], p["P2"]
    col = g.col.tolist()
    s = near = 0
    for r in range(N):
        for c in range(N):
            if col[r][c] != M:
                continue
            ns = [col[a][b] for a, b in nbrs4(N, r, c)]
            near += P1 in ns or P2 in ns
            if p["strict"]:
                ok = False
                for (a, b), (x, y) in (((r, c - 1), (r, c + 1)), ((r - 1, c), (r + 1, c))):
                    if 0 <= a < N and 0 <= b < N and 0 <= x < N and 0 <= y < N and {col[a][b], col[x][y]} == {P1, P2}:
                        ok = True
                s += ok
            else:
                s += P1 in ns and P2 in ns
    return tup(s, near)


def cm_batch(sym, col, p, gtype):
    P1, M, P2 = p["P1"], p["M"], p["P2"]
    isM = col == M
    h1, h2 = _nbr_has(col, P1), _nbr_has(col, P2)
    if p["strict"]:
        ok = np.zeros(col.shape, bool)
        for d1, d2 in (((0, -1), (0, 1)), ((-1, 0), (1, 0))):
            a, b = shift(col, *d1, 255), shift(col, *d2, 255)
            ok |= ((a == P1) & (b == P2)) | ((a == P2) & (b == P1))
    else:
        ok = h1 & h2
    return tupb((isM & ok).sum((1, 2)), (isM & (h1 | h2)).sum((1, 2)))


def cm_sample(rng, gtype):
    rec = _recipes(gtype)
    a, b, m = rec[int(rng.integers(len(rec)))]
    return {"P1": a, "M": m, "P2": b, "strict": bool(rng.random() < 0.5)}


def cm_canon(p, gtype):
    a, b, m = _recipes(gtype)[0]  # all distinct colour triples are equivalent under colour permutation
    return {"P1": a, "M": m, "P2": b, "strict": p["strict"]}


def cm_exemplar(p, gtype):
    N = gtype.N
    c = np.indices((N, N))[1]
    col = np.array([p["P1"], p["M"], p["P2"], p["M"]])[c % 4]
    return multi_climb(cm_batch, [grid(np.zeros((N, N)), col)], p, gtype, restarts=2)


COLOUR_MIXER = mk(
    id="colour_mixer", name="Colour Mixer", theme="A mixed colour touching both its parents",
    requires=req("Mixable"), layers={"colour", "position"}, camp="alternator",
    sample=cm_sample,
    summary=lambda p, gt: (f"{cname(gt, p['P1']).capitalize()} and {cname(gt, p['P2'])} make {cname(gt, p['M'])}. Every "
                           f"{cname(gt, p['M'])} cell " + ("with one parent on each side of it (left/right or above/below)"
                                                           if p["strict"] else "touching both parents") + " is a perfect mix."),
    ordinal=cm_ord, batch=cm_batch, canonical=cm_canon, exemplar=cm_exemplar,
    source="catalog#19 (D12: col#5 recipe param, strict from geo#15); tie-breaker = mixes touching a parent",
    tags={"shortlist"})


# --- Fair Weaver ------------------------------------------------------------------------------------------
def fw_ord(g, p, gtype):
    N, C = gtype.N, gtype.C
    a = g.col.tolist()
    fair = spread = 0
    for ln in [list(r) for r in a] + [[a[r][c] for r in range(N)] for c in range(N)]:
        n = [ln.count(k) for k in range(C)]
        d = max(n) - min(n)
        fair += d <= 1
        spread += d
    return tup(fair, 2 * N * N - spread)


def fw_batch(sym, col, p, gtype):
    N = gtype.N
    L = lines_rc(col, "both")
    n = np.stack([(L == k).sum(2) for k in range(gtype.C)], 2)
    d = n.max(2) - n.min(2)
    return tupb((d <= 1).sum(1), 2 * N * N - d.sum(1))


FAIR_WEAVER = mk(
    id="fair_weaver", name="Fair Weaver", theme="Every colour gets a fair share of each line",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("A row or column is fair when every colour appears about equally often (never more than one "
                           "extra). Score a point for each fair line; fairer is better."),
    ordinal=fw_ord, batch=fw_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.add(*np.indices((gt.N, gt.N))) % gt.C),
    source="catalog#24 (col#7; kept generic, low ceiling at N=3 rainbow6); tie-breaker = total count spread",
    tags={"shortlist"})


# --- Lantern Lighter ----------------------------------------------------------------------------------------
def ll_ord(g, p, gtype):
    N, X = gtype.N, p["X"]
    a = g.col.tolist()
    rows = [r.count(X) for r in a]
    cols = [[a[r][c] for r in range(N)].count(X) for c in range(N)]
    return sum(1 for r in range(N) for c in range(N) if a[r][c] == X and rows[r] == 1 and cols[c] == 1)


def ll_batch(sym, col, p, gtype):
    X = col == p["X"]
    return (X & (X.sum(2, keepdims=True) == 1) & (X.sum(1, keepdims=True) == 1)).sum((1, 2))


def ll_exemplar(p, gtype):
    N = gtype.N
    col = np.full((N, N), (p["X"] + 1) % gtype.C)
    np.fill_diagonal(col, p["X"])
    return grid(np.zeros((N, N)), col)


LANTERN_LIGHTER = mk(
    id="lantern_lighter", name="Lantern Lighter", theme="One lantern per row and column",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"A {cname(gt, p['X'])} cell is a lit lantern if it is the only {cname(gt, p['X'])} in its row "
                           "and the only one in its column. Count your lanterns."),
    ordinal=ll_ord, batch=ll_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=ll_exemplar,
    source="catalog#28 (col#12)", tags={"shortlist"})


# --- Best Friends (seams) ----------------------------------------------------------------------------------
BEST_FRIENDS = mk(
    id="best_friends", name="Best Friends", theme="Your two colours side by side",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: dict(zip(("A", "B"), colours(rng, gt, 2))),
    summary=lambda p, gt: f"Every place a {cname(gt, p['A'])} cell touches a {cname(gt, p['B'])} cell scores a point.",
    ordinal=lambda g, p, gt: _seams_scalar(g.col.tolist(), gt.N, p["A"], p["B"]),
    batch=lambda s, c, p, gt: _seams_batch(c, p["A"], p["B"]),
    canonical=lambda p, gt: recolour(p, ["A", "B"]), exemplar=lambda p, gt: checker(gt, p["A"], p["B"]),
    source="col#1 (catalog D2 'seams')")


# --- Rainbow Steps (Rainbow Road pairs) ------------------------------------------------------------------------
def rs_ord(g, p, gtype):
    C = gtype.C
    a = orient(g.col, p["dir"]).tolist()
    return sum((row[i + 1] - row[i]) % C == 1 for row in a for i in range(gtype.N - 1))


def rs_batch(sym, col, p, gtype):
    a = orient(col, p["dir"]).astype(np.int64)
    return ((a[:, :, 1:] - a[:, :, :-1]) % gtype.C == 1).sum((1, 2))


RAINBOW_STEPS = mk(
    id="rainbow_steps", name="Rainbow Steps", theme="Next-door colours step round the rainbow",
    requires=req("Spectral"), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"dir": str(rng.choice(DIRS4))},
    summary=lambda p, gt: (f"Every time a cell's next neighbour ({D4_DIR_NAMES[p['dir']]}) is the next colour of the "
                           f"rainbow ({' → '.join(gt.colour_names)} → {gt.colour_names[0]}), score a point."),
    ordinal=rs_ord, batch=rs_batch, canonical=lambda p, gt: {"dir": "→"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), unorient(np.indices((gt.N, gt.N))[1] % gt.C, p["dir"])),
    source="col#3 (catalog D1 'pairs'; wrap on every Spectral set)")


# --- Quilt Maker ----------------------------------------------------------------------------------------------
def qm_ord(g, p, gtype):
    N, K = gtype.N, gtype.C
    col = g.col.tolist()
    s = 0
    for r in range(N - 1):
        for c in range(N - 1):
            a, b, d, e = col[r][c], col[r][c + 1], col[r + 1][c], col[r + 1][c + 1]
            if K >= 4:
                s += len({a, b, d, e}) == 4
            else:
                s += len({a, b, d, e}) == 3 and a != b and a != d and e != b and e != d
    return s


def qm_batch(sym, col, p, gtype):
    a, b, d, e = col[:, :-1, :-1], col[:, :-1, 1:], col[:, 1:, :-1], col[:, 1:, 1:]
    side = (a != b) & (a != d) & (e != b) & (e != d)
    if gtype.C >= 4:
        ok = side & (a != e) & (b != d)
    else:
        ok = side & ((a != e) | (b != d))  # 3 colours, no side-by-side repeat => exactly one diagonal repeats
    return ok.sum((1, 2))


def qm_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    col = 2 * (r % 2) + c % 2 if gtype.C >= 4 else (r + c) % 3
    return grid(np.zeros((N, N)), col)


QUILT_MAKER = mk(
    id="quilt_maker", name="Quilt Maker", theme="Patchwork squares with no two patches alike",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Every little 2×2 square whose four patches are all different colours scores a point."
                           if gt.C >= 4 else
                           "Every little 2×2 square that uses all three colours, with no two side-by-side patches "
                           "matching, scores a point."),
    ordinal=qm_ord, batch=qm_batch, exemplar=qm_exemplar,
    source="col#4 (3-colour default method; MinColours 4 not required)")


# --- Flag Bearer ------------------------------------------------------------------------------------------------
def fb_ord(g, p, gtype):
    N, C = gtype.N, p["C"]
    s = marg = 0
    for ln in _lines2(g.col, p["axis"]):
        n = [ln.count(k) for k in range(gtype.C)]
        other = max(n[k] for k in range(gtype.C) if k != C)
        s += n[C] > other
        marg += n[C] - other + N
    return tup(s, marg)


def fb_batch(sym, col, p, gtype):
    N, C = gtype.N, p["C"]
    L = lines_rc(col, p["axis"])
    n = np.stack([(L == k).sum(2) for k in range(gtype.C)], 2)
    other = np.delete(n, C, axis=2).max(2)
    return tupb((n[:, :, C] > other).sum(1), (n[:, :, C] - other + N).sum(1))


FLAG_BEARER = mk(
    id="flag_bearer", name="Flag Bearer", theme="Your colour wins the vote in every row",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"C": colour(rng, gt), "axis": str(rng.choice(LINE_AXES))},
    summary=lambda p, gt: (f"A {'row' if p['axis'] == 'rows' else 'column'} is yours if it has more {cname(gt, p['C'])} "
                           "than any other single colour. Count your lines; a bigger lead is better."),
    ordinal=fb_ord, batch=fb_batch, canonical=lambda p, gt: {"C": 0, "axis": "rows"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["C"])),
    source="col#6; tie-breaker = total winning margin")


# --- Colour-by-Number ----------------------------------------------------------------------------------------------
COLOUR_BY_NUMBER = mk(
    id="colour_by_number", name="Colour-by-Number", theme="Every number has its own colour",
    requires=req("Valued"), layers={"colour", "symbol"}, camp="neutral",
    sample=lambda rng, gt: {"t": int(rng.integers(gt.C))},
    summary=lambda p, gt: ("Your colouring key: " + "; ".join(
        f"{cname(gt, k)} for " + ",".join(str(v) for v in sorted(set(gt.value.tolist())) if (v + p["t"]) % gt.C == k)
        for k in range(gt.C)) + ". Score a point for every cell painted the right colour for its number."),
    ordinal=lambda g, p, gt: int(((gt.value[g.sym].astype(np.int64) + p["t"]) % gt.C == g.col).sum()),
    batch=lambda s, c, p, gt: ((vals(s, gt) + p["t"]) % gt.C == c).sum((1, 2)),
    canonical=lambda p, gt: {"t": 0},  # cyclic colour relabelling shifts t
    exact_log2_tail=lambda t, p, gt: log2_binom_tail(gt.N ** 2, 1.0 / gt.C, int(t)),
    exemplar=lambda p, gt: grid(np.indices((gt.N, gt.N))[1] % gt.S,
                                (gt.value[np.indices((gt.N, gt.N))[1] % gt.S].astype(np.int64) + p["t"]) % gt.C),
    source="col#8 (catalog D13 key=mod K; raw count, exact Bin(N², 1/K))")


# --- Kingdom ------------------------------------------------------------------------------------------------------------
def kg_ord(g, p, gtype):
    col = g.col.tolist()
    return max((len(c) for c in comps2d(col, [[x == p["C"] for x in row] for row in col])), default=0)


def kg_batch(sym, col, p, gtype):
    mask = col == p["C"]
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    return comp_sum(lab, np.ones(col.shape, np.int64), mask).reshape(len(col), -1).max(1)


KINGDOM = mk(
    id="kingdom", name="Kingdom", theme="The biggest patch of your colour",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"C": colour(rng, gt)},
    summary=lambda p, gt: f"Score the size of your biggest joined-up patch of {cname(gt, p['C'])} cells.",
    ordinal=kg_ord, batch=kg_batch, canonical=lambda p, gt: recolour(p, ["C"]),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["C"])),
    source="col#10")


# --- Wallpaper Weaver --------------------------------------------------------------------------------------------------
def ww_ord(g, p, gtype):
    N, k = gtype.N, p["p"]
    a = (g.col if p["dir"] == "right" else g.col.T).tolist()
    return sum(a[r][c] == a[r][c + k] for r in range(N) for c in range(N - k))


def ww_batch(sym, col, p, gtype):
    k = p["p"]
    a = col if p["dir"] == "right" else np.swapaxes(col, 1, 2)
    return (a[:, :, :-k] == a[:, :, k:]).sum((1, 2))


WALLPAPER = mk(
    id="wallpaper_weaver", name="Wallpaper Weaver", theme="A repeating pattern",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"p": int(rng.choice([2, 3] if gt.N >= 4 else [2])), "dir": str(rng.choice(["right", "down"]))},
    summary=lambda p, gt: (f"Every cell whose colour matches the cell {p['p']} steps "
                           f"{'to its right' if p['dir'] == 'right' else 'below it'} scores a point."),
    ordinal=ww_ord, batch=ww_batch, canonical=lambda p, gt: {"p": p["p"], "dir": "right"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="col#13 (p=3 needs N>=4)")


# --- Sunset Sky ----------------------------------------------------------------------------------------------------------
def ss_ord(g, p, gtype):
    N = gtype.N
    s = good = 0
    for ln in orient(g.col, p["dir"]).tolist():
        ok = [0 <= ln[i + 1] - ln[i] <= 1 for i in range(N - 1)]
        good += sum(ok)
        s += all(ok) and len(set(ln)) >= 3
    return tup(s, good)


def ss_batch(sym, col, p, gtype):
    a = orient(col, p["dir"]).astype(np.int64)
    d = a[:, :, 1:] - a[:, :, :-1]
    ok = (d >= 0) & (d <= 1)
    distinct = 1 + (d == 1).sum(2)  # monotone steps of 0/+1: distinct colours = 1 + number of +1 steps
    return tupb((ok.all(2) & (distinct >= 3)).sum(1), ok.sum((1, 2)))


SUNSET_SKY = mk(
    id="sunset_sky", name="Sunset Sky", theme="Lines that fade smoothly along the rainbow",
    requires=req("Spectral"), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"dir": str(rng.choice(DIRS4))},
    summary=lambda p, gt: (f"Read each line {D4_DIR_NAMES[p['dir']]}. It is a sunset if every step stays the same colour "
                           f"or moves one step along the rainbow ({', '.join(gt.colour_names)}), never back, and it uses at "
                           "least 3 colours. Count your sunsets."),
    ordinal=ss_ord, batch=ss_batch, canonical=lambda p, gt: {"dir": "↓"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)),
                                unorient(np.minimum(np.indices((gt.N, gt.N))[1], gt.C - 1), p["dir"])),
    source="col#14; tie-breaker = good steps")


# --- Colour Wheel Harmony ----------------------------------------------------------------------------------------------------
def wh_ord(g, p, gtype):
    N, C = gtype.N, gtype.C
    h = C // 2
    col = g.col.tolist()
    s = 0
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N and (col[r][c] - col[r2][c2]) % C == h:
                    fav = p["fav"] is not None and min(col[r][c], col[r2][c2]) == p["fav"]
                    s += 2 if fav else 1
    return s


def wh_batch(sym, col, p, gtype):
    C = gtype.C
    h = C // 2
    c = col.astype(np.int64)
    s = 0
    for a, b in ((c[:, :, :-1], c[:, :, 1:]), (c[:, :-1, :], c[:, 1:, :])):
        opp = (a - b) % C == h
        w = 1 + (np.minimum(a, b) == p["fav"]) if p["fav"] is not None else 1
        s = s + (opp * w).sum((1, 2))
    return s


HARMONY = mk(
    id="colour_wheel_harmony", name="Colour Wheel Harmony", theme="Opposite colours that make each other pop",
    requires=req("Wheel"), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"fav": None if rng.random() < 0.5 else int(rng.integers(gt.C // 2))},
    summary=lambda p, gt: ("Every time two opposite colours on the wheel touch ("
                           + ", ".join(f"{gt.colour_names[i]}–{gt.colour_names[i + gt.C // 2]}" for i in range(gt.C // 2))
                           + "), score a point"
                           + (f"; {gt.colour_names[p['fav']]}–{gt.colour_names[p['fav'] + gt.C // 2]} scores double."
                              if p["fav"] is not None else ".")),
    ordinal=wh_ord, batch=wh_batch, canonical=lambda p, gt: {"fav": None if p["fav"] is None else 0},
    exemplar=lambda p, gt: checker(gt, p["fav"] or 0, (p["fav"] or 0) + gt.C // 2),
    source="col#15 (Wheel with an even colour count: rainbow6)")


# --- Warm Hearts ----------------------------------------------------------------------------------------------------------------
def _dressed(sym, col, gtype, flip):
    red = np.isin(gtype.suit[sym], (1, 2))
    warm = col.astype(np.float64) < gtype.C / 2
    return (red == warm) ^ flip


def wa_ord(g, p, gtype):
    N = gtype.N
    d = _dressed(g.sym, g.col, gtype, p["flip"]).tolist()
    su, col = gtype.suit[g.sym].tolist(), g.col.tolist()
    s = sum(map(sum, d))
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N and d[r][c] and d[r2][c2] and su[r][c] == su[r2][c2] and col[r][c] == col[r2][c2]:
                    s += 1
    return s


def wa_batch(sym, col, p, gtype):
    d = _dressed(sym, col, gtype, p["flip"])
    su = gtype.suit[sym]
    s = d.sum((1, 2))
    for sl1, sl2 in (((slice(None), slice(None), slice(None, -1)), (slice(None), slice(None), slice(1, None))),
                     ((slice(None), slice(None, -1), slice(None)), (slice(None), slice(1, None), slice(None)))):
        s = s + (d[sl1] & d[sl2] & (su[sl1] == su[sl2]) & (col[sl1] == col[sl2])).sum((1, 2))
    return s


WARM_HEARTS = mk(
    id="warm_hearts", name="Warm Hearts", theme="Suits dressed in matching colours",
    requires=req("Suited", "Spectral"), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"flip": bool(rng.random() < 0.5)},
    summary=lambda p, gt: (("Hearts and diamonds" if not p["flip"] else "Spades and clubs") + " should wear warm colours ("
                           + ", ".join(n for i, n in enumerate(gt.colour_names) if i < gt.C / 2) + ") and "
                           + ("spades and clubs" if not p["flip"] else "hearts and diamonds") + " cool ones ("
                           + ", ".join(n for i, n in enumerate(gt.colour_names) if i >= gt.C / 2)
                           + "). Each well-dressed card scores a point, plus one for each touching pair in the same suit "
                             "and colour."),
    ordinal=wa_ord, batch=wa_batch, canonical=lambda p, gt: {"flip": False},  # swapping red/black suits maps flip
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), 13), np.full((gt.N, gt.N), gt.C - 1 if p["flip"] else 0)),
    source="col#16 (catalog D13 key=warmth kept as its own family: raw count + matching pairs)")


# --- Twin Friends (symbol-gated Best Friends, col idea) ---------------------------------------------------------------------
def tf_ord(g, p, gtype):
    N, A, B = gtype.N, p["A"], p["B"]
    col, k = g.col.tolist(), rank_key(g.sym, gtype).tolist()
    gated = 0
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N and {col[r][c], col[r2][c2]} == {A, B} and k[r][c] == k[r2][c2]:
                    gated += 1
    return tup(gated, _seams_scalar(col, N, A, B))


def tf_batch(sym, col, p, gtype):
    A, B = p["A"], p["B"]
    k = rank_key(sym, gtype)

    def pr(x, y):
        return ((x == A) & (y == B)) | ((x == B) & (y == A))
    g = (pr(col[:, :, :-1], col[:, :, 1:]) & (k[:, :, :-1] == k[:, :, 1:])).sum((1, 2)) + \
        (pr(col[:, :-1, :], col[:, 1:, :]) & (k[:, :-1, :] == k[:, 1:, :])).sum((1, 2))
    return tupb(g, _seams_batch(col, A, B))


TWIN_FRIENDS = mk(
    id="twin_friends", name="Twin Friends", theme="Your two colours side by side on matching symbols",
    requires=req(), layers={"colour", "symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: dict(zip(("A", "B"), colours(rng, gt, 2))),
    summary=lambda p, gt: (f"Every place a {cname(gt, p['A'])} cell touches a {cname(gt, p['B'])} cell with the same symbol "
                           "scores a point (touching with different symbols is a small step)."),
    ordinal=tf_ord, batch=tf_batch, canonical=lambda p, gt: recolour(p, ["A", "B"]),
    exemplar=lambda p, gt: checker(gt, p["A"], p["B"]),
    source="col cross-lens idea 'symbol-gated colour rules'; tie-breaker = ungated seams")


FAMILIES = [STRIPE_PAINTER, FEUDING_FAMILIES, COLOUR_MIXER, FAIR_WEAVER, LANTERN_LIGHTER, BEST_FRIENDS, RAINBOW_STEPS,
            QUILT_MAKER, FLAG_BEARER, COLOUR_BY_NUMBER, KINGDOM, WALLPAPER, SUNSET_SKY, HARMONY, WARM_HEARTS, TWIN_FRIENDS]
