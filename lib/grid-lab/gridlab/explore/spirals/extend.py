"""The "extend" family: mutators that finish structure an object already has (prototypes; opt-in).

Each one is an idempotent overwrite that acts only when the object is already partly structured, so
under the spawn prior it rarely fires and erases little: its price is low *because it is useless on
random objects* (the Landauer/KL bound of docs/mutators.md §1 still holds for one application). On a
structured object it does a lot. That is the intended positive feedback: the more structure an object
has, the cheaper the next step of it, whoever built the first part.

  complete_line     the row/column closest to one colour, if at least k of its N cells already share
                    that colour, is painted all that colour                     (clumpers: colour)
  complete_symbols  the same for symbols                                        (clumpers: symbol)
  fill_holes        cells whose in-grid neighbours (all of them, or all but one) share a colour take
                    it, repeated until nothing changes                          (clumpers: regions)
  extend_rainbow    the line with the longest rainbow run c, c+1, c+2... (>= k) continues it across
                    the whole line                                               (alternators: Spectral)
  extend_alternate  the line with the longest A B A B run (>= k) continues it across the line
                                                                                 (alternators: pairs)
  extend_ramp       the line with the longest counting run v, v+1, ... (>= k) continues it across the
                    line (cards keep their suit)                                 (symbol order rules)

Price = the usual step terms with E and B_L estimated by a fixed-seed Monte Carlo under the prior
(changed cells x log2 alphabet, an upper bound on the erasure), and M = log2 2N for the line choice.
`register()` adds them to gridlab.mutators.MUTATORS (in-process only); variants enable them by
leaving them out of COST_KNOBS["disabled"].
"""
from __future__ import annotations

import math
import zlib
from functools import lru_cache

import numpy as np

from ... import mutators as mx
from ...core import GridType, spawn_batch, Grid, req
from ...mutators import Field, Mutator, Terms

log2 = math.log2


# ------------------------------------------------------------------------------------------------
# helpers on the 2N lines (rows then columns)
# ------------------------------------------------------------------------------------------------
def _lines(a: np.ndarray) -> list[np.ndarray]:
    N = a.shape[0]
    return [a[i, :] for i in range(N)] + [a[:, j] for j in range(N)]


def _put_line(a: np.ndarray, idx: int, vals: np.ndarray) -> None:
    N = a.shape[0]
    if idx < N:
        a[idx, :] = vals
    else:
        a[:, idx - N] = vals


def _longest_run(line: np.ndarray, ok_pair) -> tuple[int, int]:
    """(length, start) of the longest stretch whose consecutive pairs all satisfy ok_pair (first wins)."""
    ok = ok_pair(line[:-1], line[1:])
    best, start, cur, cs = 1, 0, 1, 0
    for t, o in enumerate(ok.tolist()):
        if o:
            cur += 1
            if cur > best:
                best, start = cur, cs
        else:
            cur, cs = 1, t + 1
    return best, start


def _best_line(a: np.ndarray, ok_pair) -> tuple[int, int, int]:
    best = (0, 0, 0)
    for i, ln in enumerate(_lines(a)):
        L, s = _longest_run(ln, ok_pair)
        if L > best[0]:
            best = (L, i, s)
    return best   # (length, line index, run start)


def _k_choices(gt: GridType):
    return [k for k in (gt.N - 2, gt.N - 1) if k >= 2]


F_K = Field("k", lambda gt, p: _k_choices(gt))


# ------------------------------------------------------------------------------------------------
# apply functions
# ------------------------------------------------------------------------------------------------
def _complete(a: np.ndarray, k: int, alphabet: int) -> np.ndarray | None:
    best, bi, bv = -1, 0, 0
    for i, ln in enumerate(_lines(a)):
        c = np.bincount(ln.astype(np.int64), minlength=alphabet)
        v = int(c.argmax())
        if c[v] > best:
            best, bi, bv = int(c[v]), i, v
    N = a.shape[0]
    if best < k or best >= N:
        return None
    out = a.copy()
    _put_line(out, bi, np.full(N, bv, a.dtype))
    return out


def _complete_line(g, p, gt):
    col = _complete(g.col, p["k"], gt.C)
    return None if col is None else g.replace(col=col)


def _complete_symbols(g, p, gt):
    if gt.symbols == "cards":   # compare ranks; keep each card's suit
        r = gt.rank[g.sym.astype(np.int64)]
        rr = _complete(r, p["k"], gt.ranks)
        if rr is None:
            return None
        sym = (g.sym.astype(np.int64) // 13) * 13 + rr
        return g.replace(sym=sym.astype(g.sym.dtype))
    sym = _complete(g.sym, p["k"], gt.S)
    return None if sym is None else g.replace(sym=sym)


def _fill_holes(g, p, gt):
    """Sequential (raster-order) sweeps until stable. Each switch moves a cell to a colour that strictly
    more of its neighbours share than share its current one, so disagreeing edges strictly decrease:
    the sweeps terminate, and the result has no qualifying cell (idempotent)."""
    col = g.col.astype(np.int64).copy()
    N, C = gt.N, gt.C
    slack = 4 - p["need"]          # how many in-grid neighbours may disagree
    deg = mx._degrees(N)
    nb = [[[(r + dr, c + dc) for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)) if 0 <= r + dr < N and 0 <= c + dc < N]
           for c in range(N)] for r in range(N)]
    changed, moved = False, True
    while moved:
        moved = False
        for r in range(N):
            for c in range(N):
                cnt = np.bincount([col[q] for q in nb[r][c]], minlength=C)
                b = int(cnt.argmax())
                bc = int(cnt[b])
                d = int(deg[r, c])
                if b == col[r, c] or bc < 2 or bc < d - slack or bc * 2 <= d or cnt[col[r, c]] >= bc:
                    continue
                col[r, c] = b
                moved = changed = True
    return g.replace(col=col.astype(g.col.dtype)) if changed else None


def _extend(a: np.ndarray, k: int, ok_pair, cont) -> np.ndarray | None:
    L, i, s = _best_line(a, ok_pair)
    N = a.shape[0]
    if L < k or L >= N:
        return None
    ln = _lines(a)[i].copy()
    for t in range(s + L, N):          # forwards from the run's end
        ln[t] = cont(ln[t - 1], +1)
    for t in range(s - 1, -1, -1):     # backwards from its start
        ln[t] = cont(ln[t + 1], -1)
    out = a.copy()
    _put_line(out, i, ln)
    return out


def _extend_rainbow(g, p, gt):
    C = gt.C
    col = _extend(g.col.astype(np.int64), p["k"], lambda x, y: (x + 1) % C == y, lambda v, d: (v + d) % C)
    return None if col is None else g.replace(col=col.astype(g.col.dtype))


def _extend_alternate(g, p, gt):
    a = g.col.astype(np.int64)
    N = gt.N
    L, i, s = 0, 0, 0
    for li, ln in enumerate(_lines(a)):   # longest A B A B stretch (A != B)
        best, st = 1, 0
        for t0 in range(N - 1):
            if ln[t0] == ln[t0 + 1]:
                continue
            t = t0 + 2
            while t < N and ln[t] == ln[t - 2]:
                t += 1
            if t - t0 > best:
                best, st = t - t0, t0
        if best > L:
            L, i, s = best, li, st
    if L < p["k"] or L >= N:
        return None
    ln = _lines(a)[i].copy()
    A, B = ln[s], ln[s + 1]
    for t in range(N):
        ln[t] = A if (t - s) % 2 == 0 else B
    out = a.copy()
    _put_line(out, i, ln)
    return g.replace(col=out.astype(g.col.dtype))


def _extend_ramp(g, p, gt):
    sym = g.sym.astype(np.int64)
    if gt.symbols == "cards":
        R = 13
        r = sym % 13
        rr = _extend(r, p["k"], lambda x, y: (x + 1) % R == y, lambda v, d: (v + d) % R)
        if rr is None:
            return None
        return g.replace(sym=((sym // 13) * 13 + rr).astype(g.sym.dtype))
    S = gt.S
    out = _extend(sym, p["k"], lambda x, y: (x + 1) % S == y, lambda v, d: (v + d) % S)
    return None if out is None else g.replace(sym=out.astype(g.sym.dtype))


# ------------------------------------------------------------------------------------------------
# pricing: Monte Carlo under the prior (fixed seed per mutator, params, GridType)
# ------------------------------------------------------------------------------------------------
MC_N = 2048


@lru_cache(maxsize=None)
def _mc_change(mid: str, k: int, gt: GridType) -> tuple[float, float, float]:
    """(expected colour cells changed, expected symbol cells changed, fire rate) under the prior."""
    rng = np.random.default_rng(zlib.crc32(f"extend|{mid}|{k}|{gt.key}".encode()))
    sym, col = spawn_batch(gt, rng, MC_N)
    fn = APPLY[mid]
    dc = ds = fire = 0.0
    for s, c in zip(sym, col):
        g = Grid(s, c)
        y = fn(g, {"k": k, "need": k}, gt)
        if y is None:
            continue
        fire += 1
        dc += float((y.col != c).sum())
        ds += float((y.sym != s).sum())
    return dc / MC_N, ds / MC_N, fire / MC_N


def _terms_for(mid: str, scope: str, measure_line: bool):
    def fn(p, gt):
        k = p.get("k", p.get("need"))
        dc, ds, _ = _mc_change(mid, k, gt)
        e = dc * log2(gt.C) + ds * log2(gt.S)
        return Terms(erase=e, dcol=dc, dsym=ds, measure=mx._lg(2 * gt.N) if measure_line else 0.0, scope=scope)
    return fn


APPLY = {"complete_line": _complete_line, "complete_symbols": _complete_symbols, "fill_holes": _fill_holes,
         "extend_rainbow": _extend_rainbow, "extend_alternate": _extend_alternate, "extend_ramp": _extend_ramp}

EXTEND = [
    Mutator("complete_line", "Finish the line",
            "The row or column closest to one colour, if it is nearly there, becomes all that colour.",
            req(), "colour", False, ("line",), (F_K,), _terms_for("complete_line", "line", True), _complete_line,
            lambda p, gt: f"if some row or column has at least {p['k']} cells of one colour, make that whole line that colour"),
    Mutator("complete_symbols", "Finish the number line",
            "The row or column closest to one number, if it is nearly there, shows only that number.",
            req(), "symbol", False, ("line",), (F_K,), _terms_for("complete_symbols", "line", True), _complete_symbols,
            lambda p, gt: f"if some row or column shows the same number at least {p['k']} times, write it in the whole line"),
    Mutator("fill_holes", "Fill the holes",
            "A cell surrounded by one colour takes that colour (again and again until nothing changes).",
            req(), "colour", False, ("global",), (Field("need", lambda gt, p: [4, 3]),),
            _terms_for("fill_holes", "global", False), _fill_holes,
            lambda p, gt: ("fill every cell whose neighbours are all one colour with that colour" if p["need"] == 4 else
                           "fill every cell whose neighbours are all but one the same colour with that colour")),
    Mutator("extend_rainbow", "Keep the rainbow going",
            "The longest rainbow run in a row or column carries on to fill the whole line.",
            req("Spectral"), "colour", False, ("line",), (F_K,), _terms_for("extend_rainbow", "line", True), _extend_rainbow,
            lambda p, gt: f"if some row or column has a rainbow run of at least {p['k']}, continue it across the whole line"),
    Mutator("extend_alternate", "Keep the pattern going",
            "The longest A-B-A-B run in a row or column carries on to fill the whole line.",
            req(), "colour", False, ("line",), (F_K,), _terms_for("extend_alternate", "line", True), _extend_alternate,
            lambda p, gt: f"if some row or column alternates two colours for at least {p['k']} cells, continue it across the line"),
    Mutator("extend_ramp", "Keep counting",
            "The longest counting run (3, 4, 5, ...) in a row or column carries on to fill the whole line.",
            req("Ranked"), "symbol", False, ("line",), (F_K,), _terms_for("extend_ramp", "line", True), _extend_ramp,
            lambda p, gt: f"if some row or column counts up for at least {p['k']} cells, keep counting across the whole line"),
]
EXTEND_IDS = tuple(m.id for m in EXTEND)


def register() -> None:
    """Add the extend family to gridlab.mutators (idempotent, in-process)."""
    if "complete_line" in mx._BY_ID:
        return
    for m in EXTEND:
        mx.MUTATORS.append(m)
        mx._BY_ID[m.id] = m
    if "complete_line" not in mx.COST_KNOBS.get("disabled", []):
        mx.COST_KNOBS["disabled"] = sorted(set(mx.COST_KNOBS.get("disabled", [])) | set(EXTEND_IDS))
    mx._available.cache_clear()
