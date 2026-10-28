"""Candidate new mutators for the starved families (not installed by default; see variants.py).

Each obeys the mutators.py contract: deterministic, idempotent (tests: test_newmuts.py), priced by the
same five terms (tool, description, erasure, motion, measurement).

  tile      copy the top-left k x k square periodically over the whole grid (colours, symbols or both).
            The data-dependent generalisation of motif/mirror_fold: it keeps k² cells and erases the rest,
            (N² - k²) · layer bits. Targets: quilt_maker (a 2x2 of 4 colours tiles to a perfect quilt),
            odds_evens, seed2_patchwork (constant symbols + a proper 2x2 colouring), chessmaster, magic_window.
  unclash   raster sweep of an area: a cell whose colour equals its upper or left neighbour takes the
            first colour that differs from all four neighbours (or at least from up and left). The
            alternators' counterpart of majority_line (which serves clumpers). Erasure is charged as if the
            changed cells were repainted: E[#changed] · log2 C (an upper bound; changed cells' originals are
            in {up, left}). Targets: seed2_patchwork (with write), quilt_maker, chessmaster, islander.
  crown     relative cell targeting (docs/mutators.md §6.8): in an area, the first highest-ranked cell takes
            colour X, and any other cell of that same rank drops one rank, so the crown is unique. Erasure:
            log2 C at the crowned cell + 1 bit per demoted cell (its original is m or m-1); measurement
            log2 n (which cell). Targets: lone_peak (crown + flatten), king_of_the_hill, kings_court.
  balance   arithmetic relative targeting: in each chosen row (or column) the last cell becomes whatever
            makes the line's values add up to T (if a valid symbol does that), or to a multiple of the base
            ("round"). Erasure: log2 S per line where it fires. Targets: round_numbers, magic_accountant,
            magic_window, number_sandwich (partial).
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np

from ...core import Grid, GridType, req, spawn_batch
from ...mutators import (F_REGION, Field, F_colour, Mutator, Terms, F_kind, REGION_SCOPE, _cn, _lg, region_mask,
                         region_size, region_text, resolve_mask)

log2 = math.log2


# ------------------------------------------------------------------------------------------------
# tile
# ------------------------------------------------------------------------------------------------
def _tile(g, p, gt):
    k, N = p["k"], gt.N
    r, c = np.indices((N, N))
    out_s, out_c = g.sym, g.col
    if p["layer"] in ("both", "colour"):
        out_c = g.col[r % k, c % k]
    if p["layer"] in ("both", "symbol"):
        out_s = g.sym[r % k, c % k]
    return Grid(np.ascontiguousarray(out_s), np.ascontiguousarray(out_c))


def _tile_terms(p, gt):
    n = gt.N ** 2 - p["k"] ** 2
    e = 0.0
    dc = ds = 0.0
    if p["layer"] in ("both", "colour"):
        e += n * log2(gt.C)
        dc = n * (1 - 1 / gt.C)
    if p["layer"] in ("both", "symbol"):
        e += n * log2(gt.S)
        ds = n * (1 - 1 / gt.S)
    return Terms(erase=e, dcol=dc, dsym=ds, scope="global")


def _tile_text(p, gt):
    what = {"both": "", "colour": "the colours of ", "symbol": "the symbols of "}[p["layer"]]
    return f"copy {what}the top-left {p['k']}x{p['k']} square over the whole grid like wallpaper"


tile = Mutator(
    "tile", "Tile", "Copy the top-left square over the whole grid like wallpaper (colours, symbols or both).",
    req(), "mixed", False, ("global",),
    (Field("k", lambda gt, p: [k for k in (2, 3) if k < gt.N]), Field("layer", lambda gt, p: ["both", "colour", "symbol"])),
    _tile_terms, _tile, _tile_text,
)


# ------------------------------------------------------------------------------------------------
# unclash
# ------------------------------------------------------------------------------------------------
def _unclash(g, p, gt):
    m = region_mask(p["kind"], p["region"], gt.N)
    col = g.col.astype(np.int64).copy()
    N, C = gt.N, gt.C
    changed = False
    for r in range(N):
        for c in range(N):
            if not m[r, c]:
                continue
            up = col[r - 1, c] if r > 0 else -1
            lf = col[r, c - 1] if c > 0 else -1
            v = col[r, c]
            if v != up and v != lf:
                continue
            dn = col[r + 1, c] if r + 1 < N else -1
            rt = col[r, c + 1] if c + 1 < N else -1
            pick = next((k for k in range(C) if k not in (up, lf, dn, rt)), None)
            if pick is None:
                pick = next(k for k in range(C) if k not in (up, lf))
            col[r, c] = pick
            changed = True
    return g.replace(col=col.astype(g.col.dtype)) if changed else None


@lru_cache(maxsize=None)
def _unclash_changed(kind, region, gt: GridType, n: int = 1024) -> float:
    rng = np.random.default_rng(7 + gt.N * 31 + gt.C)
    S, C = spawn_batch(gt, rng, n)
    tot = 0
    p = {"kind": kind, "region": region}
    for a, b in zip(S, C):
        y = _unclash(Grid(a, b), p, gt)
        if y is not None:
            tot += int((y.col != b).sum())
    return tot / n


def _unclash_terms(p, gt):
    ch = _unclash_changed(p["kind"], p["region"], gt)
    return Terms(erase=ch * log2(gt.C), dcol=ch, scope=REGION_SCOPE[p["kind"]])


unclash = Mutator(
    "unclash", "Unclash", "Sweep an area: a cell that has the same colour as the cell above or to its left changes "
    "to a colour none of its neighbours has.",
    req(), "colour", False, ("line", "block", "global"),
    (F_kind("line", "block", "all"), F_REGION),
    _unclash_terms, _unclash,
    lambda p, gt: f"in {region_text(p, gt)}, any cell matching the colour above or to its left changes to a colour no neighbour has",
)


# ------------------------------------------------------------------------------------------------
# crown
# ------------------------------------------------------------------------------------------------
def _crown(g, p, gt):
    m = region_mask(p["kind"], p["region"], gt.N)
    sym = g.sym.astype(np.int64)
    r = gt.rank[sym].astype(np.int64)
    idx = np.flatnonzero(m.ravel())
    rr = r.ravel()[idx]
    top = int(rr.max())
    first = idx[int(np.argmax(rr))]
    ties = idx[(rr == top) & (idx != first)]
    col = g.col.copy()
    out = sym.copy()
    col.ravel()[first] = p["colour"]
    if ties.size:
        if top == 0:                       # cannot demote below the lowest rank: nothing to make unique
            pass
        else:
            o = out.ravel()
            o[ties] = o[ties] - 1          # cards: rank-1 keeps the suit (index - 1 within the suit block)
    return Grid(out.astype(g.sym.dtype), col)


@lru_cache(maxsize=None)
def _crown_ties(kind, region, gt: GridType, n: int = 2048) -> float:
    rng = np.random.default_rng(11 + gt.N * 17 + gt.S)
    S, _ = spawn_batch(gt, rng, n)
    m = region_mask(kind, region, gt.N)
    r = gt.rank[S.astype(np.int64)][:, m]
    return float(((r == r.max(1, keepdims=True)).sum(1) - 1).mean())


def _crown_terms(p, gt):
    n = region_size(p["kind"], p["region"], gt.N)
    t = _crown_ties(p["kind"], p["region"], gt)
    return Terms(erase=log2(gt.C) + t, dcol=1 - 1 / gt.C, dsym=t, measure=_lg(n), scope=REGION_SCOPE[p["kind"]])


crown = Mutator(
    "crown", "Crown", "In an area, the highest number is crowned with a colour; any other cell with the same number "
    "drops by one, so the crowned cell is the only top.",
    req("Ranked"), "both", False, ("line", "block", "global"),
    (F_kind("line", "block", "all"), F_REGION, F_colour()),
    _crown_terms, _crown,
    lambda p, gt: (f"in {region_text(p, gt)}, the highest number turns {_cn(gt, p['colour'])} and any other cell "
                   f"with the same number drops by one"),
)


# ------------------------------------------------------------------------------------------------
# balance
# ------------------------------------------------------------------------------------------------
def _targets(gt):
    lo, hi = int(gt.value.min()), int(gt.value.max())
    return ["round"] + list(range(gt.N * lo, gt.N * hi + 1))


def _balance(g, p, gt):
    N = gt.N
    sym = g.sym.astype(np.int64).copy()
    T = p["target"]
    lines = range(N) if p["which"] == "all" else [p["index"]]
    val = gt.value[sym]
    changed = False
    for i in lines:
        if p["axis"] == 0:
            cells = [(i, c) for c in range(N)]
        else:
            cells = [(r, i) for r in range(N)]
        rest = int(sum(val[rc] for rc in cells[:-1]))
        if T == "round":
            want = (-rest) % gt.S
        else:
            want = T - rest
            if not (0 <= want < gt.S):
                continue
        if sym[cells[-1]] != want:
            sym[cells[-1]] = want
            changed = True
    return g.replace(sym=sym.astype(g.sym.dtype)) if changed else None


@lru_cache(maxsize=None)
def _balance_fire(target, gt: GridType, n: int = 4096) -> float:
    if target == "round":
        return 1.0
    rng = np.random.default_rng(13 + gt.N)
    rest = rng.integers(0, gt.S, (n, gt.N - 1)).sum(1)
    w = target - rest
    return float(((w >= 0) & (w < gt.S)).mean())


def _balance_terms(p, gt):
    k = gt.N if p["which"] == "all" else 1
    f = _balance_fire(p["target"], gt)
    return Terms(erase=k * f * log2(gt.S), dsym=k * f * (1 - 1 / gt.S), scope="global" if k > 1 else "line")


def _balance_text(p, gt):
    which = (("every row" if p["axis"] == 0 else "every column") if p["which"] == "all"
             else f"{'row' if p['axis'] == 0 else 'column'} {p['index'] + 1}")
    goal = "a multiple of the base" if p["target"] == "round" else str(p["target"])
    return f"change the last number of {which} so that it adds up to {goal}"


balance = Mutator(
    "balance", "Balance", "Change the last number of a row or column (or of every row) so the line adds up to a target.",
    req("Numeral"), "symbol", False, ("line", "global"),
    (Field("which", lambda gt, p: ["one", "all"]), Field("axis", lambda gt, p: [0, 1]),
     Field("index", lambda gt, p: list(range(gt.N)) if p["which"] == "one" else None),
     Field("target", lambda gt, p: _targets(gt))),
    _balance_terms, _balance, _balance_text,
)

NEW_MUTATORS = {"tile": tile, "unclash": unclash, "crown": crown, "balance": balance}
