"""Step-Stool Mirror (beginner pool; lib/game-utilities/src/families/grid/beginner/step_stool.ts)."""
from __future__ import annotations

from .._util import *  # noqa: F401,F403
from ._pairs import fold


def ss_batch(sym, col, p, gtype):
    a, b = fold(vals(sym, gtype))
    off = np.abs(np.abs(a - b) - 1)
    return tupb((off == 0).sum((1, 2)), -off.sum((1, 2)))


def ss_ord(g, p, gtype):
    return tuple(int(x) for x in ss_batch(g.sym[None], g.col[None], p, gtype)[0])


def ss_exemplar(p, gtype):
    N = gtype.N
    v = np.array([[4 if r < N / 2 else 5 for _ in range(N)] for r in range(N)])
    return grid(v, np.zeros((N, N)))


STEP_STOOL = mk(
    id="step_stool", name="Step-Stool Mirror", theme="Fold the board: numbers one apart",
    requires=req("Numeral", parity="even", max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "Fold the board top onto bottom: each number landing on one 1 apart from it scores a point.",
    ordinal=ss_ord, batch=ss_batch, exemplar=ss_exemplar,
    source="beginner pool (2026-11-11): fold pairs one apart; tie-breaker = total of ||a-b|-1|",
    tags={"beginner"})
