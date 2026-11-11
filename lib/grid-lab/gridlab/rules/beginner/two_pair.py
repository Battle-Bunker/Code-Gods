"""Two Pair (beginner pool): the 2×2 boxes that tile an even board (the 4 corner boxes on 4×4).

A box with two different pairs (3 3 8 8 in any order) is a primary point; one pair or three of a kind a secondary
point; no pair and four of a kind nothing. Reference for lib/game-utilities/src/families/grid/beginner/two_pair.ts.
"""
from __future__ import annotations

from collections import Counter

from .._util import grid, mk, np, req, tup, tupb, vals


def tp_ord(g, p, gtype):
    v = vals(g.sym, gtype).tolist()
    two = one = 0
    for r in range(0, gtype.N, 2):
        for c in range(0, gtype.N, 2):
            sizes = sorted(Counter([v[r][c], v[r][c + 1], v[r + 1][c], v[r + 1][c + 1]]).values())
            if sizes == [2, 2]:
                two += 1
            elif sizes in ([1, 1, 2], [1, 3]):
                one += 1
    return tup(two, one)


def tp_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    box = [v[:, 0::2, 0::2], v[:, 0::2, 1::2], v[:, 1::2, 0::2], v[:, 1::2, 1::2]]
    # Equal pairs among a box's four numbers: {2,2} has 2, {2,1,1} 1, {3,1} 3, {4} 6, all different 0.
    eq = sum((box[i] == box[j]).astype(np.int64) for i in range(4) for j in range(i + 1, 4))
    return tupb((eq == 2).sum((1, 2)), ((eq == 1) | (eq == 3)).sum((1, 2)))


TWO_PAIR = mk(
    id="two_pair", name="Two Pair", theme="Two different pairs in every box",
    requires=req("Numeral", parity="even", max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Fill each 2×2 box that tiles the board with two different pairs (3 3 8 8); "
                           "one pair or three of a kind is a secondary point."),
    ordinal=tp_ord, batch=tp_batch,
    exemplar=lambda p, gt: grid(np.array([[3 if r % 2 == 0 else 8] * gt.N for r in range(gt.N)]), np.zeros((gt.N, gt.N))),
    source="beginner pool (2026-11-11): fixed small units, one-cell greedy never stuck")
