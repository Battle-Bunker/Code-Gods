"""Opposite Nines (beginner pool; lib/game-utilities/src/families/grid/beginner/opposite_nines.ts)."""
from __future__ import annotations

from .._util import *  # noqa: F401,F403
from ._pairs import half_turn


def on_batch(sym, col, p, gtype):
    T = vmax(gtype)
    a, b = half_turn(vals(sym, gtype))
    s = a + b
    return tupb((s == T).sum(1), -np.abs(s - T).sum(1))


def on_ord(g, p, gtype):
    return tuple(int(x) for x in on_batch(g.sym[None], g.col[None], p, gtype)[0])


def on_exemplar(p, gtype):
    N, T = gtype.N, vmax(gtype)
    lo = T // 2
    v = np.array([lo if i < N * N / 2 else T - lo for i in range(N * N)]).reshape(N, N)
    return grid(v, np.zeros((N, N)))


OPPOSITE_NINES = mk(
    id="opposite_nines", name="Opposite Nines", theme="Opposite cells that add up to the biggest number",
    requires=req("Numeral", parity="even", max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: f"Each pair of cells opposite through the middle that adds up to {vmax(gt)} scores a point.",
    ordinal=on_ord, batch=on_batch, exemplar=on_exemplar,
    source="beginner pool (2026-11-11): half-turn pairs adding up to S-1; tie-breaker = total distance from S-1",
    tags={"beginner"})
