"""Spread of Three (beginner pool): every overlapping 2×2 square, biggest minus smallest against 3.

Primary: squares whose spread is exactly 3; secondary: minus the total distance of every square's spread from 3.
Reference for lib/game-utilities/src/families/grid/beginner/spread_three.ts.
"""
from __future__ import annotations

from .._util import grid, mk, np, req, tup, tupb, vals

SPREAD = 3


def sp_ord(g, p, gtype):
    v = vals(g.sym, gtype).tolist()
    on = off = 0
    for r in range(gtype.N - 1):
        for c in range(gtype.N - 1):
            sq = [v[r][c], v[r][c + 1], v[r + 1][c], v[r + 1][c + 1]]
            d = abs(max(sq) - min(sq) - SPREAD)
            on += d == 0
            off += d
    return tup(on, -off)


def sp_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    sq = np.stack([v[:, :-1, :-1], v[:, :-1, 1:], v[:, 1:, :-1], v[:, 1:, 1:]])
    d = np.abs(sq.max(0) - sq.min(0) - SPREAD)
    return tupb((d == 0).sum((1, 2)), -d.sum((1, 2)))


SPREAD_THREE = mk(
    id="spread_three", name="Spread of Three", theme="Every 2×2 square spans exactly 3",
    requires=req("Numeral", min_size=4, max_size=6), layers={"symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Every 2×2 square (they overlap) scores when its biggest number is exactly 3 more than "
                           "its smallest; each step away from 3 deducts a secondary point."),
    ordinal=sp_ord, batch=sp_batch,
    exemplar=lambda p, gt: grid(np.fromfunction(lambda r, c: ((r + c) % 2) * SPREAD, (gt.N, gt.N), dtype=int),
                                np.zeros((gt.N, gt.N))),
    source="beginner pool (2026-11-11): fixed small units, one-cell greedy never stuck",
    tags={"beginner"})
