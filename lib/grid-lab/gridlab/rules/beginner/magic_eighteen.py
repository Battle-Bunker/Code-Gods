"""Magic Eighteen (beginner pool; lib/game-utilities/src/families/grid/beginner/magic_eighteen.ts).

Magic Accountant (rules/arithmetic.py) with the target fixed at the middle total N*(lo+hi)/2: 18 on 4x4 digits.
"""
from __future__ import annotations

from .._util import grid, lines_rc, mk, np, req, tup, tupb, vals, vmax, vmin
from ..arithmetic import _axis_canon


def target(gtype):
    return gtype.N * (vmin(gtype) + vmax(gtype)) // 2


def me_batch(sym, col, p, gtype):
    T = target(gtype)
    s = lines_rc(vals(sym, gtype), p["axis"]).sum(2)
    return tupb((s == T).sum(1), -np.abs(s - T).sum(1))


def me_ord(g, p, gtype):
    return tup(*me_batch(g.sym[None], g.col[None], p, gtype)[0])


def me_exemplar(p, gtype):
    N = gtype.N
    v = np.fromfunction(lambda r, c: np.where((r + c) % 2 == 1, vmax(gtype), vmin(gtype)), (N, N), dtype=int)
    return grid(v, np.zeros((N, N)))


MAGIC_EIGHTEEN = mk(
    id="magic_eighteen", name="Magic Eighteen", theme="Every line adds up to the board's middle total",
    requires=req("Numeral", parity="even", max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"axis": str(rng.choice(["rows", "cols"]))},
    summary=lambda p, gt: f"Every {'row' if p['axis'] == 'rows' else 'column'} that adds up to exactly {target(gt)} scores a point.",
    ordinal=me_ord, batch=me_batch, canonical=lambda p, gt: _axis_canon(p), exemplar=me_exemplar,
    source="beginner pool (2026-11-11): Magic Accountant at the middle total; tie-breaker = total distance from it",
    tags={"beginner"})
