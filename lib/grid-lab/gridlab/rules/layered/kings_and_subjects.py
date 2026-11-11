"""Kings and Subjects (layered rules): a 2×2 box is a court when its single biggest number equals the other three added up.

Primary: courts; secondary: minus every box's gap between its king and the sum of its subjects, a box with a tie for
biggest (no king) deducting twice the number of symbols. `squares` "corners": the boxes that tile an even board;
"all": every overlapping 2×2 square (expert, never sampled).
Reference for lib/game-utilities/src/families/grid/layered/royal_court.ts (base draws; the tiers live in the product).
"""
from __future__ import annotations

from .._util import grid, mk, np, req, tupb, vals, vmax


def ks_batch(sym, col, p, gtype):
    v = vals(sym, gtype)
    N, step = gtype.N, (2 if p["squares"] == "corners" else 1)
    box = np.stack([v[:, 0:N - 1:step, 0:N - 1:step], v[:, 0:N - 1:step, 1:N:step],
                    v[:, 1:N:step, 0:N - 1:step], v[:, 1:N:step, 1:N:step]])
    top = box.max(0)
    king = (box == top).sum(0) == 1
    away = np.abs(2 * top - box.sum(0))
    gap = np.where(king, away, 2 * (vmax(gtype) + 1))
    return tupb((king & (away == 0)).sum((1, 2)), -gap.sum((1, 2)))


def ks_ord(g, p, gtype):
    return tuple(int(x) for x in ks_batch(g.sym[None], g.col[None], p, gtype)[0])


KINGS_AND_SUBJECTS = mk(
    id="kings_and_subjects", name="Kings and Subjects", theme="A king who equals his three subjects added up",
    requires=req("Numeral", parity="even", max_size=6), layers={"symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {"squares": "corners"},
    summary=lambda p, gt: ("Each 2×2 box whose single biggest number equals the other three added up (9 with 2, 3, 4) "
                           "scores a point; every box deducts how far its king is from that sum as secondary points."),
    ordinal=ks_ord, batch=ks_batch,
    exemplar=lambda p, gt: grid(np.array([[[[9, 2], [3, 4]][r % 2][c % 2] for c in range(gt.N)] for r in range(gt.N)]),
                                np.zeros((gt.N, gt.N))),
    source="layered rules (2026-11-11): the owner's kings and subjects on disjoint boxes, graded by closeness",
    tags={"layered"})
