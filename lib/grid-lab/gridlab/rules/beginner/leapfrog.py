"""Leapfrog (beginner pool; lib/game-utilities/src/families/grid/beginner/leapfrog.ts).

In every row, each pair two cells apart (c[r][k], c[r][k+2]) whose numbers are one apart scores a point. Scalar.
"""
from __future__ import annotations

from .._util import grid, mk, np, req, vals


def lf_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    return (np.abs(v[:, :, :-2] - v[:, :, 2:]) == 1).sum((1, 2)).astype(np.int64)


def lf_ord(g, p, gtype):
    return int(lf_batch(g.sym[None], g.col[None], p, gtype)[0])


def lf_exemplar(p, gtype):
    N = gtype.N
    return grid(np.array([[4 if c % 4 < 2 else 5 for c in range(N)] for _ in range(N)]), np.zeros((N, N)))


LEAPFROG = mk(
    id="leapfrog", name="Leapfrog", theme="Numbers one apart, leaping over a cell",
    requires=req("Numeral", min_size=4, max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "Each number one apart from the number two cells along its row scores a point.",
    ordinal=lf_ord, batch=lf_batch, exemplar=lf_exemplar,
    source="beginner pool (2026-11-11, round 2): replaces Step-Stool Mirror; single tier (a near-miss tier won 49% of games)",
    tags={"beginner"})
