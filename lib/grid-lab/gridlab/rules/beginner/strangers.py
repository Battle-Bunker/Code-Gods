"""Strangers (beginner pool; lib/game-utilities/src/families/grid/beginner/strangers.ts).

Only the touching pairs inside the 2×2 boxes that tile an even board count: (c[r][k], c[r][k+1]) for even k and
(c[r][k], c[r+1][k]) for even r. A pair both bigger than 1, with no common divisor and at least 2 apart, is a primary
point; a 1 beside a number bigger than 1 a secondary point.
"""
from __future__ import annotations

from .._util import grid, mk, np, req, tupb, vals


def _box_pairs(v):
    """The in-box touching pairs of a batch (B, N, N): two arrays (B, k) of partners."""
    across = (v[:, :, 0::2], v[:, :, 1::2])
    down = (v[:, 0::2, :], v[:, 1::2, :])
    B = v.shape[0]
    a = np.concatenate([across[0].reshape(B, -1), down[0].reshape(B, -1)], axis=1)
    b = np.concatenate([across[1].reshape(B, -1), down[1].reshape(B, -1)], axis=1)
    return a, b


def st_batch(sym, col, p, gtype):
    a, b = _box_pairs(vals(sym, gtype))
    low, high = np.minimum(a, b), np.maximum(a, b)
    strangers = (low > 1) & (np.gcd(low, high) == 1) & (high - low > 1)
    ones = (low == 1) & (high > 1)
    return tupb(strangers.sum(1), ones.sum(1))


def st_ord(g, p, gtype):
    return tuple(int(x) for x in st_batch(g.sym[None], g.col[None], p, gtype)[0])


def st_exemplar(p, gtype):
    N = gtype.N
    return grid(np.array([[5 if (r + c) % 2 else 2 for c in range(N)] for r in range(N)]), np.zeros((N, N)))


STRANGERS = mk(
    id="strangers", name="Strangers", theme="Touching numbers in a box that share no divisor",
    requires=req("Numeral", parity="even", max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Touching numbers in the same 2×2 box that share no divisor and are not next-door score a "
                           "point; a 1 beside a bigger number a secondary point."),
    ordinal=st_ord, batch=st_batch, exemplar=st_exemplar,
    source="beginner pool (2026-11-11, round 2): in-box pairs only, consecutive numbers are not strangers",
    tags={"beginner"})
