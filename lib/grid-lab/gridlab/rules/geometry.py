"""Geometry & topology lens rules (geometry.md), plus its cross-lens ideas, in ordinal form."""
from __future__ import annotations

from functools import lru_cache

from ._util import *  # noqa: F401,F403
from ._util import rim_mask, multi_climb, hill_climb


def _other(gtype, *cs):
    return next(k for k in range(gtype.C) if k not in cs)


def _idx(N):
    return np.arange(N * N, dtype=np.int64).reshape(N, N)


def _roots(lab, mask):
    return mask & (lab == _idx(lab.shape[-1]))


# --- Castle Keeper (merged with Go Territory) ------------------------------------------------------
def ck_score_parts(enc_cells, regions, p, col):
    if p["mode"] == "treasure":
        return sum(1 for r, c in enc_cells if col[r][c] == p["T"])
    if p["mode"] == "eyes":
        return len(enc_cells) + 3 * regions
    return len(enc_cells)


def ck_ord(g, p, gtype):
    N, W = gtype.N, p["W"]
    col = g.col.tolist()
    nonw = [[x != W for x in row] for row in col]
    enc, regions = [], 0
    for comp in comps2d([[0] * N for _ in range(N)], nonw):
        if not any(r in (0, N - 1) or c in (0, N - 1) for r, c in comp):
            enc += comp
            regions += 1
    rimw = sum(1 for r in range(N) for c in range(N) if (r in (0, N - 1) or c in (0, N - 1)) and col[r][c] == W)
    return tup(ck_score_parts(enc, regions, p, col), rimw)


def ck_batch(sym, col, p, gtype):
    N, W = gtype.N, p["W"]
    rim = rim_mask(N)
    mask = col != W
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    touch = comp_sum(lab, np.broadcast_to(rim, col.shape).astype(np.int64), mask) > 0
    enc = mask & ~touch
    if p["mode"] == "treasure":
        s = (enc & (col == p["T"])).sum((1, 2))
    elif p["mode"] == "eyes":
        s = enc.sum((1, 2)) + 3 * _roots(lab, enc).sum((1, 2))
    else:
        s = enc.sum((1, 2))
    rimw = ((col == W) & rim).sum((1, 2))
    return tupb(s, rimw)


def ck_sample(rng, gtype):
    W, T = colours(rng, gtype, 2)
    mode = str(rng.choice(["plain", "plain", "treasure", "eyes"]))
    return {"W": W, "mode": mode, "T": T if mode == "treasure" else None}


def ck_exemplar(p, gtype):
    N, W = gtype.N, p["W"]
    inner = p["T"] if p["mode"] == "treasure" else _other(gtype, W)
    col = np.full((N, N), inner)
    col[rim_mask(N)] = W
    if p["mode"] != "eyes":
        return grid(np.zeros((N, N)), col)
    r, c = np.indices((N, N))
    col2 = np.where(rim_mask(N) | ((r + c) % 2 == 1), W, inner)
    return multi_climb(ck_batch, [grid(np.zeros((N, N)), col), grid(np.zeros((N, N)), col2)], p, gtype, restarts=0)


def ck_summary(p, gt):
    w = cname(gt, p["W"])
    base = f"Build walls of {w}. A cell is safe when water flowing in from the edge (not through {w}) can't reach it. "
    if p["mode"] == "treasure":
        return base + f"Score a point for every safe {cname(gt, p['T'])} cell."
    if p["mode"] == "eyes":
        return base + "Score a point for every safe cell, plus 3 for every separate safe pocket (like eyes in Go)."
    return base + "Score a point for every safe cell."


CASTLE_KEEPER = mk(
    id="castle_keeper", name="Castle Keeper", theme="Walls that keep the water out",
    requires=req(min_size=4), layers={"colour", "position"}, camp="clumper",
    sample=ck_sample, summary=ck_summary, ordinal=ck_ord, batch=ck_batch,
    canonical=lambda p, gt: recolour(p, ["W", "T"]), exemplar=ck_exemplar,
    source="catalog#4 (D4: geo#5 + games#8 Go Territory; treasure and eyes variants; MinSize 4); "
           "tie-breaker = wall cells on the rim", tags={"shortlist"})


# --- Chessmaster (2×2 windows) ---------------------------------------------------------------------
def _seams_scalar(col, N, A, B):
    s = 0
    for r in range(N):
        for c in range(N):
            for r2, c2 in ((r, c + 1), (r + 1, c)):
                if r2 < N and c2 < N and {col[r][c], col[r2][c2]} == {A, B}:
                    s += 1
    return s


def _seams_batch(col, A, B):
    def pr(x, y):
        return ((x == A) & (y == B)) | ((x == B) & (y == A))
    return pr(col[:, :, :-1], col[:, :, 1:]).sum((1, 2)) + pr(col[:, :-1, :], col[:, 1:, :]).sum((1, 2))


def ch_ord(g, p, gtype):
    N, A, B = gtype.N, p["A"], p["B"]
    col = g.col.tolist()
    w = 0
    for r in range(N - 1):
        for c in range(N - 1):
            a, b = col[r][c], col[r][c + 1]
            if {a, b} == {A, B} and col[r + 1][c + 1] == a and col[r + 1][c] == b:
                w += 1
    return tup(w, _seams_scalar(col, N, A, B))


def ch_batch(sym, col, p, gtype):
    A, B = p["A"], p["B"]
    a, b, c, d = col[:, :-1, :-1], col[:, :-1, 1:], col[:, 1:, :-1], col[:, 1:, 1:]
    w = ((((a == A) & (b == B)) | ((a == B) & (b == A))) & (d == a) & (c == b)).sum((1, 2))
    return tupb(w, _seams_batch(col, A, B))


def checker(gtype, A, B, sym=None):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(np.zeros((N, N)) if sym is None else sym, np.where((r + c) % 2 == 0, A, B))


CHESSMASTER = mk(
    id="chessmaster", name="Chessmaster", theme="Little chessboards in your two colours",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: dict(zip(("A", "B"), colours(rng, gt, 2))),
    summary=lambda p, gt: (f"Every 2×2 square that looks like a little chessboard of {cname(gt, p['A'])} and "
                           f"{cname(gt, p['B'])} scores a point."),
    ordinal=ch_ord, batch=ch_batch, canonical=lambda p, gt: recolour(p, ["A", "B"]),
    exemplar=lambda p, gt: checker(gt, p["A"], p["B"]),
    source="catalog#6 (D2 windows, geo#8); tie-breaker = A–B seams (Best Friends)", tags={"shortlist"})


# --- Archipelago -----------------------------------------------------------------------------------
def ar_ord(g, p, gtype):
    col = g.col.tolist()
    return len(comps2d(col, [[x == p["C"] for x in row] for row in col]))


def ar_batch(sym, col, p, gtype):
    mask = col == p["C"]
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    return _roots(lab, mask).sum((1, 2))


ARCHIPELAGO = mk(
    id="archipelago", name="Archipelago", theme="As many separate islands as possible",
    requires=req(), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"C": colour(rng, gt)},
    summary=lambda p, gt: f"Count the separate islands of {cname(gt, p['C'])} (touching corners don't join islands).",
    ordinal=ar_ord, batch=ar_batch, canonical=lambda p, gt: recolour(p, ["C"]),
    exemplar=lambda p, gt: checker(gt, p["C"], (p["C"] + 1) % gt.C),
    source="geo#4 (catalog D2 'islands')")


# --- Bridge Builder ----------------------------------------------------------------------------------
def br_ord(g, p, gtype):
    col = g.col if p["D"] == "LR" else g.col.T
    col = col.tolist()
    best = 0
    for comp in comps2d(col, [[x == p["C"] for x in row] for row in col]):
        best = max(best, len({c for _, c in comp}))
    return best


def br_batch(sym, col, p, gtype):
    N = gtype.N
    if p["D"] == "TB":
        col = np.swapaxes(col, 1, 2)
    B = len(col)
    mask = col == p["C"]
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    gl = lab + (np.arange(B, dtype=np.int64) * N * N)[:, None, None]
    span = np.zeros(B * N * N, np.int64)
    for j in range(N):
        t = np.zeros(B * N * N, bool)
        t[gl[:, :, j][mask[:, :, j]]] = True
        span += t
    return span.reshape(B, N * N).max(1)


def br_exemplar(p, gtype):
    N = gtype.N
    col = np.full((N, N), (p["C"] + 1) % gtype.C)
    if p["D"] == "LR":
        col[N // 2, :] = p["C"]
    else:
        col[:, N // 2] = p["C"]
    return grid(np.zeros((N, N)), col)


BRIDGE_BUILDER = mk(
    id="bridge_builder", name="Bridge Builder", theme="A path from one edge to the other",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"C": colour(rng, gt), "D": str(rng.choice(["LR", "TB"]))},
    summary=lambda p, gt: (f"Build a bridge of touching {cname(gt, p['C'])} cells from the "
                           f"{'left edge to the right edge' if p['D'] == 'LR' else 'top edge to the bottom edge'}. "
                           f"Score = how many {'columns' if p['D'] == 'LR' else 'rows'} your best bridge reaches."),
    ordinal=br_ord, batch=br_batch,
    canonical=lambda p, gt: {"C": 0, "D": "LR"}, exemplar=br_exemplar,
    source="catalog#11 (geo#1; the 2N full-crossing bonus is monotone, so the ordinal is the span)",
    tags={"shortlist"})


# --- Looking-Glass (mirror pairs; merged with Mirror Quilt) ----------------------------------------------
MIRROR = {
    "V": lambda N, r, c: (r, N - 1 - c), "H": lambda N, r, c: (N - 1 - r, c),
    "D": lambda N, r, c: (c, r), "A": lambda N, r, c: (N - 1 - c, N - 1 - r),
    "half": lambda N, r, c: (N - 1 - r, N - 1 - c),
}


@lru_cache(maxsize=None)
def _mirror_pairs(N, axis):
    a, b = [], []
    for r in range(N):
        for c in range(N):
            r2, c2 = MIRROR[axis](N, r, c)
            if r * N + c < r2 * N + c2:
                a.append(r * N + c); b.append(r2 * N + c2)
    return np.array(a), np.array(b)


def lg_ord(g, p, gtype):
    N = gtype.N
    key = (g.col.astype(np.int64) if p["layer"] == "colour" else rank_key(g.sym, gtype)).tolist()
    s = 0
    for r in range(N):
        for c in range(N):
            r2, c2 = MIRROR[p["axis"]](N, r, c)
            if r * N + c < r2 * N + c2 and key[r][c] == key[r2][c2]:
                s += 1
    return s


def lg_batch(sym, col, p, gtype):
    key = (col.astype(np.int64) if p["layer"] == "colour" else rank_key(sym, gtype)).reshape(len(sym), -1)
    a, b = _mirror_pairs(gtype.N, p["axis"])
    return (key[:, a] == key[:, b]).sum(1)


LOOKING_GLASS = mk(
    id="looking_glass", name="Looking-Glass", theme="Every cell matches its mirror twin",
    requires=req(), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"axis": str(rng.choice(list(MIRROR))), "layer": str(rng.choice(["colour", "symbol"]))},
    summary=lambda p, gt: ({"V": "Fold the grid down the middle (left onto right)", "H": "Fold the grid top onto bottom",
                            "D": "Fold the grid along the diagonal from top-left", "A": "Fold the grid along the diagonal from top-right",
                            "half": "Turn the grid upside down"}[p["axis"]]
                           + f": every cell whose {'colour' if p['layer'] == 'colour' else 'symbol'} lands on a twin scores a point (each pair once)."),
    ordinal=lg_ord, batch=lg_batch,
    canonical=lambda p, gt: {**p, "axis": {"H": "V", "A": "D"}.get(p["axis"], p["axis"])},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="geo#2 + col#9 Mirror Quilt (catalog D9 'pairs'; half-turn axis from col)")


# --- 90° orbits (Pinwheel, Card Windmill) --------------------------------------------------------------
@lru_cache(maxsize=None)
def orbits(N):
    out = []
    for r in range(N // 2):
        for c in range((N + 1) // 2):
            out.append([a * N + b for a, b in ((r, c), (c, N - 1 - r), (N - 1 - r, N - 1 - c), (N - 1 - c, r))])
    return np.array(out, dtype=np.int64)


def _pin_key(sym, col, gtype, attr):
    if attr == "colour":
        return col.astype(np.int64)
    return gtype.suit[sym].astype(np.int64) if gtype.suit is not None else sym.astype(np.int64)


def pw_ord(g, p, gtype):
    k = _pin_key(g.sym, g.col, gtype, p["attr"]).ravel().tolist()
    full = plur = 0
    for o in orbits(gtype.N).tolist():
        vs = [k[i] for i in o]
        full += len(set(vs)) == 1
        plur += max(vs.count(x) for x in vs)
    return tup(full, plur)


def pw_batch(sym, col, p, gtype):
    k = _pin_key(sym, col, gtype, p["attr"]).reshape(len(sym), -1)
    O = orbits(gtype.N)
    v = k[:, O]  # (B, M, 4)
    full = (v == v[:, :, :1]).all(2).sum(1)
    plur = np.max(np.stack([(v == v[:, :, i:i + 1]).sum(2) for i in range(4)]), axis=0).sum(1)
    return tupb(full, plur)


PINWHEEL = mk(
    id="pinwheel", name="Pinwheel", theme="Looks the same after a quarter turn",
    requires=req(), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"attr": str(rng.choice(["colour", "symbol"]))},
    summary=lambda p, gt: ("Turn the grid a quarter turn. Every set of 4 cells that swap places and all share the same "
                           + ("colour" if p["attr"] == "colour" else "suit" if gt.symbols == "cards" else "symbol")
                           + " scores a point."),
    ordinal=pw_ord, batch=pw_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="geo#3 (cards use suit); tie-breaker = Σ per-orbit plurality")


def cw_ord(g, p, gtype):
    s = gtype.suit[g.sym].ravel().tolist()
    full = steps = 0
    for o in orbits(gtype.N).tolist():
        v = [s[i] for i in o]
        full += all(v[i] == (v[0] + i) % 4 for i in range(4))
        steps += sum(v[i + 1] == (v[i] + 1) % 4 for i in range(3))
    return tup(full, steps)


def cw_batch(sym, col, p, gtype):
    s = gtype.suit[sym].astype(np.int64).reshape(len(sym), -1)
    O = orbits(gtype.N)
    v = s[:, O]
    st = v[:, :, 1:] == (v[:, :, :-1] + 1) % 4
    return tupb(st.all(2).sum(1), st.sum((1, 2)))


def cw_exemplar(p, gtype):
    N = gtype.N
    s = np.zeros(N * N, np.int64)
    for o in orbits(N):
        for i, cell in enumerate(o):
            s[cell] = i * 13 + 12
    return grid(s.reshape(N, N), np.zeros((N, N)))


CARD_WINDMILL = mk(
    id="card_windmill", name="Card Windmill", theme="Suits spin round a quarter turn at a time",
    requires=req("Suited"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Turn the grid a quarter turn and every suit should move on one: ♠→♥→♦→♣→♠. Every set of 4 "
                           "cells that spin that way scores a point."),
    ordinal=cw_ord, batch=cw_batch, exemplar=cw_exemplar,
    source="catalog#30 (geo#17); tie-breaker = correct suit steps inside orbits", tags={"shortlist"})


# --- Royal Court -------------------------------------------------------------------------------------
def _court(sym, gtype, suit):
    f = gtype.face[sym]
    return f if suit is None else f & (gtype.suit[sym] == suit)


def rc_ord(g, p, gtype):
    N = gtype.N
    m = N // 2
    fc = _court(g.sym, gtype, p["suit"]).tolist()
    interior = sum(1 for r in range(1, N - 1) for c in range(1, N - 1) if fc[r][c])
    score = 0
    if fc[m][m]:
        comp = next(cp for cp in comps2d([[0] * N for _ in range(N)], fc) if (m, m) in cp)
        safe = all(0 < r < N - 1 and 0 < c < N - 1 for r, c in comp)
        score = len(comp) * (2 if safe else 1)
    return tup(score, interior)


def rc_batch(sym, col, p, gtype):
    N = gtype.N
    m = N // 2
    fc = _court(sym, gtype, p["suit"])
    lab = label_batch(np.zeros(sym.shape, np.int64), fc)
    reg = fc & (lab == lab[:, m, m][:, None, None]) & fc[:, m, m][:, None, None]
    size = reg.sum((1, 2))
    safe = ~(reg & rim_mask(N)).any((1, 2))
    interior = (fc & ~rim_mask(N)).sum((1, 2))
    return tupb(size * np.where(safe, 2, 1), interior)


def rc_exemplar(p, gtype):
    N = gtype.N
    su = 0 if p["suit"] is None else p["suit"]
    s = np.where(rim_mask(N), su * 13 + 1, su * 13 + 12)
    # The doubled safe palace (2(N-2)^2) only beats an all-picture grid (N^2) at N = 7.
    cands = [grid(s, np.zeros((N, N))), grid(np.full((N, N), su * 13 + 12), np.zeros((N, N)))]
    return best_of(rc_ord, cands, p, gtype)


ROYAL_COURT = mk(
    id="royal_court", name="Royal Court", theme="A palace of picture cards around the centre",
    requires=req("Faced", parity="odd"), layers={"symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"suit": None if rng.random() < 0.5 else int(rng.integers(4))},
    summary=lambda p, gt: ("The king lives in the centre. If the centre card is a picture card "
                           + ("(J, Q, K)" if p["suit"] is None else f"(J, Q, K of {SUITS_[p['suit']]})")
                           + ", score the size of the joined-up patch of picture cards around it, doubled if the patch "
                             "doesn't touch the edge."),
    ordinal=rc_ord, batch=rc_batch, canonical=lambda p, gt: {"suit": None if p["suit"] is None else 0},
    exemplar=rc_exemplar,
    source="catalog#31 (geo#16; HasCentre = odd N only); tie-breaker = picture cards off the edge", tags={"shortlist"})

SUITS_ = "♠♥♦♣"


# --- Bullseye ------------------------------------------------------------------------------------------
@lru_cache(maxsize=None)
def rings(N):
    out = [[] for _ in range((N + 1) // 2)]
    for r in range(N):
        for c in range(N):
            out[min(r, c, N - 1 - r, N - 1 - c)].append(r * N + c)
    return [np.array(x) for x in out]


def be_ord(g, p, gtype):
    col = g.col.ravel().tolist()
    score, alive, prev, plur = 0, True, None, 0
    for ring in rings(gtype.N):
        cs = [col[i] for i in ring.tolist()]
        plur += max(cs.count(x) for x in cs)
        ok = len(set(cs)) == 1 and cs[0] != prev
        alive = alive and ok
        score += alive
        prev = cs[0]
    return tup(score, plur)


def be_batch(sym, col, p, gtype):
    N = gtype.N
    c = col.reshape(len(col), -1).astype(np.int64)
    score = np.zeros(len(col), np.int64)
    plur = np.zeros(len(col), np.int64)
    alive = np.ones(len(col), bool)
    prev = np.full(len(col), -1)
    for ring in rings(N):
        v = c[:, ring]
        plur += np.max(np.stack([(v == k).sum(1) for k in range(gtype.C)]), axis=0)
        ok = (v == v[:, :1]).all(1) & (v[:, 0] != prev)
        alive &= ok
        score += alive
        prev = v[:, 0]
    return tupb(score, plur)


def be_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(np.zeros((N, N)), np.minimum(np.minimum(r, c), np.minimum(N - 1 - r, N - 1 - c)) % gtype.C)


BULLSEYE = mk(
    id="bullseye", name="Bullseye", theme="Rings like an archery target",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Starting from the outside, count the square rings that are all one colour and a different "
                           "colour from the ring outside them. Stop at the first ring that fails."),
    ordinal=be_ord, batch=be_batch, exemplar=be_exemplar,
    source="geo#6 (all-or-nothing from outside in); tie-breaker = Σ per-ring plurality")


# --- Snake Charmer -------------------------------------------------------------------------------------
def sn_ord(g, p, gtype):
    N, C = gtype.N, p["C"]
    col = g.col.tolist()
    mask = [[x == C for x in row] for row in col]
    best = 0
    for comp in comps2d(col, mask):
        deg = [sum(mask[a][b] for a, b in nbrs4(N, r, c)) for r, c in comp]
        if max(deg) <= 2 and sum(deg) // 2 == len(comp) - 1:
            best = max(best, len(comp))
    return best


def sn_batch(sym, col, p, gtype):
    mask = col == p["C"]
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    deg = sum(shift(mask, dr, dc, False).astype(np.int64) for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1))) * mask
    size = comp_sum(lab, np.ones(col.shape, np.int64), mask)
    bad = comp_sum(lab, (deg > 2).astype(np.int64), mask) > 0
    edges2 = comp_sum(lab, deg, mask)
    snake = mask & ~bad & (edges2 == 2 * (size - 1))
    return (size * snake).reshape(len(col), -1).max(1)


def sn_exemplar(p, gtype):
    N = gtype.N
    col = np.full((N, N), (p["C"] + 1) % gtype.C)
    for r in range(N):
        if r % 2 == 0:
            col[r, :] = p["C"]
        else:
            col[r, N - 1 if (r // 2) % 2 == 0 else 0] = p["C"]
    return grid(np.zeros((N, N)), col)


SNAKE_CHARMER = mk(
    id="snake_charmer", name="Snake Charmer", theme="The longest wiggly snake",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"C": colour(rng, gt)},
    summary=lambda p, gt: (f"Build the longest snake of {cname(gt, p['C'])}: a patch one cell wide with no branches and "
                           "no loops. Score its length."),
    ordinal=sn_ord, batch=sn_batch, canonical=lambda p, gt: recolour(p, ["C"]), exemplar=sn_exemplar,
    source="geo#9")


# --- Tetromino Tamer -----------------------------------------------------------------------------------
PIECES = {"I": [(0, 0), (0, 1), (0, 2), (0, 3)], "O": [(0, 0), (0, 1), (1, 0), (1, 1)],
          "T": [(0, 0), (0, 1), (0, 2), (1, 1)], "L": [(0, 0), (1, 0), (2, 0), (2, 1)],
          "S": [(0, 1), (0, 2), (1, 0), (1, 1)]}
SYMS8 = [lambda r, c: (r, c), lambda r, c: (c, -r), lambda r, c: (-r, -c), lambda r, c: (-c, r),
         lambda r, c: (r, -c), lambda r, c: (-r, c), lambda r, c: (c, r), lambda r, c: (-c, -r)]


def _norm(cells):
    r0 = min(r for r, _ in cells)
    c0 = min(c for _, c in cells)
    return frozenset((r - r0, c - c0) for r, c in cells)


@lru_cache(maxsize=None)
def piece_forms(P):
    return frozenset(_norm([f(r, c) for r, c in PIECES[P]]) for f in SYMS8)


def _mask_of(form):
    return sum(1 << (r * 4 + c) for r, c in form)


def tt_ord(g, p, gtype):
    col = g.col.tolist()
    forms = piece_forms(p["P"])
    cs = [cp for cp in comps2d(col, [[x == p["C"] for x in row] for row in col]) if len(cp) == 4]
    pieces = sum(_norm(cp) in forms for cp in cs)
    return tup(pieces, len(cs))


def tt_batch(sym, col, p, gtype):
    B, N = len(col), gtype.N
    mask = col == p["C"]
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    size = comp_sum(lab, np.ones(col.shape, np.int64), mask)
    m4 = mask & (size == 4)
    gl = (lab + (np.arange(B, dtype=np.int64) * N * N)[:, None, None])[m4]
    r, c = np.indices((N, N))
    rr, cc = np.broadcast_to(r, col.shape)[m4], np.broadcast_to(c, col.shape)[m4]
    rmin = np.full(B * N * N, 99, np.int64); cmin = np.full(B * N * N, 99, np.int64)
    np.minimum.at(rmin, gl, rr); np.minimum.at(cmin, gl, cc)
    bits = np.zeros(B * N * N, np.int64)
    np.add.at(bits, gl, np.left_shift(1, (rr - rmin[gl]) * 4 + (cc - cmin[gl])))
    roots = _roots(lab, m4)
    rg = (lab + (np.arange(B, dtype=np.int64) * N * N)[:, None, None])
    ok = np.isin(bits, np.array([_mask_of(f) for f in piece_forms(p["P"])]))
    pieces = (roots & ok[rg]).sum((1, 2))
    return tupb(pieces, roots.sum((1, 2)))


def tt_exemplar(p, gtype):
    N = gtype.N
    occ = np.zeros((N, N), bool)
    forms = sorted(sorted(f) for f in piece_forms(p["P"]))
    for r in range(N):
        for c in range(N):
            for f in forms:
                cells = [(r + a, c + b) for a, b in f]
                if not all(0 <= x < N and 0 <= y < N and not occ[x, y] for x, y in cells):
                    continue
                if any(occ[a, b] for x, y in cells for a, b in nbrs4(N, x, y) if (a, b) not in cells):
                    continue
                for x, y in cells:
                    occ[x, y] = True
                break
    return grid(np.zeros((N, N)), np.where(occ, p["C"], (p["C"] + 1) % gtype.C))


TETROMINO_TAMER = mk(
    id="tetromino_tamer", name="Tetromino Tamer", theme="Islands shaped like your Tetris piece",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"C": colour(rng, gt), "P": str(rng.choice(["O", "T", "L", "S"] + (["I"] if gt.N >= 4 else [])))},
    summary=lambda p, gt: (f"Every island of {cname(gt, p['C'])} that is exactly the shape of a Tetris {p['P']} piece "
                           "(turned or flipped is fine) scores a point."),
    ordinal=tt_ord, batch=tt_batch, canonical=lambda p, gt: recolour(p, ["C"]), exemplar=tt_exemplar,
    source="geo#10 (I only for N>=4); tie-breaker = 4-cell islands of any shape")


# --- Rainbow Bands -------------------------------------------------------------------------------------
def _band_d(N, K):
    r, c = np.indices((N, N))
    return (r if K[0] == "T" else N - 1 - r) + (c if K[1] == "L" else N - 1 - c)


def rb_ord(g, p, gtype):
    N, C = gtype.N, gtype.C
    d = _band_d(N, p["K"]).tolist()
    col = g.col.tolist()
    score = cells = 0
    for t in range(2 * N - 1):
        ln = [(r, c) for r in range(N) for c in range(N) if d[r][c] == t]
        ok = [col[r][c] == t % C for r, c in ln]
        cells += sum(ok)
        score += len(ln) if all(ok) else 0
    return tup(score, cells)


def rb_batch(sym, col, p, gtype):
    N, C = gtype.N, gtype.C
    d = _band_d(N, p["K"])
    ok = col == (d % C)
    score = np.zeros(len(col), np.int64)
    for t in range(2 * N - 1):
        m = d == t
        score += ok[:, m].all(1) * int(m.sum())
    return tupb(score, ok.sum((1, 2)))


RAINBOW_BANDS = mk(
    id="rainbow_bands", name="Rainbow Bands", theme="Slanted rainbow stripes from your corner",
    requires=req("Spectral"), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"K": str(rng.choice(["TL", "TR", "BL", "BR"]))},
    summary=lambda p, gt: (f"Paint slanted stripes starting from the {'top' if p['K'][0] == 'T' else 'bottom'}-"
                           f"{'left' if p['K'][1] == 'L' else 'right'} corner in rainbow order "
                           f"({', '.join(gt.colour_names)}, then again). Every cell on a stripe that is fully right scores."),
    ordinal=rb_ord, batch=rb_batch, canonical=lambda p, gt: {"K": "TL"},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), _band_d(gt.N, p["K"]) % gt.C),
    source="geo#11; tie-breaker = individually correct cells")


# --- Constellation -------------------------------------------------------------------------------------
def co_ord(g, p, gtype):
    k = rank_key(g.sym, gtype).tolist()
    cs = comps2d(k, [[x == p["S"] for x in row] for row in k], diag=True)
    return max((len(c) for c in cs), default=0)


def co_batch(sym, col, p, gtype):
    mask = rank_key(sym, gtype) == p["S"]
    lab = label_batch(np.zeros(sym.shape, np.int64), mask, diag=True)
    return comp_sum(lab, np.ones(sym.shape, np.int64), mask).reshape(len(sym), -1).max(1)


CONSTELLATION = mk(
    id="constellation", name="Constellation", theme="The biggest star cluster of your symbol",
    requires=req(), layers={"symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"S": int(rng.integers(gt.ranks))},
    summary=lambda p, gt: (f"Join up cells showing {sglyph(gt, p['S'])}"
                           f"{' (any suit)' if gt.symbols == 'cards' else ''}: touching sides or corners counts. "
                           "Score the size of your biggest cluster."),
    ordinal=co_ord, batch=co_batch, canonical=lambda p, gt: {"S": 0},
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), p["S"]), np.zeros((gt.N, gt.N))),
    source="geo#13 (8-connectivity; cards sample a rank)")


# --- Rainbow Roads (complete roads, no wrap) ----------------------------------------------------------
def rd_ord(g, p, gtype):
    N, C = gtype.N, gtype.C
    col = g.col.tolist()
    ways = [[1 if col[r][c] == 0 else 0 for c in range(N)] for r in range(N)]
    for i in range(1, C):
        new = [[0] * N for _ in range(N)]
        for r in range(N):
            for c in range(N):
                if col[r][c] == i:
                    new[r][c] = sum(ways[a][b] for a, b in nbrs4(N, r, c) if col[a][b] == i - 1)
        ways = new
    return sum(map(sum, ways))


def rd_batch(sym, col, p, gtype):
    C = gtype.C
    ways = (col == 0).astype(np.int64)
    for i in range(1, C):
        s = sum(shift(ways, dr, dc, 0) for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)))
        ways = s * (col == i)
    return ways.sum((1, 2))


def rd_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    starts = [grid(np.zeros((N, N)), (r + c) % gtype.C),
              grid(np.zeros((N, N)), np.minimum(np.minimum(r, c), np.minimum(N - 1 - r, N - 1 - c)) % gtype.C)]
    return multi_climb(rd_batch, starts, p, gtype, restarts=2)


RAINBOW_ROADS = mk(
    id="rainbow_roads", name="Rainbow Roads", theme="Rainbow paths from first colour to last",
    requires=req("Spectral", min_colours=4), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: (f"A road walks from cell to touching cell through the colours in order: "
                           f"{' → '.join(gt.colour_names)}. Count every different complete road."),
    ordinal=rd_ord, batch=rd_batch, exemplar=rd_exemplar,
    source="geo#14 (catalog D1 'roads'; NEW MinColours 4)")


# --- Paint Mixer (strict sandwiches on both axes) ------------------------------------------------------
@lru_cache(maxsize=None)
def _parents(gtype):
    P1 = -np.ones(gtype.C, np.int64); P2 = -np.ones(gtype.C, np.int64)
    t = gtype.mix_table
    for a in range(gtype.C):
        for b in range(a + 1, gtype.C):
            if t[a, b] >= 0:
                P1[t[a, b]], P2[t[a, b]] = a, b
    return P1, P2


def pm_ord(g, p, gtype):
    N = gtype.N
    P1, P2 = _parents(gtype)
    col = g.col.tolist()
    s = near = 0
    for r in range(N):
        for c in range(N):
            k = col[r][c]
            if P1[k] < 0:
                continue
            par = {int(P1[k]), int(P2[k])}
            for (a, b), (x, y) in (((r, c - 1), (r, c + 1)), ((r - 1, c), (r + 1, c))):
                if 0 <= a < N and 0 <= b < N and 0 <= x < N and 0 <= y < N and {col[a][b], col[x][y]} == par:
                    s += 1
            near += any(col[a][b] in par for a, b in nbrs4(N, r, c))
    return tup(s, near)


def pm_batch(sym, col, p, gtype):
    P1, P2 = _parents(gtype)
    c = col.astype(np.int64)
    p1, p2 = P1[c], P2[c]
    isM = p1 >= 0
    s = np.zeros(len(col), np.int64)
    near = np.zeros(col.shape, bool)
    for d1, d2 in (((0, -1), (0, 1)), ((-1, 0), (1, 0))):
        a, b = shift(c, *d1, -9), shift(c, *d2, -9)
        s += (isM & (((a == p1) & (b == p2)) | ((a == p2) & (b == p1)))).sum((1, 2))
        near |= (a == p1) | (a == p2) | (b == p1) | (b == p2)
    return tupb(s, (isM & near).sum((1, 2)))


def pm_exemplar(p, gtype):
    N = gtype.N
    P1, P2 = _parents(gtype)
    M = int(np.nonzero(P1 >= 0)[0][0])
    r, c = np.indices((N, N))
    u = np.floor_divide(c - r, 2)
    col = np.where((r + c) % 2 == 1, M, np.where(u % 2 == 0, P1[M], P2[M]))
    return grid(np.zeros((N, N)), col)


PAINT_MIXER = mk(
    id="paint_mixer", name="Paint Mixer", theme="Mixed colours sandwiched between their parents",
    requires=req("Mixable"), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("A mixed colour (" + ", ".join(
        f"{gt.colour_names[a]}+{gt.colour_names[b]}={gt.colour_names[m]}" for (a, b, m) in _recipes(gt))
        + ") scores a point when its two parents sit on opposite sides of it (left and right), and another when they "
          "sit above and below."),
    ordinal=pm_ord, batch=pm_batch, exemplar=pm_exemplar,
    source="geo#15 (catalog D12 'strict', both axes)")


def _recipes(gtype):
    P1, P2 = _parents(gtype)
    return [(int(P1[m]), int(P2[m]), m) for m in range(gtype.C) if P1[m] >= 0]


# --- Colour Carousel -----------------------------------------------------------------------------------
@lru_cache(maxsize=None)
def border_ring(N):
    ring = [(0, c) for c in range(N - 1)] + [(r, N - 1) for r in range(N - 1)] \
        + [(N - 1, c) for c in range(N - 1, 0, -1)] + [(r, 0) for r in range(N - 1, 0, -1)]
    return np.array([r * N + c for r, c in ring])


def cc_ord(g, p, gtype):
    C = gtype.C
    ring = border_ring(gtype.N).tolist()
    if p["dir"] == "ccw":
        ring = ring[::-1]
    col = g.col.ravel().tolist()
    L = len(ring)
    d = [(col[ring[(i + 1) % L]] - col[ring[i]]) % C for i in range(L)]
    adv, ok = sum(x == 1 for x in d), sum(x <= 1 for x in d)
    complete = ok == L and sum(d) >= C
    return tup(int(complete), adv, ok)


def cc_batch(sym, col, p, gtype):
    C = gtype.C
    ring = border_ring(gtype.N)
    if p["dir"] == "ccw":
        ring = ring[::-1]
    v = col.reshape(len(col), -1)[:, ring].astype(np.int64)
    d = (np.roll(v, -1, axis=1) - v) % C
    L = len(ring)
    adv, ok = (d == 1).sum(1), (d <= 1).sum(1)
    complete = (ok == L) & (d.sum(1) >= C)
    return tupb(complete, adv, ok)


def cc_exemplar(p, gtype):
    N, C = gtype.N, gtype.C
    ring = border_ring(N)
    if p["dir"] == "ccw":
        ring = ring[::-1]
    L = len(ring)
    A = C * (L // C)
    col = np.zeros(N * N, np.int64)
    for i, cell in enumerate(ring):
        col[cell] = min(i, A) % C
    return grid(np.zeros((N, N)), col.reshape(N, N))


COLOUR_CAROUSEL = mk(
    id="colour_carousel", name="Colour Carousel", theme="The border goes round the colour wheel",
    requires=req("Wheel", min_size=4), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"dir": str(rng.choice(["cw", "ccw"]))},
    summary=lambda p, gt: (f"Walk round the edge {'clockwise' if p['dir'] == 'cw' else 'anticlockwise'}. Each step "
                           "should stay the same colour or move to the next colour on the wheel. Best of all is going "
                           "all the way round the wheel; then count the steps that move on a colour."),
    ordinal=cc_ord, batch=cc_batch, canonical=lambda p, gt: {"dir": "cw"}, exemplar=cc_exemplar,
    source="geo#18 (catalog fix: count only advancing steps; full lap ranked first)")


# --- Gravity (geo idea) ----------------------------------------------------------------------------
def gv_ord(g, p, gtype):
    N = gtype.N
    col = g.col.tolist()
    return sum(1 for r in range(N) for c in range(N) if all(col[k][c] == p["X"] for k in range(r, N)))


def gv_batch(sym, col, p, gtype):
    X = (col == p["X"])[:, ::-1, :]
    return np.logical_and.accumulate(X, axis=1).sum((1, 2))


GRAVITY = mk(
    id="gravity", name="Falling Sand", theme="Your colour sinks to the bottom",
    requires=req(), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"{cname(gt, p['X']).capitalize()} is sand that sinks. Score every {cname(gt, p['X'])} cell "
                           f"that has only {cname(gt, p['X'])} below it, all the way to the bottom."),
    ordinal=gv_ord, batch=gv_batch, canonical=lambda p, gt: recolour(p, ["X"]),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["X"])),
    source="geo cross-lens idea 'Gravity / falling sand'")


# --- Swiss Cheese (hole counting, geo idea) -------------------------------------------------------------
def sw_ord(g, p, gtype):
    N, X = gtype.N, p["X"]
    col = g.col.tolist()
    holes = sum(1 for cp in comps2d([[0] * N for _ in range(N)], [[x != X for x in row] for row in col])
                if not any(r in (0, N - 1) or c in (0, N - 1) for r, c in cp))
    rimx = sum(1 for r in range(N) for c in range(N) if (r in (0, N - 1) or c in (0, N - 1)) and col[r][c] == X)
    return tup(holes, rimx)


def sw_batch(sym, col, p, gtype):
    N = gtype.N
    rim = rim_mask(N)
    mask = col != p["X"]
    lab = label_batch(np.zeros(col.shape, np.int64), mask)
    touch = comp_sum(lab, np.broadcast_to(rim, col.shape).astype(np.int64), mask) > 0
    holes = _roots(lab, mask & ~touch).sum((1, 2))
    return tupb(holes, ((col == p["X"]) & rim).sum((1, 2)))


def sw_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    col = np.where(rim_mask(N) | ((r + c) % 2 == 1), p["X"], (p["X"] + 1) % gtype.C)
    return multi_climb(sw_batch, [grid(np.zeros((N, N)), col)], p, gtype, restarts=0)


SWISS_CHEESE = mk(
    id="swiss_cheese", name="Swiss Cheese", theme="As many holes as possible",
    requires=req(min_size=4), layers={"colour", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"Your cheese is {cname(gt, p['X'])}. A hole is a patch of other colours completely "
                           f"surrounded by {cname(gt, p['X'])} (not touching the edge). Count the holes."),
    ordinal=sw_ord, batch=sw_batch, canonical=lambda p, gt: recolour(p, ["X"]), exemplar=sw_exemplar,
    source="geo cross-lens idea 'Hole counting (Euler number)'; tie-breaker = rim cells of your colour")


# --- Mountain Climb (geo idea) ----------------------------------------------------------------------------
def mc_ord(g, p, gtype):
    N = gtype.N
    v = gtype.value[g.sym].tolist()
    level, L, reached = {(0, 0)}, 0, False
    while level:
        L += 1
        reached = reached or (N - 1, N - 1) in level
        target = v[0][0] + L
        level = {(a, b) for r, c in level for a, b in nbrs4(N, r, c) if v[a][b] == target}
    return tup(int(reached), L)


def mc_batch(sym, col, p, gtype):
    N = gtype.N
    B = len(sym)
    v = vals(sym, gtype)
    v0 = v[:, 0, 0][:, None, None]
    level = np.zeros(sym.shape, bool)
    level[:, 0, 0] = True
    L = np.zeros(B, np.int64)
    reached = np.zeros(B, bool)
    k = 0
    while level.any():
        k += 1
        alive = level.any((1, 2))
        L += alive
        reached |= level[:, N - 1, N - 1]
        dil = shift(level, -1, 0, False) | shift(level, 1, 0, False) | shift(level, 0, -1, False) | shift(level, 0, 1, False)
        level = dil & (v == v0 + k)
    return tupb(reached, L)


def mc_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    lo, R = vmin(gtype), vmax(gtype) - vmin(gtype)
    v = lo + np.minimum(r + c, R)
    choices = [sym_for_value(gtype, x) for x in range(lo, vmax(gtype) + 1)]
    g0 = grid(np.vectorize(lambda x: sym_for_value(gtype, int(x)))(v), np.zeros((N, N)))
    return hill_climb(mc_batch, g0, p, gtype, layers=("symbol",), sym_choices=choices)


MOUNTAIN_CLIMB = mk(
    id="mountain_climb", name="Mountain Climb", theme="Climb one step at a time to the far corner",
    requires=req("Valued"), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Start at the top-left cell and step to a touching cell that is exactly one bigger, again and "
                           "again. Best is reaching the bottom-right corner; then the longer the climb, the better."),
    ordinal=mc_ord, batch=mc_batch, exemplar=mc_exemplar,
    source="geo cross-lens idea 'climb the mountain' (+1 steps from the top-left corner)")


# --- Treasure Map (geo idea: value × closeness to centre) ---------------------------------------------
def _closeness(N):
    r, c = np.indices((N, N))
    return (2 * N - 2) - (np.abs(2 * r - (N - 1)) + np.abs(2 * c - (N - 1)))


def tm_ord(g, p, gtype):
    w = _closeness(gtype.N).ravel().tolist()
    v = gtype.value[g.sym].ravel().tolist()
    return sum(a * b for a, b, c in zip(v, w, g.col.ravel().tolist()) if c == p["X"])


def tm_batch(sym, col, p, gtype):
    return (vals(sym, gtype) * _closeness(gtype.N) * (col == p["X"])).sum((1, 2))


TREASURE_MAP = mk(
    id="treasure_map", name="Treasure Map", theme="Big numbers of your colour near the middle",
    requires=req("Valued"), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=lambda rng, gt: {"X": colour(rng, gt)},
    summary=lambda p, gt: (f"Every {cname(gt, p['X'])} cell scores its number times how close it is to the middle "
                           "(corners count nothing)."),
    ordinal=tm_ord, batch=tm_batch, canonical=lambda p, gt: recolour(p, ["X"]),
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), sym_for_value(gt, vmax(gt))), np.full((gt.N, gt.N), p["X"])),
    source="geo cross-lens idea 'distance-weighted rules' (value × doubled closeness to centre, your colour)")


FAMILIES = [CASTLE_KEEPER, CHESSMASTER, ARCHIPELAGO, BRIDGE_BUILDER, LOOKING_GLASS, PINWHEEL, CARD_WINDMILL,
            ROYAL_COURT, BULLSEYE, SNAKE_CHARMER, TETROMINO_TAMER, RAINBOW_BANDS, CONSTELLATION, RAINBOW_ROADS,
            PAINT_MIXER, COLOUR_CAROUSEL, GRAVITY, SWISS_CHEESE, MOUNTAIN_CLIMB, TREASURE_MAP]
