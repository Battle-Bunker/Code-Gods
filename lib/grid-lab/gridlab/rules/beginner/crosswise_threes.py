"""Crosswise Threes (beginner pool; lib/game-utilities/src/families/grid/beginner/crosswise_threes.ts).

Fold along the top-right to bottom-left diagonal: (r, c) lands on (N-1-c, N-1-r). Primary: pairs off the fold line whose
numbers are exactly 3 apart; secondary: minus the total of ||a-b|-3|. Fold-line cells have no partner.
"""
from __future__ import annotations

from .._util import grid, mk, np, req, tup, tupb, vals

APART = 3


def cw_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    N = v.shape[-1]
    partner = np.swapaxes(v[:, ::-1, ::-1], 1, 2)  # partner[r][c] = v[N-1-c][N-1-r]
    above = np.add.outer(np.arange(N), np.arange(N)) < N - 1  # each pair once: its cell above the fold line
    off = np.abs(np.abs(v - partner) - APART)
    return tupb(((off == 0) & above).sum((1, 2)), -(off * above).sum((1, 2)))


def cw_ord(g, p, gtype):
    return tup(*cw_batch(g.sym[None], g.col[None], p, gtype)[0])


def cw_exemplar(p, gtype):
    N = gtype.N
    return grid(np.fromfunction(lambda r, c: np.where(r + c > N - 1, 4 + APART, 4), (N, N), dtype=int), np.zeros((N, N)))


CROSSWISE_THREES = mk(
    id="crosswise_threes", name="Crosswise Threes", theme="Fold corner to corner: numbers 3 apart",
    requires=req("Numeral", min_size=4, max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Fold the board along the top-right to bottom-left diagonal: each number landing on one "
                           "exactly 3 apart from it scores a point."),
    ordinal=cw_ord, batch=cw_batch, exemplar=cw_exemplar,
    source="beginner pool (2026-11-11): anti-diagonal fold pairs 3 apart; tie-breaker = total of ||a-b|-3|",
    tags={"beginner"})
